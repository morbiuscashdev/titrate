import { useState, useCallback, useRef } from 'react';
import { StepPanel } from '../components/StepPanel.js';
import { SetOperationsPanel } from '../components/SetOperationsPanel.js';
import { Button, Card, Input, Textarea } from '../components/ui';
import { useCampaign } from '../providers/CampaignProvider.js';
import { useStorage } from '../providers/StorageProvider.js';
import { useChain } from '../providers/ChainProvider.js';
import { parseCSV, createPipeline, resolveBlockRef } from '@titrate/sdk';
import type { Address } from 'viem';
import type { CSVRow, SourceType } from '@titrate/sdk';

const TOGGLE_BASE = 'rounded-none border-2 px-3 py-1.5 font-mono text-xs font-bold uppercase tracking-[0.12em] transition-colors focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-[1px] focus-visible:outline-[color:var(--color-info)]';
const TOGGLE_ACTIVE = 'bg-[color:var(--color-pink-500)] text-white border-[color:var(--color-pink-500)]';
const TOGGLE_INACTIVE = 'bg-[color:var(--bg-card)] text-[color:var(--fg-muted)] border-[color:var(--edge)] hover:text-[color:var(--fg-primary)]';

const ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/;

/**
 * Parse raw text (one address per line) into CSVRow entries.
 * Skips blank lines and lines that aren't valid hex addresses.
 */
function parseManualAddresses(text: string): readonly CSVRow[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => ADDRESS_REGEX.test(line))
    .map((line) => ({ address: line.toLowerCase() as Address, amount: null }));
}

/**
 * Step 2: Load recipient addresses.
 *
 * Supports CSV file upload (primary path) and manual address entry.
 * Parsed addresses are saved to IndexedDB address sets and the step
 * advances to filters on continue.
 */
export function AddressesStep() {
  const { activeCampaign, setActiveStep, refreshActiveCampaign } = useCampaign();
  const { storage } = useStorage();
  const { publicClient, chainConfig } = useChain();

  const [addresses, setAddresses] = useState<readonly CSVRow[]>([]);
  const [hasAmounts, setHasAmounts] = useState(false);
  const [manualText, setManualText] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const [showOnChain, setShowOnChain] = useState(false);
  const [sourceType, setSourceType] = useState<'block-scan' | 'explorer-scan'>('block-scan');
  const [sourceParams, setSourceParams] = useState<Record<string, string>>({});
  const [collectState, setCollectState] = useState<{
    readonly status: 'idle' | 'collecting' | 'done' | 'error';
    readonly collectedCount: number;
    readonly errorMessage: string | null;
  }>({ status: 'idle', collectedCount: 0, errorMessage: null });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileContent = useCallback((content: string, name: string) => {
    try {
      const result = parseCSV(content);
      if (result.rows.length === 0) {
        setParseError('No valid addresses found in file.');
        return;
      }
      setAddresses(result.rows);
      setHasAmounts(result.hasAmounts);
      setFileName(name);
      setParseError(null);
      setManualText('');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to parse CSV';
      setParseError(message);
    }
  }, []);

  const handleFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      handleFileContent(reader.result as string, file.name);
    };
    reader.onerror = () => {
      setParseError('Failed to read file.');
    };
    reader.readAsText(file);
  }, [handleFileContent]);

  const handleDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    setIsDragOver(false);
    const file = event.dataTransfer.files[0];
    if (!file) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      handleFileContent(reader.result as string, file.name);
    };
    reader.onerror = () => {
      setParseError('Failed to read file.');
    };
    reader.readAsText(file);
  }, [handleFileContent]);

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleManualParse = useCallback(() => {
    const parsed = parseManualAddresses(manualText);
    if (parsed.length === 0) {
      setParseError('No valid addresses found in text.');
      return;
    }
    setAddresses(parsed);
    setHasAmounts(false);
    setFileName(null);
    setParseError(null);
  }, [manualText]);

  const handleCollect = useCallback(async () => {
    if (!publicClient) return;

    setCollectState({ status: 'collecting', collectedCount: 0, errorMessage: null });

    try {
      const pipeline = createPipeline();

      const params: Record<string, unknown> = { ...sourceParams };

      // Resolve date-string block refs (YYYY-MM-DD → block number)
      if (params.startBlock && typeof params.startBlock === 'string' && params.startBlock.trim()) {
        params.startBlock = String(await resolveBlockRef(params.startBlock as string, publicClient));
      }
      if (params.endBlock && typeof params.endBlock === 'string' && params.endBlock.trim()) {
        params.endBlock = String(await resolveBlockRef(params.endBlock as string, publicClient));
      }
      if (sourceType === 'explorer-scan' && chainConfig) {
        params.explorerApiUrl = chainConfig.explorerApiUrl;
        params.apiKey = chainConfig.explorerApiKey;
        params.tokenAddress = params.contractAddress;
        delete params.contractAddress;
      }

      pipeline.addSource(sourceType as SourceType, params);

      const collected: Address[] = [];
      for await (const batch of pipeline.execute(publicClient)) {
        collected.push(...batch);
        setCollectState((prev) => ({
          ...prev,
          collectedCount: collected.length,
        }));
      }

      if (collected.length === 0) {
        setCollectState({ status: 'error', collectedCount: 0, errorMessage: 'No addresses found.' });
        return;
      }

      const newRows = collected.map((addr) => ({ address: addr, amount: null }));
      setAddresses((prev) => {
        const existing = new Set(prev.map((r) => r.address.toLowerCase()));
        const unique = newRows.filter((r) => !existing.has(r.address.toLowerCase()));
        return [...prev, ...unique];
      });
      setHasAmounts(false);
      setFileName(null);
      setCollectState({ status: 'done', collectedCount: collected.length, errorMessage: null });
    } catch (err: unknown) {
      setCollectState({
        status: 'error',
        collectedCount: 0,
        errorMessage: err instanceof Error ? err.message : 'Collection failed',
      });
    }
  }, [publicClient, sourceType, sourceParams, chainConfig]);

  const handleContinue = useCallback(async () => {
    if (!storage || !activeCampaign || addresses.length === 0) {
      return;
    }

    setIsSaving(true);
    try {
      const setId = crypto.randomUUID();
      await storage.addressSets.put({
        id: setId,
        campaignId: activeCampaign.id,
        name: fileName ?? 'Manual Entry',
        type: 'source',
        addressCount: addresses.length,
        createdAt: Date.now(),
      });
      await storage.addresses.putBatch(
        addresses.map((row) => ({
          setId,
          address: row.address,
          amount: row.amount ?? null,
        })),
      );
      await refreshActiveCampaign();
      setActiveStep('filters');
    } finally {
      setIsSaving(false);
    }
  }, [storage, activeCampaign, addresses, fileName, setActiveStep, refreshActiveCampaign]);

  const previewAddresses = addresses.slice(0, 5);

  return (
    <StepPanel title="Addresses" description="Load recipient addresses from a CSV file or enter them manually.">
      <div className="space-y-6">
        {/* CSV Upload */}
        <div>
          <label className="block font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-[color:var(--fg-primary)] mb-2">CSV Upload</label>
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}
            data-drag-over={isDragOver ? 'true' : 'false'}
            className={`flex cursor-pointer flex-col items-center justify-center border-2 border-dashed p-6 sm:p-8 min-h-[120px] transition-colors focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-[1px] focus-visible:outline-[color:var(--color-info)] ${
              isDragOver
                ? 'border-[color:var(--color-pink-500)] bg-[color:var(--color-pink-500)]/10'
                : 'border-[color:var(--edge)] bg-[color:var(--bg-card)] hover:border-[color:var(--color-pink-500)]'
            }`}
          >
            <svg className="mb-2 h-8 w-8 text-[color:var(--fg-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
            <p className="font-mono text-sm text-[color:var(--fg-muted)]">Drop a CSV file here or click to browse</p>
            <p className="mt-1 font-mono text-xs text-[color:var(--fg-muted)]/80">Supports address and address,amount formats</p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.txt"
            onChange={handleFileSelect}
            className="hidden"
            data-testid="file-input"
          />
        </div>

        {/* Manual Entry */}
        <div>
          <Textarea
            id="manual-addresses"
            label="Manual Entry"
            value={manualText}
            onChange={(e) => setManualText(e.target.value)}
            placeholder="Paste addresses, one per line..."
            rows={4}
          />
          <div className="mt-2">
            <Button variant="secondary" onClick={handleManualParse} disabled={!manualText.trim()}>
              Parse Addresses
            </Button>
          </div>
        </div>

        {/* On-Chain Collection */}
        <div>
          <button
            type="button"
            onClick={() => setShowOnChain(!showOnChain)}
            className="font-mono text-sm text-[color:var(--fg-muted)] hover:text-[color:var(--fg-primary)] underline decoration-dotted transition-colors focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-[1px] focus-visible:outline-[color:var(--color-info)] rounded-sm"
          >
            {showOnChain ? 'Hide on-chain collection' : 'Collect from chain'}
          </button>
          {showOnChain && (
            <Card className="mt-3 space-y-4">
              {/* Source type selector */}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => { setSourceType('block-scan'); setSourceParams({}); }}
                  aria-pressed={sourceType === 'block-scan'}
                  className={`${TOGGLE_BASE} ${sourceType === 'block-scan' ? TOGGLE_ACTIVE : TOGGLE_INACTIVE}`}
                >
                  Block Scan
                </button>
                <button
                  type="button"
                  onClick={() => { setSourceType('explorer-scan'); setSourceParams({}); }}
                  aria-pressed={sourceType === 'explorer-scan'}
                  className={`${TOGGLE_BASE} ${sourceType === 'explorer-scan' ? TOGGLE_ACTIVE : TOGGLE_INACTIVE}`}
                >
                  Explorer Scan
                </button>
              </div>

              {/* Block scan params */}
              {sourceType === 'block-scan' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      label="Start Block"
                      type="text"
                      value={sourceParams.startBlock ?? ''}
                      onChange={(e) => setSourceParams((p) => ({ ...p, startBlock: e.target.value }))}
                      placeholder="0 or 2024-01-15"
                    />
                    <Input
                      label="End Block"
                      type="text"
                      value={sourceParams.endBlock ?? ''}
                      onChange={(e) => setSourceParams((p) => ({ ...p, endBlock: e.target.value }))}
                      placeholder="latest or 2024-06-01"
                    />
                  </div>
                  <p className="font-mono text-xs text-[color:var(--fg-muted)]">Accepts block numbers or dates (YYYY-MM-DD).</p>
                </div>
              )}

              {/* Explorer scan params */}
              {sourceType === 'explorer-scan' && (
                <div className="space-y-3">
                  <Input
                    label="Contract Address"
                    type="text"
                    value={sourceParams.contractAddress ?? ''}
                    onChange={(e) => setSourceParams((p) => ({ ...p, contractAddress: e.target.value }))}
                    placeholder="0x..."
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      label="Start Block"
                      type="text"
                      value={sourceParams.startBlock ?? ''}
                      onChange={(e) => setSourceParams((p) => ({ ...p, startBlock: e.target.value }))}
                      placeholder="0"
                    />
                    <Input
                      label="End Block"
                      type="text"
                      value={sourceParams.endBlock ?? ''}
                      onChange={(e) => setSourceParams((p) => ({ ...p, endBlock: e.target.value }))}
                      placeholder="latest"
                    />
                  </div>
                </div>
              )}

              {/* Collect button + status */}
              <div className="flex items-center gap-3 flex-wrap">
                <Button
                  variant="primary"
                  onClick={handleCollect}
                  disabled={collectState.status === 'collecting' || !publicClient}
                >
                  {collectState.status === 'collecting' ? 'Collecting...' : 'Collect Addresses'}
                </Button>
                {collectState.status === 'collecting' && (
                  <span className="font-mono text-sm text-[color:var(--fg-muted)]">
                    {collectState.collectedCount.toLocaleString()} found...
                  </span>
                )}
                {collectState.status === 'done' && (
                  <span className="font-mono text-sm text-[color:var(--color-ok)]">
                    {collectState.collectedCount.toLocaleString()} addresses collected
                  </span>
                )}
              </div>
              {collectState.status === 'error' && (
                <p className="font-mono text-sm text-[color:var(--color-err)]">{collectState.errorMessage}</p>
              )}
              {!publicClient && (
                <p className="font-mono text-xs text-[color:var(--fg-muted)]">Connect to a chain to use on-chain collection.</p>
              )}
            </Card>
          )}
        </div>

        {/* Parse Error */}
        {parseError && (
          <p className="font-mono text-sm text-[color:var(--color-err)]">{parseError}</p>
        )}

        {/* Address Preview */}
        {addresses.length > 0 && (
          <Card>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <span className="font-sans text-sm font-semibold text-[color:var(--fg-primary)]">
                {addresses.length.toLocaleString()} addresses loaded
              </span>
              {hasAmounts && (
                <span className="font-mono text-xs text-[color:var(--fg-muted)]">Includes amounts</span>
              )}
              {fileName && (
                <span className="font-mono text-xs text-[color:var(--fg-muted)]">{fileName}</span>
              )}
            </div>
            <div className="space-y-1 font-mono text-xs text-[color:var(--fg-muted)] overflow-x-auto">
              {previewAddresses.map((row) => (
                <div key={row.address} className="flex justify-between gap-4">
                  <span className="text-[color:var(--fg-primary)]">{row.address}</span>
                  {row.amount && <span>{row.amount}</span>}
                </div>
              ))}
              {addresses.length > 5 && (
                <p className="pt-1">...and {(addresses.length - 5).toLocaleString()} more</p>
              )}
            </div>
          </Card>
        )}

        {/* Set Operations */}
        <SetOperationsPanel />

        {/* Continue */}
        <Button variant="primary" onClick={handleContinue} disabled={addresses.length === 0 || isSaving}>
          {isSaving ? 'Saving...' : 'Save & Continue'}
        </Button>
      </div>
    </StepPanel>
  );
}

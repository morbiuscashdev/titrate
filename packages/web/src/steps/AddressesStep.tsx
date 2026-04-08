import { useState, useCallback, useRef } from 'react';
import { StepPanel } from '../components/StepPanel.js';
import { SetOperationsPanel } from '../components/SetOperationsPanel.js';
import { useCampaign } from '../providers/CampaignProvider.js';
import { useStorage } from '../providers/StorageProvider.js';
import { useChain } from '../providers/ChainProvider.js';
import { parseCSV, createPipeline, resolveBlockRef } from '@titrate/sdk';
import type { Address } from 'viem';
import type { CSVRow, SourceType } from '@titrate/sdk';

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
          <label className="text-sm font-medium text-gray-600 dark:text-gray-300 mb-1 block">CSV Upload</label>
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 sm:p-8 min-h-[120px] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-950 ${
              isDragOver
                ? 'border-blue-500 bg-blue-500/5'
                : 'border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 hover:border-gray-400 dark:hover:border-gray-600'
            }`}
          >
            <svg className="mb-2 h-8 w-8 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
            <p className="text-sm text-gray-500 dark:text-gray-400">Drop a CSV file here or click to browse</p>
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-600">Supports address and address,amount formats</p>
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
          <label htmlFor="manual-addresses" className="text-sm font-medium text-gray-600 dark:text-gray-300 mb-1 block">Manual Entry</label>
          <textarea
            id="manual-addresses"
            value={manualText}
            onChange={(e) => setManualText(e.target.value)}
            placeholder="Paste addresses, one per line..."
            rows={4}
            className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono"
          />
          <button
            type="button"
            onClick={handleManualParse}
            disabled={!manualText.trim()}
            className="mt-2 bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-gray-600 dark:text-gray-300 rounded-lg px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-950"
          >
            Parse Addresses
          </button>
        </div>

        {/* On-Chain Collection */}
        <div>
          <button
            type="button"
            onClick={() => setShowOnChain(!showOnChain)}
            className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-950 rounded"
          >
            {showOnChain ? 'Hide on-chain collection' : 'Collect from chain'}
          </button>
          {showOnChain && (
            <div className="mt-3 rounded-lg bg-gray-50 dark:bg-gray-900 p-4 ring-1 ring-gray-200 dark:ring-gray-800 space-y-4">
              {/* Source type selector */}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => { setSourceType('block-scan'); setSourceParams({}); }}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium ring-1 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-950 ${
                    sourceType === 'block-scan'
                      ? 'bg-blue-500/10 text-blue-400 ring-blue-500/30'
                      : 'bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 ring-gray-200 dark:ring-gray-700'
                  }`}
                >
                  Block Scan
                </button>
                <button
                  type="button"
                  onClick={() => { setSourceType('explorer-scan'); setSourceParams({}); }}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium ring-1 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-950 ${
                    sourceType === 'explorer-scan'
                      ? 'bg-blue-500/10 text-blue-400 ring-blue-500/30'
                      : 'bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 ring-gray-200 dark:ring-gray-700'
                  }`}
                >
                  Explorer Scan
                </button>
              </div>

              {/* Block scan params */}
              {sourceType === 'block-scan' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-400 dark:text-gray-500 mb-1">Start Block</label>
                      <input
                        type="text"
                        value={sourceParams.startBlock ?? ''}
                        onChange={(e) => setSourceParams((p) => ({ ...p, startBlock: e.target.value }))}
                        placeholder="0 or 2024-01-15"
                        className="w-full rounded-lg bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white ring-1 ring-gray-300 dark:ring-gray-700 focus:ring-blue-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 dark:text-gray-500 mb-1">End Block</label>
                      <input
                        type="text"
                        value={sourceParams.endBlock ?? ''}
                        onChange={(e) => setSourceParams((p) => ({ ...p, endBlock: e.target.value }))}
                        placeholder="latest or 2024-06-01"
                        className="w-full rounded-lg bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white ring-1 ring-gray-300 dark:ring-gray-700 focus:ring-blue-500 focus:outline-none"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-gray-400 dark:text-gray-500">Accepts block numbers or dates (YYYY-MM-DD).</p>
                </div>
              )}

              {/* Explorer scan params */}
              {sourceType === 'explorer-scan' && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-gray-400 dark:text-gray-500 mb-1">Contract Address</label>
                    <input
                      type="text"
                      value={sourceParams.contractAddress ?? ''}
                      onChange={(e) => setSourceParams((p) => ({ ...p, contractAddress: e.target.value }))}
                      placeholder="0x..."
                      className="w-full rounded-lg bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white ring-1 ring-gray-300 dark:ring-gray-700 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-400 dark:text-gray-500 mb-1">Start Block</label>
                      <input
                        type="text"
                        value={sourceParams.startBlock ?? ''}
                        onChange={(e) => setSourceParams((p) => ({ ...p, startBlock: e.target.value }))}
                        placeholder="0"
                        className="w-full rounded-lg bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white ring-1 ring-gray-300 dark:ring-gray-700 focus:ring-blue-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 dark:text-gray-500 mb-1">End Block</label>
                      <input
                        type="text"
                        value={sourceParams.endBlock ?? ''}
                        onChange={(e) => setSourceParams((p) => ({ ...p, endBlock: e.target.value }))}
                        placeholder="latest"
                        className="w-full rounded-lg bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white ring-1 ring-gray-300 dark:ring-gray-700 focus:ring-blue-500 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Collect button + status */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleCollect}
                  disabled={collectState.status === 'collecting' || !publicClient}
                  className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-950"
                >
                  {collectState.status === 'collecting' ? 'Collecting...' : 'Collect Addresses'}
                </button>
                {collectState.status === 'collecting' && (
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    {collectState.collectedCount.toLocaleString()} found...
                  </span>
                )}
                {collectState.status === 'done' && (
                  <span className="text-sm text-green-600 dark:text-green-400">
                    {collectState.collectedCount.toLocaleString()} addresses collected
                  </span>
                )}
              </div>
              {collectState.status === 'error' && (
                <p className="text-sm text-red-400">{collectState.errorMessage}</p>
              )}
              {!publicClient && (
                <p className="text-xs text-gray-400 dark:text-gray-500">Connect to a chain to use on-chain collection.</p>
              )}
            </div>
          )}
        </div>

        {/* Parse Error */}
        {parseError && (
          <p className="text-sm text-red-400">{parseError}</p>
        )}

        {/* Address Preview */}
        {addresses.length > 0 && (
          <div className="rounded-lg bg-gray-50 dark:bg-gray-900 p-4 ring-1 ring-gray-200 dark:ring-gray-800">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium text-gray-900 dark:text-white">
                {addresses.length.toLocaleString()} addresses loaded
              </span>
              {hasAmounts && (
                <span className="text-xs text-gray-500 dark:text-gray-400">Includes amounts</span>
              )}
              {fileName && (
                <span className="text-xs text-gray-400 dark:text-gray-500">{fileName}</span>
              )}
            </div>
            <div className="space-y-1 font-mono text-xs text-gray-500 dark:text-gray-400 overflow-x-auto">
              {previewAddresses.map((row) => (
                <div key={row.address} className="flex justify-between">
                  <span>{row.address}</span>
                  {row.amount && <span className="text-gray-400 dark:text-gray-500">{row.amount}</span>}
                </div>
              ))}
              {addresses.length > 5 && (
                <p className="pt-1 text-gray-400 dark:text-gray-600">...and {(addresses.length - 5).toLocaleString()} more</p>
              )}
            </div>
          </div>
        )}

        {/* Set Operations */}
        <SetOperationsPanel />

        {/* Continue */}
        <button
          type="button"
          onClick={handleContinue}
          disabled={addresses.length === 0 || isSaving}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-950"
        >
          {isSaving ? 'Saving...' : 'Save & Continue'}
        </button>
      </div>
    </StepPanel>
  );
}

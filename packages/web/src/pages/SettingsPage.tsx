import { useState, useEffect, useCallback } from 'react';
import { useStorage } from '../providers/StorageProvider.js';
import { useCampaign } from '../providers/CampaignProvider.js';
import { useUnlockStorage } from '../hooks/useUnlockStorage.js';
import { EncryptedField } from '../components/EncryptedField.js';
import { ChainSelector } from '../components/ChainSelector.js';
import { Skeleton } from '../components/Skeleton.js';
import { Button, Card, Input } from '../components/ui';
import { ModeProvider } from '../theme';
import { getChains } from '@titrate/sdk';
import type { StoredChainConfig, StoredCampaign } from '@titrate/sdk';

/** Empty form state for the chain config form. */
const EMPTY_FORM: ChainFormState = {
  selectedChainId: null,
  name: '',
  chainId: '',
  rpcUrl: '',
  explorerApiUrl: '',
  explorerApiKey: '',
  trueBlocksUrl: '',
};

type ChainFormState = {
  readonly selectedChainId: number | null;
  readonly name: string;
  readonly chainId: string;
  readonly rpcUrl: string;
  readonly explorerApiUrl: string;
  readonly explorerApiKey: string;
  readonly trueBlocksUrl: string;
};

/** Derive a bus key (hostname) from a URL, returning empty string on failure. */
function deriveBusKey(url: string): string {
  if (!url) return '';
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

/**
 * Chain configuration management page.
 *
 * Lists stored chain configs with name, chain ID, and sensitive fields
 * displayed via EncryptedField. Supports adding and deleting configs.
 */
export function SettingsPage() {
  useEffect(() => { document.title = 'Settings — Titrate'; }, []);
  const { storage, isUnlocked } = useStorage();
  const { requestUnlock } = useUnlockStorage();
  const { campaigns, refreshCampaigns } = useCampaign();
  const [configs, setConfigs] = useState<readonly StoredChainConfig[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<ChainFormState>(EMPTY_FORM);

  const loadConfigs = useCallback(async () => {
    if (!storage) return;
    const list = await storage.chainConfigs.list();
    setConfigs(list);
  }, [storage]);

  useEffect(() => {
    void loadConfigs();
  }, [loadConfigs]);

  const handleDelete = useCallback(
    async (id: string) => {
      if (!storage) return;
      await storage.chainConfigs.delete(id);
      await loadConfigs();
    },
    [storage, loadConfigs],
  );

  const handlePresetSelect = useCallback((chainId: number) => {
    const preset = getChains().find((c) => c.chainId === chainId);
    if (!preset) return;

    setForm({
      selectedChainId: chainId,
      name: preset.name,
      chainId: String(preset.chainId),
      rpcUrl: preset.rpcUrls[0] ?? '',
      explorerApiUrl: preset.explorerApiUrl ?? '',
      explorerApiKey: '',
      trueBlocksUrl: '',
    });
  }, []);

  const updateField = useCallback(
    (field: keyof Omit<ChainFormState, 'selectedChainId'>, value: string) => {
      setForm((prev) => ({ ...prev, [field]: value }));
    },
    [],
  );

  const handleCancel = useCallback(() => {
    setShowForm(false);
    setForm(EMPTY_FORM);
  }, []);

  const canSave = form.name.trim() !== '' && form.chainId.trim() !== '' && form.rpcUrl.trim() !== '';

  const handleSave = useCallback(async () => {
    if (!storage) return;
    if (!canSave) return;

    const config: StoredChainConfig = {
      id: crypto.randomUUID(),
      chainId: Number(form.chainId),
      name: form.name.trim(),
      rpcUrl: form.rpcUrl.trim(),
      rpcBusKey: deriveBusKey(form.rpcUrl.trim()),
      explorerApiUrl: form.explorerApiUrl.trim(),
      explorerApiKey: form.explorerApiKey.trim(),
      explorerBusKey: deriveBusKey(form.explorerApiUrl.trim()),
      trueBlocksUrl: form.trueBlocksUrl.trim(),
      trueBlocksBusKey: deriveBusKey(form.trueBlocksUrl.trim()),
    };

    await storage.chainConfigs.put(config);
    await loadConfigs();
    setShowForm(false);
    setForm(EMPTY_FORM);
  }, [storage, form, canSave, loadConfigs]);

  const brutalistLabel = "block font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-[color:var(--fg-primary)] mb-2";

  return (
    <ModeProvider mode="brutalist" className="mx-auto max-w-3xl px-4 sm:px-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="font-sans text-xl font-extrabold tracking-tight text-[color:var(--fg-primary)]">Chain Settings</h1>
        {!showForm && (
          <Button variant="primary" disabled={!storage} onClick={() => setShowForm(true)}>
            Add Chain
          </Button>
        )}
      </div>

      {!isUnlocked && (
        <div className="mb-6 border-2 border-[color:var(--color-warn)]/50 bg-[color:var(--color-warn)]/15 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-mono text-sm text-[color:var(--fg-primary)]">
              <span className="mr-2 font-bold text-[color:var(--color-warn)]">⚠</span>
              Storage is locked. Sensitive fields are encrypted.
            </p>
            <button
              type="button"
              onClick={() => void requestUnlock()}
              className="border-2 border-[color:var(--color-warn)] bg-[color:var(--color-warn)] px-3 py-1.5 font-mono text-sm font-bold text-[color:var(--bg-page)] hover:brightness-110 transition-[filter] focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-info)]"
            >
              Unlock
            </button>
          </div>
        </div>
      )}

      {showForm && (
        <Card className="mb-6 sm:p-6">
          <h2 className="font-mono text-xs font-bold uppercase tracking-[0.15em] text-[color:var(--color-pink-600)] mb-4">New Chain Configuration</h2>

          <div className="mb-4">
            <label className={brutalistLabel}>Chain Preset</label>
            <ChainSelector
              chains={getChains()}
              selectedChainId={form.selectedChainId}
              onSelect={handlePresetSelect}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <Input
              id="chain-name"
              label="Chain Name"
              type="text"
              value={form.name}
              onChange={(e) => updateField('name', e.target.value)}
              placeholder="e.g. Ethereum"
            />
            <Input
              id="chain-id"
              label="Chain ID"
              type="number"
              value={form.chainId}
              onChange={(e) => updateField('chainId', e.target.value)}
              placeholder="e.g. 1"
            />
          </div>

          <div className="mb-4">
            <Input
              id="rpc-url"
              label="RPC URL"
              type="text"
              value={form.rpcUrl}
              onChange={(e) => updateField('rpcUrl', e.target.value)}
              placeholder="https://..."
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <Input
              id="explorer-api-url"
              label="Explorer API URL"
              hint="optional"
              type="text"
              value={form.explorerApiUrl}
              onChange={(e) => updateField('explorerApiUrl', e.target.value)}
              placeholder="https://api.etherscan.io/api"
            />
            <Input
              id="explorer-api-key"
              label="Explorer API Key"
              hint="optional"
              type="text"
              value={form.explorerApiKey}
              onChange={(e) => updateField('explorerApiKey', e.target.value)}
              placeholder="Your API key"
            />
          </div>

          <div className="mb-6">
            <Input
              id="trueblocks-url"
              label="TrueBlocks URL"
              hint="TrueBlocks API endpoint for balance history and address scanning. (optional)"
              type="text"
              value={form.trueBlocksUrl}
              onChange={(e) => updateField('trueBlocksUrl', e.target.value)}
              placeholder="http://localhost:8080"
            />
          </div>

          <div className="flex items-center gap-3">
            <Button variant="primary" disabled={!canSave} onClick={() => void handleSave()}>
              Save
            </Button>
            <Button variant="secondary" onClick={handleCancel}>
              Cancel
            </Button>
          </div>
        </Card>
      )}

      {!storage && (
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="py-4">
              <div className="flex items-start justify-between">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-3 w-48" />
                </div>
                <Skeleton className="h-4 w-12" />
              </div>
            </div>
          ))}
        </div>
      )}

      {storage && !showForm && configs.length === 0 && (
        <p className="font-mono text-sm text-[color:var(--fg-muted)]">No chain configurations saved yet.</p>
      )}

      {configs.length > 0 && (
        <ul className="divide-y divide-[color:var(--edge)]">
          {configs.map((config) => (
            <li key={config.id} className="py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1 min-w-0">
                  <p className="font-sans text-sm font-bold text-[color:var(--fg-primary)]">{config.name}</p>
                  <p className="font-mono text-xs text-[color:var(--fg-muted)]">Chain ID: {config.chainId}</p>
                  <div className="flex items-center gap-2 font-mono text-xs text-[color:var(--fg-muted)] min-w-0">
                    <span className="flex-shrink-0">RPC:</span>
                    {isUnlocked ? (
                      <span className="truncate">{config.rpcUrl}</span>
                    ) : (
                      <EncryptedField ciphertext={config.rpcUrl} onUnlock={requestUnlock} />
                    )}
                  </div>
                  {config.explorerApiKey && (
                    <div className="flex items-center gap-2 font-mono text-xs text-[color:var(--fg-muted)] min-w-0">
                      <span className="flex-shrink-0">Explorer Key:</span>
                      {isUnlocked ? (
                        <span>{config.explorerApiKey}</span>
                      ) : (
                        <EncryptedField ciphertext={config.explorerApiKey} onUnlock={requestUnlock} />
                      )}
                    </div>
                  )}
                  {config.trueBlocksUrl && (
                    <div className="flex items-center gap-2 font-mono text-xs text-[color:var(--fg-muted)] min-w-0">
                      <span className="flex-shrink-0">TrueBlocks:</span>
                      {isUnlocked ? (
                        <span className="truncate">{config.trueBlocksUrl}</span>
                      ) : (
                        <EncryptedField ciphertext={config.trueBlocksUrl} onUnlock={requestUnlock} />
                      )}
                    </div>
                  )}
                </div>
                <Button variant="danger" size="sm" onClick={() => handleDelete(config.id)}>
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Data Export / Import */}
      <div className="mt-12 border-t-2 border-[color:var(--edge)] pt-8">
        <h2 className="font-sans text-lg font-extrabold tracking-tight text-[color:var(--fg-primary)] mb-4">Data</h2>
        <div className="flex flex-wrap gap-3">
          <Button
            variant="secondary"
            disabled={!storage || campaigns.length === 0}
            onClick={() => {
              const data = JSON.stringify(campaigns, (_key, value) =>
                typeof value === 'bigint' ? value.toString() : value, 2);
              const blob = new Blob([data], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `titrate-campaigns-${new Date().toISOString().slice(0, 10)}.json`;
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            Export Campaigns
          </Button>
          <label className="inline-flex items-center justify-center font-sans font-semibold leading-tight cursor-pointer text-sm px-4 py-2.5 shadow-[3px_3px_0_var(--shadow-color)] bg-[color:var(--color-cream-100)] text-[color:var(--color-cream-900)] border-2 border-[color:var(--edge)] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[2px_2px_0_var(--shadow-color)] transition-transform duration-[80ms]">
            Import Campaigns
            <input
              type="file"
              accept=".json"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file || !storage) return;
                try {
                  const text = await file.text();
                  const imported = JSON.parse(text) as StoredCampaign[];
                  if (!Array.isArray(imported)) throw new Error('Invalid format');
                  for (const campaign of imported) {
                    if (!campaign.id || !campaign.name) throw new Error('Invalid campaign data');
                    await storage.campaigns.put({
                      ...campaign,
                      pinnedBlock: campaign.pinnedBlock ? BigInt(campaign.pinnedBlock) : null,
                    });
                  }
                  await refreshCampaigns();
                  window.alert(`Imported ${imported.length} campaign(s).`);
                } catch (err: unknown) {
                  const msg = err instanceof Error ? err.message : 'Import failed';
                  window.alert(`Import error: ${msg}`);
                }
                e.target.value = '';
              }}
            />
          </label>
        </div>
        <p className="mt-2 font-mono text-xs text-[color:var(--fg-muted)]">
          Export saves campaign configurations as JSON. Import merges campaigns into storage (existing campaigns with the same ID are overwritten).
        </p>
      </div>
    </ModeProvider>
  );
}

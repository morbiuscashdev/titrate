import { useState, useEffect, useCallback } from 'react';
import { useStorage } from '../providers/StorageProvider.js';
import { EncryptedField } from '../components/EncryptedField.js';
import { ChainSelector } from '../components/ChainSelector.js';
import { SUPPORTED_CHAINS } from '@titrate/sdk';
import type { StoredChainConfig } from '@titrate/sdk';

/** Empty form state for the chain config form. */
const EMPTY_FORM: ChainFormState = {
  selectedChainId: null,
  name: '',
  chainId: '',
  rpcUrl: '',
  explorerApiUrl: '',
  explorerApiKey: '',
};

type ChainFormState = {
  readonly selectedChainId: number | null;
  readonly name: string;
  readonly chainId: string;
  readonly rpcUrl: string;
  readonly explorerApiUrl: string;
  readonly explorerApiKey: string;
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
  const { storage, isUnlocked } = useStorage();
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
    const preset = SUPPORTED_CHAINS.find((c) => c.chainId === chainId);
    if (!preset) return;

    setForm({
      selectedChainId: chainId,
      name: preset.name,
      chainId: String(preset.chainId),
      rpcUrl: preset.rpcUrls[0] ?? '',
      explorerApiUrl: preset.explorerApiUrl ?? '',
      explorerApiKey: '',
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
      trueBlocksUrl: '',
      trueBlocksBusKey: '',
    };

    await storage.chainConfigs.put(config);
    await loadConfigs();
    setShowForm(false);
    setForm(EMPTY_FORM);
  }, [storage, form, canSave, loadConfigs]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold text-white">Chain Settings</h1>
        {!showForm && (
          <button
            type="button"
            disabled={!storage}
            onClick={() => setShowForm(true)}
            className={`rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white ${
              storage ? 'hover:bg-blue-700' : 'opacity-50 cursor-not-allowed'
            }`}
          >
            Add Chain
          </button>
        )}
      </div>

      {showForm && (
        <div className="rounded-lg bg-gray-900 p-6 ring-1 ring-gray-800 mb-6">
          <h2 className="text-sm font-semibold text-white mb-4">New Chain Configuration</h2>

          <div className="mb-4">
            <label className="text-sm font-medium text-gray-300 mb-1 block">Chain Preset</label>
            <ChainSelector
              chains={SUPPORTED_CHAINS}
              selectedChainId={form.selectedChainId}
              onSelect={handlePresetSelect}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label htmlFor="chain-name" className="text-sm font-medium text-gray-300 mb-1 block">
                Chain Name
              </label>
              <input
                id="chain-name"
                type="text"
                value={form.name}
                onChange={(e) => updateField('name', e.target.value)}
                placeholder="e.g. Ethereum"
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="chain-id" className="text-sm font-medium text-gray-300 mb-1 block">
                Chain ID
              </label>
              <input
                id="chain-id"
                type="number"
                value={form.chainId}
                onChange={(e) => updateField('chainId', e.target.value)}
                placeholder="e.g. 1"
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="mb-4">
            <label htmlFor="rpc-url" className="text-sm font-medium text-gray-300 mb-1 block">
              RPC URL
            </label>
            <input
              id="rpc-url"
              type="text"
              value={form.rpcUrl}
              onChange={(e) => updateField('rpcUrl', e.target.value)}
              placeholder="https://..."
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div>
              <label htmlFor="explorer-api-url" className="text-sm font-medium text-gray-300 mb-1 block">
                Explorer API URL <span className="text-gray-500">(optional)</span>
              </label>
              <input
                id="explorer-api-url"
                type="text"
                value={form.explorerApiUrl}
                onChange={(e) => updateField('explorerApiUrl', e.target.value)}
                placeholder="https://api.etherscan.io/api"
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="explorer-api-key" className="text-sm font-medium text-gray-300 mb-1 block">
                Explorer API Key <span className="text-gray-500">(optional)</span>
              </label>
              <input
                id="explorer-api-key"
                type="text"
                value={form.explorerApiKey}
                onChange={(e) => updateField('explorerApiKey', e.target.value)}
                placeholder="Your API key"
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={!canSave}
              onClick={() => void handleSave()}
              className={`rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white ${
                canSave ? 'hover:bg-blue-700' : 'opacity-50 cursor-not-allowed'
              }`}
            >
              Save
            </button>
            <button
              type="button"
              onClick={handleCancel}
              className="rounded-lg bg-gray-800 px-4 py-2 text-sm font-medium text-gray-300 hover:bg-gray-700"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {!storage && (
        <p className="text-gray-500">Initializing storage...</p>
      )}

      {storage && !showForm && configs.length === 0 && (
        <p className="text-gray-500">No chain configurations saved yet.</p>
      )}

      {configs.length > 0 && (
        <ul className="divide-y divide-gray-800">
          {configs.map((config) => (
            <li key={config.id} className="py-4">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-white">{config.name}</p>
                  <p className="text-xs text-gray-400">Chain ID: {config.chainId}</p>
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    <span>RPC:</span>
                    {isUnlocked ? (
                      <span className="font-mono text-gray-300">{config.rpcUrl}</span>
                    ) : (
                      <EncryptedField ciphertext={config.rpcUrl} />
                    )}
                  </div>
                  {config.explorerApiKey && (
                    <div className="flex items-center gap-2 text-xs text-gray-400">
                      <span>Explorer Key:</span>
                      {isUnlocked ? (
                        <span className="font-mono text-gray-300">{config.explorerApiKey}</span>
                      ) : (
                        <EncryptedField ciphertext={config.explorerApiKey} />
                      )}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(config.id)}
                  className="text-sm text-red-400 hover:text-red-300 transition-colors"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

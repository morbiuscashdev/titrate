import { useState, useEffect, useCallback } from 'react';
import { useStorage } from '../providers/StorageProvider.js';
import { EncryptedField } from '../components/EncryptedField.js';
import type { StoredChainConfig } from '@titrate/sdk';

/**
 * Chain configuration management page.
 *
 * Lists stored chain configs with name, chain ID, and sensitive fields
 * displayed via EncryptedField. Supports deleting configs; full edit
 * form will be added in a later task.
 */
export function SettingsPage() {
  const { storage, isUnlocked } = useStorage();
  const [configs, setConfigs] = useState<readonly StoredChainConfig[]>([]);

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

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold text-white">Chain Settings</h1>
        <button
          type="button"
          disabled
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white opacity-50 cursor-not-allowed"
        >
          Add Chain
        </button>
      </div>

      {!storage && (
        <p className="text-gray-500">Initializing storage...</p>
      )}

      {storage && configs.length === 0 && (
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

import type { Storage, StoredChainConfig, StoredWallet } from '@titrate/sdk';
import { encrypt, decrypt } from './encrypt.js';

const PLAINTEXT_SETTINGS = new Set(['theme']);

/**
 * Wraps a Storage instance with field-level AES-GCM encryption.
 *
 * Encrypted stores:
 * - `chainConfigs`: `rpcUrl` and `explorerApiKey` encrypted; all other fields pass through
 * - `wallets`: `hotAddress` and `coldAddress` encrypted
 * - `appSettings`: all values encrypted except keys in `PLAINTEXT_SETTINGS` (e.g. "theme")
 *
 * Pass-through stores (no encryption — no sensitive data):
 * - `campaigns`, `addressSets`, `addresses`, `batches`, `pipelineConfigs`,
 *   `pipelineHistory` (loop lifecycle events), `errors` (loop error log)
 */
export function createEncryptedStorage(storage: Storage, key: CryptoKey): Storage {
  return {
    campaigns: storage.campaigns,
    addressSets: storage.addressSets,
    addresses: storage.addresses,
    batches: storage.batches,
    pipelineConfigs: storage.pipelineConfigs,
    pipelineHistory: storage.pipelineHistory,
    errors: storage.errors,

    chainConfigs: createEncryptedChainConfigStore(storage.chainConfigs, key),
    wallets: createEncryptedWalletStore(storage.wallets, key),
    appSettings: createEncryptedAppSettingsStore(storage.appSettings, key),

    ...(storage.acquireLock ? { acquireLock: storage.acquireLock } : {}),
    ...(storage.releaseLock ? { releaseLock: storage.releaseLock } : {}),
  };
}

function createEncryptedChainConfigStore(
  store: Storage['chainConfigs'],
  key: CryptoKey,
): Storage['chainConfigs'] {
  async function encryptConfig(config: StoredChainConfig): Promise<StoredChainConfig> {
    return {
      ...config,
      rpcUrl: await encrypt(config.rpcUrl, key),
      explorerApiKey: config.explorerApiKey ? await encrypt(config.explorerApiKey, key) : '',
    };
  }

  async function decryptConfig(config: StoredChainConfig): Promise<StoredChainConfig> {
    return {
      ...config,
      rpcUrl: await decrypt(config.rpcUrl, key),
      explorerApiKey: config.explorerApiKey ? await decrypt(config.explorerApiKey, key) : '',
    };
  }

  return {
    async get(id) {
      const raw = await store.get(id);
      return raw ? decryptConfig(raw) : null;
    },
    async getByChainId(chainId) {
      const raw = await store.getByChainId(chainId);
      return raw ? decryptConfig(raw) : null;
    },
    async put(config) {
      return store.put(await encryptConfig(config));
    },
    async list() {
      const all = await store.list();
      return Promise.all(all.map(decryptConfig));
    },
    async delete(id) {
      return store.delete(id);
    },
  };
}

function createEncryptedWalletStore(
  store: Storage['wallets'],
  key: CryptoKey,
): Storage['wallets'] {
  return {
    async get(campaignId) {
      const raw = await store.get(campaignId);
      if (!raw) return null;
      return {
        ...raw,
        hotAddress: (await decrypt(raw.hotAddress, key)) as StoredWallet['hotAddress'],
        coldAddress: (await decrypt(raw.coldAddress, key)) as StoredWallet['coldAddress'],
      };
    },
    async put(wallet) {
      return store.put({
        ...wallet,
        hotAddress: (await encrypt(wallet.hotAddress, key)) as StoredWallet['hotAddress'],
        coldAddress: (await encrypt(wallet.coldAddress, key)) as StoredWallet['coldAddress'],
      });
    },
  };
}

function createEncryptedAppSettingsStore(
  store: Storage['appSettings'],
  key: CryptoKey,
): Storage['appSettings'] {
  return {
    async get(settingKey) {
      const raw = await store.get(settingKey);
      if (raw === null) return null;
      if (PLAINTEXT_SETTINGS.has(settingKey)) return raw;
      return decrypt(raw, key);
    },
    async put(settingKey, value) {
      if (PLAINTEXT_SETTINGS.has(settingKey)) {
        return store.put(settingKey, value);
      }
      return store.put(settingKey, await encrypt(value, key));
    },
    async delete(settingKey) {
      return store.delete(settingKey);
    },
  };
}

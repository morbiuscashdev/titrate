import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createEncryptedStorage } from './storage-wrapper.js';
import { deriveEncryptionKey } from './encrypt.js';
import type { Storage, StoredChainConfig } from '@titrate/sdk';

function createMockStorage(): Storage {
  const stores: Record<string, Map<string, unknown>> = {
    campaigns: new Map(),
    chainConfigs: new Map(),
    wallets: new Map(),
    appSettings: new Map(),
  };

  return {
    campaigns: {
      get: vi.fn(async (id) => stores.campaigns.get(id) ?? null),
      getByIdentity: vi.fn(async () => null),
      put: vi.fn(async (c) => { stores.campaigns.set((c as { id: string }).id, c); }),
      list: vi.fn(async () => [...stores.campaigns.values()]),
    },
    chainConfigs: {
      get: vi.fn(async (id) => stores.chainConfigs.get(id) ?? null),
      getByChainId: vi.fn(async () => null),
      put: vi.fn(async (c) => { stores.chainConfigs.set((c as { id: string }).id, c); }),
      list: vi.fn(async () => [...stores.chainConfigs.values()]),
      delete: vi.fn(async (id) => { stores.chainConfigs.delete(id); }),
    },
    wallets: {
      get: vi.fn(async (id) => stores.wallets.get(id) ?? null),
      put: vi.fn(async (w) => { stores.wallets.set((w as { id: string }).id, w); }),
    },
    appSettings: {
      get: vi.fn(async (k) => (stores.appSettings.get(k) as string) ?? null),
      put: vi.fn(async (k, v) => { stores.appSettings.set(k, v); }),
      delete: vi.fn(async (k) => { stores.appSettings.delete(k); }),
    },
    addressSets: {} as never,
    addresses: {} as never,
    batches: {} as never,
    pipelineConfigs: {} as never,
  } as unknown as Storage;
}

describe('createEncryptedStorage', () => {
  let key: CryptoKey;

  beforeEach(async () => {
    key = await deriveEncryptionKey('0x' + 'ab'.repeat(32));
  });

  it('encrypts rpcUrl + explorerApiKey on chainConfig put and decrypts on get', async () => {
    const mock = createMockStorage();
    const encrypted = createEncryptedStorage(mock, key);

    const config: StoredChainConfig = {
      id: 'test',
      chainId: 1,
      name: 'Ethereum',
      rpcUrl: 'https://secret-rpc.com',
      rpcBusKey: 'rpc',
      explorerApiUrl: 'https://api.etherscan.io',
      explorerApiKey: 'SECRET_KEY',
      explorerBusKey: 'etherscan',
      trueBlocksUrl: '',
      trueBlocksBusKey: '',
    };

    await encrypted.chainConfigs.put(config);

    // The underlying mock should have received encrypted values
    const stored = (mock.chainConfigs.put as ReturnType<typeof vi.fn>).mock.calls[0][0] as StoredChainConfig;
    expect(stored.rpcUrl).not.toBe('https://secret-rpc.com');
    expect(stored.explorerApiKey).not.toBe('SECRET_KEY');

    // Plaintext fields should pass through unchanged
    expect(stored.name).toBe('Ethereum');
    expect(stored.chainId).toBe(1);

    // Reading back should transparently decrypt
    const result = await encrypted.chainConfigs.get('test');
    expect(result?.rpcUrl).toBe('https://secret-rpc.com');
    expect(result?.explorerApiKey).toBe('SECRET_KEY');
  });

  it('passes plaintext fields through unchanged on chainConfigs', async () => {
    const mock = createMockStorage();
    const encrypted = createEncryptedStorage(mock, key);

    const config: StoredChainConfig = {
      id: 'base',
      chainId: 8453,
      name: 'Base',
      rpcUrl: 'https://base-rpc.com',
      rpcBusKey: 'base-rpc',
      explorerApiUrl: 'https://api.basescan.org',
      explorerApiKey: 'KEY',
      explorerBusKey: 'basescan',
      trueBlocksUrl: '',
      trueBlocksBusKey: '',
    };

    await encrypted.chainConfigs.put(config);

    const stored = (mock.chainConfigs.put as ReturnType<typeof vi.fn>).mock.calls[0][0] as StoredChainConfig;
    expect(stored.id).toBe('base');
    expect(stored.chainId).toBe(8453);
    expect(stored.name).toBe('Base');
    expect(stored.explorerApiUrl).toBe('https://api.basescan.org');
    expect(stored.rpcBusKey).toBe('base-rpc');
    expect(stored.explorerBusKey).toBe('basescan');
    expect(stored.trueBlocksUrl).toBe('');
    expect(stored.trueBlocksBusKey).toBe('');
  });

  it('campaigns pass through entirely unchanged', async () => {
    const mock = createMockStorage();
    const encrypted = createEncryptedStorage(mock, key);

    // The encrypted storage exposes the exact same campaigns store reference
    expect(encrypted.campaigns).toBe(mock.campaigns);
  });

  it('encrypts appSettings values except theme', async () => {
    const mock = createMockStorage();
    const encrypted = createEncryptedStorage(mock, key);

    // theme is a plaintext key — stored as-is
    await encrypted.appSettings.put('theme', 'dark');
    expect(mock.appSettings.put).toHaveBeenCalledWith('theme', 'dark');

    // any other key is encrypted
    await encrypted.appSettings.put('someSecret', 'my-value');
    const storedSecret = (mock.appSettings.put as ReturnType<typeof vi.fn>).mock.calls[1][1] as string;
    expect(storedSecret).not.toBe('my-value');

    // reading theme back returns plaintext directly
    const theme = await encrypted.appSettings.get('theme');
    expect(theme).toBe('dark');

    // reading the encrypted setting back decrypts it
    const secret = await encrypted.appSettings.get('someSecret');
    expect(secret).toBe('my-value');
  });
});

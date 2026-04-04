import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createEncryptedStorage } from './storage-wrapper.js';
import { deriveEncryptionKey } from './encrypt.js';
import type { Storage, StoredChainConfig, StoredWallet } from '@titrate/sdk';

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
      getByChainId: vi.fn(async (chainId: number) => {
        for (const v of stores.chainConfigs.values()) {
          if ((v as StoredChainConfig).chainId === chainId) return v;
        }
        return null;
      }),
      put: vi.fn(async (c) => { stores.chainConfigs.set((c as { id: string }).id, c); }),
      list: vi.fn(async () => [...stores.chainConfigs.values()]),
      delete: vi.fn(async (id) => { stores.chainConfigs.delete(id); }),
    },
    wallets: {
      get: vi.fn(async (campaignId) => stores.wallets.get(campaignId) ?? null),
      put: vi.fn(async (w) => { stores.wallets.set((w as { campaignId: string }).campaignId, w); }),
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

  it('encrypts and decrypts wallet hotAddress and coldAddress', async () => {
    const mock = createMockStorage();
    const encrypted = createEncryptedStorage(mock, key);

    const wallet: StoredWallet = {
      id: 'w1',
      campaignId: 'campaign-1',
      hotAddress: '0x1111111111111111111111111111111111111111',
      coldAddress: '0x2222222222222222222222222222222222222222',
      createdAt: Date.now(),
    };

    await encrypted.wallets.put(wallet);

    // Underlying store received encrypted addresses
    const storedWallet = (mock.wallets.put as ReturnType<typeof vi.fn>).mock.calls[0][0] as StoredWallet;
    expect(storedWallet.hotAddress).not.toBe('0x1111111111111111111111111111111111111111');
    expect(storedWallet.coldAddress).not.toBe('0x2222222222222222222222222222222222222222');
    // Non-sensitive fields pass through
    expect(storedWallet.campaignId).toBe('campaign-1');
    expect(storedWallet.id).toBe('w1');

    // Reading back decrypts transparently
    const result = await encrypted.wallets.get('campaign-1');
    expect(result).not.toBeNull();
    expect(result!.hotAddress).toBe('0x1111111111111111111111111111111111111111');
    expect(result!.coldAddress).toBe('0x2222222222222222222222222222222222222222');
  });

  it('wallet get returns null for missing campaign', async () => {
    const mock = createMockStorage();
    const encrypted = createEncryptedStorage(mock, key);

    const result = await encrypted.wallets.get('nonexistent-campaign');
    expect(result).toBeNull();
  });

  it('appSettings encrypts non-theme values on put', async () => {
    const mock = createMockStorage();
    const encrypted = createEncryptedStorage(mock, key);

    await encrypted.appSettings.put('apiToken', 'super-secret-token');
    const storedValue = (mock.appSettings.put as ReturnType<typeof vi.fn>).mock.calls[0][1] as string;
    expect(storedValue).not.toBe('super-secret-token');
    // Should be a base64-encoded ciphertext
    expect(() => atob(storedValue)).not.toThrow();
  });

  it('appSettings decrypts non-theme values on get', async () => {
    const mock = createMockStorage();
    const encrypted = createEncryptedStorage(mock, key);

    await encrypted.appSettings.put('rpcEndpoint', 'https://my-secret-rpc.com');
    const result = await encrypted.appSettings.get('rpcEndpoint');
    expect(result).toBe('https://my-secret-rpc.com');
  });

  it('appSettings delete calls through to underlying store', async () => {
    const mock = createMockStorage();
    const encrypted = createEncryptedStorage(mock, key);

    await encrypted.appSettings.put('tempKey', 'tempValue');
    await encrypted.appSettings.delete('tempKey');
    expect(mock.appSettings.delete).toHaveBeenCalledWith('tempKey');
  });

  it('appSettings returns null for missing key', async () => {
    const mock = createMockStorage();
    const encrypted = createEncryptedStorage(mock, key);

    const result = await encrypted.appSettings.get('nonexistent');
    expect(result).toBeNull();
  });

  it('chainConfig list decrypts all entries', async () => {
    const mock = createMockStorage();
    const encrypted = createEncryptedStorage(mock, key);

    const configs: StoredChainConfig[] = [
      {
        id: 'eth', chainId: 1, name: 'Ethereum',
        rpcUrl: 'https://eth-rpc.com', rpcBusKey: 'eth-rpc',
        explorerApiUrl: 'https://api.etherscan.io', explorerApiKey: 'ETH_KEY',
        explorerBusKey: 'etherscan', trueBlocksUrl: '', trueBlocksBusKey: '',
      },
      {
        id: 'base', chainId: 8453, name: 'Base',
        rpcUrl: 'https://base-rpc.com', rpcBusKey: 'base-rpc',
        explorerApiUrl: 'https://api.basescan.org', explorerApiKey: '',
        explorerBusKey: 'basescan', trueBlocksUrl: '', trueBlocksBusKey: '',
      },
    ];

    for (const c of configs) {
      await encrypted.chainConfigs.put(c);
    }

    const listed = await encrypted.chainConfigs.list();
    expect(listed).toHaveLength(2);
    expect(listed[0].rpcUrl).toBe('https://eth-rpc.com');
    expect(listed[0].explorerApiKey).toBe('ETH_KEY');
    expect(listed[1].rpcUrl).toBe('https://base-rpc.com');
    // Empty explorerApiKey should remain empty
    expect(listed[1].explorerApiKey).toBe('');
  });

  it('chainConfig getByChainId decrypts result', async () => {
    const mock = createMockStorage();
    const encrypted = createEncryptedStorage(mock, key);

    const config: StoredChainConfig = {
      id: 'arb', chainId: 42161, name: 'Arbitrum',
      rpcUrl: 'https://arb-rpc.com', rpcBusKey: 'arb-rpc',
      explorerApiUrl: 'https://api.arbiscan.io', explorerApiKey: 'ARB_SECRET',
      explorerBusKey: 'arbiscan', trueBlocksUrl: '', trueBlocksBusKey: '',
    };

    await encrypted.chainConfigs.put(config);

    const result = await encrypted.chainConfigs.getByChainId(42161);
    expect(result).not.toBeNull();
    expect(result!.rpcUrl).toBe('https://arb-rpc.com');
    expect(result!.explorerApiKey).toBe('ARB_SECRET');
    expect(result!.name).toBe('Arbitrum');
  });

  it('chainConfig getByChainId returns null for missing chainId', async () => {
    const mock = createMockStorage();
    const encrypted = createEncryptedStorage(mock, key);

    const result = await encrypted.chainConfigs.getByChainId(99999);
    expect(result).toBeNull();
  });

  it('chainConfig delete calls through to underlying store', async () => {
    const mock = createMockStorage();
    const encrypted = createEncryptedStorage(mock, key);

    await encrypted.chainConfigs.delete('some-id');
    expect(mock.chainConfigs.delete).toHaveBeenCalledWith('some-id');
  });
});

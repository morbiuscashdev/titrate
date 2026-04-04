import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { createIDBStorage } from '../index.js';
import type { Storage, StoredChainConfig } from '@titrate/sdk';

const testConfig: StoredChainConfig = {
  id: 'eth-main',
  chainId: 1,
  name: 'Ethereum',
  rpcUrl: 'https://eth.llamarpc.com',
  rpcBusKey: 'llamarpc',
  explorerApiUrl: 'https://api.etherscan.io/api',
  explorerApiKey: 'ABC123',
  explorerBusKey: 'api.etherscan.io',
  trueBlocksUrl: '',
  trueBlocksBusKey: '',
};

describe('ChainConfigStore', () => {
  let storage: Storage;

  beforeEach(async () => {
    storage = await createIDBStorage(`test-${Math.random()}`);
  });

  it('put and get roundtrip', async () => {
    await storage.chainConfigs.put(testConfig);
    const result = await storage.chainConfigs.get('eth-main');
    expect(result).toMatchObject({ chainId: 1, name: 'Ethereum' });
  });

  it('getByChainId returns matching config', async () => {
    await storage.chainConfigs.put(testConfig);
    const result = await storage.chainConfigs.getByChainId(1);
    expect(result?.id).toBe('eth-main');
  });

  it('list returns all configs', async () => {
    await storage.chainConfigs.put(testConfig);
    await storage.chainConfigs.put({ ...testConfig, id: 'base', chainId: 8453, name: 'Base' });
    const all = await storage.chainConfigs.list();
    expect(all).toHaveLength(2);
  });

  it('delete removes config', async () => {
    await storage.chainConfigs.put(testConfig);
    await storage.chainConfigs.delete('eth-main');
    expect(await storage.chainConfigs.get('eth-main')).toBeNull();
  });

  it('returns null for missing id', async () => {
    expect(await storage.chainConfigs.get('missing')).toBeNull();
  });
});

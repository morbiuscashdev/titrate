import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSharedStorage } from '../src/index.js';

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'titrate-shared-'));
});

afterEach(async () => {
  await rm(root, { recursive: true }).catch(() => {
    // already cleaned up
  });
});

describe('createSharedStorage', () => {
  it('writes settings into _shared/ and reads them back', async () => {
    const s = createSharedStorage(root);
    await s.settings.write({ providerKeys: { valve: 'vk_x' } });
    const read = await s.settings.read();
    expect(read.providerKeys.valve).toBe('vk_x');
  });

  it('writes chains into _shared/ and reads them back', async () => {
    const s = createSharedStorage(root);
    const chains = [
      {
        chainId: 1,
        name: 'Ethereum',
        category: 'mainnet' as const,
        rpcUrls: ['https://eth.rpc'],
        explorerUrl: 'https://etherscan.io',
        explorerApiUrl: 'https://api.etherscan.io',
        nativeSymbol: 'ETH',
        nativeDecimals: 18,
      },
    ];
    await s.chains.write(chains);
    const read = await s.chains.read();
    expect(read).toHaveLength(1);
    expect(read[0].chainId).toBe(1);
  });

  it('returns empty array for chains when file does not exist', async () => {
    const s = createSharedStorage(root);
    const chains = await s.chains.read();
    expect(chains).toEqual([]);
  });

  it('returns empty settings when file does not exist', async () => {
    const s = createSharedStorage(root);
    const settings = await s.settings.read();
    expect(settings).toEqual({ providerKeys: {} });
  });

  it('isolates _shared/ from campaign dirs', async () => {
    const s = createSharedStorage(root);
    await s.chains.write([]);
    const chains = await s.chains.read();
    expect(chains).toEqual([]);
  });

  it('supports settings.update() for partial updates', async () => {
    const s = createSharedStorage(root);
    await s.settings.write({ providerKeys: { valve: 'vk_x' } });
    await s.settings.update({ providerKeys: { alchemy: 'ak_y' } });
    const read = await s.settings.read();
    expect(read.providerKeys.valve).toBe('vk_x');
    expect(read.providerKeys.alchemy).toBe('ak_y');
  });
});

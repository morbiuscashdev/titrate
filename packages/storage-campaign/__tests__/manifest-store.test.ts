import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CampaignManifest } from '@titrate/sdk';
import { createManifestStore } from '../src/manifest-store.js';

let dir: string;
let path: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'titrate-mf-'));
  path = join(dir, 'campaign.json');
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const baseManifest: CampaignManifest = {
  id: 'abc',
  funder: '0x0000000000000000000000000000000000000001',
  name: 'test',
  version: 1,
  chainId: 1,
  rpcUrl: 'https://x',
  tokenAddress: '0x0000000000000000000000000000000000000002',
  tokenDecimals: 18,
  contractAddress: null,
  contractVariant: 'simple',
  contractName: 'X',
  amountMode: 'uniform',
  amountFormat: 'integer',
  uniformAmount: '1',
  batchSize: 200,
  campaignId: null,
  pinnedBlock: null,
  status: 'configuring',
  wallets: { mode: 'imported', count: 0 },
  createdAt: 1,
  updatedAt: 1,
};

describe('ManifestStore', () => {
  it('read() throws when file missing', async () => {
    const s = createManifestStore(path);
    await expect(s.read()).rejects.toThrow();
  });

  it('write then read round-trips', async () => {
    const s = createManifestStore(path);
    await s.write(baseManifest);
    const r = await s.read();
    expect(r).toEqual(baseManifest);
  });

  it('update() applies a patch and bumps updatedAt', async () => {
    const s = createManifestStore(path);
    await s.write(baseManifest);
    const before = (await s.read()).updatedAt;
    await new Promise((r) => setTimeout(r, 2));
    await s.update({ status: 'ready' });
    const after = await s.read();
    expect(after.status).toBe('ready');
    expect(after.updatedAt).toBeGreaterThan(before);
  });

  it('exists() returns true only when file present', async () => {
    const s = createManifestStore(path);
    expect(await s.exists()).toBe(false);
    await s.write(baseManifest);
    expect(await s.exists()).toBe(true);
  });
});

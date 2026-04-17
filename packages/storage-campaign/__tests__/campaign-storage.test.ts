import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CampaignManifest } from '@titrate/sdk';
import { createCampaignStorage } from '../src/index.js';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'titrate-cs-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true }).catch(() => {
    // already cleaned up
  });
});

const baseManifest: CampaignManifest = {
  id: 'abc',
  funder: '0x0000000000000000000000000000000000000001',
  name: 'x',
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

describe('createCampaignStorage', () => {
  it('exposes manifest / pipeline / cursor stores', async () => {
    const s = createCampaignStorage(dir);
    await s.ensureDir();
    await s.manifest.write(baseManifest);
    expect((await s.manifest.read()).id).toBe('abc');
  });

  it('exposes appendable CSV files that write into the campaign dir', async () => {
    const s = createCampaignStorage(dir);
    await s.ensureDir();
    await s.addresses.append([{ address: '0x1', amount: null }]);
    const entries = await readdir(dir);
    expect(entries).toContain('addresses.csv');
  });

  it('supports wallets.jsonl, batches.jsonl, sweep.jsonl', async () => {
    const s = createCampaignStorage(dir);
    await s.ensureDir();
    await s.wallets.append([
      {
        index: 0,
        address: '0x1',
        encryptedKey: 'ct',
        kdf: 'scrypt',
        kdfParams: { N: 131072, r: 8, p: 1, salt: 's' },
        provenance: { type: 'imported' },
        createdAt: 1,
      },
    ]);
    expect(await s.wallets.count()).toBe(1);
  });

  it('exposes pipeline and cursor stores', async () => {
    const s = createCampaignStorage(dir);
    await s.ensureDir();
    const pipelineStore = s.pipeline;
    const cursorStore = s.cursor;
    expect(pipelineStore).toBeDefined();
    expect(cursorStore).toBeDefined();
  });

  it('all files are created under the same root directory', async () => {
    const s = createCampaignStorage(dir);
    await s.ensureDir();
    await s.manifest.write(baseManifest);
    await s.addresses.append([{ address: '0x1', amount: '100' }]);
    const entries = await readdir(dir);
    expect(entries).toContain('campaign.json');
    expect(entries).toContain('addresses.csv');
  });
});

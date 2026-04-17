import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CampaignManifest } from '@titrate/sdk';
import { DEFAULT_STAGE_CONTROL } from '@titrate/sdk';
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
  startBlock: null,
  endBlock: null,
  autoStart: false,
  control: { scan: 'running', filter: 'running', distribute: 'running' },
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

describe('manifest-store Phase 2 defaults', () => {
  let dir: string;
  let path: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'titrate-manifest-p2-'));
    path = join(dir, 'campaign.json');
  });

  it('fills in startBlock / endBlock / autoStart / control when reading a Phase 1 manifest', async () => {
    const legacy = {
      id: 'abc', status: 'ready',
      funder: '0xf', name: 'hex', version: 1, chainId: 1,
      rpcUrl: 'http://x', tokenAddress: '0xt', tokenDecimals: 18,
      contractAddress: null, contractVariant: 'simple', contractName: 'N',
      amountMode: 'uniform', amountFormat: 'integer', uniformAmount: '1',
      batchSize: 100, campaignId: null, pinnedBlock: null,
      wallets: { mode: 'imported', count: 1 },
      createdAt: 1, updatedAt: 1,
    };
    await writeFile(path, JSON.stringify(legacy), 'utf8');

    const manifest = await createManifestStore(path).read();

    expect(manifest.startBlock).toBeNull();
    expect(manifest.endBlock).toBeNull();
    expect(manifest.autoStart).toBe(false);
    expect(manifest.control).toEqual(DEFAULT_STAGE_CONTROL);
    await rm(dir, { recursive: true });
  });

  it('preserves explicit values from a new-format manifest', async () => {
    const store = createManifestStore(path);
    await store.write({
      id: 'xyz', status: 'ready',
      funder: '0xf', name: 'hex', version: 1, chainId: 1,
      rpcUrl: 'http://x', tokenAddress: '0xt', tokenDecimals: 18,
      contractAddress: null, contractVariant: 'simple', contractName: 'N',
      amountMode: 'uniform', amountFormat: 'integer', uniformAmount: '1',
      batchSize: 100, campaignId: null, pinnedBlock: null,
      wallets: { mode: 'imported', count: 1 },
      createdAt: 1, updatedAt: 1,
      startBlock: 10n, endBlock: 20n, autoStart: true,
      control: { scan: 'paused', filter: 'running', distribute: 'running' },
    } as never);

    const back = await store.read();
    expect(back.startBlock).toBe(10n);
    expect(back.endBlock).toBe(20n);
    expect(back.autoStart).toBe(true);
    expect(back.control.scan).toBe('paused');
    await rm(dir, { recursive: true });
  });
});

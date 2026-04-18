import { test, expect } from 'bun:test';
import { createTestRenderer } from '@opentui/core/testing';
import { createRoot } from '@opentui/react';
import type { CampaignManifest } from '@titrate/sdk';
import { createCampaignStorage, createSharedStorage } from '@titrate/storage-campaign';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { App } from '../../src/interactive/App.tsx';

test('Dashboard renders all six steps with status badges', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'titrate-dash-'));
  const storage = createCampaignStorage(dir);
  const shared = createSharedStorage(dir);
  await storage.ensureDir();
  const manifest: CampaignManifest = {
    id: 'x', funder: '0x0000000000000000000000000000000000000001',
    name: 'test-campaign', version: 1, chainId: 1, rpcUrl: 'https://x',
    tokenAddress: '0x0000000000000000000000000000000000000002', tokenDecimals: 18,
    contractAddress: null, contractVariant: 'simple', contractName: 'X',
    amountMode: 'uniform', amountFormat: 'integer', uniformAmount: '1',
    batchSize: 200, campaignId: null, pinnedBlock: null,
    status: 'configuring', wallets: { mode: 'imported', count: 0 },
    createdAt: 1, updatedAt: 1,
    startBlock: null, endBlock: null, autoStart: false,
    control: { scan: 'running', filter: 'running', distribute: 'running' },
  };
  await storage.manifest.write(manifest);

  const { renderer, captureCharFrame } = await createTestRenderer({ width: 60, height: 20 });
  createRoot(renderer).render(<App storage={storage} shared={shared} initialManifest={manifest} />);
  await new Promise((r) => setTimeout(r, 50));
  const text = captureCharFrame();
  expect(text).toContain('test-campaign');
  expect(text).toContain('1. Campaign setup');
  expect(text).toContain('6. Distribute');
});

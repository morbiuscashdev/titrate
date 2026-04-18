import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createCliRenderer } from '@opentui/core';
import { createRoot } from '@opentui/react';
import { createCampaignStorage, createSharedStorage } from '@titrate/storage-campaign';
import type { CampaignManifest } from '@titrate/sdk';
import { App } from '../interactive/App.js';
import { resolveCampaignRoot } from '../utils/campaign-root.js';

export type NewCampaignOptions = {
  readonly folder?: string;
};

export async function runNewCampaign(name: string, options: NewCampaignOptions): Promise<void> {
  const root = await resolveCampaignRoot({ folder: options.folder });
  const id = `${name}-${randomBytes(3).toString('hex')}`;
  const dir = join(root, id);

  try {
    await stat(join(dir, 'campaign.json'));
    console.error(`Campaign ${id} already exists at ${dir}`);
    process.exit(1);
  } catch { /* expected — does not exist */ }

  const storage = createCampaignStorage(dir);
  const shared = createSharedStorage(root);
  await storage.ensureDir();

  const now = Date.now();
  const manifest: CampaignManifest = {
    id,
    funder: '0x0000000000000000000000000000000000000000',
    name,
    version: 1,
    chainId: 1,
    rpcUrl: 'https://eth.llamarpc.com',
    tokenAddress: '0x0000000000000000000000000000000000000000',
    tokenDecimals: 18,
    contractAddress: null,
    contractVariant: 'simple',
    contractName: '',
    amountMode: 'uniform',
    amountFormat: 'integer',
    uniformAmount: null,
    batchSize: 200,
    campaignId: null,
    pinnedBlock: null,
    status: 'configuring',
    wallets: { mode: 'imported', count: 0 },
    createdAt: now,
    updatedAt: now,
    startBlock: null,
    endBlock: null,
    autoStart: false,
    control: { scan: 'running', filter: 'running', distribute: 'running' },
  };
  await storage.manifest.write(manifest);

  const renderer = await createCliRenderer({ exitOnCtrlC: true });
  createRoot(renderer).render(<App storage={storage} shared={shared} initialManifest={manifest} />);
}

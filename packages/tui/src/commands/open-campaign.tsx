import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { createCliRenderer } from '@opentui/core';
import { createRoot } from '@opentui/react';
import { createCampaignStorage, createSharedStorage } from '@titrate/storage-campaign';
import { App } from '../interactive/App.js';
import { resolveCampaignRoot } from '../utils/campaign-root.js';

export type OpenCampaignOptions = {
  readonly folder?: string;
};

async function resolveCampaignDir(nameOrPath: string, root: string): Promise<string> {
  try {
    await access(join(nameOrPath, 'campaign.json'));
    return nameOrPath;
  } catch { /* fall through */ }
  const dir = join(root, nameOrPath);
  try {
    await access(join(dir, 'campaign.json'));
    return dir;
  } catch {
    throw new Error(`Campaign not found: ${nameOrPath} (looked in ${nameOrPath} and ${dir})`);
  }
}

export async function runOpenCampaign(nameOrPath: string, options: OpenCampaignOptions): Promise<void> {
  const root = await resolveCampaignRoot({ folder: options.folder });
  const dir = await resolveCampaignDir(nameOrPath, root);
  const storage = createCampaignStorage(dir);
  const shared = createSharedStorage(root);
  const manifest = await storage.manifest.read();

  const renderer = await createCliRenderer({ exitOnCtrlC: true });
  createRoot(renderer).render(<App storage={storage} shared={shared} initialManifest={manifest} />);
}

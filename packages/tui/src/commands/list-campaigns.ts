import { readdir, access } from 'node:fs/promises';
import { join } from 'node:path';
import { createCampaignStorage } from '@titrate/storage-campaign';
import { resolveCampaignRoot } from '../utils/campaign-root.js';

export type ListCampaignsOptions = {
  readonly folder?: string;
};

export async function runListCampaigns(options: ListCampaignsOptions): Promise<void> {
  const root = await resolveCampaignRoot({ folder: options.folder });
  let entries: string[];
  try {
    entries = await readdir(root);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      console.log(`No campaigns yet (root ${root} does not exist)`);
      return;
    }
    throw err;
  }

  const rows: { id: string; name: string; status: string; updatedAt: string }[] = [];
  for (const entry of entries) {
    if (entry === '_shared') continue;
    const dir = join(root, entry);
    try {
      await access(join(dir, 'campaign.json'));
    } catch { continue; }
    const storage = createCampaignStorage(dir);
    const m = await storage.manifest.read();
    rows.push({
      id: m.id,
      name: m.name,
      status: m.status,
      updatedAt: new Date(m.updatedAt).toISOString(),
    });
  }

  if (rows.length === 0) {
    console.log(`No campaigns found in ${root}`);
    return;
  }
  console.log('ID\tNAME\tSTATUS\tUPDATED');
  for (const r of rows) {
    console.log(`${r.id}\t${r.name}\t${r.status}\t${r.updatedAt}`);
  }
}

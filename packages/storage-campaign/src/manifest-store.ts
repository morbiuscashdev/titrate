import { readFile, writeFile, stat } from 'node:fs/promises';
import type { CampaignManifest } from '@titrate/sdk';

export type ManifestStore = {
  readonly read: () => Promise<CampaignManifest>;
  readonly write: (manifest: CampaignManifest) => Promise<void>;
  readonly update: (patch: Partial<CampaignManifest>) => Promise<void>;
  readonly exists: () => Promise<boolean>;
};

export function createManifestStore(path: string): ManifestStore {
  return {
    async read() {
      const raw = await readFile(path, 'utf8');
      return JSON.parse(raw) as CampaignManifest;
    },

    async write(manifest) {
      await writeFile(path, JSON.stringify(manifest, null, 2), 'utf8');
    },

    async update(patch) {
      const current = await this.read();
      const next: CampaignManifest = {
        ...current,
        ...patch,
        updatedAt: Date.now(),
      };
      await this.write(next);
    },

    async exists() {
      try {
        await stat(path);
        return true;
      } catch {
        return false;
      }
    },
  };
}

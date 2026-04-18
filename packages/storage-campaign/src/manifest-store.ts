import { readFile, writeFile, stat } from 'node:fs/promises';
import type { CampaignManifest } from '@titrate/sdk';
import { DEFAULT_STAGE_CONTROL } from '@titrate/sdk';

export type ManifestStore = {
  readonly read: () => Promise<CampaignManifest>;
  readonly write: (manifest: CampaignManifest) => Promise<void>;
  readonly update: (patch: Partial<CampaignManifest>) => Promise<void>;
  readonly exists: () => Promise<boolean>;
};

type ManifestOnDisk = Omit<CampaignManifest, 'startBlock' | 'endBlock'> & {
  readonly startBlock?: string | null;
  readonly endBlock?: string | null;
  readonly autoStart?: boolean;
  readonly control?: CampaignManifest['control'];
};

function fromDisk(raw: ManifestOnDisk): CampaignManifest {
  return {
    ...raw,
    startBlock: raw.startBlock == null ? null : BigInt(raw.startBlock),
    endBlock: raw.endBlock == null ? null : BigInt(raw.endBlock),
    autoStart: raw.autoStart ?? false,
    control: raw.control ?? DEFAULT_STAGE_CONTROL,
  };
}

function toDisk(m: CampaignManifest): ManifestOnDisk {
  return {
    ...m,
    startBlock: m.startBlock === null ? null : m.startBlock.toString(),
    endBlock: m.endBlock === null ? null : m.endBlock.toString(),
  };
}

export function createManifestStore(path: string): ManifestStore {
  return {
    async read() {
      const raw = await readFile(path, 'utf8');
      return fromDisk(JSON.parse(raw) as ManifestOnDisk);
    },

    async write(manifest) {
      await writeFile(path, JSON.stringify(toDisk(manifest), null, 2), 'utf8');
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

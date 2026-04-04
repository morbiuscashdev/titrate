import { readFile, writeFile, readdir, mkdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import type { Address } from 'viem';
import type { CampaignStore, StoredCampaign } from '@titrate/sdk';

type SerializedCampaign = Omit<StoredCampaign, 'pinnedBlock'> & {
  readonly pinnedBlock: string | null;
};

function serialize(campaign: StoredCampaign): SerializedCampaign {
  return {
    ...campaign,
    pinnedBlock: campaign.pinnedBlock !== null ? campaign.pinnedBlock.toString() : null,
  };
}

function deserialize(raw: SerializedCampaign): StoredCampaign {
  return {
    ...raw,
    pinnedBlock: raw.pinnedBlock !== null ? BigInt(raw.pinnedBlock) : null,
  };
}

/**
 * Creates a CampaignStore that persists campaigns as JSON files under
 * `{baseDir}/campaigns/{id}.json`. BigInt fields are serialized as strings.
 */
export function createCampaignStore(baseDir: string): CampaignStore {
  const dir = join(baseDir, 'campaigns');

  async function ensureDir(): Promise<void> {
    await mkdir(dir, { recursive: true });
  }

  async function get(id: string): Promise<StoredCampaign | null> {
    await ensureDir();
    try {
      const raw = await readFile(join(dir, `${id}.json`), 'utf8');
      return deserialize(JSON.parse(raw) as SerializedCampaign);
    } catch {
      return null;
    }
  }

  async function getByIdentity(
    funder: Address,
    name: string,
    version: number,
  ): Promise<StoredCampaign | null> {
    const all = await list();
    return (
      all.find(
        (c) =>
          c.funder.toLowerCase() === funder.toLowerCase() &&
          c.name === name &&
          c.version === version,
      ) ?? null
    );
  }

  async function put(campaign: StoredCampaign): Promise<void> {
    await ensureDir();
    const data = JSON.stringify(serialize(campaign), null, 2);
    await writeFile(join(dir, `${campaign.id}.json`), data, 'utf8');
  }

  async function list(): Promise<readonly StoredCampaign[]> {
    await ensureDir();
    const files = await readdir(dir);
    const campaigns = await Promise.all(
      files
        .filter((f) => f.endsWith('.json'))
        .map(async (f) => {
          const raw = await readFile(join(dir, f), 'utf8');
          return deserialize(JSON.parse(raw) as SerializedCampaign);
        }),
    );
    return campaigns;
  }

  async function remove(id: string): Promise<void> {
    await ensureDir();
    try {
      await unlink(join(dir, `${id}.json`));
    } catch {
      // File may not exist — ignore
    }
  }

  return { get, getByIdentity, put, list, delete: remove };
}

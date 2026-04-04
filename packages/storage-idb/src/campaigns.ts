import type { Address } from 'viem';
import type { CampaignStore, StoredCampaign } from '@titrate/sdk';
import type { TitrateDB } from './db.js';

type SerializedCampaign = Omit<StoredCampaign, 'pinnedBlock'> & {
  readonly pinnedBlock: string | null;
};

function serialize(campaign: StoredCampaign): SerializedCampaign {
  return {
    ...campaign,
    pinnedBlock: campaign.pinnedBlock !== null ? campaign.pinnedBlock.toString() : null,
  };
}

function deserialize(raw: Record<string, unknown>): StoredCampaign {
  const serialized = raw as SerializedCampaign;
  return {
    ...serialized,
    pinnedBlock: serialized.pinnedBlock !== null ? BigInt(serialized.pinnedBlock) : null,
  };
}

/**
 * Creates a CampaignStore backed by an IndexedDB 'campaigns' object store.
 * BigInt fields are serialized to strings because IDB structured clone does
 * not support BigInt.
 *
 * @param db - Open TitrateDB handle
 * @returns CampaignStore implementation
 */
export function createCampaignStore(db: TitrateDB): CampaignStore {
  async function get(id: string): Promise<StoredCampaign | null> {
    const data = await db.get('campaigns', id);
    return data ? deserialize(data) : null;
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
    await db.put('campaigns', serialize(campaign) as unknown as Record<string, unknown>);
  }

  async function list(): Promise<readonly StoredCampaign[]> {
    const all = await db.getAll('campaigns');
    return all.map(deserialize);
  }

  async function remove(id: string): Promise<void> {
    await db.delete('campaigns', id);
  }

  return { get, getByIdentity, put, list, delete: remove };
}

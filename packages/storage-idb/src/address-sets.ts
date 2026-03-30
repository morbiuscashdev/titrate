import type { Address } from 'viem';
import type { AddressSetStore, AddressStore, StoredAddressSet, StoredAddress } from '@titrate/sdk';
import type { TitrateDB } from './db.js';

/**
 * Creates an AddressSetStore backed by the 'addressSets' object store in IDB.
 * No BigInt fields — no serialization needed.
 *
 * @param db - Open TitrateDB handle
 * @returns AddressSetStore implementation
 */
export function createAddressSetStore(db: TitrateDB): AddressSetStore {
  async function get(id: string): Promise<StoredAddressSet | null> {
    const data = await db.get('addressSets', id);
    return data ? (data as unknown as StoredAddressSet) : null;
  }

  async function getByCampaign(campaignId: string): Promise<readonly StoredAddressSet[]> {
    const all = await db.getAllFromIndex('addressSets', 'byCampaign', campaignId);
    return all as unknown as StoredAddressSet[];
  }

  async function put(addressSet: StoredAddressSet): Promise<void> {
    await db.put('addressSets', addressSet as unknown as Record<string, unknown>);
  }

  return { get, getByCampaign, put };
}

/**
 * Creates an AddressStore backed by the 'addresses' object store in IDB.
 * Uses an autoIncrement key. Addresses are grouped by setId via an index.
 *
 * @param db - Open TitrateDB handle
 * @returns AddressStore implementation
 */
export function createAddressStore(db: TitrateDB): AddressStore {
  async function getBySet(setId: string): Promise<readonly StoredAddress[]> {
    const all = await db.getAllFromIndex('addresses', 'bySet', setId);
    return all.map((raw) => {
      const r = raw as unknown as { setId: string; address: Address; amount: string | null };
      return { setId: r.setId, address: r.address, amount: r.amount };
    });
  }

  async function putBatch(addresses: readonly StoredAddress[]): Promise<void> {
    if (addresses.length === 0) return;
    const tx = db.transaction('addresses', 'readwrite');
    await Promise.all(
      addresses.map((addr) => tx.store.add(addr as unknown as Record<string, unknown>)),
    );
    await tx.done;
  }

  async function countBySet(setId: string): Promise<number> {
    const count = await db.countFromIndex('addresses', 'bySet', setId);
    return count;
  }

  return { getBySet, putBatch, countBySet };
}

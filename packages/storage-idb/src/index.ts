import type { Storage } from '@titrate/sdk';
import { openTitrateDB } from './db.js';
import { createCampaignStore } from './campaigns.js';
import { createAddressSetStore, createAddressStore } from './address-sets.js';
import { createBatchStore } from './batches.js';
import { createWalletStore, createPipelineConfigStore } from './wallets.js';

export { createIDBCacheStore } from './cache-store.js';

/**
 * Creates an IndexedDB-backed Storage instance.
 * Opens (or creates) the 'titrate' database, then wires up each store.
 *
 * @returns A Storage object implementing the SDK's Storage interface
 */
export async function createIDBStorage(): Promise<Storage> {
  const db = await openTitrateDB();
  return {
    campaigns: createCampaignStore(db),
    addressSets: createAddressSetStore(db),
    addresses: createAddressStore(db),
    batches: createBatchStore(db),
    wallets: createWalletStore(db),
    pipelineConfigs: createPipelineConfigStore(db),
  };
}

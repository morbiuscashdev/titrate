import type { Storage } from '@titrate/sdk';
import { openTitrateDB } from './db.js';
import { createCampaignStore } from './campaigns.js';
import { createAddressSetStore, createAddressStore } from './address-sets.js';
import { createBatchStore } from './batches.js';
import { createWalletStore, createPipelineConfigStore } from './wallets.js';
import { createChainConfigStore } from './chain-configs.js';
import { createAppSettingsStore } from './app-settings.js';
import { createPipelineHistoryStore } from './pipeline-history.js';
import { createErrorsStore } from './errors.js';
import { acquireIDBLock } from './lock.js';

export { createIDBCacheStore } from './cache-store.js';

/**
 * Creates an IndexedDB-backed Storage instance.
 * Opens (or creates) the database, then wires up each store.
 *
 * @param dbName - Optional database name for test isolation (defaults to 'titrate')
 * @returns A Storage object implementing the SDK's Storage interface
 */
export async function createIDBStorage(dbName?: string): Promise<Storage> {
  const db = await openTitrateDB(dbName);
  return {
    campaigns: createCampaignStore(db),
    addressSets: createAddressSetStore(db),
    addresses: createAddressStore(db),
    batches: createBatchStore(db),
    wallets: createWalletStore(db),
    pipelineConfigs: createPipelineConfigStore(db),
    chainConfigs: createChainConfigStore(db),
    appSettings: createAppSettingsStore(db),
    pipelineHistory: createPipelineHistoryStore(db),
    errors: createErrorsStore(db),
    acquireLock: (campaignId: string) => acquireIDBLock(campaignId),
    releaseLock: async () => {
      // No-op; release is handled by the handle returned from acquireLock.
    },
  };
}

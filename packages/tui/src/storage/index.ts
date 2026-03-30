import type { Storage } from '@titrate/sdk';
import { createCampaignStore } from './campaigns.js';
import { createAddressSetStore, createAddressStore } from './address-sets.js';
import { createBatchStore } from './batches.js';
import { createWalletStore, createPipelineConfigStore } from './wallets.js';

/**
 * Creates a filesystem-backed Storage instance. All data is persisted under
 * the provided `baseDir`. Each store uses its own subdirectory.
 *
 * @param baseDir - Root directory for all storage (e.g. `.titrate/`)
 * @returns A Storage object implementing the SDK's Storage interface
 */
export function createFileStorage(baseDir: string): Storage {
  return {
    campaigns: createCampaignStore(baseDir),
    addressSets: createAddressSetStore(baseDir),
    addresses: createAddressStore(baseDir),
    batches: createBatchStore(baseDir),
    wallets: createWalletStore(baseDir),
    pipelineConfigs: createPipelineConfigStore(baseDir),
  };
}

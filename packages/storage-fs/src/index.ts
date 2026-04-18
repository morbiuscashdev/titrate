import type { Storage, ChainConfigStore, AppSettingsStore } from '@titrate/sdk';
import { createCampaignStore } from './campaigns.js';
import { createAddressSetStore, createAddressStore } from './address-sets.js';
import { createBatchStore } from './batches.js';
import { createWalletStore, createPipelineConfigStore } from './wallets.js';

export { createFileCacheStore } from './cache-store.js';

const NOT_IMPLEMENTED = 'Not implemented in filesystem storage';

const chainConfigsStub: ChainConfigStore = {
  get: () => Promise.reject(new Error(NOT_IMPLEMENTED)),
  getByChainId: () => Promise.reject(new Error(NOT_IMPLEMENTED)),
  put: () => Promise.reject(new Error(NOT_IMPLEMENTED)),
  list: () => Promise.reject(new Error(NOT_IMPLEMENTED)),
  delete: () => Promise.reject(new Error(NOT_IMPLEMENTED)),
};

const appSettingsStub: AppSettingsStore = {
  get: () => Promise.reject(new Error(NOT_IMPLEMENTED)),
  put: () => Promise.reject(new Error(NOT_IMPLEMENTED)),
  delete: () => Promise.reject(new Error(NOT_IMPLEMENTED)),
};

// Phase 2 loop stores live in storage-campaign (per-campaign directory),
// not here. storage-fs is the legacy root-level filesystem adapter; it
// satisfies the Storage type shape with rejecting stubs so no production
// path silently falls through to them.
const pipelineHistoryStub: Storage['pipelineHistory'] = {
  append: () => Promise.reject(new Error(NOT_IMPLEMENTED)),
  readAll: () => Promise.reject(new Error(NOT_IMPLEMENTED)),
};

const errorsStub: Storage['errors'] = {
  append: () => Promise.reject(new Error(NOT_IMPLEMENTED)),
  readAll: () => Promise.reject(new Error(NOT_IMPLEMENTED)),
};

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
    chainConfigs: chainConfigsStub,
    appSettings: appSettingsStub,
    pipelineHistory: pipelineHistoryStub,
    errors: errorsStub,
  };
}

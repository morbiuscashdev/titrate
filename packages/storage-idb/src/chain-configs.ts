import type { ChainConfigStore, StoredChainConfig } from '@titrate/sdk';
import type { TitrateDB } from './db.js';

const STORE = 'chainConfigs';

/**
 * Creates a ChainConfigStore backed by the 'chainConfigs' object store in IDB.
 * Keyed by `id`; `getByChainId` does a full-scan filter on the numeric chainId.
 *
 * @param db - Open TitrateDB handle
 * @returns ChainConfigStore implementation
 */
export function createChainConfigStore(db: TitrateDB): ChainConfigStore {
  async function get(id: string): Promise<StoredChainConfig | null> {
    return (await db.get(STORE, id)) ?? null;
  }

  async function getByChainId(chainId: number): Promise<StoredChainConfig | null> {
    const all = await db.getAll(STORE);
    return (all as StoredChainConfig[]).find((c) => c.chainId === chainId) ?? null;
  }

  async function put(config: StoredChainConfig): Promise<void> {
    await db.put(STORE, config);
  }

  async function list(): Promise<readonly StoredChainConfig[]> {
    return db.getAll(STORE);
  }

  async function deleteById(id: string): Promise<void> {
    await db.delete(STORE, id);
  }

  return { get, getByChainId, put, list, delete: deleteById };
}

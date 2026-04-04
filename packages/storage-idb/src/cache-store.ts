import { openDB, type IDBPDatabase } from 'idb';
import type { CacheStore, CacheEntry } from '@titrate/sdk';

const STORE_NAME = 'cache';

/**
 * Creates an IndexedDB-backed CacheStore using a dedicated database.
 * The cache object store is keyed by `key`.
 *
 * @param dbName - Name of the IndexedDB database (default: 'titrate-cache')
 * @returns A CacheStore implementation backed by IndexedDB
 */
export async function createIDBCacheStore(dbName = 'titrate-cache'): Promise<CacheStore> {
  const db: IDBPDatabase = await openDB(dbName, 1, {
    upgrade(database) {
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    },
  });

  return {
    async get<T>(key: string): Promise<CacheEntry<T> | null> {
      const entry = await db.get(STORE_NAME, key);
      return (entry as CacheEntry<T>) ?? null;
    },

    async put<T>(entry: CacheEntry<T>): Promise<void> {
      await db.put(STORE_NAME, entry);
    },

    async delete(key: string): Promise<void> {
      await db.delete(STORE_NAME, key);
    },

    async clear(): Promise<void> {
      await db.clear(STORE_NAME);
    },
  };
}

/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_REOWN_PROJECT_ID: string | undefined;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/**
 * Ambient module declaration for @titrate/storage-idb.
 * The package dist is not always built during type-checking, so we
 * declare the subset of exports the web app consumes.
 */
declare module '@titrate/storage-idb' {
  import type { Storage, CacheStore } from '@titrate/sdk';
  export function createIDBStorage(dbName?: string): Promise<Storage>;
  export function createIDBCacheStore(dbName?: string): Promise<CacheStore>;
}
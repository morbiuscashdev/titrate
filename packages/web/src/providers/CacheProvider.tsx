import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { createCache, type Cache } from '@titrate/sdk';
import { createIDBCacheStore } from '@titrate/storage-idb';

/** Values exposed by the cache context. */
export type CacheContextValue = {
  readonly cache: Cache | null;
};

const CacheContext = createContext<CacheContextValue | null>(null);

export type CacheProviderProps = {
  readonly children: ReactNode;
};

/**
 * Provides a two-tier cache (memory + IndexedDB) to the component tree.
 *
 * On mount, opens an IDB-backed cache store and creates a `Cache` instance
 * that checks memory first, then IndexedDB, before computing a value.
 * Until initialization completes, `cache` is `null`.
 */
export function CacheProvider({ children }: CacheProviderProps) {
  const [cache, setCache] = useState<Cache | null>(null);

  useEffect(() => {
    createIDBCacheStore().then((store) => {
      setCache(createCache({ persistentStore: store }));
    }).catch((error: unknown) => {
      console.error('Failed to initialize IDB cache store:', error);
    });
  }, []);

  return (
    <CacheContext.Provider value={{ cache }}>
      {children}
    </CacheContext.Provider>
  );
}

/**
 * Access the current cache context.
 *
 * @throws When called outside of a `<CacheProvider>`.
 */
export function useCache(): CacheContextValue {
  const context = useContext(CacheContext);
  if (!context) {
    throw new Error('useCache must be used within a CacheProvider');
  }
  return context;
}

// packages/sdk/src/cache/memory-cache.ts

type MemoryCacheEntry = {
  readonly value: unknown;
  readonly expiresAt: number | null; // null = never
};

export type MemoryCache = {
  get<T>(key: string): T | null;
  set<T>(key: string, value: T, ttl: number | null): void;
  invalidate(key: string): void;
  clear(): void;
};

/**
 * Creates an in-memory key-value cache with optional TTL per entry.
 * Expired entries are lazily evicted on access.
 *
 * @example
 * const cache = createMemoryCache();
 * cache.set('key', 'value', 5000); // expires in 5s
 * cache.set('key', 'value', null); // never expires
 * cache.set('key', 'value', 0);    // bypass — not stored
 */
export function createMemoryCache(): MemoryCache {
  const store = new Map<string, MemoryCacheEntry>();

  return {
    get<T>(key: string): T | null {
      const entry = store.get(key);
      if (!entry) return null;
      if (entry.expiresAt !== null && Date.now() >= entry.expiresAt) {
        store.delete(key);
        return null;
      }
      return entry.value as T;
    },

    set<T>(key: string, value: T, ttl: number | null): void {
      if (ttl === 0) return; // TTL 0 = do not cache
      const expiresAt = ttl !== null ? Date.now() + ttl : null;
      store.set(key, { value, expiresAt });
    },

    invalidate(key: string): void {
      store.delete(key);
    },

    clear(): void {
      store.clear();
    },
  };
}

// packages/sdk/src/cache/cache.ts
import type { Cache, CacheConfig, CacheEntry, CacheKey } from './types.js';
import { createMemoryCache } from './memory-cache.js';

function isExpired(entry: CacheEntry<unknown>): boolean {
  if (entry.ttl === null) return false;
  return Date.now() >= entry.createdAt + entry.ttl;
}

/**
 * Creates a two-tier cache (memory + optional persistent store).
 * Memory tier is checked first, then persistent. Compute only on full miss.
 * TTL 0 bypasses caching entirely.
 *
 * @example
 * const cache = createCache({ persistentStore: myStore });
 * const result = await cache.getOrCompute('key', () => fetchData(), 60_000);
 */
export function createCache(config?: CacheConfig): Cache {
  const useMemory = config?.memoryCache !== false;
  const memory = useMemory ? createMemoryCache() : null;
  const persistent = config?.persistentStore ?? null;

  async function get<T>(key: CacheKey): Promise<T | null> {
    // Tier 1: memory
    if (memory) {
      const memResult = memory.get<T>(key);
      if (memResult !== null) return memResult;
    }

    // Tier 2: persistent
    if (!persistent) return null;

    const entry = await persistent.get<T>(key);
    if (!entry || isExpired(entry)) return null;

    // Promote to memory
    if (memory) memory.set(key, entry.value, entry.ttl);
    return entry.value;
  }

  async function set<T>(key: CacheKey, value: T, ttl: number | null): Promise<void> {
    if (ttl === 0) return;

    if (memory) memory.set(key, value, ttl);

    if (persistent) {
      await persistent.put({
        key,
        value,
        createdAt: Date.now(),
        ttl,
      });
    }
  }

  async function getOrCompute<T>(
    key: CacheKey,
    compute: () => Promise<T>,
    ttl: number | null = null,
  ): Promise<T> {
    if (ttl !== 0) {
      const cached = await get<T>(key);
      if (cached !== null) return cached;
    }

    const result = await compute();
    await set(key, result, ttl);
    return result;
  }

  async function invalidate(key: CacheKey): Promise<void> {
    if (memory) memory.invalidate(key);
    if (persistent) await persistent.delete(key);
  }

  async function clear(): Promise<void> {
    if (memory) memory.clear();
    if (persistent) await persistent.clear();
  }

  return { get, getOrCompute, set, invalidate, clear };
}

// packages/sdk/src/__tests__/cache/cache.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createCache } from '../../cache/cache.js';
import type { CacheStore, CacheEntry } from '../../cache/types.js';

function createMockStore(): CacheStore & { entries: Map<string, CacheEntry<unknown>> } {
  const entries = new Map<string, CacheEntry<unknown>>();
  return {
    entries,
    get: vi.fn(async (key: string) => entries.get(key) ?? null),
    put: vi.fn(async (entry: CacheEntry<unknown>) => { entries.set(entry.key, entry); }),
    delete: vi.fn(async (key: string) => { entries.delete(key); }),
    clear: vi.fn(async () => { entries.clear(); }),
  };
}

describe('createCache — memory only', () => {
  it('getOrCompute calls compute on miss and caches result', async () => {
    const cache = createCache();
    const compute = vi.fn().mockResolvedValue('computed');

    const r1 = await cache.getOrCompute('key1', compute, null);
    expect(r1).toBe('computed');
    expect(compute).toHaveBeenCalledOnce();

    // Second call should hit memory — compute not called again
    const r2 = await cache.getOrCompute('key1', compute, null);
    expect(r2).toBe('computed');
    expect(compute).toHaveBeenCalledOnce();
  });

  it('get returns null on miss', async () => {
    const cache = createCache();
    expect(await cache.get('missing')).toBeNull();
  });

  it('set + get roundtrip', async () => {
    const cache = createCache();
    await cache.set('k', 'v', null);
    expect(await cache.get('k')).toBe('v');
  });

  it('invalidate removes from cache', async () => {
    const cache = createCache();
    await cache.set('k', 'v', null);
    await cache.invalidate('k');
    expect(await cache.get('k')).toBeNull();
  });

  it('clear removes all entries', async () => {
    const cache = createCache();
    await cache.set('a', 1, null);
    await cache.set('b', 2, null);
    await cache.clear();
    expect(await cache.get('a')).toBeNull();
    expect(await cache.get('b')).toBeNull();
  });
});

describe('createCache — with persistent store', () => {
  it('getOrCompute stores in both tiers', async () => {
    const store = createMockStore();
    const cache = createCache({ persistentStore: store });
    const compute = vi.fn().mockResolvedValue('result');

    await cache.getOrCompute('key1', compute, null);

    // Persistent store should have the entry
    expect(store.put).toHaveBeenCalledOnce();
    expect(store.entries.get('key1')?.value).toBe('result');
  });

  it('getOrCompute checks persistent store on memory miss', async () => {
    const store = createMockStore();
    // Pre-populate persistent store
    store.entries.set('key1', { key: 'key1', value: 'persisted', createdAt: Date.now(), ttl: null });

    const cache = createCache({ persistentStore: store });
    const compute = vi.fn().mockResolvedValue('should not be called');

    const result = await cache.getOrCompute('key1', compute, null);
    expect(result).toBe('persisted');
    expect(compute).not.toHaveBeenCalled();
  });

  it('promotes persistent hit to memory', async () => {
    const store = createMockStore();
    store.entries.set('key1', { key: 'key1', value: 'persisted', createdAt: Date.now(), ttl: null });

    const cache = createCache({ persistentStore: store });
    await cache.getOrCompute('key1', vi.fn(), null);

    // Second call should not hit persistent store again (memory has it now)
    const result = await cache.get('key1');
    expect(result).toBe('persisted');
    // store.get was called once for the first getOrCompute, not again for get
    expect(store.get).toHaveBeenCalledTimes(1);
  });

  it('respects TTL on persistent entries', async () => {
    const store = createMockStore();
    // Entry expired 1 second ago
    store.entries.set('key1', { key: 'key1', value: 'stale', createdAt: Date.now() - 2000, ttl: 1000 });

    const cache = createCache({ persistentStore: store });
    const compute = vi.fn().mockResolvedValue('fresh');

    const result = await cache.getOrCompute('key1', compute, null);
    expect(result).toBe('fresh');
    expect(compute).toHaveBeenCalledOnce();
  });

  it('invalidate removes from both tiers', async () => {
    const store = createMockStore();
    const cache = createCache({ persistentStore: store });
    await cache.set('k', 'v', null);
    await cache.invalidate('k');

    expect(await cache.get('k')).toBeNull();
    expect(store.delete).toHaveBeenCalledWith('k');
  });

  it('clear clears both tiers', async () => {
    const store = createMockStore();
    const cache = createCache({ persistentStore: store });
    await cache.set('a', 1, null);
    await cache.clear();

    expect(await cache.get('a')).toBeNull();
    expect(store.clear).toHaveBeenCalled();
  });
});

describe('createCache — TTL 0 bypass', () => {
  it('getOrCompute with TTL 0 always computes and does not cache', async () => {
    const cache = createCache();
    const compute = vi.fn().mockResolvedValue('fresh');

    await cache.getOrCompute('key1', compute, 0);
    await cache.getOrCompute('key1', compute, 0);

    expect(compute).toHaveBeenCalledTimes(2);
  });
});

describe('createCache — memory disabled', () => {
  it('works with persistent store only', async () => {
    const store = createMockStore();
    const cache = createCache({ memoryCache: false, persistentStore: store });
    const compute = vi.fn().mockResolvedValue('result');

    await cache.getOrCompute('key1', compute, null);
    expect(store.entries.get('key1')?.value).toBe('result');

    // Second call hits persistent store
    const r2 = await cache.getOrCompute('key1', compute, null);
    expect(r2).toBe('result');
    expect(compute).toHaveBeenCalledOnce();
  });
});

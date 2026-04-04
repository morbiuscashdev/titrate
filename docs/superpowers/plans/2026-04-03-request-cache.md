# Request Cache Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a two-tier (memory + persistent) hash-based caching layer to the SDK that prevents redundant computations and network calls across the pipeline and scanner functions.

**Architecture:** A new `packages/sdk/src/cache/` module with 5 files. `computeCacheKey` produces deterministic SHA-256 hashes from sorted, serialized params. `createMemoryCache` provides a `Map`-based cache with TTL. `createCache` orchestrates both tiers — checking memory first, then persistent store, computing only on full miss. `CacheStore` is an interface implemented by `@titrate/storage-fs` (JSON files) and `@titrate/storage-idb` (IDB object store).

**Tech Stack:** TypeScript, Web Crypto API (SHA-256), Vitest

---

## File Structure

### New SDK files (`packages/sdk/src/cache/`)

| File | Responsibility |
|------|----------------|
| `types.ts` | `CacheKey`, `CacheEntry`, `CacheStore`, `CacheConfig`, `Cache` |
| `key.ts` | `computeCacheKey` — deterministic param → SHA-256 hex string |
| `memory-cache.ts` | In-memory `Map`-based cache with TTL expiration |
| `cache.ts` | `createCache` — two-tier orchestrator |
| `index.ts` | Barrel exports |

### New test files

| File | Covers |
|------|--------|
| `packages/sdk/src/__tests__/cache/key.test.ts` | Deterministic hashing, key ordering, BigInt |
| `packages/sdk/src/__tests__/cache/memory-cache.test.ts` | Get/set, TTL, invalidate, clear |
| `packages/sdk/src/__tests__/cache/cache.test.ts` | Two-tier orchestration, getOrCompute |

### New storage adapter files

| File | Responsibility |
|------|----------------|
| `packages/storage-fs/src/cache-store.ts` | Filesystem `CacheStore` implementation |
| `packages/storage-fs/src/__tests__/cache-store.test.ts` | Filesystem cache tests |
| `packages/storage-idb/src/cache-store.ts` | IndexedDB `CacheStore` implementation |
| `packages/storage-idb/src/__tests__/cache-store.test.ts` | IDB cache tests |

### Modified files

| File | Change |
|------|--------|
| `packages/sdk/src/index.ts` | Export cache module |
| `packages/storage-fs/src/index.ts` | Export `createFileCacheStore` |
| `packages/storage-idb/src/index.ts` | Export `createIDBCacheStore` |
| `packages/storage-idb/src/db.ts` | Add `cache` object store to schema |

---

### Task 1: Cache types + deterministic key generation

**Files:**
- Create: `packages/sdk/src/cache/types.ts`
- Create: `packages/sdk/src/cache/key.ts`
- Create: `packages/sdk/src/__tests__/cache/key.test.ts`

- [ ] **Step 1: Create cache types**

```typescript
// packages/sdk/src/cache/types.ts

export type CacheKey = string;

export type CacheEntry<T> = {
  readonly key: CacheKey;
  readonly value: T;
  readonly createdAt: number;
  readonly ttl: number | null;
  readonly metadata?: Record<string, unknown>;
};

export type CacheStore = {
  get<T>(key: CacheKey): Promise<CacheEntry<T> | null>;
  put<T>(entry: CacheEntry<T>): Promise<void>;
  delete(key: CacheKey): Promise<void>;
  clear(): Promise<void>;
};

export type CacheConfig = {
  readonly memoryCache?: boolean;
  readonly persistentStore?: CacheStore;
};

export type Cache = {
  get<T>(key: CacheKey): Promise<T | null>;
  getOrCompute<T>(key: CacheKey, compute: () => Promise<T>, ttl?: number | null): Promise<T>;
  set<T>(key: CacheKey, value: T, ttl?: number | null): Promise<void>;
  invalidate(key: CacheKey): Promise<void>;
  clear(): Promise<void>;
};
```

- [ ] **Step 2: Write failing key tests**

```typescript
// packages/sdk/src/__tests__/cache/key.test.ts
import { describe, it, expect } from 'vitest';
import { computeCacheKey } from '../../cache/key.js';

describe('computeCacheKey', () => {
  it('produces deterministic keys for same params', async () => {
    const k1 = await computeCacheKey({ action: 'test', value: 42 });
    const k2 = await computeCacheKey({ action: 'test', value: 42 });
    expect(k1).toBe(k2);
  });

  it('produces same key regardless of property order', async () => {
    const k1 = await computeCacheKey({ a: 1, b: 2, c: 3 });
    const k2 = await computeCacheKey({ c: 3, a: 1, b: 2 });
    expect(k1).toBe(k2);
  });

  it('handles BigInt values by stringifying', async () => {
    const k1 = await computeCacheKey({ amount: 1000n });
    const k2 = await computeCacheKey({ amount: 1000n });
    expect(k1).toBe(k2);
    expect(k1.length).toBe(64); // SHA-256 hex = 64 chars
  });

  it('produces different keys for different params', async () => {
    const k1 = await computeCacheKey({ action: 'a' });
    const k2 = await computeCacheKey({ action: 'b' });
    expect(k1).not.toBe(k2);
  });

  it('handles nested objects', async () => {
    const k1 = await computeCacheKey({ config: { startBlock: '100', endBlock: '200' } });
    const k2 = await computeCacheKey({ config: { startBlock: '100', endBlock: '200' } });
    expect(k1).toBe(k2);
  });

  it('handles arrays', async () => {
    const k1 = await computeCacheKey({ addresses: ['0xabc', '0xdef'] });
    const k2 = await computeCacheKey({ addresses: ['0xabc', '0xdef'] });
    expect(k1).toBe(k2);
  });

  it('returns hex string of 64 characters', async () => {
    const key = await computeCacheKey({ test: true });
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd packages/sdk && npx vitest run src/__tests__/cache/key.test.ts`
Expected: FAIL — module not found

- [ ] **Step 4: Implement computeCacheKey**

```typescript
// packages/sdk/src/cache/key.ts
import { createHash } from 'node:crypto';
import type { CacheKey } from './types.js';

/**
 * Replacer for JSON.stringify that handles BigInt values.
 */
function bigintReplacer(_key: string, value: unknown): unknown {
  if (typeof value === 'bigint') return `__bigint__${value.toString()}`;
  return value;
}

/**
 * Recursively sorts object keys for deterministic serialization.
 */
function sortKeys(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'bigint') return `__bigint__${obj.toString()}`;
  if (Array.isArray(obj)) return obj.map(sortKeys);
  if (typeof obj === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(obj as Record<string, unknown>).sort()) {
      sorted[key] = sortKeys((obj as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return obj;
}

/**
 * Computes a deterministic SHA-256 cache key from request parameters.
 * Keys are sorted alphabetically for order-independence.
 * BigInt values are serialized as strings.
 */
export async function computeCacheKey(params: Record<string, unknown>): Promise<CacheKey> {
  const sorted = sortKeys(params);
  const json = JSON.stringify(sorted, bigintReplacer);
  const hash = createHash('sha256').update(json).digest('hex');
  return hash;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd packages/sdk && npx vitest run src/__tests__/cache/key.test.ts`
Expected: PASS — all 7 tests

- [ ] **Step 6: Commit**

```bash
git add packages/sdk/src/cache/types.ts packages/sdk/src/cache/key.ts \
  packages/sdk/src/__tests__/cache/key.test.ts
git commit -m "feat(sdk): add cache types and deterministic key generation"
```

---

### Task 2: In-memory cache with TTL

**Files:**
- Create: `packages/sdk/src/cache/memory-cache.ts`
- Create: `packages/sdk/src/__tests__/cache/memory-cache.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// packages/sdk/src/__tests__/cache/memory-cache.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMemoryCache } from '../../cache/memory-cache.js';

describe('createMemoryCache', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('get/set roundtrip', () => {
    const cache = createMemoryCache();
    cache.set('key1', 'value1', null);
    expect(cache.get('key1')).toBe('value1');
  });

  it('returns null for missing key', () => {
    const cache = createMemoryCache();
    expect(cache.get('missing')).toBeNull();
  });

  it('respects TTL — returns null after expiry', () => {
    const cache = createMemoryCache();
    cache.set('key1', 'value1', 100);
    expect(cache.get('key1')).toBe('value1');

    vi.advanceTimersByTime(150);
    expect(cache.get('key1')).toBeNull();
  });

  it('null TTL never expires', () => {
    const cache = createMemoryCache();
    cache.set('key1', 'value1', null);

    vi.advanceTimersByTime(999_999);
    expect(cache.get('key1')).toBe('value1');
  });

  it('TTL 0 does not store', () => {
    const cache = createMemoryCache();
    cache.set('key1', 'value1', 0);
    expect(cache.get('key1')).toBeNull();
  });

  it('invalidate removes entry', () => {
    const cache = createMemoryCache();
    cache.set('key1', 'value1', null);
    cache.invalidate('key1');
    expect(cache.get('key1')).toBeNull();
  });

  it('clear removes all entries', () => {
    const cache = createMemoryCache();
    cache.set('a', 1, null);
    cache.set('b', 2, null);
    cache.clear();
    expect(cache.get('a')).toBeNull();
    expect(cache.get('b')).toBeNull();
  });

  it('overwrite replaces existing entry', () => {
    const cache = createMemoryCache();
    cache.set('key1', 'old', null);
    cache.set('key1', 'new', null);
    expect(cache.get('key1')).toBe('new');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/sdk && npx vitest run src/__tests__/cache/memory-cache.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement memory cache**

```typescript
// packages/sdk/src/cache/memory-cache.ts

type MemoryCacheEntry = {
  readonly value: unknown;
  readonly expiresAt: number | null;  // null = never
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
      if (ttl === 0) return;  // TTL 0 = do not cache
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/sdk && npx vitest run src/__tests__/cache/memory-cache.test.ts`
Expected: PASS — all 8 tests

- [ ] **Step 5: Commit**

```bash
git add packages/sdk/src/cache/memory-cache.ts packages/sdk/src/__tests__/cache/memory-cache.test.ts
git commit -m "feat(sdk): add in-memory cache with TTL"
```

---

### Task 3: Two-tier cache orchestrator

**Files:**
- Create: `packages/sdk/src/cache/cache.ts`
- Create: `packages/sdk/src/cache/index.ts`
- Create: `packages/sdk/src/__tests__/cache/cache.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/sdk && npx vitest run src/__tests__/cache/cache.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement cache orchestrator**

```typescript
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
    if (persistent) {
      const entry = await persistent.get<T>(key);
      if (entry && !isExpired(entry)) {
        // Promote to memory
        if (memory) memory.set(key, entry.value, entry.ttl);
        return entry.value;
      }
    }

    return null;
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

  async function getOrCompute<T>(key: CacheKey, compute: () => Promise<T>, ttl: number | null = null): Promise<T> {
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
```

- [ ] **Step 4: Create barrel exports**

```typescript
// packages/sdk/src/cache/index.ts
export type { CacheKey, CacheEntry, CacheStore, CacheConfig, Cache } from './types.js';
export { computeCacheKey } from './key.js';
export { createMemoryCache } from './memory-cache.js';
export type { MemoryCache } from './memory-cache.js';
export { createCache } from './cache.js';
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd packages/sdk && npx vitest run src/__tests__/cache/`
Expected: PASS — all tests across key, memory-cache, and cache test files

- [ ] **Step 6: Commit**

```bash
git add packages/sdk/src/cache/cache.ts packages/sdk/src/cache/index.ts \
  packages/sdk/src/__tests__/cache/cache.test.ts
git commit -m "feat(sdk): add two-tier cache orchestrator with getOrCompute"
```

---

### Task 4: Storage adapter cache stores (filesystem + IndexedDB)

**Files:**
- Create: `packages/storage-fs/src/cache-store.ts`
- Create: `packages/storage-fs/src/__tests__/cache-store.test.ts`
- Create: `packages/storage-idb/src/cache-store.ts`
- Create: `packages/storage-idb/src/__tests__/cache-store.test.ts`
- Modify: `packages/storage-fs/src/index.ts`
- Modify: `packages/storage-idb/src/index.ts`
- Modify: `packages/storage-idb/src/db.ts`

- [ ] **Step 1: Write failing filesystem cache store tests**

```typescript
// packages/storage-fs/src/__tests__/cache-store.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createFileCacheStore } from '../cache-store.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('createFileCacheStore', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'titrate-cache-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true });
  });

  it('put and get roundtrip', async () => {
    const store = createFileCacheStore(dir);
    await store.put({ key: 'abc123', value: { addresses: ['0x1', '0x2'] }, createdAt: Date.now(), ttl: null });
    const entry = await store.get('abc123');
    expect(entry).not.toBeNull();
    expect(entry!.value).toEqual({ addresses: ['0x1', '0x2'] });
  });

  it('returns null for missing key', async () => {
    const store = createFileCacheStore(dir);
    expect(await store.get('missing')).toBeNull();
  });

  it('delete removes entry', async () => {
    const store = createFileCacheStore(dir);
    await store.put({ key: 'k1', value: 'v1', createdAt: Date.now(), ttl: null });
    await store.delete('k1');
    expect(await store.get('k1')).toBeNull();
  });

  it('clear removes all entries', async () => {
    const store = createFileCacheStore(dir);
    await store.put({ key: 'a', value: 1, createdAt: Date.now(), ttl: null });
    await store.put({ key: 'b', value: 2, createdAt: Date.now(), ttl: null });
    await store.clear();
    expect(await store.get('a')).toBeNull();
    expect(await store.get('b')).toBeNull();
  });

  it('preserves ttl and createdAt', async () => {
    const store = createFileCacheStore(dir);
    const now = Date.now();
    await store.put({ key: 'k', value: 'v', createdAt: now, ttl: 5000 });
    const entry = await store.get('k');
    expect(entry!.createdAt).toBe(now);
    expect(entry!.ttl).toBe(5000);
  });
});
```

- [ ] **Step 2: Implement filesystem cache store**

```typescript
// packages/storage-fs/src/cache-store.ts
import { readFile, writeFile, unlink, readdir, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import type { CacheStore, CacheEntry } from '@titrate/sdk';

/**
 * Creates a filesystem-backed CacheStore.
 * Each entry is stored as a JSON file named `{key}.json` in the cache directory.
 */
export function createFileCacheStore(cacheDir: string): CacheStore {
  async function ensureDir(): Promise<void> {
    if (!existsSync(cacheDir)) {
      await mkdir(cacheDir, { recursive: true });
    }
  }

  function filePath(key: string): string {
    return join(cacheDir, `${key}.json`);
  }

  return {
    async get<T>(key: string): Promise<CacheEntry<T> | null> {
      const path = filePath(key);
      if (!existsSync(path)) return null;
      const raw = await readFile(path, 'utf8');
      return JSON.parse(raw) as CacheEntry<T>;
    },

    async put<T>(entry: CacheEntry<T>): Promise<void> {
      await ensureDir();
      await writeFile(filePath(entry.key), JSON.stringify(entry), 'utf8');
    },

    async delete(key: string): Promise<void> {
      const path = filePath(key);
      if (existsSync(path)) await unlink(path);
    },

    async clear(): Promise<void> {
      if (!existsSync(cacheDir)) return;
      const files = await readdir(cacheDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          await unlink(join(cacheDir, file));
        }
      }
    },
  };
}
```

- [ ] **Step 3: Run filesystem tests**

Run: `cd packages/storage-fs && npx vitest run src/__tests__/cache-store.test.ts`
Expected: PASS — all 5 tests

- [ ] **Step 4: Write failing IndexedDB cache store tests**

```typescript
// packages/storage-idb/src/__tests__/cache-store.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { createIDBCacheStore } from '../cache-store.js';

describe('createIDBCacheStore', () => {
  let store: Awaited<ReturnType<typeof createIDBCacheStore>>;

  beforeEach(async () => {
    // Each test gets a fresh database name
    store = await createIDBCacheStore(`test-cache-${Math.random()}`);
  });

  it('put and get roundtrip', async () => {
    await store.put({ key: 'abc', value: [1, 2, 3], createdAt: Date.now(), ttl: null });
    const entry = await store.get('abc');
    expect(entry).not.toBeNull();
    expect(entry!.value).toEqual([1, 2, 3]);
  });

  it('returns null for missing key', async () => {
    expect(await store.get('missing')).toBeNull();
  });

  it('delete removes entry', async () => {
    await store.put({ key: 'k', value: 'v', createdAt: Date.now(), ttl: null });
    await store.delete('k');
    expect(await store.get('k')).toBeNull();
  });

  it('clear removes all entries', async () => {
    await store.put({ key: 'a', value: 1, createdAt: Date.now(), ttl: null });
    await store.put({ key: 'b', value: 2, createdAt: Date.now(), ttl: null });
    await store.clear();
    expect(await store.get('a')).toBeNull();
    expect(await store.get('b')).toBeNull();
  });

  it('preserves metadata fields', async () => {
    const now = Date.now();
    await store.put({ key: 'k', value: 'v', createdAt: now, ttl: 3000, metadata: { source: 'test' } });
    const entry = await store.get('k');
    expect(entry!.createdAt).toBe(now);
    expect(entry!.ttl).toBe(3000);
    expect(entry!.metadata).toEqual({ source: 'test' });
  });
});
```

- [ ] **Step 5: Implement IndexedDB cache store**

```typescript
// packages/storage-idb/src/cache-store.ts
import { openDB, type IDBPDatabase } from 'idb';
import type { CacheStore, CacheEntry } from '@titrate/sdk';

const STORE_NAME = 'cache';

/**
 * Creates an IndexedDB-backed CacheStore.
 * Uses a dedicated database for cache entries.
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
```

- [ ] **Step 6: Run IndexedDB tests**

Run: `cd packages/storage-idb && npx vitest run src/__tests__/cache-store.test.ts`
Expected: PASS — all 5 tests

- [ ] **Step 7: Update storage adapter barrel exports**

Add to `packages/storage-fs/src/index.ts`:
```typescript
export { createFileCacheStore } from './cache-store.js';
```

Add to `packages/storage-idb/src/index.ts`:
```typescript
export { createIDBCacheStore } from './cache-store.js';
```

- [ ] **Step 8: Commit**

```bash
git add packages/storage-fs/src/cache-store.ts packages/storage-fs/src/__tests__/cache-store.test.ts \
  packages/storage-fs/src/index.ts \
  packages/storage-idb/src/cache-store.ts packages/storage-idb/src/__tests__/cache-store.test.ts \
  packages/storage-idb/src/index.ts
git commit -m "feat: add filesystem and IndexedDB cache store implementations"
```

---

### Task 5: SDK exports + final verification

**Files:**
- Modify: `packages/sdk/src/index.ts`

- [ ] **Step 1: Add cache exports to SDK barrel**

Add to `packages/sdk/src/index.ts`:

```typescript
// Cache
export { computeCacheKey, createMemoryCache, createCache } from './cache/index.js';
export type { CacheKey, CacheEntry, CacheStore, CacheConfig, Cache, MemoryCache } from './cache/index.js';
```

- [ ] **Step 2: Build all packages**

Run: `cd packages/sdk && npx tsc --noEmit && cd ../storage-fs && npx tsc --noEmit && cd ../storage-idb && npx tsc --noEmit && cd ../tui && npx tsc --noEmit && cd ../web && npx tsc --noEmit`
Expected: All clean

- [ ] **Step 3: Run all SDK tests**

Run: `cd packages/sdk && npx vitest run`
Expected: All pass (cache + existing)

- [ ] **Step 4: Run storage adapter tests**

Run: `cd packages/storage-fs && npx vitest run && cd ../storage-idb && npx vitest run`
Expected: All pass

- [ ] **Step 5: Run TUI + web tests**

Run: `cd packages/tui && npx vitest run && cd ../web && npx vitest run`
Expected: All pass

- [ ] **Step 6: Commit**

```bash
git add packages/sdk/src/index.ts
git commit -m "feat(sdk): export cache module from SDK barrel"
```

# Request Cache Layer — Design Spec

## Overview

Add a hash-based caching layer to the SDK that prevents redundant computations and network calls across the pipeline. Cache keys are deterministic hashes of request configuration. Cached values are the derived data the pipeline cares about (address sets, metadata), not raw API responses. Storage is pluggable — filesystem for TUI, IndexedDB for web app.

## Problem

Without caching, every pipeline run re-fetches the same data:
- Scanning 500k blocks of token transfers takes minutes — but the data hasn't changed since last run
- `probeToken` calls ERC-20 metadata that never changes — yet fires on every campaign edit
- Balance checks for the same addresses repeat when the user adjusts filters and re-runs
- Pipeline results are thrown away and recomputed from scratch on resume

## Architecture

### Two-Tier Cache

**Tier 1: In-memory (session-scoped)**
- For hot data that's accessed repeatedly within a single session
- Key-value `Map` with optional TTL
- Gone when the process exits
- Examples: token metadata (infinite TTL), balance checks (15s TTL)

**Tier 2: Persistent (cross-session)**
- For expensive computations that survive process restarts
- Pluggable backend: filesystem (TUI) or IndexedDB (web)
- Examples: pipeline scan results (address sets), explorer scan results
- Keyed by config hash so different configs get fresh results

### Cache Key Strategy

Every cacheable operation has a **cache identity** — a deterministic hash of its configuration:

```typescript
type CacheKey = string;  // hex-encoded SHA-256 hash

function computeCacheKey(params: Record<string, unknown>): CacheKey;
```

The key is `sha256(JSON.stringify(sortedParams))` where `sortedParams` has keys sorted alphabetically for determinism. BigInt values are stringified.

Examples:
- Token metadata: `sha256({ action: 'probeToken', address: '0xA0b8...' })` → same key forever
- Explorer scan: `sha256({ action: 'scanTokenTransfers', token: '0xA0b8...', startBlock: '0', endBlock: '19000000' })` → changes when block range changes
- Pipeline result: `sha256({ action: 'pipeline', steps: [...serializedConfig] })` → changes when pipeline config changes

### Cache Entry

```typescript
type CacheEntry<T> = {
  readonly key: CacheKey;
  readonly value: T;
  readonly createdAt: number;       // Unix timestamp
  readonly ttl: number | null;      // ms, null = never expires
  readonly metadata?: Record<string, unknown>;
};
```

## SDK Module: `packages/sdk/src/cache/`

### Files

| File | Responsibility |
|------|----------------|
| `types.ts` | `CacheKey`, `CacheEntry`, `CacheStore`, `CacheConfig` |
| `key.ts` | `computeCacheKey` — deterministic hashing |
| `memory-cache.ts` | In-memory cache with TTL |
| `cache.ts` | `createCache` — orchestrates memory + persistent tiers |
| `index.ts` | Barrel exports |

### CacheStore Interface (persistent tier)

```typescript
type CacheStore = {
  get<T>(key: CacheKey): Promise<CacheEntry<T> | null>;
  put<T>(entry: CacheEntry<T>): Promise<void>;
  delete(key: CacheKey): Promise<void>;
  clear(): Promise<void>;
};
```

The SDK defines the interface. Implementations live in:
- `@titrate/storage-fs` — filesystem-backed (JSON files in a cache directory)
- `@titrate/storage-idb` — IndexedDB-backed (new object store)

### Cache Interface

```typescript
type CacheConfig = {
  readonly memoryCache?: boolean;       // enable in-memory tier, default true
  readonly persistentStore?: CacheStore; // enable persistent tier, default null
};

type Cache = {
  get<T>(key: CacheKey): Promise<T | null>;
  getOrCompute<T>(key: CacheKey, compute: () => Promise<T>, ttl?: number | null): Promise<T>;
  set<T>(key: CacheKey, value: T, ttl?: number | null): Promise<void>;
  invalidate(key: CacheKey): Promise<void>;
  clear(): Promise<void>;
};

function createCache(config?: CacheConfig): Cache;
```

### `getOrCompute` — the primary method

This is the workhorse. It:
1. Checks memory cache → return if valid
2. Checks persistent store → return if valid, promote to memory
3. Calls `compute()` → stores result in both tiers → return

```typescript
const addresses = await cache.getOrCompute(
  computeCacheKey({ action: 'scanTokenTransfers', token, startBlock, endBlock }),
  () => runExpensiveScan(),
  null,  // never expires — same config = same result
);
```

### TTL Semantics

| Value | Meaning |
|-------|---------|
| `null` | Never expires (use for immutable data like token metadata) |
| `0` | Do not cache (bypass both tiers) |
| `> 0` | Expires after N milliseconds |

Expired entries are lazily evicted on access (not background-swept).

## Integration Points

### Pipeline

The pipeline's `execute()` gains an optional `cache` parameter:

```typescript
type Pipeline = {
  // ... existing
  execute(rpc?: PublicClient, onProgress?: ProgressCallback, cache?: Cache): AsyncGenerator<Address[]>;
};
```

When cache is provided:
- After sources complete → cache the collected address set keyed by the serialized pipeline source config
- On next run with same config → skip source execution, load from cache
- Filters are NOT cached (they depend on live chain state like balances)

### Scanner Functions

Each scanner function can accept an optional `cache` parameter:
- `scanTokenTransfers({ ..., cache })` → caches result set per config hash
- `getAppearances({ ..., cache })` → same pattern

The scanner checks the cache before starting. If a valid entry exists, it yields the cached addresses without hitting the network.

### Utility Hooks (Phase B)

The TanStack Query hooks (`useTokenMetadata`, `useNativeBalance`, etc.) will use the in-memory tier as their cache backend, with TTLs matching their stale times.

## Filesystem CacheStore (TUI)

Added to `@titrate/storage-fs`:

```
{storage-dir}/.cache/
  {cache-key-hex}.json    # one file per cache entry
```

Each file contains a `CacheEntry` serialized as JSON. BigInt values are stored as strings.

## IndexedDB CacheStore (Web)

Added to `@titrate/storage-idb`:

New object store `cache` in the IDB schema:
- Key: `CacheKey` string
- Value: serialized `CacheEntry`

## Testing Strategy

### Key generation tests
- Deterministic: same params → same key
- Order-independent: `{ a: 1, b: 2 }` === `{ b: 2, a: 1 }`
- BigInt handling: `{ amount: 1000n }` hashes correctly
- Different params → different keys

### Memory cache tests
- Get/set roundtrip
- TTL expiration (set with 100ms TTL, read after 150ms → null)
- Null TTL never expires
- Invalidate removes entry
- Clear removes all entries

### Cache orchestration tests
- Memory-only mode: get → miss → compute → cached
- Persistent mode: get → miss memory → hit persistent → promote to memory
- Both tiers: compute → stored in both → memory hit on re-read
- TTL respected across tiers
- `getOrCompute` only calls compute once for same key

### Integration tests
- Pipeline with cache: second run skips source execution
- Scanner with cache: second run returns cached addresses

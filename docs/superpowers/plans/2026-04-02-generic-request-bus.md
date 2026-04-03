# Generic RequestBus Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the adaptive rate limiting algorithm from `ExplorerBus` into a generic `RequestBus` that throttles any async function, then refactor Explorer and TrueBlocks to use it as thin wrappers.

**Architecture:** One new file (`request-bus.ts`) at the SDK root level containing the generic bus, registry, and in-flight deduplication. The explorer module's `bus.ts` is rewritten to delegate rate limiting to the generic bus while keeping protocol-specific logic (URL construction, response parsing, API key, retries). The TrueBlocks client is updated to route all requests through the bus. All existing tests should pass unchanged.

**Tech Stack:** TypeScript, Vitest

---

## File Structure

### New files

| File | Responsibility |
|------|----------------|
| `packages/sdk/src/request-bus.ts` | `RequestBus` type, `createRequestBus`, `getOrCreateBus`, `destroyBus`, `destroyAllBuses` |
| `packages/sdk/src/__tests__/request-bus.test.ts` | Generic bus tests |

### Modified files

| File | Change |
|------|--------|
| `packages/sdk/src/explorer/bus.ts` | Rewrite to use `RequestBus` internally |
| `packages/sdk/src/explorer/types.ts` | Add `busKey` to `ExplorerBusOptions` |
| `packages/sdk/src/trueblocks/client.ts` | Route requests through `RequestBus` |
| `packages/sdk/src/index.ts` | Export generic bus functions and types |

---

### Task 1: Generic RequestBus

**Files:**
- Create: `packages/sdk/src/request-bus.ts`
- Create: `packages/sdk/src/__tests__/request-bus.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// packages/sdk/src/__tests__/request-bus.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  createRequestBus,
  getOrCreateBus,
  destroyBus,
  destroyAllBuses,
} from '../request-bus.js';

describe('createRequestBus', () => {
  it('stores the key', () => {
    const bus = createRequestBus('test-key');
    expect(bus.key).toBe('test-key');
    bus.destroy();
  });

  it('starts unthrottled', () => {
    const bus = createRequestBus('test');
    expect(bus.getCurrentRate()).toBeNull();
    bus.destroy();
  });

  it('executes fn immediately when unthrottled', async () => {
    const bus = createRequestBus('test');
    const fn = vi.fn().mockResolvedValue(42);
    const result = await bus.execute(fn);
    expect(result).toBe(42);
    expect(fn).toHaveBeenCalledOnce();
    bus.destroy();
  });

  it('sets rate to 80% of burst on first rate limit error', async () => {
    let callCount = 0;
    const bus = createRequestBus('test', {
      isRateLimitError: (err) => (err as Error).message === 'rate limited',
    });

    const fn = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) return Promise.reject(new Error('rate limited'));
      return Promise.resolve('ok');
    });

    const result = await bus.execute(fn);
    expect(result).toBe('ok');
    const rate = bus.getCurrentRate();
    expect(rate).not.toBeNull();
    expect(rate!).toBeGreaterThan(0);
    bus.destroy();
  });

  it('reduces rate by 5% on subsequent rate limit errors', async () => {
    let callCount = 0;
    const bus = createRequestBus('test', {
      isRateLimitError: (err) => (err as Error).message === 'rate limited',
    });

    // First call: rate limit → sets initial rate
    // Second call: succeeds
    // Third call: rate limit → reduces by 5%
    // Fourth call: succeeds
    const fn1 = vi.fn()
      .mockRejectedValueOnce(new Error('rate limited'))
      .mockResolvedValueOnce('ok');
    await bus.execute(fn1);
    const firstRate = bus.getCurrentRate()!;

    const fn2 = vi.fn()
      .mockRejectedValueOnce(new Error('rate limited'))
      .mockResolvedValueOnce('ok');
    await bus.execute(fn2);
    const secondRate = bus.getCurrentRate()!;

    expect(secondRate).toBeLessThan(firstRate);
    expect(secondRate).toBeCloseTo(firstRate * 0.95, 1);
    bus.destroy();
  });

  it('throws non-rate-limit errors without retry', async () => {
    const bus = createRequestBus('test', {
      isRateLimitError: () => false,
    });
    const fn = vi.fn().mockRejectedValue(new Error('network down'));
    await expect(bus.execute(fn)).rejects.toThrow('network down');
    expect(fn).toHaveBeenCalledOnce();
    bus.destroy();
  });

  it('deduplicates in-flight requests with same requestKey', async () => {
    const bus = createRequestBus('test');
    let resolvePromise: (v: string) => void;
    const slowFn = vi.fn().mockReturnValue(
      new Promise<string>((resolve) => { resolvePromise = resolve; }),
    );

    const p1 = bus.execute(slowFn, 'same-key');
    const p2 = bus.execute(slowFn, 'same-key');

    expect(slowFn).toHaveBeenCalledOnce(); // only one execution

    resolvePromise!('result');
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toBe('result');
    expect(r2).toBe('result');
    bus.destroy();
  });

  it('does not deduplicate different requestKeys', async () => {
    const bus = createRequestBus('test');
    const fn = vi.fn().mockResolvedValue('ok');

    await Promise.all([
      bus.execute(fn, 'key-a'),
      bus.execute(fn, 'key-b'),
    ]);

    expect(fn).toHaveBeenCalledTimes(2);
    bus.destroy();
  });

  it('removes dedup entry after settlement', async () => {
    const bus = createRequestBus('test');
    const fn = vi.fn().mockResolvedValue('ok');

    await bus.execute(fn, 'key');
    // Second call with same key should execute again (first settled)
    await bus.execute(fn, 'key');

    expect(fn).toHaveBeenCalledTimes(2);
    bus.destroy();
  });

  it('does not deduplicate when no requestKey provided', async () => {
    const bus = createRequestBus('test');
    const fn = vi.fn().mockResolvedValue('ok');

    await Promise.all([bus.execute(fn), bus.execute(fn)]);
    expect(fn).toHaveBeenCalledTimes(2);
    bus.destroy();
  });
});

describe('getOrCreateBus', () => {
  afterEach(() => destroyAllBuses());

  it('returns same bus for same key', () => {
    const bus1 = getOrCreateBus('shared');
    const bus2 = getOrCreateBus('shared');
    expect(bus1).toBe(bus2);
  });

  it('returns different buses for different keys', () => {
    const bus1 = getOrCreateBus('alpha');
    const bus2 = getOrCreateBus('beta');
    expect(bus1).not.toBe(bus2);
    expect(bus1.key).toBe('alpha');
    expect(bus2.key).toBe('beta');
  });

  it('passes options to new bus', async () => {
    const bus = getOrCreateBus('test', {
      isRateLimitError: (err) => (err as Error).message === 'rl',
    });
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('rl'))
      .mockResolvedValueOnce('ok');
    await bus.execute(fn);
    expect(bus.getCurrentRate()).not.toBeNull();
  });
});

describe('destroyBus', () => {
  afterEach(() => destroyAllBuses());

  it('removes specific bus from registry', () => {
    const bus1 = getOrCreateBus('target');
    destroyBus('target');
    const bus2 = getOrCreateBus('target');
    expect(bus1).not.toBe(bus2);
  });
});

describe('destroyAllBuses', () => {
  it('clears entire registry', () => {
    const bus1 = getOrCreateBus('a');
    const bus2 = getOrCreateBus('b');
    destroyAllBuses();
    const bus3 = getOrCreateBus('a');
    expect(bus1).not.toBe(bus3);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/sdk && npx vitest run src/__tests__/request-bus.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement RequestBus**

```typescript
// packages/sdk/src/request-bus.ts

const WINDOW_MS = 5_000;
const MIN_RATE = 1;
const INITIAL_BACKOFF_FACTOR = 0.8;
const SUBSEQUENT_BACKOFF_FACTOR = 0.95;
const DEFAULT_BURST_RATE = 5;

export type RequestBusOptions = {
  readonly isRateLimitError?: (error: unknown) => boolean;
};

export type RequestBus = {
  readonly key: string;
  execute<T>(fn: () => Promise<T>, requestKey?: string): Promise<T>;
  getCurrentRate(): number | null;
  destroy(): void;
};

/**
 * Creates a generic rate-limited execution queue.
 * Starts unthrottled. Learns rate limits from errors matched by `isRateLimitError`.
 * On first rate limit: set limit to 80% of measured burst rate.
 * On subsequent: reduce by 5%. Floor: 1 req/sec.
 * Optional in-flight deduplication via `requestKey`.
 */
export function createRequestBus(key: string, options?: RequestBusOptions): RequestBus {
  const isRateLimitError = options?.isRateLimitError ?? (() => false);

  const timestamps: number[] = [];
  let enforcedRate: number | null = null;
  let lastRequestTime = 0;
  const inFlight = new Map<string, Promise<unknown>>();

  function pruneTimestamps(): void {
    const cutoff = Date.now() - WINDOW_MS;
    while (timestamps.length > 0 && timestamps[0] < cutoff) {
      timestamps.shift();
    }
  }

  function measureBurstRate(): number {
    pruneTimestamps();
    if (timestamps.length < 2) return DEFAULT_BURST_RATE;
    const windowStart = timestamps[0];
    const windowDuration = (Date.now() - windowStart) / 1000;
    if (windowDuration < 0.1) return DEFAULT_BURST_RATE;
    return timestamps.length / windowDuration;
  }

  function handleRateLimit(): void {
    if (enforcedRate === null) {
      const burstRate = measureBurstRate();
      enforcedRate = Math.max(burstRate * INITIAL_BACKOFF_FACTOR, MIN_RATE);
    } else {
      enforcedRate = Math.max(enforcedRate * SUBSEQUENT_BACKOFF_FACTOR, MIN_RATE);
    }
  }

  async function waitForSlot(): Promise<void> {
    if (enforcedRate === null) return;
    const minDelay = 1000 / enforcedRate;
    const elapsed = Date.now() - lastRequestTime;
    if (elapsed >= minDelay) return;
    await new Promise<void>((resolve) => setTimeout(resolve, minDelay - elapsed));
  }

  async function execute<T>(fn: () => Promise<T>, requestKey?: string): Promise<T> {
    // In-flight deduplication
    if (requestKey) {
      const existing = inFlight.get(requestKey);
      if (existing) return existing as Promise<T>;
    }

    const doExecute = async (): Promise<T> => {
      while (true) {
        await waitForSlot();
        timestamps.push(Date.now());
        lastRequestTime = Date.now();

        try {
          return await fn();
        } catch (err) {
          if (isRateLimitError(err)) {
            handleRateLimit();
            await new Promise((r) => setTimeout(r, 1000 / (enforcedRate ?? 1)));
            continue;
          }
          throw err;
        }
      }
    };

    const promise = doExecute();

    if (requestKey) {
      inFlight.set(requestKey, promise);
      promise.finally(() => inFlight.delete(requestKey));
    }

    return promise;
  }

  return {
    key,
    execute,
    getCurrentRate: () => enforcedRate,
    destroy: () => {
      timestamps.length = 0;
      inFlight.clear();
    },
  };
}

// ---------------------------------------------------------------------------
// Bus registry
// ---------------------------------------------------------------------------

const busRegistry = new Map<string, RequestBus>();

/** Returns existing bus for the key or creates a new one. */
export function getOrCreateBus(key: string, options?: RequestBusOptions): RequestBus {
  const existing = busRegistry.get(key);
  if (existing) return existing;
  const bus = createRequestBus(key, options);
  busRegistry.set(key, bus);
  return bus;
}

/** Destroys a specific bus and removes it from the registry. */
export function destroyBus(key: string): void {
  const bus = busRegistry.get(key);
  if (bus) {
    bus.destroy();
    busRegistry.delete(key);
  }
}

/** Destroys all buses and clears the registry. */
export function destroyAllBuses(): void {
  for (const bus of busRegistry.values()) {
    bus.destroy();
  }
  busRegistry.clear();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/sdk && npx vitest run src/__tests__/request-bus.test.ts`
Expected: PASS — all 14 tests

- [ ] **Step 5: Commit**

```bash
git add packages/sdk/src/request-bus.ts packages/sdk/src/__tests__/request-bus.test.ts
git commit -m "feat(sdk): add generic RequestBus with adaptive rate limiting and deduplication"
```

---

### Task 2: Refactor ExplorerBus to use RequestBus

**Files:**
- Modify: `packages/sdk/src/explorer/bus.ts`
- Modify: `packages/sdk/src/explorer/types.ts`

- [ ] **Step 1: Add `busKey` to `ExplorerBusOptions`**

In `packages/sdk/src/explorer/types.ts`, update `ExplorerBusOptions`:

```typescript
export type ExplorerBusOptions = {
  readonly apiKey: string;
  readonly busKey?: string;        // key for RequestBus registry, defaults to URL domain
  readonly fetchFn?: typeof fetch;
};
```

- [ ] **Step 2: Rewrite `explorer/bus.ts`**

Replace the entire `createExplorerBus` function and the module-level registry. The rate limiting logic moves to `RequestBus`. What stays: URL construction, `apikey` injection, response parsing, network error retries.

```typescript
// packages/sdk/src/explorer/bus.ts
import type { ExplorerBus, ExplorerBusOptions } from './types.js';
import { parseExplorerResponse, ExplorerApiError, type ExplorerRawResponse } from './client.js';
import { getOrCreateBus as getOrCreateRequestBus, destroyAllBuses as destroyAllRequestBuses } from '../request-bus.js';

const MAX_RETRIES = 3;

/**
 * Creates an explorer API bus — a protocol-specific wrapper around the generic RequestBus.
 * Handles URL construction, API key injection, response parsing, and network retries.
 * Rate limiting is delegated to the underlying RequestBus.
 */
export function createExplorerBus(
  explorerApiUrl: string,
  options: ExplorerBusOptions,
): ExplorerBus {
  const { apiKey, fetchFn = globalThis.fetch } = options;
  const domain = new URL(explorerApiUrl).hostname;
  const busKey = options.busKey ?? domain;
  const baseUrl = explorerApiUrl;

  const bus = getOrCreateRequestBus(busKey, {
    isRateLimitError: (err) => err instanceof ExplorerApiError && err.isRateLimit,
  });

  async function request<T>(params: Record<string, string>): Promise<T> {
    return bus.execute(async () => {
      let lastError: unknown;

      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        const searchParams = new URLSearchParams({ ...params, apikey: apiKey });
        const url = `${baseUrl}?${searchParams.toString()}`;

        try {
          const response = await fetchFn(url);
          const data = (await response.json()) as ExplorerRawResponse;
          return parseExplorerResponse<T>(data);
        } catch (err) {
          if (err instanceof ExplorerApiError) throw err;
          lastError = err;
          if (attempt < MAX_RETRIES - 1) {
            await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
          }
        }
      }

      throw lastError;
    });
  }

  return {
    domain,
    request,
    getCurrentRate: () => bus.getCurrentRate(),
    destroy: () => bus.destroy(),
  };
}

// Re-export for convenience
export { ExplorerApiError } from './client.js';

// ---------------------------------------------------------------------------
// Explorer-specific registry (delegates to generic RequestBus registry)
// ---------------------------------------------------------------------------

const explorerBusCache = new Map<string, ExplorerBus>();

export function getOrCreateBus(explorerApiUrl: string, apiKey: string): ExplorerBus {
  const domain = new URL(explorerApiUrl).hostname;
  const existing = explorerBusCache.get(domain);
  if (existing) return existing;
  const bus = createExplorerBus(explorerApiUrl, { apiKey });
  explorerBusCache.set(domain, bus);
  return bus;
}

export function destroyAllBuses(): void {
  for (const bus of explorerBusCache.values()) {
    bus.destroy();
  }
  explorerBusCache.clear();
}
```

- [ ] **Step 3: Build and run explorer tests**

Run: `cd packages/sdk && npx tsc --noEmit`
Expected: Clean

Run: `cd packages/sdk && npx vitest run src/__tests__/explorer/`
Expected: All existing explorer tests pass — the refactor is internal

- [ ] **Step 4: Commit**

```bash
git add packages/sdk/src/explorer/bus.ts packages/sdk/src/explorer/types.ts
git commit -m "refactor(sdk): rewrite ExplorerBus as thin wrapper over generic RequestBus"
```

---

### Task 3: Refactor TrueBlocksClient to use RequestBus

**Files:**
- Modify: `packages/sdk/src/trueblocks/client.ts`

- [ ] **Step 1: Rewrite `trueblocks/client.ts`**

Replace raw `fetchFn` usage with `getOrCreateBus(busKey).execute()`:

```typescript
// packages/sdk/src/trueblocks/client.ts
import type { TrueBlocksClient, TrueBlocksClientOptions } from './types.js';
import { getOrCreateBus } from '../request-bus.js';

const DEFAULT_PAGE_SIZE = 1000;

/**
 * Thrown when TrueBlocks returns an HTTP error (non-2xx status).
 */
export class TrueBlocksApiError extends Error {
  constructor(
    readonly statusCode: number,
    readonly statusText: string,
  ) {
    super(`TrueBlocks API error: ${statusCode} ${statusText}`);
    this.name = 'TrueBlocksApiError';
  }
}

type TrueBlocksResponse = {
  readonly data?: unknown[] | null;
  readonly errors?: string[];
};

/**
 * Creates a TrueBlocks API client.
 * Routes all requests through a generic RequestBus for optional rate limiting.
 */
export function createTrueBlocksClient(options: TrueBlocksClientOptions): TrueBlocksClient {
  const { baseUrl, busKey, fetchFn = globalThis.fetch } = options;

  const bus = getOrCreateBus(busKey);

  async function request<T>(endpoint: string, params: Record<string, string>): Promise<T[]> {
    return bus.execute(async () => {
      const searchParams = new URLSearchParams(params);
      const url = `${baseUrl}${endpoint}?${searchParams.toString()}`;

      const response = await fetchFn(url);
      if (!response.ok) {
        throw new TrueBlocksApiError(response.status, response.statusText);
      }

      const body = (await response.json()) as TrueBlocksResponse;
      return (body.data ?? []) as T[];
    });
  }

  async function* requestPaginated<T>(
    endpoint: string,
    params: Record<string, string>,
    pageSize = DEFAULT_PAGE_SIZE,
  ): AsyncGenerator<T[]> {
    let firstRecord = 0;

    while (true) {
      const page = await request<T>(endpoint, {
        ...params,
        firstRecord: firstRecord.toString(),
        maxRecords: pageSize.toString(),
      });

      if (page.length === 0) break;
      yield page;
      if (page.length < pageSize) break;
      firstRecord += pageSize;
    }
  }

  return {
    baseUrl,
    request,
    requestPaginated,
    destroy: () => bus.destroy(),
  };
}
```

- [ ] **Step 2: Build and run TrueBlocks tests**

Run: `cd packages/sdk && npx tsc --noEmit`
Expected: Clean

Run: `cd packages/sdk && npx vitest run src/__tests__/trueblocks/`
Expected: All existing TrueBlocks tests pass (skipped integration tests remain skipped)

- [ ] **Step 3: Commit**

```bash
git add packages/sdk/src/trueblocks/client.ts
git commit -m "refactor(sdk): route TrueBlocks requests through generic RequestBus"
```

---

### Task 4: SDK exports + final verification

**Files:**
- Modify: `packages/sdk/src/index.ts`

- [ ] **Step 1: Add RequestBus exports to SDK barrel**

Add to `packages/sdk/src/index.ts`:

```typescript
// RequestBus
export {
  createRequestBus,
  getOrCreateBus as getOrCreateRequestBus,
  destroyBus,
  destroyAllBuses as destroyAllRequestBuses,
} from './request-bus.js';
export type { RequestBus, RequestBusOptions } from './request-bus.js';
```

Note: `getOrCreateBus` is exported as `getOrCreateRequestBus` to avoid conflict with the explorer-specific `getOrCreateBus` (which is already exported and takes different params).

- [ ] **Step 2: Build all packages**

Run: `cd packages/sdk && npx tsc --noEmit && cd ../tui && npx tsc --noEmit && cd ../web && npx tsc --noEmit`
Expected: All clean

- [ ] **Step 3: Run full SDK tests**

Run: `cd packages/sdk && npx vitest run`
Expected: All pass (generic bus + explorer + TrueBlocks + everything else)

- [ ] **Step 4: Run TUI + web tests**

Run: `cd packages/tui && npx vitest run && cd ../web && npx vitest run`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add packages/sdk/src/index.ts
git commit -m "feat(sdk): export generic RequestBus from SDK barrel"
```

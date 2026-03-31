# Explorer API Scanner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Etherscan-compatible block explorer API scanning to `@titrate/sdk` — token transfers, transactions, internal transactions, and balance queries — with an adaptive per-domain rate-limited request bus and block range bisection for the 10k result cap.

**Architecture:** A new `packages/sdk/src/explorer/` module with 7 files. The `ExplorerBus` is the central primitive — a per-domain HTTP queue that starts unthrottled and learns rate limits from 429 responses. Scanner functions are async generators that yield pages of typed results, using block range bisection when results hit the 10,000-row Etherscan cap. Balance functions are direct async calls. The module integrates into the existing pipeline as a new `'explorer-scan'` source type and `'explorer-balance'` filter type.

**Tech Stack:** TypeScript, Viem (Address/Hex types), Vitest (mocked fetch)

---

## File Structure

### New files (`packages/sdk/src/explorer/`)

| File | Responsibility |
|------|----------------|
| `types.ts` | All explorer-specific types (TokenTransfer, Transaction, etc.) |
| `client.ts` | `ExplorerApiError` class, response parsing, rate limit detection |
| `bus.ts` | Per-domain adaptive rate-limited HTTP queue, bus registry |
| `titrate.ts` | Block range bisection logic for 10k result cap |
| `transfers.ts` | `scanTokenTransfers` async generator |
| `transactions.ts` | `scanTransactions` + `scanInternalTransactions` async generators |
| `balances.ts` | `getTokenBalances` + `getNativeBalances` |
| `index.ts` | Barrel exports |

### New test files (`packages/sdk/src/__tests__/explorer/`)

| File | Covers |
|------|--------|
| `client.test.ts` | Response parsing, error detection, rate limit classification |
| `bus.test.ts` | Adaptive rate limiting, 429 handling, domain keying, registry |
| `titrate.test.ts` | Bisection decisions, range learning, growth, depth limit |
| `transfers.test.ts` | Token transfer scanning with mocked bus |
| `transactions.test.ts` | Normal + internal transaction scanning |
| `balances.test.ts` | Token and native balance queries |

### Modified files

| File | Change |
|------|--------|
| `packages/sdk/src/types.ts` | Add `'explorer-scan'` to `SourceType`, `'explorer-balance'` to `FilterType` |
| `packages/sdk/src/pipeline/sources.ts` | Add `explorerScanSource` case |
| `packages/sdk/src/pipeline/filters.ts` | Add `explorerBalanceFilter` case |
| `packages/sdk/src/index.ts` | Add explorer barrel exports |

---

### Task 1: Explorer types + client (response parsing)

**Files:**
- Create: `packages/sdk/src/explorer/types.ts`
- Create: `packages/sdk/src/explorer/client.ts`
- Create: `packages/sdk/src/__tests__/explorer/client.test.ts`

- [ ] **Step 1: Create types file**

```typescript
// packages/sdk/src/explorer/types.ts
import type { Address, Hex } from 'viem';
import type { ProgressCallback } from '../types.js';

// --- Result types ---

export type TokenTransfer = {
  readonly from: Address;
  readonly to: Address;
  readonly value: bigint;
  readonly tokenSymbol: string;
  readonly tokenName: string;
  readonly tokenDecimals: number;
  readonly hash: Hex;
  readonly blockNumber: bigint;
  readonly timestamp: number;
};

export type Transaction = {
  readonly from: Address;
  readonly to: Address | null;
  readonly value: bigint;
  readonly hash: Hex;
  readonly blockNumber: bigint;
  readonly timestamp: number;
  readonly isError: boolean;
  readonly gasUsed: bigint;
};

export type InternalTransaction = {
  readonly from: Address;
  readonly to: Address;
  readonly value: bigint;
  readonly hash: Hex;
  readonly blockNumber: bigint;
  readonly type: string;
};

export type TokenBalance = {
  readonly address: Address;
  readonly balance: bigint;
};

// --- Bus types ---

export type ExplorerBusOptions = {
  readonly apiKey: string;
  readonly fetchFn?: typeof fetch;
};

export type ExplorerBus = {
  readonly domain: string;
  request<T>(params: Record<string, string>): Promise<T>;
  getCurrentRate(): number | null;
  destroy(): void;
};

// --- Scanner option types ---

export type ScanTokenTransfersOptions = {
  readonly bus: ExplorerBus;
  readonly tokenAddress: Address;
  readonly startBlock?: bigint;
  readonly endBlock?: bigint;
  readonly onProgress?: ProgressCallback;
};

export type ScanTransactionsOptions = {
  readonly bus: ExplorerBus;
  readonly address: Address;
  readonly startBlock?: bigint;
  readonly endBlock?: bigint;
  readonly onProgress?: ProgressCallback;
};

export type GetTokenBalancesOptions = {
  readonly bus: ExplorerBus;
  readonly tokenAddress: Address;
  readonly addresses: readonly Address[];
  readonly onProgress?: ProgressCallback;
};

export type GetNativeBalancesOptions = {
  readonly bus: ExplorerBus;
  readonly addresses: readonly Address[];
  readonly onProgress?: ProgressCallback;
};

// --- Titration types ---

export type ExplorerTitrateState = {
  learnedRange: bigint | null;
};
```

- [ ] **Step 2: Write failing client tests**

```typescript
// packages/sdk/src/__tests__/explorer/client.test.ts
import { describe, it, expect } from 'vitest';
import {
  parseExplorerResponse,
  isRateLimitResult,
  ExplorerApiError,
} from '../../explorer/client.js';

describe('parseExplorerResponse', () => {
  it('returns result array on success', () => {
    const data = { status: '1', message: 'OK', result: [{ a: 1 }] };
    expect(parseExplorerResponse(data)).toEqual([{ a: 1 }]);
  });

  it('returns result string on success', () => {
    const data = { status: '1', message: 'OK', result: '12345' };
    expect(parseExplorerResponse(data)).toBe('12345');
  });

  it('throws ExplorerApiError on status 0 with non-rate-limit error', () => {
    const data = { status: '0', message: 'NOTOK', result: 'Invalid API key' };
    expect(() => parseExplorerResponse(data)).toThrow(ExplorerApiError);
    try {
      parseExplorerResponse(data);
    } catch (e) {
      const err = e as ExplorerApiError;
      expect(err.isRateLimit).toBe(false);
      expect(err.explorerMessage).toBe('NOTOK');
    }
  });

  it('throws ExplorerApiError with isRateLimit=true on rate limit', () => {
    const data = { status: '0', message: 'NOTOK', result: 'Max rate limit reached' };
    expect(() => parseExplorerResponse(data)).toThrow(ExplorerApiError);
    try {
      parseExplorerResponse(data);
    } catch (e) {
      expect((e as ExplorerApiError).isRateLimit).toBe(true);
    }
  });

  it('handles "No transactions found" as empty array', () => {
    const data = { status: '0', message: 'No transactions found', result: [] };
    expect(parseExplorerResponse(data)).toEqual([]);
  });
});

describe('isRateLimitResult', () => {
  it('detects "Max rate limit reached"', () => {
    expect(isRateLimitResult('Max rate limit reached')).toBe(true);
  });

  it('detects "rate limit" case-insensitively', () => {
    expect(isRateLimitResult('Rate Limit exceeded')).toBe(true);
  });

  it('returns false for other errors', () => {
    expect(isRateLimitResult('Invalid API key')).toBe(false);
  });

  it('returns false for non-string input', () => {
    expect(isRateLimitResult(undefined)).toBe(false);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd packages/sdk && npx vitest run src/__tests__/explorer/client.test.ts`
Expected: FAIL — module not found

- [ ] **Step 4: Implement client**

```typescript
// packages/sdk/src/explorer/client.ts

export type ExplorerRawResponse = {
  readonly status: string;
  readonly message: string;
  readonly result: unknown;
};

/**
 * Thrown when the explorer API returns a non-success response.
 * `isRateLimit` indicates whether this was a rate-limiting error (429 equivalent).
 */
export class ExplorerApiError extends Error {
  constructor(
    readonly explorerMessage: string,
    readonly explorerStatus: string,
    readonly isRateLimit: boolean,
  ) {
    super(`Explorer API error: ${explorerMessage}${isRateLimit ? ' (rate limited)' : ''}`);
    this.name = 'ExplorerApiError';
  }
}

/**
 * Returns true if the result string from an error response indicates rate limiting.
 */
export function isRateLimitResult(result: unknown): boolean {
  if (typeof result !== 'string') return false;
  return /rate limit|max rate/i.test(result);
}

const NO_RESULTS_MESSAGES = ['no transactions found', 'no records found'];

/**
 * Parses an Etherscan-compatible API response.
 * Returns the `result` field on success.
 * Throws ExplorerApiError on failure, with `isRateLimit` set appropriately.
 * Treats "No transactions found" as an empty array (not an error).
 */
export function parseExplorerResponse<T>(data: ExplorerRawResponse): T {
  if (data.status === '1') {
    return data.result as T;
  }

  // "No transactions found" is status 0 but not an error
  if (NO_RESULTS_MESSAGES.includes(data.message.toLowerCase())) {
    return (Array.isArray(data.result) ? data.result : []) as T;
  }

  const resultStr = typeof data.result === 'string' ? data.result : '';
  throw new ExplorerApiError(
    data.message,
    data.status,
    isRateLimitResult(resultStr),
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd packages/sdk && npx vitest run src/__tests__/explorer/client.test.ts`
Expected: PASS — all 7 tests

- [ ] **Step 6: Commit**

```bash
git add packages/sdk/src/explorer/types.ts packages/sdk/src/explorer/client.ts \
  packages/sdk/src/__tests__/explorer/client.test.ts
git commit -m "feat(sdk): add explorer types and API response parser"
```

---

### Task 2: Explorer Bus (adaptive rate limiting + registry)

**Files:**
- Create: `packages/sdk/src/explorer/bus.ts`
- Create: `packages/sdk/src/__tests__/explorer/bus.test.ts`

- [ ] **Step 1: Write failing bus tests**

```typescript
// packages/sdk/src/__tests__/explorer/bus.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createExplorerBus, getOrCreateBus, destroyAllBuses } from '../../explorer/bus.js';

function mockFetch(responses: Array<{ status: string; message: string; result: unknown }>): typeof fetch {
  let callIndex = 0;
  return vi.fn().mockImplementation(() => {
    const body = responses[Math.min(callIndex++, responses.length - 1)];
    return Promise.resolve({
      json: () => Promise.resolve(body),
    });
  }) as unknown as typeof fetch;
}

describe('createExplorerBus', () => {
  it('extracts domain from URL', () => {
    const bus = createExplorerBus('https://api.etherscan.io/api', {
      apiKey: 'test',
      fetchFn: mockFetch([]),
    });
    expect(bus.domain).toBe('api.etherscan.io');
    bus.destroy();
  });

  it('starts unthrottled', () => {
    const bus = createExplorerBus('https://api.etherscan.io/api', {
      apiKey: 'test',
      fetchFn: mockFetch([]),
    });
    expect(bus.getCurrentRate()).toBeNull();
    bus.destroy();
  });

  it('returns parsed result on successful request', async () => {
    const fetchFn = mockFetch([
      { status: '1', message: 'OK', result: [{ blockNumber: '100' }] },
    ]);
    const bus = createExplorerBus('https://api.etherscan.io/api', { apiKey: 'key', fetchFn });
    const result = await bus.request<unknown[]>({ module: 'account', action: 'txlist' });
    expect(result).toEqual([{ blockNumber: '100' }]);
    bus.destroy();
  });

  it('includes apikey in query string', async () => {
    const fetchFn = mockFetch([
      { status: '1', message: 'OK', result: [] },
    ]);
    const bus = createExplorerBus('https://api.etherscan.io/api', { apiKey: 'MY_KEY', fetchFn });
    await bus.request({ module: 'test' });
    expect(fetchFn).toHaveBeenCalledWith(expect.stringContaining('apikey=MY_KEY'));
    bus.destroy();
  });

  it('sets rate to 80% of burst on first 429', async () => {
    const fetchFn = mockFetch([
      { status: '0', message: 'NOTOK', result: 'Max rate limit reached' },
      { status: '1', message: 'OK', result: [] },
    ]);
    const bus = createExplorerBus('https://api.etherscan.io/api', { apiKey: 'key', fetchFn });
    await bus.request({ module: 'test' });
    const rate = bus.getCurrentRate();
    expect(rate).not.toBeNull();
    expect(rate!).toBeGreaterThan(0);
    bus.destroy();
  });

  it('reduces rate by 5% on subsequent 429s', async () => {
    const responses = [
      { status: '0', message: 'NOTOK', result: 'Max rate limit reached' },
      { status: '1', message: 'OK', result: [] },
      { status: '0', message: 'NOTOK', result: 'Max rate limit reached' },
      { status: '1', message: 'OK', result: [] },
    ];
    const bus = createExplorerBus('https://api.etherscan.io/api', {
      apiKey: 'key',
      fetchFn: mockFetch(responses),
    });

    await bus.request({ module: 'test' });
    const firstRate = bus.getCurrentRate()!;

    await bus.request({ module: 'test' });
    const secondRate = bus.getCurrentRate()!;

    expect(secondRate).toBeLessThan(firstRate);
    expect(secondRate).toBeCloseTo(firstRate * 0.95, 1);
    bus.destroy();
  });

  it('never drops below 1 req/sec', async () => {
    // Force many 429s to push rate down
    const responses: Array<{ status: string; message: string; result: unknown }> = [];
    for (let i = 0; i < 100; i++) {
      responses.push({ status: '0', message: 'NOTOK', result: 'Max rate limit reached' });
    }
    responses.push({ status: '1', message: 'OK', result: [] });

    const bus = createExplorerBus('https://api.etherscan.io/api', {
      apiKey: 'key',
      fetchFn: mockFetch(responses),
    });

    // Fire many requests to trigger many 429s
    for (let i = 0; i < 50; i++) {
      await bus.request({ module: 'test' }).catch(() => {});
    }

    const rate = bus.getCurrentRate();
    expect(rate).toBeGreaterThanOrEqual(1);
    bus.destroy();
  });

  it('throws ExplorerApiError on non-rate-limit API errors', async () => {
    const bus = createExplorerBus('https://api.etherscan.io/api', {
      apiKey: 'key',
      fetchFn: mockFetch([
        { status: '0', message: 'NOTOK', result: 'Invalid API key' },
      ]),
    });
    await expect(bus.request({ module: 'test' })).rejects.toThrow('Invalid API key');
    bus.destroy();
  });
});

describe('getOrCreateBus', () => {
  afterEach(() => destroyAllBuses());

  it('returns same bus for same domain', () => {
    const bus1 = getOrCreateBus('https://api.etherscan.io/api', 'key1');
    const bus2 = getOrCreateBus('https://api.etherscan.io/api', 'key1');
    expect(bus1).toBe(bus2);
  });

  it('returns different buses for different domains', () => {
    const bus1 = getOrCreateBus('https://api.etherscan.io/api', 'key1');
    const bus2 = getOrCreateBus('https://api.basescan.org/api', 'key2');
    expect(bus1).not.toBe(bus2);
    expect(bus1.domain).toBe('api.etherscan.io');
    expect(bus2.domain).toBe('api.basescan.org');
  });
});

describe('destroyAllBuses', () => {
  it('clears the registry', () => {
    const bus1 = getOrCreateBus('https://api.etherscan.io/api', 'key1');
    destroyAllBuses();
    const bus2 = getOrCreateBus('https://api.etherscan.io/api', 'key1');
    expect(bus1).not.toBe(bus2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/sdk && npx vitest run src/__tests__/explorer/bus.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement bus**

```typescript
// packages/sdk/src/explorer/bus.ts
import type { ExplorerBus, ExplorerBusOptions } from './types.js';
import { parseExplorerResponse, ExplorerApiError, type ExplorerRawResponse } from './client.js';

const WINDOW_MS = 5_000;
const MIN_RATE = 1;
const INITIAL_BACKOFF_FACTOR = 0.8;
const SUBSEQUENT_BACKOFF_FACTOR = 0.95;
const MAX_RETRIES = 3;

/**
 * Creates an explorer API bus — a per-domain HTTP queue with adaptive rate limiting.
 * Starts unthrottled. Learns rate limits from 429 responses:
 * - First 429: set limit to 80% of measured burst rate
 * - Each subsequent 429: reduce by 5%
 * - Floor: 1 request/second
 */
export function createExplorerBus(
  explorerApiUrl: string,
  options: ExplorerBusOptions,
): ExplorerBus {
  const { apiKey, fetchFn = globalThis.fetch } = options;
  const domain = new URL(explorerApiUrl).hostname;
  const baseUrl = explorerApiUrl;

  const timestamps: number[] = [];
  let enforcedRate: number | null = null;
  let lastRequestTime = 0;

  function pruneTimestamps(): void {
    const cutoff = Date.now() - WINDOW_MS;
    while (timestamps.length > 0 && timestamps[0] < cutoff) {
      timestamps.shift();
    }
  }

  function measureBurstRate(): number {
    pruneTimestamps();
    if (timestamps.length < 2) return timestamps.length;
    const windowStart = timestamps[0];
    const windowDuration = (Date.now() - windowStart) / 1000;
    if (windowDuration < 0.1) return timestamps.length;
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

  async function request<T>(params: Record<string, string>): Promise<T> {
    let lastError: unknown;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      await waitForSlot();

      const searchParams = new URLSearchParams({ ...params, apikey: apiKey });
      const url = `${baseUrl}?${searchParams.toString()}`;

      timestamps.push(Date.now());
      lastRequestTime = Date.now();

      try {
        const response = await fetchFn(url);
        const data = (await response.json()) as ExplorerRawResponse;

        try {
          return parseExplorerResponse<T>(data);
        } catch (err) {
          if (err instanceof ExplorerApiError && err.isRateLimit) {
            handleRateLimit();
            await new Promise((r) => setTimeout(r, 1000 / (enforcedRate ?? 1)));
            continue;
          }
          throw err;
        }
      } catch (err) {
        if (err instanceof ExplorerApiError) throw err;
        lastError = err;
        if (attempt < MAX_RETRIES - 1) {
          await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
        }
      }
    }

    throw lastError;
  }

  return {
    domain,
    request,
    getCurrentRate: () => enforcedRate,
    destroy: () => {
      timestamps.length = 0;
    },
  };
}

// ---------------------------------------------------------------------------
// Bus registry — one bus per domain
// ---------------------------------------------------------------------------

const busRegistry = new Map<string, ExplorerBus>();

/**
 * Returns an existing bus for the domain or creates a new one.
 * All callers targeting the same explorer domain share one bus.
 */
export function getOrCreateBus(explorerApiUrl: string, apiKey: string): ExplorerBus {
  const domain = new URL(explorerApiUrl).hostname;
  const existing = busRegistry.get(domain);
  if (existing) return existing;

  const bus = createExplorerBus(explorerApiUrl, { apiKey });
  busRegistry.set(domain, bus);
  return bus;
}

/** Destroys all buses in the registry and clears it. */
export function destroyAllBuses(): void {
  for (const bus of busRegistry.values()) {
    bus.destroy();
  }
  busRegistry.clear();
}

// Re-export for convenience
export { ExplorerApiError } from './client.js';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/sdk && npx vitest run src/__tests__/explorer/bus.test.ts`
Expected: PASS — all tests. Note: the rate-limit timing tests may need adjustment if `measureBurstRate` returns unexpected values due to test speed. If a test fails, check the burst rate calculation and adjust the mock sequence.

- [ ] **Step 5: Commit**

```bash
git add packages/sdk/src/explorer/bus.ts packages/sdk/src/__tests__/explorer/bus.test.ts
git commit -m "feat(sdk): add explorer bus with adaptive rate limiting"
```

---

### Task 3: Explorer Titration (block range bisection)

**Files:**
- Create: `packages/sdk/src/explorer/titrate.ts`
- Create: `packages/sdk/src/__tests__/explorer/titrate.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// packages/sdk/src/__tests__/explorer/titrate.test.ts
import { describe, it, expect } from 'vitest';
import {
  createExplorerTitrateState,
  shouldBisect,
  bisectRange,
  updateLearnedRange,
  RESULT_CAP,
} from '../../explorer/titrate.js';

describe('shouldBisect', () => {
  it('returns true when result count equals the cap', () => {
    expect(shouldBisect(RESULT_CAP)).toBe(true);
  });

  it('returns false when result count is below the cap', () => {
    expect(shouldBisect(9_999)).toBe(false);
  });

  it('returns false for zero results', () => {
    expect(shouldBisect(0)).toBe(false);
  });
});

describe('bisectRange', () => {
  it('splits range into two halves', () => {
    const [left, right] = bisectRange(0n, 1000n);
    expect(left).toEqual([0n, 500n]);
    expect(right).toEqual([501n, 1000n]);
  });

  it('handles odd ranges', () => {
    const [left, right] = bisectRange(0n, 999n);
    expect(left).toEqual([0n, 499n]);
    expect(right).toEqual([500n, 999n]);
  });

  it('handles single-block range', () => {
    const [left, right] = bisectRange(100n, 100n);
    expect(left).toEqual([100n, 100n]);
    expect(right).toEqual([101n, 100n]); // empty right range (start > end)
  });
});

describe('createExplorerTitrateState', () => {
  it('starts with no learned range', () => {
    const state = createExplorerTitrateState();
    expect(state.learnedRange).toBeNull();
  });
});

describe('updateLearnedRange', () => {
  it('learns the range size on first successful query', () => {
    const state = createExplorerTitrateState();
    updateLearnedRange(state, 5000n, 3000);
    expect(state.learnedRange).toBe(5000n);
  });

  it('grows range by 25% when results are under 5000', () => {
    const state = createExplorerTitrateState();
    state.learnedRange = 1000n;
    updateLearnedRange(state, 1000n, 2000);
    expect(state.learnedRange).toBe(1250n);
  });

  it('does not grow when results are 5000 or more', () => {
    const state = createExplorerTitrateState();
    state.learnedRange = 1000n;
    updateLearnedRange(state, 1000n, 7000);
    expect(state.learnedRange).toBe(1000n);
  });

  it('shrinks learned range when bisection was needed', () => {
    const state = createExplorerTitrateState();
    state.learnedRange = 10000n;
    // A successful query after bisection with a smaller range
    updateLearnedRange(state, 5000n, 8000);
    expect(state.learnedRange).toBe(5000n);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/sdk && npx vitest run src/__tests__/explorer/titrate.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement titration**

```typescript
// packages/sdk/src/explorer/titrate.ts
import type { ExplorerTitrateState } from './types.js';

/** Etherscan caps results at this number. */
export const RESULT_CAP = 10_000;

const GROWTH_THRESHOLD = 5_000;
const GROWTH_FACTOR_NUM = 5n;
const GROWTH_FACTOR_DEN = 4n;
const MAX_BISECTION_DEPTH = 20;

/** Creates initial titration state with no learned range. */
export function createExplorerTitrateState(): ExplorerTitrateState {
  return { learnedRange: null };
}

/** Returns true if the result count indicates truncation (hit the 10k cap). */
export function shouldBisect(resultCount: number): boolean {
  return resultCount >= RESULT_CAP;
}

/**
 * Splits a block range into two halves for bisection.
 * Returns [[start, mid], [mid+1, end]].
 */
export function bisectRange(
  start: bigint,
  end: bigint,
): [[bigint, bigint], [bigint, bigint]] {
  const mid = start + (end - start) / 2n;
  return [
    [start, mid],
    [mid + 1n, end],
  ];
}

/**
 * Updates the learned range based on query results.
 * - Records the successful range size for future queries.
 * - Grows by 25% if results are well under the cap (< 5000).
 * - Shrinks to the actual range if it was smaller than the current learned range.
 */
export function updateLearnedRange(
  state: ExplorerTitrateState,
  rangeSize: bigint,
  resultCount: number,
): void {
  // Always adopt the actual range that succeeded
  if (state.learnedRange === null || rangeSize < state.learnedRange) {
    state.learnedRange = rangeSize;
  }

  // Grow if well under the cap
  if (resultCount < GROWTH_THRESHOLD && state.learnedRange !== null) {
    state.learnedRange = (state.learnedRange * GROWTH_FACTOR_NUM) / GROWTH_FACTOR_DEN;
  }
}

/** Returns the max bisection depth to prevent infinite recursion. */
export function getMaxBisectionDepth(): number {
  return MAX_BISECTION_DEPTH;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/sdk && npx vitest run src/__tests__/explorer/titrate.test.ts`
Expected: PASS — all 9 tests

- [ ] **Step 5: Commit**

```bash
git add packages/sdk/src/explorer/titrate.ts packages/sdk/src/__tests__/explorer/titrate.test.ts
git commit -m "feat(sdk): add explorer block range bisection for 10k result cap"
```

---

### Task 4: Token transfer scanner

**Files:**
- Create: `packages/sdk/src/explorer/transfers.ts`
- Create: `packages/sdk/src/__tests__/explorer/transfers.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// packages/sdk/src/__tests__/explorer/transfers.test.ts
import { describe, it, expect, vi } from 'vitest';
import type { ExplorerBus } from '../../explorer/types.js';
import { scanTokenTransfers } from '../../explorer/transfers.js';
import { RESULT_CAP } from '../../explorer/titrate.js';

function createMockBus(responses: unknown[][]): ExplorerBus {
  let callIndex = 0;
  return {
    domain: 'api.etherscan.io',
    request: vi.fn().mockImplementation(() => {
      return Promise.resolve(responses[Math.min(callIndex++, responses.length - 1)]);
    }),
    getCurrentRate: () => null,
    destroy: () => {},
  };
}

function makeRawTransfer(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    blockNumber: '19000000',
    timeStamp: '1700000000',
    hash: '0xabc123',
    from: '0x1111111111111111111111111111111111111111',
    to: '0x2222222222222222222222222222222222222222',
    value: '1000000',
    tokenName: 'USD Coin',
    tokenSymbol: 'USDC',
    tokenDecimal: '6',
    ...overrides,
  };
}

describe('scanTokenTransfers', () => {
  it('yields parsed token transfers', async () => {
    const bus = createMockBus([[makeRawTransfer()]]);
    const results: unknown[][] = [];
    for await (const batch of scanTokenTransfers({
      bus,
      tokenAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as `0x${string}`,
    })) {
      results.push(batch);
    }
    expect(results).toHaveLength(1);
    expect(results[0][0]).toMatchObject({
      from: '0x1111111111111111111111111111111111111111',
      to: '0x2222222222222222222222222222222222222222',
      value: 1000000n,
      tokenSymbol: 'USDC',
      tokenDecimals: 6,
      blockNumber: 19000000n,
    });
  });

  it('yields empty when no transfers found', async () => {
    const bus = createMockBus([[]]);
    const results: unknown[][] = [];
    for await (const batch of scanTokenTransfers({
      bus,
      tokenAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as `0x${string}`,
    })) {
      results.push(batch);
    }
    expect(results).toHaveLength(0);
  });

  it('bisects when result count hits the cap', async () => {
    // First call: returns 10k results (triggers bisection)
    // Left half: returns 6k results (OK)
    // Right half: returns 4k results (OK)
    const fullPage = Array.from({ length: RESULT_CAP }, (_, i) =>
      makeRawTransfer({ blockNumber: String(i), hash: `0x${i.toString(16).padStart(64, '0')}` }),
    );
    const leftHalf = Array.from({ length: 6000 }, (_, i) =>
      makeRawTransfer({ blockNumber: String(i), hash: `0x${i.toString(16).padStart(64, '0')}` }),
    );
    const rightHalf = Array.from({ length: 4000 }, (_, i) =>
      makeRawTransfer({ blockNumber: String(5000 + i), hash: `0x${(5000 + i).toString(16).padStart(64, '0')}` }),
    );

    const bus = createMockBus([fullPage, leftHalf, rightHalf]);
    let totalTransfers = 0;
    for await (const batch of scanTokenTransfers({
      bus,
      tokenAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as `0x${string}`,
      startBlock: 0n,
      endBlock: 10000n,
    })) {
      totalTransfers += batch.length;
    }
    expect(totalTransfers).toBe(10000);
    expect(bus.request).toHaveBeenCalledTimes(3);
  });

  it('emits progress events', async () => {
    const bus = createMockBus([[makeRawTransfer()]]);
    const events: unknown[] = [];
    for await (const _ of scanTokenTransfers({
      bus,
      tokenAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as `0x${string}`,
      startBlock: 0n,
      endBlock: 1000n,
      onProgress: (e) => events.push(e),
    })) {
      // consume
    }
    expect(events.length).toBeGreaterThan(0);
    expect(events[0]).toMatchObject({ type: 'scan' });
  });

  it('passes startBlock and endBlock to API params', async () => {
    const bus = createMockBus([[]]);
    for await (const _ of scanTokenTransfers({
      bus,
      tokenAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as `0x${string}`,
      startBlock: 100n,
      endBlock: 200n,
    })) {
      // consume
    }
    expect(bus.request).toHaveBeenCalledWith(
      expect.objectContaining({ startblock: '100', endblock: '200' }),
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/sdk && npx vitest run src/__tests__/explorer/transfers.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement token transfer scanner**

```typescript
// packages/sdk/src/explorer/transfers.ts
import type { Address, Hex } from 'viem';
import type { ScanTokenTransfersOptions, TokenTransfer, ExplorerBus } from './types.js';
import {
  createExplorerTitrateState,
  shouldBisect,
  bisectRange,
  updateLearnedRange,
  getMaxBisectionDepth,
} from './titrate.js';

type RawTokenTransfer = {
  blockNumber: string;
  timeStamp: string;
  hash: string;
  from: string;
  to: string;
  value: string;
  tokenName: string;
  tokenSymbol: string;
  tokenDecimal: string;
};

function parseTokenTransfer(raw: RawTokenTransfer): TokenTransfer {
  return {
    from: raw.from.toLowerCase() as Address,
    to: raw.to.toLowerCase() as Address,
    value: BigInt(raw.value),
    tokenSymbol: raw.tokenSymbol,
    tokenName: raw.tokenName,
    tokenDecimals: Number(raw.tokenDecimal),
    hash: raw.hash as Hex,
    blockNumber: BigInt(raw.blockNumber),
    timestamp: Number(raw.timeStamp),
  };
}

async function fetchTransferRange(
  bus: ExplorerBus,
  tokenAddress: Address,
  startBlock: bigint,
  endBlock: bigint,
): Promise<RawTokenTransfer[]> {
  return bus.request<RawTokenTransfer[]>({
    module: 'account',
    action: 'tokentx',
    contractaddress: tokenAddress,
    startblock: startBlock.toString(),
    endblock: endBlock.toString(),
    sort: 'asc',
  });
}

/**
 * Scans ERC-20 token transfer events via an Etherscan-compatible API.
 * Uses block range bisection when results hit the 10,000-row cap.
 * Yields pages of parsed TokenTransfer objects.
 */
export async function* scanTokenTransfers(
  options: ScanTokenTransfersOptions,
): AsyncGenerator<TokenTransfer[]> {
  const {
    bus,
    tokenAddress,
    startBlock = 0n,
    endBlock = 99_999_999n,
    onProgress,
  } = options;

  const state = createExplorerTitrateState();
  let addressesFound = 0;

  async function* scanRange(
    from: bigint,
    to: bigint,
    depth: number,
  ): AsyncGenerator<TokenTransfer[]> {
    if (from > to) return;
    if (depth > getMaxBisectionDepth()) {
      throw new Error(`Explorer bisection depth exceeded (${depth}). Narrow the block range.`);
    }

    const raw = await fetchTransferRange(bus, tokenAddress, from, to);

    if (shouldBisect(raw.length)) {
      const [left, right] = bisectRange(from, to);
      yield* scanRange(left[0], left[1], depth + 1);
      yield* scanRange(right[0], right[1], depth + 1);
      return;
    }

    const rangeSize = to - from + 1n;
    updateLearnedRange(state, rangeSize, raw.length);

    if (raw.length > 0) {
      const parsed = raw.map(parseTokenTransfer);
      addressesFound += parsed.length;
      yield parsed;
    }

    onProgress?.({
      type: 'scan',
      currentBlock: to,
      endBlock,
      addressesFound,
    });
  }

  // Use learned range to chunk through the full range
  let cursor = startBlock;
  while (cursor <= endBlock) {
    const chunkEnd =
      state.learnedRange !== null
        ? (cursor + state.learnedRange - 1n > endBlock ? endBlock : cursor + state.learnedRange - 1n)
        : endBlock;

    yield* scanRange(cursor, chunkEnd, 0);
    cursor = chunkEnd + 1n;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/sdk && npx vitest run src/__tests__/explorer/transfers.test.ts`
Expected: PASS — all 5 tests

- [ ] **Step 5: Commit**

```bash
git add packages/sdk/src/explorer/transfers.ts packages/sdk/src/__tests__/explorer/transfers.test.ts
git commit -m "feat(sdk): add token transfer scanner via explorer API"
```

---

### Task 5: Transaction scanners (normal + internal)

**Files:**
- Create: `packages/sdk/src/explorer/transactions.ts`
- Create: `packages/sdk/src/__tests__/explorer/transactions.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// packages/sdk/src/__tests__/explorer/transactions.test.ts
import { describe, it, expect, vi } from 'vitest';
import type { ExplorerBus } from '../../explorer/types.js';
import { scanTransactions, scanInternalTransactions } from '../../explorer/transactions.js';

function createMockBus(responses: unknown[][]): ExplorerBus {
  let callIndex = 0;
  return {
    domain: 'api.etherscan.io',
    request: vi.fn().mockImplementation(() => {
      return Promise.resolve(responses[Math.min(callIndex++, responses.length - 1)]);
    }),
    getCurrentRate: () => null,
    destroy: () => {},
  };
}

describe('scanTransactions', () => {
  it('yields parsed transactions', async () => {
    const bus = createMockBus([[{
      blockNumber: '19000000',
      timeStamp: '1700000000',
      hash: '0xabc',
      from: '0x1111111111111111111111111111111111111111',
      to: '0x2222222222222222222222222222222222222222',
      value: '1000000000000000000',
      isError: '0',
      gasUsed: '21000',
    }]]);

    const results: unknown[][] = [];
    for await (const batch of scanTransactions({
      bus,
      address: '0x1111111111111111111111111111111111111111' as `0x${string}`,
    })) {
      results.push(batch);
    }
    expect(results).toHaveLength(1);
    expect(results[0][0]).toMatchObject({
      from: '0x1111111111111111111111111111111111111111',
      value: 1000000000000000000n,
      isError: false,
      gasUsed: 21000n,
    });
  });

  it('parses isError "1" as true', async () => {
    const bus = createMockBus([[{
      blockNumber: '100', timeStamp: '100', hash: '0x1',
      from: '0x1111111111111111111111111111111111111111',
      to: '0x2222222222222222222222222222222222222222',
      value: '0', isError: '1', gasUsed: '21000',
    }]]);

    for await (const batch of scanTransactions({
      bus,
      address: '0x1111111111111111111111111111111111111111' as `0x${string}`,
    })) {
      expect(batch[0]).toMatchObject({ isError: true });
    }
  });

  it('handles null to field (contract creation)', async () => {
    const bus = createMockBus([[{
      blockNumber: '100', timeStamp: '100', hash: '0x1',
      from: '0x1111111111111111111111111111111111111111',
      to: '',
      value: '0', isError: '0', gasUsed: '100000',
    }]]);

    for await (const batch of scanTransactions({
      bus,
      address: '0x1111111111111111111111111111111111111111' as `0x${string}`,
    })) {
      expect(batch[0]).toMatchObject({ to: null });
    }
  });

  it('uses txlist action', async () => {
    const bus = createMockBus([[]]);
    for await (const _ of scanTransactions({
      bus,
      address: '0x1111111111111111111111111111111111111111' as `0x${string}`,
    })) { /* consume */ }
    expect(bus.request).toHaveBeenCalledWith(expect.objectContaining({ action: 'txlist' }));
  });
});

describe('scanInternalTransactions', () => {
  it('yields parsed internal transactions', async () => {
    const bus = createMockBus([[{
      blockNumber: '19000000',
      timeStamp: '1700000000',
      hash: '0xdef',
      from: '0x1111111111111111111111111111111111111111',
      to: '0x2222222222222222222222222222222222222222',
      value: '500000000000000000',
      type: 'call',
    }]]);

    const results: unknown[][] = [];
    for await (const batch of scanInternalTransactions({
      bus,
      address: '0x1111111111111111111111111111111111111111' as `0x${string}`,
    })) {
      results.push(batch);
    }
    expect(results).toHaveLength(1);
    expect(results[0][0]).toMatchObject({
      value: 500000000000000000n,
      type: 'call',
    });
  });

  it('uses txlistinternal action', async () => {
    const bus = createMockBus([[]]);
    for await (const _ of scanInternalTransactions({
      bus,
      address: '0x1111111111111111111111111111111111111111' as `0x${string}`,
    })) { /* consume */ }
    expect(bus.request).toHaveBeenCalledWith(expect.objectContaining({ action: 'txlistinternal' }));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/sdk && npx vitest run src/__tests__/explorer/transactions.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement transaction scanners**

```typescript
// packages/sdk/src/explorer/transactions.ts
import type { Address, Hex } from 'viem';
import type { ScanTransactionsOptions, Transaction, InternalTransaction, ExplorerBus } from './types.js';
import {
  createExplorerTitrateState,
  shouldBisect,
  bisectRange,
  updateLearnedRange,
  getMaxBisectionDepth,
} from './titrate.js';

type RawTransaction = {
  blockNumber: string;
  timeStamp: string;
  hash: string;
  from: string;
  to: string;
  value: string;
  isError: string;
  gasUsed: string;
};

type RawInternalTransaction = {
  blockNumber: string;
  timeStamp: string;
  hash: string;
  from: string;
  to: string;
  value: string;
  type: string;
};

function parseTransaction(raw: RawTransaction): Transaction {
  return {
    from: raw.from.toLowerCase() as Address,
    to: raw.to ? (raw.to.toLowerCase() as Address) : null,
    value: BigInt(raw.value),
    hash: raw.hash as Hex,
    blockNumber: BigInt(raw.blockNumber),
    timestamp: Number(raw.timeStamp),
    isError: raw.isError === '1',
    gasUsed: BigInt(raw.gasUsed),
  };
}

function parseInternalTransaction(raw: RawInternalTransaction): InternalTransaction {
  return {
    from: raw.from.toLowerCase() as Address,
    to: raw.to.toLowerCase() as Address,
    value: BigInt(raw.value),
    hash: raw.hash as Hex,
    blockNumber: BigInt(raw.blockNumber),
    type: raw.type,
  };
}

async function* scanWithBisection<TRaw, TParsed>(
  bus: ExplorerBus,
  action: string,
  addressParam: Record<string, string>,
  startBlock: bigint,
  endBlock: bigint,
  parse: (raw: TRaw) => TParsed,
  onProgress?: ScanTransactionsOptions['onProgress'],
): AsyncGenerator<TParsed[]> {
  const state = createExplorerTitrateState();
  let itemsFound = 0;

  async function* scanRange(
    from: bigint,
    to: bigint,
    depth: number,
  ): AsyncGenerator<TParsed[]> {
    if (from > to) return;
    if (depth > getMaxBisectionDepth()) {
      throw new Error(`Explorer bisection depth exceeded (${depth}). Narrow the block range.`);
    }

    const raw = await bus.request<TRaw[]>({
      module: 'account',
      action,
      ...addressParam,
      startblock: from.toString(),
      endblock: to.toString(),
      sort: 'asc',
    });

    if (shouldBisect(raw.length)) {
      const [left, right] = bisectRange(from, to);
      yield* scanRange(left[0], left[1], depth + 1);
      yield* scanRange(right[0], right[1], depth + 1);
      return;
    }

    updateLearnedRange(state, to - from + 1n, raw.length);

    if (raw.length > 0) {
      const parsed = raw.map(parse);
      itemsFound += parsed.length;
      yield parsed;
    }

    onProgress?.({
      type: 'scan',
      currentBlock: to,
      endBlock,
      addressesFound: itemsFound,
    });
  }

  let cursor = startBlock;
  while (cursor <= endBlock) {
    const chunkEnd =
      state.learnedRange !== null
        ? (cursor + state.learnedRange - 1n > endBlock ? endBlock : cursor + state.learnedRange - 1n)
        : endBlock;
    yield* scanRange(cursor, chunkEnd, 0);
    cursor = chunkEnd + 1n;
  }
}

/**
 * Scans normal transactions for an address via an Etherscan-compatible API.
 * Uses block range bisection when results hit the 10,000-row cap.
 */
export async function* scanTransactions(
  options: ScanTransactionsOptions,
): AsyncGenerator<Transaction[]> {
  const { bus, address, startBlock = 0n, endBlock = 99_999_999n, onProgress } = options;
  yield* scanWithBisection<RawTransaction, Transaction>(
    bus,
    'txlist',
    { address },
    startBlock,
    endBlock,
    parseTransaction,
    onProgress,
  );
}

/**
 * Scans internal (contract-to-contract) transactions for an address.
 * Same bisection strategy as scanTransactions.
 */
export async function* scanInternalTransactions(
  options: ScanTransactionsOptions,
): AsyncGenerator<InternalTransaction[]> {
  const { bus, address, startBlock = 0n, endBlock = 99_999_999n, onProgress } = options;
  yield* scanWithBisection<RawInternalTransaction, InternalTransaction>(
    bus,
    'txlistinternal',
    { address },
    startBlock,
    endBlock,
    parseInternalTransaction,
    onProgress,
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/sdk && npx vitest run src/__tests__/explorer/transactions.test.ts`
Expected: PASS — all 6 tests

- [ ] **Step 5: Commit**

```bash
git add packages/sdk/src/explorer/transactions.ts packages/sdk/src/__tests__/explorer/transactions.test.ts
git commit -m "feat(sdk): add transaction and internal transaction scanners via explorer API"
```

---

### Task 6: Balance functions (token + native)

**Files:**
- Create: `packages/sdk/src/explorer/balances.ts`
- Create: `packages/sdk/src/__tests__/explorer/balances.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// packages/sdk/src/__tests__/explorer/balances.test.ts
import { describe, it, expect, vi } from 'vitest';
import type { ExplorerBus } from '../../explorer/types.js';
import { getTokenBalances, getNativeBalances } from '../../explorer/balances.js';

function createMockBus(responseMap: Record<string, unknown>): ExplorerBus {
  return {
    domain: 'api.etherscan.io',
    request: vi.fn().mockImplementation((params: Record<string, string>) => {
      if (params.action === 'tokenbalance') {
        const addr = params.address.toLowerCase();
        return Promise.resolve(responseMap[addr] ?? '0');
      }
      if (params.action === 'balancemulti') {
        const addrs = params.address.split(',');
        return Promise.resolve(
          addrs.map((a: string) => ({
            account: a,
            balance: responseMap[a.toLowerCase()] ?? '0',
          })),
        );
      }
      return Promise.resolve([]);
    }),
    getCurrentRate: () => null,
    destroy: () => {},
  };
}

describe('getTokenBalances', () => {
  it('returns balances for each address', async () => {
    const bus = createMockBus({
      '0xaaa': '1000000',
      '0xbbb': '2000000',
    });

    const result = await getTokenBalances({
      bus,
      tokenAddress: '0xtoken' as `0x${string}`,
      addresses: ['0xAAA' as `0x${string}`, '0xBBB' as `0x${string}`],
    });

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ address: '0xaaa', balance: 1000000n });
    expect(result[1]).toMatchObject({ address: '0xbbb', balance: 2000000n });
  });

  it('handles zero balances', async () => {
    const bus = createMockBus({});
    const result = await getTokenBalances({
      bus,
      tokenAddress: '0xtoken' as `0x${string}`,
      addresses: ['0xCCC' as `0x${string}`],
    });
    expect(result[0]).toMatchObject({ balance: 0n });
  });

  it('makes one request per address', async () => {
    const bus = createMockBus({ '0xaaa': '100', '0xbbb': '200', '0xccc': '300' });
    await getTokenBalances({
      bus,
      tokenAddress: '0xtoken' as `0x${string}`,
      addresses: ['0xAAA', '0xBBB', '0xCCC'] as `0x${string}`[],
    });
    expect(bus.request).toHaveBeenCalledTimes(3);
  });
});

describe('getNativeBalances', () => {
  it('returns balances for each address', async () => {
    const bus = createMockBus({
      '0xaaa': '1000000000000000000',
      '0xbbb': '2000000000000000000',
    });

    const result = await getNativeBalances({
      bus,
      addresses: ['0xAAA' as `0x${string}`, '0xBBB' as `0x${string}`],
    });

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ balance: 1000000000000000000n });
  });

  it('batches up to 20 addresses per call', async () => {
    const addrs = Array.from({ length: 25 }, (_, i) =>
      `0x${i.toString(16).padStart(40, '0')}` as `0x${string}`,
    );
    const responseMap: Record<string, string> = {};
    for (const a of addrs) responseMap[a.toLowerCase()] = '100';

    const bus = createMockBus(responseMap);
    await getNativeBalances({ bus, addresses: addrs });

    // 25 addresses = 2 batches (20 + 5)
    expect(bus.request).toHaveBeenCalledTimes(2);
  });

  it('handles empty address list', async () => {
    const bus = createMockBus({});
    const result = await getNativeBalances({ bus, addresses: [] });
    expect(result).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/sdk && npx vitest run src/__tests__/explorer/balances.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement balance functions**

```typescript
// packages/sdk/src/explorer/balances.ts
import type { Address } from 'viem';
import type { GetTokenBalancesOptions, GetNativeBalancesOptions, TokenBalance } from './types.js';
import { chunk } from '../utils/chunk.js';

const NATIVE_BALANCE_BATCH_SIZE = 20;

/**
 * Fetches ERC-20 token balances for a list of addresses via the explorer API.
 * Makes one API call per address (Etherscan limitation for token balances).
 */
export async function getTokenBalances(
  options: GetTokenBalancesOptions,
): Promise<readonly TokenBalance[]> {
  const { bus, tokenAddress, addresses, onProgress } = options;
  const results: TokenBalance[] = [];

  for (let i = 0; i < addresses.length; i++) {
    const address = addresses[i].toLowerCase() as Address;
    const balanceStr = await bus.request<string>({
      module: 'account',
      action: 'tokenbalance',
      contractaddress: tokenAddress,
      address,
      tag: 'latest',
    });

    results.push({ address, balance: BigInt(balanceStr) });

    onProgress?.({
      type: 'filter',
      filterName: 'explorer-token-balance',
      inputCount: addresses.length,
      outputCount: i + 1,
    });
  }

  return results;
}

type RawNativeBalance = {
  account: string;
  balance: string;
};

/**
 * Fetches native token (ETH/PLS) balances for a list of addresses via the explorer API.
 * Batches up to 20 addresses per call using the balancemulti endpoint.
 */
export async function getNativeBalances(
  options: GetNativeBalancesOptions,
): Promise<readonly TokenBalance[]> {
  const { bus, addresses, onProgress } = options;
  if (addresses.length === 0) return [];

  const batches = chunk([...addresses], NATIVE_BALANCE_BATCH_SIZE);
  const results: TokenBalance[] = [];

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const commaSeparated = batch.join(',');

    const rawBalances = await bus.request<RawNativeBalance[]>({
      module: 'account',
      action: 'balancemulti',
      address: commaSeparated,
      tag: 'latest',
    });

    for (const raw of rawBalances) {
      results.push({
        address: raw.account.toLowerCase() as Address,
        balance: BigInt(raw.balance),
      });
    }

    onProgress?.({
      type: 'filter',
      filterName: 'explorer-native-balance',
      inputCount: addresses.length,
      outputCount: results.length,
    });
  }

  return results;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/sdk && npx vitest run src/__tests__/explorer/balances.test.ts`
Expected: PASS — all 6 tests

- [ ] **Step 5: Commit**

```bash
git add packages/sdk/src/explorer/balances.ts packages/sdk/src/__tests__/explorer/balances.test.ts
git commit -m "feat(sdk): add token and native balance queries via explorer API"
```

---

### Task 7: Barrel exports + pipeline integration + SDK types

**Files:**
- Create: `packages/sdk/src/explorer/index.ts`
- Modify: `packages/sdk/src/types.ts`
- Modify: `packages/sdk/src/pipeline/sources.ts`
- Modify: `packages/sdk/src/pipeline/filters.ts`
- Modify: `packages/sdk/src/index.ts`

- [ ] **Step 1: Create explorer barrel exports**

```typescript
// packages/sdk/src/explorer/index.ts
export { createExplorerBus, getOrCreateBus, destroyAllBuses, ExplorerApiError } from './bus.js';
export { scanTokenTransfers } from './transfers.js';
export { scanTransactions, scanInternalTransactions } from './transactions.js';
export { getTokenBalances, getNativeBalances } from './balances.js';
export { parseExplorerResponse, isRateLimitResult } from './client.js';
export type {
  ExplorerBus,
  ExplorerBusOptions,
  TokenTransfer,
  Transaction,
  InternalTransaction,
  TokenBalance,
  ScanTokenTransfersOptions,
  ScanTransactionsOptions,
  GetTokenBalancesOptions,
  GetNativeBalancesOptions,
  ExplorerTitrateState,
} from './types.js';
```

- [ ] **Step 2: Update SDK types — add new SourceType and FilterType values**

In `packages/sdk/src/types.ts`, update the `SourceType` and `FilterType` unions:

```typescript
// Before:
export type SourceType = 'block-scan' | 'csv' | 'union';

// After:
export type SourceType = 'block-scan' | 'csv' | 'union' | 'explorer-scan';
```

```typescript
// Before:
export type FilterType =
  | 'contract-check'
  | 'min-balance'
  | 'nonce-range'
  | 'token-recipients'
  | 'csv-exclusion'
  | 'previously-sent'
  | 'registry-check';

// After:
export type FilterType =
  | 'contract-check'
  | 'min-balance'
  | 'nonce-range'
  | 'token-recipients'
  | 'csv-exclusion'
  | 'previously-sent'
  | 'registry-check'
  | 'explorer-balance';
```

- [ ] **Step 3: Update pipeline sources — add explorer-scan source**

Add to `packages/sdk/src/pipeline/sources.ts`:

Add import at top:
```typescript
import { getOrCreateBus } from '../explorer/bus.js';
import { scanTokenTransfers } from '../explorer/transfers.js';
```

Add case in `createSource` switch:
```typescript
case 'explorer-scan':
  return explorerScanSource(params);
```

Add source function:
```typescript
function explorerScanSource(params: SourceParams): SourceExecutor {
  return async function* (_rpc, onProgress) {
    const explorerApiUrl = params.explorerApiUrl as string;
    const apiKey = params.apiKey as string;
    const tokenAddress = (params.tokenAddress as string).toLowerCase() as Address;
    const extract = (params.extract as 'from' | 'to') ?? 'to';
    const startBlock = params.startBlock ? BigInt(params.startBlock as string | number) : undefined;
    const endBlock = params.endBlock ? BigInt(params.endBlock as string | number) : undefined;

    const bus = getOrCreateBus(explorerApiUrl, apiKey);
    const seen = new Set<string>();
    const batch: Address[] = [];

    for await (const transfers of scanTokenTransfers({
      bus,
      tokenAddress,
      startBlock,
      endBlock,
      onProgress,
    })) {
      for (const t of transfers) {
        const addr = (extract === 'from' ? t.from : t.to).toLowerCase();
        if (seen.has(addr)) continue;
        seen.add(addr);
        batch.push(addr as Address);
      }
    }

    if (batch.length > 0) yield batch;
  };
}
```

- [ ] **Step 4: Update pipeline filters — add explorer-balance filter**

Add to `packages/sdk/src/pipeline/filters.ts`:

Add imports at top:
```typescript
import { getOrCreateBus } from '../explorer/bus.js';
import { getTokenBalances, getNativeBalances } from '../explorer/balances.js';
```

Add case in `createFilter` switch:
```typescript
case 'explorer-balance':
  return explorerBalanceFilter(params);
```

Add filter function:
```typescript
function explorerBalanceFilter(params: FilterParams): FilterExecutor {
  const explorerApiUrl = params.explorerApiUrl as string;
  const apiKey = params.apiKey as string;
  const tokenAddress = params.tokenAddress as string;
  const minBalance = BigInt(params.minBalance as string);

  return async (addresses, _rpc, onProgress) => {
    const bus = getOrCreateBus(explorerApiUrl, apiKey);
    const addressArray = [...addresses];
    const isNative = tokenAddress === 'native';

    const balances = isNative
      ? await getNativeBalances({ bus, addresses: addressArray, onProgress })
      : await getTokenBalances({
          bus,
          tokenAddress: tokenAddress.toLowerCase() as Address,
          addresses: addressArray,
          onProgress,
        });

    const result = new Set<Address>();
    for (const b of balances) {
      if (b.balance >= minBalance) result.add(b.address);
    }

    onProgress?.({
      type: 'filter',
      filterName: 'explorer-balance',
      inputCount: addresses.size,
      outputCount: result.size,
    });

    return result;
  };
}
```

- [ ] **Step 5: Update SDK barrel exports**

Add to `packages/sdk/src/index.ts`:

```typescript
// Explorer
export {
  createExplorerBus,
  getOrCreateBus,
  destroyAllBuses,
  ExplorerApiError,
  scanTokenTransfers,
  scanTransactions,
  scanInternalTransactions,
  getTokenBalances,
  getNativeBalances,
  parseExplorerResponse,
  isRateLimitResult,
} from './explorer/index.js';
export type {
  ExplorerBus,
  ExplorerBusOptions,
  TokenTransfer,
  Transaction,
  InternalTransaction,
  TokenBalance,
  ScanTokenTransfersOptions,
  ScanTransactionsOptions,
  GetTokenBalancesOptions,
  GetNativeBalancesOptions,
  ExplorerTitrateState,
} from './explorer/index.js';
```

- [ ] **Step 6: Build SDK to verify everything compiles**

Run: `cd packages/sdk && npx tsc`
Expected: Clean compilation

- [ ] **Step 7: Run all SDK tests**

Run: `cd packages/sdk && npx vitest run`
Expected: All new explorer tests pass + all existing tests pass (except pre-existing Anvil-dependent tests)

- [ ] **Step 8: Commit**

```bash
git add packages/sdk/src/explorer/index.ts \
  packages/sdk/src/types.ts \
  packages/sdk/src/pipeline/sources.ts \
  packages/sdk/src/pipeline/filters.ts \
  packages/sdk/src/index.ts
git commit -m "feat(sdk): integrate explorer scanner into pipeline and SDK exports"
```

---

### Task 8: Final verification

**Files:** None (verification only)

- [ ] **Step 1: Run full SDK tests**

Run: `cd packages/sdk && npx vitest run`
Expected: All tests pass (except pre-existing Anvil-dependent tests)

- [ ] **Step 2: TypeScript check**

Run: `cd packages/sdk && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Run TUI tests to verify no regressions**

Run: `cd packages/tui && npx tsc --noEmit`
Expected: Clean — TUI imports the updated types from SDK

- [ ] **Step 4: Run web tests to verify no regressions**

Run: `cd packages/web && npx vitest run`
Expected: All 64 component tests pass

- [ ] **Step 5: Verify explorer barrel exports are accessible**

Run: `cd packages/sdk && node -e "import('@titrate/sdk').then(m => console.log(Object.keys(m).filter(k => k.includes('Explorer') || k.includes('explorer') || k.includes('scan') || k.includes('Balance')).sort().join('\n')))"`
Expected: Lists all explorer-related exports

- [ ] **Step 6: Commit any remaining fixes**

```bash
git add -A
git commit -m "fix: resolve issues found during verification"
```

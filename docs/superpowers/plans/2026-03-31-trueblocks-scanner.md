# TrueBlocks Scanner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add TrueBlocks self-hosted indexer support to `@titrate/sdk` — appearances, transfers, balance history hints, traces, and health check — with auto-pagination and pipeline integration.

**Architecture:** A new `packages/sdk/src/trueblocks/` module with 8 files. The `TrueBlocksClient` is the core primitive — a simple HTTP client that constructs GET requests, parses the `{ data: [...] }` response wrapper, and auto-paginates via `firstRecord`/`maxRecords`. No rate limiting needed (self-hosted), no result caps (no bisection). Five scanner functions expose TrueBlocks' capabilities as typed async generators. Pipeline integration adds `'trueblocks-scan'` source and `'trueblocks-balance-hint'` filter types.

**Tech Stack:** TypeScript, Viem (Address/Hex types), Vitest (mocked fetch + optional real-data integration tests gated by `TRUEBLOCKS_URL` env var)

**Note:** The generic `RequestBus` refactor is deferred to Phase B. The TrueBlocks client uses `fetchFn` directly for now. The `busKey` field in options is forward-looking — it will be used when the generic RequestBus lands.

---

## File Structure

### New files (`packages/sdk/src/trueblocks/`)

| File | Responsibility |
|------|----------------|
| `types.ts` | All TrueBlocks-specific types |
| `client.ts` | HTTP client with auto-pagination and error handling |
| `status.ts` | `getTrueBlocksStatus` health check |
| `appearances.ts` | `getAppearances` async generator |
| `transfers.ts` | `getTransfers` async generator |
| `balances.ts` | `getBalanceHistory` async generator |
| `traces.ts` | `getTraces` async generator |
| `index.ts` | Barrel exports |

### New test files (`packages/sdk/src/__tests__/trueblocks/`)

| File | Covers |
|------|--------|
| `client.test.ts` | URL construction, response parsing, pagination, errors |
| `status.test.ts` | Health check parsing |
| `appearances.test.ts` | Appearance listing with block range filters |
| `transfers.test.ts` | Token transfer export |
| `balances.test.ts` | Balance change history |
| `traces.test.ts` | Internal call traces |
| `integration.test.ts` | Real data tests (gated by `TRUEBLOCKS_URL`) |

### Modified files

| File | Change |
|------|--------|
| `packages/sdk/src/types.ts` | Add `'trueblocks-scan'` to `SourceType`, `'trueblocks-balance-hint'` to `FilterType` |
| `packages/sdk/src/pipeline/sources.ts` | Add `trueblocksScanSource` case |
| `packages/sdk/src/pipeline/filters.ts` | Add `trueBlocksBalanceHintFilter` case |
| `packages/sdk/src/index.ts` | Add TrueBlocks barrel exports |

---

### Task 1: TrueBlocks types + client

**Files:**
- Create: `packages/sdk/src/trueblocks/types.ts`
- Create: `packages/sdk/src/trueblocks/client.ts`
- Create: `packages/sdk/src/__tests__/trueblocks/client.test.ts`

- [ ] **Step 1: Create types file**

```typescript
// packages/sdk/src/trueblocks/types.ts
import type { Address, Hex } from 'viem';
import type { ProgressCallback } from '../types.js';

// --- Result types ---

export type Appearance = {
  readonly address: Address;
  readonly blockNumber: bigint;
  readonly transactionIndex: number;
};

export type TrueBlocksTransfer = {
  readonly from: Address;
  readonly to: Address;
  readonly value: bigint;
  readonly asset: string;
  readonly blockNumber: bigint;
  readonly transactionIndex: number;
  readonly hash: Hex;
  readonly timestamp: number;
};

export type BalanceChange = {
  readonly address: Address;
  readonly blockNumber: bigint;
  readonly transactionIndex: number;
};

export type TrueBlocksTrace = {
  readonly from: Address;
  readonly to: Address;
  readonly value: bigint;
  readonly hash: Hex;
  readonly blockNumber: bigint;
  readonly traceType: string;
  readonly depth: number;
};

export type TrueBlocksStatus = {
  readonly isReady: boolean;
  readonly clientVersion: string;
  readonly chainId: number;
  readonly rpcProvider: string;
  readonly cachePath: string;
};

// --- Client types ---

export type TrueBlocksClientOptions = {
  readonly baseUrl: string;
  readonly busKey: string;
  readonly fetchFn?: typeof fetch;
};

export type TrueBlocksClient = {
  readonly baseUrl: string;
  request<T>(endpoint: string, params: Record<string, string>): Promise<T[]>;
  requestPaginated<T>(endpoint: string, params: Record<string, string>, pageSize?: number): AsyncGenerator<T[]>;
  destroy(): void;
};

// --- Scanner option types ---

export type GetAppearancesOptions = {
  readonly client: TrueBlocksClient;
  readonly addresses: readonly Address[];
  readonly firstBlock?: bigint;
  readonly lastBlock?: bigint;
  readonly onProgress?: ProgressCallback;
};

export type GetTransfersOptions = {
  readonly client: TrueBlocksClient;
  readonly addresses: readonly Address[];
  readonly asset?: Address;
  readonly firstBlock?: bigint;
  readonly lastBlock?: bigint;
  readonly onProgress?: ProgressCallback;
};

export type GetBalanceHistoryOptions = {
  readonly client: TrueBlocksClient;
  readonly addresses: readonly Address[];
  readonly asset?: Address;
  readonly firstBlock?: bigint;
  readonly lastBlock?: bigint;
  readonly onProgress?: ProgressCallback;
};

export type GetTracesOptions = {
  readonly client: TrueBlocksClient;
  readonly addresses: readonly Address[];
  readonly firstBlock?: bigint;
  readonly lastBlock?: bigint;
  readonly onProgress?: ProgressCallback;
};
```

- [ ] **Step 2: Write failing client tests**

```typescript
// packages/sdk/src/__tests__/trueblocks/client.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createTrueBlocksClient, TrueBlocksApiError } from '../../trueblocks/client.js';

function mockFetch(responses: Array<{ status: number; body: unknown }>): typeof fetch {
  let callIndex = 0;
  return vi.fn().mockImplementation(() => {
    const resp = responses[Math.min(callIndex++, responses.length - 1)];
    return Promise.resolve({
      ok: resp.status >= 200 && resp.status < 300,
      status: resp.status,
      statusText: resp.status === 200 ? 'OK' : 'Error',
      json: () => Promise.resolve(resp.body),
    });
  }) as unknown as typeof fetch;
}

describe('createTrueBlocksClient', () => {
  it('stores baseUrl', () => {
    const client = createTrueBlocksClient({
      baseUrl: 'http://localhost:8080',
      busKey: 'trueblocks-local',
      fetchFn: mockFetch([]),
    });
    expect(client.baseUrl).toBe('http://localhost:8080');
    client.destroy();
  });
});

describe('client.request', () => {
  it('constructs correct URL with endpoint and params', async () => {
    const fetchFn = mockFetch([
      { status: 200, body: { data: [{ blockNumber: 100 }] } },
    ]);
    const client = createTrueBlocksClient({
      baseUrl: 'http://localhost:8080',
      busKey: 'tb',
      fetchFn,
    });
    await client.request('/list', { addrs: '0xabc' });
    expect(fetchFn).toHaveBeenCalledWith(
      expect.stringContaining('http://localhost:8080/list?addrs=0xabc'),
    );
    client.destroy();
  });

  it('parses data array from response', async () => {
    const client = createTrueBlocksClient({
      baseUrl: 'http://localhost:8080',
      busKey: 'tb',
      fetchFn: mockFetch([
        { status: 200, body: { data: [{ a: 1 }, { a: 2 }] } },
      ]),
    });
    const result = await client.request('/test', {});
    expect(result).toEqual([{ a: 1 }, { a: 2 }]);
    client.destroy();
  });

  it('returns empty array when data is null or missing', async () => {
    const client = createTrueBlocksClient({
      baseUrl: 'http://localhost:8080',
      busKey: 'tb',
      fetchFn: mockFetch([
        { status: 200, body: { data: null } },
      ]),
    });
    const result = await client.request('/test', {});
    expect(result).toEqual([]);
    client.destroy();
  });

  it('throws TrueBlocksApiError on HTTP error', async () => {
    const client = createTrueBlocksClient({
      baseUrl: 'http://localhost:8080',
      busKey: 'tb',
      fetchFn: mockFetch([
        { status: 500, body: { errors: ['internal error'] } },
      ]),
    });
    await expect(client.request('/test', {})).rejects.toThrow(TrueBlocksApiError);
    client.destroy();
  });

  it('throws TrueBlocksApiError on 404', async () => {
    const client = createTrueBlocksClient({
      baseUrl: 'http://localhost:8080',
      busKey: 'tb',
      fetchFn: mockFetch([
        { status: 404, body: {} },
      ]),
    });
    await expect(client.request('/test', {})).rejects.toThrow(TrueBlocksApiError);
    client.destroy();
  });
});

describe('client.requestPaginated', () => {
  it('fetches pages until result count is less than page size', async () => {
    const fetchFn = mockFetch([
      { status: 200, body: { data: Array.from({ length: 100 }, (_, i) => ({ id: i })) } },
      { status: 200, body: { data: Array.from({ length: 100 }, (_, i) => ({ id: 100 + i })) } },
      { status: 200, body: { data: Array.from({ length: 50 }, (_, i) => ({ id: 200 + i })) } },
    ]);
    const client = createTrueBlocksClient({
      baseUrl: 'http://localhost:8080',
      busKey: 'tb',
      fetchFn,
    });

    let totalItems = 0;
    let pageCount = 0;
    for await (const page of client.requestPaginated('/list', { addrs: '0xabc' }, 100)) {
      totalItems += page.length;
      pageCount++;
    }

    expect(totalItems).toBe(250);
    expect(pageCount).toBe(3);
    client.destroy();
  });

  it('stops after first page if result count is under page size', async () => {
    const client = createTrueBlocksClient({
      baseUrl: 'http://localhost:8080',
      busKey: 'tb',
      fetchFn: mockFetch([
        { status: 200, body: { data: [{ id: 1 }, { id: 2 }] } },
      ]),
    });

    let pageCount = 0;
    for await (const _ of client.requestPaginated('/list', {}, 100)) {
      pageCount++;
    }
    expect(pageCount).toBe(1);
    client.destroy();
  });

  it('handles empty first page', async () => {
    const client = createTrueBlocksClient({
      baseUrl: 'http://localhost:8080',
      busKey: 'tb',
      fetchFn: mockFetch([
        { status: 200, body: { data: [] } },
      ]),
    });

    let pageCount = 0;
    for await (const _ of client.requestPaginated('/list', {}, 100)) {
      pageCount++;
    }
    expect(pageCount).toBe(0);
    client.destroy();
  });

  it('passes firstRecord and maxRecords params', async () => {
    const fetchFn = mockFetch([
      { status: 200, body: { data: [{ id: 1 }] } },
    ]);
    const client = createTrueBlocksClient({
      baseUrl: 'http://localhost:8080',
      busKey: 'tb',
      fetchFn,
    });

    for await (const _ of client.requestPaginated('/list', { addrs: '0xabc' }, 50)) {
      // consume
    }

    expect(fetchFn).toHaveBeenCalledWith(
      expect.stringContaining('firstRecord=0'),
    );
    expect(fetchFn).toHaveBeenCalledWith(
      expect.stringContaining('maxRecords=50'),
    );
    client.destroy();
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd packages/sdk && npx vitest run src/__tests__/trueblocks/client.test.ts`
Expected: FAIL — module not found

- [ ] **Step 4: Implement client**

```typescript
// packages/sdk/src/trueblocks/client.ts
import type { TrueBlocksClient, TrueBlocksClientOptions } from './types.js';

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
 * Simple HTTP GET client with auto-pagination via firstRecord/maxRecords.
 * No API key needed (self-hosted). No rate limiting by default.
 */
export function createTrueBlocksClient(options: TrueBlocksClientOptions): TrueBlocksClient {
  const { baseUrl, fetchFn = globalThis.fetch } = options;

  async function request<T>(endpoint: string, params: Record<string, string>): Promise<T[]> {
    const searchParams = new URLSearchParams(params);
    const url = `${baseUrl}${endpoint}?${searchParams.toString()}`;

    const response = await fetchFn(url);
    if (!response.ok) {
      throw new TrueBlocksApiError(response.status, response.statusText);
    }

    const body = (await response.json()) as TrueBlocksResponse;
    return (body.data ?? []) as T[];
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
    destroy: () => {},
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd packages/sdk && npx vitest run src/__tests__/trueblocks/client.test.ts`
Expected: PASS — all 10 tests

- [ ] **Step 6: Commit**

```bash
git add packages/sdk/src/trueblocks/types.ts packages/sdk/src/trueblocks/client.ts \
  packages/sdk/src/__tests__/trueblocks/client.test.ts
git commit -m "feat(sdk): add TrueBlocks types and API client with auto-pagination"
```

---

### Task 2: TrueBlocks status check

**Files:**
- Create: `packages/sdk/src/trueblocks/status.ts`
- Create: `packages/sdk/src/__tests__/trueblocks/status.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// packages/sdk/src/__tests__/trueblocks/status.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createTrueBlocksClient } from '../../trueblocks/client.js';
import { getTrueBlocksStatus } from '../../trueblocks/status.js';

function mockFetch(body: unknown): typeof fetch {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    statusText: 'OK',
    json: () => Promise.resolve(body),
  }) as unknown as typeof fetch;
}

describe('getTrueBlocksStatus', () => {
  it('parses a healthy status response', async () => {
    const client = createTrueBlocksClient({
      baseUrl: 'http://localhost:8080',
      busKey: 'tb',
      fetchFn: mockFetch({
        data: [{
          clientVersion: '3.0.0',
          chains: [{ chain: 'mainnet', chainId: 1, rpcProvider: 'http://localhost:8545' }],
          cachePath: '/home/user/.local/share/trueblocks/cache',
          isReady: true,
        }],
      }),
    });

    const status = await getTrueBlocksStatus(client);
    expect(status.isReady).toBe(true);
    expect(status.clientVersion).toBe('3.0.0');
    expect(status.chainId).toBe(1);
    expect(status.rpcProvider).toBe('http://localhost:8545');
    client.destroy();
  });

  it('returns isReady false when instance is not ready', async () => {
    const client = createTrueBlocksClient({
      baseUrl: 'http://localhost:8080',
      busKey: 'tb',
      fetchFn: mockFetch({
        data: [{
          clientVersion: '3.0.0',
          chains: [{ chain: 'mainnet', chainId: 1, rpcProvider: 'http://localhost:8545' }],
          cachePath: '/tmp',
          isReady: false,
        }],
      }),
    });

    const status = await getTrueBlocksStatus(client);
    expect(status.isReady).toBe(false);
    client.destroy();
  });

  it('handles connection failure gracefully', async () => {
    const client = createTrueBlocksClient({
      baseUrl: 'http://localhost:8080',
      busKey: 'tb',
      fetchFn: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) as unknown as typeof fetch,
    });

    const status = await getTrueBlocksStatus(client);
    expect(status.isReady).toBe(false);
    client.destroy();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/sdk && npx vitest run src/__tests__/trueblocks/status.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement status check**

```typescript
// packages/sdk/src/trueblocks/status.ts
import type { TrueBlocksClient, TrueBlocksStatus } from './types.js';

type RawStatusData = {
  clientVersion?: string;
  chains?: Array<{ chain?: string; chainId?: number; rpcProvider?: string }>;
  cachePath?: string;
  isReady?: boolean;
};

/**
 * Checks whether a TrueBlocks instance is running and reports chain info.
 * Returns isReady: false on connection failure (does not throw).
 */
export async function getTrueBlocksStatus(
  client: TrueBlocksClient,
): Promise<TrueBlocksStatus> {
  try {
    const data = await client.request<RawStatusData>('/status', { chains: 'true' });
    const status = data[0];
    if (!status) {
      return { isReady: false, clientVersion: '', chainId: 0, rpcProvider: '', cachePath: '' };
    }

    const chain = status.chains?.[0];
    return {
      isReady: status.isReady ?? false,
      clientVersion: status.clientVersion ?? '',
      chainId: chain?.chainId ?? 0,
      rpcProvider: chain?.rpcProvider ?? '',
      cachePath: status.cachePath ?? '',
    };
  } catch {
    return { isReady: false, clientVersion: '', chainId: 0, rpcProvider: '', cachePath: '' };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/sdk && npx vitest run src/__tests__/trueblocks/status.test.ts`
Expected: PASS — all 3 tests

- [ ] **Step 5: Commit**

```bash
git add packages/sdk/src/trueblocks/status.ts packages/sdk/src/__tests__/trueblocks/status.test.ts
git commit -m "feat(sdk): add TrueBlocks status health check"
```

---

### Task 3: Appearances scanner

**Files:**
- Create: `packages/sdk/src/trueblocks/appearances.ts`
- Create: `packages/sdk/src/__tests__/trueblocks/appearances.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// packages/sdk/src/__tests__/trueblocks/appearances.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createTrueBlocksClient } from '../../trueblocks/client.js';
import { getAppearances } from '../../trueblocks/appearances.js';

function mockFetch(body: unknown): typeof fetch {
  return vi.fn().mockResolvedValue({
    ok: true, status: 200, statusText: 'OK',
    json: () => Promise.resolve(body),
  }) as unknown as typeof fetch;
}

describe('getAppearances', () => {
  it('yields parsed appearances', async () => {
    const client = createTrueBlocksClient({
      baseUrl: 'http://localhost:8080', busKey: 'tb',
      fetchFn: mockFetch({
        data: [
          { address: '0xABC', blockNumber: 19000000, transactionIndex: 5 },
          { address: '0xABC', blockNumber: 19000050, transactionIndex: 12 },
        ],
      }),
    });

    const results: unknown[][] = [];
    for await (const batch of getAppearances({
      client,
      addresses: ['0xABC' as `0x${string}`],
    })) {
      results.push(batch);
    }

    expect(results).toHaveLength(1);
    expect(results[0]).toHaveLength(2);
    expect(results[0][0]).toMatchObject({
      address: '0xabc',
      blockNumber: 19000000n,
      transactionIndex: 5,
    });
  });

  it('passes block range params', async () => {
    const fetchFn = mockFetch({ data: [] });
    const client = createTrueBlocksClient({
      baseUrl: 'http://localhost:8080', busKey: 'tb', fetchFn,
    });

    for await (const _ of getAppearances({
      client,
      addresses: ['0xABC' as `0x${string}`],
      firstBlock: 100n,
      lastBlock: 200n,
    })) { /* consume */ }

    expect(fetchFn).toHaveBeenCalledWith(
      expect.stringContaining('firstBlock=100'),
    );
    expect(fetchFn).toHaveBeenCalledWith(
      expect.stringContaining('lastBlock=200'),
    );
  });

  it('handles empty result', async () => {
    const client = createTrueBlocksClient({
      baseUrl: 'http://localhost:8080', busKey: 'tb',
      fetchFn: mockFetch({ data: [] }),
    });

    const results: unknown[][] = [];
    for await (const batch of getAppearances({
      client,
      addresses: ['0xABC' as `0x${string}`],
    })) {
      results.push(batch);
    }
    expect(results).toHaveLength(0);
  });

  it('emits progress events', async () => {
    const client = createTrueBlocksClient({
      baseUrl: 'http://localhost:8080', busKey: 'tb',
      fetchFn: mockFetch({
        data: [{ address: '0xABC', blockNumber: 100, transactionIndex: 0 }],
      }),
    });

    const events: unknown[] = [];
    for await (const _ of getAppearances({
      client,
      addresses: ['0xABC' as `0x${string}`],
      onProgress: (e) => events.push(e),
    })) { /* consume */ }

    expect(events.length).toBeGreaterThan(0);
    expect(events[0]).toMatchObject({ type: 'scan' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/sdk && npx vitest run src/__tests__/trueblocks/appearances.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement appearances**

```typescript
// packages/sdk/src/trueblocks/appearances.ts
import type { Address } from 'viem';
import type { GetAppearancesOptions, Appearance } from './types.js';

type RawAppearance = {
  address: string;
  blockNumber: number;
  transactionIndex: number;
};

function parseAppearance(raw: RawAppearance): Appearance {
  return {
    address: raw.address.toLowerCase() as Address,
    blockNumber: BigInt(raw.blockNumber),
    transactionIndex: raw.transactionIndex,
  };
}

/**
 * Lists every transaction where the given addresses appeared — at any trace depth.
 * This is TrueBlocks' unique capability: it knows every place an address shows up,
 * not just as sender/receiver but in any internal call.
 */
export async function* getAppearances(
  options: GetAppearancesOptions,
): AsyncGenerator<Appearance[]> {
  const { client, addresses, firstBlock, lastBlock, onProgress } = options;

  const params: Record<string, string> = {
    addrs: addresses.join(','),
  };
  if (firstBlock !== undefined) params.firstBlock = firstBlock.toString();
  if (lastBlock !== undefined) params.lastBlock = lastBlock.toString();

  let totalFound = 0;

  for await (const page of client.requestPaginated<RawAppearance>('/list', params)) {
    if (page.length === 0) continue;

    const parsed = page.map(parseAppearance);
    totalFound += parsed.length;

    onProgress?.({
      type: 'scan',
      currentBlock: parsed[parsed.length - 1].blockNumber,
      endBlock: lastBlock ?? 0n,
      addressesFound: totalFound,
    });

    yield parsed;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/sdk && npx vitest run src/__tests__/trueblocks/appearances.test.ts`
Expected: PASS — all 4 tests

- [ ] **Step 5: Commit**

```bash
git add packages/sdk/src/trueblocks/appearances.ts packages/sdk/src/__tests__/trueblocks/appearances.test.ts
git commit -m "feat(sdk): add TrueBlocks appearances scanner"
```

---

### Task 4: Transfers scanner

**Files:**
- Create: `packages/sdk/src/trueblocks/transfers.ts`
- Create: `packages/sdk/src/__tests__/trueblocks/transfers.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// packages/sdk/src/__tests__/trueblocks/transfers.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createTrueBlocksClient } from '../../trueblocks/client.js';
import { getTransfers } from '../../trueblocks/transfers.js';

function mockFetch(body: unknown): typeof fetch {
  return vi.fn().mockResolvedValue({
    ok: true, status: 200, statusText: 'OK',
    json: () => Promise.resolve(body),
  }) as unknown as typeof fetch;
}

describe('getTransfers', () => {
  it('yields parsed transfers', async () => {
    const client = createTrueBlocksClient({
      baseUrl: 'http://localhost:8080', busKey: 'tb',
      fetchFn: mockFetch({
        data: [{
          from: '0x1111111111111111111111111111111111111111',
          to: '0x2222222222222222222222222222222222222222',
          value: '1000000000000000000',
          asset: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
          blockNumber: 19000000,
          transactionIndex: 5,
          hash: '0xabc123',
          timestamp: 1700000000,
        }],
      }),
    });

    const results: unknown[][] = [];
    for await (const batch of getTransfers({
      client,
      addresses: ['0x1111111111111111111111111111111111111111' as `0x${string}`],
    })) {
      results.push(batch);
    }

    expect(results).toHaveLength(1);
    expect(results[0][0]).toMatchObject({
      from: '0x1111111111111111111111111111111111111111',
      to: '0x2222222222222222222222222222222222222222',
      value: 1000000000000000000n,
      blockNumber: 19000000n,
    });
  });

  it('passes asset filter param', async () => {
    const fetchFn = mockFetch({ data: [] });
    const client = createTrueBlocksClient({
      baseUrl: 'http://localhost:8080', busKey: 'tb', fetchFn,
    });

    for await (const _ of getTransfers({
      client,
      addresses: ['0xABC' as `0x${string}`],
      asset: '0xUSDC' as `0x${string}`,
    })) { /* consume */ }

    expect(fetchFn).toHaveBeenCalledWith(expect.stringContaining('asset=0xUSDC'));
  });

  it('handles native ETH transfers (asset string)', async () => {
    const client = createTrueBlocksClient({
      baseUrl: 'http://localhost:8080', busKey: 'tb',
      fetchFn: mockFetch({
        data: [{
          from: '0x1111111111111111111111111111111111111111',
          to: '0x2222222222222222222222222222222222222222',
          value: '500000000000000000',
          asset: 'ETH',
          blockNumber: 100,
          transactionIndex: 0,
          hash: '0xdef',
          timestamp: 1700000000,
        }],
      }),
    });

    for await (const batch of getTransfers({
      client,
      addresses: ['0x1111111111111111111111111111111111111111' as `0x${string}`],
    })) {
      expect(batch[0]).toMatchObject({ asset: 'ETH', value: 500000000000000000n });
    }
  });

  it('handles empty result', async () => {
    const client = createTrueBlocksClient({
      baseUrl: 'http://localhost:8080', busKey: 'tb',
      fetchFn: mockFetch({ data: [] }),
    });

    const results: unknown[][] = [];
    for await (const batch of getTransfers({
      client,
      addresses: ['0xABC' as `0x${string}`],
    })) {
      results.push(batch);
    }
    expect(results).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/sdk && npx vitest run src/__tests__/trueblocks/transfers.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement transfers**

```typescript
// packages/sdk/src/trueblocks/transfers.ts
import type { Address, Hex } from 'viem';
import type { GetTransfersOptions, TrueBlocksTransfer } from './types.js';

type RawTransfer = {
  from: string;
  to: string;
  value: string;
  asset: string;
  blockNumber: number;
  transactionIndex: number;
  hash: string;
  timestamp: number;
};

function parseTransfer(raw: RawTransfer): TrueBlocksTransfer {
  return {
    from: raw.from.toLowerCase() as Address,
    to: raw.to.toLowerCase() as Address,
    value: BigInt(raw.value),
    asset: raw.asset,
    blockNumber: BigInt(raw.blockNumber),
    transactionIndex: raw.transactionIndex,
    hash: raw.hash as Hex,
    timestamp: raw.timestamp,
  };
}

/**
 * Exports token transfer events for addresses via TrueBlocks.
 * No result caps — TrueBlocks returns the full history.
 * Optional asset filter for specific token address.
 */
export async function* getTransfers(
  options: GetTransfersOptions,
): AsyncGenerator<TrueBlocksTransfer[]> {
  const { client, addresses, asset, firstBlock, lastBlock, onProgress } = options;

  const params: Record<string, string> = {
    addrs: addresses.join(','),
    accounting: 'true',
  };
  if (asset) params.asset = asset;
  if (firstBlock !== undefined) params.firstBlock = firstBlock.toString();
  if (lastBlock !== undefined) params.lastBlock = lastBlock.toString();

  let totalFound = 0;

  for await (const page of client.requestPaginated<RawTransfer>('/export', params)) {
    if (page.length === 0) continue;

    const parsed = page.map(parseTransfer);
    totalFound += parsed.length;

    onProgress?.({
      type: 'scan',
      currentBlock: parsed[parsed.length - 1].blockNumber,
      endBlock: lastBlock ?? 0n,
      addressesFound: totalFound,
    });

    yield parsed;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/sdk && npx vitest run src/__tests__/trueblocks/transfers.test.ts`
Expected: PASS — all 4 tests

- [ ] **Step 5: Commit**

```bash
git add packages/sdk/src/trueblocks/transfers.ts packages/sdk/src/__tests__/trueblocks/transfers.test.ts
git commit -m "feat(sdk): add TrueBlocks transfer scanner"
```

---

### Task 5: Balance history + traces

**Files:**
- Create: `packages/sdk/src/trueblocks/balances.ts`
- Create: `packages/sdk/src/trueblocks/traces.ts`
- Create: `packages/sdk/src/__tests__/trueblocks/balances.test.ts`
- Create: `packages/sdk/src/__tests__/trueblocks/traces.test.ts`

- [ ] **Step 1: Write failing balance history tests**

```typescript
// packages/sdk/src/__tests__/trueblocks/balances.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createTrueBlocksClient } from '../../trueblocks/client.js';
import { getBalanceHistory } from '../../trueblocks/balances.js';

function mockFetch(body: unknown): typeof fetch {
  return vi.fn().mockResolvedValue({
    ok: true, status: 200, statusText: 'OK',
    json: () => Promise.resolve(body),
  }) as unknown as typeof fetch;
}

describe('getBalanceHistory', () => {
  it('yields block numbers where balance changed', async () => {
    const client = createTrueBlocksClient({
      baseUrl: 'http://localhost:8080', busKey: 'tb',
      fetchFn: mockFetch({
        data: [
          { address: '0xABC', blockNumber: 19000010, transactionIndex: 3 },
          { address: '0xABC', blockNumber: 19000050, transactionIndex: 7 },
        ],
      }),
    });

    const results: unknown[][] = [];
    for await (const batch of getBalanceHistory({
      client,
      addresses: ['0xABC' as `0x${string}`],
    })) {
      results.push(batch);
    }

    expect(results).toHaveLength(1);
    expect(results[0][0]).toMatchObject({ blockNumber: 19000010n });
    expect(results[0][1]).toMatchObject({ blockNumber: 19000050n });
  });

  it('passes asset and block range params', async () => {
    const fetchFn = mockFetch({ data: [] });
    const client = createTrueBlocksClient({
      baseUrl: 'http://localhost:8080', busKey: 'tb', fetchFn,
    });

    for await (const _ of getBalanceHistory({
      client,
      addresses: ['0xABC' as `0x${string}`],
      asset: '0xUSDC' as `0x${string}`,
      firstBlock: 100n,
      lastBlock: 200n,
    })) { /* consume */ }

    expect(fetchFn).toHaveBeenCalledWith(expect.stringContaining('asset=0xUSDC'));
    expect(fetchFn).toHaveBeenCalledWith(expect.stringContaining('changes=true'));
    expect(fetchFn).toHaveBeenCalledWith(expect.stringContaining('balances=true'));
  });

  it('handles empty history', async () => {
    const client = createTrueBlocksClient({
      baseUrl: 'http://localhost:8080', busKey: 'tb',
      fetchFn: mockFetch({ data: [] }),
    });

    const results: unknown[][] = [];
    for await (const batch of getBalanceHistory({
      client, addresses: ['0xABC' as `0x${string}`],
    })) {
      results.push(batch);
    }
    expect(results).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Write failing trace tests**

```typescript
// packages/sdk/src/__tests__/trueblocks/traces.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createTrueBlocksClient } from '../../trueblocks/client.js';
import { getTraces } from '../../trueblocks/traces.js';

function mockFetch(body: unknown): typeof fetch {
  return vi.fn().mockResolvedValue({
    ok: true, status: 200, statusText: 'OK',
    json: () => Promise.resolve(body),
  }) as unknown as typeof fetch;
}

describe('getTraces', () => {
  it('yields parsed traces', async () => {
    const client = createTrueBlocksClient({
      baseUrl: 'http://localhost:8080', busKey: 'tb',
      fetchFn: mockFetch({
        data: [{
          from: '0x1111111111111111111111111111111111111111',
          to: '0x2222222222222222222222222222222222222222',
          value: '500000000000000000',
          hash: '0xdef456',
          blockNumber: 19000000,
          type: 'call',
          traceAddress: '0.1',
        }],
      }),
    });

    const results: unknown[][] = [];
    for await (const batch of getTraces({
      client,
      addresses: ['0x1111111111111111111111111111111111111111' as `0x${string}`],
    })) {
      results.push(batch);
    }

    expect(results).toHaveLength(1);
    expect(results[0][0]).toMatchObject({
      from: '0x1111111111111111111111111111111111111111',
      to: '0x2222222222222222222222222222222222222222',
      value: 500000000000000000n,
      traceType: 'call',
    });
  });

  it('parses trace depth from traceAddress', async () => {
    const client = createTrueBlocksClient({
      baseUrl: 'http://localhost:8080', busKey: 'tb',
      fetchFn: mockFetch({
        data: [{
          from: '0x1111111111111111111111111111111111111111',
          to: '0x2222222222222222222222222222222222222222',
          value: '0', hash: '0xabc', blockNumber: 100,
          type: 'delegatecall',
          traceAddress: '0.1.2',
        }],
      }),
    });

    for await (const batch of getTraces({
      client,
      addresses: ['0x1111111111111111111111111111111111111111' as `0x${string}`],
    })) {
      expect(batch[0]).toMatchObject({ traceType: 'delegatecall', depth: 3 });
    }
  });

  it('uses traces param in export endpoint', async () => {
    const fetchFn = mockFetch({ data: [] });
    const client = createTrueBlocksClient({
      baseUrl: 'http://localhost:8080', busKey: 'tb', fetchFn,
    });

    for await (const _ of getTraces({
      client,
      addresses: ['0xABC' as `0x${string}`],
    })) { /* consume */ }

    expect(fetchFn).toHaveBeenCalledWith(expect.stringContaining('traces=true'));
  });

  it('handles empty result', async () => {
    const client = createTrueBlocksClient({
      baseUrl: 'http://localhost:8080', busKey: 'tb',
      fetchFn: mockFetch({ data: [] }),
    });

    const results: unknown[][] = [];
    for await (const batch of getTraces({
      client, addresses: ['0xABC' as `0x${string}`],
    })) {
      results.push(batch);
    }
    expect(results).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd packages/sdk && npx vitest run src/__tests__/trueblocks/balances.test.ts src/__tests__/trueblocks/traces.test.ts`
Expected: FAIL — modules not found

- [ ] **Step 4: Implement balance history**

```typescript
// packages/sdk/src/trueblocks/balances.ts
import type { Address } from 'viem';
import type { GetBalanceHistoryOptions, BalanceChange } from './types.js';

type RawBalanceChange = {
  address: string;
  blockNumber: number;
  transactionIndex: number;
};

function parseBalanceChange(raw: RawBalanceChange): BalanceChange {
  return {
    address: raw.address.toLowerCase() as Address,
    blockNumber: BigInt(raw.blockNumber),
    transactionIndex: raw.transactionIndex,
  };
}

/**
 * Queries which blocks an address's balance changed at.
 * Does NOT return actual balances — returns block numbers where changes occurred.
 * The caller queries the RPC at those blocks for actual values.
 */
export async function* getBalanceHistory(
  options: GetBalanceHistoryOptions,
): AsyncGenerator<BalanceChange[]> {
  const { client, addresses, asset, firstBlock, lastBlock, onProgress } = options;

  const params: Record<string, string> = {
    addrs: addresses.join(','),
    balances: 'true',
    changes: 'true',
  };
  if (asset) params.asset = asset;
  if (firstBlock !== undefined) params.firstBlock = firstBlock.toString();
  if (lastBlock !== undefined) params.lastBlock = lastBlock.toString();

  let totalFound = 0;

  for await (const page of client.requestPaginated<RawBalanceChange>('/export', params)) {
    if (page.length === 0) continue;

    const parsed = page.map(parseBalanceChange);
    totalFound += parsed.length;

    onProgress?.({
      type: 'scan',
      currentBlock: parsed[parsed.length - 1].blockNumber,
      endBlock: lastBlock ?? 0n,
      addressesFound: totalFound,
    });

    yield parsed;
  }
}
```

- [ ] **Step 5: Implement traces**

```typescript
// packages/sdk/src/trueblocks/traces.ts
import type { Address, Hex } from 'viem';
import type { GetTracesOptions, TrueBlocksTrace } from './types.js';

type RawTrace = {
  from: string;
  to: string;
  value: string;
  hash: string;
  blockNumber: number;
  type: string;
  traceAddress: string;
};

function parseTrace(raw: RawTrace): TrueBlocksTrace {
  const depth = raw.traceAddress ? raw.traceAddress.split('.').length : 0;
  return {
    from: raw.from.toLowerCase() as Address,
    to: raw.to.toLowerCase() as Address,
    value: BigInt(raw.value),
    hash: raw.hash as Hex,
    blockNumber: BigInt(raw.blockNumber),
    traceType: raw.type,
    depth,
  };
}

/**
 * Exports internal call traces for addresses via TrueBlocks.
 * Traces show contract-to-contract interactions at any depth.
 */
export async function* getTraces(
  options: GetTracesOptions,
): AsyncGenerator<TrueBlocksTrace[]> {
  const { client, addresses, firstBlock, lastBlock, onProgress } = options;

  const params: Record<string, string> = {
    addrs: addresses.join(','),
    traces: 'true',
  };
  if (firstBlock !== undefined) params.firstBlock = firstBlock.toString();
  if (lastBlock !== undefined) params.lastBlock = lastBlock.toString();

  let totalFound = 0;

  for await (const page of client.requestPaginated<RawTrace>('/export', params)) {
    if (page.length === 0) continue;

    const parsed = page.map(parseTrace);
    totalFound += parsed.length;

    onProgress?.({
      type: 'scan',
      currentBlock: parsed[parsed.length - 1].blockNumber,
      endBlock: lastBlock ?? 0n,
      addressesFound: totalFound,
    });

    yield parsed;
  }
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd packages/sdk && npx vitest run src/__tests__/trueblocks/balances.test.ts src/__tests__/trueblocks/traces.test.ts`
Expected: PASS — all 7 tests

- [ ] **Step 7: Commit**

```bash
git add packages/sdk/src/trueblocks/balances.ts packages/sdk/src/trueblocks/traces.ts \
  packages/sdk/src/__tests__/trueblocks/balances.test.ts packages/sdk/src/__tests__/trueblocks/traces.test.ts
git commit -m "feat(sdk): add TrueBlocks balance history and trace scanners"
```

---

### Task 6: Pipeline integration + barrel exports

**Files:**
- Create: `packages/sdk/src/trueblocks/index.ts`
- Modify: `packages/sdk/src/types.ts`
- Modify: `packages/sdk/src/pipeline/sources.ts`
- Modify: `packages/sdk/src/pipeline/filters.ts`
- Modify: `packages/sdk/src/index.ts`

- [ ] **Step 1: Create TrueBlocks barrel exports**

```typescript
// packages/sdk/src/trueblocks/index.ts
export { createTrueBlocksClient, TrueBlocksApiError } from './client.js';
export { getTrueBlocksStatus } from './status.js';
export { getAppearances } from './appearances.js';
export { getTransfers } from './transfers.js';
export { getBalanceHistory } from './balances.js';
export { getTraces } from './traces.js';
export type {
  TrueBlocksClient,
  TrueBlocksClientOptions,
  TrueBlocksStatus,
  Appearance,
  TrueBlocksTransfer,
  BalanceChange,
  TrueBlocksTrace,
  GetAppearancesOptions,
  GetTransfersOptions,
  GetBalanceHistoryOptions,
  GetTracesOptions,
} from './types.js';
```

- [ ] **Step 2: Update SDK types**

In `packages/sdk/src/types.ts`, update the unions:

```typescript
// SourceType: add 'trueblocks-scan'
export type SourceType = 'block-scan' | 'csv' | 'union' | 'explorer-scan' | 'trueblocks-scan';

// FilterType: add 'trueblocks-balance-hint'
export type FilterType =
  | 'contract-check'
  | 'min-balance'
  | 'nonce-range'
  | 'token-recipients'
  | 'csv-exclusion'
  | 'previously-sent'
  | 'registry-check'
  | 'explorer-balance'
  | 'trueblocks-balance-hint';
```

- [ ] **Step 3: Update pipeline sources — add trueblocks-scan**

Add to `packages/sdk/src/pipeline/sources.ts`:

Import at top:
```typescript
import { createTrueBlocksClient } from '../trueblocks/client.js';
import { getAppearances } from '../trueblocks/appearances.js';
import { getTransfers } from '../trueblocks/transfers.js';
```

Add case in `createSource` switch:
```typescript
case 'trueblocks-scan':
  return trueblocksScanSource(params);
```

Add source function:
```typescript
function trueblocksScanSource(params: SourceParams): SourceExecutor {
  return async function* (_rpc, onProgress) {
    const trueBlocksUrl = params.trueBlocksUrl as string;
    const busKey = params.busKey as string;
    const addresses = params.addresses as string[];
    const mode = (params.mode as 'appearances' | 'transfers') ?? 'appearances';
    const extract = (params.extract as 'from' | 'to') ?? 'to';
    const asset = params.asset as string | undefined;
    const firstBlock = params.firstBlock ? BigInt(params.firstBlock as string | number) : undefined;
    const lastBlock = params.lastBlock ? BigInt(params.lastBlock as string | number) : undefined;

    const client = createTrueBlocksClient({ baseUrl: trueBlocksUrl, busKey });
    const seen = new Set<string>();
    const batch: Address[] = [];

    if (mode === 'appearances') {
      for await (const page of getAppearances({
        client,
        addresses: addresses as Address[],
        firstBlock,
        lastBlock,
        onProgress,
      })) {
        for (const a of page) {
          const addr = a.address.toLowerCase();
          if (seen.has(addr)) continue;
          seen.add(addr);
          batch.push(addr as Address);
        }
      }
    } else {
      for await (const page of getTransfers({
        client,
        addresses: addresses as Address[],
        asset: asset as Address | undefined,
        firstBlock,
        lastBlock,
        onProgress,
      })) {
        for (const t of page) {
          const addr = (extract === 'from' ? t.from : t.to).toLowerCase();
          if (seen.has(addr)) continue;
          seen.add(addr);
          batch.push(addr as Address);
        }
      }
    }

    client.destroy();
    if (batch.length > 0) yield batch;
  };
}
```

- [ ] **Step 4: Update pipeline filters — add trueblocks-balance-hint**

Add to `packages/sdk/src/pipeline/filters.ts`:

Import at top:
```typescript
import { createTrueBlocksClient } from '../trueblocks/client.js';
import { getBalanceHistory } from '../trueblocks/balances.js';
```

Add case in `createFilter` switch:
```typescript
case 'trueblocks-balance-hint':
  return trueBlocksBalanceHintFilter(params);
```

Add filter function:
```typescript
function trueBlocksBalanceHintFilter(params: FilterParams): FilterExecutor {
  const trueBlocksUrl = params.trueBlocksUrl as string;
  const busKey = params.busKey as string;
  const asset = params.asset as string | undefined;
  const minChanges = (params.minChanges as number) ?? 1;

  return async (addresses, _rpc, onProgress) => {
    const client = createTrueBlocksClient({ baseUrl: trueBlocksUrl, busKey });
    const changeCounts = new Map<string, number>();

    for (const addr of addresses) {
      changeCounts.set(addr.toLowerCase(), 0);
    }

    for await (const page of getBalanceHistory({
      client,
      addresses: [...addresses],
      asset: asset as Address | undefined,
    })) {
      for (const change of page) {
        const key = change.address.toLowerCase();
        changeCounts.set(key, (changeCounts.get(key) ?? 0) + 1);
      }
    }

    const result = new Set<Address>();
    for (const addr of addresses) {
      const count = changeCounts.get(addr.toLowerCase()) ?? 0;
      if (count >= minChanges) result.add(addr);
    }

    client.destroy();

    onProgress?.({
      type: 'filter',
      filterName: 'trueblocks-balance-hint',
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
// TrueBlocks
export {
  createTrueBlocksClient,
  TrueBlocksApiError,
  getTrueBlocksStatus,
  getAppearances,
  getTransfers,
  getBalanceHistory,
  getTraces,
} from './trueblocks/index.js';
export type {
  TrueBlocksClient,
  TrueBlocksClientOptions,
  TrueBlocksStatus,
  Appearance,
  TrueBlocksTransfer,
  BalanceChange,
  TrueBlocksTrace,
  GetAppearancesOptions,
  GetTransfersOptions,
  GetBalanceHistoryOptions,
  GetTracesOptions,
} from './trueblocks/index.js';
```

- [ ] **Step 6: Build and test**

Run: `cd packages/sdk && npx tsc && npx vitest run`
Expected: Clean build, all tests pass

- [ ] **Step 7: Commit**

```bash
git add packages/sdk/src/trueblocks/index.ts \
  packages/sdk/src/types.ts \
  packages/sdk/src/pipeline/sources.ts \
  packages/sdk/src/pipeline/filters.ts \
  packages/sdk/src/index.ts
git commit -m "feat(sdk): integrate TrueBlocks scanner into pipeline and SDK exports"
```

---

### Task 7: Integration tests (real data)

**Files:**
- Create: `packages/sdk/src/__tests__/trueblocks/integration.test.ts`

- [ ] **Step 1: Write gated integration tests**

```typescript
// packages/sdk/src/__tests__/trueblocks/integration.test.ts
import { describe, it, expect } from 'vitest';
import { createTrueBlocksClient } from '../../trueblocks/client.js';
import { getTrueBlocksStatus } from '../../trueblocks/status.js';
import { getAppearances } from '../../trueblocks/appearances.js';
import { getTransfers } from '../../trueblocks/transfers.js';
import { getBalanceHistory } from '../../trueblocks/balances.js';
import { getTraces } from '../../trueblocks/traces.js';

const TRUEBLOCKS_URL = process.env.TRUEBLOCKS_URL;
const describeIf = TRUEBLOCKS_URL ? describe : describe.skip;

// Well-known test data
const USDC = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' as `0x${string}`;
const BLOCK_START = 19000000n;
const BLOCK_END = 19000100n;

function createClient() {
  return createTrueBlocksClient({
    baseUrl: TRUEBLOCKS_URL!,
    busKey: 'trueblocks-integration',
  });
}

describeIf('TrueBlocks integration (real data)', () => {
  it('status: reports healthy instance', async () => {
    const client = createClient();
    const status = await getTrueBlocksStatus(client);
    expect(status.isReady).toBe(true);
    expect(status.chainId).toBe(1);
    expect(status.clientVersion).toBeTruthy();
    client.destroy();
  });

  it('appearances: lists appearances for USDC in block range', async () => {
    const client = createClient();
    let count = 0;
    for await (const batch of getAppearances({
      client,
      addresses: [USDC],
      firstBlock: BLOCK_START,
      lastBlock: BLOCK_END,
    })) {
      for (const a of batch) {
        expect(a.blockNumber).toBeGreaterThanOrEqual(BLOCK_START);
        expect(a.blockNumber).toBeLessThanOrEqual(BLOCK_END);
        expect(a.address).toBe(USDC);
        count++;
      }
    }
    expect(count).toBeGreaterThan(0);
    client.destroy();
  });

  it('transfers: exports transfers for USDC in block range', async () => {
    const client = createClient();
    let count = 0;
    for await (const batch of getTransfers({
      client,
      addresses: [USDC],
      firstBlock: BLOCK_START,
      lastBlock: BLOCK_END,
    })) {
      for (const t of batch) {
        expect(typeof t.from).toBe('string');
        expect(typeof t.to).toBe('string');
        expect(typeof t.value).toBe('bigint');
        expect(typeof t.hash).toBe('string');
        expect(t.hash.startsWith('0x')).toBe(true);
        expect(t.blockNumber).toBeGreaterThanOrEqual(BLOCK_START);
        expect(t.timestamp).toBeGreaterThan(1700000000);
        count++;
      }
    }
    expect(count).toBeGreaterThan(0);
    client.destroy();
  });

  it('balanceHistory: returns block hints for active address', async () => {
    const client = createClient();
    let count = 0;
    for await (const batch of getBalanceHistory({
      client,
      addresses: [USDC],
      firstBlock: BLOCK_START,
      lastBlock: BLOCK_END,
    })) {
      for (const b of batch) {
        expect(b.blockNumber).toBeGreaterThanOrEqual(BLOCK_START);
        expect(b.blockNumber).toBeLessThanOrEqual(BLOCK_END);
        count++;
      }
    }
    // USDC contract may or may not have balance changes in this range
    // Just verify the call succeeds and returns valid data
    expect(count).toBeGreaterThanOrEqual(0);
    client.destroy();
  });

  it('traces: exports traces for USDC in block range', async () => {
    const client = createClient();
    let count = 0;
    for await (const batch of getTraces({
      client,
      addresses: [USDC],
      firstBlock: BLOCK_START,
      lastBlock: BLOCK_END,
    })) {
      for (const t of batch) {
        expect(typeof t.from).toBe('string');
        expect(typeof t.to).toBe('string');
        expect(typeof t.value).toBe('bigint');
        expect(['call', 'create', 'delegatecall', 'suicide', 'staticcall']).toContain(t.traceType);
        expect(t.depth).toBeGreaterThanOrEqual(0);
        count++;
      }
    }
    expect(count).toBeGreaterThan(0);
    client.destroy();
  });
});
```

- [ ] **Step 2: Run tests (they should skip without TRUEBLOCKS_URL)**

Run: `cd packages/sdk && npx vitest run src/__tests__/trueblocks/integration.test.ts`
Expected: Tests skip with message about describe.skip (no `TRUEBLOCKS_URL` set)

- [ ] **Step 3: If you have a local TrueBlocks instance, run with URL**

Run: `cd packages/sdk && TRUEBLOCKS_URL=http://localhost:8080 npx vitest run src/__tests__/trueblocks/integration.test.ts`
Expected: Tests run against real instance and pass (or skip this step if no instance available)

- [ ] **Step 4: Commit**

```bash
git add packages/sdk/src/__tests__/trueblocks/integration.test.ts
git commit -m "test(sdk): add TrueBlocks integration tests with real data"
```

---

### Task 8: Final verification

**Files:** None (verification only)

- [ ] **Step 1: Run full SDK tests**

Run: `cd packages/sdk && npx vitest run`
Expected: All new TrueBlocks tests pass + all existing tests pass (except pre-existing Anvil failures)

- [ ] **Step 2: TypeScript check all packages**

Run: `cd packages/sdk && npx tsc --noEmit && cd ../tui && npx tsc --noEmit && cd ../web && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Verify TrueBlocks exports accessible from SDK**

Run: `cd packages/sdk && node -e "import('@titrate/sdk').then(m => console.log(Object.keys(m).filter(k => k.toLowerCase().includes('trueblocks') || k.toLowerCase().includes('appearance') || k.toLowerCase().includes('trace')).sort().join('\n')))"`
Expected: Lists TrueBlocks-related exports

- [ ] **Step 4: Run web tests for no regressions**

Run: `cd packages/web && npx vitest run`
Expected: All 64 component tests pass

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve issues found during verification"
```

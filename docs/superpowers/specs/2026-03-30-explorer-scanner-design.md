# Explorer API Scanner — SDK Module Design

## Overview

Add Etherscan-compatible block explorer API support to `@titrate/sdk`. Provides an alternative to RPC-based scanning that covers wider block ranges faster by leveraging the explorer's pre-built index. Works with Etherscan, Basescan, Arbiscan, PulseChain Scan, and any API-compatible explorer.

## Motivation

The existing RPC scanner (`scanTransferEvents`, `scanBlocks`) queries raw chain data via `eth_getLogs` and `eth_getBlockByNumber`. This works universally but is slow for wide ranges — the dynamic titration algorithm must probe range sizes and backoff on errors. Explorer APIs have already indexed this data and can return thousands of transfers in a single paginated call.

## Architecture

### Module: `packages/sdk/src/explorer/`

| File | Responsibility |
|------|----------------|
| `bus.ts` | Per-domain adaptive rate-limited HTTP queue |
| `client.ts` | Etherscan-compatible API client (response parsing, error handling) |
| `transfers.ts` | `scanTokenTransfers` — ERC-20 transfer history |
| `transactions.ts` | `scanTransactions` + `scanInternalTransactions` |
| `balances.ts` | `getTokenBalances` + `getNativeBalances` |
| `titrate.ts` | Block range bisection for 10k-result cap |
| `types.ts` | All explorer-specific types |
| `index.ts` | Barrel exports |

### Tests: `packages/sdk/src/__tests__/explorer/`

| File | Covers |
|------|--------|
| `bus.test.ts` | Adaptive rate limiting, 429 handling, domain keying |
| `client.test.ts` | Response parsing, error detection, retry |
| `transfers.test.ts` | Token transfer scanning with pagination and bisection |
| `transactions.test.ts` | Normal + internal transaction scanning |
| `balances.test.ts` | Token and native balance batch queries |
| `titrate.test.ts` | Bisection logic, range learning |

## Explorer Bus

### Concept

A per-domain HTTP queue with adaptive rate limiting. All SDK functions targeting the same explorer domain share one bus instance. The bus starts **unthrottled** and learns the rate limit from 429 responses.

### Adaptive Rate Limiting Algorithm

1. **Initial state:** No rate limit enforced. Requests fire immediately.
2. **First 429 received:** Record the request rate that caused it. Set enforced limit to 80% of that rate.
3. **Subsequent 429s:** Reduce enforced limit by 5% each time.
4. **Sustained success:** No automatic increase. The discovered rate is the ceiling.
5. **Floor:** Never drop below 1 request/second.

Rate is measured via a sliding window of request timestamps (last 5 seconds).

### Interface

```typescript
type ExplorerBusOptions = {
  readonly apiKey: string;
  readonly fetchFn?: typeof fetch;  // injectable for testing
};

type ExplorerBus = {
  readonly domain: string;
  request<T>(params: Record<string, string>): Promise<T>;
  getCurrentRate(): number | null;  // null = unthrottled, number = enforced limit
  destroy(): void;
};

function createExplorerBus(explorerApiUrl: string, options: ExplorerBusOptions): ExplorerBus;
```

### Bus Registry

```typescript
function getOrCreateBus(explorerApiUrl: string, apiKey: string): ExplorerBus;
function destroyAllBuses(): void;
```

Keyed by domain extracted from `explorerApiUrl`. Multiple calls with the same domain return the same bus. This ensures scanning + balance checking + any other operations all share one throttle.

### Request Flow

```
caller → bus.request(params)
  → acquire slot (wait if rate-limited)
  → fetch(explorerApiUrl + queryString)
  → parse JSON response
  → if status === "0" and result contains rate limit error → 429 handling
  → if status === "0" and other error → throw ExplorerApiError
  → if status === "1" → return parsed result
  → retry on network errors (3 attempts, exponential backoff)
```

## Explorer API Client

### Response Handling

Etherscan responses have this shape:

```json
{
  "status": "1",
  "message": "OK",
  "result": [...]
}
```

Error responses:
```json
{
  "status": "0",
  "message": "NOTOK",
  "result": "Max rate limit reached"
}
```

The client layer normalizes these into proper errors:

```typescript
class ExplorerApiError extends Error {
  constructor(
    readonly explorerMessage: string,
    readonly explorerStatus: string,
    readonly isRateLimit: boolean,
  ) { ... }
}
```

Rate limit detection: response result string contains "rate limit" or "Max rate" (case-insensitive).

## Explorer Titration (Block Range Bisection)

### Problem

Etherscan caps results at 10,000 per query. If a block range contains more transfers, results are silently truncated (returns exactly 10,000 sorted by block number ascending).

### Strategy

1. **Start** with the full requested block range.
2. **Query** the range via the bus.
3. **If result count === 10,000** → range is too wide. **Bisect**: split into `[start, mid]` and `[mid+1, end]`, process each recursively.
4. **If result count < 10,000** → range is complete. Yield results. Record this range size as the "learned window."
5. **Next range** starts at `lastEnd + 1` and uses the learned window size (avoiding re-bisection from scratch for subsequent chunks).
6. **Growth:** If a learned window returns < 5,000 results (well under the cap), grow by 25% for the next chunk.

### Interface

```typescript
type ExplorerTitrateState = {
  learnedRange: bigint | null;  // null = not yet learned, use full range
};

function createExplorerTitrateState(): ExplorerTitrateState;
```

The titration is internal to the scanner functions — not exposed as public API. The scanner handles bisection transparently.

### Bisection Depth Limit

Maximum recursion depth of 20 (covers block ranges up to 2^20 × minimum_chunk ≈ billions of blocks). If exceeded, throw an error — the token is too active for the block range and should be narrowed manually.

## Scanner Functions

### 1. scanTokenTransfers

```typescript
type ScanTokenTransfersOptions = {
  readonly bus: ExplorerBus;
  readonly tokenAddress: Address;
  readonly startBlock?: bigint;  // default 0
  readonly endBlock?: bigint;    // default 99999999 (Etherscan convention for "latest")
  readonly onProgress?: ProgressCallback;
};

async function* scanTokenTransfers(
  options: ScanTokenTransfersOptions,
): AsyncGenerator<TokenTransfer[]>;
```

- Uses `module=account&action=tokentx&contractaddress=<token>&startblock=<n>&endblock=<n>&sort=asc`
- Yields pages of `TokenTransfer` objects
- Applies block range bisection when results hit 10k cap
- Emits `scan` progress events

### 2. scanTransactions

```typescript
type ScanTransactionsOptions = {
  readonly bus: ExplorerBus;
  readonly address: Address;
  readonly startBlock?: bigint;
  readonly endBlock?: bigint;
  readonly onProgress?: ProgressCallback;
};

async function* scanTransactions(
  options: ScanTransactionsOptions,
): AsyncGenerator<Transaction[]>;
```

- Uses `module=account&action=txlist&address=<addr>&startblock=<n>&endblock=<n>&sort=asc`
- Yields pages of `Transaction` objects
- Same bisection strategy

### 3. scanInternalTransactions

```typescript
async function* scanInternalTransactions(
  options: ScanTransactionsOptions,
): AsyncGenerator<InternalTransaction[]>;
```

- Uses `module=account&action=txlistinternal&address=<addr>&startblock=<n>&endblock=<n>&sort=asc`
- Same interface as `scanTransactions` but returns `InternalTransaction` (no `isError` field)

### 4. getTokenBalances

```typescript
type GetTokenBalancesOptions = {
  readonly bus: ExplorerBus;
  readonly tokenAddress: Address;
  readonly addresses: readonly Address[];
  readonly onProgress?: ProgressCallback;
};

async function getTokenBalances(
  options: GetTokenBalancesOptions,
): Promise<readonly TokenBalance[]>;
```

- Uses `module=account&action=tokenbalance&contractaddress=<token>&address=<addr>`
- Single address per call (Etherscan limitation for token balances)
- Batches through the bus with concurrency managed by the bus rate limiter
- Returns `{ address, balance: bigint }[]`

### 5. getNativeBalances

```typescript
type GetNativeBalancesOptions = {
  readonly bus: ExplorerBus;
  readonly addresses: readonly Address[];
  readonly onProgress?: ProgressCallback;
};

async function getNativeBalances(
  options: GetNativeBalancesOptions,
): Promise<readonly TokenBalance[]>;
```

- Uses `module=account&action=balancemulti&address=<comma-separated>&tag=latest`
- Up to 20 addresses per call (Etherscan batch limit)
- Chunks addresses into groups of 20, fires through bus
- Returns `{ address, balance: bigint }[]`

## Types

```typescript
type TokenTransfer = {
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

type Transaction = {
  readonly from: Address;
  readonly to: Address | null;  // null for contract creation
  readonly value: bigint;
  readonly hash: Hex;
  readonly blockNumber: bigint;
  readonly timestamp: number;
  readonly isError: boolean;
  readonly gasUsed: bigint;
};

type InternalTransaction = {
  readonly from: Address;
  readonly to: Address;
  readonly value: bigint;
  readonly hash: Hex;
  readonly blockNumber: bigint;
  readonly type: string;  // 'call', 'create', 'delegatecall', etc.
};

type TokenBalance = {
  readonly address: Address;
  readonly balance: bigint;
};
```

## Pipeline Integration

### New Source Type: `'explorer-scan'`

Added to `SourceType`:
```typescript
type SourceType = 'block-scan' | 'csv' | 'union' | 'explorer-scan';
```

Source params:
```typescript
{
  explorerApiUrl: string;
  apiKey: string;
  tokenAddress: string;
  startBlock?: string;
  endBlock?: string;
  extract: 'from' | 'to';  // which side of transfers to collect
}
```

The source executor:
1. Creates/reuses an `ExplorerBus` for the domain
2. Calls `scanTokenTransfers` with the params
3. Extracts the requested field (`from` or `to`) from each transfer
4. Yields deduplicated addresses (lowercased)

### New Filter Type: `'explorer-balance'`

Added to `FilterType`:
```typescript
type FilterType = ... | 'explorer-balance';
```

Filter params:
```typescript
{
  explorerApiUrl: string;
  apiKey: string;
  tokenAddress: string;   // token to check, or "native" for ETH/PLS
  minBalance: string;     // minimum balance as decimal string
}
```

The filter executor:
1. Creates/reuses an `ExplorerBus` for the domain
2. Calls `getTokenBalances` or `getNativeBalances` depending on `tokenAddress`
3. Filters addresses below `minBalance`
4. Returns the filtered set

This is an alternative to the RPC-based `'min-balance'` filter — faster for large sets because native balance multi-query handles 20 addresses per call.

## SDK Barrel Exports

Add to `packages/sdk/src/index.ts`:

```typescript
// Explorer
export { createExplorerBus, getOrCreateBus, destroyAllBuses } from './explorer/index.js';
export { scanTokenTransfers } from './explorer/index.js';
export { scanTransactions, scanInternalTransactions } from './explorer/index.js';
export { getTokenBalances, getNativeBalances } from './explorer/index.js';
export type {
  ExplorerBus, ExplorerBusOptions,
  TokenTransfer, Transaction, InternalTransaction, TokenBalance,
  ScanTokenTransfersOptions, ScanTransactionsOptions,
  GetTokenBalancesOptions, GetNativeBalancesOptions,
  ExplorerApiError,
} from './explorer/index.js';
```

Update `SourceType` and `FilterType` in `types.ts`.

## Testing Strategy

All tests use mocked HTTP responses (no real Etherscan calls). The bus accepts an injectable `fetchFn` for this purpose.

### Bus Tests
- Starts unthrottled — requests fire immediately
- First 429 → sets rate to 80% of burst rate
- Subsequent 429s → reduces by 5% each
- Floor at 1 req/sec
- Domain keying — same domain shares bus
- Different domains get separate buses
- `destroy()` cleans up timers

### Client Tests
- Parses successful responses (`status: "1"`)
- Detects rate limit errors and signals bus
- Detects other API errors (invalid key, invalid params)
- Retries on network errors (3 attempts)

### Transfer Scanner Tests
- Yields all transfers when under 10k limit
- Bisects when results === 10,000
- Learned range carries forward to next chunk
- Growth when results well under cap
- Correctly extracts `from`/`to` addresses
- Progress events emitted

### Transaction Scanner Tests
- Normal transactions with error field
- Internal transactions without error field
- Same bisection logic as transfers

### Balance Tests
- Token balances (single address per call)
- Native balances (batch of 20 per call)
- Handles zero balances
- Handles invalid addresses gracefully

### Titration Tests
- Bisection on exactly 10,000 results
- No bisection under 10,000
- Learned range used for subsequent queries
- Growth when under 5,000 results
- Max depth limit (20 levels)

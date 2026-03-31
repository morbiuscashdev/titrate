# TrueBlocks Scanner — SDK Module Design

## Overview

Add TrueBlocks integration to `@titrate/sdk`. TrueBlocks is a self-hosted appearance indexer — it tells you *where* an address appeared on-chain (which transactions, which blocks) but does not hold balances. Balance lookups still go through the RPC. TrueBlocks accelerates the pipeline by eliminating blind block scanning — it knows exactly which blocks matter.

Currently Ethereum-only, but the app doesn't enforce chain restrictions. If the user points Titrate at a TrueBlocks instance indexing another chain, it works.

## How TrueBlocks Differs from Explorer APIs

| Capability | Explorer (Etherscan) | TrueBlocks | RPC |
|-----------|---------------------|------------|-----|
| Token transfers | Yes (indexed) | Yes (via appearances + export) | Yes (eth_getLogs, slow) |
| Transaction history | Yes | Yes | No (need to scan blocks) |
| Internal transactions | Yes | Yes (traces) | Yes (debug_traceTransaction) |
| Balances | Yes (current only) | No — feeds block hints to RPC | Yes (any block) |
| Balance change history | No | Yes (which blocks had changes) | No (need to scan) |
| Rate limits | Yes (API key tiers) | No (self-hosted) | Yes (provider limits) |
| Result caps | 10k per query | No limit | Varies |
| Appearances (any trace depth) | No | Yes (unique to TrueBlocks) | No |

**Key insight:** TrueBlocks is not a replacement for the RPC — it's an *accelerator*. It narrows the search space so RPC queries are targeted, not exhaustive.

## Architecture

### Module: `packages/sdk/src/trueblocks/`

| File | Responsibility |
|------|----------------|
| `types.ts` | TrueBlocks-specific types |
| `client.ts` | HTTP client for TrueBlocks API (request helper, error handling) |
| `appearances.ts` | `getAppearances` — every tx an address appeared in |
| `transfers.ts` | `getTransfers` — token transfer history |
| `balances.ts` | `getBalanceHistory` — block hints where balance changed |
| `traces.ts` | `getTraces` — internal call traces |
| `status.ts` | `getTrueBlocksStatus` — health check + chain info |
| `index.ts` | Barrel exports |

### Tests: `packages/sdk/src/__tests__/trueblocks/`

| File | Covers |
|------|--------|
| `client.test.ts` | Request construction, error handling, pagination |
| `appearances.test.ts` | Appearance listing with block range filters |
| `transfers.test.ts` | Token transfer export |
| `balances.test.ts` | Balance change detection + block hints |
| `traces.test.ts` | Internal call trace export |
| `status.test.ts` | Health check parsing |

## TrueBlocks Client

### Request Helper

TrueBlocks API is simple — GET requests with query params, JSON responses. No API key needed (self-hosted). No rate limits needed (your own server). Uses a `RequestBus` keyed by `trueBlocksBusKey` for consistency (user might still want throttling if the TrueBlocks instance is on a shared server).

```typescript
type TrueBlocksClientOptions = {
  readonly baseUrl: string;       // e.g. "http://localhost:8080"
  readonly busKey: string;        // for RequestBus
  readonly fetchFn?: typeof fetch;
};

function createTrueBlocksClient(options: TrueBlocksClientOptions): TrueBlocksClient;
```

### Response Format

TrueBlocks returns:
```json
{
  "data": [...]
}
```

Error responses return HTTP error codes (not status fields like Etherscan).

### Pagination

TrueBlocks uses `firstRecord` + `maxRecords` for pagination. The client auto-paginates: fetch pages until the result count is less than `maxRecords`.

```typescript
type TrueBlocksClient = {
  readonly baseUrl: string;
  request<T>(endpoint: string, params: Record<string, string>): Promise<T[]>;
  requestPaginated<T>(endpoint: string, params: Record<string, string>, pageSize?: number): AsyncGenerator<T[]>;
  destroy(): void;
};
```

## Scanner Functions

### 1. getAppearances

Lists every transaction where an address appeared — at any trace depth. This is TrueBlocks' unique capability. The appearance list tells you "address X was involved in transactions at blocks [100, 250, 890, ...]" without fetching the full transaction data.

```typescript
type Appearance = {
  readonly address: Address;
  readonly blockNumber: bigint;
  readonly transactionIndex: number;
};

type GetAppearancesOptions = {
  readonly client: TrueBlocksClient;
  readonly addresses: readonly Address[];
  readonly firstBlock?: bigint;
  readonly lastBlock?: bigint;
  readonly onProgress?: ProgressCallback;
};

async function* getAppearances(
  options: GetAppearancesOptions,
): AsyncGenerator<Appearance[]>;
```

- Endpoint: `/list?addrs=<addr>&firstBlock=<n>&lastBlock=<n>`
- Yields pages of appearances
- No result cap — TrueBlocks handles the full history

**Pipeline use case:** "Find all addresses that interacted with contract X" → collect unique addresses from appearances.

### 2. getTransfers

Exports token transfer events for an address. Similar to the explorer's `tokentx` but without result caps.

```typescript
type TrueBlocksTransfer = {
  readonly from: Address;
  readonly to: Address;
  readonly value: bigint;
  readonly asset: string;         // token address or "ETH"
  readonly blockNumber: bigint;
  readonly transactionIndex: number;
  readonly hash: Hex;
  readonly timestamp: number;
};

type GetTransfersOptions = {
  readonly client: TrueBlocksClient;
  readonly addresses: readonly Address[];
  readonly asset?: Address;       // filter by specific token
  readonly firstBlock?: bigint;
  readonly lastBlock?: bigint;
  readonly onProgress?: ProgressCallback;
};

async function* getTransfers(
  options: GetTransfersOptions,
): AsyncGenerator<TrueBlocksTransfer[]>;
```

- Endpoint: `/export?addrs=<addr>&accounting&asset=<token>&firstBlock=<n>&lastBlock=<n>`
- Yields pages of transfer records
- Optional `asset` filter for specific token

**Pipeline use case:** Same as explorer scanner — collect recipient addresses from token transfer history.

### 3. getBalanceHistory

Queries which blocks an address's balance changed at. Does NOT return the actual balance — returns block numbers where changes occurred. The caller then queries the RPC at those specific blocks for the actual values.

```typescript
type BalanceChange = {
  readonly address: Address;
  readonly blockNumber: bigint;
  readonly transactionIndex: number;
};

type GetBalanceHistoryOptions = {
  readonly client: TrueBlocksClient;
  readonly addresses: readonly Address[];
  readonly asset?: Address;       // token address, or omit for native
  readonly firstBlock?: bigint;
  readonly lastBlock?: bigint;
  readonly onProgress?: ProgressCallback;
};

async function* getBalanceHistory(
  options: GetBalanceHistoryOptions,
): AsyncGenerator<BalanceChange[]>;
```

- Endpoint: `/export?addrs=<addr>&balances&changes&asset=<token>&firstBlock=<n>&lastBlock=<n>`
- The `changes` flag limits output to blocks where balance actually changed
- Yields block numbers — caller fetches actual balances from RPC

**Pipeline use case:** "Which blocks did this address's token balance change?" → query RPC at those blocks for balance snapshots. This replaces scanning every block for balance changes.

### 4. getTraces

Exports internal call traces for an address. Traces show contract-to-contract interactions that don't appear in normal transaction logs.

```typescript
type TrueBlocksTrace = {
  readonly from: Address;
  readonly to: Address;
  readonly value: bigint;
  readonly hash: Hex;
  readonly blockNumber: bigint;
  readonly traceType: string;     // 'call', 'create', 'delegatecall', 'suicide'
  readonly depth: number;
};

type GetTracesOptions = {
  readonly client: TrueBlocksClient;
  readonly addresses: readonly Address[];
  readonly firstBlock?: bigint;
  readonly lastBlock?: bigint;
  readonly onProgress?: ProgressCallback;
};

async function* getTraces(
  options: GetTracesOptions,
): AsyncGenerator<TrueBlocksTrace[]>;
```

- Endpoint: `/export?addrs=<addr>&traces&firstBlock=<n>&lastBlock=<n>`
- Yields pages of trace records

**Pipeline use case:** "Find all addresses that received funds from contract X via internal transactions" — catches interactions that `eth_getLogs` misses.

### 5. getTrueBlocksStatus

Health check — verifies the TrueBlocks instance is running and reports what chain it's indexing.

```typescript
type TrueBlocksStatus = {
  readonly isReady: boolean;
  readonly clientVersion: string;
  readonly chainId: number;
  readonly rpcProvider: string;
  readonly cachePath: string;
};

async function getTrueBlocksStatus(
  client: TrueBlocksClient,
): Promise<TrueBlocksStatus>;
```

- Endpoint: `/status?chains`
- Used during settings configuration to validate the URL

## Pipeline Integration

### New Source Type: `'trueblocks-scan'`

Added to `SourceType`:
```typescript
type SourceType = 'block-scan' | 'csv' | 'union' | 'explorer-scan' | 'trueblocks-scan';
```

Source params:
```typescript
{
  trueBlocksUrl: string;
  busKey: string;
  addresses: string[];         // addresses to scan appearances for
  asset?: string;              // token address to filter transfers, or omit for all
  mode: 'appearances' | 'transfers';  // which scan type
  firstBlock?: string;
  lastBlock?: string;
  extract: 'from' | 'to';     // which side to collect (transfers mode only)
}
```

The source executor:
1. Creates `TrueBlocksClient` using params
2. In `appearances` mode: calls `getAppearances`, extracts unique addresses
3. In `transfers` mode: calls `getTransfers`, extracts `from` or `to` addresses
4. Yields deduplicated addresses

### New Filter Type: `'trueblocks-balance-hint'`

Added to `FilterType`:
```typescript
type FilterType = ... | 'trueblocks-balance-hint';
```

Filter params:
```typescript
{
  trueBlocksUrl: string;
  busKey: string;
  asset?: string;              // token address, or omit for native
  minChanges: number;          // minimum number of balance changes (activity indicator)
}
```

This filter uses `getBalanceHistory` to find addresses with at least `minChanges` balance changes — a proxy for "active" addresses. Addresses with zero or very few changes are likely dust recipients who never interacted with the token.

**Note:** This does NOT check actual balances (TrueBlocks doesn't hold them). It's a heuristic filter based on activity. For actual balance filtering, use `'min-balance'` (RPC) or `'explorer-balance'` (Etherscan).

## Types

```typescript
type Appearance = {
  readonly address: Address;
  readonly blockNumber: bigint;
  readonly transactionIndex: number;
};

type TrueBlocksTransfer = {
  readonly from: Address;
  readonly to: Address;
  readonly value: bigint;
  readonly asset: string;
  readonly blockNumber: bigint;
  readonly transactionIndex: number;
  readonly hash: Hex;
  readonly timestamp: number;
};

type BalanceChange = {
  readonly address: Address;
  readonly blockNumber: bigint;
  readonly transactionIndex: number;
};

type TrueBlocksTrace = {
  readonly from: Address;
  readonly to: Address;
  readonly value: bigint;
  readonly hash: Hex;
  readonly blockNumber: bigint;
  readonly traceType: string;
  readonly depth: number;
};

type TrueBlocksStatus = {
  readonly isReady: boolean;
  readonly clientVersion: string;
  readonly chainId: number;
  readonly rpcProvider: string;
  readonly cachePath: string;
};

type TrueBlocksClientOptions = {
  readonly baseUrl: string;
  readonly busKey: string;
  readonly fetchFn?: typeof fetch;
};

type TrueBlocksClient = {
  readonly baseUrl: string;
  request<T>(endpoint: string, params: Record<string, string>): Promise<T[]>;
  requestPaginated<T>(endpoint: string, params: Record<string, string>, pageSize?: number): AsyncGenerator<T[]>;
  destroy(): void;
};
```

## SDK Barrel Exports

Add to `packages/sdk/src/index.ts`:

```typescript
// TrueBlocks
export {
  createTrueBlocksClient,
  getAppearances,
  getTransfers,
  getBalanceHistory,
  getTraces,
  getTrueBlocksStatus,
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

Update `SourceType` and `FilterType` in `types.ts`.

## Testing Strategy

All tests use mocked HTTP responses via injectable `fetchFn`. No real TrueBlocks instance needed.

### Client Tests
- Constructs correct URL from base + endpoint + params
- Parses `data` array from response
- Handles HTTP error codes
- Auto-pagination: fetches pages until result count < page size
- Passes through RequestBus for throttling

### Appearance Tests
- Lists appearances for single address
- Filters by block range
- Yields pages of Appearance objects
- Handles empty result

### Transfer Tests
- Exports transfers with asset filter
- Extracts from/to addresses
- Handles native ETH transfers (asset = "ETH")
- Block range filtering

### Balance History Tests
- Returns block numbers where balance changed
- Filters by asset
- Empty history for inactive address
- Block range filtering

### Trace Tests
- Exports internal call traces
- Parses trace type and depth
- Block range filtering

### Status Tests
- Parses healthy response
- Handles unreachable instance

# Generic RequestBus — Design Spec

## Overview

Refactor the explorer-specific `ExplorerBus` into a generic rate-limited execution queue. The bus doesn't know about HTTP, JSON-RPC, or REST — it throttles calls to any async function. Explorer, TrueBlocks, and future RPC consumers all use the same bus implementation with protocol-specific wrappers.

## Problem

Currently three separate patterns for rate-limited requests:
1. **ExplorerBus** (`explorer/bus.ts`) — has the adaptive rate limiting algorithm baked in alongside explorer-specific concerns (API key, query string, response parsing)
2. **TrueBlocksClient** (`trueblocks/client.ts`) — uses raw `fetchFn` with no rate limiting at all
3. **RPC calls** (Phase B) — will need rate limiting per provider endpoint

The rate limiting logic is trapped inside `ExplorerBus`. It should be extracted and shared.

## Architecture

### Layer 1: `RequestBus` (generic)

The core primitive. Rate-limits execution of arbitrary async functions.

```typescript
type RequestBus = {
  readonly key: string;
  execute<T>(fn: () => Promise<T>): Promise<T>;
  getCurrentRate(): number | null;
  destroy(): void;
};
```

- **`key`** — user-configurable identifier (not auto-derived from URL). Examples: `"alchemy"`, `"api.etherscan.io"`, `"trueblocks-local"`, `"public-rpc-base"`.
- **`execute(fn)`** — acquires a rate limit slot, then calls `fn()`. If rate-limited, waits before calling. If `fn` throws and the error matches `isRateLimitError`, adjusts the rate and retries.
- **No retries for non-rate-limit errors** — the bus doesn't retry. Retry logic belongs in the caller (explorer client, TrueBlocks client, etc.).
- **In-flight deduplication** — optional `requestKey` parameter. If two `execute()` calls have the same `requestKey` and one is already in-flight, the second returns the same promise instead of firing a new request.

### Layer 2: Protocol wrappers

Thin wrappers that handle protocol-specific concerns:

**Explorer wrapper** (stays in `explorer/`):
- Adds `apikey` to query params
- Constructs URL from base + params
- Parses `{ status, message, result }` response
- Detects rate limit via `isRateLimitResult`
- Retries up to 3 times on network errors

**TrueBlocks wrapper** (stays in `trueblocks/`):
- Constructs URL from base + endpoint + params
- Parses `{ data: [...] }` response
- Auto-paginates via `firstRecord`/`maxRecords`
- Uses bus for throttling (currently has none)

### Bus Registry

```typescript
function getOrCreateBus(key: string, options?: {
  isRateLimitError?: (error: unknown) => boolean;
}): RequestBus;

function destroyBus(key: string): void;
function destroyAllBuses(): void;
```

Keyed by the user-provided `key` string. Same key → same bus → shared throttle. Different keys → independent throttles.

## RequestBus Interface

```typescript
type RequestBusOptions = {
  readonly isRateLimitError?: (error: unknown) => boolean;
};

type RequestBus = {
  readonly key: string;
  execute<T>(fn: () => Promise<T>, requestKey?: string): Promise<T>;
  getCurrentRate(): number | null;
  destroy(): void;
};

function createRequestBus(key: string, options?: RequestBusOptions): RequestBus;
```

### Adaptive Rate Limiting Algorithm

Identical to the current explorer bus:
1. **Initial:** Unthrottled — `execute()` calls `fn()` immediately
2. **First rate limit error:** Set limit to 80% of measured burst rate (sliding 5s window)
3. **Subsequent rate limit errors:** Reduce by 5% each time
4. **Floor:** 1 request/second
5. **No automatic increase** — discovered rate is the ceiling

### In-Flight Deduplication

When `requestKey` is provided:
1. Check if a request with the same key is already in-flight
2. If yes: return the existing promise (no new execution)
3. If no: execute normally, store the promise, remove when settled

This prevents duplicate fetches when React re-renders trigger the same query. The dedup map is keyed by `requestKey` string and entries are removed on resolve/reject.

```typescript
// Internal state
const inFlight = new Map<string, Promise<unknown>>();
```

## File Structure

### New file

| File | Responsibility |
|------|----------------|
| `packages/sdk/src/request-bus.ts` | `RequestBus` type, `createRequestBus`, `getOrCreateBus`, `destroyBus`, `destroyAllBuses` |

### Modified files

| File | Change |
|------|--------|
| `packages/sdk/src/explorer/bus.ts` | Refactor to use `RequestBus` internally. `createExplorerBus` becomes a thin wrapper. |
| `packages/sdk/src/explorer/types.ts` | `ExplorerBus.request` still works but delegates to `RequestBus.execute` |
| `packages/sdk/src/trueblocks/client.ts` | Use `RequestBus` for all HTTP requests |
| `packages/sdk/src/trueblocks/types.ts` | `busKey` field used to get/create bus |
| `packages/sdk/src/index.ts` | Export `RequestBus` types and factory functions |

### Test files

| File | Covers |
|------|--------|
| `packages/sdk/src/__tests__/request-bus.test.ts` | Generic bus: rate limiting, deduplication, registry, destroy |

Existing explorer and TrueBlocks tests should continue passing unchanged — the bus refactor is internal.

## Migration Strategy

### ExplorerBus

Currently `createExplorerBus` contains:
- Rate limiting logic (→ moves to `RequestBus`)
- URL construction (→ stays in explorer wrapper)
- Response parsing (→ stays in explorer wrapper)
- API key injection (→ stays in explorer wrapper)
- Retry on network errors (→ stays in explorer wrapper)
- Rate limit error detection (→ passed to `RequestBus` as `isRateLimitError`)

After refactor:
```typescript
export function createExplorerBus(explorerApiUrl: string, options: ExplorerBusOptions): ExplorerBus {
  const bus = getOrCreateBus(options.busKey ?? new URL(explorerApiUrl).hostname, {
    isRateLimitError: (err) => err instanceof ExplorerApiError && err.isRateLimit,
  });

  async function request<T>(params: Record<string, string>): Promise<T> {
    return bus.execute(async () => {
      // URL construction, fetch, response parsing, retry — all here
    });
  }

  return { domain: new URL(explorerApiUrl).hostname, request, getCurrentRate: bus.getCurrentRate, destroy: bus.destroy };
}
```

The `getOrCreateBus` in `explorer/bus.ts` is replaced by the generic `getOrCreateBus` from `request-bus.ts`.

### TrueBlocksClient

Currently uses raw `fetchFn` with no throttling. After refactor:
```typescript
export function createTrueBlocksClient(options: TrueBlocksClientOptions): TrueBlocksClient {
  const bus = getOrCreateBus(options.busKey);

  async function request<T>(endpoint: string, params: Record<string, string>): Promise<T[]> {
    return bus.execute(async () => {
      // URL construction, fetch, response parsing — all here
    });
  }
  // ...
}
```

### ExplorerBus type change

Add optional `busKey` to `ExplorerBusOptions`:
```typescript
type ExplorerBusOptions = {
  readonly apiKey: string;
  readonly busKey?: string;        // key for RequestBus registry, defaults to URL domain
  readonly fetchFn?: typeof fetch;
};
```

## Testing Strategy

### RequestBus unit tests
- Starts unthrottled — `execute()` fires immediately
- First rate limit error → enforces 80% of burst rate
- Subsequent rate limit errors → reduces by 5%
- Floor at 1 req/sec
- Custom `isRateLimitError` predicate works
- In-flight deduplication — same `requestKey` returns same promise
- Different `requestKey` values execute independently
- Dedup entry removed after settlement
- Registry: same key returns same bus
- Registry: different keys return different buses
- `destroyBus` removes specific bus
- `destroyAllBuses` clears registry

### Existing tests
All explorer and TrueBlocks tests should pass unchanged — the refactor is internal to the bus implementation.

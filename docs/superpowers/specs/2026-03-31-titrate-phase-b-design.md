# Titrate Web App — Phase B: Distribution MVP

## Overview

Wire up the Phase C component library into a working single-campaign distribution flow. Adds wallet connection (Reown AppKit), encrypted IndexedDB persistence, React Router, step locking, perry mode, and a generic request bus for rate-limited RPC + explorer API access.

## Scope

Phase B produces a working distribution tool: create a campaign, load addresses, configure filters, set amounts, connect wallet, check requirements, deploy contract, distribute tokens. Multi-campaign dashboard is the home page but campaign CRUD (clone, archive) is deferred to Phase A.

## Dependencies (new for `packages/web`)

- `react-router` — client-side routing
- `@reown/appkit` + `@reown/appkit-adapter-wagmi` — wallet modal
- `wagmi` — chain interaction (required by Reown)
- `@tanstack/react-query` — query caching (required by wagmi, also used for SDK call caching)
- `viem` — direct usage for PublicClient construction

## SDK Changes

### Generic RequestBus

Refactor `packages/sdk/src/explorer/bus.ts` into a generic rate-limited execution queue. The bus doesn't know about HTTP, JSON-RPC, or REST — it just throttles calls to any async function.

```typescript
type RequestBus = {
  readonly key: string;
  execute<T>(fn: () => Promise<T>): Promise<T>;
  getCurrentRate(): number | null;
  destroy(): void;
};

function createRequestBus(key: string, options?: {
  isRateLimitError?: (error: unknown) => boolean;
}): RequestBus;

function getOrCreateBus(key: string, options?: {
  isRateLimitError?: (error: unknown) => boolean;
}): RequestBus;

function destroyAllBuses(): void;
```

**Key** is user-configurable, not auto-derived from URL:
- `"alchemy"` — shared across all Alchemy endpoints (prevents double-spending credits)
- `"api.etherscan.io"` — one explorer domain
- `"public-rpc-base"` — a specific public endpoint

**Adaptive rate limiting algorithm** (unchanged from current explorer bus):
1. Initial: unthrottled
2. First rate limit error: set limit to 80% of measured burst rate
3. Subsequent errors: reduce by 5% each
4. Floor: 1 req/sec

The existing `ExplorerBus` type becomes a thin wrapper around `RequestBus` that handles response parsing and adds the `apikey` query param. Existing explorer scanner code continues working unchanged.

### New IDB Stores

Added to `@titrate/storage-idb`:

**`ChainConfigStore`:**
```typescript
type StoredChainConfig = {
  readonly id: string;
  readonly chainId: number;
  readonly name: string;
  readonly rpcUrl: string;
  readonly rpcBusKey: string;
  readonly explorerApiUrl: string;
  readonly explorerApiKey: string;
  readonly explorerBusKey: string;
};

interface ChainConfigStore {
  get(id: string): Promise<StoredChainConfig | null>;
  getByChainId(chainId: number): Promise<StoredChainConfig | null>;
  put(config: StoredChainConfig): Promise<void>;
  list(): Promise<readonly StoredChainConfig[]>;
  delete(id: string): Promise<void>;
}
```

**`AppSettingsStore`:**
```typescript
interface AppSettingsStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}
```

Update `Storage` interface to include `chainConfigs` and `appSettings`.

## Routing

| Route | Component | Purpose |
|-------|-----------|---------|
| `/` | `HomePage` | Campaign grid + "New Campaign" button |
| `/campaign/:id` | `CampaignPage` | Timeline/progressive step flow |
| `/settings` | `SettingsPage` | Chain configs, explorer API keys, theme |

## App Layout

### Global Header

Present on all routes:
- Left: "Titrate" wordmark (links to `/`)
- Right: Theme toggle (light/dark/system, button group), settings gear (links to `/settings`), `WalletBadge` (connected wallet or connect prompt)

### Theme

- Three modes: `light | dark | system`
- Defaults to `system` (`prefers-color-scheme`)
- Stored in `localStorage` (available before wallet sign-in)
- Applied via `dark` class on `<html>` (Tailwind dark mode)

## Provider Architecture

```
ThemeProvider
  └─ QueryClientProvider (TanStack — shared by wagmi + SDK hooks)
       └─ WalletProvider (Reown AppKit + wagmi config)
            └─ StorageProvider (IDB + encryption layer)
                 └─ ChainProvider (PublicClient + ExplorerBus per active config)
                      └─ CampaignProvider (global — all campaigns + active focus)
                           └─ Router (react-router)
```

### ThemeProvider
- Tracks `theme: 'light' | 'dark' | 'system'`
- Reads/writes `localStorage` key `titrate-theme`
- Applies `dark` class to `document.documentElement`
- No dependencies on other providers

### WalletProvider
- Wraps Reown AppKit + wagmi configuration
- Provides connection state, connected address, chain ID
- Perry mode: `deriveHotWallet()` → signs EIP-712 → derives private key in memory
- Hot wallet key stays in memory (never persisted)

### StorageProvider
- Creates `Storage` from `@titrate/storage-idb`
- On wallet connect: presents EIP-712 "storage-encryption" message for signing
- `keccak256(signature)` → AES-GCM key → stored in `sessionStorage`
- Wraps sensitive stores with encryption layer (see Encryption section)
- Exposes `storage: Storage | null` (null before encryption key derived)

### ChainProvider
- Constructed from the active campaign's chain config
- Creates `PublicClient` (via viem `createPublicClient`) using the campaign's RPC URL
- Routes all RPC calls through a `RequestBus` keyed by `rpcBusKey`
- Creates `ExplorerBus` if explorer API key is configured, keyed by `explorerBusKey`
- Rebuilds client when active campaign or its chain config changes
- Exposes: `publicClient`, `explorerBus`, `chainConfig`

### CampaignProvider
- Global — holds all campaigns loaded from IDB
- Tracks `activeCampaignId: string | null`
- When active: loads campaign state, computes step completion, drives step locking
- Provides: `campaigns`, `activeCampaign`, `stepStates`, `createCampaign()`, `completeStep()`, `saveCampaign()`

## Query Hooks

Pre-wired hooks that use `ChainProvider` internally. Components never touch `PublicClient` or `ExplorerBus` directly.

| Hook | Returns | Stale Time | Source |
|------|---------|------------|--------|
| `useTokenMetadata(tokenAddress)` | `{ name, symbol, decimals, isLoading }` | Infinite | `probeToken` via RPC bus |
| `useNativeBalance(address)` | `{ balance, isLoading }` | 15s | `getBalance` via RPC bus |
| `useTokenBalance(tokenAddress, address)` | `{ balance, isLoading }` | 15s | `readContract` via RPC bus |
| `useGasEstimate(params)` | `{ estimate, isLoading }` | 30s | `estimateContractGas` via RPC bus |

## Encryption

### Scope

Encrypt sensitive fields only. Non-sensitive data stays plaintext and queryable.

| Store | Encrypted Fields | Plaintext Fields |
|-------|-----------------|------------------|
| `wallets` | All | — |
| `chainConfigs` | `rpcUrl`, `explorerApiKey` | `id`, `chainId`, `name`, `explorerApiUrl`, `rpcBusKey`, `explorerBusKey` |
| `appSettings` | All values except `theme` | `theme` key only |
| All other stores | — | All fields |

### Key Derivation

1. Wallet connects via Reown
2. App requests EIP-712 signature: domain `{ name: 'Titrate', version: '1', chainId: 1 }`, type `{ purpose: 'storage-encryption' }`
3. `keccak256(signature)` → 32-byte AES-GCM key
4. Key stored in `sessionStorage` — cleared on tab close
5. On next visit: reconnect wallet, sign again → same deterministic key

### UI Before Unlock

Before signing, encrypted fields display as:
- Raw encrypted ciphertext (truncated) with a subtle inline lock icon
- Tapping the lock triggers the signature flow
- Campaign list is visible (names are plaintext) — user sees their campaigns
- Campaign detail pages and settings are gated behind encryption unlock

### Implementation

`createEncryptedStorage(storage, encryptionKey)` — wraps a `Storage` instance, intercepting reads/writes on sensitive stores. Returns a `Storage` with the same interface. The underlying `@titrate/storage-idb` is unchanged.

## Step Locking

Each step declares prerequisites. Unlocked when prerequisite is satisfied:

| Step | Unlocked When |
|------|--------------|
| Campaign | Always |
| Addresses | Campaign saved (chain + token chosen) |
| Filters | At least 1 address source added |
| Amounts | Filters configured (or explicitly skipped) |
| Wallet | Amounts set |
| Requirements | Wallet connected, requirements computed |
| Deploy & Distribute | Requirements met or perry mode bypass |

## Perry Mode

1. User clicks "Derive Hot Wallet" in the wallet step
2. Cold wallet signs EIP-712 message (same `createEIP712Message` from SDK)
3. `keccak256(signature)` → hot wallet private key (in memory only)
4. `WalletBadge` shows perry mode: "Operating as 0xHot, derived from 0xCold"
5. Cold wallet can disconnect — hot wallet operates independently
6. Perry mode bypasses the requirements check (user funds externally)

## Campaign Step: Chain Selection (Hybrid)

1. Show `ChainSelector` with presets from `SUPPORTED_CHAINS` (Ethereum, Base, Arbitrum, PulseChain) + "Custom" option
2. When preset selected: auto-fill RPC URL from defaults, auto-fill explorer API URL
3. RPC URL field is always editable — user can override with their own endpoint (Alchemy, Infura, etc.)
4. Optional explorer API key field
5. Optional "Rate limit group" field — defaults to URL domain, user can set to e.g. "alchemy" to share throttle across chains
6. If "Custom": user enters chain ID, chain name, RPC URL manually

## Settings Page

- List of saved chain configs with edit/delete
- Each shows: chain name, chain ID, RPC URL (encrypted), explorer API key (encrypted), bus keys
- "Add Chain" button with the same hybrid selector
- Theme toggle (also in header for quick access)

## File Structure (new/modified in `packages/web/src/`)

| File | Responsibility |
|------|----------------|
| `providers/ThemeProvider.tsx` | Theme context + localStorage |
| `providers/WalletProvider.tsx` | Reown AppKit + wagmi setup |
| `providers/StorageProvider.tsx` | IDB + encryption layer |
| `providers/ChainProvider.tsx` | PublicClient + bus creation |
| `providers/CampaignProvider.tsx` | Campaign state + step locking |
| `hooks/useTokenMetadata.ts` | Cached token probe |
| `hooks/useNativeBalance.ts` | Cached native balance |
| `hooks/useTokenBalance.ts` | Cached token balance |
| `hooks/useGasEstimate.ts` | Cached gas estimate |
| `pages/HomePage.tsx` | Campaign grid |
| `pages/CampaignPage.tsx` | Step flow orchestrator |
| `pages/SettingsPage.tsx` | Chain config management |
| `steps/CampaignStep.tsx` | Step 1: campaign form |
| `steps/AddressesStep.tsx` | Step 2: address sources |
| `steps/FiltersStep.tsx` | Step 3: pipeline filters |
| `steps/AmountsStep.tsx` | Step 4: amount config |
| `steps/WalletStep.tsx` | Step 5: wallet + perry mode |
| `steps/RequirementsStep.tsx` | Step 6: requirements check |
| `steps/DistributeStep.tsx` | Step 7: deploy + distribute |
| `components/Header.tsx` | Global header |
| `components/ThemeToggle.tsx` | Light/dark/system toggle |
| `components/EncryptedField.tsx` | Encrypted value + lock icon display |
| `crypto/encrypt.ts` | AES-GCM encrypt/decrypt helpers |
| `crypto/storage-wrapper.ts` | createEncryptedStorage wrapper |

## SDK File Changes

| File | Change |
|------|--------|
| `explorer/bus.ts` | Refactor to use generic `RequestBus` |
| `explorer/request-bus.ts` | New: generic rate-limited execution queue |
| `storage/index.ts` | Add `ChainConfigStore`, `AppSettingsStore` to `Storage` interface |

## Storage-IDB Changes

| File | Change |
|------|--------|
| `packages/storage-idb/src/db.ts` | Add `chainConfigs` and `appSettings` object stores |
| `packages/storage-idb/src/chain-configs.ts` | New: `createChainConfigStore` |
| `packages/storage-idb/src/app-settings.ts` | New: `createAppSettingsStore` |
| `packages/storage-idb/src/index.ts` | Wire new stores into `createIDBStorage` |

## Testing Strategy

**Unit tests (Vitest + RTL):**
- Providers: mock dependencies, verify state transitions
- Hooks: mock PublicClient, verify TanStack Query caching
- Step forms: render with mock contexts, verify saves to storage
- Encryption: roundtrip encrypt/decrypt, verify plaintext pass-through
- RequestBus: adapt existing explorer bus tests
- EncryptedField: renders ciphertext + lock icon

**Integration tests:**
- Step flow: walk through all 7 steps, verify locking
- Router: navigate between routes
- Theme: toggle and verify dark class

**Mocked (not real):**
- Wallet connections (Reown AppKit mocked)
- RPC calls (PublicClient mocked)
- IDB (fake-indexeddb)

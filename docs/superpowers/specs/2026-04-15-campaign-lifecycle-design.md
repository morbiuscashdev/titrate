# Campaign Lifecycle — TUI Persistent State & Live Pipeline Design

> **Revision 2026-04-16** — Framework choice locked in: OpenTUI React reconciler running on Bun (for `@titrate/tui` only; rest of monorepo stays on Node). Wallet step broadened to support both derived and imported provisioning with unified passphrase-based encryption at rest. Pluggable EIP-712 signer abstraction (paste-a-signature, WalletConnect, Ledger). RPC provider catalog (valve.city default + Alchemy + Infura) with templated per-provider key inputs.

## Overview

Redesign the Titrate TUI from a one-shot linear wizard into a persistent, campaign-scoped workspace with a live scanning/filtering/distribution pipeline. Each campaign is a directory on disk holding its full state in appendable files (CSV, JSONL) and JSON config. The TUI mirrors the web app's campaign management model in terminal form.

The interactive layer is built with OpenTUI React — a React reconciler that renders to terminal cell buffers — running on Bun. The standalone (flag-driven) commands continue to run via Commander and are unaffected by the framework switch.

## Goals

1. **Persistent campaigns** — create a campaign, configure it, close the terminal, come back later, pick up where you left off.
2. **Live pipeline** — scanner, filter, and distributor run concurrently. New blocks produce new addresses, filters auto-apply, distribution pulls from a continuously growing queue.
3. **Composable CLI** — every operation is available as a standalone subcommand (`titrate collect`, `titrate filter`, `titrate distribute`) for scripting, while `titrate new/open` provides the interactive dashboard.
4. **Crash-safe** — append-only data files + cursor watermarks. Restart reprocesses at most a few lines.

## CLI Surface

### Entry Points

**`titrate new <name> [--folder <path>]`**
- Creates campaign directory at the resolved campaign root
- Writes initial `campaign.json` with name + timestamps
- Drops into Step 1 (chain, token, variant, batch size)
- After Step 1 completes, saves config and shows the dashboard
- Errors if the directory already exists with a `campaign.json`

**`titrate open <name-or-path>`**
- Resolves to a campaign directory (tries as path, then as name under campaign root)
- Reads `campaign.json`, derives state from existing files
- Shows the live dashboard

**`titrate list [--folder <path>]`**
- Scans campaign root for subdirectories containing `campaign.json`
- Shows campaign name, status, last updated

### Campaign Root Resolution

Resolution order:
1. `--folder` flag (explicit path)
2. `TITRATE_CAMPAIGNS_DIR` environment variable
3. Auto-detect: `./titrate-campaigns/` if in a repo, else `~/.titrate-campaigns/`

Campaign directories live at `<campaign-root>/<campaign-id>/`.

### Three Usage Tiers

| Tier | Entry point | State | Audience |
|------|------------|-------|----------|
| Interactive | `titrate new/open` | Campaign directory, live dashboard | Default for most users |
| Scripted | `titrate collect/filter/distribute --campaign <name>` | Campaign directory, no TUI | CI/CD, automation, power users |
| Stateless | `titrate distribute --contract ... --rpc ...` | No persistence, raw flags | One-off operations, backwards compat |

Existing standalone commands (`distribute`, `deploy`, `derive-wallet`, `sweep`, `collect`, etc.) gain a `--campaign <name>` flag that reads/writes the campaign directory. Without `--campaign`, they work as they do today — fully stateless.

## Campaign Directory Structure

```
titrate-campaigns/
  campaign-xyz/
    campaign.json        ← config, status, timestamps, wallet provisioning (derived|imported)
    pipeline.json        ← source config + filter chain (the recipe)
    cursor.json          ← scan cursor, filter watermark, distribution watermark
    addresses.csv        ← append-only raw scan results
    filtered.csv         ← append-only qualified addresses
    amounts.csv          ← address,amount pairs (variable mode only)
    wallets.jsonl        ← wallet records — encrypted private key per line (derived or imported)
    batches.jsonl        ← append-only batch results
    sweep.jsonl          ← sweep results
  _shared/               ← cross-campaign cache (sibling of campaign dirs)
    chains.json          ← chain configs (RPC URLs, explorer keys)
    settings.json        ← app-level preferences
```

### File Format Rationale

**JSON** for config (small, read-modify-write): `campaign.json`, `pipeline.json`, `cursor.json`

**CSV** for address data (appendable, standard format, interoperable): `addresses.csv`, `filtered.csv`, `amounts.csv`

**JSONL** for structured records (appendable, crash-safe, one record per line): `batches.jsonl`, `wallets.jsonl`, `sweep.jsonl`

## Data Model

### `campaign.json` — Campaign Manifest

Extends current `CampaignConfig` with lifecycle fields and a discriminated wallet-provisioning union:

```typescript
type WalletProvisioning =
  | {
      readonly mode: 'derived';
      readonly coldAddress: Address;
      readonly walletCount: number;
      readonly walletOffset: number;
    }
  | {
      readonly mode: 'imported';
      readonly count: number;   // cached — source of truth is wallets.jsonl
    };

type CampaignManifest = CampaignConfig & {
  readonly id: string;
  readonly status: 'configuring' | 'ready' | 'running' | 'paused' | 'completed' | 'swept';
  readonly wallets: WalletProvisioning;
  readonly createdAt: number;
  readonly updatedAt: number;
};
```

The union replaces the previous flat `coldAddress`/`walletCount`/`walletOffset` fields. The imported branch carries no cold wallet; the derived branch carries no wallet list (records live in `wallets.jsonl`).

Status values:
- `configuring` — campaign created, initial setup in progress
- `ready` — configured with addresses and wallet, ready to run
- `running` — live pipeline active (scanner + filter + distributor)
- `paused` — pipeline stopped, resumable from cursors
- `completed` — all filtered addresses distributed, scanner stopped
- `swept` — residual balances recovered from hot wallets

### `cursor.json` — Pipeline Watermarks

Tracks where each pipeline stage left off:

```typescript
type PipelineCursor = {
  readonly scan: {
    readonly lastBlock: bigint;       // scanner resumes from here
    readonly endBlock: bigint | null; // null = follow chain head
    readonly addressCount: number;    // total lines in addresses.csv
  };
  readonly filter: {
    readonly watermark: number;       // line number in addresses.csv last processed
    readonly qualifiedCount: number;  // total lines in filtered.csv
  };
  readonly distribute: {
    readonly watermark: number;       // line number in filtered.csv last claimed
    readonly confirmedCount: number;  // confirmed batches in batches.jsonl
  };
};
```

Each pipeline stage reads its watermark, processes new lines since last run, appends output, then advances the watermark. Data is written *before* the cursor advances — on crash, worst case is reprocessing a few already-handled lines.

### `pipeline.json` — Source & Filter Configuration

Uses the existing `PipelineConfig` type from the SDK:

```typescript
type PipelineConfig = {
  readonly steps: readonly PipelineStep[];
};
```

Where each step is a source (`block-scan`, `csv`, `explorer-scan`, `trueblocks-scan`) or a filter (`contract-check`, `min-balance`, `nonce-range`, `token-recipients`, `csv-exclusion`, `previously-sent`, etc.).

Editing `pipeline.json` mid-run triggers a re-read on the filter loop's next tick. Optionally resets the filter watermark to 0 to re-filter all addresses.

## Interactive Framework

The TUI's interactive surfaces (campaign dashboard, step screens, intervention overlay) are built with OpenTUI React — a React reconciler for terminals. Commander remains the CLI parser for standalone commands.

### Runtime

`@titrate/tui` runs on Bun. All other packages stay on Node.

- **Bun for TUI only** — `bun run src/index.tsx`, `bun test`, standalone `bun.lockb`
- **Dependencies** — `@opentui/core`, `@opentui/react`, `react`, `commander`
- **Removed** — `@clack/prompts`, `ora`, `tsx`, `vitest`
- **File imports** — `@titrate/sdk` and `@titrate/storage-campaign` imported via file paths (`file:../sdk`) so Bun doesn't fight the Yarn 4 workspace layout
- **CI** — `oven-sh/setup-bun@v2` runs alongside the existing Node setup step

### Component structure

```
packages/tui/src/
  index.tsx                       # Commander dispatch
  commands/                       # Standalone — Commander + flags only
    distribute.ts sweep.ts deploy.ts collect.ts
    derive-wallet.ts set-operations.ts filter-preview.ts
    new-campaign.ts                # create dir → launch interactive root
    open-campaign.ts               # load dir → launch interactive root
    list-campaigns.ts              # plain stdout table, no interactive
  interactive/
    App.tsx                        # root, owns provider stack + screen state
    context.tsx                    # CampaignStorage, Manifest, Client, Intervention
    screens/
      Dashboard.tsx CampaignSetup.tsx Addresses.tsx
      Filters.tsx Amounts.tsx Wallet.tsx Distribute.tsx
    components/
      StepBadge.tsx TokenProbe.tsx InterventionOverlay.tsx
      Spinner.tsx ErrorLine.tsx ProviderKeyInput.tsx
  utils/
    campaign-root.ts rpc.ts
```

### Navigation model

A single `<App>` owns `activeScreen` state. Screens are kept mounted at all times — navigation toggles `display: 'none'` / `'flex'` rather than conditionally rendering. This preserves all in-flight local component state (focus index, partially-typed inputs, loading flags) across Esc → Dashboard → back round-trips. Only process exit loses local state, and Tier 2 (filesystem) covers that anyway.

### State tiers

| Tier | Scope | Storage |
|---|---|---|
| Context | Session | React Context at `<App>` — `CampaignStorage`, `Manifest` + `refresh()`, `PublicClient`, `Intervention` queue |
| Filesystem | Cross-session | Campaign directory — manifest, pipeline, cursor, CSVs, JSONLs |
| Screen-local | Screen mount | `useReducer` inside a screen — focus, draft text, spinners |

Commits hit the filesystem immediately (on blur, on Enter). The manifest context re-reads after mutations via `refresh()`. The filesystem is the source of truth.

### Dashboard (Phase 1 — step menu)

Phase 1 dashboard is a step-menu with derived status indicators. The status of each step is computed by a pure function `deriveStepStates(manifest, cursor, counts)` over disk state only. Phase 2 adds the live pipeline panels below the step list — the menu stays.

```
┌─ hex-airdrop-mar26 ──────────────── configuring ─┐
│ Ethereum · HEX (18 decimals) · TitrateSimple     │
│ Batch size: 200                                  │
├──────────────────────────────────────────────────┤
│  ✓ 1. Campaign setup          Ethereum / HEX     │
│  ✓ 2. Addresses               14,291 sourced     │
│  ○ 3. Filters                 not configured     │
│  ○ 4. Amounts                 uniform (pending)  │
│  ○ 5. Hot wallets             not configured     │
│  ○ 6. Distribute              blocked            │
├──────────────────────────────────────────────────┤
│  ↑/↓ navigate · Enter open · q quit · r refresh  │
└──────────────────────────────────────────────────┘
```

`distribute` is `blocked` until the four prior steps are `done`. Enter on a blocked step shows an inline warning line for 2 seconds instead of opening it.

## Wallet Provisioning & Encryption

The wallet step supports two provisioning modes side-by-side. Both produce the same on-disk shape — hot private keys always encrypted at rest with a user passphrase.

### Provisioning modes

- **Derived** — cold wallet signs an EIP-712 message once at `titrate new` time. The signature is the seed for `deriveMultipleWallets(sig, offset, count)`. Each derived key is encrypted with the passphrase and written to `wallets.jsonl`. The signature is then forgotten.
- **Imported** — user pastes or types private keys (with validation and address derivation). Each key is encrypted with the passphrase and written to `wallets.jsonl`.

Both modes prompt for a passphrase. Subsequent `titrate open` operations re-prompt for the passphrase to decrypt hot keys for signing — the cold wallet / signer is no longer needed.

### `WalletRecord` schema

```typescript
type WalletRecord = {
  readonly index: number;
  readonly address: Address;
  readonly encryptedKey: string;              // always encrypted
  readonly kdf: 'scrypt';
  readonly kdfParams: { readonly N: number; readonly r: number; readonly p: number; readonly salt: string };
  readonly provenance:
    | { readonly type: 'derived'; readonly coldAddress: Address; readonly derivationIndex: number }
    | { readonly type: 'imported' };
  readonly createdAt: number;
};
```

`encryptedKey` is universal across modes. `provenance` is audit metadata — it records where the key came from, not how it's unlocked.

### Encryption scheme

- **KDF**: scrypt with `N=2^17, r=8, p=1` (~100ms derivation on modern hardware)
- **Cipher**: AES-GCM with 96-bit IV, derived key, per-record salt
- **No plaintext on disk**, even transiently
- **No plaintext in memory beyond signing** — after signing a batch, the key is zeroed from memory immediately

### Why setup-and-cache (not re-derive-every-session)

If derived keys were re-derived each session, the cold-wallet signature would flow through process memory every open. With setup-and-cache, the signature touches memory once (at `titrate new`), after which the campaign only needs the passphrase. Shorter exposure window for the derivation seed; simpler session UX.

### Provenance recovery

Derived-mode campaigns can be reconstructed from scratch if the campaign directory is lost: the cold wallet signature + same `derivationIndex` + `walletCount` + `walletOffset` produce the same keys. Imported-mode campaigns cannot — lose the dir, lose the keys.

## EIP-712 Signer Abstraction

Derived mode needs exactly one EIP-712 signature at `titrate new` time. The signer is pluggable:

```typescript
// packages/sdk/src/signers/types.ts
type EIP712Signer = {
  readonly getAddress: () => Promise<Address>;
  readonly signTypedData: (payload: TypedDataDefinition) => Promise<Hex>;
  readonly close?: () => Promise<void>;
};

type SignerFactory = {
  readonly id: 'paste' | 'walletconnect' | 'ledger';
  readonly label: string;
  readonly available: () => Promise<boolean>;
  readonly create: () => Promise<EIP712Signer>;
};
```

### Phase 1 signer implementations

| Signer | Complexity | Phase 1 status |
|---|---|---|
| **Paste-a-signature** | ~30 lines. Print EIP-712 payload as JSON (plus a `cast wallet sign-typed-data` one-liner). Read pasted hex. Verify `recoverTypedDataAddress` matches the declared cold address. | **Ship** |
| **WalletConnect** | ~300-500 lines. `@walletconnect/sign-client` + Unicode-block QR render. Session torn down immediately after signature capture. | **Ship** |
| **Ledger** | ~150 lines. `@ledgerhq/hw-app-eth` + `@ledgerhq/hw-transport-node-hid`. `node-hid` runs under Bun via N-API. | **Stretch** — design interface now, implement opportunistically |

All three live in `@titrate/sdk/signers/` so the same interface is available to any consumer (TUI, future CLI tools).

### Why short-lived sessions

Signers are only needed for the one-time derivation seed. After the signature is captured, derived keys are encrypted with the passphrase and cached; subsequent `titrate open` never needs a signer again. This confines WalletConnect/Ledger complexity to the setup ceremony — no long-lived sessions, no reconnection logic.

## RPC Provider Catalog

Known RPC providers (valve.city, Alchemy, Infura) are modeled as templated URL builders. The wallet step and settings screen render a templated input that only captures the user's API key — the fixed URL parts are rendered as muted-color labels.

```typescript
// packages/sdk/src/chains/providers.ts
type RpcProvider = {
  readonly id: 'valve' | 'alchemy' | 'infura' | 'public' | 'custom';
  readonly name: string;
  readonly helpUrl: string;
  readonly requiresKey: boolean;
  readonly buildUrl: (chainId: number, key: string) => string | null; // null = unsupported on this chain
};

export const PROVIDERS: readonly RpcProvider[] = [
  {
    id: 'valve',
    name: 'valve.city',
    helpUrl: 'https://valve.city',
    requiresKey: true,
    // Universal EVM — chain ID encodes directly into the subdomain.
    // Example: https://evm369.rpc.valve.city/v1/vk_demo
    buildUrl: (chainId, key) => `https://evm${chainId}.rpc.valve.city/v1/${key}`,
  },
  {
    id: 'alchemy',
    name: 'Alchemy',
    helpUrl: 'https://alchemy.com',
    requiresKey: true,
    buildUrl: (chainId, key) => {
      const slug: Record<number, string> = {
        1: 'eth-mainnet', 8453: 'base-mainnet', 42161: 'arb-mainnet',
        11155111: 'eth-sepolia', 84532: 'base-sepolia', 421614: 'arb-sepolia',
      };
      return slug[chainId] ? `https://${slug[chainId]}.g.alchemy.com/v2/${key}` : null;
    },
  },
  {
    id: 'infura',
    name: 'Infura',
    helpUrl: 'https://infura.io',
    requiresKey: true,
    buildUrl: (chainId, key) => {
      const slug: Record<number, string> = {
        1: 'mainnet', 42161: 'arbitrum-mainnet', 11155111: 'sepolia',
      };
      return slug[chainId] ? `https://${slug[chainId]}.infura.io/v3/${key}` : null;
    },
  },
  // 'public' and 'custom' are handled specially — public pulls from ChainConfig.rpcUrls, custom takes a full URL.
];
```

**valve.city note**: valve's universal EVM endpoint uses the chain ID directly in the subdomain — no per-chain slug mapping needed. This means valve supports every EVM chain Titrate targets without updates to the catalog when a new chain is added.

### RPC resolution

`ChainConfig.rpcUrls` stays as a plain list of public RPCs. The provider catalog is resolved separately, in priority order:

```typescript
function resolveRpcUrl(chainId: number, settings: AppSettings): string {
  const keys = settings.providerKeys;
  if (keys.valve)   return PROVIDERS.valve.buildUrl(chainId, keys.valve)!;
  if (keys.alchemy) {
    const url = PROVIDERS.alchemy.buildUrl(chainId, keys.alchemy);
    if (url) return url;
  }
  if (keys.infura) {
    const url = PROVIDERS.infura.buildUrl(chainId, keys.infura);
    if (url) return url;
  }
  return getChainConfig(chainId).rpcUrls[0];  // public fallback
}
```

Valve is first because it supports every chain Titrate targets with a single key. Alchemy and Infura are per-chain fallbacks for users who already have those relationships. Public endpoints are the last resort.

### Templated input UX

```
RPC provider:
  ( ) Public       https://rpc.pulsechain.com
  (•) valve.city   https://evm369.rpc.valve.city/v1/[_______________]
  ( ) Alchemy     https://eth-mainnet.g.alchemy.com/v2/[___________]
  ( ) Infura      https://mainnet.infura.io/v3/[_______________]
  ( ) Custom       [                                             ]
```

The middle field is the only editable zone; prefix/suffix are muted `<span>` labels. The component reconstructs the full URL via `provider.buildUrl` and emits it on blur. Options unsupported by the active chain (e.g., Alchemy on PulseChain) render as disabled.

### Storage model

App settings gain an optional `providerKeys`:

```typescript
type AppSettings = {
  // ...existing fields...
  readonly providerKeys: {
    readonly valve?: string;
    readonly alchemy?: string;
    readonly infura?: string;
  };
};
```

Keys live once at the app-settings level — rotating a valve.city key updates every chain that uses it. Provider keys are themselves encrypted (web: keccak256 + AES-GCM via the existing EncryptedField flow; TUI: passphrase + scrypt + AES-GCM, same unlock as hot wallets).

## Live Pipeline Orchestration

Three concurrent async loops sharing the campaign directory, coordinated through files and cursors only — no shared memory, no IPC.

### Scanner Loop

```
while status === 'running':
  latestBlock = await publicClient.getBlockNumber()
  if latestBlock <= cursor.scan.lastBlock: sleep(blockTime)
  for block in (cursor.scan.lastBlock + 1)..latestBlock:
    addresses = scanBlock(block, pipeline.source)
    append to addresses.csv
  update cursor.scan.lastBlock, cursor.scan.addressCount
  if endBlock is set and latestBlock >= endBlock: stop scanner
```

### Filter Loop

```
while status === 'running':
  newLines = readFrom(addresses.csv, cursor.filter.watermark)
  if empty: sleep(1s); continue
  for line in newLines:
    if passesAllFilters(line.address, pipeline.filters):
      append to filtered.csv
  update cursor.filter.watermark, cursor.filter.qualifiedCount
```

### Distributor Loop

```
while status === 'running':
  unclaimed = readFrom(filtered.csv, cursor.distribute.watermark)
  if unclaimed.length < batchSize: sleep(2s); continue
  batch = unclaimed.slice(0, batchSize)
  for wallet in walletClients (round-robin or least-busy):
    result = disperse(batch)
    append result to batches.jsonl
  update cursor.distribute.watermark, cursor.distribute.confirmedCount
```

### Dashboard (read-only)

A fourth loop that reads cursors + file line counts every ~1s and redraws the terminal. Read-only, no coordination needed.

```
┌ campaign-xyz ──────────────────── LIVE ──
│ Ethereum · HEX · simple · 3 wallets
├──────────────────────────────────────────
│ Scanner    block 18,423,107 (+2/sec)
│ Sourced    14,291 addresses
│ Filtered   12,847 (contract ✓ nonce ✓ balance ✓)
│ Sent        3,400 / 12,847 (batch 17 of 65)
│ Queued      9,447 remaining + incoming
│ Gas         0.38 ETH across 3 wallets
├──────────────────────────────────────────
│ [p] Pause distribution
│ [f] Edit filters (live reload)
│ [w] Manage wallets
│ [s] Stop & sweep
│ [q] Detach (keeps running)
└──────────────────────────────────────────
```

### Design Properties

**Backpressure:** The distributor waits for `batchSize` filtered addresses before claiming a batch. If scanning is faster than distribution, `filtered.csv` grows. If distribution is faster, the distributor idles until more addresses qualify.

**Pause/resume:** Setting `status: 'paused'` in `campaign.json` stops all three loops. Resume picks up from cursors. No data loss.

**Filter hot-reload:** Editing `pipeline.json` mid-run triggers a re-read on the filter loop's next tick. Optionally resets `cursor.filter.watermark` to 0 to re-filter all addresses.

**Crash safety:** Each stage writes data (append to CSV/JSONL) before advancing its cursor. On restart, duplicate addresses are caught by the `previously-sent` filter, duplicate batches by nonce checks. Idempotent recovery.

**End conditions:**
- Scanner has an `endBlock`: scanner stops when reached, filter/distributor drain remaining
- Scanner follows head (`endBlock: null`): runs indefinitely until user pauses or stops
- All filtered addresses sent and scanner stopped: status → `completed`

## The `@titrate/storage-campaign` Package

New package in the monorepo that handles the campaign directory format.

### Core API

```typescript
createCampaignStorage(dir: string): CampaignStorage

interface CampaignStorage {
  // JSON config (read-modify-write)
  readonly manifest: ManifestStore;      // campaign.json
  readonly pipeline: PipelineStore;      // pipeline.json
  readonly cursor: CursorStore;          // cursor.json

  // Appendable files
  readonly addresses: AppendableCSV;     // addresses.csv
  readonly filtered: AppendableCSV;      // filtered.csv
  readonly amounts: AppendableCSV;       // amounts.csv
  readonly batches: AppendableJSONL<BatchRecord>;   // batches.jsonl
  readonly wallets: AppendableJSONL<WalletRecord>;  // wallets.jsonl
  readonly sweeps: AppendableJSONL<SweepRecord>;    // sweep.jsonl
}

createSharedStorage(dir: string): SharedStorage

interface SharedStorage {
  readonly chains: ChainConfigStore;     // chains.json
  readonly settings: AppSettingsStore;   // settings.json
}
```

### File Primitives

**`AppendableCSV`** — core primitive for large datasets:

```typescript
interface AppendableCSV {
  append(rows: readonly CSVRow[]): Promise<void>;         // fs.appendFile
  readFrom(lineOffset: number): AsyncIterable<CSVRow>;    // stream from offset
  count(): Promise<number>;                               // line count (cached)
}
```

**`AppendableJSONL<T>`** — structured records:

```typescript
interface AppendableJSONL<T> {
  append(records: readonly T[]): Promise<void>;
  readFrom(lineOffset: number): AsyncIterable<T>;
  readAll(): Promise<readonly T[]>;
  count(): Promise<number>;
}
```

### Relationship to Existing Packages

- **TUI uses only `storage-campaign`** for campaign state — it no longer depends on `storage-fs`
- **`storage-fs`** stays in the monorepo for any non-campaign Node-side consumer, but has no active user in the new design
- **`storage-idb`** stays for the web app
- **SDK types** (`StoredCampaign`, `StoredBatch`, etc.) remain the shared vocabulary — `storage-campaign` maps between its file format and those types

## What Changes vs What Stays

### SDK (`@titrate/sdk`) — extends, doesn't break

- Add `CampaignManifest` type (CampaignConfig + status + timestamps + wallets union)
- Add `WalletProvisioning` discriminated union (replaces flat `coldAddress`/`walletCount`/`walletOffset`)
- Add `PipelineCursor` type
- Export `BatchRecord`, `WalletRecord`, `SweepRecord` types for JSONL serialization
- New `signers/` module — `EIP712Signer` interface + paste / WalletConnect / Ledger factories
- New `chains/providers.ts` — `PROVIDERS` catalog with templated URL builders
- `ChainConfig.rpcUrls` reordered: valve.city templates first, public RPCs after
- Existing disperse functions, pipeline, encoders — unchanged

### TUI (`@titrate/tui`) — runtime + framework replacement

- **Runtime**: Node → Bun (for this package only)
- **Interactive layer**: `@clack/prompts` → OpenTUI React
- **Spinners**: `ora` → OpenTUI `useTimeline`-driven `<text>`
- **Test runner**: Vitest → `bun test` + `@opentui/core/testing` snapshots
- **CLI parser**: Commander (unchanged — runs fine on Bun)
- New commands: `new`, `open`, `list`
- Existing commands gain `--campaign` flag
- New `interactive/App.tsx` as the React root, `screens/` per step, `components/` for shared widgets
- `wizard.ts` and `interactive/steps/*.ts` (clack-based) deleted after feature parity is reached

### Web (`@titrate/web`) — minor additions

- New `ProviderKeyInput` component shared with the TUI pattern (same templated prefix/input/suffix UX)
- SettingsPage grows a "Provider Keys" section for `valve.city`, Alchemy, Infura
- Active chain RPC resolution updated to walk the templated `rpcUrls` list

### New package: `@titrate/storage-campaign`

- `AppendableCSV`, `AppendableJSONL` primitives
- `ManifestStore`, `CursorStore`, `PipelineStore` (JSON read-modify-write)
- `createCampaignStorage()`, `createSharedStorage()`
- Vitest tests (Node runtime — not Bun, since this package is consumed by Node-side code too)

### Unchanged

- `packages/contracts` — no changes
- `packages/storage-fs` — stays for backwards compat
- `packages/storage-idb` — stays for web app
- Standalone stateless commands — still work without `--campaign`
- SDK and web runtime remain Node

## Phasing

### Phase 1 — Campaign directory + static commands

Split into six sub-phases that can land as independent PRs:

**Phase 1a — Foundation (pure SDK additions, no TUI touched)**
- SDK type extensions (`CampaignManifest`, `WalletProvisioning`, `PipelineCursor`, `WalletRecord`, `BatchRecord`, `SweepRecord`)
- SDK provider catalog (`PROVIDERS`, `buildUrl`, `splitTemplate` helpers)
- SDK signer interface (`EIP712Signer`, `SignerFactory`) and `PasteSigner` implementation
- Chain catalog updated: valve.city templates as first-choice RPCs

**Phase 1b — `@titrate/storage-campaign` package**
- Package scaffold + Vitest setup
- `AppendableCSV` primitive + tests
- `AppendableJSONL<T>` primitive + tests
- `ManifestStore`, `CursorStore`, `PipelineStore` + tests
- `createCampaignStorage`, `createSharedStorage` factories + tests

**Phase 1c — TUI Bun + OpenTUI foundation** (parallel to 1b)
- Switch `packages/tui` runtime to Bun
- Install `@opentui/react` + `@opentui/core`, configure `bun test`
- New `interactive/App.tsx` with provider stack + navigation shell
- Dashboard screen (empty step list, keyboard nav, derived step status)
- Port `CampaignSetup` screen + `ProviderKeyInput` component
- Port `Addresses`, `Filters`, `Amounts` screens
- Port `Wallet` screen with paste-signer + passphrase prompt
- Port `Distribute` screen with batch progress + intervention overlay

**Phase 1d — Command wiring**
- `titrate new` command (create dir → launch App)
- `titrate open` command (load dir → launch App)
- `titrate list` command (plain stdout, no App)
- `--campaign` flag on `distribute`, `sweep`, `collect`
- Delete `wizard.ts` and clack-based step files (after feature parity)

**Phase 1e — Signer & encryption polish**
- WalletConnect signer (`@walletconnect/sign-client` + terminal QR)
- Ledger signer (`@ledgerhq/hw-app-eth`) — stretch
- Passphrase-encrypted keystore (scrypt + AES-GCM)
- Anvil integration test — full campaign cycle end-to-end

**Phase 1f — Regression**
- Full test suite across all packages
- Update `progress.txt`

### Phase 2 — Live pipeline

- Scanner/filter/distributor concurrent loops
- Cursor-based watermarks
- Live dashboard with real-time progress (additive to Phase 1 dashboard — step menu stays)
- Pause/resume
- Filter hot-reload

### Phase 3 — Polish

- `titrate list` with status summaries
- Downstream invalidation warnings on step re-entry
- Shared storage cross-campaign cache
- Detach mode (keeps running after terminal closes)

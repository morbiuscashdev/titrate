# Campaign Lifecycle — TUI Persistent State & Live Pipeline Design

## Overview

Redesign the Titrate TUI from a one-shot linear wizard into a persistent, campaign-scoped workspace with a live scanning/filtering/distribution pipeline. Each campaign is a directory on disk holding its full state in appendable files (CSV, JSONL) and JSON config. The TUI mirrors the web app's campaign management model in terminal form.

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
    campaign.json        ← config, status, timestamps, wallet derivation params
    pipeline.json        ← source config + filter chain (the recipe)
    cursor.json          ← scan cursor, filter watermark, distribution watermark
    addresses.csv        ← append-only raw scan results
    filtered.csv         ← append-only qualified addresses
    amounts.csv          ← address,amount pairs (variable mode only)
    wallets.jsonl        ← derived wallet records (one per line)
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

Extends current `CampaignConfig` with lifecycle fields:

```typescript
type CampaignManifest = CampaignConfig & {
  readonly id: string;
  readonly status: 'configuring' | 'ready' | 'running' | 'paused' | 'completed' | 'swept';
  readonly coldAddress: Address;
  readonly walletCount: number;    // default 1
  readonly walletOffset: number;   // default 0
  readonly createdAt: number;
  readonly updatedAt: number;
};
```

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

- **Replaces `storage-fs`** for the TUI's campaign needs
- **`storage-fs`** stays for backwards compat
- **`storage-idb`** stays for web app
- **SDK types** (`StoredCampaign`, `StoredBatch`, etc.) remain the shared vocabulary — `storage-campaign` maps between its file format and those types

## What Changes vs What Stays

### SDK (`@titrate/sdk`) — extends, doesn't break

- Add `coldAddress`, `walletCount`, `walletOffset` to `CampaignConfig`
- Add `CampaignManifest` type (CampaignConfig + status + timestamps)
- Add `PipelineCursor` type
- Export `BatchRecord`, `WalletRecord`, `SweepRecord` types for JSONL serialization
- Existing disperse functions, pipeline, encoders — unchanged

### TUI (`@titrate/tui`) — significant refactor

- New commands: `new`, `open`, `list`
- Existing commands gain `--campaign` flag
- New `interactive/dashboard.ts` — the live monitor/menu hub
- New `interactive/pipeline-runner.ts` — orchestrates scanner/filter/distributor loops
- Existing `interactive/wizard.ts` — deprecated in favor of `new` command flow
- Existing `interactive/steps/` — reused as implementations behind both interactive and scripted modes

### New package: `@titrate/storage-campaign`

- `AppendableCSV`, `AppendableJSONL` primitives
- `ManifestStore`, `CursorStore`, `PipelineStore` (JSON read-modify-write)
- `createCampaignStorage()`, `createSharedStorage()`

### Unchanged

- `packages/contracts` — no changes
- `packages/web` — no changes (keeps `storage-idb`)
- `packages/storage-fs` — stays for backwards compat
- `packages/storage-idb` — stays for web app
- Standalone stateless commands — still work without `--campaign`

## Phasing

### Phase 1 — Campaign directory + static commands

- `@titrate/storage-campaign` package with appendable file primitives
- `titrate new` / `titrate open` with the dashboard menu
- Steps work interactively but sequentially (no live pipeline yet)
- `--campaign` flag on existing subcommands
- Sweep integrated into campaign lifecycle

### Phase 2 — Live pipeline

- Scanner/filter/distributor concurrent loops
- Cursor-based watermarks
- Live dashboard with real-time progress
- Pause/resume
- Filter hot-reload

### Phase 3 — Polish

- `titrate list` with status summaries
- Downstream invalidation warnings on step re-entry
- Shared storage cross-campaign cache
- Detach mode (keeps running after terminal closes)

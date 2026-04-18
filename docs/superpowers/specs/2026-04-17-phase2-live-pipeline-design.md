# Phase 2 — Live Pipeline Design

**Status**: design complete, awaiting implementation plan
**Date**: 2026-04-17
**Supersedes**: the "Phase 2 — Live pipeline" subsection of `2026-04-15-campaign-lifecycle-design.md` (which sketched the loops but deferred concrete decisions)

## Overview

Turn Phase 1's persistent-campaign workspace into a running system. Three concurrent loops (scanner, filter, distributor) execute inside a single Bun process (or single browser session) with in-process event coordination, durable file-based state, and per-stage pause controls. The Dashboard gains a LIVE panel showing real-time progress. Campaign behavior is **declarative**: same manifest + same chain state → same state trajectory.

## Goals

1. **Walk-away operation** — start a campaign, close your laptop, come back to progress. Loops run while the terminal/tab is open; resuming from cursors after restart is seamless.
2. **Determinism** — start/end conditions, per-stage pause state, and filter-chain evolution all live in the manifest or history files. No hidden runtime state.
3. **Safety for real money** — in-flight transactions are never forgotten. Reconciliation on restart handles confirmed / pending / dropped / replaced / reverted transparently; the existing intervention system surfaces only genuinely ambiguous cases.
4. **Cross-platform parity** — TUI and web GUI share the same data model, same control semantics, same loop algorithms. Different persistence layers, identical behavior.
5. **Single-writer safety** — a second session on the same campaign enters read-only viewer mode; no accidental double-send.

## Non-goals (deferred to Phase 3)

- Detached background execution (`titrate run --detach`, daemon mode)
- Cross-campaign shared cache for address sources
- Block-range-scoped filter types (a deterministic enhancement, but orthogonal)
- Downstream-invalidation warnings on step re-entry
- Persistence of loop state across hard crashes beyond what the files already capture

## Architecture

**Two-layer coordination:**

- **Durable layer (on disk / in IDB)** — `addresses.csv`, `filtered.csv`, `batches.jsonl`, `wallets.jsonl`, `sweep.jsonl`, `cursor.json`, `manifest.json`, `pipeline-history.jsonl`, `.pipeline.lock`. Crash-safe, authoritative.
- **Live layer (in-process, ephemeral)** — an `EventEmitter` for loop signaling + a React `<PipelineProgressContext>` for dashboard rendering. Zero polling.

**Ordering rule**: loops always `await writeDisk()` then `emit(event)`. If the write throws, no event fires; next iteration retries. Disk state is always a lower bound on advertised state.

**No inter-loop file polling**: files are the data path; events are wake-up signals. Filter loop does `for await (const row of readFrom(...))` then `await once('scan-progressed')` — no `setInterval`, no `fs.watch` between loops.

**Single-process**: loops run as async tasks in the same Bun / browser tab that hosts OpenTUI / React. Cooperative yields via `await` at every IO boundary keep rendering smooth. Phase 3 moves them to child processes without algorithm changes — the file+cursor contract already supports multi-process coordination.

## Data model

### Manifest additions

```typescript
type StageStatus = 'running' | 'paused';

type StageControl = {
  readonly scan: StageStatus;
  readonly filter: StageStatus;
  readonly distribute: StageStatus;
};

type CampaignManifest = CampaignConfig & {
  readonly id: string;
  readonly status: CampaignStatus;
  readonly wallets: WalletProvisioning;
  readonly createdAt: number;
  readonly updatedAt: number;

  // NEW in Phase 2 — all declarative
  readonly startBlock: bigint | null;      // null = chain head at creation
  readonly endBlock: bigint | null;        // null = follow head forever
  readonly autoStart: boolean;             // default false
  readonly control: StageControl;          // default: all 'running'
};
```

### Cursor simplification

```typescript
type PipelineCursor = {
  readonly scan: {
    readonly lastBlock: bigint;            // current progress
    readonly addressCount: number;
    // REMOVED endBlock — now declarative in manifest
  };
  readonly filter: { readonly watermark: number; readonly qualifiedCount: number };
  readonly distribute: { readonly watermark: number; readonly confirmedCount: number };
};
```

### BatchRecord gains attempts[]

```typescript
type BatchAttempt = {
  readonly txHash: Hex;
  readonly nonce: number;
  readonly maxFeePerGas: string;           // decimal BigInt
  readonly maxPriorityFeePerGas: string;   // decimal BigInt
  readonly broadcastAt: number;
  readonly outcome: 'pending' | 'confirmed' | 'replaced' | 'reverted' | 'dropped';
  readonly confirmedBlock: string | null;  // decimal BigInt
  readonly reason?: string;
};

type BatchRecord = {
  readonly batchIndex: number;
  readonly recipients: readonly Address[];
  readonly amounts: readonly string[];
  readonly status: 'pending' | 'broadcast' | 'confirmed' | 'failed';
  readonly attempts: readonly BatchAttempt[];  // NEW — multi-attempt audit trail
  readonly confirmedTxHash: Hex | null;
  readonly confirmedBlock: string | null;
  readonly createdAt: number;
};
```

Each bump/retry appends a new `BatchAttempt`. JSONL stays append-only by writing a fresh record for each update (last line per `batchIndex` is authoritative).

### New audit file: `pipeline-history.jsonl`

```typescript
type PipelineHistoryEntry = {
  readonly timestamp: number;
  readonly kind: 'initial' | 'add' | 'replace' | 'external-add' | 'external-replace' | 'revert';
  readonly prior: readonly PipelineStep[] | null;
  readonly next: readonly PipelineStep[];
  readonly watermarkBefore: number;
  readonly watermarkAfter: number;
  readonly qualifiedCountBefore: number;
  readonly qualifiedCountAfter: number;
  readonly source: 'ui' | 'external-fs';
  readonly userChoice?: 'add' | 'replace' | 'revert';
};
```

Makes filter-chain evolution fully auditable. Given `manifest.json` + `addresses.csv` + `pipeline-history.jsonl` + chain state, anyone can re-derive `filtered.csv`.

### Lockfile: `.pipeline.lock`

```json
{
  "pid": 12345,
  "hostname": "laptop.local",
  "startedAt": 1712345678901,
  "session": "new" | "open",
  "version": "0.0.1"
}
```

Web equivalent: `navigator.locks.request('titrate:campaign:<id>', { ifAvailable: true }, ...)`.

### Errors file: `errors.jsonl` (new)

Append-only per-loop error log. Each entry: `{ timestamp, loop: 'scanner' | 'filter' | 'distributor', phase, message, stack, context }`. Used by the dashboard's error banner and for post-mortem inspection.

## Loop orchestration

### Shared structure

```typescript
type LoopHandle = {
  readonly start: () => Promise<void>;     // idempotent
  readonly stop: () => Promise<void>;      // graceful, waits for in-flight tick
  readonly status: () => LoopStatus;       // 'idle'|'running'|'paused'|'stopping'|'errored'|'completed'
  readonly on: (event: LoopEvent, handler: () => void) => () => void;
};

type LoopEvent =
  | 'tick-started' | 'tick-completed'
  | 'scan-progressed' | 'filter-progressed' | 'distribute-progressed'
  | 'errored' | 'completed';
```

Each loop awaits a resume signal when its `control[stage]` flag is `paused`.

### Scanner loop

```
while not stopped:
  if control.scan === 'paused': await resume; continue
  latest = await publicClient.getBlockNumber()
  target = min(latest, manifest.endBlock ?? latest)
  if cursor.scan.lastBlock >= target:
    if manifest.endBlock != null: emit 'completed'; break
    await sleep(chainBlockTime); continue
  for block in (cursor.scan.lastBlock + 1)..target:
    if control.scan === 'paused': break
    rows = await runSource(pipeline.steps[0], block, client)
    if rows.length > 0: await storage.addresses.append(rows)
    await storage.cursor.update({ scan: { lastBlock: block, addressCount: ... } })
    emit 'scan-progressed'
```

- RPC errors: exponential backoff, emit `'errored'` after 5 retries.
- Pause latency: one block in flight worst case.

### Filter loop

```
while not stopped:
  if control.filter === 'paused': await resume; continue
  for await row in storage.addresses.readFrom(cursor.filter.watermark):
    if control.filter === 'paused': break
    passed = await applyFilterChain(row, pipeline.steps[1..], client)
    if passed: await storage.filtered.append([row])
    await storage.cursor.update({ filter: { watermark: watermark + 1, ... } })
  emit 'filter-progressed'
  await once('scan-progressed' | 'pipeline-changed' | 'resume')
```

Hot-reload integration: on `pipeline-changed`, applies add-mode retroactive re-apply or replace-mode reset before resuming.

### Distributor loop

**Phase A — Reconciliation** (once on loop start):

```
for batch in batches.filter(b => b.status === 'broadcast'):
  attempt = batch.attempts[last]
  receipt = await getTransactionReceipt(attempt.txHash)
  if receipt?.status === 'success':
    mark confirmed
  else if receipt?.status === 'reverted':
    append BatchAttempt { outcome: 'reverted' }; queue intervention 'reconcile-reverted'
  else:
    mempool = await checkMempool(attempt.txHash)
    switch mempool:
      case 'pending': monitorInBackground(batch); continue  // no block on user
      case 'replaced': queue intervention 'reconcile-replaced-externally'
      case 'dropped': queue intervention 'reconcile-dropped'
      case 'unknown': queue intervention 'reconcile-state-unknown'
if any interventions: await resolveAllViaModal()
emit 'reconciliation-complete'
```

**Phase B — Steady state**:

```
while not stopped:
  if control.distribute === 'paused': await resume; continue
  available = cursor.filter.qualifiedCount - cursor.distribute.watermark
  drainCondition = scanner completed AND filter completed AND available === 0 AND all batches confirmed
  if drainCondition: emit 'completed'; break
  if available < manifest.batchSize: await once('filter-progressed' | 'resume'); continue
  batch = readFrom(filtered.csv, watermark, batchSize)
  wallet = selectWallet(walletPool, gasBudget)
  refresh control; if paused: loop back
  attempt = await disperse(batch, wallet, gasConfig)
  await storage.batches.append({ batchIndex, recipients, amounts, status: 'broadcast', attempts: [attempt], ... })
  await storage.cursor.update({ distribute: { watermark: watermark + batchSize } })
  monitorConfirmation(batch.batchIndex, attempt.txHash)  // non-blocking
  emit 'distribute-progressed'
```

- Multi-wallet support from Phase 1 carries over (round-robin / least-busy).
- Bump-and-retry on dropped / long-pending: each bump appends a new `BatchAttempt`. Gas revalidation config from Phase 1.

### Completion signaling

Orchestrator watches all three loops. When all three `'completed'`, writes `manifest.status = 'completed'` and renders summary + `[S] Stop & sweep` prompt.

## Pause / control UX

### Keyboard bindings

| Action | TUI | GUI | Effect |
|---|---|---|---|
| Toggle all | `space` | button | Atomic write: if any stage running, all → `'paused'`; else all → `'running'` |
| Toggle scanner | `s` | row icon | Flip `control.scan` |
| Toggle filter | `f` | row icon | Flip `control.filter` |
| Toggle distribute | `d` | row icon | Flip `control.distribute` |
| Start (from `'ready'`) | `g` | button | `status` → `'running'`, all controls → `'running'` |
| Stop & sweep | `S` | button | `status` → `'swept'`, stop loops, launch sweep |
| Edit filters | `e` | button | Opens Filters screen |
| Quit | `q` | close | Graceful stop, lock release |

### Stage indicators

`▶ running` · `⏸ paused` · `⏳ waiting` · `✓ completed` · `⚠ errored`

### Persisted control state

Pausing distributor, closing the terminal, and reopening shows distributor still paused. `manifest.control` is on disk. No auto-resume of paused state — user must explicitly flip to resume.

## Crash recovery & reconciliation

### Startup sequence

1. Acquire lockfile. Held by live PID → read-only viewer.
2. Read manifest / cursor / pipeline / pipeline-history.
3. Detect inconsistency (e.g., manifest says derived mode but wallets.jsonl empty) → prompt.
4. If derived / imported mode needs passphrase → prompt + decrypt.
5. Spin up loops (idle).
6. Distributor runs reconciliation phase (see loop spec).
7. Mount Dashboard. Subscribe to events. Render.
8. If `manifest.autoStart === true` AND `status === 'ready'` → emit `start`; status → `'running'`.

### Reconciliation edge cases

- **Confirmed**: silent.
- **Reverted**: intervention `reconcile-reverted`. Options: re-broadcast / skip / inspect.
- **Pending in mempool**: monitor in background. If it confirms naturally within timeout (default 30min) → silent. If timeout exceeds → intervention `reconcile-stuck-in-mempool` (bump / abort / keep waiting).
- **Replaced externally** (different tx at same nonce confirmed): if replacement looks like our disperse call, treat as confirmed; else intervention `reconcile-replaced-externally`.
- **Dropped**: intervention `reconcile-dropped` (re-broadcast / skip / inspect).
- **State unknown (RPC error)**: intervention `reconcile-state-unknown` (wait / inspect / re-broadcast).

Intervention modal handles multi-batch queues with "apply to all similar" / "skip all and stop".

### Partial-write integrity

`AppendableCSV.verifyTailIntegrity()` on open — detects partial final line, truncates. Next scan iteration re-appends. `AppendableJSONL` does the same. Data loss: at most one row, which is re-scanned on next iteration.

### Wallet decryption failure

Three retries on wrong passphrase → exit option. No state mutation.

### Partial sweep recovery

If `manifest.status === 'swept'` but `sweep.jsonl` is incomplete, offer to resume sweep.

## Concurrency safety

### Lockfile acquire (TUI)

1. No lockfile → create, proceed as writer.
2. Same host + live PID → read-only viewer.
3. Same host + dead PID → stale; delete, log, acquire fresh.
4. Different host → read-only viewer (user can `rm .pipeline.lock` to force).

Web uses `navigator.locks` with `ifAvailable: true`. `null` handle → viewer mode.

### Release

Clean shutdown (SIGINT/SIGTERM/beforeunload/completion) → delete lockfile. Web: Web Locks API auto-releases on tab close.

### Read-only viewer

- `[VIEWER — read-only]` banner.
- All write-keyboard handlers are no-ops with toast "read-only session".
- Polls cursor + manifest every 2s (cross-process — no event channel).
- Doesn't spin up loops.

## Filter hot-reload

1. `pipeline.json` watched via `fs.watch` (TUI) / IDB transaction events (web).
2. On change: filter loop pauses. Compute diff.
3. **Pure suffix-addition** (old chain is prefix of new):
   - Stream existing `filtered.csv`, apply only the new filter(s) to each row, drop failing rows.
   - Write to `filtered.csv.tmp`, fsync, atomic rename.
   - Update `cursor.filter.qualifiedCount`, keep `watermark` unchanged.
   - Append `PipelineHistoryEntry` with `kind: 'external-add'`.
   - Filter loop resumes.
4. **Any other change** (modification, removal, reorder):
   - Modal with side-by-side diff.
   - Options: Add (disabled — not additive), Replace, Revert.
   - Replace: reset `watermark = 0`, truncate `filtered.csv`, append history entry `external-replace`.
   - Revert: restore prior `pipeline.json` from memory, append history entry `revert`.
5. **Invalid JSON**: banner "pipeline.json invalid", filter paused until valid.

**Determinism invariant**: given `addresses.csv[0..watermark]` + current `pipeline.json`, `filtered.csv` is exactly the rows that pass the current chain. Always true, no edit-history dependence.

### Future: block-range-scoped filters

A filter type that declares its own activity range (e.g., `{ type: 'min-balance', threshold: 0.01, activeRange: { fromBlock, toBlock } }`). Makes the filter chain self-describing — edit history becomes unnecessary because the filter's own config encodes time variance. Not in Phase 2; deferred as a clean orthogonal addition.

## Cross-platform parity

| Concept | TUI | Web GUI |
|---|---|---|
| Manifest | `campaign.json` | `campaigns` IDB object store |
| Cursor | `cursor.json` | `cursor` IDB store |
| addresses/filtered | append-only CSV | object stores with auto-inc key |
| batches/wallets/sweeps | append-only JSONL | object stores with monotonic keys |
| pipeline-history | `pipeline-history.jsonl` | `pipelineHistory` IDB store |
| Lockfile | `.pipeline.lock` + PID check | `navigator.locks.request` |
| Event bus | `EventEmitter` | `EventEmitter` (identical API) |
| Loop scheduling | Bun event loop | Main thread or Web Worker |
| Chain client | viem `createPublicClient(http)` | wagmi `usePublicClient` (viem underneath) |

### Browser-specific constraints

- Background-tab throttling: `setInterval` clamped to 1s minimum on hidden tabs. Mitigation: use `setTimeout` with explicit scheduling. Document "keep the tab visible for long-running campaigns."
- Large `filtered` lists must stream via IDB cursors (`openCursor()`), never `getAll()`.
- Private-key handling uses the existing EncryptedField unlock flow; maps directly to the envelope schema.

### Shared code vs platform-specific

- **Shared** (SDK): types, loop algorithms as pure functions, reconciliation, filter application, scan stepping, batch building, gas estimation.
- **Shared interface** (`CampaignStorage`): both `storage-campaign` and `storage-idb` implement the same contract. New methods needed: `pipelineHistory.append()`, `acquireLock()` / `releaseLock()`.
- **Platform-specific**: orchestrator (process-model, lock acquisition, loop spawn). Minimal surface.

### The invariant

> `CampaignStorage` is a value-level abstraction over durability. Loops consume only this interface. A campaign's state is a pure function of its `CampaignStorage` contents + chain state, regardless of filesystem or IndexedDB backing.

## Dashboard LIVE panel

```
┌ hex-airdrop-mar26 ─────────────────────── running ─┐
│ Ethereum · HEX (18 dec) · TitrateSimple · 3 wallets │
│ Block range: 18,000,000 → 18,500,000                │
├─────────────────────────────────────────────────────┤
│  ▶ 1. Campaign         Ethereum / HEX                │
│  ▶ 2. Addresses        14,291 sourced                │
│  ▶ 3. Filters          12,847 qualified (2 filters)  │
│  ▶ 4. Amounts          uniform (1.00 HEX each)       │
│  ▶ 5. Hot wallets      derived · 3                   │
│  ▶ 6. Distribute       3,400 / 12,847 (batch 17/65)  │
├─ LIVE ──────────────────────────────────────────────┤
│  ▶ Scanner      block 18,423,107 (+2.1/s)            │
│  ▶ Filter       12,847 qualified (contract✓ bal✓)    │
│  ▶ Distribute   3,400 sent · 28 pending · 0 failed   │
│  Gas            0.38 ETH across 3 wallets            │
│  ETA            ~14 minutes                          │
├─────────────────────────────────────────────────────┤
│ space pause · s/f/d toggle stage · g start           │
│ e edit · S stop&sweep · b batches · q quit           │
└─────────────────────────────────────────────────────┘
```

Step menu (top) = Phase 1, unchanged. LIVE panel = new Phase 2. All rows from React context pushed by loops, no polling.

ETA: rolling average of `distribute-progressed` intervals over last N seconds (configurable, default 60s).

Viewer-mode adds one red banner below header: `[VIEWER — read-only · primary session is PID 12345 on laptop.local]`.

## Testing strategy

Layered:

1. **Unit (pure functions)**: `reconcileBatch`, `applyFilterChain`, `selectWallet`, `computeDrainStatus`, pipeline diff-detection, atomic-rename retroactive-re-apply. ~30 tests. Vitest (SDK) and bun:test (TUI).
2. **Integration (in-memory storage + fake clock)**: full pipeline with mock `PublicClient` (per `titrate-mock-client` skill), in-memory storage fixture, synthetic events. Exercises: happy path, pause/resume, reconciliation on restart with planted `'broadcast'` batches, retroactive re-apply, lockfile acquisition, stale-lock recovery. ~15 tests.
3. **End-to-end (Anvil)**: gated via `titrate-dev-services`. Start anvil, deploy TitrateSimple, full campaign with small batch size, verify on-chain state matches `batches.jsonl`. Includes Stop & sweep. ~5 tests.
4. **Cross-platform parity**: golden tests snapshotting `storage-campaign` vs `storage-idb` for the same op sequence. Reveals schema drift.
5. **Property-based**: fast-check over `CampaignManifest` shapes + control transitions. ~5 properties: pause-then-resume preserves cursor; reconciliation idempotent; filter add-then-revert returns to initial state.
6. **Visual snapshots (TUI)**: `captureCharFrame()` for Dashboard in each state (idle, running, all-paused, distribute-paused, reconciling, errored, completed, viewer). ~8 snapshots.

Coverage target: ≥90% lines on new loop code + control module. Anvil-gated tests complement unit tests on reconciliation.

## Phasing

Phase 2 is itself split into sub-phases:

### Phase 2a — Foundation (no loops running yet)
- SDK type extensions (`StageControl`, `BatchAttempt` expansion, `PipelineHistoryEntry`)
- Manifest migrations (`startBlock`, `endBlock`, `autoStart`, `control`); cursor: remove `endBlock`
- `CampaignStorage` interface gains `pipelineHistory.append`, `acquireLock`, `releaseLock`
- Both `storage-campaign` and `storage-idb` implement the new interface surface

### Phase 2b — Pure loop algorithms (SDK, no TUI)
- `createScannerLoop`, `createFilterLoop`, `createDistributorLoop` as pure-ish factories returning `LoopHandle`
- Event bus plumbing
- Reconciliation module (`reconcileBatches`)
- Filter hot-reload module (`PipelineWatcher`, diff detection, retroactive re-apply)
- Unit + integration tests without UI

### Phase 2c — TUI integration
- `PipelineOrchestrator` React provider (owns the three loops + dashboard state)
- `<PipelineProgressContext>` fed by loops, consumed by dashboard
- Dashboard LIVE panel implementation
- New keyboard bindings (space, s/f/d, g, S, e, b)
- Read-only viewer mode (lock detection, banner, disabled handlers)
- Intervention modal extensions for reconcile-* points

### Phase 2d — Web GUI parity
- Same `PipelineOrchestrator` for web using `storage-idb`
- Web Locks API for single-writer safety
- Click targets for all keyboard actions
- BroadcastChannel for cross-tab state sync (viewer mode)

### Phase 2e — End-to-end + polish
- Anvil-gated full-cycle tests
- Error surfacing polish (banner UX, errors.jsonl)
- Documentation updates (CLAUDE.md, progress.txt)

## What changes vs what stays

### SDK (`@titrate/sdk`) — extends
- Add `StageControl`, `StageStatus`, update `CampaignManifest` with new fields
- Update `PipelineCursor` (remove `endBlock`)
- Update `BatchRecord` (add `attempts[]`) and `BatchAttempt` (add `outcome`)
- Add `PipelineHistoryEntry` and related types
- New module: `@titrate/sdk/pipeline/` with loop factories + reconciliation + pipeline-watcher

### `@titrate/storage-campaign` (TUI-side) — extends
- Add `pipelineHistory: AppendableJSONL<PipelineHistoryEntry>` factory output
- Add `acquireLock()` / `releaseLock()` methods
- Add `errors: AppendableJSONL<ErrorEntry>`

### `@titrate/storage-idb` (web-side) — extends
- Same interface additions, implemented over IDB + Web Locks

### `@titrate/tui` — adds
- `PipelineOrchestrator.tsx` — React provider for loops + progress context
- Dashboard LIVE panel and viewer-mode banner
- New keyboard bindings
- Intervention modal extensions

### `@titrate/web` — adds
- Same `PipelineOrchestrator` implementation
- Campaign runner UI (dashboard equivalent with click targets)

### Unchanged
- `packages/contracts`
- Passphrase / envelope encryption
- Signer abstraction (paste / WalletConnect / Ledger)
- RPC provider catalog
- Phase 1 step screens (CampaignSetup, Addresses, Filters, Amounts, Wallet)
- `titrate new`, `titrate open`, `titrate list` commands
- `--campaign` flag on `distribute` / `sweep` / `collect`

## Open questions for Phase 3

- Detach mode: background execution without an attached terminal / tab
- Multi-campaign scheduling: "run these 5 campaigns in priority order"
- Cross-campaign shared cache (`_shared/cache/`)
- Block-range-scoped filter types as native pipeline primitives
- Service Worker–backed continuation on web (handle tab close)

## Glossary

- **Loop**: one of the three concurrent async tasks (scanner / filter / distributor)
- **Control**: per-stage pause flag in `manifest.control`
- **Cursor**: per-stage watermark in `cursor.json`, tracks progress
- **Reconciliation**: distributor's on-start sweep of `'broadcast'` batches
- **Retroactive re-apply**: filter hot-reload's handling of suffix-only additions
- **Viewer mode**: read-only session on a campaign already being written by another session
- **Drain condition**: all three loops' natural end states; triggers `status: 'completed'`

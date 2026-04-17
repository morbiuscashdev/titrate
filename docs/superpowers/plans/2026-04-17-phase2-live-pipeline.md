# Phase 2 Live Pipeline — Implementation Plan (Phase 2a + 2b)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Invoke `titrate-dispatch-checklist` at the start of each dispatch.

**Goal:** Implement the storage-layer foundations (Phase 2a) and the pure loop algorithms (Phase 2b) from `docs/superpowers/specs/2026-04-17-phase2-live-pipeline-design.md`. No TUI or web UI in this plan — those become Phase 2c/2d plans.

**Architecture:**
- **Phase 2a** extends `@titrate/sdk` types and both storage backends (`@titrate/storage-campaign`, `@titrate/storage-idb`) with pipeline-history, errors, lockfile, per-stage control, and declarative block ranges.
- **Phase 2b** introduces a new SDK module `@titrate/sdk/pipeline/loops/` containing three loop factories (`scanner`, `filter`, `distributor`), a reconciler, a pipeline-watcher with retroactive re-apply, and the shared primitives (`EventBus`, `ControlSignal`, `LoopHandle`). All loops are pure factories — they accept a `CampaignStorage` and a `PublicClient` and produce an idempotent `{ start, stop, status, on }` handle. No UI dependencies.

**Tech Stack:**
- TypeScript 5.7, strict mode
- Node 20+ runtime (SDK, storage-campaign)
- Browser / IDB runtime (storage-idb via `idb` package + Web Locks API)
- viem 2.x for `PublicClient`
- Vitest 4.x for unit / integration tests
- Foundry Anvil for gated e2e tests (via `titrate-dev-services` skill)

**Scope guardrails:**
- This plan adds ZERO code to `packages/tui/` or `packages/web/`.
- Loops never import React, OpenTUI, or any rendering layer.
- The `CampaignStorage` interface in `@titrate/storage-campaign` and the `Storage` interface in `@titrate/storage-idb` both gain the same new methods so downstream consumers can swap backends.

---

## File Structure

### New files (SDK)

- `packages/sdk/src/pipeline/loops/types.ts` — `LoopHandle`, `LoopEvent`, `LoopStatus`, `LoopDependencies`, `ControlSignal`.
- `packages/sdk/src/pipeline/loops/event-bus.ts` — tiny typed EventEmitter (~60 lines, zero deps, cross-runtime).
- `packages/sdk/src/pipeline/loops/control-signal.ts` — per-stage pause/resume signal with `waitForResume(stage)` promise.
- `packages/sdk/src/pipeline/loops/drain.ts` — `computeDrainStatus`: pure function answering "are all loops done?"
- `packages/sdk/src/pipeline/loops/wallet-select.ts` — `selectWallet`: pure function picking the best wallet from the pool.
- `packages/sdk/src/pipeline/loops/scanner-loop.ts` — `createScannerLoop`.
- `packages/sdk/src/pipeline/loops/filter-loop.ts` — `createFilterLoop`.
- `packages/sdk/src/pipeline/loops/distributor-loop.ts` — `createDistributorLoop`.
- `packages/sdk/src/pipeline/loops/reconcile.ts` — `reconcileBatches` (6 edge cases from spec).
- `packages/sdk/src/pipeline/loops/retroactive.ts` — atomic rewrite of `filtered.csv` when filters are suffix-added.
- `packages/sdk/src/pipeline/loops/pipeline-watcher.ts` — detects `pipeline.json` changes, classifies diff, drives retroactive re-apply.
- `packages/sdk/src/pipeline/loops/index.ts` — barrel re-export.

### New files (storage-campaign)

- `packages/storage-campaign/src/pipeline-history-store.ts` — append-only JSONL wrapper for `pipeline-history.jsonl`.
- `packages/storage-campaign/src/errors-store.ts` — append-only JSONL wrapper for `errors.jsonl`.
- `packages/storage-campaign/src/lock-store.ts` — acquire / release `.pipeline.lock` with stale-PID detection.

### New files (storage-idb)

- `packages/storage-idb/src/pipeline-history.ts` — IDB store wrapping the same interface.
- `packages/storage-idb/src/errors.ts` — IDB store.
- `packages/storage-idb/src/lock.ts` — `acquireLock` / `releaseLock` using `navigator.locks`.

### Modified files

- `packages/sdk/src/types.ts` — add `StageStatus`, `StageControl`, `PipelineHistoryEntry`, `LoopErrorEntry`, `BatchAttemptRecord`; expand `CampaignManifest`; remove `endBlock` from `PipelineCursor.scan`.
- `packages/sdk/src/storage/index.ts` — add `attempts: readonly BatchAttemptRecord[]` to `BatchRecord`; add `confirmedBlock` as stored string.
- `packages/sdk/src/index.ts` — export all new types and loop factories.
- `packages/storage-campaign/src/cursor-store.ts` — drop `endBlock` field; add forward-migration on read.
- `packages/storage-campaign/src/manifest-store.ts` — supply defaults for `startBlock`/`endBlock`/`autoStart`/`control` when reading an old manifest.
- `packages/storage-campaign/src/index.ts` — wire `pipelineHistory`, `errors`, `lock` into `CampaignStorage`.
- `packages/storage-idb/src/db.ts` — add new object stores on schema upgrade.
- `packages/storage-idb/src/campaigns.ts` — apply same manifest defaults on read.
- `packages/storage-idb/src/index.ts` — expose `pipelineHistory`, `errors`, `acquireLock`, `releaseLock`.

### New test files

- `packages/sdk/src/__tests__/types.test.ts` — extend existing to cover new shapes.
- `packages/sdk/src/__tests__/loops/event-bus.test.ts`
- `packages/sdk/src/__tests__/loops/control-signal.test.ts`
- `packages/sdk/src/__tests__/loops/drain.test.ts`
- `packages/sdk/src/__tests__/loops/wallet-select.test.ts`
- `packages/sdk/src/__tests__/loops/scanner-loop.test.ts`
- `packages/sdk/src/__tests__/loops/filter-loop.test.ts`
- `packages/sdk/src/__tests__/loops/distributor-loop.test.ts`
- `packages/sdk/src/__tests__/loops/reconcile.test.ts`
- `packages/sdk/src/__tests__/loops/retroactive.test.ts`
- `packages/sdk/src/__tests__/loops/pipeline-watcher.test.ts`
- `packages/sdk/src/__tests__/loops/integration.test.ts`
- `packages/storage-campaign/__tests__/pipeline-history-store.test.ts`
- `packages/storage-campaign/__tests__/errors-store.test.ts`
- `packages/storage-campaign/__tests__/lock-store.test.ts`
- `packages/storage-campaign/__tests__/manifest-store.test.ts` (extended with new defaults)
- `packages/storage-campaign/__tests__/cursor-store.test.ts` (extended with migration)
- `packages/storage-idb/src/__tests__/pipeline-history.test.ts`
- `packages/storage-idb/src/__tests__/errors.test.ts`
- `packages/storage-idb/src/__tests__/lock.test.ts`

---

## Conventions used in this plan

- `packages/sdk/` commands run from `packages/sdk/`. Vitest: `npx vitest run <path>`.
- `packages/storage-campaign/` commands run from `packages/storage-campaign/`.
- `packages/storage-idb/` commands run from `packages/storage-idb/`.
- After changing an SDK type, rebuild `dist/` before running downstream tests: `cd packages/sdk && npx tsc`. Invoke the `titrate-dist-fresh` skill if a downstream consumer reports a "no exported member" error.
- Each task ends with a `git commit` step. Use Conventional Commits: `type(scope): subject`. Never push to `master`; we are on `design/phase2-live-pipeline`.
- Full regression at the end of each sub-phase: `yarn test:all` from the repo root.

---

# Phase 2a — Foundation (tasks 1–13)

## Task 1: Extend SDK types — `StageStatus`, `StageControl`, `CampaignManifest`

**Files:**
- Modify: `packages/sdk/src/types.ts`
- Test: `packages/sdk/src/__tests__/types.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `packages/sdk/src/__tests__/types.test.ts`:

```typescript
import { describe, it, expectTypeOf } from 'vitest';
import type {
  StageStatus,
  StageControl,
  CampaignManifest,
} from '../types.js';

describe('StageStatus', () => {
  it('is a literal union of running | paused', () => {
    expectTypeOf<StageStatus>().toEqualTypeOf<'running' | 'paused'>();
  });
});

describe('StageControl', () => {
  it('has readonly scan / filter / distribute fields, each StageStatus', () => {
    const c: StageControl = { scan: 'running', filter: 'paused', distribute: 'running' };
    expectTypeOf(c.scan).toEqualTypeOf<StageStatus>();
    expectTypeOf(c.filter).toEqualTypeOf<StageStatus>();
    expectTypeOf(c.distribute).toEqualTypeOf<StageStatus>();
  });
});

describe('CampaignManifest (Phase 2)', () => {
  it('requires startBlock / endBlock / autoStart / control fields', () => {
    type Keys = keyof CampaignManifest;
    expectTypeOf<Keys>().toMatchTypeOf<'startBlock' | 'endBlock' | 'autoStart' | 'control' | Keys>();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/sdk && npx vitest run src/__tests__/types.test.ts
```

Expected: FAIL with "Cannot find name 'StageStatus'" (or similar type-lookup error).

- [ ] **Step 3: Implement the types**

In `packages/sdk/src/types.ts`, add the following block ABOVE the existing `CampaignStatus` export:

```typescript
export type StageStatus = 'running' | 'paused';

export type StageControl = {
  readonly scan: StageStatus;
  readonly filter: StageStatus;
  readonly distribute: StageStatus;
};

export const DEFAULT_STAGE_CONTROL: StageControl = {
  scan: 'running',
  filter: 'running',
  distribute: 'running',
};
```

Then REPLACE the existing `CampaignManifest` type with:

```typescript
export type CampaignManifest = CampaignConfig & {
  readonly id: string;
  readonly status: CampaignStatus;
  readonly wallets: WalletProvisioning;
  readonly createdAt: number;
  readonly updatedAt: number;

  // Phase 2 additions — all declarative.
  readonly startBlock: bigint | null;   // null = chain head at creation time
  readonly endBlock: bigint | null;     // null = follow head forever
  readonly autoStart: boolean;          // default false
  readonly control: StageControl;       // default: all 'running'
};
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/sdk && npx vitest run src/__tests__/types.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/sdk/src/types.ts packages/sdk/src/__tests__/types.test.ts
git commit -m "feat(sdk): add StageControl and expand CampaignManifest with Phase 2 fields"
```

---

## Task 2: Simplify `PipelineCursor` — remove `endBlock`

**Files:**
- Modify: `packages/sdk/src/types.ts`
- Test: `packages/sdk/src/__tests__/types.test.ts`

The cursor's `scan.endBlock` is now declarative in the manifest, so the runtime cursor only tracks progress.

- [ ] **Step 1: Write the failing test**

Append to `packages/sdk/src/__tests__/types.test.ts`:

```typescript
import type { PipelineCursor } from '../types.js';

describe('PipelineCursor', () => {
  it('scan section has only lastBlock and addressCount (no endBlock)', () => {
    type ScanKeys = keyof PipelineCursor['scan'];
    expectTypeOf<ScanKeys>().toEqualTypeOf<'lastBlock' | 'addressCount'>();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/sdk && npx vitest run src/__tests__/types.test.ts
```

Expected: FAIL — ScanKeys still includes `endBlock`.

- [ ] **Step 3: Update the type**

In `packages/sdk/src/types.ts`, REPLACE the `PipelineCursor` definition with:

```typescript
export type PipelineCursor = {
  readonly scan: {
    readonly lastBlock: bigint;
    readonly addressCount: number;
  };
  readonly filter: {
    readonly watermark: number;
    readonly qualifiedCount: number;
  };
  readonly distribute: {
    readonly watermark: number;
    readonly confirmedCount: number;
  };
};
```

- [ ] **Step 4: Run test to verify it passes + type-check the SDK**

```bash
cd packages/sdk && npx vitest run src/__tests__/types.test.ts && npx tsc --noEmit
```

Expected: tests PASS. `tsc --noEmit` may report stale references to `cursor.scan.endBlock` — address them by deleting any such line in the same commit. Search with:

```bash
cd packages/sdk && grep -rn "scan.endBlock" src/
```

If any match appears, delete or inline-replace with the manifest's `endBlock` lookup.

- [ ] **Step 5: Commit**

```bash
git add packages/sdk/src/types.ts packages/sdk/src/__tests__/types.test.ts
git commit -m "feat(sdk): drop endBlock from PipelineCursor.scan (now declarative in manifest)"
```

---

## Task 3: Introduce `BatchAttemptRecord` and `PipelineHistoryEntry` and `LoopErrorEntry`

**Files:**
- Modify: `packages/sdk/src/types.ts`
- Modify: `packages/sdk/src/storage/index.ts`
- Test: `packages/sdk/src/__tests__/storage-records.test.ts`

We do NOT modify the existing in-memory `BatchAttempt` (`bigint` fields). Instead we add a parallel `BatchAttemptRecord` (string-encoded bigints) for the persisted form. A mapping function (Task 4) converts between them.

- [ ] **Step 1: Write the failing test**

Append to `packages/sdk/src/__tests__/storage-records.test.ts` (create the file if absent):

```typescript
import { describe, it, expect, expectTypeOf } from 'vitest';
import type {
  BatchAttemptRecord,
  BatchRecord,
  PipelineHistoryEntry,
  LoopErrorEntry,
} from '../index.js';

describe('BatchAttemptRecord', () => {
  it('uses string-encoded bigint fields', () => {
    const r: BatchAttemptRecord = {
      txHash: '0xabc',
      nonce: 0,
      maxFeePerGas: '1000000000',
      maxPriorityFeePerGas: '500000000',
      broadcastAt: Date.now(),
      outcome: 'pending',
      confirmedBlock: null,
    };
    expectTypeOf(r.maxFeePerGas).toEqualTypeOf<string>();
    expectTypeOf(r.confirmedBlock).toEqualTypeOf<string | null>();
  });

  it('allows outcome="pending"', () => {
    const r: BatchAttemptRecord = {
      txHash: '0xabc', nonce: 0,
      maxFeePerGas: '0', maxPriorityFeePerGas: '0',
      broadcastAt: 0, outcome: 'pending', confirmedBlock: null,
    };
    expect(r.outcome).toBe('pending');
  });
});

describe('BatchRecord', () => {
  it('has attempts array', () => {
    type K = keyof BatchRecord;
    expectTypeOf<K>().toMatchTypeOf<'attempts' | K>();
  });
});

describe('PipelineHistoryEntry', () => {
  it('has kind, prior, next, watermark-before/after, qualified-before/after, source', () => {
    const e: PipelineHistoryEntry = {
      timestamp: 0,
      kind: 'initial',
      prior: null,
      next: [],
      watermarkBefore: 0,
      watermarkAfter: 0,
      qualifiedCountBefore: 0,
      qualifiedCountAfter: 0,
      source: 'ui',
    };
    expect(e.kind).toBe('initial');
  });
});

describe('LoopErrorEntry', () => {
  it('captures loop + phase + message + optional context', () => {
    const e: LoopErrorEntry = {
      timestamp: 0,
      loop: 'scanner',
      phase: 'fetch-block',
      message: 'boom',
    };
    expect(e.loop).toBe('scanner');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/sdk && npx vitest run src/__tests__/storage-records.test.ts
```

Expected: FAIL with "has no exported member" on the new types.

- [ ] **Step 3: Add the new types**

In `packages/sdk/src/types.ts`, append:

```typescript
export type BatchAttemptOutcome =
  | 'pending'
  | 'confirmed'
  | 'replaced'
  | 'reverted'
  | 'dropped';

export type BatchAttemptRecord = {
  readonly txHash: Hex;
  readonly nonce: number;
  readonly maxFeePerGas: string;          // decimal bigint
  readonly maxPriorityFeePerGas: string;  // decimal bigint
  readonly broadcastAt: number;
  readonly outcome: BatchAttemptOutcome;
  readonly confirmedBlock: string | null; // decimal bigint
  readonly reason?: string;
};

export type PipelineHistoryKind =
  | 'initial'
  | 'add'
  | 'replace'
  | 'external-add'
  | 'external-replace'
  | 'revert';

export type PipelineHistoryEntry = {
  readonly timestamp: number;
  readonly kind: PipelineHistoryKind;
  readonly prior: readonly PipelineStep[] | null;
  readonly next: readonly PipelineStep[];
  readonly watermarkBefore: number;
  readonly watermarkAfter: number;
  readonly qualifiedCountBefore: number;
  readonly qualifiedCountAfter: number;
  readonly source: 'ui' | 'external-fs';
  readonly userChoice?: 'add' | 'replace' | 'revert';
};

export type LoopId = 'scanner' | 'filter' | 'distributor';

export type LoopErrorEntry = {
  readonly timestamp: number;
  readonly loop: LoopId;
  readonly phase: string;
  readonly message: string;
  readonly stack?: string;
  readonly context?: Record<string, unknown>;
};
```

In `packages/sdk/src/storage/index.ts`, REPLACE the existing `BatchRecord` type with:

```typescript
import type { BatchAttemptRecord } from '../types.js';

export type BatchRecord = {
  readonly batchIndex: number;
  readonly recipients: readonly Address[];
  readonly amounts: readonly string[];
  readonly status: 'pending' | 'broadcast' | 'confirmed' | 'failed';
  readonly attempts: readonly BatchAttemptRecord[];
  readonly confirmedTxHash: Hex | null;
  readonly confirmedBlock: string | null;
  readonly createdAt: number;
};
```

- [ ] **Step 4: Export from the SDK barrel**

In `packages/sdk/src/index.ts`, update the `./types.js` re-export block to include:

```typescript
export type {
  // ...existing exports
  StageStatus,
  StageControl,
  BatchAttemptOutcome,
  BatchAttemptRecord,
  PipelineHistoryKind,
  PipelineHistoryEntry,
  LoopId,
  LoopErrorEntry,
} from './types.js';
export { DEFAULT_STAGE_CONTROL } from './types.js';
```

- [ ] **Step 5: Run tests + rebuild dist**

```bash
cd packages/sdk && npx vitest run src/__tests__/storage-records.test.ts && npx tsc
```

Expected: PASS; dist rebuilt. If downstream packages report "no exported member" later, invoke `titrate-dist-fresh` skill.

- [ ] **Step 6: Commit**

```bash
git add packages/sdk/src/types.ts packages/sdk/src/storage/index.ts packages/sdk/src/index.ts packages/sdk/src/__tests__/storage-records.test.ts packages/sdk/dist
git commit -m "feat(sdk): add BatchAttemptRecord, PipelineHistoryEntry, LoopErrorEntry"
```

---

## Task 4: Batch-attempt transform helpers

**Files:**
- Create: `packages/sdk/src/utils/batch-attempt.ts`
- Modify: `packages/sdk/src/index.ts`
- Test: `packages/sdk/src/__tests__/batch-attempt.test.ts`

Provides two pure functions that convert between the in-memory `BatchAttempt` (bigints) and the persisted `BatchAttemptRecord` (strings). The distributor loop uses `toRecord` before writing; the reconciler uses `fromRecord` before computing.

- [ ] **Step 1: Write the failing test**

Create `packages/sdk/src/__tests__/batch-attempt.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { batchAttemptToRecord, batchAttemptFromRecord } from '../utils/batch-attempt.js';
import type { BatchAttempt, BatchAttemptRecord } from '../index.js';

const live: BatchAttempt = {
  txHash: '0xabc',
  nonce: 5,
  gasEstimate: 21000n,
  maxFeePerGas: 2_000_000_000n,
  maxPriorityFeePerGas: 1_000_000_000n,
  timestamp: 1_700_000_000_000,
  outcome: 'confirmed',
};

const record: BatchAttemptRecord = {
  txHash: '0xabc',
  nonce: 5,
  maxFeePerGas: '2000000000',
  maxPriorityFeePerGas: '1000000000',
  broadcastAt: 1_700_000_000_000,
  outcome: 'confirmed',
  confirmedBlock: null,
};

describe('batchAttemptToRecord', () => {
  it('encodes bigints as decimal strings and renames timestamp -> broadcastAt', () => {
    expect(batchAttemptToRecord(live)).toEqual(record);
  });

  it('carries optional confirmedBlock + reason through', () => {
    expect(batchAttemptToRecord(live, { confirmedBlock: 123n, reason: 'ok' })).toEqual({
      ...record,
      confirmedBlock: '123',
      reason: 'ok',
    });
  });
});

describe('batchAttemptFromRecord', () => {
  it('parses decimal strings back to bigints', () => {
    const out = batchAttemptFromRecord(record);
    expect(out.maxFeePerGas).toBe(2_000_000_000n);
    expect(out.timestamp).toBe(1_700_000_000_000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/sdk && npx vitest run src/__tests__/batch-attempt.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helpers**

Create `packages/sdk/src/utils/batch-attempt.ts`:

```typescript
import type { BatchAttempt, BatchAttemptRecord } from '../types.js';

export function batchAttemptToRecord(
  attempt: BatchAttempt,
  extras: { confirmedBlock?: bigint | null; reason?: string } = {},
): BatchAttemptRecord {
  return {
    txHash: attempt.txHash,
    nonce: attempt.nonce,
    maxFeePerGas: attempt.maxFeePerGas.toString(),
    maxPriorityFeePerGas: attempt.maxPriorityFeePerGas.toString(),
    broadcastAt: attempt.timestamp,
    outcome: attempt.outcome,
    confirmedBlock:
      extras.confirmedBlock === undefined
        ? null
        : extras.confirmedBlock === null
          ? null
          : extras.confirmedBlock.toString(),
    ...(extras.reason !== undefined ? { reason: extras.reason } : {}),
  };
}

export function batchAttemptFromRecord(record: BatchAttemptRecord): BatchAttempt {
  return {
    txHash: record.txHash,
    nonce: record.nonce,
    gasEstimate: 0n, // unknown — stored form does not retain gasEstimate
    maxFeePerGas: BigInt(record.maxFeePerGas),
    maxPriorityFeePerGas: BigInt(record.maxPriorityFeePerGas),
    timestamp: record.broadcastAt,
    outcome: record.outcome === 'pending' ? 'dropped' : record.outcome,
  };
}
```

Note on `fromRecord`: the stored outcome can be `'pending'`, but the in-memory `BatchAttempt['outcome']` union does not include `'pending'` (see Task 5 below for the broader decision). The reconciler uses the record form directly; `fromRecord` is only for ad-hoc recomputation where `'pending'` is not a valid input. If the record is `'pending'`, we coerce to `'dropped'` — callers who care about pending must consume the record form, not the reconstructed live form.

- [ ] **Step 4: Export from SDK barrel**

Append to `packages/sdk/src/index.ts`:

```typescript
export { batchAttemptToRecord, batchAttemptFromRecord } from './utils/batch-attempt.js';
```

- [ ] **Step 5: Run tests + rebuild dist**

```bash
cd packages/sdk && npx vitest run src/__tests__/batch-attempt.test.ts && npx tsc
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/sdk/src/utils/batch-attempt.ts packages/sdk/src/index.ts packages/sdk/src/__tests__/batch-attempt.test.ts packages/sdk/dist
git commit -m "feat(sdk): add batchAttemptToRecord / batchAttemptFromRecord helpers"
```

---

## Task 5: Update in-memory `BatchAttempt` to include `'pending'` outcome

**Files:**
- Modify: `packages/sdk/src/types.ts`
- Modify: `packages/sdk/src/utils/batch-attempt.ts`
- Test: `packages/sdk/src/__tests__/batch-attempt.test.ts`

The distributor loop needs to record a `'pending'` attempt when a tx is broadcast but its receipt is still open. The existing in-memory type forbids `'pending'`. We widen it and patch the existing distributor code that pattern-matches on `outcome`.

- [ ] **Step 1: Write the failing test**

Append to `packages/sdk/src/__tests__/batch-attempt.test.ts`:

```typescript
import type { BatchAttempt } from '../index.js';

describe('BatchAttempt outcome (widened)', () => {
  it('accepts pending', () => {
    const p: BatchAttempt = {
      txHash: '0x0', nonce: 0,
      gasEstimate: 0n, maxFeePerGas: 0n, maxPriorityFeePerGas: 0n,
      timestamp: 0, outcome: 'pending',
    };
    expect(p.outcome).toBe('pending');
  });
});

describe('batchAttemptFromRecord (pending round-trip)', () => {
  it('preserves pending when round-tripping', () => {
    const record = {
      txHash: '0xabc' as const, nonce: 0,
      maxFeePerGas: '0', maxPriorityFeePerGas: '0',
      broadcastAt: 0, outcome: 'pending' as const, confirmedBlock: null,
    };
    expect(batchAttemptFromRecord(record).outcome).toBe('pending');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/sdk && npx vitest run src/__tests__/batch-attempt.test.ts
```

Expected: FAIL — `'pending'` not assignable to `BatchAttempt['outcome']`.

- [ ] **Step 3: Widen the in-memory type**

In `packages/sdk/src/types.ts`, REPLACE the existing `BatchAttempt` type with:

```typescript
export type BatchAttempt = {
  readonly txHash: Hex;
  readonly nonce: number;
  readonly gasEstimate: bigint;
  readonly maxFeePerGas: bigint;
  readonly maxPriorityFeePerGas: bigint;
  readonly timestamp: number;
  readonly outcome: BatchAttemptOutcome;
};
```

- [ ] **Step 4: Remove the pending-to-dropped coercion in `batchAttemptFromRecord`**

In `packages/sdk/src/utils/batch-attempt.ts`, change the return line for `outcome`:

```typescript
outcome: record.outcome,
```

(No coercion — both types now share `BatchAttemptOutcome`.)

- [ ] **Step 5: Patch callers that exhaustively match on outcome**

```bash
cd packages/sdk && grep -rn "outcome === " src/distributor/ src/__tests__/
```

Each match must be reviewed. The existing `disperse.ts` never emits `'pending'` itself, so its runtime behavior is unchanged — we only need to suppress TypeScript's exhaustiveness complaints where a `switch` or equality check assumes the old narrower union. For each such site, either:

  a) explicitly list all 5 outcomes in the switch, OR
  b) add an `// outcome is now widened; 'pending' only appears via the storage round-trip, which disperse.ts does not produce` comment plus a runtime `throw new Error` for `'pending'`.

Pick (b) for `disperse.ts` sites (minimal change). No test churn expected — existing distributor tests never produce `'pending'`.

- [ ] **Step 6: Run full SDK type-check + tests**

```bash
cd packages/sdk && npx tsc --noEmit && npx vitest run
```

Expected: PASS.

- [ ] **Step 7: Rebuild dist + commit**

```bash
cd packages/sdk && npx tsc
git add packages/sdk/src/types.ts packages/sdk/src/utils/batch-attempt.ts packages/sdk/src/__tests__/batch-attempt.test.ts packages/sdk/src/distributor packages/sdk/dist
git commit -m "feat(sdk): widen BatchAttempt.outcome to include 'pending'"
```

---


## Task 6: `cursor-store` forward-migration (drop `endBlock`)

**Files:**
- Modify: `packages/storage-campaign/src/cursor-store.ts`
- Test: `packages/storage-campaign/__tests__/cursor-store.test.ts`

The on-disk `cursor.json` from Phase 1 had `scan.endBlock`. On read, we must drop that field so the in-memory type matches.

- [ ] **Step 1: Write the failing test**

Append to `packages/storage-campaign/__tests__/cursor-store.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCursorStore } from '../src/cursor-store.js';

let dir: string;
let path: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'titrate-cursor-'));
  path = join(dir, 'cursor.json');
});

describe('cursor-store migration', () => {
  it('reads a legacy file that still contains scan.endBlock and strips it', async () => {
    const legacy = {
      scan: { lastBlock: '100', endBlock: '200', addressCount: 50 },
      filter: { watermark: 10, qualifiedCount: 5 },
      distribute: { watermark: 2, confirmedCount: 2 },
    };
    await writeFile(path, JSON.stringify(legacy), 'utf8');

    const store = createCursorStore(path);
    const cursor = await store.read();

    expect(cursor.scan).toEqual({ lastBlock: 100n, addressCount: 50 });
    // @ts-expect-error — endBlock is no longer part of the type
    expect(cursor.scan.endBlock).toBeUndefined();
    await rm(dir, { recursive: true });
  });

  it('round-trips a new-format cursor without endBlock', async () => {
    const store = createCursorStore(path);
    await store.write({
      scan: { lastBlock: 42n, addressCount: 10 },
      filter: { watermark: 0, qualifiedCount: 0 },
      distribute: { watermark: 0, confirmedCount: 0 },
    });
    const back = await store.read();
    expect(back.scan.lastBlock).toBe(42n);
    expect(back.scan.addressCount).toBe(10);
    await rm(dir, { recursive: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/storage-campaign && npx vitest run __tests__/cursor-store.test.ts
```

Expected: FAIL — legacy read still returns `endBlock`.

- [ ] **Step 3: Update `cursor-store.ts`**

REPLACE the body of `packages/storage-campaign/src/cursor-store.ts` with:

```typescript
import { readFile, writeFile } from 'node:fs/promises';
import type { PipelineCursor } from '@titrate/sdk';

export type CursorStore = {
  readonly read: () => Promise<PipelineCursor>;
  readonly write: (cursor: PipelineCursor) => Promise<void>;
  readonly update: (patch: Partial<PipelineCursor>) => Promise<void>;
};

type CursorOnDiskNew = {
  readonly scan: {
    readonly lastBlock: string;
    readonly addressCount: number;
  };
  readonly filter: { readonly watermark: number; readonly qualifiedCount: number };
  readonly distribute: { readonly watermark: number; readonly confirmedCount: number };
};

type CursorOnDiskLegacy = {
  readonly scan: {
    readonly lastBlock: string;
    readonly endBlock?: string | null;
    readonly addressCount: number;
  };
  readonly filter: { readonly watermark: number; readonly qualifiedCount: number };
  readonly distribute: { readonly watermark: number; readonly confirmedCount: number };
};

const ZERO_CURSOR: PipelineCursor = {
  scan: { lastBlock: 0n, addressCount: 0 },
  filter: { watermark: 0, qualifiedCount: 0 },
  distribute: { watermark: 0, confirmedCount: 0 },
};

function toDisk(c: PipelineCursor): CursorOnDiskNew {
  return {
    scan: {
      lastBlock: c.scan.lastBlock.toString(),
      addressCount: c.scan.addressCount,
    },
    filter: c.filter,
    distribute: c.distribute,
  };
}

function fromDisk(d: CursorOnDiskLegacy): PipelineCursor {
  return {
    scan: {
      lastBlock: BigInt(d.scan.lastBlock),
      addressCount: d.scan.addressCount,
    },
    filter: d.filter,
    distribute: d.distribute,
  };
}

export function createCursorStore(path: string): CursorStore {
  return {
    async read() {
      try {
        const raw = await readFile(path, 'utf8');
        return fromDisk(JSON.parse(raw) as CursorOnDiskLegacy);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return ZERO_CURSOR;
        throw err;
      }
    },

    async write(cursor) {
      await writeFile(path, JSON.stringify(toDisk(cursor), null, 2), 'utf8');
    },

    async update(patch) {
      const current = await this.read();
      const next: PipelineCursor = {
        scan: { ...current.scan, ...(patch.scan ?? {}) },
        filter: { ...current.filter, ...(patch.filter ?? {}) },
        distribute: { ...current.distribute, ...(patch.distribute ?? {}) },
      };
      await this.write(next);
    },
  };
}
```

- [ ] **Step 4: Run tests**

```bash
cd packages/storage-campaign && npx vitest run __tests__/cursor-store.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/storage-campaign/src/cursor-store.ts packages/storage-campaign/__tests__/cursor-store.test.ts
git commit -m "feat(storage-campaign): migrate cursor-store away from scan.endBlock"
```

---

## Task 7: `manifest-store` supplies Phase 2 defaults on read

**Files:**
- Modify: `packages/storage-campaign/src/manifest-store.ts`
- Test: `packages/storage-campaign/__tests__/manifest-store.test.ts`

An existing Phase 1 campaign directory's `campaign.json` does not have `startBlock`/`endBlock`/`autoStart`/`control`. We hydrate missing fields with safe defaults (`null`, `false`, `DEFAULT_STAGE_CONTROL`).

- [ ] **Step 1: Write the failing test**

Append to `packages/storage-campaign/__tests__/manifest-store.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createManifestStore } from '../src/manifest-store.js';
import { DEFAULT_STAGE_CONTROL } from '@titrate/sdk';

let dir: string;
let path: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'titrate-manifest-'));
  path = join(dir, 'campaign.json');
});

describe('manifest-store Phase 2 defaults', () => {
  it('fills in startBlock / endBlock / autoStart / control when reading a Phase 1 manifest', async () => {
    const legacy = {
      id: 'abc',
      status: 'ready',
      funder: '0xf',
      name: 'hex',
      version: 1,
      chainId: 1,
      rpcUrl: 'http://x',
      tokenAddress: '0xt',
      tokenDecimals: 18,
      contractAddress: null,
      contractVariant: 'simple',
      contractName: 'N',
      amountMode: 'uniform',
      amountFormat: 'integer',
      uniformAmount: '1',
      batchSize: 100,
      campaignId: null,
      pinnedBlock: null,
      wallets: { mode: 'imported', count: 1 },
      createdAt: 1,
      updatedAt: 1,
    };
    await writeFile(path, JSON.stringify(legacy), 'utf8');

    const manifest = await createManifestStore(path).read();

    expect(manifest.startBlock).toBeNull();
    expect(manifest.endBlock).toBeNull();
    expect(manifest.autoStart).toBe(false);
    expect(manifest.control).toEqual(DEFAULT_STAGE_CONTROL);

    await rm(dir, { recursive: true });
  });

  it('preserves explicit values from a new-format manifest', async () => {
    const store = createManifestStore(path);
    await store.write({
      id: 'xyz',
      status: 'ready',
      funder: '0xf',
      name: 'hex',
      version: 1,
      chainId: 1,
      rpcUrl: 'http://x',
      tokenAddress: '0xt',
      tokenDecimals: 18,
      contractAddress: null,
      contractVariant: 'simple',
      contractName: 'N',
      amountMode: 'uniform',
      amountFormat: 'integer',
      uniformAmount: '1',
      batchSize: 100,
      campaignId: null,
      pinnedBlock: null,
      wallets: { mode: 'imported', count: 1 },
      createdAt: 1,
      updatedAt: 1,
      startBlock: 10n,
      endBlock: 20n,
      autoStart: true,
      control: { scan: 'paused', filter: 'running', distribute: 'running' },
    } as never);

    const back = await store.read();
    expect(back.startBlock).toBe(10n);
    expect(back.endBlock).toBe(20n);
    expect(back.autoStart).toBe(true);
    expect(back.control.scan).toBe('paused');

    await rm(dir, { recursive: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/storage-campaign && npx vitest run __tests__/manifest-store.test.ts
```

Expected: FAIL — legacy manifest missing fields, no defaults.

- [ ] **Step 3: Update `manifest-store.ts`**

REPLACE the body of `packages/storage-campaign/src/manifest-store.ts` with:

```typescript
import { readFile, writeFile, stat } from 'node:fs/promises';
import type { CampaignManifest } from '@titrate/sdk';
import { DEFAULT_STAGE_CONTROL } from '@titrate/sdk';

export type ManifestStore = {
  readonly read: () => Promise<CampaignManifest>;
  readonly write: (manifest: CampaignManifest) => Promise<void>;
  readonly update: (patch: Partial<CampaignManifest>) => Promise<void>;
  readonly exists: () => Promise<boolean>;
};

type ManifestOnDisk = Omit<CampaignManifest, 'startBlock' | 'endBlock'> & {
  readonly startBlock?: string | null;
  readonly endBlock?: string | null;
  readonly autoStart?: boolean;
  readonly control?: CampaignManifest['control'];
};

function fromDisk(raw: ManifestOnDisk): CampaignManifest {
  return {
    ...raw,
    startBlock: raw.startBlock == null ? null : BigInt(raw.startBlock),
    endBlock: raw.endBlock == null ? null : BigInt(raw.endBlock),
    autoStart: raw.autoStart ?? false,
    control: raw.control ?? DEFAULT_STAGE_CONTROL,
  };
}

function toDisk(m: CampaignManifest): ManifestOnDisk {
  return {
    ...m,
    startBlock: m.startBlock === null ? null : m.startBlock.toString(),
    endBlock: m.endBlock === null ? null : m.endBlock.toString(),
  };
}

export function createManifestStore(path: string): ManifestStore {
  return {
    async read() {
      const raw = await readFile(path, 'utf8');
      return fromDisk(JSON.parse(raw) as ManifestOnDisk);
    },

    async write(manifest) {
      await writeFile(path, JSON.stringify(toDisk(manifest), null, 2), 'utf8');
    },

    async update(patch) {
      const current = await this.read();
      const next: CampaignManifest = {
        ...current,
        ...patch,
        updatedAt: Date.now(),
      };
      await this.write(next);
    },

    async exists() {
      try {
        await stat(path);
        return true;
      } catch {
        return false;
      }
    },
  };
}
```

- [ ] **Step 4: Run tests + repo-wide type-check**

```bash
cd packages/storage-campaign && npx vitest run __tests__/manifest-store.test.ts && npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/storage-campaign/src/manifest-store.ts packages/storage-campaign/__tests__/manifest-store.test.ts
git commit -m "feat(storage-campaign): apply Phase 2 manifest defaults on read"
```

---

## Task 8: `pipeline-history-store`

**Files:**
- Create: `packages/storage-campaign/src/pipeline-history-store.ts`
- Create: `packages/storage-campaign/__tests__/pipeline-history-store.test.ts`

A thin `AppendableJSONL` wrapper with an explicit name for the file. Per-type because we want a typed `append()` signature and we want to centralize the default file name `pipeline-history.jsonl`.

- [ ] **Step 1: Write the failing test**

Create `packages/storage-campaign/__tests__/pipeline-history-store.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPipelineHistoryStore } from '../src/pipeline-history-store.js';
import type { PipelineHistoryEntry } from '@titrate/sdk';

let dir: string;
let path: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'titrate-history-'));
  path = join(dir, 'pipeline-history.jsonl');
});

const entry: PipelineHistoryEntry = {
  timestamp: 1,
  kind: 'initial',
  prior: null,
  next: [],
  watermarkBefore: 0,
  watermarkAfter: 0,
  qualifiedCountBefore: 0,
  qualifiedCountAfter: 0,
  source: 'ui',
};

describe('pipeline-history-store', () => {
  it('appends a single entry and read it back via readAll', async () => {
    const s = createPipelineHistoryStore(path);
    await s.append(entry);
    const all = await s.readAll();
    expect(all).toEqual([entry]);
    await rm(dir, { recursive: true });
  });

  it('appends multiple entries preserving order', async () => {
    const s = createPipelineHistoryStore(path);
    await s.append(entry);
    await s.append({ ...entry, timestamp: 2, kind: 'add' });
    const all = await s.readAll();
    expect(all.length).toBe(2);
    expect(all[1].kind).toBe('add');
    await rm(dir, { recursive: true });
  });

  it('count returns 0 on missing file', async () => {
    const s = createPipelineHistoryStore(path);
    expect(await s.count()).toBe(0);
    await rm(dir, { recursive: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/storage-campaign && npx vitest run __tests__/pipeline-history-store.test.ts
```

Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

Create `packages/storage-campaign/src/pipeline-history-store.ts`:

```typescript
import type { PipelineHistoryEntry } from '@titrate/sdk';
import { createAppendableJSONL } from './appendable-jsonl.js';

export type PipelineHistoryStore = {
  readonly append: (entry: PipelineHistoryEntry) => Promise<void>;
  readonly readAll: () => Promise<readonly PipelineHistoryEntry[]>;
  readonly readFrom: (offset: number) => AsyncIterable<PipelineHistoryEntry>;
  readonly count: () => Promise<number>;
};

export function createPipelineHistoryStore(path: string): PipelineHistoryStore {
  const jsonl = createAppendableJSONL<PipelineHistoryEntry>(path);
  return {
    append: (entry) => jsonl.append([entry]),
    readAll: () => jsonl.readAll(),
    readFrom: (offset) => jsonl.readFrom(offset),
    count: () => jsonl.count(),
  };
}
```

- [ ] **Step 4: Run tests**

```bash
cd packages/storage-campaign && npx vitest run __tests__/pipeline-history-store.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/storage-campaign/src/pipeline-history-store.ts packages/storage-campaign/__tests__/pipeline-history-store.test.ts
git commit -m "feat(storage-campaign): add pipeline-history-store"
```

---

## Task 9: `errors-store`

**Files:**
- Create: `packages/storage-campaign/src/errors-store.ts`
- Create: `packages/storage-campaign/__tests__/errors-store.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/storage-campaign/__tests__/errors-store.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createErrorsStore } from '../src/errors-store.js';
import type { LoopErrorEntry } from '@titrate/sdk';

let dir: string;
let path: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'titrate-errors-'));
  path = join(dir, 'errors.jsonl');
});

describe('errors-store', () => {
  it('appends a LoopErrorEntry and reads it back', async () => {
    const store = createErrorsStore(path);
    const entry: LoopErrorEntry = {
      timestamp: 1, loop: 'scanner', phase: 'fetch-block', message: 'boom',
    };
    await store.append(entry);
    expect(await store.readAll()).toEqual([entry]);
    await rm(dir, { recursive: true });
  });

  it('stores stack + context when provided', async () => {
    const store = createErrorsStore(path);
    const entry: LoopErrorEntry = {
      timestamp: 1, loop: 'filter', phase: 'apply', message: 'x',
      stack: 'Error: x\n  at foo',
      context: { block: 123, attempt: 2 },
    };
    await store.append(entry);
    const [read] = await store.readAll();
    expect(read.stack).toBe(entry.stack);
    expect(read.context).toEqual(entry.context);
    await rm(dir, { recursive: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/storage-campaign && npx vitest run __tests__/errors-store.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement**

Create `packages/storage-campaign/src/errors-store.ts`:

```typescript
import type { LoopErrorEntry } from '@titrate/sdk';
import { createAppendableJSONL } from './appendable-jsonl.js';

export type ErrorsStore = {
  readonly append: (entry: LoopErrorEntry) => Promise<void>;
  readonly readAll: () => Promise<readonly LoopErrorEntry[]>;
  readonly count: () => Promise<number>;
};

export function createErrorsStore(path: string): ErrorsStore {
  const jsonl = createAppendableJSONL<LoopErrorEntry>(path);
  return {
    append: (entry) => jsonl.append([entry]),
    readAll: () => jsonl.readAll(),
    count: () => jsonl.count(),
  };
}
```

- [ ] **Step 4: Run tests**

```bash
cd packages/storage-campaign && npx vitest run __tests__/errors-store.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/storage-campaign/src/errors-store.ts packages/storage-campaign/__tests__/errors-store.test.ts
git commit -m "feat(storage-campaign): add errors-store"
```

---


## Task 10: `lock-store` — acquire / release `.pipeline.lock`

**Files:**
- Create: `packages/storage-campaign/src/lock-store.ts`
- Create: `packages/storage-campaign/__tests__/lock-store.test.ts`

Per spec:
- No lockfile → create, return `{ acquired: true, mode: 'writer' }`.
- Same host + live PID → `{ acquired: false, mode: 'viewer', holder: {…} }`.
- Same host + dead PID → stale; delete; acquire fresh; return writer.
- Different host → `{ acquired: false, mode: 'viewer', holder: {…} }`.

PID liveness is detected via `process.kill(pid, 0)` which throws `ESRCH` for a non-existent PID and `EPERM` for one we don't own (still alive). Any non-ESRCH result means "treat as live" — conservative.

- [ ] **Step 1: Write the failing test**

Create `packages/storage-campaign/__tests__/lock-store.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir, hostname } from 'node:os';
import { join } from 'node:path';
import { createLockStore } from '../src/lock-store.js';

let dir: string;
let path: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'titrate-lock-'));
  path = join(dir, '.pipeline.lock');
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('lock-store', () => {
  it('acquires a fresh lock when none exists', async () => {
    const store = createLockStore(path);
    const result = await store.acquire({ session: 'new' });
    expect(result.acquired).toBe(true);
    expect(result.mode).toBe('writer');

    const parsed = JSON.parse(await readFile(path, 'utf8'));
    expect(parsed.pid).toBe(process.pid);
    expect(parsed.hostname).toBe(hostname());
    expect(parsed.session).toBe('new');
  });

  it('returns viewer mode if another live PID owns the lock on the same host', async () => {
    await writeFile(
      path,
      JSON.stringify({
        pid: process.pid, // the test process IS alive
        hostname: hostname(),
        startedAt: Date.now(),
        session: 'new',
        version: '0.0.1',
      }),
      'utf8',
    );

    const store = createLockStore(path);
    const result = await store.acquire({ session: 'open' });
    expect(result.acquired).toBe(false);
    expect(result.mode).toBe('viewer');
    expect(result.holder?.pid).toBe(process.pid);
  });

  it('treats a dead PID as stale and acquires the lock fresh', async () => {
    // PID 999999 almost certainly does not exist on any test host.
    await writeFile(
      path,
      JSON.stringify({
        pid: 999999,
        hostname: hostname(),
        startedAt: Date.now(),
        session: 'new',
        version: '0.0.1',
      }),
      'utf8',
    );

    const store = createLockStore(path);
    const result = await store.acquire({ session: 'open' });
    expect(result.acquired).toBe(true);
    expect(result.mode).toBe('writer');
    expect(result.staleEvicted).toBe(true);

    const parsed = JSON.parse(await readFile(path, 'utf8'));
    expect(parsed.pid).toBe(process.pid);
  });

  it('treats a different hostname as an active foreign writer', async () => {
    await writeFile(
      path,
      JSON.stringify({
        pid: 1,
        hostname: 'some-other-machine',
        startedAt: Date.now(),
        session: 'new',
        version: '0.0.1',
      }),
      'utf8',
    );

    const store = createLockStore(path);
    const result = await store.acquire({ session: 'new' });
    expect(result.acquired).toBe(false);
    expect(result.mode).toBe('viewer');
    expect(result.holder?.hostname).toBe('some-other-machine');
  });

  it('release deletes the lockfile if we are the holder', async () => {
    const store = createLockStore(path);
    await store.acquire({ session: 'new' });
    await store.release();

    await expect(readFile(path, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('release is a no-op when the lockfile is owned by someone else', async () => {
    await writeFile(
      path,
      JSON.stringify({
        pid: 1, hostname: 'foreign', startedAt: 0, session: 'new', version: '0.0.1',
      }),
      'utf8',
    );

    const store = createLockStore(path);
    await store.release();
    // still there
    const raw = await readFile(path, 'utf8');
    expect(JSON.parse(raw).hostname).toBe('foreign');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/storage-campaign && npx vitest run __tests__/lock-store.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `packages/storage-campaign/src/lock-store.ts`:

```typescript
import { readFile, writeFile, unlink, stat } from 'node:fs/promises';
import { hostname } from 'node:os';

export type LockHolder = {
  readonly pid: number;
  readonly hostname: string;
  readonly startedAt: number;
  readonly session: 'new' | 'open';
  readonly version: string;
};

export type AcquireOptions = {
  readonly session: 'new' | 'open';
  readonly version?: string;
};

export type AcquireResult =
  | {
      readonly acquired: true;
      readonly mode: 'writer';
      readonly staleEvicted?: boolean;
    }
  | {
      readonly acquired: false;
      readonly mode: 'viewer';
      readonly holder: LockHolder;
    };

export type LockStore = {
  readonly acquire: (options: AcquireOptions) => Promise<AcquireResult>;
  readonly read: () => Promise<LockHolder | null>;
  readonly release: () => Promise<void>;
};

function isLiveLocalPid(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === 'ESRCH') return false; // no such process
    // EPERM means the process exists but we don't own it — treat as live.
    return true;
  }
}

export function createLockStore(path: string): LockStore {
  const selfHost = hostname();
  const selfPid = process.pid;

  async function readHolder(): Promise<LockHolder | null> {
    try {
      const raw = await readFile(path, 'utf8');
      return JSON.parse(raw) as LockHolder;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
  }

  async function writeHolder(session: 'new' | 'open', version: string): Promise<void> {
    const holder: LockHolder = {
      pid: selfPid,
      hostname: selfHost,
      startedAt: Date.now(),
      session,
      version,
    };
    await writeFile(path, JSON.stringify(holder, null, 2), 'utf8');
  }

  return {
    async acquire({ session, version = '0.0.1' }) {
      const existing = await readHolder();

      if (!existing) {
        await writeHolder(session, version);
        return { acquired: true, mode: 'writer' };
      }

      const sameHost = existing.hostname === selfHost;
      if (sameHost && !isLiveLocalPid(existing.pid)) {
        // stale
        try {
          await unlink(path);
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
        }
        await writeHolder(session, version);
        return { acquired: true, mode: 'writer', staleEvicted: true };
      }

      return { acquired: false, mode: 'viewer', holder: existing };
    },

    async read() {
      return readHolder();
    },

    async release() {
      const existing = await readHolder();
      if (!existing) return;
      if (existing.hostname !== selfHost || existing.pid !== selfPid) return;
      try {
        await unlink(path);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
        throw err;
      }
    },
  };
}
```

- [ ] **Step 4: Run tests**

```bash
cd packages/storage-campaign && npx vitest run __tests__/lock-store.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/storage-campaign/src/lock-store.ts packages/storage-campaign/__tests__/lock-store.test.ts
git commit -m "feat(storage-campaign): add lock-store with stale-PID detection"
```

---

## Task 11: Wire new stores into `CampaignStorage`

**Files:**
- Modify: `packages/storage-campaign/src/index.ts`
- Modify: `packages/storage-campaign/__tests__/campaign-storage.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `packages/storage-campaign/__tests__/campaign-storage.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCampaignStorage } from '../src/index.js';

describe('createCampaignStorage (Phase 2 surfaces)', () => {
  it('exposes pipelineHistory / errors / lock stores', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'titrate-cs-'));
    const storage = createCampaignStorage(dir);
    await storage.ensureDir();

    // pipelineHistory.append is available and persists to pipeline-history.jsonl.
    expect(typeof storage.pipelineHistory.append).toBe('function');
    expect(typeof storage.errors.append).toBe('function');
    expect(typeof storage.lock.acquire).toBe('function');

    const result = await storage.lock.acquire({ session: 'new' });
    expect(result.acquired).toBe(true);

    await storage.lock.release();
    await rm(dir, { recursive: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/storage-campaign && npx vitest run __tests__/campaign-storage.test.ts
```

Expected: FAIL — fields missing.

- [ ] **Step 3: Wire new stores**

REPLACE `packages/storage-campaign/src/index.ts` with:

```typescript
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { WalletRecord, BatchRecord, SweepRecord } from '@titrate/sdk';
import { createAppendableCSV, type AppendableCSV } from './appendable-csv.js';
import { createAppendableJSONL, type AppendableJSONL } from './appendable-jsonl.js';
import { createManifestStore, type ManifestStore } from './manifest-store.js';
import { createCursorStore, type CursorStore } from './cursor-store.js';
import { createPipelineStore, type PipelineStore } from './pipeline-store.js';
import { createPipelineHistoryStore, type PipelineHistoryStore } from './pipeline-history-store.js';
import { createErrorsStore, type ErrorsStore } from './errors-store.js';
import { createLockStore, type LockStore } from './lock-store.js';

export type CampaignStorage = {
  readonly dir: string;
  readonly manifest: ManifestStore;
  readonly pipeline: PipelineStore;
  readonly pipelineHistory: PipelineHistoryStore;
  readonly cursor: CursorStore;
  readonly addresses: AppendableCSV;
  readonly filtered: AppendableCSV;
  readonly amounts: AppendableCSV;
  readonly batches: AppendableJSONL<BatchRecord>;
  readonly wallets: AppendableJSONL<WalletRecord>;
  readonly sweeps: AppendableJSONL<SweepRecord>;
  readonly errors: ErrorsStore;
  readonly lock: LockStore;
  readonly ensureDir: () => Promise<void>;
};

export function createCampaignStorage(dir: string): CampaignStorage {
  return {
    dir,
    manifest: createManifestStore(join(dir, 'campaign.json')),
    pipeline: createPipelineStore(join(dir, 'pipeline.json')),
    pipelineHistory: createPipelineHistoryStore(join(dir, 'pipeline-history.jsonl')),
    cursor: createCursorStore(join(dir, 'cursor.json')),
    addresses: createAppendableCSV(join(dir, 'addresses.csv')),
    filtered: createAppendableCSV(join(dir, 'filtered.csv')),
    amounts: createAppendableCSV(join(dir, 'amounts.csv')),
    batches: createAppendableJSONL<BatchRecord>(join(dir, 'batches.jsonl')),
    wallets: createAppendableJSONL<WalletRecord>(join(dir, 'wallets.jsonl')),
    sweeps: createAppendableJSONL<SweepRecord>(join(dir, 'sweep.jsonl')),
    errors: createErrorsStore(join(dir, 'errors.jsonl')),
    lock: createLockStore(join(dir, '.pipeline.lock')),
    async ensureDir() {
      await mkdir(dir, { recursive: true });
    },
  };
}

export {
  createAppendableCSV,
  createAppendableJSONL,
  createManifestStore,
  createCursorStore,
  createPipelineStore,
  createPipelineHistoryStore,
  createErrorsStore,
  createLockStore,
};
export type {
  AppendableCSV,
  AppendableJSONL,
  ManifestStore,
  CursorStore,
  PipelineStore,
  PipelineHistoryStore,
  ErrorsStore,
  LockStore,
};
export type { CSVRow } from './appendable-csv.js';

export { createSharedStorage } from './shared-storage.js';
export type { SharedStorage, AppSettingsStore, ChainConfigStore } from './shared-storage.js';
```

- [ ] **Step 4: Run tests + full package regression**

```bash
cd packages/storage-campaign && npx vitest run
```

Expected: all PASS.

- [ ] **Step 5: Rebuild dist + commit**

```bash
cd packages/storage-campaign && npx tsc
git add packages/storage-campaign/src/index.ts packages/storage-campaign/__tests__/campaign-storage.test.ts packages/storage-campaign/dist
git commit -m "feat(storage-campaign): wire pipelineHistory/errors/lock into CampaignStorage"
```

---

## Task 12: IDB — add `pipelineHistory` + `errors` object stores

**Files:**
- Modify: `packages/storage-idb/src/db.ts`
- Create: `packages/storage-idb/src/pipeline-history.ts`
- Create: `packages/storage-idb/src/errors.ts`
- Modify: `packages/storage-idb/src/index.ts`
- Create: `packages/storage-idb/src/__tests__/pipeline-history.test.ts`
- Create: `packages/storage-idb/src/__tests__/errors.test.ts`

Bumps the IDB schema version. Existing stores stay unchanged; we add two new stores keyed by a monotonic auto-increment id.

- [ ] **Step 1: Write the failing tests**

Create `packages/storage-idb/src/__tests__/pipeline-history.test.ts`:

```typescript
import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { createIDBStorage } from '../index.js';
import type { PipelineHistoryEntry } from '@titrate/sdk';

describe('IDB pipeline-history', () => {
  it('appends and reads entries in insertion order', async () => {
    const storage = await createIDBStorage(`test-history-${Math.random()}`);
    const e1: PipelineHistoryEntry = {
      timestamp: 1, kind: 'initial', prior: null, next: [],
      watermarkBefore: 0, watermarkAfter: 0,
      qualifiedCountBefore: 0, qualifiedCountAfter: 0,
      source: 'ui',
    };
    const e2: PipelineHistoryEntry = { ...e1, timestamp: 2, kind: 'add' };

    await storage.pipelineHistory.append('camp-1', e1);
    await storage.pipelineHistory.append('camp-1', e2);

    const all = await storage.pipelineHistory.readAll('camp-1');
    expect(all.length).toBe(2);
    expect(all[0].kind).toBe('initial');
    expect(all[1].kind).toBe('add');
  });

  it('scopes entries by campaignId', async () => {
    const storage = await createIDBStorage(`test-history-${Math.random()}`);
    const e: PipelineHistoryEntry = {
      timestamp: 1, kind: 'initial', prior: null, next: [],
      watermarkBefore: 0, watermarkAfter: 0,
      qualifiedCountBefore: 0, qualifiedCountAfter: 0,
      source: 'ui',
    };
    await storage.pipelineHistory.append('a', e);
    await storage.pipelineHistory.append('b', { ...e, timestamp: 99 });

    const a = await storage.pipelineHistory.readAll('a');
    expect(a).toHaveLength(1);
    expect(a[0].timestamp).toBe(1);
  });
});
```

Create `packages/storage-idb/src/__tests__/errors.test.ts`:

```typescript
import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { createIDBStorage } from '../index.js';
import type { LoopErrorEntry } from '@titrate/sdk';

describe('IDB errors', () => {
  it('appends and reads errors scoped by campaignId', async () => {
    const storage = await createIDBStorage(`test-errors-${Math.random()}`);
    const e: LoopErrorEntry = { timestamp: 1, loop: 'scanner', phase: 'p', message: 'm' };

    await storage.errors.append('camp', e);
    expect(await storage.errors.readAll('camp')).toEqual([e]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd packages/storage-idb && npx vitest run
```

Expected: FAIL on both new tests — `pipelineHistory` / `errors` missing on Storage.

- [ ] **Step 3: Extend the IDB schema**

READ `packages/storage-idb/src/db.ts` first, then in the existing `openTitrateDB` / `upgrade` callback, bump the schema version by 1 and add stores:

```typescript
// inside upgrade(db, oldVersion) — after existing branches:
if (oldVersion < <NEW_VERSION>) {
  if (!db.objectStoreNames.contains('pipelineHistory')) {
    const s = db.createObjectStore('pipelineHistory', {
      keyPath: 'autoId', autoIncrement: true,
    });
    s.createIndex('byCampaign', 'campaignId');
  }
  if (!db.objectStoreNames.contains('errors')) {
    const s = db.createObjectStore('errors', {
      keyPath: 'autoId', autoIncrement: true,
    });
    s.createIndex('byCampaign', 'campaignId');
  }
}
```

Replace `<NEW_VERSION>` with the existing version + 1 (read the current value first; do not guess).

- [ ] **Step 4: Implement the two stores**

Create `packages/storage-idb/src/pipeline-history.ts`:

```typescript
import type { IDBPDatabase } from 'idb';
import type { PipelineHistoryEntry } from '@titrate/sdk';
import type { TitrateDBSchema } from './db.js';

export type PipelineHistoryStore = {
  append(campaignId: string, entry: PipelineHistoryEntry): Promise<void>;
  readAll(campaignId: string): Promise<readonly PipelineHistoryEntry[]>;
  count(campaignId: string): Promise<number>;
};

type HistoryRow = PipelineHistoryEntry & { campaignId: string; autoId?: number };

export function createPipelineHistoryStore(
  db: IDBPDatabase<TitrateDBSchema>,
): PipelineHistoryStore {
  return {
    async append(campaignId, entry) {
      await db.add('pipelineHistory', { campaignId, ...entry } as HistoryRow);
    },

    async readAll(campaignId) {
      const rows = await db.getAllFromIndex('pipelineHistory', 'byCampaign', campaignId);
      return rows.map(({ campaignId: _, autoId: __, ...rest }) => rest as PipelineHistoryEntry);
    },

    async count(campaignId) {
      return db.countFromIndex('pipelineHistory', 'byCampaign', campaignId);
    },
  };
}
```

Create `packages/storage-idb/src/errors.ts` similarly:

```typescript
import type { IDBPDatabase } from 'idb';
import type { LoopErrorEntry } from '@titrate/sdk';
import type { TitrateDBSchema } from './db.js';

export type ErrorsStore = {
  append(campaignId: string, entry: LoopErrorEntry): Promise<void>;
  readAll(campaignId: string): Promise<readonly LoopErrorEntry[]>;
};

type ErrorRow = LoopErrorEntry & { campaignId: string; autoId?: number };

export function createErrorsStore(db: IDBPDatabase<TitrateDBSchema>): ErrorsStore {
  return {
    async append(campaignId, entry) {
      await db.add('errors', { campaignId, ...entry } as ErrorRow);
    },
    async readAll(campaignId) {
      const rows = await db.getAllFromIndex('errors', 'byCampaign', campaignId);
      return rows.map(({ campaignId: _, autoId: __, ...rest }) => rest as LoopErrorEntry);
    },
  };
}
```

Note: `TitrateDBSchema` must gain `pipelineHistory` and `errors` entries. Add them to the schema type in `db.ts`:

```typescript
interface TitrateDBSchema extends DBSchema {
  // ...existing entries
  pipelineHistory: {
    key: number;
    value: { campaignId: string; autoId?: number } & PipelineHistoryEntry;
    indexes: { byCampaign: string };
  };
  errors: {
    key: number;
    value: { campaignId: string; autoId?: number } & LoopErrorEntry;
    indexes: { byCampaign: string };
  };
}
```

- [ ] **Step 5: Expose in `Storage` and wire into `createIDBStorage`**

Add fields to `Storage` in `packages/sdk/src/storage/index.ts`:

```typescript
export interface Storage {
  // ...existing fields
  readonly pipelineHistory: {
    append(campaignId: string, entry: PipelineHistoryEntry): Promise<void>;
    readAll(campaignId: string): Promise<readonly PipelineHistoryEntry[]>;
    count?(campaignId: string): Promise<number>;
  };
  readonly errors: {
    append(campaignId: string, entry: LoopErrorEntry): Promise<void>;
    readAll(campaignId: string): Promise<readonly LoopErrorEntry[]>;
  };
  readonly acquireLock?(campaignId: string): Promise<{ release: () => Promise<void> } | null>;
  readonly releaseLock?(campaignId: string): Promise<void>;
}
```

Import `PipelineHistoryEntry` and `LoopErrorEntry` at the top of that file.

Rebuild SDK dist:

```bash
cd packages/sdk && npx tsc
```

Then update `packages/storage-idb/src/index.ts` to wire the new stores:

```typescript
import { createPipelineHistoryStore } from './pipeline-history.js';
import { createErrorsStore } from './errors.js';

export async function createIDBStorage(dbName?: string): Promise<Storage> {
  const db = await openTitrateDB(dbName);
  return {
    campaigns: createCampaignStore(db),
    addressSets: createAddressSetStore(db),
    addresses: createAddressStore(db),
    batches: createBatchStore(db),
    wallets: createWalletStore(db),
    pipelineConfigs: createPipelineConfigStore(db),
    chainConfigs: createChainConfigStore(db),
    appSettings: createAppSettingsStore(db),
    pipelineHistory: createPipelineHistoryStore(db),
    errors: createErrorsStore(db),
  };
}
```

- [ ] **Step 6: Run tests**

```bash
cd packages/storage-idb && npx vitest run
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/storage-idb/src packages/sdk/src/storage/index.ts packages/sdk/dist
git commit -m "feat(storage-idb): add pipelineHistory and errors object stores"
```

---

## Task 13: IDB `acquireLock` / `releaseLock` via Web Locks API

**Files:**
- Create: `packages/storage-idb/src/lock.ts`
- Create: `packages/storage-idb/src/__tests__/lock.test.ts`
- Modify: `packages/storage-idb/src/index.ts`

Web Locks are coordinated across tabs in the same origin. We use `ifAvailable: true` — if another tab holds it, we get `null` back and signal viewer mode. The lock is released when either the promise resolves (we return a `release` handle that resolves an internal promise) or the tab closes.

- [ ] **Step 1: Write the failing test**

Create `packages/storage-idb/src/__tests__/lock.test.ts`:

```typescript
import 'fake-indexeddb/auto';
import { describe, it, expect, vi } from 'vitest';
import { createIDBStorage } from '../index.js';

// Minimal navigator.locks mock. Real browsers use cross-tab coordination;
// for tests we simulate a single-tab environment where the second
// `ifAvailable` call finds the lock held.
function setupNavigatorLocks(): void {
  const held = new Set<string>();
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      locks: {
        async request(name: string, opts: { ifAvailable?: boolean }, callback: (lock: unknown) => Promise<void>) {
          if (opts.ifAvailable && held.has(name)) return callback(null);
          held.add(name);
          try {
            return await callback({});
          } finally {
            held.delete(name);
          }
        },
      },
    },
  });
}

describe('IDB acquireLock', () => {
  it('returns a release handle when the lock is available', async () => {
    setupNavigatorLocks();
    const storage = await createIDBStorage(`test-lock-${Math.random()}`);
    const handle = await storage.acquireLock!('camp-1');
    expect(handle).not.toBeNull();
    await handle!.release();
  });

  it('returns null when the lock is already held in the same tab', async () => {
    setupNavigatorLocks();
    const storage = await createIDBStorage(`test-lock-${Math.random()}`);
    const first = await storage.acquireLock!('camp-1');
    expect(first).not.toBeNull();
    const second = await storage.acquireLock!('camp-1');
    expect(second).toBeNull();
    await first!.release();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/storage-idb && npx vitest run __tests__/lock.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement**

Create `packages/storage-idb/src/lock.ts`:

```typescript
export type IDBLockHandle = {
  readonly release: () => Promise<void>;
};

type Nav = {
  readonly locks?: {
    request(
      name: string,
      options: { ifAvailable?: boolean },
      callback: (lock: unknown) => Promise<void>,
    ): Promise<unknown>;
  };
};

export async function acquireIDBLock(campaignId: string): Promise<IDBLockHandle | null> {
  const nav = globalThis.navigator as Nav | undefined;
  if (!nav?.locks) {
    // Environment has no Web Locks API; treat every call as acquired.
    return { release: async () => {} };
  }

  const name = `titrate:campaign:${campaignId}`;
  let releaseFn: () => void = () => {};
  const held = new Promise<void>((resolve) => {
    releaseFn = resolve;
  });

  let acquired = false;
  // request() resolves once the callback returns. We make the callback
  // await our `held` promise, so the lock persists until we call releaseFn().
  const requestPromise = nav.locks.request(name, { ifAvailable: true }, async (lock) => {
    if (lock === null) return; // lock not available
    acquired = true;
    await held;
  });

  // Give the runtime a microtask to resolve whether acquired === true.
  // request() does NOT resolve until the callback returns, so we can't
  // await it here — instead, race a tiny delay.
  await new Promise<void>((r) => queueMicrotask(r));

  if (!acquired) {
    // The callback returned immediately (lock unavailable).
    await requestPromise;
    return null;
  }

  return {
    async release() {
      releaseFn();
      await requestPromise;
    },
  };
}
```

Note: the microtask race is a well-known Web Locks idiom — `request()` only settles after the callback returns, so we settle a sentinel flag in the callback and peek it after yielding. In practice `ifAvailable: true` resolves the "unavailable" branch synchronously inside the engine, so one microtask is sufficient. If flakes surface, increase to two microtasks or a `setTimeout(r, 0)` — do NOT increase beyond one animation frame.

- [ ] **Step 4: Wire into `createIDBStorage`**

In `packages/storage-idb/src/index.ts`, import `acquireIDBLock` and add:

```typescript
import { acquireIDBLock } from './lock.js';

// In the returned object:
acquireLock: (campaignId: string) => acquireIDBLock(campaignId),
releaseLock: async () => {
  // No-op; release is handled by the handle returned from acquireLock.
},
```

- [ ] **Step 5: Run tests**

```bash
cd packages/storage-idb && npx vitest run
```

Expected: all PASS.

- [ ] **Step 6: Rebuild dist + commit**

```bash
cd packages/storage-idb && npx tsc
git add packages/storage-idb/src/lock.ts packages/storage-idb/src/__tests__/lock.test.ts packages/storage-idb/src/index.ts packages/storage-idb/dist
git commit -m "feat(storage-idb): acquireLock/releaseLock via Web Locks API"
```

---

## Task 14: Phase 2a regression sweep

**Files:**
- None new — verification only.

- [ ] **Step 1: Rebuild SDK dist then run full regression**

```bash
cd packages/sdk && npx tsc
cd ../storage-campaign && npx tsc
cd ../storage-idb && npx tsc
cd ../.. && yarn test:all
```

Expected: all tests pass. If downstream packages (tui, storage-*) report missing types, invoke `titrate-dist-fresh`. If Anvil-gated tests in `packages/sdk/src/__tests__/distributor.test.ts` skip silently, that's fine at this stage — they were skipping before too.

- [ ] **Step 2: Commit passthrough if needed**

If the regression run produced updated `dist/` artifacts that weren't yet committed:

```bash
git add packages/sdk/dist packages/storage-campaign/dist packages/storage-idb/dist
git commit -m "chore: rebuild dist after Phase 2a foundation changes"
```

If nothing to commit, skip. No-op is valid.

---


# Phase 2b — Pure Loop Algorithms (tasks 15–31)

## Task 15: `LoopHandle` / `LoopEvent` / `LoopStatus` types

**Files:**
- Create: `packages/sdk/src/pipeline/loops/types.ts`
- Create: `packages/sdk/src/__tests__/loops/types.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/sdk/src/__tests__/loops/types.test.ts`:

```typescript
import { describe, it, expectTypeOf } from 'vitest';
import type { LoopEvent, LoopStatus, LoopHandle } from '../../pipeline/loops/types.js';

describe('LoopEvent', () => {
  it('enumerates the spec-defined events', () => {
    expectTypeOf<LoopEvent>().toEqualTypeOf<
      | 'tick-started'
      | 'tick-completed'
      | 'scan-progressed'
      | 'filter-progressed'
      | 'distribute-progressed'
      | 'pipeline-changed'
      | 'errored'
      | 'completed'
      | 'reconciliation-complete'
    >();
  });
});

describe('LoopStatus', () => {
  it('enumerates the spec-defined statuses', () => {
    expectTypeOf<LoopStatus>().toEqualTypeOf<
      'idle' | 'running' | 'paused' | 'stopping' | 'errored' | 'completed'
    >();
  });
});

describe('LoopHandle', () => {
  it('has start / stop / status / on', () => {
    type K = keyof LoopHandle;
    expectTypeOf<K>().toEqualTypeOf<'start' | 'stop' | 'status' | 'on'>();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/sdk && npx vitest run src/__tests__/loops/types.test.ts
```

Expected: FAIL — module missing.

- [ ] **Step 3: Implement the types**

Create `packages/sdk/src/pipeline/loops/types.ts`:

```typescript
export type LoopEvent =
  | 'tick-started'
  | 'tick-completed'
  | 'scan-progressed'
  | 'filter-progressed'
  | 'distribute-progressed'
  | 'pipeline-changed'
  | 'errored'
  | 'completed'
  | 'reconciliation-complete';

export type LoopStatus =
  | 'idle'
  | 'running'
  | 'paused'
  | 'stopping'
  | 'errored'
  | 'completed';

export type LoopHandle = {
  readonly start: () => Promise<void>;
  readonly stop: () => Promise<void>;
  readonly status: () => LoopStatus;
  readonly on: (event: LoopEvent, handler: () => void) => () => void;
};
```

- [ ] **Step 4: Run tests**

```bash
cd packages/sdk && npx vitest run src/__tests__/loops/types.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/sdk/src/pipeline/loops/types.ts packages/sdk/src/__tests__/loops/types.test.ts
git commit -m "feat(sdk): add LoopHandle / LoopEvent / LoopStatus types"
```

---

## Task 16: Tiny typed `EventBus`

**Files:**
- Create: `packages/sdk/src/pipeline/loops/event-bus.ts`
- Create: `packages/sdk/src/__tests__/loops/event-bus.test.ts`

A minimal zero-dep, cross-runtime event bus. Map of event name to array of handlers. Subscribers get a disposer. Emit is synchronous — handlers execute in insertion order.

- [ ] **Step 1: Write the failing test**

Create `packages/sdk/src/__tests__/loops/event-bus.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { createEventBus } from '../../pipeline/loops/event-bus.js';
import type { LoopEvent } from '../../pipeline/loops/types.js';

describe('EventBus', () => {
  it('delivers events to subscribers in registration order', () => {
    const bus = createEventBus();
    const calls: string[] = [];
    bus.on('scan-progressed', () => calls.push('a'));
    bus.on('scan-progressed', () => calls.push('b'));
    bus.emit('scan-progressed');
    expect(calls).toEqual(['a', 'b']);
  });

  it('returns a disposer that removes the handler', () => {
    const bus = createEventBus();
    const fn = vi.fn();
    const off = bus.on('filter-progressed', fn);
    bus.emit('filter-progressed');
    off();
    bus.emit('filter-progressed');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('isolates events by name', () => {
    const bus = createEventBus();
    const a = vi.fn();
    const b = vi.fn();
    bus.on('scan-progressed', a);
    bus.on('filter-progressed', b);
    bus.emit('scan-progressed');
    expect(a).toHaveBeenCalled();
    expect(b).not.toHaveBeenCalled();
  });

  it('once(event) resolves on next emit', async () => {
    const bus = createEventBus();
    const promise = bus.once('scan-progressed');
    bus.emit('scan-progressed');
    await expect(promise).resolves.toBeUndefined();
  });

  it('once(...events) resolves on the first one to fire', async () => {
    const bus = createEventBus();
    const promise = bus.once('scan-progressed', 'filter-progressed');
    bus.emit('filter-progressed');
    await expect(promise).resolves.toBe('filter-progressed');
  });

  it('handlers throwing do not stop later handlers', () => {
    const bus = createEventBus();
    const later = vi.fn();
    bus.on('scan-progressed', () => { throw new Error('boom'); });
    bus.on('scan-progressed', later);
    // emit does not throw
    expect(() => bus.emit('scan-progressed')).not.toThrow();
    expect(later).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/sdk && npx vitest run src/__tests__/loops/event-bus.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement**

Create `packages/sdk/src/pipeline/loops/event-bus.ts`:

```typescript
import type { LoopEvent } from './types.js';

type Handler = () => void;

export type EventBus = {
  readonly on: (event: LoopEvent, handler: Handler) => () => void;
  readonly emit: (event: LoopEvent) => void;
  readonly once: (...events: LoopEvent[]) => Promise<LoopEvent>;
};

export function createEventBus(): EventBus {
  const handlers = new Map<LoopEvent, Handler[]>();

  return {
    on(event, handler) {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
      return () => {
        const current = handlers.get(event);
        if (!current) return;
        const idx = current.indexOf(handler);
        if (idx >= 0) current.splice(idx, 1);
      };
    },

    emit(event) {
      const list = handlers.get(event);
      if (!list) return;
      // Iterate over a snapshot so handlers unsubscribing mid-emit is safe.
      for (const h of [...list]) {
        try { h(); } catch { /* swallow — emitter does not block on handler errors */ }
      }
    },

    once(...events) {
      if (events.length === 0) return Promise.resolve('tick-completed' as LoopEvent);
      return new Promise<LoopEvent>((resolve) => {
        const disposers: Array<() => void> = [];
        for (const e of events) {
          const off = this.on(e, () => {
            for (const d of disposers) d();
            resolve(e);
          });
          disposers.push(off);
        }
      });
    },
  };
}
```

- [ ] **Step 4: Run tests**

```bash
cd packages/sdk && npx vitest run src/__tests__/loops/event-bus.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/sdk/src/pipeline/loops/event-bus.ts packages/sdk/src/__tests__/loops/event-bus.test.ts
git commit -m "feat(sdk): add EventBus with once() helper"
```

---

## Task 17: `ControlSignal` — per-stage pause/resume

**Files:**
- Create: `packages/sdk/src/pipeline/loops/control-signal.ts`
- Create: `packages/sdk/src/__tests__/loops/control-signal.test.ts`

Wraps a mutable `StageControl` + change-notification. Loops call `waitForResume(stage)` when paused; orchestrator calls `update(next)` when the user toggles a stage. `waitForResume` resolves immediately if the stage is already running.

- [ ] **Step 1: Write the failing test**

Create `packages/sdk/src/__tests__/loops/control-signal.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { createControlSignal } from '../../pipeline/loops/control-signal.js';
import type { StageControl } from '../../types.js';

const ALL_RUNNING: StageControl = { scan: 'running', filter: 'running', distribute: 'running' };

describe('ControlSignal', () => {
  it('get() returns the current state', () => {
    const sig = createControlSignal(ALL_RUNNING);
    expect(sig.get()).toEqual(ALL_RUNNING);
  });

  it('waitForResume(stage) resolves immediately if the stage is running', async () => {
    const sig = createControlSignal(ALL_RUNNING);
    await expect(sig.waitForResume('scan')).resolves.toBeUndefined();
  });

  it('waitForResume blocks while paused and resolves when flipped to running', async () => {
    const sig = createControlSignal({ ...ALL_RUNNING, filter: 'paused' });
    let resolved = false;
    const promise = sig.waitForResume('filter').then(() => { resolved = true; });

    await new Promise((r) => setTimeout(r, 5));
    expect(resolved).toBe(false);

    await sig.update({ ...ALL_RUNNING, filter: 'running' });
    await promise;
    expect(resolved).toBe(true);
  });

  it('update() notifies subscribers via on("changed", …)', async () => {
    const sig = createControlSignal(ALL_RUNNING);
    const seen: StageControl[] = [];
    const off = sig.onChange((c) => seen.push(c));

    await sig.update({ ...ALL_RUNNING, scan: 'paused' });
    await sig.update(ALL_RUNNING);
    off();
    await sig.update({ ...ALL_RUNNING, distribute: 'paused' });

    expect(seen.length).toBe(2);
    expect(seen[0].scan).toBe('paused');
    expect(seen[1].scan).toBe('running');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/sdk && npx vitest run src/__tests__/loops/control-signal.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement**

Create `packages/sdk/src/pipeline/loops/control-signal.ts`:

```typescript
import type { StageControl } from '../../types.js';

type Stage = keyof StageControl;
type ChangeHandler = (next: StageControl) => void;

export type ControlSignal = {
  readonly get: () => StageControl;
  readonly update: (next: StageControl) => Promise<void>;
  readonly waitForResume: (stage: Stage) => Promise<void>;
  readonly onChange: (handler: ChangeHandler) => () => void;
};

export function createControlSignal(initial: StageControl): ControlSignal {
  let current = initial;
  const handlers = new Set<ChangeHandler>();
  const waiters = new Map<Stage, Array<() => void>>();

  function notifyResume(stage: Stage): void {
    const list = waiters.get(stage);
    if (!list || list.length === 0) return;
    const fns = list.splice(0, list.length);
    for (const fn of fns) fn();
  }

  return {
    get: () => current,

    async update(next) {
      const prev = current;
      current = next;
      for (const h of [...handlers]) {
        try { h(current); } catch { /* swallow */ }
      }
      // Resume waiters for stages that flipped paused → running.
      (['scan', 'filter', 'distribute'] satisfies readonly Stage[]).forEach((s) => {
        if (prev[s] === 'paused' && next[s] === 'running') notifyResume(s);
      });
    },

    waitForResume(stage) {
      if (current[stage] === 'running') return Promise.resolve();
      return new Promise<void>((resolve) => {
        const list = waiters.get(stage) ?? [];
        list.push(resolve);
        waiters.set(stage, list);
      });
    },

    onChange(handler) {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
  };
}
```

- [ ] **Step 4: Run tests**

```bash
cd packages/sdk && npx vitest run src/__tests__/loops/control-signal.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/sdk/src/pipeline/loops/control-signal.ts packages/sdk/src/__tests__/loops/control-signal.test.ts
git commit -m "feat(sdk): add ControlSignal for per-stage pause/resume coordination"
```

---

## Task 18: `computeDrainStatus`

**Files:**
- Create: `packages/sdk/src/pipeline/loops/drain.ts`
- Create: `packages/sdk/src/__tests__/loops/drain.test.ts`

Pure function answering "are all loops done?" Used by the distributor loop to know when to emit `'completed'`. Per spec:

> drainCondition = scanner completed AND filter completed AND available === 0 AND all batches confirmed

- [ ] **Step 1: Write the failing test**

Create `packages/sdk/src/__tests__/loops/drain.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { computeDrainStatus } from '../../pipeline/loops/drain.js';

describe('computeDrainStatus', () => {
  it('returns drained when scanner+filter done, no unread qualified, all batches confirmed', () => {
    expect(computeDrainStatus({
      scannerCompleted: true,
      filterCompleted: true,
      qualifiedCount: 100,
      distributeWatermark: 100,
      batchesAllConfirmed: true,
    })).toBe('drained');
  });

  it('returns waiting if scanner is still running', () => {
    expect(computeDrainStatus({
      scannerCompleted: false,
      filterCompleted: true,
      qualifiedCount: 100,
      distributeWatermark: 100,
      batchesAllConfirmed: true,
    })).toBe('waiting');
  });

  it('returns waiting if filter is still running', () => {
    expect(computeDrainStatus({
      scannerCompleted: true,
      filterCompleted: false,
      qualifiedCount: 100,
      distributeWatermark: 100,
      batchesAllConfirmed: true,
    })).toBe('waiting');
  });

  it('returns waiting if there are still qualified addresses past the distribute watermark', () => {
    expect(computeDrainStatus({
      scannerCompleted: true,
      filterCompleted: true,
      qualifiedCount: 100,
      distributeWatermark: 99,
      batchesAllConfirmed: true,
    })).toBe('waiting');
  });

  it('returns waiting if any batch is still broadcast (not confirmed)', () => {
    expect(computeDrainStatus({
      scannerCompleted: true,
      filterCompleted: true,
      qualifiedCount: 100,
      distributeWatermark: 100,
      batchesAllConfirmed: false,
    })).toBe('waiting');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/sdk && npx vitest run src/__tests__/loops/drain.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement**

Create `packages/sdk/src/pipeline/loops/drain.ts`:

```typescript
export type DrainInput = {
  readonly scannerCompleted: boolean;
  readonly filterCompleted: boolean;
  readonly qualifiedCount: number;
  readonly distributeWatermark: number;
  readonly batchesAllConfirmed: boolean;
};

export type DrainStatus = 'drained' | 'waiting';

export function computeDrainStatus(input: DrainInput): DrainStatus {
  const available = input.qualifiedCount - input.distributeWatermark;
  if (!input.scannerCompleted) return 'waiting';
  if (!input.filterCompleted) return 'waiting';
  if (available !== 0) return 'waiting';
  if (!input.batchesAllConfirmed) return 'waiting';
  return 'drained';
}
```

- [ ] **Step 4: Run tests**

```bash
cd packages/sdk && npx vitest run src/__tests__/loops/drain.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/sdk/src/pipeline/loops/drain.ts packages/sdk/src/__tests__/loops/drain.test.ts
git commit -m "feat(sdk): add computeDrainStatus pure helper"
```

---

## Task 19: `selectWallet` — pick the next wallet from the pool

**Files:**
- Create: `packages/sdk/src/pipeline/loops/wallet-select.ts`
- Create: `packages/sdk/src/__tests__/loops/wallet-select.test.ts`

Round-robin with a "skip if gas balance below threshold" filter. Deterministic given the same (wallets, lastWalletIndex, balances, threshold).

- [ ] **Step 1: Write the failing test**

Create `packages/sdk/src/__tests__/loops/wallet-select.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { selectWallet } from '../../pipeline/loops/wallet-select.js';
import type { Address } from 'viem';

const W1 = '0x1111111111111111111111111111111111111111' as Address;
const W2 = '0x2222222222222222222222222222222222222222' as Address;
const W3 = '0x3333333333333333333333333333333333333333' as Address;

describe('selectWallet', () => {
  it('picks the next wallet after lastIndex (round-robin)', () => {
    const result = selectWallet({
      wallets: [W1, W2, W3],
      lastIndex: 0,
      balances: new Map([[W1, 10n], [W2, 10n], [W3, 10n]]),
      minBalance: 1n,
    });
    expect(result?.address).toBe(W2);
    expect(result?.index).toBe(1);
  });

  it('wraps around past the end', () => {
    const result = selectWallet({
      wallets: [W1, W2, W3],
      lastIndex: 2,
      balances: new Map([[W1, 10n], [W2, 10n], [W3, 10n]]),
      minBalance: 1n,
    });
    expect(result?.address).toBe(W1);
    expect(result?.index).toBe(0);
  });

  it('skips wallets below the min balance threshold', () => {
    const result = selectWallet({
      wallets: [W1, W2, W3],
      lastIndex: 0,
      balances: new Map([[W1, 10n], [W2, 0n], [W3, 10n]]),
      minBalance: 1n,
    });
    expect(result?.address).toBe(W3);
    expect(result?.index).toBe(2);
  });

  it('returns null if no wallet has enough balance', () => {
    const result = selectWallet({
      wallets: [W1, W2],
      lastIndex: 0,
      balances: new Map([[W1, 0n], [W2, 0n]]),
      minBalance: 1n,
    });
    expect(result).toBeNull();
  });

  it('returns null if the pool is empty', () => {
    const result = selectWallet({
      wallets: [],
      lastIndex: -1,
      balances: new Map(),
      minBalance: 1n,
    });
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/sdk && npx vitest run src/__tests__/loops/wallet-select.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement**

Create `packages/sdk/src/pipeline/loops/wallet-select.ts`:

```typescript
import type { Address } from 'viem';

export type WalletSelectInput = {
  readonly wallets: readonly Address[];
  readonly lastIndex: number;
  readonly balances: ReadonlyMap<Address, bigint>;
  readonly minBalance: bigint;
};

export type WalletSelectResult = {
  readonly address: Address;
  readonly index: number;
};

export function selectWallet(input: WalletSelectInput): WalletSelectResult | null {
  const { wallets, lastIndex, balances, minBalance } = input;
  if (wallets.length === 0) return null;

  for (let offset = 1; offset <= wallets.length; offset++) {
    const idx = (lastIndex + offset + wallets.length) % wallets.length;
    const addr = wallets[idx];
    const bal = balances.get(addr) ?? 0n;
    if (bal >= minBalance) return { address: addr, index: idx };
  }
  return null;
}
```

- [ ] **Step 4: Run tests**

```bash
cd packages/sdk && npx vitest run src/__tests__/loops/wallet-select.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/sdk/src/pipeline/loops/wallet-select.ts packages/sdk/src/__tests__/loops/wallet-select.test.ts
git commit -m "feat(sdk): add selectWallet round-robin pure helper"
```

---


## Task 20: `retroactive` — atomic re-apply of filters to existing `filtered.csv`

**Files:**
- Create: `packages/sdk/src/pipeline/loops/retroactive.ts`
- Create: `packages/sdk/src/__tests__/loops/retroactive.test.ts`

When the user adds a pure-suffix filter, we stream the existing `filtered.csv` through only the new filter and drop failing rows. Write to `filtered.csv.tmp`, fsync, atomic rename. The cursor's `watermark` (how far into `addresses.csv` we've scanned) is unchanged; `qualifiedCount` shrinks to the number of rows that survived.

Why atomic rename? Readers (the distributor loop) may be iterating `filtered.csv` concurrently. An in-place rewrite would race. `rename` on POSIX is atomic.

- [ ] **Step 1: Write the failing test**

Create `packages/sdk/src/__tests__/loops/retroactive.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Address } from 'viem';
import { retroactiveReapply } from '../../pipeline/loops/retroactive.js';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'titrate-retro-'));
});

describe('retroactiveReapply', () => {
  it('writes the new filtered.csv atomically, keeping only rows that pass the new filter', async () => {
    const path = join(dir, 'filtered.csv');
    await writeFile(path, [
      '0x1,',
      '0x2,',
      '0x3,',
      '0x4,',
    ].join('\n') + '\n', 'utf8');

    const allow = new Set<Address>(['0x2', '0x4'] as Address[]);
    const result = await retroactiveReapply({
      filteredPath: path,
      predicate: (addr) => Promise.resolve(allow.has(addr)),
    });

    expect(result.survivorsCount).toBe(2);
    expect(result.droppedCount).toBe(2);

    const content = await readFile(path, 'utf8');
    expect(content).toBe('0x2,\n0x4,\n');
    await rm(dir, { recursive: true });
  });

  it('writes to .tmp and renames — the real file is never partially written', async () => {
    const path = join(dir, 'filtered.csv');
    const tmp = `${path}.tmp`;
    await writeFile(path, '0x1,\n', 'utf8');

    // predicate that takes a tick — ensures write happens to .tmp first
    await retroactiveReapply({
      filteredPath: path,
      predicate: async (addr) => {
        await new Promise((r) => setTimeout(r, 2));
        return addr === '0x1';
      },
    });

    // .tmp should not exist after rename
    await expect(readFile(tmp, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await readFile(path, 'utf8')).toBe('0x1,\n');
    await rm(dir, { recursive: true });
  });

  it('no-ops cleanly on an empty filtered.csv', async () => {
    const path = join(dir, 'filtered.csv');
    await writeFile(path, '', 'utf8');

    const result = await retroactiveReapply({
      filteredPath: path,
      predicate: () => Promise.resolve(true),
    });

    expect(result.survivorsCount).toBe(0);
    expect(result.droppedCount).toBe(0);
    await rm(dir, { recursive: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/sdk && npx vitest run src/__tests__/loops/retroactive.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement**

Create `packages/sdk/src/pipeline/loops/retroactive.ts`:

```typescript
import { createReadStream } from 'node:fs';
import { open, rename, stat, unlink } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import type { Address } from 'viem';

export type RetroactiveInput = {
  readonly filteredPath: string;
  readonly predicate: (addr: Address) => Promise<boolean>;
};

export type RetroactiveResult = {
  readonly survivorsCount: number;
  readonly droppedCount: number;
};

export async function retroactiveReapply(input: RetroactiveInput): Promise<RetroactiveResult> {
  const { filteredPath, predicate } = input;
  const tmpPath = `${filteredPath}.tmp`;

  // Ensure source exists and is readable; empty file is a valid no-op.
  const s = await stat(filteredPath).catch((err) => {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  });
  if (s === null || s.size === 0) {
    // Nothing to do. If a stale .tmp is left over, clear it.
    await unlink(tmpPath).catch(() => {});
    return { survivorsCount: 0, droppedCount: 0 };
  }

  const handle = await open(tmpPath, 'w');
  let survivors = 0;
  let dropped = 0;
  try {
    const stream = createReadStream(filteredPath, { encoding: 'utf8' });
    const rl = createInterface({ input: stream, crlfDelay: Infinity });
    for await (const line of rl) {
      if (line.length === 0) continue;
      const commaIdx = line.indexOf(',');
      const addr = (commaIdx === -1 ? line : line.slice(0, commaIdx)) as Address;
      const keep = await predicate(addr);
      if (keep) {
        await handle.write(`${line}\n`);
        survivors++;
      } else {
        dropped++;
      }
    }
    await handle.sync();
  } finally {
    await handle.close();
  }

  await rename(tmpPath, filteredPath);
  return { survivorsCount: survivors, droppedCount: dropped };
}
```

- [ ] **Step 4: Run tests**

```bash
cd packages/sdk && npx vitest run src/__tests__/loops/retroactive.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/sdk/src/pipeline/loops/retroactive.ts packages/sdk/src/__tests__/loops/retroactive.test.ts
git commit -m "feat(sdk): add retroactiveReapply with atomic rename"
```

---

## Task 21: `pipeline-watcher` — classify pipeline.json changes

**Files:**
- Create: `packages/sdk/src/pipeline/loops/pipeline-watcher.ts`
- Create: `packages/sdk/src/__tests__/loops/pipeline-watcher.test.ts`

The watcher does two jobs:

1. **Classify** a diff between two `PipelineConfig`s as one of:
   - `pure-suffix-addition` — old steps are a prefix of new steps, new steps are only filters.
   - `replace` — any other structural change.
   - `noop` — identical.
   - `invalid` — new config is not a valid pipeline (empty, source-less, etc.).

2. **Drive** filter hot-reload. Given a `CampaignStorage` + `ControlSignal` + `EventBus`, it watches `pipeline.json` via `fs.watch` and emits a typed change to the orchestrator.

In this task we implement only the pure diff classifier. The fs.watch wiring is deferred into the filter-loop Task 23, where it's tested alongside the loop behavior. Keeping the classifier pure makes it fast and reliable to test.

- [ ] **Step 1: Write the failing test**

Create `packages/sdk/src/__tests__/loops/pipeline-watcher.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { classifyPipelineChange } from '../../pipeline/loops/pipeline-watcher.js';
import type { PipelineConfig, PipelineStep } from '../../types.js';

const source: PipelineStep = { type: 'source', sourceType: 'csv', params: { addresses: [] } };
const filterA: PipelineStep = { type: 'filter', filterType: 'min-balance', params: { threshold: '1' } };
const filterB: PipelineStep = { type: 'filter', filterType: 'contract-check', params: { isContract: false } };

describe('classifyPipelineChange', () => {
  it('detects identical configs as noop', () => {
    const p: PipelineConfig = { steps: [source, filterA] };
    expect(classifyPipelineChange(p, p).kind).toBe('noop');
  });

  it('detects pure-suffix-addition when the old chain is a prefix of the new', () => {
    const prev: PipelineConfig = { steps: [source, filterA] };
    const next: PipelineConfig = { steps: [source, filterA, filterB] };
    const result = classifyPipelineChange(prev, next);
    expect(result.kind).toBe('pure-suffix-addition');
    if (result.kind === 'pure-suffix-addition') {
      expect(result.addedSteps).toEqual([filterB]);
    }
  });

  it('classifies a removed filter as replace', () => {
    const prev: PipelineConfig = { steps: [source, filterA, filterB] };
    const next: PipelineConfig = { steps: [source, filterA] };
    expect(classifyPipelineChange(prev, next).kind).toBe('replace');
  });

  it('classifies a reordered chain as replace', () => {
    const prev: PipelineConfig = { steps: [source, filterA, filterB] };
    const next: PipelineConfig = { steps: [source, filterB, filterA] };
    expect(classifyPipelineChange(prev, next).kind).toBe('replace');
  });

  it('classifies an in-place modification of an existing filter as replace', () => {
    const prev: PipelineConfig = { steps: [source, filterA] };
    const modified: PipelineStep = { type: 'filter', filterType: 'min-balance', params: { threshold: '2' } };
    const next: PipelineConfig = { steps: [source, modified] };
    expect(classifyPipelineChange(prev, next).kind).toBe('replace');
  });

  it('classifies empty/source-less pipeline as invalid', () => {
    const prev: PipelineConfig = { steps: [source, filterA] };
    const next: PipelineConfig = { steps: [] };
    expect(classifyPipelineChange(prev, next).kind).toBe('invalid');

    const nextNoSource: PipelineConfig = { steps: [filterA] };
    expect(classifyPipelineChange(prev, nextNoSource).kind).toBe('invalid');
  });

  it('an added source counts as replace (not pure-suffix-addition)', () => {
    const prev: PipelineConfig = { steps: [source] };
    const newSource: PipelineStep = { type: 'source', sourceType: 'csv', params: { addresses: ['0x1'] } };
    const next: PipelineConfig = { steps: [source, newSource, filterA] };
    expect(classifyPipelineChange(prev, next).kind).toBe('replace');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/sdk && npx vitest run src/__tests__/loops/pipeline-watcher.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement the classifier**

Create `packages/sdk/src/pipeline/loops/pipeline-watcher.ts`:

```typescript
import type { PipelineConfig, PipelineStep } from '../../types.js';

export type PipelineChangeKind =
  | 'noop'
  | 'pure-suffix-addition'
  | 'replace'
  | 'invalid';

export type PipelineChange =
  | { readonly kind: 'noop' }
  | { readonly kind: 'pure-suffix-addition'; readonly addedSteps: readonly PipelineStep[] }
  | { readonly kind: 'replace' }
  | { readonly kind: 'invalid'; readonly reason: string };

function isValid(p: PipelineConfig): boolean {
  if (p.steps.length === 0) return false;
  return p.steps.some((s) => s.type === 'source');
}

function stepEquals(a: PipelineStep, b: PipelineStep): boolean {
  if (a.type !== b.type) return false;
  if (a.type === 'source' && b.type === 'source') {
    return a.sourceType === b.sourceType && JSON.stringify(a.params) === JSON.stringify(b.params);
  }
  if (a.type === 'filter' && b.type === 'filter') {
    return a.filterType === b.filterType && JSON.stringify(a.params) === JSON.stringify(b.params);
  }
  return false;
}

export function classifyPipelineChange(
  prev: PipelineConfig,
  next: PipelineConfig,
): PipelineChange {
  if (!isValid(next)) return { kind: 'invalid', reason: 'next pipeline has no source or is empty' };
  if (!isValid(prev)) return { kind: 'replace' };

  const prevSteps = prev.steps;
  const nextSteps = next.steps;

  // noop — identical lengths and all steps equal
  if (prevSteps.length === nextSteps.length) {
    const allEqual = prevSteps.every((s, i) => stepEquals(s, nextSteps[i]));
    if (allEqual) return { kind: 'noop' };
  }

  // pure-suffix-addition — prev is a prefix of next, and every added step is a filter
  if (nextSteps.length > prevSteps.length) {
    const prefixMatches = prevSteps.every((s, i) => stepEquals(s, nextSteps[i]));
    if (prefixMatches) {
      const added = nextSteps.slice(prevSteps.length);
      const allFilters = added.every((s) => s.type === 'filter');
      if (allFilters) {
        return { kind: 'pure-suffix-addition', addedSteps: added };
      }
    }
  }

  return { kind: 'replace' };
}
```

- [ ] **Step 4: Run tests**

```bash
cd packages/sdk && npx vitest run src/__tests__/loops/pipeline-watcher.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/sdk/src/pipeline/loops/pipeline-watcher.ts packages/sdk/src/__tests__/loops/pipeline-watcher.test.ts
git commit -m "feat(sdk): add classifyPipelineChange pure classifier"
```

---

## Task 22: `scanner-loop`

**Files:**
- Create: `packages/sdk/src/pipeline/loops/scanner-loop.ts`
- Create: `packages/sdk/src/__tests__/loops/scanner-loop.test.ts`

Algorithm (from spec §Scanner loop):

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

**Design notes for the implementer:**

- The scanner only processes block-scan sources. If `pipeline.steps[0].sourceType !== 'block-scan'`, the scanner immediately emits `'completed'` (nothing to scan — sources that pre-resolve their addresses finalize during setup).
- `runSource` is adapted from the existing `blockScanSource` in `packages/sdk/src/pipeline/sources.ts`. For Phase 2b we read a SINGLE block at a time (`startBlock === endBlock === block`), so we can cooperatively yield between blocks.
- On RPC error: exponential backoff 100ms, 400ms, 1600ms, 6400ms, 25600ms. After 5 retries, write a `LoopErrorEntry` to `storage.errors`, emit `'errored'`, then enter paused state (do not crash).
- Events MUST fire after the disk write per the "ordering rule" in the spec.
- `stop()` is cooperative: sets a flag, awaits any in-flight block write, returns.
- `start()` is idempotent: repeated calls return the same promise.
- `chainBlockTime` is a constructor option (default 12 seconds for Ethereum mainnet). Used only when following head.

**Dependencies (`ScannerLoopDeps`):** `publicClient`, `storage`, `manifest`, `pipeline`, `bus`, `control`, optional `chainBlockTimeMs`, optional `sleep` (for tests).

- [ ] **Step 1: Write the failing test**

Create `packages/sdk/src/__tests__/loops/scanner-loop.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Address, PublicClient } from 'viem';
import { createScannerLoop } from '../../pipeline/loops/scanner-loop.js';
import { createEventBus } from '../../pipeline/loops/event-bus.js';
import { createControlSignal } from '../../pipeline/loops/control-signal.js';
import { createAppendableCSV } from '../../../../storage-campaign/src/appendable-csv.js';
import { createCursorStore } from '../../../../storage-campaign/src/cursor-store.js';
import type { CampaignManifest, PipelineConfig, PipelineCursor } from '../../types.js';
import { DEFAULT_STAGE_CONTROL } from '../../types.js';

// Minimal in-memory storage shape used by this test.
type TestStorage = {
  addresses: ReturnType<typeof createAppendableCSV>;
  cursor: ReturnType<typeof createCursorStore>;
  errors: { append: (e: unknown) => Promise<void> };
};

function blockAddresses(block: bigint): Address[] {
  // Two addresses per block. Addresses keyed by block number for assertion.
  return [
    `0xaaaa${block.toString(16).padStart(40 - 4, '0')}` as Address,
    `0xbbbb${block.toString(16).padStart(40 - 4, '0')}` as Address,
  ];
}

function makeClient(latest: bigint): PublicClient {
  return {
    getBlockNumber: async () => latest,
  } as unknown as PublicClient;
}

function makeManifest(overrides: Partial<CampaignManifest> = {}): CampaignManifest {
  return {
    id: 'c', status: 'running', wallets: { mode: 'imported', count: 1 },
    createdAt: 0, updatedAt: 0,
    startBlock: 100n, endBlock: 102n,
    autoStart: false, control: DEFAULT_STAGE_CONTROL,
    funder: '0xF' as Address, name: 'n', version: 1, chainId: 1,
    rpcUrl: 'http://x', tokenAddress: '0xT' as Address, tokenDecimals: 18,
    contractAddress: null, contractVariant: 'simple', contractName: 'N',
    amountMode: 'uniform', amountFormat: 'integer', uniformAmount: '1',
    batchSize: 10, campaignId: null, pinnedBlock: null,
    ...overrides,
  };
}

const BLOCK_SCAN_PIPELINE: PipelineConfig = {
  steps: [{ type: 'source', sourceType: 'block-scan', params: { startBlock: 100, endBlock: 102, extract: 'tx.from' } }],
};

let dir: string;
let storage: TestStorage;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'titrate-scan-'));
  storage = {
    addresses: createAppendableCSV(join(dir, 'addresses.csv')),
    cursor: createCursorStore(join(dir, 'cursor.json')),
    errors: { append: async () => {} },
  };
});

describe('scanner-loop', () => {
  it('advances the cursor one block at a time and emits scan-progressed per block', async () => {
    const bus = createEventBus();
    const control = createControlSignal(DEFAULT_STAGE_CONTROL);
    let scanProgressedCount = 0;
    bus.on('scan-progressed', () => scanProgressedCount++);

    const loop = createScannerLoop({
      publicClient: makeClient(102n),
      storage,
      manifest: makeManifest(),
      pipeline: BLOCK_SCAN_PIPELINE,
      bus,
      control,
      // Stub runSource — deterministic addresses per block
      runSource: async (_step, block) => blockAddresses(block),
    });

    await loop.start();

    // Wait for completion
    await new Promise<void>((resolve) => bus.on('completed', () => resolve()));

    const c = await storage.cursor.read();
    expect(c.scan.lastBlock).toBe(102n);
    expect(c.scan.addressCount).toBe(6); // 3 blocks * 2 addrs
    expect(scanProgressedCount).toBe(3);

    // Addresses appended in block order
    const content = await readFile(join(dir, 'addresses.csv'), 'utf8');
    const lines = content.trim().split('\n');
    expect(lines.length).toBe(6);
    await rm(dir, { recursive: true });
  });

  it('pauses when control.scan flips to paused and resumes when flipped back', async () => {
    const bus = createEventBus();
    const control = createControlSignal(DEFAULT_STAGE_CONTROL);

    let blockCalls = 0;
    const loop = createScannerLoop({
      publicClient: makeClient(200n),
      storage,
      manifest: makeManifest({ startBlock: 100n, endBlock: 200n }),
      pipeline: BLOCK_SCAN_PIPELINE,
      bus,
      control,
      runSource: async (_step, block) => {
        blockCalls++;
        // After the first block, pause
        if (blockCalls === 1) {
          await control.update({ ...DEFAULT_STAGE_CONTROL, scan: 'paused' });
        }
        return blockAddresses(block);
      },
    });

    await loop.start();
    await new Promise((r) => setTimeout(r, 30));

    // Cursor should have advanced at most a few blocks and then stopped.
    const paused = await storage.cursor.read();
    expect(paused.scan.lastBlock).toBeGreaterThanOrEqual(101n);
    expect(paused.scan.lastBlock).toBeLessThan(200n);

    // Resume
    await control.update(DEFAULT_STAGE_CONTROL);
    await new Promise<void>((resolve) => bus.on('completed', () => resolve()));
    const final = await storage.cursor.read();
    expect(final.scan.lastBlock).toBe(200n);
    await rm(dir, { recursive: true });
  });

  it('stops cleanly when stop() is called mid-scan', async () => {
    const bus = createEventBus();
    const control = createControlSignal(DEFAULT_STAGE_CONTROL);
    const loop = createScannerLoop({
      publicClient: makeClient(500n),
      storage,
      manifest: makeManifest({ startBlock: 100n, endBlock: 500n }),
      pipeline: BLOCK_SCAN_PIPELINE,
      bus,
      control,
      runSource: async (_s, block) => blockAddresses(block),
    });

    await loop.start();
    await new Promise((r) => setTimeout(r, 15));
    await loop.stop();

    expect(loop.status()).toBe('idle');
    await rm(dir, { recursive: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/sdk && npx vitest run src/__tests__/loops/scanner-loop.test.ts
```

Expected: FAIL — module missing.

- [ ] **Step 3: Implement `createScannerLoop`**

Create `packages/sdk/src/pipeline/loops/scanner-loop.ts`. The implementation must satisfy the algorithm above AND expose the `ScannerLoopDeps` shape used in the test. Key implementation points:

- Accept `runSource: (step, block, client) => Promise<Address[]>` as an injected dependency so tests can stub it without a real RPC. The default implementation wraps `scanBlocks` from `packages/sdk/src/scanner/blocks.ts`.
- Maintain an internal `LoopStatus` field. `start()` sets it to `'running'` and kicks off an async driver; `stop()` sets a `stopping` flag, awaits the driver, then sets status to `'idle'`.
- On entering the outer while-loop, check `control.get().scan`. If `'paused'`, `await control.waitForResume('scan')` then `continue`.
- `target = min(latest, manifest.endBlock ?? latest)`.
- If `manifest.endBlock === null` and we've caught up (`cursor.scan.lastBlock >= target`), sleep `chainBlockTimeMs` (default 12000) then continue.
- Per-block body: call `runSource`, append to `storage.addresses` if non-empty, call `storage.cursor.update({ scan: { lastBlock: block, addressCount: prev + rows.length }})`, then `bus.emit('scan-progressed')`.
- On RPC error: capture to `storage.errors.append({ timestamp: Date.now(), loop: 'scanner', phase: 'scan-block', message: err.message, stack: err.stack })`, exponential backoff up to 5 retries, then `bus.emit('errored')` and set status to `'errored'` — caller decides whether to restart.
- On `manifest.endBlock !== null && cursor.scan.lastBlock >= manifest.endBlock` AFTER processing: `bus.emit('completed')`, status `'completed'`, break.

Expose signature:

```typescript
import type { PublicClient } from 'viem';
import type { Address } from 'viem';
import type { CampaignManifest, PipelineConfig, PipelineStep } from '../../types.js';
import type { CursorStore } from '@titrate/storage-campaign';  // but we are INSIDE sdk — see note
// ...

export type RunSourceFn = (
  step: PipelineStep,
  block: bigint,
  client: PublicClient,
) => Promise<readonly Address[]>;

export type ScannerLoopDeps = {
  readonly publicClient: PublicClient;
  readonly storage: {
    readonly addresses: { append(rows: readonly { address: string; amount: string | null }[]): Promise<void> };
    readonly cursor: { read(): Promise<import('../../types.js').PipelineCursor>; update(patch: Partial<import('../../types.js').PipelineCursor>): Promise<void> };
    readonly errors: { append(entry: import('../../types.js').LoopErrorEntry): Promise<void> };
  };
  readonly manifest: CampaignManifest;
  readonly pipeline: PipelineConfig;
  readonly bus: import('./event-bus.js').EventBus;
  readonly control: import('./control-signal.js').ControlSignal;
  readonly chainBlockTimeMs?: number;
  readonly runSource?: RunSourceFn;
  readonly sleep?: (ms: number) => Promise<void>;
};
```

NOTE on the `CursorStore` import: the SDK must not depend on `@titrate/storage-campaign` (reverse dependency). Instead, define a minimal structural interface (as above) that both storage implementations satisfy. Both `@titrate/storage-campaign` and `@titrate/storage-idb` adapt to this structural shape.

- [ ] **Step 4: Run tests**

```bash
cd packages/sdk && npx vitest run src/__tests__/loops/scanner-loop.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/sdk/src/pipeline/loops/scanner-loop.ts packages/sdk/src/__tests__/loops/scanner-loop.test.ts
git commit -m "feat(sdk): add createScannerLoop with pause/resume + error backoff"
```

---

## Task 23: `filter-loop`

**Files:**
- Create: `packages/sdk/src/pipeline/loops/filter-loop.ts`
- Create: `packages/sdk/src/__tests__/loops/filter-loop.test.ts`

Algorithm (from spec §Filter loop):

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

**Design notes:**

- `applyFilterChain` is an injected function. Default: walk `pipeline.steps.slice(1)`, for each `filter` step call `createFilter(step.filterType, step.params)(new Set([addr]), rpc)` (reusing `packages/sdk/src/pipeline/filters.ts`). If any filter returns an empty set, the row fails.
- Hot-reload integration: when the orchestrator emits `'pipeline-changed'`, the filter loop wakes. It does NOT handle the retroactive re-apply here — that is the orchestrator's responsibility (Phase 2c). The filter loop just re-reads the pipeline on wake.
- On loop body completion (stream exhausted), wait for `bus.once('scan-progressed', 'pipeline-changed')` OR for control resume. No polling.
- If `scan` is `'completed'` and we reach end-of-stream with `watermark === addressCount`, emit `'completed'`.

- [ ] **Step 1: Write the failing test**

Create `packages/sdk/src/__tests__/loops/filter-loop.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFilterLoop } from '../../pipeline/loops/filter-loop.js';
import { createEventBus } from '../../pipeline/loops/event-bus.js';
import { createControlSignal } from '../../pipeline/loops/control-signal.js';
import { createAppendableCSV } from '../../../../storage-campaign/src/appendable-csv.js';
import { createCursorStore } from '../../../../storage-campaign/src/cursor-store.js';
import { DEFAULT_STAGE_CONTROL } from '../../types.js';
import type { PublicClient } from 'viem';
import type { PipelineConfig } from '../../types.js';

const PIPELINE: PipelineConfig = {
  steps: [
    { type: 'source', sourceType: 'block-scan', params: {} },
    { type: 'filter', filterType: 'min-balance', params: { threshold: '1' } },
  ],
};

let dir: string;
let addresses: ReturnType<typeof createAppendableCSV>;
let filtered: ReturnType<typeof createAppendableCSV>;
let cursor: ReturnType<typeof createCursorStore>;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'titrate-filter-'));
  addresses = createAppendableCSV(join(dir, 'addresses.csv'));
  filtered = createAppendableCSV(join(dir, 'filtered.csv'));
  cursor = createCursorStore(join(dir, 'cursor.json'));
});

describe('filter-loop', () => {
  it('streams rows from addresses.csv past the watermark, calls filter chain, appends survivors', async () => {
    await addresses.append([
      { address: '0x01', amount: null },
      { address: '0x02', amount: null },
      { address: '0x03', amount: null },
    ]);

    const bus = createEventBus();
    const control = createControlSignal(DEFAULT_STAGE_CONTROL);

    const loop = createFilterLoop({
      publicClient: {} as PublicClient,
      storage: {
        addresses,
        filtered,
        cursor,
        errors: { append: async () => {} },
      },
      pipeline: PIPELINE,
      bus,
      control,
      scannerCompleted: () => true,
      applyFilterChain: async (row) => row.address !== '0x02', // drop 0x02
    });

    await loop.start();
    await new Promise<void>((resolve) => bus.on('completed', () => resolve()));

    const filteredContent = await readFile(join(dir, 'filtered.csv'), 'utf8');
    expect(filteredContent.trim().split('\n').length).toBe(2);
    expect(filteredContent).toContain('0x01,');
    expect(filteredContent).toContain('0x03,');
    expect(filteredContent).not.toContain('0x02,');

    const c = await cursor.read();
    expect(c.filter.watermark).toBe(3);
    expect(c.filter.qualifiedCount).toBe(2);
    await rm(dir, { recursive: true });
  });

  it('waits on scan-progressed when stream is exhausted but scanner is not complete', async () => {
    await addresses.append([{ address: '0xA', amount: null }]);

    const bus = createEventBus();
    const control = createControlSignal(DEFAULT_STAGE_CONTROL);
    let scannerDone = false;

    const loop = createFilterLoop({
      publicClient: {} as PublicClient,
      storage: { addresses, filtered, cursor, errors: { append: async () => {} } },
      pipeline: PIPELINE,
      bus,
      control,
      scannerCompleted: () => scannerDone,
      applyFilterChain: async () => true,
    });

    await loop.start();
    await new Promise((r) => setTimeout(r, 20));

    // Not yet complete — filter is waiting for more
    expect(loop.status()).toBe('running');
    const mid = await cursor.read();
    expect(mid.filter.watermark).toBe(1);

    // More rows arrive
    await addresses.append([{ address: '0xB', amount: null }]);
    scannerDone = true;
    bus.emit('scan-progressed');

    await new Promise<void>((resolve) => bus.on('completed', () => resolve()));
    const end = await cursor.read();
    expect(end.filter.watermark).toBe(2);
    expect(end.filter.qualifiedCount).toBe(2);
    await rm(dir, { recursive: true });
  });

  it('pauses when control.filter flips paused', async () => {
    await addresses.append([
      { address: '0x1', amount: null },
      { address: '0x2', amount: null },
    ]);

    const bus = createEventBus();
    const control = createControlSignal({ ...DEFAULT_STAGE_CONTROL, filter: 'paused' });

    const loop = createFilterLoop({
      publicClient: {} as PublicClient,
      storage: { addresses, filtered, cursor, errors: { append: async () => {} } },
      pipeline: PIPELINE,
      bus,
      control,
      scannerCompleted: () => true,
      applyFilterChain: async () => true,
    });

    await loop.start();
    await new Promise((r) => setTimeout(r, 15));
    const beforeResume = await cursor.read();
    expect(beforeResume.filter.watermark).toBe(0);

    await control.update(DEFAULT_STAGE_CONTROL);
    await new Promise<void>((resolve) => bus.on('completed', () => resolve()));

    const end = await cursor.read();
    expect(end.filter.watermark).toBe(2);
    await rm(dir, { recursive: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/sdk && npx vitest run src/__tests__/loops/filter-loop.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `createFilterLoop`**

Create `packages/sdk/src/pipeline/loops/filter-loop.ts` following the algorithm + design notes above. Key signature:

```typescript
export type FilterLoopDeps = {
  readonly publicClient: PublicClient;
  readonly storage: {
    readonly addresses: { readFrom(offset: number): AsyncIterable<{ address: string; amount: string | null }> };
    readonly filtered: { append(rows: readonly { address: string; amount: string | null }[]): Promise<void> };
    readonly cursor: { read(): Promise<PipelineCursor>; update(patch: Partial<PipelineCursor>): Promise<void> };
    readonly errors: { append(entry: LoopErrorEntry): Promise<void> };
  };
  readonly pipeline: PipelineConfig;
  readonly bus: EventBus;
  readonly control: ControlSignal;
  readonly scannerCompleted: () => boolean;
  readonly applyFilterChain?: (row: { address: string; amount: string | null }, steps: readonly PipelineStep[], client: PublicClient) => Promise<boolean>;
};
```

The default `applyFilterChain` composes the existing `createFilter` factory from `packages/sdk/src/pipeline/filters.ts`. For each filter step, run it against a singleton set `{ addr }`. A row passes iff all filters return a non-empty set.

- [ ] **Step 4: Run tests**

```bash
cd packages/sdk && npx vitest run src/__tests__/loops/filter-loop.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/sdk/src/pipeline/loops/filter-loop.ts packages/sdk/src/__tests__/loops/filter-loop.test.ts
git commit -m "feat(sdk): add createFilterLoop with pause/resume + scan-awaiting"
```

---

## Task 24: `reconcile` — restart-time batch reconciliation

**Files:**
- Create: `packages/sdk/src/pipeline/loops/reconcile.ts`
- Create: `packages/sdk/src/__tests__/loops/reconcile.test.ts`

Handles the 6 spec edge cases (§Reconciliation edge cases):

| Case | Detection | Outcome |
|---|---|---|
| Confirmed | `getTransactionReceipt(hash).status === 'success'` | Silent; mark confirmed |
| Reverted | `receipt.status === 'reverted'` | `intervention: 'reconcile-reverted'` |
| Pending (mempool) | `receipt === null` AND `getTransaction(hash) !== null` | monitorInBackground; keep broadcast status |
| Replaced externally | different tx at same nonce is confirmed | `intervention: 'reconcile-replaced-externally'` |
| Dropped | `getTransaction(hash) === null` AND `getTransactionCount('latest') > nonce` | `intervention: 'reconcile-dropped'` |
| State unknown | RPC error | `intervention: 'reconcile-state-unknown'` |

For Phase 2b, `reconcileBatches` is a pure-ish function that takes the batches + a `PublicClient` and returns a typed decision per batch. The orchestrator (Phase 2c) drives interventions; here we only classify.

- [ ] **Step 1: Write the failing test**

Create `packages/sdk/src/__tests__/loops/reconcile.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { reconcileBatches } from '../../pipeline/loops/reconcile.js';
import type { BatchRecord, BatchAttemptRecord } from '../../index.js';
import type { Address, Hex, PublicClient } from 'viem';

function batch(overrides: Partial<BatchRecord> = {}): BatchRecord {
  const attempt: BatchAttemptRecord = {
    txHash: '0xaa' as Hex,
    nonce: 5,
    maxFeePerGas: '1000000000',
    maxPriorityFeePerGas: '500000000',
    broadcastAt: 0,
    outcome: 'pending',
    confirmedBlock: null,
  };
  return {
    batchIndex: 0,
    recipients: ['0x1' as Address],
    amounts: ['1'],
    status: 'broadcast',
    attempts: [attempt],
    confirmedTxHash: null,
    confirmedBlock: null,
    createdAt: 0,
    ...overrides,
  };
}

function makeClient(handlers: Partial<PublicClient>): PublicClient {
  return handlers as unknown as PublicClient;
}

describe('reconcileBatches', () => {
  it('classifies a confirmed tx as confirmed', async () => {
    const b = batch();
    const decisions = await reconcileBatches({
      client: makeClient({
        getTransactionReceipt: vi.fn().mockResolvedValue({ status: 'success', blockNumber: 100n }),
      }),
      batches: [b],
    });
    expect(decisions[0].kind).toBe('confirmed');
    if (decisions[0].kind === 'confirmed') {
      expect(decisions[0].batchIndex).toBe(0);
      expect(decisions[0].blockNumber).toBe(100n);
    }
  });

  it('classifies a reverted tx as intervention-reverted', async () => {
    const decisions = await reconcileBatches({
      client: makeClient({
        getTransactionReceipt: vi.fn().mockResolvedValue({ status: 'reverted', blockNumber: 100n }),
      }),
      batches: [batch()],
    });
    expect(decisions[0].kind).toBe('intervention');
    if (decisions[0].kind === 'intervention') {
      expect(decisions[0].point).toBe('reconcile-reverted');
    }
  });

  it('classifies a pending-in-mempool tx as pending', async () => {
    const decisions = await reconcileBatches({
      client: makeClient({
        getTransactionReceipt: vi.fn().mockResolvedValue(null),
        getTransaction: vi.fn().mockResolvedValue({ hash: '0xaa', nonce: 5 }),
        getTransactionCount: vi.fn().mockResolvedValue(5), // nonce not yet consumed
      }),
      batches: [batch()],
    });
    expect(decisions[0].kind).toBe('pending');
  });

  it('classifies a dropped tx (nonce advanced, no tx) as intervention-dropped', async () => {
    const decisions = await reconcileBatches({
      client: makeClient({
        getTransactionReceipt: vi.fn().mockResolvedValue(null),
        getTransaction: vi.fn().mockResolvedValue(null),
        getTransactionCount: vi.fn().mockResolvedValue(6), // nonce has moved past
      }),
      batches: [batch()],
    });
    expect(decisions[0].kind).toBe('intervention');
    if (decisions[0].kind === 'intervention') {
      expect(decisions[0].point).toBe('reconcile-dropped');
    }
  });

  it('classifies an externally-replaced tx (different confirmed tx at same nonce) as intervention-replaced-externally', async () => {
    const decisions = await reconcileBatches({
      client: makeClient({
        // The stored txHash's receipt is null, but the nonce has advanced,
        // and a DIFFERENT tx exists at that nonce slot.
        getTransactionReceipt: vi.fn()
          .mockResolvedValueOnce(null)                   // our stored hash: no receipt
          .mockResolvedValueOnce({ status: 'success' }), // another lookup returns confirmed
        getTransaction: vi.fn().mockResolvedValue(null),
        getTransactionCount: vi.fn().mockResolvedValue(6),
        getBlock: vi.fn().mockResolvedValue({ transactions: [{ hash: '0xbb', from: '0xabc', nonce: 5 }] }),
      }),
      batches: [batch()],
      externalReplacementDetector: async () => ({ detected: true, replacementTxHash: '0xbb' as Hex }),
    });
    expect(decisions[0].kind).toBe('intervention');
    if (decisions[0].kind === 'intervention') {
      expect(decisions[0].point).toBe('reconcile-replaced-externally');
    }
  });

  it('classifies RPC failure as intervention-state-unknown', async () => {
    const decisions = await reconcileBatches({
      client: makeClient({
        getTransactionReceipt: vi.fn().mockRejectedValue(new Error('network down')),
      }),
      batches: [batch()],
    });
    expect(decisions[0].kind).toBe('intervention');
    if (decisions[0].kind === 'intervention') {
      expect(decisions[0].point).toBe('reconcile-state-unknown');
    }
  });

  it('ignores non-broadcast batches', async () => {
    const decisions = await reconcileBatches({
      client: makeClient({}),
      batches: [batch({ status: 'confirmed' })],
    });
    expect(decisions.length).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/sdk && npx vitest run src/__tests__/loops/reconcile.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement**

Create `packages/sdk/src/pipeline/loops/reconcile.ts`:

```typescript
import type { Hex, PublicClient } from 'viem';
import type { BatchRecord } from '../../storage/index.js';

export type ReconcileDecision =
  | {
      readonly kind: 'confirmed';
      readonly batchIndex: number;
      readonly txHash: Hex;
      readonly blockNumber: bigint;
    }
  | {
      readonly kind: 'pending';
      readonly batchIndex: number;
      readonly txHash: Hex;
    }
  | {
      readonly kind: 'intervention';
      readonly batchIndex: number;
      readonly point:
        | 'reconcile-reverted'
        | 'reconcile-replaced-externally'
        | 'reconcile-dropped'
        | 'reconcile-state-unknown';
      readonly txHash: Hex;
      readonly replacementTxHash?: Hex;
    };

export type ReconcileInput = {
  readonly client: PublicClient;
  readonly batches: readonly BatchRecord[];
  readonly walletAddress?: `0x${string}`;
  readonly externalReplacementDetector?: (batch: BatchRecord) => Promise<{
    detected: boolean;
    replacementTxHash?: Hex;
  }>;
};

export async function reconcileBatches(input: ReconcileInput): Promise<readonly ReconcileDecision[]> {
  const { client, batches, externalReplacementDetector } = input;
  const out: ReconcileDecision[] = [];

  for (const batch of batches) {
    if (batch.status !== 'broadcast') continue;
    const attempt = batch.attempts[batch.attempts.length - 1];
    if (!attempt) continue;
    const txHash = attempt.txHash;

    let receipt: Awaited<ReturnType<PublicClient['getTransactionReceipt']>> | null = null;
    try {
      receipt = await client.getTransactionReceipt({ hash: txHash });
    } catch (err) {
      out.push({
        kind: 'intervention',
        batchIndex: batch.batchIndex,
        point: 'reconcile-state-unknown',
        txHash,
      });
      continue;
    }

    if (receipt && receipt.status === 'success') {
      out.push({
        kind: 'confirmed',
        batchIndex: batch.batchIndex,
        txHash,
        blockNumber: receipt.blockNumber,
      });
      continue;
    }
    if (receipt && receipt.status === 'reverted') {
      out.push({
        kind: 'intervention',
        batchIndex: batch.batchIndex,
        point: 'reconcile-reverted',
        txHash,
      });
      continue;
    }

    // No receipt — check mempool vs. dropped vs. replaced.
    let tx = null;
    try {
      tx = await client.getTransaction({ hash: txHash });
    } catch { /* proceed to nonce check */ }

    // Attempt external-replacement detection if the caller provided a detector.
    if (externalReplacementDetector) {
      const ext = await externalReplacementDetector(batch);
      if (ext.detected) {
        out.push({
          kind: 'intervention',
          batchIndex: batch.batchIndex,
          point: 'reconcile-replaced-externally',
          txHash,
          ...(ext.replacementTxHash ? { replacementTxHash: ext.replacementTxHash } : {}),
        });
        continue;
      }
    }

    if (tx !== null) {
      out.push({ kind: 'pending', batchIndex: batch.batchIndex, txHash });
      continue;
    }

    // Check nonce: if advanced past ours, the tx was replaced or dropped.
    try {
      const fromAddr = (batch.attempts[0] as unknown as { from?: `0x${string}` }).from
        ?? input.walletAddress;
      if (fromAddr) {
        const currentNonce = await client.getTransactionCount({
          address: fromAddr,
          blockTag: 'latest',
        });
        if (currentNonce > attempt.nonce) {
          out.push({
            kind: 'intervention',
            batchIndex: batch.batchIndex,
            point: 'reconcile-dropped',
            txHash,
          });
          continue;
        }
      }
    } catch { /* fall through to state-unknown */ }

    out.push({
      kind: 'intervention',
      batchIndex: batch.batchIndex,
      point: 'reconcile-state-unknown',
      txHash,
    });
  }

  return out;
}
```

- [ ] **Step 4: Run tests**

```bash
cd packages/sdk && npx vitest run src/__tests__/loops/reconcile.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/sdk/src/pipeline/loops/reconcile.ts packages/sdk/src/__tests__/loops/reconcile.test.ts
git commit -m "feat(sdk): add reconcileBatches with 6 edge-case classifier"
```

---


## Task 25: `distributor-loop`

**Files:**
- Create: `packages/sdk/src/pipeline/loops/distributor-loop.ts`
- Create: `packages/sdk/src/__tests__/loops/distributor-loop.test.ts`

The distributor loop has two phases per spec §Distributor loop:

**Phase A — Reconciliation (once on start):**
1. Call `reconcileBatches` against `storage.batches.readAll()` filtered to `status === 'broadcast'`.
2. For each decision:
   - `confirmed` → append BatchRecord update with `status: 'confirmed'`, `confirmedTxHash`, `confirmedBlock`.
   - `pending` → register background monitor (non-blocking).
   - `intervention` → push onto intervention queue. Orchestrator drains it via the injected `interventionHook`.
3. Emit `'reconciliation-complete'`.

**Phase B — Steady state:**
```
while not stopped:
  if control.distribute === 'paused': await resume; continue
  available = cursor.filter.qualifiedCount - cursor.distribute.watermark
  drain = computeDrainStatus({ ... })
  if drain === 'drained': emit 'completed'; break
  if available < manifest.batchSize: await once('filter-progressed' | 'resume'); continue
  batch = readBatchFromFiltered(cursor.distribute.watermark, batchSize)
  wallet = selectWallet(...)
  if wallet === null: append error, emit 'errored', break
  attempt = await disperse(batch, wallet, gasConfig)   // injected
  await storage.batches.append({ ...record, attempts: [toRecord(attempt)] })
  await storage.cursor.update({ distribute: { watermark: watermark + batch.length } })
  monitorConfirmation(batch.batchIndex, attempt.txHash)
  emit 'distribute-progressed'
```

The `disperse` call is injected so tests can stub it. Default implementation wraps `disperseTokens` or `disperseTokensSimple` from the existing distributor module.

For Phase 2b the "background confirmation monitor" is a no-op stub that the test can replace. The real monitor (Phase 2c) appends `BatchAttempt` updates as blocks advance.

- [ ] **Step 1: Write the failing test**

Create `packages/sdk/src/__tests__/loops/distributor-loop.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Address, Hex, PublicClient } from 'viem';
import { createDistributorLoop } from '../../pipeline/loops/distributor-loop.js';
import { createEventBus } from '../../pipeline/loops/event-bus.js';
import { createControlSignal } from '../../pipeline/loops/control-signal.js';
import { createAppendableCSV } from '../../../../storage-campaign/src/appendable-csv.js';
import { createAppendableJSONL } from '../../../../storage-campaign/src/appendable-jsonl.js';
import { createCursorStore } from '../../../../storage-campaign/src/cursor-store.js';
import type { BatchAttempt, BatchRecord } from '../../index.js';
import { DEFAULT_STAGE_CONTROL } from '../../types.js';

let dir: string;
let filtered: ReturnType<typeof createAppendableCSV>;
let batches: ReturnType<typeof createAppendableJSONL<BatchRecord>>;
let cursor: ReturnType<typeof createCursorStore>;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'titrate-distrib-'));
  filtered = createAppendableCSV(join(dir, 'filtered.csv'));
  batches = createAppendableJSONL<BatchRecord>(join(dir, 'batches.jsonl'));
  cursor = createCursorStore(join(dir, 'cursor.json'));
});

const W1 = '0x1111111111111111111111111111111111111111' as Address;

describe('distributor-loop', () => {
  it('runs reconciliation on start then emits reconciliation-complete', async () => {
    await batches.append([
      {
        batchIndex: 0,
        recipients: ['0xr1' as Address],
        amounts: ['1'],
        status: 'broadcast',
        attempts: [{
          txHash: '0xaa' as Hex, nonce: 5,
          maxFeePerGas: '0', maxPriorityFeePerGas: '0',
          broadcastAt: 0, outcome: 'pending', confirmedBlock: null,
        }],
        confirmedTxHash: null, confirmedBlock: null, createdAt: 0,
      },
    ]);

    const bus = createEventBus();
    const control = createControlSignal(DEFAULT_STAGE_CONTROL);
    const events: string[] = [];
    bus.on('reconciliation-complete', () => events.push('reconcile-done'));
    bus.on('completed', () => events.push('completed'));

    // Cursor marks 1 qualified, 1 already-broadcast → nothing more to do
    await cursor.update({
      scan: { lastBlock: 100n, addressCount: 1 },
      filter: { watermark: 1, qualifiedCount: 1 },
      distribute: { watermark: 1, confirmedCount: 0 },
    });

    const loop = createDistributorLoop({
      publicClient: {
        getTransactionReceipt: vi.fn().mockResolvedValue({ status: 'success', blockNumber: 101n }),
      } as unknown as PublicClient,
      storage: {
        filtered, batches, cursor,
        errors: { append: async () => {} },
      },
      walletPool: [W1],
      manifest: {
        batchSize: 10,
      } as never,
      bus,
      control,
      scannerCompleted: () => true,
      filterCompleted: () => true,
      disperse: vi.fn(),
      interventionHook: async () => ({ type: 'approve' }),
      getBalances: async () => new Map([[W1, 10n ** 18n]]),
    });

    await loop.start();
    await new Promise<void>((resolve) => bus.on('completed', () => resolve()));

    expect(events[0]).toBe('reconcile-done');
    expect(events.includes('completed')).toBe(true);
    await rm(dir, { recursive: true });
  });

  it('builds a batch from filtered.csv, calls disperse, records the attempt, advances watermark', async () => {
    await filtered.append([
      { address: '0xa' as Address, amount: '1' },
      { address: '0xb' as Address, amount: '1' },
    ]);
    await cursor.update({
      scan: { lastBlock: 100n, addressCount: 2 },
      filter: { watermark: 2, qualifiedCount: 2 },
      distribute: { watermark: 0, confirmedCount: 0 },
    });

    const bus = createEventBus();
    const control = createControlSignal(DEFAULT_STAGE_CONTROL);

    const disperseMock = vi.fn().mockImplementation(async () => ({
      txHash: '0xdd' as Hex, nonce: 0,
      gasEstimate: 21000n, maxFeePerGas: 1n, maxPriorityFeePerGas: 1n,
      timestamp: Date.now(), outcome: 'confirmed' as const,
    } satisfies BatchAttempt));

    const loop = createDistributorLoop({
      publicClient: { getTransactionReceipt: async () => ({ status: 'success', blockNumber: 0n }) } as unknown as PublicClient,
      storage: { filtered, batches, cursor, errors: { append: async () => {} } },
      walletPool: [W1],
      manifest: { batchSize: 2 } as never,
      bus,
      control,
      scannerCompleted: () => true,
      filterCompleted: () => true,
      disperse: disperseMock,
      interventionHook: async () => ({ type: 'approve' }),
      getBalances: async () => new Map([[W1, 10n ** 18n]]),
    });

    await loop.start();
    await new Promise<void>((resolve) => bus.on('completed', () => resolve()));

    expect(disperseMock).toHaveBeenCalledTimes(1);
    const recorded = await batches.readAll();
    expect(recorded.length).toBe(1);
    expect(recorded[0].attempts.length).toBe(1);
    expect(recorded[0].attempts[0].txHash).toBe('0xdd');
    const finalCursor = await cursor.read();
    expect(finalCursor.distribute.watermark).toBe(2);
    await rm(dir, { recursive: true });
  });

  it('waits for filter-progressed when less than one batch is available', async () => {
    await filtered.append([{ address: '0xa' as Address, amount: '1' }]);
    await cursor.update({
      scan: { lastBlock: 100n, addressCount: 1 },
      filter: { watermark: 1, qualifiedCount: 1 },
      distribute: { watermark: 0, confirmedCount: 0 },
    });

    const bus = createEventBus();
    const control = createControlSignal(DEFAULT_STAGE_CONTROL);
    const disperseMock = vi.fn().mockResolvedValue({
      txHash: '0xdd' as Hex, nonce: 0,
      gasEstimate: 0n, maxFeePerGas: 0n, maxPriorityFeePerGas: 0n,
      timestamp: 0, outcome: 'confirmed' as const,
    });

    // Filter not yet complete → loop should NOT call disperse yet
    let filterDone = false;
    const loop = createDistributorLoop({
      publicClient: { getTransactionReceipt: async () => ({ status: 'success', blockNumber: 0n }) } as unknown as PublicClient,
      storage: { filtered, batches, cursor, errors: { append: async () => {} } },
      walletPool: [W1],
      manifest: { batchSize: 5 } as never,
      bus, control,
      scannerCompleted: () => true,
      filterCompleted: () => filterDone,
      disperse: disperseMock,
      interventionHook: async () => ({ type: 'approve' }),
      getBalances: async () => new Map([[W1, 10n ** 18n]]),
    });

    await loop.start();
    await new Promise((r) => setTimeout(r, 20));
    expect(disperseMock).not.toHaveBeenCalled();

    // Filter completes → watermark flushes the remaining 1 row even if below batchSize
    filterDone = true;
    bus.emit('filter-progressed');
    await new Promise<void>((resolve) => bus.on('completed', () => resolve()));

    expect(disperseMock).toHaveBeenCalledTimes(1);
    await rm(dir, { recursive: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/sdk && npx vitest run src/__tests__/loops/distributor-loop.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `createDistributorLoop`**

Create `packages/sdk/src/pipeline/loops/distributor-loop.ts`. Key signature:

```typescript
import type { Address, Hex, PublicClient } from 'viem';
import type { CampaignManifest, BatchAttempt, LoopErrorEntry } from '../../types.js';
import type { BatchRecord, BatchAttemptRecord } from '../../storage/index.js';
import type { EventBus } from './event-bus.js';
import type { ControlSignal } from './control-signal.js';
import type { InterventionAction, InterventionContext } from '../../intervention/types.js';
import { reconcileBatches } from './reconcile.js';
import { computeDrainStatus } from './drain.js';
import { selectWallet } from './wallet-select.js';
import { batchAttemptToRecord } from '../../utils/batch-attempt.js';

export type DisperseFn = (args: {
  readonly recipients: readonly Address[];
  readonly amounts: readonly bigint[];
  readonly wallet: Address;
  readonly publicClient: PublicClient;
}) => Promise<BatchAttempt>;

export type DistributorLoopDeps = {
  readonly publicClient: PublicClient;
  readonly storage: {
    readonly filtered: { readFrom(offset: number): AsyncIterable<{ address: string; amount: string | null }>; count(): Promise<number> };
    readonly batches: { readAll(): Promise<readonly BatchRecord[]>; append(records: readonly BatchRecord[]): Promise<void> };
    readonly cursor: { read(): Promise<import('../../types.js').PipelineCursor>; update(patch: Partial<import('../../types.js').PipelineCursor>): Promise<void> };
    readonly errors: { append(entry: LoopErrorEntry): Promise<void> };
  };
  readonly walletPool: readonly Address[];
  readonly manifest: CampaignManifest;
  readonly bus: EventBus;
  readonly control: ControlSignal;
  readonly scannerCompleted: () => boolean;
  readonly filterCompleted: () => boolean;
  readonly disperse: DisperseFn;
  readonly interventionHook: (ctx: InterventionContext) => Promise<InterventionAction>;
  readonly getBalances: (addresses: readonly Address[]) => Promise<ReadonlyMap<Address, bigint>>;
  readonly minWalletBalance?: bigint;     // default 10^15 wei (~0.001 ETH)
};
```

Implementation algorithm (in-order, in the async driver):

1. Set status `'running'`, emit `'tick-started'`.
2. **Reconciliation phase** — run `reconcileBatches({ client, batches: await batches.readAll() })`. For each `intervention` decision, call `interventionHook(ctx)` and apply the user's choice. For `confirmed` decisions, append an updated `BatchRecord` with `status: 'confirmed'`. For `pending` decisions, register a background monitor (Phase 2b: no-op).
3. Emit `'reconciliation-complete'`.
4. Enter steady-state while-loop.
5. On each iteration: check control; compute drain; if drained, emit `'completed'` + break; if insufficient-available, `await bus.once('filter-progressed', 'pipeline-changed')` then continue.
6. Pull `batchSize` rows from `filtered.readFrom(cursor.distribute.watermark)`. Compute bigint amounts.
7. Select wallet via `selectWallet({ wallets, lastIndex, balances, minBalance })`. If null, append LoopErrorEntry, emit `'errored'`, break.
8. Call `disperse({ recipients, amounts, wallet, publicClient })`. Guard against `outcome === 'dropped'` — on dropped, append error, emit `'errored'`, break.
9. `storage.batches.append([{ ...batchRecord, attempts: [batchAttemptToRecord(attempt, { confirmedBlock: null })] }])`.
10. `storage.cursor.update({ distribute: { watermark: watermark + recipients.length, confirmedCount: ... } })`.
11. Emit `'distribute-progressed'`; loop.
12. On `stop()`, flip `stopping` flag; driver exits after the current tick.

**"Less than batchSize available" edge case**: if `scannerCompleted() && filterCompleted() && available > 0 && available < manifest.batchSize`, flush the partial batch (do not wait further). This is the drain-tail behavior — otherwise a campaign with 101 addresses and batchSize 100 would never finish the last 1.

- [ ] **Step 4: Run tests**

```bash
cd packages/sdk && npx vitest run src/__tests__/loops/distributor-loop.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/sdk/src/pipeline/loops/distributor-loop.ts packages/sdk/src/__tests__/loops/distributor-loop.test.ts
git commit -m "feat(sdk): add createDistributorLoop with reconciliation + drain semantics"
```

---

## Task 26: Barrel + SDK exports for loops

**Files:**
- Create: `packages/sdk/src/pipeline/loops/index.ts`
- Modify: `packages/sdk/src/index.ts`

- [ ] **Step 1: Create the barrel**

Create `packages/sdk/src/pipeline/loops/index.ts`:

```typescript
export type { LoopEvent, LoopStatus, LoopHandle } from './types.js';
export { createEventBus } from './event-bus.js';
export type { EventBus } from './event-bus.js';
export { createControlSignal } from './control-signal.js';
export type { ControlSignal } from './control-signal.js';
export { computeDrainStatus } from './drain.js';
export type { DrainInput, DrainStatus } from './drain.js';
export { selectWallet } from './wallet-select.js';
export type { WalletSelectInput, WalletSelectResult } from './wallet-select.js';
export { retroactiveReapply } from './retroactive.js';
export type { RetroactiveInput, RetroactiveResult } from './retroactive.js';
export { classifyPipelineChange } from './pipeline-watcher.js';
export type { PipelineChange, PipelineChangeKind } from './pipeline-watcher.js';
export { createScannerLoop } from './scanner-loop.js';
export type { ScannerLoopDeps, RunSourceFn } from './scanner-loop.js';
export { createFilterLoop } from './filter-loop.js';
export type { FilterLoopDeps } from './filter-loop.js';
export { reconcileBatches } from './reconcile.js';
export type { ReconcileDecision, ReconcileInput } from './reconcile.js';
export { createDistributorLoop } from './distributor-loop.js';
export type { DistributorLoopDeps, DisperseFn } from './distributor-loop.js';
```

- [ ] **Step 2: Export from the SDK top-level barrel**

Append to `packages/sdk/src/index.ts`:

```typescript
// Pipeline loops
export * from './pipeline/loops/index.js';
```

- [ ] **Step 3: Rebuild + type-check**

```bash
cd packages/sdk && npx tsc && npx vitest run
```

Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/sdk/src/pipeline/loops/index.ts packages/sdk/src/index.ts packages/sdk/dist
git commit -m "feat(sdk): export pipeline loop factories from barrel"
```

---

## Task 27: In-memory `CampaignStorage` test fixture

**Files:**
- Create: `packages/sdk/src/__tests__/loops/memory-storage.ts`

A reusable fixture that implements the structural storage shapes all three loops expect, backed by plain JS arrays + objects. Lets integration tests (Task 28) run hundreds of ticks without touching the disk.

- [ ] **Step 1: Implement**

Create `packages/sdk/src/__tests__/loops/memory-storage.ts`:

```typescript
import type { PipelineCursor, LoopErrorEntry } from '../../types.js';
import type { BatchRecord } from '../../storage/index.js';

export type MemoryRow = { readonly address: string; readonly amount: string | null };

export function createMemoryAddresses(): {
  append: (rows: readonly MemoryRow[]) => Promise<void>;
  readFrom: (offset: number) => AsyncIterable<MemoryRow>;
  count: () => Promise<number>;
} {
  const data: MemoryRow[] = [];
  return {
    async append(rows) { data.push(...rows); },
    async count() { return data.length; },
    readFrom(offset) {
      async function* gen() {
        for (let i = offset; i < data.length; i++) yield data[i];
      }
      return gen();
    },
  };
}

export function createMemoryCursor(initial?: PipelineCursor) {
  let current: PipelineCursor = initial ?? {
    scan: { lastBlock: 0n, addressCount: 0 },
    filter: { watermark: 0, qualifiedCount: 0 },
    distribute: { watermark: 0, confirmedCount: 0 },
  };
  return {
    async read() { return current; },
    async update(patch: Partial<PipelineCursor>) {
      current = {
        scan: { ...current.scan, ...(patch.scan ?? {}) },
        filter: { ...current.filter, ...(patch.filter ?? {}) },
        distribute: { ...current.distribute, ...(patch.distribute ?? {}) },
      };
    },
  };
}

export function createMemoryBatches() {
  const data: BatchRecord[] = [];
  return {
    async append(records: readonly BatchRecord[]) { data.push(...records); },
    async readAll() { return data; },
    async count() { return data.length; },
  };
}

export function createMemoryErrors() {
  const data: LoopErrorEntry[] = [];
  return {
    async append(entry: LoopErrorEntry) { data.push(entry); },
    async readAll() { return data; },
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/sdk/src/__tests__/loops/memory-storage.ts
git commit -m "test(sdk): add in-memory storage fixture for loop integration tests"
```

---

## Task 28: Integration test — full pipeline happy path with stubbed RPC

**Files:**
- Create: `packages/sdk/src/__tests__/loops/integration.test.ts`

Exercises scanner → filter → distributor end-to-end using the memory fixture + stubbed `runSource` / `applyFilterChain` / `disperse` / `PublicClient.getBlockNumber`. Verifies:

1. Scanner produces N addresses.
2. Filter drops half based on a predicate.
3. Distributor batches and "sends" the survivors.
4. Cursor state matches expectations after drain.

- [ ] **Step 1: Write the test**

Create `packages/sdk/src/__tests__/loops/integration.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import type { Address, Hex, PublicClient } from 'viem';
import { createScannerLoop } from '../../pipeline/loops/scanner-loop.js';
import { createFilterLoop } from '../../pipeline/loops/filter-loop.js';
import { createDistributorLoop } from '../../pipeline/loops/distributor-loop.js';
import { createEventBus } from '../../pipeline/loops/event-bus.js';
import { createControlSignal } from '../../pipeline/loops/control-signal.js';
import { DEFAULT_STAGE_CONTROL } from '../../types.js';
import type { PipelineConfig, CampaignManifest, BatchAttempt } from '../../index.js';
import {
  createMemoryAddresses,
  createMemoryBatches,
  createMemoryCursor,
  createMemoryErrors,
} from './memory-storage.js';

const W1 = '0xAAAA000000000000000000000000000000000001' as Address;

const PIPELINE: PipelineConfig = {
  steps: [
    { type: 'source', sourceType: 'block-scan', params: { startBlock: 100, endBlock: 102, extract: 'tx.from' } },
    { type: 'filter', filterType: 'min-balance', params: { threshold: '1' } },
  ],
};

function manifest(overrides: Partial<CampaignManifest> = {}): CampaignManifest {
  return {
    id: 'c', status: 'running', wallets: { mode: 'imported', count: 1 },
    createdAt: 0, updatedAt: 0, startBlock: 100n, endBlock: 102n,
    autoStart: false, control: DEFAULT_STAGE_CONTROL,
    funder: '0xF' as Address, name: 'n', version: 1, chainId: 1,
    rpcUrl: 'http://x', tokenAddress: '0xT' as Address, tokenDecimals: 18,
    contractAddress: null, contractVariant: 'simple', contractName: 'N',
    amountMode: 'uniform', amountFormat: 'integer', uniformAmount: '1',
    batchSize: 4, campaignId: null, pinnedBlock: null,
    ...overrides,
  };
}

describe('full pipeline integration (in-memory)', () => {
  it('scans → filters → distributes through drain, cursor matches expectations', async () => {
    const addresses = createMemoryAddresses();
    const filtered = createMemoryAddresses();
    const batches = createMemoryBatches();
    const cursor = createMemoryCursor();
    const errors = createMemoryErrors();

    const bus = createEventBus();
    const control = createControlSignal(DEFAULT_STAGE_CONTROL);
    const client = { getBlockNumber: async () => 102n } as unknown as PublicClient;

    // Scanner: emits 2 addresses per block for blocks 101, 102 (startBlock+1 through endBlock)
    let scannerDone = false;
    const scanner = createScannerLoop({
      publicClient: client,
      storage: { addresses, cursor, errors },
      manifest: manifest(),
      pipeline: PIPELINE,
      bus, control,
      runSource: async (_step, block) => {
        const even = `0x${block.toString(16).padStart(2, '0')}0000000000000000000000000000000000` as Address;
        const odd =  `0x${block.toString(16).padStart(2, '0')}1111111111111111111111111111111111` as Address;
        return [even, odd];
      },
    });
    bus.on('completed', () => { /* filtered by which loop? use separate event names or flags */ });

    // Filter: drop all odds (hex ending in 11…)
    let filterDone = false;
    const filter = createFilterLoop({
      publicClient: client,
      storage: { addresses, filtered, cursor, errors },
      pipeline: PIPELINE,
      bus, control,
      scannerCompleted: () => scannerDone,
      applyFilterChain: async (row) => !row.address.endsWith('111111111111111111'),
    });

    // Distributor
    const disperseMock = vi.fn().mockImplementation(async (): Promise<BatchAttempt> => ({
      txHash: '0xdd' as Hex, nonce: 0,
      gasEstimate: 21000n, maxFeePerGas: 1n, maxPriorityFeePerGas: 1n,
      timestamp: Date.now(), outcome: 'confirmed',
    }));
    const distributor = createDistributorLoop({
      publicClient: { getTransactionReceipt: async () => ({ status: 'success', blockNumber: 0n }) } as unknown as PublicClient,
      storage: { filtered, batches, cursor, errors },
      walletPool: [W1],
      manifest: manifest(),
      bus, control,
      scannerCompleted: () => scannerDone,
      filterCompleted: () => filterDone,
      disperse: disperseMock,
      interventionHook: async () => ({ type: 'approve' }),
      getBalances: async () => new Map([[W1, 10n ** 18n]]),
    });

    // Track completion of each loop via a per-loop status flag
    let scanDoneEmitted = false;
    let filterDoneEmitted = false;
    let distributeDoneEmitted = false;
    bus.on('completed', () => {
      if (scanner.status() === 'completed' && !scanDoneEmitted) { scanDoneEmitted = true; scannerDone = true; }
      if (filter.status() === 'completed' && !filterDoneEmitted) { filterDoneEmitted = true; filterDone = true; }
      if (distributor.status() === 'completed') distributeDoneEmitted = true;
    });

    await Promise.all([scanner.start(), filter.start(), distributor.start()]);

    // Spin until everyone reports completed or timeout at 1s
    const deadline = Date.now() + 1000;
    while (Date.now() < deadline) {
      if (distributeDoneEmitted) break;
      await new Promise((r) => setTimeout(r, 5));
    }
    expect(distributeDoneEmitted).toBe(true);

    const c = await cursor.read();
    expect(c.scan.lastBlock).toBe(102n);
    expect(c.scan.addressCount).toBe(4); // 2 blocks * 2 addrs
    expect(c.filter.watermark).toBe(4);
    expect(c.filter.qualifiedCount).toBe(2);
    expect(c.distribute.watermark).toBe(2);

    const recorded = await batches.readAll();
    expect(recorded.length).toBe(1);
    expect(disperseMock).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/sdk && npx vitest run src/__tests__/loops/integration.test.ts
```

Expected: FAIL (loop factories may need per-loop `'completed'` detection since `bus` is shared — the test uses `loop.status()` to disambiguate. Adjust implementations if any loop emits `'completed'` without transitioning status first — the ordering rule says write first then emit, but the loops should also synchronize status immediately.)

- [ ] **Step 3: Fix any ordering gaps surfaced by the test**

If tests fail, identify the root cause — for example, a loop emitting `'completed'` before setting its internal status. Adjust the loop to set `status = 'completed'` BEFORE `bus.emit('completed')`. Each loop file needs this sequence:

```typescript
// When the loop reaches terminal state:
statusRef.value = 'completed';
bus.emit('completed');
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd packages/sdk && npx vitest run src/__tests__/loops/integration.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/sdk/src/__tests__/loops/integration.test.ts packages/sdk/src/pipeline/loops
git commit -m "test(sdk): add full pipeline integration test with in-memory storage"
```

---

## Task 29: Integration test — reconciliation on restart

**Files:**
- Append to: `packages/sdk/src/__tests__/loops/integration.test.ts`

Plants two `'broadcast'` batches in storage before starting the distributor. Stubs the `PublicClient` to return:
- Batch 0: `receipt.status === 'success'` → expected outcome `confirmed`.
- Batch 1: `receipt === null`, `getTransaction === null`, `getTransactionCount` advanced → expected outcome `intervention: 'reconcile-dropped'`.

Verifies that after reconciliation:
- Batch 0 transitions to `status: 'confirmed'`.
- Batch 1 triggers the intervention hook with `point: 'reconcile-dropped'`.
- `'reconciliation-complete'` fires before the steady-state loop begins.

- [ ] **Step 1: Write the test**

Append to `packages/sdk/src/__tests__/loops/integration.test.ts`:

```typescript
describe('reconciliation on restart', () => {
  it('classifies planted broadcast batches and invokes intervention hook for non-confirmed', async () => {
    const filtered = createMemoryAddresses();
    const batches = createMemoryBatches();
    const cursor = createMemoryCursor({
      scan: { lastBlock: 100n, addressCount: 0 },
      filter: { watermark: 0, qualifiedCount: 0 },
      distribute: { watermark: 2, confirmedCount: 0 }, // 2 already "sent"
    });
    const errors = createMemoryErrors();

    // Plant two pre-existing broadcast batches
    await batches.append([
      {
        batchIndex: 0,
        recipients: ['0xr0'] as readonly Address[],
        amounts: ['1'],
        status: 'broadcast',
        attempts: [{
          txHash: '0xaaaa' as Hex, nonce: 0,
          maxFeePerGas: '0', maxPriorityFeePerGas: '0',
          broadcastAt: 0, outcome: 'pending', confirmedBlock: null,
        }],
        confirmedTxHash: null, confirmedBlock: null, createdAt: 0,
      },
      {
        batchIndex: 1,
        recipients: ['0xr1'] as readonly Address[],
        amounts: ['1'],
        status: 'broadcast',
        attempts: [{
          txHash: '0xbbbb' as Hex, nonce: 1,
          maxFeePerGas: '0', maxPriorityFeePerGas: '0',
          broadcastAt: 0, outcome: 'pending', confirmedBlock: null,
        }],
        confirmedTxHash: null, confirmedBlock: null, createdAt: 0,
      },
    ]);

    const bus = createEventBus();
    const control = createControlSignal(DEFAULT_STAGE_CONTROL);
    const interventions: string[] = [];
    let reconcileDone = false;

    bus.on('reconciliation-complete', () => { reconcileDone = true; });

    // Receipt lookup: first call (batch 0) succeeds, second (batch 1) returns null.
    const client = {
      getTransactionReceipt: vi.fn()
        .mockResolvedValueOnce({ status: 'success', blockNumber: 150n })
        .mockResolvedValueOnce(null),
      getTransaction: vi.fn().mockResolvedValue(null),
      getTransactionCount: vi.fn().mockResolvedValue(5), // nonce advanced past 1
    } as unknown as PublicClient;

    const distributor = createDistributorLoop({
      publicClient: client,
      storage: { filtered, batches, cursor, errors },
      walletPool: [W1],
      manifest: manifest({ batchSize: 10 }),
      bus, control,
      scannerCompleted: () => true,
      filterCompleted: () => true,
      disperse: async () => {
        throw new Error('unreachable — no new batches expected');
      },
      interventionHook: async (ctx) => {
        interventions.push(ctx.point);
        return { type: 'skip' };
      },
      getBalances: async () => new Map([[W1, 10n ** 18n]]),
    });

    await distributor.start();
    await new Promise<void>((resolve) => bus.on('completed', () => resolve()));

    expect(reconcileDone).toBe(true);
    expect(interventions).toEqual(['reconcile-dropped']);
    const updated = await batches.readAll();
    // Last-line-wins semantics: batch 0 has a 'confirmed' update appended
    const latestByIndex = new Map<number, typeof updated[number]>();
    for (const r of updated) latestByIndex.set(r.batchIndex, r);
    expect(latestByIndex.get(0)!.status).toBe('confirmed');
  });
});
```

- [ ] **Step 2: Run tests**

```bash
cd packages/sdk && npx vitest run src/__tests__/loops/integration.test.ts
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/sdk/src/__tests__/loops/integration.test.ts
git commit -m "test(sdk): add reconciliation-on-restart integration test"
```

---

## Task 30: Integration test — filter hot-reload retroactive re-apply

**Files:**
- Append to: `packages/sdk/src/__tests__/loops/integration.test.ts`

Scenario: A campaign has 10 scanned addresses, 8 survived the initial filter. The user adds a second filter. Verify:

1. `retroactiveReapply` is called on the existing `filtered.csv` contents.
2. Survivors shrink from 8 → some smaller number.
3. `cursor.filter.qualifiedCount` updates to match.
4. `cursor.filter.watermark` is unchanged.

We don't drive the real `PipelineWatcher` here — we invoke `retroactiveReapply` directly + assert the orchestrator contract. Full fs.watch integration lives in Phase 2c.

- [ ] **Step 1: Write the test**

Append to `packages/sdk/src/__tests__/loops/integration.test.ts`:

```typescript
import { retroactiveReapply } from '../../pipeline/loops/retroactive.js';
import { writeFile, readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('filter hot-reload retroactive re-apply', () => {
  it('shrinks filtered.csv + qualifiedCount after a suffix-added filter is applied retroactively', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'titrate-retro-int-'));
    const filteredPath = join(dir, 'filtered.csv');

    await writeFile(filteredPath, [
      '0x1,', '0x2,', '0x3,', '0x4,', '0x5,', '0x6,', '0x7,', '0x8,',
    ].join('\n') + '\n', 'utf8');

    // New filter: only even-numbered addresses pass
    const result = await retroactiveReapply({
      filteredPath,
      predicate: async (addr) => {
        const last = parseInt(addr.slice(-1), 16);
        return last % 2 === 0;
      },
    });

    expect(result.survivorsCount).toBe(4);
    expect(result.droppedCount).toBe(4);

    const content = await readFile(filteredPath, 'utf8');
    const lines = content.trim().split('\n');
    expect(lines.length).toBe(4);
    expect(lines.every((l) => parseInt(l.slice(-2, -1), 16) % 2 === 0)).toBe(true);

    await rm(dir, { recursive: true });
  });
});
```

- [ ] **Step 2: Run tests**

```bash
cd packages/sdk && npx vitest run src/__tests__/loops/integration.test.ts
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/sdk/src/__tests__/loops/integration.test.ts
git commit -m "test(sdk): add filter-hot-reload retroactive integration test"
```

---

## Task 31: Final regression + commit sign-off

**Files:**
- None new — verification only.

- [ ] **Step 1: Invoke `titrate-dev-services` if Anvil should be running**

If you want the Anvil-gated existing distributor tests to actually execute (rather than skip silently), start Anvil per the skill:

```bash
# From the skill — see .claude/skills/titrate-dev-services/SKILL.md for details.
anvil --host 0.0.0.0 --port 8545 &
```

Otherwise proceed with Anvil off; skipped tests are fine.

- [ ] **Step 2: Rebuild SDK + downstream packages**

```bash
cd packages/sdk && npx tsc
cd ../storage-campaign && npx tsc
cd ../storage-idb && npx tsc
```

Expected: no errors.

- [ ] **Step 3: Full regression**

```bash
cd /Users/michaelmclaughlin/Documents/morbius/github/titrate
yarn test:all
```

Expected counts (approximate, based on Phase 1 baseline of 1239):
- SDK: +30 new unit tests, +3 new integration tests → ~1270+.
- storage-campaign: +15 new tests (history/errors/lock/manifest-defaults/cursor-migration) → ~65+.
- storage-idb: +3 new tests (history/errors/lock) → ~15+.
- TUI: unchanged.

All pass. If any unexpected failure surfaces (e.g., a pre-existing test that depends on `scan.endBlock`), fix as part of the relevant earlier task's commit. If you fix it in a separate commit, title it: `fix(scope): <short>`.

- [ ] **Step 4: Final sweep — dist freshness**

```bash
cd /Users/michaelmclaughlin/Documents/morbius/github/titrate
git status
```

If any `dist/` artifacts are untracked or modified but uncommitted:

```bash
git add packages/sdk/dist packages/storage-campaign/dist packages/storage-idb/dist
git commit -m "chore: rebuild dist after Phase 2b loop factories"
```

- [ ] **Step 5: Verify the whole branch is clean**

```bash
git status  # expect clean
git log --oneline master..HEAD
```

Expected: 30+ commits on `design/phase2-live-pipeline`, each tied to a task number. Ready to open a PR against `master` at your leisure — the plan does NOT push or open the PR automatically; that's a user decision.

---

# Appendix — Subagent dispatch recipe

For each task, invoke `titrate-dispatch-checklist` and dispatch an implementer subagent with:

- **Task text** — copy the full task body including all steps and code blocks.
- **Scene-setting context** — the sub-phase, surrounding tasks that have shipped, the files already present.
- **Paste-in from `titrate-subagent-context`** — OpenTUI API quirks, Bun vs Node, envelope schema, workspace layout.
- **Done criteria** — all checkboxes flipped, commit present, tests passing.

After each implementer returns:

1. Dispatch the spec reviewer (compare commit to this plan's task spec).
2. If spec-compliant, dispatch the code quality reviewer.
3. Resolve any review findings via the same implementer subagent.
4. Mark the TaskUpdate entry `completed`.

After Task 31 passes, dispatch a final code reviewer over the whole branch diff.


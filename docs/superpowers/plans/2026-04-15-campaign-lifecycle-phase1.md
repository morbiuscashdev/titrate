# Campaign Lifecycle Phase 1 — Campaign Directory + Static Commands

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the TUI's one-shot wizard with persistent, directory-scoped campaigns that users can create, configure step-by-step, close, and reopen later. No live pipeline yet — steps run sequentially on demand.

**Architecture:** A new `@titrate/storage-campaign` package provides appendable file primitives (`AppendableCSV`, `AppendableJSONL`) and JSON config stores. The TUI gains `new`, `open`, and `list` commands that read/write campaign directories. Existing standalone commands gain a `--campaign` flag. The SDK extends `CampaignConfig` with `coldAddress`, `walletCount`, `walletOffset` and adds `CampaignManifest` and `PipelineCursor` types.

**Tech Stack:** TypeScript, Node.js fs/promises, Vitest, Commander.js, @clack/prompts, Viem

**Testing Strategy:** Unit tests for storage primitives and CLI logic. Integration test at the end uses Anvil fork to run a full campaign cycle. Real testnet tests (PulseChain v4) gated behind `PULSECHAIN_TESTNET_RPC` env var for smoke testing.

---

## File Structure

### New package: `packages/storage-campaign/`

| File | Responsibility |
|------|----------------|
| `package.json` | Package manifest, depends on `@titrate/sdk` |
| `tsconfig.json` | Extends `../../tsconfig.base.json` |
| `src/index.ts` | Factory: `createCampaignStorage(dir)`, `createSharedStorage(dir)` |
| `src/appendable-csv.ts` | `AppendableCSV` — append rows, stream from offset, count lines |
| `src/appendable-jsonl.ts` | `AppendableJSONL<T>` — append records, stream from offset, read all |
| `src/manifest-store.ts` | Read/write `campaign.json` (JSON read-modify-write) |
| `src/cursor-store.ts` | Read/write `cursor.json` (pipeline watermarks) |
| `src/pipeline-store.ts` | Read/write `pipeline.json` (source + filter config) |
| `src/shared-storage.ts` | `createSharedStorage` — chains.json + settings.json |
| `src/types.ts` | Package-internal types (serialization helpers) |

### New test files: `packages/storage-campaign/__tests__/`

| File | Covers |
|------|--------|
| `appendable-csv.test.ts` | Append, read-from-offset, count, empty file, large datasets |
| `appendable-jsonl.test.ts` | Append, read-from-offset, readAll, count, type safety |
| `manifest-store.test.ts` | Create, read, update, missing file handling |
| `cursor-store.test.ts` | Create, read, update, BigInt serialization |
| `pipeline-store.test.ts` | Create, read, update |
| `campaign-storage.test.ts` | Factory integration, directory creation |
| `shared-storage.test.ts` | Chain configs, settings, cross-campaign isolation |

### Modified files in `packages/sdk/`

| File | Change |
|------|--------|
| `src/types.ts` | Add `coldAddress`, `walletCount`, `walletOffset` to `CampaignConfig`. Add `CampaignManifest`, `PipelineCursor`, `CampaignStatus` types. |
| `src/storage/index.ts` | Add `WalletRecord`, `BatchRecord`, `SweepRecord` types for JSONL serialization |
| `src/index.ts` | Export new types |

### New/modified files in `packages/tui/`

| File | Change |
|------|--------|
| `src/index.ts` | Register `new`, `open`, `list` commands |
| `src/commands/new-campaign.ts` | Create: `titrate new <name>` command |
| `src/commands/open-campaign.ts` | Create: `titrate open <name-or-path>` command |
| `src/commands/list-campaigns.ts` | Create: `titrate list` command |
| `src/interactive/dashboard.ts` | Create: step-based menu with status indicators |
| `src/interactive/steps/campaign.ts` | Modify: accept optional `CampaignStorage` to persist config |
| `src/interactive/steps/addresses.ts` | Modify: write to `addresses.csv` via storage |
| `src/interactive/steps/filters.ts` | Modify: write to `filtered.csv` + `pipeline.json` via storage |
| `src/interactive/steps/amounts.ts` | Modify: write to `amounts.csv` or manifest via storage |
| `src/interactive/steps/wallet.ts` | Modify: write to `wallets.jsonl` + update manifest via storage |
| `src/interactive/steps/distribute.ts` | Modify: write to `batches.jsonl` via storage |
| `src/commands/sweep.ts` | Modify: add `--campaign` flag, load from storage |
| `src/commands/distribute.ts` | Modify: add `--campaign` flag, load from storage |
| `src/commands/collect.ts` | Modify: add `--campaign` flag, write to storage |
| `src/utils/campaign-root.ts` | Create: resolve campaign root directory |
| `package.json` | Add `@titrate/storage-campaign` dependency |

### New test files in `packages/tui/__tests__/`

| File | Covers |
|------|--------|
| `campaign-root.test.ts` | Resolution logic (flag > env > auto-detect) |
| `dashboard.test.ts` | State derivation from file existence |
| `new-campaign.test.ts` | Command parsing, directory creation |
| `open-campaign.test.ts` | Command parsing, campaign loading |
| `list-campaigns.test.ts` | Directory scanning |

---

### Task 1: Extend SDK types

**Files:**
- Modify: `packages/sdk/src/types.ts`
- Modify: `packages/sdk/src/storage/index.ts`
- Modify: `packages/sdk/src/index.ts`
- Test: `packages/sdk/src/__tests__/types.test.ts`

- [ ] **Step 1: Write type compatibility test**

Create a test that verifies the new types exist and are structurally correct:

```typescript
// packages/sdk/src/__tests__/types.test.ts
import { describe, it, expect } from 'vitest';
import type { CampaignManifest, PipelineCursor, CampaignStatus, CampaignConfig } from '../types.js';
import type { WalletRecord, BatchRecord, SweepRecord } from '../storage/index.js';
import type { Address, Hex } from 'viem';

describe('CampaignManifest', () => {
  it('extends CampaignConfig with lifecycle fields', () => {
    const manifest: CampaignManifest = {
      // CampaignConfig fields
      funder: '0x0000000000000000000000000000000000000001' as Address,
      name: 'test',
      version: 1,
      chainId: 1,
      rpcUrl: 'https://rpc.example.com',
      tokenAddress: '0x0000000000000000000000000000000000000002' as Address,
      tokenDecimals: 18,
      contractAddress: null,
      contractVariant: 'simple',
      contractName: 'Test',
      amountMode: 'uniform',
      amountFormat: 'integer',
      uniformAmount: '1000000',
      batchSize: 200,
      campaignId: null,
      pinnedBlock: null,
      // New CampaignConfig fields
      coldAddress: '0x0000000000000000000000000000000000000003' as Address,
      walletCount: 3,
      walletOffset: 0,
      // CampaignManifest-only fields
      id: 'test-campaign',
      status: 'configuring',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    expect(manifest.status).toBe('configuring');
    expect(manifest.coldAddress).toBeTruthy();
    expect(manifest.walletCount).toBe(3);
  });
});

describe('PipelineCursor', () => {
  it('tracks watermarks for all three pipeline stages', () => {
    const cursor: PipelineCursor = {
      scan: { lastBlock: 18000000n, endBlock: null, addressCount: 0 },
      filter: { watermark: 0, qualifiedCount: 0 },
      distribute: { watermark: 0, confirmedCount: 0 },
    };

    expect(cursor.scan.endBlock).toBeNull();
    expect(cursor.filter.watermark).toBe(0);
  });
});

describe('JSONL record types', () => {
  it('WalletRecord has required fields', () => {
    const record: WalletRecord = {
      index: 0,
      address: '0x0000000000000000000000000000000000000001' as Address,
      coldAddress: '0x0000000000000000000000000000000000000002' as Address,
      createdAt: Date.now(),
    };
    expect(record.index).toBe(0);
  });

  it('BatchRecord has required fields', () => {
    const record: BatchRecord = {
      batchIndex: 0,
      recipients: ['0x0000000000000000000000000000000000000001' as Address],
      amounts: ['1000000'],
      status: 'confirmed',
      confirmedTxHash: '0xabc' as Hex,
      confirmedBlock: '12345',
      createdAt: Date.now(),
    };
    expect(record.status).toBe('confirmed');
  });

  it('SweepRecord has required fields', () => {
    const record: SweepRecord = {
      walletIndex: 0,
      walletAddress: '0x0000000000000000000000000000000000000001' as Address,
      balance: '1000000',
      txHash: '0xabc' as Hex,
      error: null,
      createdAt: Date.now(),
    };
    expect(record.error).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/sdk && npx vitest run src/__tests__/types.test.ts`
Expected: FAIL — types don't exist yet

- [ ] **Step 3: Add new fields to CampaignConfig and new types to types.ts**

```typescript
// Add to CampaignConfig in packages/sdk/src/types.ts:
//   readonly coldAddress: Address;
//   readonly walletCount: number;
//   readonly walletOffset: number;

// Add after CampaignConfig:
export type CampaignStatus = 'configuring' | 'ready' | 'running' | 'paused' | 'completed' | 'swept';

export type CampaignManifest = CampaignConfig & {
  readonly id: string;
  readonly status: CampaignStatus;
  readonly createdAt: number;
  readonly updatedAt: number;
};

export type PipelineCursor = {
  readonly scan: {
    readonly lastBlock: bigint;
    readonly endBlock: bigint | null;
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

- [ ] **Step 4: Add JSONL record types to storage/index.ts**

```typescript
// Add to packages/sdk/src/storage/index.ts after StoredChainConfig:

export type WalletRecord = {
  readonly index: number;
  readonly address: Address;
  readonly coldAddress: Address;
  readonly createdAt: number;
};

export type BatchRecord = {
  readonly batchIndex: number;
  readonly recipients: readonly Address[];
  readonly amounts: readonly string[];
  readonly status: BatchStatus;
  readonly confirmedTxHash: Hex | null;
  readonly confirmedBlock: string | null;
  readonly createdAt: number;
};

export type SweepRecord = {
  readonly walletIndex: number;
  readonly walletAddress: Address;
  readonly balance: string;
  readonly txHash: Hex | null;
  readonly error: string | null;
  readonly createdAt: number;
};
```

Import `BatchStatus` at the top of `storage/index.ts` if not already imported.

- [ ] **Step 5: Export new types from SDK barrel**

Add to `packages/sdk/src/index.ts` in the types export section:

```typescript
export type { CampaignManifest, PipelineCursor, CampaignStatus } from './types.js';
export type { WalletRecord, BatchRecord, SweepRecord } from './storage/index.js';
```

- [ ] **Step 6: Fix existing tests and usages that reference CampaignConfig**

`CampaignConfig` now requires `coldAddress`, `walletCount`, `walletOffset`. Search for all test files creating `CampaignConfig` or `StoredCampaign` objects and add the new fields with defaults:

```typescript
coldAddress: '0x0000000000000000000000000000000000000000' as Address,
walletCount: 1,
walletOffset: 0,
```

Also update `packages/tui/src/interactive/steps/distribute.ts` line 179 where `StoredCampaign` is constructed — add the three new fields.

- [ ] **Step 7: Run all SDK tests**

Run: `cd packages/sdk && npx vitest run`
Expected: All tests pass including the new types test

- [ ] **Step 8: Commit**

```bash
git add packages/sdk/src/types.ts packages/sdk/src/storage/index.ts packages/sdk/src/index.ts packages/sdk/src/__tests__/types.test.ts
git commit -m "feat(sdk): add CampaignManifest, PipelineCursor, JSONL record types"
```

---

### Task 2: Scaffold `@titrate/storage-campaign` package

**Files:**
- Create: `packages/storage-campaign/package.json`
- Create: `packages/storage-campaign/tsconfig.json`
- Create: `packages/storage-campaign/src/index.ts`
- Create: `packages/storage-campaign/src/types.ts`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@titrate/storage-campaign",
  "version": "0.0.1",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "vitest run"
  },
  "dependencies": {
    "@titrate/sdk": "0.0.1"
  },
  "devDependencies": {
    "typescript": "^5.7.3",
    "vitest": "^4.1.1"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"],
  "exclude": ["__tests__", "dist"]
}
```

- [ ] **Step 3: Create internal types**

```typescript
// packages/storage-campaign/src/types.ts
import type { Address } from 'viem';

/** Serialized form of PipelineCursor for JSON storage (BigInt → string). */
export type SerializedPipelineCursor = {
  readonly scan: {
    readonly lastBlock: string;
    readonly endBlock: string | null;
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

/** Serialized form of CampaignManifest for JSON storage (BigInt → string). */
export type SerializedCampaignManifest = {
  readonly id: string;
  readonly status: string;
  readonly funder: string;
  readonly name: string;
  readonly version: number;
  readonly chainId: number;
  readonly rpcUrl: string;
  readonly tokenAddress: string;
  readonly tokenDecimals: number;
  readonly contractAddress: string | null;
  readonly contractVariant: 'simple' | 'full';
  readonly contractName: string;
  readonly amountMode: 'uniform' | 'variable';
  readonly amountFormat: 'integer' | 'decimal';
  readonly uniformAmount: string | null;
  readonly batchSize: number;
  readonly campaignId: string | null;
  readonly pinnedBlock: string | null;
  readonly coldAddress: string;
  readonly walletCount: number;
  readonly walletOffset: number;
  readonly createdAt: number;
  readonly updatedAt: number;
};
```

- [ ] **Step 4: Create stub index.ts**

```typescript
// packages/storage-campaign/src/index.ts
export { createAppendableCSV } from './appendable-csv.js';
export { createAppendableJSONL } from './appendable-jsonl.js';
export { createManifestStore } from './manifest-store.js';
export { createCursorStore } from './cursor-store.js';
export { createPipelineStore } from './pipeline-store.js';
export { createCampaignStorage } from './campaign-storage.js';
export { createSharedStorage } from './shared-storage.js';
```

This will fail to compile until we create the modules — that's fine, we'll fill them in Tasks 3-7.

- [ ] **Step 5: Install dependencies**

Run: `cd /Users/michaelmclaughlin/Documents/morbius/github/airdrop && npm install`

- [ ] **Step 6: Commit**

```bash
git add packages/storage-campaign/
git commit -m "feat(storage-campaign): scaffold package"
```

---

### Task 3: Implement `AppendableCSV`

**Files:**
- Create: `packages/storage-campaign/src/appendable-csv.ts`
- Create: `packages/storage-campaign/__tests__/appendable-csv.test.ts`

- [ ] **Step 1: Write tests**

```typescript
// packages/storage-campaign/__tests__/appendable-csv.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createAppendableCSV } from '../src/appendable-csv.js';
import type { Address } from 'viem';

describe('AppendableCSV', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'csv-test-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true });
  });

  it('creates file on first append', async () => {
    const csv = createAppendableCSV(join(dir, 'addresses.csv'));
    await csv.append([
      { address: '0x0000000000000000000000000000000000000001' as Address, amount: null },
    ]);

    const content = await readFile(join(dir, 'addresses.csv'), 'utf8');
    expect(content).toBe('0x0000000000000000000000000000000000000001\n');
  });

  it('appends with amounts', async () => {
    const csv = createAppendableCSV(join(dir, 'addresses.csv'));
    await csv.append([
      { address: '0x0000000000000000000000000000000000000001' as Address, amount: '1000' },
      { address: '0x0000000000000000000000000000000000000002' as Address, amount: '2000' },
    ]);

    const content = await readFile(join(dir, 'addresses.csv'), 'utf8');
    expect(content).toBe(
      '0x0000000000000000000000000000000000000001,1000\n' +
      '0x0000000000000000000000000000000000000002,2000\n'
    );
  });

  it('appends to existing file without overwriting', async () => {
    const csv = createAppendableCSV(join(dir, 'addresses.csv'));
    await csv.append([
      { address: '0x0000000000000000000000000000000000000001' as Address, amount: null },
    ]);
    await csv.append([
      { address: '0x0000000000000000000000000000000000000002' as Address, amount: null },
    ]);

    expect(await csv.count()).toBe(2);
  });

  it('reads from offset', async () => {
    const csv = createAppendableCSV(join(dir, 'addresses.csv'));
    await csv.append([
      { address: '0x0000000000000000000000000000000000000001' as Address, amount: null },
      { address: '0x0000000000000000000000000000000000000002' as Address, amount: null },
      { address: '0x0000000000000000000000000000000000000003' as Address, amount: null },
    ]);

    const rows = [];
    for await (const row of csv.readFrom(1)) {
      rows.push(row);
    }

    expect(rows).toHaveLength(2);
    expect(rows[0].address).toBe('0x0000000000000000000000000000000000000002');
  });

  it('returns 0 count for missing file', async () => {
    const csv = createAppendableCSV(join(dir, 'missing.csv'));
    expect(await csv.count()).toBe(0);
  });

  it('readFrom on empty file yields nothing', async () => {
    const csv = createAppendableCSV(join(dir, 'empty.csv'));
    const rows = [];
    for await (const row of csv.readFrom(0)) {
      rows.push(row);
    }
    expect(rows).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/storage-campaign && npx vitest run __tests__/appendable-csv.test.ts`
Expected: FAIL — module doesn't exist

- [ ] **Step 3: Implement AppendableCSV**

```typescript
// packages/storage-campaign/src/appendable-csv.ts
import { appendFile, readFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import type { CSVRow } from '@titrate/sdk';
import type { Address } from 'viem';

export type AppendableCSV = {
  readonly append: (rows: readonly CSVRow[]) => Promise<void>;
  readonly readFrom: (lineOffset: number) => AsyncIterable<CSVRow>;
  readonly count: () => Promise<number>;
};

function serializeRow(row: CSVRow): string {
  return row.amount !== null ? `${row.address},${row.amount}` : row.address;
}

function deserializeLine(line: string): CSVRow {
  const trimmed = line.trim();
  if (trimmed.length === 0) return { address: '' as Address, amount: null };

  const commaIndex = trimmed.indexOf(',');
  if (commaIndex === -1) {
    return { address: trimmed.toLowerCase() as Address, amount: null };
  }

  return {
    address: trimmed.slice(0, commaIndex).toLowerCase() as Address,
    amount: trimmed.slice(commaIndex + 1),
  };
}

export function createAppendableCSV(filePath: string): AppendableCSV {
  let cachedCount: number | null = null;

  return {
    async append(rows) {
      if (rows.length === 0) return;

      const data = rows.map(serializeRow).join('\n') + '\n';
      await appendFile(filePath, data, 'utf8');

      if (cachedCount !== null) {
        cachedCount += rows.length;
      }
    },

    async *readFrom(lineOffset) {
      try {
        await stat(filePath);
      } catch {
        return;
      }

      const stream = createReadStream(filePath, { encoding: 'utf8' });
      const rl = createInterface({ input: stream, crlfDelay: Infinity });

      let lineIndex = 0;
      for await (const line of rl) {
        if (lineIndex >= lineOffset && line.trim().length > 0) {
          yield deserializeLine(line);
        }
        lineIndex++;
      }
    },

    async count() {
      if (cachedCount !== null) return cachedCount;

      try {
        const content = await readFile(filePath, 'utf8');
        const lines = content.split('\n').filter((l) => l.trim().length > 0);
        cachedCount = lines.length;
        return cachedCount;
      } catch {
        cachedCount = 0;
        return 0;
      }
    },
  };
}
```

- [ ] **Step 4: Run tests**

Run: `cd packages/storage-campaign && npx vitest run __tests__/appendable-csv.test.ts`
Expected: All 6 tests pass

- [ ] **Step 5: Commit**

```bash
git add packages/storage-campaign/src/appendable-csv.ts packages/storage-campaign/__tests__/appendable-csv.test.ts
git commit -m "feat(storage-campaign): implement AppendableCSV"
```

---

### Task 4: Implement `AppendableJSONL`

**Files:**
- Create: `packages/storage-campaign/src/appendable-jsonl.ts`
- Create: `packages/storage-campaign/__tests__/appendable-jsonl.test.ts`

- [ ] **Step 1: Write tests**

```typescript
// packages/storage-campaign/__tests__/appendable-jsonl.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createAppendableJSONL } from '../src/appendable-jsonl.js';

type TestRecord = { id: number; name: string };

describe('AppendableJSONL', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'jsonl-test-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true });
  });

  it('creates file on first append', async () => {
    const jsonl = createAppendableJSONL<TestRecord>(join(dir, 'records.jsonl'));
    await jsonl.append([{ id: 1, name: 'alice' }]);

    const content = await readFile(join(dir, 'records.jsonl'), 'utf8');
    expect(content).toBe('{"id":1,"name":"alice"}\n');
  });

  it('appends without overwriting', async () => {
    const jsonl = createAppendableJSONL<TestRecord>(join(dir, 'records.jsonl'));
    await jsonl.append([{ id: 1, name: 'alice' }]);
    await jsonl.append([{ id: 2, name: 'bob' }]);

    expect(await jsonl.count()).toBe(2);
  });

  it('reads from offset', async () => {
    const jsonl = createAppendableJSONL<TestRecord>(join(dir, 'records.jsonl'));
    await jsonl.append([
      { id: 1, name: 'alice' },
      { id: 2, name: 'bob' },
      { id: 3, name: 'carol' },
    ]);

    const rows = [];
    for await (const row of jsonl.readFrom(2)) {
      rows.push(row);
    }

    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('carol');
  });

  it('readAll returns all records', async () => {
    const jsonl = createAppendableJSONL<TestRecord>(join(dir, 'records.jsonl'));
    await jsonl.append([
      { id: 1, name: 'alice' },
      { id: 2, name: 'bob' },
    ]);

    const all = await jsonl.readAll();
    expect(all).toHaveLength(2);
    expect(all[0].id).toBe(1);
  });

  it('returns 0 count for missing file', async () => {
    const jsonl = createAppendableJSONL<TestRecord>(join(dir, 'missing.jsonl'));
    expect(await jsonl.count()).toBe(0);
  });

  it('readAll on missing file returns empty array', async () => {
    const jsonl = createAppendableJSONL<TestRecord>(join(dir, 'missing.jsonl'));
    expect(await jsonl.readAll()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/storage-campaign && npx vitest run __tests__/appendable-jsonl.test.ts`
Expected: FAIL — module doesn't exist

- [ ] **Step 3: Implement AppendableJSONL**

```typescript
// packages/storage-campaign/src/appendable-jsonl.ts
import { appendFile, readFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';

export type AppendableJSONL<T> = {
  readonly append: (records: readonly T[]) => Promise<void>;
  readonly readFrom: (lineOffset: number) => AsyncIterable<T>;
  readonly readAll: () => Promise<readonly T[]>;
  readonly count: () => Promise<number>;
};

export function createAppendableJSONL<T>(filePath: string): AppendableJSONL<T> {
  let cachedCount: number | null = null;

  return {
    async append(records) {
      if (records.length === 0) return;

      const data = records.map((r) => JSON.stringify(r)).join('\n') + '\n';
      await appendFile(filePath, data, 'utf8');

      if (cachedCount !== null) {
        cachedCount += records.length;
      }
    },

    async *readFrom(lineOffset) {
      try {
        await stat(filePath);
      } catch {
        return;
      }

      const stream = createReadStream(filePath, { encoding: 'utf8' });
      const rl = createInterface({ input: stream, crlfDelay: Infinity });

      let lineIndex = 0;
      for await (const line of rl) {
        if (lineIndex >= lineOffset && line.trim().length > 0) {
          yield JSON.parse(line) as T;
        }
        lineIndex++;
      }
    },

    async readAll() {
      try {
        const content = await readFile(filePath, 'utf8');
        return content
          .split('\n')
          .filter((l) => l.trim().length > 0)
          .map((l) => JSON.parse(l) as T);
      } catch {
        return [];
      }
    },

    async count() {
      if (cachedCount !== null) return cachedCount;

      try {
        const content = await readFile(filePath, 'utf8');
        const lines = content.split('\n').filter((l) => l.trim().length > 0);
        cachedCount = lines.length;
        return cachedCount;
      } catch {
        cachedCount = 0;
        return 0;
      }
    },
  };
}
```

- [ ] **Step 4: Run tests**

Run: `cd packages/storage-campaign && npx vitest run __tests__/appendable-jsonl.test.ts`
Expected: All 6 tests pass

- [ ] **Step 5: Commit**

```bash
git add packages/storage-campaign/src/appendable-jsonl.ts packages/storage-campaign/__tests__/appendable-jsonl.test.ts
git commit -m "feat(storage-campaign): implement AppendableJSONL"
```

---

### Task 5: Implement JSON config stores (manifest, cursor, pipeline)

**Files:**
- Create: `packages/storage-campaign/src/manifest-store.ts`
- Create: `packages/storage-campaign/src/cursor-store.ts`
- Create: `packages/storage-campaign/src/pipeline-store.ts`
- Create: `packages/storage-campaign/__tests__/manifest-store.test.ts`
- Create: `packages/storage-campaign/__tests__/cursor-store.test.ts`
- Create: `packages/storage-campaign/__tests__/pipeline-store.test.ts`

- [ ] **Step 1: Write manifest store tests**

```typescript
// packages/storage-campaign/__tests__/manifest-store.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createManifestStore } from '../src/manifest-store.js';
import type { CampaignManifest } from '@titrate/sdk';
import type { Address } from 'viem';

const ZERO = '0x0000000000000000000000000000000000000000' as Address;

function makeManifest(overrides: Partial<CampaignManifest> = {}): CampaignManifest {
  return {
    id: 'test',
    status: 'configuring',
    funder: ZERO,
    name: 'Test Campaign',
    version: 1,
    chainId: 1,
    rpcUrl: 'https://rpc.example.com',
    tokenAddress: ZERO,
    tokenDecimals: 18,
    contractAddress: null,
    contractVariant: 'simple',
    contractName: 'Test',
    amountMode: 'uniform',
    amountFormat: 'integer',
    uniformAmount: null,
    batchSize: 200,
    campaignId: null,
    pinnedBlock: null,
    coldAddress: ZERO,
    walletCount: 1,
    walletOffset: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe('ManifestStore', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'manifest-test-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true });
  });

  it('returns null for missing campaign.json', async () => {
    const store = createManifestStore(dir);
    expect(await store.read()).toBeNull();
  });

  it('writes and reads manifest', async () => {
    const store = createManifestStore(dir);
    const manifest = makeManifest({ name: 'My Campaign', pinnedBlock: 12345n });
    await store.write(manifest);

    const loaded = await store.read();
    expect(loaded).not.toBeNull();
    expect(loaded!.name).toBe('My Campaign');
    expect(loaded!.pinnedBlock).toBe(12345n);
  });

  it('update merges partial changes', async () => {
    const store = createManifestStore(dir);
    await store.write(makeManifest({ status: 'configuring' }));
    await store.update({ status: 'ready' });

    const loaded = await store.read();
    expect(loaded!.status).toBe('ready');
    expect(loaded!.name).toBe('Test Campaign');
  });

  it('update throws if no manifest exists', async () => {
    const store = createManifestStore(dir);
    await expect(store.update({ status: 'ready' })).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Write cursor store tests**

```typescript
// packages/storage-campaign/__tests__/cursor-store.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createCursorStore } from '../src/cursor-store.js';
import type { PipelineCursor } from '@titrate/sdk';

function makeCursor(overrides: Partial<PipelineCursor> = {}): PipelineCursor {
  return {
    scan: { lastBlock: 0n, endBlock: null, addressCount: 0 },
    filter: { watermark: 0, qualifiedCount: 0 },
    distribute: { watermark: 0, confirmedCount: 0 },
    ...overrides,
  };
}

describe('CursorStore', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'cursor-test-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true });
  });

  it('returns null for missing cursor.json', async () => {
    const store = createCursorStore(dir);
    expect(await store.read()).toBeNull();
  });

  it('writes and reads cursor with BigInt fields', async () => {
    const store = createCursorStore(dir);
    const cursor = makeCursor({
      scan: { lastBlock: 18000000n, endBlock: 19000000n, addressCount: 500 },
    });
    await store.write(cursor);

    const loaded = await store.read();
    expect(loaded!.scan.lastBlock).toBe(18000000n);
    expect(loaded!.scan.endBlock).toBe(19000000n);
  });

  it('handles null endBlock', async () => {
    const store = createCursorStore(dir);
    await store.write(makeCursor());

    const loaded = await store.read();
    expect(loaded!.scan.endBlock).toBeNull();
  });
});
```

- [ ] **Step 3: Write pipeline store tests**

```typescript
// packages/storage-campaign/__tests__/pipeline-store.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createPipelineStore } from '../src/pipeline-store.js';
import type { PipelineConfig } from '@titrate/sdk';

describe('PipelineStore', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'pipeline-test-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true });
  });

  it('returns null for missing pipeline.json', async () => {
    const store = createPipelineStore(dir);
    expect(await store.read()).toBeNull();
  });

  it('writes and reads pipeline config', async () => {
    const store = createPipelineStore(dir);
    const config: PipelineConfig = {
      steps: [
        { type: 'source', sourceType: 'csv', params: { path: './addresses.csv' } },
        { type: 'filter', filterType: 'contract-check', params: {} },
      ],
    };
    await store.write(config);

    const loaded = await store.read();
    expect(loaded!.steps).toHaveLength(2);
    expect(loaded!.steps[0].type).toBe('source');
  });
});
```

- [ ] **Step 4: Run all three test files to verify they fail**

Run: `cd packages/storage-campaign && npx vitest run __tests__/manifest-store.test.ts __tests__/cursor-store.test.ts __tests__/pipeline-store.test.ts`
Expected: FAIL — modules don't exist

- [ ] **Step 5: Implement manifest store**

```typescript
// packages/storage-campaign/src/manifest-store.ts
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { CampaignManifest } from '@titrate/sdk';
import type { SerializedCampaignManifest } from './types.js';
import type { Address, Hex } from 'viem';

const FILENAME = 'campaign.json';

export type ManifestStore = {
  readonly read: () => Promise<CampaignManifest | null>;
  readonly write: (manifest: CampaignManifest) => Promise<void>;
  readonly update: (partial: Partial<CampaignManifest>) => Promise<void>;
};

function serialize(manifest: CampaignManifest): SerializedCampaignManifest {
  return {
    ...manifest,
    funder: manifest.funder,
    tokenAddress: manifest.tokenAddress,
    contractAddress: manifest.contractAddress,
    coldAddress: manifest.coldAddress,
    campaignId: manifest.campaignId,
    pinnedBlock: manifest.pinnedBlock !== null ? manifest.pinnedBlock.toString() : null,
  };
}

function deserialize(data: SerializedCampaignManifest): CampaignManifest {
  return {
    ...data,
    funder: data.funder as Address,
    tokenAddress: data.tokenAddress as Address,
    contractAddress: data.contractAddress as Address | null,
    coldAddress: data.coldAddress as Address,
    campaignId: data.campaignId as Hex | null,
    pinnedBlock: data.pinnedBlock !== null ? BigInt(data.pinnedBlock) : null,
    status: data.status as CampaignManifest['status'],
    contractVariant: data.contractVariant,
    amountMode: data.amountMode,
    amountFormat: data.amountFormat,
  };
}

export function createManifestStore(dir: string): ManifestStore {
  const filePath = join(dir, FILENAME);

  return {
    async read() {
      try {
        const content = await readFile(filePath, 'utf8');
        return deserialize(JSON.parse(content));
      } catch {
        return null;
      }
    },

    async write(manifest) {
      await writeFile(filePath, JSON.stringify(serialize(manifest), null, 2) + '\n', 'utf8');
    },

    async update(partial) {
      const existing = await this.read();
      if (!existing) {
        throw new Error('Cannot update: campaign.json does not exist. Use write() first.');
      }
      await this.write({ ...existing, ...partial, updatedAt: Date.now() });
    },
  };
}
```

- [ ] **Step 6: Implement cursor store**

```typescript
// packages/storage-campaign/src/cursor-store.ts
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { PipelineCursor } from '@titrate/sdk';
import type { SerializedPipelineCursor } from './types.js';

const FILENAME = 'cursor.json';

export type CursorStore = {
  readonly read: () => Promise<PipelineCursor | null>;
  readonly write: (cursor: PipelineCursor) => Promise<void>;
};

function serialize(cursor: PipelineCursor): SerializedPipelineCursor {
  return {
    scan: {
      lastBlock: cursor.scan.lastBlock.toString(),
      endBlock: cursor.scan.endBlock !== null ? cursor.scan.endBlock.toString() : null,
      addressCount: cursor.scan.addressCount,
    },
    filter: { ...cursor.filter },
    distribute: { ...cursor.distribute },
  };
}

function deserialize(data: SerializedPipelineCursor): PipelineCursor {
  return {
    scan: {
      lastBlock: BigInt(data.scan.lastBlock),
      endBlock: data.scan.endBlock !== null ? BigInt(data.scan.endBlock) : null,
      addressCount: data.scan.addressCount,
    },
    filter: { ...data.filter },
    distribute: { ...data.distribute },
  };
}

export function createCursorStore(dir: string): CursorStore {
  const filePath = join(dir, FILENAME);

  return {
    async read() {
      try {
        const content = await readFile(filePath, 'utf8');
        return deserialize(JSON.parse(content));
      } catch {
        return null;
      }
    },

    async write(cursor) {
      await writeFile(filePath, JSON.stringify(serialize(cursor), null, 2) + '\n', 'utf8');
    },
  };
}
```

- [ ] **Step 7: Implement pipeline store**

```typescript
// packages/storage-campaign/src/pipeline-store.ts
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { PipelineConfig } from '@titrate/sdk';

const FILENAME = 'pipeline.json';

export type PipelineStore = {
  readonly read: () => Promise<PipelineConfig | null>;
  readonly write: (config: PipelineConfig) => Promise<void>;
};

export function createPipelineStore(dir: string): PipelineStore {
  const filePath = join(dir, FILENAME);

  return {
    async read() {
      try {
        const content = await readFile(filePath, 'utf8');
        return JSON.parse(content) as PipelineConfig;
      } catch {
        return null;
      }
    },

    async write(config) {
      await writeFile(filePath, JSON.stringify(config, null, 2) + '\n', 'utf8');
    },
  };
}
```

- [ ] **Step 8: Run all tests**

Run: `cd packages/storage-campaign && npx vitest run __tests__/manifest-store.test.ts __tests__/cursor-store.test.ts __tests__/pipeline-store.test.ts`
Expected: All tests pass

- [ ] **Step 9: Commit**

```bash
git add packages/storage-campaign/src/manifest-store.ts packages/storage-campaign/src/cursor-store.ts packages/storage-campaign/src/pipeline-store.ts packages/storage-campaign/__tests__/
git commit -m "feat(storage-campaign): implement manifest, cursor, pipeline JSON stores"
```

---

### Task 6: Implement `createCampaignStorage` and `createSharedStorage` factories

**Files:**
- Create: `packages/storage-campaign/src/campaign-storage.ts`
- Create: `packages/storage-campaign/src/shared-storage.ts`
- Create: `packages/storage-campaign/__tests__/campaign-storage.test.ts`
- Create: `packages/storage-campaign/__tests__/shared-storage.test.ts`
- Modify: `packages/storage-campaign/src/index.ts`

- [ ] **Step 1: Write campaign storage factory test**

```typescript
// packages/storage-campaign/__tests__/campaign-storage.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createCampaignStorage } from '../src/campaign-storage.js';

describe('createCampaignStorage', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'campaign-storage-test-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true });
  });

  it('creates campaign directory if it does not exist', async () => {
    const campaignDir = join(dir, 'my-campaign');
    await createCampaignStorage(campaignDir);

    const dirStat = await stat(campaignDir);
    expect(dirStat.isDirectory()).toBe(true);
  });

  it('exposes all store properties', async () => {
    const storage = await createCampaignStorage(join(dir, 'test'));

    expect(storage.manifest).toBeDefined();
    expect(storage.pipeline).toBeDefined();
    expect(storage.cursor).toBeDefined();
    expect(storage.addresses).toBeDefined();
    expect(storage.filtered).toBeDefined();
    expect(storage.amounts).toBeDefined();
    expect(storage.batches).toBeDefined();
    expect(storage.wallets).toBeDefined();
    expect(storage.sweeps).toBeDefined();
  });

  it('round-trips data through all stores', async () => {
    const storage = await createCampaignStorage(join(dir, 'roundtrip'));

    await storage.addresses.append([
      { address: '0x0000000000000000000000000000000000000001' as `0x${string}`, amount: null },
    ]);
    expect(await storage.addresses.count()).toBe(1);

    await storage.batches.append([{ batchIndex: 0, recipients: [], amounts: [], status: 'confirmed', confirmedTxHash: null, confirmedBlock: null, createdAt: Date.now() }]);
    expect(await storage.batches.count()).toBe(1);
  });
});
```

- [ ] **Step 2: Write shared storage test**

```typescript
// packages/storage-campaign/__tests__/shared-storage.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createSharedStorage } from '../src/shared-storage.js';

describe('createSharedStorage', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'shared-storage-test-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true });
  });

  it('reads and writes chain configs', async () => {
    const shared = await createSharedStorage(join(dir, '_shared'));

    await shared.chains.put({
      id: 'eth-mainnet',
      chainId: 1,
      name: 'Ethereum',
      rpcUrl: 'https://rpc.example.com',
      rpcBusKey: 'eth-rpc',
      explorerApiUrl: 'https://api.etherscan.io',
      explorerApiKey: 'APIKEY',
      explorerBusKey: 'eth-explorer',
      trueBlocksUrl: '',
      trueBlocksBusKey: '',
    });

    const loaded = await shared.chains.getByChainId(1);
    expect(loaded).not.toBeNull();
    expect(loaded!.name).toBe('Ethereum');
  });

  it('reads and writes settings', async () => {
    const shared = await createSharedStorage(join(dir, '_shared'));

    await shared.settings.put('theme', 'dark');
    expect(await shared.settings.get('theme')).toBe('dark');
  });

  it('returns null for missing settings', async () => {
    const shared = await createSharedStorage(join(dir, '_shared'));
    expect(await shared.settings.get('missing')).toBeNull();
  });
});
```

- [ ] **Step 3: Implement campaign storage factory**

```typescript
// packages/storage-campaign/src/campaign-storage.ts
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createAppendableCSV, type AppendableCSV } from './appendable-csv.js';
import { createAppendableJSONL, type AppendableJSONL } from './appendable-jsonl.js';
import { createManifestStore, type ManifestStore } from './manifest-store.js';
import { createCursorStore, type CursorStore } from './cursor-store.js';
import { createPipelineStore, type PipelineStore } from './pipeline-store.js';
import type { BatchRecord, WalletRecord, SweepRecord } from '@titrate/sdk';

export type CampaignStorage = {
  readonly dir: string;
  readonly manifest: ManifestStore;
  readonly pipeline: PipelineStore;
  readonly cursor: CursorStore;
  readonly addresses: AppendableCSV;
  readonly filtered: AppendableCSV;
  readonly amounts: AppendableCSV;
  readonly batches: AppendableJSONL<BatchRecord>;
  readonly wallets: AppendableJSONL<WalletRecord>;
  readonly sweeps: AppendableJSONL<SweepRecord>;
};

export async function createCampaignStorage(dir: string): Promise<CampaignStorage> {
  await mkdir(dir, { recursive: true });

  return {
    dir,
    manifest: createManifestStore(dir),
    pipeline: createPipelineStore(dir),
    cursor: createCursorStore(dir),
    addresses: createAppendableCSV(join(dir, 'addresses.csv')),
    filtered: createAppendableCSV(join(dir, 'filtered.csv')),
    amounts: createAppendableCSV(join(dir, 'amounts.csv')),
    batches: createAppendableJSONL<BatchRecord>(join(dir, 'batches.jsonl')),
    wallets: createAppendableJSONL<WalletRecord>(join(dir, 'wallets.jsonl')),
    sweeps: createAppendableJSONL<SweepRecord>(join(dir, 'sweep.jsonl')),
  };
}
```

- [ ] **Step 4: Implement shared storage factory**

```typescript
// packages/storage-campaign/src/shared-storage.ts
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { StoredChainConfig } from '@titrate/sdk';

export type SharedStorage = {
  readonly chains: SharedChainConfigStore;
  readonly settings: SharedSettingsStore;
};

type SharedChainConfigStore = {
  readonly get: (id: string) => Promise<StoredChainConfig | null>;
  readonly getByChainId: (chainId: number) => Promise<StoredChainConfig | null>;
  readonly put: (config: StoredChainConfig) => Promise<void>;
  readonly list: () => Promise<readonly StoredChainConfig[]>;
  readonly delete: (id: string) => Promise<void>;
};

type SharedSettingsStore = {
  readonly get: (key: string) => Promise<string | null>;
  readonly put: (key: string, value: string) => Promise<void>;
  readonly delete: (key: string) => Promise<void>;
};

async function readJSON<T>(filePath: string): Promise<T | null> {
  try {
    const content = await readFile(filePath, 'utf8');
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

async function writeJSON(filePath: string, data: unknown): Promise<void> {
  await writeFile(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

export async function createSharedStorage(dir: string): Promise<SharedStorage> {
  await mkdir(dir, { recursive: true });

  const chainsPath = join(dir, 'chains.json');
  const settingsPath = join(dir, 'settings.json');

  const chains: SharedChainConfigStore = {
    async get(id) {
      const all = await readJSON<Record<string, StoredChainConfig>>(chainsPath) ?? {};
      return all[id] ?? null;
    },

    async getByChainId(chainId) {
      const all = await readJSON<Record<string, StoredChainConfig>>(chainsPath) ?? {};
      return Object.values(all).find((c) => c.chainId === chainId) ?? null;
    },

    async put(config) {
      const all = await readJSON<Record<string, StoredChainConfig>>(chainsPath) ?? {};
      all[config.id] = config;
      await writeJSON(chainsPath, all);
    },

    async list() {
      const all = await readJSON<Record<string, StoredChainConfig>>(chainsPath) ?? {};
      return Object.values(all);
    },

    async delete(id) {
      const all = await readJSON<Record<string, StoredChainConfig>>(chainsPath) ?? {};
      delete (all as Record<string, StoredChainConfig>)[id];
      await writeJSON(chainsPath, all);
    },
  };

  const settings: SharedSettingsStore = {
    async get(key) {
      const all = await readJSON<Record<string, string>>(settingsPath) ?? {};
      return all[key] ?? null;
    },

    async put(key, value) {
      const all = await readJSON<Record<string, string>>(settingsPath) ?? {};
      all[key] = value;
      await writeJSON(settingsPath, all);
    },

    async delete(key) {
      const all = await readJSON<Record<string, string>>(settingsPath) ?? {};
      delete (all as Record<string, string>)[key];
      await writeJSON(settingsPath, all);
    },
  };

  return { chains, settings };
}
```

- [ ] **Step 5: Update index.ts to export the real modules**

Replace the stub `packages/storage-campaign/src/index.ts`:

```typescript
export { createAppendableCSV, type AppendableCSV } from './appendable-csv.js';
export { createAppendableJSONL, type AppendableJSONL } from './appendable-jsonl.js';
export { createManifestStore, type ManifestStore } from './manifest-store.js';
export { createCursorStore, type CursorStore } from './cursor-store.js';
export { createPipelineStore, type PipelineStore } from './pipeline-store.js';
export { createCampaignStorage, type CampaignStorage } from './campaign-storage.js';
export { createSharedStorage, type SharedStorage } from './shared-storage.js';
```

- [ ] **Step 6: Run all storage-campaign tests**

Run: `cd packages/storage-campaign && npx vitest run`
Expected: All tests pass

- [ ] **Step 7: Type-check**

Run: `cd packages/storage-campaign && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 8: Commit**

```bash
git add packages/storage-campaign/
git commit -m "feat(storage-campaign): factories, shared storage, full test coverage"
```

---

### Task 7: Campaign root resolution utility

**Files:**
- Create: `packages/tui/src/utils/campaign-root.ts`
- Create: `packages/tui/__tests__/campaign-root.test.ts`

- [ ] **Step 1: Write tests**

```typescript
// packages/tui/__tests__/campaign-root.test.ts
import { describe, it, expect, afterEach, vi } from 'vitest';
import { resolveCampaignRoot, resolveCampaignDir } from '../src/utils/campaign-root.js';

describe('resolveCampaignRoot', () => {
  afterEach(() => {
    delete process.env['TITRATE_CAMPAIGNS_DIR'];
  });

  it('uses explicit folder when provided', () => {
    expect(resolveCampaignRoot('/custom/path')).toBe('/custom/path');
  });

  it('uses TITRATE_CAMPAIGNS_DIR env when no folder', () => {
    process.env['TITRATE_CAMPAIGNS_DIR'] = '/env/campaigns';
    expect(resolveCampaignRoot()).toBe('/env/campaigns');
  });

  it('falls back to ./titrate-campaigns/ when no folder or env', () => {
    const root = resolveCampaignRoot();
    expect(root).toMatch(/titrate-campaigns$/);
  });
});

describe('resolveCampaignDir', () => {
  afterEach(() => {
    delete process.env['TITRATE_CAMPAIGNS_DIR'];
  });

  it('resolves absolute path as-is', () => {
    expect(resolveCampaignDir('/absolute/path/my-campaign')).toBe('/absolute/path/my-campaign');
  });

  it('resolves name under campaign root', () => {
    process.env['TITRATE_CAMPAIGNS_DIR'] = '/campaigns';
    expect(resolveCampaignDir('my-campaign')).toBe('/campaigns/my-campaign');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/tui && npx vitest run __tests__/campaign-root.test.ts`
Expected: FAIL — module doesn't exist

- [ ] **Step 3: Implement campaign root resolution**

```typescript
// packages/tui/src/utils/campaign-root.ts
import { resolve, isAbsolute } from 'node:path';
import { homedir } from 'node:os';

const DEFAULT_DIR_NAME = 'titrate-campaigns';

/**
 * Resolves the campaign root directory.
 *
 * Resolution order:
 *   1. Explicit folder (--folder flag)
 *   2. TITRATE_CAMPAIGNS_DIR env var
 *   3. ./titrate-campaigns/ (relative to cwd)
 */
export function resolveCampaignRoot(folder?: string): string {
  if (folder) return resolve(folder);

  const envDir = process.env['TITRATE_CAMPAIGNS_DIR'];
  if (envDir) return resolve(envDir);

  return resolve(process.cwd(), DEFAULT_DIR_NAME);
}

/**
 * Resolves a campaign directory from a name or path.
 *
 * If the argument is an absolute path, use it directly.
 * If it contains a path separator, resolve relative to cwd.
 * Otherwise, treat it as a campaign name under the campaign root.
 */
export function resolveCampaignDir(nameOrPath: string, folder?: string): string {
  if (isAbsolute(nameOrPath)) return nameOrPath;
  if (nameOrPath.includes('/') || nameOrPath.includes('\\')) return resolve(nameOrPath);

  const root = resolveCampaignRoot(folder);
  return resolve(root, nameOrPath);
}
```

- [ ] **Step 4: Run tests**

Run: `cd packages/tui && npx vitest run __tests__/campaign-root.test.ts`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add packages/tui/src/utils/campaign-root.ts packages/tui/__tests__/campaign-root.test.ts
git commit -m "feat(tui): campaign root directory resolution"
```

---

### Task 8: Dashboard — step-based menu with status indicators

**Files:**
- Create: `packages/tui/src/interactive/dashboard.ts`
- Create: `packages/tui/__tests__/dashboard.test.ts`

- [ ] **Step 1: Write state derivation tests**

The dashboard derives step status from file existence. Test the state derivation logic separately from the UI rendering.

```typescript
// packages/tui/__tests__/dashboard.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { deriveDashboardState, type DashboardState } from '../src/interactive/dashboard.js';
import { createCampaignStorage } from '@titrate/storage-campaign';
import type { Address } from 'viem';

const ZERO = '0x0000000000000000000000000000000000000000' as Address;

describe('deriveDashboardState', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'dashboard-test-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true });
  });

  it('shows only campaign as complete for a fresh campaign', async () => {
    const storage = await createCampaignStorage(dir);
    await storage.manifest.write({
      id: 'test', status: 'configuring', funder: ZERO, name: 'Test', version: 1,
      chainId: 1, rpcUrl: 'https://rpc', tokenAddress: ZERO, tokenDecimals: 18,
      contractAddress: null, contractVariant: 'simple', contractName: 'Test',
      amountMode: 'uniform', amountFormat: 'integer', uniformAmount: null,
      batchSize: 200, campaignId: null, pinnedBlock: null,
      coldAddress: ZERO, walletCount: 1, walletOffset: 0,
      createdAt: Date.now(), updatedAt: Date.now(),
    });

    const state = await deriveDashboardState(storage);
    expect(state.campaign).toBe('complete');
    expect(state.addresses).toBe('empty');
    expect(state.filters).toBe('locked');
    expect(state.amounts).toBe('locked');
    expect(state.wallet).toBe('locked');
    expect(state.distribute).toBe('locked');
    expect(state.sweep).toBe('locked');
  });

  it('unlocks filters when addresses exist', async () => {
    const storage = await createCampaignStorage(dir);
    await storage.manifest.write({
      id: 'test', status: 'configuring', funder: ZERO, name: 'Test', version: 1,
      chainId: 1, rpcUrl: 'https://rpc', tokenAddress: ZERO, tokenDecimals: 18,
      contractAddress: null, contractVariant: 'simple', contractName: 'Test',
      amountMode: 'uniform', amountFormat: 'integer', uniformAmount: null,
      batchSize: 200, campaignId: null, pinnedBlock: null,
      coldAddress: ZERO, walletCount: 1, walletOffset: 0,
      createdAt: Date.now(), updatedAt: Date.now(),
    });
    await storage.addresses.append([
      { address: '0x0000000000000000000000000000000000000001' as Address, amount: null },
    ]);

    const state = await deriveDashboardState(storage);
    expect(state.addresses).toBe('complete');
    expect(state.filters).toBe('available');
  });

  it('unlocks distribute when wallet is configured', async () => {
    const storage = await createCampaignStorage(dir);
    await storage.manifest.write({
      id: 'test', status: 'funded', funder: ZERO, name: 'Test', version: 1,
      chainId: 1, rpcUrl: 'https://rpc', tokenAddress: ZERO, tokenDecimals: 18,
      contractAddress: '0x0000000000000000000000000000000000000099' as Address,
      contractVariant: 'simple', contractName: 'Test',
      amountMode: 'uniform', amountFormat: 'integer', uniformAmount: '1000',
      batchSize: 200, campaignId: null, pinnedBlock: null,
      coldAddress: ZERO, walletCount: 1, walletOffset: 0,
      createdAt: Date.now(), updatedAt: Date.now(),
    });
    await storage.addresses.append([
      { address: '0x0000000000000000000000000000000000000001' as Address, amount: null },
    ]);
    await storage.filtered.append([
      { address: '0x0000000000000000000000000000000000000001' as Address, amount: null },
    ]);
    await storage.wallets.append([
      { index: 0, address: '0x0000000000000000000000000000000000000010' as Address, coldAddress: ZERO, createdAt: Date.now() },
    ]);

    const state = await deriveDashboardState(storage);
    expect(state.distribute).toBe('available');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/tui && npx vitest run __tests__/dashboard.test.ts`
Expected: FAIL — module doesn't exist

- [ ] **Step 3: Implement dashboard state derivation and rendering**

```typescript
// packages/tui/src/interactive/dashboard.ts
import { select, isCancel } from '@clack/prompts';
import type { CampaignStorage } from '@titrate/storage-campaign';

export type StepStatus = 'complete' | 'available' | 'locked' | 'empty' | 'in_progress';

export type DashboardState = {
  readonly campaign: StepStatus;
  readonly addresses: StepStatus;
  readonly filters: StepStatus;
  readonly amounts: StepStatus;
  readonly wallet: StepStatus;
  readonly distribute: StepStatus;
  readonly sweep: StepStatus;
};

export type DashboardAction =
  | 'campaign' | 'addresses' | 'filters' | 'amounts'
  | 'wallet' | 'distribute' | 'sweep' | 'quit';

const STATUS_ICONS: Record<StepStatus, string> = {
  complete: '\u2713',     // ✓
  available: '\u2192',    // →
  locked: '\u25CB',       // ○
  empty: '\u25CB',        // ○
  in_progress: '\u25D0',  // ◐
};

export async function deriveDashboardState(storage: CampaignStorage): Promise<DashboardState> {
  const manifest = await storage.manifest.read();
  if (!manifest) {
    return { campaign: 'empty', addresses: 'locked', filters: 'locked', amounts: 'locked', wallet: 'locked', distribute: 'locked', sweep: 'locked' };
  }

  const addressCount = await storage.addresses.count();
  const filteredCount = await storage.filtered.count();
  const walletCount = await storage.wallets.count();
  const batchCount = await storage.batches.count();
  const hasContract = manifest.contractAddress !== null;
  const hasAmounts = manifest.amountMode === 'uniform'
    ? manifest.uniformAmount !== null
    : (await storage.amounts.count()) > 0;

  const addresses: StepStatus = addressCount > 0 ? 'complete' : 'empty';
  const filters: StepStatus = addressCount === 0 ? 'locked' : filteredCount > 0 ? 'complete' : 'available';
  const amounts: StepStatus = filteredCount === 0 ? 'locked' : hasAmounts ? 'complete' : 'available';
  const wallet: StepStatus = !hasAmounts ? 'locked' : (walletCount > 0 && hasContract) ? 'complete' : 'available';
  const distribute: StepStatus = !(walletCount > 0 && hasContract) ? 'locked' : batchCount > 0 ? 'complete' : 'available';
  const sweep: StepStatus = batchCount === 0 ? 'locked' : 'available';

  return { campaign: 'complete', addresses, filters, amounts, wallet, distribute, sweep };
}

type StepDef = { key: DashboardAction; label: string; detail: string };

function buildMenuOptions(
  state: DashboardState,
  manifest: { name: string; chainId: number; tokenAddress: string },
  counts: { addresses: number; filtered: number; batches: number },
): { value: DashboardAction; label: string; hint?: string }[] {
  const steps: StepDef[] = [
    { key: 'campaign', label: 'Campaign', detail: `${manifest.name} · chain ${manifest.chainId}` },
    { key: 'addresses', label: 'Addresses', detail: counts.addresses > 0 ? `${counts.addresses} sourced` : 'Not configured' },
    { key: 'filters', label: 'Filters', detail: counts.filtered > 0 ? `${counts.filtered} qualified` : state.filters === 'locked' ? 'Waiting for addresses' : 'Not configured' },
    { key: 'amounts', label: 'Amounts', detail: state.amounts === 'locked' ? 'Waiting for filters' : state.amounts === 'complete' ? 'Configured' : 'Not configured' },
    { key: 'wallet', label: 'Wallet', detail: state.wallet === 'locked' ? 'Waiting for amounts' : state.wallet === 'complete' ? 'Funded' : 'Not configured' },
    { key: 'distribute', label: 'Distribute', detail: state.distribute === 'locked' ? 'Waiting for wallet' : counts.batches > 0 ? `${counts.batches} batches sent` : 'Ready' },
    { key: 'sweep', label: 'Sweep', detail: state.sweep === 'locked' ? 'Waiting for distribution' : 'Available' },
  ];

  const options = steps.map((s) => ({
    value: s.key,
    label: `${STATUS_ICONS[state[s.key]]} ${s.label}`,
    hint: s.detail,
  }));

  options.push({ value: 'quit' as DashboardAction, label: 'Quit', hint: undefined });

  return options;
}

/**
 * Shows the campaign dashboard menu and returns the selected action.
 * The caller is responsible for executing the action and re-calling this in a loop.
 */
export async function showDashboard(storage: CampaignStorage): Promise<DashboardAction | symbol> {
  const manifest = await storage.manifest.read();
  if (!manifest) {
    throw new Error('No campaign.json found. Use `titrate new` to create a campaign.');
  }

  const state = await deriveDashboardState(storage);
  const addressCount = await storage.addresses.count();
  const filteredCount = await storage.filtered.count();
  const batchCount = await storage.batches.count();

  const options = buildMenuOptions(
    state,
    { name: manifest.name, chainId: manifest.chainId, tokenAddress: manifest.tokenAddress },
    { addresses: addressCount, filtered: filteredCount, batches: batchCount },
  );

  const action = await select({
    message: `${manifest.name}`,
    options,
  });

  if (isCancel(action)) return action;
  return action as DashboardAction;
}
```

- [ ] **Step 4: Add `@titrate/storage-campaign` dependency to TUI package.json**

Add to `packages/tui/package.json` dependencies:

```json
"@titrate/storage-campaign": "0.0.1"
```

Run: `cd /Users/michaelmclaughlin/Documents/morbius/github/airdrop && npm install`

- [ ] **Step 5: Run tests**

Run: `cd packages/tui && npx vitest run __tests__/dashboard.test.ts`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add packages/tui/src/interactive/dashboard.ts packages/tui/__tests__/dashboard.test.ts packages/tui/package.json
git commit -m "feat(tui): campaign dashboard with step status derivation"
```

---

### Task 9: `titrate new` command

**Files:**
- Create: `packages/tui/src/commands/new-campaign.ts`
- Modify: `packages/tui/src/index.ts`

- [ ] **Step 1: Implement `titrate new` command**

```typescript
// packages/tui/src/commands/new-campaign.ts
import { Command } from 'commander';
import { intro, outro, isCancel } from '@clack/prompts';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { createCampaignStorage } from '@titrate/storage-campaign';
import { slugifyCampaignName } from '@titrate/sdk';
import { resolveCampaignDir } from '../utils/campaign-root.js';
import { campaignStep } from '../interactive/steps/campaign.js';
import { showDashboard, type DashboardAction } from '../interactive/dashboard.js';

export function registerNewCampaign(program: Command): void {
  program
    .command('new <name>')
    .description('Create a new campaign')
    .option('--folder <path>', 'Campaign root directory override')
    .action(async (name: string, opts: { folder?: string }) => {
      const campaignId = slugifyCampaignName(name);
      const campaignDir = resolveCampaignDir(campaignId, opts.folder);

      // Check if campaign already exists
      try {
        await stat(join(campaignDir, 'campaign.json'));
        console.error(`Campaign "${name}" already exists at ${campaignDir}. Use \`titrate open\` instead.`);
        process.exit(1);
      } catch {
        // Expected — campaign doesn't exist yet
      }

      intro(`Titrate — New Campaign: ${name}`);

      const storage = await createCampaignStorage(campaignDir);

      // Run Step 1: Campaign Setup (reuse existing step)
      const campaign = await campaignStep(storage);
      if (isCancel(campaign)) {
        outro('Cancelled.');
        return;
      }

      // Persist campaign manifest
      const now = Date.now();
      await storage.manifest.write({
        id: campaignId,
        status: 'configuring',
        funder: '0x0000000000000000000000000000000000000000' as `0x${string}`,
        name,
        version: 1,
        chainId: campaign.chainId,
        rpcUrl: campaign.rpcUrl,
        tokenAddress: campaign.tokenAddress as `0x${string}`,
        tokenDecimals: campaign.tokenDecimals,
        contractAddress: null,
        contractVariant: campaign.contractVariant,
        contractName: campaign.contractName,
        amountMode: 'uniform',
        amountFormat: 'integer',
        uniformAmount: null,
        batchSize: campaign.batchSize,
        campaignId: null,
        pinnedBlock: null,
        coldAddress: '0x0000000000000000000000000000000000000000' as `0x${string}`,
        walletCount: 1,
        walletOffset: 0,
        createdAt: now,
        updatedAt: now,
      });

      console.log(`\n  Campaign created at ${campaignDir}\n`);

      // Drop into the dashboard loop
      let running = true;
      while (running) {
        const action = await showDashboard(storage);
        if (isCancel(action) || action === 'quit') {
          running = false;
          continue;
        }
        // TODO: Phase 1 will wire up step handlers in Task 11
        console.log(`  Action "${action}" selected — step handlers coming in a future task.`);
      }

      outro('Done.');
    });
}
```

- [ ] **Step 2: Register command in index.ts**

Add import and registration to `packages/tui/src/index.ts`:

```typescript
import { registerNewCampaign } from './commands/new-campaign.js';
// ... in the registration block:
registerNewCampaign(program);
```

- [ ] **Step 3: Type-check**

Run: `cd packages/tui && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add packages/tui/src/commands/new-campaign.ts packages/tui/src/index.ts
git commit -m "feat(tui): titrate new command with dashboard loop"
```

---

### Task 10: `titrate open` and `titrate list` commands

**Files:**
- Create: `packages/tui/src/commands/open-campaign.ts`
- Create: `packages/tui/src/commands/list-campaigns.ts`
- Modify: `packages/tui/src/index.ts`

- [ ] **Step 1: Implement `titrate open`**

```typescript
// packages/tui/src/commands/open-campaign.ts
import { Command } from 'commander';
import { intro, outro, isCancel } from '@clack/prompts';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { createCampaignStorage } from '@titrate/storage-campaign';
import { resolveCampaignDir } from '../utils/campaign-root.js';
import { showDashboard } from '../interactive/dashboard.js';

export function registerOpenCampaign(program: Command): void {
  program
    .command('open <name-or-path>')
    .description('Open an existing campaign')
    .option('--folder <path>', 'Campaign root directory override')
    .action(async (nameOrPath: string, opts: { folder?: string }) => {
      const campaignDir = resolveCampaignDir(nameOrPath, opts.folder);

      try {
        await stat(join(campaignDir, 'campaign.json'));
      } catch {
        console.error(`No campaign found at ${campaignDir}. Use \`titrate new\` to create one.`);
        process.exit(1);
      }

      const storage = await createCampaignStorage(campaignDir);
      const manifest = await storage.manifest.read();

      intro(`Titrate — ${manifest?.name ?? nameOrPath}`);

      let running = true;
      while (running) {
        const action = await showDashboard(storage);
        if (isCancel(action) || action === 'quit') {
          running = false;
          continue;
        }
        // TODO: Wire up step handlers in Task 11
        console.log(`  Action "${action}" selected — step handlers coming in a future task.`);
      }

      outro('Done.');
    });
}
```

- [ ] **Step 2: Implement `titrate list`**

```typescript
// packages/tui/src/commands/list-campaigns.ts
import { Command } from 'commander';
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { resolveCampaignRoot } from '../utils/campaign-root.js';
import { createCampaignStorage } from '@titrate/storage-campaign';

export function registerListCampaigns(program: Command): void {
  program
    .command('list')
    .description('List all campaigns')
    .option('--folder <path>', 'Campaign root directory override')
    .action(async (opts: { folder?: string }) => {
      const root = resolveCampaignRoot(opts.folder);

      let entries: string[];
      try {
        entries = await readdir(root);
      } catch {
        console.log('No campaigns found.');
        return;
      }

      const campaigns: { name: string; status: string; updatedAt: number }[] = [];

      for (const entry of entries) {
        if (entry.startsWith('_')) continue;

        const dirPath = join(root, entry);
        const dirStat = await stat(dirPath).catch(() => null);
        if (!dirStat?.isDirectory()) continue;

        try {
          const storage = await createCampaignStorage(dirPath);
          const manifest = await storage.manifest.read();
          if (manifest) {
            campaigns.push({
              name: manifest.name,
              status: manifest.status,
              updatedAt: manifest.updatedAt,
            });
          }
        } catch {
          // Not a valid campaign directory — skip
        }
      }

      if (campaigns.length === 0) {
        console.log('No campaigns found.');
        return;
      }

      console.log(`\n  Found ${campaigns.length} campaign(s):\n`);
      for (const c of campaigns) {
        const date = new Date(c.updatedAt).toLocaleDateString();
        console.log(`  ${c.name.padEnd(30)} ${c.status.padEnd(15)} ${date}`);
      }
      console.log();
    });
}
```

- [ ] **Step 3: Register both commands in index.ts**

Add imports and registrations to `packages/tui/src/index.ts`:

```typescript
import { registerOpenCampaign } from './commands/open-campaign.js';
import { registerListCampaigns } from './commands/list-campaigns.js';
// ... in the registration block:
registerOpenCampaign(program);
registerListCampaigns(program);
```

- [ ] **Step 4: Type-check**

Run: `cd packages/tui && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add packages/tui/src/commands/open-campaign.ts packages/tui/src/commands/list-campaigns.ts packages/tui/src/index.ts
git commit -m "feat(tui): titrate open and list commands"
```

---

### Task 11: Wire dashboard actions to existing step implementations

**Files:**
- Create: `packages/tui/src/interactive/step-runner.ts`
- Modify: `packages/tui/src/commands/new-campaign.ts`
- Modify: `packages/tui/src/commands/open-campaign.ts`

This task connects the dashboard menu actions to the existing step implementations from `interactive/steps/`. Each action reads from storage, runs the step, and writes results back to storage.

- [ ] **Step 1: Create step runner that dispatches dashboard actions**

```typescript
// packages/tui/src/interactive/step-runner.ts
import type { CampaignStorage } from '@titrate/storage-campaign';
import type { DashboardAction } from './dashboard.js';
import { isCancel } from '@clack/prompts';
import { campaignStep } from './steps/campaign.js';
import { addressesStep } from './steps/addresses.js';
import { filtersStep } from './steps/filters.js';
import { amountsStep } from './steps/amounts.js';
import { walletStep } from './steps/wallet.js';
import { distributeStep } from './steps/distribute.js';
import type { Address } from 'viem';

/**
 * Runs a single dashboard action against the campaign storage.
 * Returns true if the action completed, false if cancelled.
 */
export async function runDashboardAction(
  action: DashboardAction,
  storage: CampaignStorage,
): Promise<boolean> {
  const manifest = await storage.manifest.read();
  if (!manifest) throw new Error('No campaign manifest found.');

  switch (action) {
    case 'campaign': {
      const result = await campaignStep(storage);
      if (isCancel(result)) return false;

      await storage.manifest.update({
        chainId: result.chainId,
        rpcUrl: result.rpcUrl,
        tokenAddress: result.tokenAddress as Address,
        tokenDecimals: result.tokenDecimals,
        contractVariant: result.contractVariant,
        contractName: result.contractName,
        batchSize: result.batchSize,
      });
      return true;
    }

    case 'addresses': {
      const campaignResult = {
        name: manifest.name,
        chainId: manifest.chainId,
        rpcUrl: manifest.rpcUrl,
        tokenAddress: manifest.tokenAddress,
        tokenSymbol: '',
        tokenDecimals: manifest.tokenDecimals,
        contractVariant: manifest.contractVariant,
        contractName: manifest.contractName,
        batchSize: manifest.batchSize,
        publicClient: (await import('../utils/rpc.js')).createRpcClient(manifest.rpcUrl, manifest.chainId),
        resumeCampaignId: null,
      };

      const result = await addressesStep(campaignResult);
      if (isCancel(result)) return false;

      // Write addresses to storage
      const rows = result.addresses.map((addr: string) => ({
        address: addr as Address,
        amount: null,
      }));
      await storage.addresses.append(rows);
      await storage.manifest.update({ status: 'configuring' });
      return true;
    }

    case 'filters':
    case 'amounts':
    case 'wallet':
    case 'distribute':
    case 'sweep': {
      // These steps require more integration work — reading from storage,
      // adapting step signatures, writing results back. Each will be wired
      // up as the existing steps are refactored to accept CampaignStorage.
      // For now, show a placeholder.
      console.log(`\n  Step "${action}" integration is in progress.\n`);
      return true;
    }

    case 'quit':
      return false;

    default:
      return false;
  }
}
```

- [ ] **Step 2: Update new-campaign.ts and open-campaign.ts to use step runner**

Replace the TODO placeholder in both files' dashboard loops:

```typescript
// In the while loop, replace:
//   console.log(`  Action "${action}" selected — step handlers coming in a future task.`);
// With:
import { runDashboardAction } from '../interactive/step-runner.js';
// ...
const completed = await runDashboardAction(action as DashboardAction, storage);
if (!completed) {
  // User cancelled the step — stay in the dashboard
}
```

- [ ] **Step 3: Type-check**

Run: `cd packages/tui && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add packages/tui/src/interactive/step-runner.ts packages/tui/src/commands/new-campaign.ts packages/tui/src/commands/open-campaign.ts
git commit -m "feat(tui): wire dashboard actions to step runner"
```

---

### Task 12: Add `--campaign` flag to `distribute` and `sweep` commands

**Files:**
- Modify: `packages/tui/src/commands/distribute.ts`
- Modify: `packages/tui/src/commands/sweep.ts`

- [ ] **Step 1: Add `--campaign` flag to distribute command**

Add to the option chain in `packages/tui/src/commands/distribute.ts`:

```typescript
.option('--campaign <name>', 'Load config from a campaign directory')
```

Add `campaign?: string` to the opts type.

At the top of the action handler, before the existing logic, add a branch that loads from storage:

```typescript
if (opts.campaign) {
  const { resolveCampaignDir } = await import('../utils/campaign-root.js');
  const { createCampaignStorage } = await import('@titrate/storage-campaign');

  const campaignDir = resolveCampaignDir(opts.campaign);
  const storage = await createCampaignStorage(campaignDir);
  const manifest = await storage.manifest.read();

  if (!manifest) {
    throw new Error(`No campaign found at ${campaignDir}`);
  }

  // Override opts from manifest
  opts.contract = opts.contract ?? manifest.contractAddress!;
  opts.token = opts.token ?? manifest.tokenAddress;
  opts.rpc = opts.rpc ?? manifest.rpcUrl;
  opts.variant = opts.variant ?? manifest.contractVariant;
  opts.batchSize = opts.batchSize ?? String(manifest.batchSize);
  opts.chainId = opts.chainId ?? manifest.chainId;

  if (manifest.walletCount > 1) {
    opts.wallets = opts.wallets ?? manifest.walletCount;
    opts.walletOffset = opts.walletOffset ?? manifest.walletOffset;
    opts.campaignName = opts.campaignName ?? manifest.name;
  }
}
```

Note: `--contract`, `--token`, and `--rpc` should change from `requiredOption` to `option` since they can come from the campaign. Add validation after the `--campaign` branch:

```typescript
if (!opts.contract) throw new Error('--contract is required (or use --campaign)');
if (!opts.token) throw new Error('--token is required (or use --campaign)');
if (!opts.rpc) throw new Error('--rpc is required (or use --campaign)');
```

- [ ] **Step 2: Add `--campaign` flag to sweep command**

Add to the option chain in `packages/tui/src/commands/sweep.ts`:

```typescript
.option('--campaign <name>', 'Load config from a campaign directory')
```

Add `campaign?: string` to the opts type.

At the top of the action handler, add a branch that loads from storage:

```typescript
if (opts.campaign) {
  const { resolveCampaignDir } = await import('../utils/campaign-root.js');
  const { createCampaignStorage } = await import('@titrate/storage-campaign');

  const campaignDir = resolveCampaignDir(opts.campaign);
  const storage = await createCampaignStorage(campaignDir);
  const manifest = await storage.manifest.read();

  if (!manifest) {
    throw new Error(`No campaign found at ${campaignDir}`);
  }

  opts.rpc = opts.rpc ?? manifest.rpcUrl;
  opts.campaignName = opts.campaignName ?? manifest.name;
  opts.count = opts.count ?? manifest.walletCount;
  opts.offset = opts.offset ?? manifest.walletOffset;
  opts.token = opts.token ?? manifest.tokenAddress;
  opts.chainId = opts.chainId ?? manifest.chainId;
}
```

Change `--rpc`, `--campaign-name`, and `--count` from `requiredOption` to `option` and add validation after the branch.

- [ ] **Step 3: Type-check**

Run: `cd packages/tui && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add packages/tui/src/commands/distribute.ts packages/tui/src/commands/sweep.ts
git commit -m "feat(tui): --campaign flag for distribute and sweep commands"
```

---

### Task 13: Integration test — full campaign cycle on Anvil

**Files:**
- Create: `packages/tui/__tests__/integration/campaign-cycle.test.ts`

This test creates a campaign directory, configures it programmatically (no interactive prompts), distributes tokens via Anvil, and sweeps. Gated behind `ANVIL_RPC` env var.

- [ ] **Step 1: Write integration test**

```typescript
// packages/tui/__tests__/integration/campaign-cycle.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createCampaignStorage } from '@titrate/storage-campaign';
import type { CampaignManifest } from '@titrate/sdk';
import type { Address } from 'viem';

const ANVIL_RPC = process.env['ANVIL_RPC'];
const ZERO = '0x0000000000000000000000000000000000000000' as Address;

describe.skipIf(!ANVIL_RPC)('Campaign cycle (Anvil)', () => {
  let dir: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'campaign-cycle-'));
  });

  afterAll(async () => {
    await rm(dir, { recursive: true });
  });

  it('creates a campaign, populates addresses, and reads them back', async () => {
    const storage = await createCampaignStorage(join(dir, 'test-campaign'));

    // Write manifest
    const manifest: CampaignManifest = {
      id: 'test-campaign',
      status: 'configuring',
      funder: ZERO,
      name: 'Integration Test',
      version: 1,
      chainId: 31337,
      rpcUrl: ANVIL_RPC!,
      tokenAddress: ZERO,
      tokenDecimals: 18,
      contractAddress: null,
      contractVariant: 'simple',
      contractName: 'Test',
      amountMode: 'uniform',
      amountFormat: 'integer',
      uniformAmount: '1000000000000000000',
      batchSize: 10,
      campaignId: null,
      pinnedBlock: null,
      coldAddress: ZERO,
      walletCount: 1,
      walletOffset: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await storage.manifest.write(manifest);

    // Populate addresses
    const addresses = Array.from({ length: 25 }, (_, i) => ({
      address: `0x${(i + 1).toString(16).padStart(40, '0')}` as Address,
      amount: null,
    }));
    await storage.addresses.append(addresses);

    // Verify round-trip
    const loadedManifest = await storage.manifest.read();
    expect(loadedManifest!.name).toBe('Integration Test');

    const addressCount = await storage.addresses.count();
    expect(addressCount).toBe(25);

    // Read from offset
    const tail = [];
    for await (const row of storage.addresses.readFrom(20)) {
      tail.push(row);
    }
    expect(tail).toHaveLength(5);
  });

  it('appends batch results and reads them back', async () => {
    const storage = await createCampaignStorage(join(dir, 'test-campaign'));

    await storage.batches.append([
      { batchIndex: 0, recipients: [ZERO], amounts: ['1000'], status: 'confirmed', confirmedTxHash: '0xabc' as `0x${string}`, confirmedBlock: '100', createdAt: Date.now() },
      { batchIndex: 1, recipients: [ZERO], amounts: ['2000'], status: 'confirmed', confirmedTxHash: '0xdef' as `0x${string}`, confirmedBlock: '101', createdAt: Date.now() },
    ]);

    const all = await storage.batches.readAll();
    expect(all).toHaveLength(2);
    expect(all[0].batchIndex).toBe(0);
    expect(all[1].batchIndex).toBe(1);
  });
});
```

- [ ] **Step 2: Run integration test (if Anvil is available)**

Run: `ANVIL_RPC=http://127.0.0.1:8545 npx vitest run packages/tui/__tests__/integration/campaign-cycle.test.ts`
Expected: Tests pass if Anvil is running, skipped otherwise

- [ ] **Step 3: Commit**

```bash
git add packages/tui/__tests__/integration/campaign-cycle.test.ts
git commit -m "test(tui): integration test for campaign lifecycle"
```

---

### Task 14: Run full test suite and verify no regressions

**Files:** None (verification only)

- [ ] **Step 1: Run SDK tests**

Run: `cd packages/sdk && npx vitest run`
Expected: All tests pass (including new types test from Task 1)

- [ ] **Step 2: Run storage-campaign tests**

Run: `cd packages/storage-campaign && npx vitest run`
Expected: All tests pass

- [ ] **Step 3: Run TUI tests**

Run: `cd packages/tui && npx vitest run`
Expected: All tests pass

- [ ] **Step 4: Type-check all packages**

Run: `cd /Users/michaelmclaughlin/Documents/morbius/github/airdrop && npm run build --workspaces`
Expected: All packages compile without errors

- [ ] **Step 5: Commit any remaining fixes**

If any tests needed fixes, commit them:

```bash
git add -A
git commit -m "fix: resolve test regressions from campaign lifecycle changes"
```

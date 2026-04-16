# Titrate Phase 2: TUI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Titrate TUI — a terminal interface consuming `@titrate/sdk` for address collection, contract deployment, and batch token distribution. Supports both interactive (wizard) and headless (scriptable) modes, with filesystem-backed storage and auto-resume by campaign identity.

**Architecture:** Commander.js for CLI arg parsing, Clack for interactive prompts, Ora for spinners/progress. The TUI implements the SDK's `Storage` interface using the filesystem (`.titrate/` directory). Private keys come from env vars or flags. All heavy lifting done by the SDK — the TUI is a thin adapter.

**Tech Stack:** TypeScript, Commander.js, @clack/prompts, Ora, @titrate/sdk, tsx (runtime)

**Spec:** `docs/superpowers/specs/2026-03-29-titrate-design.md` (TUI section)

---

## File Structure

```
packages/tui/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts                 # Entry point — Commander program setup
│   ├── commands/
│   │   ├── collect.ts           # titrate collect
│   │   ├── deploy.ts            # titrate deploy
│   │   ├── distribute.ts        # titrate distribute
│   │   ├── derive-wallet.ts     # titrate derive-wallet
│   │   └── run.ts               # titrate run --config
│   ├── storage/
│   │   ├── index.ts             # FileStorage implementing SDK Storage interface
│   │   ├── campaigns.ts         # Campaign CRUD on filesystem
│   │   ├── address-sets.ts      # Address set read/write
│   │   ├── batches.ts           # Batch tracking
│   │   └── wallets.ts           # Wallet references + pipeline config
│   ├── progress/
│   │   └── renderer.ts          # Terminal progress rendering (inline stats)
│   └── utils/
│       ├── rpc.ts               # Create publicClient from RPC URL
│       └── wallet.ts            # Create walletClient from private key
└── __tests__/
    ├── storage.test.ts
    └── commands.test.ts
```

---

### Task 1: TUI Package Scaffold

**Files:**
- Create: `packages/tui/package.json`
- Create: `packages/tui/tsconfig.json`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@titrate/tui",
  "version": "0.0.1",
  "type": "module",
  "bin": {
    "titrate": "dist/index.js"
  },
  "scripts": {
    "dev": "tsx src/index.ts",
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@titrate/sdk": "0.0.1",
    "commander": "^13.1.0",
    "@clack/prompts": "^0.10.0",
    "ora": "^8.2.0",
    "viem": "^2.23.2"
  },
  "devDependencies": {
    "tsx": "^4.19.2",
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
  "include": ["src"]
}
```

- [ ] **Step 3: Install dependencies**

```bash
cd packages/tui && npm install
```

- [ ] **Step 4: Commit**

```bash
git add packages/tui/package.json packages/tui/tsconfig.json
git commit -m "feat(tui): scaffold TUI package with commander, clack, ora"
```

---

### Task 2: Filesystem Storage Adapter

**Files:**
- Create: `packages/tui/src/storage/campaigns.ts`
- Create: `packages/tui/src/storage/address-sets.ts`
- Create: `packages/tui/src/storage/batches.ts`
- Create: `packages/tui/src/storage/wallets.ts`
- Create: `packages/tui/src/storage/index.ts`
- Create: `packages/tui/__tests__/storage.test.ts`

This implements the SDK's `Storage` interface using JSON/CSV files under a configurable base directory.

- [ ] **Step 1: Write storage tests**

```typescript
// packages/tui/__tests__/storage.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFileStorage } from '../src/storage/index.js';
import type { Storage, StoredCampaign, StoredBatch, StoredWallet } from '@titrate/sdk';

describe('FileStorage', () => {
  let storage: Storage;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'titrate-test-'));
    storage = createFileStorage(tempDir);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('campaigns', () => {
    const campaign: StoredCampaign = {
      id: 'test-1',
      funder: '0x1234567890abcdef1234567890abcdef12345678',
      name: 'Test Campaign',
      version: 1,
      chainId: 1,
      rpcUrl: 'https://eth.llamarpc.com',
      tokenAddress: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
      tokenDecimals: 8,
      contractAddress: null,
      contractVariant: 'simple',
      contractName: 'TestDrop',
      amountMode: 'uniform',
      amountFormat: 'integer',
      uniformAmount: '100',
      batchSize: 200,
      campaignId: null,
      pinnedBlock: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    it('puts and gets a campaign', async () => {
      await storage.campaigns.put(campaign);
      const got = await storage.campaigns.get('test-1');
      expect(got).toBeTruthy();
      expect(got!.name).toBe('Test Campaign');
    });

    it('finds by identity', async () => {
      await storage.campaigns.put(campaign);
      const got = await storage.campaigns.getByIdentity(
        campaign.funder,
        campaign.name,
        campaign.version,
      );
      expect(got).toBeTruthy();
      expect(got!.id).toBe('test-1');
    });

    it('returns null for missing campaign', async () => {
      expect(await storage.campaigns.get('nonexistent')).toBeNull();
    });

    it('lists all campaigns', async () => {
      await storage.campaigns.put(campaign);
      await storage.campaigns.put({ ...campaign, id: 'test-2', name: 'Second' });
      const list = await storage.campaigns.list();
      expect(list).toHaveLength(2);
    });
  });

  describe('addressSets', () => {
    it('puts and gets by campaign', async () => {
      await storage.addressSets.put({
        id: 'set-1',
        campaignId: 'test-1',
        name: 'source',
        type: 'source',
        addressCount: 100,
        createdAt: Date.now(),
      });
      const sets = await storage.addressSets.getByCampaign('test-1');
      expect(sets).toHaveLength(1);
      expect(sets[0].name).toBe('source');
    });
  });

  describe('addresses', () => {
    it('puts batch and reads back', async () => {
      await storage.addresses.putBatch([
        { setId: 'set-1', address: '0x1111111111111111111111111111111111111111', amount: '100' },
        { setId: 'set-1', address: '0x2222222222222222222222222222222222222222', amount: '200' },
      ]);
      const addresses = await storage.addresses.getBySet('set-1');
      expect(addresses).toHaveLength(2);
      expect(await storage.addresses.countBySet('set-1')).toBe(2);
    });
  });

  describe('batches', () => {
    it('puts and retrieves by campaign', async () => {
      const batch: StoredBatch = {
        id: 'batch-1',
        campaignId: 'test-1',
        batchIndex: 0,
        recipients: ['0x1111111111111111111111111111111111111111'],
        amounts: ['100'],
        status: 'confirmed',
        attempts: [],
        confirmedTxHash: '0xabcd',
        confirmedBlock: 42n,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await storage.batches.put(batch);
      const batches = await storage.batches.getByCampaign('test-1');
      expect(batches).toHaveLength(1);
      const last = await storage.batches.getLastCompleted('test-1');
      expect(last).toBeTruthy();
      expect(last!.batchIndex).toBe(0);
    });
  });

  describe('wallets', () => {
    it('puts and gets by campaign', async () => {
      const wallet: StoredWallet = {
        id: 'w-1',
        campaignId: 'test-1',
        hotAddress: '0x1111111111111111111111111111111111111111',
        coldAddress: '0x2222222222222222222222222222222222222222',
        createdAt: Date.now(),
      };
      await storage.wallets.put(wallet);
      const got = await storage.wallets.get('test-1');
      expect(got).toBeTruthy();
      expect(got!.hotAddress).toBe('0x1111111111111111111111111111111111111111');
    });
  });
});
```

- [ ] **Step 2: Create campaigns.ts**

Implements `CampaignStore` — stores each campaign as `campaigns/{id}.json`. Serializes/deserializes `bigint` fields (pinnedBlock) as strings. Lists by reading the directory. `getByIdentity` scans all campaigns and matches on `(funder, name, version)`.

- [ ] **Step 3: Create address-sets.ts**

Implements `AddressSetStore` (metadata as `sets/{id}.meta.json`) and `AddressStore` (addresses as `sets/{id}.csv` — one address per line, optionally with comma-separated amount). Append-only writes.

- [ ] **Step 4: Create batches.ts**

Implements `BatchStore` — each batch as `batches/{id}.json`. Serializes `bigint` confirmedBlock. `getLastCompleted` filters by `status === 'confirmed'` and returns the highest `batchIndex`.

- [ ] **Step 5: Create wallets.ts**

Implements `WalletStore` (single `wallets.json` keyed by campaignId) and `PipelineConfigStore` (`pipelines/{campaignId}.json`).

- [ ] **Step 6: Create storage/index.ts**

`createFileStorage(baseDir)` assembles all stores into a single `Storage` object.

- [ ] **Step 7: Run tests**

Run: `cd packages/tui && npx vitest run __tests__/storage.test.ts`
Expected: all tests pass

- [ ] **Step 8: Commit**

```bash
git add src/storage/ __tests__/storage.test.ts
git commit -m "feat(tui): add filesystem storage adapter implementing SDK Storage interface"
```

---

### Task 3: TUI Utilities — RPC + Wallet + Progress

**Files:**
- Create: `packages/tui/src/utils/rpc.ts`
- Create: `packages/tui/src/utils/wallet.ts`
- Create: `packages/tui/src/progress/renderer.ts`

- [ ] **Step 1: Create rpc.ts**

Creates a viem `PublicClient` from an RPC URL. Optionally accepts a chainId to look up chain config from the SDK.

- [ ] **Step 2: Create wallet.ts**

Creates a viem `WalletClient` from a private key hex string and RPC URL.

- [ ] **Step 3: Create progress/renderer.ts**

Returns a `ProgressCallback` that renders scan progress (block counter + percentage), filter results (input → output counts), batch status (✓/✗ per batch), and tx attempt warnings. Uses `process.stderr.write` for carriage-return progress bars, `console.error` for line-based output.

- [ ] **Step 4: Commit**

```bash
git add src/utils/ src/progress/
git commit -m "feat(tui): add RPC client, wallet, and terminal progress renderer"
```

---

### Task 4: CLI Commands — collect, deploy, derive-wallet

**Files:**
- Create: `packages/tui/src/commands/collect.ts`
- Create: `packages/tui/src/commands/deploy.ts`
- Create: `packages/tui/src/commands/derive-wallet.ts`
- Create: `packages/tui/src/index.ts`

- [ ] **Step 1: Create collect command**

`titrate collect` — builds a pipeline from CLI flags, runs it, writes deduplicated addresses to a CSV file. Flags: `--rpc`, `--blocks start:end`, `--extract tx.from|tx.to`, `--filter-contracts`, `--filter-min-balance`, `--exclude-token-recipients`, `--exclude-csv`, `--output`.

- [ ] **Step 2: Create deploy command**

`titrate deploy` — deploys a named distributor contract. Flags: `--name`, `--rpc`, `--variant simple|full`, `--private-key`, `--chain-id`, `--verify`. Outputs JSON with address and txHash.

- [ ] **Step 3: Create derive-wallet command**

`titrate derive-wallet` — derives a hot wallet from a cold key. Signs an EIP-712 message using the cold key, hashes the signature. Flags: `--cold-key`, `--name`, `--funder`, `--version`. Outputs JSON with hotAddress and privateKey.

- [ ] **Step 4: Create index.ts (main entry point)**

Shebang line (`#!/usr/bin/env node`), Commander program with `titrate` name, wires all commands.

- [ ] **Step 5: Verify CLI runs**

```bash
cd packages/tui && npx tsx src/index.ts --help
npx tsx src/index.ts collect --help
npx tsx src/index.ts deploy --help
npx tsx src/index.ts derive-wallet --help
```

- [ ] **Step 6: Commit**

```bash
git add src/commands/ src/index.ts
git commit -m "feat(tui): add collect, deploy, and derive-wallet CLI commands"
```

---

### Task 5: CLI Commands — distribute + run

**Files:**
- Create: `packages/tui/src/commands/distribute.ts`
- Create: `packages/tui/src/commands/run.ts`
- Modify: `packages/tui/src/index.ts`

- [ ] **Step 1: Create distribute command**

`titrate distribute` — reads a CSV of addresses, distributes tokens via the deployed contract. Supports uniform amount (--amount flag) or variable amounts (from CSV column). Handles amount format detection, batching, and progress. Flags: `--contract`, `--token`, `--rpc`, `--addresses`, `--amount`, `--decimals`, `--variant`, `--private-key`, `--from`, `--batch-size`, `--campaign-id`. Outputs BatchResult JSON.

- [ ] **Step 2: Create run command**

`titrate run` — reads a pipeline config JSON file, executes it, writes results. Flags: `--config`, `--rpc`, `--output`.

- [ ] **Step 3: Update index.ts**

Add distribute and run commands.

- [ ] **Step 4: Verify CLI runs**

```bash
npx tsx src/index.ts distribute --help
npx tsx src/index.ts run --help
```

- [ ] **Step 5: Commit**

```bash
git add src/commands/distribute.ts src/commands/run.ts src/index.ts
git commit -m "feat(tui): add distribute and run commands"
```

---

### Task 6: End-to-End Integration Tests

**Files:**
- Create: `packages/tui/__tests__/commands.test.ts`

- [ ] **Step 1: Write e2e tests against Anvil**

Test the CLI by spawning child processes with `execFileSync` (NOT `exec` — avoid shell injection). Use Anvil default account private key. Tests:

1. `titrate --help` shows all commands
2. `titrate deploy --name TestE2E ...` deploys and returns address
3. `titrate derive-wallet ...` returns deterministic hot wallet
4. `titrate derive-wallet` with same args returns same address (determinism)
5. `titrate distribute ...` with a CSV of 2 Anvil addresses distributes native tokens

Use `execFileSync('npx', ['tsx', 'src/index.ts', ...args])` for each test.

- [ ] **Step 2: Run e2e tests (Anvil must be running)**

Run: `cd packages/tui && npx vitest run __tests__/commands.test.ts`
Expected: all tests pass

- [ ] **Step 3: Commit**

```bash
git add __tests__/commands.test.ts
git commit -m "test(tui): add end-to-end CLI tests against Anvil"
```

---

## Pre-flight Checklist

Before starting:
- [ ] Phase 1 + 1B complete, all tests pass
- [ ] Anvil running on port 8545 for e2e tests
- [ ] Node.js >= 18 installed

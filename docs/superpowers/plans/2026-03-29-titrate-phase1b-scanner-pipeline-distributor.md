# Titrate Phase 1B: Scanner, Pipeline & Distributor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the remaining SDK modules — scanner (block/log scanning with dynamic range titration), pipeline (composable set operations), and distributor (contract deployment, verification, batch distribution). All integration tests run against a local Anvil instance.

**Architecture:** Scanner ports patterns from hex-airdrop (dynamic titration, p-limit concurrency, retry with backoff). Pipeline composes sources and filters into a streaming set-operation engine. Distributor wraps contract interactions with gas management, batching, and full attempt logging. All modules accept `onProgress` callbacks and are environment-agnostic.

**Tech Stack:** TypeScript, Viem, Vitest, Anvil (local fork), p-limit

**Spec:** `docs/superpowers/specs/2026-03-29-titrate-design.md`
**Prior plan:** `docs/superpowers/plans/2026-03-29-titrate-phase1-contracts-sdk.md`

---

## File Structure (new files only)

```
packages/sdk/
├── src/
│   ├── utils/
│   │   ├── retry.ts
│   │   └── chunk.ts
│   ├── scanner/
│   │   ├── index.ts
│   │   ├── blocks.ts
│   │   ├── logs.ts
│   │   ├── properties.ts
│   │   └── titrate-range.ts
│   ├── pipeline/
│   │   ├── index.ts
│   │   ├── pipeline.ts
│   │   ├── sources.ts
│   │   └── filters.ts
│   ├── distributor/
│   │   ├── index.ts
│   │   ├── deploy.ts
│   │   ├── verify.ts
│   │   ├── disperse.ts
│   │   ├── allowance.ts
│   │   └── registry.ts
│   └── __tests__/
│       ├── utils.test.ts
│       ├── scanner.test.ts
│       ├── pipeline.test.ts
│       ├── distributor.test.ts
│       └── helpers/
│           └── anvil.ts
```

---

### Task 1: Anvil Test Helpers + Utils

**Files:**
- Create: `packages/sdk/src/__tests__/helpers/anvil.ts`
- Create: `packages/sdk/src/utils/retry.ts`
- Create: `packages/sdk/src/utils/chunk.ts`
- Create: `packages/sdk/src/__tests__/utils.test.ts`

- [ ] **Step 1: Add p-limit dependency**

```bash
cd packages/sdk && npm install p-limit
```

- [ ] **Step 2: Create Anvil test helper**

```typescript
// packages/sdk/src/__tests__/helpers/anvil.ts
import {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  type PublicClient,
  type WalletClient,
  type Address,
  type Hex,
  type Chain,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';

// Anvil default account #0
const ANVIL_PRIVATE_KEY =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const;

export type AnvilContext = {
  readonly rpcUrl: string;
  readonly publicClient: PublicClient;
  readonly walletClient: WalletClient;
  readonly account: { readonly address: Address; readonly privateKey: Hex };
  readonly chain: Chain;
};

export function createAnvilContext(rpcUrl = 'http://127.0.0.1:8545'): AnvilContext {
  const account = privateKeyToAccount(ANVIL_PRIVATE_KEY);

  const publicClient = createPublicClient({
    chain: foundry,
    transport: http(rpcUrl),
  });

  const walletClient = createWalletClient({
    chain: foundry,
    transport: http(rpcUrl),
    account,
  });

  return {
    rpcUrl,
    publicClient,
    walletClient,
    account: { address: account.address, privateKey: ANVIL_PRIVATE_KEY },
    chain: foundry,
  };
}

// Deploy a contract and return its address
export async function deployContract(
  ctx: AnvilContext,
  bytecode: Hex,
  abi: readonly Record<string, unknown>[],
): Promise<Address> {
  const hash = await ctx.walletClient.deployContract({
    abi: abi as any,
    bytecode,
    account: ctx.walletClient.account!,
  });
  const receipt = await ctx.publicClient.waitForTransactionReceipt({ hash });
  if (!receipt.contractAddress) throw new Error('Deploy failed: no contract address');
  return receipt.contractAddress;
}

// Mine N empty blocks (useful for scanner tests)
export async function mineBlocks(ctx: AnvilContext, count: number): Promise<void> {
  for (let i = 0; i < count; i++) {
    await ctx.publicClient.request({ method: 'evm_mine' as any, params: [] });
  }
}

// Send ETH from Anvil account to an address
export async function fundAddress(
  ctx: AnvilContext,
  to: Address,
  amount: bigint,
): Promise<void> {
  const hash = await ctx.walletClient.sendTransaction({
    to,
    value: amount,
    account: ctx.walletClient.account!,
  });
  await ctx.publicClient.waitForTransactionReceipt({ hash });
}
```

- [ ] **Step 3: Write utils tests**

```typescript
// packages/sdk/src/__tests__/utils.test.ts
import { describe, it, expect } from 'vitest';
import { chunk } from '../utils/chunk.js';
import { withRetry } from '../utils/retry.js';

describe('chunk', () => {
  it('splits array into chunks of given size', () => {
    const result = chunk([1, 2, 3, 4, 5], 2);
    expect(result).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('returns single chunk when array is smaller than size', () => {
    expect(chunk([1, 2], 5)).toEqual([[1, 2]]);
  });

  it('returns empty array for empty input', () => {
    expect(chunk([], 3)).toEqual([]);
  });

  it('handles exact division', () => {
    expect(chunk([1, 2, 3, 4], 2)).toEqual([[1, 2], [3, 4]]);
  });
});

describe('withRetry', () => {
  it('returns result on first success', async () => {
    const result = await withRetry(() => Promise.resolve(42), 'test');
    expect(result).toBe(42);
  });

  it('retries on failure then succeeds', async () => {
    let calls = 0;
    const result = await withRetry(
      () => {
        calls++;
        if (calls < 3) throw new Error('fail');
        return Promise.resolve('ok');
      },
      'test',
      { maxRetries: 5, baseDelay: 1 },
    );
    expect(result).toBe('ok');
    expect(calls).toBe(3);
  });

  it('throws after max retries', async () => {
    await expect(
      withRetry(
        () => Promise.reject(new Error('always fail')),
        'test',
        { maxRetries: 2, baseDelay: 1 },
      ),
    ).rejects.toThrow('always fail');
  });
});
```

- [ ] **Step 4: Create chunk.ts**

```typescript
// packages/sdk/src/utils/chunk.ts
export function chunk<T>(array: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}
```

- [ ] **Step 5: Create retry.ts**

```typescript
// packages/sdk/src/utils/retry.ts

const MAX_RETRIES = 10;
const BASE_DELAY_MS = 1_000;
const MAX_DELAY_MS = 60_000;

export type RetryOptions = {
  readonly maxRetries?: number;
  readonly baseDelay?: number;
};

function isRateLimitError(error: unknown): boolean {
  const msg = String(error);
  return msg.includes('429') || msg.includes('rate') || msg.includes('Too Many Requests');
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  { maxRetries = MAX_RETRIES, baseDelay = BASE_DELAY_MS }: RetryOptions = {},
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt > maxRetries) break;

      let delay = Math.min(baseDelay * Math.pow(2, attempt - 1), MAX_DELAY_MS);
      if (isRateLimitError(err)) delay *= 5;
      delay += delay * Math.random() * 0.3;

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
```

- [ ] **Step 6: Run tests**

Run: `cd packages/sdk && npx vitest run src/__tests__/utils.test.ts`
Expected: all tests pass

- [ ] **Step 7: Commit**

```bash
git add src/utils/ src/__tests__/utils.test.ts src/__tests__/helpers/anvil.ts
git commit -m "feat(sdk): add retry, chunk utilities and Anvil test helpers"
```

---

### Task 2: Scanner — Block Scanning

**Files:**
- Create: `packages/sdk/src/scanner/blocks.ts`
- Create: `packages/sdk/src/scanner/titrate-range.ts`
- Create: `packages/sdk/src/scanner/index.ts`
- Create: `packages/sdk/src/__tests__/scanner.test.ts`

- [ ] **Step 1: Write scanner test (Anvil-dependent)**

```typescript
// packages/sdk/src/__tests__/scanner.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { createAnvilContext, mineBlocks, fundAddress, type AnvilContext } from './helpers/anvil.js';
import { scanBlocks, resolveBlockByTimestamp } from '../scanner/index.js';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { parseEther } from 'viem';

describe('scanner (anvil)', () => {
  let ctx: AnvilContext;

  beforeAll(async () => {
    ctx = createAnvilContext();
    // Generate some transactions for scanning
    for (let i = 0; i < 5; i++) {
      const randomAccount = privateKeyToAccount(generatePrivateKey());
      await fundAddress(ctx, randomAccount.address, parseEther('0.01'));
    }
    await mineBlocks(ctx, 3);
  });

  describe('scanBlocks', () => {
    it('extracts from addresses from block transactions', async () => {
      const currentBlock = await ctx.publicClient.getBlockNumber();
      const addresses: string[] = [];

      for await (const batch of scanBlocks(ctx.publicClient, {
        startBlock: 0n,
        endBlock: currentBlock,
        extract: 'tx.from',
      })) {
        addresses.push(...batch);
      }

      expect(addresses.length).toBeGreaterThan(0);
      // Anvil account should appear as a sender
      expect(
        addresses.some((a) => a.toLowerCase() === ctx.account.address.toLowerCase()),
      ).toBe(true);
    });

    it('extracts to addresses from block transactions', async () => {
      const currentBlock = await ctx.publicClient.getBlockNumber();
      const addresses: string[] = [];

      for await (const batch of scanBlocks(ctx.publicClient, {
        startBlock: 0n,
        endBlock: currentBlock,
        extract: 'tx.to',
      })) {
        addresses.push(...batch);
      }

      expect(addresses.length).toBeGreaterThan(0);
    });

    it('respects block range', async () => {
      const currentBlock = await ctx.publicClient.getBlockNumber();
      const addresses: string[] = [];

      // Scan only the last 2 blocks
      for await (const batch of scanBlocks(ctx.publicClient, {
        startBlock: currentBlock - 1n,
        endBlock: currentBlock,
        extract: 'tx.from',
      })) {
        addresses.push(...batch);
      }

      // Should have fewer addresses than full scan
      expect(addresses.length).toBeLessThanOrEqual(10);
    });
  });

  describe('resolveBlockByTimestamp', () => {
    it('returns a block number for a recent timestamp', async () => {
      const block = await ctx.publicClient.getBlock();
      const blockNumber = await resolveBlockByTimestamp(
        ctx.publicClient,
        Number(block.timestamp),
      );
      expect(blockNumber).toBeGreaterThanOrEqual(0n);
    });
  });
});
```

- [ ] **Step 2: Create titrate-range.ts**

```typescript
// packages/sdk/src/scanner/titrate-range.ts

const TARGET_MS = 1_000;
const MIN_RANGE = 50n;
const GROWTH_FACTOR_NUM = 9n;
const GROWTH_FACTOR_DEN = 8n;

export type TitrateState = {
  blockRange: bigint;
};

export function createTitrateState(initialRange = 1_000n): TitrateState {
  return { blockRange: initialRange };
}

export function adjustRange(state: TitrateState, elapsedMs: number): void {
  if (elapsedMs > TARGET_MS) {
    const ratio = BigInt(Math.round((TARGET_MS / elapsedMs) * 100));
    state.blockRange = state.blockRange * ratio / 100n;
  } else {
    state.blockRange = state.blockRange * GROWTH_FACTOR_NUM / GROWTH_FACTOR_DEN;
  }
  if (state.blockRange < MIN_RANGE) state.blockRange = MIN_RANGE;
}

export function shrinkRange(state: TitrateState): void {
  state.blockRange = state.blockRange / 2n;
  if (state.blockRange < MIN_RANGE) state.blockRange = MIN_RANGE;
}

export function isQuerySizeError(error: unknown): boolean {
  const msg = String(error);
  return (
    msg.includes('too many') ||
    msg.includes('exceed') ||
    msg.includes('limit') ||
    msg.includes('Log response size exceeded') ||
    msg.includes('string longer than')
  );
}
```

- [ ] **Step 3: Create blocks.ts**

```typescript
// packages/sdk/src/scanner/blocks.ts
import type { PublicClient, Address } from 'viem';
import type { ProgressCallback } from '../types.js';
import { withRetry } from '../utils/retry.js';

export type BlockRange = {
  readonly startBlock: bigint;
  readonly endBlock: bigint;
};

export type ScanOptions = BlockRange & {
  readonly extract: 'tx.from' | 'tx.to';
  readonly batchSize?: number;
  readonly onProgress?: ProgressCallback;
};

export async function* scanBlocks(
  rpc: PublicClient,
  options: ScanOptions,
): AsyncGenerator<Address[]> {
  const { startBlock, endBlock, extract, batchSize = 100 } = options;
  let current = startBlock;
  let addressesFound = 0;

  while (current <= endBlock) {
    const batchEnd = current + BigInt(batchSize) - 1n > endBlock
      ? endBlock
      : current + BigInt(batchSize) - 1n;

    const addresses: Address[] = [];

    for (let blockNum = current; blockNum <= batchEnd; blockNum++) {
      const block = await withRetry(
        () =>
          rpc.getBlock({ blockNumber: blockNum, includeTransactions: true }),
        `Block ${blockNum}`,
        { maxRetries: 5, baseDelay: 500 },
      );

      for (const tx of block.transactions) {
        if (typeof tx === 'string') continue;
        const addr = extract === 'tx.from' ? tx.from : tx.to;
        if (addr) addresses.push(addr.toLowerCase() as Address);
      }
    }

    addressesFound += addresses.length;
    options.onProgress?.({
      type: 'scan',
      currentBlock: batchEnd,
      endBlock,
      addressesFound,
    });

    if (addresses.length > 0) yield addresses;
    current = batchEnd + 1n;
  }
}

export async function resolveBlockByTimestamp(
  rpc: PublicClient,
  timestamp: number,
): Promise<bigint> {
  const latest = await rpc.getBlock({ blockTag: 'latest' });
  const latestTimestamp = Number(latest.timestamp);

  if (timestamp >= latestTimestamp) return latest.number;

  // Binary search for the block closest to the target timestamp
  let low = 0n;
  let high = latest.number;

  while (low < high) {
    const mid = (low + high) / 2n;
    const block = await withRetry(
      () => rpc.getBlock({ blockNumber: mid }),
      `Block timestamp ${mid}`,
      { maxRetries: 3, baseDelay: 200 },
    );
    if (Number(block.timestamp) < timestamp) {
      low = mid + 1n;
    } else {
      high = mid;
    }
  }

  return low;
}
```

- [ ] **Step 4: Create scanner/logs.ts**

```typescript
// packages/sdk/src/scanner/logs.ts
import type { PublicClient, Address } from 'viem';
import { parseAbiItem } from 'viem';
import type { ProgressCallback } from '../types.js';
import { createTitrateState, adjustRange, shrinkRange, isQuerySizeError } from './titrate-range.js';
import type { BlockRange } from './blocks.js';

const TRANSFER_EVENT = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 value)',
);

export type ScanTransferOptions = BlockRange & {
  readonly onProgress?: ProgressCallback;
};

export async function* scanTransferEvents(
  rpc: PublicClient,
  token: Address,
  options: ScanTransferOptions,
): AsyncGenerator<Address[]> {
  const { startBlock, endBlock } = options;
  const state = createTitrateState(1_000n);
  let fromBlock = startBlock;
  let addressesFound = 0;

  while (fromBlock <= endBlock) {
    const toBlock =
      fromBlock + state.blockRange - 1n > endBlock
        ? endBlock
        : fromBlock + state.blockRange - 1n;

    try {
      const t0 = Date.now();
      const logs = await rpc.getLogs({
        address: token,
        event: TRANSFER_EVENT,
        fromBlock,
        toBlock,
      });
      const elapsed = Date.now() - t0;

      const addresses: Address[] = [];
      for (const log of logs) {
        if (log.args.to) {
          addresses.push(log.args.to.toLowerCase() as Address);
        }
      }

      addressesFound += addresses.length;
      options.onProgress?.({
        type: 'scan',
        currentBlock: toBlock,
        endBlock,
        addressesFound,
      });

      if (addresses.length > 0) yield addresses;

      fromBlock = toBlock + 1n;
      adjustRange(state, elapsed);
    } catch (err) {
      if (isQuerySizeError(err)) {
        shrinkRange(state);
        continue;
      }
      throw err;
    }
  }
}
```

- [ ] **Step 5: Create scanner/properties.ts**

```typescript
// packages/sdk/src/scanner/properties.ts
import type { PublicClient, Address } from 'viem';
import pLimit from 'p-limit';
import { withRetry } from '../utils/retry.js';
import { chunk } from '../utils/chunk.js';
import type { ProgressCallback } from '../types.js';

export type PropertyType = 'balance' | 'code' | 'nonce';

export type AddressProperties = {
  readonly address: Address;
  readonly balance?: bigint;
  readonly isContract?: boolean;
  readonly nonce?: number;
};

export type GetPropertiesOptions = {
  readonly properties: readonly PropertyType[];
  readonly blockNumber?: bigint;
  readonly concurrency?: number;
  readonly onProgress?: ProgressCallback;
};

export async function* getAddressProperties(
  rpc: PublicClient,
  addresses: readonly Address[],
  options: GetPropertiesOptions,
): AsyncGenerator<AddressProperties[]> {
  const { properties, blockNumber, concurrency = 100 } = options;
  const limit = pLimit(concurrency);
  const batches = chunk(addresses, 1_000);
  let processed = 0;

  for (const batch of batches) {
    const results = await Promise.all(
      batch.map((address) =>
        limit(async (): Promise<AddressProperties> => {
          const props: {
            address: Address;
            balance?: bigint;
            isContract?: boolean;
            nonce?: number;
          } = { address };

          const fetchTasks: Promise<void>[] = [];

          if (properties.includes('balance')) {
            fetchTasks.push(
              withRetry(
                () => rpc.getBalance({ address, blockNumber }),
                `Balance ${address.slice(0, 10)}`,
                { maxRetries: 5, baseDelay: 200 },
              ).then((b) => { props.balance = b; }),
            );
          }

          if (properties.includes('code')) {
            fetchTasks.push(
              withRetry(
                () => rpc.getCode({ address, blockNumber }),
                `Code ${address.slice(0, 10)}`,
                { maxRetries: 5, baseDelay: 200 },
              ).then((c) => { props.isContract = c !== undefined && c !== '0x'; }),
            );
          }

          if (properties.includes('nonce')) {
            fetchTasks.push(
              withRetry(
                () => rpc.getTransactionCount({ address, blockNumber }),
                `Nonce ${address.slice(0, 10)}`,
                { maxRetries: 5, baseDelay: 200 },
              ).then((n) => { props.nonce = n; }),
            );
          }

          await Promise.all(fetchTasks);
          return props;
        }),
      ),
    );

    processed += batch.length;
    options.onProgress?.({
      type: 'filter',
      filterName: 'getAddressProperties',
      inputCount: addresses.length,
      outputCount: processed,
    });

    yield results;
  }
}
```

- [ ] **Step 6: Create scanner/index.ts**

```typescript
// packages/sdk/src/scanner/index.ts
export { scanBlocks, resolveBlockByTimestamp } from './blocks.js';
export type { BlockRange, ScanOptions } from './blocks.js';
export { scanTransferEvents } from './logs.js';
export type { ScanTransferOptions } from './logs.js';
export { getAddressProperties } from './properties.js';
export type { PropertyType, AddressProperties, GetPropertiesOptions } from './properties.js';
export { createTitrateState, adjustRange, shrinkRange } from './titrate-range.js';
export type { TitrateState } from './titrate-range.js';
```

- [ ] **Step 7: Start Anvil and run tests**

Anvil must be running for scanner tests. Start it in background:
```bash
anvil &
```

Run: `cd packages/sdk && npx vitest run src/__tests__/scanner.test.ts`
Expected: all tests pass

- [ ] **Step 8: Commit**

```bash
git add src/scanner/ src/__tests__/scanner.test.ts
git commit -m "feat(sdk): add scanner module with block scanning, log titration, and property lookups"
```

---

### Task 3: Pipeline Module

**Files:**
- Create: `packages/sdk/src/pipeline/sources.ts`
- Create: `packages/sdk/src/pipeline/filters.ts`
- Create: `packages/sdk/src/pipeline/pipeline.ts`
- Create: `packages/sdk/src/pipeline/index.ts`
- Create: `packages/sdk/src/__tests__/pipeline.test.ts`

- [ ] **Step 1: Write pipeline tests**

```typescript
// packages/sdk/src/__tests__/pipeline.test.ts
import { describe, it, expect } from 'vitest';
import { createPipeline, deserializePipeline } from '../pipeline/index.js';
import type { PipelineConfig } from '../types.js';

describe('pipeline', () => {
  describe('createPipeline', () => {
    it('creates an empty pipeline', () => {
      const pipeline = createPipeline();
      const config = pipeline.serialize();
      expect(config.steps).toHaveLength(0);
    });

    it('adds a CSV source', () => {
      const pipeline = createPipeline()
        .addSource('csv', { addresses: ['0x1234567890abcdef1234567890abcdef12345678'] });

      const config = pipeline.serialize();
      expect(config.steps).toHaveLength(1);
      expect(config.steps[0].type).toBe('source');
    });

    it('adds filters', () => {
      const pipeline = createPipeline()
        .addSource('csv', { addresses: ['0x1234567890abcdef1234567890abcdef12345678'] })
        .addFilter('contract-check', {})
        .addFilter('min-balance', { minBalance: '0.05' });

      const config = pipeline.serialize();
      expect(config.steps).toHaveLength(3);
      expect(config.steps[1].type).toBe('filter');
      expect(config.steps[2].type).toBe('filter');
    });
  });

  describe('serialization', () => {
    it('round-trips through serialize/deserialize', () => {
      const pipeline = createPipeline()
        .addSource('csv', { addresses: ['0xabc'] })
        .addFilter('min-balance', { minBalance: '1.0' });

      const config = pipeline.serialize();
      const json = JSON.stringify(config);
      const restored = deserializePipeline(JSON.parse(json) as PipelineConfig);
      const restoredConfig = restored.serialize();

      expect(restoredConfig).toEqual(config);
    });
  });

  describe('CSV source execution', () => {
    it('produces address set from CSV addresses', async () => {
      const pipeline = createPipeline()
        .addSource('csv', {
          addresses: [
            '0x1234567890abcdef1234567890abcdef12345678',
            '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
          ],
        });

      const addresses = new Set<string>();
      for await (const batch of pipeline.execute()) {
        for (const addr of batch) addresses.add(addr);
      }

      expect(addresses.size).toBe(2);
    });

    it('deduplicates addresses', async () => {
      const pipeline = createPipeline()
        .addSource('csv', {
          addresses: [
            '0x1234567890abcdef1234567890abcdef12345678',
            '0x1234567890ABCDEF1234567890ABCDEF12345678',
          ],
        });

      const addresses = new Set<string>();
      for await (const batch of pipeline.execute()) {
        for (const addr of batch) addresses.add(addr);
      }

      expect(addresses.size).toBe(1);
    });
  });

  describe('CSV exclusion filter', () => {
    it('removes addresses in exclusion list', async () => {
      const pipeline = createPipeline()
        .addSource('csv', {
          addresses: [
            '0x1234567890abcdef1234567890abcdef12345678',
            '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
            '0x1111111111111111111111111111111111111111',
          ],
        })
        .addFilter('csv-exclusion', {
          addresses: ['0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'],
        });

      const addresses = new Set<string>();
      for await (const batch of pipeline.execute()) {
        for (const addr of batch) addresses.add(addr);
      }

      expect(addresses.size).toBe(2);
      expect(
        addresses.has('0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'),
      ).toBe(false);
    });
  });
});
```

- [ ] **Step 2: Create sources.ts**

```typescript
// packages/sdk/src/pipeline/sources.ts
import type { Address, PublicClient } from 'viem';
import type { SourceType, ProgressCallback } from '../types.js';
import { scanBlocks, type ScanOptions } from '../scanner/blocks.js';

export type SourceParams = Record<string, unknown>;

export type SourceExecutor = (
  rpc?: PublicClient,
  onProgress?: ProgressCallback,
) => AsyncGenerator<Address[]>;

export function createSource(
  sourceType: SourceType,
  params: SourceParams,
): SourceExecutor {
  switch (sourceType) {
    case 'csv':
      return csvSource(params);
    case 'block-scan':
      return blockScanSource(params);
    case 'union':
      return unionSource(params);
    default:
      throw new Error(`Unknown source type: ${sourceType}`);
  }
}

function csvSource(params: SourceParams): SourceExecutor {
  const rawAddresses = params.addresses as string[];
  const seen = new Set<string>();
  const deduped: Address[] = [];

  for (const addr of rawAddresses) {
    const lower = addr.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    deduped.push(lower as Address);
  }

  return async function* () {
    yield deduped;
  };
}

function blockScanSource(params: SourceParams): SourceExecutor {
  return async function* (rpc, onProgress) {
    if (!rpc) throw new Error('block-scan source requires an RPC client');

    const scanOptions: ScanOptions = {
      startBlock: BigInt(params.startBlock as string | number),
      endBlock: BigInt(params.endBlock as string | number),
      extract: (params.extract as 'tx.from' | 'tx.to') ?? 'tx.from',
      batchSize: (params.batchSize as number) ?? 100,
      onProgress,
    };

    yield* scanBlocks(rpc, scanOptions);
  };
}

function unionSource(params: SourceParams): SourceExecutor {
  const sources = params.sources as Array<{ type: SourceType; params: SourceParams }>;

  return async function* (rpc, onProgress) {
    for (const s of sources) {
      const executor = createSource(s.type, s.params);
      yield* executor(rpc, onProgress);
    }
  };
}
```

- [ ] **Step 3: Create filters.ts**

```typescript
// packages/sdk/src/pipeline/filters.ts
import type { Address, PublicClient } from 'viem';
import type { FilterType, ProgressCallback } from '../types.js';
import { getAddressProperties } from '../scanner/properties.js';
import { scanTransferEvents } from '../scanner/logs.js';
import { parseEther } from 'viem';

export type FilterParams = Record<string, unknown>;

export type FilterExecutor = (
  addresses: Set<Address>,
  rpc?: PublicClient,
  onProgress?: ProgressCallback,
) => Promise<Set<Address>>;

export function createFilter(
  filterType: FilterType,
  params: FilterParams,
): FilterExecutor {
  switch (filterType) {
    case 'contract-check':
      return contractCheckFilter();
    case 'min-balance':
      return minBalanceFilter(params);
    case 'nonce-range':
      return nonceRangeFilter(params);
    case 'token-recipients':
      return tokenRecipientsFilter(params);
    case 'csv-exclusion':
      return csvExclusionFilter(params);
    case 'previously-sent':
      return previouslySentFilter(params);
    case 'registry-check':
      return registryCheckFilter(params);
    default:
      throw new Error(`Unknown filter type: ${filterType}`);
  }
}

function contractCheckFilter(): FilterExecutor {
  return async (addresses, rpc, onProgress) => {
    if (!rpc) throw new Error('contract-check filter requires an RPC client');
    const result = new Set<Address>();
    const addressArray = [...addresses];

    for await (const batch of getAddressProperties(rpc, addressArray, {
      properties: ['code'],
      concurrency: 100,
    })) {
      for (const props of batch) {
        if (!props.isContract) result.add(props.address);
      }
    }

    onProgress?.({
      type: 'filter',
      filterName: 'contract-check',
      inputCount: addresses.size,
      outputCount: result.size,
    });
    return result;
  };
}

function minBalanceFilter(params: FilterParams): FilterExecutor {
  const minBalance = parseEther(params.minBalance as string);
  const blockNumber = params.blockNumber ? BigInt(params.blockNumber as string | number) : undefined;

  return async (addresses, rpc, onProgress) => {
    if (!rpc) throw new Error('min-balance filter requires an RPC client');
    const result = new Set<Address>();
    const addressArray = [...addresses];

    for await (const batch of getAddressProperties(rpc, addressArray, {
      properties: ['balance'],
      blockNumber,
      concurrency: 100,
    })) {
      for (const props of batch) {
        if (props.balance !== undefined && props.balance >= minBalance) {
          result.add(props.address);
        }
      }
    }

    onProgress?.({
      type: 'filter',
      filterName: 'min-balance',
      inputCount: addresses.size,
      outputCount: result.size,
    });
    return result;
  };
}

function nonceRangeFilter(params: FilterParams): FilterExecutor {
  const minNonce = (params.minNonce as number) ?? 1;
  const maxNonce = (params.maxNonce as number) ?? 1000;

  return async (addresses, rpc, onProgress) => {
    if (!rpc) throw new Error('nonce-range filter requires an RPC client');
    const result = new Set<Address>();
    const addressArray = [...addresses];

    for await (const batch of getAddressProperties(rpc, addressArray, {
      properties: ['nonce'],
      concurrency: 100,
    })) {
      for (const props of batch) {
        if (props.nonce !== undefined && props.nonce >= minNonce && props.nonce <= maxNonce) {
          result.add(props.address);
        }
      }
    }

    onProgress?.({
      type: 'filter',
      filterName: 'nonce-range',
      inputCount: addresses.size,
      outputCount: result.size,
    });
    return result;
  };
}

function tokenRecipientsFilter(params: FilterParams): FilterExecutor {
  const token = (params.token as string).toLowerCase() as Address;
  const startBlock = BigInt(params.startBlock as string | number);
  const endBlock = BigInt(params.endBlock as string | number);

  return async (addresses, rpc, onProgress) => {
    if (!rpc) throw new Error('token-recipients filter requires an RPC client');
    const recipients = new Set<string>();

    for await (const batch of scanTransferEvents(rpc, token, {
      startBlock,
      endBlock,
      onProgress,
    })) {
      for (const addr of batch) recipients.add(addr.toLowerCase());
    }

    const result = new Set<Address>();
    for (const addr of addresses) {
      if (!recipients.has(addr.toLowerCase())) result.add(addr);
    }

    onProgress?.({
      type: 'filter',
      filterName: 'token-recipients',
      inputCount: addresses.size,
      outputCount: result.size,
    });
    return result;
  };
}

function csvExclusionFilter(params: FilterParams): FilterExecutor {
  const exclusionList = new Set(
    (params.addresses as string[]).map((a) => a.toLowerCase()),
  );

  return async (addresses, _rpc, onProgress) => {
    const result = new Set<Address>();
    for (const addr of addresses) {
      if (!exclusionList.has(addr.toLowerCase())) result.add(addr);
    }
    onProgress?.({
      type: 'filter',
      filterName: 'csv-exclusion',
      inputCount: addresses.size,
      outputCount: result.size,
    });
    return result;
  };
}

function previouslySentFilter(params: FilterParams): FilterExecutor {
  const sentList = new Set(
    (params.addresses as string[]).map((a) => a.toLowerCase()),
  );
  return csvExclusionFilter({ addresses: [...sentList] });
}

function registryCheckFilter(_params: FilterParams): FilterExecutor {
  // Requires distributor module — placeholder that passes through
  return async (addresses, _rpc, onProgress) => {
    onProgress?.({
      type: 'filter',
      filterName: 'registry-check',
      inputCount: addresses.size,
      outputCount: addresses.size,
    });
    return addresses;
  };
}
```

- [ ] **Step 4: Create pipeline.ts**

```typescript
// packages/sdk/src/pipeline/pipeline.ts
import type { Address, PublicClient } from 'viem';
import type { SourceType, FilterType, PipelineConfig, PipelineStep, ProgressCallback } from '../types.js';
import { createSource, type SourceParams } from './sources.js';
import { createFilter, type FilterParams } from './filters.js';

export type Pipeline = {
  addSource(sourceType: SourceType, params: SourceParams): Pipeline;
  addFilter(filterType: FilterType, params: FilterParams): Pipeline;
  serialize(): PipelineConfig;
  execute(rpc?: PublicClient, onProgress?: ProgressCallback): AsyncGenerator<Address[]>;
};

export function createPipeline(config?: PipelineConfig): Pipeline {
  const steps: PipelineStep[] = config ? [...config.steps] : [];

  const pipeline: Pipeline = {
    addSource(sourceType, params) {
      steps.push({ type: 'source', sourceType, params });
      return pipeline;
    },

    addFilter(filterType, params) {
      steps.push({ type: 'filter', filterType, params });
      return pipeline;
    },

    serialize(): PipelineConfig {
      return { steps: [...steps] };
    },

    async *execute(rpc?, onProgress?) {
      // Collect all addresses from sources
      const collected = new Set<Address>();

      for (const step of steps) {
        if (step.type !== 'source') continue;
        const executor = createSource(step.sourceType, step.params);
        for await (const batch of executor(rpc, onProgress)) {
          for (const addr of batch) collected.add(addr.toLowerCase() as Address);
        }
      }

      // Apply filters in order
      let current = collected;
      for (const step of steps) {
        if (step.type !== 'filter') continue;
        const executor = createFilter(step.filterType, step.params);
        current = await executor(current, rpc, onProgress);
      }

      // Yield the final set as a single batch
      yield [...current];
    },
  };

  return pipeline;
}

export function deserializePipeline(config: PipelineConfig): Pipeline {
  return createPipeline(config);
}
```

- [ ] **Step 5: Create pipeline/index.ts**

```typescript
// packages/sdk/src/pipeline/index.ts
export { createPipeline, deserializePipeline } from './pipeline.js';
export type { Pipeline } from './pipeline.js';
export { createSource } from './sources.js';
export { createFilter } from './filters.js';
```

- [ ] **Step 6: Run tests**

Run: `cd packages/sdk && npx vitest run src/__tests__/pipeline.test.ts`
Expected: all tests pass

- [ ] **Step 7: Commit**

```bash
git add src/pipeline/ src/__tests__/pipeline.test.ts
git commit -m "feat(sdk): add composable pipeline module with sources and filters"
```

---

### Task 4: Distributor — Deploy & Verify

**Files:**
- Create: `packages/sdk/src/distributor/deploy.ts`
- Create: `packages/sdk/src/distributor/verify.ts`
- Create: `packages/sdk/src/distributor/index.ts`
- Create: `packages/sdk/src/__tests__/distributor.test.ts`

- [ ] **Step 1: Write deploy/verify tests (Anvil-dependent)**

```typescript
// packages/sdk/src/__tests__/distributor.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { createAnvilContext, type AnvilContext } from './helpers/anvil.js';
import {
  deployDistributor,
  getContractSourceTemplate,
} from '../distributor/index.js';

describe('distributor (anvil)', () => {
  let ctx: AnvilContext;

  beforeAll(() => {
    ctx = createAnvilContext();
  });

  describe('deployDistributor', () => {
    it('deploys a simple contract', async () => {
      const result = await deployDistributor({
        variant: 'simple',
        name: 'TestSimple',
        walletClient: ctx.walletClient,
        publicClient: ctx.publicClient,
      });

      expect(result.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
      expect(result.txHash).toMatch(/^0x[0-9a-fA-F]{64}$/);

      // Verify contract is deployed
      const code = await ctx.publicClient.getCode({ address: result.address });
      expect(code).toBeTruthy();
      expect(code!.length).toBeGreaterThan(2);
    });

    it('deploys a full contract', async () => {
      const result = await deployDistributor({
        variant: 'full',
        name: 'TestFull',
        walletClient: ctx.walletClient,
        publicClient: ctx.publicClient,
      });

      expect(result.address).toMatch(/^0x[0-9a-fA-F]{40}$/);

      const code = await ctx.publicClient.getCode({ address: result.address });
      expect(code).toBeTruthy();
    });
  });

  describe('getContractSourceTemplate', () => {
    it('returns source with placeholder for simple variant', () => {
      const source = getContractSourceTemplate('simple');
      expect(source).toContain('contract TitrateSimple');
    });

    it('returns source with placeholder for full variant', () => {
      const source = getContractSourceTemplate('full');
      expect(source).toContain('contract TitrateFull');
    });
  });
});
```

- [ ] **Step 2: Create deploy.ts**

```typescript
// packages/sdk/src/distributor/deploy.ts
import type { Address, Hex, PublicClient, WalletClient } from 'viem';
import TitrateSimpleArtifact from './artifacts/TitrateSimple.json' with { type: 'json' };
import TitrateFullArtifact from './artifacts/TitrateFull.json' with { type: 'json' };

export type DeployParams = {
  readonly variant: 'simple' | 'full';
  readonly name: string;
  readonly walletClient: WalletClient;
  readonly publicClient: PublicClient;
};

export type DeployResult = {
  readonly address: Address;
  readonly txHash: Hex;
  readonly variant: 'simple' | 'full';
  readonly name: string;
};

function getArtifact(variant: 'simple' | 'full') {
  return variant === 'simple' ? TitrateSimpleArtifact : TitrateFullArtifact;
}

export function getContractSourceTemplate(variant: 'simple' | 'full'): string {
  // In a real implementation, this would read the .sol file from the contracts package.
  // For now, return a marker string that the verify module can string-replace.
  const contractName = variant === 'simple' ? 'TitrateSimple' : 'TitrateFull';
  return `// Source template for ${contractName}\ncontract ${contractName} { /* ... */ }`;
}

export async function deployDistributor(params: DeployParams): Promise<DeployResult> {
  const { variant, name, walletClient, publicClient } = params;
  const artifact = getArtifact(variant);

  const hash = await walletClient.deployContract({
    abi: artifact.abi as any,
    bytecode: artifact.bytecode as Hex,
    account: walletClient.account!,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  if (!receipt.contractAddress) {
    throw new Error(`Contract deployment failed: no address in receipt`);
  }

  return {
    address: receipt.contractAddress,
    txHash: hash,
    variant,
    name,
  };
}
```

- [ ] **Step 3: Create verify.ts**

```typescript
// packages/sdk/src/distributor/verify.ts
import type { Address } from 'viem';
import { getExplorerApiUrl } from '../chains/index.js';
import { getContractSourceTemplate } from './deploy.js';

export type VerifyParams = {
  readonly address: Address;
  readonly name: string;
  readonly variant: 'simple' | 'full';
  readonly chainId: number;
  readonly compilerVersion?: string;
};

export type VerifyResult = {
  readonly success: boolean;
  readonly message: string;
  readonly explorerUrl: string | null;
};

export async function verifyContract(params: VerifyParams): Promise<VerifyResult> {
  const { address, name, variant, chainId, compilerVersion = 'v0.8.28+commit.7893614a' } = params;

  const apiUrl = getExplorerApiUrl(chainId);
  if (!apiUrl) {
    return {
      success: false,
      message: `No explorer API URL configured for chain ${chainId}`,
      explorerUrl: null,
    };
  }

  // Get source template and replace contract name
  const sourceTemplate = getContractSourceTemplate(variant);
  const originalName = variant === 'simple' ? 'TitrateSimple' : 'TitrateFull';
  const customSource = sourceTemplate.replace(
    new RegExp(originalName, 'g'),
    name,
  );

  try {
    const response = await fetch(`${apiUrl}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        module: 'contract',
        action: 'verifysourcecode',
        contractaddress: address,
        sourceCode: customSource,
        codeformat: 'solidity-single-file',
        contractname: name,
        compilerversion: compilerVersion,
        optimizationUsed: '1',
        runs: '200',
      }),
    });

    const data = (await response.json()) as { status: string; result: string; message: string };

    return {
      success: data.status === '1',
      message: data.result || data.message,
      explorerUrl: apiUrl.replace('/api', '') + `/address/${address}`,
    };
  } catch (err) {
    return {
      success: false,
      message: `Verification request failed: ${String(err)}`,
      explorerUrl: null,
    };
  }
}
```

- [ ] **Step 4: Create distributor/index.ts**

```typescript
// packages/sdk/src/distributor/index.ts
export { deployDistributor, getContractSourceTemplate } from './deploy.js';
export type { DeployParams, DeployResult } from './deploy.js';
export { verifyContract } from './verify.js';
export type { VerifyParams, VerifyResult } from './verify.js';
```

- [ ] **Step 5: Run tests (Anvil must be running)**

Run: `cd packages/sdk && npx vitest run src/__tests__/distributor.test.ts`
Expected: all tests pass

- [ ] **Step 6: Commit**

```bash
git add src/distributor/deploy.ts src/distributor/verify.ts src/distributor/index.ts src/__tests__/distributor.test.ts
git commit -m "feat(sdk): add distributor deploy and verify modules"
```

---

### Task 5: Distributor — Disperse, Allowance, Registry

**Files:**
- Create: `packages/sdk/src/distributor/disperse.ts`
- Create: `packages/sdk/src/distributor/allowance.ts`
- Create: `packages/sdk/src/distributor/registry.ts`
- Modify: `packages/sdk/src/distributor/index.ts`
- Modify: `packages/sdk/src/__tests__/distributor.test.ts`

- [ ] **Step 1: Add disperse tests to distributor.test.ts**

Append these tests to the existing `distributor.test.ts`:

```typescript
// Add to imports:
import {
  deployDistributor,
  getContractSourceTemplate,
  disperseTokens,
  disperseTokensSimple,
  approveOperator,
  increaseOperatorAllowance,
  getAllowance,
  checkRecipients,
} from '../distributor/index.js';
import { parseAbi, parseEther, type Address, type Hex } from 'viem';

// Add after existing describe blocks:

describe('disperse (anvil)', () => {
  let ctx: AnvilContext;
  let simpleContract: Address;
  let fullContract: Address;
  let tokenAddress: Address;
  let alice: Address;
  let bob: Address;

  // MockERC20 ABI (minimal)
  const mockERC20ABI = parseAbi([
    'constructor(string name, string symbol, uint8 decimals)',
    'function mint(address to, uint256 amount)',
    'function approve(address spender, uint256 amount) returns (bool)',
    'function balanceOf(address) view returns (uint256)',
  ]);

  // MockERC20 bytecode - deploy from the contracts package artifacts
  // For tests, we'll deploy the mock via raw bytecode

  beforeAll(async () => {
    ctx = createAnvilContext();
    alice = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as Address;
    bob = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC' as Address;

    // Deploy contracts
    const simpleResult = await deployDistributor({
      variant: 'simple',
      name: 'TestSimple',
      walletClient: ctx.walletClient,
      publicClient: ctx.publicClient,
    });
    simpleContract = simpleResult.address;

    const fullResult = await deployDistributor({
      variant: 'full',
      name: 'TestFull',
      walletClient: ctx.walletClient,
      publicClient: ctx.publicClient,
    });
    fullContract = fullResult.address;
  });

  it('disperses native token via simple contract', async () => {
    const results = await disperseTokens({
      contractAddress: simpleContract,
      variant: 'simple',
      token: '0x0000000000000000000000000000000000000000' as Address,
      recipients: [alice, bob],
      amounts: [parseEther('0.1'), parseEther('0.2')],
      walletClient: ctx.walletClient,
      publicClient: ctx.publicClient,
      batchSize: 200,
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].confirmedTxHash).toBeTruthy();

    const aliceBalance = await ctx.publicClient.getBalance({ address: alice });
    expect(aliceBalance).toBeGreaterThanOrEqual(parseEther('0.1'));
  });

  it('disperses uniform native token via simple contract', async () => {
    const results = await disperseTokensSimple({
      contractAddress: simpleContract,
      variant: 'simple',
      token: '0x0000000000000000000000000000000000000000' as Address,
      recipients: [alice, bob],
      amount: parseEther('0.05'),
      walletClient: ctx.walletClient,
      publicClient: ctx.publicClient,
      batchSize: 200,
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].confirmedTxHash).toBeTruthy();
  });
});

describe('allowance (anvil)', () => {
  let ctx: AnvilContext;
  let fullContract: Address;

  beforeAll(async () => {
    ctx = createAnvilContext();
    const result = await deployDistributor({
      variant: 'full',
      name: 'AllowanceTest',
      walletClient: ctx.walletClient,
      publicClient: ctx.publicClient,
    });
    fullContract = result.address;
  });

  it('approves and reads operator allowance', async () => {
    const operator = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as Address;
    // disperseSimple selector: first 4 bytes of keccak256("disperseSimple(address,address,address[],uint256,bytes32)")
    const selector = '0x2bae1e19' as Hex;

    await approveOperator({
      contractAddress: fullContract,
      operator,
      selector,
      amount: 1_000_000n,
      walletClient: ctx.walletClient,
      publicClient: ctx.publicClient,
    });

    const allowance = await getAllowance({
      contractAddress: fullContract,
      owner: ctx.account.address,
      operator,
      selector,
      publicClient: ctx.publicClient,
    });

    expect(allowance).toBe(1_000_000n);
  });

  it('increases operator allowance', async () => {
    const operator = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as Address;
    const selector = '0x2bae1e19' as Hex;

    await increaseOperatorAllowance({
      contractAddress: fullContract,
      operator,
      selector,
      amount: 500_000n,
      walletClient: ctx.walletClient,
      publicClient: ctx.publicClient,
    });

    const allowance = await getAllowance({
      contractAddress: fullContract,
      owner: ctx.account.address,
      operator,
      selector,
      publicClient: ctx.publicClient,
    });

    expect(allowance).toBe(1_500_000n);
  });
});
```

- [ ] **Step 2: Create disperse.ts**

```typescript
// packages/sdk/src/distributor/disperse.ts
import type { Address, Hex, PublicClient, WalletClient } from 'viem';
import type { BatchResult, BatchAttempt, ProgressCallback } from '../types.js';
import { chunk } from '../utils/chunk.js';
import TitrateSimpleArtifact from './artifacts/TitrateSimple.json' with { type: 'json' };
import TitrateFullArtifact from './artifacts/TitrateFull.json' with { type: 'json' };

function getAbi(variant: 'simple' | 'full') {
  return variant === 'simple' ? TitrateSimpleArtifact.abi : TitrateFullArtifact.abi;
}

export type DisperseParams = {
  readonly contractAddress: Address;
  readonly variant: 'simple' | 'full';
  readonly token: Address;
  readonly recipients: readonly Address[];
  readonly amounts: readonly bigint[];
  readonly from?: Address;
  readonly campaignId?: Hex;
  readonly walletClient: WalletClient;
  readonly publicClient: PublicClient;
  readonly batchSize?: number;
  readonly onProgress?: ProgressCallback;
};

export type DisperseSimpleParams = {
  readonly contractAddress: Address;
  readonly variant: 'simple' | 'full';
  readonly token: Address;
  readonly recipients: readonly Address[];
  readonly amount: bigint;
  readonly from?: Address;
  readonly campaignId?: Hex;
  readonly walletClient: WalletClient;
  readonly publicClient: PublicClient;
  readonly batchSize?: number;
  readonly onProgress?: ProgressCallback;
};

const ZERO_BYTES32 = '0x0000000000000000000000000000000000000000000000000000000000000000' as Hex;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Address;

export async function disperseTokens(params: DisperseParams): Promise<BatchResult[]> {
  const {
    contractAddress, variant, token, recipients, amounts,
    from = ZERO_ADDRESS, campaignId = ZERO_BYTES32,
    walletClient, publicClient, batchSize = 200, onProgress,
  } = params;

  const abi = getAbi(variant);
  const isNative = token === ZERO_ADDRESS;
  const recipientBatches = chunk([...recipients], batchSize);
  const amountBatches = chunk([...amounts], batchSize);
  const results: BatchResult[] = [];

  for (let i = 0; i < recipientBatches.length; i++) {
    const batchRecipients = recipientBatches[i];
    const batchAmounts = amountBatches[i];
    const totalValue = isNative
      ? batchAmounts.reduce((sum, a) => sum + a, 0n)
      : 0n;

    onProgress?.({
      type: 'batch',
      batchIndex: i,
      totalBatches: recipientBatches.length,
      status: 'signing',
    });

    const args = variant === 'simple'
      ? [token, batchRecipients, batchAmounts]
      : [token, from, batchRecipients, batchAmounts, campaignId];

    const attempt = await executeBatch({
      contractAddress,
      abi,
      functionName: 'disperse',
      args,
      value: totalValue,
      walletClient,
      publicClient,
    });

    const batchResult: BatchResult = {
      batchIndex: i,
      recipients: batchRecipients,
      amounts: batchAmounts,
      attempts: [attempt],
      confirmedTxHash: attempt.outcome === 'confirmed' ? attempt.txHash : null,
      blockNumber: null,
    };

    results.push(batchResult);

    onProgress?.({
      type: 'batch',
      batchIndex: i,
      totalBatches: recipientBatches.length,
      status: attempt.outcome === 'confirmed' ? 'confirmed' : 'failed',
    });
  }

  return results;
}

export async function disperseTokensSimple(params: DisperseSimpleParams): Promise<BatchResult[]> {
  const {
    contractAddress, variant, token, recipients, amount,
    from = ZERO_ADDRESS, campaignId = ZERO_BYTES32,
    walletClient, publicClient, batchSize = 200, onProgress,
  } = params;

  const abi = getAbi(variant);
  const isNative = token === ZERO_ADDRESS;
  const recipientBatches = chunk([...recipients], batchSize);
  const results: BatchResult[] = [];

  for (let i = 0; i < recipientBatches.length; i++) {
    const batchRecipients = recipientBatches[i];
    const totalValue = isNative ? amount * BigInt(batchRecipients.length) : 0n;

    onProgress?.({
      type: 'batch',
      batchIndex: i,
      totalBatches: recipientBatches.length,
      status: 'signing',
    });

    const args = variant === 'simple'
      ? [token, batchRecipients, amount]
      : [token, from, batchRecipients, amount, campaignId];

    const attempt = await executeBatch({
      contractAddress,
      abi,
      functionName: 'disperseSimple',
      args,
      value: totalValue,
      walletClient,
      publicClient,
    });

    const batchResult: BatchResult = {
      batchIndex: i,
      recipients: batchRecipients,
      amounts: batchRecipients.map(() => amount),
      attempts: [attempt],
      confirmedTxHash: attempt.outcome === 'confirmed' ? attempt.txHash : null,
      blockNumber: null,
    };

    results.push(batchResult);

    onProgress?.({
      type: 'batch',
      batchIndex: i,
      totalBatches: recipientBatches.length,
      status: attempt.outcome === 'confirmed' ? 'confirmed' : 'failed',
    });
  }

  return results;
}

type ExecuteBatchParams = {
  readonly contractAddress: Address;
  readonly abi: readonly Record<string, unknown>[];
  readonly functionName: string;
  readonly args: readonly unknown[];
  readonly value: bigint;
  readonly walletClient: WalletClient;
  readonly publicClient: PublicClient;
};

async function executeBatch(params: ExecuteBatchParams): Promise<BatchAttempt> {
  const { contractAddress, abi, functionName, args, value, walletClient, publicClient } = params;
  const timestamp = Date.now();

  try {
    const gasEstimate = await publicClient.estimateGas({
      to: contractAddress,
      data: '0x' as Hex, // placeholder — viem handles encoding
      value,
      account: walletClient.account!,
    }).catch(() => 500_000n);

    const paddedGas = gasEstimate + gasEstimate / 5n; // 20% padding

    const hash = await walletClient.writeContract({
      address: contractAddress,
      abi: abi as any,
      functionName,
      args: args as any,
      value,
      gas: paddedGas,
      account: walletClient.account!,
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    return {
      txHash: hash,
      nonce: 0, // simplified — full nonce tracking in production
      gasEstimate: paddedGas,
      maxFeePerGas: 0n,
      maxPriorityFeePerGas: 0n,
      timestamp,
      outcome: receipt.status === 'success' ? 'confirmed' : 'reverted',
    };
  } catch (err) {
    return {
      txHash: '0x' as Hex,
      nonce: 0,
      gasEstimate: 0n,
      maxFeePerGas: 0n,
      maxPriorityFeePerGas: 0n,
      timestamp,
      outcome: 'dropped',
    };
  }
}
```

- [ ] **Step 3: Create allowance.ts**

```typescript
// packages/sdk/src/distributor/allowance.ts
import type { Address, Hex, PublicClient, WalletClient } from 'viem';
import TitrateFullArtifact from './artifacts/TitrateFull.json' with { type: 'json' };

const fullAbi = TitrateFullArtifact.abi as any;

export type ApproveOperatorParams = {
  readonly contractAddress: Address;
  readonly operator: Address;
  readonly selector: Hex;
  readonly amount: bigint;
  readonly walletClient: WalletClient;
  readonly publicClient: PublicClient;
};

export async function approveOperator(params: ApproveOperatorParams): Promise<Hex> {
  const { contractAddress, operator, selector, amount, walletClient, publicClient } = params;

  const hash = await walletClient.writeContract({
    address: contractAddress,
    abi: fullAbi,
    functionName: 'approve',
    args: [operator, selector, amount],
    account: walletClient.account!,
  });

  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

export type IncreaseAllowanceParams = ApproveOperatorParams;

export async function increaseOperatorAllowance(params: IncreaseAllowanceParams): Promise<Hex> {
  const { contractAddress, operator, selector, amount, walletClient, publicClient } = params;

  const hash = await walletClient.writeContract({
    address: contractAddress,
    abi: fullAbi,
    functionName: 'increaseAllowance',
    args: [operator, selector, amount],
    account: walletClient.account!,
  });

  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

export type GetAllowanceParams = {
  readonly contractAddress: Address;
  readonly owner: Address;
  readonly operator: Address;
  readonly selector: Hex;
  readonly publicClient: PublicClient;
};

export async function getAllowance(params: GetAllowanceParams): Promise<bigint> {
  const { contractAddress, owner, operator, selector, publicClient } = params;

  return publicClient.readContract({
    address: contractAddress,
    abi: fullAbi,
    functionName: 'allowance',
    args: [owner, operator, selector],
  }) as Promise<bigint>;
}
```

- [ ] **Step 4: Create registry.ts**

```typescript
// packages/sdk/src/distributor/registry.ts
import type { Address, Hex, PublicClient } from 'viem';
import TitrateFullArtifact from './artifacts/TitrateFull.json' with { type: 'json' };

const fullAbi = TitrateFullArtifact.abi as any;

export type CheckRecipientsParams = {
  readonly contractAddress: Address;
  readonly distributor: Address;
  readonly campaignId: Hex;
  readonly recipients: readonly Address[];
  readonly publicClient: PublicClient;
};

export async function checkRecipients(params: CheckRecipientsParams): Promise<boolean[]> {
  const { contractAddress, distributor, campaignId, recipients, publicClient } = params;

  const result = await publicClient.readContract({
    address: contractAddress,
    abi: fullAbi,
    functionName: 'checkRecipients',
    args: [distributor, campaignId, recipients],
  });

  return result as boolean[];
}
```

- [ ] **Step 5: Update distributor/index.ts**

```typescript
// packages/sdk/src/distributor/index.ts
export { deployDistributor, getContractSourceTemplate } from './deploy.js';
export type { DeployParams, DeployResult } from './deploy.js';
export { verifyContract } from './verify.js';
export type { VerifyParams, VerifyResult } from './verify.js';
export { disperseTokens, disperseTokensSimple } from './disperse.js';
export type { DisperseParams, DisperseSimpleParams } from './disperse.js';
export { approveOperator, increaseOperatorAllowance, getAllowance } from './allowance.js';
export type { ApproveOperatorParams, IncreaseAllowanceParams, GetAllowanceParams } from './allowance.js';
export { checkRecipients } from './registry.js';
export type { CheckRecipientsParams } from './registry.js';
```

- [ ] **Step 6: Run tests (Anvil must be running)**

Run: `cd packages/sdk && npx vitest run src/__tests__/distributor.test.ts`
Expected: all tests pass

- [ ] **Step 7: Commit**

```bash
git add src/distributor/ src/__tests__/distributor.test.ts
git commit -m "feat(sdk): add distributor disperse, allowance, and registry modules"
```

---

### Task 6: Update SDK Barrel Export

**Files:**
- Modify: `packages/sdk/src/index.ts`

- [ ] **Step 1: Update index.ts with new module exports**

Add to the existing barrel export:

```typescript
// Utils
export { chunk } from './utils/chunk.js';
export { withRetry } from './utils/retry.js';
export type { RetryOptions } from './utils/retry.js';

// Scanner
export { scanBlocks, resolveBlockByTimestamp, scanTransferEvents, getAddressProperties } from './scanner/index.js';
export type { BlockRange, ScanOptions, ScanTransferOptions, PropertyType, AddressProperties, GetPropertiesOptions, TitrateState } from './scanner/index.js';

// Pipeline
export { createPipeline, deserializePipeline } from './pipeline/index.js';
export type { Pipeline } from './pipeline/index.js';

// Distributor
export { deployDistributor, getContractSourceTemplate, verifyContract, disperseTokens, disperseTokensSimple, approveOperator, increaseOperatorAllowance, getAllowance, checkRecipients } from './distributor/index.js';
export type { DeployParams, DeployResult, VerifyParams, VerifyResult, DisperseParams, DisperseSimpleParams, ApproveOperatorParams, IncreaseAllowanceParams, GetAllowanceParams, CheckRecipientsParams } from './distributor/index.js';
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd packages/sdk && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Run all SDK tests**

Run: `cd packages/sdk && npx vitest run`
Expected: all tests pass (utils + chains + csv + wallet + encode + scanner + pipeline + distributor)

- [ ] **Step 4: Commit**

```bash
git add src/index.ts
git commit -m "feat(sdk): export scanner, pipeline, and distributor modules from barrel"
```

---

## Pre-flight Checklist

Before starting:
- [ ] Anvil is installed and can be started (`anvil --version`)
- [ ] Phase 1 tasks are complete (monorepo scaffold, contracts, SDK base modules)
- [ ] All Phase 1 tests pass: `forge test` and `npx vitest run`
- [ ] Start Anvil before running integration tests: `anvil &`

## Notes

- Scanner tests require Anvil running on port 8545
- Distributor tests require Anvil running on port 8545
- Pipeline tests for CSV sources and CSV exclusion filters run without Anvil
- Pipeline tests for block-scan sources and on-chain filters require Anvil
- The `registry-check` filter is a passthrough placeholder until the distributor module provides `checkRecipients` integration — wiring them together is a follow-up task

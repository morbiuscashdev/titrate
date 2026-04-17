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
      manifest: { batchSize: 10 } as never,
      bus, control,
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
      bus, control,
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

    filterDone = true;
    bus.emit('filter-progressed');
    await new Promise<void>((resolve) => bus.on('completed', () => resolve()));

    expect(disperseMock).toHaveBeenCalledTimes(1);
    await rm(dir, { recursive: true });
  });
});

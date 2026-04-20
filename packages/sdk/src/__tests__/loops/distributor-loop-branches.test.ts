import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Address, Hex, PublicClient } from 'viem';
import { createEventBus } from '../../pipeline/loops/event-bus.js';
import { createControlSignal } from '../../pipeline/loops/control-signal.js';
import { DEFAULT_STAGE_CONTROL } from '../../types.js';
import type {
  BatchAttempt,
  CampaignManifest,
  LoopErrorEntry,
} from '../../types.js';
import type { BatchRecord } from '../../storage/index.js';
import {
  createMemoryAddresses,
  createMemoryBatches,
  createMemoryCursor,
  createMemoryErrors,
  type MemoryRow,
} from './memory-storage.js';

// ---------------------------------------------------------------------------
// Hoisted reconcile mock — the driver calls reconcileBatches on start.
// Default behaviour: return no decisions so existing tests behave identically.
// Individual tests call `reconcileFakes.reconcileBatches.mockResolvedValue(...)`
// to steer the intervention / confirmed paths.
// ---------------------------------------------------------------------------

const reconcileFakes = vi.hoisted(() => ({
  reconcileBatches: vi.fn(async () => [] as unknown[]),
}));

vi.mock('../../pipeline/loops/reconcile.js', () => ({
  reconcileBatches: reconcileFakes.reconcileBatches,
}));

const { createDistributorLoop } = await import(
  '../../pipeline/loops/distributor-loop.js'
);

// ---------------------------------------------------------------------------

const W1 = '0x1111111111111111111111111111111111111111' as Address;
const W2 = '0x2222222222222222222222222222222222222222' as Address;
const R1 = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Address;
const R2 = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Address;
const TX_HASH: Hex =
  '0x1111111111111111111111111111111111111111111111111111111111111111';

const manifest: CampaignManifest = { id: 'c1', batchSize: 10 } as never;

function confirmedAttempt(overrides: Partial<BatchAttempt> = {}): BatchAttempt {
  return {
    txHash: TX_HASH,
    nonce: 0,
    gasEstimate: 21000n,
    maxFeePerGas: 1n,
    maxPriorityFeePerGas: 1n,
    timestamp: Date.now(),
    outcome: 'confirmed',
    ...overrides,
  } as BatchAttempt;
}

function droppedAttempt(): BatchAttempt {
  return {
    txHash: TX_HASH,
    nonce: 0,
    gasEstimate: 21000n,
    maxFeePerGas: 1n,
    maxPriorityFeePerGas: 1n,
    timestamp: Date.now(),
    outcome: 'dropped',
  } as BatchAttempt;
}

type Harness = {
  addresses: ReturnType<typeof createMemoryAddresses>;
  filtered: ReturnType<typeof createMemoryAddresses>;
  batches: ReturnType<typeof createMemoryBatches>;
  cursor: ReturnType<typeof createMemoryCursor>;
  errors: ReturnType<typeof createMemoryErrors>;
};

function fixture(rows: readonly MemoryRow[] = [], initial?: {
  filtered?: { watermark?: number; qualifiedCount: number };
  distribute?: { watermark: number };
}): Harness {
  const addresses = createMemoryAddresses();
  const batches = createMemoryBatches();
  const cursor = createMemoryCursor({
    scan: { lastBlock: 100n, addressCount: rows.length },
    filter: {
      watermark: initial?.filtered?.watermark ?? rows.length,
      qualifiedCount: initial?.filtered?.qualifiedCount ?? rows.length,
    },
    distribute: {
      watermark: initial?.distribute?.watermark ?? 0,
      confirmedCount: 0,
    },
  });
  const errors = createMemoryErrors();
  // `addresses` and `filtered` share the same shape in the distributor; tests
  // that care about post-filter rows pre-seed `addresses` and pass it as
  // `filtered` via a { ...h, filtered: h.addresses } override.
  return { addresses, filtered: addresses, batches, cursor, errors };
}

const stubPublicClient = {} as unknown as PublicClient;

beforeEach(() => {
  reconcileFakes.reconcileBatches.mockReset();
  reconcileFakes.reconcileBatches.mockResolvedValue([]);
});

async function untilEvent(
  bus: ReturnType<typeof createEventBus>,
  event: string,
  ms = 2000,
): Promise<void> {
  return await Promise.race([
    new Promise<void>((resolve) => bus.on(event as never, () => resolve())),
    new Promise<void>((_, reject) =>
      setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), ms),
    ),
  ]);
}

// ---------------------------------------------------------------------------
// Reconciliation branches
// ---------------------------------------------------------------------------

describe('distributor-loop — reconciliation', () => {
  it('writes a confirmed status update when reconcile returns { kind: confirmed }', async () => {
    const h = fixture();
    // Seed a broadcast batch so the confirmed-write branch has something to find.
    await h.batches.append([
      {
        batchIndex: 0,
        recipients: [R1],
        amounts: ['1'],
        status: 'broadcast',
        attempts: [
          {
            txHash: TX_HASH,
            nonce: 0,
            maxFeePerGas: '0',
            maxPriorityFeePerGas: '0',
            broadcastAt: 0,
            outcome: 'pending',
            confirmedBlock: null,
          },
        ],
        confirmedTxHash: null,
        confirmedBlock: null,
        createdAt: 0,
      } satisfies BatchRecord,
    ]);
    await h.cursor.update({
      filter: { watermark: 1, qualifiedCount: 1 },
      distribute: { watermark: 1, confirmedCount: 0 },
    });

    reconcileFakes.reconcileBatches.mockResolvedValueOnce([
      {
        kind: 'confirmed',
        batchIndex: 0,
        txHash: TX_HASH,
        blockNumber: 42n,
      },
    ]);

    const bus = createEventBus();
    const control = createControlSignal(DEFAULT_STAGE_CONTROL);
    const loop = createDistributorLoop({
      publicClient: stubPublicClient,
      storage: h,
      walletPool: [W1],
      manifest,
      bus,
      control,
      scannerCompleted: () => true,
      filterCompleted: () => true,
      disperse: vi.fn(),
      interventionHook: vi.fn(),
      getBalances: async () => new Map([[W1, 10n ** 18n]]),
    });

    await loop.start();
    await untilEvent(bus, 'completed');

    const all = await h.batches.readAll();
    const confirmedRecord = all.find(
      (b) => b.status === 'confirmed' && b.batchIndex === 0,
    );
    expect(confirmedRecord?.confirmedTxHash).toBe(TX_HASH);
    expect(confirmedRecord?.confirmedBlock).toBe('42');
  });

  it('skips confirmed writes when the batchIndex is unknown', async () => {
    const h = fixture();
    await h.cursor.update({
      filter: { watermark: 0, qualifiedCount: 0 },
      distribute: { watermark: 0, confirmedCount: 0 },
    });

    reconcileFakes.reconcileBatches.mockResolvedValueOnce([
      { kind: 'confirmed', batchIndex: 99, txHash: TX_HASH, blockNumber: 1n },
    ]);

    const bus = createEventBus();
    const control = createControlSignal(DEFAULT_STAGE_CONTROL);
    const loop = createDistributorLoop({
      publicClient: stubPublicClient,
      storage: h,
      walletPool: [W1],
      manifest,
      bus,
      control,
      scannerCompleted: () => true,
      filterCompleted: () => true,
      disperse: vi.fn(),
      interventionHook: vi.fn(),
      getBalances: async () => new Map([[W1, 10n ** 18n]]),
    });

    await loop.start();
    await untilEvent(bus, 'completed');

    expect((await h.batches.readAll()).length).toBe(0);
  });

  it('calls the interventionHook with context when reconcile returns { kind: intervention }', async () => {
    const h = fixture();
    await h.cursor.update({
      filter: { watermark: 0, qualifiedCount: 0 },
      distribute: { watermark: 0, confirmedCount: 0 },
    });

    reconcileFakes.reconcileBatches.mockResolvedValueOnce([
      {
        kind: 'intervention',
        batchIndex: 7,
        point: 'reconcile-reverted',
        txHash: TX_HASH,
      },
    ]);

    const interventionHook = vi.fn(async () => ({ type: 'approve' as const }));
    const bus = createEventBus();
    const control = createControlSignal(DEFAULT_STAGE_CONTROL);
    const loop = createDistributorLoop({
      publicClient: stubPublicClient,
      storage: h,
      walletPool: [W1],
      manifest,
      bus,
      control,
      scannerCompleted: () => true,
      filterCompleted: () => true,
      disperse: vi.fn(),
      interventionHook,
      getBalances: async () => new Map([[W1, 10n ** 18n]]),
    });

    await loop.start();
    await untilEvent(bus, 'completed');

    expect(interventionHook).toHaveBeenCalledTimes(1);
    expect(interventionHook).toHaveBeenCalledWith({
      point: 'reconcile-reverted',
      campaignId: 'c1',
      batchIndex: 7,
      txHash: TX_HASH,
    });
  });

  it('substitutes an empty campaignId when manifest.id is missing', async () => {
    const h = fixture();
    await h.cursor.update({
      filter: { watermark: 0, qualifiedCount: 0 },
      distribute: { watermark: 0, confirmedCount: 0 },
    });

    reconcileFakes.reconcileBatches.mockResolvedValueOnce([
      {
        kind: 'intervention',
        batchIndex: 0,
        point: 'reconcile-dropped',
        txHash: TX_HASH,
      },
    ]);

    const interventionHook = vi.fn(async () => ({ type: 'approve' as const }));
    const bus = createEventBus();
    const control = createControlSignal(DEFAULT_STAGE_CONTROL);
    const loop = createDistributorLoop({
      publicClient: stubPublicClient,
      storage: h,
      walletPool: [W1],
      manifest: { batchSize: 10 } as CampaignManifest,
      bus,
      control,
      scannerCompleted: () => true,
      filterCompleted: () => true,
      disperse: vi.fn(),
      interventionHook,
      getBalances: async () => new Map([[W1, 10n ** 18n]]),
    });

    await loop.start();
    await untilEvent(bus, 'completed');

    const call = interventionHook.mock.calls[0] as unknown as [
      { campaignId: string },
    ];
    expect(call[0].campaignId).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Distribution branches
// ---------------------------------------------------------------------------

describe('distributor-loop — distribute branches', () => {
  it('flushes a partial batch when scanner+filter are done and available < batchSize', async () => {
    const rows = [{ address: R1, amount: '1' }];
    const h = fixture(rows, {
      filtered: { qualifiedCount: 1 },
      distribute: { watermark: 0 },
    });
    // Pre-populate addresses store so buildBatch can read them.
    await h.addresses.append(rows);
    // Override filtered.readFrom to drain from our memory addresses store.
    const storage = {
      ...h,
      filtered: h.addresses,
    };

    const disperse = vi.fn().mockResolvedValue(confirmedAttempt());
    const bus = createEventBus();
    const control = createControlSignal(DEFAULT_STAGE_CONTROL);
    const loop = createDistributorLoop({
      publicClient: stubPublicClient,
      storage,
      walletPool: [W1],
      manifest: { id: 'c1', batchSize: 100 } as never,
      bus,
      control,
      scannerCompleted: () => true,
      filterCompleted: () => true,
      disperse,
      interventionHook: vi.fn(),
      getBalances: async () => new Map([[W1, 10n ** 18n]]),
    });

    await loop.start();
    await untilEvent(bus, 'completed');

    expect(disperse).toHaveBeenCalledTimes(1);
    const call = disperse.mock.calls[0][0] as {
      recipients: Address[];
      amounts: bigint[];
    };
    expect(call.recipients).toEqual([R1]);
    expect(call.amounts).toEqual([1n]);
  });

  it('coerces null amounts to 0n when building a batch', async () => {
    const rows = [{ address: R1, amount: null }];
    const h = fixture(rows, { filtered: { qualifiedCount: 1 } });
    await h.addresses.append(rows);
    const storage = { ...h, filtered: h.addresses };

    const disperse = vi.fn().mockResolvedValue(confirmedAttempt());
    const bus = createEventBus();
    const control = createControlSignal(DEFAULT_STAGE_CONTROL);
    const loop = createDistributorLoop({
      publicClient: stubPublicClient,
      storage,
      walletPool: [W1],
      manifest: { id: 'c1', batchSize: 1 } as never,
      bus,
      control,
      scannerCompleted: () => true,
      filterCompleted: () => true,
      disperse,
      interventionHook: vi.fn(),
      getBalances: async () => new Map([[W1, 10n ** 18n]]),
    });

    await loop.start();
    await untilEvent(bus, 'completed');

    const call = disperse.mock.calls[0][0] as { amounts: bigint[] };
    expect(call.amounts).toEqual([0n]);
  });

  it('errors + emits errored when no wallet has sufficient balance', async () => {
    const rows = [{ address: R1, amount: '1' }];
    const h = fixture(rows, { filtered: { qualifiedCount: 1 } });
    await h.addresses.append(rows);
    const storage = { ...h, filtered: h.addresses };

    const bus = createEventBus();
    const control = createControlSignal(DEFAULT_STAGE_CONTROL);
    const loop = createDistributorLoop({
      publicClient: stubPublicClient,
      storage,
      walletPool: [W1],
      manifest: { id: 'c1', batchSize: 1 } as never,
      bus,
      control,
      scannerCompleted: () => true,
      filterCompleted: () => true,
      disperse: vi.fn(),
      interventionHook: vi.fn(),
      getBalances: async () => new Map([[W1, 0n]]),
      minWalletBalance: 10n ** 15n,
    });

    let errored = false;
    bus.on('errored', () => {
      errored = true;
    });
    await loop.start();
    await untilEvent(bus, 'errored');

    expect(errored).toBe(true);
    expect(loop.status()).toBe('errored');
    const errors = await (h.errors as unknown as {
      readAll: () => Promise<readonly LoopErrorEntry[]>;
    }).readAll();
    expect(errors[0]).toMatchObject({
      loop: 'distributor',
      phase: 'select-wallet',
      message: 'no wallet has sufficient balance',
    });
  });

  it('errors when disperse throws, capturing message + stack', async () => {
    const rows = [{ address: R1, amount: '1' }];
    const h = fixture(rows, { filtered: { qualifiedCount: 1 } });
    await h.addresses.append(rows);
    const storage = { ...h, filtered: h.addresses };

    const boom = new Error('disperse exploded');
    const disperse = vi.fn().mockRejectedValue(boom);
    const bus = createEventBus();
    const control = createControlSignal(DEFAULT_STAGE_CONTROL);
    const loop = createDistributorLoop({
      publicClient: stubPublicClient,
      storage,
      walletPool: [W1],
      manifest: { id: 'c1', batchSize: 1 } as never,
      bus,
      control,
      scannerCompleted: () => true,
      filterCompleted: () => true,
      disperse,
      interventionHook: vi.fn(),
      getBalances: async () => new Map([[W1, 10n ** 18n]]),
    });

    await loop.start();
    await untilEvent(bus, 'errored');

    const errors = await (h.errors as unknown as {
      readAll: () => Promise<readonly LoopErrorEntry[]>;
    }).readAll();
    expect(errors[0]).toMatchObject({
      loop: 'distributor',
      phase: 'disperse',
      message: 'disperse exploded',
    });
    expect(errors[0].stack).toBe(boom.stack);
  });

  it('errors when an attempt returns outcome=dropped', async () => {
    const rows = [{ address: R1, amount: '1' }];
    const h = fixture(rows, { filtered: { qualifiedCount: 1 } });
    await h.addresses.append(rows);
    const storage = { ...h, filtered: h.addresses };

    const disperse = vi.fn().mockResolvedValue(droppedAttempt());
    const bus = createEventBus();
    const control = createControlSignal(DEFAULT_STAGE_CONTROL);
    const loop = createDistributorLoop({
      publicClient: stubPublicClient,
      storage,
      walletPool: [W1],
      manifest: { id: 'c1', batchSize: 1 } as never,
      bus,
      control,
      scannerCompleted: () => true,
      filterCompleted: () => true,
      disperse,
      interventionHook: vi.fn(),
      getBalances: async () => new Map([[W1, 10n ** 18n]]),
    });

    await loop.start();
    await untilEvent(bus, 'errored');

    expect(loop.status()).toBe('errored');
    const errors = await (h.errors as unknown as {
      readAll: () => Promise<readonly LoopErrorEntry[]>;
    }).readAll();
    expect(errors[0]).toMatchObject({
      loop: 'distributor',
      phase: 'disperse',
      message: 'attempt returned outcome=dropped',
    });
  });

  it('round-robins across wallets via lastIndex', async () => {
    const rows = [
      { address: R1, amount: '1' },
      { address: R2, amount: '1' },
    ];
    const h = fixture(rows, { filtered: { qualifiedCount: 2 } });
    await h.addresses.append(rows);
    const storage = { ...h, filtered: h.addresses };

    const disperse = vi.fn().mockResolvedValue(confirmedAttempt());
    const bus = createEventBus();
    const control = createControlSignal(DEFAULT_STAGE_CONTROL);
    const loop = createDistributorLoop({
      publicClient: stubPublicClient,
      storage,
      walletPool: [W1, W2],
      manifest: { id: 'c1', batchSize: 1 } as never,
      bus,
      control,
      scannerCompleted: () => true,
      filterCompleted: () => true,
      disperse,
      interventionHook: vi.fn(),
      getBalances: async () =>
        new Map([
          [W1, 10n ** 18n],
          [W2, 10n ** 18n],
        ]),
    });

    await loop.start();
    await untilEvent(bus, 'completed');

    expect(disperse).toHaveBeenCalledTimes(2);
    const w1 = (disperse.mock.calls[0][0] as { wallet: Address }).wallet;
    const w2 = (disperse.mock.calls[1][0] as { wallet: Address }).wallet;
    expect([w1, w2]).toEqual([W1, W2]);
  });

  it('tracks confirmedCount only when attempts are confirmed', async () => {
    const rows = [{ address: R1, amount: '5' }];
    const h = fixture(rows, { filtered: { qualifiedCount: 1 } });
    await h.addresses.append(rows);
    const storage = { ...h, filtered: h.addresses };

    const disperse = vi.fn().mockResolvedValue({
      ...confirmedAttempt(),
      outcome: 'pending',
    } as BatchAttempt);
    const bus = createEventBus();
    const control = createControlSignal(DEFAULT_STAGE_CONTROL);
    const loop = createDistributorLoop({
      publicClient: stubPublicClient,
      storage,
      walletPool: [W1],
      manifest: { id: 'c1', batchSize: 1 } as never,
      bus,
      control,
      scannerCompleted: () => true,
      filterCompleted: () => false, // keep driver parked after advance
      disperse,
      interventionHook: vi.fn(),
      getBalances: async () => new Map([[W1, 10n ** 18n]]),
    });

    let progressed = false;
    bus.on('distribute-progressed', () => {
      progressed = true;
    });
    await loop.start();
    // Wait for the driver to advance once.
    await new Promise((r) => setTimeout(r, 20));
    expect(progressed).toBe(true);

    const finalCursor = await h.cursor.read();
    expect(finalCursor.distribute.watermark).toBe(1);
    expect(finalCursor.distribute.confirmedCount).toBe(0);

    // Unpark driver so stop() can unwind.
    bus.emit('pipeline-changed');
    await loop.stop();
  });
});

// ---------------------------------------------------------------------------
// Pause / resume + lifecycle
// ---------------------------------------------------------------------------

describe('distributor-loop — lifecycle', () => {
  it('parks in paused status while control.distribute=paused, then resumes', async () => {
    const rows = [{ address: R1, amount: '1' }];
    const h = fixture(rows, { filtered: { qualifiedCount: 1 } });
    await h.addresses.append(rows);
    const storage = { ...h, filtered: h.addresses };

    const disperse = vi.fn().mockResolvedValue(confirmedAttempt());
    const bus = createEventBus();
    const control = createControlSignal({
      ...DEFAULT_STAGE_CONTROL,
      distribute: 'paused',
    });
    const loop = createDistributorLoop({
      publicClient: stubPublicClient,
      storage,
      walletPool: [W1],
      manifest: { id: 'c1', batchSize: 1 } as never,
      bus,
      control,
      scannerCompleted: () => true,
      filterCompleted: () => true,
      disperse,
      interventionHook: vi.fn(),
      getBalances: async () => new Map([[W1, 10n ** 18n]]),
    });

    await loop.start();
    // Give the driver a tick to reach the paused check.
    await new Promise((r) => setTimeout(r, 15));
    expect(loop.status()).toBe('paused');
    expect(disperse).not.toHaveBeenCalled();

    // Resume.
    await control.update({ ...DEFAULT_STAGE_CONTROL, distribute: 'running' });
    await untilEvent(bus, 'completed');
    expect(disperse).toHaveBeenCalledTimes(1);
  });

  it('stop() while paused unparks the driver and returns to idle', async () => {
    const h = fixture();
    const bus = createEventBus();
    const control = createControlSignal({
      ...DEFAULT_STAGE_CONTROL,
      distribute: 'paused',
    });

    const loop = createDistributorLoop({
      publicClient: stubPublicClient,
      storage: h,
      walletPool: [W1],
      manifest,
      bus,
      control,
      scannerCompleted: () => true,
      filterCompleted: () => true,
      disperse: vi.fn(),
      interventionHook: vi.fn(),
      getBalances: async () => new Map([[W1, 10n ** 18n]]),
    });

    await loop.start();
    await new Promise((r) => setTimeout(r, 15));
    expect(loop.status()).toBe('paused');

    const stopPromise = loop.stop();
    // Resume unblocks waitForResume so the driver can re-check stopping.
    await control.update({ ...DEFAULT_STAGE_CONTROL, distribute: 'running' });
    await stopPromise;

    expect(loop.status()).toBe('idle');
  });

  it('start() twice is a no-op', async () => {
    const h = fixture();
    const bus = createEventBus();
    const control = createControlSignal(DEFAULT_STAGE_CONTROL);
    const loop = createDistributorLoop({
      publicClient: stubPublicClient,
      storage: h,
      walletPool: [W1],
      manifest,
      bus,
      control,
      scannerCompleted: () => true,
      filterCompleted: () => true,
      disperse: vi.fn(),
      interventionHook: vi.fn(),
      getBalances: async () => new Map([[W1, 10n ** 18n]]),
    });

    await loop.start();
    await loop.start(); // must not throw or restart
    await untilEvent(bus, 'completed');
    expect(loop.status()).toBe('completed');
  });

  it('on() delegates to the event bus', async () => {
    const bus = createEventBus();
    const control = createControlSignal(DEFAULT_STAGE_CONTROL);
    const loop = createDistributorLoop({
      publicClient: stubPublicClient,
      storage: fixture(),
      walletPool: [W1],
      manifest,
      bus,
      control,
      scannerCompleted: () => true,
      filterCompleted: () => true,
      disperse: vi.fn(),
      interventionHook: vi.fn(),
      getBalances: async () => new Map([[W1, 10n ** 18n]]),
    });

    let seen = 0;
    loop.on('distribute-progressed', () => {
      seen++;
    });
    bus.emit('distribute-progressed');
    expect(seen).toBe(1);
  });

  it('catches driver throws and resets status to idle via finally', async () => {
    const originalConsoleError = console.error;
    const logged: unknown[][] = [];
    console.error = (...args: unknown[]) => {
      logged.push(args);
    };

    // reconcileBatches rejects → driver promise rejects → .catch swallows it.
    reconcileFakes.reconcileBatches.mockRejectedValueOnce(
      new Error('reconcile boom'),
    );

    const bus = createEventBus();
    const control = createControlSignal(DEFAULT_STAGE_CONTROL);
    const loop = createDistributorLoop({
      publicClient: stubPublicClient,
      storage: fixture(),
      walletPool: [W1],
      manifest,
      bus,
      control,
      scannerCompleted: () => true,
      filterCompleted: () => true,
      disperse: vi.fn(),
      interventionHook: vi.fn(),
      getBalances: async () => new Map([[W1, 10n ** 18n]]),
    });

    await loop.start();
    await new Promise((r) => setTimeout(r, 30));
    console.error = originalConsoleError;

    expect(loop.status()).toBe('idle');
    expect(logged.length).toBeGreaterThan(0);
    expect(String(logged[0]?.[0])).toContain('[distributor-loop]');
  });
});

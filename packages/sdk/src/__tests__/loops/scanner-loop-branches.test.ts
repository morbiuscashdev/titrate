import { describe, it, expect, vi } from 'vitest';
import type { Address, PublicClient } from 'viem';
import {
  createScannerLoop,
  type RunSourceFn,
} from '../../pipeline/loops/scanner-loop.js';
import { createEventBus } from '../../pipeline/loops/event-bus.js';
import { createControlSignal } from '../../pipeline/loops/control-signal.js';
import {
  DEFAULT_STAGE_CONTROL,
  type CampaignManifest,
  type PipelineConfig,
} from '../../types.js';
import {
  createMemoryAddresses,
  createMemoryCursor,
  createMemoryErrors,
} from './memory-storage.js';

const BLOCK_SCAN_PIPELINE: PipelineConfig = {
  steps: [
    {
      type: 'source',
      sourceType: 'block-scan',
      params: { startBlock: 100, endBlock: 102, extract: 'tx.from' },
    },
  ],
};

function manifest(overrides: Partial<CampaignManifest> = {}): CampaignManifest {
  return {
    id: 'c',
    status: 'running',
    wallets: { mode: 'imported', count: 1 },
    createdAt: 0,
    updatedAt: 0,
    startBlock: 100n,
    endBlock: 102n,
    autoStart: false,
    control: DEFAULT_STAGE_CONTROL,
    funder: '0xF' as Address,
    name: 'n',
    version: 1,
    chainId: 1,
    rpcUrl: 'http://x',
    tokenAddress: '0xT' as Address,
    tokenDecimals: 18,
    contractAddress: null,
    contractVariant: 'simple',
    contractName: 'N',
    amountMode: 'uniform',
    amountFormat: 'integer',
    uniformAmount: '1',
    batchSize: 10,
    campaignId: null,
    pinnedBlock: null,
    ...overrides,
  };
}

function fixture() {
  return {
    addresses: createMemoryAddresses(),
    cursor: createMemoryCursor(),
    errors: createMemoryErrors(),
  };
}

function client(latest: bigint, overrides?: Partial<PublicClient>): PublicClient {
  return {
    getBlockNumber: async () => latest,
    ...overrides,
  } as unknown as PublicClient;
}

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
// Happy paths that only the branch tests hit
// ---------------------------------------------------------------------------

describe('scanner-loop — range bounds', () => {
  it('clamps target to manifest.endBlock when endBlock < latest', async () => {
    const h = fixture();
    const bus = createEventBus();
    const control = createControlSignal(DEFAULT_STAGE_CONTROL);
    const runSource = vi.fn<RunSourceFn>(
      async (_step, _block, _client) => [] as readonly Address[],
    );

    const loop = createScannerLoop({
      publicClient: client(500n),
      storage: h,
      manifest: manifest({ startBlock: 100n, endBlock: 102n }),
      pipeline: BLOCK_SCAN_PIPELINE,
      bus,
      control,
      runSource,
    });

    await loop.start();
    await untilEvent(bus, 'completed');

    // Blocks 101 + 102 scanned (cursor seeded at startBlock-1 = 99 → effective
    // lastBlock-1 = 99, so next block is 100). With latest=500 the loop clamps
    // to endBlock=102.
    expect(runSource).toHaveBeenCalledTimes(3);
    const calls = runSource.mock.calls.map((c) => c[1]);
    expect(calls).toEqual([100n, 101n, 102n]);
    expect((await h.cursor.read()).scan.lastBlock).toBe(102n);
  });

  it('fast-forwards the cursor to startBlock when lastBlock trails it', async () => {
    const h = fixture();
    // Seed cursor below the startBlock so the effectiveLastBlock branch fires.
    await h.cursor.update({ scan: { lastBlock: 5n, addressCount: 0 } });

    const bus = createEventBus();
    const control = createControlSignal(DEFAULT_STAGE_CONTROL);
    const runSource = vi.fn<RunSourceFn>(
      async (_step, _block, _client) => [] as readonly Address[],
    );

    const loop = createScannerLoop({
      publicClient: client(105n),
      storage: h,
      manifest: manifest({ startBlock: 100n, endBlock: 102n }),
      pipeline: BLOCK_SCAN_PIPELINE,
      bus,
      control,
      runSource,
    });

    await loop.start();
    await untilEvent(bus, 'completed');

    // Must have skipped blocks 6..99 and only scanned 100..102.
    const scannedBlocks = runSource.mock.calls.map((c) => c[1]);
    expect(scannedBlocks).toEqual([100n, 101n, 102n]);
  });

  it('omits the fast-forward branch when cursor is already past startBlock', async () => {
    const h = fixture();
    await h.cursor.update({ scan: { lastBlock: 150n, addressCount: 0 } });

    const bus = createEventBus();
    const control = createControlSignal(DEFAULT_STAGE_CONTROL);
    const runSource = vi.fn<RunSourceFn>(
      async (_step, _block, _client) => [] as readonly Address[],
    );

    const loop = createScannerLoop({
      publicClient: client(152n),
      storage: h,
      manifest: manifest({ startBlock: 100n, endBlock: 152n }),
      pipeline: BLOCK_SCAN_PIPELINE,
      bus,
      control,
      runSource,
    });

    await loop.start();
    await untilEvent(bus, 'completed');

    const scannedBlocks = runSource.mock.calls.map((c) => c[1]);
    expect(scannedBlocks).toEqual([151n, 152n]);
  });

  it('leaves addresses untouched on a block that yields no rows', async () => {
    const h = fixture();
    const bus = createEventBus();
    const control = createControlSignal(DEFAULT_STAGE_CONTROL);

    const loop = createScannerLoop({
      publicClient: client(101n),
      storage: h,
      manifest: manifest({ startBlock: 100n, endBlock: 101n }),
      pipeline: BLOCK_SCAN_PIPELINE,
      bus,
      control,
      runSource: async () => [],
    });

    await loop.start();
    await untilEvent(bus, 'completed');

    expect(await h.addresses.count()).toBe(0);
    expect((await h.cursor.read()).scan.lastBlock).toBe(101n);
  });
});

// ---------------------------------------------------------------------------
// Error / backoff paths
// ---------------------------------------------------------------------------

describe('scanner-loop — backoff + errors', () => {
  it('errors out when getBlockNumber exhausts its backoff retries', async () => {
    const h = fixture();
    const bus = createEventBus();
    const control = createControlSignal(DEFAULT_STAGE_CONTROL);

    const loop = createScannerLoop({
      publicClient: {
        getBlockNumber: async () => {
          throw new Error('getBlockNumber down');
        },
      } as unknown as PublicClient,
      storage: h,
      manifest: manifest(),
      pipeline: BLOCK_SCAN_PIPELINE,
      bus,
      control,
      runSource: async () => [],
      sleep: async () => {},
    });

    await loop.start();
    await untilEvent(bus, 'errored');

    expect(loop.status()).toBe('errored');
    const errs = await h.errors.readAll();
    // 5 attempts -> 5 error entries.
    expect(errs.length).toBe(5);
    expect(errs[0].phase).toBe('getBlockNumber');
    expect(errs[0].message).toBe('getBlockNumber down');
  });

  it('recovers on retry when the initial attempt fails', async () => {
    const h = fixture();
    const bus = createEventBus();
    const control = createControlSignal(DEFAULT_STAGE_CONTROL);

    let runSourceCalls = 0;
    const loop = createScannerLoop({
      publicClient: client(101n),
      storage: h,
      manifest: manifest({ startBlock: 100n, endBlock: 101n }),
      pipeline: BLOCK_SCAN_PIPELINE,
      bus,
      control,
      runSource: async (_step, _block) => {
        runSourceCalls++;
        if (runSourceCalls === 1) throw new Error('flaky once');
        return [];
      },
      sleep: async () => {},
    });

    await loop.start();
    await untilEvent(bus, 'completed');

    // 1 fail + 1 retry + 1 extra block = 3 calls.
    expect(runSourceCalls).toBe(3);
    const errs = await h.errors.readAll();
    expect(errs.length).toBe(1);
    expect(errs[0].phase).toBe('scan-block');
  });

  it('writes error context containing the block number when scan-block throws', async () => {
    const h = fixture();
    const bus = createEventBus();
    const control = createControlSignal(DEFAULT_STAGE_CONTROL);

    const loop = createScannerLoop({
      publicClient: client(101n),
      storage: h,
      manifest: manifest({ startBlock: 100n, endBlock: 101n }),
      pipeline: BLOCK_SCAN_PIPELINE,
      bus,
      control,
      runSource: async () => {
        throw new Error('dead block');
      },
      sleep: async () => {},
    });

    await loop.start();
    await untilEvent(bus, 'errored');

    const errs = await h.errors.readAll();
    // scan-block errors stamp { context: { block } }.
    expect(errs[0].context).toMatchObject({ block: '100' });
  });
});

// ---------------------------------------------------------------------------
// Polling / pause-within-scan / defaults
// ---------------------------------------------------------------------------

describe('scanner-loop — polling & defaults', () => {
  it('uses the default runSource (empty result) when none is supplied', async () => {
    const h = fixture();
    const bus = createEventBus();
    const control = createControlSignal(DEFAULT_STAGE_CONTROL);

    const loop = createScannerLoop({
      publicClient: client(101n),
      storage: h,
      manifest: manifest({ startBlock: 100n, endBlock: 101n }),
      pipeline: BLOCK_SCAN_PIPELINE,
      bus,
      control,
      // runSource omitted → defaultRunSource returns [].
      sleep: async () => {},
    });

    await loop.start();
    await untilEvent(bus, 'completed');

    expect(await h.addresses.count()).toBe(0);
    expect((await h.cursor.read()).scan.lastBlock).toBe(101n);
  });

  it('halts the inner block loop when control flips to paused mid-scan', async () => {
    const h = fixture();
    const bus = createEventBus();
    const control = createControlSignal(DEFAULT_STAGE_CONTROL);

    let callCount = 0;
    const loop = createScannerLoop({
      publicClient: client(200n),
      storage: h,
      manifest: manifest({ startBlock: 100n, endBlock: 200n }),
      pipeline: BLOCK_SCAN_PIPELINE,
      bus,
      control,
      runSource: async (_s, block) => {
        callCount++;
        if (callCount === 2) {
          // Pause mid-range; the inner `if (control.get().scan === 'paused')`
          // break out of the block loop; the outer while re-checks and sets
          // status='paused'.
          await control.update({ ...DEFAULT_STAGE_CONTROL, scan: 'paused' });
        }
        return [`0x${block.toString(16).padStart(40, '0')}`] as Address[];
      },
      sleep: async () => {},
    });

    await loop.start();
    for (let i = 0; i < 50 && loop.status() !== 'paused'; i++) {
      await new Promise((r) => setTimeout(r, 5));
    }
    expect(loop.status()).toBe('paused');

    // stop while paused: resume first so waitForResume unblocks, then stop.
    const stopPromise = loop.stop();
    await control.update(DEFAULT_STAGE_CONTROL);
    await stopPromise;
    expect(loop.status()).toBe('idle');
  });

  it('polls with chainBlockTimeMs when endBlock is null and caught up', async () => {
    const h = fixture();
    await h.cursor.update({ scan: { lastBlock: 100n, addressCount: 0 } });

    const bus = createEventBus();
    const control = createControlSignal(DEFAULT_STAGE_CONTROL);

    const sleepCalls: number[] = [];
    const loop = createScannerLoop({
      publicClient: client(100n),
      storage: h,
      manifest: manifest({ startBlock: null, endBlock: null }),
      pipeline: BLOCK_SCAN_PIPELINE,
      bus,
      control,
      runSource: async () => [],
      chainBlockTimeMs: 42,
      sleep: async (ms) => {
        sleepCalls.push(ms);
        if (sleepCalls.length === 1) void loop.stop();
      },
    });

    await loop.start();
    for (let i = 0; i < 50 && loop.status() !== 'idle'; i++) {
      await new Promise((r) => setTimeout(r, 5));
    }

    expect(sleepCalls).toContain(42);
  });
});

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

describe('scanner-loop — lifecycle', () => {
  it('start() twice is a no-op', async () => {
    const h = fixture();
    const bus = createEventBus();
    const control = createControlSignal(DEFAULT_STAGE_CONTROL);

    const runSource = vi.fn<RunSourceFn>(
      async (_step, _block, _client) => [] as readonly Address[],
    );
    const loop = createScannerLoop({
      publicClient: client(101n),
      storage: h,
      manifest: manifest({ startBlock: 100n, endBlock: 101n }),
      pipeline: BLOCK_SCAN_PIPELINE,
      bus,
      control,
      runSource,
      sleep: async () => {},
    });

    await loop.start();
    await loop.start();
    await untilEvent(bus, 'completed');
    expect(runSource.mock.calls.length).toBeLessThanOrEqual(2);
  });

  it('on() delegates to the bus', async () => {
    const h = fixture();
    const bus = createEventBus();
    const control = createControlSignal(DEFAULT_STAGE_CONTROL);
    const loop = createScannerLoop({
      publicClient: client(0n),
      storage: h,
      manifest: manifest({ startBlock: 0n, endBlock: 0n }),
      pipeline: BLOCK_SCAN_PIPELINE,
      bus,
      control,
      runSource: async () => [],
      sleep: async () => {},
    });

    let seen = 0;
    loop.on('scan-progressed', () => {
      seen++;
    });
    bus.emit('scan-progressed');
    expect(seen).toBe(1);
  });

  it('logs to console.error if the driver rejects unexpectedly', async () => {
    const originalError = console.error;
    const logged: unknown[][] = [];
    console.error = (...args: unknown[]) => {
      logged.push(args);
    };

    // Force cursor.read to throw inside the driver — the surrounding
    // try/catches don't catch this, so the driver promise rejects.
    const h = {
      addresses: createMemoryAddresses(),
      cursor: {
        read: async () => {
          throw new Error('cursor unavailable');
        },
        update: async () => {},
      },
      errors: createMemoryErrors(),
    };

    const bus = createEventBus();
    const control = createControlSignal(DEFAULT_STAGE_CONTROL);
    const loop = createScannerLoop({
      publicClient: client(101n),
      storage: h,
      manifest: manifest({ startBlock: 100n, endBlock: 101n }),
      pipeline: BLOCK_SCAN_PIPELINE,
      bus,
      control,
      runSource: async () => [],
      sleep: async () => {},
    });

    await loop.start();
    for (let i = 0; i < 50 && logged.length === 0; i++) {
      await new Promise((r) => setTimeout(r, 5));
    }
    console.error = originalError;

    expect(logged.length).toBeGreaterThan(0);
    expect(String(logged[0]?.[0])).toContain('[scanner-loop]');
  });
});

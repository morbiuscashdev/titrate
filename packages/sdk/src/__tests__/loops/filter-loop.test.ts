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
      applyFilterChain: async (row) => row.address !== '0x02',
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
    await new Promise((r) => setTimeout(r, 30));

    expect(loop.status()).toBe('running');
    const mid = await cursor.read();
    expect(mid.filter.watermark).toBe(1);

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

  it('records errors.append and drops the row when applyFilterChain throws', async () => {
    await addresses.append([
      { address: '0xA', amount: null },
      { address: '0xB', amount: null },
    ]);

    const bus = createEventBus();
    const control = createControlSignal(DEFAULT_STAGE_CONTROL);
    const errorEntries: unknown[] = [];

    const loop = createFilterLoop({
      publicClient: {} as PublicClient,
      storage: {
        addresses,
        filtered,
        cursor,
        errors: { append: async (e) => { errorEntries.push(e); } },
      },
      pipeline: PIPELINE,
      bus,
      control,
      scannerCompleted: () => true,
      applyFilterChain: async (row) => {
        if (row.address === '0xA') throw new Error('rpc went away');
        return true;
      },
    });

    await loop.start();
    await new Promise<void>((resolve) => bus.on('completed', () => resolve()));

    expect(errorEntries).toHaveLength(1);
    const entry = errorEntries[0] as { loop: string; phase: string; message: string; context: { address: string } };
    expect(entry.loop).toBe('filter');
    expect(entry.phase).toBe('apply-filter');
    expect(entry.message).toBe('rpc went away');
    expect(entry.context.address).toBe('0xA');

    const end = await cursor.read();
    expect(end.filter.watermark).toBe(2);
    expect(end.filter.qualifiedCount).toBe(1);

    const filteredContent = await readFile(join(dir, 'filtered.csv'), 'utf8');
    expect(filteredContent).not.toContain('0xA,');
    expect(filteredContent).toContain('0xB,');
    await rm(dir, { recursive: true });
  });

  it('stop() mid-run returns to idle', async () => {
    await addresses.append([{ address: '0x1', amount: null }]);

    const bus = createEventBus();
    const control = createControlSignal(DEFAULT_STAGE_CONTROL);

    const loop = createFilterLoop({
      publicClient: {} as PublicClient,
      storage: { addresses, filtered, cursor, errors: { append: async () => {} } },
      pipeline: PIPELINE,
      bus,
      control,
      // Never completes on its own — scanner not done + watermark short.
      scannerCompleted: () => false,
      applyFilterChain: async () => true,
    });

    await loop.start();
    await new Promise((r) => setTimeout(r, 15));
    // Driver is parked on bus.once('scan-progressed', 'pipeline-changed').
    // stop() sets stopping=true then awaits driverPromise; we must emit to
    // wake the driver so it re-checks the flag and exits.
    const stopPromise = loop.stop();
    await new Promise((r) => setTimeout(r, 0));
    bus.emit('pipeline-changed');
    await stopPromise;

    expect(loop.status()).toBe('idle');
    await rm(dir, { recursive: true });
  });

  it('on() delegates to the event bus', async () => {
    const bus = createEventBus();
    const control = createControlSignal(DEFAULT_STAGE_CONTROL);
    const loop = createFilterLoop({
      publicClient: {} as PublicClient,
      storage: { addresses, filtered, cursor, errors: { append: async () => {} } },
      pipeline: PIPELINE,
      bus,
      control,
      scannerCompleted: () => true,
      applyFilterChain: async () => true,
    });

    let seen = 0;
    loop.on('filter-progressed', () => { seen++; });
    bus.emit('filter-progressed');
    expect(seen).toBe(1);
    await rm(dir, { recursive: true });
  });

  it('catches driver throws and resets status to idle via finally', async () => {
    const bus = createEventBus();
    const control = createControlSignal(DEFAULT_STAGE_CONTROL);

    // Force the driver to throw by giving it a cursor store whose read() throws.
    // The .catch() logs to console.error; the .finally() flips status back to idle.
    const consoleError = console.error;
    const errorLogs: unknown[][] = [];
    console.error = (...args: unknown[]) => { errorLogs.push(args); };

    const loop = createFilterLoop({
      publicClient: {} as PublicClient,
      storage: {
        addresses,
        filtered,
        cursor: {
          read: async () => { throw new Error('cursor.read boom'); },
          update: async () => {},
        },
        errors: { append: async () => {} },
      },
      pipeline: PIPELINE,
      bus,
      control,
      scannerCompleted: () => true,
      applyFilterChain: async () => true,
    });

    await loop.start();
    // Allow the driver to run + fail + finally to run.
    await new Promise((r) => setTimeout(r, 30));

    console.error = consoleError;
    expect(loop.status()).toBe('idle');
    expect(errorLogs.length).toBeGreaterThan(0);
    const firstArgs = errorLogs[0] as unknown[];
    expect(firstArgs[0]).toBe('[filter-loop] driver threw:');
    await rm(dir, { recursive: true });
  });
});

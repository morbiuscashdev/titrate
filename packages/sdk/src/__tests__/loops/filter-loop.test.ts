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
});

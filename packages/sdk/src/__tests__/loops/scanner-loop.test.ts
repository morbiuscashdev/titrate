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
import type { CampaignManifest, PipelineConfig } from '../../types.js';
import { DEFAULT_STAGE_CONTROL } from '../../types.js';

type TestStorage = {
  addresses: ReturnType<typeof createAppendableCSV>;
  cursor: ReturnType<typeof createCursorStore>;
  errors: { append: (e: unknown) => Promise<void> };
};

function blockAddresses(block: bigint): Address[] {
  const hex = block.toString(16).padStart(36, '0');
  return [
    `0xaaaa${hex}` as Address,
    `0xbbbb${hex}` as Address,
  ];
}

function makeClient(latest: bigint): PublicClient {
  return { getBlockNumber: async () => latest } as unknown as PublicClient;
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
      bus, control,
      runSource: async (_step, block) => blockAddresses(block),
    });

    await loop.start();
    await new Promise<void>((resolve) => bus.on('completed', () => resolve()));

    const c = await storage.cursor.read();
    expect(c.scan.lastBlock).toBe(102n);
    expect(c.scan.addressCount).toBe(6);
    expect(scanProgressedCount).toBe(3);

    const content = await readFile(join(dir, 'addresses.csv'), 'utf8');
    expect(content.trim().split('\n').length).toBe(6);
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
      bus, control,
      runSource: async (_step, block) => {
        blockCalls++;
        if (blockCalls === 1) {
          await control.update({ ...DEFAULT_STAGE_CONTROL, scan: 'paused' });
        }
        return blockAddresses(block);
      },
    });

    await loop.start();
    await new Promise((r) => setTimeout(r, 30));

    const paused = await storage.cursor.read();
    expect(paused.scan.lastBlock).toBeGreaterThanOrEqual(100n);
    expect(paused.scan.lastBlock).toBeLessThan(200n);

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
      bus, control,
      runSource: async (_s, block) => blockAddresses(block),
    });

    await loop.start();
    await new Promise((r) => setTimeout(r, 15));
    await loop.stop();

    expect(loop.status()).toBe('idle');
    await rm(dir, { recursive: true });
  });
});

import { describe, it, expect, vi } from 'vitest';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Address, Hex, PublicClient } from 'viem';
import { retroactiveReapply } from '../../pipeline/loops/retroactive.js';
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

    let scannerDone = false;
    let filterDone = false;

    // startBlock: 101n, endBlock: 102n → 2 blocks × 2 addresses = 4 total, 2 qualified.
    const m = manifest({ startBlock: 101n, endBlock: 102n });

    const scanner = createScannerLoop({
      publicClient: client,
      storage: { addresses, cursor, errors },
      manifest: m,
      pipeline: PIPELINE,
      bus, control,
      runSource: async (_step, block) => {
        const even = `0x${block.toString(16).padStart(2, '0')}0000000000000000000000000000000000` as Address;
        const odd =  `0x${block.toString(16).padStart(2, '0')}1111111111111111111111111111111111` as Address;
        return [even, odd];
      },
    });

    const filter = createFilterLoop({
      publicClient: client,
      storage: { addresses, filtered, cursor, errors },
      pipeline: PIPELINE,
      bus, control,
      scannerCompleted: () => scannerDone,
      applyFilterChain: async (row) => !row.address.endsWith('111111111111111111'),
    });

    const disperseMock = vi.fn().mockImplementation(async (): Promise<BatchAttempt> => ({
      txHash: '0xdd' as Hex, nonce: 0,
      gasEstimate: 21000n, maxFeePerGas: 1n, maxPriorityFeePerGas: 1n,
      timestamp: Date.now(), outcome: 'confirmed',
    }));
    const distributor = createDistributorLoop({
      publicClient: { getTransactionReceipt: async () => ({ status: 'success', blockNumber: 0n }) } as unknown as PublicClient,
      storage: { filtered, batches, cursor, errors },
      walletPool: [W1],
      manifest: m,
      bus, control,
      scannerCompleted: () => scannerDone,
      filterCompleted: () => filterDone,
      disperse: disperseMock,
      interventionHook: async () => ({ type: 'approve' }),
      getBalances: async () => new Map([[W1, 10n ** 18n]]),
    });

    // Watch the shared bus for completion events and route by loop status.
    bus.on('completed', () => {
      if (scanner.status() === 'completed') scannerDone = true;
      if (filter.status() === 'completed') filterDone = true;
    });

    await Promise.all([scanner.start(), filter.start(), distributor.start()]);

    // Poll for distributor completion
    const deadline = Date.now() + 2000;
    while (Date.now() < deadline) {
      if (distributor.status() === 'completed') break;
      await new Promise((r) => setTimeout(r, 5));
    }

    expect(distributor.status()).toBe('completed');
    expect(scanner.status()).toBe('completed');
    expect(filter.status()).toBe('completed');

    const c = await cursor.read();
    // startBlock: 101n, endBlock: 102n → scanner covers blocks 101, 102.
    expect(c.scan.lastBlock).toBe(102n);
    expect(c.scan.addressCount).toBe(4);
    expect(c.filter.watermark).toBe(4);
    expect(c.filter.qualifiedCount).toBe(2);
    expect(c.distribute.watermark).toBe(2);

    const recorded = await batches.readAll();
    expect(recorded.length).toBe(1);
    expect(disperseMock).toHaveBeenCalledTimes(1);
  });
});

describe('reconciliation on restart', () => {
  it('classifies planted broadcast batches and invokes intervention hook for non-confirmed', async () => {
    const filtered = createMemoryAddresses();
    const batches = createMemoryBatches();
    const cursor = createMemoryCursor({
      scan: { lastBlock: 100n, addressCount: 0 },
      filter: { watermark: 0, qualifiedCount: 0 },
      distribute: { watermark: 2, confirmedCount: 0 },
    });
    const errors = createMemoryErrors();

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

    const client = {
      getTransactionReceipt: vi.fn()
        .mockResolvedValueOnce({ status: 'success', blockNumber: 150n })
        .mockResolvedValueOnce(null),
      getTransaction: vi.fn().mockResolvedValue(null),
      getTransactionCount: vi.fn().mockResolvedValue(5),
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
    // Wait for reconciliation to finish; the distributor's steady-state may
    // not reach 'completed' in this pathological restart scenario, so we
    // stop it explicitly once reconciliation has fired.
    await new Promise<void>((resolve) => {
      if (reconcileDone) return resolve();
      bus.on('reconciliation-complete', () => resolve());
    });
    await distributor.stop();

    expect(reconcileDone).toBe(true);
    expect(interventions).toEqual(['reconcile-dropped']);
    const updated = await batches.readAll();
    const latestByIndex = new Map<number, typeof updated[number]>();
    for (const r of updated) latestByIndex.set(r.batchIndex, r);
    expect(latestByIndex.get(0)!.status).toBe('confirmed');
  });
});

describe('filter hot-reload retroactive re-apply', () => {
  it('shrinks filtered.csv + qualifiedCount after a suffix-added filter is applied retroactively', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'titrate-retro-int-'));
    const filteredPath = join(dir, 'filtered.csv');

    await writeFile(filteredPath, [
      '0x1,', '0x2,', '0x3,', '0x4,', '0x5,', '0x6,', '0x7,', '0x8,',
    ].join('\n') + '\n', 'utf8');

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
    for (const line of lines) {
      const lastChar = line.replace(',', '').slice(-1);
      expect(parseInt(lastChar, 16) % 2).toBe(0);
    }

    await rm(dir, { recursive: true });
  });
});

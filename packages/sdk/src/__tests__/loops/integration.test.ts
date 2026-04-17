import { describe, it, expect, vi } from 'vitest';
import type { Address, Hex, PublicClient } from 'viem';
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

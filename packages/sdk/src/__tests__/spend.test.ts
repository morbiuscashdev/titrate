import { describe, it, expect } from 'vitest';
import type { StoredBatch } from '../storage/index.js';
import type { BatchAttempt } from '../types.js';
import { aggregateSpendReport } from '../utils/spend.js';

function makeBatch(overrides: Partial<StoredBatch> & { status: StoredBatch['status'] }): StoredBatch {
  return {
    id: `b-${Math.random()}`, campaignId: 'c1', batchIndex: 0,
    recipients: [], amounts: [], attempts: [],
    confirmedTxHash: null, confirmedBlock: null,
    createdAt: Date.now(), updatedAt: Date.now(),
    ...overrides,
  };
}

const confirmedAttempt: BatchAttempt = {
  txHash: '0xabc' as `0x${string}`, nonce: 0, gasEstimate: 400_000n,
  maxFeePerGas: 30_000_000_000n, maxPriorityFeePerGas: 1_000_000_000n,
  timestamp: Date.now(), outcome: 'confirmed',
};

describe('aggregateSpendReport', () => {
  it('aggregates confirmed batches', () => {
    const batches = [
      makeBatch({ status: 'confirmed', recipients: ['0xaaa' as `0x${string}`, '0xbbb' as `0x${string}`], amounts: ['1000', '2000'], attempts: [confirmedAttempt] }),
      makeBatch({ status: 'confirmed', recipients: ['0xccc' as `0x${string}`], amounts: ['3000'], attempts: [confirmedAttempt] }),
    ];
    const report = aggregateSpendReport(batches);
    expect(report.uniqueRecipients).toBe(3);
    expect(report.totalTokensSent).toBe(6000n);
    expect(report.confirmedBatches).toBe(2);
    expect(report.failedBatches).toBe(0);
  });
  it('counts failed batches separately', () => {
    const batches = [
      makeBatch({ status: 'confirmed', recipients: ['0xaaa' as `0x${string}`], amounts: ['100'], attempts: [confirmedAttempt] }),
      makeBatch({ status: 'failed' }),
    ];
    const report = aggregateSpendReport(batches);
    expect(report.confirmedBatches).toBe(1);
    expect(report.failedBatches).toBe(1);
  });
  it('deduplicates recipients across batches', () => {
    const batches = [
      makeBatch({ status: 'confirmed', recipients: ['0xaaa' as `0x${string}`], amounts: ['100'], attempts: [confirmedAttempt] }),
      makeBatch({ status: 'confirmed', recipients: ['0xaaa' as `0x${string}`], amounts: ['200'], attempts: [confirmedAttempt] }),
    ];
    const report = aggregateSpendReport(batches);
    expect(report.uniqueRecipients).toBe(1);
    expect(report.totalTokensSent).toBe(300n);
  });
  it('returns zeros for empty input', () => {
    const report = aggregateSpendReport([]);
    expect(report.uniqueRecipients).toBe(0);
    expect(report.totalTokensSent).toBe(0n);
    expect(report.totalGasEstimate).toBe(0n);
    expect(report.batchCount).toBe(0);
  });
  it('sums gas estimates from confirmed attempts only', () => {
    const batches = [
      makeBatch({
        status: 'confirmed', recipients: ['0xaaa' as `0x${string}`], amounts: ['100'],
        attempts: [confirmedAttempt, { ...confirmedAttempt, outcome: 'replaced' as const }],
      }),
    ];
    const report = aggregateSpendReport(batches);
    expect(report.totalGasEstimate).toBe(400_000n);
  });
});

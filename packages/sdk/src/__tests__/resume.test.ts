import { describe, it, expect } from 'vitest';
import { computeResumeOffset, alignAmountsForResume } from '../utils/resume.js';
import type { StoredBatch } from '../storage/index.js';

function makeBatch(status: 'confirmed' | 'failed'): StoredBatch {
  return {
    id: `batch-${Math.random()}`,
    campaignId: 'test',
    batchIndex: 0,
    recipients: [],
    amounts: [],
    status,
    attempts: [],
    confirmedTxHash: null,
    confirmedBlock: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

describe('computeResumeOffset', () => {
  it('returns zero for no batches', () => {
    expect(computeResumeOffset([], 200)).toBe(0);
  });
  it('computes offset from confirmed batches', () => {
    const batches = [makeBatch('confirmed'), makeBatch('confirmed'), makeBatch('failed')];
    expect(computeResumeOffset(batches, 200)).toBe(400);
  });
  it('ignores failed batches', () => {
    const batches = [makeBatch('failed'), makeBatch('failed')];
    expect(computeResumeOffset(batches, 100)).toBe(0);
  });
  it('works with different batch sizes', () => {
    const batches = [makeBatch('confirmed')];
    expect(computeResumeOffset(batches, 500)).toBe(500);
  });
});

describe('alignAmountsForResume', () => {
  const amounts = [100n, 200n, 300n, 400n, 500n];

  it('slices from offset for given count', () => {
    expect(alignAmountsForResume(amounts, 2, 3)).toEqual([300n, 400n, 500n]);
  });
  it('returns zeros for out-of-bounds indices', () => {
    expect(alignAmountsForResume(amounts, 3, 4)).toEqual([400n, 500n, 0n, 0n]);
  });
  it('handles zero offset', () => {
    expect(alignAmountsForResume(amounts, 0, 2)).toEqual([100n, 200n]);
  });
  it('handles empty source', () => {
    expect(alignAmountsForResume([], 0, 3)).toEqual([0n, 0n, 0n]);
  });
});

import { describe, it, expect } from 'vitest';
import { computeDrainStatus } from '../../pipeline/loops/drain.js';

describe('computeDrainStatus', () => {
  it('returns drained when scanner+filter done, no unread qualified, all batches confirmed', () => {
    expect(computeDrainStatus({
      scannerCompleted: true,
      filterCompleted: true,
      qualifiedCount: 100,
      distributeWatermark: 100,
      batchesAllConfirmed: true,
    })).toBe('drained');
  });

  it('returns waiting if scanner is still running', () => {
    expect(computeDrainStatus({
      scannerCompleted: false,
      filterCompleted: true,
      qualifiedCount: 100,
      distributeWatermark: 100,
      batchesAllConfirmed: true,
    })).toBe('waiting');
  });

  it('returns waiting if filter is still running', () => {
    expect(computeDrainStatus({
      scannerCompleted: true,
      filterCompleted: false,
      qualifiedCount: 100,
      distributeWatermark: 100,
      batchesAllConfirmed: true,
    })).toBe('waiting');
  });

  it('returns waiting if there are still qualified addresses past the distribute watermark', () => {
    expect(computeDrainStatus({
      scannerCompleted: true,
      filterCompleted: true,
      qualifiedCount: 100,
      distributeWatermark: 99,
      batchesAllConfirmed: true,
    })).toBe('waiting');
  });

  it('returns waiting if any batch is still broadcast (not confirmed)', () => {
    expect(computeDrainStatus({
      scannerCompleted: true,
      filterCompleted: true,
      qualifiedCount: 100,
      distributeWatermark: 100,
      batchesAllConfirmed: false,
    })).toBe('waiting');
  });
});

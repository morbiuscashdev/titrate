import { describe, it, expect } from 'vitest';
import { computeRequirements } from '../utils/requirements.js';

describe('computeRequirements', () => {
  it('computes for uniform amounts', () => {
    const result = computeRequirements({
      recipientCount: 1000, batchSize: 200, amountPerRecipient: 1_000_000n, gasPerBatch: 500_000n,
    });
    expect(result.batchCount).toBe(5);
    expect(result.gasTokenNeeded).toBe(2_500_000n);
    expect(result.erc20Needed).toBe(1_000_000_000n);
  });
  it('uses totalAmount when provided (variable amounts)', () => {
    const result = computeRequirements({
      recipientCount: 3, batchSize: 2, amountPerRecipient: 0n, totalAmount: 5_000_000n, gasPerBatch: 300_000n,
    });
    expect(result.batchCount).toBe(2);
    expect(result.gasTokenNeeded).toBe(600_000n);
    expect(result.erc20Needed).toBe(5_000_000n);
  });
  it('handles single batch', () => {
    const result = computeRequirements({
      recipientCount: 50, batchSize: 200, amountPerRecipient: 100n, gasPerBatch: 1_000_000n,
    });
    expect(result.batchCount).toBe(1);
    expect(result.gasTokenNeeded).toBe(1_000_000n);
    expect(result.erc20Needed).toBe(5_000n);
  });
  it('handles zero recipients', () => {
    const result = computeRequirements({
      recipientCount: 0, batchSize: 200, amountPerRecipient: 100n, gasPerBatch: 500_000n,
    });
    expect(result.batchCount).toBe(0);
    expect(result.gasTokenNeeded).toBe(0n);
    expect(result.erc20Needed).toBe(0n);
  });
});

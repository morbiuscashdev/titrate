import { describe, it, expect } from 'vitest';
import { suggestWalletCount } from '../suggest.js';

describe('suggestWalletCount', () => {
  it('suggests based on recipient count', () => {
    const result = suggestWalletCount({
      recipientCount: 5000,
      batchSize: 100,
      gasPerBatch: 300_000n,
      blockGasLimit: 30_000_000n,
    });

    expect(result.recommended).toBe(10);
  });

  it('caps at block gas limit', () => {
    const result = suggestWalletCount({
      recipientCount: 5000,
      batchSize: 100,
      gasPerBatch: 10_000_000n,
      blockGasLimit: 30_000_000n,
    });

    expect(result.recommended).toBe(3);
  });

  it('caps at total batch count', () => {
    const result = suggestWalletCount({
      recipientCount: 200,
      batchSize: 100,
      gasPerBatch: 300_000n,
      blockGasLimit: 30_000_000n,
    });

    expect(result.recommended).toBe(2);
  });

  it('returns minimum of 1', () => {
    const result = suggestWalletCount({
      recipientCount: 0,
      batchSize: 100,
      gasPerBatch: 300_000n,
      blockGasLimit: 30_000_000n,
    });

    expect(result.recommended).toBe(1);
  });

  it('returns a reason string', () => {
    const result = suggestWalletCount({
      recipientCount: 5000,
      batchSize: 100,
      gasPerBatch: 10_000_000n,
      blockGasLimit: 30_000_000n,
    });

    expect(typeof result.reason).toBe('string');
    expect(result.reason.length).toBeGreaterThan(0);
    expect(result.reason).toContain('3');
  });
});

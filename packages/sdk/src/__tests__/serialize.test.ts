import { describe, it, expect } from 'vitest';
import type { BatchResult } from '../types.js';
import { serializeBatchResults } from '../utils/serialize.js';

describe('serializeBatchResults', () => {
  const batch: BatchResult = {
    batchIndex: 0,
    recipients: ['0xabc' as `0x${string}`],
    amounts: [1_000_000_000_000_000_000n],
    attempts: [{
      txHash: '0xdef' as `0x${string}`,
      nonce: 1,
      gasEstimate: 500_000n,
      maxFeePerGas: 30_000_000_000n,
      maxPriorityFeePerGas: 1_000_000_000n,
      timestamp: 1700000000,
      outcome: 'confirmed' as const,
    }],
    confirmedTxHash: '0xdef' as `0x${string}`,
    blockNumber: 19_000_000n,
  };

  it('converts bigint amounts to strings', () => {
    const result = serializeBatchResults([batch]) as Record<string, unknown>[];
    expect((result[0] as Record<string, unknown>).amounts).toEqual(['1000000000000000000']);
  });
  it('converts blockNumber to string', () => {
    const result = serializeBatchResults([batch]) as Record<string, unknown>[];
    expect((result[0] as Record<string, unknown>).blockNumber).toBe('19000000');
  });
  it('converts attempt gas fields to strings', () => {
    const result = serializeBatchResults([batch]) as Record<string, unknown>[];
    const attempts = (result[0] as Record<string, unknown>).attempts as Record<string, unknown>[];
    expect(attempts[0].gasEstimate).toBe('500000');
    expect(attempts[0].maxFeePerGas).toBe('30000000000');
    expect(attempts[0].maxPriorityFeePerGas).toBe('1000000000');
  });
  it('handles null blockNumber', () => {
    const nullBlock = { ...batch, blockNumber: null };
    const result = serializeBatchResults([nullBlock]) as Record<string, unknown>[];
    expect((result[0] as Record<string, unknown>).blockNumber).toBeNull();
  });
  it('preserves non-bigint fields', () => {
    const result = serializeBatchResults([batch]) as Record<string, unknown>[];
    expect((result[0] as Record<string, unknown>).batchIndex).toBe(0);
    expect((result[0] as Record<string, unknown>).confirmedTxHash).toBe('0xdef');
  });
});

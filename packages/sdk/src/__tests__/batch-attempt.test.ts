import { describe, it, expect } from 'vitest';
import { batchAttemptToRecord, batchAttemptFromRecord } from '../utils/batch-attempt.js';
import type { BatchAttempt, BatchAttemptRecord } from '../index.js';

const live: BatchAttempt = {
  txHash: '0xabc',
  nonce: 5,
  gasEstimate: 21000n,
  maxFeePerGas: 2_000_000_000n,
  maxPriorityFeePerGas: 1_000_000_000n,
  timestamp: 1_700_000_000_000,
  outcome: 'confirmed',
};

const record: BatchAttemptRecord = {
  txHash: '0xabc',
  nonce: 5,
  maxFeePerGas: '2000000000',
  maxPriorityFeePerGas: '1000000000',
  broadcastAt: 1_700_000_000_000,
  outcome: 'confirmed',
  confirmedBlock: null,
};

describe('batchAttemptToRecord', () => {
  it('encodes bigints as decimal strings and renames timestamp -> broadcastAt', () => {
    expect(batchAttemptToRecord(live)).toEqual(record);
  });

  it('carries optional confirmedBlock + reason through', () => {
    expect(batchAttemptToRecord(live, { confirmedBlock: 123n, reason: 'ok' })).toEqual({
      ...record,
      confirmedBlock: '123',
      reason: 'ok',
    });
  });
});

describe('batchAttemptFromRecord', () => {
  it('parses decimal strings back to bigints', () => {
    const out = batchAttemptFromRecord(record);
    expect(out.maxFeePerGas).toBe(2_000_000_000n);
    expect(out.timestamp).toBe(1_700_000_000_000);
  });
});

describe('BatchAttempt outcome (widened)', () => {
  it('accepts pending', () => {
    const p: BatchAttempt = {
      txHash: '0x0', nonce: 0,
      gasEstimate: 0n, maxFeePerGas: 0n, maxPriorityFeePerGas: 0n,
      timestamp: 0, outcome: 'pending',
    };
    expect(p.outcome).toBe('pending');
  });
});

describe('batchAttemptFromRecord (pending round-trip)', () => {
  it('preserves pending when round-tripping', () => {
    const record = {
      txHash: '0xabc' as const, nonce: 0,
      maxFeePerGas: '0', maxPriorityFeePerGas: '0',
      broadcastAt: 0, outcome: 'pending' as const, confirmedBlock: null,
    };
    expect(batchAttemptFromRecord(record).outcome).toBe('pending');
  });
});

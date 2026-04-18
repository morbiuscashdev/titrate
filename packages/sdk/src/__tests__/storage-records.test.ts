import { describe, it, expect, expectTypeOf } from 'vitest';
import type {
  WalletRecord,
  BatchRecord,
  SweepRecord,
} from '../storage/index.js';
import type {
  BatchAttemptRecord,
  PipelineHistoryEntry,
  LoopErrorEntry,
} from '../index.js';
import type { Address, Hex } from 'viem';

describe('WalletRecord', () => {
  it('derived branch carries coldAddress + derivationIndex', () => {
    const record: WalletRecord = {
      index: 0,
      address: '0x0000000000000000000000000000000000000001' as Address,
      encryptedKey: { ciphertext: 'ct', iv: 'iv', authTag: 'at' },
      kdf: 'scrypt',
      kdfParams: { N: 131072, r: 8, p: 1, salt: 'salt-base64' },
      provenance: {
        type: 'derived',
        coldAddress: '0x0000000000000000000000000000000000000002' as Address,
        derivationIndex: 0,
      },
      createdAt: Date.now(),
    };
    expect(record.provenance.type).toBe('derived');
  });

  it('imported branch has type only', () => {
    const record: WalletRecord = {
      index: 0,
      address: '0x0000000000000000000000000000000000000001' as Address,
      encryptedKey: { ciphertext: 'ct', iv: 'iv', authTag: 'at' },
      kdf: 'scrypt',
      kdfParams: { N: 131072, r: 8, p: 1, salt: 'salt-base64' },
      provenance: { type: 'imported' },
      createdAt: Date.now(),
    };
    expect(record.provenance.type).toBe('imported');
  });
});

describe('BatchRecord', () => {
  it('serializes amounts as decimal strings (BigInt-safe)', () => {
    const record: BatchRecord = {
      batchIndex: 0,
      recipients: ['0x0000000000000000000000000000000000000001' as Address],
      amounts: ['1000000000000000000'],
      status: 'confirmed',
      attempts: [],
      confirmedTxHash: '0xabc' as Hex,
      confirmedBlock: '18000000',
      createdAt: Date.now(),
    };
    expect(record.status).toBe('confirmed');
    expect(typeof record.amounts[0]).toBe('string');
  });
});

describe('SweepRecord', () => {
  it('carries per-wallet sweep outcome', () => {
    const record: SweepRecord = {
      walletIndex: 0,
      walletAddress: '0x0000000000000000000000000000000000000001' as Address,
      balance: '5000000000000000',
      txHash: '0xdef' as Hex,
      error: null,
      createdAt: Date.now(),
    };
    expect(record.error).toBeNull();
  });
});

describe('BatchAttemptRecord', () => {
  it('uses string-encoded bigint fields', () => {
    const r: BatchAttemptRecord = {
      txHash: '0xabc',
      nonce: 0,
      maxFeePerGas: '1000000000',
      maxPriorityFeePerGas: '500000000',
      broadcastAt: Date.now(),
      outcome: 'pending',
      confirmedBlock: null,
    };
    expectTypeOf(r.maxFeePerGas).toEqualTypeOf<string>();
    expectTypeOf(r.confirmedBlock).toEqualTypeOf<string | null>();
  });

  it('allows outcome=pending', () => {
    const r: BatchAttemptRecord = {
      txHash: '0xabc', nonce: 0,
      maxFeePerGas: '0', maxPriorityFeePerGas: '0',
      broadcastAt: 0, outcome: 'pending', confirmedBlock: null,
    };
    expect(r.outcome).toBe('pending');
  });
});

describe('BatchRecord attempts', () => {
  it('has attempts array', () => {
    expectTypeOf<BatchRecord>().toHaveProperty('attempts');
  });
});

describe('PipelineHistoryEntry', () => {
  it('has kind, prior, next, watermark-before/after, qualified-before/after, source', () => {
    const e: PipelineHistoryEntry = {
      timestamp: 0,
      kind: 'initial',
      prior: null,
      next: [],
      watermarkBefore: 0,
      watermarkAfter: 0,
      qualifiedCountBefore: 0,
      qualifiedCountAfter: 0,
      source: 'ui',
    };
    expect(e.kind).toBe('initial');
  });
});

describe('LoopErrorEntry', () => {
  it('captures loop + phase + message + optional context', () => {
    const e: LoopErrorEntry = {
      timestamp: 0,
      loop: 'scanner',
      phase: 'fetch-block',
      message: 'boom',
    };
    expect(e.loop).toBe('scanner');
  });
});

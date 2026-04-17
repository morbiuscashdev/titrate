import { describe, it, expect } from 'vitest';
import type {
  WalletRecord,
  BatchRecord,
  SweepRecord,
} from '../storage/index.js';
import type { Address, Hex } from 'viem';

describe('WalletRecord', () => {
  it('derived branch carries coldAddress + derivationIndex', () => {
    const record: WalletRecord = {
      index: 0,
      address: '0x0000000000000000000000000000000000000001' as Address,
      encryptedKey: 'ciphertext-base64',
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
      encryptedKey: 'ciphertext-base64',
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

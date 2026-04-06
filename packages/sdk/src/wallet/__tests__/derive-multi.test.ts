import { describe, it, expect } from 'vitest';
import {
  deriveHotWallet,
  deriveWalletAtIndex,
  deriveMultipleWallets,
  InvalidSignatureError,
} from '../index.js';

/** A valid 65-byte hex signature for testing. */
const VALID_SIG = ('0x' + 'ab'.repeat(65)) as `0x${string}`;

/** A second distinct valid signature. */
const VALID_SIG_2 = ('0x' + 'cd'.repeat(65)) as `0x${string}`;

// ---------------------------------------------------------------------------
// deriveWalletAtIndex
// ---------------------------------------------------------------------------

describe('deriveWalletAtIndex', () => {
  it('at index 0 matches deriveHotWallet (backward compatibility)', () => {
    const legacy = deriveHotWallet(VALID_SIG);
    const indexed = deriveWalletAtIndex({ signature: VALID_SIG, index: 0 });
    expect(indexed.address).toBe(legacy.address);
    expect(indexed.privateKey).toBe(legacy.privateKey);
  });

  it('different indices produce unique wallets', () => {
    const addresses = new Set<string>();
    for (let i = 0; i < 10; i++) {
      const wallet = deriveWalletAtIndex({ signature: VALID_SIG, index: i });
      addresses.add(wallet.address);
    }
    expect(addresses.size).toBe(10);
  });

  it('is deterministic — same signature + index yields same wallet', () => {
    const a = deriveWalletAtIndex({ signature: VALID_SIG, index: 3 });
    const b = deriveWalletAtIndex({ signature: VALID_SIG, index: 3 });
    expect(a.address).toBe(b.address);
    expect(a.privateKey).toBe(b.privateKey);
  });

  it('returns properly formatted address and private key', () => {
    const wallet = deriveWalletAtIndex({ signature: VALID_SIG, index: 5 });
    expect(wallet.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(wallet.privateKey).toMatch(/^0x[0-9a-fA-F]{64}$/);
  });

  it('throws InvalidSignatureError for empty signature', () => {
    expect(() => deriveWalletAtIndex({ signature: '0x', index: 0 })).toThrow(
      InvalidSignatureError,
    );
  });

  it('throws InvalidSignatureError for too-short signature', () => {
    expect(() =>
      deriveWalletAtIndex({ signature: '0xabcd' as `0x${string}`, index: 0 }),
    ).toThrow(InvalidSignatureError);
  });

  it('different signatures at the same index produce different wallets', () => {
    const a = deriveWalletAtIndex({ signature: VALID_SIG, index: 1 });
    const b = deriveWalletAtIndex({ signature: VALID_SIG_2, index: 1 });
    expect(a.address).not.toBe(b.address);
  });
});

// ---------------------------------------------------------------------------
// deriveMultipleWallets
// ---------------------------------------------------------------------------

describe('deriveMultipleWallets', () => {
  it('returns the correct number of wallets', () => {
    const wallets = deriveMultipleWallets({ signature: VALID_SIG, count: 5 });
    expect(wallets).toHaveLength(5);
  });

  it('defaults offset to 0 — first wallet matches deriveHotWallet', () => {
    const wallets = deriveMultipleWallets({ signature: VALID_SIG, count: 1 });
    const legacy = deriveHotWallet(VALID_SIG);
    expect(wallets[0].address).toBe(legacy.address);
    expect(wallets[0].privateKey).toBe(legacy.privateKey);
  });

  it('respects a custom offset', () => {
    const wallets = deriveMultipleWallets({
      signature: VALID_SIG,
      count: 3,
      offset: 5,
    });
    expect(wallets).toHaveLength(3);

    // Each wallet should match deriveWalletAtIndex at the expected index
    for (let i = 0; i < 3; i++) {
      const expected = deriveWalletAtIndex({
        signature: VALID_SIG,
        index: 5 + i,
      });
      expect(wallets[i].address).toBe(expected.address);
      expect(wallets[i].privateKey).toBe(expected.privateKey);
    }
  });

  it('returns an empty array for count 0', () => {
    const wallets = deriveMultipleWallets({ signature: VALID_SIG, count: 0 });
    expect(wallets).toEqual([]);
  });

  it('all wallets in the batch are unique', () => {
    const wallets = deriveMultipleWallets({ signature: VALID_SIG, count: 20 });
    const addresses = new Set(wallets.map((w) => w.address));
    expect(addresses.size).toBe(20);
  });

  it('is deterministic — same params yield same wallets', () => {
    const a = deriveMultipleWallets({ signature: VALID_SIG, count: 3 });
    const b = deriveMultipleWallets({ signature: VALID_SIG, count: 3 });
    for (let i = 0; i < 3; i++) {
      expect(a[i].address).toBe(b[i].address);
      expect(a[i].privateKey).toBe(b[i].privateKey);
    }
  });
});

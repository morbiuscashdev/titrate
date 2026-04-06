import { describe, it, expect } from 'vitest';
import { zeroPrivateKey } from '../zero.js';
import type { DerivedWallet } from '../derive.js';

describe('zeroPrivateKey', () => {
  it('overwrites privateKey with zeros', () => {
    const wallet: DerivedWallet = {
      address: '0x1111111111111111111111111111111111111111',
      privateKey: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
    };
    const zeroed = zeroPrivateKey(wallet);
    expect(zeroed.privateKey).toBe('0x' + '0'.repeat(64));
    expect(zeroed.address).toBe(wallet.address);
  });

  it('returns a new object (does not mutate input)', () => {
    const wallet: DerivedWallet = {
      address: '0x1111111111111111111111111111111111111111',
      privateKey: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
    };
    const original = wallet.privateKey;
    zeroPrivateKey(wallet);
    expect(wallet.privateKey).toBe(original);
  });
});

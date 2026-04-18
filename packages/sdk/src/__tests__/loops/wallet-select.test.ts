import { describe, it, expect } from 'vitest';
import { selectWallet } from '../../pipeline/loops/wallet-select.js';
import type { Address } from 'viem';

const W1 = '0x1111111111111111111111111111111111111111' as Address;
const W2 = '0x2222222222222222222222222222222222222222' as Address;
const W3 = '0x3333333333333333333333333333333333333333' as Address;

describe('selectWallet', () => {
  it('picks the next wallet after lastIndex (round-robin)', () => {
    const result = selectWallet({
      wallets: [W1, W2, W3],
      lastIndex: 0,
      balances: new Map([[W1, 10n], [W2, 10n], [W3, 10n]]),
      minBalance: 1n,
    });
    expect(result?.address).toBe(W2);
    expect(result?.index).toBe(1);
  });

  it('wraps around past the end', () => {
    const result = selectWallet({
      wallets: [W1, W2, W3],
      lastIndex: 2,
      balances: new Map([[W1, 10n], [W2, 10n], [W3, 10n]]),
      minBalance: 1n,
    });
    expect(result?.address).toBe(W1);
    expect(result?.index).toBe(0);
  });

  it('skips wallets below the min balance threshold', () => {
    const result = selectWallet({
      wallets: [W1, W2, W3],
      lastIndex: 0,
      balances: new Map([[W1, 10n], [W2, 0n], [W3, 10n]]),
      minBalance: 1n,
    });
    expect(result?.address).toBe(W3);
    expect(result?.index).toBe(2);
  });

  it('returns null if no wallet has enough balance', () => {
    const result = selectWallet({
      wallets: [W1, W2],
      lastIndex: 0,
      balances: new Map([[W1, 0n], [W2, 0n]]),
      minBalance: 1n,
    });
    expect(result).toBeNull();
  });

  it('returns null if the pool is empty', () => {
    const result = selectWallet({
      wallets: [],
      lastIndex: -1,
      balances: new Map(),
      minBalance: 1n,
    });
    expect(result).toBeNull();
  });
});

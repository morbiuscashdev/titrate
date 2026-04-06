import type { Hex } from 'viem';
import type { DerivedWallet } from './derive.js';

const ZERO_KEY: Hex = ('0x' + '0'.repeat(64)) as Hex;

/**
 * Returns a copy of the wallet with the private key overwritten by zeros.
 * Call this before dereferencing derived wallets to minimize the window
 * where raw key material sits in the JS heap awaiting garbage collection.
 */
export function zeroPrivateKey(wallet: DerivedWallet): DerivedWallet {
  return { address: wallet.address, privateKey: ZERO_KEY };
}

import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import type { WalletClient } from 'viem';
import type { Hex } from 'viem';

/**
 * Resolves a private key from an explicit flag value or the TITRATE_PRIVATE_KEY
 * environment variable. Throws if neither is available.
 *
 * @param flagValue - The value from --private-key flag (may be undefined)
 * @returns The private key as a hex string
 */
export function resolvePrivateKey(flagValue: string | undefined): Hex {
  const key = flagValue ?? process.env['TITRATE_PRIVATE_KEY'];
  if (!key) {
    throw new Error(
      'Private key required. Pass --private-key or set TITRATE_PRIVATE_KEY env var.',
    );
  }
  return (key.startsWith('0x') ? key : `0x${key}`) as Hex;
}

/**
 * Creates a viem WalletClient from a private key hex string and RPC URL.
 *
 * @param privateKey - Hex-encoded private key (with or without 0x prefix)
 * @param rpcUrl - The RPC endpoint URL
 * @returns A configured WalletClient with the derived account
 */
export function createSignerClient(privateKey: Hex, rpcUrl: string): WalletClient {
  const account = privateKeyToAccount(privateKey);
  return createWalletClient({
    account,
    transport: http(rpcUrl),
  });
}

import type { Address, Hex } from 'viem';
import { keccak256 } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

export type EIP712MessageParams = {
  readonly funder: Address;
  readonly name: string;
  readonly version: number;
};

export type EIP712TypedData = {
  readonly domain: {
    readonly name: string;
    readonly version: string;
    readonly chainId: number;
  };
  readonly types: {
    readonly HotWalletDerivation: readonly { readonly name: string; readonly type: string }[];
  };
  readonly primaryType: 'HotWalletDerivation';
  readonly message: {
    readonly funder: Address;
    readonly name: string;
    readonly version: number;
  };
};

/**
 * Custom error thrown when a signature is invalid (empty or too short).
 * A valid Ethereum signature must be at least 65 bytes (130 hex chars after 0x).
 */
export class InvalidSignatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidSignatureError';
  }
}

/** Minimum valid signature length: 65 bytes = 130 hex chars + 2 for '0x' prefix. */
const MIN_SIG_HEX_LENGTH = 132;

/** All-zero 65-byte signature hex body (without 0x prefix). */
const ZERO_SIG_BODY = '0'.repeat(130);

/**
 * Validates a signature hex string.
 * Throws `InvalidSignatureError` if the signature is empty or too short.
 * Logs a warning if the signature is all zeros (low entropy).
 *
 * @param signature - The hex signature to validate
 * @throws {InvalidSignatureError} When signature is empty (`0x`) or shorter than 65 bytes
 */
function validateSignature(signature: Hex): void {
  if (signature === '0x' || signature.length <= 2) {
    throw new InvalidSignatureError('Signature must not be empty');
  }

  if (signature.length < MIN_SIG_HEX_LENGTH) {
    throw new InvalidSignatureError(
      `Signature too short: expected at least 65 bytes (${MIN_SIG_HEX_LENGTH} hex chars including 0x prefix), got ${signature.length} chars`,
    );
  }

  const body = signature.slice(2);
  if (body === ZERO_SIG_BODY) {
    console.warn(
      '[deriveHotWallet] Warning: all-zero signature detected — this has extremely low entropy and should not be used in production',
    );
  }
}

export function createEIP712Message(params: EIP712MessageParams): EIP712TypedData {
  return {
    domain: { name: 'Titrate', version: '1', chainId: 1 },
    types: {
      HotWalletDerivation: [
        { name: 'funder', type: 'address' },
        { name: 'name', type: 'string' },
        { name: 'version', type: 'uint256' },
      ],
    },
    primaryType: 'HotWalletDerivation',
    message: { funder: params.funder, name: params.name, version: params.version },
  };
}

export type DerivedWallet = {
  readonly address: Address;
  readonly privateKey: Hex;
};

/**
 * Derives a hot wallet from an EIP-712 signature by hashing it with keccak256.
 * The resulting hash is used as the private key.
 *
 * @param signature - A hex-encoded signature (must be at least 65 bytes / 130 hex chars)
 * @throws {InvalidSignatureError} When signature is empty or too short
 * @returns The derived wallet address and private key
 */
export function deriveHotWallet(signature: Hex): DerivedWallet {
  validateSignature(signature);
  const privateKey = keccak256(signature);
  const account = privateKeyToAccount(privateKey);
  return { address: account.address, privateKey };
}

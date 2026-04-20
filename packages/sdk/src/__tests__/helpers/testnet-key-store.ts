import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Address, Hex } from 'viem';
import { bytesToHex } from 'viem';
import { english, generateMnemonic, mnemonicToAccount } from 'viem/accounts';

const HERE = dirname(fileURLToPath(import.meta.url));

/** Absolute path of the gitignored testnet key file inside packages/sdk. */
export const TESTNET_KEY_PATH = resolve(HERE, '..', '..', '..', '.pulsechain-testnet.local.json');

export type TestnetKeyRecord = {
  readonly mnemonic: string;
  readonly address: Address;
  readonly privateKey: Hex;
  readonly createdAt: string;
};

type StoredRecord = Pick<TestnetKeyRecord, 'mnemonic' | 'address' | 'createdAt'>;

function deriveFromMnemonic(mnemonic: string): { readonly address: Address; readonly privateKey: Hex } {
  const account = mnemonicToAccount(mnemonic);
  const hdKey = account.getHdKey();
  if (!hdKey.privateKey) {
    throw new Error('HDKey did not expose a private key — check viem version');
  }
  return {
    address: account.address,
    privateKey: bytesToHex(hdKey.privateKey),
  };
}

/** Reads the persisted testnet key record, or returns null if the file does not exist. */
export function readTestnetKey(): TestnetKeyRecord | null {
  if (!existsSync(TESTNET_KEY_PATH)) return null;
  const raw = JSON.parse(readFileSync(TESTNET_KEY_PATH, 'utf8')) as StoredRecord;
  const derived = deriveFromMnemonic(raw.mnemonic);
  return {
    mnemonic: raw.mnemonic,
    address: derived.address,
    privateKey: derived.privateKey,
    createdAt: raw.createdAt,
  };
}

/**
 * Returns the persisted testnet key, creating one if none exists. The mnemonic
 * is stored on disk (gitignored) so future runs reuse the same funded account
 * instead of generating a fresh address that would re-trigger the faucet
 * cooldown.
 */
export function loadOrCreateTestnetKey(): TestnetKeyRecord {
  const existing = readTestnetKey();
  if (existing) return existing;

  const mnemonic = generateMnemonic(english);
  const derived = deriveFromMnemonic(mnemonic);
  const record: StoredRecord = {
    mnemonic,
    address: derived.address,
    createdAt: new Date().toISOString(),
  };
  writeFileSync(TESTNET_KEY_PATH, `${JSON.stringify(record, null, 2)}\n`);
  return {
    mnemonic,
    address: derived.address,
    privateKey: derived.privateKey,
    createdAt: record.createdAt,
  };
}

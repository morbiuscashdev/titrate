import { describe, it, expect } from 'vitest';
import { createEIP712Message, deriveHotWallet } from '../wallet/index.js';
import { privateKeyToAccount } from 'viem/accounts';

// ---------------------------------------------------------------------------
// Property test helpers
// ---------------------------------------------------------------------------

/** Generates a random 65-byte hex string formatted as a 0x-prefixed Ethereum signature. */
function randomSignature(): `0x${string}` {
  const bytes = new Uint8Array(65);
  crypto.getRandomValues(bytes);
  return ('0x' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')) as `0x${string}`;
}

describe('wallet', () => {
  describe('createEIP712Message', () => {
    it('creates typed data with campaign identity', () => {
      const message = createEIP712Message({
        funder: '0x1234567890abcdef1234567890abcdef12345678',
        name: 'Test Campaign',
        version: 1,
      });
      expect(message.domain.name).toBe('Titrate');
      expect(message.message.funder).toBe('0x1234567890abcdef1234567890abcdef12345678');
      expect(message.message.name).toBe('Test Campaign');
      expect(message.message.version).toBe(1);
    });
  });

  describe('deriveHotWallet', () => {
    it('derives a valid address from a signature', () => {
      const fakeSig = ('0x' + 'ab'.repeat(65)) as `0x${string}`;
      const wallet = deriveHotWallet(fakeSig);
      expect(wallet.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
      expect(wallet.privateKey).toMatch(/^0x[0-9a-fA-F]{64}$/);
    });

    it('is deterministic — same signature produces same wallet', () => {
      const sig = ('0x' + 'cd'.repeat(65)) as `0x${string}`;
      const wallet1 = deriveHotWallet(sig);
      const wallet2 = deriveHotWallet(sig);
      expect(wallet1.address).toBe(wallet2.address);
      expect(wallet1.privateKey).toBe(wallet2.privateKey);
    });

    it('private key derives to the returned address', () => {
      const sig = ('0x' + 'ef'.repeat(65)) as `0x${string}`;
      const wallet = deriveHotWallet(sig);
      const account = privateKeyToAccount(wallet.privateKey);
      expect(account.address.toLowerCase()).toBe(wallet.address.toLowerCase());
    });

    it('different signatures produce different wallets', () => {
      const sig1 = ('0x' + 'aa'.repeat(65)) as `0x${string}`;
      const sig2 = ('0x' + 'bb'.repeat(65)) as `0x${string}`;
      expect(deriveHotWallet(sig1).address).not.toBe(deriveHotWallet(sig2).address);
    });
  });
});

// ---------------------------------------------------------------------------
// Property tests — wallet determinism and collision resistance
// ---------------------------------------------------------------------------

describe('wallet property tests', () => {
  const ITERATIONS = 100;

  describe('prop: determinism — same signature always yields same wallet', () => {
    it(`holds for ${ITERATIONS} random signatures`, () => {
      for (let i = 0; i < ITERATIONS; i++) {
        const sig = randomSignature();
        const first = deriveHotWallet(sig);
        const second = deriveHotWallet(sig);
        expect(first.address).toBe(second.address);
        expect(first.privateKey).toBe(second.privateKey);
      }
    });
  });

  describe('prop: uniqueness — different signatures produce different addresses', () => {
    it(`holds for ${ITERATIONS} random signature pairs`, () => {
      for (let i = 0; i < ITERATIONS; i++) {
        const sigA = randomSignature();
        const sigB = randomSignature();
        // Astronomically unlikely to collide; if they do, keccak256 is broken
        if (sigA !== sigB) {
          expect(deriveHotWallet(sigA).address).not.toBe(deriveHotWallet(sigB).address);
        }
      }
    });
  });

  describe('prop: valid key — derived private key always yields a valid Ethereum address', () => {
    it(`holds for ${ITERATIONS} random signatures`, () => {
      const ethAddressRegex = /^0x[0-9a-fA-F]{40}$/;
      const privateKeyRegex = /^0x[0-9a-fA-F]{64}$/;
      for (let i = 0; i < ITERATIONS; i++) {
        const sig = randomSignature();
        const wallet = deriveHotWallet(sig);

        expect(wallet.address).toMatch(ethAddressRegex);
        expect(wallet.privateKey).toMatch(privateKeyRegex);

        // Cross-verify: the private key must derive to the same address
        const account = privateKeyToAccount(wallet.privateKey);
        expect(account.address.toLowerCase()).toBe(wallet.address.toLowerCase());
      }
    });
  });
});

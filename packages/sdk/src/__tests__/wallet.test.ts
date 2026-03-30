import { describe, it, expect } from 'vitest';
import { createEIP712Message, deriveHotWallet } from '../wallet/index.js';
import { privateKeyToAccount } from 'viem/accounts';

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

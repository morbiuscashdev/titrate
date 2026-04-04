import { describe, it, expect } from 'vitest';
import { encrypt, decrypt, deriveEncryptionKey } from './encrypt.js';

describe('encrypt/decrypt', () => {
  it('roundtrips a string', async () => {
    const key = await deriveEncryptionKey('0x' + 'ab'.repeat(32));
    const ciphertext = await encrypt('hello world', key);
    expect(ciphertext).not.toBe('hello world');
    const plaintext = await decrypt(ciphertext, key);
    expect(plaintext).toBe('hello world');
  });

  it('produces different ciphertext each time (random IV)', async () => {
    const key = await deriveEncryptionKey('0x' + 'ab'.repeat(32));
    const c1 = await encrypt('same input', key);
    const c2 = await encrypt('same input', key);
    expect(c1).not.toBe(c2);
  });

  it('fails to decrypt with wrong key', async () => {
    const key1 = await deriveEncryptionKey('0x' + 'ab'.repeat(32));
    const key2 = await deriveEncryptionKey('0x' + 'cd'.repeat(32));
    const ciphertext = await encrypt('secret', key1);
    await expect(decrypt(ciphertext, key2)).rejects.toThrow();
  });
});

describe('deriveEncryptionKey', () => {
  it('produces same key for same signature (roundtrip test)', async () => {
    const sig = '0x' + 'ff'.repeat(32);
    const k1 = await deriveEncryptionKey(sig);
    const k2 = await deriveEncryptionKey(sig);
    const ct = await encrypt('test', k1);
    const pt = await decrypt(ct, k2);
    expect(pt).toBe('test');
  });
});

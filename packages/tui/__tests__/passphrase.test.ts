import { test, expect } from 'bun:test';
import { encryptPrivateKey, decryptPrivateKey, type EncryptedKey } from '../src/utils/passphrase.ts';

test('encrypt then decrypt round-trips a private key', async () => {
  const passphrase = 'correct horse battery staple';
  const plaintext = '0x' + '11'.repeat(32);
  const encrypted: EncryptedKey = await encryptPrivateKey(plaintext, passphrase);
  expect(encrypted.ciphertext).toBeTruthy();
  expect(encrypted.kdf).toBe('scrypt');
  expect(encrypted.kdfParams.salt).toBeTruthy();

  const decrypted = await decryptPrivateKey(encrypted, passphrase);
  expect(decrypted).toBe(plaintext);
});

test('decrypt rejects wrong passphrase', async () => {
  const encrypted = await encryptPrivateKey('0x' + '11'.repeat(32), 'right');
  await expect(decryptPrivateKey(encrypted, 'wrong')).rejects.toThrow();
});

test('each encryption produces a unique salt and IV', async () => {
  const pass = 'same';
  const pk = '0x' + '11'.repeat(32);
  const a = await encryptPrivateKey(pk, pass);
  const b = await encryptPrivateKey(pk, pass);
  expect(a.kdfParams.salt).not.toBe(b.kdfParams.salt);
  expect(a.iv).not.toBe(b.iv);
  expect(a.ciphertext).not.toBe(b.ciphertext);
});

import { scryptSync, randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

const N = 131072;   // 2^17
const R = 8;
const P = 1;
const KEY_LEN = 32;
const IV_LEN = 12;

export type EncryptedKey = {
  readonly ciphertext: string;
  readonly iv: string;
  readonly authTag: string;
  readonly kdf: 'scrypt';
  readonly kdfParams: {
    readonly N: number;
    readonly r: number;
    readonly p: number;
    readonly salt: string;
  };
};

function toB64(buf: Buffer): string {
  return buf.toString('base64');
}

function fromB64(s: string): Buffer {
  return Buffer.from(s, 'base64');
}

function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return scryptSync(passphrase.normalize('NFKC'), salt, KEY_LEN, { N, r: R, p: P, maxmem: 256 * 1024 * 1024 });
}

/**
 * Encrypt a private key (hex string) with a user passphrase.
 * Uses scrypt for key derivation, AES-256-GCM for authenticated encryption.
 */
export async function encryptPrivateKey(plaintext: string, passphrase: string): Promise<EncryptedKey> {
  const salt = randomBytes(16);
  const key = deriveKey(passphrase, salt);
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    ciphertext: toB64(ct),
    iv: toB64(iv),
    authTag: toB64(authTag),
    kdf: 'scrypt',
    kdfParams: { N, r: R, p: P, salt: toB64(salt) },
  };
}

export async function decryptPrivateKey(encrypted: EncryptedKey, passphrase: string): Promise<string> {
  const salt = fromB64(encrypted.kdfParams.salt);
  const key = deriveKey(passphrase, salt);
  const iv = fromB64(encrypted.iv);
  const authTag = fromB64(encrypted.authTag);
  const ct = fromB64(encrypted.ciphertext);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString('utf8');
}

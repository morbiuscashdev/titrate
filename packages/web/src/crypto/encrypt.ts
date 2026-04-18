import { keccak256 } from 'viem';

export async function deriveEncryptionKey(signature: string): Promise<CryptoKey> {
  const hash = keccak256(signature as `0x${string}`);
  const keyBytes = hexToBytes(hash.slice(2));
  // Pass the Uint8Array directly; its `.buffer` can fail Node 20's native
  // SubtleCrypto instanceof check when tests run in jsdom (cross-realm
  // ArrayBuffer). TypedArrays use brand checks that work across realms.
  // Cast to Uint8Array<ArrayBuffer> because TS 5.7 widens the default to
  // `Uint8Array<ArrayBufferLike>` which includes SharedArrayBuffer;
  // hexToBytes allocates a fresh non-shared ArrayBuffer.
  return crypto.subtle.importKey('raw', keyBytes as Uint8Array<ArrayBuffer>, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function encrypt(plaintext: string, key: CryptoKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return btoa(String.fromCharCode(...combined));
}

export async function decrypt(encoded: string, key: CryptoKey): Promise<string> {
  const combined = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return new TextDecoder().decode(decrypted);
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

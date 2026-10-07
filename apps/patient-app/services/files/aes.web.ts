/**
 * Web implementation of the AES helpers (see `aes.ts`) built on the Web Crypto API.
 *
 * Web Crypto's AES-GCM returns `ciphertext || tag`; we prefix the IV so the combined
 * payload is byte-compatible with the native `iv || ciphertext || tag` layout.
 *
 * NOTE: `crypto.subtle` is only available in secure contexts (HTTPS or localhost).
 */

export interface AesSealed {
  combined: Uint8Array;
  combinedBase64: string;
  ivBase64: string;
  tagBase64: string;
}

export type AesPlaintext = Uint8Array | string;

const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function getSubtle(): SubtleCrypto {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error(
      'Secure file encryption needs a secure connection. Open Clinic EZ over HTTPS (or localhost) and try again.',
    );
  }
  return subtle;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function toBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function importKey(keyBase64: string, usage: 'encrypt' | 'decrypt') {
  return getSubtle().importKey('raw', toBuffer(base64ToBytes(keyBase64)), { name: 'AES-GCM' }, false, [usage]);
}

export async function generateAesKeyBase64(): Promise<string> {
  getSubtle();
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return bytesToBase64(bytes);
}

export async function deriveAesKeyBase64(secret: string): Promise<string> {
  const digest = await getSubtle().digest('SHA-256', toBuffer(new TextEncoder().encode(secret)));
  return bytesToBase64(new Uint8Array(digest));
}

export async function aesEncrypt(plaintext: AesPlaintext, keyBase64: string): Promise<AesSealed> {
  const data = typeof plaintext === 'string' ? base64ToBytes(plaintext) : plaintext;
  const key = await importKey(keyBase64, 'encrypt');
  const iv = new Uint8Array(IV_LENGTH);
  globalThis.crypto.getRandomValues(iv);
  const sealed = new Uint8Array(
    await getSubtle().encrypt({ name: 'AES-GCM', iv: toBuffer(iv), tagLength: TAG_LENGTH * 8 }, key, toBuffer(data)),
  );
  const combined = new Uint8Array(iv.length + sealed.length);
  combined.set(iv, 0);
  combined.set(sealed, iv.length);
  return {
    combined,
    combinedBase64: bytesToBase64(combined),
    ivBase64: bytesToBase64(iv),
    tagBase64: bytesToBase64(sealed.slice(sealed.length - TAG_LENGTH)),
  };
}

export async function aesDecryptBytes(combined: Uint8Array, keyBase64: string): Promise<Uint8Array> {
  const key = await importKey(keyBase64, 'decrypt');
  const iv = combined.slice(0, IV_LENGTH);
  const sealed = combined.slice(IV_LENGTH);
  const plain = await getSubtle().decrypt(
    { name: 'AES-GCM', iv: toBuffer(iv), tagLength: TAG_LENGTH * 8 },
    key,
    toBuffer(sealed),
  );
  return new Uint8Array(plain);
}

export async function aesDecryptBase64(combined: Uint8Array, keyBase64: string): Promise<string> {
  return bytesToBase64(await aesDecryptBytes(combined, keyBase64));
}

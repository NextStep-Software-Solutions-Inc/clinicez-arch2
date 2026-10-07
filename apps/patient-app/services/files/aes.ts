import * as Crypto from 'expo-crypto';
import { Buffer } from 'buffer';

/**
 * AES-256-GCM helpers shared by the file + FRK services.
 *
 * Keys are exchanged as base64 strings. "Combined" payloads use the layout
 * `iv(12) || ciphertext || tag(16)` so ciphertext is interchangeable between the
 * native (expo-crypto) and web (Web Crypto, see `aes.web.ts`) implementations.
 */

export interface AesSealed {
  combined: Uint8Array;
  combinedBase64: string;
  ivBase64: string;
  tagBase64: string;
}

/** Plaintext as raw bytes or as a base64 string (decoded to bytes). */
export type AesPlaintext = Uint8Array | string;

export async function generateAesKeyBase64(): Promise<string> {
  const key = await Crypto.AESEncryptionKey.generate(Crypto.AESKeySize.AES256);
  return key.encoded('base64');
}

/** Derives a 256-bit AES key (base64) from a secret using SHA-256. */
export async function deriveAesKeyBase64(secret: string): Promise<string> {
  const hashHex = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, secret);
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = parseInt(hashHex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytesToBase64(bytes);
}

export async function aesEncrypt(plaintext: AesPlaintext, keyBase64: string): Promise<AesSealed> {
  const key = await Crypto.AESEncryptionKey.import(keyBase64, 'base64');
  const sealed = await Crypto.aesEncryptAsync(plaintext, key);
  return {
    combined: await sealed.combined('bytes'),
    combinedBase64: await sealed.combined('base64'),
    ivBase64: String(await sealed.iv('base64')),
    tagBase64: String(await sealed.tag('base64')),
  };
}

export async function aesDecryptBytes(combined: Uint8Array, keyBase64: string): Promise<Uint8Array> {
  const key = await Crypto.AESEncryptionKey.import(keyBase64, 'base64');
  const sealed = Crypto.AESSealedData.fromCombined(combined, { ivLength: 12, tagLength: 16 });
  return Crypto.aesDecryptAsync(sealed, key, { output: 'bytes' });
}

export async function aesDecryptBase64(combined: Uint8Array, keyBase64: string): Promise<string> {
  const key = await Crypto.AESEncryptionKey.import(keyBase64, 'base64');
  const sealed = Crypto.AESSealedData.fromCombined(combined, { ivLength: 12, tagLength: 16 });
  return Crypto.aesDecryptAsync(sealed, key, { output: 'base64' });
}

export function base64ToBytes(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, 'base64'));
}

export function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

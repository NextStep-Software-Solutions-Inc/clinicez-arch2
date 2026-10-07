import { describe, expect, test } from 'bun:test';
import {
  aesDecryptBase64,
  aesDecryptBytes,
  aesEncrypt,
  base64ToBytes,
  bytesToBase64,
  deriveAesKeyBase64,
  generateAesKeyBase64,
} from '../services/files/aes.web';

describe('aes.web (Web Crypto, interoperable with native layout)', () => {
  test('generates 256-bit keys', async () => {
    const key = await generateAesKeyBase64();
    expect(base64ToBytes(key).length).toBe(32);
    expect(await generateAesKeyBase64()).not.toBe(key);
  });

  test('round-trips bytes and uses iv(12) || ciphertext || tag(16) layout', async () => {
    const key = await generateAesKeyBase64();
    const plain = new TextEncoder().encode('patient lab result - confidential');
    const sealed = await aesEncrypt(plain, key);

    expect(sealed.combined.length).toBe(12 + plain.length + 16);
    expect(base64ToBytes(sealed.ivBase64)).toEqual(sealed.combined.slice(0, 12));
    expect(base64ToBytes(sealed.tagBase64)).toEqual(sealed.combined.slice(sealed.combined.length - 16));
    expect(sealed.combinedBase64).toBe(bytesToBase64(sealed.combined));

    const decrypted = await aesDecryptBytes(sealed.combined, key);
    expect(new TextDecoder().decode(decrypted)).toBe('patient lab result - confidential');
  });

  test('base64 plaintext is decoded to bytes (key wrapping used by MAK/FRK)', async () => {
    const mak = await generateAesKeyBase64();
    const fileKey = await generateAesKeyBase64();
    const wrapped = await aesEncrypt(fileKey, mak); // plaintext is a base64 string
    expect(wrapped.combined.length).toBe(12 + 32 + 16);
    expect(await aesDecryptBase64(base64ToBytes(wrapped.combinedBase64), mak)).toBe(fileKey);
  });

  test('rejects tampered ciphertext and wrong keys', async () => {
    const key = await generateAesKeyBase64();
    const sealed = await aesEncrypt(new Uint8Array([1, 2, 3, 4]), key);

    const tampered = sealed.combined.slice();
    tampered[14] ^= 0xff;
    await expect(aesDecryptBytes(tampered, key)).rejects.toBeDefined();
    await expect(aesDecryptBytes(sealed.combined, await generateAesKeyBase64())).rejects.toBeDefined();
  });

  test('derives a deterministic 256-bit key from a secret (FRK)', async () => {
    const a = await deriveAesKeyBase64('ABCD1234EFGH5678');
    const b = await deriveAesKeyBase64('ABCD1234EFGH5678');
    expect(a).toBe(b);
    expect(base64ToBytes(a).length).toBe(32);
    expect(await deriveAesKeyBase64('OTHER')).not.toBe(a);
  });
});

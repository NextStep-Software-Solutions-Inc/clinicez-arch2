import { describe, expect, it } from 'bun:test';
import { AttachmentHelper } from '../../src/core/attachments/AttachmentHelper';

describe('AttachmentHelper', () => {
  it('identifies PDF magic bytes %PDF-', async () => {
    // 0x25 0x50 0x44 0x46 0x2D (%PDF-)
    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x34]);
    const res = await AttachmentHelper.validateHeaderBytes(pdfBytes, 'lab_result.pdf');
    expect(res.isValid).toBe(true);
    expect(res.mimeType).toBe('application/pdf');
  });

  it('identifies JPEG magic bytes 0xFF 0xD8 0xFF', async () => {
    const jpegBytes = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46]);
    const res = await AttachmentHelper.validateHeaderBytes(jpegBytes, 'skin_lesion.jpg');
    expect(res.isValid).toBe(true);
    expect(res.mimeType).toBe('image/jpeg');
  });

  it('identifies PNG magic bytes 0x89 0x50 0x4E 0x47', async () => {
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    const res = await AttachmentHelper.validateHeaderBytes(pngBytes, 'ecg_strip.png');
    expect(res.isValid).toBe(true);
    expect(res.mimeType).toBe('image/png');
  });

  it('identifies WebP magic bytes RIFF....WEBP', async () => {
    const webpBytes = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, // RIFF
      0x00, 0x00, 0x00, 0x00,
      0x57, 0x45, 0x42, 0x50  // WEBP
    ]);
    const res = await AttachmentHelper.validateHeaderBytes(webpBytes, 'photo.webp');
    expect(res.isValid).toBe(true);
    expect(res.mimeType).toBe('image/webp');
  });

  it('identifies HEIC magic bytes ftyp', async () => {
    const heicBytes = new Uint8Array([
      0x00, 0x00, 0x00, 0x18,
      0x66, 0x74, 0x79, 0x70, // ftyp
      0x68, 0x65, 0x69, 0x63  // heic
    ]);
    const res = await AttachmentHelper.validateHeaderBytes(heicBytes, 'iphone_rx.heic');
    expect(res.isValid).toBe(true);
    expect(res.mimeType).toBe('image/heic');
  });

  it('blocks dangerous executable file extensions even with disguised header', async () => {
    const disguisedBytes = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0]);
    const res = await AttachmentHelper.validateHeaderBytes(disguisedBytes, 'trojan.exe');
    expect(res.isValid).toBe(false);
    expect(res.errorMessage).toContain('Dangerous executable extension');
  });

  it('decrypts AES-256-GCM ciphertext cleanly using WebCrypto', async () => {
    const subtle = crypto.subtle;
    const rawKey = crypto.getRandomValues(new Uint8Array(32));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plaintext = new TextEncoder().encode('Confidential clinical medical record');

    const cryptoKey = await subtle.importKey('raw', rawKey, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
    const encrypted = await subtle.encrypt({ name: 'AES-GCM', iv, tagLength: 128 }, cryptoKey, plaintext);

    // Concat IV + Encrypted (ciphertext + tag)
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(encrypted), iv.length);

    const decryptedBuffer = await AttachmentHelper.decryptAttachment(combined.buffer, rawKey);
    const decryptedText = new TextDecoder().decode(decryptedBuffer);

    expect(decryptedText).toBe('Confidential clinical medical record');
  });
});

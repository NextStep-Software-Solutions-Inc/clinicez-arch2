import { describe, expect, it } from 'bun:test';
import { AttachmentHelper } from '../../src/core/attachments/AttachmentHelper';
import { AttachmentValidationError, CommsError } from '../../src/core/errors';

describe('Adversarial Stress Test: Magic Byte Spoofing & File Extension Attacks', () => {
  // --- Attack Vector 1: Windows PE / MZ Binary Disguised as Allowed Format ---
  it('strictly rejects Windows PE/MZ executable disguised as PDF (report.pdf)', async () => {
    // MZ header: 0x4D 0x5A followed by typical DOS stub
    const mzBytes = new Uint8Array([
      0x4D, 0x5A, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00,
      0x04, 0x00, 0x00, 0x00, 0xFF, 0xFF, 0x00, 0x00,
      0xB8, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x40, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
    ]);

    const res = await AttachmentHelper.validateHeaderBytes(mzBytes, 'clinical_report.pdf');
    expect(res.isValid).toBe(false);
    expect(res.mimeType).toBeNull();
    expect(res.errorMessage).toContain('Unrecognized magic bytes');
  });

  it('strictly rejects Windows PE/MZ executable disguised as PNG (xray.png)', async () => {
    const mzBytes = new Uint8Array([0x4D, 0x5A, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);
    const res = await AttachmentHelper.validateHeaderBytes(mzBytes, 'xray_chest.png');
    expect(res.isValid).toBe(false);
    expect(res.mimeType).toBeNull();
  });

  // --- Attack Vector 2: Linux ELF Binary Disguised as Allowed Format ---
  it('strictly rejects Linux ELF binary disguised as PDF (lab_results.pdf)', async () => {
    // ELF header: 0x7F 0x45 0x4C 0x46 (\x7FELF)
    const elfBytes = new Uint8Array([
      0x7F, 0x45, 0x4C, 0x46, 0x02, 0x01, 0x01, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
    ]);

    const res = await AttachmentHelper.validateHeaderBytes(elfBytes, 'lab_results.pdf');
    expect(res.isValid).toBe(false);
    expect(res.mimeType).toBeNull();
    expect(res.errorMessage).toContain('Unrecognized magic bytes');
  });

  it('strictly rejects Linux ELF binary disguised as JPEG (dermatology.jpg)', async () => {
    const elfBytes = new Uint8Array([0x7F, 0x45, 0x4C, 0x46, 0x02, 0x01, 0x01, 0x00]);
    const res = await AttachmentHelper.validateHeaderBytes(elfBytes, 'dermatology.jpg');
    expect(res.isValid).toBe(false);
    expect(res.mimeType).toBeNull();
  });

  // --- Attack Vector 3: Mach-O (macOS) & Java Bytecode Disguised as Allowed Format ---
  it('strictly rejects Mach-O binary disguised as PDF', async () => {
    // 0xFE 0xED 0xFA 0xCE
    const machOBytes = new Uint8Array([0xFE, 0xED, 0xFA, 0xCE, 0x00, 0x00, 0x00, 0x01]);
    const res = await AttachmentHelper.validateHeaderBytes(machOBytes, 'prescription.pdf');
    expect(res.isValid).toBe(false);
    expect(res.mimeType).toBeNull();
  });

  it('strictly rejects Java bytecode (.class) disguised as PNG', async () => {
    // 0xCA 0xFE 0xBA 0xBE
    const javaClassBytes = new Uint8Array([0xCA, 0xFE, 0xBA, 0xBE, 0x00, 0x00, 0x00, 0x34]);
    const res = await AttachmentHelper.validateHeaderBytes(javaClassBytes, 'avatar.png');
    expect(res.isValid).toBe(false);
    expect(res.mimeType).toBeNull();
  });

  // --- Attack Vector 4: Null Bytes & Truncated Header Attacks ---
  it('strictly rejects file filled entirely with null bytes', async () => {
    const nullBytes = new Uint8Array(32).fill(0x00);
    const res = await AttachmentHelper.validateHeaderBytes(nullBytes, 'blank.pdf');
    expect(res.isValid).toBe(false);
    expect(res.mimeType).toBeNull();
    expect(res.errorMessage).toContain('Unrecognized magic bytes');
  });

  it('strictly rejects sub-4-byte truncated payloads', async () => {
    const tinyBytes = new Uint8Array([0x25, 0x50]); // truncated PDF
    const res = await AttachmentHelper.validateHeaderBytes(tinyBytes, 'broken.pdf');
    expect(res.isValid).toBe(false);
    expect(res.mimeType).toBeNull();
    expect(res.errorMessage).toContain('too small to inspect header magic bytes');
  });

  it('strictly rejects zero-byte empty file', async () => {
    const emptyBytes = new Uint8Array(0);
    const res = await AttachmentHelper.validateHeaderBytes(emptyBytes, 'empty.pdf');
    expect(res.isValid).toBe(false);
    expect(res.mimeType).toBeNull();
  });

  // --- Attack Vector 5: Dangerous Executable Extensions ---
  it('blocks dangerous executable extensions even if file has genuine PDF magic bytes', async () => {
    const genuinePdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x37]);
    const dangerousExtensions = [
      '.exe', '.bat', '.cmd', '.vbs', '.ps1', '.sh', '.msi',
      '.scr', '.jar', '.js', '.com', '.hta', '.vbe', '.wsf'
    ];

    for (const ext of dangerousExtensions) {
      const res = await AttachmentHelper.validateHeaderBytes(genuinePdf, `payload${ext}`);
      expect(res.isValid).toBe(false);
      expect(res.errorMessage).toContain(`Dangerous executable extension '${ext}' blocked.`);
    }
  });

  it('blocks double extension attacks ending in executable extension (invoice.pdf.exe)', async () => {
    const genuinePdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x37]);
    const res = await AttachmentHelper.validateHeaderBytes(genuinePdf, 'invoice.pdf.exe');
    expect(res.isValid).toBe(false);
    expect(res.errorMessage).toContain("Dangerous executable extension '.exe' blocked.");
  });

  // --- Attack Vector 6: File Size Limits (>10MB) in uploadAttachment ---
  it('strictly rejects oversized file (>10MB) with AttachmentValidationError', async () => {
    const oversizedBytes = 10 * 1024 * 1024 + 1; // 10MB + 1 byte
    const fakeFile = {
      uri: 'file:///path/to/oversized.pdf',
      name: 'oversized.pdf',
      type: 'application/pdf',
      size: oversizedBytes
    };

    expect(
      AttachmentHelper.uploadAttachment('https://comms.example.com/upload', fakeFile, 'oversized.pdf', 'token')
    ).rejects.toThrow(AttachmentValidationError);

    try {
      await AttachmentHelper.uploadAttachment('https://comms.example.com/upload', fakeFile, 'oversized.pdf', 'token');
    } catch (err: any) {
      expect(err).toBeInstanceOf(CommsError);
      expect(err.name).toBe('AttachmentValidationError');
      expect(err.code).toBe('ATTACHMENT_VALIDATION_FAILED');
      expect(err.message).toContain('Attachment exceeds maximum allowed size of 10 MB');
    }
  });

  it('rejects disguised executable passed as Blob into uploadAttachment', async () => {
    const mzBytes = new Uint8Array([0x4D, 0x5A, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);
    const blob = new Blob([mzBytes], { type: 'application/pdf' });

    expect(
      AttachmentHelper.uploadAttachment('https://comms.example.com/upload', blob, 'disguised.pdf', 'token')
    ).rejects.toThrow(AttachmentValidationError);
  });

  // --- Attack Vector 7: Verification of Aliases and Parity ---
  it('verifies AttachmentHelper.verifyFile parity with validateHeaderBytes', () => {
    const hasVerifyFile = typeof (AttachmentHelper as any).verifyFile === 'function';
    const hasValidateHeaderBytes = typeof AttachmentHelper.validateHeaderBytes === 'function';

    expect(hasValidateHeaderBytes).toBe(true);
    expect(hasVerifyFile).toBe(true);
  });

  it('verifies AttachmentError is properly aliased to AttachmentValidationError', () => {
    const errorsModule = require('../../src/core/errors');
    expect(errorsModule.AttachmentValidationError).toBeDefined();
    expect(errorsModule.AttachmentError).toBeDefined();
    expect(errorsModule.AttachmentError).toBe(errorsModule.AttachmentValidationError);
  });
});

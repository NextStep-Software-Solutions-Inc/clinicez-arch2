import { describe, expect, test } from 'bun:test';
import {
  UPLOAD_ALLOWED_MIME_TYPES,
  UPLOAD_MAX_BYTES,
  formatBytes,
  validateUploadFile,
} from '../services/documents/uploadRules';
import { sanitizeTitleFromFileName } from '../services/records/categories';

describe('File Size Validation (25 MB boundary)', () => {
  test('UPLOAD_MAX_BYTES is exactly 25 MB (26,214,400 bytes)', () => {
    expect(UPLOAD_MAX_BYTES).toBe(25 * 1024 * 1024);
  });

  test('accepts valid sizes <= 25 MB', () => {
    // 0 bytes
    expect(validateUploadFile({ mimeType: 'application/pdf', size: 0 })).toBeNull();
    // 1 KB
    expect(validateUploadFile({ mimeType: 'application/pdf', size: 1024 })).toBeNull();
    // 10 MB
    expect(validateUploadFile({ mimeType: 'application/pdf', size: 10 * 1024 * 1024 })).toBeNull();
    // 24.9 MB
    expect(validateUploadFile({ mimeType: 'image/jpeg', size: 24.9 * 1024 * 1024 })).toBeNull();
    // Exact 25 MB boundary
    expect(validateUploadFile({ mimeType: 'image/png', size: 25 * 1024 * 1024 })).toBeNull();
  });

  test('rejects files strictly greater than 25 MB with clear error message', () => {
    // 25 MB + 1 byte
    const overOneByte = validateUploadFile({
      mimeType: 'application/pdf',
      size: 25 * 1024 * 1024 + 1,
    });
    expect(overOneByte).not.toBeNull();
    expect(overOneByte).toContain('25.0 MB');

    // 50 MB
    const fiftyMb = validateUploadFile({
      mimeType: 'image/jpeg',
      size: 50 * 1024 * 1024,
    });
    expect(fiftyMb).not.toBeNull();
    expect(fiftyMb).toContain('50.0 MB');
    expect(fiftyMb).toContain('The limit is 25.0 MB');
  });

  test('tolerates null or undefined size gracefully', () => {
    expect(validateUploadFile({ mimeType: 'application/pdf', size: null })).toBeNull();
    expect(validateUploadFile({ mimeType: 'application/pdf', size: undefined })).toBeNull();
  });
});

describe('MIME Type Gating', () => {
  test('UPLOAD_ALLOWED_MIME_TYPES includes all 6 approved clinical formats', () => {
    expect(UPLOAD_ALLOWED_MIME_TYPES).toContain('application/pdf');
    expect(UPLOAD_ALLOWED_MIME_TYPES).toContain('image/jpeg');
    expect(UPLOAD_ALLOWED_MIME_TYPES).toContain('image/png');
    expect(UPLOAD_ALLOWED_MIME_TYPES).toContain('image/webp');
    expect(UPLOAD_ALLOWED_MIME_TYPES).toContain('image/heic');
    expect(UPLOAD_ALLOWED_MIME_TYPES).toContain('image/heif');
  });

  test('accepts all allowed MIME types case-insensitively', () => {
    expect(validateUploadFile({ mimeType: 'application/pdf', size: 100 })).toBeNull();
    expect(validateUploadFile({ mimeType: 'APPLICATION/PDF', size: 100 })).toBeNull();
    expect(validateUploadFile({ mimeType: 'image/jpeg', size: 100 })).toBeNull();
    expect(validateUploadFile({ mimeType: 'IMAGE/JPEG', size: 100 })).toBeNull();
    expect(validateUploadFile({ mimeType: 'image/png', size: 100 })).toBeNull();
    expect(validateUploadFile({ mimeType: 'image/webp', size: 100 })).toBeNull();
    expect(validateUploadFile({ mimeType: 'IMAGE/WEBP', size: 100 })).toBeNull();
    expect(validateUploadFile({ mimeType: 'image/heic', size: 100 })).toBeNull();
    expect(validateUploadFile({ mimeType: 'image/heif', size: 100 })).toBeNull();
  });

  test('rejects unauthorized MIME types with actionable guidance', () => {
    const zipErr = validateUploadFile({ mimeType: 'application/zip', size: 100 });
    expect(zipErr).toContain('Unsupported file type');

    const videoErr = validateUploadFile({ mimeType: 'video/mp4', size: 100 });
    expect(videoErr).toContain('Unsupported file type');

    const txtErr = validateUploadFile({ mimeType: 'text/plain', size: 100 });
    expect(txtErr).toContain('Unsupported file type');

    const audioErr = validateUploadFile({ mimeType: 'audio/mpeg', size: 100 });
    expect(audioErr).toContain('Unsupported file type');

    const nullErr = validateUploadFile({ mimeType: null, size: 100 });
    expect(nullErr).toContain('Unsupported file type');

    const undefinedErr = validateUploadFile({ mimeType: undefined, size: 100 });
    expect(undefinedErr).toContain('Unsupported file type');
  });
});

describe('File Title Sanitization', () => {
  test('strips extensions cleanly', () => {
    expect(sanitizeTitleFromFileName('Complete_Blood_Count.pdf')).toBe('Complete Blood Count');
    expect(sanitizeTitleFromFileName('Chest-XRay-PA.jpeg')).toBe('Chest XRay PA');
    expect(sanitizeTitleFromFileName('lab_report.webp')).toBe('lab report');
  });

  test('replaces separators and condenses whitespace', () => {
    expect(sanitizeTitleFromFileName('patient___urinalysis---routine...test.png')).toBe(
      'patient urinalysis routine test'
    );
  });

  test('falls back to default title for blank or extension-only names', () => {
    expect(sanitizeTitleFromFileName('.pdf')).toBe('Medical Record');
    expect(sanitizeTitleFromFileName('   ')).toBe('Medical Record');
  });

  test('truncates extremely long names to 200 characters max', () => {
    const longName = 'A'.repeat(300) + '.pdf';
    const sanitized = sanitizeTitleFromFileName(longName);
    expect(sanitized.length).toBeLessThanOrEqual(200);
  });
});

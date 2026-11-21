import * as documentOpener from '../services/documentOpener';
import type { AvailmentSlipResponse } from '../services/clinicService';

function decodeBase64ToBytes(base64: string): Uint8Array {
  const cleaned = base64.replace(/^data:[^;]+;base64,/, '').replace(/\s+/g, '');
  if (typeof atob === 'function') {
    const binary = atob(cleaned);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  const Buf = (globalThis as { Buffer?: { from(s: string, enc: string): Uint8Array } }).Buffer;
  if (Buf) {
    return new Uint8Array(Buf.from(cleaned, 'base64'));
  }
  throw new Error('Unable to decode PDF slip in this environment.');
}

/**
 * Decodes a base64 PhilHealth confirmation / availment slip PDF and opens or shares it.
 */
export async function openAvailmentSlipPdf(slip: AvailmentSlipResponse): Promise<boolean> {
  if (!slip?.pdf_base64) return false;
  const bytes = decodeBase64ToBytes(slip.pdf_base64);
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const mimeType = slip.mime_type || 'application/pdf';
  const blob = new Blob([buffer], { type: mimeType });
  if (typeof documentOpener.openDocumentBlob === 'function') {
    return Promise.resolve(documentOpener.openDocumentBlob(blob, mimeType));
  }
  if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function' && typeof window !== 'undefined') {
    const objectUrl = URL.createObjectURL(blob);
    window.open(objectUrl, '_blank', 'noopener,noreferrer');
    return true;
  }
  return false;
}

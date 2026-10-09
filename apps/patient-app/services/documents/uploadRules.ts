/** Upload limits mirrored from patient-api (`<= 10 MB, pdf/jpeg/png/heic`). */

export const UPLOAD_MAX_BYTES = 10 * 1024 * 1024;

export const UPLOAD_ALLOWED_MIME_TYPES: readonly string[] = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/heif',
];

export const UPLOAD_LIMITS_HINT = 'PDF, JPEG, PNG or HEIC, up to 10 MB.';

export interface UploadCandidate {
  mimeType: string | null | undefined;
  size: number | null | undefined;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Returns a user-facing error, or null when the file may be uploaded. */
export function validateUploadFile(file: UploadCandidate): string | null {
  const mimeType = file.mimeType?.toLowerCase() ?? '';
  if (!UPLOAD_ALLOWED_MIME_TYPES.includes(mimeType)) {
    return `Unsupported file type. Allowed: ${UPLOAD_LIMITS_HINT}`;
  }
  if (file.size !== null && file.size !== undefined && file.size > UPLOAD_MAX_BYTES) {
    return `This file is ${formatBytes(file.size)}. The limit is ${formatBytes(UPLOAD_MAX_BYTES)}.`;
  }
  return null;
}

/** Maps patient-api upload/submit failures to guidance; `fallback` is the server message for other statuses. */
export function uploadFailureMessage(status: number, fallback: string): string {
  switch (status) {
    case 0:
      return 'No connection. Check your internet and try again.';
    case 404:
      return 'This request could not be found. Pull down on the inbox to refresh.';
    case 409:
      return 'This has already been recorded. Pull down on the inbox to refresh.';
    case 413:
      return `The file is too large. The limit is ${formatBytes(UPLOAD_MAX_BYTES)}.`;
    case 415:
      return `Unsupported file type. Allowed: ${UPLOAD_LIMITS_HINT}`;
    default:
      return fallback;
  }
}

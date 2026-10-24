import { blobStorage } from '../storage';

export interface UploadFile {
  uri: string;
  name: string;
  mimeType: string;
}

const URL_SCHEME_PATTERN = /^(blob:|data:|https?:|file:)/i;

function isWebEnvironment(): boolean {
  if (typeof window !== 'undefined') return true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('react-native').Platform?.OS === 'web';
  } catch {
    return true;
  }
}

/**
 * Appends a picked or offline-cached file to a multipart body.
 * On Web, offline queue items store an IndexedDB blobStorage key (e.g. `<patientId>/records/<id>.jpg`)
 * rather than an HTTP/blob URL — read binary bytes directly from `blobStorage` instead of calling
 * `fetch(relativeKey)` (which would hit the SPA index.html fallback).
 * Native uses React Native's `{ uri, name, type }` file descriptor.
 */
export async function appendFilePart(form: FormData, field: string, file: UploadFile): Promise<void> {
  if (isWebEnvironment()) {
    const contentType = file.mimeType || 'application/octet-stream';

    if (!URL_SCHEME_PATTERN.test(file.uri)) {
      const bytes = await blobStorage.getBlobBytes(file.uri);
      if (!bytes) {
        throw new Error(`Cached upload file "${file.name}" was not found in local storage.`);
      }
      const buffer = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength
      ) as ArrayBuffer;
      form.append(field, new Blob([buffer], { type: contentType }), file.name);
      return;
    }

    const response = await fetch(file.uri);
    if (!response.ok) {
      throw new Error(`Unable to read local file "${file.name}" (HTTP ${response.status}).`);
    }
    const rawBlob = await response.blob();
    const typedBlob =
      !rawBlob.type || rawBlob.type === 'application/octet-stream'
        ? rawBlob.slice(0, rawBlob.size, contentType)
        : rawBlob;
    form.append(field, typedBlob, file.name);
    return;
  }
  form.append(field, { uri: file.uri, name: file.name, type: file.mimeType } as unknown as Blob);
}

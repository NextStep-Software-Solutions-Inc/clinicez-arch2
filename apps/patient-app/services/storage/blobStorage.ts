export type AuthTokenProvider = (options?: { skipCache?: boolean }) => Promise<string | null>;

export class BlobFetchError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'BlobFetchError';
    this.status = status;
  }
}

export function isUnauthorizedBlobError(err: unknown): boolean {
  if (err instanceof BlobFetchError && err.status === 401) {
    return true;
  }
  return err instanceof Error && /\bHTTP\s+401\b/i.test(err.message);
}

export async function downloadBlobWithAuthRetry(params: {
  blobKey: string;
  remoteUrl: string;
  getToken?: AuthTokenProvider;
  storage: Pick<IBlobStorage, 'downloadAndSaveBlob'>;
}): Promise<string> {
  if (!params.getToken) {
    throw new Error('Sign in and connect to the internet to open this file.');
  }

  const token = await params.getToken();
  if (!token || !token.trim()) {
    throw new Error('Your session has expired or is not ready. Please sign in again to open this file.');
  }

  try {
    return await params.storage.downloadAndSaveBlob(params.blobKey, params.remoteUrl, token);
  } catch (err) {
    if (!isUnauthorizedBlobError(err)) {
      throw err;
    }

    const freshToken = await params.getToken({ skipCache: true });
    if (!freshToken || !freshToken.trim()) {
      throw new Error('Your session has expired. Please sign in again to open this file.');
    }

    try {
      return await params.storage.downloadAndSaveBlob(params.blobKey, params.remoteUrl, freshToken);
    } catch (retryErr) {
      if (isUnauthorizedBlobError(retryErr)) {
        throw new Error('Unable to authorize file download (HTTP 401). Please sign out and sign back in.');
      }
      throw retryErr;
    }
  }
}

export interface BlobMetadata {
  blobKey: string;
  mimeType: string;
  sizeBytes: number;
}

export interface IBlobStorage {
  /** Saves binary data to local offline sandbox, returning a consumable local path/key */
  saveBlob(blobKey: string, data: ArrayBuffer | Uint8Array | Blob, mimeType: string): Promise<string>;

  /** Copies a local filesystem URI or fetches a local blob URL into permanent sandbox storage */
  saveBlobFromUri(blobKey: string, sourceUri: string): Promise<string>;

  /** Downloads a remote binary stream directly to local offline sandbox */
  downloadAndSaveBlob(blobKey: string, remoteUrl: string, token: string | null): Promise<string>;

  /** Retrieves a local URI or Object URL suitable for <Image>, <PDF>, or external viewing */
  getBlobUri(blobKey: string, mimeType?: string): Promise<string | null>;

  /** Releases a previously minted transient Object URL (no-op on native file URIs) */
  revokeBlobUri?(uri: string): void;

  /** Reads raw bytes of a cached blob */
  getBlobBytes(blobKey: string): Promise<Uint8Array | null>;

  /** Checks if a blob exists in local offline storage */
  hasBlob(blobKey: string): Promise<boolean>;

  /** Deletes a blob from local storage */
  deleteBlob(blobKey: string): Promise<void>;

  /** Clears cache for a patient or entirely */
  clearCache(patientId?: string): Promise<void>;
}

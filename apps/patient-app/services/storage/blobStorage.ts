export interface BlobMetadata {
  blobKey: string;
  mimeType: string;
  sizeBytes: number;
}

export interface IBlobStorage {
  /** Saves binary data to local offline sandbox, returning a consumable local path/key */
  saveBlob(blobKey: string, data: ArrayBuffer | Uint8Array | Blob, mimeType: string): Promise<string>;

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

import type { IBlobStorage } from './blobStorage';

const IDB_BLOB_DB = 'ClinicEzPatientBlobs';
const IDB_BLOB_STORE = 'blobs';
const activeObjectUrls = new Map<string, string>();
const inMemoryStore = new Map<string, { blob: Blob; mimeType: string; size: number }>();

function hasIndexedDb(): boolean {
  return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
}

function openBlobIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!hasIndexedDb()) {
      return reject(new Error('IndexedDB not available'));
    }
    const req = window.indexedDB.open(IDB_BLOB_DB, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(IDB_BLOB_STORE)) {
        req.result.createObjectStore(IDB_BLOB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export const webBlobStorage: IBlobStorage = {
  async saveBlob(blobKey: string, data: ArrayBuffer | Uint8Array | Blob, mimeType: string): Promise<string> {
    const blob = data instanceof Blob ? data : new Blob([data as any], { type: mimeType });
    if (!hasIndexedDb()) {
      inMemoryStore.set(blobKey, { blob, mimeType, size: blob.size });
      return blobKey;
    }
    try {
      const idb = await openBlobIdb();
      await new Promise<void>((resolve, reject) => {
        const tx = idb.transaction(IDB_BLOB_STORE, 'readwrite');
        const store = tx.objectStore(IDB_BLOB_STORE);
        const req = store.put({ blob, mimeType, size: blob.size, savedAt: Date.now() }, blobKey);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
      idb.close();
      return blobKey;
    } catch {
      inMemoryStore.set(blobKey, { blob, mimeType, size: blob.size });
      return blobKey;
    }
  },

  async downloadAndSaveBlob(blobKey: string, remoteUrl: string, token: string | null): Promise<string> {
    const response = await fetch(remoteUrl, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!response.ok) {
      throw new Error(`Blob fetch failed: HTTP ${response.status}`);
    }
    const blob = await response.blob();
    return this.saveBlob(blobKey, blob, blob.type || 'application/octet-stream');
  },

  async getBlobUri(blobKey: string, mimeType?: string): Promise<string | null> {
    if (activeObjectUrls.has(blobKey)) {
      return activeObjectUrls.get(blobKey)!;
    }
    let blob: Blob | null = null;
    if (hasIndexedDb()) {
      try {
        const idb = await openBlobIdb();
        const record = await new Promise<any>((resolve) => {
          const tx = idb.transaction(IDB_BLOB_STORE, 'readonly');
          const store = tx.objectStore(IDB_BLOB_STORE);
          const req = store.get(blobKey);
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(null);
        });
        idb.close();
        if (record?.blob) {
          blob = record.blob instanceof Blob ? record.blob : new Blob([record.blob], { type: mimeType || record.mimeType });
        }
      } catch {
        // Fall back to in-memory store
      }
    }
    if (!blob && inMemoryStore.has(blobKey)) {
      blob = inMemoryStore.get(blobKey)!.blob;
    }
    if (!blob) return null;

    if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
      const objectUrl = URL.createObjectURL(blob);
      activeObjectUrls.set(blobKey, objectUrl);
      return objectUrl;
    }
    return blobKey;
  },

  async getBlobBytes(blobKey: string): Promise<Uint8Array | null> {
    let blob: Blob | null = null;
    if (hasIndexedDb()) {
      try {
        const idb = await openBlobIdb();
        const record = await new Promise<any>((resolve) => {
          const tx = idb.transaction(IDB_BLOB_STORE, 'readonly');
          const store = tx.objectStore(IDB_BLOB_STORE);
          const req = store.get(blobKey);
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(null);
        });
        idb.close();
        if (record?.blob) {
          blob = record.blob instanceof Blob ? record.blob : new Blob([record.blob], { type: record.mimeType });
        }
      } catch {
        // Fall back to in-memory store
      }
    }
    if (!blob && inMemoryStore.has(blobKey)) {
      blob = inMemoryStore.get(blobKey)!.blob;
    }
    if (!blob) return null;
    return new Uint8Array(await blob.arrayBuffer());
  },

  async hasBlob(blobKey: string): Promise<boolean> {
    if (inMemoryStore.has(blobKey)) return true;
    if (!hasIndexedDb()) return false;
    try {
      const idb = await openBlobIdb();
      const exists = await new Promise<boolean>((resolve) => {
        const tx = idb.transaction(IDB_BLOB_STORE, 'readonly');
        const store = tx.objectStore(IDB_BLOB_STORE);
        const req = store.count(blobKey);
        req.onsuccess = () => resolve(req.result > 0);
        req.onerror = () => resolve(false);
      });
      idb.close();
      return exists;
    } catch {
      return false;
    }
  },

  async deleteBlob(blobKey: string): Promise<void> {
    inMemoryStore.delete(blobKey);
    if (activeObjectUrls.has(blobKey)) {
      if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
        URL.revokeObjectURL(activeObjectUrls.get(blobKey)!);
      }
      activeObjectUrls.delete(blobKey);
    }
    if (!hasIndexedDb()) return;
    try {
      const idb = await openBlobIdb();
      await new Promise<void>((resolve, reject) => {
        const tx = idb.transaction(IDB_BLOB_STORE, 'readwrite');
        const store = tx.objectStore(IDB_BLOB_STORE);
        const req = store.delete(blobKey);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
      idb.close();
    } catch {
      // Ignore idb delete errors
    }
  },

  async clearCache(patientId?: string): Promise<void> {
    for (const [key, url] of activeObjectUrls.entries()) {
      if (!patientId || key.startsWith(`${patientId}/`)) {
        if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
          URL.revokeObjectURL(url);
        }
        activeObjectUrls.delete(key);
      }
    }
    for (const key of inMemoryStore.keys()) {
      if (!patientId || key.startsWith(`${patientId}/`)) {
        inMemoryStore.delete(key);
      }
    }
    if (!hasIndexedDb()) return;
    try {
      const idb = await openBlobIdb();
      const tx = idb.transaction(IDB_BLOB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_BLOB_STORE);
      if (!patientId) {
        store.clear();
      } else {
        const req = store.openCursor();
        req.onsuccess = () => {
          const cursor = req.result;
          if (cursor) {
            if (String(cursor.key).startsWith(`${patientId}/`)) {
              cursor.delete();
            }
            cursor.continue();
          }
        };
      }
      idb.close();
    } catch {
      // Ignore clearCache errors
    }
  },
};

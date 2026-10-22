import { Directory, File, Paths } from 'expo-file-system';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import type { IBlobStorage } from './blobStorage';

const BASE_BLOB_DIR = 'ClinicEZ-blobs';

function parseBlobKey(blobKey: string): { patientId: string; subfolder: string; fileName: string } {
  const parts = blobKey.split('/');
  if (parts.length >= 3) {
    return {
      patientId: parts[0],
      subfolder: parts[1],
      fileName: parts.slice(2).join('/'),
    };
  }
  if (parts.length === 2) {
    return {
      patientId: parts[0],
      subfolder: 'records',
      fileName: parts[1],
    };
  }
  return {
    patientId: 'default',
    subfolder: 'records',
    fileName: blobKey,
  };
}

function getPatientDir(patientId: string, subfolder = 'records'): Directory {
  const dir = new Directory(Paths.document, BASE_BLOB_DIR, patientId, subfolder);
  if (!dir.exists) {
    dir.create({ intermediates: true, idempotent: true });
  }
  return dir;
}

export const nativeBlobStorage: IBlobStorage = {
  async saveBlob(blobKey: string, data: ArrayBuffer | Uint8Array | Blob, _mimeType: string): Promise<string> {
    const { patientId, subfolder, fileName } = parseBlobKey(blobKey);
    const dir = getPatientDir(patientId, subfolder);
    const file = new File(dir, fileName);
    let bytes: Uint8Array;
    if (data instanceof Uint8Array) {
      bytes = data;
    } else if (data instanceof ArrayBuffer) {
      bytes = new Uint8Array(data);
    } else if (typeof (data as any).arrayBuffer === 'function') {
      bytes = new Uint8Array(await (data as Blob).arrayBuffer());
    } else {
      bytes = new Uint8Array();
    }
    file.write(bytes);
    return file.uri;
  },

  async downloadAndSaveBlob(blobKey: string, remoteUrl: string, token: string | null): Promise<string> {
    const { patientId, subfolder, fileName } = parseBlobKey(blobKey);
    const dir = getPatientDir(patientId, subfolder);
    const file = new File(dir, fileName);

    const result = await FileSystemLegacy.downloadAsync(remoteUrl, file.uri, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

    if (result.status < 200 || result.status >= 300) {
      throw new Error(`Failed to download blob: HTTP ${result.status}`);
    }
    return file.uri;
  },

  async getBlobUri(blobKey: string): Promise<string | null> {
    const { patientId, subfolder, fileName } = parseBlobKey(blobKey);
    const dir = getPatientDir(patientId, subfolder);
    const file = new File(dir, fileName);
    return file.exists ? file.uri : null;
  },

  async getBlobBytes(blobKey: string): Promise<Uint8Array | null> {
    const { patientId, subfolder, fileName } = parseBlobKey(blobKey);
    const dir = getPatientDir(patientId, subfolder);
    const file = new File(dir, fileName);
    return file.exists ? await file.bytes() : null;
  },

  async hasBlob(blobKey: string): Promise<boolean> {
    const { patientId, subfolder, fileName } = parseBlobKey(blobKey);
    const dir = getPatientDir(patientId, subfolder);
    const file = new File(dir, fileName);
    return file.exists;
  },

  async deleteBlob(blobKey: string): Promise<void> {
    const { patientId, subfolder, fileName } = parseBlobKey(blobKey);
    const dir = getPatientDir(patientId, subfolder);
    const file = new File(dir, fileName);
    if (file.exists) {
      file.delete();
    }
  },

  async clearCache(patientId?: string): Promise<void> {
    if (patientId) {
      const patientRoot = new Directory(Paths.document, BASE_BLOB_DIR, patientId);
      if (patientRoot.exists) {
        patientRoot.delete();
      }
    } else {
      const root = new Directory(Paths.document, BASE_BLOB_DIR);
      if (root.exists) {
        root.delete();
      }
    }
  },
};

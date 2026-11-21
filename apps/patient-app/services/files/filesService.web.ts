import { eq } from 'drizzle-orm';
import { mutate } from 'swr';
import { filesMetadata } from '@db/schema/filesMetadata';
import type {
  ImportFilesInput,
  PreparedPreviewFile,
  SyncPendingFilesResult,
  WebPickedFile,
} from './types';
import * as shared from './filesShared';
import {
  extensionFromMime,
  extensionFromName,
  findBestFileType,
  formatBytes,
  getCachedDocumentTypes,
  getFileById,
  getPreviewKind,
  mimeFromExtension,
  normalizeExtension,
  pullRemoteChanges,
  pushPendingMetadata,
  type RefreshDocumentTypesOptions,
} from './filesShared';
import { resolveDocumentTypeId } from './documentTypeMapping';
import { compressWebBlobForUpload } from './fileCompression';
import { getPatientRecordStreamUrl } from '../api/filesApi';
import { blobStorage } from '../storage';
import { enqueueOfflineRecordUpload, drainUploadQueue } from '../sync/uploadQueueService';

/**
 * Web (offline-first) implementation of the files service.
 * Binary data is stored locally in IndexedDB (ClinicEzPatientBlobs), and metadata in sql.js SQLite.
 * Uploads are deferred through uploadQueueService and sent to POST /patients/{patientId}/records.
 */

type GetToken = () => Promise<string | null>;

const FILES_KEY = (key: unknown) => Array.isArray(key) && key[0] === 'files-browser';

// ---------------------------------------------------------------------------
// Shared pass-through exports (identical API to the native service)
// ---------------------------------------------------------------------------

export {
  getFileById,
  formatBytes,
  getFileConfig,
  getTypeExtensions,
  getCachedDocumentTypes,
  getActiveDocumentTypes,
  reconcileDocumentTypes,
} from './filesShared';

let lastGetToken: GetToken | undefined;
const rememberToken = (getToken?: GetToken) => {
  if (getToken) lastGetToken = getToken;
};

let syncTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleSync(patientId: string) {
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncTimer = null;
    syncPendingFiles(patientId, lastGetToken, true)
      .catch((error) => console.warn('Files sync failed', error))
      .finally(() => mutate(FILES_KEY));
  }, 250);
}

export async function refreshDocumentTypes(
  patientId: string,
  getToken?: GetToken,
  options?: RefreshDocumentTypesOptions
) {
  rememberToken(getToken);
  return shared.refreshDocumentTypes(patientId, getToken, options);
}

export async function listFolderContents(
  patientId: string,
  folderId?: string | null,
  query = '',
  getToken?: GetToken,
) {
  rememberToken(getToken);
  return shared.listFolderContents(patientId, folderId, query, getToken);
}

export async function getStorageOverview(patientId: string, getToken?: GetToken) {
  rememberToken(getToken);
  return shared.getStorageOverview(patientId, getToken);
}

export async function renameFile(patientId: string, fileId: string, name: string) {
  await shared.renameFile(patientId, fileId, name);
  scheduleSync(patientId);
}

export async function deleteItem(
  patientId: string,
  itemKindOrId: string,
  maybeId?: string | (() => Promise<string | null>),
  getToken?: GetToken
) {
  const token = typeof maybeId === 'function' ? maybeId : (getToken ?? lastGetToken);
  await shared.deleteItem(patientId, itemKindOrId, maybeId, token);
  const targetId = typeof maybeId === 'string' ? maybeId : itemKindOrId;
  await cleanupPreviewCache(patientId, targetId);
  scheduleSync(patientId);
}

// ---------------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------------

export async function importFiles(input: ImportFilesInput): Promise<string[]> {
  if (!input.files.length) throw new Error('Choose at least one file to upload.');
  const getToken = input.getToken;
  rememberToken(getToken);

  const [config, types] = await Promise.all([
    shared.getFileConfig(input.patientId, getToken),
    shared.refreshDocumentTypes(input.patientId, getToken),
  ]);
  const sizeOf = (item: ImportFilesInput['files'][number]) => item.sizeBytes ?? item.file.size ?? 0;

  if (input.files.some((item) => sizeOf(item) > config.maxFileSizeBytes)) {
    throw new Error(`A file is larger than the configured ${formatBytes(config.maxFileSizeBytes)} limit.`);
  }

  const importedIds: string[] = [];

  for (const picked of input.files) {
    const source = picked.file as WebPickedFile;
    const requestedName = picked.name ?? source.name ?? `Upload ${importedIds.length + 1}`;
    let extension = normalizeExtension(extensionFromName(requestedName));
    const mimeType = picked.mimeType || source.type || mimeFromExtension(extension);
    if (!extension && mimeType) extension = extensionFromMime(mimeType);
    const fileType = findBestFileType(input.documentTypeId, extension, mimeType, types);
    const arrayBuffer = await source.arrayBuffer();
    const rawBlob = new Blob([arrayBuffer], { type: mimeType || 'application/octet-stream' });
    const prepared = await compressWebBlobForUpload({
      blob: rawBlob,
      fileName: requestedName,
      mimeType: mimeType || 'application/octet-stream',
    });
    const compressedBuffer = await prepared.blob.arrayBuffer();
    const bytes = new Uint8Array(compressedBuffer);

    const recordId = await enqueueOfflineRecordUpload(
      {
        patientId: input.patientId,
        documentTypeId: resolveDocumentTypeId(fileType?.id ?? input.documentTypeId, undefined, types),
        title: requestedName,
        fileName: prepared.fileName,
        mimeType: prepared.mimeType,
        sizeBytes: prepared.sizeBytes,
        fileBlob: bytes,
      },
      getToken
    );

    importedIds.push(recordId);
  }

  await shared.getFileConfig(input.patientId, getToken);
  mutate(FILES_KEY);
  return importedIds;
}

// ---------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------

const previewUrls = new Map<string, Set<string>>();

function trackPreviewUrl(fileId: string, url: string) {
  const set = previewUrls.get(fileId) ?? new Set<string>();
  set.add(url);
  previewUrls.set(fileId, set);
}

export async function preparePreviewFile(
  patientId: string,
  fileId: string,
  getToken?: GetToken,
): Promise<PreparedPreviewFile> {
  rememberToken(getToken);
  const file = await getFileById(patientId, fileId);
  if (!file) throw new Error('File not found.');

  let extension = normalizeExtension(file.extension) || extensionFromName(file.name);
  if (!extension && file.mimeType) extension = extensionFromMime(file.mimeType);
  extension = extension || '';

  let finalName = file.name;
  if (!extensionFromName(finalName) && extension) finalName = `${finalName}.${extension}`;
  const mimeType = file.mimeType ?? mimeFromExtension(extension);

  let uri: string | null = null;
  if (file.localPath) {
    uri = await blobStorage.getBlobUri(file.localPath, mimeType);
  }

  if (!uri) {
    if (!getToken) {
      throw new Error('Sign in and connect to the internet to open this file.');
    }
    const token = await getToken();
    const serverId = file.serverId ?? file.id;
    const blobKey = `${patientId}/records/${fileId}.${extension || 'bin'}`;
    const streamUrl = getPatientRecordStreamUrl(patientId, serverId);
    const localKey = await blobStorage.downloadAndSaveBlob(blobKey, streamUrl, token);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const targetDb = require('@db/index').db;
    await targetDb.update(filesMetadata).set({ localPath: localKey, isCached: true }).where(eq(filesMetadata.id, file.id));
    uri = await blobStorage.getBlobUri(localKey, mimeType);
  }

  if (!uri) {
    throw new Error('Could not prepare file preview.');
  }
  trackPreviewUrl(fileId, uri);

  return {
    uri,
    name: finalName,
    mimeType,
    extension,
    previewKind: getPreviewKind(extension, file.mimeType),
  };
}

export function revokePreviewUri(fileId: string | undefined, uri: string) {
  if (fileId) {
    const urls = previewUrls.get(fileId);
    if (urls) {
      urls.delete(uri);
      if (urls.size === 0) {
        previewUrls.delete(fileId);
      }
    }
  }
  try {
    if (typeof blobStorage.revokeBlobUri === 'function') {
      blobStorage.revokeBlobUri(uri);
    } else if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
      URL.revokeObjectURL(uri);
    }
  } catch {
    // Ignored
  }
}

export async function cleanupPreviewCache(_patientId: string, fileId?: string) {
  const ids = fileId ? [fileId] : Array.from(previewUrls.keys());
  for (const id of ids) {
    previewUrls.get(id)?.forEach((url) => {
      try {
        if (typeof blobStorage.revokeBlobUri === 'function') {
          blobStorage.revokeBlobUri(url);
        } else if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
          URL.revokeObjectURL(url);
        }
      } catch {
        // Ignored
      }
    });
    previewUrls.delete(id);
  }
}

// ---------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------

export async function syncPendingFiles(
  patientId: string,
  getToken?: GetToken,
  retryFailed: boolean = false,
): Promise<SyncPendingFilesResult> {
  rememberToken(getToken);
  if (!getToken) {
    return { synced: 0, failed: 0, skipped: true, reason: 'Token provider is missing.' };
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { synced: 0, failed: 0, skipped: true, reason: 'You are offline.' };
  }

  let synced = 0;
  let failed = 0;
  const cleanupPreview = (fileId: string) => cleanupPreviewCache(patientId, fileId);

  try {
    await shared.refreshDocumentTypes(patientId, getToken, { force: retryFailed });
  } catch (err) {
    console.warn('Document types sync failed', err);
  }

  try {
    synced += await pullRemoteChanges(patientId, getToken, cleanupPreview);
    if (synced > 0) mutate(FILES_KEY);
  } catch (err) {
    console.warn('Downstream sync failed', err);
  }

  const pushed = await pushPendingMetadata(patientId, getToken, retryFailed, cleanupPreview);
  synced += pushed.synced;
  failed += pushed.failed;

  const drainRes = await drainUploadQueue(patientId, getToken, { forceRetry: retryFailed });
  synced += drainRes.drained;
  failed += drainRes.failed;

  await shared.getFileConfig(patientId, getToken);
  mutate(FILES_KEY);
  return { synced, failed, skipped: false };
}

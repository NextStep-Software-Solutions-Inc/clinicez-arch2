import { and, eq, isNull } from 'drizzle-orm';
import { mutate } from 'swr';
import { DeviceEventEmitter } from 'react-native';
import { storage } from '@utils/storage';
import { db } from '@db/index';
import { filesMetadata } from '@db/schema/filesMetadata';
import { completeUpload, createUploadIntent, getFileDownloadUrl, hasFileApi } from '../api/filesApi';
import type {
  FileItemKind,
  ImportFilesInput,
  PreparedPreviewFile,
  SyncPendingFilesResult,
  WebPickedFile,
} from './types';
import {
  aesDecryptBase64,
  aesDecryptBytes,
  aesEncrypt,
  base64ToBytes,
  generateAesKeyBase64,
} from './aes';
import * as shared from './filesShared';
import {
  extensionFromMime,
  extensionFromName,
  findBestFileType,
  formatBytes,
  getCachedDocumentTypes,
  getFileById,
  getPreviewKind,
  keyName,
  makeId,
  mimeFromExtension,
  normalizeExtension,
  now,
  pullRemoteChanges,
  pushPendingMetadata,
} from './filesShared';

/**
 * Web (online-first) implementation of the files service.
 *
 * - Metadata (folders/files/config) lives in the sql.js database, same as native, and is
 *   kept in sync with the API on every change.
 * - Binary data is never persisted in the browser: uploads are encrypted client-side
 *   (AES-256-GCM, wrapped by the Master Access Key) and sent straight to the API's signed URL;
 *   previews are downloaded, decrypted in memory and exposed as short-lived Blob URLs.
 */

type GetToken = () => Promise<string | null>;

const MAK_KEY_PREFIX = 'patient_mak_key';
const FILES_KEY = (key: unknown) => Array.isArray(key) && key[0] === 'files-browser';

// ---------------------------------------------------------------------------
// Shared pass-through exports (identical API to the native service)
// ---------------------------------------------------------------------------

export { getFileById, formatBytes, getFolder, listAllFolders, getFileConfig } from './filesShared';
export { getTypeExtensions } from './filesShared';

let lastGetToken: GetToken | undefined;
const rememberToken = (getToken?: GetToken) => {
  if (getToken) lastGetToken = getToken;
};

let syncTimer: ReturnType<typeof setTimeout> | null = null;
/** Online-first: push metadata edits to the API right after they happen (debounced). */
function scheduleSync(patientId: string) {
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncTimer = null;
    syncPendingFiles(patientId, lastGetToken, true)
      .catch((error) => console.warn('Files sync failed', error))
      .finally(() => mutate(FILES_KEY));
  }, 250);
}

export async function refreshDocumentTypes(patientId: string, getToken?: GetToken) {
  rememberToken(getToken);
  return shared.refreshDocumentTypes(patientId, getToken);
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

export async function createFolder(patientId: string, name: string, parentId?: string | null) {
  const row = await shared.createFolder(patientId, name, parentId);
  scheduleSync(patientId);
  return row;
}

export async function renameFolder(patientId: string, folderId: string, name: string) {
  await shared.renameFolder(patientId, folderId, name);
  scheduleSync(patientId);
}

export async function renameFile(patientId: string, fileId: string, name: string) {
  await shared.renameFile(patientId, fileId, name);
  scheduleSync(patientId);
}

export async function moveItem(
  patientId: string,
  itemKind: FileItemKind,
  itemId: string,
  targetFolderId?: string | null,
) {
  await shared.moveItem(patientId, itemKind, itemId, targetFolderId);
  scheduleSync(patientId);
}

export async function deleteItem(patientId: string, itemKind: FileItemKind, itemId: string) {
  await shared.deleteItem(patientId, itemKind, itemId);
  await cleanupPreviewCache(patientId, itemKind === 'file' ? itemId : undefined);
  scheduleSync(patientId);
}

// ---------------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------------

async function sha256Hex(bytes: Uint8Array) {
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
  );
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

function putWithProgress(
  url: string,
  headers: Record<string, string>,
  body: Blob,
  onProgress: (fraction: number) => void,
) {
  return new Promise<number>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => resolve(xhr.status);
    xhr.onerror = () => reject(new Error('Network error while uploading. Check your connection and try again.'));
    xhr.onabort = () => reject(new Error('Upload cancelled.'));
    xhr.send(body);
  });
}

export async function importFiles(input: ImportFilesInput) {
  if (!input.files.length) throw new Error('Choose at least one file to upload.');
  if (!hasFileApi() || !input.getToken) {
    throw new Error('File storage is unavailable right now. Check your connection and sign in again.');
  }
  const getToken = input.getToken;
  rememberToken(getToken);

  const makEncoded = await storage.getItemAsync(`${MAK_KEY_PREFIX}_${input.patientId}`);
  if (!makEncoded) {
    throw new Error('Set up or enter your File Recovery Key before uploading files.');
  }

  const [config, types] = await Promise.all([
    shared.getFileConfig(input.patientId, getToken),
    getCachedDocumentTypes(),
  ]);
  const sizeOf = (item: ImportFilesInput['files'][number]) => item.sizeBytes ?? item.file.size ?? 0;
  const incomingSize = input.files.reduce((total, item) => total + sizeOf(item), 0);

  if (input.files.some((item) => sizeOf(item) > config.maxFileSizeBytes)) {
    throw new Error(`A file is larger than the configured ${formatBytes(config.maxFileSizeBytes)} limit.`);
  }
  if (config.usedStorageBytes + incomingSize > config.quotaBytes) {
    throw new Error('This upload would exceed your file storage capacity.');
  }

  const importedIds: string[] = [];

  // Preload existing names in the target folder so we can avoid duplicate names.
  const parentFolderId = input.folderId ?? null;
  const parentFolderFilter = parentFolderId
    ? eq(filesMetadata.folderId, parentFolderId)
    : isNull(filesMetadata.folderId);
  const existingNameRows = await db
    .select({ name: filesMetadata.name })
    .from(filesMetadata)
    .where(and(eq(filesMetadata.patientId, input.patientId), parentFolderFilter, isNull(filesMetadata.deletedAt)));
  const existingNames = new Set(existingNameRows.map((r) => (r.name ?? '').toLowerCase()));
  const batchNames = new Set<string>();

  function makeUniqueName(desired: string) {
    const ext = normalizeExtension(extensionFromName(desired));
    let base = desired;
    if (ext) base = desired.slice(0, desired.length - (ext.length + 1));

    let candidate = desired;
    let i = 1;
    while (existingNames.has(candidate.toLowerCase()) || batchNames.has(candidate.toLowerCase())) {
      candidate = ext ? `${base} (${i}).${ext}` : `${base} (${i})`;
      i += 1;
    }
    batchNames.add(candidate.toLowerCase());
    return candidate;
  }

  for (const picked of input.files) {
    const id = makeId('file');
    const source = picked.file as WebPickedFile;
    const requestedName = picked.name ?? source.name ?? `Upload ${importedIds.length + 1}`;
    const sourceName = makeUniqueName(requestedName);
    let extension = normalizeExtension(extensionFromName(sourceName));
    const mimeType = picked.mimeType || source.type || mimeFromExtension(extension);
    if (!extension && mimeType) extension = extensionFromMime(mimeType);
    const fileType = findBestFileType(input.documentTypeId, extension, mimeType, types);

    const plaintext = new Uint8Array(await source.arrayBuffer());
    const keyBase64 = await generateAesKeyBase64();
    const sealed = await aesEncrypt(plaintext, keyBase64);
    const encryptedHash = await sha256Hex(sealed.combined);
    const wrapped = await aesEncrypt(keyBase64, makEncoded);
    const wrappedKeyJson = JSON.stringify({ cipherText: wrapped.combinedBase64 });
    const sizeBytes = picked.sizeBytes ?? plaintext.byteLength;

    const intent = await createUploadIntent(input.patientId, getToken, {
      fileId: id,
      documentTypeId: fileType?.id ?? null,
      folderId: input.folderId ?? null,
      originalName: sourceName,
      contentType: mimeType ?? 'application/octet-stream',
      sizeBytes,
      encryptionAlgorithm: 'AES-256-GCM',
      encryptionKeyId: id,
      encryptionIvBase64: sealed.ivBase64,
      encryptionTagBase64: sealed.tagBase64,
      encryptedSizeBytes: sealed.combined.byteLength,
      encryptedHash,
      wrappedKeyJson,
    });

    const body = new Blob([sealed.combined as unknown as BlobPart]);
    const status = await putWithProgress(
      intent.uploadUrl,
      intent.uploadHeaders ?? { 'Content-Type': mimeType ?? 'application/octet-stream' },
      body,
      (progress) => DeviceEventEmitter.emit('file-sync-progress', { fileId: id, progress }),
    );
    if (status < 200 || status >= 300) {
      throw new Error(`Cloud upload failed with status ${status}.`);
    }

    const complete = await completeUpload(input.patientId, getToken, { fileId: intent.fileId });
    const timestamp = now();

    await db.insert(filesMetadata).values({
      id,
      patientId: input.patientId,
      clinicId: null,
      folderId: input.folderId ?? null,
      documentTypeId: fileType?.id ?? null,
      name: sourceName,
      type: fileType?.code ?? null,
      mimeType,
      extension,
      sizeBytes,
      encryptedSizeBytes: sealed.combined.byteLength,
      localEncryptedPath: null,
      cloudObjectKey: intent.storageKey ?? intent.cloudObjectKey ?? null,
      syncStatus: 'synced',
      syncOperation: 'update',
      encryptionAlgorithm: 'AES-256-GCM',
      encryptionKeyId: id,
      encryptionIvBase64: sealed.ivBase64,
      encryptionTagBase64: sealed.tagBase64,
      encryptedHash,
      serverWrappedKeyJson: intent.wrappedKeyJson ?? wrappedKeyJson,
      createdAt: timestamp,
      updatedAt: timestamp,
      syncedAt: timestamp,
      serverUpdatedAt: timestamp,
      serverId: complete.fileId,
    });

    importedIds.push(id);
  }

  await shared.getFileConfig(input.patientId, getToken);
  mutate(FILES_KEY);
  return importedIds;
}

// ---------------------------------------------------------------------------
// Preview (download → decrypt → in-memory Blob URL)
// ---------------------------------------------------------------------------

const previewUrls = new Map<string, Set<string>>();

function trackPreviewUrl(fileId: string, url: string) {
  const set = previewUrls.get(fileId) ?? new Set<string>();
  set.add(url);
  previewUrls.set(fileId, set);
}

async function resolveFileKey(patientId: string, fileId: string, wrappedKeyJson: string | null | undefined) {
  const storedKey = await storage.getItemAsync(keyName(patientId, fileId));
  if (storedKey) return storedKey;

  if (!wrappedKeyJson) throw new Error('The file key is missing. Sync restore is required.');

  const makEncoded = await storage.getItemAsync(`${MAK_KEY_PREFIX}_${patientId}`);
  if (!makEncoded) {
    throw new Error('Master Access Key (MAK) missing. Enter your File Recovery Key to open files.');
  }
  const parsed = JSON.parse(wrappedKeyJson);
  return aesDecryptBase64(base64ToBytes(parsed.cipherText), makEncoded);
}

export async function preparePreviewFile(
  patientId: string,
  fileId: string,
  getToken?: GetToken,
): Promise<PreparedPreviewFile> {
  rememberToken(getToken);
  const file = await getFileById(patientId, fileId);
  if (!file) throw new Error('File not found.');
  if (!hasFileApi() || !getToken) {
    throw new Error('Sign in and connect to the internet to open this file.');
  }

  const { downloadUrl } = await getFileDownloadUrl(patientId, fileId, getToken);
  const response = await fetch(downloadUrl);
  if (!response.ok) throw new Error(`Failed to download file: HTTP ${response.status}`);
  const encrypted = new Uint8Array(await response.arrayBuffer());

  const keyBase64 = await resolveFileKey(patientId, fileId, file.serverWrappedKeyJson);
  const decrypted = await aesDecryptBytes(encrypted, keyBase64);

  let extension = normalizeExtension(file.extension) || extensionFromName(file.name);
  if (!extension && file.mimeType) extension = extensionFromMime(file.mimeType);
  extension = extension || '';

  let finalName = file.name;
  if (!extensionFromName(finalName) && extension) finalName = `${finalName}.${extension}`;

  const mimeType = file.mimeType ?? mimeFromExtension(extension);
  const blob = new Blob([decrypted as unknown as BlobPart], { type: mimeType });
  const uri = URL.createObjectURL(blob);
  trackPreviewUrl(fileId, uri);

  return {
    uri,
    name: finalName,
    mimeType,
    extension,
    previewKind: getPreviewKind(extension, file.mimeType),
  };
}

export async function cleanupPreviewCache(_patientId: string, fileId?: string) {
  const ids = fileId ? [fileId] : Array.from(previewUrls.keys());
  for (const id of ids) {
    previewUrls.get(id)?.forEach((url) => URL.revokeObjectURL(url));
    previewUrls.delete(id);
  }
}

// ---------------------------------------------------------------------------
// Sync (metadata only; binaries are uploaded immediately by importFiles)
// ---------------------------------------------------------------------------

export async function syncPendingFiles(
  patientId: string,
  getToken?: GetToken,
  retryFailed: boolean = false,
): Promise<SyncPendingFilesResult> {
  rememberToken(getToken);
  if (!hasFileApi() || !getToken) {
    return { synced: 0, failed: 0, skipped: true, reason: 'File API URL is not configured.' };
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { synced: 0, failed: 0, skipped: true, reason: 'You are offline.' };
  }

  let synced = 0;
  let failed = 0;
  const cleanupPreview = (fileId: string) => cleanupPreviewCache(patientId, fileId);

  try {
    synced += await pullRemoteChanges(patientId, getToken, cleanupPreview);
    if (synced > 0) mutate(FILES_KEY);
  } catch (err) {
    console.warn('Downstream sync failed', err);
  }

  const pushed = await pushPendingMetadata(patientId, getToken, retryFailed, cleanupPreview);
  synced += pushed.synced;
  failed += pushed.failed;

  // On web, new files upload inline. Anything still waiting for a binary upload was interrupted
  // (e.g. the tab was closed) and cannot be recovered since nothing is stored locally.
  for (const file of pushed.uploadIntentFiles) {
    failed += 1;
    await db
      .update(filesMetadata)
      .set({ syncStatus: 'failed', syncError: 'Upload was interrupted. Please upload this file again.' })
      .where(eq(filesMetadata.id, file.id));
  }
  if (pushed.uploadIntentFiles.length) mutate(FILES_KEY);

  await shared.getFileConfig(patientId, getToken);
  return { synced, failed, skipped: false };
}

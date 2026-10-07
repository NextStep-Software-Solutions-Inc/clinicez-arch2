import { and, eq, isNull } from 'drizzle-orm';
import * as Crypto from 'expo-crypto';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import { Directory, File, Paths, UploadType } from 'expo-file-system';
import { storage } from '@utils/storage';
import NetInfo from '@react-native-community/netinfo';
import { Buffer } from 'buffer';
import { mutate } from 'swr';
import { DeviceEventEmitter } from 'react-native';
import { db } from '@db/index';
import { filesMetadata } from '@db/schema/filesMetadata';
import { completeUpload, createUploadIntent, getFileDownloadUrl, hasFileApi } from '../api/filesApi';
import {
  ImportFilesInput,
  PreparedPreviewFile,
  SyncPendingFilesResult,
} from './types';
import {
  extensionFromMime,
  extensionFromName,
  findBestFileType,
  formatBytes,
  getCachedDocumentTypes,
  getFileById,
  getFileConfig,
  getPreviewKind,
  keyName,
  makeId,
  mimeFromExtension,
  normalizeExtension,
  now,
  pullRemoteChanges,
  pushPendingMetadata,
} from './filesShared';

export {
  refreshDocumentTypes,
  getFileConfig,
  listFolderContents,
  getStorageOverview,
  listAllFolders,
  getFolder,
  createFolder,
  renameFolder,
  renameFile,
  moveItem,
  deleteItem,
  getFileById,
  formatBytes,
  getTypeExtensions,
} from './filesShared';

const FILES_DIR = 'Clinic EZ-files';
const PREVIEW_DIR = 'Clinic EZ-file-previews';

function getPatientFilesDir(patientId: string) {
  return new Directory(Paths.document, FILES_DIR, patientId);
}

function getPatientPreviewDir(patientId: string) {
  return new Directory(Paths.cache, PREVIEW_DIR, patientId);
}

function ensureDirectory(directory: Directory) {
  if (!directory.exists) {
    directory.create({ intermediates: true, idempotent: true });
  }
}

function toHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

async function sha256(bytes: Uint8Array) {
  const digestInput = new Uint8Array(new ArrayBuffer(bytes.byteLength));
  digestInput.set(bytes);
  const digest = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, digestInput);
  return toHex(digest);
}

export async function importFiles(input: ImportFilesInput) {
  if (!input.files.length) throw new Error('Choose at least one file to upload.');

  const [config, types] = await Promise.all([getFileConfig(input.patientId, input.getToken), getCachedDocumentTypes()]);
  const incomingSize = input.files.reduce((total, item) => total + (item.sizeBytes ?? item.file.size ?? 0), 0);

  if (input.files.some((item) => (item.sizeBytes ?? item.file.size ?? 0) > config.maxFileSizeBytes)) {
    throw new Error(`A file is larger than the configured ${formatBytes(config.maxFileSizeBytes)} limit.`);
  }

  if (config.usedStorageBytes + incomingSize > config.quotaBytes) {
    throw new Error('This upload would exceed your file storage capacity.');
  }

  const storageDir = getPatientFilesDir(input.patientId);
  ensureDirectory(storageDir);
  const importedIds: string[] = [];

  // Preload existing names in the target folder so we can avoid duplicate names.
  const parentFolderId = input.folderId ?? null;
  const parentFolderFilter = parentFolderId ? eq(filesMetadata.folderId, parentFolderId) : isNull(filesMetadata.folderId);
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
    const source = picked.file as File;
    const requestedName = picked.name ?? source.name ?? `Upload ${importedIds.length + 1}`;
    const sourceName = makeUniqueName(requestedName);
    let extension = normalizeExtension(source.extension || extensionFromName(sourceName));
    const mimeType = picked.mimeType ?? source.type ?? mimeFromExtension(extension);

    if (!extension && mimeType) {
      extension = extensionFromMime(mimeType);
    }
    const fileType = findBestFileType(input.documentTypeId, extension, mimeType, types);
    const plaintext = await source.bytes();
    const key = await Crypto.AESEncryptionKey.generate(Crypto.AESKeySize.AES256);
    const sealed = await Crypto.aesEncryptAsync(plaintext, key);
    const encryptedBytes = await sealed.combined('bytes');
    const ivBase64 = await sealed.iv('base64');
    const tagBase64 = await sealed.tag('base64');
    const encryptedHash = await sha256(encryptedBytes);
    const encryptedFile = new File(storageDir, `${id}.cez`);
    encryptedFile.write(encryptedBytes);
    const encryptedInfo = encryptedFile.info();
    const timestamp = now();
    const encodedKey = await key.encoded('base64');

    await storage.setItemAsync(keyName(input.patientId, id), encodedKey);
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
      sizeBytes: picked.sizeBytes ?? plaintext.byteLength,
      encryptedSizeBytes: encryptedInfo.exists ? encryptedInfo.size ?? encryptedBytes.byteLength : encryptedBytes.byteLength,
      localEncryptedPath: encryptedFile.uri,
      cloudObjectKey: null,
      syncStatus: hasFileApi() ? 'queued' : 'local',
      syncOperation: 'insert',
      encryptionAlgorithm: 'AES-256-GCM',
      encryptionKeyId: id,
      encryptionIvBase64: String(ivBase64),
      encryptionTagBase64: String(tagBase64),
      encryptedHash,
      createdAt: timestamp,
      updatedAt: timestamp,
      syncedAt: null,
      serverId: null,
    });

    importedIds.push(id);
  }

  await getFileConfig(input.patientId, input.getToken);
  return importedIds;
}

export async function preparePreviewFile(
  patientId: string,
  fileId: string,
  getToken?: () => Promise<string | null>
): Promise<PreparedPreviewFile> {
  const file = await getFileById(patientId, fileId);
  if (!file) throw new Error('File not found.');

  // If we don't have the file locally, download it on demand
  if (!file.localEncryptedPath) {
    if (!hasFileApi() || !getToken) {
      throw new Error('This file is not available offline yet, and you are currently offline.');
    }

    // Fetch S3 download URL
    const { downloadUrl } = await getFileDownloadUrl(patientId, fileId, getToken);

    const storageDir = getPatientFilesDir(patientId);
    ensureDirectory(storageDir);
    const encryptedFile = new File(storageDir, `${fileId}.enc`);

    // Download the file from S3 to local storage using the classic FileSystem API
    const result = await FileSystemLegacy.downloadAsync(downloadUrl, encryptedFile.uri);

    if (result.status < 200 || result.status >= 300) {
      throw new Error(`Failed to download file: HTTP ${result.status}`);
    }

    // Update SQLite to point to the new local file
    await db.update(filesMetadata)
      .set({ localEncryptedPath: encryptedFile.uri })
      .where(eq(filesMetadata.id, fileId));

    file.localEncryptedPath = encryptedFile.uri;
  }

  // We need to determine the AES key to decrypt the file.
  // First, check if we have it natively stored in SecureStore (for files we uploaded)
  let key: Crypto.AESEncryptionKey;
  const encodedKey = await storage.getItemAsync(keyName(patientId, fileId));

  if (encodedKey) {
    key = await Crypto.AESEncryptionKey.import(encodedKey, 'base64');
  } else if (file.serverWrappedKeyJson) {
    // If not, it was synced from another device. We need to unwrap the key using our MAK.
    const makEncoded = await storage.getItemAsync(`${'patient_mak_key'}_${patientId}`);
    if (!makEncoded) throw new Error('Master Access Key (MAK) missing. Please restart the app or setup your File Recovery Key.');

    const mak = await Crypto.AESEncryptionKey.import(makEncoded, 'base64');

    const parsed = JSON.parse(file.serverWrappedKeyJson);
    const combinedBytes = new Uint8Array(Buffer.from(parsed.cipherText, 'base64'));
    const keySealed = Crypto.AESSealedData.fromCombined(combinedBytes, { ivLength: 12, tagLength: 16 });

    // Decrypt the file's individual key using the MAK
    const fileKeyEncoded = await Crypto.aesDecryptAsync(keySealed, mak, { output: 'base64' });
    key = await Crypto.AESEncryptionKey.import(fileKeyEncoded, 'base64');

    // Cache it locally so we don't have to unwrap it next time
    await storage.setItemAsync(keyName(patientId, fileId), fileKeyEncoded);
  } else {
    throw new Error('The local file key is missing. Sync restore is required.');
  }

  const encryptedFile = new File(file.localEncryptedPath);
  const encryptedBytes = await encryptedFile.bytes();
  const sealed = Crypto.AESSealedData.fromCombined(encryptedBytes, { ivLength: 12, tagLength: 16 });
  const decrypted = await Crypto.aesDecryptAsync(sealed, key, { output: 'bytes' });
  const previewDir = getPatientPreviewDir(patientId);
  ensureDirectory(previewDir);
  let extension = normalizeExtension(file.extension) || extensionFromName(file.name);
  if (!extension && file.mimeType) {
    extension = extensionFromMime(file.mimeType);
  }
  extension = extension || '';

  let finalName = file.name;
  if (!extensionFromName(finalName) && extension) {
    finalName = `${finalName}.${extension}`;
  }

  const previewFileName = extension ? `${file.id}.${Date.now()}.${extension}` : `${file.id}.${Date.now()}`;
  const previewFile = new File(previewDir, previewFileName);
  previewFile.write(decrypted);

  return {
    uri: previewFile.uri,
    name: finalName,
    mimeType: file.mimeType ?? mimeFromExtension(extension),
    extension,
    previewKind: getPreviewKind(extension, file.mimeType),
  };
}

export async function cleanupPreviewCache(patientId: string, fileId?: string) {
  const previewDir = getPatientPreviewDir(patientId);
  if (!previewDir.exists) return;

  if (fileId) {
    for (const entry of previewDir.list()) {
      if (entry instanceof File && entry.name.startsWith(`${fileId}.`)) {
        entry.delete();
      }
    }
    return;
  }

  previewDir.delete();
}

export async function syncPendingFiles(
  patientId: string,
  getToken?: () => Promise<string | null>,
  retryFailed: boolean = false
): Promise<SyncPendingFilesResult> {
  if (!hasFileApi() || !getToken) {
    return { synced: 0, failed: 0, skipped: true, reason: 'File API URL is not configured.' };
  }

  const network = await NetInfo.fetch();
  if (!network.isConnected) {
    return { synced: 0, failed: 0, skipped: true, reason: 'Device is offline.' };
  }

  let synced = 0;
  let failed = 0;
  const cleanupPreview = (fileId: string) => cleanupPreviewCache(patientId, fileId);

  // Downstream sync
  try {
    synced += await pullRemoteChanges(patientId, getToken, cleanupPreview);
    if (synced > 0) {
      mutate((key: any) => Array.isArray(key) && key[0] === 'files-browser');
    }
  } catch (err) {
    console.warn("Downstream sync failed", err);
  }

  // Upstream sync
  const pushed = await pushPendingMetadata(patientId, getToken, retryFailed, cleanupPreview);
  synced += pushed.synced;
  failed += pushed.failed;
  if (pushed.synced > 0) {
    mutate((key: any) => Array.isArray(key) && key[0] === 'files-browser');
  }
  const uploadIntentFiles = pushed.uploadIntentFiles;

  for (const file of uploadIntentFiles) {
    if (!file.localEncryptedPath) continue;

    try {
      await db.update(filesMetadata).set({ syncStatus: 'syncing', syncError: null }).where(eq(filesMetadata.id, file.id));
      mutate((key: any) => Array.isArray(key) && key[0] === 'files-browser');
      const encryptedFile = new File(file.localEncryptedPath);
      let wrappedKeyJson = '';
      const fileKeyEncoded = await storage.getItemAsync(keyName(patientId, file.id));
      if (fileKeyEncoded) {
        const makEncoded = await storage.getItemAsync(`${'patient_mak_key'}_${patientId}`);
        if (makEncoded) {
          const mak = await Crypto.AESEncryptionKey.import(makEncoded, 'base64');
          const sealed = await Crypto.aesEncryptAsync(fileKeyEncoded, mak);
          wrappedKeyJson = JSON.stringify({ cipherText: await sealed.combined('base64') });
        }
      }

      const intent = await createUploadIntent(patientId, getToken, {
        fileId: file.id,
        documentTypeId: file.documentTypeId,
        folderId: file.folderId,
        originalName: file.name,
        contentType: file.mimeType ?? 'application/octet-stream',
        sizeBytes: file.sizeBytes,
        encryptionAlgorithm: file.encryptionAlgorithm,
        encryptionKeyId: file.encryptionKeyId,
        encryptionIvBase64: file.encryptionIvBase64,
        encryptionTagBase64: file.encryptionTagBase64,
        encryptedSizeBytes: file.encryptedSizeBytes ?? encryptedFile.size,
        encryptedHash: file.encryptedHash,
        wrappedKeyJson
      });

      const task = encryptedFile.createUploadTask(intent.uploadUrl, {
        httpMethod: 'PUT',
        uploadType: UploadType.BINARY_CONTENT,
        headers: intent.uploadHeaders ?? { 'Content-Type': file.mimeType ?? 'application/octet-stream' },
        onProgress: ({ bytesSent, totalBytes }) => {
          if (totalBytes > 0) {
            DeviceEventEmitter.emit('file-sync-progress', {
              fileId: file.id,
              progress: bytesSent / totalBytes
            });
          }
        }
      });

      const upload = await task.uploadAsync();

      if (upload.status < 200 || upload.status >= 300) {
        throw new Error(`Cloud upload failed with status ${upload.status}.`);
      }

      const complete = await completeUpload(patientId, getToken, {
        fileId: intent.fileId
      });

      await db
        .update(filesMetadata)
        .set({
          syncStatus: 'synced',
          syncError: null,
          syncedAt: now(),
          serverId: complete.fileId,
          cloudObjectKey: intent.storageKey ?? intent.cloudObjectKey ?? file.cloudObjectKey,
          serverWrappedKeyJson: intent.wrappedKeyJson ?? file.serverWrappedKeyJson,
          serverUpdatedAt: now(),
        })
        .where(eq(filesMetadata.id, file.id));
      synced += 1;
    } catch (error) {
      failed += 1;
      await db
        .update(filesMetadata)
        .set({
          syncStatus: 'failed',
          syncError: error instanceof Error ? error.message : 'Sync failed.',
        })
        .where(eq(filesMetadata.id, file.id));
      mutate((key: any) => Array.isArray(key) && key[0] === 'files-browser');
    }
  }

  await getFileConfig(patientId, getToken);
  return { synced, failed, skipped: false };
}

import { eq } from 'drizzle-orm';
import { Directory, File, Paths } from 'expo-file-system';
import NetInfo from '@react-native-community/netinfo';
import { mutate } from 'swr';
import { db } from '@db/index';
import { filesMetadata } from '@db/schema/filesMetadata';
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
  getFileById,
  getFileConfig,
  getPreviewKind,
  mimeFromExtension,
  normalizeExtension,
  pullRemoteChanges,
  pushPendingMetadata,
  refreshDocumentTypes,
} from './filesShared';
import { resolveDocumentTypeId } from './documentTypeMapping';
import { getPatientRecordStreamUrl } from '../api/filesApi';
import { blobStorage } from '../storage';
import { enqueueOfflineRecordUpload, drainUploadQueue } from '../sync/uploadQueueService';

export {
  refreshDocumentTypes,
  getCachedDocumentTypes,
  getActiveDocumentTypes,
  reconcileDocumentTypes,
  getFileConfig,
  listFolderContents,
  getStorageOverview,
  renameFile,
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

export async function importFiles(input: ImportFilesInput): Promise<string[]> {
  if (!input.files.length) throw new Error('Choose at least one file to upload.');

  const [config, types] = await Promise.all([
    getFileConfig(input.patientId, input.getToken),
    refreshDocumentTypes(input.patientId, input.getToken),
  ]);

  if (input.files.some((item) => (item.sizeBytes ?? item.file.size ?? 0) > config.maxFileSizeBytes)) {
    throw new Error(`A file is larger than the configured ${formatBytes(config.maxFileSizeBytes)} limit.`);
  }

  const storageDir = getPatientFilesDir(input.patientId);
  ensureDirectory(storageDir);
  const importedIds: string[] = [];

  for (const picked of input.files) {
    const source = picked.file as File;
    const requestedName = picked.name ?? source.name ?? `Upload ${importedIds.length + 1}`;
    let extension = normalizeExtension(source.extension || extensionFromName(requestedName));
    const mimeType = picked.mimeType ?? source.type ?? mimeFromExtension(extension);

    if (!extension && mimeType) {
      extension = extensionFromMime(mimeType);
    }
    const fileType = findBestFileType(input.documentTypeId, extension, mimeType, types);
    const sizeBytes = picked.sizeBytes ?? source.size ?? 0;

    let savedLocalPath = source.uri;
    try {
      const plaintext = await source.bytes();
      const localFile = new File(storageDir, `${crypto.randomUUID()}.${extension || 'bin'}`);
      localFile.write(plaintext);
      savedLocalPath = localFile.uri;
    } catch {
      // Fall back to source.uri
    }

    const recordId = await enqueueOfflineRecordUpload(
      {
        patientId: input.patientId,
        documentTypeId: resolveDocumentTypeId(fileType?.id ?? input.documentTypeId, undefined, types),
        title: requestedName,
        fileName: requestedName,
        mimeType: mimeType || 'application/octet-stream',
        sizeBytes,
        localUri: savedLocalPath,
      },
      input.getToken
    );

    importedIds.push(recordId);
  }

  await getFileConfig(input.patientId, input.getToken);
  mutate((key: any) => Array.isArray(key) && key[0] === 'files-browser');
  return importedIds;
}

export async function preparePreviewFile(
  patientId: string,
  fileId: string,
  getToken?: () => Promise<string | null>
): Promise<PreparedPreviewFile> {
  const file = await getFileById(patientId, fileId);
  if (!file) throw new Error('File not found.');

  let extension = normalizeExtension(file.extension) || extensionFromName(file.name);
  if (!extension && file.mimeType) {
    extension = extensionFromMime(file.mimeType);
  }
  extension = extension || '';

  let finalName = file.name;
  if (!extensionFromName(finalName) && extension) finalName = `${finalName}.${extension}`;
  const mimeType = file.mimeType ?? mimeFromExtension(extension);

  let localUri: string | null = file.localPath;

  if (localUri) {
    const localFile = new File(localUri);
    if (!localFile.exists) {
      localUri = null;
    }
  }

  // If we don't have the file locally, download it on demand
  if (!localUri) {
    if (!getToken) {
      throw new Error('This file is not available offline yet, and you are currently offline.');
    }

    const token = await getToken();
    const serverId = file.serverId ?? file.id;
    const blobKey = `${patientId}/records/${fileId}.${extension || 'bin'}`;
    const streamUrl = getPatientRecordStreamUrl(patientId, serverId);

    localUri = await blobStorage.downloadAndSaveBlob(blobKey, streamUrl, token);
    await db.update(filesMetadata).set({ localPath: localUri, isCached: true }).where(eq(filesMetadata.id, file.id));
  }

  return {
    uri: localUri,
    name: finalName,
    mimeType,
    extension,
    previewKind: getPreviewKind(extension, file.mimeType),
  };
}

export function revokePreviewUri(_fileId: string | undefined, _uri: string) {
  // Native file:// URIs do not require revocation
}

export async function cleanupPreviewCache(patientId: string, _fileId?: string) {
  const previewDir = getPatientPreviewDir(patientId);
  if (previewDir.exists) {
    try {
      previewDir.delete();
    } catch {
      // Ignored
    }
  }
}

export async function syncPendingFiles(
  patientId: string,
  getToken?: () => Promise<string | null>,
  retryFailed: boolean = false,
): Promise<SyncPendingFilesResult> {
  if (!getToken) {
    return { synced: 0, failed: 0, skipped: true, reason: 'Token provider is missing.' };
  }

  const net = await NetInfo.fetch();
  if (net.isConnected === false) {
    return { synced: 0, failed: 0, skipped: true, reason: 'You are offline.' };
  }

  let synced = 0;
  let failed = 0;
  const cleanupPreview = (fileId: string) => cleanupPreviewCache(patientId, fileId);

  try {
    await refreshDocumentTypes(patientId, getToken, { force: retryFailed });
  } catch (err) {
    console.warn('Document types sync failed', err);
  }

  // Downstream pull
  try {
    synced += await pullRemoteChanges(patientId, getToken, cleanupPreview);
    if (synced > 0) {
      mutate((key: any) => Array.isArray(key) && key[0] === 'files-browser');
    }
  } catch (err) {
    console.warn("Downstream sync failed", err);
  }

  // Upstream metadata push
  const pushed = await pushPendingMetadata(patientId, getToken, retryFailed, cleanupPreview);
  synced += pushed.synced;
  failed += pushed.failed;

  // Drain upload queue
  const drainRes = await drainUploadQueue(patientId, getToken, { forceRetry: retryFailed });
  synced += drainRes.drained;
  failed += drainRes.failed;

  if (synced > 0 || failed > 0) {
    mutate((key: any) => Array.isArray(key) && key[0] === 'files-browser');
  }

  await getFileConfig(patientId, getToken);
  return { synced, failed, skipped: false };
}

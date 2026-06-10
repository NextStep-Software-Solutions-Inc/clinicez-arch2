import { and, asc, desc, eq, isNull, or } from 'drizzle-orm';
import * as Crypto from 'expo-crypto';
import { Directory, File, Paths, UploadType } from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';
import NetInfo from '@react-native-community/netinfo';
import { db } from '@db/index';
import { fileFolders } from '@db/schema/fileFolders';
import { filesMetadata } from '@db/schema/filesMetadata';
import { fileTypes } from '@db/schema/fileTypes';
import { fileUploadConfig } from '@db/schema/fileUploadConfig';
import { completeUpload, createUploadIntent, fetchFileConfig, hasFileApi } from './fileApiClient';
import {
  DEFAULT_MAX_FILE_SIZE_BYTES,
  DEFAULT_USER_QUOTA_BYTES,
  FileApiConfigResponse,
  FileApiTypeResponse,
  FileBrowserContents,
  FileBrowserFile,
  FileBrowserFolder,
  FileItemKind,
  FilePreviewKind,
  ImportFilesInput,
  PreparedPreviewFile,
  SyncPendingFilesResult,
} from './types';

const FILES_DIR = 'clinicez-files';
const PREVIEW_DIR = 'clinicez-file-previews';
const DEFAULT_NATIVE_PREVIEW_EXTENSIONS = ['jpg', 'jpeg', 'png', 'heic', 'webp', 'pdf'];

const DEFAULT_FILE_TYPES: FileApiTypeResponse[] = [
  {
    id: 'file-type-xray',
    code: 'xray',
    label: 'X-ray',
    description: 'Radiology images and x-ray reports.',
    supportedExtensions: ['jpg', 'jpeg', 'png', 'pdf', 'dcm'],
    supportedMimeTypes: ['image/*', 'application/pdf'],
    nativePreviewKind: 'image',
    sortOrder: 10,
  },
  {
    id: 'file-type-lab-result',
    code: 'lab-result',
    label: 'Lab result',
    description: 'Laboratory result PDFs or images.',
    supportedExtensions: ['pdf', 'jpg', 'jpeg', 'png'],
    supportedMimeTypes: ['application/pdf', 'image/*'],
    nativePreviewKind: 'pdf',
    sortOrder: 20,
  },
  {
    id: 'file-type-medical-certificate',
    code: 'medical-certificate',
    label: 'Medical certificate',
    description: 'Medical certificates and fit-to-work documents.',
    supportedExtensions: ['pdf', 'jpg', 'jpeg', 'png', 'doc', 'docx'],
    supportedMimeTypes: ['application/pdf', 'image/*', 'application/msword'],
    nativePreviewKind: 'pdf',
    sortOrder: 30,
  },
  {
    id: 'file-type-prescription',
    code: 'prescription',
    label: 'Prescription',
    description: 'Prescription scans, images, and PDFs.',
    supportedExtensions: ['pdf', 'jpg', 'jpeg', 'png'],
    supportedMimeTypes: ['application/pdf', 'image/*'],
    nativePreviewKind: 'pdf',
    sortOrder: 40,
  },
  {
    id: 'file-type-id',
    code: 'id',
    label: 'Government ID',
    description: 'IDs and identity verification documents.',
    supportedExtensions: ['pdf', 'jpg', 'jpeg', 'png'],
    supportedMimeTypes: ['application/pdf', 'image/*'],
    nativePreviewKind: 'image',
    sortOrder: 50,
  },
  {
    id: 'file-type-other',
    code: 'other',
    label: 'Other medical file',
    description: 'Other health-related documents.',
    supportedExtensions: ['pdf', 'jpg', 'jpeg', 'png', 'doc', 'docx', 'xls', 'xlsx', 'txt'],
    supportedMimeTypes: ['*/*'],
    nativePreviewKind: 'external',
    sortOrder: 100,
  },
];

function now() {
  return new Date();
}

function makeId(prefix: string) {
  return `${prefix}-${Crypto.randomUUID()}`;
}

const KEY_PREFIX = 'patient_file_key';

function sanitizeKeyPart(part: string) {
  // Allow only alphanumeric, dot, dash, and underscore. Replace others with underscore.
  const sanitized = (part ?? '').replace(/[^A-Za-z0-9._-]/g, '_');
  // Trim leading/trailing underscores to avoid empty-looking segments.
  return sanitized.replace(/^_+|_+$/g, '');
}

function keyName(patientId: string, fileId: string) {
  const p = sanitizeKeyPart(patientId);
  const f = sanitizeKeyPart(fileId);
  if (!p || !f) throw new Error('SecureStore key parts must be non-empty.');
  return `${KEY_PREFIX}_${p}_${f}`;
}

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

function parseJsonArray<T>(value: string | null | undefined, fallback: T[]): T[] {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function normalizeExtension(extension: string | null | undefined) {
  return (extension ?? '').replace(/^\./, '').trim().toLowerCase();
}

function extensionFromName(name: string) {
  const match = /\.([a-z0-9]+)$/i.exec(name);
  return normalizeExtension(match?.[1] ?? '');
}

function mimeFromExtension(extension: string) {
  switch (extension) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'heic':
      return 'image/heic';
    case 'webp':
      return 'image/webp';
    case 'pdf':
      return 'application/pdf';
    case 'txt':
      return 'text/plain';
    case 'doc':
      return 'application/msword';
    case 'docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    default:
      return 'application/octet-stream';
  }
}

function getPreviewKind(extension: string, mimeType: string | null | undefined): FilePreviewKind {
  const normalized = normalizeExtension(extension);
  if (mimeType?.startsWith('image/') || ['jpg', 'jpeg', 'png', 'heic', 'webp'].includes(normalized)) return 'image';
  if (mimeType === 'application/pdf' || normalized === 'pdf') return 'pdf';
  return 'external';
}

function getTypeLabel(typeId: string | null | undefined, types: Awaited<ReturnType<typeof getCachedFileTypes>>) {
  return types.find((type) => type.id === typeId)?.label ?? 'Medical file';
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

async function getCachedFileTypes() {
  const rows = await db.select().from(fileTypes).orderBy(asc(fileTypes.sortOrder), asc(fileTypes.label));
  if (rows.length) return rows;
  await upsertFileTypes(DEFAULT_FILE_TYPES);
  return db.select().from(fileTypes).orderBy(asc(fileTypes.sortOrder), asc(fileTypes.label));
}

async function upsertFileTypes(rows: FileApiTypeResponse[]) {
  const timestamp = now();
  await Promise.all(
    rows.map((row) => {
      const value = {
        id: row.id,
        code: row.code,
        label: row.label,
        description: row.description ?? null,
        supportedExtensionsJson: JSON.stringify(row.supportedExtensions ?? []),
        supportedMimeTypesJson: JSON.stringify(row.supportedMimeTypes ?? []),
        nativePreviewKind: row.nativePreviewKind ?? 'external',
        isActive: row.isActive ?? true,
        sortOrder: row.sortOrder ?? 0,
        fetchedAt: timestamp,
        serverUpdatedAt: row.serverUpdatedAt ? new Date(row.serverUpdatedAt) : null,
      };

      return db.insert(fileTypes).values(value).onConflictDoUpdate({ target: fileTypes.id, set: value });
    }),
  );
}

async function getUsedStorageBytes(patientId: string) {
  const rows = await db
    .select({ sizeBytes: filesMetadata.sizeBytes })
    .from(filesMetadata)
    .where(and(eq(filesMetadata.patientId, patientId), isNull(filesMetadata.deletedAt)));

  return rows.reduce((total, row) => total + (row.sizeBytes ?? 0), 0);
}

function toConfigValue(patientId: string, response?: FileApiConfigResponse) {
  return {
    patientId,
    maxFileSizeBytes: response?.maxFileSizeBytes ?? DEFAULT_MAX_FILE_SIZE_BYTES,
    quotaBytes: response?.quotaBytes ?? DEFAULT_USER_QUOTA_BYTES,
    usedStorageBytes: response?.usedStorageBytes ?? 0,
    nativePreviewExtensionsJson: JSON.stringify(response?.nativePreviewExtensions ?? DEFAULT_NATIVE_PREVIEW_EXTENSIONS),
    configVersion: response?.configVersion ?? 'local-defaults',
    fetchedAt: now(),
    serverUpdatedAt: response?.serverUpdatedAt ? new Date(response.serverUpdatedAt) : null,
  };
}

export async function refreshFileTypes(patientId: string, getToken?: () => Promise<string | null>) {
  let configResponse: FileApiConfigResponse | undefined;

  if (hasFileApi() && getToken) {
    try {
      configResponse = await fetchFileConfig(getToken);
    } catch (error) {
      console.warn('Falling back to local file config:', error);
    }
  }

  await upsertFileTypes(configResponse?.fileTypes?.length ? configResponse.fileTypes : DEFAULT_FILE_TYPES);
  const usedStorageBytes = await getUsedStorageBytes(patientId);
  const configValue = { ...toConfigValue(patientId, configResponse), usedStorageBytes };
  await db
    .insert(fileUploadConfig)
    .values(configValue)
    .onConflictDoUpdate({ target: fileUploadConfig.patientId, set: configValue });

  return getCachedFileTypes();
}

export async function getFileConfig(patientId: string, getToken?: () => Promise<string | null>) {
  const cached = await db.select().from(fileUploadConfig).where(eq(fileUploadConfig.patientId, patientId)).limit(1);
  if (!cached[0]) {
    await refreshFileTypes(patientId, getToken);
  }

  const [config] = await db.select().from(fileUploadConfig).where(eq(fileUploadConfig.patientId, patientId)).limit(1);
  const usedStorageBytes = await getUsedStorageBytes(patientId);
  const value = config ?? toConfigValue(patientId);

  if (value.usedStorageBytes !== usedStorageBytes) {
    await db
      .update(fileUploadConfig)
      .set({ usedStorageBytes, fetchedAt: value.fetchedAt })
      .where(eq(fileUploadConfig.patientId, patientId));
  }

  return { ...value, usedStorageBytes };
}

async function getFolderRows(patientId: string) {
  return db
    .select()
    .from(fileFolders)
    .where(and(eq(fileFolders.patientId, patientId), isNull(fileFolders.deletedAt)))
    .orderBy(asc(fileFolders.name));
}

async function getBreadcrumbs(patientId: string, folderId?: string | null) {
  if (!folderId) return [];
  const folders = await getFolderRows(patientId);
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const breadcrumbs = [];
  let current = byId.get(folderId);

  while (current) {
    breadcrumbs.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }

  return breadcrumbs;
}

export async function listFolderContents(
  patientId: string,
  folderId?: string | null,
  query = '',
  getToken?: () => Promise<string | null>,
): Promise<FileBrowserContents> {
  const normalizedQuery = query.trim().toLowerCase();
  const parentFilter = folderId ? eq(fileFolders.parentId, folderId) : isNull(fileFolders.parentId);
  const fileFolderFilter = folderId ? eq(filesMetadata.folderId, folderId) : isNull(filesMetadata.folderId);
  const [folders, fileRows, allFolders, config, types, pendingRows] = await Promise.all([
    db
      .select()
      .from(fileFolders)
      .where(and(eq(fileFolders.patientId, patientId), parentFilter, isNull(fileFolders.deletedAt)))
      .orderBy(asc(fileFolders.name)),
    db
      .select()
      .from(filesMetadata)
      .where(and(eq(filesMetadata.patientId, patientId), fileFolderFilter, isNull(filesMetadata.deletedAt)))
      .orderBy(desc(filesMetadata.updatedAt), desc(filesMetadata.createdAt)),
    getFolderRows(patientId),
    getFileConfig(patientId, getToken),
    getCachedFileTypes(),
    db
      .select({ id: filesMetadata.id })
      .from(filesMetadata)
      .where(
        and(
          eq(filesMetadata.patientId, patientId),
          isNull(filesMetadata.deletedAt),
          or(eq(filesMetadata.syncStatus, 'queued'), eq(filesMetadata.syncStatus, 'failed')),
        ),
      ),
  ]);

  const childCounts = new Map<string, number>();
  for (const folder of allFolders) {
    if (folder.parentId) childCounts.set(folder.parentId, (childCounts.get(folder.parentId) ?? 0) + 1);
  }
  for (const file of fileRows) {
    if (file.folderId) childCounts.set(file.folderId, (childCounts.get(file.folderId) ?? 0) + 1);
  }

  const browserFolders: FileBrowserFolder[] = folders
    .filter((folder) => !normalizedQuery || folder.name.toLowerCase().includes(normalizedQuery))
    .map((folder) => ({ ...folder, kind: 'folder', childCount: childCounts.get(folder.id) ?? 0 }));

  const browserFiles: FileBrowserFile[] = fileRows
    .filter((file) => !normalizedQuery || file.name.toLowerCase().includes(normalizedQuery))
    .map((file) => ({
      ...file,
      kind: 'file',
      typeLabel: getTypeLabel(file.fileTypeId, types),
      previewKind: getPreviewKind(file.extension ?? '', file.mimeType),
    }));

  return {
    breadcrumbs: await getBreadcrumbs(patientId, folderId),
    folders: browserFolders,
    files: browserFiles,
    config,
    fileTypes: types,
    pendingSyncCount: pendingRows.length,
  };
}

export async function listAllFolders(patientId: string) {
  return getFolderRows(patientId);
}

export async function getFolder(patientId: string, folderId: string) {
  const [folder] = await db
    .select()
    .from(fileFolders)
    .where(and(eq(fileFolders.patientId, patientId), eq(fileFolders.id, folderId), isNull(fileFolders.deletedAt)))
    .limit(1);
  return folder ?? null;
}

export async function createFolder(patientId: string, name: string, parentId?: string | null) {
  const trimmedName = name.trim();
  if (!trimmedName) throw new Error('Folder name is required.');

  const timestamp = now();
  const row = {
    id: makeId('folder'),
    patientId,
    parentId: parentId ?? null,
    name: trimmedName,
    syncStatus: hasFileApi() ? ('queued' as const) : ('local' as const),
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  await db.insert(fileFolders).values(row);
  return row;
}

export async function renameFolder(patientId: string, folderId: string, name: string) {
  const trimmedName = name.trim();
  if (!trimmedName) throw new Error('Folder name is required.');

  await db
    .update(fileFolders)
    .set({ name: trimmedName, updatedAt: now(), syncStatus: 'queued', syncError: null })
    .where(and(eq(fileFolders.patientId, patientId), eq(fileFolders.id, folderId)));
}

function collectDescendantFolderIds(folders: { id: string; parentId: string | null }[], folderId: string) {
  const descendants = new Set<string>();
  let changed = true;

  while (changed) {
    changed = false;
    for (const folder of folders) {
      if (folder.parentId && (folder.parentId === folderId || descendants.has(folder.parentId)) && !descendants.has(folder.id)) {
        descendants.add(folder.id);
        changed = true;
      }
    }
  }

  return descendants;
}

export async function moveItem(
  patientId: string,
  itemKind: FileItemKind,
  itemId: string,
  targetFolderId?: string | null,
) {
  if (itemKind === 'folder') {
    if (itemId === targetFolderId) throw new Error('A folder cannot be moved into itself.');
    const folders = await getFolderRows(patientId);
    const descendants = collectDescendantFolderIds(folders, itemId);
    if (targetFolderId && descendants.has(targetFolderId)) {
      throw new Error('A folder cannot be moved inside one of its subfolders.');
    }

    await db
      .update(fileFolders)
      .set({ parentId: targetFolderId ?? null, updatedAt: now(), syncStatus: 'queued', syncError: null })
      .where(and(eq(fileFolders.patientId, patientId), eq(fileFolders.id, itemId)));
    return;
  }

  await db
    .update(filesMetadata)
    .set({ folderId: targetFolderId ?? null, updatedAt: now(), syncStatus: 'queued', syncError: null })
    .where(and(eq(filesMetadata.patientId, patientId), eq(filesMetadata.id, itemId)));
}

export async function deleteItem(patientId: string, itemKind: FileItemKind, itemId: string) {
  const timestamp = now();

  if (itemKind === 'folder') {
    const folders = await getFolderRows(patientId);
    const folderIds = [itemId, ...collectDescendantFolderIds(folders, itemId)];

    await Promise.all(
      folderIds.map((folderId) =>
        db
          .update(fileFolders)
          .set({ deletedAt: timestamp, updatedAt: timestamp, syncStatus: 'queued' })
          .where(and(eq(fileFolders.patientId, patientId), eq(fileFolders.id, folderId))),
      ),
    );

    await Promise.all(
      folderIds.map((folderId) =>
        db
          .update(filesMetadata)
          .set({ deletedAt: timestamp, updatedAt: timestamp, syncStatus: 'queued' })
          .where(and(eq(filesMetadata.patientId, patientId), eq(filesMetadata.folderId, folderId))),
      ),
    );
    return;
  }

  await db
    .update(filesMetadata)
    .set({ deletedAt: timestamp, updatedAt: timestamp, syncStatus: 'queued' })
    .where(and(eq(filesMetadata.patientId, patientId), eq(filesMetadata.id, itemId)));
}

function findBestFileType(
  selectedTypeId: string | null | undefined,
  extension: string,
  mimeType: string,
  types: Awaited<ReturnType<typeof getCachedFileTypes>>,
) {
  const selected = types.find((type) => type.id === selectedTypeId);
  if (selected) return selected;

  return (
    types.find((type) => {
      const extensions = parseJsonArray<string>(type.supportedExtensionsJson, []);
      const mimeTypes = parseJsonArray<string>(type.supportedMimeTypesJson, []);
      return extensions.includes(extension) || mimeTypes.includes(mimeType) || mimeTypes.includes('*/*') || (mimeType.startsWith('image/') && mimeTypes.includes('image/*'));
    }) ?? types.find((type) => type.code === 'other') ?? types[0]
  );
}

export async function importFiles(input: ImportFilesInput) {
  if (!input.files.length) throw new Error('Choose at least one file to upload.');

  const [config, types] = await Promise.all([getFileConfig(input.patientId, input.getToken), getCachedFileTypes()]);
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
    const source = picked.file;
    const requestedName = picked.name ?? source.name ?? `Upload ${importedIds.length + 1}`;
    const sourceName = makeUniqueName(requestedName);
    const extension = normalizeExtension(source.extension || extensionFromName(sourceName));
    const mimeType = picked.mimeType ?? source.type ?? mimeFromExtension(extension);
    const fileType = findBestFileType(input.fileTypeId, extension, mimeType, types);
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

    await SecureStore.setItemAsync(keyName(input.patientId, id), encodedKey);
    await db.insert(filesMetadata).values({
      id,
      patientId: input.patientId,
      clinicId: null,
      folderId: input.folderId ?? null,
      fileTypeId: fileType?.id ?? null,
      name: sourceName,
      type: fileType?.code ?? null,
      mimeType,
      extension,
      sizeBytes: picked.sizeBytes ?? plaintext.byteLength,
      encryptedSizeBytes: encryptedInfo.exists ? encryptedInfo.size ?? encryptedBytes.byteLength : encryptedBytes.byteLength,
      localEncryptedPath: encryptedFile.uri,
      cloudObjectKey: null,
      syncStatus: hasFileApi() ? 'queued' : 'local',
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

export async function getFileById(patientId: string, fileId: string) {
  const [file] = await db
    .select()
    .from(filesMetadata)
    .where(and(eq(filesMetadata.patientId, patientId), eq(filesMetadata.id, fileId), isNull(filesMetadata.deletedAt)))
    .limit(1);

  return file ?? null;
}

export async function preparePreviewFile(patientId: string, fileId: string): Promise<PreparedPreviewFile> {
  const file = await getFileById(patientId, fileId);
  if (!file) throw new Error('File not found.');
  if (!file.localEncryptedPath) throw new Error('This file is not available offline yet.');

  const encodedKey = await SecureStore.getItemAsync(keyName(patientId, fileId));
  if (!encodedKey) throw new Error('The local file key is missing. Sync restore is required.');

  const encryptedFile = new File(file.localEncryptedPath);
  const encryptedBytes = await encryptedFile.bytes();
  const key = await Crypto.AESEncryptionKey.import(encodedKey, 'base64');
  const sealed = Crypto.AESSealedData.fromCombined(encryptedBytes, { ivLength: 12, tagLength: 16 });
  const decrypted = await Crypto.aesDecryptAsync(sealed, key, { output: 'bytes' });
  const previewDir = getPatientPreviewDir(patientId);
  ensureDirectory(previewDir);
  const extension = normalizeExtension(file.extension) || extensionFromName(file.name) || 'bin';
  const previewFile = new File(previewDir, `${file.id}.${extension}`);
  previewFile.write(decrypted);

  return {
    uri: previewFile.uri,
    name: file.name,
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
): Promise<SyncPendingFilesResult> {
  if (!hasFileApi() || !getToken) {
    return { synced: 0, failed: 0, skipped: true, reason: 'File API URL is not configured.' };
  }

  const network = await NetInfo.fetch();
  if (!network.isConnected) {
    return { synced: 0, failed: 0, skipped: true, reason: 'Device is offline.' };
  }

  const pending = await db
    .select()
    .from(filesMetadata)
    .where(
      and(
        eq(filesMetadata.patientId, patientId),
        isNull(filesMetadata.deletedAt),
        or(eq(filesMetadata.syncStatus, 'queued'), eq(filesMetadata.syncStatus, 'failed')),
      ),
    );

  let synced = 0;
  let failed = 0;

  for (const file of pending) {
    if (!file.localEncryptedPath) continue;

    try {
      await db.update(filesMetadata).set({ syncStatus: 'syncing', syncError: null }).where(eq(filesMetadata.id, file.id));
      const encryptedFile = new File(file.localEncryptedPath);
      const intent = await createUploadIntent(getToken, {
        clientFileId: file.id,
        name: file.name,
        fileTypeId: file.fileTypeId,
        folderId: file.folderId,
        mimeType: file.mimeType,
        extension: file.extension,
        sizeBytes: file.sizeBytes,
        encryptedSizeBytes: file.encryptedSizeBytes ?? encryptedFile.size,
        encryptedHash: file.encryptedHash,
        encryption: {
          algorithm: file.encryptionAlgorithm,
          ivBase64: file.encryptionIvBase64,
          tagBase64: file.encryptionTagBase64,
          keyId: file.encryptionKeyId,
        },
      });

      const upload = await encryptedFile.upload(intent.uploadUrl, {
        httpMethod: 'PUT',
        uploadType: UploadType.BINARY_CONTENT,
        headers: intent.uploadHeaders ?? { 'Content-Type': 'application/octet-stream' },
      });

      if (upload.status < 200 || upload.status >= 300) {
        throw new Error(`Cloud upload failed with status ${upload.status}.`);
      }

      const complete = intent.serverFileId
        ? await completeUpload(getToken, intent.serverFileId, {
          clientFileId: file.id,
          cloudObjectKey: intent.cloudObjectKey,
          encryptedHash: file.encryptedHash,
        })
        : undefined;

      await db
        .update(filesMetadata)
        .set({
          syncStatus: 'synced',
          syncError: null,
          syncedAt: now(),
          serverId: intent.serverFileId ?? file.serverId,
          cloudObjectKey: intent.cloudObjectKey ?? file.cloudObjectKey,
          serverWrappedKeyJson: complete?.wrappedKeyJson ?? intent.wrappedKeyJson ?? file.serverWrappedKeyJson,
          serverUpdatedAt: complete?.serverUpdatedAt ? new Date(complete.serverUpdatedAt) : now(),
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
    }
  }

  await getFileConfig(patientId, getToken);
  return { synced, failed, skipped: false };
}

export function formatBytes(bytes: number | null | undefined) {
  const value = bytes ?? 0;
  if (value < 1024) return `${value} B`;
  const kb = value / 1024;
  if (kb < 1024) return `${kb.toFixed(kb < 10 ? 1 : 0)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
}

export function getTypeExtensions(type: { supportedExtensionsJson: string }) {
  return parseJsonArray<string>(type.supportedExtensionsJson, []);
}

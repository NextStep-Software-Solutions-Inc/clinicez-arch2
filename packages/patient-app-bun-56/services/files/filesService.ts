import { and, asc, desc, eq, inArray, isNull, or } from 'drizzle-orm';
import * as Crypto from 'expo-crypto';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import * as FileSystem from 'expo-file-system';
import { Directory, File, Paths, UploadType } from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';
import NetInfo from '@react-native-community/netinfo';
import { Buffer } from 'buffer';
import { mutate } from 'swr';
import { DeviceEventEmitter } from 'react-native';
import { db } from '@db/index';
import { fileFolders } from '@db/schema/fileFolders';
import { filesMetadata } from '@db/schema/filesMetadata';
import { documentTypes } from '@db/schema/documentTypes';
import { fileUploadConfig } from '@db/schema/fileUploadConfig';
import { completeUpload, createUploadIntent, fetchFileConfig, fetchFiles, getFileDownloadUrl, hasFileApi } from '../api/filesApi';
import { pushSyncPayload, type SyncItemRequest } from '../api/patientApi';
import {
  DEFAULT_MAX_FILE_SIZE_BYTES,
  DEFAULT_USER_QUOTA_BYTES,
  FileApiConfigResponse,
  DocumentTypeResponse,
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

const DEFAULT_FILE_TYPES: DocumentTypeResponse[] = [
  {
    id: '11111111-1111-1111-1111-111111111111',
    code: 'xray',
    label: 'X-ray',
    description: 'Radiology images and x-ray reports.',
    supportedExtensions: ['jpg', 'jpeg', 'png', 'pdf', 'dcm'],
    supportedMimeTypes: ['image/*', 'application/pdf'],
    nativePreviewKind: 'image',
    sortOrder: 10,
    isActive: true,
  },
  {
    id: '22222222-2222-2222-2222-222222222222',
    code: 'lab-result',
    label: 'Lab result',
    description: 'Laboratory result PDFs or images.',
    supportedExtensions: ['pdf', 'jpg', 'jpeg', 'png'],
    supportedMimeTypes: ['application/pdf', 'image/*'],
    nativePreviewKind: 'pdf',
    sortOrder: 20,
    isActive: true,
  },
  {
    id: '33333333-3333-3333-3333-333333333333',
    code: 'medical-certificate',
    label: 'Medical certificate',
    description: 'Medical certificates and fit-to-work documents.',
    supportedExtensions: ['pdf', 'jpg', 'jpeg', 'png', 'doc', 'docx'],
    supportedMimeTypes: ['application/pdf', 'image/*', 'application/msword'],
    nativePreviewKind: 'pdf',
    sortOrder: 30,
    isActive: true,
  },
  {
    id: '44444444-4444-4444-4444-444444444444',
    code: 'prescription',
    label: 'Prescription',
    description: 'Prescription scans, images, and PDFs.',
    supportedExtensions: ['pdf', 'jpg', 'jpeg', 'png'],
    supportedMimeTypes: ['application/pdf', 'image/*'],
    nativePreviewKind: 'pdf',
    sortOrder: 40,
    isActive: true,
  },
  {
    id: '55555555-5555-5555-5555-555555555555',
    code: 'id',
    label: 'Government ID',
    description: 'IDs and identity verification documents.',
    supportedExtensions: ['pdf', 'jpg', 'jpeg', 'png'],
    supportedMimeTypes: ['application/pdf', 'image/*'],
    nativePreviewKind: 'image',
    sortOrder: 50,
    isActive: true,
  },
  {
    id: '66666666-6666-6666-6666-666666666666',
    code: 'other',
    label: 'Other medical file',
    description: 'Other health-related documents.',
    supportedExtensions: ['pdf', 'jpg', 'jpeg', 'png', 'doc', 'docx', 'xls', 'xlsx', 'txt'],
    supportedMimeTypes: ['*/*'],
    nativePreviewKind: 'external',
    sortOrder: 100,
    isActive: true,
  },
];

function now() {
  return new Date();
}

function makeId(prefix: string) {
  return Crypto.randomUUID();
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

function getTypeLabel(typeId: string | null | undefined, types: Awaited<ReturnType<typeof getCachedDocumentTypes>>) {
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

async function getCachedDocumentTypes() {
  const rows = await db.select().from(documentTypes).orderBy(asc(documentTypes.sortOrder), asc(documentTypes.label));
  if (rows.length) return rows;
  await upsertDocumentTypes(DEFAULT_FILE_TYPES);
  return db.select().from(documentTypes).orderBy(asc(documentTypes.sortOrder), asc(documentTypes.label));
}

async function upsertDocumentTypes(rows: DocumentTypeResponse[]) {
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
        nativePreviewKind: (row.nativePreviewKind ?? 'external') as any,
        isActive: row.isActive ?? true,
        sortOrder: row.sortOrder ?? 0,
        fetchedAt: timestamp,
        serverUpdatedAt: row.serverUpdatedAt ? new Date(row.serverUpdatedAt) : null,
      };

      return db.insert(documentTypes).values(value).onConflictDoUpdate({ target: documentTypes.id, set: value });
    }),
  );
}

async function getLocalTotalStorageBytes(patientId: string) {
  const files = await db
    .select({ encryptedSizeBytes: filesMetadata.encryptedSizeBytes })
    .from(filesMetadata)
    .where(
      and(
        eq(filesMetadata.patientId, patientId),
        isNull(filesMetadata.deletedAt)
      )
    );
  
  return files.reduce((acc, f) => acc + (f.encryptedSizeBytes ?? 0), 0);
}

function toConfigValue(patientId: string, response?: FileApiConfigResponse) {
  return {
    patientId,
    maxFileSizeBytes: response?.maxFileSizeBytes ?? DEFAULT_MAX_FILE_SIZE_BYTES,
    quotaBytes: response?.quotaBytes ?? DEFAULT_USER_QUOTA_BYTES,
    usedStorageBytes: response?.usedStorageBytes ?? 0,
    nativePreviewExtensionsJson: JSON.stringify(response?.nativePreviewExtensions ?? DEFAULT_NATIVE_PREVIEW_EXTENSIONS),
    configVersion: response?.configVersion ?? 'local-defaults',
    encryptedMAK: response?.encryptedMAK ?? null,
    fetchedAt: now(),
    serverUpdatedAt: response?.serverUpdatedAt ? new Date(response.serverUpdatedAt) : null,
  };
}

export async function refreshDocumentTypes(patientId: string, getToken?: () => Promise<string | null>) {
  let configResponse: FileApiConfigResponse | undefined;

  if (hasFileApi() && getToken) {
    try {
      configResponse = await fetchFileConfig(patientId, getToken);
    } catch (error) {
      console.warn('Falling back to local file config:', error);
    }
  }

  await upsertDocumentTypes(configResponse?.documentTypes?.length ? configResponse.documentTypes : DEFAULT_FILE_TYPES);
  
  const configValue = toConfigValue(patientId, configResponse);
  
  await db
    .insert(fileUploadConfig)
    .values(configValue)
    .onConflictDoUpdate({ target: fileUploadConfig.patientId, set: configValue });

  return getCachedDocumentTypes();
}

export async function getFileConfig(patientId: string, getToken?: () => Promise<string | null>) {
  const cached = await db.select().from(fileUploadConfig).where(eq(fileUploadConfig.patientId, patientId)).limit(1);
  if (!cached[0]) {
    await refreshDocumentTypes(patientId, getToken);
  }

  const [config] = await db.select().from(fileUploadConfig).where(eq(fileUploadConfig.patientId, patientId)).limit(1);
  const value = config ?? toConfigValue(patientId);

  // Use the local SQLite database as the source of truth for storage used
  const localUsedBytes = await getLocalTotalStorageBytes(patientId);
  
  return { ...value, usedStorageBytes: localUsedBytes };
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
    getCachedDocumentTypes(),
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
      typeLabel: getTypeLabel(file.documentTypeId, types),
      previewKind: getPreviewKind(file.extension ?? '', file.mimeType),
    }));

  return {
    breadcrumbs: await getBreadcrumbs(patientId, folderId),
    folders: browserFolders,
    files: browserFiles,
    config,
    documentTypes: types,
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
    syncOperation: 'insert' as const,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  await db.insert(fileFolders).values(row);
  return row;
}

export async function renameFolder(patientId: string, folderId: string, name: string) {
  const trimmedName = name.trim();
  if (!trimmedName) throw new Error('Folder name is required.');

  const [folder] = await db
    .select()
    .from(fileFolders)
    .where(and(eq(fileFolders.patientId, patientId), eq(fileFolders.id, folderId)))
    .limit(1);
  if (!folder) return;

  const op = folder.syncOperation === 'insert' && !folder.serverId ? 'insert' : 'update';

  await db
    .update(fileFolders)
    .set({ name: trimmedName, updatedAt: now(), syncStatus: 'queued', syncOperation: op, syncError: null })
    .where(and(eq(fileFolders.patientId, patientId), eq(fileFolders.id, folderId)));
}

export async function renameFile(patientId: string, fileId: string, name: string) {
  const trimmedName = name.trim();
  if (!trimmedName) throw new Error('File name is required.');

  const [file] = await db
    .select()
    .from(filesMetadata)
    .where(and(eq(filesMetadata.patientId, patientId), eq(filesMetadata.id, fileId)))
    .limit(1);
  if (!file) return;

  const op = file.syncOperation === 'insert' && !file.serverId ? 'insert' : 'update';

  await db
    .update(filesMetadata)
    .set({ name: trimmedName, updatedAt: now(), syncStatus: 'queued', syncOperation: op, syncError: null })
    .where(and(eq(filesMetadata.patientId, patientId), eq(filesMetadata.id, fileId)));
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

    const [folder] = await db
      .select()
      .from(fileFolders)
      .where(and(eq(fileFolders.patientId, patientId), eq(fileFolders.id, itemId)))
      .limit(1);
    if (!folder) return;
    const op = folder.syncOperation === 'insert' && !folder.serverId ? 'insert' : 'update';

    await db
      .update(fileFolders)
      .set({ parentId: targetFolderId ?? null, updatedAt: now(), syncStatus: 'queued', syncOperation: op, syncError: null })
      .where(and(eq(fileFolders.patientId, patientId), eq(fileFolders.id, itemId)));
    return;
  }

  const [file] = await db
    .select()
    .from(filesMetadata)
    .where(and(eq(filesMetadata.patientId, patientId), eq(filesMetadata.id, itemId)))
    .limit(1);
  if (!file) return;
    const op = file.syncOperation === 'insert' && !file.serverId ? 'insert' : 'update';

  await db
    .update(filesMetadata)
    .set({ folderId: targetFolderId ?? null, updatedAt: now(), syncStatus: 'queued', syncOperation: op, syncError: null })
    .where(and(eq(filesMetadata.patientId, patientId), eq(filesMetadata.id, itemId)));
}

export async function deleteItem(patientId: string, itemKind: FileItemKind, itemId: string) {
  const timestamp = now();

  if (itemKind === 'folder') {
    const folders = await getFolderRows(patientId);
    const folderIds = [itemId, ...collectDescendantFolderIds(folders, itemId)];

    await Promise.all(
      folderIds.map(async (folderId) => {
        const [f] = await db.select().from(fileFolders).where(eq(fileFolders.id, folderId)).limit(1);
        if (!f) return;
        const op = f.syncOperation === 'insert' && !f.serverId ? 'delete' : 'delete';

        return db
          .update(fileFolders)
          .set({ deletedAt: timestamp, updatedAt: timestamp, syncStatus: 'queued', syncOperation: op })
          .where(and(eq(fileFolders.patientId, patientId), eq(fileFolders.id, folderId)));
      }),
    );

    await Promise.all(
      folderIds.map(async (folderId) => {
        const fileRows = await db.select().from(filesMetadata).where(and(eq(filesMetadata.patientId, patientId), eq(filesMetadata.folderId, folderId)));
        return Promise.all(fileRows.map(f => {
          const op = f.syncOperation === 'insert' && !f.serverId ? 'delete' : 'delete';
          return db
            .update(filesMetadata)
            .set({ deletedAt: timestamp, updatedAt: timestamp, syncStatus: 'queued', syncOperation: op })
            .where(eq(filesMetadata.id, f.id));
        }));
      }),
    );
    return;
  }

  const [file] = await db.select().from(filesMetadata).where(and(eq(filesMetadata.patientId, patientId), eq(filesMetadata.id, itemId))).limit(1);
  if (file) {
    const op = file.syncOperation === 'insert' && !file.serverId ? 'delete' : 'delete';
    await db
      .update(filesMetadata)
      .set({ deletedAt: timestamp, updatedAt: timestamp, syncStatus: 'queued', syncOperation: op })
      .where(and(eq(filesMetadata.patientId, patientId), eq(filesMetadata.id, itemId)));
  }
}

function findBestFileType(
  selectedTypeId: string | null | undefined,
  extension: string,
  mimeType: string,
  types: Awaited<ReturnType<typeof getCachedDocumentTypes>>,
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
    const source = picked.file;
    const requestedName = picked.name ?? source.name ?? `Upload ${importedIds.length + 1}`;
    const sourceName = makeUniqueName(requestedName);
    const extension = normalizeExtension(source.extension || extensionFromName(sourceName));
    const mimeType = picked.mimeType ?? source.type ?? mimeFromExtension(extension);
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

    await SecureStore.setItemAsync(keyName(input.patientId, id), encodedKey);
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

export async function getFileById(patientId: string, fileId: string) {
  const [file] = await db
    .select()
    .from(filesMetadata)
    .where(and(eq(filesMetadata.patientId, patientId), eq(filesMetadata.id, fileId), isNull(filesMetadata.deletedAt)))
    .limit(1);

  return file ?? null;
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
  const encodedKey = await SecureStore.getItemAsync(keyName(patientId, fileId));
  
  if (encodedKey) {
    key = await Crypto.AESEncryptionKey.import(encodedKey, 'base64');
  } else if (file.serverWrappedKeyJson) {
    // If not, it was synced from another device. We need to unwrap the key using our MAK.
    const makEncoded = await SecureStore.getItemAsync(`${'patient_mak_key'}_${patientId}`);
    if (!makEncoded) throw new Error('Master Access Key (MAK) missing. Please restart the app or setup your File Recovery Key.');
    
    const mak = await Crypto.AESEncryptionKey.import(makEncoded, 'base64');
    
    const parsed = JSON.parse(file.serverWrappedKeyJson);
    const combinedBytes = new Uint8Array(Buffer.from(parsed.cipherText, 'base64'));
    const keySealed = Crypto.AESSealedData.fromCombined(combinedBytes, { ivLength: 12, tagLength: 16 });
    
    // Decrypt the file's individual key using the MAK
    const fileKeyEncoded = await Crypto.aesDecryptAsync(keySealed, mak, { output: 'base64' });
    key = await Crypto.AESEncryptionKey.import(fileKeyEncoded, 'base64');
    
    // Cache it locally so we don't have to unwrap it next time
    await SecureStore.setItemAsync(keyName(patientId, fileId), fileKeyEncoded);
  } else {
    throw new Error('The local file key is missing. Sync restore is required.');
  }

  const encryptedFile = new File(file.localEncryptedPath);
  const encryptedBytes = await encryptedFile.bytes();
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

  // Downstream sync
  try {
    const { folders, files } = await fetchFiles(patientId, getToken);
    
    for (const remoteFolder of folders) {
      if (remoteFolder.isDeleted) {
        await db.delete(fileFolders).where(eq(fileFolders.id, remoteFolder.id));
        continue;
      }

      const existing = await getFolder(patientId, remoteFolder.id);
      
      const row = {
        id: remoteFolder.id,
        patientId,
        parentId: remoteFolder.parentId ?? null,
        name: remoteFolder.name,
        syncStatus: 'synced' as const,
        syncOperation: 'update' as const,
        createdAt: new Date(remoteFolder.createdAt),
        updatedAt: new Date(remoteFolder.updatedAt),
        serverId: remoteFolder.id,
      };
      
      if (!existing) {
        await db.insert(fileFolders).values(row);
        synced++;
      } else if (existing.name !== row.name || existing.parentId !== row.parentId || existing.deletedAt !== null) {
        // Protect local pending changes from being overwritten by downstream pull
        if (existing.syncStatus === 'queued' || existing.syncStatus === 'failed' || existing.syncStatus === 'syncing') {
          continue;
        }
        // Protect against eventual consistency: don't overwrite if local is newer
        if (existing.updatedAt.getTime() > row.updatedAt.getTime()) {
          continue;
        }
        await db.update(fileFolders).set({
          name: row.name,
          parentId: row.parentId,
          updatedAt: row.updatedAt,
          deletedAt: null,
          syncStatus: 'synced',
        }).where(eq(fileFolders.id, remoteFolder.id));
        synced++;
      }
    }

    for (const remoteFile of files) {
      if (remoteFile.isDeleted) {
        await cleanupPreviewCache(patientId, remoteFile.id);
        await db.delete(filesMetadata).where(eq(filesMetadata.id, remoteFile.id));
        continue;
      }

      const [existing] = await db.select().from(filesMetadata).where(eq(filesMetadata.id, remoteFile.id)).limit(1);
      
      if (!existing) {
        await db.insert(filesMetadata).values({
          id: remoteFile.id,
          patientId,
          clinicId: null,
          folderId: remoteFile.folderId ?? null,
          documentTypeId: remoteFile.documentTypeId,
          name: remoteFile.fileName,
          type: null,
          mimeType: remoteFile.mimeType,
          extension: remoteFile.extension,
          sizeBytes: remoteFile.sizeBytes,
          encryptedSizeBytes: remoteFile.encryptedSizeBytes,
          localEncryptedPath: null, // Will download on demand via preparePreviewFile
          cloudObjectKey: null,
          syncStatus: 'synced',
          syncOperation: 'update',
          encryptionAlgorithm: remoteFile.encryptionAlgorithm,
          encryptionKeyId: remoteFile.encryptionKeyId,
          encryptionIvBase64: remoteFile.encryptionIvBase64,
          encryptionTagBase64: remoteFile.encryptionTagBase64,
          encryptedHash: remoteFile.encryptedHash,
          serverWrappedKeyJson: remoteFile.wrappedKeyJson,
          createdAt: new Date(remoteFile.createdAt),
          updatedAt: new Date(remoteFile.updatedAt),
          syncedAt: new Date(remoteFile.updatedAt),
          serverId: remoteFile.id,
        });
        synced++;
      } else if (
        existing.name !== remoteFile.fileName || 
        existing.folderId !== (remoteFile.folderId ?? null) ||
        existing.deletedAt !== null
      ) {
         // Protect local pending changes from being overwritten by downstream pull
         if (existing.syncStatus === 'queued' || existing.syncStatus === 'failed' || existing.syncStatus === 'syncing') {
           continue;
         }
         // Protect against eventual consistency: don't overwrite if local is newer
         if (existing.updatedAt && existing.updatedAt.getTime() > new Date(remoteFile.updatedAt).getTime()) {
           continue;
         }
         await db.update(filesMetadata).set({
           name: remoteFile.fileName,
           folderId: remoteFile.folderId ?? null,
           deletedAt: null,
           syncStatus: 'synced',
         }).where(eq(filesMetadata.id, remoteFile.id));
         synced++;
      }
    }
    
    if (synced > 0) {
      mutate((key: any) => Array.isArray(key) && key[0] === 'files-browser');
    }
  } catch (err) {
    console.warn("Downstream sync failed", err);
  }

  // Upstream sync
  const pendingFolders = await db
    .select()
    .from(fileFolders)
    .where(
      and(
        eq(fileFolders.patientId, patientId),
        retryFailed 
          ? or(eq(fileFolders.syncStatus, 'queued'), eq(fileFolders.syncStatus, 'failed'))
          : eq(fileFolders.syncStatus, 'queued'),
      ),
    );

  const pendingFiles = await db
    .select()
    .from(filesMetadata)
    .where(
      and(
        eq(filesMetadata.patientId, patientId),
        retryFailed 
          ? or(eq(filesMetadata.syncStatus, 'queued'), eq(filesMetadata.syncStatus, 'failed'))
          : eq(filesMetadata.syncStatus, 'queued'),
      ),
    );

  const syncRequests: SyncItemRequest[] = [];
  
  for (const folder of pendingFolders) {
     const rawOp = folder.syncOperation === 'insert' && folder.serverId ? 'update' : folder.syncOperation;
     syncRequests.push({
        idempotencyKey: Crypto.randomUUID(),
        entityType: 'file_folder',
        operation: rawOp === 'insert' ? 'create' : rawOp,
        clientTimestamp: (folder.updatedAt ?? new Date()).toISOString(),
        entityId: folder.id,
        payloadJson: JSON.stringify({
            clientId: Crypto.randomUUID(),
            parentId: folder.parentId,
            name: folder.name,
            updatedAt: (folder.updatedAt ?? new Date()).toISOString()
        })
     });
  }

  const uploadIntentFiles = [];

  for (const file of pendingFiles) {
     if (file.syncOperation === 'insert' && !file.serverId) {
         uploadIntentFiles.push(file);
     } else {
         const op = file.syncOperation === 'insert' && file.serverId ? 'update' : file.syncOperation;
         syncRequests.push({
            idempotencyKey: Crypto.randomUUID(),
            entityType: 'file',
            operation: op,
            clientTimestamp: (file.updatedAt ?? new Date()).toISOString(),
            entityId: file.id,
            payloadJson: JSON.stringify({
                clientId: Crypto.randomUUID(),
                folderId: file.folderId,
                fileName: file.name,
                updatedAt: (file.updatedAt ?? new Date()).toISOString()
            })
         });
     }
  }

  // Send Bulk Sync for Metadata and Deletes
  if (syncRequests.length > 0) {
      try {
          await pushSyncPayload(getToken, patientId, syncRequests);
          
          for (const folder of pendingFolders) {
              await db.update(fileFolders).set({ syncStatus: 'synced', syncError: null }).where(eq(fileFolders.id, folder.id));
          }

          for (const file of pendingFiles) {
              if (file.syncOperation !== 'insert') {
                  if (file.syncOperation === 'delete') {
                      await cleanupPreviewCache(patientId, file.id);
                  }
                  await db.update(filesMetadata).set({ syncStatus: 'synced', syncError: null }).where(eq(filesMetadata.id, file.id));
              }
          }
          synced += syncRequests.length;
          mutate((key: any) => Array.isArray(key) && key[0] === 'files-browser');
      } catch (err) {
          failed += syncRequests.length;
          console.warn("Bulk sync push failed", err);
      }
  }

  for (const file of uploadIntentFiles) {
    if (!file.localEncryptedPath) continue;

    try {
      await db.update(filesMetadata).set({ syncStatus: 'syncing', syncError: null }).where(eq(filesMetadata.id, file.id));
      mutate((key: any) => Array.isArray(key) && key[0] === 'files-browser');
      const encryptedFile = new File(file.localEncryptedPath);
      let wrappedKeyJson = '';
      const fileKeyEncoded = await SecureStore.getItemAsync(keyName(patientId, file.id));
      if (fileKeyEncoded) {
        const makEncoded = await SecureStore.getItemAsync(`${'patient_mak_key'}_${patientId}`);
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

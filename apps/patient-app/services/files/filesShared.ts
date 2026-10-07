import { and, asc, desc, eq, isNull, or, isNotNull } from 'drizzle-orm';
import { randomUUID } from 'expo-crypto';
import { mutate } from 'swr';
import { db } from '@db/index';
import { fileFolders } from '@db/schema/fileFolders';
import { filesMetadata } from '@db/schema/filesMetadata';
import type { FileMetadata } from '@db/schema/filesMetadata';
import { documentTypes } from '@db/schema/documentTypes';
import { fileUploadConfig } from '@db/schema/fileUploadConfig';
import { fetchFileConfig, fetchFiles, hasFileApi } from '../api/filesApi';
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
} from './types';

/**
 * Platform-neutral part of the files service (SQLite/sql.js metadata, folder tree,
 * config and the metadata sync pipeline). Binary I/O lives in `filesService.ts`
 * (native) and `filesService.web.ts` (web).
 */

export const DEFAULT_NATIVE_PREVIEW_EXTENSIONS = ['jpg', 'jpeg', 'png', 'heic', 'webp', 'pdf'];

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

export function now() {
  return new Date();
}

export function makeId(prefix: string) {
  return randomUUID();
}

export const KEY_PREFIX = 'patient_file_key';

export function sanitizeKeyPart(part: string) {
  // Allow only alphanumeric, dot, dash, and underscore. Replace others with underscore.
  const sanitized = (part ?? '').replace(/[^A-Za-z0-9._-]/g, '_');
  // Trim leading/trailing underscores to avoid empty-looking segments.
  return sanitized.replace(/^_+|_+$/g, '');
}

export function keyName(patientId: string, fileId: string) {
  const p = sanitizeKeyPart(patientId);
  const f = sanitizeKeyPart(fileId);
  if (!p || !f) throw new Error('SecureStore key parts must be non-empty.');
  return `${KEY_PREFIX}_${p}_${f}`;
}

export function parseJsonArray<T>(value: string | null | undefined, fallback: T[]): T[] {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export function normalizeExtension(extension: string | null | undefined) {
  return (extension ?? '').replace(/^\./, '').trim().toLowerCase();
}

export function extensionFromName(name: string) {
  const match = /\.([a-z0-9]+)$/i.exec(name);
  return normalizeExtension(match?.[1] ?? '');
}

export function mimeFromExtension(extension: string) {
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

export function extensionFromMime(mimeType: string) {
  if (!mimeType) return '';
  if (mimeType.includes('pdf')) return 'pdf';
  if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return 'jpg';
  if (mimeType.includes('png')) return 'png';
  if (mimeType.includes('heic')) return 'heic';
  if (mimeType.includes('gif')) return 'gif';
  if (mimeType.includes('webp')) return 'webp';
  if (mimeType.startsWith('image/') || mimeType === 'image') return 'jpg'; // Fallback for generic images
  if (mimeType.includes('word') || mimeType.includes('msword')) return 'docx';
  if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return 'xlsx';
  if (mimeType.includes('zip')) return 'zip';
  if (mimeType.includes('csv')) return 'csv';
  if (mimeType.includes('text/plain')) return 'txt';
  if (mimeType.includes('video/mp4')) return 'mp4';
  if (mimeType.includes('video/quicktime')) return 'mov';
  if (mimeType.includes('audio/mpeg')) return 'mp3';
  if (mimeType.includes('audio/wav')) return 'wav';

  // Fallback to the subtype, e.g., "application/zip" -> "zip", "text/csv" -> "csv"
  const subtype = mimeType.split('/')[1];
  if (subtype && !subtype.includes('.') && !subtype.includes('+') && !subtype.includes('-')) {
    return subtype; // reasonable fallback for "image/gif" -> "gif", etc.
  }
  return '';
}

export function getPreviewKind(extension: string, mimeType: string | null | undefined): FilePreviewKind {
  const normalized = normalizeExtension(extension);
  if (mimeType?.startsWith('image/') || ['jpg', 'jpeg', 'png', 'heic', 'webp'].includes(normalized)) return 'image';
  if (mimeType === 'application/pdf' || normalized === 'pdf') return 'pdf';
  return 'external';
}

function getTypeLabel(typeId: string | null | undefined, types: Awaited<ReturnType<typeof getCachedDocumentTypes>>) {
  return types.find((type) => type.id === typeId)?.label ?? 'Medical file';
}

export async function getCachedDocumentTypes() {
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
  const [folders, fileRows, allFolders, config, types, pendingRows, allFileFolderIds] = await Promise.all([
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
    db
      .select({ folderId: filesMetadata.folderId })
      .from(filesMetadata)
      .where(
        and(
          eq(filesMetadata.patientId, patientId),
          isNull(filesMetadata.deletedAt),
          isNotNull(filesMetadata.folderId)
        )
      )
  ]);

  const childCounts = new Map<string, number>();
  for (const folder of allFolders) {
    if (folder.parentId) childCounts.set(folder.parentId, (childCounts.get(folder.parentId) ?? 0) + 1);
  }
  for (const file of allFileFolderIds) {
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

export async function getStorageOverview(
  patientId: string,
  getToken?: () => Promise<string | null>,
): Promise<FileBrowserContents> {
  const [allFolders, allFiles, config, types, pendingRows] = await Promise.all([
    db
      .select()
      .from(fileFolders)
      .where(and(eq(fileFolders.patientId, patientId), isNull(fileFolders.deletedAt)))
      .orderBy(asc(fileFolders.name)),
    db
      .select()
      .from(filesMetadata)
      .where(and(eq(filesMetadata.patientId, patientId), isNull(filesMetadata.deletedAt)))
      .orderBy(desc(filesMetadata.updatedAt), desc(filesMetadata.createdAt)),
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
  for (const file of allFiles) {
    if (file.folderId) childCounts.set(file.folderId, (childCounts.get(file.folderId) ?? 0) + 1);
  }

  const browserFolders: FileBrowserFolder[] = allFolders.map((folder) => ({
    ...folder,
    kind: 'folder',
    childCount: childCounts.get(folder.id) ?? 0,
  }));

  const browserFiles: FileBrowserFile[] = allFiles.map((file) => ({
    ...file,
    kind: 'file',
    typeLabel: getTypeLabel(file.documentTypeId, types),
    previewKind: getPreviewKind(file.extension ?? '', file.mimeType),
  }));

  return {
    breadcrumbs: [],
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

export function findBestFileType(
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

export async function getFileById(patientId: string, fileId: string) {
  const [file] = await db
    .select()
    .from(filesMetadata)
    .where(and(eq(filesMetadata.patientId, patientId), eq(filesMetadata.id, fileId), isNull(filesMetadata.deletedAt)))
    .limit(1);

  return file ?? null;
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

/** Pulls remote folders/files into the local metadata store. Returns the number of changed rows. */
export async function pullRemoteChanges(
  patientId: string,
  getToken: () => Promise<string | null>,
  cleanupPreview: (fileId: string) => Promise<void>,
): Promise<number> {
  let synced = 0;
  try {
    const { folders, files } = await fetchFiles(patientId, getToken);

    for (const remoteFolder of folders) {
      try {
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
          updatedAt: new Date(remoteFolder.updatedAt ?? remoteFolder.createdAt),
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
      } catch (err) {
        console.warn(`Failed to downstream sync folder ${remoteFolder.id}`, err);
      }
    }

    for (const remoteFile of files) {
      try {
        if (remoteFile.isDeleted) {
          await cleanupPreview(remoteFile.id);
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
      } catch (err) {
        console.warn(`Failed to downstream sync file ${remoteFile.id}`, err);
      }
    }

    if (synced > 0) {
      mutate((key: any) => Array.isArray(key) && key[0] === 'files-browser');
    }
  } catch (err) {
    console.warn("Downstream sync failed", err);
  }
  return synced;
}

export interface PushMetadataResult {
  synced: number;
  failed: number;
  /** New files whose binary still needs uploading (native offline queue). */
  uploadIntentFiles: FileMetadata[];
}

/** Pushes queued metadata changes (folders, renames, moves, deletes) in a single bulk sync. */
export async function pushPendingMetadata(
  patientId: string,
  getToken: () => Promise<string | null>,
  retryFailed: boolean,
  cleanupPreview: (fileId: string) => Promise<void>,
): Promise<PushMetadataResult> {
  let synced = 0;
  let failed = 0;
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
      idempotencyKey: randomUUID(),
      entityType: 'file_folder',
      operation: rawOp === 'insert' ? 'create' : rawOp,
      clientTimestamp: (folder.updatedAt ?? new Date()).toISOString(),
      entityId: folder.id,
      payloadJson: JSON.stringify({
        clientId: randomUUID(),
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
        idempotencyKey: randomUUID(),
        entityType: 'file',
        operation: op,
        clientTimestamp: (file.updatedAt ?? new Date()).toISOString(),
        entityId: file.id,
        payloadJson: JSON.stringify({
          clientId: randomUUID(),
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
        // If it's an insert without a serverId, it's a binary upload (handled below)
        if (file.syncOperation === 'insert' && !file.serverId) {
          continue;
        }

        if (file.syncOperation === 'delete') {
          await cleanupPreview(file.id);
        }
        await db.update(filesMetadata).set({ syncStatus: 'synced', syncError: null }).where(eq(filesMetadata.id, file.id));
      }
      synced += syncRequests.length;
      mutate((key: any) => Array.isArray(key) && key[0] === 'files-browser');
    } catch (err) {
      failed += syncRequests.length;
      console.warn("Bulk sync push failed", err);
    }
  }
  return { synced, failed, uploadIntentFiles: uploadIntentFiles as FileMetadata[] };
}

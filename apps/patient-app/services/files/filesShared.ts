import { and, asc, desc, eq, isNull, or, isNotNull } from 'drizzle-orm';
import { randomUUID } from 'expo-crypto';
import { mutate } from 'swr';
import { db } from '@db/index';
import { filesMetadata } from '@db/schema/filesMetadata';
import type { FileMetadata } from '@db/schema/filesMetadata';
import { documentTypes } from '@db/schema/documentTypes';
import { fetchPatientRecords, hasFileApi } from '../api/filesApi';
import { pushSyncPayload, type SyncItemRequest } from '../api/patientApi';
import { deleteHealthRecord } from './recordDeletionService';
import {
  DEFAULT_MAX_FILE_SIZE_BYTES,
  FileApiConfigResponse,
  DocumentTypeResponse,
  FileBrowserContents,
  FileBrowserFile,
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
    .select({ sizeBytes: filesMetadata.sizeBytes })
    .from(filesMetadata)
    .where(
      and(
        eq(filesMetadata.patientId, patientId),
        isNull(filesMetadata.deletedAt)
      )
    );

  return files.reduce((acc, f) => acc + (f.sizeBytes ?? 0), 0);
}

function toConfigValue(patientId: string, response?: FileApiConfigResponse) {
  return {
    patientId,
    maxFileSizeBytes: response?.maxFileSizeBytes ?? DEFAULT_MAX_FILE_SIZE_BYTES,
    nativePreviewExtensionsJson: JSON.stringify(response?.nativePreviewExtensions ?? DEFAULT_NATIVE_PREVIEW_EXTENSIONS),
    configVersion: response?.configVersion ?? 'local-defaults',
    fetchedAt: now(),
    serverUpdatedAt: response?.serverUpdatedAt ? new Date(response.serverUpdatedAt) : null,
  };
}

export async function refreshDocumentTypes(_patientId: string, _getToken?: () => Promise<string | null>) {
  await upsertDocumentTypes(DEFAULT_FILE_TYPES);
  return getCachedDocumentTypes();
}

export async function getFileConfig(patientId: string, _getToken?: () => Promise<string | null>) {
  return toConfigValue(patientId);
}

export async function listFolderContents(
  patientId: string,
  _folderId?: string | null,
  query = '',
  getToken?: () => Promise<string | null>,
): Promise<FileBrowserContents> {
  const normalizedQuery = query.trim().toLowerCase();
  const [fileRows, config, types, pendingRows] = await Promise.all([
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

  const browserFiles: FileBrowserFile[] = fileRows
    .filter((file) => !normalizedQuery || file.name.toLowerCase().includes(normalizedQuery))
    .map((file) => ({
      ...file,
      kind: 'file',
      typeLabel: getTypeLabel(file.documentTypeId, types),
      previewKind: getPreviewKind(file.extension ?? '', file.mimeType),
    }));

  return {
    files: browserFiles,
    documentTypes: types,
    pendingSyncCount: pendingRows.length,
    maxFileSizeBytes: config.maxFileSizeBytes,
  };
}

export async function getStorageOverview(
  patientId: string,
  getToken?: () => Promise<string | null>,
): Promise<FileBrowserContents> {
  return listFolderContents(patientId, null, '', getToken);
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

export async function deleteItem(
  patientId: string,
  _itemKindOrId: string,
  maybeId?: string | (() => Promise<string | null>),
  maybeGetToken?: () => Promise<string | null>
): Promise<void> {
  const targetId = typeof maybeId === 'string' ? maybeId : _itemKindOrId;
  const getToken = typeof maybeId === 'function' ? maybeId : maybeGetToken;
  await deleteHealthRecord({
    patientId,
    fileId: targetId,
    getToken,
  });
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
    const records = await fetchPatientRecords(patientId, getToken);

    for (const remoteFile of records) {
      try {
        const [existing] = await db.select().from(filesMetadata).where(eq(filesMetadata.id, remoteFile.id)).limit(1);

        if (!existing) {
          await db.insert(filesMetadata).values({
            id: remoteFile.id,
            patientId,
            clinicId: null,
            documentTypeId: remoteFile.documentTypeId,
            name: remoteFile.fileName,
            type: null,
            mimeType: remoteFile.mimeType,
            extension: remoteFile.extension,
            sizeBytes: remoteFile.sizeBytes,
            localPath: null,
            isCached: false,
            cloudObjectKey: remoteFile.storageKey,
            syncStatus: 'synced',
            syncOperation: 'update',
            createdAt: new Date(remoteFile.uploadedAt),
            updatedAt: new Date(remoteFile.uploadedAt),
            syncedAt: new Date(remoteFile.uploadedAt),
            serverId: remoteFile.id,
          });
          synced++;
        } else if (
          existing.name !== remoteFile.fileName ||
          existing.deletedAt !== null
        ) {
          // Protect local pending changes from being overwritten by downstream pull
          if (existing.syncStatus === 'queued' || existing.syncStatus === 'failed' || existing.syncStatus === 'syncing') {
            continue;
          }
          // Protect against eventual consistency: don't overwrite if local is newer
          if (existing.updatedAt && existing.updatedAt.getTime() > new Date(remoteFile.uploadedAt).getTime()) {
            continue;
          }
          await db.update(filesMetadata).set({
            name: remoteFile.fileName,
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

/** Pushes queued metadata changes (renames, deletes) in a single bulk sync. */
export async function pushPendingMetadata(
  patientId: string,
  getToken: () => Promise<string | null>,
  retryFailed: boolean,
  cleanupPreview: (fileId: string) => Promise<void>,
): Promise<PushMetadataResult> {
  let synced = 0;
  let failed = 0;

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

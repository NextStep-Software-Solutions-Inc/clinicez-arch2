import { and, asc, desc, eq, isNotNull, isNull, notInArray, or } from 'drizzle-orm';
import { mutate } from 'swr';
import { filesMetadata } from '@db/schema/filesMetadata';
import type { FileMetadata } from '@db/schema/filesMetadata';
import { documentTypes, type DocumentType } from '@db/schema/documentTypes';
import { fetchDocumentTypes, fetchPatientRecords, hasFileApi } from '../api/filesApi';
import { pushSyncPayload, type SyncItemRequest } from '../api/patientApi';
import { preCacheUncachedDocuments } from '../sync/preCachingService';
import { formatRecordCategoryLabel, resolveDocumentTypeId } from './documentTypeMapping';
import {
  DEFAULT_MAX_FILE_SIZE_BYTES,
  FileApiConfigResponse,
  DocumentTypeResponse,
  FileBrowserContents,
  FileBrowserFile,
  FilePreviewKind,
} from './types';

/**
 * Platform-neutral part of the files service (SQLite/sql.js metadata, folder tree,
 * config and the metadata sync pipeline). Binary I/O lives in `filesService.ts`
 * (native) and `filesService.web.ts` (web).
 */

export const DEFAULT_NATIVE_PREVIEW_EXTENSIONS = ['jpg', 'jpeg', 'png', 'heic', 'webp', 'pdf'];

export const DEFAULT_FILE_TYPES: DocumentTypeResponse[] = [];

function resolveDb(dbOverride?: any) {
  if (dbOverride) return dbOverride;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('@db/index').db;
}

export function generateUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('expo-crypto').randomUUID();
}

async function safeFlushDatabase() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const dbModule = require('@db/index');
    await dbModule.flushDatabaseSnapshot?.();
  } catch {
    // Ignored in non-web test runners
  }
}

function revalidateDocumentTypeViews() {
  try {
    void mutate((key: unknown) =>
      Array.isArray(key) && (key[0] === 'document-types' || key[0] === 'files-browser')
    );
  } catch {
    // Ignored in non-SWR test runners
  }
}

export function now() {
  return new Date();
}

export function makeId(_prefix: string) {
  return generateUuid();
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

function getTypeLabel(
  typeId: string | null | undefined,
  types: readonly DocumentType[],
  fallbackType?: string | null
) {
  if (typeId) {
    const direct = types.find((type) => type.id.toLowerCase() === typeId.toLowerCase());
    if (direct) return direct.label;
    const formatted = formatRecordCategoryLabel(typeId, types);
    if (formatted) {
      const resolvedId = resolveDocumentTypeId(typeId, undefined, types);
      const mapped = types.find((type) => type.id.toLowerCase() === resolvedId.toLowerCase());
      if (mapped) return mapped.label;
      return formatted;
    }
  }
  return formatRecordCategoryLabel(fallbackType, types) ?? 'Medical file';
}

function normalizePreviewKind(kind?: string | null): 'image' | 'pdf' | 'external' | 'none' {
  switch ((kind ?? '').toLowerCase()) {
    case 'image':
      return 'image';
    case 'pdf':
      return 'pdf';
    case 'none':
      return 'none';
    default:
      return 'external';
  }
}

async function upsertDocumentTypes(rows: DocumentTypeResponse[], dbOverride?: any) {
  const targetDb = resolveDb(dbOverride);
  const timestamp = now();
  for (const row of rows) {
    const parsedUpdatedAt = row.serverUpdatedAt ? new Date(row.serverUpdatedAt) : null;
    const serverUpdatedAt =
      parsedUpdatedAt && !Number.isNaN(parsedUpdatedAt.getTime()) ? parsedUpdatedAt : null;

    const value = {
      id: row.id,
      code: row.code,
      label: row.label,
      description: row.description ?? null,
      supportedExtensionsJson: JSON.stringify(row.supportedExtensions ?? []),
      supportedMimeTypesJson: JSON.stringify(row.supportedMimeTypes ?? []),
      nativePreviewKind: normalizePreviewKind(row.nativePreviewKind),
      isActive: row.isActive ?? true,
      sortOrder: row.sortOrder ?? 0,
      fetchedAt: timestamp,
      serverUpdatedAt,
    };

    await targetDb
      .insert(documentTypes)
      .values(value)
      .onConflictDoUpdate({ target: documentTypes.id, set: value });
  }
}

/**
 * Reconciles the local `document_types` SQLite table against authoritative backend rows:
 * - Inserts new backend types
 * - Updates existing types whose code, label, extensions, MIME types, sortOrder, or isActive changed
 * - Prunes local rows that were deleted on the backend
 */
export async function reconcileDocumentTypes(
  remoteRows: DocumentTypeResponse[],
  dbOverride?: any
): Promise<DocumentType[]> {
  const targetDb = resolveDb(dbOverride);

  if (remoteRows.length > 0) {
    await upsertDocumentTypes(remoteRows, targetDb);
    const remoteIds = remoteRows.map((row) => row.id);
    await targetDb.delete(documentTypes).where(notInArray(documentTypes.id, remoteIds));
    if (!dbOverride) {
      await safeFlushDatabase();
      revalidateDocumentTypeViews();
    }
  }

  return targetDb
    .select()
    .from(documentTypes)
    .orderBy(asc(documentTypes.sortOrder), asc(documentTypes.label));
}

export async function getCachedDocumentTypes(dbOverride?: any): Promise<DocumentType[]> {
  const targetDb = resolveDb(dbOverride);
  return targetDb
    .select()
    .from(documentTypes)
    .orderBy(asc(documentTypes.sortOrder), asc(documentTypes.label));
}

export async function getActiveDocumentTypes(dbOverride?: any): Promise<DocumentType[]> {
  const rows = await getCachedDocumentTypes(dbOverride);
  return rows.filter((row) => row.isActive);
}

export interface RefreshDocumentTypesOptions {
  force?: boolean;
  db?: any;
  fetchFn?: () => Promise<DocumentTypeResponse[]>;
  throwOnError?: boolean;
}

let inFlightDocumentTypesRefresh: Promise<DocumentType[]> | null = null;
let lastDocumentTypesSyncedAtMs = 0;
const DOCUMENT_TYPES_SYNC_TTL_MS = 15_000;

/**
 * Downloads `GET /api/v1/document-types` from the backend and reconciles the local SQLite
 * `document_types` table so backend additions, updates, deactivations, and deletions are
 * reflected locally while remaining 100% available offline.
 */
export async function refreshDocumentTypes(
  _patientId: string,
  getToken?: () => Promise<string | null>,
  options?: RefreshDocumentTypesOptions
): Promise<DocumentType[]> {
  const targetDb = options?.db;
  const isCustomRun = Boolean(options?.db || options?.fetchFn);

  if (!isCustomRun && !options?.force && Date.now() - lastDocumentTypesSyncedAtMs < DOCUMENT_TYPES_SYNC_TTL_MS) {
    const existing = await resolveDb(targetDb)
      .select()
      .from(documentTypes)
      .orderBy(asc(documentTypes.sortOrder), asc(documentTypes.label));
    if (existing.length > 0) {
      return existing;
    }
  }

  const canFetchRemote = Boolean(
    options?.fetchFn ||
      (getToken &&
        hasFileApi() &&
        (typeof navigator === 'undefined' || navigator.onLine !== false))
  );

  if (!canFetchRemote) {
    const cached = await getCachedDocumentTypes(targetDb);
    if (options?.throwOnError && cached.length === 0 && (options?.fetchFn || hasFileApi())) {
      throw new Error('Internet connection is required to download app configuration.');
    }
    return cached;
  }

  const runSync = async (): Promise<DocumentType[]> => {
    try {
      const remoteRows = options?.fetchFn
        ? await options.fetchFn()
        : await fetchDocumentTypes(getToken!);

      if (Array.isArray(remoteRows) && remoteRows.length > 0) {
        const reconciled = await reconcileDocumentTypes(remoteRows, targetDb);
        if (!isCustomRun) {
          lastDocumentTypesSyncedAtMs = Date.now();
        }
        return reconciled;
      }

      if (options?.throwOnError) {
        const cached = await getCachedDocumentTypes(targetDb);
        if (cached.length === 0) {
          throw new Error('Unable to download required document configuration.');
        }
        return cached;
      }
    } catch (err) {
      if (options?.throwOnError) {
        throw err instanceof Error
          ? err
          : new Error('Unable to download required app configuration.');
      }
      console.warn('Failed to refresh document types from backend; using local SQLite cache.', err);
    }

    return getCachedDocumentTypes(targetDb);
  };

  if (isCustomRun || options?.throwOnError) {
    return runSync();
  }

  if (!inFlightDocumentTypesRefresh) {
    inFlightDocumentTypesRefresh = runSync().finally(() => {
      inFlightDocumentTypesRefresh = null;
    });
  }

  return inFlightDocumentTypesRefresh;
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

export async function getFileConfig(patientId: string, _getToken?: () => Promise<string | null>) {
  return toConfigValue(patientId);
}

export async function listFolderContents(
  patientId: string,
  _folderId?: string | null,
  query = '',
  getToken?: () => Promise<string | null>,
): Promise<FileBrowserContents> {
  const targetDb = resolveDb();
  const normalizedQuery = query.trim().toLowerCase();
  const [fileRows, config, types, pendingRows] = await Promise.all([
    targetDb
      .select()
      .from(filesMetadata)
      .where(and(eq(filesMetadata.patientId, patientId), isNull(filesMetadata.deletedAt)))
      .orderBy(desc(filesMetadata.updatedAt), desc(filesMetadata.createdAt)),
    getFileConfig(patientId, getToken),
    getCachedDocumentTypes(),
    targetDb
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
    .filter((file: FileMetadata) => !normalizedQuery || file.name.toLowerCase().includes(normalizedQuery))
    .map((file: FileMetadata) => ({
      ...file,
      kind: 'file',
      typeLabel: getTypeLabel(file.documentTypeId, types, file.type),
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
  const targetDb = resolveDb();
  const trimmedName = name.trim();
  if (!trimmedName) throw new Error('File name is required.');

  const [file] = await targetDb
    .select()
    .from(filesMetadata)
    .where(and(eq(filesMetadata.patientId, patientId), eq(filesMetadata.id, fileId)))
    .limit(1);
  if (!file) return;

  const existingExt =
    normalizeExtension(file.extension) ||
    extensionFromName(file.name) ||
    extensionFromMime(file.mimeType ?? '');
  const finalName =
    existingExt && !extensionFromName(trimmedName) ? `${trimmedName}.${existingExt}` : trimmedName;

  const op = file.syncOperation === 'insert' && !file.serverId ? 'insert' : 'update';

  await targetDb
    .update(filesMetadata)
    .set({ name: finalName, updatedAt: now(), syncStatus: 'queued', syncOperation: op, syncError: null })
    .where(and(eq(filesMetadata.patientId, patientId), eq(filesMetadata.id, fileId)));
}

export async function deleteItem(
  patientId: string,
  _itemKindOrId: string,
  maybeId?: string | (() => Promise<string | null>),
  maybeGetToken?: () => Promise<string | null>
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { deleteHealthRecord } = require('./recordDeletionService');
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
  types: readonly DocumentType[],
) {
  const activeTypes = types.filter((t) => t.isActive);
  const pool = activeTypes.length > 0 ? activeTypes : types;

  if (selectedTypeId) {
    const selected = pool.find((type) => type.id.toLowerCase() === selectedTypeId.toLowerCase());
    if (selected) return selected;
    if (formatRecordCategoryLabel(selectedTypeId, pool)) {
      const resolvedId = resolveDocumentTypeId(selectedTypeId, undefined, pool);
      const resolved = pool.find((type) => type.id.toLowerCase() === resolvedId.toLowerCase());
      if (resolved) return resolved;
    }
  }

  return (
    pool.find((type) => {
      const extensions = parseJsonArray<string>(type.supportedExtensionsJson, []);
      const mimeTypes = parseJsonArray<string>(type.supportedMimeTypesJson, []);
      return extensions.includes(extension) || mimeTypes.includes(mimeType) || mimeTypes.includes('*/*') || (mimeType.startsWith('image/') && mimeTypes.includes('image/*'));
    }) ?? pool.find((type) => type.code === 'other') ?? pool[0]
  );
}

export async function getFileById(patientId: string, fileId: string) {
  const targetDb = resolveDb();
  const [file] = await targetDb
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
  _cleanupPreview: (fileId: string) => Promise<void>,
): Promise<number> {
  const targetDb = resolveDb();
  let synced = 0;
  try {
    const records = await fetchPatientRecords(patientId, getToken);

    for (const remoteFile of records) {
      try {
        const whereConds = [
          eq(filesMetadata.id, remoteFile.id),
          eq(filesMetadata.serverId, remoteFile.id),
        ];
        if (remoteFile.clientId) {
          whereConds.push(eq(filesMetadata.id, remoteFile.clientId));
        }

        const [existing] = await targetDb
          .select()
          .from(filesMetadata)
          .where(or(...whereConds))
          .limit(1);

        if (!existing) {
          await targetDb.insert(filesMetadata).values({
            id: remoteFile.clientId || remoteFile.id,
            patientId,
            clinicId: null,
            documentTypeId: remoteFile.documentTypeId,
            name: remoteFile.fileName,
            title: remoteFile.title ?? remoteFile.fileName,
            type: null,
            mimeType: remoteFile.mimeType,
            extension: remoteFile.extension,
            sizeBytes: remoteFile.sizeBytes,
            documentDate: remoteFile.documentDate ?? null,
            facilityName: remoteFile.facilityName ?? null,
            notes: remoteFile.notes ?? null,
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
        } else {
          // Record already exists: update existing row in-place
          const updates: Record<string, any> = {};
          if (!existing.serverId) {
            updates.serverId = remoteFile.id;
          }
          if (!existing.cloudObjectKey && remoteFile.storageKey) {
            updates.cloudObjectKey = remoteFile.storageKey;
          }

          if (
            existing.name !== remoteFile.fileName ||
            existing.documentTypeId !== remoteFile.documentTypeId ||
            (remoteFile.sizeBytes > 0 && existing.sizeBytes !== remoteFile.sizeBytes) ||
            existing.deletedAt !== null
          ) {
            // Protect local pending changes from being overwritten by downstream pull
            if (existing.syncStatus === 'queued' || existing.syncStatus === 'failed' || existing.syncStatus === 'syncing') {
              if (Object.keys(updates).length > 0) {
                await targetDb.update(filesMetadata).set(updates).where(eq(filesMetadata.id, existing.id));
              }
              continue;
            }
            // Protect against eventual consistency: don't overwrite if local is newer
            if (existing.updatedAt && existing.updatedAt.getTime() > new Date(remoteFile.uploadedAt).getTime()) {
              if (Object.keys(updates).length > 0) {
                await targetDb.update(filesMetadata).set(updates).where(eq(filesMetadata.id, existing.id));
              }
              continue;
            }

            updates.name = remoteFile.fileName;
            updates.documentTypeId = remoteFile.documentTypeId;
            updates.sizeBytes = remoteFile.sizeBytes > 0 ? remoteFile.sizeBytes : existing.sizeBytes;
            updates.deletedAt = null;
            updates.syncStatus = 'synced';
          }

          if (Object.keys(updates).length > 0) {
            await targetDb.update(filesMetadata).set(updates).where(eq(filesMetadata.id, existing.id));
            synced++;
          }
        }
      } catch (err) {
        console.warn(`Failed to downstream sync file ${remoteFile.id}`, err);
      }
    }

    // Reconcile server deletions: if a file was previously synced to the server,
    // but the server no longer returns it, remove it locally so other devices stay in sync.
    const remoteServerIds = new Set(records.map((r) => r.id));
    const localSynced = await targetDb
      .select({ id: filesMetadata.id, serverId: filesMetadata.serverId })
      .from(filesMetadata)
      .where(
        and(
          eq(filesMetadata.patientId, patientId),
          isNotNull(filesMetadata.serverId),
          isNull(filesMetadata.deletedAt),
          eq(filesMetadata.syncStatus, 'synced'),
        )
      );

    for (const localRec of localSynced) {
      if (localRec.serverId && !remoteServerIds.has(localRec.serverId)) {
        await targetDb
          .delete(filesMetadata)
          .where(and(eq(filesMetadata.patientId, patientId), eq(filesMetadata.id, localRec.id)));
        try {
          await _cleanupPreview(localRec.id);
        } catch {}
        synced++;
      }
    }

    if (synced > 0) {
      mutate((key: any) => Array.isArray(key) && key[0] === 'files-browser');
      void preCacheUncachedDocuments(patientId, getToken).catch(() => {});
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
  const targetDb = resolveDb();
  let synced = 0;
  let failed = 0;

  const pendingFiles = await targetDb
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
        idempotencyKey: generateUuid(),
        entityType: 'file_records',
        operation: op,
        clientTimestamp: (file.updatedAt ?? new Date()).toISOString(),
        entityId: file.id,
        payloadJson: JSON.stringify({
          clientId: generateUuid(),
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
        await targetDb.update(filesMetadata).set({ syncStatus: 'synced', syncError: null }).where(eq(filesMetadata.id, file.id));
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

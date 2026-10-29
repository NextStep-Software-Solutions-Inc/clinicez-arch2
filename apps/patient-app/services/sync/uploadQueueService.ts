import { and, asc, eq, inArray, or } from 'drizzle-orm';
import { documentTypes } from '@db/schema/documentTypes';
import { localHealthRecords, type HealthRecordCategory } from '@db/schema/localHealthRecords';
import { filesMetadata } from '@db/schema/filesMetadata';
import { uploadQueue, type UploadQueueItem } from '@db/schema/uploadQueue';
import { api } from '../api/apiClient';
import { appendFilePart } from '../api/multipart';
import { isUuid, resolveDocumentTypeId, type DocumentTypeLike } from '../files/documentTypeMapping';
import { blobStorage } from '../storage';

export const RECORDS_SYNCED_EVENT = 'records-synced';
export const UPLOAD_QUEUE_PROGRESS_EVENT = 'upload-queue-progress';

export const MAX_CONCURRENT_UPLOADS = 2;
export const MAX_RETRY_ATTEMPTS = 5;

export type GetToken = () => Promise<string | null>;

export interface EnqueueUploadParams {
  patientId: string;
  documentTypeId: string;
  title: string;
  category?: HealthRecordCategory;
  documentDate?: string;
  facilityName?: string;
  notes?: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  fileBlob?: Blob | Uint8Array | ArrayBuffer;
  localUri?: string;
}

export interface DrainOptions {
  maxConcurrent?: number;
  forceRetry?: boolean;
  isOnline?: () => Promise<boolean>;
  uploadFn?: (item: UploadQueueItem, token: string | null) => Promise<{ id: string; storageKey: string }>;
  db?: any;
}

export interface DrainResult {
  drained: number;
  failed: number;
  pending: number;
  isOffline?: boolean;
}

function getDatabase(override?: any) {
  if (override) return override;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('@db/index').originalDb;
}

function emitEvent(event: string, payload?: any) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const rn = require('react-native');
    rn.DeviceEventEmitter?.emit?.(event, payload);
  } catch {
    // Ignored in non-RN test runners
  }
}

function revalidateFilesBrowser() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const swr = require('swr');
    void swr.mutate?.((key: unknown) => Array.isArray(key) && key[0] === 'files-browser');
  } catch {
    // Ignored in non-SWR test runners
  }
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

async function loadSyncedDocumentTypeCatalog(
  patientId: string,
  getToken: GetToken,
  targetDb: any,
  hasDbOverride: boolean
): Promise<DocumentTypeLike[]> {
  try {
    if (!hasDbOverride) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { refreshDocumentTypes } = require('../files/filesShared');
      return await refreshDocumentTypes(patientId, getToken);
    }
    return await targetDb.select().from(documentTypes).orderBy(asc(documentTypes.sortOrder));
  } catch {
    try {
      return await targetDb.select().from(documentTypes).orderBy(asc(documentTypes.sortOrder));
    } catch {
      return [];
    }
  }
}

/**
 * Calculates exponential backoff in milliseconds:
 * min(60,000ms, 2,000ms * 2^attempts)
 */
export function calculateBackoffMs(attempts: number): number {
  const baseMs = 2000;
  const maxMs = 60000;
  return Math.min(maxMs, baseMs * Math.pow(2, attempts));
}

/**
 * Checks whether device is currently online across native and web.
 */
export async function checkIsOnline(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean') {
    if (!navigator.onLine) return false;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const net = require('@react-native-community/netinfo');
    const NetInfo = net.default ?? net;
    const state = await NetInfo.fetch();
    return Boolean(state.isConnected && (state.isInternetReachable ?? true));
  } catch {
    return true;
  }
}

/**
 * Enqueues a new record upload for offline-first 0ms preview and deferred sync.
 */
export async function enqueueOfflineRecordUpload(
  params: EnqueueUploadParams,
  getToken?: GetToken,
  options?: { isOnline?: () => Promise<boolean>; db?: any }
): Promise<string> {
  const recordId = crypto.randomUUID();
  const queueId = crypto.randomUUID();
  const now = new Date();
  const extension = params.fileName.split('.').pop() ?? 'bin';
  const blobKey = `${params.patientId}/records/${recordId}.${extension}`;
  const targetDb = getDatabase(options?.db);

  // 1. Save binary into permanent local offline sandbox
  let savedLocalPath = '';
  if (params.fileBlob) {
    savedLocalPath = await blobStorage.saveBlob(blobKey, params.fileBlob, params.mimeType);
  } else if (params.localUri) {
    if (typeof (blobStorage as any).saveBlobFromUri === 'function') {
      try {
        savedLocalPath = await (blobStorage as any).saveBlobFromUri(blobKey, params.localUri);
      } catch (err) {
        console.warn('[uploadQueueService] Failed to copy localUri to permanent sandbox, falling back to localUri:', err);
        savedLocalPath = params.localUri;
      }
    } else {
      savedLocalPath = params.localUri;
    }
  }

  // 2. Insert into localHealthRecords for immediate 0ms offline preview
  const category: HealthRecordCategory = params.category ?? 'other';
  await targetDb.insert(localHealthRecords).values({
    id: recordId,
    patientId: params.patientId,
    category,
    documentTypeId: params.documentTypeId,
    title: params.title,
    fileName: params.fileName,
    mimeType: params.mimeType,
    sizeBytes: params.sizeBytes,
    documentDate: params.documentDate ?? null,
    facilityName: params.facilityName ?? null,
    notes: params.notes ?? null,
    provenance: 'patient_uploaded',
    urgency: 'routine',
    localBlobPath: savedLocalPath,
    isCached: true,
    syncStatus: 'queued',
    retryCount: 0,
    lastSyncError: null,
    serverId: null,
    storageKey: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    syncedAt: null,
  });

  // 3. Keep filesMetadata table synchronized for legacy compatibility
  try {
    await targetDb.insert(filesMetadata).values({
      id: recordId,
      patientId: params.patientId,
      clinicId: null,
      documentTypeId: params.documentTypeId,
      name: params.fileName,
      title: params.title,
      type: category,
      mimeType: params.mimeType,
      extension,
      sizeBytes: params.sizeBytes,
      documentDate: params.documentDate ?? null,
      facilityName: params.facilityName ?? null,
      notes: params.notes ?? null,
      serverUrl: null,
      localPath: savedLocalPath,
      isCached: true,
      cloudObjectKey: null,
      syncStatus: 'queued',
      syncOperation: 'insert',
      syncError: null,
      lastSyncError: null,
      retryCount: 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      syncedAt: null,
      serverId: null,
      serverCreatedAt: null,
      serverUpdatedAt: null,
    });
  } catch (err) {
    // Non-fatal if filesMetadata has table constraints
  }

  // 4. Insert into uploadQueue
  await targetDb.insert(uploadQueue).values({
    id: queueId,
    patientId: params.patientId,
    recordId,
    fileUri: savedLocalPath,
    fileName: params.fileName,
    mimeType: params.mimeType,
    sizeBytes: params.sizeBytes,
    title: params.title,
    documentTypeId: params.documentTypeId,
    documentDate: params.documentDate ?? null,
    facilityName: params.facilityName ?? null,
    notes: params.notes ?? null,
    status: 'queued',
    attempts: 0,
    lastAttemptAt: null,
    errorMessage: null,
    fatalError: 0,
    createdAt: now,
    updatedAt: now,
  });

  await safeFlushDatabase();
  emitEvent(RECORDS_SYNCED_EVENT, { patientId: params.patientId, recordId });
  revalidateFilesBrowser();

  // 5. Trigger immediate drain if online and token provider is available
  if (getToken) {
    void drainUploadQueue(params.patientId, getToken, options);
  }

  return recordId;
}

/**
 * Concurrency worker pool helper (processes items with at most `concurrency` parallel tasks).
 */
async function poolMap<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let currentIndex = 0;

  async function worker(): Promise<void> {
    while (currentIndex < items.length) {
      const idx = currentIndex++;
      results[idx] = await fn(items[idx]);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

// --- Concurrency mutex & in-flight state ---
const inFlightJobIds = new Set<string>();

/**
 * Per-patient mutex / in-flight drain coordinator.
 * Prevents overlapping drain operations for the same patient from spawning
 * parallel worker pools, which causes peak concurrency to breach MAX_CONCURRENT_UPLOADS = 2
 * and causes duplicate uploads.
 */
class PatientDrainCoordinator {
  private activeDrain: Promise<DrainResult> | null = null;
  private queuedDrain: Promise<DrainResult> | null = null;
  private queuedOptions: DrainOptions | undefined = undefined;

  async coordinate(
    patientId: string,
    getToken: GetToken,
    options: DrainOptions | undefined,
    drainFn: (patientId: string, getToken: GetToken, options?: DrainOptions) => Promise<DrainResult>
  ): Promise<DrainResult> {
    if (!this.activeDrain) {
      this.activeDrain = (async () => {
        try {
          return await drainFn(patientId, getToken, options);
        } finally {
          this.activeDrain = null;
          if (!this.queuedDrain) {
            patientCoordinators.delete(patientId);
          }
        }
      })();
      return this.activeDrain;
    }

    // A drain is already running - coalesce followup options
    if (options?.forceRetry) {
      this.queuedOptions = { ...this.queuedOptions, ...options, forceRetry: true };
    } else if (!this.queuedOptions) {
      this.queuedOptions = options;
    }

    // Coalesce onto a single queued followup pass
    if (!this.queuedDrain) {
      this.queuedDrain = (async () => {
        try {
          await this.activeDrain;
        } catch {
          // Ignored
        }
        const followupOptions = this.queuedOptions;
        this.queuedOptions = undefined;
        this.queuedDrain = null;
        return await this.coordinate(patientId, getToken, followupOptions, drainFn);
      })();
    }

    return this.queuedDrain;
  }
}

const patientCoordinators = new Map<string, PatientDrainCoordinator>();

function getPatientCoordinator(patientId: string): PatientDrainCoordinator {
  let coord = patientCoordinators.get(patientId);
  if (!coord) {
    coord = new PatientDrainCoordinator();
    patientCoordinators.set(patientId, coord);
  }
  return coord;
}

/**
 * Automatically recovers jobs stuck in 'uploading' status (e.g. from app crash or process kill).
 */
export async function recoverStuckUploads(
  patientId: string,
  options?: { db?: any; force?: boolean }
): Promise<number> {
  const targetDb = getDatabase(options?.db);
  const now = new Date();

  const stuckItems: UploadQueueItem[] = await targetDb
    .select()
    .from(uploadQueue)
    .where(
      and(
        eq(uploadQueue.patientId, patientId),
        eq(uploadQueue.status, 'uploading')
      )
    );

  const toRecover = stuckItems.filter((item) => {
    if (options?.force) return true;
    return !inFlightJobIds.has(item.id);
  });

  if (toRecover.length === 0) return 0;

  const ids = toRecover.map((i) => i.id);
  const recordIds = toRecover.map((i) => i.recordId);

  await targetDb
    .update(uploadQueue)
    .set({ status: 'queued', updatedAt: now })
    .where(inArray(uploadQueue.id, ids));

  try {
    await targetDb
      .update(localHealthRecords)
      .set({ syncStatus: 'queued', updatedAt: now })
      .where(inArray(localHealthRecords.id, recordIds));
  } catch {
    // Non-fatal
  }

  try {
    await targetDb
      .update(filesMetadata)
      .set({ syncStatus: 'queued', updatedAt: now })
      .where(inArray(filesMetadata.id, recordIds));
  } catch {
    // Non-fatal
  }

  await safeFlushDatabase();
  return toRecover.length;
}

/**
 * Internal single-pass drain executor.
 */
async function executeDrainPass(
  patientId: string,
  getToken: GetToken,
  options?: DrainOptions
): Promise<DrainResult> {
  const isOnlineFn = options?.isOnline ?? checkIsOnline;
  const online = await isOnlineFn();
  if (!online) {
    const pendingCount = await getPendingUploadCount(patientId, options?.db);
    return { drained: 0, failed: 0, pending: pendingCount, isOffline: true };
  }

  const targetDb = getDatabase(options?.db);
  const concurrency = options?.maxConcurrent ?? MAX_CONCURRENT_UPLOADS;
  const now = Date.now();

  // 1. Crash recovery: recover orphaned 'uploading' jobs
  await recoverStuckUploads(patientId, { db: options?.db });

  // 2. Query pending or failed items
  const candidates: UploadQueueItem[] = await targetDb
    .select()
    .from(uploadQueue)
    .where(
      and(
        eq(uploadQueue.patientId, patientId),
        or(eq(uploadQueue.status, 'queued'), eq(uploadQueue.status, 'failed'))
      )
    )
    .orderBy(asc(uploadQueue.createdAt));

  // 3. Filter items by exponential backoff and fatalError status
  const itemsToUpload: UploadQueueItem[] = candidates.filter((item: UploadQueueItem) => {
    if (inFlightJobIds.has(item.id)) return false;
    if (item.attempts >= MAX_RETRY_ATTEMPTS && !options?.forceRetry) {
      return false;
    }
    if (item.fatalError === 1 && !options?.forceRetry) {
      return false;
    }
    if (options?.forceRetry || item.status === 'queued') {
      return true;
    }
    const backoffMs = calculateBackoffMs(item.attempts);
    const lastAttempt = item.lastAttemptAt ?? item.createdAt;
    const lastAttemptMs = lastAttempt instanceof Date ? lastAttempt.getTime() : Number(lastAttempt);
    return now - lastAttemptMs >= backoffMs;
  });

  if (itemsToUpload.length === 0) {
    const pendingCount = await getPendingUploadCount(patientId, options?.db);
    return { drained: 0, failed: 0, pending: pendingCount };
  }

  const syncedDocTypes = options?.uploadFn
    ? []
    : await loadSyncedDocumentTypeCatalog(patientId, getToken, targetDb, Boolean(options?.db));

  let drained = 0;
  let failed = 0;

  await poolMap<UploadQueueItem, void>(itemsToUpload, concurrency, async (job: UploadQueueItem) => {
    // Check if record was deleted before processing
    try {
      const [existing] = await targetDb
        .select({ id: localHealthRecords.id, deletedAt: localHealthRecords.deletedAt })
        .from(localHealthRecords)
        .where(eq(localHealthRecords.id, job.recordId))
        .limit(1);

      if (existing && existing.deletedAt !== null) {
        await targetDb.delete(uploadQueue).where(eq(uploadQueue.id, job.id));
        return;
      }
    } catch {
      // Non-fatal if table not present
    }

    if (inFlightJobIds.has(job.id)) {
      return;
    }
    inFlightJobIds.add(job.id);

    try {
      // Database atomic candidate claim
      const claimResult: any = await targetDb
        .update(uploadQueue)
        .set({ status: 'uploading', lastAttemptAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(uploadQueue.id, job.id),
            or(eq(uploadQueue.status, 'queued'), eq(uploadQueue.status, 'failed'))
          )
        );

      const changes = claimResult?.changes ?? 1;
      if (changes === 0) {
        return; // Already claimed or completed
      }

      const token = await getToken();

      // Resolve against synced backend document_types catalog (also heals legacy queued slugs)
      let normalizedDocTypeId = job.documentTypeId;
      if (!options?.uploadFn) {
        normalizedDocTypeId = resolveDocumentTypeId(job.documentTypeId, undefined, syncedDocTypes);
        // If a previously queued UUID was deleted/replaced on the backend, remap via active catalog
        if (
          isUuid(job.documentTypeId) &&
          syncedDocTypes.length > 0 &&
          !syncedDocTypes.some((t) => t.id.toLowerCase() === job.documentTypeId.toLowerCase())
        ) {
          const fallbackActive =
            syncedDocTypes.find((t) => t.isActive !== false && t.code === 'other') ??
            syncedDocTypes.find((t) => t.isActive !== false) ??
            syncedDocTypes[0];
          if (fallbackActive) {
            normalizedDocTypeId = fallbackActive.id;
          }
        }
      }

      let uploadResult: { id: string; storageKey: string };

      if (options?.uploadFn) {
        uploadResult = await options.uploadFn(job, token);
      } else {
        const form = new FormData();
        await appendFilePart(form, 'file', {
          uri: job.fileUri,
          name: job.fileName,
          mimeType: job.mimeType,
        });
        form.append('documentTypeId', normalizedDocTypeId);
        form.append('title', job.title);
        if (job.documentDate) form.append('documentDate', job.documentDate);
        if (job.facilityName) form.append('facilityName', job.facilityName);
        if (job.notes) form.append('notes', job.notes);
        form.append('clientFileId', job.recordId);

        uploadResult = await api.postForm<{ id: string; storageKey: string }>(
          getToken,
          `/patients/${patientId}/records`,
          form
        );
      }

      // On successful upload: mark completed
      const syncTime = new Date();
      await targetDb
        .update(uploadQueue)
        .set({
          documentTypeId: normalizedDocTypeId,
          status: 'completed',
          errorMessage: null,
          fatalError: 0,
          updatedAt: syncTime,
        })
        .where(eq(uploadQueue.id, job.id));

      await targetDb
        .update(localHealthRecords)
        .set({
          documentTypeId: normalizedDocTypeId,
          serverId: uploadResult.id,
          storageKey: uploadResult.storageKey,
          syncStatus: 'synced',
          lastSyncError: null,
          syncedAt: syncTime,
          updatedAt: syncTime,
          isCached: true,
        })
        .where(eq(localHealthRecords.id, job.recordId));

      try {
        await targetDb
          .update(filesMetadata)
          .set({
            documentTypeId: normalizedDocTypeId,
            serverId: uploadResult.id,
            cloudObjectKey: uploadResult.storageKey,
            syncStatus: 'synced',
            syncOperation: 'update',
            syncError: null,
            lastSyncError: null,
            syncedAt: syncTime,
            updatedAt: syncTime,
            isCached: true,
          })
          .where(eq(filesMetadata.id, job.recordId));
      } catch {
        // Ignored
      }

      drained++;
    } catch (err: any) {
      failed++;
      const errorMessage = err?.message ?? 'Upload failed';
      const status = err?.status;
      const isFatal = status === 400 || status === 413 || status === 415;
      const nextAttempts = isFatal ? MAX_RETRY_ATTEMPTS : job.attempts + 1;
      const failureTime = new Date();

      await targetDb
        .update(uploadQueue)
        .set({
          status: 'failed',
          attempts: nextAttempts,
          errorMessage,
          fatalError: isFatal ? 1 : 0,
          updatedAt: failureTime,
        })
        .where(eq(uploadQueue.id, job.id));

      await targetDb
        .update(localHealthRecords)
        .set({
          syncStatus: 'failed',
          retryCount: nextAttempts,
          lastSyncError: errorMessage,
          updatedAt: failureTime,
        })
        .where(eq(localHealthRecords.id, job.recordId));

      try {
        await targetDb
          .update(filesMetadata)
          .set({
            syncStatus: 'failed',
            retryCount: nextAttempts,
            syncError: errorMessage,
            lastSyncError: errorMessage,
            updatedAt: failureTime,
          })
          .where(eq(filesMetadata.id, job.recordId));
      } catch {
        // Ignored
      }
    } finally {
      inFlightJobIds.delete(job.id);
    }
  });

  await safeFlushDatabase();
  if (drained > 0 || failed > 0) {
    emitEvent(RECORDS_SYNCED_EVENT, { patientId });
    revalidateFilesBrowser();
  }

  const remainingPending = await getPendingUploadCount(patientId, options?.db);
  return { drained, failed, pending: remainingPending };
}

/**
 * Public export: Coordinated drain with concurrency ceiling and in-flight deduplication.
 */
export async function drainUploadQueue(
  patientId: string,
  getToken: GetToken,
  options?: DrainOptions
): Promise<DrainResult> {
  const coordinator = getPatientCoordinator(patientId);
  return coordinator.coordinate(patientId, getToken, options, executeDrainPass);
}

/**
 * Retrieves count of items pending upload in queue.
 */
export async function getPendingUploadCount(patientId: string, dbOverride?: any): Promise<number> {
  const targetDb = getDatabase(dbOverride);
  const rows = await targetDb
    .select({ id: uploadQueue.id })
    .from(uploadQueue)
    .where(
      and(
        eq(uploadQueue.patientId, patientId),
        or(eq(uploadQueue.status, 'queued'), eq(uploadQueue.status, 'uploading'), eq(uploadQueue.status, 'failed'))
      )
    );
  return rows.length;
}

/**
 * Resets retry count for failed items to 0 and immediately retries draining.
 * Synchronously resets both uploadQueue and localHealthRecords.
 */
export async function resetAndRetryFailedUploads(
  patientId: string,
  getToken: GetToken,
  options?: DrainOptions
): Promise<DrainResult> {
  const targetDb = getDatabase(options?.db);
  const now = new Date();

  const failedJobs = await targetDb
    .select({ id: uploadQueue.id, recordId: uploadQueue.recordId })
    .from(uploadQueue)
    .where(and(eq(uploadQueue.patientId, patientId), eq(uploadQueue.status, 'failed')));

  const recordIds = failedJobs.map((j: { recordId: string }) => j.recordId);

  await targetDb
    .update(uploadQueue)
    .set({ status: 'queued', attempts: 0, errorMessage: null, fatalError: 0, updatedAt: now })
    .where(and(eq(uploadQueue.patientId, patientId), eq(uploadQueue.status, 'failed')));

  if (recordIds.length > 0) {
    try {
      await targetDb
        .update(localHealthRecords)
        .set({ syncStatus: 'queued', retryCount: 0, lastSyncError: null, updatedAt: now })
        .where(and(eq(localHealthRecords.patientId, patientId), inArray(localHealthRecords.id, recordIds)));
    } catch {
      // Ignored
    }

    try {
      await targetDb
        .update(filesMetadata)
        .set({ syncStatus: 'queued', retryCount: 0, lastSyncError: null, syncError: null, updatedAt: now })
        .where(and(eq(filesMetadata.patientId, patientId), inArray(filesMetadata.id, recordIds)));
    } catch {
      // Ignored
    }
  }

  await safeFlushDatabase();
  emitEvent(RECORDS_SYNCED_EVENT, { patientId });
  revalidateFilesBrowser();
  return drainUploadQueue(patientId, getToken, { ...options, forceRetry: true });
}

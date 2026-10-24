import { and, eq, isNotNull, isNull, or } from 'drizzle-orm';
import { joinApiUrl } from '@shared/safe';
import { localHealthRecords } from '@db/schema/localHealthRecords';
import { inboxLabResults } from '@db/schema/inboxLabResults';
import { filesMetadata } from '@db/schema/filesMetadata';
import { getPatientRecordStreamUrl } from '../api/filesApi';
import { blobStorage } from '../storage';
import { checkIsOnline, type GetToken } from './uploadQueueService';

export const DOCUMENT_CACHED_EVENT = 'document-cached';

export interface PreCacheTarget {
  id: string;
  kind: 'lab_result' | 'health_record';
  patientId: string;
  streamUrl: string;
  fileName: string;
  mimeType: string;
  serverId: string;
}

export interface PreCacheOptions {
  maxConcurrent?: number;
  isOnline?: () => Promise<boolean>;
  downloadFn?: (target: PreCacheTarget, token: string | null) => Promise<string>;
  db?: any;
}

export interface PreCacheResult {
  cached: number;
  failed: number;
  skippedOffline?: boolean;
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
    // Ignored in test environment
  }
}

async function safeFlushDatabase() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const dbModule = require('@db/index');
    await dbModule.flushDatabaseSnapshot?.();
  } catch {
    // Ignored in test environment
  }
}

/**
 * Finds uncached lab results and health records that need binary pre-caching.
 */
export async function getUncachedDocumentTargets(patientId: string, dbOverride?: any): Promise<PreCacheTarget[]> {
  const targets: PreCacheTarget[] = [];
  const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? '';
  const targetDb = getDatabase(dbOverride);

  // 1. Uncached inbox lab results
  const uncachedLabResults = await targetDb
    .select()
    .from(inboxLabResults)
    .where(
      and(
        eq(inboxLabResults.patientId, patientId),
        isNotNull(inboxLabResults.fileUrl),
        or(isNull(inboxLabResults.localPath), eq(inboxLabResults.isCached, false))
      )
    )
    .limit(20);

  for (const lab of uncachedLabResults) {
    if (!lab.fileUrl) continue;
    const streamUrl = lab.fileUrl.startsWith('http')
      ? lab.fileUrl
      : joinApiUrl(apiUrl, lab.fileUrl);

    targets.push({
      id: lab.id,
      kind: 'lab_result',
      patientId,
      streamUrl,
      fileName: `${lab.title.replace(/[^a-zA-Z0-9_-]/g, '_') || 'lab_result'}.pdf`,
      mimeType: 'application/pdf',
      serverId: lab.id,
    });
  }

  // 2. Uncached local health records with a serverId
  const uncachedRecords = await targetDb
    .select()
    .from(localHealthRecords)
    .where(
      and(
        eq(localHealthRecords.patientId, patientId),
        isNotNull(localHealthRecords.serverId),
        isNull(localHealthRecords.deletedAt),
        or(isNull(localHealthRecords.localBlobPath), eq(localHealthRecords.isCached, false))
      )
    )
    .limit(20);

  for (const record of uncachedRecords) {
    if (!record.serverId) continue;
    const streamUrl = getPatientRecordStreamUrl(patientId, record.serverId);
    targets.push({
      id: record.id,
      kind: 'health_record',
      patientId,
      streamUrl,
      fileName: record.fileName,
      mimeType: record.mimeType,
      serverId: record.serverId,
    });
  }

  return targets;
}

/**
 * Pool worker helper with max concurrency.
 */
async function poolMap<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
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

/**
 * Downloads and pre-caches decrypted streams for offline access.
 */
export async function preCacheUncachedDocuments(
  patientId: string,
  getToken: GetToken,
  options?: PreCacheOptions
): Promise<PreCacheResult> {
  const isOnlineFn = options?.isOnline ?? checkIsOnline;
  const online = await isOnlineFn();
  if (!online) {
    return { cached: 0, failed: 0, skippedOffline: true };
  }

  const targetDb = getDatabase(options?.db);
  const targets = await getUncachedDocumentTargets(patientId, options?.db);
  if (targets.length === 0) {
    return { cached: 0, failed: 0 };
  }

  const concurrency = options?.maxConcurrent ?? 2;
  let cached = 0;
  let failed = 0;

  await poolMap(targets, concurrency, async (target) => {
    try {
      const token = await getToken();
      const ext = target.fileName.split('.').pop() ?? 'bin';
      const subfolder = target.kind === 'lab_result' ? 'lab-results' : 'records';
      const blobKey = `${patientId}/${subfolder}/${target.id}.${ext}`;

      let localPath: string;
      if (options?.downloadFn) {
        localPath = await options.downloadFn(target, token);
      } else {
        localPath = await blobStorage.downloadAndSaveBlob(blobKey, target.streamUrl, token);
      }

      const now = new Date();
      if (target.kind === 'lab_result') {
        await targetDb
          .update(inboxLabResults)
          .set({ localPath, isCached: true, updatedAt: now })
          .where(eq(inboxLabResults.id, target.id));
      } else {
        await targetDb
          .update(localHealthRecords)
          .set({ localBlobPath: localPath, isCached: true, updatedAt: now })
          .where(eq(localHealthRecords.id, target.id));

        try {
          await targetDb
            .update(filesMetadata)
            .set({ localPath, isCached: true, updatedAt: now })
            .where(eq(filesMetadata.id, target.id));
        } catch {
          // Ignored
        }
      }

      cached++;
      emitEvent(DOCUMENT_CACHED_EVENT, { patientId, id: target.id, localPath });
    } catch (err) {
      failed++;
    }
  });

  await safeFlushDatabase();
  return { cached, failed };
}

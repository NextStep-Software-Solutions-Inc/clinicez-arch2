import { and, eq } from 'drizzle-orm';
import { localHealthRecords } from '@db/schema/localHealthRecords';
import { filesMetadata } from '@db/schema/filesMetadata';
import { syncQueue } from '@db/schema/syncQueue';
import { uploadQueue } from '@db/schema/uploadQueue';
import { blobStorage } from '../storage';
import { api } from '../api/apiClient';
import { checkIsOnline, RECORDS_SYNCED_EVENT, type GetToken } from '../sync/uploadQueueService';

export interface DeleteRecordParams {
  patientId: string;
  fileId: string;
  getToken?: GetToken;
  isOnline?: () => Promise<boolean>;
  deleteRemoteFn?: (patientId: string, serverId: string, token: string | null) => Promise<void>;
  db?: any;
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
 * Permanently deletes a health record locally (blob and SQLite metadata)
 * and dispatches DELETE to patient-api (or enqueues delete if offline).
 */
export async function deleteHealthRecord(params: DeleteRecordParams): Promise<void> {
  const { patientId, fileId, getToken } = params;
  const targetDb = getDatabase(params.db);

  // 1. Fetch current record metadata to obtain serverId, localBlobPath, fileName
  const [localRec] = await targetDb
    .select()
    .from(localHealthRecords)
    .where(and(eq(localHealthRecords.patientId, patientId), eq(localHealthRecords.id, fileId)))
    .limit(1);

  const [metaRec] = await targetDb
    .select()
    .from(filesMetadata)
    .where(and(eq(filesMetadata.patientId, patientId), eq(filesMetadata.id, fileId)))
    .limit(1);

  const serverId = localRec?.serverId ?? metaRec?.serverId ?? null;
  const fileName = localRec?.fileName ?? metaRec?.name ?? 'record.bin';
  const ext = fileName.split('.').pop() ?? 'bin';
  const blobKey = `${patientId}/records/${fileId}.${ext}`;

  // 2. Remove local binary blob from IBlobStorage
  try {
    await blobStorage.deleteBlob(blobKey);
  } catch (err) {
    console.warn(`[deleteHealthRecord] Failed to delete blob ${blobKey}:`, err);
  }

  // 3. Delete or mark deleted in local SQLite
  await targetDb
    .delete(localHealthRecords)
    .where(and(eq(localHealthRecords.patientId, patientId), eq(localHealthRecords.id, fileId)));

  try {
    await targetDb
      .delete(filesMetadata)
      .where(and(eq(filesMetadata.patientId, patientId), eq(filesMetadata.id, fileId)));
  } catch {
    // Ignored
  }

  // 3b. Delete pending jobs from uploadQueue to prevent zombie uploads
  try {
    await targetDb
      .delete(uploadQueue)
      .where(and(eq(uploadQueue.patientId, patientId), eq(uploadQueue.recordId, fileId)));
  } catch {
    // Non-fatal if uploadQueue table not mounted in isolated test
  }

  await safeFlushDatabase();

  // 4. Handle remote deletion if item had been synced to server
  if (serverId) {
    const isOnlineFn = params.isOnline ?? checkIsOnline;
    const online = await isOnlineFn();

    if (online && getToken) {
      try {
        if (params.deleteRemoteFn) {
          const token = await getToken();
          await params.deleteRemoteFn(patientId, serverId, token);
        } else {
          await api.delete(getToken, `/patients/${patientId}/records/${serverId}`);
        }
      } catch (err) {
        console.warn(`[deleteHealthRecord] Online DELETE failed, enqueuing deferred delete:`, err);
        // Fall back to offline queue on failure
        await targetDb.insert(syncQueue).values({
          id: crypto.randomUUID(),
          entityType: 'file',
          entityId: serverId,
          operation: 'delete',
          payloadJson: JSON.stringify({ id: serverId, patientId }),
          createdAt: new Date(),
        });
        await safeFlushDatabase();
      }
    } else {
      // Offline: Enqueue deferred delete in syncQueue
      await targetDb.insert(syncQueue).values({
        id: crypto.randomUUID(),
        entityType: 'file',
        entityId: serverId,
        operation: 'delete',
        payloadJson: JSON.stringify({ id: serverId, patientId }),
        createdAt: new Date(),
      });
      await safeFlushDatabase();
    }
  }

  emitEvent(RECORDS_SYNCED_EVENT, { patientId, fileId, deleted: true });
}

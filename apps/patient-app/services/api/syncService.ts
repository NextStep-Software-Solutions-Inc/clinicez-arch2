import { db, flushDatabaseSnapshot } from '@db/index';
import { syncQueue } from '@db/schema/syncQueue';
import { pushSyncPayload, type SyncItemRequest } from './patientApi';
import { eq, inArray, or } from 'drizzle-orm';
import { randomUUID } from 'expo-crypto';
import NetInfo from '@react-native-community/netinfo';

let isSyncing = false;

/**
 * Adds an entity write operation to the local sync queue.
 */
export async function addToSyncQueue(
  entityType: typeof syncQueue.$inferInsert.entityType,
  entityId: string,
  operation: 'create' | 'update' | 'delete',
  payload: any
) {
  const now = new Date();
  
  // Construct a payload object with required properties for Last-Write-Wins on backend
  const syncPayload = {
    ...payload,
    clientId: entityId,
    updatedAt: now.toISOString(),
  };

  const syncItem = {
    id: randomUUID(),
    entityType,
    entityId,
    operation,
    payloadJson: JSON.stringify(syncPayload),
    status: 'pending' as const,
    retryCount: 0,
    createdAt: now,
  };

  await db.insert(syncQueue).values(syncItem);
}

export interface ProfileSyncResult {
  success: boolean;
  synced: number;
  failed: number;
  skipped: boolean;
  isOffline?: boolean;
  reason?: string;
}

/**
 * Syncs all pending patient profile writes to the backend.
 */
export async function syncPendingProfileWrites(
  patientId: string,
  getToken?: () => Promise<string | null>,
): Promise<ProfileSyncResult> {
  if (!getToken) {
    return { success: false, synced: 0, failed: 0, skipped: true, reason: 'Auth token retriever not available.' };
  }

  if (isSyncing) {
    return { success: true, synced: 0, failed: 0, skipped: true, reason: 'Sync already in progress.' };
  }

  const network = await NetInfo.fetch();
  if (!network.isConnected) {
    return { success: true, synced: 0, failed: 0, skipped: true, isOffline: true, reason: 'Device is offline.' };
  }

  isSyncing = true;

  try {
    // 1. Fetch pending or failed sync queue items
    const pendingItems = await db
      .select()
      .from(syncQueue)
      .where(or(eq(syncQueue.status, 'pending'), eq(syncQueue.status, 'failed')));

    if (pendingItems.length === 0) {
      isSyncing = false;
      return { success: true, synced: 0, failed: 0, skipped: false };
    }

    const ids = pendingItems.map((item) => item.id);

    // 2. Mark items as syncing in SQLite
    await db
      .update(syncQueue)
      .set({ status: 'syncing' })
      .where(inArray(syncQueue.id, ids));

    // 3. Map to backend SyncItemRequest payload format
    const syncRequests: SyncItemRequest[] = pendingItems.map((item) => ({
      idempotencyKey: item.id,   // unique per sync-queue entry — used for server-side idempotency
      entityType: item.entityType,
      operation: item.operation,
      clientTimestamp: item.createdAt.toISOString(),
      payloadJson: item.operation === 'delete' ? null : item.payloadJson,
      entityId: item.entityId ?? undefined,
    }));

    try {
      // 4. Send the batch to backend
      const ack = await pushSyncPayload(getToken, patientId, syncRequests);

      // 5. Successful push: delete synced items from SQLite
      await db.delete(syncQueue).where(inArray(syncQueue.id, ids));
      await flushDatabaseSnapshot();

      isSyncing = false;
      return { success: true, synced: ack.accepted, failed: 0, skipped: false };
    } catch (apiError: any) {
      console.error('[SyncService] API push failed:', apiError);

      // 6. Mark items back to failed for retry
      for (const item of pendingItems) {
        await db
          .update(syncQueue)
          .set({
            status: 'failed',
            retryCount: item.retryCount + 1,
          })
          .where(eq(syncQueue.id, item.id));
      }
      await flushDatabaseSnapshot();

      isSyncing = false;
      return {
        success: false,
        synced: 0,
        failed: pendingItems.length,
        skipped: false,
        reason: apiError?.message || 'API call failed',
      };
    }
  } catch (error: any) {
    console.error('[SyncService] Error running sync runner:', error);
    isSyncing = false;
    return { success: false, synced: 0, failed: 0, skipped: true, reason: error?.message || 'Database error' };
  }
}

/**
 * Flushes the in-memory SQLite snapshot to persistent storage (IndexedDB on web)
 * and attempts an immediate push of pending profile writes to the backend.
 */
export async function flushAndSyncProfile(
  patientId: string,
  getToken?: () => Promise<string | null>,
): Promise<ProfileSyncResult> {
  await flushDatabaseSnapshot();
  return syncPendingProfileWrites(patientId, getToken);
}


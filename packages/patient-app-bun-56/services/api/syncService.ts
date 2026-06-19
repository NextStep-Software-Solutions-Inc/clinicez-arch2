import { db } from '@db/index';
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

/**
 * Syncs all pending patient profile writes to the backend.
 */
export async function syncPendingProfileWrites(
  patientId: string,
  getToken?: () => Promise<string | null>,
): Promise<{ synced: number; failed: number; skipped: boolean; reason?: string }> {
  if (!getToken) {
    return { synced: 0, failed: 0, skipped: true, reason: 'Auth token retriever not available.' };
  }

  if (isSyncing) {
    return { synced: 0, failed: 0, skipped: true, reason: 'Sync already in progress.' };
  }

  const network = await NetInfo.fetch();
  if (!network.isConnected) {
    return { synced: 0, failed: 0, skipped: true, reason: 'Device is offline.' };
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
      return { synced: 0, failed: 0, skipped: false };
    }

    const ids = pendingItems.map((item) => item.id);

    // 2. Mark items as syncing in SQLite
    await db
      .update(syncQueue)
      .set({ status: 'syncing' })
      .where(inArray(syncQueue.id, ids));

    // 3. Map to backend SyncItemRequest payload format
    const syncRequests: SyncItemRequest[] = pendingItems.map((item) => ({
      clientId: item.entityId,
      entityType: item.entityType,
      operation: item.operation,
      clientTimestamp: item.createdAt.toISOString(),
      payloadJson: item.operation === 'delete' ? null : item.payloadJson,
    }));

    try {
      // 4. Send the batch to backend
      const ack = await pushSyncPayload(getToken, patientId, syncRequests);

      // 5. Successful push: delete synced items from SQLite
      await db.delete(syncQueue).where(inArray(syncQueue.id, ids));

      isSyncing = false;
      return { synced: ack.accepted, failed: 0, skipped: false };
    } catch (apiError) {
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

      isSyncing = false;
      return { synced: 0, failed: pendingItems.length, skipped: false, reason: 'API call failed' };
    }
  } catch (error) {
    console.error('[SyncService] Error running sync runner:', error);
    isSyncing = false;
    return { synced: 0, failed: 0, skipped: true, reason: 'Database error' };
  }
}

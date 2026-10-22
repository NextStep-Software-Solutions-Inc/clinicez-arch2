import { eq } from 'drizzle-orm';
import { DeviceEventEmitter } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { flushDatabaseSnapshot, originalDb } from '@db/index';
import { inboxLabRequests } from '@db/schema/inboxLabRequests';
import { inboxLabResults } from '@db/schema/inboxLabResults';
import { inboxMedicalCertificates } from '@db/schema/inboxMedicalCertificates';
import { inboxPrescriptions } from '@db/schema/inboxPrescriptions';
import { syncCursors } from '@db/schema/syncCursors';
import { fetchSyncChanges, type SyncChangesPage } from '../api/documentsApi';
import { upsertRemoteNotifications } from '../notifications/notificationService';
import {
  toLabRequestRow,
  toLabResultRow,
  toMedicalCertificateRow,
  toPrescriptionRow,
} from './documentMappers';
import { pageHasDocumentChanges, pullAllChanges } from './pullChanges';
import { preCacheUncachedDocuments } from './preCachingService';

export const DOCUMENTS_SYNCED_EVENT = 'documents-synced';

type GetToken = () => Promise<string | null>;

const inFlight = new Map<string, Promise<boolean>>();

async function readCursor(patientId: string): Promise<string | null> {
  const rows = await originalDb
    .select({ cursor: syncCursors.cursor })
    .from(syncCursors)
    .where(eq(syncCursors.patientId, patientId));
  return rows[0]?.cursor ?? null;
}

async function writeCursor(patientId: string, cursor: string): Promise<void> {
  const row = { patientId, cursor, updatedAt: new Date() };
  await originalDb
    .insert(syncCursors)
    .values(row)
    .onConflictDoUpdate({ target: syncCursors.patientId, set: row });
}

async function applyPage(patientId: string, page: SyncChangesPage): Promise<void> {
  for (const dto of page.labRequests) {
    const row = toLabRequestRow(patientId, dto);
    await originalDb
      .insert(inboxLabRequests)
      .values(row)
      .onConflictDoUpdate({ target: inboxLabRequests.id, set: row });
  }
  for (const dto of page.prescriptions) {
    const row = toPrescriptionRow(patientId, dto);
    await originalDb
      .insert(inboxPrescriptions)
      .values(row)
      .onConflictDoUpdate({ target: inboxPrescriptions.id, set: row });
  }
  for (const dto of page.labResults) {
    const row = toLabResultRow(patientId, dto);
    await originalDb
      .insert(inboxLabResults)
      .values(row)
      .onConflictDoUpdate({ target: inboxLabResults.id, set: row });
  }
  for (const dto of page.medicalCertificates) {
    const row = toMedicalCertificateRow(patientId, dto);
    await originalDb
      .insert(inboxMedicalCertificates)
      .values(row)
      .onConflictDoUpdate({ target: inboxMedicalCertificates.id, set: row });
  }
  await upsertRemoteNotifications(patientId, page.notifications);
}

async function runPull(patientId: string, getToken: GetToken): Promise<boolean> {
  let changed = false;
  await pullAllChanges({
    fetchPage: (since) => fetchSyncChanges(getToken, patientId, since),
    readCursor: () => readCursor(patientId),
    writeCursor: (cursor) => writeCursor(patientId, cursor),
    applyPage: async (page) => {
      await applyPage(patientId, page);
      changed = changed || pageHasDocumentChanges(page);
    },
  });
  await flushDatabaseSnapshot();
  if (changed) {
    DeviceEventEmitter.emit(DOCUMENTS_SYNCED_EVENT, { patientId });
    void preCacheUncachedDocuments(patientId, getToken).catch(() => {});
  }
  return changed;
}

/**
 * Pulls read-only clinical documents written by facilities (lab requests, prescriptions,
 * results, certificates, notifications) using the per-patient cursor. Concurrent calls for the
 * same patient share one request. Resolves to false when offline or nothing changed; emits
 * `documents-synced` when new rows were stored.
 */
export function pullDocumentChanges(patientId: string, getToken: GetToken): Promise<boolean> {
  const pending = inFlight.get(patientId);
  if (pending) return pending;

  const run = NetInfo.fetch()
    .then((network) => (network.isConnected ? runPull(patientId, getToken) : false))
    .finally(() => inFlight.delete(patientId));
  inFlight.set(patientId, run);
  return run;
}

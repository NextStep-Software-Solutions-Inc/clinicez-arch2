import * as Crypto from 'expo-crypto';
import { ClinicPatient, RegisterPatientPayload, ClinicRecordAttachmentRecord, clinicService } from './clinicService';
import { resolveTenantContext } from '@shared/safe';
import { getDeviceItem, setDeviceItem } from '../utils/deviceStorage';
import {
  MAX_ATTEMPTS,
  ageFromDateOfBirth,
  backoffDelayMs,
  classifyFailure,
  isDue,
} from './outboxPolicy';

/** Shown on a locally saved patient until the server issues the real patient code. */
const PENDING_PATIENT_CODE = 'Pending sync';
const LOCAL_PATIENT_PREFIX = 'local-pat-';
const IDEMPOTENCY_HEADER = 'Idempotency-Key';

interface OutboxItem {
  id: string;
  /** Sent as the `Idempotency-Key` header so a retry after a lost response cannot create a duplicate. */
  idempotencyKey: string;
  tenantId: string;
  clinicId: string;
  tempId: string;
  queuedAt: string;
  /** Attempts the server actually answered with a transient error (offline attempts are not counted). */
  attempts: number;
  nextAttemptAt: string | null;
  lastError?: string;
  /** Set when the item was parked in the failed list and needs a person to retry or discard it. */
  deadAt?: string;
}

export interface PendingPatientRegistration extends OutboxItem {
  payload: RegisterPatientPayload;
  localPatient: ClinicPatient;
}

export interface PendingAttachmentUpload extends OutboxItem {
  payload: {
    patientId: string;
    consultationId?: string;
    recordType: string;
    title: string;
    fileName: string;
    contentType: string;
    fileSizeBytes: number;
    storageUri: string;
    documentDate: string;
    notes?: string;
    uploadedByStaffName?: string;
  };
  localAttachment: ClinicRecordAttachmentRecord;
}

export interface SyncReport {
  syncedPatients: number;
  syncedAttachments: number;
  /** Items still waiting to sync (including ones scheduled for a later retry). */
  failedCount: number;
  /** Items parked in the failed list that need attention. */
  deadCount: number;
  errors: string[];
}

const STORAGE_KEY_PATIENTS = 'clinicez_offline_patients_outbox';
const STORAGE_KEY_ATTACHMENTS = 'clinicez_offline_attachments_outbox';
const STORAGE_KEY_ID_MAP = 'clinicez_offline_patient_id_map';

function newId(prefix: string): string {
  return `${prefix}${Crypto.randomUUID()}`;
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = getDeviceItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

class OfflineSyncService {
  private patientQueue: PendingPatientRegistration[] = [];
  private attachmentQueue: PendingAttachmentUpload[] = [];
  /** Local temporary patient id -> real server id, kept until every attachment for that patient has uploaded. */
  private idMap: Record<string, string> = {};
  private isSyncing = false;
  private listeners: (() => void)[] = [];

  constructor() {
    this.loadFromStorage();
  }

  /** Active tenant/clinic, resolved at call time so a workspace switch is always honoured. */
  private getActiveIds(): { tenantId: string; clinicId: string } {
    const ctx = resolveTenantContext();
    return {
      tenantId: ctx.tenantSlug ?? '',
      clinicId: ctx.clinicId ?? '',
    };
  }

  private inActiveWorkspace(item: OutboxItem): boolean {
    const { tenantId, clinicId } = this.getActiveIds();
    return item.tenantId === tenantId && item.clinicId === clinicId;
  }

  private loadFromStorage() {
    this.patientQueue = readJson<PendingPatientRegistration[]>(STORAGE_KEY_PATIENTS, []);
    this.attachmentQueue = readJson<PendingAttachmentUpload[]>(STORAGE_KEY_ATTACHMENTS, []);
    this.idMap = readJson<Record<string, string>>(STORAGE_KEY_ID_MAP, {});

    // Items queued by an older build have no idempotency key or workspace; give them both so they stay safe to retry.
    const { tenantId, clinicId } = this.getActiveIds();
    const upgrade = <T extends Partial<OutboxItem>>(item: T): T => ({
      ...item,
      idempotencyKey: item.idempotencyKey ?? Crypto.randomUUID(),
      tenantId: item.tenantId ?? tenantId,
      clinicId: item.clinicId ?? clinicId,
      attempts: item.attempts ?? 0,
      nextAttemptAt: item.nextAttemptAt ?? null,
    });
    this.patientQueue = this.patientQueue.map(upgrade);
    this.attachmentQueue = this.attachmentQueue.map(upgrade);
  }

  private persist() {
    setDeviceItem(STORAGE_KEY_PATIENTS, JSON.stringify(this.patientQueue));
    setDeviceItem(STORAGE_KEY_ATTACHMENTS, JSON.stringify(this.attachmentQueue));
    setDeviceItem(STORAGE_KEY_ID_MAP, JSON.stringify(this.idMap));
    this.notify();
  }

  public subscribe(fn: () => void): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  private notify() {
    this.listeners.forEach((fn) => {
      try {
        fn();
      } catch {}
    });
  }

  /** Items of the active workspace that are still waiting to sync. */
  public getPendingCount(): number {
    return (
      this.patientQueue.filter((i) => !i.deadAt && this.inActiveWorkspace(i)).length +
      this.attachmentQueue.filter((i) => !i.deadAt && this.inActiveWorkspace(i)).length
    );
  }

  /** Items of the active workspace the server rejected; a person must retry or discard them. */
  public getFailedCount(): number {
    return (
      this.patientQueue.filter((i) => i.deadAt && this.inActiveWorkspace(i)).length +
      this.attachmentQueue.filter((i) => i.deadAt && this.inActiveWorkspace(i)).length
    );
  }

  public getPendingQueue() {
    return {
      patients: this.patientQueue.filter((i) => this.inActiveWorkspace(i)),
      attachments: this.attachmentQueue.filter((i) => this.inActiveWorkspace(i)),
    };
  }

  /** Puts every failed item of the active workspace back in the queue for another go. */
  public retryFailed() {
    const revive = <T extends OutboxItem>(item: T): T =>
      item.deadAt && this.inActiveWorkspace(item)
        ? { ...item, deadAt: undefined, attempts: 0, nextAttemptAt: null, lastError: undefined }
        : item;
    this.patientQueue = this.patientQueue.map(revive);
    this.attachmentQueue = this.attachmentQueue.map(revive);
    this.persist();
  }

  /** Throws away every failed item of the active workspace (the user decided it is not worth keeping). */
  public discardFailed() {
    const keep = <T extends OutboxItem>(item: T) => !(item.deadAt && this.inActiveWorkspace(item));
    this.patientQueue = this.patientQueue.filter(keep);
    this.attachmentQueue = this.attachmentQueue.filter(keep);
    this.persist();
  }

  public async enqueuePatient(payload: RegisterPatientPayload): Promise<ClinicPatient> {
    const tempId = newId(LOCAL_PATIENT_PREFIX);
    const { tenantId, clinicId } = this.getActiveIds();
    const now = new Date().toISOString();

    const localPatient: ClinicPatient = {
      id: tempId,
      tenantId,
      clinicId,
      patientCode: PENDING_PATIENT_CODE,
      firstName: payload.firstName,
      lastName: payload.lastName,
      middleName: payload.middleName,
      suffix: payload.suffix,
      fullName: `${payload.lastName}, ${payload.firstName}${payload.middleName ? ` ${payload.middleName[0]}.` : ''}`,
      dateOfBirth: payload.dateOfBirth,
      age: ageFromDateOfBirth(payload.dateOfBirth),
      gender: payload.gender,
      sex: payload.sex ?? payload.gender,
      genderIdentity: payload.genderIdentity ?? null,
      civilStatus: payload.civilStatus,
      contactNumber: payload.contactNumber,
      email: payload.email,
      addressLine: payload.addressLine,
      barangay: payload.barangay,
      city: payload.city,
      province: payload.province,
      emergencyContactName: payload.emergencyContactName,
      emergencyContactPhone: payload.emergencyContactPhone,
      emergencyContactRelationship: payload.emergencyContactRelationship,
      philHealthNumber: payload.philHealthNumber,
      seniorCitizenId: payload.seniorCitizenId,
      pwdId: payload.pwdId,
      bloodType: payload.bloodType,
      allergies: payload.allergies,
      chronicConditions: payload.chronicConditions,
      alerts: payload.alerts,
      customFields: payload.customFields,
      // Whatever the registering staff member asked for; the server has the final say when it syncs.
      verificationStatus: payload.verificationStatus ?? 'Pending',
      createdAt: now,
    };

    this.patientQueue.push({
      id: newId('queue-pat-'),
      idempotencyKey: Crypto.randomUUID(),
      tenantId,
      clinicId,
      tempId,
      payload,
      localPatient,
      queuedAt: now,
      attempts: 0,
      nextAttemptAt: null,
    });
    this.persist();
    return localPatient;
  }

  public async enqueueAttachment(
    payload: PendingAttachmentUpload['payload'],
    actorName?: string
  ): Promise<ClinicRecordAttachmentRecord> {
    const tempId = newId('local-att-');
    const { tenantId, clinicId } = this.getActiveIds();
    const now = new Date().toISOString();

    const localAttachment: ClinicRecordAttachmentRecord = {
      id: tempId,
      tenantId,
      clinicId,
      patientId: payload.patientId,
      consultationId: payload.consultationId,
      recordType: payload.recordType,
      title: payload.title,
      fileName: payload.fileName,
      contentType: payload.contentType,
      fileSizeBytes: payload.fileSizeBytes,
      storageUri: payload.storageUri,
      documentDate: payload.documentDate,
      notes: payload.notes,
      uploadedByStaffName: payload.uploadedByStaffName || actorName,
      // Verification is a clinical decision made by a person on the server, never assumed here.
      verificationStatus: 'Pending',
      createdAt: now,
    };

    this.attachmentQueue.push({
      id: newId('queue-att-'),
      idempotencyKey: Crypto.randomUUID(),
      tenantId,
      clinicId,
      tempId,
      payload,
      localAttachment,
      queuedAt: now,
      attempts: 0,
      nextAttemptAt: null,
    });
    this.persist();
    return localAttachment;
  }

  /**
   * Applies a failed attempt to an item. Returns true when the server was unreachable, so the caller can stop
   * hammering a dead connection.
   */
  private recordFailure(item: OutboxItem, label: string, status: number, message: string, errors: string[]): boolean {
    const kind = classifyFailure(status);
    item.lastError = message;
    errors.push(`${label}: ${message}`);
    if (kind === 'offline') return true;

    if (kind === 'dead') {
      item.deadAt = new Date().toISOString();
      return false;
    }

    item.attempts += 1;
    if (item.attempts >= MAX_ATTEMPTS) {
      item.deadAt = new Date().toISOString();
    } else {
      item.nextAttemptAt = new Date(Date.now() + backoffDelayMs(item.attempts)).toISOString();
    }
    return false;
  }

  /**
   * Sends what is queued for the active workspace. `force` ignores retry schedules (the user pressed Sync now);
   * background runs leave it off so an item in backoff is left alone until it is due.
   */
  public async syncPendingOutbox(options: { force?: boolean } = {}): Promise<SyncReport> {
    if (this.isSyncing) {
      return {
        syncedPatients: 0,
        syncedAttachments: 0,
        failedCount: this.getPendingCount(),
        deadCount: this.getFailedCount(),
        errors: ['Sync already in progress'],
      };
    }

    this.isSyncing = true;
    let syncedPatients = 0;
    let syncedAttachments = 0;
    const errors: string[] = [];
    let offline = false;
    const now = new Date();
    const due = (item: OutboxItem) =>
      !item.deadAt && this.inActiveWorkspace(item) && (options.force || isDue(item.nextAttemptAt, now));

    try {
      // 1. Patients first: attachments may belong to a patient that only exists locally.
      for (const item of [...this.patientQueue]) {
        if (offline) break;
        if (!due(item)) continue;
        const label = `Patient ${item.localPatient.fullName}`;
        try {
          const [created, err] = await clinicService.registerPatient(item.payload, {
            headers: { [IDEMPOTENCY_HEADER]: item.idempotencyKey },
          });
          if (created) {
            this.idMap[item.tempId] = created.id;
            this.patientQueue = this.patientQueue.filter((p) => p.id !== item.id);
            syncedPatients++;
          } else {
            offline = this.recordFailure(item, label, err?.status ?? 0, err?.message || 'Could not register the patient.', errors);
          }
        } catch (ex: any) {
          offline = this.recordFailure(item, label, 0, ex?.message || 'Network error', errors);
        }
        this.persist();
      }

      // 2. Attachments, pointing at the real patient id once it is known.
      for (const item of [...this.attachmentQueue]) {
        if (offline) break;
        if (!due(item)) continue;
        const label = `Attachment ${item.localAttachment.title}`;
        const isLocalPatient = item.payload.patientId.startsWith(LOCAL_PATIENT_PREFIX);
        const patientId = this.idMap[item.payload.patientId] ?? item.payload.patientId;

        if (isLocalPatient && patientId === item.payload.patientId) {
          // Its patient has not synced. If that patient was given up on, so is this attachment; otherwise wait.
          const owner = this.patientQueue.find((p) => p.tempId === item.payload.patientId);
          if (!owner || owner.deadAt) {
            item.deadAt = new Date().toISOString();
            item.lastError = 'The patient this document belongs to could not be registered.';
            errors.push(`${label}: ${item.lastError}`);
            this.persist();
          }
          continue;
        }

        try {
          const [created, err] = await clinicService.uploadRecordAttachment(
            { ...item.payload, patientId },
            { headers: { [IDEMPOTENCY_HEADER]: item.idempotencyKey } }
          );
          if (created) {
            this.attachmentQueue = this.attachmentQueue.filter((a) => a.id !== item.id);
            syncedAttachments++;
          } else {
            offline = this.recordFailure(item, label, err?.status ?? 0, err?.message || 'Could not upload the document.', errors);
          }
        } catch (ex: any) {
          offline = this.recordFailure(item, label, 0, ex?.message || 'Network error', errors);
        }
        this.persist();
      }
    } finally {
      this.isSyncing = false;
      this.persist();
    }

    return {
      syncedPatients,
      syncedAttachments,
      failedCount: this.getPendingCount(),
      deadCount: this.getFailedCount(),
      errors,
    };
  }
}

export const offlineSyncService = new OfflineSyncService();

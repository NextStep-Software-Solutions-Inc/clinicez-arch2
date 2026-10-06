import { ClinicPatient, RegisterPatientPayload, ClinicRecordAttachmentRecord, clinicService } from './clinicService';
import { resolveTenantContext } from '@shared/safe';

/** Used only when neither the payload nor the caller supplies who queued the item. */
const NEUTRAL_ACTOR_NAME = 'Front desk';

export interface PendingPatientRegistration {
  id: string;
  tempId: string;
  payload: RegisterPatientPayload;
  localPatient: ClinicPatient;
  queuedAt: string;
  retries: number;
}

export interface PendingAttachmentUpload {
  id: string;
  tempId: string;
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
  queuedAt: string;
  retries: number;
}

export interface SyncReport {
  syncedPatients: number;
  syncedAttachments: number;
  failedCount: number;
  errors: string[];
}

const STORAGE_KEY_PATIENTS = 'clinicez_offline_patients_outbox';
const STORAGE_KEY_ATTACHMENTS = 'clinicez_offline_attachments_outbox';

class OfflineSyncService {
  private patientQueue: PendingPatientRegistration[] = [];
  private attachmentQueue: PendingAttachmentUpload[] = [];
  private isSyncing = false;
  private listeners: (() => void)[] = [];
  private localSeq = 1000;

  constructor() {
    this.loadFromStorage();
  }

  private getStorage(): Storage | null {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
    return null;
  }

  /** Active tenant/clinic, resolved at call time so a workspace switch is always honoured. */
  private getActiveIds(): { tenantId: string; clinicId: string } {
    const ctx = resolveTenantContext();
    return {
      tenantId: ctx.tenantSlug ?? '',
      clinicId: ctx.clinicId ?? '',
    };
  }

  private loadFromStorage() {
    try {
      const storage = this.getStorage();
      if (!storage) return;

      const pData = storage.getItem(STORAGE_KEY_PATIENTS);
      if (pData) {
        this.patientQueue = JSON.parse(pData);
      }

      const aData = storage.getItem(STORAGE_KEY_ATTACHMENTS);
      if (aData) {
        this.attachmentQueue = JSON.parse(aData);
      }
    } catch {
      // Storage unavailable or parse error fallback
    }
  }

  private persist() {
    try {
      const storage = this.getStorage();
      if (!storage) return;

      storage.setItem(STORAGE_KEY_PATIENTS, JSON.stringify(this.patientQueue));
      storage.setItem(STORAGE_KEY_ATTACHMENTS, JSON.stringify(this.attachmentQueue));
    } catch {
      // Silent fail
    }
    this.notify();
  }

  public subscribe(fn: () => void): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter(l => l !== fn);
    };
  }

  private notify() {
    this.listeners.forEach(fn => {
      try {
        fn();
      } catch {}
    });
  }

  public getPendingCount(): number {
    return this.patientQueue.length + this.attachmentQueue.length;
  }

  public getPendingQueue() {
    return {
      patients: [...this.patientQueue],
      attachments: [...this.attachmentQueue],
    };
  }

  public async enqueuePatient(payload: RegisterPatientPayload): Promise<ClinicPatient> {
    this.localSeq++;
    const tempId = `local-pat-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const year = new Date().getFullYear();
    const patientCode = `PAT-OFFLINE-${year}-${this.localSeq}`;

    const { tenantId, clinicId } = this.getActiveIds();

    const localPatient: ClinicPatient = {
      id: tempId,
      tenantId,
      clinicId,
      patientCode,
      firstName: payload.firstName,
      lastName: payload.lastName,
      middleName: payload.middleName,
      suffix: payload.suffix,
      fullName: `${payload.lastName}, ${payload.firstName}${payload.middleName ? ` ${payload.middleName[0]}.` : ''}`,
      dateOfBirth: payload.dateOfBirth,
      age: 20,
      gender: payload.gender,
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
      verificationStatus: payload.verificationStatus || 'Verified',
      createdAt: new Date().toISOString(),
    };

    const item: PendingPatientRegistration = {
      id: `queue-${Date.now()}`,
      tempId,
      payload,
      localPatient,
      queuedAt: new Date().toISOString(),
      retries: 0,
    };

    this.patientQueue.push(item);
    this.persist();
    return localPatient;
  }

  public async enqueueAttachment(payload: {
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
  }, actorName?: string): Promise<ClinicRecordAttachmentRecord> {
    const tempId = `local-att-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const { tenantId, clinicId } = this.getActiveIds();
    const actor = payload.uploadedByStaffName || actorName || NEUTRAL_ACTOR_NAME;

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
      uploadedByStaffName: actor,
      verificationStatus: 'Verified',
      verifiedAt: new Date().toISOString(),
      verifiedByStaffName: actor,
      createdAt: new Date().toISOString(),
    };

    const item: PendingAttachmentUpload = {
      id: `queue-att-${Date.now()}`,
      tempId,
      payload,
      localAttachment,
      queuedAt: new Date().toISOString(),
      retries: 0,
    };

    this.attachmentQueue.push(item);
    this.persist();
    return localAttachment;
  }

  public async syncPendingOutbox(): Promise<SyncReport> {
    if (this.isSyncing) {
      return { syncedPatients: 0, syncedAttachments: 0, failedCount: 0, errors: ['Sync already in progress'] };
    }

    this.isSyncing = true;
    let syncedPatients = 0;
    let syncedAttachments = 0;
    const errors: string[] = [];

    const idMapping = new Map<string, string>();

    // 1. Drain patients queue first
    const remainingPatients: PendingPatientRegistration[] = [];
    for (const item of this.patientQueue) {
      try {
        const [created, err] = await clinicService.registerPatient(item.payload);
        if (created) {
          idMapping.set(item.tempId, created.id);
          syncedPatients++;
        } else {
          item.retries++;
          remainingPatients.push(item);
          if (err) errors.push(`Patient ${item.localPatient.fullName}: ${err.message}`);
        }
      } catch (ex: any) {
        item.retries++;
        remainingPatients.push(item);
        errors.push(`Patient ${item.localPatient.fullName}: ${ex?.message || 'Network error'}`);
      }
    }
    this.patientQueue = remainingPatients;

    // 2. Drain attachments queue, remapping patient IDs if they were locally generated
    const remainingAttachments: PendingAttachmentUpload[] = [];
    for (const item of this.attachmentQueue) {
      try {
        const realPatientId = idMapping.get(item.payload.patientId) || item.payload.patientId;
        const uploadPayload = {
          ...item.payload,
          patientId: realPatientId,
        };

        const [created, err] = await clinicService.uploadRecordAttachment(uploadPayload);
        if (created) {
          syncedAttachments++;
        } else {
          item.retries++;
          remainingAttachments.push(item);
          if (err) errors.push(`Attachment ${item.localAttachment.title}: ${err.message}`);
        }
      } catch (ex: any) {
        item.retries++;
        remainingAttachments.push(item);
        errors.push(`Attachment ${item.localAttachment.title}: ${ex?.message || 'Network error'}`);
      }
    }
    this.attachmentQueue = remainingAttachments;

    this.isSyncing = false;
    this.persist();

    return {
      syncedPatients,
      syncedAttachments,
      failedCount: this.patientQueue.length + this.attachmentQueue.length,
      errors,
    };
  }
}

export const offlineSyncService = new OfflineSyncService();

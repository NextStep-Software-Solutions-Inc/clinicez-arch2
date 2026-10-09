import { api } from './apiClient';
import { appendFilePart, type UploadFile } from './multipart';
import type { SyncNotificationDto } from './notificationsApi';
import type { AccessGrantDto } from './sharingApi';

// ── Types mirroring the patient-api incremental-pull contract ─────────────────

export type LabRequestStage =
    | 'issued'
    | 'routed'
    | 'claimed'
    | 'awaitingPayment'
    | 'paid'
    | 'specimenCollected'
    | 'inProcess'
    | 'resultFinalized'
    | 'externalSubmitted'
    | 'reviewed'
    | 'rejected'
    | 'cancelled';

export type PaymentStatus = 'none' | 'pending' | 'paid';

export interface LabRequestItemDto {
    code: string;
    name: string;
    category: string;
}

export interface LabRequestDto {
    id: string;
    requisitionId: string;
    orderingTenantId: string;
    orderingFacilityId: string;
    orderingFacilityName: string | null;
    accessionNumber: string | null;
    title: string;
    urgency: string | null;
    items: LabRequestItemDto[];
    stage: LabRequestStage;
    quotedAmount: number | null;
    currency: string | null;
    paymentRequired: boolean;
    paymentStatus: PaymentStatus;
    laboratoryName: string | null;
    claimToken: string | null;
    reason: string | null;
    issuedAt: string;
    updatedAt: string;
}

export type PrescriptionStage =
    | 'issued'
    | 'accepted'
    | 'partiallyAccepted'
    | 'rejected'
    | 'dispensed'
    | 'externalDispensed';

export interface PrescriptionItemDto {
    genericName: string;
    brandName: string | null;
    dosage: string;
    form: string;
    sig: string;
    quantity: number;
    durationDays: number | null;
    remarks: string | null;
}

export interface PrescriptionDto {
    id: string;
    prescriptionNumber: string;
    orderingTenantId: string;
    orderingFacilityId: string;
    orderingFacilityName: string | null;
    prescriberName: string;
    prescriberPrcLicense: string | null;
    diagnosis: string | null;
    instructions: string | null;
    items: PrescriptionItemDto[];
    stage: PrescriptionStage;
    quotedAmount: number | null;
    pharmacyName: string | null;
    claimToken: string | null;
    verificationUrl: string | null;
    receiptNumber: string | null;
    dispensedAt: string | null;
    externalPharmacyName: string | null;
    issuedAt: string;
    updatedAt: string;
}

export type LabResultSource = 'clinicEzLab' | 'externalLab' | 'patientUploaded';
export type LabResultVerification = 'verified' | 'unverified' | 'rejected';

export interface LabObservationDto {
    panel: string;
    name: string;
    value: string;
    unit: string;
    referenceRange: string;
    flag: string;
}

export interface LabResultDto {
    id: string;
    requisitionId: string | null;
    laboratoryName: string;
    title: string;
    source: LabResultSource;
    verification: LabResultVerification;
    reviewedByName: string | null;
    reviewedAt: string | null;
    remarks: string | null;
    impression: string | null;
    isCritical: boolean;
    resultedAt: string;
    fileUrl: string | null;
    observations: LabObservationDto[];
    updatedAt: string;
}

export interface MedicalCertificateDto {
    id: string;
    certificateNumber: string;
    issuerName: string;
    doctorName: string;
    doctorPrcLicense: string | null;
    purpose: string;
    diagnosis: string | null;
    remarks: string | null;
    restDays: number | null;
    validFrom: string | null;
    validTo: string | null;
    verificationUrl: string | null;
    issuedAt: string;
    updatedAt: string;
}

export interface SyncChangesPage {
    cursor: string;
    hasMore: boolean;
    labRequests: LabRequestDto[];
    prescriptions: PrescriptionDto[];
    labResults: LabResultDto[];
    medicalCertificates: MedicalCertificateDto[];
    grants: AccessGrantDto[];
    notifications: SyncNotificationDto[];
}

export interface LabResultUploadAck {
    resultId: string;
    verification: 'unverified';
    source: 'patientUploaded';
}

export interface ExternalDispenseAck {
    prescriptionId: string;
    stage: 'externalDispensed';
}

export interface ExternalDispenseInput {
    pharmacyName: string;
    branchLocation?: string;
    pharmacistName?: string;
    receiptNumber?: string;
    notes?: string;
    receipt?: UploadFile;
}

export const SYNC_CHANGES_PAGE_SIZE = 200;

// ── Documents API ─────────────────────────────────────────────────────────────

export function fetchSyncChanges(
    getToken: () => Promise<string | null>,
    patientId: string,
    since: string | null,
): Promise<SyncChangesPage> {
    const params = new URLSearchParams({ take: String(SYNC_CHANGES_PAGE_SIZE) });
    if (since) params.set('since', since);
    return api.get<SyncChangesPage>(getToken, `/patients/${patientId}/sync/changes?${params}`);
}

export async function uploadLabResult(
    getToken: () => Promise<string | null>,
    patientId: string,
    requisitionId: string,
    file: UploadFile,
    notes?: string,
): Promise<LabResultUploadAck> {
    const form = new FormData();
    await appendFilePart(form, 'file', file);
    if (notes) form.append('notes', notes);
    return api.postForm<LabResultUploadAck>(
        getToken,
        `/patients/${patientId}/lab-requests/${requisitionId}/results`,
        form,
    );
}

export async function submitExternalDispense(
    getToken: () => Promise<string | null>,
    patientId: string,
    prescriptionId: string,
    input: ExternalDispenseInput,
): Promise<ExternalDispenseAck> {
    const form = new FormData();
    form.append('pharmacyName', input.pharmacyName);
    if (input.branchLocation) form.append('branchLocation', input.branchLocation);
    if (input.pharmacistName) form.append('pharmacistName', input.pharmacistName);
    if (input.receiptNumber) form.append('receiptNumber', input.receiptNumber);
    if (input.notes) form.append('notes', input.notes);
    if (input.receipt) await appendFilePart(form, 'receipt', input.receipt);
    return api.postForm<ExternalDispenseAck>(
        getToken,
        `/patients/${patientId}/prescriptions/${prescriptionId}/external-dispense`,
        form,
    );
}

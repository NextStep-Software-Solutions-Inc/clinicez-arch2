import { z } from 'zod';
import { syncNotificationSchema } from './notificationsApi';
import { accessGrantSchema } from './sharingApi';
import {
    labRequestStageSchema,
    paymentStatusSchema,
    prescriptionStageSchema,
    resultSourceSchema,
    resultVerificationSchema,
} from './wireEnums';

// ── Schemas mirroring the patient-api incremental-pull contract ───────────────
// Enum fields are PascalCase strings (see wireEnums.ts); anything else fails parsing.

const labRequestItemSchema = z.object({
    code: z.string(),
    name: z.string(),
    category: z.string(),
});
export type LabRequestItemDto = z.infer<typeof labRequestItemSchema>;

export const labRequestSchema = z.object({
    id: z.string(),
    requisitionId: z.string(),
    orderingTenantId: z.string(),
    orderingFacilityId: z.string(),
    orderingFacilityName: z.string().nullable(),
    accessionNumber: z.string().nullable(),
    title: z.string(),
    urgency: z.string().nullable(),
    items: z.array(labRequestItemSchema),
    stage: labRequestStageSchema,
    quotedAmount: z.number().nullable(),
    currency: z.string().nullable(),
    paymentRequired: z.boolean(),
    paymentStatus: paymentStatusSchema,
    laboratoryName: z.string().nullable(),
    claimToken: z.string().nullable(),
    reason: z.string().nullable(),
    issuedAt: z.string(),
    updatedAt: z.string(),
});
export type LabRequestDto = z.infer<typeof labRequestSchema>;

const prescriptionItemSchema = z.object({
    genericName: z.string(),
    brandName: z.string().nullable(),
    dosage: z.string(),
    form: z.string(),
    sig: z.string(),
    quantity: z.number(),
    durationDays: z.number().nullable(),
    remarks: z.string().nullable(),
});
export type PrescriptionItemDto = z.infer<typeof prescriptionItemSchema>;

export const prescriptionSchema = z.object({
    id: z.string(),
    prescriptionNumber: z.string(),
    orderingTenantId: z.string(),
    orderingFacilityId: z.string(),
    orderingFacilityName: z.string().nullable(),
    prescriberName: z.string(),
    prescriberPrcLicense: z.string().nullable(),
    diagnosis: z.string().nullable(),
    instructions: z.string().nullable(),
    items: z.array(prescriptionItemSchema),
    stage: prescriptionStageSchema,
    quotedAmount: z.number().nullable(),
    pharmacyName: z.string().nullable(),
    claimToken: z.string().nullable(),
    verificationUrl: z.string().nullable(),
    receiptNumber: z.string().nullable(),
    dispensedAt: z.string().nullable(),
    externalPharmacyName: z.string().nullable(),
    issuedAt: z.string(),
    updatedAt: z.string(),
});
export type PrescriptionDto = z.infer<typeof prescriptionSchema>;

const labObservationSchema = z.object({
    panel: z.string(),
    name: z.string(),
    value: z.string(),
    unit: z.string(),
    referenceRange: z.string(),
    flag: z.string(),
});
export type LabObservationDto = z.infer<typeof labObservationSchema>;

export const labResultSchema = z.object({
    id: z.string(),
    requisitionId: z.string().nullable(),
    laboratoryName: z.string(),
    title: z.string(),
    source: resultSourceSchema,
    verification: resultVerificationSchema,
    reviewedByName: z.string().nullable(),
    reviewedAt: z.string().nullable(),
    remarks: z.string().nullable(),
    impression: z.string().nullable(),
    isCritical: z.boolean(),
    resultedAt: z.string(),
    fileUrl: z.string().nullable(),
    observations: z.array(labObservationSchema),
    updatedAt: z.string(),
});
export type LabResultDto = z.infer<typeof labResultSchema>;

export const medicalCertificateSchema = z.object({
    id: z.string(),
    certificateNumber: z.string(),
    issuerName: z.string(),
    doctorName: z.string(),
    doctorPrcLicense: z.string().nullable(),
    purpose: z.string(),
    diagnosis: z.string().nullable(),
    remarks: z.string().nullable(),
    restDays: z.number().nullable(),
    validFrom: z.string().nullable(),
    validTo: z.string().nullable(),
    verificationUrl: z.string().nullable(),
    issuedAt: z.string(),
    updatedAt: z.string(),
});
export type MedicalCertificateDto = z.infer<typeof medicalCertificateSchema>;

export const syncChangesPageSchema = z.object({
    cursor: z.string(),
    hasMore: z.boolean(),
    labRequests: z.array(labRequestSchema),
    prescriptions: z.array(prescriptionSchema),
    labResults: z.array(labResultSchema),
    medicalCertificates: z.array(medicalCertificateSchema),
    grants: z.array(accessGrantSchema),
    notifications: z.array(syncNotificationSchema),
});
export type SyncChangesPage = z.infer<typeof syncChangesPageSchema>;

export const labResultUploadAckSchema = z.object({
    resultId: z.string(),
    verification: z.literal('Unverified'),
    source: z.literal('PatientUploaded'),
});
export type LabResultUploadAck = z.infer<typeof labResultUploadAckSchema>;

export const externalDispenseAckSchema = z.object({
    prescriptionId: z.string(),
    stage: z.literal('ExternalDispensed'),
});
export type ExternalDispenseAck = z.infer<typeof externalDispenseAckSchema>;

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
    orderingFacilityName: z.string().nullish(),
    accessionNumber: z.string().nullish(),
    title: z.string(),
    urgency: z.string().nullish(),
    items: z.array(labRequestItemSchema),
    stage: labRequestStageSchema,
    quotedAmount: z.number().nullish(),
    currency: z.string().nullish(),
    paymentRequired: z.boolean(),
    paymentStatus: paymentStatusSchema,
    laboratoryName: z.string().nullish(),
    claimToken: z.string().nullish(),
    reason: z.string().nullish(),
    issuedAt: z.string(),
    updatedAt: z.string(),
});
export type LabRequestDto = z.infer<typeof labRequestSchema>;

const prescriptionItemSchema = z.object({
    genericName: z.string(),
    brandName: z.string().nullish(),
    dosage: z.string(),
    form: z.string(),
    sig: z.string(),
    quantity: z.number(),
    durationDays: z.number().nullish(),
    remarks: z.string().nullish(),
});
export type PrescriptionItemDto = z.infer<typeof prescriptionItemSchema>;

export const prescriptionSchema = z.object({
    id: z.string(),
    prescriptionNumber: z.string(),
    orderingTenantId: z.string(),
    orderingFacilityId: z.string(),
    orderingFacilityName: z.string().nullish(),
    prescriberName: z.string(),
    prescriberPrcLicense: z.string().nullish(),
    diagnosis: z.string().nullish(),
    instructions: z.string().nullish(),
    items: z.array(prescriptionItemSchema),
    stage: prescriptionStageSchema,
    quotedAmount: z.number().nullish(),
    pharmacyName: z.string().nullish(),
    claimToken: z.string().nullish(),
    verificationUrl: z.string().nullish(),
    receiptNumber: z.string().nullish(),
    dispensedAt: z.string().nullish(),
    externalPharmacyName: z.string().nullish(),
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
    requisitionId: z.string().nullish(),
    laboratoryName: z.string(),
    title: z.string(),
    source: resultSourceSchema,
    verification: resultVerificationSchema,
    reviewedByName: z.string().nullish(),
    reviewedAt: z.string().nullish(),
    remarks: z.string().nullish(),
    impression: z.string().nullish(),
    isCritical: z.boolean(),
    resultedAt: z.string(),
    fileUrl: z.string().nullish(),
    observations: z.array(labObservationSchema),
    updatedAt: z.string(),
});
export type LabResultDto = z.infer<typeof labResultSchema>;

export const medicalCertificateSchema = z.object({
    id: z.string(),
    certificateNumber: z.string(),
    issuerName: z.string(),
    doctorName: z.string(),
    doctorPrcLicense: z.string().nullish(),
    purpose: z.string(),
    diagnosis: z.string().nullish(),
    remarks: z.string().nullish(),
    restDays: z.number().nullish(),
    validFrom: z.string().nullish(),
    validTo: z.string().nullish(),
    verificationUrl: z.string().nullish(),
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

import type { NewInboxLabRequest } from '../../db/schema/inboxLabRequests';
import type { NewInboxLabResult } from '../../db/schema/inboxLabResults';
import type { NewInboxMedicalCertificate } from '../../db/schema/inboxMedicalCertificates';
import type { NewInboxPrescription } from '../../db/schema/inboxPrescriptions';
import type {
  LabObservationDto,
  LabRequestDto,
  LabRequestItemDto,
  LabResultDto,
  MedicalCertificateDto,
  PrescriptionDto,
  PrescriptionItemDto,
} from '../api/documentsApi';

/** DTO -> Drizzle row mapping for the document inbox. Pure; the sync layer upserts the rows by `id`. */

function toDate(iso: string): Date {
  return new Date(iso);
}

function toDateOrNull(iso: string | null): Date | null {
  return iso ? new Date(iso) : null;
}

export function toLabRequestRow(patientId: string, dto: LabRequestDto): NewInboxLabRequest {
  return {
    id: dto.id,
    patientId,
    requisitionId: dto.requisitionId,
    orderingTenantId: dto.orderingTenantId,
    orderingFacilityId: dto.orderingFacilityId,
    orderingFacilityName: dto.orderingFacilityName,
    accessionNumber: dto.accessionNumber,
    title: dto.title,
    urgency: dto.urgency,
    itemsJson: JSON.stringify(dto.items),
    stage: dto.stage,
    quotedAmount: dto.quotedAmount,
    currency: dto.currency,
    paymentRequired: dto.paymentRequired,
    paymentStatus: dto.paymentStatus,
    laboratoryName: dto.laboratoryName,
    claimToken: dto.claimToken,
    reason: dto.reason,
    issuedAt: toDate(dto.issuedAt),
    updatedAt: toDate(dto.updatedAt),
  };
}

export function toPrescriptionRow(patientId: string, dto: PrescriptionDto): NewInboxPrescription {
  return {
    id: dto.id,
    patientId,
    prescriptionNumber: dto.prescriptionNumber,
    orderingTenantId: dto.orderingTenantId,
    orderingFacilityId: dto.orderingFacilityId,
    orderingFacilityName: dto.orderingFacilityName,
    prescriberName: dto.prescriberName,
    prescriberPrcLicense: dto.prescriberPrcLicense,
    diagnosis: dto.diagnosis,
    instructions: dto.instructions,
    itemsJson: JSON.stringify(dto.items),
    stage: dto.stage,
    quotedAmount: dto.quotedAmount,
    pharmacyName: dto.pharmacyName,
    claimToken: dto.claimToken,
    verificationUrl: dto.verificationUrl,
    receiptNumber: dto.receiptNumber,
    dispensedAt: toDateOrNull(dto.dispensedAt),
    externalPharmacyName: dto.externalPharmacyName,
    issuedAt: toDate(dto.issuedAt),
    updatedAt: toDate(dto.updatedAt),
  };
}

export function toLabResultRow(patientId: string, dto: LabResultDto): NewInboxLabResult {
  return {
    id: dto.id,
    patientId,
    requisitionId: dto.requisitionId,
    laboratoryName: dto.laboratoryName,
    title: dto.title,
    source: dto.source,
    verification: dto.verification,
    reviewedByName: dto.reviewedByName,
    reviewedAt: toDateOrNull(dto.reviewedAt),
    remarks: dto.remarks,
    impression: dto.impression,
    isCritical: dto.isCritical,
    resultedAt: toDate(dto.resultedAt),
    fileUrl: dto.fileUrl,
    observationsJson: JSON.stringify(dto.observations),
    updatedAt: toDate(dto.updatedAt),
  };
}

export function toMedicalCertificateRow(
  patientId: string,
  dto: MedicalCertificateDto,
): NewInboxMedicalCertificate {
  return {
    id: dto.id,
    patientId,
    certificateNumber: dto.certificateNumber,
    issuerName: dto.issuerName,
    doctorName: dto.doctorName,
    doctorPrcLicense: dto.doctorPrcLicense,
    purpose: dto.purpose,
    diagnosis: dto.diagnosis,
    remarks: dto.remarks,
    restDays: dto.restDays,
    validFrom: toDateOrNull(dto.validFrom),
    validTo: toDateOrNull(dto.validTo),
    verificationUrl: dto.verificationUrl,
    issuedAt: toDate(dto.issuedAt),
    updatedAt: toDate(dto.updatedAt),
  };
}

/** Parses a JSON-encoded array column; malformed or non-array content yields an empty list. */
function parseJsonArray<T>(json: string): T[] {
  try {
    const value: unknown = JSON.parse(json);
    return Array.isArray(value) ? (value as T[]) : [];
  } catch {
    return [];
  }
}

export function parseLabRequestItems(json: string): LabRequestItemDto[] {
  return parseJsonArray<LabRequestItemDto>(json);
}

export function parsePrescriptionItems(json: string): PrescriptionItemDto[] {
  return parseJsonArray<PrescriptionItemDto>(json);
}

export function parseObservations(json: string): LabObservationDto[] {
  return parseJsonArray<LabObservationDto>(json);
}

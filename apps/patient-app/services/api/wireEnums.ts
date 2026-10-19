import { z } from 'zod';

/**
 * Enum values exactly as patient-api puts them on the wire: the C# member name (PascalCase),
 * always a string, never a number. Property names stay camelCase. The API rejects anything else
 * on input, and these schemas reject anything else on output, so a drift in either direction
 * fails loudly instead of rendering as an "unknown" badge.
 */

export const LAB_REQUEST_STAGES = [
    'Issued',
    'Routed',
    'Claimed',
    'AwaitingPayment',
    'Paid',
    'SpecimenCollected',
    'InProcess',
    'ResultFinalized',
    'ExternalSubmitted',
    'Reviewed',
    'Rejected',
    'Cancelled',
] as const;
export const labRequestStageSchema = z.enum(LAB_REQUEST_STAGES);
export type LabRequestStage = z.infer<typeof labRequestStageSchema>;

export const PAYMENT_STATUSES = ['None', 'Pending', 'Paid'] as const;
export const paymentStatusSchema = z.enum(PAYMENT_STATUSES);
export type PaymentStatus = z.infer<typeof paymentStatusSchema>;

export const PRESCRIPTION_STAGES = [
    'Issued',
    'Accepted',
    'PartiallyAccepted',
    'Rejected',
    'Dispensed',
    'ExternalDispensed',
] as const;
export const prescriptionStageSchema = z.enum(PRESCRIPTION_STAGES);
export type PrescriptionStage = z.infer<typeof prescriptionStageSchema>;

export const RESULT_SOURCES = ['ClinicEzLab', 'ExternalLab', 'PatientUploaded'] as const;
export const resultSourceSchema = z.enum(RESULT_SOURCES);
export type LabResultSource = z.infer<typeof resultSourceSchema>;

export const RESULT_VERIFICATIONS = ['Verified', 'Unverified', 'Rejected'] as const;
export const resultVerificationSchema = z.enum(RESULT_VERIFICATIONS);
export type LabResultVerification = z.infer<typeof resultVerificationSchema>;

export const SHARING_SCOPE_KEYS = [
    'Demographics',
    'Allergies',
    'Medications',
    'Conditions',
    'Immunizations',
    'LabResults',
    'Prescriptions',
    'Vitals',
] as const;
export const sharingScopeSchema = z.enum(SHARING_SCOPE_KEYS);
export type SharingScope = z.infer<typeof sharingScopeSchema>;

export const GRANT_SOURCES = ['Qr', 'Booking', 'Manual'] as const;
export const grantSourceSchema = z.enum(GRANT_SOURCES);
export type AccessGrantSource = z.infer<typeof grantSourceSchema>;

export const GRANT_STATUSES = ['Active', 'Expired', 'Revoked'] as const;
export const grantStatusSchema = z.enum(GRANT_STATUSES);
export type AccessGrantStatus = z.infer<typeof grantStatusSchema>;

export const APPOINTMENT_STATUSES = [
    'Pending',
    'Confirmed',
    'Cancelled',
    'Completed',
    'NoShow',
    'ActionRequired',
] as const;
export const appointmentStatusSchema = z.enum(APPOINTMENT_STATUSES);
export type AppointmentWireStatus = z.infer<typeof appointmentStatusSchema>;

export const MEMBERSHIP_STATUSES = ['Pending', 'Active'] as const;
export const membershipStatusSchema = z.enum(MEMBERSHIP_STATUSES);
export type MembershipWireStatus = z.infer<typeof membershipStatusSchema>;

export const NOTIFICATION_TYPES = [
    'AppointmentReminder',
    'ClinicAnnouncement',
    'MedicationReminder',
    'LabResult',
    'NewMessage',
    'System',
    'SyncConflict',
] as const;
export const notificationTypeSchema = z.enum(NOTIFICATION_TYPES);
export type NotificationWireType = z.infer<typeof notificationTypeSchema>;

export const NOTIFICATION_CATEGORIES = ['Appointments', 'Reminders', 'Clinic', 'Messages', 'System'] as const;
export const notificationCategorySchema = z.enum(NOTIFICATION_CATEGORIES);
export type NotificationWireCategory = z.infer<typeof notificationCategorySchema>;

export const SYNC_STATUSES = ['Pending', 'Applied', 'Rejected', 'ConflictResolved'] as const;
export const syncStatusSchema = z.enum(SYNC_STATUSES);
export type SyncWireStatus = z.infer<typeof syncStatusSchema>;

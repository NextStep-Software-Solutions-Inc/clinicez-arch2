import type { ApiError } from '@shared/safe';
import type {
  ClinicSettingsRecord,
  PlatformVerificationStatus,
  PractitionerVerificationLevel,
  StaffMember,
  StaffRole,
} from '../services/clinicService';
import type { BadgeVariant } from '../components/ui/Badge';
import { validateDateString } from '../components/ui/ValidatedDateInput';

export const PENDING_VERIFICATION_CONFLICT_CODE = 'verification_request_not_pending';
export const PENDING_VERIFICATION_BUTTON_LABEL = 'Save & Update Submission';
export const PENDING_VERIFICATION_HELPER_NOTE =
  'Updates your active pending verification application';
export const RESUBMIT_VERIFICATION_BUTTON_LABEL = 'Save & Resubmit for Verification';
export const REGULATED_PRC_REVERIFICATION_NOTICE =
  'Updating PRC credentials or proof requires re-verification by Platform Governance.';

export function isPendingVerificationConflictError(
  err?: Pick<ApiError, 'status' | 'errorCode'> | null,
): boolean {
  if (!err) return false;
  if (err.errorCode === PENDING_VERIFICATION_CONFLICT_CODE) return true;
  return err.status === 409 && !err.errorCode;
}

export function buildDohLtoSettingsPayload(input: {
  dohLto: string;
  dohLtoExpiryDate?: string | null;
  previousDohLtoExpiryDate?: string | null;
  skipPendingVerificationSync?: boolean;
}): Partial<ClinicSettingsRecord> {
  const payload: Partial<ClinicSettingsRecord> = {
    letterheadDohLto: input.dohLto.trim(),
  };

  const trimmedExpiry = (input.dohLtoExpiryDate ?? '').trim();
  const hadSavedExpiry = Boolean((input.previousDohLtoExpiryDate ?? '').trim());

  if (trimmedExpiry) {
    payload.dohLtoExpiryDate = trimmedExpiry;
  } else if (hadSavedExpiry) {
    payload.clearDohLtoExpiryDate = true;
  }

  if (input.skipPendingVerificationSync === true) {
    payload.skipPendingVerificationSync = true;
  }

  return payload;
}

export const MAX_EVIDENCE_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

const ALLOWED_EVIDENCE_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
]);

const ALLOWED_EVIDENCE_EXTENSIONS = /\.(pdf|jpe?g|png)$/i;

export interface VerificationBadgeMeta {
  label: string;
  variant: BadgeVariant;
  icon: string;
}

export type PractitionerDirectoryAction =
  | 'submit-verification'
  | 'resubmit-prc'
  | 'withdraw-verification';

export interface PickedEvidenceFile {
  name: string;
  size?: number;
  mimeType: string;
  uri: string;
  file?: Blob;
}

export interface PickEvidenceResult {
  canceled?: boolean;
  file?: PickedEvidenceFile;
  error?: string;
}

/**
 * Only Doctors and Nurses are clinical practitioners eligible for patient directory listing.
 */
export function isClinicianRole(role?: StaffRole | string | null): boolean {
  return role === 'Doctor' || role === 'Nurse';
}

/**
 * Returns true when a staff member has a pending invitation and has not yet
 * accepted / set workstation credentials.
 */
export function isPendingInvitedStaff(staff: Partial<StaffMember>): boolean {
  return staff.status === 'Invited' && !staff.hasCredentials;
}

/**
 * Mirrors ClinicEz.Shared.Common.PractitionerIdentity.NormalizePrc.
 * Strips whitespace, dots, hyphens, and an optional leading "PRC" prefix, zero-pads
 * purely numeric values up to 7 digits, and uppercases alphanumeric licenses.
 */
export function normalizePrcNumber(raw?: string | null): string | null {
  if (!raw || !raw.trim()) return null;
  let cleaned = raw.trim().replace(/[\s.-]/g, '');
  if (/^PRC/i.test(cleaned)) {
    cleaned = cleaned.slice(3);
  }
  if (!cleaned) return null;
  if (/^\d+$/.test(cleaned)) {
    return cleaned.length <= 7 ? cleaned.padStart(7, '0') : cleaned;
  }
  return cleaned.toUpperCase();
}

/**
 * Mirrors ClinicEz.Shared.Common.PractitionerIdentity.NormalizePrc / IsValidPrcFormat.
 */
export function isValidPrcFormat(raw?: string | null): boolean {
  const cleaned = normalizePrcNumber(raw);
  if (!cleaned) return false;
  if (cleaned.length < 5 || cleaned.length > 12) return false;
  if (!/^[A-Z0-9]+$/i.test(cleaned)) return false;
  const digits = cleaned.replace(/\D/g, '');
  return digits.length >= 4;
}

/**
 * Mirrors ClinicEz.Clinic.Application.Common.Helpers.ClinicianDirectoryValidationHelper.HasRegulatedPrcCredentialsChanged.
 * Returns true if PRC license number (normalized), PRC expiry date, or PRC proof document changed.
 */
export function hasRegulatedPrcCredentialsChanged(input: {
  previousPrcLicenseNumber?: string | null;
  nextPrcLicenseNumber?: string | null;
  previousPrcExpiryDate?: string | null;
  nextPrcExpiryDate?: string | null;
  previousPrcEvidenceObjectKey?: string | null;
  nextPrcEvidenceObjectKey?: string | null;
  hasPickedProofFile?: boolean;
}): boolean {
  const prevPrc =
    normalizePrcNumber(input.previousPrcLicenseNumber) ??
    (input.previousPrcLicenseNumber ?? '').trim().toUpperCase();
  const nextPrc =
    normalizePrcNumber(input.nextPrcLicenseNumber) ??
    (input.nextPrcLicenseNumber ?? '').trim().toUpperCase();
  if (prevPrc !== nextPrc) {
    return true;
  }

  if ((input.previousPrcExpiryDate ?? '').trim() !== (input.nextPrcExpiryDate ?? '').trim()) {
    return true;
  }

  if (input.hasPickedProofFile) {
    return true;
  }

  return (
    (input.previousPrcEvidenceObjectKey ?? '').trim() !==
    (input.nextPrcEvidenceObjectKey ?? '').trim()
  );
}

/**
 * Maps facility platform verification status to a plain clinical badge.
 */
export function resolveFacilityVerificationBadge(
  status?: PlatformVerificationStatus | null,
): VerificationBadgeMeta {
  switch (status) {
    case 'PendingReview':
      return { label: 'Pending Review', variant: 'warning', icon: 'clock' };
    case 'Verified':
      return { label: 'Verified', variant: 'success', icon: 'checkCircle' };
    case 'Rejected':
    case 'Suspended':
      return { label: 'Action Required', variant: 'emergency', icon: 'alertCircle' };
    case 'Unverified':
    default:
      return { label: 'Not Listed', variant: 'neutral', icon: 'lock' };
  }
}

/**
 * Maps practitioner verification status to a plain clinical badge:
 * Not Listed, Pending Review, Awaiting Confirmation, Verified, Action Required.
 */
export function resolvePractitionerVerificationBadge(
  status?: PractitionerVerificationLevel | null,
): VerificationBadgeMeta {
  switch (status) {
    case 'PendingVerification':
      return { label: 'Pending Review', variant: 'warning', icon: 'clock' };
    case 'AwaitingConfirmation':
      return { label: 'Awaiting Confirmation', variant: 'info', icon: 'mail' };
    case 'Verified':
      return { label: 'Verified', variant: 'success', icon: 'checkCircle' };
    case 'Rejected':
    case 'Expired':
    case 'Suspended':
      return { label: 'Action Required', variant: 'emergency', icon: 'alertCircle' };
    case 'Unverified':
    default:
      return { label: 'Not Listed', variant: 'neutral', icon: 'lock' };
  }
}

/**
 * Determines whether a row-level directory verification badge should be displayed.
 * - Non-clinicians never show directory badges.
 * - Pending Invited and inactive (Suspended/Revoked/deactivated) clinicians omit passive "Not Listed" badges.
 * - Active Nurses omit passive "Not Listed" badges unless they opt in or have a non-Unverified status.
 * - Active Doctors always display their directory verification status badge.
 */
export function shouldShowPractitionerDirectoryBadge(
  staff: Partial<StaffMember>,
): boolean {
  if (!isClinicianRole(staff.role)) return false;
  const isUnverified =
    !staff.publicVerificationStatus || staff.publicVerificationStatus === 'Unverified';
  if (
    isUnverified &&
    (isPendingInvitedStaff(staff) ||
      staff.isActive === false ||
      staff.status === 'Revoked' ||
      staff.status === 'Suspended')
  ) {
    return false;
  }
  if (staff.role === 'Nurse' && !staff.isDirectoryOptIn && isUnverified) {
    return false;
  }
  return true;
}

/**
 * Resolves row-level directory verification actions for an active Doctor or Nurse.
 * Pending Invited staff cannot be submitted until they accept their invitation.
 */
export function getPractitionerDirectoryActions(
  staff: Partial<StaffMember>,
): PractitionerDirectoryAction[] {
  if (!isClinicianRole(staff.role)) return [];
  if (
    staff.isActive === false ||
    staff.status === 'Revoked' ||
    staff.status === 'Suspended' ||
    isPendingInvitedStaff(staff)
  ) {
    return [];
  }

  switch (staff.publicVerificationStatus) {
    case 'PendingVerification':
    case 'AwaitingConfirmation':
      return ['withdraw-verification'];
    case 'Rejected':
    case 'Expired':
    case 'Suspended':
      return ['resubmit-prc'];
    case 'Verified':
      return [];
    case 'Unverified':
    default:
      return ['submit-verification'];
  }
}

/**
 * Validates required clinician opt-in fields before submitting for directory verification.
 */
export function validateClinicianDirectoryOptIn(input: {
  role?: StaffRole | string | null;
  prcLicenseNumber?: string | null;
  prcExpiryDate?: string | null;
  prcEvidenceObjectKey?: string | null;
  hasPickedProofFile?: boolean;
  verificationContact?: string | null;
}): string | null {
  if (!isClinicianRole(input.role)) {
    return 'Only Doctors and Nurses can opt into the patient directory.';
  }
  if (!isValidPrcFormat(input.prcLicenseNumber)) {
    return 'Enter a valid PRC license number for directory verification.';
  }
  const dateResult = validateDateString(input.prcExpiryDate || '', {
    boundaryMode: 'futureOrToday',
  });
  if (!dateResult.isValid) {
    return dateResult.errorMessage || 'Enter a valid, non-expired PRC expiry date (YYYY-MM-DD).';
  }
  if (!input.prcEvidenceObjectKey?.trim() && !input.hasPickedProofFile) {
    return 'Upload a PRC proof document (PDF, JPEG, or PNG) before submitting.';
  }
  const contact = input.verificationContact?.trim() || '';
  if (!contact) {
    return 'Enter a verification contact (email or mobile number) for confirmation.';
  }
  if (contact.length > 255) {
    return 'Verification contact must be 255 characters or fewer.';
  }
  return null;
}

/**
 * Checks whether an existing StaffMember record already meets opt-in requirements for one-click submission.
 */
export function isStaffRecordReadyForVerification(staff: Partial<StaffMember>): boolean {
  return (
    validateClinicianDirectoryOptIn({
      role: staff.role,
      prcLicenseNumber: staff.prcLicenseNumber,
      prcExpiryDate: staff.prcExpiryDate,
      prcEvidenceObjectKey: staff.prcEvidenceObjectKey,
      verificationContact: staff.verificationContact,
    }) === null
  );
}

/**
 * Prompts the user to pick a verification evidence file (PDF, JPEG, or PNG up to 5 MB).
 */
export async function pickVerificationEvidenceFile(): Promise<PickEvidenceResult> {
  try {
    const DocumentPicker = await import('expo-document-picker');
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/jpeg', 'image/png'],
      copyToCacheDirectory: true,
      multiple: false,
    });

    if (result.canceled || !result.assets?.[0]) {
      return { canceled: true };
    }

    const asset = result.assets[0];
    if (typeof asset.size === 'number' && asset.size > MAX_EVIDENCE_FILE_SIZE_BYTES) {
      return { error: 'File exceeds the 5 MB size limit.' };
    }

    const rawMime = (asset.mimeType || '').split(';')[0].trim().toLowerCase();
    const hasAllowedExt = ALLOWED_EVIDENCE_EXTENSIONS.test(asset.name || '');
    const hasAllowedMime = rawMime ? ALLOWED_EVIDENCE_MIME_TYPES.has(rawMime) : false;

    if (!hasAllowedExt && !hasAllowedMime) {
      return { error: 'Only PDF, JPEG, and PNG files are supported.' };
    }

    const mimeType =
      hasAllowedMime
        ? rawMime
        : asset.name.toLowerCase().endsWith('.pdf')
        ? 'application/pdf'
        : asset.name.toLowerCase().endsWith('.png')
        ? 'image/png'
        : 'image/jpeg';

    return {
      file: {
        name: asset.name,
        size: asset.size,
        mimeType,
        uri: asset.uri,
        file: (asset as any).file,
      },
    };
  } catch (err: any) {
    return { error: err?.message || 'Could not select file.' };
  }
}

/**
 * Converts a picked evidence file into FormData with field name `file`.
 */
export function toEvidenceFormData(picked: PickedEvidenceFile): FormData {
  const formData = new FormData();
  if (picked.file) {
    formData.append('file', picked.file, picked.name);
  } else {
    formData.append('file', {
      uri: picked.uri,
      name: picked.name,
      type: picked.mimeType,
    } as any);
  }
  return formData;
}

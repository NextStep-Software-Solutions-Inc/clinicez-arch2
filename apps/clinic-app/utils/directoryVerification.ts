import type {
  PlatformVerificationStatus,
  PractitionerVerificationLevel,
  StaffMember,
  StaffRole,
} from '../services/clinicService';
import type { BadgeVariant } from '../components/ui/Badge';
import { validateDateString } from '../components/ui/ValidatedDateInput';

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
 * Mirrors ClinicEz.Shared.Common.PractitionerIdentity.NormalizePrc / IsValidPrcFormat.
 */
export function isValidPrcFormat(raw?: string | null): boolean {
  if (!raw || !raw.trim()) return false;
  let cleaned = raw.trim().replace(/[\s.-]/g, '');
  if (/^PRC/i.test(cleaned)) {
    cleaned = cleaned.slice(3);
  }
  if (!cleaned) return false;
  if (/^\d+$/.test(cleaned)) {
    cleaned = cleaned.length <= 7 ? cleaned.padStart(7, '0') : cleaned;
  } else {
    cleaned = cleaned.toUpperCase();
  }
  if (cleaned.length < 5 || cleaned.length > 12) return false;
  if (!/^[A-Z0-9]+$/i.test(cleaned)) return false;
  const digits = cleaned.replace(/\D/g, '');
  return digits.length >= 4;
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
 * Resolves row-level directory verification actions for an active Doctor or Nurse.
 */
export function getPractitionerDirectoryActions(
  staff: Partial<StaffMember>,
): PractitionerDirectoryAction[] {
  if (!isClinicianRole(staff.role)) return [];
  if (staff.isActive === false || staff.status === 'Revoked' || staff.status === 'Suspended') {
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

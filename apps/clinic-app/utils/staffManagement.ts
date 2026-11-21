import type { StaffMember, StaffRole } from '../services/clinicService';
import { isPendingInvitedStaff, normalizePrcNumber } from './directoryVerification';

export type StaffDeliveryMode = 'email' | 'link' | 'password' | 'none';

export interface StaffCreationDeliveryPayload {
  email?: string;
  sendInviteEmail: boolean;
  initialPassword?: string;
}

export const DUPLICATE_CLINIC_STAFF_EMAIL_MESSAGE =
  'This email address is already associated with an existing staff member in this clinic.';

export type StaffStatusFilter = 'all' | 'active' | 'invited' | 'inactive';

export interface StaffRosterFilters {
  query?: string;
  status?: StaffStatusFilter;
  role?: StaffRole | 'all';
}

const CANONICAL_TITLE_MAP: Record<string, string> = {
  dr: 'Dr.',
  'dr.': 'Dr.',
  dra: 'Dra.',
  'dra.': 'Dra.',
  rn: 'RN',
  'rn.': 'RN',
  md: 'MD',
  'md.': 'MD',
  dmd: 'DMD',
  'dmd.': 'DMD',
  rmt: 'RMT',
  rph: 'RPh',
  ptrp: 'PTRP',
};

/**
 * Normalizes common clinical title prefixes (e.g. "DR" -> "Dr.", "rn" -> "RN")
 * while preserving any custom title text trimmed.
 */
export function normalizeStaffTitle(raw: string | undefined | null): string {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return '';
  return CANONICAL_TITLE_MAP[trimmed.toLowerCase()] ?? trimmed;
}

/**
 * Finds an existing staff member in the clinic whose normalized PRC license number
 * matches `prc`, optionally excluding `excludeStaffId` when editing.
 */
export function findDuplicateStaffByPrc<
  T extends { id?: string; prcLicenseNumber?: string | null }
>(
  prc: string | undefined | null,
  existingStaff: ReadonlyArray<T>,
  excludeStaffId?: string
): T | null {
  const normalized = normalizePrcNumber(prc);
  if (!normalized || !Array.isArray(existingStaff)) {
    return null;
  }

  for (const member of existingStaff) {
    if (!member) continue;
    if (excludeStaffId && member.id === excludeStaffId) continue;
    const candidate = normalizePrcNumber(member.prcLicenseNumber);
    if (candidate && candidate === normalized) {
      return member;
    }
  }

  return null;
}

/**
 * Builds a non-blocking warning message if `prc` matches an existing colleague's PRC license.
 */
export function getDuplicateStaffPrcWarning(
  prc: string | undefined | null,
  existingStaff: ReadonlyArray<{
    id?: string;
    prcLicenseNumber?: string | null;
    title?: string | null;
    firstName?: string | null;
    lastName?: string | null;
  }>,
  excludeStaffId?: string
): string | null {
  const duplicate = findDuplicateStaffByPrc(prc, existingStaff, excludeStaffId);
  if (!duplicate) return null;

  const displayName = [duplicate.title, duplicate.firstName, duplicate.lastName]
    .filter((part): part is string => Boolean(part && part.trim()))
    .join(' ')
    .trim();

  return `PRC license number matches ${displayName || 'another staff member'}. Verify this isn't a duplicate entry.`;
}

/**
 * Classifies a staff member into a roster status filter bucket matching row badges.
 */
export function getStaffRosterStatusBucket(
  member: Partial<StaffMember>
): Exclude<StaffStatusFilter, 'all'> {
  if (member.status === 'Revoked' || member.status === 'Suspended') {
    return 'inactive';
  }
  if (isPendingInvitedStaff(member)) {
    return 'invited';
  }
  if (member.isActive === false) {
    return 'inactive';
  }
  return 'active';
}

/**
 * Filters a clinic staff roster by search query, status bucket, and role archetype.
 */
export function filterStaffRoster<T extends Partial<StaffMember>>(
  staff: ReadonlyArray<T>,
  filters: StaffRosterFilters
): T[] {
  const q = (filters.query ?? '').trim().toLowerCase();
  const normalizedQueryPrc = normalizePrcNumber(filters.query);
  const statusFilter = filters.status ?? 'all';
  const roleFilter = filters.role ?? 'all';

  return staff.filter((member) => {
    if (statusFilter !== 'all' && getStaffRosterStatusBucket(member) !== statusFilter) {
      return false;
    }

    if (roleFilter !== 'all' && member.role !== roleFilter) {
      return false;
    }

    if (!q) {
      return true;
    }

    const fullName = [member.title, member.firstName, member.middleName, member.lastName]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    const plainName = [member.firstName, member.lastName].filter(Boolean).join(' ').toLowerCase();
    const prcRaw = (member.prcLicenseNumber ?? '').toLowerCase();
    const prcNorm = normalizePrcNumber(member.prcLicenseNumber);

    const searchableParts = [
      fullName,
      plainName,
      (member.email ?? '').toLowerCase(),
      prcRaw,
      (prcNorm ?? '').toLowerCase(),
      (member.role ?? '').toLowerCase(),
      (member.roleName ?? '').toLowerCase(),
      (member.specialty ?? '').toLowerCase(),
      (member.assignedRoomNames ?? []).join(' ').toLowerCase(),
      (member.assignedRoomName ?? '').toLowerCase(),
    ];

    if (searchableParts.some((part) => part.includes(q))) {
      return true;
    }

    if (normalizedQueryPrc && prcNorm && prcNorm.includes(normalizedQueryPrc)) {
      return true;
    }

    return false;
  });
}

/**
 * Validates that a candidate email address is not already registered to an existing
 * staff member in the same clinic directory (case-insensitive, trimmed).
 * Optionally excludes a specific staff member ID when editing an existing staff record.
 */
export function validateStaffEmailNotInClinic(
  email: string | undefined | null,
  existingStaff: ReadonlyArray<{ id?: string; email?: string | null }>,
  excludeStaffId?: string
): string | null {
  if (!email) return null;
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;

  const duplicate = existingStaff.find(
    (member) =>
      (!excludeStaffId || member.id !== excludeStaffId) &&
      typeof member.email === 'string' &&
      member.email.trim().toLowerCase() === normalized
  );

  if (duplicate) {
    return DUPLICATE_CLINIC_STAFF_EMAIL_MESSAGE;
  }

  return null;
}

/**
 * Builds and validates the invitation and credential payload for staff member creation.
 * Enforces email requirement for email invitations and credential provisioning,
 * and minimum 8-character constraint on initial temporary passwords.
 */
export function buildStaffCreationPayload(
  mode: StaffDeliveryMode,
  email: string,
  tempPassword?: string
): StaffCreationDeliveryPayload {
  const trimmedEmail = email ? email.trim() : '';

  if (mode === 'email') {
    if (!trimmedEmail) {
      throw new Error('A valid email address is required to send an invitation email.');
    }
    return {
      email: trimmedEmail,
      sendInviteEmail: true,
      initialPassword: undefined,
    };
  }

  if (mode === 'password') {
    if (!trimmedEmail) {
      throw new Error('A valid email address is required when provisioning login credentials.');
    }
    if (!tempPassword || tempPassword.length < 8) {
      throw new Error('Temporary password must be at least 8 characters.');
    }
    return {
      email: trimmedEmail,
      sendInviteEmail: false,
      initialPassword: tempPassword,
    };
  }

  if (mode === 'link') {
    return {
      email: trimmedEmail || undefined,
      sendInviteEmail: false,
      initialPassword: undefined,
    };
  }

  // mode === 'none'
  return {
    email: trimmedEmail || undefined,
    sendInviteEmail: false,
    initialPassword: undefined,
  };
}

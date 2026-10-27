export type StaffDeliveryMode = 'email' | 'link' | 'password' | 'none';

export interface StaffCreationDeliveryPayload {
  email?: string;
  sendInviteEmail: boolean;
  initialPassword?: string;
}

export const DUPLICATE_CLINIC_STAFF_EMAIL_MESSAGE =
  'This email address is already associated with an existing staff member in this clinic.';

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

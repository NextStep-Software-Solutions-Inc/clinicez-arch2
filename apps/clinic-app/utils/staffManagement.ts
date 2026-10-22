export type StaffDeliveryMode = 'email' | 'link' | 'password' | 'none';

export interface StaffCreationDeliveryPayload {
  email?: string;
  sendInviteEmail: boolean;
  initialPassword?: string;
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

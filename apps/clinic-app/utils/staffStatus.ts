import type { StaffMember } from '../services/clinicService';

export type StaffBadgeVariant = 'purple' | 'warning' | 'emergency' | 'success' | 'neutral';

export interface StaffBadgeResult {
  label: string;
  variant: StaffBadgeVariant;
  icon?: string;
}

/**
 * Resolves the status badge for a staff member based on their account and invitation state.
 * Precedence:
 * 1. Invited (checking dynamic expiration)
 * 2. Revoked
 * 3. Suspended or inactive
 * 4. Active (checking password reset pending)
 * 5. Legacy credentials
 * 6. Default (No Login)
 */
export function resolveStaffBadge(s: Partial<StaffMember>): StaffBadgeResult {
  if (s.status === 'Active') {
    return s.mustChangePassword
      ? { label: 'Password Reset Pending', variant: 'warning', icon: 'lock' }
      : { label: 'Active', variant: 'success', icon: 'check' };
  }

  const isExpired =
    s.isExpired ||
    (s.status === 'Invited' &&
      !!s.invitationExpiresAt &&
      new Date(s.invitationExpiresAt).getTime() < Date.now());

  // Genuine pending invitation without credentials
  if (s.status === 'Invited' && !s.hasCredentials) {
    return isExpired
      ? { label: 'Expired', variant: 'warning', icon: 'alertCircle' }
      : { label: 'Invited', variant: 'purple', icon: 'mail' };
  }
  if (s.status === 'Revoked') {
    return { label: 'Revoked', variant: 'emergency', icon: 'close' };
  }
  if (s.status === 'Suspended' || s.isActive === false) {
    return { label: 'Suspended', variant: 'emergency', icon: 'alertTriangle' };
  }
  if (s.hasCredentials) {
    return s.mustChangePassword
      ? { label: 'Password Reset Pending', variant: 'warning', icon: 'lock' }
      : { label: 'Login Active', variant: 'success', icon: 'check' };
  }
  return { label: 'No Login', variant: 'neutral' };
}

export type StaffActionType =
  | 'edit'
  | 'copy-invite'
  | 'resend-invite'
  | 'revoke-invite'
  | 'reset-pwd'
  | 'suspend-staff'
  | 'reactivate-staff';

/**
 * Resolves available actions for a staff member adhering to the unified cross-domain action matrix:
 * - Invited: Copy Link (if not expired & has token/url), Resend Email, Revoke
 * - Expired: Resend Email, Revoke (no Copy Link)
 * - Active: Edit Details, Reset Password, Suspend
 * - Suspended: Reactivate
 * - Revoked: No actions
 */
export function getAvailableStaffActions(
  s: Partial<StaffMember>,
  options?: { isSelf?: boolean }
): StaffActionType[] {
  const isSelf = options?.isSelf ?? false;
  const isCredentialed = !!s.hasCredentials;
  const isRowRevoked = s.status === 'Revoked';
  const isRowSuspended = s.status === 'Suspended' || (s.isActive === false && !isRowRevoked && s.status !== 'Invited');

  if (isRowRevoked) {
    return [];
  }

  if (isRowSuspended) {
    const actions: StaffActionType[] = [];
    if (!isSelf) {
      actions.push('reactivate-staff');
    }
    return actions;
  }

  // A member is only pending invite if in Invited status and lacking credentials
  const isRowInvited = s.status === 'Invited' && !isCredentialed;

  if (isRowInvited) {
    const isExpired =
      s.isExpired ||
      (!!s.invitationExpiresAt &&
        new Date(s.invitationExpiresAt).getTime() < Date.now());

    const actions: StaffActionType[] = [];
    if (!isExpired && (s.invitationToken || s.inviteUrl)) {
      actions.push('copy-invite');
    }
    actions.push('resend-invite');
    if (!isSelf) {
      actions.push('revoke-invite');
    }
    return actions;
  }

  // Active / Credentialed member
  const actions: StaffActionType[] = ['edit', 'reset-pwd'];
  if (!isSelf) {
    actions.push('suspend-staff');
  }
  return actions;
}

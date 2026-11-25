import { adminService, type PendingSelfInvitationDto } from '@/services/admin.service';
import { clearLastActiveTimestamp } from '@/lib/idleGuard';
import {
  buildInvitationPath,
  clearAllPendingAdminAuthState,
  readPendingInvitationToken,
} from '@/lib/authRedirect';

export function getHttpStatus(err: unknown): number | undefined {
  return (err as { response?: { status?: number } })?.response?.status;
}

export function isForbiddenError(err: unknown): boolean {
  return getHttpStatus(err) === 403;
}

export function isUnauthorizedError(err: unknown): boolean {
  return getHttpStatus(err) === 401;
}

/**
 * Resolves a pending Platform Admin invitation path either from sessionStorage
 * (for OAuth flows initiated from /invitations/$token) or from the backend's
 * authoritative pending-self lookup.
 */
export async function resolvePendingAdminInvitationPath(
  getPendingSelf: () => Promise<PendingSelfInvitationDto | null> = adminService.getPendingSelfInvitation
): Promise<string | null> {
  const storedPath = buildInvitationPath(readPendingInvitationToken());
  if (storedPath) {
    return storedPath;
  }

  try {
    const pending = await getPendingSelf();
    if (pending && pending.invitationType === 'Admin') {
      return buildInvitationPath(pending.token);
    }
  } catch {
    // Non-fatal: fail closed to unauthorized state when lookup fails
  }

  return null;
}

/**
 * Terminates the active Clerk session, clears pending invitation/idle storage,
 * and navigates cleanly to the destination route (defaulting to /sign-in).
 */
export async function performCleanAdminSignOut(
  signOut?: (() => Promise<unknown>) | null,
  redirectTo: string = '/sign-in'
): Promise<void> {
  clearAllPendingAdminAuthState();
  clearLastActiveTimestamp();

  if (signOut) {
    try {
      await signOut();
    } catch {
      // Proceed with redirect even if Clerk session teardown rejects
    }
  }

  if (typeof window !== 'undefined') {
    window.location.href = redirectTo;
  }
}

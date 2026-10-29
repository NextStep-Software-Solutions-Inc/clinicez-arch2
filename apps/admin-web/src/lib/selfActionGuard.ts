export const SELF_ACTION_MESSAGES = {
  adminRevoke: "You cannot revoke your own admin account.",
  adminSuspend: "You cannot suspend your own account.",
  adminDelete: "You cannot delete your own admin account.",
} as const;

export interface CurrentUserIdentity {
  userId?: string | null;
  email?: string | null;
  emails?: (string | null | undefined)[];
}

export interface SelfActionRestrictionState {
  isSelf: boolean;
  canRevoke: boolean;
  canSuspend: boolean;
  canDelete: boolean;
  revokeTooltip: string;
  suspendTooltip: string;
  deleteTooltip: string;
}

function collectNormalizedEmails(identity: CurrentUserIdentity): Set<string> {
  const candidateEmails = new Set<string>();
  if (identity.email?.trim()) {
    candidateEmails.add(identity.email.trim().toLowerCase());
  }
  for (const e of identity.emails ?? []) {
    if (e?.trim()) {
      candidateEmails.add(e.trim().toLowerCase());
    }
  }
  return candidateEmails;
}

export function isSelfAdminUser(
  adminUser: { clerkUserId?: string | null; email?: string | null } | null | undefined,
  currentAdmin: CurrentUserIdentity | null | undefined
): boolean {
  if (!adminUser || !currentAdmin) return false;

  const currentUserId = currentAdmin.userId?.trim();
  const targetClerkId = adminUser.clerkUserId?.trim();
  if (currentUserId && targetClerkId && targetClerkId === currentUserId) {
    return true;
  }

  const targetEmail = adminUser.email?.trim().toLowerCase();
  if (!targetEmail) return false;

  return collectNormalizedEmails(currentAdmin).has(targetEmail);
}

export function getAdminUserActionRestriction(
  adminUser:
    | {
        clerkUserId?: string | null;
        email?: string | null;
        status?: string | null;
        displayStatus?: string | null;
      }
    | null
    | undefined,
  currentAdmin: CurrentUserIdentity | null | undefined
): SelfActionRestrictionState {
  const isSelf = isSelfAdminUser(adminUser, currentAdmin);
  const effectiveStatus = adminUser?.displayStatus || adminUser?.status;
  const isInvite = effectiveStatus === "Invited" || effectiveStatus === "Expired";
  return {
    isSelf,
    canRevoke: !isSelf,
    canSuspend: !isSelf,
    canDelete: !isSelf,
    revokeTooltip: isSelf
      ? SELF_ACTION_MESSAGES.adminRevoke
      : isInvite
        ? effectiveStatus === "Expired"
          ? "Revoke Expired Invitation"
          : "Revoke Invitation"
        : "Revoke Admin Access",
    suspendTooltip: isSelf
      ? SELF_ACTION_MESSAGES.adminSuspend
      : "Suspend Account",
    deleteTooltip: isSelf
      ? SELF_ACTION_MESSAGES.adminDelete
      : "Permanently Delete Admin Profile",
  };
}

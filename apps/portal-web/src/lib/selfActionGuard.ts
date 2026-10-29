export const SELF_ACTION_MESSAGES = {
  workspaceRevoke: "You cannot revoke your own workspace access.",
  workspaceSuspend: "You cannot suspend your own account.",
  workspaceDelete: "You cannot remove your own account from the workspace.",
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

export function isSelfWorkspaceMember(
  member: { userId?: string | null; email?: string | null } | null | undefined,
  currentUser: CurrentUserIdentity | null | undefined
): boolean {
  if (!member || !currentUser) return false;

  const currentUserId = currentUser.userId?.trim();
  const memberUserId = member.userId?.trim();
  if (currentUserId && memberUserId && memberUserId === currentUserId) {
    return true;
  }

  const memberEmail = member.email?.trim().toLowerCase();
  if (!memberEmail) return false;

  return collectNormalizedEmails(currentUser).has(memberEmail);
}

export function getWorkspaceMemberActionRestriction(
  member: { userId?: string | null; email?: string | null; status?: string | null } | null | undefined,
  currentUser: CurrentUserIdentity | null | undefined
): SelfActionRestrictionState {
  const isSelf = isSelfWorkspaceMember(member, currentUser);
  const isInvite = member?.status === "Invited" || member?.status === "Expired";
  return {
    isSelf,
    canRevoke: !isSelf,
    canSuspend: !isSelf,
    canDelete: !isSelf,
    revokeTooltip: isSelf
      ? SELF_ACTION_MESSAGES.workspaceRevoke
      : isInvite
        ? "Revoke Invitation"
        : "Revoke Workspace Access",
    suspendTooltip: isSelf
      ? SELF_ACTION_MESSAGES.workspaceSuspend
      : "Suspend Account",
    deleteTooltip: isSelf
      ? SELF_ACTION_MESSAGES.workspaceDelete
      : "Permanently remove from workspace",
  };
}

export const INVITATION_EMAIL_MISMATCH_MESSAGE =
  'This invitation is intended for a different email address. Please sign in with the invited account to continue.';

export interface ClerkEmailVerificationLike {
  status?: string | null;
}

export interface ClerkEmailAddressLike {
  emailAddress?: string | null;
  verification?: ClerkEmailVerificationLike | null;
}

export interface ClerkEmailLikeUser {
  primaryEmailAddress?: ClerkEmailAddressLike | null;
  emailAddresses?: Array<ClerkEmailAddressLike> | null;
}

/**
 * Fail-closed check verifying whether the currently signed-in Clerk user owns a verified
 * email address matching the invited email address (case-insensitive, trimmed).
 */
export function isUserEmailMatched(
  user: ClerkEmailLikeUser | null | undefined,
  invitedEmail: string | null | undefined
): boolean {
  if (!user || !invitedEmail || typeof invitedEmail !== 'string' || !invitedEmail.trim()) {
    return false;
  }

  const target = invitedEmail.trim().toLowerCase();
  const emailEntries = Array.isArray(user.emailAddresses) ? user.emailAddresses : null;

  if (emailEntries && emailEntries.length > 0) {
    const matchingEntries = emailEntries.filter(
      (entry) =>
        Boolean(entry) &&
        typeof entry.emailAddress === 'string' &&
        entry.emailAddress.trim().toLowerCase() === target
    );

    if (matchingEntries.length > 0) {
      return matchingEntries.some((entry) => entry.verification?.status === 'verified');
    }
  }

  const primaryObj = user.primaryEmailAddress;
  const primary = primaryObj?.emailAddress?.trim().toLowerCase();
  if (primary && primary === target) {
    if (primaryObj && 'verification' in primaryObj && primaryObj.verification !== undefined) {
      return primaryObj.verification?.status === 'verified';
    }
    if (emailEntries && emailEntries.length > 0) {
      return false;
    }
    return true;
  }

  return false;
}

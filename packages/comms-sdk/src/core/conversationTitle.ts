export interface ParticipantLike {
  id?: string | null;
  userId?: string | null;
  participantId?: string | null;
  displayName?: string | null;
  name?: string | null;
  role?: string | null;
  leftAt?: string | null;
  leftAtUtc?: string | null;
}

export interface ConversationTitleLike {
  id?: string;
  scope?: string | null;
  kind?: string | null;
  title?: string | null;
  participants?: ParticipantLike[] | null;
}

/**
 * Resolves a conversation display title dynamically from the viewer's perspective.
 *
 * Rules:
 * 1. If an explicit title is set on the conversation, return it.
 * 2. If the title is null/empty:
 *    - Filter out the current viewer from participants.
 *    - If 1 other participant: return their name.
 *    - If 2 other participants: return "Name1, Name2".
 *    - If >2 other participants: return "Name1, Name2 +N".
 *    - If no other participants: return "".
 * 3. No fallback default values or legacy string manipulation.
 */
export function resolveConversationDisplayTitle(
  conversation: ConversationTitleLike,
  currentUserId?: string | null,
  currentUserName?: string | null,
  formatParticipantName?: (p: ParticipantLike) => string | null
): string {
  const rawTitle = (conversation?.title || '').trim();

  // If the conversation was given an explicit title, use it directly
  if (rawTitle) {
    return rawTitle;
  }

  const participants = conversation?.participants || [];

  // Filter out current viewer and departed participants
  const otherParticipants = participants.filter((p) => {
    if (p.leftAt || p.leftAtUtc) {
      return false;
    }
    const pid = p.participantId || p.userId || p.id;
    if (currentUserId && pid && String(pid).trim().toLowerCase() === String(currentUserId).trim().toLowerCase()) {
      return false;
    }
    if (currentUserName && p.displayName && p.displayName.trim().toLowerCase() === currentUserName.trim().toLowerCase()) {
      return false;
    }
    return true;
  });

  const getName = (p: ParticipantLike): string => {
    if (formatParticipantName) {
      const formatted = formatParticipantName(p);
      if (formatted && formatted.trim().length > 0) return formatted.trim();
    }
    return (p.displayName || p.name || p.participantId || p.userId || p.id || '').trim();
  };

  if (otherParticipants.length === 1) {
    return getName(otherParticipants[0]);
  }

  if (otherParticipants.length === 2) {
    return `${getName(otherParticipants[0])}, ${getName(otherParticipants[1])}`;
  }

  if (otherParticipants.length > 2) {
    const remaining = otherParticipants.length - 2;
    return `${getName(otherParticipants[0])}, ${getName(otherParticipants[1])} +${remaining}`;
  }

  return '';
}

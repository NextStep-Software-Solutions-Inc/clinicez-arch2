// token-guard:ignore-file (canonical 6-emoji staff reaction allowlist matching backend CommsReactionValidator)
export const ALLOWED_STAFF_REACTIONS = ['👍', '❤️', '🙏', '✅', '👀', '⚠️'] as const;

export type AllowedStaffReaction = (typeof ALLOWED_STAFF_REACTIONS)[number];

export function isAllowedStaffReaction(emoji: string): emoji is AllowedStaffReaction {
  return (ALLOWED_STAFF_REACTIONS as readonly string[]).includes(emoji);
}

/**
 * Utility for parsing and extracting facility staff invitation tokens from URLs and deep links.
 */
export function extractInviteToken(urlStr?: string | null): string | null {
  if (!urlStr) return null;
  const match = urlStr.match(/\/invitations\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

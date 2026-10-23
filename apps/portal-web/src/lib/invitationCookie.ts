export const PENDING_INVITATION_COOKIE_NAME = "clinicez_pending_invitation";

export interface PendingInvitationCookiePayload {
  type: "workspace" | "admin";
  token: string;
}

/**
 * Serializes a pending invitation payload to a JSON string.
 */
export function serializePendingInvitation(payload: PendingInvitationCookiePayload): string {
  return JSON.stringify({
    type: payload.type,
    token: payload.token.trim(),
  });
}

/**
 * Parses a raw cookie string into a verified PendingInvitationCookiePayload, or returns null if invalid.
 */
export function parsePendingInvitation(raw: string | undefined | null): PendingInvitationCookiePayload | null {
  if (!raw || typeof raw !== "string" || !raw.trim()) {
    return null;
  }

  try {
    const decoded = decodeURIComponent(raw.trim());
    const parsed = JSON.parse(decoded);

    if (
      parsed &&
      typeof parsed === "object" &&
      (parsed.type === "workspace" || parsed.type === "admin") &&
      typeof parsed.token === "string" &&
      parsed.token.trim().length > 0
    ) {
      return {
        type: parsed.type,
        token: parsed.token.trim(),
      };
    }
  } catch {
    // Malformed JSON or non-URI encoded string
  }

  return null;
}

/**
 * Client-side helper to write the pending invitation cookie.
 * Does nothing when running server-side.
 */
export function setPendingInvitationCookie(payload: PendingInvitationCookiePayload): void {
  if (typeof document === "undefined") return;

  const value = encodeURIComponent(serializePendingInvitation(payload));
  const isSecure = typeof window !== "undefined" && window.location.protocol === "https:";

  // 7 days = 604,800 seconds
  document.cookie = `${PENDING_INVITATION_COOKIE_NAME}=${value}; Path=/; Max-Age=604800; SameSite=Lax${
    isSecure ? "; Secure" : ""
  }`;
}

/**
 * Client-side helper to read and parse the pending invitation cookie.
 * Returns null if not in browser context or if cookie is missing/invalid.
 */
export function getPendingInvitationCookie(): PendingInvitationCookiePayload | null {
  if (typeof document === "undefined") return null;

  const cookies = document.cookie ? document.cookie.split("; ") : [];
  for (const cookie of cookies) {
    const [name, ...parts] = cookie.split("=");
    if (name.trim() === PENDING_INVITATION_COOKIE_NAME) {
      return parsePendingInvitation(parts.join("="));
    }
  }

  return null;
}

/**
 * Client-side helper to clear the pending invitation cookie.
 * Does nothing when running server-side.
 */
export function clearPendingInvitationCookie(): void {
  if (typeof document === "undefined") return;

  const isSecure = typeof window !== "undefined" && window.location.protocol === "https:";
  document.cookie = `${PENDING_INVITATION_COOKIE_NAME}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax${
    isSecure ? "; Secure" : ""
  }`;
}

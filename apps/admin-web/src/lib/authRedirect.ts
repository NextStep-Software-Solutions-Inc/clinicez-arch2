export const PENDING_AUTH_REDIRECT_KEY = 'clinicez_admin_auth_redirect_url';
export const PENDING_INVITATION_TOKEN_KEY = 'clinicez_admin_pending_invitation_token';

const AUTH_LOOP_PREFIXES = ['/sign-in', '/sign-up', '/sync-auth'];
const CONTROL_CHAR_REGEX = /[\u0000-\u001F\u007F]/;

function isAuthLoopPath(pathname: string): boolean {
  const normalized = pathname.toLowerCase();
  return AUTH_LOOP_PREFIXES.some(
    (prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`)
  );
}

/**
 * Validates and normalizes an internal relative redirect path for admin-web.
 * Rejects external URLs, protocol-relative paths, backslash escapes, control chars,
 * and auth-route redirect loops.
 */
export function sanitizeAdminRedirectPath(raw?: string | null): string | null {
  if (!raw || typeof raw !== 'string') return null;

  const trimmed = raw.trim();
  if (!trimmed || !trimmed.startsWith('/')) return null;
  if (trimmed.startsWith('//') || trimmed.startsWith('/\\')) return null;
  if (trimmed.includes('\\') || trimmed.includes('://') || CONTROL_CHAR_REGEX.test(trimmed)) {
    return null;
  }

  try {
    const parsed = new URL(trimmed, 'https://admin.local');
    if (parsed.origin !== 'https://admin.local') return null;
    if (isAuthLoopPath(parsed.pathname)) return null;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}

/**
 * Builds the canonical relative invitation route path for a token.
 */
export function buildInvitationPath(token?: string | null): string | null {
  if (!token || typeof token !== 'string') return null;
  const trimmed = token.trim();
  if (!trimmed) return null;
  return `/invitations/${encodeURIComponent(trimmed)}`;
}

/**
 * Appends a validated relative redirect_url query parameter to /sign-in or /sign-up.
 */
export function buildAuthHrefWithRedirect(
  basePath: '/sign-in' | '/sign-up',
  redirectPath?: string | null
): string {
  const safeRedirect = sanitizeAdminRedirectPath(redirectPath);
  if (!safeRedirect) return basePath;
  return `${basePath}?redirect_url=${encodeURIComponent(safeRedirect)}`;
}

function getSafeSessionStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage ?? null;
  } catch {
    return null;
  }
}

export function savePendingAuthRedirect(redirectPath?: string | null): void {
  const safeRedirect = sanitizeAdminRedirectPath(redirectPath);
  const storage = getSafeSessionStorage();
  if (!storage) return;

  try {
    if (safeRedirect) {
      storage.setItem(PENDING_AUTH_REDIRECT_KEY, safeRedirect);
    } else {
      storage.removeItem(PENDING_AUTH_REDIRECT_KEY);
    }
  } catch {
    // Ignore storage write errors in restricted browsing contexts
  }
}

export function readPendingAuthRedirect(): string | null {
  const storage = getSafeSessionStorage();
  if (!storage) return null;

  try {
    return sanitizeAdminRedirectPath(storage.getItem(PENDING_AUTH_REDIRECT_KEY));
  } catch {
    return null;
  }
}

export function clearPendingAuthRedirect(): void {
  const storage = getSafeSessionStorage();
  if (!storage) return;

  try {
    storage.removeItem(PENDING_AUTH_REDIRECT_KEY);
  } catch {
    // Ignore storage removal errors
  }
}

export function savePendingInvitationToken(token?: string | null): void {
  const storage = getSafeSessionStorage();
  if (!storage) return;

  const trimmed = typeof token === 'string' ? token.trim() : '';
  try {
    if (trimmed) {
      storage.setItem(PENDING_INVITATION_TOKEN_KEY, trimmed);
    } else {
      storage.removeItem(PENDING_INVITATION_TOKEN_KEY);
    }
  } catch {
    // Ignore storage write errors
  }
}

export function readPendingInvitationToken(): string | null {
  const storage = getSafeSessionStorage();
  if (!storage) return null;

  try {
    const raw = storage.getItem(PENDING_INVITATION_TOKEN_KEY);
    const trimmed = typeof raw === 'string' ? raw.trim() : '';
    return trimmed || null;
  } catch {
    return null;
  }
}

export function clearPendingInvitationToken(): void {
  const storage = getSafeSessionStorage();
  if (!storage) return;

  try {
    storage.removeItem(PENDING_INVITATION_TOKEN_KEY);
  } catch {
    // Ignore storage removal errors
  }
}

export function clearAllPendingAdminAuthState(): void {
  clearPendingAuthRedirect();
  clearPendingInvitationToken();
}

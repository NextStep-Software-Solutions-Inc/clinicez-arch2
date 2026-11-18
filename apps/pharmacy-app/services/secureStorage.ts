/**
 * Tab-scoped storage helper (web implementation).
 *
 * Web refresh tokens are stored in an HttpOnly session cookie managed by `pharmacy-api` (shared across tabs
 * without exposing credentials to JavaScript). Native builds resolve `secureStorage.native.ts`
 * (Keychain / Keystore via expo-secure-store).
 */
const memory = new Map<string, string>();

function session(): Storage | null {
  try {
    if (typeof sessionStorage !== 'undefined') return sessionStorage;
  } catch {
    // Access can throw in sandboxed frames.
  }
  return null;
}

export async function getSecureItem(key: string): Promise<string | null> {
  try {
    return session()?.getItem(key) ?? memory.get(key) ?? null;
  } catch {
    return memory.get(key) ?? null;
  }
}

export async function setSecureItem(key: string, value: string): Promise<void> {
  memory.set(key, value);
  try {
    session()?.setItem(key, value);
  } catch {
    // memory copy still holds it for this page lifetime
  }
}

export async function deleteSecureItem(key: string): Promise<void> {
  memory.delete(key);
  try {
    session()?.removeItem(key);
  } catch {
    // ignore
  }
}

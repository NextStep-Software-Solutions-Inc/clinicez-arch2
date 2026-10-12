/**
 * Minimal per-device key/value storage.
 *
 * Web (this file): `localStorage` (survives reloads, same mechanism as the tenant/workspace context
 * in @shared/safe). Native builds resolve `deviceStorage.native.ts` instead, which persists to SQLite.
 * Never store secrets here - use `services/secureStorage`.
 */
const memory = new Map<string, string>();

function webStorage(): Storage | null {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    // Access can throw in private mode / sandboxed frames.
  }
  return null;
}

export function getDeviceItem(key: string): string | null {
  const storage = webStorage();
  if (storage) {
    try {
      return storage.getItem(key);
    } catch {
      return memory.get(key) ?? null;
    }
  }
  return memory.get(key) ?? null;
}

export function setDeviceItem(key: string, value: string | null) {
  const storage = webStorage();
  if (value === null) {
    memory.delete(key);
    try {
      storage?.removeItem(key);
    } catch {
      // ignore
    }
    return;
  }
  memory.set(key, value);
  try {
    storage?.setItem(key, value);
  } catch {
    // ignore - memory copy still holds it for this session
  }
}

function webSessionStorage(): Storage | null {
  try {
    if (typeof sessionStorage !== 'undefined') return sessionStorage;
  } catch {
    // Access can throw in private mode / sandboxed frames.
  }
  return null;
}

export function getSessionItem(key: string): string | null {
  const session = webSessionStorage();
  if (session) {
    try {
      const val = session.getItem(key);
      if (val !== null) return val;
    } catch {
      // ignore
    }
  }
  return getDeviceItem(key);
}

export function setSessionItem(key: string, value: string | null) {
  const session = webSessionStorage();
  if (session) {
    try {
      if (value === null) {
        session.removeItem(key);
      } else {
        session.setItem(key, value);
      }
    } catch {
      // ignore
    }
  }
  setDeviceItem(key, value);
}

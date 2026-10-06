/**
 * Minimal per-device key/value storage.
 *
 * Web: `localStorage` (survives reloads, same mechanism as the tenant/workspace context
 * in @shared/safe). Native: in-memory for the current app session - persistent native
 * storage would need a new native module, which this app does not otherwise require.
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

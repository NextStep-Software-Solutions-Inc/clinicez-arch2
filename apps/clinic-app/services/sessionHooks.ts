/**
 * Lightweight lifecycle hook registry for workstation lock and idle-deferral checks.
 * Kept separate from `authSession` so screens/contexts can register draft flushes and active-call
 * checks without introducing circular imports.
 */

type BeforeLockHook = () => void;
type BusyCheck = () => boolean;

const beforeLockHooks = new Set<BeforeLockHook>();
const activeBusyChecks = new Set<BusyCheck>();

/**
 * Registers a synchronous callback executed immediately before `lockSession()` clears the
 * in-memory access token (e.g., to dispatch `keepalive` draft saves while auth headers are still valid).
 */
export function registerBeforeLockHook(hook: BeforeLockHook): () => void {
  beforeLockHooks.add(hook);
  return () => {
    beforeLockHooks.delete(hook);
  };
}

/** Runs all registered pre-lock hooks, isolating any individual failure. */
export function runBeforeLockHooks(): void {
  beforeLockHooks.forEach((hook) => {
    try {
      hook();
    } catch {
      // Never block workstation locking if a draft hook fails.
    }
  });
}

/**
 * Registers a predicate returning `true` when an uninterrupted clinical task is active
 * (e.g., an open live teleconsultation call) so the idle lock defers until it ends.
 */
export function registerActiveSessionBusyCheck(check: BusyCheck): () => void {
  activeBusyChecks.add(check);
  return () => {
    activeBusyChecks.delete(check);
  };
}

export function isActiveSessionBusy(): boolean {
  for (const check of activeBusyChecks) {
    try {
      if (check()) return true;
    } catch {
      // Ignore failing checks.
    }
  }
  return false;
}

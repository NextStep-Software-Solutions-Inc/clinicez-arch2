import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { type AppStateStatus } from 'react-native';
import * as ReactNative from 'react-native';

const AppState = (ReactNative as any).AppState ?? (ReactNative as any).default?.AppState;
const Platform = (ReactNative as any).Platform ?? (ReactNative as any).default?.Platform;
import { createWebIdleMonitor, DEFAULT_WEB_IDLE_WARNING_SECONDS, type WebIdleMonitor } from '@shared/safe';
import {
  AdminRecoveryInput,
  AuthUser,
  BootstrapInput,
  bootstrapAdmin,
  broadcastActivity,
  changePassword as changePasswordRequest,
  discardLocalSession,
  getAuthStatus,
  getLockedSession,
  hasPermission,
  idleLogout,
  lockSession as lockSessionRequest,
  type LockedSessionInfo,
  login as loginRequest,
  logout as logoutRequest,
  onSessionExpired,
  onSessionIdleExpired,
  onSessionLocked,
  onSessionUnlocked,
  recoverAdmin as recoverAdminRequest,
  removeQuickUnlockPin as removeQuickUnlockPinRequest,
  restoreSession,
  resumeOnline,
  type SessionPolicy,
  setQuickUnlockPin as setQuickUnlockPinRequest,
  subscribeRemoteActivity,
  subscribeSession,
  unlockWithPassword as unlockWithPasswordRequest,
  unlockWithPin as unlockWithPinRequest,
  updateSessionPolicy as updateSessionPolicyStore,
} from '../services/authSession';
import { isUnlockConfigured } from '../services/offlineUnlock';
import { getWebIdleTimeoutMinutes } from '../services/runtimeConfig';
import { isActiveSessionBusy } from '../services/sessionHooks';

/**
 * Where the signed-in experience stands:
 *  - booting            restoring a previous session / asking the server what it needs
 *  - unreachable        no session and the clinic server cannot be reached
 *  - signedOut          email + password
 *  - needsBootstrap     fresh facility, no administrator yet
 *  - locked             native device offline with a cached session: PIN / biometric
 *  - workstationLocked  server-backed workstation lock: 6-digit PIN or password unlock
 *  - mustChangePassword temporary password must be replaced before continuing
 *  - signedIn           normal operation (possibly `offline` on native)
 */
export type AuthState =
  | 'booting'
  | 'unreachable'
  | 'signedOut'
  | 'needsBootstrap'
  | 'locked'
  | 'workstationLocked'
  | 'mustChangePassword'
  | 'signedIn';

export interface AccountSwitchAlert {
  previousUser: AuthUser;
  currentUser: AuthUser;
}

export interface AuthContextValue {
  state: AuthState;
  user: AuthUser | null;
  permissions: string[];
  /** Native only: the cached session is in use because the clinic server cannot be reached. */
  offline: boolean;
  /** Non-null when the workstation is locked (`state === 'workstationLocked'`). */
  lockedSession: LockedSessionInfo | null;
  /** Non-null during the final 60s before inactivity auto-lock fires. */
  idleWarningSecondsLeft: number | null;
  /** Notice shown on the sign-in screen (e.g. the session ended). */
  notice: string | null;
  /** Non-null when another browser tab signed in as a different staff account while this tab was active. */
  accountSwitchAlert: AccountSwitchAlert | null;
  /** Dismisses the account-switch safety modal after confirming the new active user. */
  acknowledgeAccountSwitch: () => void;
  /** Resolves to an error message, or `null` on success. */
  login: (email: string, password: string) => Promise<string | null>;
  bootstrap: (input: BootstrapInput) => Promise<string | null>;
  recoverAdmin: (input: AdminRecoveryInput) => Promise<string | null>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<string | null>;
  /** Called by the offline unlock screen once the PIN / biometric check passed. */
  completeUnlock: () => void;
  /** Explicitly dismisses the inactivity warning modal and resets the idle timer across tabs. */
  extendIdleSession: () => void;
  /** Flushes drafts, clears the access token, and locks the workstation across open tabs. */
  lockWorkstation: () => Promise<void>;
  /** Unlocks a locked workstation using the staff member's 6-digit quick-unlock PIN. */
  unlockWithPin: (pin: string) => Promise<string | null>;
  /** Unlocks a locked workstation using the staff member's current account password. */
  unlockWithPassword: (password: string) => Promise<string | null>;
  /** Sets or updates the signed-in staff member's 6-digit quick-unlock PIN. */
  setQuickUnlockPin: (currentPassword: string, pin: string) => Promise<string | null>;
  /** Removes the signed-in staff member's 6-digit quick-unlock PIN. */
  removeQuickUnlockPin: (currentPassword: string) => Promise<string | null>;
  /** Updates the in-memory session policy immediately after an admin edits clinic settings. */
  updateSessionPolicy: (policy: SessionPolicy) => void;
  /** Cleanly signs out and clears the URL so the next staff member starts at Dashboard. */
  switchStaffAccount: () => Promise<void>;
  /** Abandon the offline session and require the password. */
  useDifferentAccount: () => Promise<void>;
  logout: () => Promise<void>;
  /** Re-run the startup checks (after a connection failure, or a server change). */
  retry: () => void;
  can: (permission: string) => boolean;
}

const noop = async () => null;

const AuthContext = createContext<AuthContextValue>({
  state: 'booting',
  user: null,
  permissions: [],
  offline: false,
  lockedSession: null,
  idleWarningSecondsLeft: null,
  notice: null,
  accountSwitchAlert: null,
  acknowledgeAccountSwitch: () => {},
  login: noop,
  bootstrap: noop,
  recoverAdmin: noop,
  changePassword: noop,
  completeUnlock: () => {},
  extendIdleSession: () => {},
  lockWorkstation: async () => {},
  unlockWithPin: noop,
  unlockWithPassword: noop,
  setQuickUnlockPin: noop,
  removeQuickUnlockPin: noop,
  updateSessionPolicy: () => {},
  switchStaffAccount: async () => {},
  useDifferentAccount: async () => {},
  logout: async () => {},
  retry: () => {},
  can: () => false,
});

export const useAuth = (): AuthContextValue => {
  const globalMock = (globalThis as any).__mockAuthContext;
  if (globalMock) return globalMock;
  return useContext(AuthContext);
};

/** True when the signed-in staff member holds `permission` (always false while signed out). */
export function usePermission(permission: string): boolean {
  const { permissions } = useAuth();
  return hasPermission(permissions, permission);
}

const OFFLINE_RETRY_MS = 30_000;
const LOCK_EXPIRY_CHECK_MS = 30_000;

function resetWebUrlToRoot(): void {
  if (Platform?.OS !== 'web' || typeof window === 'undefined' || !window.history?.replaceState) return;
  try {
    const loc = window.location;
    if (loc && (loc.pathname !== '/' || loc.search || loc.hash)) {
      window.history.replaceState(null, '', '/');
    }
  } catch {
    // Ignore restricted history API errors.
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>('booting');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [offline, setOffline] = useState(false);
  const [lockedSession, setLockedSession] = useState<LockedSessionInfo | null>(() => getLockedSession());
  const [idleWarningSecondsLeft, setIdleWarningSecondsLeft] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [accountSwitchAlert, setAccountSwitchAlert] = useState<AccountSwitchAlert | null>(null);
  const [bootNonce, setBootNonce] = useState(0);
  const stateRef = useRef(state);
  stateRef.current = state;
  const userRef = useRef<AuthUser | null>(user);
  userRef.current = user;
  const idleMonitorRef = useRef<WebIdleMonitor | null>(null);

  const afterSignIn = useCallback((signedIn: AuthUser) => {
    setAccountSwitchAlert(null);
    setLockedSession(null);
    setIdleWarningSecondsLeft(null);
    setUser(signedIn);
    setState(signedIn.mustChangePassword ? 'mustChangePassword' : 'signedIn');
  }, []);

  const resolveSignedOutState = useCallback(async () => {
    const [status, error] = await getAuthStatus();
    if (error && error.status === 0) {
      setState('unreachable');
      return;
    }
    setState(status?.requiresBootstrap ? 'needsBootstrap' : 'signedOut');
  }, []);

  // Startup: restore a session, or work out whether the server needs a first administrator.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setState('booting');
        const outcome = await restoreSession();
        if (cancelled) return;

        if (outcome.state === 'signedIn') {
          afterSignIn(outcome.user);
          return;
        }

        if (outcome.state === 'workstationLocked') {
          setUser(null);
          setOffline(false);
          setLockedSession(outcome.lockedSession);
          setIdleWarningSecondsLeft(null);
          setState('workstationLocked');
          return;
        }

        if (outcome.state === 'offline') {
          if (await isUnlockConfigured()) {
            setUser(outcome.user);
            setOffline(true);
            setState('locked');
            return;
          }
          // No PIN/biometric was ever set up, so the cached session cannot be opened offline.
          await discardLocalSession();
          setNotice('You are offline. Connect to the clinic network to sign in.');
        }

        await resolveSignedOutState();
      } catch (err) {
        console.warn('[AuthContext] Startup initialization error caught:', err);
        if (!cancelled) {
          setState('signedOut');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [afterSignIn, bootNonce, resolveSignedOutState]);

  // React to server session rejections, idle logout, workstation locks/unlocks, and cross-tab events.
  useEffect(() => {
    onSessionExpired(() => {
      const wasBooting = stateRef.current === 'booting';
      setUser(null);
      setOffline(false);
      setLockedSession(null);
      setIdleWarningSecondsLeft(null);
      setAccountSwitchAlert(null);
      if (!wasBooting) {
        resetWebUrlToRoot();
        setNotice('Your session has ended. Please sign in again.');
        setState('signedOut');
      }
    });
    onSessionIdleExpired(() => {
      setUser(null);
      setOffline(false);
      setLockedSession(null);
      setIdleWarningSecondsLeft(null);
      setAccountSwitchAlert(null);
      resetWebUrlToRoot();
      setNotice('Signed out due to inactivity. Please sign in again.');
      setState('signedOut');
    });
    onSessionLocked((info) => {
      setUser(null);
      setOffline(false);
      setLockedSession(info);
      setIdleWarningSecondsLeft(null);
      setAccountSwitchAlert(null);
      setState('workstationLocked');
    });
    onSessionUnlocked((signedIn) => {
      setNotice(null);
      afterSignIn(signedIn);
    });
    const unsubscribe = subscribeSession((snapshot) => {
      setOffline(snapshot.offline);
      if (snapshot.user) {
        if (
          (stateRef.current === 'signedIn' || stateRef.current === 'mustChangePassword') &&
          userRef.current &&
          userRef.current.id !== snapshot.user.id
        ) {
          setAccountSwitchAlert({
            previousUser: userRef.current,
            currentUser: snapshot.user,
          });
        }
        setUser(snapshot.user);
        if ((stateRef.current === 'signedOut' || stateRef.current === 'workstationLocked') && !getLockedSession()) {
          setNotice(null);
          setLockedSession(null);
          setIdleWarningSecondsLeft(null);
          setState(snapshot.user.mustChangePassword ? 'mustChangePassword' : 'signedIn');
        }
      } else if (stateRef.current === 'signedIn' || stateRef.current === 'mustChangePassword') {
        setUser(null);
        setOffline(false);
        setIdleWarningSecondsLeft(null);
        setAccountSwitchAlert(null);
        if (!getLockedSession()) {
          setState('signedOut');
        }
      }
    });
    return () => {
      onSessionExpired(null);
      onSessionIdleExpired(null);
      onSessionLocked(null);
      onSessionUnlocked(null);
      unsubscribe();
    };
  }, [afterSignIn]);

  // Web workstation inactivity pre-lock warning + auto-lock synchronized across browser tabs.
  useEffect(() => {
    if (Platform?.OS !== 'web' || (state !== 'signedIn' && state !== 'mustChangePassword')) {
      setIdleWarningSecondsLeft(null);
      idleMonitorRef.current = null;
      return undefined;
    }
    const configuredMinutes = user?.sessionPolicy?.idleLockMinutes;
    const timeoutMinutes =
      typeof configuredMinutes === 'number' && Number.isFinite(configuredMinutes) && configuredMinutes >= 0
        ? configuredMinutes
        : getWebIdleTimeoutMinutes();
    if (timeoutMinutes <= 0) {
      setIdleWarningSecondsLeft(null);
      idleMonitorRef.current = null;
      return undefined;
    }

    const monitor = createWebIdleMonitor({
      timeoutMs: timeoutMinutes * 60_000,
      warningMs: DEFAULT_WEB_IDLE_WARNING_SECONDS * 1000,
      isBusy: isActiveSessionBusy,
      onActivityBroadcast: broadcastActivity,
      onIdleWarning: (remainingMs) => {
        setIdleWarningSecondsLeft(Math.max(1, Math.ceil(remainingMs / 1000)));
      },
      onWarningCleared: () => {
        setIdleWarningSecondsLeft(null);
      },
      onIdleTimeout: () => {
        setIdleWarningSecondsLeft(null);
        void lockSessionRequest();
      },
    });
    idleMonitorRef.current = monitor;
    const unsubRemote = subscribeRemoteActivity((ts) => {
      monitor.recordActivity(ts, true);
    });
    monitor.start();

    return () => {
      unsubRemote();
      monitor.stop();
      if (idleMonitorRef.current === monitor) {
        idleMonitorRef.current = null;
      }
      setIdleWarningSecondsLeft(null);
    };
  }, [state, user?.sessionPolicy?.idleLockMinutes]);

  // Enforce hard session expiry after MaxLockedSessionHours while waiting on the lock screen.
  useEffect(() => {
    if (state !== 'workstationLocked' || !lockedSession?.lockExpiresAtUtc) {
      return undefined;
    }
    const expiresAtMs = Date.parse(lockedSession.lockExpiresAtUtc);
    if (!Number.isFinite(expiresAtMs)) return undefined;

    const checkExpiry = () => {
      if (Date.now() >= expiresAtMs) {
        void idleLogout();
      }
    };

    checkExpiry();
    const timer = setInterval(checkExpiry, LOCK_EXPIRY_CHECK_MS);
    return () => clearInterval(timer);
  }, [state, lockedSession?.lockExpiresAtUtc]);

  // While working on a cached session, keep trying to reach the server so the device resumes normal operation.
  // Pauses when backgrounded to prevent wake locks and battery drain.
  useEffect(() => {
    if (!offline || state !== 'signedIn') return undefined;
    let timer: ReturnType<typeof setInterval> | null = null;
    let isAppActive = (AppState?.currentState ?? 'active') === 'active';

    const startTimer = () => {
      if (timer) clearInterval(timer);
      timer = setInterval(() => {
        if (isAppActive) {
          resumeOnline();
        }
      }, OFFLINE_RETRY_MS);
    };

    const stopTimer = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };

    const handleAppState = (nextState: AppStateStatus) => {
      isAppActive = nextState === 'active';
      if (isAppActive) {
        resumeOnline();
        startTimer();
      } else {
        stopTimer();
      }
    };

    const appStateSub = AppState?.addEventListener
      ? AppState.addEventListener('change', handleAppState)
      : { remove: () => {} };

    if (isAppActive) {
      startTimer();
    }

    return () => {
      stopTimer();
      appStateSub?.remove?.();
    };
  }, [offline, state]);

  const login = useCallback(
    async (email: string, password: string) => {
      const [signedIn, error] = await loginRequest(email, password);
      if (error || !signedIn) return error?.message ?? 'Sign-in failed.';
      setNotice(null);
      afterSignIn(signedIn);
      return null;
    },
    [afterSignIn],
  );

  const bootstrap = useCallback(
    async (input: BootstrapInput) => {
      const [signedIn, error] = await bootstrapAdmin(input);
      if (error || !signedIn) {
        return error?.errors?.length ? error.errors.map((e) => e.message).join(' ') : (error?.message ?? 'Setup failed.');
      }
      setNotice(null);
      afterSignIn(signedIn);
      return null;
    },
    [afterSignIn],
  );

  const recoverAdmin = useCallback(
    async (input: AdminRecoveryInput) => {
      const [signedIn, error] = await recoverAdminRequest(input);
      if (error || !signedIn) {
        return error?.errors?.length
          ? error.errors.map((e) => e.message).join(' ')
          : (error?.message ?? 'Recovery failed.');
      }
      setNotice(null);
      afterSignIn(signedIn);
      return null;
    },
    [afterSignIn],
  );

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      const [updated, error] = await changePasswordRequest(currentPassword, newPassword);
      if (error || !updated) {
        return error?.errors?.length ? error.errors.map((e) => e.message).join(' ') : (error?.message ?? 'Could not change the password.');
      }
      afterSignIn(updated);
      return null;
    },
    [afterSignIn],
  );

  const completeUnlock = useCallback(() => {
    setState('signedIn');
  }, []);

  const extendIdleSession = useCallback(() => {
    setIdleWarningSecondsLeft(null);
    idleMonitorRef.current?.extendSession();
  }, []);

  const lockWorkstation = useCallback(async () => {
    setIdleWarningSecondsLeft(null);
    await lockSessionRequest();
  }, []);

  const unlockWithPin = useCallback(
    async (pin: string) => {
      const [signedIn, error] = await unlockWithPinRequest(pin);
      if (error || !signedIn) {
        return error?.message ?? 'Could not unlock workstation.';
      }
      setNotice(null);
      afterSignIn(signedIn);
      return null;
    },
    [afterSignIn],
  );

  const unlockWithPassword = useCallback(
    async (password: string) => {
      const [signedIn, error] = await unlockWithPasswordRequest(password);
      if (error || !signedIn) {
        return error?.message ?? 'Incorrect password.';
      }
      setNotice(null);
      afterSignIn(signedIn);
      return null;
    },
    [afterSignIn],
  );

  const setQuickUnlockPin = useCallback(async (currentPassword: string, pin: string) => {
    const [updated, error] = await setQuickUnlockPinRequest(currentPassword, pin);
    if (error || !updated) {
      return error?.message ?? 'Could not save quick-unlock PIN.';
    }
    setUser(updated);
    return null;
  }, []);

  const removeQuickUnlockPin = useCallback(async (currentPassword: string) => {
    const [updated, error] = await removeQuickUnlockPinRequest(currentPassword);
    if (error || !updated) {
      return error?.message ?? 'Could not remove quick-unlock PIN.';
    }
    setUser(updated);
    return null;
  }, []);

  const updateSessionPolicy = useCallback((policy: SessionPolicy) => {
    updateSessionPolicyStore(policy);
  }, []);

  const acknowledgeAccountSwitch = useCallback(() => {
    setAccountSwitchAlert(null);
  }, []);

  const useDifferentAccount = useCallback(async () => {
    await discardLocalSession();
    resetWebUrlToRoot();
    setAccountSwitchAlert(null);
    setLockedSession(null);
    setIdleWarningSecondsLeft(null);
    setUser(null);
    setOffline(false);
    setBootNonce((n) => n + 1);
  }, []);

  const logout = useCallback(async () => {
    await logoutRequest();
    resetWebUrlToRoot();
    setAccountSwitchAlert(null);
    setLockedSession(null);
    setIdleWarningSecondsLeft(null);
    setUser(null);
    setOffline(false);
    setNotice(null);
    setBootNonce((n) => n + 1);
  }, []);

  const switchStaffAccount = useCallback(async () => {
    await logout();
  }, [logout]);

  const retry = useCallback(() => setBootNonce((n) => n + 1), []);

  const permissions = useMemo(() => user?.permissions ?? [], [user]);
  const can = useCallback((permission: string) => hasPermission(permissions, permission), [permissions]);

  const value = useMemo<AuthContextValue>(
    () => ({
      state,
      user,
      permissions,
      offline,
      lockedSession,
      idleWarningSecondsLeft,
      notice,
      accountSwitchAlert,
      acknowledgeAccountSwitch,
      login,
      bootstrap,
      recoverAdmin,
      changePassword,
      completeUnlock,
      extendIdleSession,
      lockWorkstation,
      unlockWithPin,
      unlockWithPassword,
      setQuickUnlockPin,
      removeQuickUnlockPin,
      updateSessionPolicy,
      switchStaffAccount,
      useDifferentAccount,
      logout,
      retry,
      can,
    }),
    [
      state,
      user,
      permissions,
      offline,
      lockedSession,
      idleWarningSecondsLeft,
      notice,
      accountSwitchAlert,
      acknowledgeAccountSwitch,
      login,
      bootstrap,
      recoverAdmin,
      changePassword,
      completeUnlock,
      extendIdleSession,
      lockWorkstation,
      unlockWithPin,
      unlockWithPassword,
      setQuickUnlockPin,
      removeQuickUnlockPin,
      updateSessionPolicy,
      switchStaffAccount,
      useDifferentAccount,
      logout,
      retry,
      can,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

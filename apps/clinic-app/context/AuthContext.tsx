import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { type AppStateStatus } from 'react-native';
import * as ReactNative from 'react-native';

const AppState = (ReactNative as any).AppState ?? (ReactNative as any).default?.AppState;
import {
  AuthUser,
  BootstrapInput,
  bootstrapAdmin,
  changePassword as changePasswordRequest,
  discardLocalSession,
  getAuthStatus,
  hasPermission,
  login as loginRequest,
  logout as logoutRequest,
  onSessionExpired,
  restoreSession,
  resumeOnline,
  subscribeSession,
} from '../services/authSession';
import { isUnlockConfigured } from '../services/offlineUnlock';

/**
 * Where the signed-in experience stands:
 *  - booting            restoring a previous session / asking the server what it needs
 *  - unreachable        no session and the clinic server cannot be reached
 *  - signedOut          email + password
 *  - needsBootstrap     fresh facility, no administrator yet
 *  - locked             native device offline with a cached session: PIN / biometric
 *  - mustChangePassword temporary password must be replaced before continuing
 *  - signedIn           normal operation (possibly `offline` on native)
 */
export type AuthState =
  | 'booting'
  | 'unreachable'
  | 'signedOut'
  | 'needsBootstrap'
  | 'locked'
  | 'mustChangePassword'
  | 'signedIn';

export interface AuthContextValue {
  state: AuthState;
  user: AuthUser | null;
  permissions: string[];
  /** Native only: the cached session is in use because the clinic server cannot be reached. */
  offline: boolean;
  /** Notice shown on the sign-in screen (e.g. the session ended). */
  notice: string | null;
  /** Resolves to an error message, or `null` on success. */
  login: (email: string, password: string) => Promise<string | null>;
  bootstrap: (input: BootstrapInput) => Promise<string | null>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<string | null>;
  /** Called by the unlock screen once the PIN / biometric check passed. */
  completeUnlock: () => void;
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
  notice: null,
  login: noop,
  bootstrap: noop,
  changePassword: noop,
  completeUnlock: () => {},
  useDifferentAccount: async () => {},
  logout: async () => {},
  retry: () => {},
  can: () => false,
});

export const useAuth = () => useContext(AuthContext);

/** True when the signed-in staff member holds `permission` (always false while signed out). */
export function usePermission(permission: string): boolean {
  const { permissions } = useAuth();
  return hasPermission(permissions, permission);
}

const OFFLINE_RETRY_MS = 30_000;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>('booting');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [offline, setOffline] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [bootNonce, setBootNonce] = useState(0);
  const stateRef = useRef(state);
  stateRef.current = state;

  const afterSignIn = useCallback((signedIn: AuthUser) => {
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

  // The server rejected the refresh token (revoked, expired, deactivated): back to the sign-in screen.
  useEffect(() => {
    onSessionExpired(() => {
      setUser(null);
      setOffline(false);
      setNotice('Your session has ended. Please sign in again.');
      setState('signedOut');
    });
    const unsubscribe = subscribeSession((snapshot) => {
      setOffline(snapshot.offline);
      if (snapshot.user && stateRef.current === 'signedIn') setUser(snapshot.user);
    });
    return () => {
      onSessionExpired(null);
      unsubscribe();
    };
  }, []);

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

  const useDifferentAccount = useCallback(async () => {
    await discardLocalSession();
    setUser(null);
    setOffline(false);
    setBootNonce((n) => n + 1);
  }, []);

  const logout = useCallback(async () => {
    await logoutRequest();
    setUser(null);
    setOffline(false);
    setNotice(null);
    setBootNonce((n) => n + 1);
  }, []);

  const retry = useCallback(() => setBootNonce((n) => n + 1), []);

  const permissions = useMemo(() => user?.permissions ?? [], [user]);
  const can = useCallback((permission: string) => hasPermission(permissions, permission), [permissions]);

  const value = useMemo<AuthContextValue>(
    () => ({
      state,
      user,
      permissions,
      offline,
      notice,
      login,
      bootstrap,
      changePassword,
      completeUnlock,
      useDifferentAccount,
      logout,
      retry,
      can,
    }),
    [state, user, permissions, offline, notice, login, bootstrap, changePassword, completeUnlock, useDifferentAccount, logout, retry, can],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

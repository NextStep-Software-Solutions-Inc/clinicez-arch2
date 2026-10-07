import { createContext, useCallback, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useAuth as useClerkAuth, useClerk, useUser } from '@clerk/expo';
import { storage as SecureStore } from '../utils/storage';
import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';
import { getPatientByClerkId, createPatient } from '../services/api/patientApi';
import { upsertPatientSummary } from '../db/hydrate';

const PIN_KEY = 'app_pin';
const HAS_PIN_KEY = 'has_pin';
const BIOMETRICS_ENABLED_KEY = 'biometrics_enabled';
const LOCK_TIMEOUT_KEY = 'lock_timeout';
const INTERNAL_PATIENT_ID_KEY = 'internal_patient_id';
const DEFAULT_LOCK_TIMEOUT_MS = 30_000;
const WEB_IDLE_TIMEOUT_MS = 15 * 60 * 1000; // 15 min default idle timeout on web

interface AuthContextType {
  isAuthenticated: boolean;
  isLocked: boolean;
  hasPIN: boolean;
  biometricsEnabled: boolean;
  lockTimeout: number;
  isLoading: boolean;
  internalPatientId: string | null;
  getToken: () => Promise<string | null>;
  logout: () => Promise<void>;
  lock: () => void;
  unlock: () => void;
  runWithAutoLockPaused: <T>(task: () => Promise<T>) => Promise<T>;
  savePin: (pin: string) => Promise<void>;
  verifyPin: (pin: string) => Promise<boolean>;
  setBiometricsEnabled: (enabled: boolean) => Promise<void>;
  setLockTimeout: (ms: number) => Promise<void>;
  authenticateWithBiometrics: () => Promise<'success' | 'fallback' | 'error'>;
  userId: string | null;
  showUserNotFoundAlert: boolean;
  setShowUserNotFoundAlert: (show: boolean) => void;
  verificationError: Error | null;
  retryVerification: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const { isSignedIn, userId, getToken } = useClerkAuth();
  const { user } = useUser();
  const { signOut } = useClerk();
  const [hasPIN, setHasPIN] = useState(false);
  const [biometricsEnabled, setBiometricsEnabledState] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [lockTimeout, setLockTimeoutState] = useState(DEFAULT_LOCK_TIMEOUT_MS);
  const [isLoading, setIsLoading] = useState(true);
  const [internalPatientId, setInternalPatientId] = useState<string | null>(null);
  const [showUserNotFoundAlert, setShowUserNotFoundAlert] = useState(false);
  const [verificationError, setVerificationError] = useState<Error | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const isVerifying = !!(isSignedIn && !internalPatientId);
  const lockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const autoLockPauseDepthRef = useRef(0);

  const getTokenRef = useRef(getToken);
  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  const retryVerification = useCallback(() => {
    setVerificationError(null);
    setRetryCount((prev) => prev + 1);
  }, []);

  const clearLockTimer = useCallback(() => {
    if (lockTimerRef.current) {
      clearTimeout(lockTimerRef.current);
      lockTimerRef.current = null;
    }
  }, []);

  const scheduleLock = useCallback(() => {
    clearLockTimer();

    if (!hasPIN || lockTimeout < 0 || autoLockPauseDepthRef.current > 0) return;

    if (lockTimeout === 0) {
      setIsLocked(true);
      return;
    }

    lockTimerRef.current = setTimeout(() => {
      setIsLocked(true);
    }, lockTimeout);
  }, [clearLockTimer, hasPIN, lockTimeout]);

  // Hydrate PIN and biometrics state from secure store on mount
  useEffect(() => {
    const hydrate = async () => {
      const [storedHasPIN, storedBiometrics, storedTimeout, storedInternalId] = await Promise.all([
        SecureStore.getItemAsync(HAS_PIN_KEY),
        SecureStore.getItemAsync(BIOMETRICS_ENABLED_KEY),
        SecureStore.getItemAsync(LOCK_TIMEOUT_KEY),
        SecureStore.getItemAsync(INTERNAL_PATIENT_ID_KEY),
      ]);
      const pinSet = storedHasPIN === 'true';
      setHasPIN(pinSet);
      setBiometricsEnabledState(storedBiometrics === 'true');
      if (storedTimeout !== null) {
        const parsed = parseInt(storedTimeout, 10);
        if (!isNaN(parsed)) setLockTimeoutState(parsed);
      }
      if (storedInternalId) {
        setInternalPatientId(storedInternalId);
      }
      // Only lock if PIN is already set (returning user); fresh installs start unlocked.
      // On web, do not lock on page reload.
      setIsLocked(Platform.OS === 'web' ? false : pinSet);
      setIsLoading(false);
    };
    hydrate();
  }, []);

  // Effect to verify user existence in the backend DB and retrieve their internal patient ID
  useEffect(() => {
    const verifyUser = async () => {
      if (isSignedIn && userId) {
        try {
          setVerificationError(null);
          const storedId = await SecureStore.getItemAsync(INTERNAL_PATIENT_ID_KEY);
          if (storedId) {
            setInternalPatientId(storedId);
            return;
          }

          let patient = await getPatientByClerkId(getTokenRef.current, userId);

          // JIT Auto-Provisioning: If Clerk authenticated user is missing from DB, create profile automatically
          if (!patient || !patient.id) {
            try {
              const userEmail = user?.primaryEmailAddress?.emailAddress;
              const newPatientId = await createPatient(getTokenRef.current, {
                clerkUserId: userId,
                firstName: user?.firstName?.trim() || userEmail || 'User',
                lastName: user?.lastName?.trim() || '',
                nationality: 'Filipino',
              });

              if (newPatientId) {
                patient = await getPatientByClerkId(getTokenRef.current, userId);
              }
            } catch (provisionErr) {
              console.error('[AuthContext] JIT auto-provisioning failed:', provisionErr);
            }
          }

          if (patient && patient.id) {
            await SecureStore.setItemAsync(INTERNAL_PATIENT_ID_KEY, patient.id);
            setInternalPatientId(patient.id);
            // Persist demographics to local SQLite so the app can show real
            // profile data immediately without waiting for the full-record fetch.
            upsertPatientSummary(patient).catch((err) =>
              console.warn('[AuthContext] Failed to cache patient summary:', err)
            );
          } else {
            setShowUserNotFoundAlert(true);
          }
        } catch (err) {
          console.error('[AuthContext] Error verifying user in backend:', err);
          setVerificationError(err as Error);
        }
      } else {
        setInternalPatientId(null);
        setVerificationError(null);
        await SecureStore.deleteItemAsync(INTERNAL_PATIENT_ID_KEY).catch(() => {});
      }
    };

    verifyUser();
  }, [isSignedIn, userId, retryCount, user]);

  // Lock only after real background time. Native pickers can briefly move the app
  // through inactive/background while the user is still completing an in-app action.
  // On web, do NOT lock on tab blur or backgrounding; web uses idle timeout policy below.
  useEffect(() => {
    if (Platform.OS === 'web') return;

    const handleAppStateChange = (nextState: AppStateStatus) => {
      appStateRef.current = nextState;

      if (nextState === 'background') {
        scheduleLock();
      } else if (nextState === 'active') {
        clearLockTimer();
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      subscription.remove();
      clearLockTimer();
    };
  }, [clearLockTimer, scheduleLock]);

  // Web idle lock policy: locks after 15 min of no pointer/keyboard activity or on explicit lock.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (typeof window === 'undefined') return;

    let webIdleTimer: ReturnType<typeof setTimeout> | null = null;

    const resetIdleTimer = () => {
      if (webIdleTimer) {
        clearTimeout(webIdleTimer);
      }
      if (!hasPIN || !isSignedIn) return;

      webIdleTimer = setTimeout(() => {
        setIsLocked(true);
      }, WEB_IDLE_TIMEOUT_MS);
    };

    resetIdleTimer();

    const activityEvents = ['pointerdown', 'keydown', 'mousemove', 'wheel', 'touchstart', 'scroll'];
    const handleActivity = () => {
      resetIdleTimer();
    };

    activityEvents.forEach((event) => {
      window.addEventListener(event, handleActivity, { passive: true });
    });

    return () => {
      if (webIdleTimer) clearTimeout(webIdleTimer);
      activityEvents.forEach((event) => {
        window.removeEventListener(event, handleActivity);
      });
    };
  }, [hasPIN, isSignedIn]);



  const logout = async () => {
    await signOut();
    setIsLocked(false);
    setInternalPatientId(null);
    setVerificationError(null);
    await SecureStore.deleteItemAsync(INTERNAL_PATIENT_ID_KEY).catch(() => {});
  };

  const lock = () => setIsLocked(true);
  const unlock = () => setIsLocked(false);

  const runWithAutoLockPaused = useCallback(async <T,>(task: () => Promise<T>): Promise<T> => {
    autoLockPauseDepthRef.current += 1;
    clearLockTimer();

    try {
      return await task();
    } finally {
      autoLockPauseDepthRef.current = Math.max(0, autoLockPauseDepthRef.current - 1);

      if (autoLockPauseDepthRef.current === 0 && appStateRef.current === 'background') {
        scheduleLock();
      }
    }
  }, [clearLockTimer, scheduleLock]);

  const savePin = async (pin: string) => {
    await Promise.all([
      SecureStore.setItemAsync(PIN_KEY, pin),
      SecureStore.setItemAsync(HAS_PIN_KEY, 'true'),
    ]);
    setHasPIN(true);
    setIsLocked(false);
  };

  const verifyPin = async (pin: string): Promise<boolean> => {
    const stored = await SecureStore.getItemAsync(PIN_KEY);
    if (stored === pin) {
      setIsLocked(false);
      return true;
    }
    return false;
  };

  const setBiometricsEnabled = async (enabled: boolean) => {
    await SecureStore.setItemAsync(BIOMETRICS_ENABLED_KEY, enabled ? 'true' : 'false');
    setBiometricsEnabledState(enabled);
  };

  const setLockTimeout = async (ms: number) => {
    await SecureStore.setItemAsync(LOCK_TIMEOUT_KEY, String(ms));
    setLockTimeoutState(ms);
  };

  const authenticateWithBiometrics = async (): Promise<'success' | 'fallback' | 'error'> => {
    if (Platform.OS === 'web') {
      return 'fallback';
    }
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock Clinic EZ',
        fallbackLabel: 'Use PIN',
        disableDeviceFallback: true,
      });
      if (result.success) {
        setIsLocked(false);
        return 'success';
      }
      if (result.error === 'user_fallback' || result.error === 'system_cancel') {
        return 'fallback';
      }
      return 'error';
    } catch {
      return 'error';
    }
  };

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated: isSignedIn ?? false,
        isLocked,
        hasPIN,
        biometricsEnabled,
        lockTimeout,
        isLoading: isLoading || isVerifying,
        internalPatientId,
        getToken,
        logout,
        lock,
        unlock,
        runWithAutoLockPaused,
        savePin,
        verifyPin,
        setBiometricsEnabled,
        setLockTimeout,
        authenticateWithBiometrics,
        userId: userId ?? null,
        showUserNotFoundAlert,
        setShowUserNotFoundAlert,
        verificationError,
        retryVerification,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};


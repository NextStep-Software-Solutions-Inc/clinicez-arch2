import { createContext, useCallback, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useAuth as useClerkAuth, useClerk } from '@clerk/expo';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import { getPatientByClerkId } from '../services/api/patientApi';
import CustomAlertModal from '../components/ui/CustomAlertModal';

const PIN_KEY = 'app_pin';
const HAS_PIN_KEY = 'has_pin';
const BIOMETRICS_ENABLED_KEY = 'biometrics_enabled';
const LOCK_TIMEOUT_KEY = 'lock_timeout';
const INTERNAL_PATIENT_ID_KEY = 'internal_patient_id';
const DEFAULT_LOCK_TIMEOUT_MS = 30_000;

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
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const { isSignedIn, userId, getToken } = useClerkAuth();
  const { signOut } = useClerk();
  const [hasPIN, setHasPIN] = useState(false);
  const [biometricsEnabled, setBiometricsEnabledState] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [lockTimeout, setLockTimeoutState] = useState(DEFAULT_LOCK_TIMEOUT_MS);
  const [isLoading, setIsLoading] = useState(true);
  const [internalPatientId, setInternalPatientId] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [showUserNotFoundAlert, setShowUserNotFoundAlert] = useState(false);
  const lockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const autoLockPauseDepthRef = useRef(0);

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
      // Only lock if PIN is already set (returning user); fresh installs start unlocked
      setIsLocked(pinSet);
      setIsLoading(false);
    };
    hydrate();
  }, []);

  // Effect to verify user existence in the backend DB and retrieve their internal patient ID
  useEffect(() => {
    const verifyUser = async () => {
      if (isSignedIn && userId) {
        setIsVerifying(true);
        try {
          const storedId = await SecureStore.getItemAsync(INTERNAL_PATIENT_ID_KEY);
          if (storedId) {
            setInternalPatientId(storedId);
            setIsVerifying(false);
            return;
          }

          const patient = await getPatientByClerkId(getToken, userId);
          if (patient && patient.id) {
            await SecureStore.setItemAsync(INTERNAL_PATIENT_ID_KEY, patient.id);
            setInternalPatientId(patient.id);
          } else {
            setShowUserNotFoundAlert(true);
          }
        } catch (err) {
          console.error('[AuthContext] Error verifying user in backend:', err);
        } finally {
          setIsVerifying(false);
        }
      } else {
        setInternalPatientId(null);
        await SecureStore.deleteItemAsync(INTERNAL_PATIENT_ID_KEY).catch(() => {});
      }
    };

    verifyUser();
  }, [isSignedIn, userId, getToken]);

  // Lock only after real background time. Native pickers can briefly move the app
  // through inactive/background while the user is still completing an in-app action.
  useEffect(() => {
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



  const logout = async () => {
    await signOut();
    setIsLocked(false);
    setInternalPatientId(null);
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
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock ClinicEZ',
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


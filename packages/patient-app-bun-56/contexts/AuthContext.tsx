import { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useAuth as useClerkAuth, useClerk } from '@clerk/expo';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';

const PIN_KEY = 'app_pin';
const HAS_PIN_KEY = 'has_pin';
const BIOMETRICS_ENABLED_KEY = 'biometrics_enabled';
const LOCK_TIMEOUT_KEY = 'lock_timeout';
const DEFAULT_LOCK_TIMEOUT_MS = 30_000;

interface AuthContextType {
  isAuthenticated: boolean;
  isLocked: boolean;
  hasPIN: boolean;
  biometricsEnabled: boolean;
  lockTimeout: number;
  isLoading: boolean;
  logout: () => Promise<void>;
  lock: () => void;
  unlock: () => void;
  savePin: (pin: string) => Promise<void>;
  verifyPin: (pin: string) => Promise<boolean>;
  setBiometricsEnabled: (enabled: boolean) => Promise<void>;
  setLockTimeout: (ms: number) => Promise<void>;
  authenticateWithBiometrics: () => Promise<'success' | 'fallback' | 'error'>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const { isSignedIn } = useClerkAuth();
  const { signOut } = useClerk();
  const [hasPIN, setHasPIN] = useState(false);
  const [biometricsEnabled, setBiometricsEnabledState] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [lockTimeout, setLockTimeoutState] = useState(DEFAULT_LOCK_TIMEOUT_MS);
  const [isLoading, setIsLoading] = useState(true);
  const lockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hydrate PIN and biometrics state from secure store on mount
  useEffect(() => {
    const hydrate = async () => {
      const [storedHasPIN, storedBiometrics, storedTimeout] = await Promise.all([
        SecureStore.getItemAsync(HAS_PIN_KEY),
        SecureStore.getItemAsync(BIOMETRICS_ENABLED_KEY),
        SecureStore.getItemAsync(LOCK_TIMEOUT_KEY),
      ]);
      const pinSet = storedHasPIN === 'true';
      setHasPIN(pinSet);
      setBiometricsEnabledState(storedBiometrics === 'true');
      if (storedTimeout !== null) {
        const parsed = parseInt(storedTimeout, 10);
        if (!isNaN(parsed)) setLockTimeoutState(parsed);
      }
      // Only lock if PIN is already set (returning user); fresh installs start unlocked
      setIsLocked(pinSet);
      setIsLoading(false);
    };
    hydrate();
  }, []);

  // AppState listener: lock after 30s in background
  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'background' || nextState === 'inactive') {
        if (hasPIN && lockTimeout > 0) {
          lockTimerRef.current = setTimeout(() => {
            setIsLocked(true);
          }, lockTimeout);
        } else if (hasPIN && lockTimeout === 0) {
          setIsLocked(true);
        }
      } else if (nextState === 'active') {
        if (lockTimerRef.current) {
          clearTimeout(lockTimerRef.current);
          lockTimerRef.current = null;
        }
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      subscription.remove();
      if (lockTimerRef.current) clearTimeout(lockTimerRef.current);
    };
  }, [hasPIN, lockTimeout]);

  const logout = async () => {
    await signOut();
    setIsLocked(false);
  };

  const lock = () => setIsLocked(true);
  const unlock = () => setIsLocked(false);

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
        isLoading,
        logout,
        lock,
        unlock,
        savePin,
        verifyPin,
        setBiometricsEnabled,
        setLockTimeout,
        authenticateWithBiometrics,
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


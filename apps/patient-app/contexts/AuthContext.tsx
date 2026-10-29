import { createContext, useCallback, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import { useAuth as useClerkAuth, useClerk, useUser } from '@clerk/expo';
import * as Crypto from 'expo-crypto';
import CryptoJS from 'crypto-js';
import { storage as SecureStore } from '../utils/storage';
import * as LocalAuthentication from 'expo-local-authentication';
import { getPatientByClerkId, createPatient } from '../services/api/patientApi';
import { hasFileApi } from '../services/api/filesApi';
import { upsertPatientSummary } from '../db/hydrate';
import { clearWebDatabaseSnapshot } from '../db/index';
import { clearAllData } from '../db/seedDemoData';
import { blobStorage } from '../services/storage';
import { refreshDocumentTypes } from '../services/files/filesShared';
import { refreshOrganizationsFromApi, refreshClinicsFromApi } from '../services/discovery/discoveryService';
import { pullDocumentChanges } from '../services/sync/documentsSyncService';

const PIN_KEY = 'app_pin';
const PIN_SALT_KEY = 'app_pin_salt';
const HAS_PIN_KEY = 'has_pin';
const BIOMETRICS_ENABLED_KEY = 'biometrics_enabled';
const LOCK_TIMEOUT_KEY = 'lock_timeout';
const INTERNAL_PATIENT_ID_KEY = 'internal_patient_id';
const BOOTSTRAP_COMPLETE_KEY = 'app_bootstrap_complete';
const DEFAULT_LOCK_TIMEOUT_MS = 30_000;
const WEB_IDLE_TIMEOUT_MS = 15 * 60 * 1000; // 15 min default idle timeout on web
const PBKDF2_ITERATIONS = 10_000;

/**
 * Constant-time string equality to prevent timing side-channel attacks
 */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Generates a 128-bit (16-byte) cryptographically secure random salt in hex format
 */
function generateSaltHex(): string {
  const bytes = Crypto.getRandomBytes(16);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Derives a 256-bit key from PIN and salt using PBKDF2 with HMAC-SHA256
 */
async function deriveKeyPbkdf2(
  pin: string,
  saltHex: string,
  iterations: number = PBKDF2_ITERATIONS
): Promise<string> {
  // Fast path: Web Crypto API in browser / Node / Bun
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.subtle?.deriveBits) {
    try {
      const enc = new TextEncoder();
      const keyMaterial = await globalThis.crypto.subtle.importKey(
        'raw',
        enc.encode(pin),
        { name: 'PBKDF2' },
        false,
        ['deriveBits']
      );
      const saltBytes = new Uint8Array(
        saltHex.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || []
      );
      const derivedBits = await globalThis.crypto.subtle.deriveBits(
        {
          name: 'PBKDF2',
          salt: saltBytes,
          iterations,
          hash: 'SHA-256',
        },
        keyMaterial,
        256
      );
      return Array.from(new Uint8Array(derivedBits))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    } catch {
      // Fallback to CryptoJS if WebCrypto fails or is unavailable
    }
  }

  // Pure-JS path: Works in React Native Hermes & JSC without native bindings
  const salt = CryptoJS.enc.Hex.parse(saltHex);
  const derived = CryptoJS.PBKDF2(pin, salt, {
    keySize: 256 / 32,
    iterations,
    hasher: CryptoJS.algo.SHA256,
  });
  return derived.toString(CryptoJS.enc.Hex);
}

async function hashPinWithSalt(pin: string, saltHex: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${saltHex}:${pin}`);
}

interface AuthContextType {
  isAuthenticated: boolean;
  isLocked: boolean;
  hasPIN: boolean;
  biometricsEnabled: boolean;
  lockTimeout: number;
  isLoading: boolean;
  isInitialized: boolean;
  internalPatientId: string | null;
  clerkSessionId: string | null;
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
  const { isSignedIn, userId, sessionId, getToken } = useClerkAuth();
  const { user } = useUser();
  const { signOut } = useClerk();
  const [hasPIN, setHasPIN] = useState(false);
  const [biometricsEnabled, setBiometricsEnabledState] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [lockTimeout, setLockTimeoutState] = useState(DEFAULT_LOCK_TIMEOUT_MS);
  const [isLoading, setIsLoading] = useState(true);
  const [isInitialized, setIsInitialized] = useState(false);
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

  // Hydrate PIN, biometrics, session, and bootstrap state from secure store on mount
  useEffect(() => {
    const hydrate = async () => {
      const [storedHasPIN, storedBiometrics, storedTimeout, storedInternalId, storedBootstrap] =
        await Promise.all([
          SecureStore.getItemAsync(HAS_PIN_KEY),
          SecureStore.getItemAsync(BIOMETRICS_ENABLED_KEY),
          SecureStore.getItemAsync(LOCK_TIMEOUT_KEY),
          SecureStore.getItemAsync(INTERNAL_PATIENT_ID_KEY),
          SecureStore.getItemAsync(BOOTSTRAP_COMPLETE_KEY),
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
      setIsInitialized(storedBootstrap === 'true');
      // Enforce PIN lock on cold boot / reload across BOTH Native and Web
      setIsLocked(pinSet);
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
          const [storedId, storedBootstrap] = await Promise.all([
            SecureStore.getItemAsync(INTERNAL_PATIENT_ID_KEY),
            SecureStore.getItemAsync(BOOTSTRAP_COMPLETE_KEY),
          ]);

          if (storedId) {
            setInternalPatientId(storedId);
            if (storedBootstrap === 'true') {
              setIsInitialized(true);
              // Non-blocking background sync of profile and documents when online
              getPatientByClerkId(getTokenRef.current, userId)
                .then((patient) => {
                  if (patient?.id) {
                    return upsertPatientSummary(patient, userId);
                  }
                })
                .catch((err) =>
                  console.warn('[AuthContext] Background refresh of patient summary failed:', err)
                );
              pullDocumentChanges(storedId, getTokenRef.current).catch((err) =>
                console.warn('[AuthContext] Background document pull failed:', err)
              );
              return;
            }
          }

          let patient = await getPatientByClerkId(getTokenRef.current, userId);

          // JIT Auto-Provisioning: If Clerk authenticated user is missing from DB, create profile automatically
          if (!patient || !patient.id) {
            try {
              const userEmail = user?.primaryEmailAddress?.emailAddress;
              const newPatientId = await createPatient(getTokenRef.current, {
                clerkUserId: userId,
                firstName: user?.firstName?.trim() || user?.fullName?.trim() || userEmail || 'Patient',
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
            // Mandatory online bootstrap configuration download:
            // Must succeed before marking the vault initialized on first boot or post-logout.
            await refreshDocumentTypes(patient.id, getTokenRef.current, {
              force: true,
              throwOnError: hasFileApi(),
            });

            await Promise.all([
              refreshOrganizationsFromApi(patient.id, '', getTokenRef.current).catch((err) =>
                console.warn('[AuthContext] Refresh orgs failed during bootstrap:', err)
              ),
              refreshClinicsFromApi(patient.id, '', undefined, getTokenRef.current).catch((err) =>
                console.warn('[AuthContext] Refresh clinics failed during bootstrap:', err)
              ),
            ]);

            await pullDocumentChanges(patient.id, getTokenRef.current).catch((err) =>
              console.warn('[AuthContext] Initial pull changes failed during bootstrap:', err)
            );

            // Persist demographics to local SQLite
            await upsertPatientSummary(patient, userId).catch((err) =>
              console.warn('[AuthContext] Failed to cache patient summary:', err)
            );

            await SecureStore.setItemAsync(INTERNAL_PATIENT_ID_KEY, patient.id);
            await SecureStore.setItemAsync(BOOTSTRAP_COMPLETE_KEY, 'true');
            setInternalPatientId(patient.id);
            setIsInitialized(true);
          } else {
            setShowUserNotFoundAlert(true);
          }
        } catch (err) {
          console.error('[AuthContext] Error verifying user in backend:', err);
          setVerificationError(err as Error);
        }
      } else {
        // When Clerk is NOT signed in (offline, initializing, or cold boot):
        // Retain internalPatientId if stored locally — NEVER delete!
        const [storedId, storedBootstrap] = await Promise.all([
          SecureStore.getItemAsync(INTERNAL_PATIENT_ID_KEY),
          SecureStore.getItemAsync(BOOTSTRAP_COMPLETE_KEY),
        ]);
        if (storedId) {
          setInternalPatientId(storedId);
          if (storedBootstrap === 'true') {
            setIsInitialized(true);
          }
        } else {
          setInternalPatientId(null);
          setIsInitialized(false);
        }
        setVerificationError(null);
      }
    };

    verifyUser();
  }, [isSignedIn, userId, retryCount, user]);

  // Lock only after real background time
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
      const isLocallyAuth = !!(internalPatientId && hasPIN);
      const isUserAuth = (isSignedIn ?? false) || isLocallyAuth;
      if (!hasPIN || !isUserAuth) return;

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
  }, [hasPIN, isSignedIn, internalPatientId]);

  const logout = async () => {
    // 1. Truncate all SQLite database tables & wipe Web IndexedDB snapshot
    await clearAllData().catch((err) => {
      console.warn('[AuthContext] Failed to wipe local SQLite data on logout:', err);
    });
    await clearWebDatabaseSnapshot().catch((err) => {
      console.warn('[AuthContext] Failed to wipe Web IndexedDB snapshot on logout:', err);
    });

    // 2. Wipe binary blob storage cache (Native disk & Web IndexedDB)
    await blobStorage.clearCache().catch((err) => {
      console.warn('[AuthContext] Failed to clear blob cache on logout:', err);
    });

    // 3. Delete all session, security, privacy, and cached Clerk token keys
    const keysToDelete = [
      INTERNAL_PATIENT_ID_KEY,
      PIN_KEY,
      PIN_SALT_KEY,
      HAS_PIN_KEY,
      BIOMETRICS_ENABLED_KEY,
      LOCK_TIMEOUT_KEY,
      BOOTSTRAP_COMPLETE_KEY,
      'privacy_hide_amounts',
      'privacy_blur_previews',
      'privacy_local_analytics',
      'privacy_hidden_ids',
      'push_token',
      'debug_force_yakap_registered',
      '__clerk_client_jwt',
    ];

    await Promise.all(keysToDelete.map((key) => SecureStore.deleteItemAsync(key).catch(() => {})));

    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
      keysToDelete.forEach((key) => {
        try {
          window.localStorage.removeItem(key);
        } catch {}
      });
      try {
        for (let i = window.localStorage.length - 1; i >= 0; i--) {
          const k = window.localStorage.key(i);
          if (k && k.startsWith('__clerk')) {
            window.localStorage.removeItem(k);
          }
        }
      } catch {}
    }

    // 4. Reset in-memory React state
    setHasPIN(false);
    setIsLocked(false);
    setInternalPatientId(null);
    setVerificationError(null);
    setIsInitialized(false);
    setBiometricsEnabledState(false);
    setShowUserNotFoundAlert(false);

    // 5. Gracefully sign out of Clerk (prevent crashes if offline)
    await signOut().catch((err) => {
      console.warn('[AuthContext] Clerk signOut network failure (offline logout handled gracefully):', err);
    });
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
    const saltHex = generateSaltHex();
    const derivedKeyHex = await deriveKeyPbkdf2(pin, saltHex, PBKDF2_ITERATIONS);
    const hashedPin = `${saltHex}:${derivedKeyHex}:${PBKDF2_ITERATIONS}`;
    await Promise.all([
      SecureStore.setItemAsync(PIN_SALT_KEY, saltHex),
      SecureStore.setItemAsync(PIN_KEY, hashedPin),
      SecureStore.setItemAsync(HAS_PIN_KEY, 'true'),
    ]);
    setHasPIN(true);
    setIsLocked(false);
  };

  const verifyPin = async (pin: string): Promise<boolean> => {
    const [stored, legacySalt] = await Promise.all([
      SecureStore.getItemAsync(PIN_KEY),
      SecureStore.getItemAsync(PIN_SALT_KEY),
    ]);
    if (!stored) {
      return false;
    }

    const parts = stored.split(':');

    // 1. Modern PBKDF2 format: saltHex:derivedKeyHex:iterations
    if (parts.length === 3) {
      const [saltHex, derivedKeyHex, iterStr] = parts;
      const iters = parseInt(iterStr, 10) || PBKDF2_ITERATIONS;
      const candidateKey = await deriveKeyPbkdf2(pin, saltHex, iters);
      if (constantTimeEqual(derivedKeyHex, candidateKey)) {
        setIsLocked(false);
        return true;
      }
      return false;
    }

    // 2. Legacy 2-part format: saltHex:sha256Hex
    if (parts.length === 2) {
      const [saltHex, sha256Hex] = parts;
      const candidateHash = await hashPinWithSalt(pin, saltHex);
      if (constantTimeEqual(sha256Hex, candidateHash)) {
        await savePin(pin); // Transparent upgrade to PBKDF2
        setIsLocked(false);
        return true;
      }
      return false;
    }

    // 3. Legacy separate keys: stored is SHA-256 and legacySalt is present
    if (legacySalt) {
      const candidateHash = await hashPinWithSalt(pin, legacySalt);
      if (constantTimeEqual(stored, candidateHash)) {
        await savePin(pin); // Transparent upgrade
        setIsLocked(false);
        return true;
      }
      return false;
    }

    // 4. Backwards-compatible migration for pre-existing unhashed PINs
    if (stored === pin) {
      await savePin(pin); // Transparent upgrade
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

  const isLocallyAuthenticated = !!(internalPatientId && hasPIN);
  const isAuthenticated = (isSignedIn ?? false) || isLocallyAuthenticated;

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        isLocked,
        hasPIN,
        biometricsEnabled,
        lockTimeout,
        isLoading: isLoading || isVerifying,
        isInitialized,
        internalPatientId,
        clerkSessionId: sessionId ?? null,
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

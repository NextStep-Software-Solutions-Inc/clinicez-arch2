import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { DeviceEventEmitter } from 'react-native';
import { useAuth } from 'contexts/AuthContext';
import {
  getUnreadCount,
  syncNotificationsFromBackend,
} from 'services/notifications/notificationService';
import { registerDeviceSessionOnBackend } from 'services/api/sessionsApi';
import { getDeviceLabel, getOrCreateDeviceId } from 'services/devices/deviceIdentity';
import { DOCUMENTS_SYNCED_EVENT } from 'services/sync/documentsSyncService';

/**
 * Web notification context.
 *
 * The web build is online-first and does not register for native push. Instead we
 * pull notifications from the backend (poll + on window focus) into the local
 * store and expose the unread count so the in-app inbox/badge stay current.
 *
 * The browser registers a device session (no push token) on sign-in so it shows up
 * in "My devices" like a native install.
 */

export type WebPermissionStatus = 'granted' | 'denied' | 'undetermined';

export interface NotificationContextValue {
  unreadCount: number;
  permissionStatus: WebPermissionStatus;
  pushToken: string | null;
  /** Re-sync from the backend and re-count unread notifications. */
  refreshNotifications: () => void;
  /** Native push is unavailable on web; always resolves false. */
  requestPermissions: () => Promise<boolean>;
}

const POLL_INTERVAL_MS = 60_000;

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function useNotificationContext(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    return {
      unreadCount: 0,
      permissionStatus: 'undetermined',
      pushToken: null,
      refreshNotifications: () => {},
      requestPermissions: async () => false,
    };
  }
  return ctx;
}

interface NotificationProviderProps {
  children: ReactNode;
}

export function NotificationProvider({ children }: NotificationProviderProps) {
  const { internalPatientId: patientId, clerkSessionId, getToken } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;
  const registeredSessionRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    if (!patientId) {
      setUnreadCount(0);
      return;
    }
    try {
      await syncNotificationsFromBackend(getToken, patientId);
    } catch {
      // Offline/transient failures are non-fatal: fall back to the local count.
    }
    try {
      setUnreadCount(await getUnreadCount(patientId));
    } catch {
      // ignore
    }
  }, [patientId, getToken]);

  useEffect(() => {
    if (!patientId || !clerkSessionId) {
      registeredSessionRef.current = null;
      return;
    }
    const registrationKey = `${patientId}:${clerkSessionId}`;
    if (registeredSessionRef.current === registrationKey) return;
    registeredSessionRef.current = registrationKey;

    getOrCreateDeviceId()
      .then((deviceId) =>
        registerDeviceSessionOnBackend(getTokenRef.current, patientId, {
          deviceId,
          deviceLabel: getDeviceLabel(),
          clerkSessionId,
        }),
      )
      .catch((err: unknown) => {
        registeredSessionRef.current = null;
        console.warn('[DeviceSession] Failed to register web device session:', err);
      });
  }, [patientId, clerkSessionId]);

  useEffect(() => {
    void refresh();
    if (!patientId) return undefined;

    const interval = setInterval(() => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        void refresh();
      }
    }, POLL_INTERVAL_MS);

    const onFocus = () => void refresh();
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', onFocus);
    }
    const documentsSub = DeviceEventEmitter.addListener(DOCUMENTS_SYNCED_EVENT, () => {
      getUnreadCount(patientId)
        .then(setUnreadCount)
        .catch(() => undefined);
    });
    return () => {
      clearInterval(interval);
      documentsSub.remove();
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', onFocus);
      }
    };
  }, [patientId, refresh]);

  const value = useMemo<NotificationContextValue>(
    () => ({
      unreadCount,
      permissionStatus: 'granted',
      pushToken: null,
      refreshNotifications: () => void refresh(),
      requestPermissions: async () => false,
    }),
    [unreadCount, refresh],
  );

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

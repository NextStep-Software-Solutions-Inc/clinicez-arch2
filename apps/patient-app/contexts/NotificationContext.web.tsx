import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { DeviceEventEmitter } from 'react-native';
import { useAuth } from 'contexts/AuthContext';
import {
  getUnreadCount,
  syncNotificationsFromBackend,
} from 'services/notifications/notificationService';
import { DOCUMENTS_SYNCED_EVENT } from 'services/sync/documentsSyncService';

/**
 * Web notification context.
 *
 * The web build is online-first and does not register for native push. Instead we
 * pull notifications from the backend (poll + on window focus) into the local
 * store and expose the unread count so the in-app inbox/badge stay current.
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
  const { internalPatientId: patientId, getToken } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

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

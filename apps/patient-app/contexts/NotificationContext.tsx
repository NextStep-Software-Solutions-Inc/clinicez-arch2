import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import * as ExpoNotifications from 'expo-notifications';
import { useAuth } from 'contexts/AuthContext';
import {
  registerForPushNotifications,
  getUnreadCount,
  saveNotification,
  type NotificationPayload,
} from 'services/notifications/notificationService';
import { navigationRef } from 'navigation/Navigation';
import { mutate } from 'swr';
import { registerDeviceSessionOnBackend } from 'services/api/sessionsApi';
import { getDeviceLabel, getOrCreateDeviceId } from 'services/devices/deviceIdentity';
import { DeviceEventEmitter } from 'react-native';
import { DOCUMENTS_SYNCED_EVENT } from 'services/sync/documentsSyncService';

export interface NotificationContextValue {
  unreadCount: number;
  permissionStatus: ExpoNotifications.PermissionStatus | 'undetermined';
  pushToken: string | null;
  /** Call this to force the context to re-count unread notifications */
  refreshNotifications: () => void;
  /** Prompts for permission if not already granted */
  requestPermissions: () => Promise<boolean>;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function useNotificationContext(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    // Return a safe fallback so the app doesn't crash if a consumer
    // is rendered before the provider is mounted (common during
    // navigation/header rendering). Consumers should handle
    // disabled behavior when using these defaults.
    console.warn('useNotificationContext used outside NotificationProvider — returning safe defaults');
    const fallback: NotificationContextValue = {
      unreadCount: 0,
      permissionStatus: 'undetermined',
      pushToken: null,
      refreshNotifications: () => { },
      requestPermissions: async () => false,
    };
    return fallback;
  }

  return ctx;
}

interface NotificationProviderProps {
  children: ReactNode;
}

export function NotificationProvider({ children }: NotificationProviderProps) {
  const { internalPatientId: patientId, clerkSessionId, getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  const [unreadCount, setUnreadCount] = useState(3);
  const [pushToken, setPushToken] = useState<string | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<
    ExpoNotifications.PermissionStatus | 'undetermined'
  >('undetermined');
  const listenerCleanupRef = useRef<(() => void) | null>(null);

  const refresh = useCallback(async () => {
    if (!patientId) {
      setUnreadCount(0);
      return;
    }
    try {
      const count = await getUnreadCount(patientId);
      setUnreadCount(count);
    } catch (_) { }
  }, [patientId]);

  const registerSession = useCallback(async (token: string | undefined) => {
    if (!patientId || !clerkSessionId) return;
    try {
      const deviceId = await getOrCreateDeviceId();
      await registerDeviceSessionOnBackend(getTokenRef.current, patientId, {
        deviceId,
        deviceLabel: getDeviceLabel(),
        clerkSessionId,
        pushToken: token,
      });
    } catch (err) {
      console.warn('Failed to register device session', err);
    }
  }, [patientId, clerkSessionId]);

  const requestPermissions = useCallback(async (): Promise<boolean> => {
    if (!patientId) return false;
    const { token, status } = await registerForPushNotifications(patientId);
    setPermissionStatus(status);
    if (token) {
      setPushToken(token);
      await registerSession(token);
    }
    return status === 'granted';
  }, [patientId, registerSession]);

  useEffect(() => {
    // Check current permission status without prompting; the device session is registered
    // whether or not push is granted, so the device always shows up in "My devices".
    ExpoNotifications.getPermissionsAsync().then(async ({ status }) => {
      setPermissionStatus(status);
      if (!patientId) return;
      let token: string | undefined;
      if (status === 'granted') {
        const registration = await registerForPushNotifications(patientId);
        if (registration.token) {
          setPushToken(registration.token);
          token = registration.token;
        }
      }
      await registerSession(token);
    });
  }, [patientId, registerSession]);

  useEffect(() => {
    // Initial unread count (or zero when not signed in)
    refresh();

    // Setup foreground listener: persist notification + refresh count
    const receivedSub = ExpoNotifications.addNotificationReceivedListener(async (notification) => {
      const raw = notification.request.content;
      
      // Instantly trigger revalidation for all active SWR hooks.
      // This handles silent data refreshes and keeps the UI up to date for visible notifications.
      mutate(() => true, undefined, { revalidate: true });

      // If this is a silent push (no title, no body), we don't persist it in the inbox
      if (!raw.title && !raw.body) {
        return;
      }

      const payload: NotificationPayload = {
        type: (raw.data?.type as any) ?? 'system',
        category: (raw.data?.category as any) ?? 'system',
        title: raw.title ?? 'Notification',
        body: raw.body ?? '',
        data: raw.data as Record<string, unknown>,
        sourceId: raw.data?.sourceId as string | undefined,
      };

      // Only persist notifications when there's an authenticated user
      if (patientId) {
        try {
          await saveNotification(patientId, payload);
        } catch (_) { }
      }

      refresh();
    });

    const responseSub = ExpoNotifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      if (data?.route === 'SettingsScreen') {
        if (navigationRef.isReady()) {
          navigationRef.navigate('Main', { screen: 'SettingsScreen' });
        }
      }
    });

    // Notifications that arrive with synced documents are stored by the sync layer: refresh the badge.
    const documentsSub = DeviceEventEmitter.addListener(DOCUMENTS_SYNCED_EVENT, () => {
      refresh();
    });

    listenerCleanupRef.current = () => {
      receivedSub.remove();
      responseSub.remove();
      documentsSub.remove();
    };

    return () => {
      listenerCleanupRef.current?.();
      listenerCleanupRef.current = null;
    };
  }, [patientId, refresh]);

  return (
    <NotificationContext.Provider
      value={{
        unreadCount,
        permissionStatus,
        pushToken,
        refreshNotifications: refresh,
        requestPermissions,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

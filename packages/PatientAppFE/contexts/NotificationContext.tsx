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
import { registerDeviceSessionOnBackend } from 'services/api/notificationsApi';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { randomUUID } from 'expo-crypto';

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
  const { internalPatientId: patientId, getToken } = useAuth();

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

  const requestPermissions = useCallback(async (): Promise<boolean> => {
    if (!patientId) return false;
    const { token, status } = await registerForPushNotifications(patientId);
    setPermissionStatus(status);
    if (token) {
      setPushToken(token);
      let deviceId = await SecureStore.getItemAsync('DEVICE_ID');
      if (!deviceId) {
        deviceId = randomUUID();
        await SecureStore.setItemAsync('DEVICE_ID', deviceId);
      }
      try {
        await registerDeviceSessionOnBackend(getToken, patientId, deviceId, Platform.OS, token);
      } catch (err) {
        console.warn('Failed to register device session', err);
      }
    }
    return status === 'granted';
  }, [patientId, getToken]);

  useEffect(() => {
    // Check current permission status without prompting
    ExpoNotifications.getPermissionsAsync().then(async ({ status }) => {
      setPermissionStatus(status);
      if (status === 'granted' && patientId) {
        // Silently fetch/verify token and register session on startup
        const { token } = await registerForPushNotifications(patientId);
        if (token) {
          setPushToken(token);
          let deviceId = await SecureStore.getItemAsync('DEVICE_ID');
          if (!deviceId) {
            deviceId = randomUUID();
            await SecureStore.setItemAsync('DEVICE_ID', deviceId);
          }
          try {
            await registerDeviceSessionOnBackend(getToken, patientId, deviceId, Platform.OS, token);
          } catch (err) {
            console.warn('Failed to register device session on startup', err);
          }
        }
      }
    });

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

    listenerCleanupRef.current = () => {
      receivedSub.remove();
      responseSub.remove();
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

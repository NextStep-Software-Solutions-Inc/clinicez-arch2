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
import { useAuth as useClerkAuth } from '@clerk/expo';
import {
  registerForPushNotifications,
  getUnreadCount,
  saveNotification,
  type NotificationPayload,
} from 'services/notifications/notificationService';
import { navigationRef } from 'navigation/Navigation';

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
  const { userId } = useClerkAuth();

  const [unreadCount, setUnreadCount] = useState(3);
  const [pushToken, setPushToken] = useState<string | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<
    ExpoNotifications.PermissionStatus | 'undetermined'
  >('undetermined');
  const listenerCleanupRef = useRef<(() => void) | null>(null);

  const refresh = useCallback(async () => {
    if (!userId) {
      setUnreadCount(0);
      return;
    }
    try {
      const count = await getUnreadCount(userId);
      setUnreadCount(count);
    } catch (_) { }
  }, [userId]);

  const requestPermissions = useCallback(async (): Promise<boolean> => {
    if (!userId) return false;
    const { token, status } = await registerForPushNotifications(userId);
    setPermissionStatus(status);
    if (token) setPushToken(token);
    return status === 'granted';
  }, [userId]);

  useEffect(() => {
    // Check current permission status without prompting
    ExpoNotifications.getPermissionsAsync().then(({ status }) => {
      setPermissionStatus(status);
    });

    // Initial unread count (or zero when not signed in)
    refresh();

    // Setup foreground listener: persist notification + refresh count
    const receivedSub = ExpoNotifications.addNotificationReceivedListener(async (notification) => {
      const raw = notification.request.content;
      const payload: NotificationPayload = {
        type: (raw.data?.type as any) ?? 'system',
        category: (raw.data?.category as any) ?? 'system',
        title: raw.title ?? 'Notification',
        body: raw.body ?? '',
        data: raw.data as Record<string, unknown>,
        sourceId: raw.data?.sourceId as string | undefined,
      };

      // Only persist notifications when there's an authenticated user
      if (userId) {
        try {
          await saveNotification(userId, payload);
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
  }, [userId, refresh]);

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

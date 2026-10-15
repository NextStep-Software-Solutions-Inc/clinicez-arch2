import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import {
  clinicService,
  ClinicStaffNotification,
} from '../services/clinicService';
import { useClinic } from '../context/ClinicContext';
import { playStatAudioChime, triggerStatVibration } from '../utils/alertSounds';

export interface UseClinicNotificationsOptions {
  pollingIntervalMs?: number;
  autoPoll?: boolean;
}

export interface UseClinicNotificationsReturn {
  notifications: ClinicStaffNotification[];
  unreadCount: number;
  hasStatAlert: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
  markAsRead: (id: string) => Promise<boolean>;
  markAllAsRead: () => Promise<void>;
}

export function useClinicNotifications(
  options: UseClinicNotificationsOptions = {}
): UseClinicNotificationsReturn {
  const { pollingIntervalMs = 20_000, autoPoll = true } = options;
  const { settings } = useClinic();

  const [notifications, setNotifications] = useState<ClinicStaffNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [hasStatAlert, setHasStatAlert] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  const seenNotificationIdsRef = useRef<Set<string>>(new Set());
  const isFirstLoadRef = useRef<boolean>(true);

  const refresh = useCallback(async () => {
    try {
      const [res, err] = await clinicService.getStaffNotifications({ limit: 50 });
      if (err || !res) {
        return;
      }

      const items = res.items ?? [];
      const newUnreadCount = res.unreadCount ?? items.filter((n) => !n.isRead).length;
      const newHasStat = res.hasStatAlert ?? items.some((n) => !n.isRead && n.urgency === 'Stat');

      // Check for newly arrived unread STAT notifications
      if (!isFirstLoadRef.current) {
        const hasNewStatAlert = items.some(
          (n) => !n.isRead && n.urgency === 'Stat' && !seenNotificationIdsRef.current.has(n.id)
        );

        if (hasNewStatAlert) {
          if (settings?.enableStatAudioAlert !== false) {
            playStatAudioChime();
          }
          if (settings?.enableStatVibrationAlert !== false) {
            triggerStatVibration();
          }
        }
      }

      // Update seen cache
      items.forEach((n) => seenNotificationIdsRef.current.add(n.id));
      isFirstLoadRef.current = false;

      setNotifications(items);
      setUnreadCount(newUnreadCount);
      setHasStatAlert(newHasStat);
    } catch {
      // Silent in background
    } finally {
      setLoading(false);
    }
  }, [settings?.enableStatAudioAlert, settings?.enableStatVibrationAlert]);

  const markAsRead = useCallback(async (id: string): Promise<boolean> => {
    // Optimistic update
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true, readAt: new Date().toISOString() } : n))
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));

    try {
      const [success, err] = await clinicService.markStaffNotificationRead(id);
      if (err || !success) {
        refresh();
        return false;
      }
      return true;
    } catch {
      refresh();
      return false;
    }
  }, [refresh]);

  const markAllAsRead = useCallback(async () => {
    const now = new Date().toISOString();
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, isRead: true, readAt: n.readAt ?? now }))
    );
    setUnreadCount(0);
    setHasStatAlert(false);

    try {
      await clinicService.markAllStaffNotificationsRead();
    } catch {
      refresh();
    }
  }, [refresh]);

  // Initial load
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Polling loop with pause on background / visibilitychange
  useEffect(() => {
    if (!autoPoll || pollingIntervalMs <= 0) return;

    let timer: NodeJS.Timeout | null = null;
    let isActive = true;

    const startTimer = () => {
      if (timer) clearInterval(timer);
      timer = setInterval(() => {
        if (isActive) {
          refresh();
        }
      }, pollingIntervalMs);
    };

    const handleAppStateChange = (state: string) => {
      isActive = state === 'active';
      if (isActive) {
        refresh();
        startTimer();
      } else if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    const handleVisibilityChange = () => {
      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        isActive = document.visibilityState === 'visible';
        if (isActive) {
          refresh();
          startTimer();
        } else if (timer) {
          clearInterval(timer);
          timer = null;
        }
      }
    };

    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    startTimer();

    return () => {
      if (timer) clearInterval(timer);
      subscription.remove();
      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    };
  }, [autoPoll, pollingIntervalMs, refresh]);

  return {
    notifications,
    unreadCount,
    hasStatAlert,
    loading,
    refresh,
    markAsRead,
    markAllAsRead,
  };
}

import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';

export function resolveIsOnlineFromNetInfo(state: Pick<NetInfoState, 'isConnected' | 'isInternetReachable'>): boolean {
  if (state.isConnected === false) return false;
  if (state.isInternetReachable === false) return false;
  return true;
}

/**
 * Tracks real-time internet connectivity across iOS, Android, and Web.
 * Returns `isOnline: false` whenever the device has no network connection so
 * the floating Clinical Empathy Offline Banner renders immediately.
 */
export function useNetworkOnline(): { isOnline: boolean } {
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean') {
      return navigator.onLine;
    }
    return true;
  });

  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const syncWebOnline = () => {
        if (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean') {
          setIsOnline(navigator.onLine);
        }
      };
      syncWebOnline();
      window.addEventListener('online', syncWebOnline);
      window.addEventListener('offline', syncWebOnline);
      return () => {
        window.removeEventListener('online', syncWebOnline);
        window.removeEventListener('offline', syncWebOnline);
      };
    }

    let active = true;
    NetInfo.fetch()
      .then((state) => {
        if (active) setIsOnline(resolveIsOnlineFromNetInfo(state));
      })
      .catch(() => {});

    const unsubscribe = NetInfo.addEventListener((state) => {
      if (active) setIsOnline(resolveIsOnlineFromNetInfo(state));
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return { isOnline };
}

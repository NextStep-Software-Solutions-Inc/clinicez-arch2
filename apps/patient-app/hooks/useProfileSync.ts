import { useEffect, useRef } from 'react';
import { DeviceEventEmitter } from 'react-native';
import { useNavigation } from '@react-navigation/native';

/**
 * Standard hook for profile screens to keep their local SQLite state in sync
 * with server updates, background syncs, and changes from other signed-in devices.
 *
 * Automatically calls `onRefresh`:
 * 1. Whenever the screen gains navigation focus.
 * 2. Whenever a two-way sync cycle completes (via the 'profile-synced' event).
 */
export function useProfileSync(onRefresh: () => void | Promise<void>) {
  const navigation = useNavigation();
  const onRefreshRef = useRef(onRefresh);

  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    // 1. Listen for background two-way sync completion
    const sub = DeviceEventEmitter.addListener('profile-synced', () => {
      try {
        onRefreshRef.current?.();
      } catch (err) {
        console.warn('[useProfileSync] Error in onRefresh handler:', err);
      }
    });

    // 2. Listen for screen navigation focus
    const unsubFocus = navigation?.addListener?.('focus', () => {
      try {
        onRefreshRef.current?.();
      } catch (err) {
        console.warn('[useProfileSync] Error in onFocus handler:', err);
      }
    });

    return () => {
      sub.remove();
      unsubFocus?.();
    };
  }, [navigation]);
}

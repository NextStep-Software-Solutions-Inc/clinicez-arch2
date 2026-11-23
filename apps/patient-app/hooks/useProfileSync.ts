import { useEffect, useRef } from 'react';
import { DeviceEventEmitter } from 'react-native';
import { useNavigation } from '@react-navigation/native';

export interface UseProfileSyncOptions {
  /**
   * Optional ref indicating whether the screen's form currently has unsaved user edits.
   * When `isDirtyRef.current === true`, automatic refreshes from `'profile-synced'` and
   * navigation `'focus'` events are skipped so active edits are never overwritten.
   */
  isDirtyRef?: { readonly current: boolean };
}

/**
 * Standard hook for profile screens to keep their local SQLite state in sync
 * with server updates, background syncs, and changes from other signed-in devices.
 *
 * Automatically calls `onRefresh`:
 * 1. Whenever the screen gains navigation focus.
 * 2. Whenever a two-way sync cycle completes (via the 'profile-synced' event).
 *
 * When `options?.isDirtyRef?.current` is true, automatic refreshes are suppressed
 * until the form is clean again.
 */
export function useProfileSync(
  onRefresh: () => void | Promise<void>,
  options?: UseProfileSyncOptions,
) {
  const navigation = useNavigation();
  const onRefreshRef = useRef(onRefresh);
  const isDirtyRefHolder = useRef(options?.isDirtyRef);

  onRefreshRef.current = onRefresh;
  isDirtyRefHolder.current = options?.isDirtyRef;

  useEffect(() => {
    const invokeRefresh = (source: 'onRefresh' | 'onFocus') => {
      if (isDirtyRefHolder.current?.current) {
        return;
      }
      try {
        const result = onRefreshRef.current?.();
        if (result && typeof (result as Promise<void>).catch === 'function') {
          (result as Promise<void>).catch((err) => {
            console.warn(`[useProfileSync] Error in ${source} handler:`, err);
          });
        }
      } catch (err) {
        console.warn(`[useProfileSync] Error in ${source} handler:`, err);
      }
    };

    // 1. Listen for background two-way sync completion
    const sub = DeviceEventEmitter.addListener('profile-synced', () => {
      invokeRefresh('onRefresh');
    });

    // 2. Listen for screen navigation focus
    const unsubFocus = navigation?.addListener?.('focus', () => {
      invokeRefresh('onFocus');
    });

    return () => {
      sub.remove();
      unsubFocus?.();
    };
  }, [navigation]);
}

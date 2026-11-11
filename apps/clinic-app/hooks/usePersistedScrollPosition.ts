import React, { useCallback, useEffect, useRef } from 'react';
import {
  Platform,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollView,
} from 'react-native';

export interface UsePersistedScrollPositionOptions {
  /** Session storage key (e.g. `clinicez.scroll.settings.${activeTab}`) */
  storageKey: string;
  /**
   * Pass `!loading` / `!showSkeletons` so initial `0` scroll events during skeleton
   * hydration never clobber a saved offset before content renders and restores.
   * Defaults to `true`.
   */
  ready?: boolean;
}

export interface UsePersistedScrollPositionResult {
  scrollViewRef: React.RefObject<ScrollView | null>;
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onContentSizeChange: (contentWidth: number, contentHeight: number) => void;
  resetScrollPosition: (targetKey?: string) => void;
}

interface PendingScrollRestore {
  key: string;
  y: number;
  attempts: number;
}

const MAX_RAF_ATTEMPTS = 8;

function getWebSessionStorage(): Storage | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return null;
  }
  try {
    return window.sessionStorage ?? null;
  } catch {
    return null;
  }
}

export function readPersistedScrollOffset(storageKey: string): number {
  if (!storageKey) return 0;
  const storage = getWebSessionStorage();
  if (!storage) return 0;
  try {
    const raw = storage.getItem(storageKey);
    if (raw === null || raw === '') return 0;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
  } catch {
    return 0;
  }
}

export function writePersistedScrollOffset(storageKey: string, offsetY: number): void {
  if (!storageKey) return;
  const storage = getWebSessionStorage();
  if (!storage) return;
  try {
    const safeY = Number.isFinite(offsetY) && offsetY > 0 ? Math.round(offsetY) : 0;
    storage.setItem(storageKey, String(safeY));
  } catch {
    // Ignore sessionStorage quota or private-mode security errors
  }
}

function applyScrollOffset(node: ScrollView | null, targetY: number): boolean {
  if (!node) return false;

  try {
    node.scrollTo?.({ y: targetY, animated: false });
  } catch {
    // Ignore partial mock / detached node errors
  }

  const rawNode = node as unknown as {
    getScrollableNode?: () => HTMLElement | null;
    scrollTop?: number;
    scrollHeight?: number;
    clientHeight?: number;
  };
  const domNode =
    typeof rawNode.getScrollableNode === 'function'
      ? rawNode.getScrollableNode()
      : (rawNode as unknown as HTMLElement | null);

  if (domNode && typeof domNode.scrollTop === 'number') {
    domNode.scrollTop = targetY;
    if (
      typeof domNode.scrollHeight === 'number' &&
      typeof domNode.clientHeight === 'number' &&
      domNode.scrollHeight > 0
    ) {
      const maxScroll = Math.max(0, domNode.scrollHeight - domNode.clientHeight);
      return maxScroll >= targetY || targetY === 0;
    }
  }

  // Non-DOM / test ref without scrollHeight metrics: scrollTo was invoked directly
  return typeof node.scrollTo === 'function';
}

/**
 * Persists and restores `<ScrollView>` vertical scroll offset in `window.sessionStorage`
 * across browser refreshes (`Cmd+R`), with a hydration guard that ignores skeleton-phase
 * `y = 0` events until `ready` becomes `true`.
 */
export function usePersistedScrollPosition({
  storageKey,
  ready = true,
}: UsePersistedScrollPositionOptions): UsePersistedScrollPositionResult {
  const scrollViewRef = useRef<ScrollView | null>(null);
  const storageKeyRef = useRef<string>(storageKey);
  const readyRef = useRef<boolean>(ready);
  const restoredKeyRef = useRef<string | null>(null);
  const pendingRef = useRef<PendingScrollRestore | null>(null);

  storageKeyRef.current = storageKey;
  readyRef.current = ready;

  useEffect(() => {
    if (!ready) {
      return;
    }
    if (restoredKeyRef.current === storageKey) {
      return;
    }

    const savedOffset = readPersistedScrollOffset(storageKey);
    if (savedOffset <= 0) {
      pendingRef.current = null;
      restoredKeyRef.current = storageKey;
      return;
    }

    pendingRef.current = { key: storageKey, y: savedOffset, attempts: 0 };
    const reachedImmediately = applyScrollOffset(scrollViewRef.current, savedOffset);
    if (reachedImmediately) {
      pendingRef.current = null;
      restoredKeyRef.current = storageKey;
      return;
    }

    if (typeof requestAnimationFrame !== 'function') {
      // Keep pendingRef intact so onContentSizeChange completes restoration once layout settles
      return;
    }

    let rafId: number | null = null;
    const step = () => {
      const pending = pendingRef.current;
      if (!pending || pending.key !== storageKey) {
        return;
      }
      pending.attempts += 1;
      const reached = applyScrollOffset(scrollViewRef.current, pending.y);
      if (reached || pending.attempts >= MAX_RAF_ATTEMPTS) {
        pendingRef.current = null;
        restoredKeyRef.current = storageKey;
        return;
      }
      rafId = requestAnimationFrame(step);
    };

    rafId = requestAnimationFrame(step);
    return () => {
      if (rafId !== null && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(rafId);
      }
    };
  }, [storageKey, ready]);

  const onContentSizeChange = useCallback((_contentWidth: number, contentHeight: number) => {
    const pending = pendingRef.current;
    if (!readyRef.current || !pending || pending.key !== storageKeyRef.current) {
      return;
    }
    const reached = applyScrollOffset(scrollViewRef.current, pending.y);
    if (reached || contentHeight >= pending.y) {
      pendingRef.current = null;
      restoredKeyRef.current = pending.key;
    }
  }, []);

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const key = storageKeyRef.current;
    if (!readyRef.current || !key) {
      return;
    }

    const rawY = event?.nativeEvent?.contentOffset?.y;
    if (typeof rawY !== 'number' || !Number.isFinite(rawY)) {
      return;
    }

    const pending = pendingRef.current;
    if (pending && pending.key === key) {
      if (Math.abs(rawY - pending.y) <= 4) {
        pendingRef.current = null;
        restoredKeyRef.current = key;
        writePersistedScrollOffset(key, rawY);
      }
      // Ignore intermediate y = 0 scroll events before pending restoration lands
      return;
    }

    if (restoredKeyRef.current !== key) {
      return;
    }

    writePersistedScrollOffset(key, rawY);
  }, []);

  const resetScrollPosition = useCallback((targetKey?: string) => {
    const keyToReset = targetKey ?? storageKeyRef.current;
    if (keyToReset) {
      writePersistedScrollOffset(keyToReset, 0);
    }
    pendingRef.current = null;
    restoredKeyRef.current = keyToReset || null;
    applyScrollOffset(scrollViewRef.current, 0);
  }, []);

  return {
    scrollViewRef,
    onScroll,
    onContentSizeChange,
    resetScrollPosition,
  };
}

export default usePersistedScrollPosition;

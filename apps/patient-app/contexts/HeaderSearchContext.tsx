import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

export interface HeaderSearchEntry {
  openSearch: () => void;
  hasActiveSearch: boolean;
}

export interface WebHeaderOverride {
  title?: string;
  subtitle?: string;
}

interface HeaderSearchContextValue {
  entries: Record<string, HeaderSearchEntry | undefined>;
  register: (tabKey: string, entry: HeaderSearchEntry) => void;
  unregister: (tabKey: string) => void;
  headerOverrides: Record<string, WebHeaderOverride | undefined>;
  registerHeaderOverride: (routeName: string, override: WebHeaderOverride) => void;
  unregisterHeaderOverride: (routeName: string) => void;
}

const HeaderSearchContext = createContext<HeaderSearchContextValue | null>(null);

export function HeaderSearchProvider({ children }: { children: React.ReactNode }) {
  const [entries, setEntries] = useState<Record<string, HeaderSearchEntry | undefined>>({});
  const [headerOverrides, setHeaderOverrides] = useState<Record<string, WebHeaderOverride | undefined>>({});

  const register = useCallback((tabKey: string, entry: HeaderSearchEntry) => {
    setEntries((prev) => {
      const existing = prev[tabKey];
      if (
        existing &&
        existing.openSearch === entry.openSearch &&
        existing.hasActiveSearch === entry.hasActiveSearch
      ) {
        return prev;
      }
      return { ...prev, [tabKey]: entry };
    });
  }, []);

  const unregister = useCallback((tabKey: string) => {
    setEntries((prev) => {
      if (!(tabKey in prev)) return prev;
      const next = { ...prev };
      delete next[tabKey];
      return next;
    });
  }, []);

  const registerHeaderOverride = useCallback((routeName: string, override: WebHeaderOverride) => {
    setHeaderOverrides((prev) => {
      const existing = prev[routeName];
      if (existing && existing.title === override.title && existing.subtitle === override.subtitle) {
        return prev;
      }
      return { ...prev, [routeName]: override };
    });
  }, []);

  const unregisterHeaderOverride = useCallback((routeName: string) => {
    setHeaderOverrides((prev) => {
      if (!(routeName in prev)) return prev;
      const next = { ...prev };
      delete next[routeName];
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({
      entries,
      register,
      unregister,
      headerOverrides,
      registerHeaderOverride,
      unregisterHeaderOverride,
    }),
    [entries, register, unregister, headerOverrides, registerHeaderOverride, unregisterHeaderOverride]
  );

  return <HeaderSearchContext.Provider value={value}>{children}</HeaderSearchContext.Provider>;
}

/**
 * Registers a screen's search popup trigger under its bottom-tab key
 * (`AppointmentsScreen`, `RecordsScreen`, or `FilesScreen`) so `WebAppFrame` / `WebPageHeader`
 * can render a Search icon button in the compact top bar without cross-tab collisions.
 */
export function useRegisterHeaderSearch(
  tabKey: string,
  openSearch: () => void,
  hasActiveSearch: boolean
) {
  const ctx = useContext(HeaderSearchContext);
  const openRef = useRef(openSearch);
  openRef.current = openSearch;

  const stableOpen = useCallback(() => {
    openRef.current();
  }, []);

  useEffect(() => {
    if (!ctx) return;
    ctx.register(tabKey, { openSearch: stableOpen, hasActiveSearch });
  }, [ctx, tabKey, stableOpen, hasActiveSearch]);

  useEffect(() => {
    if (!ctx) return;
    return () => {
      ctx.unregister(tabKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabKey]);
}

export function useHeaderSearchEntry(tabKey?: string): HeaderSearchEntry | undefined {
  const ctx = useContext(HeaderSearchContext);
  if (!ctx || !tabKey) return undefined;
  return ctx.entries[tabKey];
}

/**
 * Allows nested stack screens on web (e.g. `FileViewerScreen` inside `FilesStackWeb`)
 * to dynamically set the top `WebPageHeader` title and subtitle.
 */
export function useRegisterWebHeaderOverride(
  routeName: string,
  title?: string,
  subtitle?: string
) {
  const ctx = useContext(HeaderSearchContext);

  useEffect(() => {
    if (!ctx) return;
    if (!title && !subtitle) return;
    ctx.registerHeaderOverride(routeName, { title, subtitle });
  }, [ctx, routeName, title, subtitle]);

  useEffect(() => {
    if (!ctx) return;
    return () => {
      ctx.unregisterHeaderOverride(routeName);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeName]);
}

export function useWebHeaderOverride(routeName?: string): WebHeaderOverride | undefined {
  const ctx = useContext(HeaderSearchContext);
  if (!ctx || !routeName) return undefined;
  return ctx.headerOverrides[routeName];
}

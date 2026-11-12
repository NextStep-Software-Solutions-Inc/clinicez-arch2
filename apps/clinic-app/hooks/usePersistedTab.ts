import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { getSessionItem, setSessionItem } from '../utils/deviceStorage';

export interface UsePersistedTabOptions<T extends string> {
  /** Storage key persisted via `deviceStorage` (`sessionStorage` + `localStorage` on web, SQLite on native). */
  storageKey: string;
  /** Whitelist of valid tab identifiers. */
  allowedValues: readonly T[];
  /** Fallback tab when no valid route, URL, or storage value exists. */
  defaultValue: T;
  /** Optional incoming React Navigation route param (`route?.params?.tab`). */
  routeParam?: string | null;
  /** Optional URL query parameter name to read on initial hydration and sync on change (e.g. `'tab'`). */
  queryParam?: string;
  /** Optional fallback query parameter names accepted during initial URL hydration (e.g. `['subTab']`). */
  queryParamAliases?: readonly string[];
  /** Guard ensuring URL query parameters are only read/written when the browser is on the owning route path. */
  pathnameMatcher?: (pathname: string) => boolean;
  /** Whether changes should write `queryParam` into `window.location` via `history.replaceState` (default `true`). */
  syncUrl?: boolean;
  /** Optional callback fired whenever the persisted tab value changes via user selection or route param update. */
  onPersist?: (nextValue: T, prevValue: T) => void;
}

export function normalizePersistedTabValue<T extends string>(
  raw: string | null | undefined,
  allowedValues: readonly T[],
): T | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const exact = allowedValues.find((candidate) => candidate === trimmed);
  if (exact) return exact;
  const upper = trimmed.toUpperCase();
  const caseInsensitive = allowedValues.find((candidate) => candidate.toUpperCase() === upper);
  return caseInsensitive ?? null;
}

export function readPersistedTabFromSearch<T extends string>(
  search: string | null | undefined,
  allowedValues: readonly T[],
  queryParam?: string,
  queryParamAliases?: readonly string[],
): T | null {
  if (!search || !queryParam) return null;
  try {
    const params = new URLSearchParams(search);
    const keys = [queryParam, ...(queryParamAliases ?? [])];
    for (const key of keys) {
      const candidate = normalizePersistedTabValue(params.get(key), allowedValues);
      if (candidate) return candidate;
    }
  } catch {
    // Ignore malformed query strings in restricted or non-browser environments
  }
  return null;
}

export function resolveInitialPersistedTab<T extends string>({
  storageKey,
  allowedValues,
  defaultValue,
  routeParam,
  queryParam,
  queryParamAliases,
  pathnameMatcher,
}: Pick<
  UsePersistedTabOptions<T>,
  | 'storageKey'
  | 'allowedValues'
  | 'defaultValue'
  | 'routeParam'
  | 'queryParam'
  | 'queryParamAliases'
  | 'pathnameMatcher'
>): T {
  const fromRoute = normalizePersistedTabValue(routeParam, allowedValues);
  if (fromRoute) return fromRoute;

  if (Platform.OS === 'web' && typeof window !== 'undefined' && queryParam) {
    const pathname = window.location?.pathname ?? '';
    const matchesPath = pathnameMatcher ? pathnameMatcher(pathname) : true;
    if (matchesPath) {
      const fromUrl = readPersistedTabFromSearch(
        window.location?.search,
        allowedValues,
        queryParam,
        queryParamAliases,
      );
      if (fromUrl) return fromUrl;
    }
  }

  const fromStorage = normalizePersistedTabValue(getSessionItem(storageKey), allowedValues);
  if (fromStorage) return fromStorage;

  return defaultValue;
}

function writeQueryParamToWebHistory(
  queryParam: string | undefined,
  value: string | null,
  pathnameMatcher?: (pathname: string) => boolean,
): void {
  if (
    !queryParam ||
    Platform.OS !== 'web' ||
    typeof window === 'undefined' ||
    !window.location?.href ||
    typeof window.history?.replaceState !== 'function'
  ) {
    return;
  }
  try {
    const pathname = window.location.pathname ?? '';
    if (pathnameMatcher && !pathnameMatcher(pathname)) {
      return;
    }
    const url = new URL(window.location.href);
    if (value === null) {
      if (!url.searchParams.has(queryParam)) return;
      url.searchParams.delete(queryParam);
    } else {
      if (url.searchParams.get(queryParam) === value) return;
      url.searchParams.set(queryParam, value);
    }
    window.history.replaceState(window.history.state ?? null, '', url.toString());
  } catch {
    // Ignore URL mutation errors in restricted or headless test environments
  }
}

/**
 * Reusable tab and sub-tab state persistence hook backed by `deviceStorage`
 * (`sessionStorage` + `localStorage` on web, SQLite on native) and optional URL query parameter sync.
 * Hydrates synchronously on initial render so browser refreshes (`Cmd+R` / `F5`) never flash the default tab.
 */
export function usePersistedTab<T extends string>(
  options: UsePersistedTabOptions<T>,
): [T, (next: T | ((prev: T) => T)) => void] {
  const {
    storageKey,
    allowedValues,
    defaultValue,
    routeParam,
    queryParam,
    queryParamAliases,
    pathnameMatcher,
    syncUrl = true,
    onPersist,
  } = options;

  const [value, setValueState] = useState<T>(() =>
    resolveInitialPersistedTab({
      storageKey,
      allowedValues,
      defaultValue,
      routeParam,
      queryParam,
      queryParamAliases,
      pathnameMatcher,
    }),
  );

  const valueRef = useRef<T>(value);
  valueRef.current = value;

  const onPersistRef = useRef(onPersist);
  onPersistRef.current = onPersist;

  const pathnameMatcherRef = useRef(pathnameMatcher);
  pathnameMatcherRef.current = pathnameMatcher;

  const prevRouteParamRef = useRef<string | null | undefined>(routeParam);
  const pendingSyncedValuesRef = useRef<T[]>([]);
  const didHydrateSyncRef = useRef(false);

  // Persist initial deep-linked / hydrated value so subsequent bare refreshes preserve it
  useEffect(() => {
    if (didHydrateSyncRef.current) return;
    didHydrateSyncRef.current = true;
    const stored = normalizePersistedTabValue(getSessionItem(storageKey), allowedValues);
    if (stored !== valueRef.current && (valueRef.current !== defaultValue || stored !== null)) {
      setSessionItem(storageKey, valueRef.current);
    }
    if (syncUrl && queryParam && valueRef.current !== defaultValue) {
      writeQueryParamToWebHistory(queryParam, valueRef.current, pathnameMatcherRef.current);
    }
  }, [allowedValues, defaultValue, queryParam, storageKey, syncUrl]);

  // React to genuine external route param transitions without ping-ponging on local clicks
  useEffect(() => {
    if (routeParam === prevRouteParamRef.current) {
      return;
    }
    prevRouteParamRef.current = routeParam;
    const incoming = normalizePersistedTabValue(routeParam, allowedValues);
    if (!incoming) return;

    const pendingIdx = pendingSyncedValuesRef.current.indexOf(incoming);
    if (pendingIdx !== -1) {
      pendingSyncedValuesRef.current = pendingSyncedValuesRef.current.slice(pendingIdx + 1);
      return;
    }

    if (incoming !== valueRef.current) {
      const prev = valueRef.current;
      valueRef.current = incoming;
      setValueState(incoming);
      setSessionItem(storageKey, incoming);
      if (syncUrl && queryParam) {
        writeQueryParamToWebHistory(queryParam, incoming, pathnameMatcherRef.current);
      }
      onPersistRef.current?.(incoming, prev);
    }
  }, [allowedValues, queryParam, routeParam, storageKey, syncUrl]);

  const setPersistedValue = useCallback(
    (updater: T | ((prev: T) => T)) => {
      const prev = valueRef.current;
      const rawNext = typeof updater === 'function' ? (updater as (p: T) => T)(prev) : updater;
      const validated = normalizePersistedTabValue(rawNext, allowedValues) ?? prev;
      valueRef.current = validated;
      pendingSyncedValuesRef.current = [...pendingSyncedValuesRef.current.slice(-4), validated];
      setValueState(validated);
      setSessionItem(storageKey, validated);
      if (syncUrl && queryParam) {
        writeQueryParamToWebHistory(queryParam, validated, pathnameMatcherRef.current);
      }
      if (validated !== prev) {
        onPersistRef.current?.(validated, prev);
      }
    },
    [allowedValues, queryParam, storageKey, syncUrl],
  );

  return [value, setPersistedValue];
}

export default usePersistedTab;

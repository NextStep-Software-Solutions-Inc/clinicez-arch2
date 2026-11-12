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
  /** Optional map of raw string aliases to target canonical tab value (e.g. `{'procedure-bay': 'PendingProcedure'}`). */
  valueAliases?: Record<string, T>;
  /** Guard ensuring URL query parameters are only read/written when the browser is on the owning route path. */
  pathnameMatcher?: (pathname: string) => boolean;
  /** Whether changes should write `queryParam` into `window.location` via `history.replaceState` (default `true`). */
  syncUrl?: boolean;
  /**
   * When true and `syncUrl` is false (or transitions to false),
   * automatically removes `queryParam` and its aliases from the URL.
   */
  clearUrlOnInactive?: boolean;
  /**
   * When true, deletes the `queryParam` (and aliases) from the URL when the active value
   * equals `defaultValue`, keeping the URL clean (e.g. `status=ALL` is omitted).
   */
  omitDefaultFromUrl?: boolean;
  /**
   * Specific query parameters to delete from the URL mapped per target tab value.
   * e.g. when tab switches to `REPORTS`, cleanup `['status', 'queueStatus', 'queueFilter', 'filter']`.
   */
  cleanupParamsByValue?: Partial<Record<T, readonly string[]>>;
  /** Flat list of query parameters to always clean up from the URL on any tab update. */
  cleanupParams?: readonly string[];
  /** Optional React Navigation object to sync navigation params alongside web history. */
  navigation?: { setParams?: (params: Record<string, any>) => void } | null;
  /** Optional callback fired whenever the persisted tab value changes via user selection or route param update. */
  onPersist?: (nextValue: T, prevValue: T) => void;
}

export function normalizePersistedTabValue<T extends string>(
  raw: string | null | undefined,
  allowedValues: readonly T[],
  valueAliases?: Record<string, T>,
): T | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const exact = allowedValues.find((candidate) => candidate === trimmed);
  if (exact) return exact;
  const upper = trimmed.toUpperCase();
  const caseInsensitive = allowedValues.find((candidate) => candidate.toUpperCase() === upper);
  if (caseInsensitive) return caseInsensitive;

  const stripped = upper.replace(/[-_\s]/g, '');
  const strippedMatch = allowedValues.find(
    (candidate) => candidate.toUpperCase().replace(/[-_\s]/g, '') === stripped,
  );
  if (strippedMatch) return strippedMatch;

  if (valueAliases) {
    if (valueAliases[trimmed]) return valueAliases[trimmed];
    for (const [aliasKey, targetVal] of Object.entries(valueAliases)) {
      const aliasUpper = aliasKey.toUpperCase();
      if (aliasUpper === upper || aliasUpper.replace(/[-_\s]/g, '') === stripped) {
        return targetVal;
      }
    }
  }

  return null;
}

export function readPersistedTabFromSearch<T extends string>(
  search: string | null | undefined,
  allowedValues: readonly T[],
  queryParam?: string,
  queryParamAliases?: readonly string[],
  valueAliases?: Record<string, T>,
): T | null {
  if (!search || !queryParam) return null;
  try {
    const params = new URLSearchParams(search);
    const keys = [queryParam, ...(queryParamAliases ?? [])];
    for (const key of keys) {
      const candidate = normalizePersistedTabValue(params.get(key), allowedValues, valueAliases);
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
  valueAliases,
  pathnameMatcher,
}: Pick<
  UsePersistedTabOptions<T>,
  | 'storageKey'
  | 'allowedValues'
  | 'defaultValue'
  | 'routeParam'
  | 'queryParam'
  | 'queryParamAliases'
  | 'valueAliases'
  | 'pathnameMatcher'
>): T {
  const fromRoute = normalizePersistedTabValue(routeParam, allowedValues, valueAliases);
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
        valueAliases,
      );
      if (fromUrl) return fromUrl;
    }
  }

  const fromStorage = normalizePersistedTabValue(getSessionItem(storageKey), allowedValues, valueAliases);
  if (fromStorage) return fromStorage;

  return defaultValue;
}

export interface WebHistorySyncOptions {
  queryParam?: string;
  value?: string | null;
  omitValue?: boolean;
  cleanupParams?: readonly string[];
  pathnameMatcher?: (pathname: string) => boolean;
  navigation?: { setParams?: (params: Record<string, any>) => void } | null;
}

export function syncSearchParamsAndHistory(options: WebHistorySyncOptions): void {
  const { queryParam, value, omitValue, cleanupParams, pathnameMatcher, navigation } = options;

  // React Navigation params sync (web & native)
  if (navigation && typeof navigation.setParams === 'function') {
    try {
      const navUpdates: Record<string, any> = {};
      let hasNavUpdates = false;

      if (queryParam) {
        if (value === null || value === undefined || omitValue) {
          navUpdates[queryParam] = undefined;
          hasNavUpdates = true;
        } else {
          navUpdates[queryParam] = value;
          hasNavUpdates = true;
        }
      }

      if (cleanupParams && cleanupParams.length > 0) {
        for (const p of cleanupParams) {
          navUpdates[p] = undefined;
          hasNavUpdates = true;
        }
      }

      if (hasNavUpdates) {
        navigation.setParams(navUpdates);
      }
    } catch {
      // Ignore navigation update errors
    }
  }

  // Web window.history sync
  if (
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
    let changed = false;

    // Delete cleanup params
    if (cleanupParams && cleanupParams.length > 0) {
      for (const p of cleanupParams) {
        if (url.searchParams.has(p)) {
          url.searchParams.delete(p);
          changed = true;
        }
      }
    }

    // Set or delete primary queryParam
    if (queryParam) {
      if (value === null || value === undefined || omitValue) {
        if (url.searchParams.has(queryParam)) {
          url.searchParams.delete(queryParam);
          changed = true;
        }
      } else {
        if (url.searchParams.get(queryParam) !== value) {
          url.searchParams.set(queryParam, value);
          changed = true;
        }
      }
    }

    if (changed) {
      window.history.replaceState(window.history.state ?? null, '', url.toString());
    }
  } catch {
    // Ignore URL mutation errors in restricted or headless test environments
  }
}

export function writeQueryParamToWebHistory(
  queryParam: string | undefined,
  value: string | null,
  pathnameMatcher?: (pathname: string) => boolean,
): void {
  syncSearchParamsAndHistory({
    queryParam,
    value,
    pathnameMatcher,
  });
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
    valueAliases,
    pathnameMatcher,
    syncUrl = true,
    clearUrlOnInactive,
    omitDefaultFromUrl,
    cleanupParamsByValue,
    cleanupParams,
    navigation,
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
      valueAliases,
      pathnameMatcher,
    }),
  );

  const valueRef = useRef<T>(value);
  valueRef.current = value;

  const onPersistRef = useRef(onPersist);
  onPersistRef.current = onPersist;

  const pathnameMatcherRef = useRef(pathnameMatcher);
  pathnameMatcherRef.current = pathnameMatcher;

  const navigationRef = useRef(navigation);
  navigationRef.current = navigation;

  const prevRouteParamRef = useRef<string | null | undefined>(routeParam);
  const pendingSyncedValuesRef = useRef<T[]>([]);
  const didHydrateSyncRef = useRef(false);
  const prevSyncUrlRef = useRef(syncUrl);

  const getCleanupKeys = useCallback(
    (targetVal: T): string[] => {
      const keys: string[] = [];
      if (queryParamAliases && queryParamAliases.length > 0) {
        keys.push(...queryParamAliases);
      }
      if (cleanupParams && cleanupParams.length > 0) {
        keys.push(...cleanupParams);
      }
      if (cleanupParamsByValue && cleanupParamsByValue[targetVal]) {
        keys.push(...cleanupParamsByValue[targetVal]!);
      }
      return keys;
    },
    [cleanupParams, cleanupParamsByValue, queryParamAliases],
  );

  // Handle syncUrl transitions (e.g. parent tab switches so this child becomes active or inactive)
  useEffect(() => {
    if (prevSyncUrlRef.current === syncUrl) return;
    prevSyncUrlRef.current = syncUrl;

    if (syncUrl) {
      const shouldOmit = Boolean(omitDefaultFromUrl && valueRef.current === defaultValue);
      syncSearchParamsAndHistory({
        queryParam,
        value: valueRef.current,
        omitValue: shouldOmit,
        cleanupParams: getCleanupKeys(valueRef.current),
        pathnameMatcher: pathnameMatcherRef.current,
        navigation: navigationRef.current,
      });
    } else if (clearUrlOnInactive && queryParam) {
      const inactiveParams = [queryParam, ...(queryParamAliases ?? [])];
      syncSearchParamsAndHistory({
        cleanupParams: inactiveParams,
        pathnameMatcher: pathnameMatcherRef.current,
        navigation: navigationRef.current,
      });
    }
  }, [
    clearUrlOnInactive,
    defaultValue,
    getCleanupKeys,
    omitDefaultFromUrl,
    queryParam,
    queryParamAliases,
    syncUrl,
  ]);

  // Persist initial deep-linked / hydrated value so subsequent bare refreshes preserve it
  useEffect(() => {
    if (didHydrateSyncRef.current) return;
    didHydrateSyncRef.current = true;
    const stored = normalizePersistedTabValue(getSessionItem(storageKey), allowedValues, valueAliases);
    if (stored !== valueRef.current && (valueRef.current !== defaultValue || stored !== null)) {
      setSessionItem(storageKey, valueRef.current);
    }
    if (syncUrl) {
      const shouldOmit = Boolean(omitDefaultFromUrl && valueRef.current === defaultValue);
      const cleanup = getCleanupKeys(valueRef.current);
      if (queryParam || cleanup.length > 0) {
        syncSearchParamsAndHistory({
          queryParam,
          value: valueRef.current,
          omitValue: shouldOmit,
          cleanupParams: cleanup,
          pathnameMatcher: pathnameMatcherRef.current,
          navigation: navigationRef.current,
        });
      }
    } else if (clearUrlOnInactive && queryParam) {
      const inactiveParams = [queryParam, ...(queryParamAliases ?? [])];
      syncSearchParamsAndHistory({
        cleanupParams: inactiveParams,
        pathnameMatcher: pathnameMatcherRef.current,
        navigation: navigationRef.current,
      });
    }
  }, [
    allowedValues,
    clearUrlOnInactive,
    defaultValue,
    getCleanupKeys,
    omitDefaultFromUrl,
    queryParam,
    queryParamAliases,
    storageKey,
    syncUrl,
    valueAliases,
  ]);

  // React to genuine external route param transitions without ping-ponging on local clicks
  useEffect(() => {
    if (routeParam === prevRouteParamRef.current) {
      return;
    }
    prevRouteParamRef.current = routeParam;
    const incoming = normalizePersistedTabValue(routeParam, allowedValues, valueAliases);
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
      if (syncUrl) {
        const shouldOmit = Boolean(omitDefaultFromUrl && incoming === defaultValue);
        syncSearchParamsAndHistory({
          queryParam,
          value: incoming,
          omitValue: shouldOmit,
          cleanupParams: getCleanupKeys(incoming),
          pathnameMatcher: pathnameMatcherRef.current,
          navigation: navigationRef.current,
        });
      }
      onPersistRef.current?.(incoming, prev);
    }
  }, [
    allowedValues,
    defaultValue,
    getCleanupKeys,
    omitDefaultFromUrl,
    queryParam,
    routeParam,
    storageKey,
    syncUrl,
    valueAliases,
  ]);

  const setPersistedValue = useCallback(
    (updater: T | ((prev: T) => T)) => {
      const prev = valueRef.current;
      const rawNext = typeof updater === 'function' ? (updater as (p: T) => T)(prev) : updater;
      const validated = normalizePersistedTabValue(rawNext, allowedValues, valueAliases) ?? prev;
      valueRef.current = validated;
      pendingSyncedValuesRef.current = [...pendingSyncedValuesRef.current.slice(-4), validated];
      setValueState(validated);
      setSessionItem(storageKey, validated);
      if (syncUrl) {
        const shouldOmit = Boolean(omitDefaultFromUrl && validated === defaultValue);
        syncSearchParamsAndHistory({
          queryParam,
          value: validated,
          omitValue: shouldOmit,
          cleanupParams: getCleanupKeys(validated),
          pathnameMatcher: pathnameMatcherRef.current,
          navigation: navigationRef.current,
        });
      }
      if (validated !== prev) {
        onPersistRef.current?.(validated, prev);
      }
    },
    [
      allowedValues,
      defaultValue,
      getCleanupKeys,
      omitDefaultFromUrl,
      queryParam,
      storageKey,
      syncUrl,
      valueAliases,
    ],
  );

  return [value, setPersistedValue];
}

export default usePersistedTab;

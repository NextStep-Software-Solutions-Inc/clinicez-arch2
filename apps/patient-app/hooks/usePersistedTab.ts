import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getPersistedTab,
  setPersistedTab,
  subscribePersistedTab,
  type TabPersistenceConfig,
} from '../services/tabs/tabPersistence';

export type { TabPersistenceConfig } from '../services/tabs/tabPersistence';

/**
 * Universal hook for persisting active tab, segment, or filter state across:
 * 1. Screen navigation & React Navigation stack Back transitions (instant in-memory retention).
 * 2. Web browser refresh and deep-linking (URL search parameters + localStorage).
 * 3. Mobile app restarts (SecureStore / persistent storage).
 *
 * @example
 * // Numeric segment (e.g. 0 | 1)
 * const [segment, setSegment] = usePersistedTab({
 *   key: 'records.segment',
 *   defaultValue: 0,
 *   queryParam: 'tab',
 *   serialize: (val) => (val === 1 ? 'uploads' : 'clinic'),
 *   deserialize: (raw) => (raw === 'uploads' || raw === '1' ? 1 : 0),
 * });
 *
 * @example
 * // String filter
 * const [filter, setFilter] = usePersistedTab('notifications.filter', 'all', { queryParam: 'filter' });
 */
export function usePersistedTab<T extends string | number | boolean>(
  configOrKey: TabPersistenceConfig<T> | string,
  defaultVal?: T,
  extraOptions?: Omit<TabPersistenceConfig<T>, 'key' | 'defaultValue'>
): [T, (next: T | ((prev: T) => T)) => void] {
  const configKey = typeof configOrKey === 'string' ? configOrKey : configOrKey.key;

  const config = useMemo<TabPersistenceConfig<T>>(() => {
    if (typeof configOrKey === 'string') {
      return {
        key: configOrKey,
        defaultValue: defaultVal as T,
        ...extraOptions,
      };
    }
    return configOrKey;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configKey]);

  const [state, setState] = useState<T>(() => getPersistedTab(config));

  // Subscribe to changes (e.g. from other components, browser popstate, or native storage hydration)
  useEffect(() => {
    const unsubscribe = subscribePersistedTab<T>(config.key, (nextVal) => {
      setState((prev) => (prev === nextVal ? prev : nextVal));
    });
    return unsubscribe;
  }, [config.key]);

  const setTab = useCallback(
    (next: T | ((prev: T) => T)) => {
      setState((prev) => {
        const resolved = typeof next === 'function' ? (next as (prev: T) => T)(prev) : next;
        if (resolved === prev) return prev;
        setPersistedTab(config, resolved);
        return resolved;
      });
    },
    [config]
  );

  return [state, setTab];
}

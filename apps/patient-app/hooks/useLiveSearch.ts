/**
 * Custom SWR Hook for Unified Discovery Search matching Stitch Screen 4.
 *
 * Provides:
 * - `results`: UnifiedSearchResultDto ({ doctors, clinics, services })
 * - `error`: Error | null
 * - `isLoading`: boolean
 * - `isValidating`: boolean
 * - `mutate`: SWR KeyedMutator
 */

import useSWR, { type KeyedMutator, type SWRConfiguration } from 'swr';
import type { TokenProvider } from '../services/api/apiClient';
import {
  fetchUnifiedSearch,
  type UnifiedSearchResultDto,
} from '../services/api/searchApi';

const DEFAULT_SWR_CONFIG: SWRConfiguration = {
  revalidateOnFocus: false,
  revalidateOnReconnect: true,
  shouldRetryOnError: false,
  dedupingInterval: 1_000,
};

const EMPTY_RESULTS: UnifiedSearchResultDto = {
  doctors: [],
  clinics: [],
  services: [],
};

export interface UseLiveSearchOptions {
  getToken?: TokenProvider;
  config?: SWRConfiguration;
}

export interface UseLiveSearchResult {
  results: UnifiedSearchResultDto;
  error: Error | null;
  isLoading: boolean;
  isValidating: boolean;
  mutate: KeyedMutator<UnifiedSearchResultDto>;
}

export function useLiveSearch(
  query: string,
  type?: string,
  options?: UseLiveSearchOptions | SWRConfiguration,
): UseLiveSearchResult {
  const opts: UseLiveSearchOptions =
    options && 'config' in options
      ? (options as UseLiveSearchOptions)
      : options && !('getToken' in options)
        ? { config: options as SWRConfiguration }
        : ((options as UseLiveSearchOptions) ?? {});

  const getToken = opts.getToken;
  const swrConfig = opts.config;

  const trimmedQuery = (query ?? '').trim();
  const swrKey = trimmedQuery
    ? `/discovery/search?q=${encodeURIComponent(trimmedQuery)}&type=${encodeURIComponent(type ?? 'all')}`
    : null;

  const {
    data,
    error,
    isLoading,
    isValidating,
    mutate,
  } = useSWR<UnifiedSearchResultDto>(
    swrKey,
    async () => {
      if (!trimmedQuery) return EMPTY_RESULTS;
      return fetchUnifiedSearch(trimmedQuery, type, 0, 20, getToken);
    },
    { ...DEFAULT_SWR_CONFIG, ...swrConfig },
  );

  return {
    results: data ?? EMPTY_RESULTS,
    error: error ?? null,
    isLoading: isLoading && Boolean(swrKey),
    isValidating,
    mutate,
  };
}

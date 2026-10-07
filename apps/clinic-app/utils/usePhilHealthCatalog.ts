import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ApiError } from '@shared/safe';
import {
  philHealthCatalogService,
  PhilHealthCatalogItem,
  PhilHealthLibraryName,
} from '@services/philHealthCatalogService';

interface CatalogState {
  items: PhilHealthCatalogItem[];
  loading: boolean;
  error: ApiError | null;
  reload: () => void;
}

/**
 * Active rows of a small PhilHealth Catalog library (signs and symptoms, immunizations, examination findings,
 * ...). Cached on the device, so it still works when the clinic LAN is down.
 */
export function usePhilHealthCatalog(library: PhilHealthLibraryName, enabled = true): CatalogState {
  const [items, setItems] = useState<PhilHealthCatalogItem[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<ApiError | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    setLoading(true);
    philHealthCatalogService.getLibrary(library).then(([data, err]) => {
      if (cancelled) return;
      setItems((data ?? []).filter((item) => item.isActive));
      setError(err);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [library, enabled, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return useMemo(() => ({ items, loading, error, reload }), [items, loading, error, reload]);
}

interface SearchState {
  results: PhilHealthCatalogItem[];
  searching: boolean;
  error: ApiError | null;
}

/** Debounced server-side search of a large library (ICD-10, medicines). An empty query yields no results. */
export function usePhilHealthCatalogSearch(
  library: PhilHealthLibraryName,
  query: string,
  { take = 25, debounceMs = 250 }: { take?: number; debounceMs?: number } = {},
): SearchState {
  const [results, setResults] = useState<PhilHealthCatalogItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const sequence = useRef(0);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      sequence.current += 1;
      setResults([]);
      setSearching(false);
      setError(null);
      return undefined;
    }

    setSearching(true);
    const ticket = ++sequence.current;
    const handle = setTimeout(async () => {
      const [data, err] = await philHealthCatalogService.search(library, trimmed, take);
      if (ticket !== sequence.current) return;
      setResults(data ?? []);
      setError(err);
      setSearching(false);
    }, debounceMs);

    return () => clearTimeout(handle);
  }, [library, query, take, debounceMs]);

  return { results, searching, error };
}

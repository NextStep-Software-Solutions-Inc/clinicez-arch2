import type { PhilHealthCatalogItem, PhilHealthCatalogLibrary } from './philHealthCatalogService';

/** Pure cache-vs-server decision for a catalog library (no React Native imports, so it is unit-testable). */
export interface CachedLibrary {
  contentHash: string;
  kitVersion: string;
  items: PhilHealthCatalogItem[];
}

export type LibrarySource =
  | { kind: 'cache'; items: PhilHealthCatalogItem[] }
  | { kind: 'fetch' }
  | { kind: 'unavailable' };

/**
 * Decides where a library comes from. `versions` is null while the server cannot be reached; a cached copy is then
 * served (stale is better than empty on a clinic LAN that dropped).
 */
export function selectLibrarySource(
  cached: CachedLibrary | null,
  versions: PhilHealthCatalogLibrary[] | null,
  library: string,
): LibrarySource {
  if (!versions) return cached ? { kind: 'cache', items: cached.items } : { kind: 'unavailable' };

  const current = versions.find((v) => v.library === library);
  if (!current) return { kind: 'unavailable' };
  if (cached && cached.contentHash === current.contentHash) return { kind: 'cache', items: cached.items };
  return { kind: 'fetch' };
}

import { ApiError } from '@shared/safe';
import { clinicApiClient } from './apiClient';
import { getDeviceItem, setDeviceItem } from '@utils/deviceStorage';
import { selectLibrarySource, type CachedLibrary } from './catalogSource';

export { selectLibrarySource } from './catalogSource';
export type { LibrarySource } from './catalogSource';

/**
 * Client for the PhilHealth Catalog: the official Konsulta / YAKAP `lib_*` libraries served by the clinic server
 * (ICD-10, signs and symptoms, medicines, diagnostics, ...). Nothing in the app hardcodes these codes.
 *
 * Small libraries are cached on the device keyed by the server's content hash, so forms keep working while the
 * LAN is down and the cache refreshes itself after an import. Large libraries (ICD-10, medicines) are searched
 * on the server and never cached.
 */

export type PhilHealthLibraryName =
  | 'lib_abdomen'
  | 'lib_chest'
  | 'lib_chestxray_findings'
  | 'lib_chestxray_observation'
  | 'lib_diagnostic'
  | 'lib_digital_rectal'
  | 'lib_genitourinary'
  | 'lib_heart'
  | 'lib_heent'
  | 'lib_icd'
  | 'lib_immchild'
  | 'lib_immelderly'
  | 'lib_immpregw'
  | 'lib_immyoungw'
  | 'lib_management'
  | 'lib_mdiseases'
  | 'lib_medicine'
  | 'lib_medicine_form'
  | 'lib_medicine_generic'
  | 'lib_medicine_package'
  | 'lib_medicine_salt'
  | 'lib_medicine_strength'
  | 'lib_medicine_unit'
  | 'lib_ncdq'
  | 'lib_neuro'
  | 'lib_signs_symptoms'
  | 'lib_skin_extremities'
  | 'lib_zscore';

export interface PhilHealthCatalogItem {
  code: string;
  description: string;
  isActive: boolean;
  attributes?: Record<string, string> | null;
}

export interface PhilHealthCatalogPage {
  library: string;
  kitVersion: string;
  total: number;
  skip: number;
  take: number;
  items: PhilHealthCatalogItem[];
}

export interface PhilHealthCatalogLibrary {
  library: string;
  kitVersion: string;
  itemCount: number;
  activeCount: number;
  contentHash: string;
  loadedAt: string;
  source: string | number;
}

export interface PhilHealthCatalogImportLog {
  at: string;
  library: string;
  kitVersion: string;
  source: string | number;
  status: string | number;
  added: number;
  updated: number;
  unchanged: number;
  deactivated: number;
  duplicatesIgnored: number;
  message?: string | null;
  by: string;
}

export interface PhilHealthCatalogImportResult {
  library: string;
  kitVersion: string;
  status: string | number;
  added: number;
  updated: number;
  unchanged: number;
  deactivated: number;
  duplicatesIgnored: number;
  contentHash: string;
  message?: string | null;
}

/** Libraries bigger than this are searched on the server instead of being kept on the device. */
export const MAX_CACHED_LIBRARY_ITEMS = 1000;
const PAGE_SIZE = 1000;
const CACHE_PREFIX = 'clinicez.philhealth.catalog.';
const VERSIONS_TTL_MS = 60_000;

function readCache(library: string): CachedLibrary | null {
  const raw = getDeviceItem(`${CACHE_PREFIX}${library}`);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as CachedLibrary;
    return parsed && typeof parsed.contentHash === 'string' && Array.isArray(parsed.items) ? parsed : null;
  } catch {
    return null;
  }
}

function writeCache(library: string, value: CachedLibrary) {
  setDeviceItem(`${CACHE_PREFIX}${library}`, JSON.stringify(value));
}

let versionsCache: { at: number; value: PhilHealthCatalogLibrary[] } | null = null;
const inflight = new Map<string, Promise<[PhilHealthCatalogItem[] | null, ApiError | null]>>();

async function getVersions(force = false): Promise<[PhilHealthCatalogLibrary[] | null, ApiError | null]> {
  if (!force && versionsCache && Date.now() - versionsCache.at < VERSIONS_TTL_MS) return [versionsCache.value, null];
  const [data, error] = await clinicApiClient.get<PhilHealthCatalogLibrary[]>('/philhealth/catalog/versions');
  if (data) versionsCache = { at: Date.now(), value: data };
  return [data, error];
}

async function loadLibrary(library: string, versions: PhilHealthCatalogLibrary[]): Promise<[PhilHealthCatalogItem[] | null, ApiError | null]> {
  const items: PhilHealthCatalogItem[] = [];
  let kitVersion = '';
  for (let skip = 0; ; skip += PAGE_SIZE) {
    const [page, error] = await clinicApiClient.get<PhilHealthCatalogPage>(
      `/philhealth/catalog/${encodeURIComponent(library)}?activeOnly=false&skip=${skip}&take=${PAGE_SIZE}`,
    );
    if (error || !page) return [null, error ?? new ApiError('The PhilHealth catalog could not be loaded.', 0)];
    kitVersion = page.kitVersion;
    items.push(...page.items);
    if (items.length >= page.total || page.items.length === 0) break;
  }

  const summary = versions.find((v) => v.library === library);
  if (summary && items.length <= MAX_CACHED_LIBRARY_ITEMS) {
    writeCache(library, { contentHash: summary.contentHash, kitVersion, items });
  }
  return [items, null];
}

export const philHealthCatalogService = {
  /** Loaded libraries with kit version and content hash. */
  async getLibraries() {
    return getVersions(true);
  },

  /**
   * Every row of a small library (active and inactive; callers filter). Served from the device cache when the
   * server's content hash is unchanged, or when the server is unreachable.
   */
  async getLibrary(library: PhilHealthLibraryName): Promise<[PhilHealthCatalogItem[] | null, ApiError | null]> {
    const pending = inflight.get(library);
    if (pending) return pending;

    const run = (async (): Promise<[PhilHealthCatalogItem[] | null, ApiError | null]> => {
      const cached = readCache(library);
      const [versions, versionsError] = await getVersions();
      const source = selectLibrarySource(cached, versions, library);

      if (source.kind === 'cache') return [source.items, null];
      if (source.kind === 'fetch' && versions) return loadLibrary(library, versions);
      return [null, versionsError ?? new ApiError(`The PhilHealth catalog '${library}' is not available.`, 404)];
    })();

    inflight.set(library, run);
    try {
      return await run;
    } finally {
      inflight.delete(library);
    }
  },

  /** Server-side search of any library (required for ICD-10 and medicines). Active rows only. */
  async search(library: PhilHealthLibraryName, query: string, take = 25): Promise<[PhilHealthCatalogItem[] | null, ApiError | null]> {
    const q = query.trim();
    if (!q) return [[], null];
    const [page, error] = await clinicApiClient.get<PhilHealthCatalogPage>(
      `/philhealth/catalog/${encodeURIComponent(library)}?q=${encodeURIComponent(q)}&activeOnly=true&take=${take}`,
    );
    return [page?.items ?? null, error];
  },

  /** Recent boot-seed and upload results. Needs the `philhealth.catalog.import` permission. */
  async getImportStatus(take = 50) {
    return clinicApiClient.get<PhilHealthCatalogImportLog[]>(`/philhealth/catalog/import/status?take=${take}`);
  },

  /**
   * Imports a library from an official `lib_*.xlsx` (needs `kitVersion`) or the uniform JSON. Idempotent;
   * `dryRun` previews without changing anything.
   */
  async importLibrary(input: { file: Blob | { uri: string; name: string; type: string }; fileName: string; kitVersion?: string; library?: string; dryRun: boolean }) {
    const form = new FormData();
    form.append('file', input.file as Blob, input.fileName);
    if (input.kitVersion?.trim()) form.append('kitVersion', input.kitVersion.trim());
    if (input.library?.trim()) form.append('library', input.library.trim());
    form.append('dryRun', input.dryRun ? 'true' : 'false');

    const result = await clinicApiClient.post<PhilHealthCatalogImportResult>('/philhealth/catalog/import', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120_000,
    });
    if (!input.dryRun && result[0]) {
      // The next read must notice the new content hash.
      versionsCache = null;
    }
    return result;
  },
};

/** Test hook: forget in-memory state. */
export function resetPhilHealthCatalogMemory() {
  versionsCache = null;
  inflight.clear();
}

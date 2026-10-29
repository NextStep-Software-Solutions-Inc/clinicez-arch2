import axios from 'axios';
import type { EhrOptionDescriptor, OptionsManifestResponse } from '@shared/safe';
import { getApiBaseUrl } from './runtimeConfig';
import { ensureApiPrefix, joinApiUrl, resolveTenantContext } from '@shared/safe';
import { ensureFreshToken, getAccessToken } from './authSession';
import { getSecureItem, setSecureItem } from './secureStorage';

interface CachedOptionSet {
  version: string;
  data: EhrOptionDescriptor[];
  updatedAt: number;
}

const memoryCache = new Map<string, CachedOptionSet>();
const STORAGE_PREFIX = 'clinicez.ehr.options.';

export const optionsService = {
  /**
   * Retrieves an option set by name. Uses two-tier caching (memory + device storage)
   * with SHA-256 ETag revalidation (304 Not Modified).
   */
  async getOptionSet(optionSet: string): Promise<EhrOptionDescriptor[]> {
    const cacheKey = `${STORAGE_PREFIX}${optionSet}`;

    // 1. Check in-memory cache
    let cached = memoryCache.get(optionSet);

    // 2. Check persistent storage if not in memory
    if (!cached) {
      try {
        const stored = await getSecureItem(cacheKey);
        if (stored) {
          cached = JSON.parse(stored) as CachedOptionSet;
          memoryCache.set(optionSet, cached);
        }
      } catch {
        // Fallback gracefully
      }
    }

    const base = getApiBaseUrl();
    if (!base) {
      return cached?.data ?? [];
    }

    const url = joinApiUrl(ensureApiPrefix(base), `/options/${optionSet}`);
    const headers: Record<string, string> = {};

    if (cached?.version) {
      headers['If-None-Match'] = cached.version;
    }

    const tenant = resolveTenantContext();
    if (tenant.tenantSlug) headers['X-Tenant-Id'] = tenant.tenantSlug;
    if (tenant.facilitySlug) headers['X-Facility-Slug'] = tenant.facilitySlug;
    if (tenant.clinicId) headers['X-Clinic-Id'] = tenant.clinicId;

    try {
      await ensureFreshToken();
      const token = getAccessToken();
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const response = await axios.get(url, {
        headers,
        validateStatus: (status) => status === 200 || status === 304,
        timeout: 10_000,
      });

      if (response.status === 304 && cached) {
        return cached.data;
      }

      if (response.status === 200) {
        const envelope = response.data;
        const data: EhrOptionDescriptor[] =
          envelope && typeof envelope === 'object' && 'data' in envelope && envelope.data
            ? envelope.data
            : Array.isArray(envelope)
            ? envelope
            : [];

        if (Array.isArray(data)) {
          const etag = response.headers?.etag || response.headers?.ETag || '';
          const entry: CachedOptionSet = {
            version: etag,
            data,
            updatedAt: Date.now(),
          };
          memoryCache.set(optionSet, entry);
          try {
            await setSecureItem(cacheKey, JSON.stringify(entry));
          } catch {
            // Ignore storage quota
          }
          return data;
        }
      }
    } catch {
      // Return cached version if network fails
    }

    return cached?.data ?? [];
  },

  /**
   * Retrieves the full options manifest for proactive cache synchronization.
   */
  async getManifest(): Promise<OptionsManifestResponse | null> {
    const base = getApiBaseUrl();
    if (!base) return null;
    const url = joinApiUrl(ensureApiPrefix(base), '/options/manifest');
    try {
      const response = await axios.get<OptionsManifestResponse>(url, { timeout: 10_000 });
      return response.data;
    } catch {
      return null;
    }
  },

  clearMemoryCache(): void {
    memoryCache.clear();
  },
};

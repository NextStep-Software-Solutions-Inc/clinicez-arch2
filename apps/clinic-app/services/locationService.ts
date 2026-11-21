import axios from 'axios';
import type { PsgcLocationDto } from '@shared/safe';
import { getApiBaseUrl } from './runtimeConfig';
import { ensureApiPrefix, joinApiUrl, resolveTenantContext } from '@shared/safe';
import { ensureFreshToken, getAccessToken } from './authSession';
import { getSecureItem, setSecureItem } from './secureStorage';

const memoryCache = new Map<string, PsgcLocationDto[]>();
const LOCATION_STORAGE_PREFIX = 'clinicez.psgc.';

function normalizePsgcList(data: unknown): PsgcLocationDto[] {
  if (!Array.isArray(data)) return [];
  return data.map((item: any) => ({
    psgcCode: item.psgcCode || item.code || '',
    code: item.code || item.psgcCode || '',
    name: item.name || '',
    level: item.level || '',
    parentPsgcCode: item.parentPsgcCode ?? null,
    regionPsgc: item.regionPsgc ?? null,
    provincePsgc: item.provincePsgc ?? null,
    cityMunicipalityPsgc: item.cityMunicipalityPsgc ?? null,
    zipCode: item.zipCode ?? null,
  }));
}

async function requestPsgc(path: string, cacheKey: string): Promise<PsgcLocationDto[]> {
  const cached = memoryCache.get(cacheKey);
  if (cached && cached.length > 0) return cached;

  const storageKey = `${LOCATION_STORAGE_PREFIX}${cacheKey}`;
  try {
    const stored = await getSecureItem(storageKey);
    if (stored) {
      const parsed = JSON.parse(stored) as PsgcLocationDto[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        memoryCache.set(cacheKey, parsed);
        return parsed;
      }
    }
  } catch {
    // Proceed to network
  }

  const base = getApiBaseUrl();
  if (!base) return [];

  const url = joinApiUrl(ensureApiPrefix(base), path);
  const headers: Record<string, string> = {};

  const tenant = resolveTenantContext();
  if (tenant.tenantSlug) headers['X-Tenant-Id'] = tenant.tenantSlug;
  if (tenant.facilitySlug) headers['X-Facility-Slug'] = tenant.facilitySlug;
  if (tenant.clinicId) headers['X-Clinic-Id'] = tenant.clinicId;

  try {
    await ensureFreshToken();
    const token = getAccessToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const response = await axios.get(url, { headers, timeout: 10_000 });
    const envelope = response.data;
    const raw =
      envelope && typeof envelope === 'object' && 'data' in envelope && envelope.data
        ? envelope.data
        : envelope;
    const list = normalizePsgcList(raw);

    if (list.length > 0) {
      memoryCache.set(cacheKey, list);
      try {
        await setSecureItem(storageKey, JSON.stringify(list));
      } catch {
        // Safe to ignore storage write error
      }
    }
    return list;
  } catch {
    return [];
  }
}

export const locationService = {
  async getRegions(): Promise<PsgcLocationDto[]> {
    return requestPsgc('/locations/psgc/regions', 'regions');
  },

  async getProvinces(regionPsgc: string): Promise<PsgcLocationDto[]> {
    if (!regionPsgc) return [];
    return requestPsgc(`/locations/psgc/provinces?regionPsgc=${encodeURIComponent(regionPsgc)}`, `provinces.${regionPsgc}`);
  },

  async getCities(provincePsgc?: string | null, regionPsgc?: string | null): Promise<PsgcLocationDto[]> {
    const params = new URLSearchParams();
    if (provincePsgc) params.set('provincePsgc', provincePsgc);
    if (regionPsgc) params.set('regionPsgc', regionPsgc);
    const qs = params.toString();
    const cacheKey = `cities.${provincePsgc || ''}_${regionPsgc || ''}`;
    return requestPsgc(`/locations/psgc/cities${qs ? `?${qs}` : ''}`, cacheKey);
  },

  async getBarangays(cityMunicipalityPsgc: string): Promise<PsgcLocationDto[]> {
    if (!cityMunicipalityPsgc) return [];
    return requestPsgc(
      `/locations/psgc/barangays?cityMunicipalityPsgc=${encodeURIComponent(cityMunicipalityPsgc)}`,
      `barangays.${cityMunicipalityPsgc}`,
    );
  },

  async searchLocations(query: string, limit = 50): Promise<PsgcLocationDto[]> {
    if (!query || query.trim().length < 2) return [];
    const base = getApiBaseUrl();
    if (!base) return [];

    const url = joinApiUrl(
      ensureApiPrefix(base),
      `/locations/psgc/search?q=${encodeURIComponent(query.trim())}&limit=${limit}`,
    );
    try {
      const response = await axios.get(url, { timeout: 10_000 });
      const raw = response.data?.data ?? response.data;
      return normalizePsgcList(raw);
    } catch {
      return [];
    }
  },

  clearCache(): void {
    memoryCache.clear();
  },
};

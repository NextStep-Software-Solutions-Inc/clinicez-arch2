import { apiClient } from "@/transport/apiClient";

export interface PsgcLocationDto {
  psgcCode: string;
  name: string;
  level: string;
  parentPsgcCode?: string | null;
  regionPsgc?: string | null;
  provincePsgc?: string | null;
  cityMunicipalityPsgc?: string | null;
  zipCode?: string | null;
}

const locationMemoryCache = new Map<string, PsgcLocationDto[]>();

function getCachedLocations(key: string): PsgcLocationDto[] | null {
  if (locationMemoryCache.has(key)) {
    return locationMemoryCache.get(key)!;
  }
  if (typeof window !== "undefined") {
    try {
      const stored = window.localStorage.getItem(`clinicez.portal.psgc.${key}`);
      if (stored) {
        const parsed = JSON.parse(stored) as PsgcLocationDto[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          locationMemoryCache.set(key, parsed);
          return parsed;
        }
      }
    } catch {
      // Safe fallback if localStorage is disabled or quota exceeded
    }
  }
  return null;
}

function setCachedLocations(key: string, data: PsgcLocationDto[]) {
  locationMemoryCache.set(key, data);
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(`clinicez.portal.psgc.${key}`, JSON.stringify(data));
    } catch {
      // Ignore storage errors
    }
  }
}

export const locationService = {
  /**
   * Fetches all 17 PSGC regions dynamically from portal-api with caching.
   * Zero static fallback arrays are bundled.
   */
  async getRegions(): Promise<PsgcLocationDto[]> {
    const cacheKey = "regions";
    const cached = getCachedLocations(cacheKey);
    if (cached) return cached;

    try {
      const res = await apiClient.get<PsgcLocationDto[] | { data: PsgcLocationDto[] }>("/locations/psgc/regions");
      const data = (res.data as any)?.data ?? res.data;
      if (Array.isArray(data) && data.length > 0) {
        setCachedLocations(cacheKey, data);
        return data;
      }
      return [];
    } catch {
      return [];
    }
  },

  /**
   * Fetches provinces for a region dynamically from portal-api with caching.
   */
  async getProvinces(regionPsgc?: string): Promise<PsgcLocationDto[]> {
    const cacheKey = `provinces:${regionPsgc || "all"}`;
    const cached = getCachedLocations(cacheKey);
    if (cached) return cached;

    try {
      const qs = regionPsgc ? `?regionPsgc=${encodeURIComponent(regionPsgc)}` : "";
      const res = await apiClient.get<PsgcLocationDto[] | { data: PsgcLocationDto[] }>(`/locations/psgc/provinces${qs}`);
      const data = (res.data as any)?.data ?? res.data;
      if (Array.isArray(data)) {
        setCachedLocations(cacheKey, data);
        return data;
      }
      return [];
    } catch {
      return [];
    }
  },

  /**
   * Fetches cities/municipalities for a province or region with caching.
   */
  async getCities(provincePsgc?: string, regionPsgc?: string): Promise<PsgcLocationDto[]> {
    const cacheKey = `cities:${provincePsgc || "none"}:${regionPsgc || "none"}`;
    const cached = getCachedLocations(cacheKey);
    if (cached) return cached;

    try {
      const params = new URLSearchParams();
      if (provincePsgc) params.set("provincePsgc", provincePsgc);
      if (regionPsgc) params.set("regionPsgc", regionPsgc);
      const qs = params.toString() ? `?${params.toString()}` : "";
      const res = await apiClient.get<PsgcLocationDto[] | { data: PsgcLocationDto[] }>(`/locations/psgc/cities${qs}`);
      const data = (res.data as any)?.data ?? res.data;
      if (Array.isArray(data)) {
        setCachedLocations(cacheKey, data);
        return data;
      }
      return [];
    } catch {
      return [];
    }
  },

  /**
   * Fetches barangays for a city/municipality with caching.
   */
  async getBarangays(cityMunicipalityPsgc: string): Promise<PsgcLocationDto[]> {
    if (!cityMunicipalityPsgc) return [];
    const cacheKey = `barangays:${cityMunicipalityPsgc}`;
    const cached = getCachedLocations(cacheKey);
    if (cached) return cached;

    try {
      const qs = `?cityMunicipalityPsgc=${encodeURIComponent(cityMunicipalityPsgc)}`;
      const res = await apiClient.get<PsgcLocationDto[] | { data: PsgcLocationDto[] }>(`/locations/psgc/barangays${qs}`);
      const data = (res.data as any)?.data ?? res.data;
      if (Array.isArray(data)) {
        setCachedLocations(cacheKey, data);
        return data;
      }
      return [];
    } catch {
      return [];
    }
  },

  /**
   * Searches locations by query string.
   */
  async searchLocations(query: string, limit: number = 50): Promise<PsgcLocationDto[]> {
    if (!query.trim()) return [];
    try {
      const res = await apiClient.get<PsgcLocationDto[] | { data: PsgcLocationDto[] }>(
        `/locations/psgc/search?q=${encodeURIComponent(query)}&limit=${limit}`
      );
      const data = (res.data as any)?.data ?? res.data;
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  },

  /**
   * Clears in-memory and persistent PSGC location caches.
   */
  clearCache(): void {
    locationMemoryCache.clear();
    if (typeof window !== "undefined") {
      try {
        for (let i = window.localStorage.length - 1; i >= 0; i--) {
          const key = window.localStorage.key(i);
          if (key?.startsWith("clinicez.portal.psgc.")) {
            window.localStorage.removeItem(key);
          }
        }
      } catch {}
    }
  },
};

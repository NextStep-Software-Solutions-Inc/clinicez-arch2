import type { EhrOptionDescriptor, OptionsManifestResponse } from "@shared/safe";
import { getPortalApiUrl } from "@/utils/domain";

interface CachedOptionSet {
  version: string;
  data: EhrOptionDescriptor[];
}

interface CachedManifest {
  version: string;
  data: OptionsManifestResponse;
}

const memoryCache = new Map<string, CachedOptionSet>();
let cachedManifest: CachedManifest | null = null;

export const optionsService = {
  /**
   * Retrieves an EhrOptionDescriptor set by name (e.g. "sex", "civil_status", "guardian_relationship").
   * Supports 2-tier caching (in-memory Map + browser localStorage) with SHA-256 ETag & HTTP 304 validation.
   */
  async getOptionSet(optionSet: string): Promise<EhrOptionDescriptor[]> {
    const normalizedSet = optionSet.toLowerCase().trim();
    const cacheKey = `clinicez.portal.options.${normalizedSet}`;

    // 1. In-memory check
    let cached = memoryCache.get(normalizedSet);

    // 2. Persistent localStorage check (browser only)
    if (!cached && typeof window !== "undefined") {
      try {
        const stored = window.localStorage.getItem(cacheKey);
        if (stored) {
          cached = JSON.parse(stored) as CachedOptionSet;
          if (cached?.data && Array.isArray(cached.data)) {
            memoryCache.set(normalizedSet, cached);
          } else {
            cached = undefined;
          }
        }
      } catch {
        // Safe fallback if localStorage disabled or corrupted
      }
    }

    const headers: Record<string, string> = { Accept: "application/json" };
    if (cached?.version) {
      headers["If-None-Match"] = cached.version;
    }

    try {
      const portalApiUrl = getPortalApiUrl();
      const response = await fetch(`${portalApiUrl}/public/options/${encodeURIComponent(normalizedSet)}`, {
        headers,
        cache: "no-store",
      });

      if (response.status === 304 && cached) {
        return cached.data;
      }

      if (response.ok) {
        const payload = await response.json();
        const data: EhrOptionDescriptor[] = Array.isArray(payload)
          ? payload
          : payload.data || [];
        const etag = response.headers.get("etag") || response.headers.get("ETag") || "";

        const newCached: CachedOptionSet = { version: etag, data };
        memoryCache.set(normalizedSet, newCached);

        if (typeof window !== "undefined") {
          try {
            window.localStorage.setItem(cacheKey, JSON.stringify(newCached));
          } catch {
            // Ignore storage quota errors
          }
        }
        return data;
      }
    } catch (err) {
      if (cached?.data) return cached.data;
    }

    return cached?.data ?? [];
  },

  /**
   * Retrieves the aggregate options manifest with version hashes.
   */
  async getManifest(): Promise<OptionsManifestResponse | null> {
    const cacheKey = "clinicez.portal.options.manifest";

    if (!cachedManifest && typeof window !== "undefined") {
      try {
        const stored = window.localStorage.getItem(cacheKey);
        if (stored) {
          cachedManifest = JSON.parse(stored) as CachedManifest;
        }
      } catch {}
    }

    const headers: Record<string, string> = { Accept: "application/json" };
    if (cachedManifest?.version) {
      headers["If-None-Match"] = cachedManifest.version;
    }

    try {
      const portalApiUrl = getPortalApiUrl();
      const response = await fetch(`${portalApiUrl}/public/options/manifest`, {
        headers,
        cache: "no-store",
      });

      if (response.status === 304 && cachedManifest) {
        return cachedManifest.data;
      }

      if (response.ok) {
        const payload: OptionsManifestResponse = await response.json();
        const etag = response.headers.get("etag") || response.headers.get("ETag") || "";
        cachedManifest = { version: etag, data: payload };

        if (typeof window !== "undefined") {
          try {
            window.localStorage.setItem(cacheKey, JSON.stringify(cachedManifest));
          } catch {}
        }
        return payload;
      }
    } catch {
      if (cachedManifest?.data) return cachedManifest.data;
    }

    return cachedManifest?.data ?? null;
  },

  /**
   * Clears both in-memory and persistent option caches.
   */
  clearCache(): void {
    memoryCache.clear();
    cachedManifest = null;
    if (typeof window !== "undefined") {
      try {
        for (let i = window.localStorage.length - 1; i >= 0; i--) {
          const key = window.localStorage.key(i);
          if (key?.startsWith("clinicez.portal.options.")) {
            window.localStorage.removeItem(key);
          }
        }
      } catch {}
    }
  },
};

import axios from 'axios';
import { ensureApiPrefix } from '@shared/safe';
import type { EhrOptionDescriptor } from '@shared/safe';
import { storage } from '../../utils/storage';

const BASE_URL = ensureApiPrefix(process.env.EXPO_PUBLIC_API_URL ?? '');

interface CachedOptionSet {
  version: string;
  data: EhrOptionDescriptor[];
}

const memoryCache = new Map<string, CachedOptionSet>();

export const optionsService = {
  async getOptionSet(optionSet: string): Promise<EhrOptionDescriptor[]> {
    const cacheKey = `clinicez.options.${optionSet}`;

    // 1. Check in-memory cache
    let cached = memoryCache.get(optionSet);

    // 2. Check persistent storage
    if (!cached) {
      try {
        const stored = await storage.getItemAsync(cacheKey);
        if (stored) {
          cached = JSON.parse(stored) as CachedOptionSet;
          memoryCache.set(optionSet, cached);
        }
      } catch {
        // Safe fallback if persistent storage is unavailable in testing/non-native
      }
    }

    const headers: Record<string, string> = {};
    if (cached?.version) {
      headers['If-None-Match'] = cached.version;
    }

    try {
      if (BASE_URL) {
        const url = `${BASE_URL}/options/${optionSet}`;
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
          const data = (envelope && typeof envelope === 'object' && 'data' in envelope && envelope.data)
            ? envelope.data
            : envelope;

          if (Array.isArray(data)) {
            const etag = response.headers?.etag || response.headers?.ETag || '';
            const newCached: CachedOptionSet = {
              version: etag,
              data,
            };
            memoryCache.set(optionSet, newCached);
            try {
              await storage.setItemAsync(cacheKey, JSON.stringify(newCached));
            } catch {
              // ignore storage write errors
            }
            return data;
          }
        }
      }
    } catch {
      if (cached?.data) {
        return cached.data;
      }
    }

    return cached?.data ?? [];
  },

  clearMemoryCache(): void {
    memoryCache.clear();
  },
};

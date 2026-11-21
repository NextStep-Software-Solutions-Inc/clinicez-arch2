import axios from 'axios';
import { ensureApiPrefix } from '@shared/safe';
import type { PsgcLocationDto } from '@shared/safe';
import { storage } from '../../utils/storage';

const API_BASE = ensureApiPrefix(process.env.EXPO_PUBLIC_API_URL ?? '');

const memoryCache = new Map<string, PsgcLocationDto[]>();

async function getCached(key: string): Promise<PsgcLocationDto[] | null> {
  if (memoryCache.has(key)) {
    return memoryCache.get(key)!;
  }
  try {
    const raw = await storage.getItemAsync(`clinicez.patient.psgc.${key}`);
    if (raw) {
      const parsed = JSON.parse(raw) as PsgcLocationDto[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        memoryCache.set(key, parsed);
        return parsed;
      }
    }
  } catch {
    // Ignore storage read error
  }
  return null;
}

async function setCached(key: string, data: PsgcLocationDto[]): Promise<void> {
  memoryCache.set(key, data);
  try {
    await storage.setItemAsync(`clinicez.patient.psgc.${key}`, JSON.stringify(data));
  } catch {
    // Ignore storage write error
  }
}

export const locationService = {
  async getRegions(): Promise<PsgcLocationDto[]> {
    const key = 'regions';
    const cached = await getCached(key);
    if (cached) return cached;

    if (!API_BASE) return [];
    try {
      const res = await axios.get(`${API_BASE}/locations/psgc/regions`, { timeout: 10_000 });
      const envelope = res.data;
      const data = envelope && typeof envelope === 'object' && 'data' in envelope ? envelope.data : envelope;
      if (Array.isArray(data)) {
        await setCached(key, data);
        return data;
      }
    } catch {
      // Return empty if endpoint unreachable
    }
    return [];
  },

  async getProvinces(regionPsgc?: string): Promise<PsgcLocationDto[]> {
    if (!regionPsgc) return [];
    const key = `provinces.${regionPsgc}`;
    const cached = await getCached(key);
    if (cached) return cached;

    if (!API_BASE) return [];
    try {
      const res = await axios.get(`${API_BASE}/locations/psgc/provinces?regionPsgc=${encodeURIComponent(regionPsgc)}`, { timeout: 10_000 });
      const envelope = res.data;
      const data = envelope && typeof envelope === 'object' && 'data' in envelope ? envelope.data : envelope;
      if (Array.isArray(data)) {
        await setCached(key, data);
        return data;
      }
    } catch {
      // Fallback
    }
    return [];
  },

  async getCities(provincePsgc?: string, regionPsgc?: string): Promise<PsgcLocationDto[]> {
    const key = `cities.${provincePsgc ?? ''}.${regionPsgc ?? ''}`;
    const cached = await getCached(key);
    if (cached) return cached;

    if (!API_BASE) return [];
    try {
      const params = new URLSearchParams();
      if (provincePsgc) params.set('provincePsgc', provincePsgc);
      if (regionPsgc) params.set('regionPsgc', regionPsgc);
      const res = await axios.get(`${API_BASE}/locations/psgc/cities?${params.toString()}`, { timeout: 10_000 });
      const envelope = res.data;
      const data = envelope && typeof envelope === 'object' && 'data' in envelope ? envelope.data : envelope;
      if (Array.isArray(data)) {
        await setCached(key, data);
        return data;
      }
    } catch {
      // Fallback
    }
    return [];
  },

  async getBarangays(cityMunicipalityPsgc: string): Promise<PsgcLocationDto[]> {
    if (!cityMunicipalityPsgc) return [];
    const key = `barangays.${cityMunicipalityPsgc}`;
    const cached = await getCached(key);
    if (cached) return cached;

    if (!API_BASE) return [];
    try {
      const res = await axios.get(`${API_BASE}/locations/psgc/barangays?cityMunicipalityPsgc=${encodeURIComponent(cityMunicipalityPsgc)}`, { timeout: 10_000 });
      const envelope = res.data;
      const data = envelope && typeof envelope === 'object' && 'data' in envelope ? envelope.data : envelope;
      if (Array.isArray(data)) {
        await setCached(key, data);
        return data;
      }
    } catch {
      // Fallback
    }
    return [];
  },

  async searchLocations(query: string, limit: number = 50): Promise<PsgcLocationDto[]> {
    if (!query || !API_BASE) return [];
    try {
      const res = await axios.get(`${API_BASE}/locations/psgc/search?q=${encodeURIComponent(query)}&limit=${limit}`, { timeout: 10_000 });
      const envelope = res.data;
      const data = envelope && typeof envelope === 'object' && 'data' in envelope ? envelope.data : envelope;
      if (Array.isArray(data)) {
        return data;
      }
    } catch {
      // Fallback
    }
    return [];
  },

  clearMemoryCache(): void {
    memoryCache.clear();
  },
};

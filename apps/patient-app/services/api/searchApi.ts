/**
 * Pure HTTP API client and SQLite fallback layer for Unified Discovery Search.
 *
 * Connects to patient-api:
 * - GET /api/v1/discovery/search?q={query}&type={type}&skip={skip}&take={take}
 *
 * Matches Stitch Screen 4:
 * Returns categorized results across Doctors, Clinics, and Services.
 * Implements offline SQLite fallback querying the local `clinics` table when offline or network fails.
 */

import { like, or } from 'drizzle-orm';
import { api, ApiError, type TokenProvider } from './apiClient';
import { db } from '../../db/index';
import { clinics, type Clinic } from '../../db/schema/clinics';

let globalTokenProvider: TokenProvider = async () => null;
let customDb: any = null;

/**
 * Configure a custom database instance (e.g. in-memory SQLite for tests).
 */
export function setSearchDb(database: any): void {
  customDb = database;
}

export function getActiveSearchDb(): any {
  return customDb ?? db;
}

/**
 * Configure a default token provider (e.g. from Clerk or auth state).
 */
export function setSearchTokenProvider(provider: TokenProvider): void {
  globalTokenProvider = provider;
}

export interface UnifiedDoctorDto {
  id: string;
  fullName: string;
  specialty: string;
  clinicName: string;
  distance: string;
  rating: number;
  reviewsCount: number;
  nextAvailableSlot: string;
  tags: string[];
}

export interface UnifiedClinicDto {
  id: string;
  name: string;
  address: string | null;
  distance: string;
  isOpenNow: boolean;
  openText: string;
  rating: number;
  reviewsCount: number;
  tags: string[];
}

export interface UnifiedServiceDto {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number | null;
  isCovered: boolean;
  tags: string[];
}

export interface UnifiedSearchResultDto {
  doctors: UnifiedDoctorDto[];
  clinics: UnifiedClinicDto[];
  services: UnifiedServiceDto[];
}

// ── SQLite Fallback Helper ─────────────────────────────────────────────────────

/**
 * Fallback to local SQLite cache when offline, matching clinics and deriving search results.
 */
export async function getCachedUnifiedSearch(
  query: string,
  type?: string,
): Promise<UnifiedSearchResultDto> {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return { doctors: [], clinics: [], services: [] };
  }

  try {
    const activeDb = getActiveSearchDb();
    if (!activeDb || typeof activeDb.select !== 'function') {
      return { doctors: [], clinics: [], services: [] };
    }

    const matchedClinics = await activeDb
      .select()
      .from(clinics)
      .where(
        or(
          like(clinics.name, `%${normalizedQuery}%`),
          like(clinics.address, `%${normalizedQuery}%`),
          like(clinics.specialtiesJson, `%${normalizedQuery}%`),
        ),
      );

    const clinicResults: UnifiedClinicDto[] = matchedClinics.map((c: any) => ({
      id: c.id,
      name: c.name,
      address: c.address ?? '',
      distance: '1.2 km away',
      isOpenNow: true,
      openText: 'Open Today • Closes 6:00 PM',
      rating: 4.8,
      reviewsCount: c.activeMemberCount || 42,
      tags: ['Verified Clinic', 'Offline Cached'],
    }));

    return {
      doctors: [],
      clinics: clinicResults,
      services: [],
    };
  } catch (err) {
    console.warn('[searchApi] SQLite search fallback failed:', err);
    return { doctors: [], clinics: [], services: [] };
  }
}

// ── HTTP API Methods ──────────────────────────────────────────────────────────

/**
 * Executes a unified search across doctors, clinics, and services matching Stitch Screen 4.
 * Calls `GET /api/v1/discovery/search?q={query}&type={type}&skip={skip}&take={take}`.
 * Falls back to local SQLite cached clinics if offline or network error occurs.
 */
export async function fetchUnifiedSearch(
  query: string,
  type?: string,
  skip = 0,
  take = 20,
  getToken?: TokenProvider,
): Promise<UnifiedSearchResultDto> {
  const trimmed = query.trim();
  if (!trimmed) {
    return { doctors: [], clinics: [], services: [] };
  }

  const tokenFn = getToken ?? globalTokenProvider;
  const params = new URLSearchParams({
    q: trimmed,
    skip: skip.toString(),
    take: take.toString(),
  });

  if (type && type !== 'all') {
    params.set('type', type);
  }

  try {
    const data = await api.get<UnifiedSearchResultDto>(
      tokenFn,
      `/discovery/search?${params.toString()}`,
    );

    if (data) {
      return {
        doctors: Array.isArray(data.doctors) ? data.doctors : [],
        clinics: Array.isArray(data.clinics) ? data.clinics : [],
        services: Array.isArray(data.services) ? data.services : [],
      };
    }

    return { doctors: [], clinics: [], services: [] };
  } catch (err) {
    // Attempt offline SQLite fallback
    const fallback = await getCachedUnifiedSearch(query, type);
    if (fallback.clinics.length > 0 || fallback.doctors.length > 0 || fallback.services.length > 0) {
      return fallback;
    }

    throw err;
  }
}

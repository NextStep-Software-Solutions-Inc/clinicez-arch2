import type { PsgcLocationDto, StructuredPsgcAddress } from '@shared/safe';

export const NCR_REGION_PSGC = '1300000000';

export interface PsgcLocationClient {
  getProvinces(regionPsgc?: string): Promise<PsgcLocationDto[]>;
  getCities(provincePsgc?: string, regionPsgc?: string): Promise<PsgcLocationDto[]>;
  getBarangays(cityMunicipalityPsgc: string): Promise<PsgcLocationDto[]>;
}

export interface RegionCascadeResult {
  provinces: PsgcLocationDto[];
  cities: PsgcLocationDto[] | null;
  bypassProvince: boolean;
}

export interface ProvinceCascadeResult {
  preserveCities: boolean;
  cities: PsgcLocationDto[] | null;
}

export interface AddressValidationErrors {
  region?: string;
  province?: string;
  cityMunicipality?: string;
  barangay?: string;
}

export interface AddressValidationInput extends StructuredPsgcAddress {
  type?: string | null;
  region?: string | null;
  province?: string | null;
  cityMunicipality?: string | null;
  barangay?: string | null;
}

/**
 * Returns true if the given PSGC region code or region name represents
 * Metro Manila / National Capital Region (NCR), which bypasses the Province tier
 * even though the PSGC catalog lists 4 statistical districts under level `P`.
 */
export function isNcrRegion(
  regionPsgc?: string | null,
  regionName?: string | null,
): boolean {
  if (regionPsgc?.trim() === NCR_REGION_PSGC) {
    return true;
  }

  const normalizedName = regionName?.trim().toLowerCase() ?? '';
  if (!normalizedName) {
    return false;
  }

  return (
    normalizedName.includes('ncr') ||
    normalizedName.includes('national capital')
  );
}

/**
 * Normalizes Philippine PSGC location names for resilient name-to-code matching:
 * strips diacritics (e.g. Parañaque -> paranaque), lowercases, and collapses
 * punctuation/whitespace.
 */
export function normalizePsgcName(name?: string | null): string {
  if (!name) {
    return '';
  }

  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function stripLocationAffixes(normalized: string): string {
  return normalized
    .replace(/^(?:city of|municipality of|province of|barangay|brgy)\s+/, '')
    .replace(/\s+(?:city|municipality|province|region)$/, '')
    .trim();
}

function extractLocationNameVariants(rawName: string): string[] {
  const variants = new Set<string>();
  const withoutParens = normalizePsgcName(rawName.replace(/\([^)]*\)/g, ' '));
  if (withoutParens) {
    variants.add(withoutParens);
    const strippedOutside = stripLocationAffixes(withoutParens);
    if (strippedOutside) {
      variants.add(strippedOutside);
    }
  }

  const parenMatches = rawName.match(/\(([^)]+)\)/g);
  if (parenMatches) {
    for (const segment of parenMatches) {
      const inner = normalizePsgcName(segment.slice(1, -1));
      if (inner) {
        variants.add(inner);
        const strippedInner = stripLocationAffixes(inner);
        if (strippedInner) {
          variants.add(strippedInner);
        }
      }
    }
  }

  return Array.from(variants);
}

export function getPsgcLocationCode(location: PsgcLocationDto): string {
  return (location.psgcCode || location.code || '').trim();
}

/**
 * Matches a persisted legacy/text-only location name against a parent-scoped
 * list of PSGC catalog entries without introducing false-positive partial matches.
 */
export function matchPsgcLocationByName(
  name: string | null | undefined,
  options: ReadonlyArray<PsgcLocationDto>,
): PsgcLocationDto | null {
  const raw = name?.trim();
  if (!raw || options.length === 0) {
    return null;
  }

  // Direct PSGC code match if a legacy field stored the code itself
  const exactCodeMatch = options.find((opt) => getPsgcLocationCode(opt) === raw);
  if (exactCodeMatch) {
    return exactCodeMatch;
  }

  const normalizedTarget = normalizePsgcName(raw);
  if (!normalizedTarget) {
    return null;
  }

  // Pass 1: Exact normalized name match
  const exactMatches = options.filter((opt) => normalizePsgcName(opt.name) === normalizedTarget);
  if (exactMatches.length > 0) {
    return exactMatches[0];
  }

  // Pass 2: Unambiguous administrative affix-stripped match
  // (e.g. "Makati" / "Makati City" <-> "City of Makati", "Brgy. Bel-Air" <-> "Bel-Air")
  const strippedTarget = stripLocationAffixes(normalizedTarget);
  if (strippedTarget) {
    const affixMatches = options.filter(
      (opt) => stripLocationAffixes(normalizePsgcName(opt.name)) === strippedTarget,
    );
    if (affixMatches.length === 1) {
      return affixMatches[0];
    }
  }

  // Pass 3: Unambiguous parenthetical shorthand match
  // (e.g. "Region IV-A" or "CALABARZON" <-> "Region IV-A (CALABARZON)",
  //  "National Capital Region" or "NCR" <-> "National Capital Region (NCR)")
  const targetVariants = new Set<string>([
    normalizedTarget,
    ...(strippedTarget ? [strippedTarget] : []),
    ...extractLocationNameVariants(raw),
  ]);

  const variantMatches = options.filter((opt) => {
    const optNormalized = normalizePsgcName(opt.name);
    const optStripped = stripLocationAffixes(optNormalized);
    const optVariants = extractLocationNameVariants(opt.name);
    return (
      targetVariants.has(optNormalized) ||
      (optStripped.length > 0 && targetVariants.has(optStripped)) ||
      optVariants.some((variant) => variant === normalizedTarget || (strippedTarget.length > 0 && variant === strippedTarget))
    );
  });

  if (variantMatches.length === 1) {
    return variantMatches[0];
  }

  return null;
}

/**
 * Resolves the effective Region PSGC code from an existing code, loaded regions,
 * or immediate NCR canonical fallback (`1300000000`) when regionName indicates NCR.
 */
export function resolveRegionPsgc(
  params: { regionPsgc?: string | null; regionName?: string | null },
  regions: ReadonlyArray<PsgcLocationDto>,
): string | null {
  const existing = params.regionPsgc?.trim();
  if (existing) {
    return existing;
  }

  const matched = matchPsgcLocationByName(params.regionName, regions);
  if (matched) {
    return getPsgcLocationCode(matched) || null;
  }

  if (isNcrRegion(null, params.regionName)) {
    return NCR_REGION_PSGC;
  }

  return null;
}

export interface ResolvedLocationPsgc {
  code: string;
  matched: PsgcLocationDto | null;
}

/**
 * Resolves the effective PSGC code for a province, city/municipality, or barangay
 * from an existing code or by matching its persisted name against parent-scoped options.
 */
export function resolveLocationPsgc(
  existingCode: string | null | undefined,
  name: string | null | undefined,
  options: ReadonlyArray<PsgcLocationDto>,
): ResolvedLocationPsgc | null {
  const existing = existingCode?.trim();
  if (existing) {
    return { code: existing, matched: null };
  }

  const matched = matchPsgcLocationByName(name, options);
  if (!matched) {
    return null;
  }

  const code = getPsgcLocationCode(matched);
  return code ? { code, matched } : null;
}

/**
 * Determines whether the Province picker should be bypassed and cities loaded
 * directly under the Region. Handles NCR (even when the PSGC API returns NCR's
 * 4 statistical districts) as well as any generic region whose fetched province
 * list is empty.
 */
export function shouldBypassProvinceTier(params: {
  regionPsgc?: string | null;
  regionName?: string | null;
  provincesCount?: number;
  provincesLoadedForRegion?: string | null;
}): boolean {
  const { regionPsgc, regionName, provincesCount = 0, provincesLoadedForRegion } = params;

  if (isNcrRegion(regionPsgc, regionName)) {
    return true;
  }

  const trimmedRegion = regionPsgc?.trim();
  return Boolean(
    trimmedRegion &&
      provincesLoadedForRegion === trimmedRegion &&
      provincesCount === 0,
  );
}

const hasNonEmpty = (...values: Array<string | null | undefined>): boolean =>
  values.some((v) => typeof v === 'string' && v.trim().length > 0);

/**
 * Validates required address hierarchy fields before persisting an address record.
 * Secondary addresses with `isSameAsPermanent === true` bypass manual PSGC selection.
 */
export function validateAddressForm(
  data: AddressValidationInput,
  options?: { bypassProvince?: boolean },
): AddressValidationErrors {
  if (data.type === 'secondary' && Boolean(data.isSameAsPermanent)) {
    return {};
  }

  const errors: AddressValidationErrors = {};

  const hasRegion = hasNonEmpty(data.regionPsgc, data.regionName, data.region);
  const hasProvince = hasNonEmpty(data.provincePsgc, data.provinceName, data.province);
  const hasCity = hasNonEmpty(
    data.cityMunicipalityPsgc,
    data.cityMunicipalityName,
    data.cityMunicipality,
  );
  const hasBarangay = hasNonEmpty(
    data.barangayPsgc,
    data.barangayName,
    data.barangay,
  );

  if (!hasRegion) {
    errors.region = 'Region is required.';
  }

  const regionNameForCheck = data.regionName ?? data.region ?? null;
  const skipProvince =
    Boolean(options?.bypassProvince) ||
    isNcrRegion(data.regionPsgc, regionNameForCheck);

  if (hasRegion && !skipProvince && !hasProvince) {
    errors.province = 'Province is required.';
  }

  if (!hasCity) {
    errors.cityMunicipality = 'City / Municipality is required.';
  }

  if (!hasBarangay) {
    errors.barangay = 'Barangay is required.';
  }

  return errors;
}

export function hasAddressValidationErrors(errors: AddressValidationErrors): boolean {
  return Boolean(
    errors.region ||
      errors.province ||
      errors.cityMunicipality ||
      errors.barangay,
  );
}

/**
 * Loads provinces or direct cities when a Region is selected.
 * For NCR (which has 4 district entries in the PSGC province table), bypasses
 * the province tier and fetches cities directly by `regionPsgc`.
 * For any other region, loads provinces first and falls back to direct region
 * cities only when the region has zero provinces.
 */
export async function fetchRegionDependentLocations(
  regionPsgc: string,
  regionName: string | null | undefined,
  client: Pick<PsgcLocationClient, 'getProvinces' | 'getCities'>,
): Promise<RegionCascadeResult> {
  if (isNcrRegion(regionPsgc, regionName)) {
    const cities = await client.getCities(undefined, regionPsgc);
    return {
      provinces: [],
      cities,
      bypassProvince: true,
    };
  }

  const provinces = await client.getProvinces(regionPsgc);
  if (provinces.length === 0) {
    const cities = await client.getCities(undefined, regionPsgc);
    return {
      provinces: [],
      cities,
      bypassProvince: true,
    };
  }

  return {
    provinces,
    cities: null,
    bypassProvince: false,
  };
}

/**
 * Loads cities when a Province changes in non-NCR regions.
 * When `bypassProvince` is true (e.g. NCR), preserves the region-loaded cities
 * instead of clearing them.
 */
export async function fetchProvinceDependentCities(
  params: {
    regionPsgc?: string | null;
    provincePsgc?: string | null;
    bypassProvince: boolean;
  },
  client: Pick<PsgcLocationClient, 'getCities'>,
): Promise<ProvinceCascadeResult> {
  if (params.bypassProvince) {
    return {
      preserveCities: true,
      cities: null,
    };
  }

  if (!params.provincePsgc) {
    return {
      preserveCities: false,
      cities: [],
    };
  }

  const cities = await client.getCities(
    params.provincePsgc,
    params.regionPsgc || undefined,
  );
  return {
    preserveCities: false,
    cities,
  };
}

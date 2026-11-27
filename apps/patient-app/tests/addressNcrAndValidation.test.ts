import { describe, test, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import axios from 'axios';
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { patientAddresses } from '../db/schema/patientAddresses';
import {
  NCR_REGION_PSGC,
  isNcrRegion,
  shouldBypassProvinceTier,
  validateAddressForm,
  hasAddressValidationErrors,
  fetchRegionDependentLocations,
  fetchProvinceDependentCities,
  normalizePsgcName,
  matchPsgcLocationByName,
  resolveRegionPsgc,
  resolveLocationPsgc,
  type AddressValidationInput,
} from '../utils/addressValidation';
import type { PsgcLocationDto } from '@shared/safe';

const APP_ROOT = join(import.meta.dir, '..');
const readAppFile = (relativePath: string) => readFileSync(join(APP_ROOT, relativePath), 'utf8');

process.env.EXPO_PUBLIC_API_URL = 'https://patient.dev.clinicez.test';

const { locationService } = await import('../services/api/locationService');

const NCR_FOUR_DISTRICTS: PsgcLocationDto[] = [
  { psgcCode: '1339000000', name: 'NCR, City of Manila, First District', level: 'Province', regionPsgc: NCR_REGION_PSGC },
  { psgcCode: '1374000000', name: 'NCR, Second District', level: 'Province', regionPsgc: NCR_REGION_PSGC },
  { psgcCode: '1375000000', name: 'NCR, Third District', level: 'Province', regionPsgc: NCR_REGION_PSGC },
  { psgcCode: '1376000000', name: 'NCR, Fourth District', level: 'Province', regionPsgc: NCR_REGION_PSGC },
];

const NCR_CITIES: PsgcLocationDto[] = [
  { psgcCode: '1339000000', name: 'City of Manila', level: 'CityMunicipality', regionPsgc: NCR_REGION_PSGC, zipCode: '1000' },
  { psgcCode: '1374040000', name: 'Quezon City', level: 'CityMunicipality', regionPsgc: NCR_REGION_PSGC, zipCode: '1100' },
  { psgcCode: '1376020000', name: 'City of Makati', level: 'CityMunicipality', regionPsgc: NCR_REGION_PSGC, zipCode: '1200' },
  { psgcCode: '1376070000', name: 'City of Taguig', level: 'CityMunicipality', regionPsgc: NCR_REGION_PSGC, zipCode: '1630' },
];

const MAKATI_BARANGAYS: PsgcLocationDto[] = [
  { psgcCode: '137602002', name: 'Bel-Air', level: 'Barangay', regionPsgc: NCR_REGION_PSGC, cityMunicipalityPsgc: '1376020000' },
  { psgcCode: '137602023', name: 'Poblacion', level: 'Barangay', regionPsgc: NCR_REGION_PSGC, cityMunicipalityPsgc: '1376020000' },
];

const CALABARZON_PROVINCES: PsgcLocationDto[] = [
  { psgcCode: '0421000000', name: 'Cavite', level: 'Province', regionPsgc: '0400000000' },
  { psgcCode: '0434000000', name: 'Laguna', level: 'Province', regionPsgc: '0400000000' },
];

const CAVITE_CITIES: PsgcLocationDto[] = [
  { psgcCode: '0421080000', name: 'City of Imus', level: 'CityMunicipality', regionPsgc: '0400000000', provincePsgc: '0421000000', zipCode: '4103' },
];

const IMUS_BARANGAYS: PsgcLocationDto[] = [
  { psgcCode: '042108001', name: 'Alapan I-A', level: 'Barangay', regionPsgc: '0400000000', provincePsgc: '0421000000', cityMunicipalityPsgc: '0421080000' },
];

describe('Issue #238: NCR PSGC cascading selection & incomplete address validation', () => {
  beforeEach(() => {
    locationService.clearMemoryCache();
    globalThis.__secureStoreMap?.clear();
  });

  afterEach(() => {
    locationService.clearMemoryCache();
    globalThis.__secureStoreMap?.clear();
  });

  describe('NCR detection & province bypass rules', () => {
    test('identifies NCR by PSGC code 1300000000 or region name regardless of case', () => {
      expect(isNcrRegion('1300000000', null)).toBe(true);
      expect(isNcrRegion(' 1300000000 ', '')).toBe(true);
      expect(isNcrRegion(null, 'National Capital Region (NCR)')).toBe(true);
      expect(isNcrRegion(null, 'national capital region')).toBe(true);
      expect(isNcrRegion('0400000000', 'Region IV-A (CALABARZON)')).toBe(false);
      expect(isNcrRegion(null, null)).toBe(false);
    });

    test('bypasses province tier for NCR even when catalog has 4 district entries', () => {
      expect(
        shouldBypassProvinceTier({
          regionPsgc: NCR_REGION_PSGC,
          regionName: 'National Capital Region (NCR)',
          provincesCount: NCR_FOUR_DISTRICTS.length,
          provincesLoadedForRegion: NCR_REGION_PSGC,
        }),
      ).toBe(true);
    });

    test('does not flash-bypass province tier for non-NCR regions while provinces are still loading', () => {
      expect(
        shouldBypassProvinceTier({
          regionPsgc: '0400000000',
          regionName: 'Region IV-A (CALABARZON)',
          provincesCount: 0,
          provincesLoadedForRegion: null,
        }),
      ).toBe(false);

      expect(
        shouldBypassProvinceTier({
          regionPsgc: '0400000000',
          regionName: 'Region IV-A (CALABARZON)',
          provincesCount: CALABARZON_PROVINCES.length,
          provincesLoadedForRegion: '0400000000',
        }),
      ).toBe(false);
    });

    test('bypasses province tier for any generic region once loaded with 0 provinces', () => {
      expect(
        shouldBypassProvinceTier({
          regionPsgc: '9900000000',
          regionName: 'Special Charter Region',
          provincesCount: 0,
          provincesLoadedForRegion: '9900000000',
        }),
      ).toBe(true);
    });
  });

  describe('PSGC cascading fetch workflow (real PSGC NCR 4-district catalog behavior)', () => {
    test('NCR loads cities directly via regionPsgc=1300000000, preserves cities on null province, and cascades to barangays', async () => {
      const requestedUrls: string[] = [];
      const getSpy = spyOn(axios, 'get').mockImplementation(async (url: string) => {
        requestedUrls.push(url);
        if (url.includes('/locations/psgc/provinces?regionPsgc=1300000000')) {
          // Real PSGC catalog returns 4 districts (NOT empty array)
          return { data: { succeeded: true, data: NCR_FOUR_DISTRICTS } } as any;
        }
        if (url.includes('/locations/psgc/cities') && url.includes('regionPsgc=1300000000')) {
          return { data: { succeeded: true, data: NCR_CITIES } } as any;
        }
        if (url.includes('/locations/psgc/barangays?cityMunicipalityPsgc=1376020000')) {
          return { data: { succeeded: true, data: MAKATI_BARANGAYS } } as any;
        }
        throw new Error(`Unexpected URL: ${url}`);
      });

      try {
        // 1. User selects National Capital Region (NCR)
        const regionCascade = await fetchRegionDependentLocations(
          NCR_REGION_PSGC,
          'National Capital Region (NCR)',
          locationService,
        );

        expect(regionCascade.bypassProvince).toBe(true);
        expect(regionCascade.provinces).toEqual([]);
        expect(regionCascade.cities).toEqual(NCR_CITIES);
        expect(requestedUrls.some((u) => u.includes('/locations/psgc/cities?regionPsgc=1300000000'))).toBe(true);

        // 2. Province effect runs with provincePsgc=null and bypassProvince=true -> MUST NOT clear NCR cities
        const provinceCascade = await fetchProvinceDependentCities(
          {
            regionPsgc: NCR_REGION_PSGC,
            provincePsgc: null,
            bypassProvince: regionCascade.bypassProvince,
          },
          locationService,
        );
        expect(provinceCascade.preserveCities).toBe(true);
        expect(provinceCascade.cities).toBeNull();

        // 3. User selects City of Makati -> barangays cascade cleanly
        const barangays = await locationService.getBarangays('1376020000');
        expect(barangays).toEqual(MAKATI_BARANGAYS);
        expect(barangays.map((b) => b.name)).toEqual(['Bel-Air', 'Poblacion']);
      } finally {
        getSpy.mockRestore();
      }
    });

    test('Non-NCR region loads provinces first, clears cities when province is empty, then loads cities and barangays', async () => {
      const getSpy = spyOn(axios, 'get').mockImplementation(async (url: string) => {
        if (url.includes('/locations/psgc/provinces?regionPsgc=0400000000')) {
          return { data: { succeeded: true, data: CALABARZON_PROVINCES } } as any;
        }
        if (url.includes('/locations/psgc/cities') && url.includes('provincePsgc=0421000000')) {
          return { data: { succeeded: true, data: CAVITE_CITIES } } as any;
        }
        if (url.includes('/locations/psgc/barangays?cityMunicipalityPsgc=0421080000')) {
          return { data: { succeeded: true, data: IMUS_BARANGAYS } } as any;
        }
        throw new Error(`Unexpected URL: ${url}`);
      });

      try {
        const regionCascade = await fetchRegionDependentLocations(
          '0400000000',
          'Region IV-A (CALABARZON)',
          locationService,
        );
        expect(regionCascade.bypassProvince).toBe(false);
        expect(regionCascade.provinces).toEqual(CALABARZON_PROVINCES);
        expect(regionCascade.cities).toBeNull();

        const beforeProvince = await fetchProvinceDependentCities(
          { regionPsgc: '0400000000', provincePsgc: null, bypassProvince: false },
          locationService,
        );
        expect(beforeProvince.preserveCities).toBe(false);
        expect(beforeProvince.cities).toEqual([]);

        const afterProvince = await fetchProvinceDependentCities(
          { regionPsgc: '0400000000', provincePsgc: '0421000000', bypassProvince: false },
          locationService,
        );
        expect(afterProvince.preserveCities).toBe(false);
        expect(afterProvince.cities).toEqual(CAVITE_CITIES);

        const barangays = await locationService.getBarangays('0421080000');
        expect(barangays).toEqual(IMUS_BARANGAYS);
      } finally {
        getSpy.mockRestore();
      }
    });

    test('Generic zero-province region falls back to direct region cities', async () => {
      const mockCities: PsgcLocationDto[] = [
        { psgcCode: '9901010000', name: 'Charter City', level: 'CityMunicipality', regionPsgc: '9900000000' },
      ];
      const getSpy = spyOn(axios, 'get').mockImplementation(async (url: string) => {
        if (url.includes('/locations/psgc/provinces?regionPsgc=9900000000')) {
          return { data: { succeeded: true, data: [] } } as any;
        }
        if (url.includes('/locations/psgc/cities?regionPsgc=9900000000')) {
          return { data: { succeeded: true, data: mockCities } } as any;
        }
        throw new Error(`Unexpected URL: ${url}`);
      });

      try {
        const regionCascade = await fetchRegionDependentLocations('9900000000', 'Charter Region', locationService);
        expect(regionCascade.bypassProvince).toBe(true);
        expect(regionCascade.cities).toEqual(mockCities);
      } finally {
        getSpy.mockRestore();
      }
    });
  });

  describe('Client-side address form validation & incomplete save prevention', () => {
    test('rejects blank address with Region, City / Municipality, and Barangay errors', () => {
      const errors = validateAddressForm({
        type: 'primary',
        regionPsgc: null,
        regionName: null,
        provincePsgc: null,
        provinceName: null,
        cityMunicipalityPsgc: null,
        cityMunicipalityName: null,
        barangayPsgc: null,
        barangayName: null,
        isSameAsPermanent: false,
      });

      expect(hasAddressValidationErrors(errors)).toBe(true);
      expect(errors.region).toBeTruthy();
      expect(errors.province).toBeUndefined();
      expect(errors.cityMunicipality).toBeTruthy();
      expect(errors.barangay).toBeTruthy();
    });

    test('rejects incomplete NCR address missing City / Municipality and Barangay (no Province error)', () => {
      const errors = validateAddressForm({
        type: 'primary',
        regionPsgc: NCR_REGION_PSGC,
        regionName: 'National Capital Region (NCR)',
        provincePsgc: null,
        provinceName: null,
        cityMunicipalityPsgc: null,
        cityMunicipalityName: null,
        barangayPsgc: null,
        barangayName: null,
        houseStreet: 'Unit 402, Ayala Ave',
        streetBarangay: 'Unit 402, Ayala Ave',
        isSameAsPermanent: false,
      });

      expect(hasAddressValidationErrors(errors)).toBe(true);
      expect(errors.region).toBeUndefined();
      expect(errors.province).toBeUndefined();
      expect(errors.cityMunicipality).toBe('City / Municipality is required.');
      expect(errors.barangay).toBe('Barangay is required.');
    });

    test('rejects NCR address that has City selected but is missing Barangay', () => {
      const errors = validateAddressForm({
        type: 'primary',
        regionPsgc: NCR_REGION_PSGC,
        regionName: 'National Capital Region (NCR)',
        cityMunicipalityPsgc: '1376020000',
        cityMunicipalityName: 'City of Makati',
        barangayPsgc: null,
        barangayName: null,
        isSameAsPermanent: false,
      });

      expect(hasAddressValidationErrors(errors)).toBe(true);
      expect(errors.region).toBeUndefined();
      expect(errors.province).toBeUndefined();
      expect(errors.cityMunicipality).toBeUndefined();
      expect(errors.barangay).toBe('Barangay is required.');
    });

    test('accepts complete NCR address without Province', () => {
      const errors = validateAddressForm({
        type: 'primary',
        regionPsgc: NCR_REGION_PSGC,
        regionName: 'National Capital Region (NCR)',
        provincePsgc: null,
        provinceName: null,
        cityMunicipalityPsgc: '1376020000',
        cityMunicipalityName: 'City of Makati',
        barangayPsgc: '137602002',
        barangayName: 'Bel-Air',
        isSameAsPermanent: false,
      });

      expect(hasAddressValidationErrors(errors)).toBe(false);
      expect(errors).toEqual({});
    });

    test('requires Province, City / Municipality, and Barangay for non-NCR regions', () => {
      const missingProvince = validateAddressForm({
        type: 'primary',
        regionPsgc: '0400000000',
        regionName: 'Region IV-A (CALABARZON)',
        provincePsgc: null,
        provinceName: null,
        cityMunicipalityPsgc: null,
        cityMunicipalityName: null,
        barangayPsgc: null,
        barangayName: null,
        isSameAsPermanent: false,
      });
      expect(missingProvince.region).toBeUndefined();
      expect(missingProvince.province).toBe('Province is required.');
      expect(missingProvince.cityMunicipality).toBe('City / Municipality is required.');
      expect(missingProvince.barangay).toBe('Barangay is required.');

      const completeNonNcr = validateAddressForm({
        type: 'primary',
        regionPsgc: '0400000000',
        regionName: 'Region IV-A (CALABARZON)',
        provincePsgc: '0421000000',
        provinceName: 'Cavite',
        cityMunicipalityPsgc: '0421080000',
        cityMunicipalityName: 'City of Imus',
        barangayPsgc: '042108001',
        barangayName: 'Alapan I-A',
        isSameAsPermanent: false,
      });
      expect(hasAddressValidationErrors(completeNonNcr)).toBe(false);
    });

    test('allows secondary address with isSameAsPermanent=true without manual PSGC fields, but still validates primary addresses', () => {
      const secondarySame = validateAddressForm({
        type: 'secondary',
        isSameAsPermanent: true,
        regionPsgc: null,
        provincePsgc: null,
        cityMunicipalityPsgc: null,
        barangayPsgc: null,
      });
      expect(hasAddressValidationErrors(secondarySame)).toBe(false);

      // A primary address cannot bypass validation via isSameAsPermanent
      const primaryWithFlag = validateAddressForm({
        type: 'primary',
        isSameAsPermanent: true,
        regionPsgc: null,
        provincePsgc: null,
        cityMunicipalityPsgc: null,
        barangayPsgc: null,
      });
      expect(hasAddressValidationErrors(primaryWithFlag)).toBe(true);
      expect(primaryWithFlag.region).toBeTruthy();
      expect(primaryWithFlag.cityMunicipality).toBeTruthy();
      expect(primaryWithFlag.barangay).toBeTruthy();
    });

    test('SQLite persistence integration: blocks incomplete NCR save and persists only validated complete NCR address', async () => {
      const sqlite = new Database(':memory:');
      sqlite.exec(`
        CREATE TABLE patients (
          id text PRIMARY KEY NOT NULL,
          first_name text NOT NULL,
          last_name text NOT NULL,
          created_at integer NOT NULL,
          updated_at integer NOT NULL
        );
        CREATE TABLE patient_addresses (
          id text PRIMARY KEY NOT NULL,
          patient_id text NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
          type text NOT NULL DEFAULT 'primary',
          house_street text,
          barangay text,
          city_municipality text,
          province text,
          region text,
          zip_code text,
          country text DEFAULT 'Philippines',
          region_psgc text,
          province_psgc text,
          city_municipality_psgc text,
          barangay_psgc text,
          region_name text,
          province_name text,
          city_municipality_name text,
          barangay_name text,
          is_same_as_permanent integer DEFAULT 0,
          created_at integer NOT NULL,
          updated_at integer NOT NULL,
          synced_at integer,
          server_id text,
          deleted_at integer
        );
      `);
      const db = drizzle(sqlite);
      const now = new Date();
      sqlite.exec(
        `INSERT INTO patients (id, first_name, last_name, created_at, updated_at) VALUES ('patient-238', 'Maria', 'Santos', ${now.getTime()}, ${now.getTime()});`,
      );

      const saveIfValid = async (id: string, input: AddressValidationInput) => {
        const errors = validateAddressForm(input);
        if (hasAddressValidationErrors(errors)) {
          return { saved: false, errors };
        }
        await db.insert(patientAddresses).values({
          id,
          patientId: 'patient-238',
          type: (input.type === 'secondary' ? 'secondary' : 'primary') as 'primary' | 'secondary',
          houseStreet: input.houseStreet ?? null,
          barangay: input.barangayName ?? null,
          cityMunicipality: input.cityMunicipalityName ?? '',
          province: isNcrRegion(input.regionPsgc, input.regionName) ? null : (input.provinceName ?? null),
          region: input.regionName ?? null,
          regionPsgc: input.regionPsgc ?? null,
          provincePsgc: isNcrRegion(input.regionPsgc, input.regionName) ? null : (input.provincePsgc ?? null),
          cityMunicipalityPsgc: input.cityMunicipalityPsgc ?? null,
          barangayPsgc: input.barangayPsgc ?? null,
          regionName: input.regionName ?? null,
          provinceName: isNcrRegion(input.regionPsgc, input.regionName) ? null : (input.provinceName ?? null),
          cityMunicipalityName: input.cityMunicipalityName ?? null,
          barangayName: input.barangayName ?? null,
          isSameAsPermanent: input.type === 'secondary' && Boolean(input.isSameAsPermanent),
          createdAt: now,
          updatedAt: now,
        });
        return { saved: true, errors: {} };
      };

      // Incomplete NCR submission must NOT persist
      const incompleteAttempt = await saveIfValid('addr-incomplete', {
        type: 'primary',
        regionPsgc: NCR_REGION_PSGC,
        regionName: 'National Capital Region (NCR)',
        cityMunicipalityPsgc: null,
        cityMunicipalityName: null,
        barangayPsgc: null,
        barangayName: null,
      });
      expect(incompleteAttempt.saved).toBe(false);
      expect(incompleteAttempt.errors.cityMunicipality).toBeTruthy();
      expect(incompleteAttempt.errors.barangay).toBeTruthy();
      expect((await db.select().from(patientAddresses)).length).toBe(0);

      // Complete NCR submission persists with null province and full PSGC codes
      const completeAttempt = await saveIfValid('addr-ncr-complete', {
        type: 'primary',
        regionPsgc: NCR_REGION_PSGC,
        regionName: 'National Capital Region (NCR)',
        cityMunicipalityPsgc: '1376020000',
        cityMunicipalityName: 'City of Makati',
        barangayPsgc: '137602002',
        barangayName: 'Bel-Air',
        houseStreet: 'Unit 402, 123 Ayala Ave',
      });
      expect(completeAttempt.saved).toBe(true);
      const rows = await db.select().from(patientAddresses);
      expect(rows.length).toBe(1);
      expect(rows[0].regionPsgc).toBe(NCR_REGION_PSGC);
      expect(rows[0].provincePsgc).toBeNull();
      expect(rows[0].cityMunicipalityPsgc).toBe('1376020000');
      expect(rows[0].barangayPsgc).toBe('137602002');

      sqlite.close();
    });
  });

  describe('Component & screen wiring invariants', () => {
    test('CascadingAddressPicker delegates cascading loads and guards province effect when isNcrWithoutProvinces is true', () => {
      const source = readAppFile('components/profile/CascadingAddressPicker.tsx');
      expect(source).toContain('fetchRegionDependentLocations');
      expect(source).toContain('fetchProvinceDependentCities');
      expect(source).toContain('shouldBypassProvinceTier');
      expect(source).toContain('if (isNcrWithoutProvinces)');
      expect(source).toContain('error={activeErrors?.region}');
      expect(source).toContain('error={activeErrors?.province}');
      expect(source).toContain('error={activeErrors?.cityMunicipality}');
      expect(source).toContain('error={activeErrors?.barangay}');
      expect(source).toContain('resolveRegionPsgc');
      expect(source).toContain('resolveLocationPsgc');
    });

    test('Addresses.screen validates before saving to SQLite and passes required + validationErrors to CascadingAddressPicker', () => {
      const source = readAppFile('navigation/screens/profile/Addresses.screen.tsx');
      const validateIdx = source.indexOf('validateAddressForm(');
      const guardIdx = source.indexOf('if (hasAddressValidationErrors(errors))');
      const insertIdx = source.indexOf('db.insert(patientAddresses)');
      const updateIdx = source.indexOf('db.update(patientAddresses)');
      const syncIdx = source.indexOf('flushAndSyncProfile(');

      expect(validateIdx).toBeGreaterThan(-1);
      expect(guardIdx).toBeGreaterThan(validateIdx);
      expect(insertIdx).toBeGreaterThan(guardIdx);
      expect(updateIdx).toBeGreaterThan(guardIdx);
      expect(syncIdx).toBeGreaterThan(guardIdx);
      expect(source).toContain('errors={validationErrors}');
      expect(source).toContain("if (nextType !== 'secondary')");
    });

    test('ProfileFormField renders accessible emergency inline errors and respects disabled picker state', () => {
      const source = readAppFile('components/profile/ProfileFormField.tsx');
      expect(source).toContain('error?: string | null');
      expect(source).toContain('colors.emergency');
      expect(source).toContain('color="emergencyText"');
      expect(source).toContain('accessibilityRole="alert"');
      expect(source).toContain('disabled={!editable}');
    });
  });

  describe('Issue #298: PSGC name-to-code resolution for legacy/hydrated addresses', () => {
    const ALL_REGIONS: PsgcLocationDto[] = [
      { psgcCode: '0400000000', name: 'Region IV-A (CALABARZON)', level: 'Region', regionPsgc: '0400000000' },
      { psgcCode: '1300000000', name: 'National Capital Region (NCR)', level: 'Region', regionPsgc: '1300000000' },
      { psgcCode: '1700000000', name: 'MIMAROPA Region', level: 'Region', regionPsgc: '1700000000' },
    ];

    test('normalizePsgcName strips diacritics, lowercases, and collapses punctuation', () => {
      expect(normalizePsgcName('City of Parañaque')).toBe('city of paranaque');
      expect(normalizePsgcName('  Region IV-A (CALABARZON)  ')).toBe('region iv a calabarzon');
      expect(normalizePsgcName(null)).toBe('');
    });

    test('resolveRegionPsgc resolves NCR immediately even before regions load or when offline', () => {
      expect(
        resolveRegionPsgc({ regionPsgc: null, regionName: 'National Capital Region (NCR)' }, []),
      ).toBe(NCR_REGION_PSGC);
      expect(
        resolveRegionPsgc({ regionPsgc: '', regionName: 'National Capital Region' }, []),
      ).toBe(NCR_REGION_PSGC);
      expect(
        resolveRegionPsgc({ regionPsgc: null, regionName: 'NCR' }, ALL_REGIONS),
      ).toBe(NCR_REGION_PSGC);
    });

    test('resolveRegionPsgc resolves non-NCR regions by canonical name, prefix, or parenthetical alias', () => {
      expect(
        resolveRegionPsgc({ regionPsgc: null, regionName: 'Region IV-A (CALABARZON)' }, ALL_REGIONS),
      ).toBe('0400000000');
      expect(
        resolveRegionPsgc({ regionPsgc: null, regionName: 'Region IV-A' }, ALL_REGIONS),
      ).toBe('0400000000');
      expect(
        resolveRegionPsgc({ regionPsgc: null, regionName: 'CALABARZON' }, ALL_REGIONS),
      ).toBe('0400000000');
      expect(
        resolveRegionPsgc({ regionPsgc: null, regionName: 'MIMAROPA' }, ALL_REGIONS),
      ).toBe('1700000000');
      expect(
        resolveRegionPsgc({ regionPsgc: null, regionName: 'Unknown Region' }, ALL_REGIONS),
      ).toBeNull();
    });

    test('matchPsgcLocationByName matches provinces, cities (with affixes/diacritics), and barangays without false partial matches', () => {
      const citiesWithDiacritics: PsgcLocationDto[] = [
        ...NCR_CITIES,
        { psgcCode: '1376040000', name: 'City of Parañaque', level: 'CityMunicipality', regionPsgc: NCR_REGION_PSGC, zipCode: '1700' },
        { psgcCode: '0314200000', name: 'City of San Jose del Monte', level: 'CityMunicipality', regionPsgc: '0300000000' },
      ];

      expect(matchPsgcLocationByName('Cavite', CALABARZON_PROVINCES)?.psgcCode).toBe('0421000000');
      expect(matchPsgcLocationByName('Makati', citiesWithDiacritics)?.psgcCode).toBe('1376020000');
      expect(matchPsgcLocationByName('Makati City', citiesWithDiacritics)?.psgcCode).toBe('1376020000');
      expect(matchPsgcLocationByName('Paranaque', citiesWithDiacritics)?.psgcCode).toBe('1376040000');
      expect(matchPsgcLocationByName('Parañaque City', citiesWithDiacritics)?.psgcCode).toBe('1376040000');
      expect(matchPsgcLocationByName('Brgy. Bel-Air', MAKATI_BARANGAYS)?.psgcCode).toBe('137602002');
      // Must NOT falsely match "San Jose" to "City of San Jose del Monte"
      expect(matchPsgcLocationByName('San Jose', citiesWithDiacritics)).toBeNull();
    });

    test('resolveLocationPsgc preserves existing code and backfills from name when missing', () => {
      expect(resolveLocationPsgc('1376020000', 'City of Makati', NCR_CITIES)).toEqual({
        code: '1376020000',
        matched: null,
      });

      const resolved = resolveLocationPsgc(null, 'City of Makati', NCR_CITIES);
      expect(resolved?.code).toBe('1376020000');
      expect(resolved?.matched?.zipCode).toBe('1200');
    });
  });
});

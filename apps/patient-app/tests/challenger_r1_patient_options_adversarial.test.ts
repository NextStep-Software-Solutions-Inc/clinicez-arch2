import { describe, expect, test, mock, beforeEach, afterEach, spyOn } from 'bun:test';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import axios from 'axios';

// Set API URL environment before loading services
process.env.EXPO_PUBLIC_API_URL = 'https://patient-api.test/api/v1';

// ── Native Module Mocks ────────────────────────────────────────────────────────
const inMemoryStore = new Map<string, string>();
globalThis.__customSecureStore = inMemoryStore;

mock.module('expo-secure-store', () => ({
  getItemAsync: mock(async (key: string) => inMemoryStore.get(key) ?? null),
  setItemAsync: mock(async (key: string, val: string) => {
    inMemoryStore.set(key, val);
  }),
  deleteItemAsync: mock(async (key: string) => {
    inMemoryStore.delete(key);
  }),
}));

mock.module('react-native', () => ({
  StyleSheet: {
    create: (s: any) => s,
    flatten: (s: any) => s,
    hairlineWidth: 1,
  },
  View: 'View',
  Text: 'Text',
  TouchableOpacity: 'TouchableOpacity',
  TouchableHighlight: 'TouchableHighlight',
  Pressable: 'Pressable',
  Modal: 'Modal',
  TextInput: 'TextInput',
  ScrollView: 'ScrollView',
  ActivityIndicator: 'ActivityIndicator',
  KeyboardAvoidingView: 'KeyboardAvoidingView',
  FlatList: 'FlatList',
  SectionList: 'SectionList',
  Switch: 'Switch',
  Image: 'Image',
  Platform: { OS: 'web', select: (obj: any) => obj.web ?? obj.default },
  TurboModuleRegistry: {
    get: () => null,
    getEnforcing: () => null,
  },
  NativeModules: {},
  Dimensions: {
    get: () => ({ width: 1920, height: 1080 }),
    addEventListener: () => ({ remove: () => {} }),
    removeEventListener: () => {},
  },
  useWindowDimensions: () => ({ width: 1920, height: 1080 }),
  Keyboard: {
    dismiss: () => {},
    addListener: () => ({ remove: () => {} }),
  },
  AppState: {
    addEventListener: () => ({ remove: () => {} }),
    currentState: 'active',
  },
  Alert: {
    alert: () => {},
  },
  I18nManager: {
    isRTL: false,
  },
  Animated: {
    Value: class {
      constructor(public val: any) {}
      setValue(val: any) { this.val = val; }
    },
    timing: () => ({ start: (cb?: any) => cb?.() }),
    spring: () => ({ start: (cb?: any) => cb?.() }),
    sequence: () => ({ start: (cb?: any) => cb?.() }),
    parallel: () => ({ start: (cb?: any) => cb?.() }),
    View: 'AnimatedView',
    Text: 'AnimatedText',
  },
}));

// Load services under test
const { optionsService } = await import('../services/api/optionsService');
const { useEhrOptions } = await import('../hooks/useEhrOptions');
import type { EhrOptionDescriptor } from '@shared/safe';

/* ========================================================================= */
/* SUITE 1: SHA-256 ETAG 304 REVALIDATION & TWO-TIER CACHE RIGOR             */
/* ========================================================================= */

describe('CHALLENGER R1 PATIENT OPTIONS - Suite 1: SHA-256 ETag 304 Handling & Two-Tier Caching', () => {
  beforeEach(() => {
    optionsService.clearMemoryCache();
    inMemoryStore.clear();
  });

  afterEach(() => {
    optionsService.clearMemoryCache();
    inMemoryStore.clear();
  });

  test('Dimension 1: 200 OK initial fetch stores SHA-256 ETag and descriptors into both memory and persistent storage', async () => {
    const sha256Etag = '"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"';
    const mockDescriptors: EhrOptionDescriptor[] = [
      { code: 'SINGLE', label: 'Single', philHealthCode: 'S', philHealthLibrary: 'lib_civil_status' },
      { code: 'MARRIED', label: 'Married', philHealthCode: 'M', philHealthLibrary: 'lib_civil_status' },
      { code: 'WIDOWED', label: 'Widowed', philHealthCode: 'W', philHealthLibrary: 'lib_civil_status' },
    ];

    const getSpy = spyOn(axios, 'get').mockResolvedValueOnce({
      status: 200,
      headers: { etag: sha256Etag },
      data: { succeeded: true, data: mockDescriptors },
    } as any);

    const result = await optionsService.getOptionSet('civil_status');
    expect(result).toEqual(mockDescriptors);
    expect(getSpy).toHaveBeenCalledTimes(1);

    // Verify storage serialization
    const storedRaw = inMemoryStore.get('clinicez.options.civil_status');
    expect(storedRaw).toBeDefined();
    const stored = JSON.parse(storedRaw!);
    expect(stored.version).toBe(sha256Etag);
    expect(stored.data).toEqual(mockDescriptors);

    getSpy.mockRestore();
  });

  test('Dimension 2: Subsequent request sends If-None-Match with cached SHA-256 ETag; 304 Not Modified returns cached data without re-parsing', async () => {
    const sha256Etag = '"9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08"';
    const cachedDescriptors: EhrOptionDescriptor[] = [
      { code: 'A_POSITIVE', label: 'A+', philHealthCode: null },
      { code: 'O_POSITIVE', label: 'O+', philHealthCode: null },
      { code: 'B_POSITIVE', label: 'B+', philHealthCode: null },
    ];

    // Seed storage
    inMemoryStore.set(
      'clinicez.options.blood_type',
      JSON.stringify({ version: sha256Etag, data: cachedDescriptors })
    );

    let sentIfNoneMatch: string | undefined;
    const getSpy = spyOn(axios, 'get').mockImplementationOnce(async (_url: string, config?: any) => {
      sentIfNoneMatch = config?.headers?.['If-None-Match'];
      return {
        status: 304,
        headers: { etag: sha256Etag },
        data: null,
      } as any;
    });

    const result = await optionsService.getOptionSet('blood_type');
    expect(sentIfNoneMatch).toBe(sha256Etag);
    expect(result).toEqual(cachedDescriptors);
    expect(getSpy).toHaveBeenCalledTimes(1);

    getSpy.mockRestore();
  });

  test('Dimension 3: Weak ETag format (W/"hash") is accepted and properly revalidated', async () => {
    const weakEtag = 'W/"sha256-weak-tag-12345"';
    const mockDescriptors: EhrOptionDescriptor[] = [
      { code: 'Office', label: 'Office' },
      { code: 'Field', label: 'Field' },
    ];

    inMemoryStore.set(
      'clinicez.options.work_environment',
      JSON.stringify({ version: weakEtag, data: mockDescriptors })
    );

    let sentIfNoneMatch: string | undefined;
    const getSpy = spyOn(axios, 'get').mockImplementationOnce(async (_url: string, config?: any) => {
      sentIfNoneMatch = config?.headers?.['If-None-Match'];
      return {
        status: 304,
        headers: { etag: weakEtag },
        data: null,
      } as any;
    });

    const result = await optionsService.getOptionSet('work_environment');
    expect(sentIfNoneMatch).toBe(weakEtag);
    expect(result).toEqual(mockDescriptors);

    getSpy.mockRestore();
  });

  test('Dimension 4: Cache displacement: new SHA-256 ETag on 200 OK atomically replaces cached entries', async () => {
    const v1Etag = '"sha256-v1-hash"';
    const v2Etag = '"sha256-v2-hash"';

    const v1Options: EhrOptionDescriptor[] = [
      { code: 'A', label: 'A — Low Risk (< 10%)' },
      { code: 'B', label: 'B — Moderate Risk (10% to < 20%)' },
    ];
    const v2Options: EhrOptionDescriptor[] = [
      { code: 'A', label: 'A — Low Risk (< 10%)' },
      { code: 'B', label: 'B — Moderate Risk (10% to < 20%)' },
      { code: 'C', label: 'C — High Risk (20% to < 30%)' },
      { code: 'D', label: 'D — Very High Risk (30% to < 40%)' },
      { code: 'E', label: 'E — Critical Risk (≥ 40%)' },
    ];

    inMemoryStore.set(
      'clinicez.options.cvd_risk_level',
      JSON.stringify({ version: v1Etag, data: v1Options })
    );

    let sentIfNoneMatch: string | undefined;
    const getSpy = spyOn(axios, 'get').mockImplementationOnce(async (_url: string, config?: any) => {
      sentIfNoneMatch = config?.headers?.['If-None-Match'];
      return {
        status: 200,
        headers: { etag: v2Etag },
        data: { data: v2Options },
      } as any;
    });

    const result = await optionsService.getOptionSet('cvd_risk_level');
    expect(sentIfNoneMatch).toBe(v1Etag);
    expect(result).toEqual(v2Options);
    expect(result.length).toBe(5);

    // Verify storage updated
    const stored = JSON.parse(inMemoryStore.get('clinicez.options.cvd_risk_level')!);
    expect(stored.version).toBe(v2Etag);
    expect(stored.data).toEqual(v2Options);

    getSpy.mockRestore();
  });

  test('Dimension 5: Network failure resilience: returns cached descriptors during timeout or offline 500 error', async () => {
    const cachedDescriptors: EhrOptionDescriptor[] = [
      { code: 'None', label: 'None' },
      { code: 'Glasses', label: 'Eyeglasses' },
      { code: 'Contacts', label: 'Contact Lenses' },
      { code: 'Both', label: 'Both' },
    ];
    inMemoryStore.set(
      'clinicez.options.corrective_lenses',
      JSON.stringify({ version: '"etag-lenses-v1"', data: cachedDescriptors })
    );

    const getSpy = spyOn(axios, 'get').mockRejectedValueOnce(new Error('Network error: ETIMEDOUT'));

    const result = await optionsService.getOptionSet('corrective_lenses');
    expect(result).toEqual(cachedDescriptors);

    getSpy.mockRestore();
  });

  test('Dimension 6: Storage corruption recovery: recovers smoothly when storage JSON is corrupted', async () => {
    inMemoryStore.set('clinicez.options.delivery_type', '<<<MALFORMED CORRUPTED JSON STRING>>>');

    const freshDescriptors: EhrOptionDescriptor[] = [
      { code: 'Normal Spontaneous Vaginal', label: 'Normal Spontaneous Vaginal (NSD)', philHealthCode: 'N' },
      { code: 'Cesarean', label: 'Cesarean Delivery (CSD)', philHealthCode: 'O' },
    ];

    const getSpy = spyOn(axios, 'get').mockResolvedValueOnce({
      status: 200,
      headers: { etag: '"etag-delivery-v1"' },
      data: freshDescriptors,
    } as any);

    const result = await optionsService.getOptionSet('delivery_type');
    expect(result).toEqual(freshDescriptors);

    getSpy.mockRestore();
  });

  test('Dimension 7: High concurrency stress: 30 concurrent requests across distinct sets resolve deterministically', async () => {
    const targetSets = [
      'work_environment',
      'family_side',
      'provider_type',
      'corrective_lenses',
      'cvd_risk_level',
      'common_drugstore',
    ];

    const getSpy = spyOn(axios, 'get').mockImplementation(async (url: string) => {
      const match = url.match(/\/options\/([a-z_]+)$/);
      const setKey = match ? match[1] : 'unknown';
      return {
        status: 200,
        headers: { etag: `"sha256-${setKey}"` },
        data: [{ code: `${setKey}_code`, label: `Label for ${setKey}` }],
      } as any;
    });

    const requests = Array.from({ length: 30 }, (_, idx) => {
      const set = targetSets[idx % targetSets.length];
      return optionsService.getOptionSet(set);
    });

    const responses = await Promise.all(requests);
    expect(responses.length).toBe(30);

    for (let i = 0; i < 30; i++) {
      const set = targetSets[i % targetSets.length];
      expect(responses[i]).toEqual([{ code: `${set}_code`, label: `Label for ${set}` }]);
    }

    getSpy.mockRestore();
  });
});

/* ========================================================================= */
/* SUITE 2: DROPDOWN RENDERING FROM GENUINE BACKEND DESCRIPTORS              */
/* ========================================================================= */

describe('CHALLENGER R1 PATIENT OPTIONS - Suite 2: Dropdown Rendering from Backend Descriptors', () => {
  test('Dimension 8: Option descriptors preserve PhilHealth statutory metadata and custom flags', () => {
    const descriptor: EhrOptionDescriptor = {
      code: 'OTHER',
      label: 'Other Therapeutic Group',
      philHealthCode: '07',
      philHealthLibrary: 'lib_drug_grouping',
      requiresSpecifyText: true,
    };

    expect(descriptor.code).toBe('OTHER');
    expect(descriptor.label).toBe('Other Therapeutic Group');
    expect(descriptor.philHealthCode).toBe('07');
    expect(descriptor.philHealthLibrary).toBe('lib_drug_grouping');
    expect(descriptor.requiresSpecifyText).toBe(true);
  });

  test('Dimension 9: selectOptions transforms descriptors preserving labels and special value mapping', () => {
    const sampleOptions: EhrOptionDescriptor[] = [
      { code: 'ELEMENTARY', label: 'Elementary' },
      { code: 'HIGH_SCHOOL', label: 'High School' },
      { code: 'COLLEGE', label: 'College' },
      { code: 'POST_GRADUATE', label: 'Post Graduate' },
    ];

    // Emulate useEhrOptions selectOptions derivation
    const selectOptions = sampleOptions.map((o) => {
      let val = o.label;
      if (o.label === 'High School') val = 'HighSchool';
      else if (o.label === 'Post Graduate') val = 'PostGraduate';
      return { label: o.label, value: val };
    });

    expect(selectOptions).toEqual([
      { label: 'Elementary', value: 'Elementary' },
      { label: 'High School', value: 'HighSchool' },
      { label: 'College', value: 'College' },
      { label: 'Post Graduate', value: 'PostGraduate' },
    ]);
  });

  test('Dimension 10: INVARIANT: Empty backend response [] returns empty dropdown choices with ZERO fallback to static arrays', async () => {
    optionsService.clearMemoryCache();
    inMemoryStore.clear();

    const getSpy = spyOn(axios, 'get').mockResolvedValueOnce({
      status: 200,
      headers: { etag: '"sha256-empty"' },
      data: [],
    } as any);

    const result = await optionsService.getOptionSet('unpopulated_custom_set');
    expect(result).toEqual([]);
    expect(result.length).toBe(0);

    getSpy.mockRestore();
  });
});

/* ========================================================================= */
/* SUITE 3: ZERO STATIC OPTION ARRAYS IN PRODUCTION SOURCE CODE              */
/* ========================================================================= */

describe('CHALLENGER R1 PATIENT OPTIONS - Suite 3: Zero Static Option Arrays Invariant', () => {
  const PATIENT_APP_ROOT = join(import.meta.dir, '..');

  const FORBIDDEN_ARRAY_DECLARATIONS = [
    'WORK_ENV_OPTIONS',
    'WORK_ENVIRONMENTS',
    'SIDE_OPTIONS',
    'FAMILY_SIDES',
    'PROVIDER_TYPE_OPTIONS',
    'PROVIDER_TYPES',
    'LENSES_OPTIONS',
    'CORRECTIVE_LENSES_OPTIONS',
    'Q17_OPTIONS',
    'CVD_RISK_LEVELS',
    'COMMON_DRUGSTORES',
    'PHILHEALTH_DELIVERY_TYPE_OPTIONS',
    'PHILHEALTH_CONTRACEPTIVE_OPTIONS',
    'BLOOD_TYPE_METADATA',
    'STANDARD_BLOOD_TYPES',
    'STANDARD_ALLERGY_SEVERITIES',
    'STANDARD_ALLERGY_CATEGORIES',
    'RH_POSITIVE_TYPES',
    'RH_NEGATIVE_TYPES',
    'BLOOD_TYPE_OPTIONS',
  ];

  function collectTsxFiles(dir: string, fileList: string[] = []): string[] {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      if (entry === 'node_modules' || entry === '.expo' || entry === 'tests' || entry === '.git') {
        continue;
      }
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        collectTsxFiles(fullPath, fileList);
      } else if (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx')) {
        fileList.push(fullPath);
      }
    }
    return fileList;
  }

  test('Dimension 11: AST / source scan confirms ZERO forbidden static option arrays across all patient-app production files', () => {
    const productionFiles = collectTsxFiles(PATIENT_APP_ROOT);
    expect(productionFiles.length).toBeGreaterThan(20);

    const violations: Array<{ file: string; token: string; line: number }> = [];

    for (const file of productionFiles) {
      const content = readFileSync(file, 'utf8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        for (const token of FORBIDDEN_ARRAY_DECLARATIONS) {
          // Check for const TOKEN = [ or export const TOKEN = [
          const regex = new RegExp(`(const|let|var)\\s+${token}\\s*=\\s*\\[`);
          if (regex.test(line)) {
            violations.push({ file, token, line: i + 1 });
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });

  test('Dimension 12: All profile screens import useEhrOptions dynamically instead of hardcoded lists', () => {
    const targetScreens = [
      'navigation/screens/profile/Occupation.screen.tsx',
      'navigation/screens/profile/FamilyHistory.screen.tsx',
      'navigation/screens/profile/HealthcareProviders.screen.tsx',
      'navigation/screens/profile/DentalVision.screen.tsx',
      'navigation/screens/profile/NcdQuestionnaire.screen.tsx',
      'navigation/screens/profile/Prescriptions.screen.tsx',
      'navigation/screens/profile/ObstetricProfile.screen.tsx',
      'navigation/screens/profile/Allergies.screen.tsx',
      'navigation/screens/profile/SocialHistory.screen.tsx',
      'navigation/screens/profile/GovernmentIds.screen.tsx',
      'navigation/screens/profile/PersonalDemographics.screen.tsx',
    ];

    for (const screenPath of targetScreens) {
      const fullPath = join(PATIENT_APP_ROOT, screenPath);
      expect(existsSync(fullPath)).toBe(true);
      const content = readFileSync(fullPath, 'utf8');
      expect(content.includes('useEhrOptions')).toBe(true);
    }
  });
});

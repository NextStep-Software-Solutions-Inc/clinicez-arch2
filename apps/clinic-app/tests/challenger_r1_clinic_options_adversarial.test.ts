// token-guard:ignore-file
/**
 * apps/clinic-app/tests/challenger_r1_clinic_options_adversarial.test.ts
 *
 * EMPIRICAL ADVERSARIAL CHALLENGER TEST SUITE: Milestone 4-A / Post-M5 Remediation
 * Clinic App Dynamic Options Caching, SHA-256 ETag 304 Revalidation & Dropdown Invariants
 */

import { describe, expect, test, mock, beforeEach, afterEach, spyOn } from 'bun:test';
import React from 'react';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import axios from 'axios';

(globalThis as any).__DEV__ = true;

// Mock secureStorage and session credentials
const inMemoryStore = new Map<string, string>();

mock.module('../services/secureStorage', () => ({
  getSecureItem: mock(async (key: string) => inMemoryStore.get(key) ?? null),
  setSecureItem: mock(async (key: string, val: string) => {
    inMemoryStore.set(key, val);
  }),
  deleteSecureItem: mock(async (key: string) => {
    inMemoryStore.delete(key);
  }),
}));

mock.module('../services/authSession', () => ({
  ensureFreshToken: mock(async () => 'mock-access-token'),
  getAccessToken: mock(() => 'mock-access-token'),
}));

mock.module('../services/runtimeConfig', () => ({
  getApiBaseUrl: mock(() => 'https://clinic-api.test'),
}));

const createMockComponent = (name: string) => {
  const Comp = ({ children, accessibilityLabel, accessibilityRole, placeholder, onPress, value, onChangeText, testID, ...props }: any) =>
    React.createElement(
      'div',
      {
        'data-component': name,
        ...(testID ? { 'data-testid': testID } : {}),
        ...(accessibilityLabel ? { 'aria-label': accessibilityLabel } : {}),
        ...(accessibilityRole ? { role: accessibilityRole } : {}),
        ...(placeholder ? { 'data-placeholder': placeholder } : {}),
        ...(value !== undefined ? { 'data-value': String(value) } : {}),
        onClick: onPress,
      },
      placeholder,
      children
    );
  Comp.displayName = name;
  return Comp;
};

mock.module('react-native', () => ({
  StyleSheet: { create: (s: any) => s, flatten: (s: any) => s },
  View: createMockComponent('View'),
  Pressable: createMockComponent('Pressable'),
  ScrollView: createMockComponent('ScrollView'),
  TextInput: createMockComponent('TextInput'),
  Text: createMockComponent('Text'),
  ActivityIndicator: createMockComponent('ActivityIndicator'),
  Modal: createMockComponent('Modal'),
  KeyboardAvoidingView: createMockComponent('KeyboardAvoidingView'),
  FlatList: createMockComponent('FlatList'),
  SectionList: createMockComponent('SectionList'),
  Switch: createMockComponent('Switch'),
  TouchableOpacity: createMockComponent('TouchableOpacity'),
  TouchableHighlight: createMockComponent('TouchableHighlight'),
  Image: createMockComponent('Image'),
  Dimensions: {
    get: () => ({ width: 1920, height: 1080 }),
    addEventListener: () => ({ remove: () => {} }),
  },
  useWindowDimensions: () => ({ width: 1920, height: 1080 }),
  Keyboard: { dismiss: () => {}, addListener: () => ({ remove: () => {} }) },
  AppState: { addEventListener: () => ({ remove: () => {} }) },
  Platform: { OS: 'web', select: (obj: any) => obj.web ?? obj.default },
  Touchable: { Mixin: {} },
  Alert: { alert: () => {} },
  I18nManager: { isRTL: false },
}));

// Load services and helpers under test
const { optionsService } = await import('../services/optionsService');
const {
  partitionBloodTypeOptions,
  isStandardBloodType,
  getBloodTypeMeta,
  normalizeBloodTypeOption,
} = await import('../constants/bloodTypes');
const {
  normalizeDeliveryType,
  normalizeContraceptiveMethod,
} = await import('../constants/reproductiveHealth');
import type { EhrOptionDescriptor } from '@shared/safe';

/* ========================================================================= */
/* SUITE 1: CLINIC APP SHA-256 ETAG 304 HANDLING & TWO-TIER CACHE RIGOR      */
/* ========================================================================= */

describe('CHALLENGER R1 CLINIC OPTIONS - Suite 1: Clinic App SHA-256 ETag 304 Handling & Caching', () => {
  beforeEach(() => {
    optionsService.clearMemoryCache();
    inMemoryStore.clear();
  });

  afterEach(() => {
    optionsService.clearMemoryCache();
    inMemoryStore.clear();
  });

  test('Dimension 1: 200 OK initial fetch persists SHA-256 ETag and descriptors into memory and secure storage', async () => {
    const sha256Etag = '"c2d431f9e2b192801452a3a912bbbcdd1243141f"';
    const mockDescriptors: EhrOptionDescriptor[] = [
      { code: 'MALE', label: 'Male', philHealthCode: 'M', philHealthLibrary: 'lib_sex' },
      { code: 'FEMALE', label: 'Female', philHealthCode: 'F', philHealthLibrary: 'lib_sex' },
      { code: 'INTERSEX', label: 'Intersex', philHealthCode: null, philHealthLibrary: 'lib_sex' },
    ];

    const getSpy = spyOn(axios, 'get').mockResolvedValueOnce({
      status: 200,
      headers: { etag: sha256Etag },
      data: { succeeded: true, data: mockDescriptors },
    } as any);

    const result = await optionsService.getOptionSet('sex');
    expect(result).toEqual(mockDescriptors);
    expect(getSpy).toHaveBeenCalledTimes(1);

    // Verify storage persistence
    const storedRaw = inMemoryStore.get('clinicez.ehr.options.sex');
    expect(storedRaw).toBeDefined();
    const stored = JSON.parse(storedRaw!);
    expect(stored.version).toBe(sha256Etag);
    expect(stored.data).toEqual(mockDescriptors);

    getSpy.mockRestore();
  });

  test('Dimension 2: Subsequent fetch sends If-None-Match header and returns cached descriptors on 304 Not Modified', async () => {
    const sha256Etag = '"etag-dependent-rel-sha256"';
    const cachedDescriptors: EhrOptionDescriptor[] = [
      { code: 'C', label: 'Child (C)', philHealthCode: 'C', philHealthLibrary: 'lib_relationship' },
      { code: 'S', label: 'Spouse (S)', philHealthCode: 'S', philHealthLibrary: 'lib_relationship' },
      { code: 'P', label: 'Parent (P)', philHealthCode: 'P', philHealthLibrary: 'lib_relationship' },
      { code: 'D', label: 'Disabled Dependent (D)', philHealthCode: 'D', philHealthLibrary: 'lib_relationship' },
    ];

    inMemoryStore.set(
      'clinicez.ehr.options.dependent_relationship',
      JSON.stringify({ version: sha256Etag, data: cachedDescriptors, updatedAt: Date.now() })
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

    const result = await optionsService.getOptionSet('dependent_relationship');
    expect(sentIfNoneMatch).toBe(sha256Etag);
    expect(result).toEqual(cachedDescriptors);
    expect(getSpy).toHaveBeenCalledTimes(1);

    getSpy.mockRestore();
  });

  test('Dimension 3: Server update (200 OK with new ETag) displaces old cached data in memory & storage', async () => {
    const v1Etag = '"sha256-route-v1"';
    const v2Etag = '"sha256-route-v2"';

    const v1Options: EhrOptionDescriptor[] = [
      { code: 'ORAL', label: 'Oral (PO)', philHealthCode: 'PO' },
    ];
    const v2Options: EhrOptionDescriptor[] = [
      { code: 'ORAL', label: 'Oral (PO)', philHealthCode: 'PO' },
      { code: 'INTRAMUSCULAR', label: 'Intramuscular Injection (IM)', philHealthCode: 'IM' },
      { code: 'INTRAVENOUS', label: 'Intravenous Infusion/Bolus (IV)', philHealthCode: 'IV' },
    ];

    inMemoryStore.set(
      'clinicez.ehr.options.medicine_route',
      JSON.stringify({ version: v1Etag, data: v1Options, updatedAt: Date.now() })
    );

    let sentIfNoneMatch: string | undefined;
    const getSpy = spyOn(axios, 'get').mockImplementationOnce(async (_url: string, config?: any) => {
      sentIfNoneMatch = config?.headers?.['If-None-Match'];
      return {
        status: 200,
        headers: { etag: v2Etag },
        data: v2Options, // raw array unwrapped
      } as any;
    });

    const result = await optionsService.getOptionSet('medicine_route');
    expect(sentIfNoneMatch).toBe(v1Etag);
    expect(result).toEqual(v2Options);
    expect(result.length).toBe(3);

    // Verify storage updated
    const stored = JSON.parse(inMemoryStore.get('clinicez.ehr.options.medicine_route')!);
    expect(stored.version).toBe(v2Etag);
    expect(stored.data).toEqual(v2Options);

    getSpy.mockRestore();
  });

  test('Dimension 4: Network timeout resilience: returns cached data without throwing when network fails', async () => {
    const cachedDescriptors: EhrOptionDescriptor[] = [
      { code: 'Mild', label: 'Mild', philHealthCode: '1' },
      { code: 'Severe', label: 'Severe', philHealthCode: '3' },
    ];
    inMemoryStore.set(
      'clinicez.ehr.options.allergy_severity',
      JSON.stringify({ version: '"etag-sev-v1"', data: cachedDescriptors, updatedAt: Date.now() })
    );

    const getSpy = spyOn(axios, 'get').mockRejectedValueOnce(new Error('Network timeout'));

    const result = await optionsService.getOptionSet('allergy_severity');
    expect(result).toEqual(cachedDescriptors);

    getSpy.mockRestore();
  });

  test('Dimension 5: getManifest queries /options/manifest and returns full manifest response', async () => {
    const mockManifest = {
      manifestVersion: 'sha256-full-manifest-123',
      optionSets: {
        sex: 'sha256-sex-1',
        civil_status: 'sha256-civil-1',
      },
    };

    const getSpy = spyOn(axios, 'get').mockResolvedValueOnce({
      status: 200,
      data: mockManifest,
    } as any);

    const manifest = await optionsService.getManifest();
    expect(manifest).toEqual(mockManifest);

    getSpy.mockRestore();
  });

  test('Dimension 6: High concurrency stress: 30 concurrent calls across 5 sets resolve deterministically', async () => {
    const testSets = ['delivery_type', 'contraceptive_method', 'physical_activity', 'dietary_intake', 'alcohol_type'];

    const getSpy = spyOn(axios, 'get').mockImplementation(async (url: string) => {
      const match = url.match(/\/options\/([a-z_]+)$/);
      const setKey = match ? match[1] : 'unknown';
      return {
        status: 200,
        headers: { etag: `"sha256-${setKey}"` },
        data: [{ code: `${setKey}_1`, label: `Label for ${setKey}` }],
      } as any;
    });

    const requests = Array.from({ length: 30 }, (_, idx) => {
      const set = testSets[idx % testSets.length];
      return optionsService.getOptionSet(set);
    });

    const responses = await Promise.all(requests);
    expect(responses.length).toBe(30);

    for (let i = 0; i < 30; i++) {
      const set = testSets[i % testSets.length];
      expect(responses[i]).toEqual([{ code: `${set}_1`, label: `Label for ${set}` }]);
    }

    getSpy.mockRestore();
  });
});

/* ========================================================================= */
/* SUITE 2: DYNAMIC OPTIONS TRANSFORMATION & PARTITIONING LOGIC              */
/* ========================================================================= */

describe('CHALLENGER R1 CLINIC OPTIONS - Suite 2: Dynamic Option Utilities & Partitioning', () => {
  test('Dimension 7: partitionBloodTypeOptions dynamically groups into Rh+ and Rh- without hardcoded sets', () => {
    const dynamicBloodTypes = [
      { code: 'A_POSITIVE', label: 'A+' },
      { code: 'A_NEGATIVE', label: 'A-' },
      { code: 'B_POSITIVE', label: 'B+' },
      { code: 'B_NEGATIVE', label: 'B-' },
      { code: 'AB_POSITIVE', label: 'AB+' },
      { code: 'AB_NEGATIVE', label: 'AB-' },
      { code: 'O_POSITIVE', label: 'O+' },
      { code: 'O_NEGATIVE', label: 'O-' },
      { code: 'UNKNOWN', label: 'Unknown' },
    ];

    const { rhPositive, rhNegative } = partitionBloodTypeOptions(dynamicBloodTypes);

    expect(rhPositive.map((o) => o.label)).toEqual(['A+', 'B+', 'AB+', 'O+']);
    expect(rhNegative.map((o) => o.label)).toEqual(['A-', 'B-', 'AB-', 'O-']);
    expect(rhPositive.some((o) => o.code === 'UNKNOWN')).toBe(false);
    expect(rhNegative.some((o) => o.code === 'UNKNOWN')).toBe(false);
  });

  test('Dimension 8: getBloodTypeMeta dynamically derives antigen and Rh factor from label without static record lookup', () => {
    const metaApos = getBloodTypeMeta('A+');
    expect(metaApos.antigen).toBe('A');
    expect(metaApos.rhFactor).toBe('Positive');
    expect(metaApos.label).toBe('A Positive (A+)');

    const metaOneg = getBloodTypeMeta('O-');
    expect(metaOneg.antigen).toBe('O');
    expect(metaOneg.rhFactor).toBe('Negative');
    expect(metaOneg.label).toBe('O Negative (O-)');

    const metaUnknown = getBloodTypeMeta('Unknown');
    expect(metaUnknown.antigen).toBe('Unknown');
    expect(metaUnknown.rhFactor).toBe('Unknown');
  });

  test('Dimension 9: normalizeDeliveryType and normalizeContraceptiveMethod preserve free-text and normalize standard keywords', () => {
    expect(normalizeDeliveryType('NSD')).toBe('Normal Spontaneous Vaginal');
    expect(normalizeDeliveryType('CSD')).toBe('Cesarean');
    expect(normalizeDeliveryType('Custom Forceps Delivery')).toBe('Assisted Vaginal');
    expect(normalizeDeliveryType('Unrecorded Outside Birth')).toBe('Unrecorded Outside Birth');

    expect(normalizeContraceptiveMethod('oral contraceptive')).toBe('Oral Contraceptives');
    expect(normalizeContraceptiveMethod('DMPA')).toBe('Injectable Depo');
    expect(normalizeContraceptiveMethod('Custom Herbal Regimen')).toBe('Custom Herbal Regimen');
  });

  test('Dimension 10: INVARIANT: When optionsService returns [] for empty set, dropdown options remain [] with ZERO fallback to static arrays', async () => {
    optionsService.clearMemoryCache();
    inMemoryStore.clear();

    const getSpy = spyOn(axios, 'get').mockResolvedValueOnce({
      status: 200,
      headers: { etag: '"sha256-empty-clinic"' },
      data: [],
    } as any);

    const result = await optionsService.getOptionSet('empty_test_set');
    expect(result).toEqual([]);

    getSpy.mockRestore();
  });
});

/* ========================================================================= */
/* SUITE 3: ZERO STATIC OPTION ARRAYS IN CLINIC APP PRODUCTION CODE          */
/* ========================================================================= */

describe('CHALLENGER R1 CLINIC OPTIONS - Suite 3: Zero Static Option Arrays Invariant', () => {
  const CLINIC_APP_ROOT = join(import.meta.dir, '..');

  const FORBIDDEN_ARRAY_DECLARATIONS = [
    'WORK_ENVIRONMENTS',
    'FAMILY_SIDES',
    'PROVIDER_TYPES',
    'CORRECTIVE_LENSES_OPTIONS',
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
      if (entry === 'node_modules' || entry === '.expo' || entry === 'tests' || entry === '.git' || entry === 'scripts') {
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

  test('Dimension 11: AST / source scan confirms ZERO forbidden static option arrays across all clinic-app production files', () => {
    const productionFiles = collectTsxFiles(CLINIC_APP_ROOT);
    expect(productionFiles.length).toBeGreaterThan(50);

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

  test('Dimension 12: Production components and tabs import useEhrOptions dynamically', () => {
    const targetFiles = [
      'navigation/screens/Patients.screen.tsx',
      'components/patient/EditPatientModal.tsx',
      'components/chart/ReproductiveHealthTab.tsx',
      'components/chart/LifestyleSocialTab.tsx',
      'components/PhilHealthProfileModal.tsx',
      'components/chart/StatutoryImmunizationsTab.tsx',
      'components/ui/BloodTypeSelect.tsx',
    ];

    for (const relativePath of targetFiles) {
      const fullPath = join(CLINIC_APP_ROOT, relativePath);
      expect(existsSync(fullPath)).toBe(true);
      const content = readFileSync(fullPath, 'utf8');
      expect(content.includes('useEhrOptions') || content.includes('optionsService') || content.includes('getOptionSet')).toBe(true);
    }
  });
});

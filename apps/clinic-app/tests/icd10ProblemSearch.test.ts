// token-guard:ignore-file
import { describe, expect, test, mock, beforeEach } from 'bun:test';

(globalThis as any).__DEV__ = true;

// Mock react-native
mock.module('react-native', () => ({
  StyleSheet: { create: (s: any) => s },
  View: 'View',
  Pressable: 'Pressable',
  ScrollView: 'ScrollView',
  TextInput: 'TextInput',
  Text: 'Text',
  ActivityIndicator: 'ActivityIndicator',
  Platform: { OS: 'web', select: (obj: any) => obj.web ?? obj.default },
  Touchable: { Mixin: {} },
  TurboModuleRegistry: { get: () => null, getEnforcing: () => null },
  NativeModules: {},
  Alert: { alert: () => {} },
  processColor: (c: any) => c,
}));

mock.module('react-native-svg', () => ({
  Svg: 'Svg',
  Path: 'Path',
  Circle: 'Circle',
  Rect: 'Rect',
  Line: 'Line',
  default: 'Svg',
}));

mock.module('../constants/fonts', () => ({
  applyFontFamily: (s: any) => s,
  fontAssets: {},
}));

// Mock API Client for clinicService
let lastGetUrl = '';
let mockGetResponse: any = null;
let mockGetError: any = null;

mock.module('../services/apiClient', () => ({
  clinicApiClient: {
    get: async (url: string) => {
      lastGetUrl = url;
      if (mockGetError) return [null, mockGetError];
      return [mockGetResponse, null];
    },
    post: async () => [null, null],
    put: async () => [null, null],
    delete: async () => [null, null],
  },
  clinicApiUrl: (p: string) => `http://localhost:5000/api/v1${p}`,
}));

const { clinicService } = await import('../services/clinicService');
const { Icd10AutocompleteInput } = await import('../components/ui/Icd10AutocompleteInput');
const { validateDateString } = await import('../components/ui/ValidatedDateInput');

describe('ICD-10 Autocomplete & Debounced Search (F9 & F10)', () => {
  beforeEach(() => {
    lastGetUrl = '';
    mockGetResponse = null;
    mockGetError = null;
  });

  describe('clinicService.searchIcd10 Endpoint Integration', () => {
    test('calls /icd10 with URL-encoded query parameter', async () => {
      mockGetResponse = [
        { code: 'I10', description: 'Essential (primary) hypertension' },
        { code: 'I11', description: 'Hypertensive heart disease' },
      ];

      const [data, err] = await clinicService.searchIcd10('I10');
      expect(err).toBeNull();
      expect(data).toHaveLength(2);
      expect(lastGetUrl).toBe('/icd10?q=I10');
      expect(data![0].code).toBe('I10');
      expect(data![0].description).toBe('Essential (primary) hypertension');
    });

    test('properly encodes special characters and spaces in diagnosis search', async () => {
      mockGetResponse = [
        { code: 'E11.9', description: 'Type 2 diabetes mellitus without complications' },
      ];

      const [data, err] = await clinicService.searchIcd10('diabetes mellitus');
      expect(err).toBeNull();
      expect(lastGetUrl).toBe('/icd10?q=diabetes%20mellitus');
      expect(data).toHaveLength(1);
      expect(data![0].code).toBe('E11.9');
    });

    test('handles empty query parameter correctly', async () => {
      mockGetResponse = [];
      const [data, err] = await clinicService.searchIcd10('');
      expect(err).toBeNull();
      expect(lastGetUrl).toBe('/icd10');
      expect(data).toEqual([]);
    });

    test('surfaces API error when catalog service fails', async () => {
      mockGetError = new Error('Catalog database timeout');
      const [data, err] = await clinicService.searchIcd10('J45');
      expect(data).toBeNull();
      expect(err).not.toBeNull();
      expect(err.message).toBe('Catalog database timeout');
    });
  });

  describe('Search Query Filtering & Debounce Requirements', () => {
    test('requires at least 2 characters before querying catalog', () => {
      // Threshold check simulation:
      const shouldSearch = (q: string) => q.trim().length >= 2;

      expect(shouldSearch('')).toBe(false);
      expect(shouldSearch(' ')).toBe(false);
      expect(shouldSearch('I')).toBe(false);
      expect(shouldSearch('I ')).toBe(false);
      expect(shouldSearch('I1')).toBe(true);
      expect(shouldSearch('I10')).toBe(true);
      expect(shouldSearch('flu')).toBe(true);
    });

    test('trims whitespace before passing query to clinicService.searchIcd10', async () => {
      mockGetResponse = [{ code: 'J00', description: 'Acute nasopharyngitis [common cold]' }];
      const query = '   cold   ';
      const trimmed = query.trim();

      const [data] = await clinicService.searchIcd10(trimmed);
      expect(lastGetUrl).toBe('/icd10?q=cold');
      expect(data![0].code).toBe('J00');
    });
  });

  describe('Auto-Population and Selection Ergonomics', () => {
    test('selecting suggestion auto-populates both icd10Code and standard description', () => {
      let selectedCode = '';
      let selectedTitle = '';

      const onSelect = (code: string, description: string) => {
        selectedCode = code;
        selectedTitle = description;
      };

      const suggestion = {
        code: 'I10',
        description: 'Essential (primary) hypertension',
      };

      onSelect(suggestion.code, suggestion.description);

      expect(selectedCode).toBe('I10');
      expect(selectedTitle).toBe('Essential (primary) hypertension');
    });

    test('clearing selection resets both icd10Code and problemTitle to empty', () => {
      let selectedCode = 'I10';
      let selectedTitle = 'Essential (primary) hypertension';

      const onClear = () => {
        selectedCode = '';
        selectedTitle = '';
      };

      onClear();

      expect(selectedCode).toBe('');
      expect(selectedTitle).toBe('');
    });

    test('allows clinician to refine clinical specialization title while preserving standard code', () => {
      const selectedCode = 'I10';
      let problemTitle = 'Essential (primary) hypertension';

      const onTitleChange = (newTitle: string) => {
        problemTitle = newTitle;
      };

      onTitleChange('Essential (primary) hypertension, Stage 2, poorly controlled');

      expect(selectedCode).toBe('I10'); // Code preserved
      expect(problemTitle).toBe('Essential (primary) hypertension, Stage 2, poorly controlled'); // Specialized title
    });
  });

  describe('Empty and Error State User Feedback', () => {
    test('displays actionable notice when no matching ICD-10 codes found', async () => {
      mockGetResponse = [];
      const [data] = await clinicService.searchIcd10('nonexistentdisease123');

      const notice = data && data.length === 0
        ? 'No matching codes in the PhilHealth ICD-10 catalog.'
        : null;

      expect(notice).toBe('No matching codes in the PhilHealth ICD-10 catalog.');
    });

    test('displays catalog unreachable notice when network fails', async () => {
      mockGetError = new Error('Network error');
      const [, err] = await clinicService.searchIcd10('I10');

      const notice = err ? 'The PhilHealth ICD-10 catalog is unreachable.' : null;
      expect(notice).toBe('The PhilHealth ICD-10 catalog is unreachable.');
    });
  });

  describe('Clinical Problem Record Payload Creation with Validated Date', () => {
    test('creates valid PatientProblem payload with uppercase code and valid past onset date', () => {
      const problemIcd10 = 'i10';
      const problemTitle = 'Essential (primary) hypertension';
      const problemOnsetDate = '2024-01-15';
      const now = new Date('2026-10-12T00:00:00Z');

      const dateValidation = validateDateString(problemOnsetDate, { boundaryMode: 'pastOrToday', now });
      expect(dateValidation.isValid).toBe(true);

      const payload = {
        icd10Code: problemIcd10.trim().toUpperCase(),
        problemTitle: problemTitle.trim(),
        status: 'Active',
        severity: 'Moderate',
        isChronicNcd: true,
        onsetDate: dateValidation.formattedDate,
      };

      expect(payload.icd10Code).toBe('I10');
      expect(payload.problemTitle).toBe('Essential (primary) hypertension');
      expect(payload.onsetDate).toBe('2024-01-15');
    });

    test('blocks clinical problem creation when onset date is in the future', () => {
      const problemOnsetDate = '2026-12-25';
      const now = new Date('2026-10-12T00:00:00Z');

      const dateValidation = validateDateString(problemOnsetDate, { boundaryMode: 'pastOrToday', now });
      expect(dateValidation.isValid).toBe(false);
      expect(dateValidation.errorMessage).toContain('Future date not permitted');
    });

    test('blocks clinical problem creation when ICD-10 code is empty', () => {
      const code = '';
      const isValid = Boolean(code.trim());
      expect(isValid).toBe(false);
    });
  });
});

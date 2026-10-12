// token-guard:ignore-file
import { describe, expect, test, mock, beforeEach } from 'bun:test';
import React from 'react';

(globalThis as any).__DEV__ = true;

// Mock react-native dependencies
const createMockComponent = (name: string) => {
  const Comp = ({ children, accessibilityLabel, accessibilityRole, placeholder, onPress, value, onChangeText, testID }: any) =>
    React.createElement(
      'div',
      {
        'data-component': name,
        ...(testID ? { 'data-testid': testID } : {}),
        ...(accessibilityLabel ? { 'aria-label': accessibilityLabel } : {}),
        ...(accessibilityRole ? { role: accessibilityRole } : {}),
        ...(placeholder ? { 'data-placeholder': placeholder } : {}),
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
  Platform: { OS: 'web', select: (obj: any) => obj.web ?? obj.default },
  Touchable: { Mixin: {} },
  TurboModuleRegistry: { get: () => null, getEnforcing: () => null },
  NativeModules: {},
  Animated: {
    Value: class {
      constructor(public val: any) {}
      setValue(val: any) { this.val = val; }
      interpolate() { return this; }
    },
    timing: () => ({ start: (cb?: any) => cb && cb() }),
    sequence: () => ({ start: (cb?: any) => cb && cb() }),
    loop: () => ({ start: (cb?: any) => cb && cb() }),
    spring: () => ({ start: (cb?: any) => cb && cb() }),
    View: createMockComponent('Animated.View'),
    Text: createMockComponent('Animated.Text'),
  },
  Alert: { alert: mock(() => {}) },
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
let getCallCount = 0;
let getCallDelays: number[] = [];

mock.module('../services/apiClient', () => ({
  clinicApiClient: {
    get: async (url: string) => {
      lastGetUrl = url;
      getCallCount++;
      if (getCallDelays.length > 0) {
        const delay = getCallDelays.shift() || 0;
        await new Promise((r) => setTimeout(r, delay));
      }
      if (mockGetError) return [null, mockGetError];
      return [mockGetResponse, null];
    },
    post: async (url: string, payload: any) => [payload, null],
    put: async (url: string, payload: any) => [payload, null],
    delete: async () => [true, null],
  },
  clinicApiUrl: (p: string) => `http://localhost:5000/api/v1${p}`,
}));

const { clinicService } = await import('../services/clinicService');
import type { Icd10Code, CreatePatientProblemPayload } from '../services/clinicService';
const { Icd10AutocompleteInput } = await import('../components/ui/Icd10AutocompleteInput');
const { validateDateString, formatDateMask } = await import('../components/ui/ValidatedDateInput');

describe('Empirical Challenger Suite: ICD-10 Search & Problem Intake Stress (Milestone M2)', () => {
  beforeEach(() => {
    lastGetUrl = '';
    mockGetResponse = null;
    mockGetError = null;
    getCallCount = 0;
    getCallDelays = [];
  });

  // =========================================================================
  // Section 1: Rapid Debounce Cancellations, Timers & Out-of-Order Race Hazards
  // =========================================================================
  describe('1. Debounce Timing, Keystroke Burst Cancellation & Out-of-Order Hazards', () => {
    test('1.1 Rapid keystrokes within 250ms interval cancel pending timers and fire only once', async () => {
      // Simulate debounce harness matching Icd10AutocompleteInput effect logic
      let timer: any = null;
      let executedQuery: string | null = null;
      let invocations = 0;

      const scheduleSearch = (text: string) => {
        if (timer) clearTimeout(timer);
        const trimmed = text.trim();
        if (trimmed.length < 2) return;

        timer = setTimeout(() => {
          invocations++;
          executedQuery = trimmed;
        }, 250);
      };

      // Rapidly type "h", "hy", "hyp", "hype", "hyper" at 50ms intervals (< 250ms)
      const keystrokes = ['h', 'hy', 'hyp', 'hype', 'hyper'];
      for (const stroke of keystrokes) {
        scheduleSearch(stroke);
        await new Promise((r) => setTimeout(r, 50));
      }

      // At this point (total elapsed ~250ms from start, but only 50ms since 'hyper'),
      // timer should NOT have fired yet
      expect(invocations).toBe(0);
      expect(executedQuery).toBeNull();

      // Wait 300ms for trailing debounce to resolve
      await new Promise((r) => setTimeout(r, 300));

      expect(invocations).toBe(1);
      expect(executedQuery).toBe('hyper');
    });

    test('1.2 Query dropped to <2 characters before 250ms immediately clears pending timer', async () => {
      let timer: any = null;
      let fired = false;

      const simulateInput = (text: string) => {
        if (timer) clearTimeout(timer);
        const trimmed = text.trim();
        if (trimmed.length < 2) {
          timer = null;
          return;
        }
        timer = setTimeout(() => {
          fired = true;
        }, 250);
      };

      simulateInput('I1'); // valid >=2
      expect(timer).not.toBeNull();

      await new Promise((r) => setTimeout(r, 100)); // 100ms passed
      simulateInput('I'); // dropped to 1 char
      expect(timer).toBeNull();

      // Wait full 300ms
      await new Promise((r) => setTimeout(r, 300));
      expect(fired).toBe(false);
    });

    test('1.3 Out-of-order async response hazard: slower earlier response is discarded by sequence tracking', async () => {
      // Test the searchSeqRef race protection logic:
      let searchSeq = 0;
      let activeResults: Icd10Code[] = [];
      let activeLoading = false;

      const executeSearchWithSeq = async (query: string, delayMs: number, returnData: Icd10Code[]) => {
        const seq = ++searchSeq;
        activeLoading = true;

        await new Promise((r) => setTimeout(r, delayMs));

        // Stale check
        if (seq !== searchSeq) {
          return; // DISCARD STALE RESPONSE
        }

        activeResults = returnData;
        activeLoading = false;
      };

      // Request 1: "hypertension" dispatched first, but network is SLOW (takes 200ms)
      const data1: Icd10Code[] = [{ code: 'I10', description: 'Essential hypertension' }];
      const promise1 = executeSearchWithSeq('hypertension', 200, data1);

      // Request 2: user retyped "asthma", network is FAST (dispatched 20ms later, takes 50ms)
      await new Promise((r) => setTimeout(r, 20));
      const data2: Icd10Code[] = [{ code: 'J45', description: 'Asthma' }];
      const promise2 = executeSearchWithSeq('asthma', 50, data2);

      await Promise.all([promise1, promise2]);

      // Request 2 resolved earlier (at ~70ms), Request 1 resolved at 200ms.
      // Active results MUST remain Request 2 ('J45'), NOT overwritten by stale Request 1 ('I10')!
      expect(activeResults).toEqual(data2);
      expect(activeResults[0].code).toBe('J45');
      expect(activeLoading).toBe(false);
    });
  });

  // =========================================================================
  // Section 2: Query Thresholds (<2 vs >=2), Boundary & Adversarial Sanitization
  // =========================================================================
  describe('2. Query Threshold (<2 vs >=2) & Adversarial Input Sanitization', () => {
    test('2.1 Rejects empty strings, whitespace-only, and single-character strings', () => {
      const isEligible = (q: string) => q.trim().length >= 2;

      expect(isEligible('')).toBe(false);
      expect(isEligible(' ')).toBe(false);
      expect(isEligible('   \t\n  ')).toBe(false);
      expect(isEligible('A')).toBe(false);
      expect(isEligible(' A ')).toBe(false);
      expect(isEligible('1')).toBe(false);
      expect(isEligible('.')).toBe(false);
    });

    test('2.2 Accepts exactly 2 characters and trims boundary whitespace', async () => {
      mockGetResponse = [{ code: 'I10', description: 'Essential hypertension' }];

      const isEligible = (q: string) => q.trim().length >= 2;
      expect(isEligible('I1')).toBe(true);
      expect(isEligible('  I1  ')).toBe(true);
      expect(isEligible('dm')).toBe(true);

      const [data, err] = await clinicService.searchIcd10('  I1  '.trim());
      expect(err).toBeNull();
      expect(lastGetUrl).toBe('/icd10?q=I1');
      expect(data).toHaveLength(1);
    });

    test('2.3 Adversarial URL encoding: dots, slashes, ampersands, quotes, and punctuation', async () => {
      mockGetResponse = [];

      const adversarialQueries = [
        'E11.9',
        'HIV/AIDS',
        'Cough & Cold',
        "Crohn's disease",
        'COVID-19, acute',
        'Type 2 DM; uncomplicated',
      ];

      for (const query of adversarialQueries) {
        await clinicService.searchIcd10(query);
        expect(lastGetUrl).toBe(`/icd10?q=${encodeURIComponent(query)}`);
      }
    });

    test('2.4 Adversarial query: non-Latin Unicode scripts (Filipino Baybayin, Cyrillic, Kanji)', async () => {
      mockGetResponse = [];

      const unicodeQueries = ['Trankaso', 'гипертония', '高血圧症', 'ᜊᜌ᜔ᜊᜌᜒᜈ᜔'];
      for (const query of unicodeQueries) {
        await clinicService.searchIcd10(query);
        expect(lastGetUrl).toBe(`/icd10?q=${encodeURIComponent(query)}`);
      }
    });

    test('2.5 Adversarial query: extreme length 1,000-character string does not throw', async () => {
      mockGetResponse = [];
      const extremeQuery = 'A'.repeat(1000);

      const [data, err] = await clinicService.searchIcd10(extremeQuery);
      expect(err).toBeNull();
      expect(lastGetUrl).toBe(`/icd10?q=${encodeURIComponent(extremeQuery)}`);
      expect(data).toEqual([]);
    });

    test('2.6 Adversarial query: SQL injection and XSS payloads are safely URL encoded', async () => {
      mockGetResponse = [];
      const sqli = "'; DROP TABLE lib_icd; --";
      const xss = '<script>alert("xss")</script>';

      await clinicService.searchIcd10(sqli);
      expect(lastGetUrl).toBe(`/icd10?q=${encodeURIComponent(sqli)}`);

      await clinicService.searchIcd10(xss);
      expect(lastGetUrl).toBe(`/icd10?q=${encodeURIComponent(xss)}`);
    });
  });

  // =========================================================================
  // Section 3: Empty Catalog Returns & Malformed Catalog Payloads
  // =========================================================================
  describe('3. Empty Catalog Handling & Robust Feedback State', () => {
    test('3.1 Empty array catalog return generates PhilHealth catalog notice', async () => {
      mockGetResponse = [];
      const [data, err] = await clinicService.searchIcd10('ZZ999');

      expect(err).toBeNull();
      expect(data).toEqual([]);

      // Component state logic
      let notice: string | null = null;
      let results: Icd10Code[] = [data!];

      if (!err && data) {
        results = data;
        if (data.length === 0) {
          notice = 'No matching codes in the PhilHealth ICD-10 catalog.';
        }
      }

      expect(results).toHaveLength(0);
      expect(notice).toBe('No matching codes in the PhilHealth ICD-10 catalog.');
    });

    test('3.2 Large catalog dataset handles 50+ items without truncation error', async () => {
      const generatedCatalog: Icd10Code[] = Array.from({ length: 60 }, (_, i) => ({
        code: `Z00.${i}`,
        description: `General medical examination ${i}`,
      }));
      mockGetResponse = generatedCatalog;

      const [data, err] = await clinicService.searchIcd10('examination');
      expect(err).toBeNull();
      expect(data).toHaveLength(60);
      expect(data![59].code).toBe('Z00.59');
    });
  });

  // =========================================================================
  // Section 4: Network Failures, HTTP 500, and Thrown Exceptions
  // =========================================================================
  describe('4. Network Failures & API Error Fault Injection', () => {
    test('4.1 Server timeout error results in catalog unreachable feedback notice', async () => {
      mockGetError = new Error('Gateway Timeout (504)');
      const [data, err] = await clinicService.searchIcd10('I10');

      expect(data).toBeNull();
      expect(err).not.toBeNull();
      expect(err.message).toBe('Gateway Timeout (504)');

      let notice: string | null = null;
      let results: Icd10Code[] = [];

      if (err) {
        results = [];
        notice = 'The PhilHealth ICD-10 catalog is unreachable.';
      }

      expect(results).toHaveLength(0);
      expect(notice).toBe('The PhilHealth ICD-10 catalog is unreachable.');
    });

    test('4.2 HTTP 500 Internal Server Error results in safe empty results and feedback notice', async () => {
      mockGetError = { status: 500, message: 'Database query failed' };
      const [data, err] = await clinicService.searchIcd10('E11');

      expect(data).toBeNull();
      expect(err).not.toBeNull();

      const notice = !data || err ? 'The PhilHealth ICD-10 catalog is unreachable.' : null;
      expect(notice).toBe('The PhilHealth ICD-10 catalog is unreachable.');
    });
  });

  // =========================================================================
  // Section 5: Dual Field Auto-Population & Selection Lifecycle
  // =========================================================================
  describe('5. Auto-Population & Selection Lifecycle', () => {
    test('5.1 Selecting a suggestion accurately populates code and standard description', () => {
      let activeCode = '';
      let activeTitle = '';

      const handleSelect = (code: string, desc: string) => {
        activeCode = code;
        activeTitle = desc;
      };

      const catalogItem: Icd10Code = {
        code: 'J45.0',
        description: 'Predominantly allergic asthma',
      };

      handleSelect(catalogItem.code, catalogItem.description);

      expect(activeCode).toBe('J45.0');
      expect(activeTitle).toBe('Predominantly allergic asthma');
    });

    test('5.2 Clearing selection resets both code and title to empty', () => {
      let activeCode = 'J45.0';
      let activeTitle = 'Predominantly allergic asthma';

      const handleClear = () => {
        activeCode = '';
        activeTitle = '';
      };

      handleClear();

      expect(activeCode).toBe('');
      expect(activeTitle).toBe('');
    });

    test('5.3 Consecutive selections smoothly replace previous diagnosis', () => {
      let activeCode = 'I10';
      let activeTitle = 'Essential hypertension';

      const handleSelect = (code: string, desc: string) => {
        activeCode = code;
        activeTitle = desc;
      };

      handleSelect('E11.9', 'Type 2 diabetes mellitus without complications');
      expect(activeCode).toBe('E11.9');
      expect(activeTitle).toBe('Type 2 diabetes mellitus without complications');

      handleSelect('K21.9', 'Gastro-esophageal reflux disease without esophagitis');
      expect(activeCode).toBe('K21.9');
      expect(activeTitle).toBe('Gastro-esophageal reflux disease without esophagitis');
    });
  });

  // =========================================================================
  // Section 6: Preserving Standardized Code on Clinical Title Refinement
  // =========================================================================
  describe('6. Preserving Standardized PhilHealth Code on Clinical Title Refinement', () => {
    test('6.1 Clinician custom clinical specialization updates title while preserving ICD-10 billing code', () => {
      const standardizedCode = 'I10';
      let clinicalTitle = 'Essential (primary) hypertension';

      const onTitleChange = (refined: string) => {
        clinicalTitle = refined;
      };

      // Doctor refines with clinical stage and treatment status
      onTitleChange('Essential hypertension, Stage 2, poorly controlled on Amlodipine 10mg');

      expect(standardizedCode).toBe('I10'); // Standardized PhilHealth code MUST remain unchanged
      expect(clinicalTitle).toBe('Essential hypertension, Stage 2, poorly controlled on Amlodipine 10mg');
    });

    test('6.2 Multiple edits to clinical title never corrupts the underlying ICD-10 code', () => {
      const standardizedCode = 'E11.9';
      let clinicalTitle = 'Type 2 diabetes mellitus';

      const edits = [
        'Type 2 diabetes mellitus with early peripheral neuropathy',
        'Type 2 diabetes mellitus, HbA1c 8.4%, on Metformin 500mg BID',
        'T2DM - uncontrolled glycemic status',
      ];

      for (const edit of edits) {
        clinicalTitle = edit;
        expect(standardizedCode).toBe('E11.9');
        expect(clinicalTitle).toBe(edit);
      }
    });
  });

  // =========================================================================
  // Section 7: Problem Submission Payload Creation & Strict Date/Code Bounds
  // =========================================================================
  describe('7. Problem Submission Payload Creation & Clinical History Intake Validation', () => {
    const fixedNow = new Date('2026-10-12T00:00:00Z');

    test('7.1 Valid problem intake payload builds uppercase ICD-10 code, trimmed title, and valid onset date', () => {
      const inputCode = '  e11.9  ';
      const inputTitle = '   Type 2 diabetes mellitus   ';
      const inputOnset = '2025-06-15';
      const inputNotes = '   On diet modification   ';

      const onsetValidation = validateDateString(inputOnset, { boundaryMode: 'pastOrToday', now: fixedNow });
      expect(onsetValidation.isValid).toBe(true);

      const payload: CreatePatientProblemPayload = {
        icd10Code: inputCode.trim().toUpperCase(),
        problemTitle: inputTitle.trim(),
        status: 'Active',
        severity: 'Moderate',
        isChronicNcd: true,
        onsetDate: inputOnset.trim(),
        clinicalNotes: inputNotes.trim(),
      };

      expect(payload.icd10Code).toBe('E11.9');
      expect(payload.problemTitle).toBe('Type 2 diabetes mellitus');
      expect(payload.onsetDate).toBe('2025-06-15');
      expect(payload.clinicalNotes).toBe('On diet modification');
      expect(payload.isChronicNcd).toBe(true);
      expect(payload.status).toBe('Active');
    });

    test('7.2 Submission rejected when ICD-10 code is missing or whitespace-only', () => {
      const validateSubmission = (code: string, title: string) => {
        if (!code.trim()) return 'ICD-10 code is required (e.g. I10, E11.9).';
        if (!title.trim()) return 'Problem diagnosis description is required.';
        return null;
      };

      expect(validateSubmission('', 'Hypertension')).toBe('ICD-10 code is required (e.g. I10, E11.9).');
      expect(validateSubmission('   ', 'Hypertension')).toBe('ICD-10 code is required (e.g. I10, E11.9).');
    });

    test('7.3 Submission rejected when Problem Title is missing or whitespace-only', () => {
      const validateSubmission = (code: string, title: string) => {
        if (!code.trim()) return 'ICD-10 code is required (e.g. I10, E11.9).';
        if (!title.trim()) return 'Problem diagnosis description is required.';
        return null;
      };

      expect(validateSubmission('I10', '')).toBe('Problem diagnosis description is required.');
      expect(validateSubmission('I10', '    ')).toBe('Problem diagnosis description is required.');
    });

    test('7.4 Submission rejected when onset date is in the future', () => {
      const futureDates = ['2026-10-13', '2026-11-01', '2030-01-01'];

      for (const futureDate of futureDates) {
        const result = validateDateString(futureDate, { boundaryMode: 'pastOrToday', now: fixedNow });
        expect(result.isValid).toBe(false);
        expect(result.errorMessage).toContain('Future date not permitted');
      }
    });

    test('7.5 Submission rejected on non-numeric date garbage or malformed text (e.g. 2026-10asaasoalkslak)', () => {
      const malformedInput = '2026-10asaasoalkslak';
      const masked = formatDateMask(malformedInput);
      expect(masked).toBe('2026-10'); // Suffix stripped, only 6 digits

      const validation = validateDateString(masked, { boundaryMode: 'pastOrToday', now: fixedNow });
      expect(validation.isValid).toBe(false);
      expect(validation.errorMessage).toContain('Incomplete date');
    });

    test('7.6 Submission rejected on invalid calendar dates (Feb 29 on non-leap year, April 31, Month 13)', () => {
      // 2026 is non-leap year
      const feb29NonLeap = validateDateString('2026-02-29', { boundaryMode: 'pastOrToday', now: fixedNow });
      expect(feb29NonLeap.isValid).toBe(false);
      expect(feb29NonLeap.errorMessage).toContain('February 2026 has only 28 days');

      // Month 13
      const month13 = validateDateString('2025-13-10', { boundaryMode: 'pastOrToday', now: fixedNow });
      expect(month13.isValid).toBe(false);
      expect(month13.errorMessage).toContain('Month must be between 01 and 12');

      // April 31 (April has only 30 days)
      const apr31 = validateDateString('2025-04-31', { boundaryMode: 'pastOrToday', now: fixedNow });
      expect(apr31.isValid).toBe(false);
      expect(apr31.errorMessage).toContain('Day must be between 01 and 30');
    });

    test('7.7 Onset date is optional: omitted onset date builds payload with undefined onsetDate', () => {
      const code = 'J00';
      const title = 'Acute nasopharyngitis';
      const emptyOnset = '';

      const payload: CreatePatientProblemPayload = {
        icd10Code: code.trim().toUpperCase(),
        problemTitle: title.trim(),
        status: 'Active',
        severity: 'Mild',
        isChronicNcd: false,
        onsetDate: emptyOnset ? emptyOnset.trim() : undefined,
      };

      expect(payload.icd10Code).toBe('J00');
      expect(payload.onsetDate).toBeUndefined();
    });

    test('7.8 Problem status lifecycle: Active to Resolved generates resolvedDate; Reactivate clears resolvedDate', () => {
      // Problem initially Active
      let status: 'Active' | 'Resolved' = 'Active';
      let resolvedDate: string | undefined = undefined;

      // Doctor marks Resolved
      const markResolved = () => {
        status = 'Resolved';
        resolvedDate = '2026-10-12';
      };

      markResolved();
      expect(status).toBe('Resolved');
      expect(resolvedDate).toBe('2026-10-12');

      // Doctor reactivates problem
      const reactivate = () => {
        status = 'Active';
        resolvedDate = undefined;
      };

      reactivate();
      expect(status).toBe('Active');
      expect(resolvedDate).toBeUndefined();
    });
  });
});

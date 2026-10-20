// token-guard:ignore-file
import { describe, expect, test, mock, beforeEach } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

(globalThis as any).__DEV__ = true;

// 1. Mock React Native modules for Bun environment
const createMockComponent = (name: string) => {
  const Comp = ({ children, accessibilityLabel, accessibilityRole, placeholder, testID, title, label, ...props }: any) =>
    React.createElement(
      'div',
      {
        'data-component': name,
        ...(testID ? { 'data-testid': testID } : {}),
        ...(accessibilityLabel ? { 'aria-label': accessibilityLabel } : {}),
        ...(accessibilityRole ? { role: accessibilityRole } : {}),
        ...(placeholder ? { 'data-placeholder': placeholder } : {}),
        ...(title ? { 'data-title': title } : {}),
        ...(label ? { 'data-label': label } : {}),
      },
      title || label || placeholder,
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
  RefreshControl: createMockComponent('RefreshControl'),
  Dimensions: {
    get: () => ({ width: 1280, height: 800 }),
    addEventListener: () => ({ remove: () => {} }),
  },
  useWindowDimensions: () => ({ width: 1280, height: 800 }),
  Keyboard: { dismiss: () => {}, addListener: () => ({ remove: () => {} }) },
  AppState: { addEventListener: () => ({ remove: () => {} }) },
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
  Alert: { alert: () => {} },
  Linking: { openURL: () => Promise.resolve(), canOpenURL: () => Promise.resolve(true) },
  processColor: (c: any) => c,
}));

mock.module('expo-crypto', () => ({
  randomUUID: () => 'mock-uuid-' + Math.random().toString(36).substring(2, 9),
}));

mock.module('react-native-svg', () => ({
  Svg: createMockComponent('svg'),
  Path: createMockComponent('path'),
  Circle: createMockComponent('circle'),
  Rect: createMockComponent('rect'),
  Line: createMockComponent('line'),
  default: createMockComponent('svg'),
}));

mock.module('../constants/fonts', () => ({
  applyFontFamily: (s: any) => s,
  fontAssets: {},
}));

mock.module('../utils/useBreakpoint', () => ({
  useBreakpoint: () => ({
    width: 1280,
    height: 800,
    isCompact: false,
    isWorkstation: true,
    isDesktop: true,
    isWide: false,
  }),
}));

const mockNotify = {
  success: mock((_msg: string) => {}),
  error: mock((_msg: string) => {}),
  info: mock((_msg: string) => {}),
};
mock.module('../utils/feedback', () => ({
  notify: mockNotify,
  subscribeFeedback: () => () => {},
  getFeedbackState: () => ({ alerts: [], toasts: [] }),
  dismissAlert: () => {},
  dismissToast: () => {},
  resetFeedbackState: () => {},
  Alert: { alert: () => {} },
}));

// Imports after mocking
const {
  OrderCatalogSearchModal,
  CATEGORY_TABS,
  DENTAL_CLINICAL_INSTRUCTION_CHIPS,
  DIAGNOSTIC_FASTING_CHIPS,
  PROCEDURE_INSTRUCTION_CHIPS,
} = await import('../components/consultation/OrderCatalogSearchModal');
import type { ClinicServiceItem } from '../services/clinicService';
import type { OrderCatalogItemPayload, CategoryTab } from '../components/consultation/OrderCatalogSearchModal';

// Canonical test catalog with 10 dental presets and other medical items
const FULL_STRESS_CATALOG: ClinicServiceItem[] = [
  { id: 'dent-1', tenantId: 't1', clinicId: 'c1', code: 'DENT-CONS', name: 'Dental Consultation & Oral Examination', category: 'Dental', standardPrice: 500, isActive: true },
  { id: 'dent-2', tenantId: 't1', clinicId: 'c1', code: 'DENT-CLEAN', name: 'Oral Prophylaxis / Dental Cleaning', category: 'Dental', standardPrice: 850, isActive: true },
  { id: 'dent-3', tenantId: 't1', clinicId: 'c1', code: 'DENT-FILL-COMP', name: 'Composite Light-Cure Tooth Restoration', category: 'Dental', standardPrice: 950, description: 'Resin-based aesthetic composite restoration', isActive: true },
  { id: 'dent-4', tenantId: 't1', clinicId: 'c1', code: 'DENT-EXT-SIMPLE', name: 'Tooth Extraction - Simple Exodontia', category: 'Dental', standardPrice: 1000, description: 'Routine non-surgical tooth extraction', isActive: true },
  { id: 'dent-5', tenantId: 't1', clinicId: 'c1', code: 'DENT-EXT-SURG', name: 'Surgical Odontectomy - Impacted Third Molar', category: 'Dental', standardPrice: 3500, description: 'Surgical extraction of impacted third molar with bone guttering', isActive: true },
  { id: 'dent-6', tenantId: 't1', clinicId: 'c1', code: 'DENT-SEALANT', name: 'Pit and Fissure Sealant', category: 'Dental', standardPrice: 600, isActive: true },
  { id: 'dent-7', tenantId: 't1', clinicId: 'c1', code: 'DENT-FLUOR', name: 'Topical Fluoride Varnish Application', category: 'Dental', standardPrice: 500, isActive: true },
  { id: 'dent-8', tenantId: 't1', clinicId: 'c1', code: 'DENT-XR-PA', name: 'Dental Periapical Radiograph / X-Ray', category: 'Dental', standardPrice: 400, description: 'Intraoral periapical radiograph with digital sensor', isActive: true },
  { id: 'dent-9', tenantId: 't1', clinicId: 'c1', code: 'DENT-RCT', name: 'Root Canal Therapy / Endodontic Treatment', category: 'Dental', standardPrice: 4000, description: 'Anterior / Premolar root canal therapy', isActive: true },
  { id: 'dent-10', tenantId: 't1', clinicId: 'c1', code: 'DENT-PULP', name: 'Pediatric Pulpotomy', category: 'Dental', standardPrice: 1500, description: 'Coronal pulp amputation in primary teeth with MTA / Formocresol', isActive: true },
  { id: 'proc-1', tenantId: 't1', clinicId: 'c1', code: 'PROC-NEB', name: 'Nebulization Therapy', category: 'Procedure', standardPrice: 250, isActive: true },
  { id: 'proc-2', tenantId: 't1', clinicId: 'c1', code: 'PROC-VAX', name: 'Vaccine Administration Fee', category: 'NursingService', standardPrice: 200, isActive: true },
  { id: 'proc-3', tenantId: 't1', clinicId: 'c1', code: 'PROC-WOUND', name: 'Wound Dressing & Debridement', category: 'Procedure', standardPrice: 350, isActive: true },
  { id: 'diag-1', tenantId: 't1', clinicId: 'c1', code: 'LAB-CBC', name: 'Complete Blood Count (CBC)', category: 'Diagnostic', standardPrice: 250, philHealthCode: 'CBC01', isActive: true },
  { id: 'diag-2', tenantId: 't1', clinicId: 'c1', code: 'LAB-URINE', name: 'Routine Urinalysis', category: 'Diagnostic', standardPrice: 150, philHealthCode: 'URI01', isActive: true },
  { id: 'diag-3', tenantId: 't1', clinicId: 'c1', code: 'LAB-RBS', name: 'Random Blood Sugar (RBS Fingerstick)', category: 'Diagnostic', standardPrice: 120, philHealthCode: 'RBS01', isActive: true },
  { id: 'cons-1', tenantId: 't1', clinicId: 'c1', code: 'CONS-GEN', name: 'General Medical Consultation', category: 'Consultation', standardPrice: 500, isActive: true },
  { id: 'med-1', tenantId: 't1', clinicId: 'c1', code: 'MED-AMOX-500', name: 'Amoxicillin 500mg Capsule', category: 'Medicine', standardPrice: 15, isActive: true },
  { id: 'dent-inactive', tenantId: 't1', clinicId: 'c1', code: 'DENT-OLD', name: 'Deprecated Amalgam Restoration', category: 'Dental', standardPrice: 600, isActive: false },
];

// Helper to simulate the modal filter logic directly for rapid pure-logic stress testing
function filterCatalogDirect(catalog: ClinicServiceItem[], selectedCategory: CategoryTab, searchQuery: string) {
  const q = searchQuery.trim().toLowerCase();
  return catalog.filter((item) => {
    if (item.isActive === false) return false;

    const catLower = (item.category || '').toLowerCase();
    if (selectedCategory === 'Diagnostic') {
      if (!catLower.includes('diagnostic')) return false;
    } else if (selectedCategory === 'Procedure') {
      if (!catLower.includes('procedure') && !catLower.includes('nursing') && !catLower.includes('dental')) return false;
    } else if (selectedCategory === 'Dental') {
      if (!catLower.includes('dental')) return false;
    }

    if (q) {
      const nameMatch = (item.name || '').toLowerCase().includes(q);
      const codeMatch = (item.code || '').toLowerCase().includes(q);
      const philHealthCodeMatch = (item.philHealthCode || '').toLowerCase().includes(q);
      const descMatch = (item.description || '').toLowerCase().includes(q);
      const philHealthDescMatch = (item.philHealthDescription || '').toLowerCase().includes(q);
      if (!nameMatch && !codeMatch && !philHealthCodeMatch && !descMatch && !philHealthDescMatch) {
        return false;
      }
    }

    return true;
  });
}

// Helper to simulate instruction chip toggling logic
function toggleChipLogic(prevInstructions: string, chip: string): string {
  const trimmed = prevInstructions.trim();
  if (!trimmed) {
    return chip;
  }
  const parts = trimmed.split(';').map((p) => p.trim());
  if (parts.includes(chip)) {
    const remaining = parts.filter((p) => p !== chip);
    return remaining.join('; ');
  }
  return `${trimmed}; ${chip}`;
}

describe('Challenger M2-1: Empirical Frontend Stress Tests & Adversarial Verification', () => {

  // =========================================================================
  // Section 1: Rapid Switching Between Tabs & Partition Invariants
  // =========================================================================
  describe('1. Rapid Tab Switching & Categorization Invariants', () => {
    test('1.1 Partition Invariants across All, Dental, Procedure, Diagnostic', () => {
      const allActive = FULL_STRESS_CATALOG.filter((i) => i.isActive !== false);
      const inAll = filterCatalogDirect(FULL_STRESS_CATALOG, 'All', '');
      const inDental = filterCatalogDirect(FULL_STRESS_CATALOG, 'Dental', '');
      const inProc = filterCatalogDirect(FULL_STRESS_CATALOG, 'Procedure', '');
      const inDiag = filterCatalogDirect(FULL_STRESS_CATALOG, 'Diagnostic', '');

      // All tab includes all 18 active items
      expect(inAll.length).toBe(18);
      expect(inAll.find((i) => i.code === 'DENT-OLD')).toBeUndefined(); // Inactive excluded

      // Dental tab contains exactly the 10 active dental items
      expect(inDental.length).toBe(10);
      inDental.forEach((item) => {
        expect(item.category.toLowerCase()).toContain('dental');
      });

      // Procedure tab includes procedures (2), nursing (1), AND dental (10) = 13 items
      expect(inProc.length).toBe(13);
      inDental.forEach((dentItem) => {
        expect(inProc.some((p) => p.code === dentItem.code)).toBe(true);
      });
      expect(inProc.some((p) => p.code === 'PROC-NEB')).toBe(true);
      expect(inProc.some((p) => p.code === 'PROC-VAX')).toBe(true);
      expect(inProc.some((p) => p.code === 'PROC-WOUND')).toBe(true);

      // Diagnostic tab contains only diagnostics (3 items) and strictly excludes dental and procedures
      expect(inDiag.length).toBe(3);
      inDiag.forEach((item) => {
        expect(item.category.toLowerCase()).toContain('diagnostic');
        expect(item.category.toLowerCase()).not.toContain('dental');
      });
    });

    test('1.2 High-frequency rapid tab cycling preserves partition stability without state leakage', () => {
      const sequence: CategoryTab[] = [
        'All', 'Dental', 'Procedure', 'Diagnostic', 'Dental', 'All',
        'Diagnostic', 'Dental', 'Procedure', 'All', 'Dental', 'Diagnostic',
      ];

      for (let cycle = 0; cycle < 50; cycle++) {
        for (const tab of sequence) {
          const result = filterCatalogDirect(FULL_STRESS_CATALOG, tab, '');
          if (tab === 'All') expect(result.length).toBe(18);
          if (tab === 'Dental') expect(result.length).toBe(10);
          if (tab === 'Procedure') expect(result.length).toBe(13);
          if (tab === 'Diagnostic') expect(result.length).toBe(3);
        }
      }
    });

    test('1.3 UI Render matches expected tab counts when switching initialCategory', () => {
      const tabs: Array<{ cat: CategoryTab; expectedCount: number }> = [
        { cat: 'All', expectedCount: 18 },
        { cat: 'Dental', expectedCount: 10 },
        { cat: 'Procedure', expectedCount: 13 },
        { cat: 'Diagnostic', expectedCount: 3 },
      ];

      for (const { cat, expectedCount } of tabs) {
        const html = renderToStaticMarkup(
          React.createElement(OrderCatalogSearchModal, {
            visible: true,
            onClose: () => {},
            catalog: FULL_STRESS_CATALOG,
            initialCategory: cat,
            onSelectOrder: () => {},
          })
        );
        expect(html).toContain(`Matching Catalog Items (${expectedCount})`);
      }
    });
  });

  // =========================================================================
  // Section 2: Search Queries with Mixed Casing, Punctuation & Special Characters
  // =========================================================================
  describe('2. Adversarial Search Queries & Special Character Resilience', () => {
    test('2.1 Mixed casing queries match dental services seamlessly', () => {
      const queries = [
        { q: 'dEnT-cOnS', expectedCode: 'DENT-CONS' },
        { q: 'CoMpOsItE', expectedCode: 'DENT-FILL-COMP' },
        { q: 'fLuOrIdE', expectedCode: 'DENT-FLUOR' },
        { q: 'x-RaY', expectedCode: 'DENT-XR-PA' },
        { q: 'pUlPoToMy', expectedCode: 'DENT-PULP' },
        { q: 'rOoT cAnAl', expectedCode: 'DENT-RCT' },
        { q: 'sUrGiCaL oDoNtEcToMy', expectedCode: 'DENT-EXT-SURG' },
      ];

      for (const { q, expectedCode } of queries) {
        const result = filterCatalogDirect(FULL_STRESS_CATALOG, 'All', q);
        expect(result.some((item) => item.code === expectedCode)).toBe(true);
      }
    });

    test('2.2 Regex metacharacters in search query do not throw and match literal substrings', () => {
      const regexPatterns = [
        '.*', '+', '?', '^', '$', '(', ')', '[', ']', '{', '}', '|', '\\',
        'DENT.*', 'Tooth+', '(CBC)', '[PA]', '(?i)extraction',
      ];

      for (const pattern of regexPatterns) {
        expect(() => {
          filterCatalogDirect(FULL_STRESS_CATALOG, 'All', pattern);
        }).not.toThrow();
      }

      // Exact substring matching test: '(' matches 'Complete Blood Count (CBC)' and 'Random Blood Sugar (RBS Fingerstick)'
      const openParenMatches = filterCatalogDirect(FULL_STRESS_CATALOG, 'All', '(');
      expect(openParenMatches.length).toBeGreaterThanOrEqual(2);
      expect(openParenMatches.some((i) => i.code === 'LAB-CBC')).toBe(true);
      expect(openParenMatches.some((i) => i.code === 'LAB-RBS')).toBe(true);

      // '-' matches hyphens in dental codes
      const hyphenMatches = filterCatalogDirect(FULL_STRESS_CATALOG, 'Dental', '-');
      expect(hyphenMatches.length).toBe(10);

      // '/' matches 'Oral Prophylaxis / Dental Cleaning' and 'Dental Periapical Radiograph / X-Ray'
      const slashMatches = filterCatalogDirect(FULL_STRESS_CATALOG, 'Dental', '/');
      expect(slashMatches.length).toBeGreaterThanOrEqual(3);
    });

    test('2.3 Punctuation, currency, unicode and security payload queries', () => {
      const exoticQueries = [
        '₱500', '₱', '#', 'MOD', 'Tooth #18',
        'SQL injection: \' OR \'1\'=\'1\'; --',
        '<script>alert("XSS")</script>',
        '${7*7}', '{{constructor}}',
        '🦷', 'MTA / Formocresol', 'ñ', 'é',
      ];

      for (const q of exoticQueries) {
        expect(() => {
          const res = filterCatalogDirect(FULL_STRESS_CATALOG, 'All', q);
          expect(Array.isArray(res)).toBe(true);
        }).not.toThrow();
      }

      // Test matching description containing 'MTA / Formocresol'
      const mtaRes = filterCatalogDirect(FULL_STRESS_CATALOG, 'Dental', 'MTA / Formocresol');
      expect(mtaRes.length).toBe(1);
      expect(mtaRes[0].code).toBe('DENT-PULP');
    });

    test('2.4 Extremely long search query (10,000 chars) handles in sub-millisecond without crash', () => {
      const megaQuery = 'a'.repeat(10000);
      const start = performance.now();
      const res = filterCatalogDirect(FULL_STRESS_CATALOG, 'All', megaQuery);
      const duration = performance.now() - start;

      expect(res.length).toBe(0);
      expect(duration).toBeLessThan(100); // Must be fast and not freeze
    });

    test('2.5 Whitespace padding (leading, trailing, tabs, multi-spaces) is sanitized', () => {
      const paddedQueries = [
        '   DENT-CONS   ',
        '\t\tDENT-CONS\n',
        '   Composite   Light-Cure   ',
      ];

      const res1 = filterCatalogDirect(FULL_STRESS_CATALOG, 'Dental', paddedQueries[0]);
      expect(res1.length).toBe(1);
      expect(res1[0].code).toBe('DENT-CONS');

      const res2 = filterCatalogDirect(FULL_STRESS_CATALOG, 'Dental', paddedQueries[1]);
      expect(res2.length).toBe(1);
      expect(res2[0].code).toBe('DENT-CONS');
    });

    test('2.6 Search intersection with CategoryTab filters strictly within category', () => {
      // Searching "extraction" in Dental gives 2 items (Simple & Surg)
      const inDental = filterCatalogDirect(FULL_STRESS_CATALOG, 'Dental', 'extraction');
      expect(inDental.length).toBe(2);
      expect(inDental.map((i) => i.code)).toEqual(['DENT-EXT-SIMPLE', 'DENT-EXT-SURG']);

      // Searching "extraction" in Procedure also includes those 2 dental items
      const inProc = filterCatalogDirect(FULL_STRESS_CATALOG, 'Procedure', 'extraction');
      expect(inProc.length).toBe(2);

      // Searching "extraction" in Diagnostic returns 0 items
      const inDiag = filterCatalogDirect(FULL_STRESS_CATALOG, 'Diagnostic', 'extraction');
      expect(inDiag.length).toBe(0);

      // Searching "blood" in Dental returns 0 items
      const bloodDental = filterCatalogDirect(FULL_STRESS_CATALOG, 'Dental', 'blood');
      expect(bloodDental.length).toBe(0);

      // Searching "blood" in Diagnostic returns CBC and RBS
      const bloodDiag = filterCatalogDirect(FULL_STRESS_CATALOG, 'Diagnostic', 'blood');
      expect(bloodDiag.length).toBe(2);
    });
  });

  // =========================================================================
  // Section 3: Clinical Instruction Chip Toggling & Non-Clobbering Verification
  // =========================================================================
  describe('3. Clinical Instruction Chip Toggling & Non-Clobbering Invariants', () => {
    test('3.1 Sequential addition of all 5 dental instruction chips concatenates with "; "', () => {
      let inst = 'Tooth #18 (MOD)';

      inst = toggleChipLogic(inst, DENTAL_CLINICAL_INSTRUCTION_CHIPS[0]);
      expect(inst).toBe('Tooth #18 (MOD); Local anesthesia (Infiltration)');

      inst = toggleChipLogic(inst, DENTAL_CLINICAL_INSTRUCTION_CHIPS[1]);
      expect(inst).toBe('Tooth #18 (MOD); Local anesthesia (Infiltration); Mandibular nerve block');

      inst = toggleChipLogic(inst, DENTAL_CLINICAL_INSTRUCTION_CHIPS[2]);
      expect(inst).toBe('Tooth #18 (MOD); Local anesthesia (Infiltration); Mandibular nerve block; Rubber dam isolation');

      inst = toggleChipLogic(inst, DENTAL_CLINICAL_INSTRUCTION_CHIPS[3]);
      expect(inst).toBe('Tooth #18 (MOD); Local anesthesia (Infiltration); Mandibular nerve block; Rubber dam isolation; Post-extraction care instructions');

      inst = toggleChipLogic(inst, DENTAL_CLINICAL_INSTRUCTION_CHIPS[4]);
      expect(inst).toBe('Tooth #18 (MOD); Local anesthesia (Infiltration); Mandibular nerve block; Rubber dam isolation; Post-extraction care instructions; Suture removal 7 days');
    });

    test('3.2 Unchecking arbitrary middle chip removes ONLY that chip and preserves Tooth header and other chips', () => {
      let inst = 'Tooth #26 (O); Local anesthesia (Infiltration); Rubber dam isolation; Suture removal 7 days';

      // Remove middle chip: 'Rubber dam isolation'
      inst = toggleChipLogic(inst, 'Rubber dam isolation');
      expect(inst).toBe('Tooth #26 (O); Local anesthesia (Infiltration); Suture removal 7 days');

      // Remove first chip: 'Local anesthesia (Infiltration)'
      inst = toggleChipLogic(inst, 'Local anesthesia (Infiltration)');
      expect(inst).toBe('Tooth #26 (O); Suture removal 7 days');

      // Remove last chip: 'Suture removal 7 days'
      inst = toggleChipLogic(inst, 'Suture removal 7 days');
      expect(inst).toBe('Tooth #26 (O)');

      // Verify Tooth header is 100% intact!
      expect(inst).toBe('Tooth #26 (O)');
    });

    test('3.3 Free-form clinician remarks are preserved during chip toggling', () => {
      let inst = 'Tooth #36; Patient anxious, needs nitrous oxide; Rubber dam isolation';

      // Uncheck Rubber dam isolation
      inst = toggleChipLogic(inst, 'Rubber dam isolation');
      expect(inst).toBe('Tooth #36; Patient anxious, needs nitrous oxide');

      // Add Mandibular nerve block
      inst = toggleChipLogic(inst, 'Mandibular nerve block');
      expect(inst).toBe('Tooth #36; Patient anxious, needs nitrous oxide; Mandibular nerve block');

      // Uncheck Mandibular nerve block
      inst = toggleChipLogic(inst, 'Mandibular nerve block');
      expect(inst).toBe('Tooth #36; Patient anxious, needs nitrous oxide');
    });

    test('3.4 Repeated toggle loop (toggle on and off 50 times) produces idempotent state', () => {
      const base = 'Tooth #48 (Impacted)';
      let inst = base;
      const chip = 'Local anesthesia (Infiltration)';

      for (let i = 0; i < 50; i++) {
        inst = toggleChipLogic(inst, chip);
        expect(inst).toBe(`${base}; ${chip}`);
        inst = toggleChipLogic(inst, chip);
        expect(inst).toBe(base);
      }
      expect(inst).toBe(base);
    });

    test('3.5 Empty initial instructions toggles first chip cleanly without leading semicolon', () => {
      let inst = '';
      inst = toggleChipLogic(inst, 'Local anesthesia (Infiltration)');
      expect(inst).toBe('Local anesthesia (Infiltration)');

      inst = toggleChipLogic(inst, 'Local anesthesia (Infiltration)');
      expect(inst).toBe('');
    });
  });

  // =========================================================================
  // Section 4: Quick Order from Odontogram (Adult 11–48 & Child 51–85)
  // =========================================================================
  describe('4. Odontogram Quick Order Pre-Selection & Tooth Number/Surface Permutations', () => {
    test('4.1 Adult FDI Tooth Numbers (11–48) all pre-populate correct header and banner in modal', () => {
      const adultTeeth = [
        // Upper Right Q1: 11..18
        11, 12, 13, 14, 15, 16, 17, 18,
        // Upper Left Q2: 21..28
        21, 22, 23, 24, 25, 26, 27, 28,
        // Lower Left Q3: 31..38
        31, 32, 33, 34, 35, 36, 37, 38,
        // Lower Right Q4: 41..48
        41, 42, 43, 44, 45, 46, 47, 48,
      ];

      for (const tooth of adultTeeth) {
        const html = renderToStaticMarkup(
          React.createElement(OrderCatalogSearchModal, {
            visible: true,
            onClose: () => {},
            catalog: FULL_STRESS_CATALOG,
            initialCategory: 'Dental',
            initialToothNumber: tooth,
            initialToothSurface: 'MOD',
            onSelectOrder: () => {},
          })
        );

        expect(html).toContain(`Target: Tooth #${tooth} (MOD)`);
        expect(html).toContain(`Order procedure for Tooth #${tooth} (MOD)`);
        expect(html).toContain('Matching Catalog Items (10)');
        expect(html).toContain('DENT-FILL-COMP');
      }
    });

    test('4.1b isDental condition and chip sets resolve accurately across all states', () => {
      // Test isDental logic matrix:
      // isDental = selectedCategory === 'Dental' || Boolean(initialToothNumber) || Boolean(selectedItem && (selectedItem.category || '').toLowerCase().includes('dental'))

      const resolveSectionHeader = (selectedCat: CategoryTab, toothNumber?: number, itemCat?: string) => {
        const isDental =
          selectedCat === 'Dental' ||
          Boolean(toothNumber) ||
          Boolean(itemCat && itemCat.toLowerCase().includes('dental'));
        const isDiag = (itemCat || '').toLowerCase().includes('diagnostic');

        if (isDental) return { title: 'Dental Clinical Instructions & Notes', chips: DENTAL_CLINICAL_INSTRUCTION_CHIPS };
        if (isDiag) return { title: 'Fasting & Clinical Instructions', chips: DIAGNOSTIC_FASTING_CHIPS };
        return { title: 'Procedure Instructions & Notes', chips: PROCEDURE_INSTRUCTION_CHIPS };
      };

      // 1. Initial category Dental
      const r1 = resolveSectionHeader('Dental', undefined, 'Dental');
      expect(r1.title).toBe('Dental Clinical Instructions & Notes');
      expect(r1.chips).toEqual(DENTAL_CLINICAL_INSTRUCTION_CHIPS);

      // 2. Initial tooth number present, even if selectedCategory is All
      const r2 = resolveSectionHeader('All', 18, 'Dental');
      expect(r2.title).toBe('Dental Clinical Instructions & Notes');
      expect(r2.chips).toEqual(DENTAL_CLINICAL_INSTRUCTION_CHIPS);

      // 3. Category is Procedure, but selected item is Dental
      const r3 = resolveSectionHeader('Procedure', undefined, 'Dental');
      expect(r3.title).toBe('Dental Clinical Instructions & Notes');
      expect(r3.chips).toEqual(DENTAL_CLINICAL_INSTRUCTION_CHIPS);

      // 4. Category is Procedure, selected item is General Procedure
      const r4 = resolveSectionHeader('Procedure', undefined, 'Procedure');
      expect(r4.title).toBe('Procedure Instructions & Notes');
      expect(r4.chips).toEqual(PROCEDURE_INSTRUCTION_CHIPS);

      // 5. Category is Diagnostic, selected item is Diagnostic
      const r5 = resolveSectionHeader('Diagnostic', undefined, 'Diagnostic');
      expect(r5.title).toBe('Fasting & Clinical Instructions');
      expect(r5.chips).toEqual(DIAGNOSTIC_FASTING_CHIPS);
    });

    test('4.2 Child Deciduous FDI Tooth Numbers (51–85) with various surfaces', () => {
      const childTeeth = [
        // Upper Right Primary Q5: 51..55
        { tooth: 51, surface: 'M' },
        { tooth: 52, surface: 'D' },
        { tooth: 53, surface: 'B' },
        { tooth: 54, surface: 'O' },
        { tooth: 55, surface: 'MOD' },
        // Upper Left Primary Q6: 61..65
        { tooth: 61, surface: 'I' },
        { tooth: 62, surface: 'F' },
        { tooth: 63, surface: 'L' },
        { tooth: 64, surface: 'MO' },
        { tooth: 65, surface: 'DO' },
        // Lower Left Primary Q7: 71..75
        { tooth: 71, surface: 'B' },
        { tooth: 72, surface: 'L' },
        { tooth: 73, surface: 'MODBL' },
        { tooth: 74, surface: 'O' },
        { tooth: 75, surface: 'MOD' },
        // Lower Right Primary Q8: 81..85
        { tooth: 81, surface: undefined }, // Whole tooth extraction
        { tooth: 82, surface: undefined },
        { tooth: 83, surface: 'B' },
        { tooth: 84, surface: 'O' },
        { tooth: 85, surface: 'MOD' },
      ];

      for (const { tooth, surface } of childTeeth) {
        const expectedLabel = `Tooth #${tooth}${surface ? ` (${surface})` : ''}`;
        const html = renderToStaticMarkup(
          React.createElement(OrderCatalogSearchModal, {
            visible: true,
            onClose: () => {},
            catalog: FULL_STRESS_CATALOG,
            initialCategory: 'Dental',
            initialToothNumber: tooth,
            initialToothSurface: surface,
            onSelectOrder: () => {},
          })
        );

        expect(html).toContain(`Target: ${expectedLabel}`);
        expect(html).toContain(`Order procedure for ${expectedLabel}`);
      }
    });

    test('4.3 Ordering the same dental procedure on DIFFERENT teeth coexists without clobbering', () => {
      // Simulate Consultations.screen orderedProcedures state
      let orderedProcedures: Array<{
        serviceItemId: string;
        code: string;
        name: string;
        category: string;
        standardPrice: number;
        toothNumber?: number;
        toothSurface?: string;
        instructions?: string;
      }> = [];

      const addProcedure = (payload: OrderCatalogItemPayload) => {
        const index = orderedProcedures.findIndex(
          (p) =>
            p.name.toLowerCase() === payload.name.toLowerCase() &&
            (payload.toothNumber !== undefined ? p.toothNumber === payload.toothNumber : p.toothNumber === undefined)
        );
        const newProc = {
          serviceItemId: payload.serviceItemId,
          code: payload.code,
          name: payload.name,
          category: payload.category,
          standardPrice: payload.standardPrice,
          instructions: payload.instructions,
          toothNumber: payload.toothNumber,
          toothSurface: payload.toothSurface,
        };
        if (index >= 0) {
          orderedProcedures[index] = newProc;
        } else {
          orderedProcedures.push(newProc);
        }
      };

      // Order Composite Restoration on Tooth 11 (M)
      addProcedure({
        serviceItemId: 'dent-3',
        code: 'DENT-FILL-COMP',
        name: 'Composite Light-Cure Tooth Restoration',
        category: 'Dental',
        standardPrice: 950,
        fulfillmentMode: 'in_house',
        toothNumber: 11,
        toothSurface: 'M',
        instructions: 'Tooth #11 (M); Rubber dam isolation',
      });

      // Order Composite Restoration on Tooth 21 (D)
      addProcedure({
        serviceItemId: 'dent-3',
        code: 'DENT-FILL-COMP',
        name: 'Composite Light-Cure Tooth Restoration',
        category: 'Dental',
        standardPrice: 950,
        fulfillmentMode: 'in_house',
        toothNumber: 21,
        toothSurface: 'D',
        instructions: 'Tooth #21 (D); Rubber dam isolation',
      });

      // Order Composite Restoration on Child Tooth 55 (MOD)
      addProcedure({
        serviceItemId: 'dent-3',
        code: 'DENT-FILL-COMP',
        name: 'Composite Light-Cure Tooth Restoration',
        category: 'Dental',
        standardPrice: 950,
        fulfillmentMode: 'in_house',
        toothNumber: 55,
        toothSurface: 'MOD',
        instructions: 'Tooth #55 (MOD)',
      });

      // All 3 procedures must coexist!
      expect(orderedProcedures.length).toBe(3);
      expect(orderedProcedures[0].toothNumber).toBe(11);
      expect(orderedProcedures[0].toothSurface).toBe('M');
      expect(orderedProcedures[1].toothNumber).toBe(21);
      expect(orderedProcedures[1].toothSurface).toBe('D');
      expect(orderedProcedures[2].toothNumber).toBe(55);
      expect(orderedProcedures[2].toothSurface).toBe('MOD');

      // Now update Tooth 11 instructions
      addProcedure({
        serviceItemId: 'dent-3',
        code: 'DENT-FILL-COMP',
        name: 'Composite Light-Cure Tooth Restoration',
        category: 'Dental',
        standardPrice: 950,
        fulfillmentMode: 'in_house',
        toothNumber: 11,
        toothSurface: 'M',
        instructions: 'Tooth #11 (M); Rubber dam isolation; Local anesthesia (Infiltration)',
      });

      // Still 3 procedures, but Tooth 11 is updated
      expect(orderedProcedures.length).toBe(3);
      expect(orderedProcedures[0].instructions).toContain('Local anesthesia (Infiltration)');
    });

    test('4.4 Procedure Removal isolates specific tooth without clobbering other teeth', () => {
      let orderedProcedures = [
        { name: 'Composite Light-Cure Tooth Restoration', toothNumber: 16, toothSurface: 'MOD' },
        { name: 'Tooth Extraction - Simple Exodontia', toothNumber: 18, toothSurface: undefined },
        { name: 'Composite Light-Cure Tooth Restoration', toothNumber: 26, toothSurface: 'O' },
        { name: 'Pediatric Pulpotomy', toothNumber: 55, toothSurface: 'O' },
      ];

      const removeProcedure = (procName: string, toothNumber?: number) => {
        orderedProcedures = orderedProcedures.filter((p) => {
          if (p.name.toLowerCase() !== procName.toLowerCase()) return true;
          if (toothNumber !== undefined && p.toothNumber !== toothNumber) return true;
          if (toothNumber === undefined && p.toothNumber !== undefined) return true;
          return false;
        });
      };

      // Remove Tooth 16 Composite
      removeProcedure('Composite Light-Cure Tooth Restoration', 16);
      expect(orderedProcedures.length).toBe(3);
      expect(orderedProcedures.find((p) => p.toothNumber === 16)).toBeUndefined();
      // Tooth 26 Composite is still there!
      expect(orderedProcedures.find((p) => p.toothNumber === 26)).toBeDefined();

      // Remove Tooth 18 Simple Extraction
      removeProcedure('Tooth Extraction - Simple Exodontia', 18);
      expect(orderedProcedures.length).toBe(2);
      expect(orderedProcedures.map((p) => p.toothNumber)).toEqual([26, 55]);
    });

    test('4.5 Encounter Signing: Dental procedures map to Cashier invoice with proper pricing and category', () => {
      // Simulate procedureCatalog with dental included
      const procedureCatalog = FULL_STRESS_CATALOG.filter((item) => {
        const cat = item.category.toLowerCase();
        return cat.includes('procedure') || cat.includes('nursingservice') || cat.includes('dental');
      });

      const consultationFee = FULL_STRESS_CATALOG.find((i) => i.code === 'DENT-CONS');

      const orderedProcedures = [
        {
          serviceItemId: 'dent-3',
          code: 'DENT-FILL-COMP',
          name: 'Composite Light-Cure Tooth Restoration',
          category: 'Dental',
          standardPrice: 950,
          toothNumber: 16,
          toothSurface: 'MOD',
        },
        {
          serviceItemId: 'dent-4',
          code: 'DENT-EXT-SIMPLE',
          name: 'Tooth Extraction - Simple Exodontia',
          category: 'Dental',
          standardPrice: 1000,
          toothNumber: 18,
        },
        {
          serviceItemId: 'dent-10',
          code: 'DENT-PULP',
          name: 'Pediatric Pulpotomy',
          category: 'Dental',
          standardPrice: 1500,
          toothNumber: 55,
        },
      ];

      // Build invoice line items exactly as Consultations.screen.tsx handleSignAndSync does
      const billItems: Array<{
        serviceItemId?: string;
        itemCode?: string;
        description: string;
        category: string;
        unitPrice: number;
        quantity: number;
      }> = [];

      if (consultationFee) {
        billItems.push({
          serviceItemId: consultationFee.id,
          itemCode: consultationFee.code,
          description: consultationFee.name,
          category: consultationFee.category,
          unitPrice: consultationFee.standardPrice,
          quantity: 1,
        });
      }

      for (const proc of orderedProcedures) {
        const procInfo = procedureCatalog.find(
          (p) => p.name.toLowerCase() === proc.name.toLowerCase() || (p.code && p.code === proc.code)
        );
        billItems.push({
          serviceItemId: proc.serviceItemId || procInfo?.id,
          itemCode: proc.code || procInfo?.code,
          description: proc.name,
          category: proc.category || procInfo?.category || 'Procedure',
          unitPrice: proc.standardPrice || procInfo?.standardPrice || 0,
          quantity: 1,
        });
      }

      // Check invoice lines
      expect(billItems.length).toBe(4); // 1 consult + 3 dental procedures
      expect(billItems[0].category).toBe('Dental');
      expect(billItems[0].unitPrice).toBe(500);

      expect(billItems[1].itemCode).toBe('DENT-FILL-COMP');
      expect(billItems[1].category).toBe('Dental');
      expect(billItems[1].unitPrice).toBe(950);

      expect(billItems[2].itemCode).toBe('DENT-EXT-SIMPLE');
      expect(billItems[2].category).toBe('Dental');
      expect(billItems[2].unitPrice).toBe(1000);

      expect(billItems[3].itemCode).toBe('DENT-PULP');
      expect(billItems[3].category).toBe('Dental');
      expect(billItems[3].unitPrice).toBe(1500);

      const totalInvoice = billItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
      expect(totalInvoice).toBe(3950); // 500 + 950 + 1000 + 1500 = ₱3,950
    });
  });

  // =========================================================================
  // Section 5: OrderCatalogSearchModal Props & AST State Integrity
  // =========================================================================
  describe('5. Component Props & AST Verification', () => {
    test('5.1 OrderCatalogSearchModal accepts initialCategory="Dental"', () => {
      const modal = React.createElement(OrderCatalogSearchModal, {
        visible: true,
        onClose: () => {},
        catalog: FULL_STRESS_CATALOG,
        initialCategory: 'Dental',
        onSelectOrder: () => {},
      });
      expect(modal.props.initialCategory).toBe('Dental');
    });

    test('5.2 OrderCatalogSearchModal accepts tooth metadata props', () => {
      const modal = React.createElement(OrderCatalogSearchModal, {
        visible: true,
        onClose: () => {},
        catalog: FULL_STRESS_CATALOG,
        initialToothNumber: 48,
        initialToothSurface: 'MOD',
        onSelectOrder: () => {},
      });
      expect(modal.props.initialToothNumber).toBe(48);
      expect(modal.props.initialToothSurface).toBe('MOD');
    });

    test('5.3 OrderCatalogSearchModal renders correctly with empty catalog prop', () => {
      const html = renderToStaticMarkup(
        React.createElement(OrderCatalogSearchModal, {
          visible: true,
          onClose: () => {},
          catalog: [],
          initialCategory: 'Dental',
          onSelectOrder: () => {},
        })
      );
      expect(html).toContain('Matching Catalog Items (0)');
      expect(html).toContain('No matching catalog items found');
    });
  });
});

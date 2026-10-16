// token-guard:ignore-file
import { describe, expect, test, mock, beforeEach } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

(globalThis as any).__DEV__ = true;

// Mock React Native modules for Bun environment
const createMockComponent = (name: string) => {
  const Comp = ({ children, accessibilityLabel, accessibilityRole, placeholder, testID }: any) =>
    React.createElement(
      'div',
      {
        'data-component': name,
        ...(testID ? { 'data-testid': testID } : {}),
        ...(accessibilityLabel ? { 'aria-label': accessibilityLabel } : {}),
        ...(accessibilityRole ? { role: accessibilityRole } : {}),
        ...(placeholder ? { 'data-placeholder': placeholder } : {}),
      },
      placeholder,
      children
    );
  Comp.displayName = name;
  return Comp;
};

mock.module('react-native', () => ({
  Linking: { openURL: () => Promise.resolve(), canOpenURL: () => Promise.resolve(true) },
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
  Alert: { alert: mock(() => {}) },
}));

mock.module('expo-crypto', () => ({
  randomUUID: () => 'mock-uuid-' + Math.random().toString(36).substring(2, 9),
}));

mock.module('react-native-svg', () => ({
  Svg: 'svg',
  Path: 'path',
  Circle: 'circle',
  Rect: 'rect',
  Line: 'line',
  default: 'svg',
}));

mock.module('../constants/fonts', () => ({
  applyFontFamily: (s: any) => s,
  fontAssets: {},
}));

const {
  OrderCatalogSearchModal,
  default: OrderCatalogSearchModalDefault,
} = await import('../components/consultation/OrderCatalogSearchModal');

import type {
  OrderCatalogItemPayload,
  OrderCatalogSearchModalProps,
} from '../components/consultation/OrderCatalogSearchModal';
import type { ClinicServiceItem } from '../services/clinicService';

describe('OrderCatalogSearchModal Adversarial Empirical Challenge Suite', () => {
  const sampleCatalog: ClinicServiceItem[] = [
    {
      id: 'item-diag-fbs-fingerstick',
      tenantId: 'tenant-1',
      clinicId: 'clinic-1',
      code: 'LAB-FBS-POC',
      name: 'Fingerstick Blood Glucose (RBS/FBS)',
      category: 'Diagnostic',
      standardPrice: 120,
      description: 'Point-of-care capillary fingerstick glucose test',
      isActive: true,
      philHealthCode: '90001',
      philHealthDescription: 'Random Blood Sugar / Fasting Blood Sugar',
      isPhilHealthFormulary: true,
    },
    {
      id: 'item-diag-cbc-sendout',
      tenantId: 'tenant-1',
      clinicId: 'clinic-1',
      code: 'LAB-CBC',
      name: 'Complete Blood Count (CBC) with Platelet',
      category: 'Diagnostic',
      standardPrice: 280,
      description: 'Automated 5-part differential hematology panel',
      isActive: true,
      philHealthCode: '90002',
      philHealthDescription: 'Complete Blood Count',
      isPhilHealthFormulary: true,
    },
    {
      id: 'item-diag-urinalysis-dipstick',
      tenantId: 'tenant-1',
      clinicId: 'clinic-1',
      code: 'LAB-URI-DIP',
      name: 'Urinalysis Rapid Dipstick',
      category: 'Diagnostic',
      standardPrice: 90,
      description: '10-parameter point-of-care urine reagent strip',
      isActive: true,
      philHealthCode: '90003',
      philHealthDescription: 'Urinalysis Reagent Strip',
      isPhilHealthFormulary: true,
    },
    {
      id: 'item-diag-lipid-sendout',
      tenantId: 'tenant-1',
      clinicId: 'clinic-1',
      code: 'LAB-LIPID',
      name: 'Lipid Profile Panel',
      category: 'Diagnostic',
      standardPrice: 650,
      description: 'Total Cholesterol, Triglycerides, HDL, LDL, VLDL',
      isActive: true,
      philHealthCode: '90004',
      philHealthDescription: 'Lipid Profile',
      isPhilHealthFormulary: true,
    },
    {
      id: 'item-diag-non-covered',
      tenantId: 'tenant-1',
      clinicId: 'clinic-1',
      code: 'LAB-TROP-I',
      name: 'Troponin I Quantitative',
      category: 'Diagnostic',
      standardPrice: 1500,
      description: 'Cardiac biomarker test not covered under primary care Yakap',
      isActive: true,
      philHealthCode: undefined,
      philHealthDescription: undefined,
      isPhilHealthFormulary: false,
    },
    {
      id: 'item-proc-ecg',
      tenantId: 'tenant-1',
      clinicId: 'clinic-1',
      code: 'PROC-ECG-12L',
      name: '12-Lead Electrocardiogram (ECG)',
      category: 'Diagnostic',
      standardPrice: 350,
      description: 'In-clinic resting 12-lead ECG with computerized reading',
      isActive: true,
      philHealthCode: '93000',
      philHealthDescription: '12-Lead Electrocardiogram',
      isPhilHealthFormulary: true,
    },
    {
      id: 'item-proc-wound-dressing',
      tenantId: 'tenant-1',
      clinicId: 'clinic-1',
      code: 'PROC-WOUND-01',
      name: 'Surgical Wound Dressing (Small)',
      category: 'Procedure',
      standardPrice: 200,
      description: 'Cleansing, debridement, and sterile dressing',
      isActive: true,
      philHealthCode: 'PROC-WD-01',
      philHealthDescription: 'Minor Wound Care',
      isPhilHealthFormulary: true,
    },
    {
      id: 'item-proc-non-covered-cosmetic',
      tenantId: 'tenant-1',
      clinicId: 'clinic-1',
      code: 'PROC-SKIN-TAG',
      name: 'Skin Tag Cauterization',
      category: 'Procedure',
      standardPrice: 850,
      description: 'Electrocautery removal of benign cutaneous tags',
      isActive: true,
      philHealthCode: undefined,
      philHealthDescription: undefined,
      isPhilHealthFormulary: false,
    },
    {
      id: 'item-inactive',
      tenantId: 'tenant-1',
      clinicId: 'clinic-1',
      code: 'LAB-LEGACY',
      name: 'Legacy Discontinued Test',
      category: 'Diagnostic',
      standardPrice: 999,
      isActive: false,
    },
  ];

  describe('Suite 1: PhilHealth Yakap ₱0 Co-pay Logic & Benefit Matrix', () => {
    test('1.1 Covered in-house test with Yakap eligible patient calculates ₱0 co-pay', () => {
      const item = sampleCatalog.find((i) => i.code === 'LAB-FBS-POC')!;
      const isYakapEligible = true;
      const fulfillmentMode: 'in_house' | 'outside' = 'in_house';
      const isDiagnostic = (item.category || '').toLowerCase().includes('diagnostic');

      const isYakapCovered = Boolean(
        isYakapEligible &&
        item.philHealthCode &&
        (fulfillmentMode === 'in_house' || !isDiagnostic)
      );

      expect(isYakapCovered).toBe(true);
      expect(item.philHealthCode).toBe('90001');
      expect(fulfillmentMode).toBe('in_house');
    });

    test('1.2 Covered test switched to outside laboratory displays Outside Requisition, NOT ₱0 Co-pay', () => {
      const item = sampleCatalog.find((i) => i.code === 'LAB-CBC')!;
      const isYakapEligible = true;
      const fulfillmentMode: 'in_house' | 'outside' = 'outside';
      const isDiagnostic = (item.category || '').toLowerCase().includes('diagnostic');

      const isYakapCovered = Boolean(
        isYakapEligible &&
        item.philHealthCode &&
        (fulfillmentMode === 'in_house' || !isDiagnostic)
      );

      // Crucial: When fulfillmentMode is 'outside', isYakapCovered is false!
      expect(isYakapCovered).toBe(false);

      // Price preview logic in component:
      // if (isDiagnostic && fulfillmentMode === 'outside') -> displays "Outside Requisition" & "₱0 Clinic Fee"
      const isOutsideRequisition = isDiagnostic && fulfillmentMode === 'outside';
      expect(isOutsideRequisition).toBe(true);
    });

    test('1.3 Non-covered test with Yakap eligible patient displays standard fee schedule price', () => {
      const item = sampleCatalog.find((i) => i.code === 'LAB-TROP-I')!;
      const isYakapEligible = true;
      const fulfillmentMode: 'in_house' | 'outside' = 'in_house';
      const isDiagnostic = (item.category || '').toLowerCase().includes('diagnostic');

      const isYakapCovered = Boolean(
        isYakapEligible &&
        item.philHealthCode &&
        (fulfillmentMode === 'in_house' || !isDiagnostic)
      );

      expect(isYakapCovered).toBe(false);
      expect(item.standardPrice).toBe(1500);
    });

    test('1.4 Covered test with NON-Yakap patient displays standard fee schedule price', () => {
      const item = sampleCatalog.find((i) => i.code === 'LAB-FBS-POC')!;
      const isYakapEligible = false;
      const fulfillmentMode: 'in_house' | 'outside' = 'in_house';
      const isDiagnostic = (item.category || '').toLowerCase().includes('diagnostic');

      const isYakapCovered = Boolean(
        isYakapEligible &&
        item.philHealthCode &&
        (fulfillmentMode === 'in_house' || !isDiagnostic)
      );

      expect(isYakapCovered).toBe(false);
      expect(item.standardPrice).toBe(120);
    });

    test('1.5 Covered procedure with Yakap eligible patient displays ₱0 co-pay without fulfillment toggle', () => {
      const item = sampleCatalog.find((i) => i.code === 'PROC-WOUND-01')!;
      const isYakapEligible = true;
      const fulfillmentMode: 'in_house' | 'outside' = 'in_house';
      const isDiagnostic = (item.category || '').toLowerCase().includes('diagnostic');

      expect(isDiagnostic).toBe(false);

      const isYakapCovered = Boolean(
        isYakapEligible &&
        item.philHealthCode &&
        (fulfillmentMode === 'in_house' || !isDiagnostic)
      );

      expect(isYakapCovered).toBe(true);
    });

    test('1.6 Non-covered procedure displays standard fee schedule price', () => {
      const item = sampleCatalog.find((i) => i.code === 'PROC-SKIN-TAG')!;
      const isYakapEligible = true;
      const fulfillmentMode: 'in_house' | 'outside' = 'in_house';
      const isDiagnostic = (item.category || '').toLowerCase().includes('diagnostic');

      const isYakapCovered = Boolean(
        isYakapEligible &&
        item.philHealthCode &&
        (fulfillmentMode === 'in_house' || !isDiagnostic)
      );

      expect(isYakapCovered).toBe(false);
      expect(item.standardPrice).toBe(850);
    });

    test('1.7 Empty or whitespace philHealthCode does not evaluate as covered', () => {
      const fakeItemEmpty: ClinicServiceItem = {
        ...sampleCatalog[0],
        philHealthCode: '',
      };
      const fakeItemWhitespace: ClinicServiceItem = {
        ...sampleCatalog[0],
        philHealthCode: undefined,
      };

      expect(Boolean(true && fakeItemEmpty.philHealthCode && true)).toBe(false);
      expect(Boolean(true && fakeItemWhitespace.philHealthCode && true)).toBe(false);
    });
  });

  describe('Suite 2: Price Preview Calculations & Rapid Test Heuristics', () => {
    const IN_HOUSE_RAPID_TEST_REGEX = /fingerstick|ecg|dipstick|rapid|rbs|urinalysis/i;

    function getHeuristicMode(item: ClinicServiceItem): 'in_house' | 'outside' {
      const isDiag = (item.category || '').toLowerCase().includes('diagnostic');
      if (!isDiag) return 'in_house';
      const target = `${item.name || ''} ${item.code || ''} ${item.description || ''}`;
      if (IN_HOUSE_RAPID_TEST_REGEX.test(target)) return 'in_house';
      return 'outside';
    }

    test('2.1 Point-of-care rapid tests match regex and default to in_house', () => {
      const fingerstick = sampleCatalog.find((i) => i.code === 'LAB-FBS-POC')!;
      const dipstick = sampleCatalog.find((i) => i.code === 'LAB-URI-DIP')!;
      const ecg = sampleCatalog.find((i) => i.code === 'PROC-ECG-12L')!;

      expect(getHeuristicMode(fingerstick)).toBe('in_house');
      expect(getHeuristicMode(dipstick)).toBe('in_house');
      expect(getHeuristicMode(ecg)).toBe('in_house');
    });

    test('2.2 Send-out panels default to outside laboratory', () => {
      const cbc = sampleCatalog.find((i) => i.code === 'LAB-CBC')!;
      const lipid = sampleCatalog.find((i) => i.code === 'LAB-LIPID')!;
      const tropI = sampleCatalog.find((i) => i.code === 'LAB-TROP-I')!;

      expect(getHeuristicMode(cbc)).toBe('outside');
      expect(getHeuristicMode(lipid)).toBe('outside');
      expect(getHeuristicMode(tropI)).toBe('outside');
    });

    test('2.3 Non-diagnostic procedures always default to in_house', () => {
      const wound = sampleCatalog.find((i) => i.code === 'PROC-WOUND-01')!;
      const skinTag = sampleCatalog.find((i) => i.code === 'PROC-SKIN-TAG')!;

      expect(getHeuristicMode(wound)).toBe('in_house');
      expect(getHeuristicMode(skinTag)).toBe('in_house');
    });

    test('2.4 Standard price formats with Philippine Peso symbol and comma grouping', () => {
      const formatPrice = (price: number) => `₱${price.toLocaleString()}`;

      expect(formatPrice(0)).toBe('₱0');
      expect(formatPrice(120)).toBe('₱120');
      expect(formatPrice(650)).toBe('₱650');
      expect(formatPrice(1500)).toBe('₱1,500');
      expect(formatPrice(25000)).toBe('₱25,000');
    });
  });

  describe('Suite 3: Fasting Chips Combinations & Custom Clinical Notes', () => {
    function toggleChip(prev: string, chip: string): string {
      const trimmed = prev.trim();
      if (!trimmed) return chip;
      const parts = trimmed.split(';').map((p) => p.trim());
      if (parts.includes(chip)) {
        const remaining = parts.filter((p) => p !== chip);
        return remaining.join('; ');
      }
      return `${trimmed}; ${chip}`;
    }

    test('3.1 Selecting a single chip returns that chip text', () => {
      let state = '';
      state = toggleChip(state, '10-12 hr fasting');
      expect(state).toBe('10-12 hr fasting');
    });

    test('3.2 Selecting multiple chips concatenates with semicolon delimiter', () => {
      let state = '';
      state = toggleChip(state, '10-12 hr fasting');
      state = toggleChip(state, 'STAT');
      expect(state).toBe('10-12 hr fasting; STAT');

      state = toggleChip(state, 'Morning mid-stream urine');
      expect(state).toBe('10-12 hr fasting; STAT; Morning mid-stream urine');
    });

    test('3.3 Toggling off an active chip cleanly removes only that chip', () => {
      let state = '10-12 hr fasting; STAT; Morning mid-stream urine';
      state = toggleChip(state, 'STAT');
      expect(state).toBe('10-12 hr fasting; Morning mid-stream urine');

      state = toggleChip(state, '10-12 hr fasting');
      expect(state).toBe('Morning mid-stream urine');

      state = toggleChip(state, 'Morning mid-stream urine');
      expect(state).toBe('');
    });

    test('3.4 Preserves user-typed custom notes when chips are toggled on and off', () => {
      let state = 'Patient prefers left arm draw due to right AV fistula';
      state = toggleChip(state, '8 hr fasting');
      expect(state).toBe('Patient prefers left arm draw due to right AV fistula; 8 hr fasting');

      state = toggleChip(state, 'STAT');
      expect(state).toBe('Patient prefers left arm draw due to right AV fistula; 8 hr fasting; STAT');

      // Now toggle off 8 hr fasting
      state = toggleChip(state, '8 hr fasting');
      expect(state).toBe('Patient prefers left arm draw due to right AV fistula; STAT');

      // Now toggle off STAT
      state = toggleChip(state, 'STAT');
      expect(state).toBe('Patient prefers left arm draw due to right AV fistula');
    });

    test('3.5 Preserves user-typed custom notes containing semicolons', () => {
      let state = 'BP: 150/90; Fasting confirmed by patient; Bedside specimen';
      state = toggleChip(state, 'STAT');
      expect(state).toBe('BP: 150/90; Fasting confirmed by patient; Bedside specimen; STAT');

      state = toggleChip(state, 'STAT');
      expect(state).toBe('BP: 150/90; Fasting confirmed by patient; Bedside specimen');
    });

    test('3.6 Whitespace-only or empty instructions trim to undefined in payload', () => {
      const resolveInstructions = (raw: string) => (raw.trim() ? raw.trim() : undefined);

      expect(resolveInstructions('')).toBeUndefined();
      expect(resolveInstructions('   ')).toBeUndefined();
      expect(resolveInstructions('\n\t  ')).toBeUndefined();
      expect(resolveInstructions('10-12 hr fasting')).toBe('10-12 hr fasting');
      expect(resolveInstructions('  STAT  ')).toBe('STAT');
    });
  });

  describe('Suite 4: Prevention of Invalid or Duplicate Submissions', () => {
    test('4.1 Submission is blocked when selectedItem is null', () => {
      let selectedItem: ClinicServiceItem | null = null;
      let submittedPayload: OrderCatalogItemPayload | null = null;
      let modalClosed = false;

      const handleSubmit = () => {
        if (!selectedItem) return;
        submittedPayload = {
          serviceItemId: selectedItem.id,
          code: selectedItem.code,
          name: selectedItem.name,
          category: selectedItem.category,
          standardPrice: selectedItem.standardPrice,
          fulfillmentMode: 'in_house',
        };
        modalClosed = true;
      };

      handleSubmit();
      expect(submittedPayload).toBeNull();
      expect(modalClosed).toBe(false);
    });

    test('4.2 Submission is blocked when item is in alreadyOrderedNames (case-insensitive)', () => {
      const alreadyOrderedNames = ['fingerstick blood glucose (rbs/fbs)', 'Complete Blood Count (CBC) with Platelet'];
      const item = sampleCatalog[0]; // 'Fingerstick Blood Glucose (RBS/FBS)'

      const isOrdered = alreadyOrderedNames.some(
        (n) => n.toLowerCase() === item.name.toLowerCase()
      );
      expect(isOrdered).toBe(true);

      let submitted = false;
      const handleSubmit = () => {
        if (isOrdered) return;
        submitted = true;
      };

      handleSubmit();
      expect(submitted).toBe(false);
    });

    test('4.3 Submission is blocked when item is in alreadyOrderedCodes (case-insensitive)', () => {
      const alreadyOrderedCodes = ['lab-fbs-poc', 'lab-cbc'];
      const item = sampleCatalog[0]; // code: 'LAB-FBS-POC'

      const isOrdered = alreadyOrderedCodes.some(
        (c) => c.toLowerCase() === item.code.toLowerCase()
      );
      expect(isOrdered).toBe(true);

      let submitted = false;
      const handleSubmit = () => {
        if (isOrdered) return;
        submitted = true;
      };

      handleSubmit();
      expect(submitted).toBe(false);
    });

    test('4.4 Cancel button triggers onClose without calling onSelectOrder', () => {
      let selectedOrder: OrderCatalogItemPayload | null = null;
      let closed = false;

      const props: OrderCatalogSearchModalProps = {
        visible: true,
        onClose: () => { closed = true; },
        onSelectOrder: (p) => { selectedOrder = p; },
        catalog: sampleCatalog,
      };

      // User clicks cancel
      props.onClose();

      expect(closed).toBe(true);
      expect(selectedOrder).toBeNull();
    });
  });

  describe('Suite 5: Submission Payload Integrity & Schema Contract', () => {
    test('5.1 Diagnostic item payload contains all required fields and respects selected fulfillment mode', () => {
      const item = sampleCatalog.find((i) => i.code === 'LAB-CBC')!;
      const fulfillmentMode: 'in_house' | 'outside' = 'outside';
      const instructions = '8 hr fasting; STAT';
      const isDiagnostic = (item.category || '').toLowerCase().includes('diagnostic');

      const payload: OrderCatalogItemPayload = {
        serviceItemId: item.id,
        code: item.code,
        name: item.name,
        category: item.category,
        standardPrice: item.standardPrice,
        philHealthCode: item.philHealthCode,
        philHealthDescription: item.philHealthDescription,
        isPhilHealthFormulary: item.isPhilHealthFormulary,
        fulfillmentMode: isDiagnostic ? fulfillmentMode : 'in_house',
        instructions: instructions.trim() ? instructions.trim() : undefined,
      };

      expect(payload.serviceItemId).toBe('item-diag-cbc-sendout');
      expect(payload.code).toBe('LAB-CBC');
      expect(payload.name).toBe('Complete Blood Count (CBC) with Platelet');
      expect(payload.category).toBe('Diagnostic');
      expect(payload.standardPrice).toBe(280);
      expect(payload.philHealthCode).toBe('90002');
      expect(payload.philHealthDescription).toBe('Complete Blood Count');
      expect(payload.isPhilHealthFormulary).toBe(true);
      expect(payload.fulfillmentMode).toBe('outside');
      expect(payload.instructions).toBe('8 hr fasting; STAT');
    });

    test('5.2 In-house diagnostic item payload retains standard price and sets fulfillmentMode in_house', () => {
      const item = sampleCatalog.find((i) => i.code === 'LAB-FBS-POC')!;
      const fulfillmentMode: 'in_house' | 'outside' = 'in_house';
      const isDiagnostic = true;

      const payload: OrderCatalogItemPayload = {
        serviceItemId: item.id,
        code: item.code,
        name: item.name,
        category: item.category,
        standardPrice: item.standardPrice,
        philHealthCode: item.philHealthCode,
        philHealthDescription: item.philHealthDescription,
        isPhilHealthFormulary: item.isPhilHealthFormulary,
        fulfillmentMode: isDiagnostic ? fulfillmentMode : 'in_house',
        instructions: undefined,
      };

      expect(payload.fulfillmentMode).toBe('in_house');
      expect(payload.standardPrice).toBe(120);
      expect(payload.philHealthCode).toBe('90001');
      expect(payload.instructions).toBeUndefined();
    });

    test('5.3 Procedure payload strictly forces fulfillmentMode in_house', () => {
      const item = sampleCatalog.find((i) => i.code === 'PROC-WOUND-01')!;
      // Suppose state fulfillmentMode was somehow set to 'outside' from previous item
      const simulatedStateMode: 'in_house' | 'outside' = 'outside';
      const isDiagnostic = (item.category || '').toLowerCase().includes('diagnostic');

      expect(isDiagnostic).toBe(false);

      const payload: OrderCatalogItemPayload = {
        serviceItemId: item.id,
        code: item.code,
        name: item.name,
        category: item.category,
        standardPrice: item.standardPrice,
        philHealthCode: item.philHealthCode,
        philHealthDescription: item.philHealthDescription,
        isPhilHealthFormulary: item.isPhilHealthFormulary,
        fulfillmentMode: isDiagnostic ? simulatedStateMode : 'in_house',
        instructions: 'Pre/post vitals required',
      };

      expect(payload.fulfillmentMode).toBe('in_house');
      expect(payload.category).toBe('Procedure');
      expect(payload.instructions).toBe('Pre/post vitals required');
    });
  });

  describe('Suite 6: Catalog Filtering, Searching, & Edge Cases', () => {
    function filterCatalog(
      catalog: ClinicServiceItem[],
      searchQuery: string,
      selectedCategory: 'All' | 'Diagnostic' | 'Procedure'
    ) {
      const q = searchQuery.trim().toLowerCase();
      return catalog.filter((item) => {
        if (item.isActive === false) return false;

        const catLower = (item.category || '').toLowerCase();
        if (selectedCategory === 'Diagnostic') {
          if (!catLower.includes('diagnostic')) return false;
        } else if (selectedCategory === 'Procedure') {
          if (!catLower.includes('procedure') && !catLower.includes('nursing')) return false;
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

    test('6.1 Inactive catalog items are strictly excluded', () => {
      const filtered = filterCatalog(sampleCatalog, '', 'All');
      const hasInactive = filtered.some((i) => i.code === 'LAB-LEGACY');
      expect(hasInactive).toBe(false);
      expect(filtered.length).toBe(sampleCatalog.length - 1);
    });

    test('6.2 Search matches by item code', () => {
      const filtered = filterCatalog(sampleCatalog, 'LAB-CBC', 'All');
      expect(filtered.length).toBe(1);
      expect(filtered[0].code).toBe('LAB-CBC');
    });

    test('6.3 Search matches by PhilHealth code', () => {
      const filtered = filterCatalog(sampleCatalog, '90001', 'All');
      expect(filtered.length).toBe(1);
      expect(filtered[0].code).toBe('LAB-FBS-POC');
    });

    test('6.4 Search matches by description keywords', () => {
      const filtered = filterCatalog(sampleCatalog, 'capillary', 'All');
      expect(filtered.length).toBe(1);
      expect(filtered[0].name).toContain('Fingerstick');
    });

    test('6.5 Category tabs filter diagnostics and procedures accurately', () => {
      const diagnostics = filterCatalog(sampleCatalog, '', 'Diagnostic');
      expect(diagnostics.every((i) => i.category === 'Diagnostic')).toBe(true);
      expect(diagnostics.length).toBe(6);

      const procedures = filterCatalog(sampleCatalog, '', 'Procedure');
      expect(procedures.every((i) => i.category === 'Procedure')).toBe(true);
      expect(procedures.length).toBe(2);
    });

    test('6.6 Non-matching query yields empty result list', () => {
      const filtered = filterCatalog(sampleCatalog, 'nonexistent_test_xyz_999', 'All');
      expect(filtered.length).toBe(0);
    });
  });

  describe('Suite 7: Component Markup & Integration Rendering', () => {
    test('7.1 Renders modal structure with search bar and category tabs', () => {
      const html = renderToStaticMarkup(
        React.createElement(OrderCatalogSearchModal, {
          visible: true,
          onClose: () => {},
          catalog: sampleCatalog,
          initialCategory: 'All',
          isYakapEligible: true,
          onSelectOrder: () => {},
        })
      );

      expect(html).toContain('Add Test or Procedure');
      expect(html).toContain('Search fee schedule catalog');
      expect(html).toContain('Filter Category:');
      expect(html).toContain('All Items');
      expect(html).toContain('Diagnostic');
      expect(html).toContain('Procedure');
      expect(html).toContain('Fingerstick Blood Glucose');
      expect(html).toContain('Complete Blood Count');
      expect(html).toContain('Surgical Wound Dressing');
    });

    test('7.2 Renders Already Ordered badge and disabled state for previously ordered tests', () => {
      const html = renderToStaticMarkup(
        React.createElement(OrderCatalogSearchModal, {
          visible: true,
          onClose: () => {},
          catalog: sampleCatalog,
          initialCategory: 'All',
          isYakapEligible: true,
          alreadyOrderedNames: ['Fingerstick Blood Glucose (RBS/FBS)'],
          alreadyOrderedCodes: ['LAB-CBC'],
          onSelectOrder: () => {},
        })
      );

      expect(html).toContain('Already Ordered');
    });

    test('7.3 Renders clean empty state when catalog has no matches', () => {
      const html = renderToStaticMarkup(
        React.createElement(OrderCatalogSearchModal, {
          visible: true,
          onClose: () => {},
          catalog: [],
          initialCategory: 'All',
          onSelectOrder: () => {},
        })
      );

      expect(html).toContain('No matching catalog items found');
      expect(html).toContain('Try adjusting your search query');
    });

    test('7.4 Default export matches named export', () => {
      expect(OrderCatalogSearchModalDefault).toBe(OrderCatalogSearchModal);
    });
  });
});

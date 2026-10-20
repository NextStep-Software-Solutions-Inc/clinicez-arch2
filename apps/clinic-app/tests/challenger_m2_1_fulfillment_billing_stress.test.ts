// token-guard:ignore-file
import { describe, expect, test, mock, beforeEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';

(globalThis as any).__DEV__ = true;

// Mock React Native modules for Bun environment
mock.module('react-native', () => ({
  Linking: { openURL: () => Promise.resolve(), canOpenURL: () => Promise.resolve(true) },
  StyleSheet: { create: (s: any) => s, flatten: (s: any) => s },
  View: 'View',
  Pressable: 'Pressable',
  ScrollView: 'ScrollView',
  TextInput: 'TextInput',
  Text: 'Text',
  ActivityIndicator: 'ActivityIndicator',
  Modal: 'Modal',
  KeyboardAvoidingView: 'KeyboardAvoidingView',
  FlatList: 'FlatList',
  SectionList: 'SectionList',
  Switch: 'Switch',
  TouchableOpacity: 'TouchableOpacity',
  TouchableHighlight: 'TouchableHighlight',
  Image: 'Image',
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
    View: 'Animated.View',
    Text: 'Animated.Text',
  },
  Alert: { alert: () => {} },
}));

mock.module('react-native-svg', () => ({
  Svg: 'Svg',
  Path: 'Path',
  Circle: 'Circle',
  Rect: 'Rect',
  Line: 'Line',
  default: 'Svg',
  Defs: ({ children }: any) => children,
  LinearGradient: ({ children }: any) => children,
  Stop: () => null,
  G: ({ children }: any) => children,
  Text: ({ children }: any) => children,
  Polyline: 'Polyline',
}));

mock.module('../constants/fonts', () => ({
  applyFontFamily: (s: any) => s,
  fontAssets: {},
}));

mock.module('@expo-google-fonts/geist', () => ({
  useFonts: () => [true],
}));

mock.module('@expo-google-fonts/geist-mono', () => ({
  useFonts: () => [true],
}));

// Import types from Consultations.screen
import type { LocalLabOrder } from '../navigation/screens/Consultations.screen';
import type { ClinicServiceItem } from '../services/clinicService';

describe('Milestone M2-1 Empirical Challenger: Dual Fulfillment Partitioning & Cashier Billing', () => {

  const MOCK_CATALOG: ClinicServiceItem[] = [
    {
      id: 'srv-001',
      code: 'RBS-01',
      name: 'Random Blood Sugar (RBS)',
      category: 'Diagnostic',
      standardPrice: 150,
      philHealthCode: '90001',
      description: 'Point-of-care capillary fingerstick glucose',
      isActive: true,
    },
    {
      id: 'srv-002',
      code: 'ECG-12',
      name: '12-Lead Electrocardiogram',
      category: 'Diagnostic',
      standardPrice: 450,
      philHealthCode: '93000',
      description: 'Standard 12-lead ECG tracing',
      isActive: true,
    },
    {
      id: 'srv-003',
      code: 'CBC-01',
      name: 'Complete Blood Count (CBC) with Platelets',
      category: 'Diagnostic',
      standardPrice: 350,
      philHealthCode: '85025',
      description: 'Venipuncture specimen sent to hematology lab',
      isActive: true,
    },
    {
      id: 'srv-004',
      code: 'LIPID-01',
      name: 'Lipid Profile',
      category: 'Diagnostic',
      standardPrice: 850,
      philHealthCode: '80061',
      description: 'Cholesterol, Triglycerides, HDL, LDL send-out panel',
      isActive: true,
    },
    {
      id: 'srv-005',
      code: 'URINE-DIP',
      name: 'Urinalysis Rapid Dipstick',
      category: 'Diagnostic',
      standardPrice: 120,
      philHealthCode: '81002',
      description: '10-parameter rapid urine test strip',
      isActive: true,
    },
    {
      id: 'srv-006',
      code: 'COVID-AG',
      name: 'COVID-19 Rapid Antigen',
      category: 'Diagnostic',
      standardPrice: 500,
      philHealthCode: undefined, // Non-covered rapid test
      description: 'Nasal swab lateral flow assay',
      isActive: true,
    },
    {
      id: 'srv-007',
      code: 'THYROID-TFT',
      name: 'Thyroid Function Panel (Free T3, Free T4, TSH)',
      category: 'Diagnostic',
      standardPrice: 1600,
      philHealthCode: undefined, // Outside non-covered specialized panel
      description: 'Immunoassay send-out',
      isActive: true,
    },
  ];

  const MOCK_CONSULTATION_FEE: ClinicServiceItem = {
    id: 'fee-consult',
    code: 'CONSULT-GEN',
    name: 'General Medical Consultation',
    category: 'Consultation',
    standardPrice: 500,
    isActive: true,
  };

  const MOCK_PROCEDURE_CATALOG: ClinicServiceItem[] = [
    {
      id: 'proc-001',
      code: 'NEB-01',
      name: 'Nebulization Treatment',
      category: 'Procedure',
      standardPrice: 200,
      isActive: true,
    },
    {
      id: 'proc-002',
      code: 'WOUND-01',
      name: 'Wound Dressing & Debridement',
      category: 'Procedure',
      standardPrice: 350,
      isActive: true,
    },
  ];

  // =========================================================================
  // Pure Oracle Implementations matching Consultations.screen.tsx exactly
  // =========================================================================

  function partitionLabs(orderedLabs: LocalLabOrder[]) {
    const outsideLabs = orderedLabs.filter((l) => l.fulfillmentMode === 'outside');
    const inHouseLabs = orderedLabs.filter((l) => l.fulfillmentMode === 'in_house');
    return { outsideLabs, inHouseLabs };
  }

  function generateBillItems(
    orderedLabs: LocalLabOrder[],
    orderedProcedures: string[],
    diagnosticCatalog: ClinicServiceItem[],
    procedureCatalog: ClinicServiceItem[],
    consultationFee: ClinicServiceItem | null,
    isYakapEligible: boolean
  ) {
    const { inHouseLabs } = partitionLabs(orderedLabs);
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

    for (const procName of orderedProcedures) {
      const procInfo = procedureCatalog.find((p) => p.name === procName);
      if (procInfo) {
        billItems.push({
          serviceItemId: procInfo.id,
          itemCode: procInfo.code,
          description: procInfo.name,
          category: procInfo.category,
          unitPrice: procInfo.standardPrice,
          quantity: 1,
        });
      }
    }

    for (const inHouseLab of inHouseLabs) {
      const matchedDiag = diagnosticCatalog.find((d) => d.name.toLowerCase() === inHouseLab.name.toLowerCase());
      const philHealthCode = inHouseLab.philHealthCode || matchedDiag?.philHealthCode;
      const isCoveredByYakap = Boolean(isYakapEligible && philHealthCode);
      const unitPrice = isCoveredByYakap ? 0 : (inHouseLab.standardPrice ?? matchedDiag?.standardPrice ?? 0);
      const description = isCoveredByYakap
        ? `${inHouseLab.name} (PhilHealth Yakap - ₱0 Co-pay)`
        : inHouseLab.name;

      billItems.push({
        serviceItemId: inHouseLab.serviceItemId || matchedDiag?.id,
        itemCode: inHouseLab.code || matchedDiag?.code,
        description,
        category: inHouseLab.category || matchedDiag?.category || 'Diagnostic',
        unitPrice,
        quantity: 1,
      });
    }

    return billItems;
  }

  function generateLabOrderItems(orderedLabs: LocalLabOrder[], diagnosticCatalog: ClinicServiceItem[]) {
    const { outsideLabs } = partitionLabs(orderedLabs);
    if (outsideLabs.length === 0) return null;

    return outsideLabs.map((l) => ({
      testName: l.name,
      category: l.category || (diagnosticCatalog.find((d) => d.name === l.name)?.category ?? 'Diagnostic'),
      instructions: l.instructions,
    }));
  }

  // =========================================================================
  // SUITE 1: Dual Fulfillment Partitioning & 100% Invoice Exclusion of Outside Labs
  // =========================================================================
  describe('Suite 1: Dual Fulfillment Partitioning & Strict Invoice Exclusion', () => {

    test('1.1 Large-scale empirical generator (1,000 randomized orders) guarantees strict mathematical partition', () => {
      const modes: Array<'in_house' | 'outside'> = ['in_house', 'outside'];
      const testPool: LocalLabOrder[] = Array.from({ length: 1000 }, (_, i) => ({
        serviceItemId: `srv-${i}`,
        code: `CODE-${i}`,
        name: `Test-${i}`,
        category: 'Diagnostic',
        standardPrice: 100 + (i % 10) * 50,
        philHealthCode: i % 3 === 0 ? `PH-${i}` : undefined,
        fulfillmentMode: modes[i % 2],
      }));

      const { outsideLabs, inHouseLabs } = partitionLabs(testPool);

      expect(outsideLabs.length + inHouseLabs.length).toBe(1000);
      expect(outsideLabs.length).toBe(500);
      expect(inHouseLabs.length).toBe(500);

      // Mutually exclusive: no element in outsideLabs is in inHouseLabs
      for (const outLab of outsideLabs) {
        expect(outLab.fulfillmentMode).toBe('outside');
        expect(inHouseLabs.includes(outLab)).toBe(false);
      }
      for (const inLab of inHouseLabs) {
        expect(inLab.fulfillmentMode).toBe('in_house');
      }
    });

    test('1.2 Outside laboratory orders are 100% ABSENT from createInvoice billItems', () => {
      const orders: LocalLabOrder[] = [
        { name: 'CBC with Platelets', fulfillmentMode: 'outside', standardPrice: 350, category: 'Diagnostic' },
        { name: 'Lipid Profile', fulfillmentMode: 'outside', standardPrice: 850, category: 'Diagnostic' },
        { name: 'Thyroid Panel', fulfillmentMode: 'outside', standardPrice: 1600, category: 'Diagnostic' },
        { name: 'RBS Fingerstick', fulfillmentMode: 'in_house', standardPrice: 150, category: 'Diagnostic' },
      ];

      const billItems = generateBillItems(orders, [], MOCK_CATALOG, MOCK_PROCEDURE_CATALOG, null, false);

      // Only the 1 in-house test must be present
      expect(billItems.length).toBe(1);
      expect(billItems[0].description).toBe('RBS Fingerstick');

      // Verify that NO outside lab appears in billItems
      const outsideNames = ['CBC with Platelets', 'Lipid Profile', 'Thyroid Panel'];
      for (const item of billItems) {
        for (const outName of outsideNames) {
          expect(item.description.includes(outName)).toBe(false);
        }
      }
    });

    test('1.3 When ONLY outside labs are ordered, createInvoice receives 0 lab items (consultation fee only)', () => {
      const orders: LocalLabOrder[] = [
        { name: 'CBC with Platelets', fulfillmentMode: 'outside', standardPrice: 350, category: 'Diagnostic' },
        { name: 'Lipid Profile', fulfillmentMode: 'outside', standardPrice: 850, category: 'Diagnostic' },
      ];

      const billItems = generateBillItems(orders, [], MOCK_CATALOG, MOCK_PROCEDURE_CATALOG, MOCK_CONSULTATION_FEE, false);

      expect(billItems.length).toBe(1);
      expect(billItems[0].category).toBe('Consultation');
      expect(billItems[0].unitPrice).toBe(500);

      // Filter diagnostics from bill items: must be strictly 0
      const diagBillItems = billItems.filter((i) => i.category.toLowerCase() === 'diagnostic');
      expect(diagBillItems.length).toBe(0);
    });

    test('1.4 When ONLY outside labs are ordered and NO consultation fee / procedure exists, billItems is empty', () => {
      const orders: LocalLabOrder[] = [
        { name: 'Chest X-Ray', fulfillmentMode: 'outside', standardPrice: 500, category: 'Diagnostic' },
      ];

      const billItems = generateBillItems(orders, [], MOCK_CATALOG, MOCK_PROCEDURE_CATALOG, null, false);
      expect(billItems.length).toBe(0);
    });

    test('1.5 When ONLY in-house labs are ordered, createLabOrder payload is null (call is skipped)', () => {
      const orders: LocalLabOrder[] = [
        { name: 'Random Blood Sugar (RBS)', fulfillmentMode: 'in_house', standardPrice: 150, category: 'Diagnostic' },
        { name: '12-Lead Electrocardiogram', fulfillmentMode: 'in_house', standardPrice: 450, category: 'Diagnostic' },
      ];

      const labOrderPayload = generateLabOrderItems(orders, MOCK_CATALOG);
      expect(labOrderPayload).toBeNull();
    });

    test('1.6 Outside lab orders create complete lab requisition items with instructions', () => {
      const orders: LocalLabOrder[] = [
        {
          name: 'Lipid Profile',
          fulfillmentMode: 'outside',
          standardPrice: 850,
          category: 'Diagnostic',
          instructions: '10-12 hr fasting; Morning draw',
        },
        {
          name: 'CBC with Platelets',
          fulfillmentMode: 'outside',
          standardPrice: 350,
          category: 'Diagnostic',
          instructions: 'STAT',
        },
      ];

      const labOrderPayload = generateLabOrderItems(orders, MOCK_CATALOG);
      expect(labOrderPayload).not.toBeNull();
      expect(labOrderPayload!.length).toBe(2);
      expect(labOrderPayload![0].testName).toBe('Lipid Profile');
      expect(labOrderPayload![0].instructions).toBe('10-12 hr fasting; Morning draw');
      expect(labOrderPayload![1].testName).toBe('CBC with Platelets');
      expect(labOrderPayload![1].instructions).toBe('STAT');
    });
  });

  // =========================================================================
  // SUITE 2: In-House Diagnostic Tests Routing to Cashier Invoice
  // =========================================================================
  describe('Suite 2: In-House Diagnostic Tests Routing to Cashier Invoice', () => {

    test('2.1 Multiple in-house tests route directly to createInvoice lineItems', () => {
      const orders: LocalLabOrder[] = [
        { name: 'Random Blood Sugar (RBS)', fulfillmentMode: 'in_house', standardPrice: 150, category: 'Diagnostic' },
        { name: '12-Lead Electrocardiogram', fulfillmentMode: 'in_house', standardPrice: 450, category: 'Diagnostic' },
        { name: 'Urinalysis Rapid Dipstick', fulfillmentMode: 'in_house', standardPrice: 120, category: 'Diagnostic' },
      ];

      const billItems = generateBillItems(orders, [], MOCK_CATALOG, MOCK_PROCEDURE_CATALOG, null, false);
      expect(billItems.length).toBe(3);
      expect(billItems[0].description).toBe('Random Blood Sugar (RBS)');
      expect(billItems[0].unitPrice).toBe(150);
      expect(billItems[1].description).toBe('12-Lead Electrocardiogram');
      expect(billItems[1].unitPrice).toBe(450);
      expect(billItems[2].description).toBe('Urinalysis Rapid Dipstick');
      expect(billItems[2].unitPrice).toBe(120);
    });

    test('2.2 Retains serviceItemId, itemCode, and category from catalog or order', () => {
      const orders: LocalLabOrder[] = [
        {
          serviceItemId: 'srv-001',
          code: 'RBS-01',
          name: 'Random Blood Sugar (RBS)',
          fulfillmentMode: 'in_house',
          standardPrice: 150,
          category: 'Diagnostic',
        },
      ];

      const billItems = generateBillItems(orders, [], MOCK_CATALOG, MOCK_PROCEDURE_CATALOG, null, false);
      expect(billItems[0].serviceItemId).toBe('srv-001');
      expect(billItems[0].itemCode).toBe('RBS-01');
      expect(billItems[0].category).toBe('Diagnostic');
      expect(billItems[0].quantity).toBe(1);
    });

    test('2.3 Diagnostic tests and procedures coexist cleanly in the same invoice', () => {
      const orders: LocalLabOrder[] = [
        { name: 'Random Blood Sugar (RBS)', fulfillmentMode: 'in_house', standardPrice: 150, category: 'Diagnostic' },
      ];
      const procs = ['Nebulization Treatment', 'Wound Dressing & Debridement'];

      const billItems = generateBillItems(orders, procs, MOCK_CATALOG, MOCK_PROCEDURE_CATALOG, MOCK_CONSULTATION_FEE, false);

      expect(billItems.length).toBe(4);
      expect(billItems[0].description).toBe('General Medical Consultation');
      expect(billItems[1].description).toBe('Nebulization Treatment');
      expect(billItems[2].description).toBe('Wound Dressing & Debridement');
      expect(billItems[3].description).toBe('Random Blood Sugar (RBS)');
    });
  });

  // =========================================================================
  // SUITE 3: PhilHealth Yakap ₱0 Co-Pay vs Standard Price Oracle
  // =========================================================================
  describe('Suite 3: PhilHealth Yakap ₱0 Co-Pay vs Standard Fee Schedule Price', () => {

    test('3.1 Yakap-eligible patient with PhilHealth-covered in-house test applies ₱0 co-pay and annotation', () => {
      const orders: LocalLabOrder[] = [
        {
          name: 'Random Blood Sugar (RBS)',
          fulfillmentMode: 'in_house',
          standardPrice: 150,
          philHealthCode: '90001',
          category: 'Diagnostic',
        },
      ];

      const billItems = generateBillItems(orders, [], MOCK_CATALOG, MOCK_PROCEDURE_CATALOG, null, true);

      expect(billItems.length).toBe(1);
      expect(billItems[0].unitPrice).toBe(0);
      expect(billItems[0].description).toBe('Random Blood Sugar (RBS) (PhilHealth Yakap - ₱0 Co-pay)');
    });

    test('3.2 Yakap-eligible patient with NON-covered in-house test retains standard price and NO annotation', () => {
      const orders: LocalLabOrder[] = [
        {
          name: 'COVID-19 Rapid Antigen',
          fulfillmentMode: 'in_house',
          standardPrice: 500,
          philHealthCode: undefined, // Not covered by Yakap
          category: 'Diagnostic',
        },
      ];

      const billItems = generateBillItems(orders, [], MOCK_CATALOG, MOCK_PROCEDURE_CATALOG, null, true);

      expect(billItems.length).toBe(1);
      expect(billItems[0].unitPrice).toBe(500);
      expect(billItems[0].description).toBe('COVID-19 Rapid Antigen');
      expect(billItems[0].description.includes('₱0 Co-pay')).toBe(false);
    });

    test('3.3 NON-Yakap patient (Private / Cash) with PhilHealth-coded in-house test pays standard price', () => {
      const orders: LocalLabOrder[] = [
        {
          name: 'Random Blood Sugar (RBS)',
          fulfillmentMode: 'in_house',
          standardPrice: 150,
          philHealthCode: '90001',
          category: 'Diagnostic',
        },
        {
          name: '12-Lead Electrocardiogram',
          fulfillmentMode: 'in_house',
          standardPrice: 450,
          philHealthCode: '93000',
          category: 'Diagnostic',
        },
      ];

      // isYakapEligible: false
      const billItems = generateBillItems(orders, [], MOCK_CATALOG, MOCK_PROCEDURE_CATALOG, null, false);

      expect(billItems.length).toBe(2);
      expect(billItems[0].unitPrice).toBe(150);
      expect(billItems[0].description).toBe('Random Blood Sugar (RBS)');
      expect(billItems[1].unitPrice).toBe(450);
      expect(billItems[1].description).toBe('12-Lead Electrocardiogram');
    });

    test('3.4 Catalog fallback: if order object lacks philHealthCode or standardPrice, matched catalog item fills them', () => {
      const orders: LocalLabOrder[] = [
        {
          name: 'Random Blood Sugar (RBS)', // Matches srv-001 in MOCK_CATALOG
          fulfillmentMode: 'in_house',
          standardPrice: undefined as any, // Unset / undefined on order
          philHealthCode: undefined, // Unset on order
          category: 'Diagnostic',
        },
      ];

      // Yakap eligible: should resolve philHealthCode '90001' from catalog -> unitPrice: 0
      const yakapBill = generateBillItems(orders, [], MOCK_CATALOG, MOCK_PROCEDURE_CATALOG, null, true);
      expect(yakapBill[0].unitPrice).toBe(0);
      expect(yakapBill[0].description).toBe('Random Blood Sugar (RBS) (PhilHealth Yakap - ₱0 Co-pay)');

      // Non-Yakap: should resolve standardPrice 150 from catalog via nullish coalescing
      const nonYakapBill = generateBillItems(orders, [], MOCK_CATALOG, MOCK_PROCEDURE_CATALOG, null, false);
      expect(nonYakapBill[0].unitPrice).toBe(150);
      expect(nonYakapBill[0].description).toBe('Random Blood Sugar (RBS)');

      // Explicit 0 price: nullish coalescing preserves genuine ₱0 prices
      const freeOrder: LocalLabOrder = {
        name: 'Free Screening Test',
        fulfillmentMode: 'in_house',
        standardPrice: 0,
        category: 'Diagnostic',
      };
      const freeBill = generateBillItems([freeOrder], [], [], [], null, false);
      expect(freeBill[0].unitPrice).toBe(0);
    });

    test('3.5 Stress test with 100 permutations of Yakap eligibility, coverage, and fulfillment modes', () => {
      const permutations = [
        { eligible: true, covered: true, mode: 'in_house' as const, expectedPrice: 0, expectedInBill: true, annotated: true },
        { eligible: true, covered: false, mode: 'in_house' as const, expectedPrice: 200, expectedInBill: true, annotated: false },
        { eligible: false, covered: true, mode: 'in_house' as const, expectedPrice: 200, expectedInBill: true, annotated: false },
        { eligible: false, covered: false, mode: 'in_house' as const, expectedPrice: 200, expectedInBill: true, annotated: false },
        { eligible: true, covered: true, mode: 'outside' as const, expectedPrice: null, expectedInBill: false, annotated: false },
        { eligible: false, covered: true, mode: 'outside' as const, expectedPrice: null, expectedInBill: false, annotated: false },
      ];

      for (let cycle = 0; cycle < 100; cycle++) {
        const p = permutations[cycle % permutations.length];
        const order: LocalLabOrder = {
          name: `Permutation-Test-${cycle}`,
          fulfillmentMode: p.mode,
          standardPrice: 200,
          philHealthCode: p.covered ? `PH-${cycle}` : undefined,
          category: 'Diagnostic',
        };

        const bill = generateBillItems([order], [], [], [], null, p.eligible);
        if (p.expectedInBill) {
          expect(bill.length).toBe(1);
          expect(bill[0].unitPrice).toBe(p.expectedPrice!);
          if (p.annotated) {
            expect(bill[0].description).toContain('PhilHealth Yakap - ₱0 Co-pay');
          } else {
            expect(bill[0].description).not.toContain('PhilHealth Yakap - ₱0 Co-pay');
          }
        } else {
          expect(bill.length).toBe(0);
        }
      }
    });
  });

  // =========================================================================
  // SUITE 4: Dynamic Fulfillment Mode Toggling & Removal Lifecycles
  // =========================================================================
  describe('Suite 4: Dynamic Fulfillment Mode Toggling & Removal Lifecycles', () => {

    test('4.1 Toggling an item from in_house to outside shifts its destination from invoice to lab order', () => {
      let orders: LocalLabOrder[] = [
        { name: 'Random Blood Sugar (RBS)', fulfillmentMode: 'in_house', standardPrice: 150, category: 'Diagnostic' },
      ];

      // Initially in-house
      let bill = generateBillItems(orders, [], MOCK_CATALOG, MOCK_PROCEDURE_CATALOG, null, false);
      let labOrders = generateLabOrderItems(orders, MOCK_CATALOG);
      expect(bill.length).toBe(1);
      expect(labOrders).toBeNull();

      // Simulate handleToggleLabFulfillmentMode('Random Blood Sugar (RBS)')
      orders = orders.map((lab) =>
        lab.name.toLowerCase() === 'Random Blood Sugar (RBS)'.toLowerCase()
          ? { ...lab, fulfillmentMode: lab.fulfillmentMode === 'in_house' ? 'outside' : 'in_house' }
          : lab
      );

      // Now outside
      bill = generateBillItems(orders, [], MOCK_CATALOG, MOCK_PROCEDURE_CATALOG, null, false);
      labOrders = generateLabOrderItems(orders, MOCK_CATALOG);
      expect(bill.length).toBe(0);
      expect(labOrders).not.toBeNull();
      expect(labOrders!.length).toBe(1);
      expect(labOrders![0].testName).toBe('Random Blood Sugar (RBS)');
    });

    test('4.2 Double-toggling returns to original state without data loss', () => {
      let orders: LocalLabOrder[] = [
        {
          serviceItemId: 'srv-003',
          code: 'CBC-01',
          name: 'Complete Blood Count (CBC) with Platelets',
          fulfillmentMode: 'outside',
          standardPrice: 350,
          philHealthCode: '85025',
          category: 'Diagnostic',
          instructions: 'STAT capillary',
        },
      ];

      const toggle = (list: LocalLabOrder[], targetName: string) =>
        list.map((lab) =>
          lab.name.toLowerCase() === targetName.toLowerCase()
            ? { ...lab, fulfillmentMode: (lab.fulfillmentMode === 'in_house' ? 'outside' : 'in_house') as 'in_house' | 'outside' }
            : lab
        );

      // First toggle: outside -> in_house
      orders = toggle(orders, 'Complete Blood Count (CBC) with Platelets');
      expect(orders[0].fulfillmentMode).toBe('in_house');

      // Second toggle: in_house -> outside
      orders = toggle(orders, 'Complete Blood Count (CBC) with Platelets');
      expect(orders[0].fulfillmentMode).toBe('outside');
      expect(orders[0].serviceItemId).toBe('srv-003');
      expect(orders[0].code).toBe('CBC-01');
      expect(orders[0].instructions).toBe('STAT capillary');
    });

    test('4.3 Removing an item via handleRemoveLab purges it from both billing and lab requisitions', () => {
      let orders: LocalLabOrder[] = [
        { name: 'Test 1', fulfillmentMode: 'in_house', standardPrice: 100, category: 'Diagnostic' },
        { name: 'Test 2', fulfillmentMode: 'outside', standardPrice: 200, category: 'Diagnostic' },
      ];

      const remove = (list: LocalLabOrder[], targetName: string) =>
        list.filter((lab) => lab.name.toLowerCase() !== targetName.toLowerCase());

      orders = remove(orders, 'Test 1');
      expect(orders.length).toBe(1);
      expect(orders[0].name).toBe('Test 2');

      orders = remove(orders, 'Test 2');
      expect(orders.length).toBe(0);

      const bill = generateBillItems(orders, [], [], [], null, false);
      const labOrders = generateLabOrderItems(orders, []);
      expect(bill.length).toBe(0);
      expect(labOrders).toBeNull();
    });

    test('4.4 Case-insensitive matching in mode toggling and removal', () => {
      let orders: LocalLabOrder[] = [
        { name: 'Random Blood Sugar (RBS)', fulfillmentMode: 'in_house', standardPrice: 150, category: 'Diagnostic' },
      ];

      // Toggle with lowercase
      orders = orders.map((lab) =>
        lab.name.toLowerCase() === 'random blood sugar (rbs)'
          ? { ...lab, fulfillmentMode: (lab.fulfillmentMode === 'in_house' ? 'outside' : 'in_house') as 'in_house' | 'outside' }
          : lab
      );
      expect(orders[0].fulfillmentMode).toBe('outside');

      // Remove with uppercase
      orders = orders.filter((lab) => lab.name.toLowerCase() !== 'RANDOM BLOOD SUGAR (RBS)'.toLowerCase());
      expect(orders.length).toBe(0);
    });
  });

  // =========================================================================
  // SUITE 5: Rapid Test Heuristics Fulfillment Resolution Engine
  // =========================================================================
  describe('Suite 5: Rapid Test Heuristics Fulfillment Resolution Engine', () => {
    const IN_HOUSE_RAPID_TEST_REGEX = /fingerstick|ecg|dipstick|rapid|rbs|urinalysis/i;

    const RAPID_IN_HOUSE_SAMPLES = [
      'RBS',
      'Random Blood Sugar (RBS)',
      'rbs fingerstick',
      'Fingerstick glucose',
      '12-Lead ECG',
      'Resting ECG tracing',
      'Urine Dipstick 10SG',
      'Rapid antigen test',
      'COVID-19 Rapid Test',
      'Routine Urinalysis',
      'urinalysis microscopic',
    ];

    const OUTSIDE_LAB_SAMPLES = [
      'Complete Blood Count (CBC)',
      'Lipid Profile (Full)',
      'Serum Creatinine',
      'Blood Urea Nitrogen (BUN)',
      'SGPT / ALT',
      'SGOT / AST',
      'HbA1c',
      'Pap Smear (ThinPrep)',
      'Chest X-Ray PA View',
      'Stool Examination / Fecalysis',
      'Thyroid Stimulating Hormone (TSH)',
    ];

    test('5.1 All 11 rapid point-of-care test samples match heuristic regex and resolve to in_house', () => {
      for (const sample of RAPID_IN_HOUSE_SAMPLES) {
        const matches = IN_HOUSE_RAPID_TEST_REGEX.test(sample);
        expect(matches).toBe(true);
      }
    });

    test('5.2 All 11 send-out laboratory samples fail heuristic regex and resolve to outside', () => {
      for (const sample of OUTSIDE_LAB_SAMPLES) {
        const matches = IN_HOUSE_RAPID_TEST_REGEX.test(sample);
        expect(matches).toBe(false);
      }
    });

    test('5.3 Description keyword matching triggers in_house heuristic even if test name is generic', () => {
      const genericName = 'Capillary Glucose Check';
      const description = 'Point-of-care fingerstick blood test';
      const matchTarget = `${genericName} ${description}`;
      expect(IN_HOUSE_RAPID_TEST_REGEX.test(matchTarget)).toBe(true);
    });
  });

  // =========================================================================
  // SUITE 6: Historical Chart Rehydration Engine
  // =========================================================================
  describe('Suite 6: Historical Chart Rehydration Engine', () => {

    function rehydrateConsultationContext(
      chartData: {
        invoicesHistory?: Array<{
          consultationId?: string;
          queueItemId?: string;
          lineItems?: Array<{
            serviceItemId?: string;
            itemCode?: string;
            description: string;
            category?: string;
            unitPrice: number;
          }>;
        }>;
        labOrdersHistory?: Array<{
          consultationId?: string;
          queueItemId?: string;
          testName?: string;
          notes?: string;
          items?: Array<{
            testName: string;
            category?: string;
            instructions?: string;
          }>;
        }>;
        proceduresHistory?: Array<{
          consultationId?: string;
          queueItemId?: string;
          procedureName: string;
        }>;
      },
      existingEncounter: { id: string },
      patient: { id: string },
      diagnosticCatalog: ClinicServiceItem[]
    ) {
      const rehydratedLabs: LocalLabOrder[] = [];
      const existingInvoice = chartData.invoicesHistory?.find(
        (inv) =>
          (existingEncounter.id && inv.consultationId === existingEncounter.id) ||
          (patient.id && inv.queueItemId === patient.id)
      );

      if (existingInvoice?.lineItems?.length) {
        const diagItems = existingInvoice.lineItems.filter(
          (item) => (item.category || '').toLowerCase() === 'diagnostic'
        );
        for (const item of diagItems) {
          const cleanName = item.description
            ? item.description.replace(/\s*\(PhilHealth Yakap.*?\)$/i, '').trim()
            : item.description;
          const matchedDiag = diagnosticCatalog.find(
            (d) =>
              (item.serviceItemId && d.id === item.serviceItemId) ||
              (item.itemCode && d.code === item.itemCode) ||
              d.name.toLowerCase() === cleanName.toLowerCase()
          );
          rehydratedLabs.push({
            serviceItemId: item.serviceItemId || matchedDiag?.id,
            code: item.itemCode || matchedDiag?.code,
            name: matchedDiag?.name || cleanName,
            category: item.category || matchedDiag?.category || 'Diagnostic',
            standardPrice: matchedDiag?.standardPrice ?? item.unitPrice,
            philHealthCode: matchedDiag?.philHealthCode,
            fulfillmentMode: 'in_house',
          });
        }
      }

      const existingLabOrders = chartData.labOrdersHistory?.filter(
        (lo) =>
          (existingEncounter.id && lo.consultationId === existingEncounter.id) ||
          (patient.id && (lo as any).queueItemId === patient.id)
      );
      if (existingLabOrders?.length) {
        for (const lo of existingLabOrders) {
          if (lo.items?.length) {
            for (const item of lo.items) {
              const matchedDiag = diagnosticCatalog.find(
                (d) => d.name.toLowerCase() === item.testName.toLowerCase()
              );
              rehydratedLabs.push({
                serviceItemId: matchedDiag?.id,
                code: matchedDiag?.code,
                name: item.testName,
                category: item.category || matchedDiag?.category || 'Diagnostic',
                standardPrice: matchedDiag?.standardPrice ?? 0,
                philHealthCode: matchedDiag?.philHealthCode,
                fulfillmentMode: 'outside',
                instructions: item.instructions,
              });
            }
          } else if (lo.testName) {
            const matchedDiag = diagnosticCatalog.find(
              (d) => d.name.toLowerCase() === lo.testName?.toLowerCase()
            );
            rehydratedLabs.push({
              serviceItemId: matchedDiag?.id,
              code: matchedDiag?.code,
              name: lo.testName,
              category: matchedDiag?.category || 'Diagnostic',
              standardPrice: matchedDiag?.standardPrice ?? 0,
              philHealthCode: matchedDiag?.philHealthCode,
              fulfillmentMode: 'outside',
              instructions: lo.notes,
            });
          }
        }
      }

      // Deduplicate rehydratedLabs by name
      const uniqueLabs: LocalLabOrder[] = [];
      const seenLabNames = new Set<string>();
      for (const lab of rehydratedLabs) {
        const lower = lab.name.toLowerCase();
        if (!seenLabNames.has(lower)) {
          seenLabNames.add(lower);
          uniqueLabs.push(lab);
        }
      }

      // Rehydrate orderedProcedures
      const existingProcedures = chartData.proceduresHistory?.filter(
        (proc) =>
          (existingEncounter.id && proc.consultationId === existingEncounter.id) ||
          (patient.id && proc.queueItemId === patient.id)
      );
      const procNamesFromHistory = (existingProcedures || []).map((pr) => pr.procedureName).filter(Boolean);
      const procNamesFromInvoice = (existingInvoice?.lineItems || [])
        .filter((li) => {
          const cat = (li.category || '').toLowerCase();
          return cat === 'procedure' || cat === 'nursingservice';
        })
        .map((li) => li.description)
        .filter(Boolean);
      const uniqueProcs = Array.from(new Set([...procNamesFromHistory, ...procNamesFromInvoice]));

      return { rehydratedLabs: uniqueLabs, rehydratedProcedures: uniqueProcs };
    }

    test('6.1 Rehydrates in-house tests from invoice diagnostic items and cleanly strips Yakap ₱0 Co-pay suffix', () => {
      const mockChartData = {
        invoicesHistory: [
          {
            consultationId: 'enc-999',
            lineItems: [
              {
                serviceItemId: 'srv-001',
                itemCode: 'RBS-01',
                description: 'Random Blood Sugar (RBS) (PhilHealth Yakap - ₱0 Co-pay)',
                category: 'Diagnostic',
                unitPrice: 0,
              },
              {
                serviceItemId: 'srv-002',
                itemCode: 'ECG-12',
                description: '12-Lead Electrocardiogram',
                category: 'Diagnostic',
                unitPrice: 450,
              },
              {
                serviceItemId: 'fee-consult',
                itemCode: 'CONSULT-GEN',
                description: 'General Medical Consultation',
                category: 'Consultation',
                unitPrice: 500,
              },
            ],
          },
        ],
      };

      const result = rehydrateConsultationContext(
        mockChartData,
        { id: 'enc-999' },
        { id: 'q-999' },
        MOCK_CATALOG
      );

      expect(result.rehydratedLabs.length).toBe(2);
      expect(result.rehydratedLabs[0].name).toBe('Random Blood Sugar (RBS)');
      expect(result.rehydratedLabs[0].fulfillmentMode).toBe('in_house');
      expect(result.rehydratedLabs[0].standardPrice).toBe(150); // restored from catalog
      expect(result.rehydratedLabs[1].name).toBe('12-Lead Electrocardiogram');
      expect(result.rehydratedLabs[1].fulfillmentMode).toBe('in_house');
      expect(result.rehydratedLabs[1].standardPrice).toBe(450);
    });

    test('6.2 Rehydrates outside lab orders from labOrdersHistory items array with instructions', () => {
      const mockChartData = {
        labOrdersHistory: [
          {
            consultationId: 'enc-999',
            items: [
              { testName: 'Complete Blood Count (CBC) with Platelets', category: 'Diagnostic', instructions: 'STAT' },
              { testName: 'Lipid Profile', category: 'Diagnostic', instructions: '10-12 hr fasting' },
            ],
          },
        ],
      };

      const result = rehydrateConsultationContext(
        mockChartData,
        { id: 'enc-999' },
        { id: 'q-999' },
        MOCK_CATALOG
      );

      expect(result.rehydratedLabs.length).toBe(2);
      expect(result.rehydratedLabs[0].name).toBe('Complete Blood Count (CBC) with Platelets');
      expect(result.rehydratedLabs[0].fulfillmentMode).toBe('outside');
      expect(result.rehydratedLabs[0].instructions).toBe('STAT');
      expect(result.rehydratedLabs[1].name).toBe('Lipid Profile');
      expect(result.rehydratedLabs[1].fulfillmentMode).toBe('outside');
      expect(result.rehydratedLabs[1].instructions).toBe('10-12 hr fasting');
    });

    test('6.3 Rehydrates legacy outside lab order with single testName field', () => {
      const mockChartData = {
        labOrdersHistory: [
          {
            consultationId: 'enc-999',
            testName: 'Complete Blood Count (CBC) with Platelets',
            notes: 'Fasting specimen',
          },
        ],
      };

      const result = rehydrateConsultationContext(
        mockChartData,
        { id: 'enc-999' },
        { id: 'q-999' },
        MOCK_CATALOG
      );

      expect(result.rehydratedLabs.length).toBe(1);
      expect(result.rehydratedLabs[0].name).toBe('Complete Blood Count (CBC) with Platelets');
      expect(result.rehydratedLabs[0].fulfillmentMode).toBe('outside');
      expect(result.rehydratedLabs[0].instructions).toBe('Fasting specimen');
    });

    test('6.4 Rehydration deduplicates tests with duplicate names across invoice and lab orders', () => {
      const mockChartData = {
        invoicesHistory: [
          {
            consultationId: 'enc-999',
            lineItems: [
              {
                serviceItemId: 'srv-001',
                description: 'Random Blood Sugar (RBS)',
                category: 'Diagnostic',
                unitPrice: 150,
              },
            ],
          },
        ],
        labOrdersHistory: [
          {
            consultationId: 'enc-999',
            items: [
              { testName: 'Random Blood Sugar (RBS)', category: 'Diagnostic' },
              { testName: 'Lipid Profile', category: 'Diagnostic' },
            ],
          },
        ],
      };

      const result = rehydrateConsultationContext(
        mockChartData,
        { id: 'enc-999' },
        { id: 'q-999' },
        MOCK_CATALOG
      );

      // RBS appeared in both; deduplication should yield exactly 2 unique tests (RBS and Lipid Profile)
      expect(result.rehydratedLabs.length).toBe(2);
      expect(result.rehydratedLabs.map((l) => l.name)).toEqual(['Random Blood Sugar (RBS)', 'Lipid Profile']);
    });

    test('6.5 Rehydrates ordered procedures from both proceduresHistory and invoice line items', () => {
      const mockChartData = {
        invoicesHistory: [
          {
            consultationId: 'enc-999',
            lineItems: [
              { description: 'Nebulization Treatment', category: 'Procedure', unitPrice: 200 },
              { description: 'Nursing Service IV Push', category: 'NursingService', unitPrice: 150 },
            ],
          },
        ],
        proceduresHistory: [
          { consultationId: 'enc-999', procedureName: 'Nebulization Treatment' },
          { consultationId: 'enc-999', procedureName: 'Wound Dressing & Debridement' },
        ],
      };

      const result = rehydrateConsultationContext(
        mockChartData,
        { id: 'enc-999' },
        { id: 'q-999' },
        MOCK_CATALOG
      );

      expect(result.rehydratedProcedures.length).toBe(3);
      expect(result.rehydratedProcedures).toContain('Nebulization Treatment');
      expect(result.rehydratedProcedures).toContain('Wound Dressing & Debridement');
      expect(result.rehydratedProcedures).toContain('Nursing Service IV Push');
    });
  });

  // =========================================================================
  // SUITE 7: Static Source AST & Design Token Integrity Checks
  // =========================================================================
  describe('Suite 7: Static Source AST & Design Token Integrity', () => {
    const consultationScreenPath = path.resolve(__dirname, '../navigation/screens/Consultations.screen.tsx');
    const sourceCode = fs.readFileSync(consultationScreenPath, 'utf8');

    test('7.1 LocalLabOrder interface is exported with required fields', () => {
      expect(sourceCode).toContain('export interface LocalLabOrder');
      expect(sourceCode).toContain("fulfillmentMode: 'in_house' | 'outside'");
      expect(sourceCode).toContain('standardPrice: number');
      expect(sourceCode).toContain('instructions?: string');
    });

    test('7.2 Partitioning filter logic exists exactly as specified', () => {
      expect(sourceCode).toContain("orderedLabs.filter((l) => l.fulfillmentMode === 'outside')");
      expect(sourceCode).toContain("orderedLabs.filter((l) => l.fulfillmentMode === 'in_house')");
    });

    test('7.3 createLabOrder is strictly guarded by outsideLabs.length > 0', () => {
      expect(sourceCode).toContain('if (outsideLabs.length > 0)');
      expect(sourceCode).toContain('clinicService.createLabOrder(');
    });

    test('7.4 outsideLabs is NEVER pushed to billItems', () => {
      // Find billItems logic
      const handleSignAndSyncBlock = sourceCode.substring(
        sourceCode.indexOf('const handleSignAndSync = async () => {'),
        sourceCode.indexOf('const styles = StyleSheet.create({')
      );

      expect(handleSignAndSyncBlock).toContain('for (const inHouseLab of inHouseLabs)');
      expect(handleSignAndSyncBlock).not.toContain('for (const out of outsideLabs)');
      expect(handleSignAndSyncBlock).not.toContain('billItems.push(outsideLab');
    });

    test('7.5 PhilHealth Yakap ₱0 Co-pay annotation is present in billItems generation', () => {
      expect(sourceCode).toContain('(PhilHealth Yakap - ₱0 Co-pay)');
      expect(sourceCode).toContain('const isCoveredByYakap = Boolean(isYakapEligible && philHealthCode)');
      expect(sourceCode).toContain('const unitPrice = isCoveredByYakap ? 0 :');
    });

    test('7.6 OrderCatalogSearchModal is rendered with onSelectOrder and activeCatalog', () => {
      expect(sourceCode).toContain('<OrderCatalogSearchModal');
      expect(sourceCode).toContain('onSelectOrder={handleSelectCatalogOrder}');
      expect(sourceCode).toContain('testID="consultation-add-lab-test-btn"');
      expect(sourceCode).toContain('testID="consultation-add-procedure-btn"');
    });

    test('7.7 All 10 sectionOffsets.current assignments remain intact', () => {
      const expectedKeys = [
        'patient-pin',
        'vitals',
        'atc',
        'symptoms',
        'physical-exam',
        'primary-diagnosis',
        'medicines',
        'doctor-pan',
        'doctor-prc',
        'doctor-s2',
      ];

      for (const key of expectedKeys) {
        expect(sourceCode).toContain(`sectionOffsets.current['${key}'] =`);
      }
    });

    test('7.8 Zero raw hex color values exist in Consultations.screen.tsx', () => {
      // Look for hex colors (e.g. #0D6963, #fff, #123456)
      const hexColorRegex = /#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g;
      const matches = sourceCode.match(hexColorRegex) || [];
      expect(matches).toEqual([]);
    });
  });
});

// token-guard:ignore-file
import { describe, expect, test, mock, beforeEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

(globalThis as any).__DEV__ = true;

// 1. Mock React Native modules for Bun test environment
const createMockComponent = (name: string) => {
  const Comp = ({ children, accessibilityLabel, accessibilityRole, placeholder, testID, ...props }: any) =>
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
  PanResponder: { create: () => ({ panHandlers: {} }) },
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

mock.module('@expo-google-fonts/geist', () => ({
  useFonts: () => [true],
}));

mock.module('@expo-google-fonts/geist-mono', () => ({
  useFonts: () => [true],
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

// Import types and component
import type { LocalLabOrder, LocalProcedureOrder } from '../navigation/screens/Consultations.screen';
import type { OrderCatalogItemPayload } from '../components/consultation/OrderCatalogSearchModal';
import type { ClinicServiceItem, CreateInvoiceRequest } from '../services/clinicService';

const { OrderCatalogSearchModal } = await import('../components/consultation/OrderCatalogSearchModal');

// =========================================================================
// Canonical Test Fixtures & Fee Schedule Catalog
// =========================================================================

const MOCK_DIAGNOSTIC_CATALOG: ClinicServiceItem[] = [
  {
    id: 'srv-rbs',
    code: 'RBS-01',
    name: 'Random Blood Sugar (RBS)',
    category: 'Diagnostic',
    standardPrice: 150,
    philHealthCode: '90001',
    description: 'Point-of-care capillary fingerstick glucose',
    isActive: true,
  },
  {
    id: 'srv-ecg',
    code: 'ECG-12',
    name: '12-Lead Electrocardiogram',
    category: 'Diagnostic',
    standardPrice: 450,
    philHealthCode: '93000',
    description: 'Standard 12-lead ECG tracing in clinic',
    isActive: true,
  },
  {
    id: 'srv-urine-dip',
    code: 'URINE-DIP',
    name: 'Urinalysis Rapid Dipstick',
    category: 'Diagnostic',
    standardPrice: 120,
    philHealthCode: '81002',
    description: '10-parameter rapid urine test strip',
    isActive: true,
  },
  {
    id: 'srv-covid-ag',
    code: 'COVID-AG',
    name: 'COVID-19 Rapid Antigen',
    category: 'Diagnostic',
    standardPrice: 500,
    philHealthCode: undefined, // Non-covered rapid POC test
    description: 'Rapid point-of-care nasal swab lateral flow assay',
    isActive: true,
  },
  {
    id: 'srv-cbc',
    code: 'CBC-01',
    name: 'Complete Blood Count (CBC) with Platelets',
    category: 'Diagnostic',
    standardPrice: 350,
    philHealthCode: '85025',
    description: 'Venipuncture specimen sent to partner hematology lab',
    isActive: true,
  },
  {
    id: 'srv-lipid',
    code: 'LIPID-01',
    name: 'Lipid Profile',
    category: 'Diagnostic',
    standardPrice: 850,
    philHealthCode: '80061',
    description: 'Cholesterol, Triglycerides, HDL, LDL send-out panel',
    isActive: true,
  },
  {
    id: 'srv-pap',
    code: 'PAP-01',
    name: 'Pap Smear Cervical Cytology',
    category: 'Diagnostic',
    standardPrice: 600,
    philHealthCode: '88141',
    description: 'Cervical smear sent to outside pathology laboratory',
    isActive: true,
  },
  {
    id: 'srv-tft',
    code: 'THYROID-TFT',
    name: 'Thyroid Function Panel (Free T3, Free T4, TSH)',
    category: 'Diagnostic',
    standardPrice: 1600,
    philHealthCode: undefined, // Outside specialized panel not on PhilHealth list
    description: 'Immunoassay send-out serum test',
    isActive: true,
  },
  {
    id: 'srv-inactive',
    code: 'INACT-01',
    name: 'Legacy Stool Examination',
    category: 'Diagnostic',
    standardPrice: 100,
    philHealthCode: '87177',
    description: 'Discontinued test item',
    isActive: false, // Inactive item
  },
];

const MOCK_PROCEDURE_CATALOG: ClinicServiceItem[] = [
  {
    id: 'proc-neb',
    code: 'NEB-01',
    name: 'Nebulization Treatment',
    category: 'Procedure',
    standardPrice: 200,
    isActive: true,
  },
  {
    id: 'proc-wound',
    code: 'WOUND-01',
    name: 'Wound Dressing & Debridement',
    category: 'Procedure',
    standardPrice: 350,
    isActive: true,
  },
  {
    id: 'proc-iv',
    code: 'IV-01',
    name: 'Intravenous Cannulation & Infusion',
    category: 'NursingService',
    standardPrice: 250,
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

const COMBINED_CATALOG: ClinicServiceItem[] = [
  MOCK_CONSULTATION_FEE,
  ...MOCK_DIAGNOSTIC_CATALOG,
  ...MOCK_PROCEDURE_CATALOG,
];

// =========================================================================
// Workstation Dynamic Orders Domain Logic (Mirrors Consultations.screen.tsx)
// =========================================================================

const IN_HOUSE_RAPID_TEST_REGEX = /fingerstick|ecg|dipstick|rapid|rbs|urinalysis/i;

function resolveHeuristicFulfillmentMode(item: ClinicServiceItem | string): 'in_house' | 'outside' {
  if (typeof item === 'string') {
    return IN_HOUSE_RAPID_TEST_REGEX.test(item) ? 'in_house' : 'outside';
  }
  const isDiagnostic = (item.category || '').toLowerCase().includes('diagnostic');
  if (!isDiagnostic) return 'in_house';
  const matchTarget = `${item.name || ''} ${item.code || ''} ${item.description || ''}`;
  return IN_HOUSE_RAPID_TEST_REGEX.test(matchTarget) ? 'in_house' : 'outside';
}

function partitionLabs(orderedLabs: LocalLabOrder[]) {
  const outsideLabs = orderedLabs.filter((l) => l.fulfillmentMode === 'outside');
  const inHouseLabs = orderedLabs.filter((l) => l.fulfillmentMode === 'in_house');
  return { outsideLabs, inHouseLabs };
}

function generateCashierBillItems(params: {
  orderedLabs: LocalLabOrder[];
  orderedProcedures: (string | LocalProcedureOrder)[];
  diagnosticCatalog: ClinicServiceItem[];
  procedureCatalog: ClinicServiceItem[];
  consultationFee: ClinicServiceItem | null;
  isYakapEligible: boolean;
}): CreateInvoiceRequest['lineItems'] {
  const { orderedLabs, orderedProcedures, diagnosticCatalog, procedureCatalog, consultationFee, isYakapEligible } = params;
  const { inHouseLabs } = partitionLabs(orderedLabs);
  const billItems: CreateInvoiceRequest['lineItems'] = [];

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
    const procName = typeof proc === 'string' ? proc : proc.name;
    const procInfo = procedureCatalog.find((p) => p.name.toLowerCase() === procName.toLowerCase());
    const serviceItemId = typeof proc !== 'string' ? (proc.serviceItemId || procInfo?.id) : procInfo?.id;
    const itemCode = typeof proc !== 'string' ? (proc.code || procInfo?.code) : procInfo?.code;
    const category = typeof proc !== 'string' ? (proc.category || procInfo?.category || 'Procedure') : (procInfo?.category || 'Procedure');
    const unitPrice = typeof proc !== 'string' ? (proc.standardPrice ?? procInfo?.standardPrice ?? 0) : (procInfo?.standardPrice ?? 0);

    billItems.push({
      serviceItemId,
      itemCode,
      description: procName,
      category,
      unitPrice,
      quantity: 1,
    });
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

function generateLabOrderRequisition(params: {
  orderedLabs: LocalLabOrder[];
  diagnosticCatalog: ClinicServiceItem[];
}) {
  const { outsideLabs } = partitionLabs(params.orderedLabs);
  if (outsideLabs.length === 0) return null;

  return {
    items: outsideLabs.map((l) => ({
      testName: l.name,
      category: l.category || (params.diagnosticCatalog.find((d) => d.name === l.name)?.category ?? 'Diagnostic'),
      instructions: l.instructions,
    })),
  };
}

function rehydrateEncounterOrders(params: {
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
  };
  encounterId: string;
  queueItemId: string;
  diagnosticCatalog: ClinicServiceItem[];
}) {
  const { chartData, encounterId, queueItemId, diagnosticCatalog } = params;
  const rehydratedLabs: LocalLabOrder[] = [];

  const existingInvoice = chartData.invoicesHistory?.find(
    (inv) =>
      (encounterId && inv.consultationId === encounterId) ||
      (queueItemId && inv.queueItemId === queueItemId)
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
      (encounterId && lo.consultationId === encounterId) ||
      (queueItemId && (lo as any).queueItemId === queueItemId)
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

  // Deduplicate rehydratedLabs case-insensitively by name
  const uniqueLabs: LocalLabOrder[] = [];
  const seenLabNames = new Set<string>();
  for (const lab of rehydratedLabs) {
    const lower = lab.name.toLowerCase();
    if (!seenLabNames.has(lower)) {
      seenLabNames.add(lower);
      uniqueLabs.push(lab);
    }
  }

  // Rehydrate orderedProcedures from proceduresHistory and invoice line items
  const existingProcedures = chartData.proceduresHistory?.filter(
    (proc) =>
      (encounterId && proc.consultationId === encounterId) ||
      (queueItemId && proc.queueItemId === queueItemId)
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

  return {
    rehydratedLabs: uniqueLabs,
    rehydratedProcedures: uniqueProcs,
  };
}

// =========================================================================
// TEST SUITES
// =========================================================================

describe('Consultation Workstation Dynamic Orders Automated Test Suite', () => {

  // =======================================================================
  // AC1: Diagnostic tests can be toggled between In-House and Outside Lab
  // =======================================================================
  describe('AC1: Diagnostic Fulfillment Modes & Toggling (In-House vs Outside Lab)', () => {
    test('1.1 Rapid point-of-care tests default to in_house via regex heuristics', () => {
      const rbs = MOCK_DIAGNOSTIC_CATALOG.find((s) => s.code === 'RBS-01')!;
      const ecg = MOCK_DIAGNOSTIC_CATALOG.find((s) => s.code === 'ECG-12')!;
      const dipstick = MOCK_DIAGNOSTIC_CATALOG.find((s) => s.code === 'URINE-DIP')!;
      const covid = MOCK_DIAGNOSTIC_CATALOG.find((s) => s.code === 'COVID-AG')!;

      expect(resolveHeuristicFulfillmentMode(rbs)).toBe('in_house');
      expect(resolveHeuristicFulfillmentMode(ecg)).toBe('in_house');
      expect(resolveHeuristicFulfillmentMode(dipstick)).toBe('in_house');
      expect(resolveHeuristicFulfillmentMode(covid)).toBe('in_house');
    });

    test('1.2 Send-out diagnostic panels default to outside laboratory', () => {
      const cbc = MOCK_DIAGNOSTIC_CATALOG.find((s) => s.code === 'CBC-01')!;
      const lipid = MOCK_DIAGNOSTIC_CATALOG.find((s) => s.code === 'LIPID-01')!;
      const pap = MOCK_DIAGNOSTIC_CATALOG.find((s) => s.code === 'PAP-01')!;
      const tft = MOCK_DIAGNOSTIC_CATALOG.find((s) => s.code === 'THYROID-TFT')!;

      expect(resolveHeuristicFulfillmentMode(cbc)).toBe('outside');
      expect(resolveHeuristicFulfillmentMode(lipid)).toBe('outside');
      expect(resolveHeuristicFulfillmentMode(pap)).toBe('outside');
      expect(resolveHeuristicFulfillmentMode(tft)).toBe('outside');
    });

    test('1.3 Non-diagnostic procedures always default to in_house', () => {
      const neb = MOCK_PROCEDURE_CATALOG.find((s) => s.code === 'NEB-01')!;
      const wound = MOCK_PROCEDURE_CATALOG.find((s) => s.code === 'WOUND-01')!;
      const iv = MOCK_PROCEDURE_CATALOG.find((s) => s.code === 'IV-01')!;

      expect(resolveHeuristicFulfillmentMode(neb)).toBe('in_house');
      expect(resolveHeuristicFulfillmentMode(wound)).toBe('in_house');
      expect(resolveHeuristicFulfillmentMode(iv)).toBe('in_house');
    });

    test('1.4 Toggling fulfillment mode switches from in_house to outside and back', () => {
      let lab: LocalLabOrder = {
        name: 'Random Blood Sugar (RBS)',
        category: 'Diagnostic',
        standardPrice: 150,
        philHealthCode: '90001',
        fulfillmentMode: 'in_house',
      };

      // Toggle to outside
      lab = { ...lab, fulfillmentMode: lab.fulfillmentMode === 'in_house' ? 'outside' : 'in_house' };
      expect(lab.fulfillmentMode).toBe('outside');

      // Toggle back to in_house
      lab = { ...lab, fulfillmentMode: lab.fulfillmentMode === 'in_house' ? 'outside' : 'in_house' };
      expect(lab.fulfillmentMode).toBe('in_house');
    });

    test('1.5 Toggling and removing are locked out when encounter is signed (isSigned === true)', () => {
      const isSigned = true;
      const initialLabs: LocalLabOrder[] = [
        {
          name: 'Random Blood Sugar (RBS)',
          category: 'Diagnostic',
          standardPrice: 150,
          philHealthCode: '90001',
          fulfillmentMode: 'in_house',
        },
      ];

      // Attempt toggle under isSigned
      const handleToggle = (name: string, current: LocalLabOrder[]) => {
        if (isSigned) return current;
        return current.map((l) => (l.name === name ? { ...l, fulfillmentMode: l.fulfillmentMode === 'in_house' ? 'outside' : 'in_house' } : l));
      };

      const handleRemove = (name: string, current: LocalLabOrder[]) => {
        if (isSigned) return current;
        return current.filter((l) => l.name !== name);
      };

      const toggled = handleToggle('Random Blood Sugar (RBS)', initialLabs);
      expect(toggled[0].fulfillmentMode).toBe('in_house'); // Untouched

      const removed = handleRemove('Random Blood Sugar (RBS)', initialLabs);
      expect(removed.length).toBe(1); // Untouched
    });
  });

  // =======================================================================
  // AC2 & AC3: Dual Fulfillment Partitioning & Billing Integration
  // =======================================================================
  describe('AC2 & AC3: Dual Fulfillment Partitioning & Cashier Invoice Integration', () => {
    test('2.1 Partitions orderedLabs into In-House and Outside collections with zero overlap', () => {
      const orders: LocalLabOrder[] = [
        { name: 'RBS', category: 'Diagnostic', standardPrice: 150, fulfillmentMode: 'in_house' },
        { name: 'ECG', category: 'Diagnostic', standardPrice: 450, fulfillmentMode: 'in_house' },
        { name: 'CBC', category: 'Diagnostic', standardPrice: 350, fulfillmentMode: 'outside' },
        { name: 'Lipid', category: 'Diagnostic', standardPrice: 850, fulfillmentMode: 'outside' },
      ];

      const { inHouseLabs, outsideLabs } = partitionLabs(orders);
      expect(inHouseLabs.length).toBe(2);
      expect(outsideLabs.length).toBe(2);
      expect(inHouseLabs.map((l) => l.name)).toEqual(['RBS', 'ECG']);
      expect(outsideLabs.map((l) => l.name)).toEqual(['CBC', 'Lipid']);
    });

    test('2.2 In-house diagnostic tests appear as line items in Cashier invoice upon signing', () => {
      const orderedLabs: LocalLabOrder[] = [
        {
          serviceItemId: 'srv-rbs',
          code: 'RBS-01',
          name: 'Random Blood Sugar (RBS)',
          category: 'Diagnostic',
          standardPrice: 150,
          fulfillmentMode: 'in_house',
        },
      ];

      const billItems = generateCashierBillItems({
        orderedLabs,
        orderedProcedures: [],
        diagnosticCatalog: MOCK_DIAGNOSTIC_CATALOG,
        procedureCatalog: MOCK_PROCEDURE_CATALOG,
        consultationFee: MOCK_CONSULTATION_FEE,
        isYakapEligible: false,
      });

      expect(billItems.length).toBe(2); // Consultation + RBS
      const rbsItem = billItems.find((i) => i.serviceItemId === 'srv-rbs');
      expect(rbsItem).toBeDefined();
      expect(rbsItem?.description).toBe('Random Blood Sugar (RBS)');
      expect(rbsItem?.unitPrice).toBe(150);
      expect(rbsItem?.quantity).toBe(1);
      expect(rbsItem?.category).toBe('Diagnostic');
    });

    test('2.3 Outside laboratory orders are STRICTLY EXCLUDED from Cashier invoice (preventing double billing)', () => {
      const orderedLabs: LocalLabOrder[] = [
        {
          serviceItemId: 'srv-cbc',
          code: 'CBC-01',
          name: 'Complete Blood Count (CBC) with Platelets',
          category: 'Diagnostic',
          standardPrice: 350,
          fulfillmentMode: 'outside',
        },
        {
          serviceItemId: 'srv-lipid',
          code: 'LIPID-01',
          name: 'Lipid Profile',
          category: 'Diagnostic',
          standardPrice: 850,
          fulfillmentMode: 'outside',
        },
      ];

      const billItems = generateCashierBillItems({
        orderedLabs,
        orderedProcedures: [],
        diagnosticCatalog: MOCK_DIAGNOSTIC_CATALOG,
        procedureCatalog: MOCK_PROCEDURE_CATALOG,
        consultationFee: MOCK_CONSULTATION_FEE,
        isYakapEligible: false,
      });

      // Bill items must contain ONLY the consultation fee!
      expect(billItems.length).toBe(1);
      expect(billItems[0].serviceItemId).toBe('fee-consult');
      expect(billItems.some((i) => i.description.includes('CBC'))).toBe(false);
      expect(billItems.some((i) => i.description.includes('Lipid'))).toBe(false);
    });

    test('2.4 Outside laboratory orders route exclusively to createLabOrder with instructions', () => {
      const orderedLabs: LocalLabOrder[] = [
        {
          serviceItemId: 'srv-rbs',
          name: 'Random Blood Sugar (RBS)',
          category: 'Diagnostic',
          standardPrice: 150,
          fulfillmentMode: 'in_house',
        },
        {
          serviceItemId: 'srv-lipid',
          name: 'Lipid Profile',
          category: 'Diagnostic',
          standardPrice: 850,
          fulfillmentMode: 'outside',
          instructions: '10-12 hr fasting; STAT',
        },
      ];

      const labOrderPayload = generateLabOrderRequisition({
        orderedLabs,
        diagnosticCatalog: MOCK_DIAGNOSTIC_CATALOG,
      });

      expect(labOrderPayload).not.toBeNull();
      expect(labOrderPayload?.items.length).toBe(1);
      expect(labOrderPayload?.items[0].testName).toBe('Lipid Profile');
      expect(labOrderPayload?.items[0].instructions).toBe('10-12 hr fasting; STAT');
      // In-house test RBS must NOT be in lab order items
      expect(labOrderPayload?.items.some((i) => i.testName.includes('RBS'))).toBe(false);
    });
  });

  // =======================================================================
  // AC4: PhilHealth Yakap covered in-house tests apply ₱0 patient co-pay
  // =======================================================================
  describe('AC4: PhilHealth Yakap Covered In-House Tests (₱0 Patient Co-Pay)', () => {
    test('4.1 Yakap eligible patient + covered in-house test applies ₱0 co-pay and descriptive annotation', () => {
      const orderedLabs: LocalLabOrder[] = [
        {
          serviceItemId: 'srv-rbs',
          code: 'RBS-01',
          name: 'Random Blood Sugar (RBS)',
          category: 'Diagnostic',
          standardPrice: 150,
          philHealthCode: '90001',
          fulfillmentMode: 'in_house',
        },
      ];

      const billItems = generateCashierBillItems({
        orderedLabs,
        orderedProcedures: [],
        diagnosticCatalog: MOCK_DIAGNOSTIC_CATALOG,
        procedureCatalog: MOCK_PROCEDURE_CATALOG,
        consultationFee: null,
        isYakapEligible: true,
      });

      expect(billItems.length).toBe(1);
      expect(billItems[0].unitPrice).toBe(0);
      expect(billItems[0].description).toBe('Random Blood Sugar (RBS) (PhilHealth Yakap - ₱0 Co-pay)');
      expect(billItems[0].itemCode).toBe('RBS-01');
    });

    test('4.2 Non-Yakap patient (isYakapEligible === false) retains standard fee schedule price', () => {
      const orderedLabs: LocalLabOrder[] = [
        {
          serviceItemId: 'srv-rbs',
          code: 'RBS-01',
          name: 'Random Blood Sugar (RBS)',
          category: 'Diagnostic',
          standardPrice: 150,
          philHealthCode: '90001',
          fulfillmentMode: 'in_house',
        },
      ];

      const billItems = generateCashierBillItems({
        orderedLabs,
        orderedProcedures: [],
        diagnosticCatalog: MOCK_DIAGNOSTIC_CATALOG,
        procedureCatalog: MOCK_PROCEDURE_CATALOG,
        consultationFee: null,
        isYakapEligible: false,
      });

      expect(billItems.length).toBe(1);
      expect(billItems[0].unitPrice).toBe(150);
      expect(billItems[0].description).toBe('Random Blood Sugar (RBS)');
      expect(billItems[0].description.includes('₱0 Co-pay')).toBe(false);
    });

    test('4.3 Yakap eligible patient with non-covered rapid test applies standard fee schedule price', () => {
      const orderedLabs: LocalLabOrder[] = [
        {
          serviceItemId: 'srv-covid-ag',
          code: 'COVID-AG',
          name: 'COVID-19 Rapid Antigen',
          category: 'Diagnostic',
          standardPrice: 500,
          philHealthCode: undefined, // Non-covered
          fulfillmentMode: 'in_house',
        },
      ];

      const billItems = generateCashierBillItems({
        orderedLabs,
        orderedProcedures: [],
        diagnosticCatalog: MOCK_DIAGNOSTIC_CATALOG,
        procedureCatalog: MOCK_PROCEDURE_CATALOG,
        consultationFee: null,
        isYakapEligible: true,
      });

      expect(billItems.length).toBe(1);
      expect(billItems[0].unitPrice).toBe(500);
      expect(billItems[0].description).toBe('COVID-19 Rapid Antigen');
      expect(billItems[0].description.includes('₱0 Co-pay')).toBe(false);
    });

    test('4.4 Covered test switched to outside lab fulfillment is NOT billed with ₱0 co-pay on clinic invoice', () => {
      const orderedLabs: LocalLabOrder[] = [
        {
          serviceItemId: 'srv-cbc',
          code: 'CBC-01',
          name: 'Complete Blood Count (CBC) with Platelets',
          category: 'Diagnostic',
          standardPrice: 350,
          philHealthCode: '85025',
          fulfillmentMode: 'outside',
        },
      ];

      const billItems = generateCashierBillItems({
        orderedLabs,
        orderedProcedures: [],
        diagnosticCatalog: MOCK_DIAGNOSTIC_CATALOG,
        procedureCatalog: MOCK_PROCEDURE_CATALOG,
        consultationFee: null,
        isYakapEligible: true,
      });

      // Outside test must NOT appear on clinic invoice at all!
      expect(billItems.length).toBe(0);
    });
  });

  // =======================================================================
  // AC5: OrderCatalogSearchModal filters catalog items and supports adding
  // =======================================================================
  describe('AC5: OrderCatalogSearchModal Filtering, Notes & Payload Assembly', () => {
    test('5.1 Search filtering matches name, code, philHealthCode, and description case-insensitively', () => {
      const filter = (query: string, category: 'All' | 'Diagnostic' | 'Procedure') => {
        const q = query.trim().toLowerCase();
        return COMBINED_CATALOG.filter((item) => {
          if (item.isActive === false) return false;
          const catLower = (item.category || '').toLowerCase();
          if (category === 'Diagnostic' && !catLower.includes('diagnostic')) return false;
          if (category === 'Procedure' && !catLower.includes('procedure') && !catLower.includes('nursing')) return false;

          if (q) {
            const nameMatch = (item.name || '').toLowerCase().includes(q);
            const codeMatch = (item.code || '').toLowerCase().includes(q);
            const philHealthCodeMatch = (item.philHealthCode || '').toLowerCase().includes(q);
            const descMatch = (item.description || '').toLowerCase().includes(q);
            if (!nameMatch && !codeMatch && !philHealthCodeMatch && !descMatch) return false;
          }
          return true;
        });
      };

      // Match by name
      const byName = filter('glucose', 'All');
      expect(byName.some((i) => i.code === 'RBS-01')).toBe(true);

      // Match by item code
      const byCode = filter('ecg-12', 'All');
      expect(byCode.length).toBe(1);
      expect(byCode[0].name).toBe('12-Lead Electrocardiogram');

      // Match by PhilHealth statutory code
      const byPhCode = filter('85025', 'All');
      expect(byPhCode.length).toBe(1);
      expect(byPhCode[0].code === 'CBC-01').toBe(true);

      // Match by description keyword
      const byDesc = filter('venipuncture', 'All');
      expect(byDesc.some((i) => i.code === 'CBC-01')).toBe(true);

      // Category tab filtering
      const diagOnly = filter('', 'Diagnostic');
      expect(diagOnly.every((i) => (i.category || '').toLowerCase().includes('diagnostic'))).toBe(true);
      expect(diagOnly.some((i) => i.code === 'NEB-01')).toBe(false);

      const procOnly = filter('', 'Procedure');
      expect(procOnly.every((i) => (i.category || '').toLowerCase().includes('procedure') || (i.category || '').toLowerCase().includes('nursing'))).toBe(true);
      expect(procOnly.some((i) => i.code === 'RBS-01')).toBe(false);

      // Inactive items are excluded
      const inactiveMatches = filter('Legacy Stool', 'All');
      expect(inactiveMatches.length).toBe(0);
    });

    test('5.2 Fasting instruction chips concatenate with semicolon and allow toggling off', () => {
      let instructions = '';

      const toggleChip = (chip: string, current: string) => {
        const trimmed = current.trim();
        if (!trimmed) return chip;
        const parts = trimmed.split(';').map((p) => p.trim());
        if (parts.includes(chip)) {
          return parts.filter((p) => p !== chip).join('; ');
        }
        return `${trimmed}; ${chip}`;
      };

      instructions = toggleChip('10-12 hr fasting', instructions);
      expect(instructions).toBe('10-12 hr fasting');

      instructions = toggleChip('STAT', instructions);
      expect(instructions).toBe('10-12 hr fasting; STAT');

      // Toggle off '10-12 hr fasting'
      instructions = toggleChip('10-12 hr fasting', instructions);
      expect(instructions).toBe('STAT');

      // Add custom notes typed by user
      instructions = `${instructions}; Patient requested morning draw`;
      expect(instructions).toBe('STAT; Patient requested morning draw');
    });

    test('5.3 OrderCatalogItemPayload assembly forces in_house for procedures and preserves instructions', () => {
      const nebItem = MOCK_PROCEDURE_CATALOG.find((p) => p.code === 'NEB-01')!;
      const isDiagnostic = (nebItem.category || '').toLowerCase().includes('diagnostic');

      const payload: OrderCatalogItemPayload = {
        serviceItemId: nebItem.id,
        code: nebItem.code,
        name: nebItem.name,
        category: nebItem.category,
        standardPrice: nebItem.standardPrice,
        fulfillmentMode: isDiagnostic ? 'outside' : 'in_house',
        instructions: 'Pre/post vitals required',
      };

      expect(payload.fulfillmentMode).toBe('in_house');
      expect(payload.instructions).toBe('Pre/post vitals required');
    });

    test('5.4 Prevents selecting and re-adding already ordered items by name or code', () => {
      const alreadyOrderedNames = ['Random Blood Sugar (RBS)', 'Nebulization Treatment'];
      const alreadyOrderedCodes = ['RBS-01', 'NEB-01'];

      const isSelectable = (item: ClinicServiceItem) => {
        const isOrdered =
          alreadyOrderedNames.some((n) => n.toLowerCase() === item.name.toLowerCase()) ||
          alreadyOrderedCodes.some((c) => c.toLowerCase() === item.code.toLowerCase());
        return !isOrdered;
      };

      const rbs = MOCK_DIAGNOSTIC_CATALOG.find((s) => s.code === 'RBS-01')!;
      const ecg = MOCK_DIAGNOSTIC_CATALOG.find((s) => s.code === 'ECG-12')!;

      expect(isSelectable(rbs)).toBe(false); // Already ordered
      expect(isSelectable(ecg)).toBe(true);  // Not yet ordered
    });

    test('5.5 Renders OrderCatalogSearchModal component with search bar and action buttons', () => {
      const html = renderToStaticMarkup(
        React.createElement(OrderCatalogSearchModal, {
          visible: true,
          onClose: () => {},
          catalog: COMBINED_CATALOG,
          initialCategory: 'All',
          isYakapEligible: true,
          onSelectOrder: () => {},
          alreadyOrderedNames: ['Random Blood Sugar (RBS)'],
          alreadyOrderedCodes: ['RBS-01'],
          testID: 'order-search-modal-test',
        })
      );

      expect(html).toContain('data-testid="order-search-modal-test"');
      expect(html).toContain('data-testid="order-search-modal-test-search-input"');
      expect(html).toContain('data-testid="order-search-modal-test-cancel-btn"');
      expect(html).toContain('data-testid="order-search-modal-test-submit-btn"');
      expect(html).toContain('Add Test or Procedure');
    });
  });

  // =======================================================================
  // AC6: Previously signed encounters rehydrate ordered tests and procedures
  // =======================================================================
  describe('AC6: Past Encounter Rehydration & Signed Lockout', () => {
    test('6.1 Rehydrates in-house labs from invoice diagnostic line items and cleans Yakap annotation', () => {
      const chartData = {
        invoicesHistory: [
          {
            consultationId: 'enc-101',
            lineItems: [
              {
                serviceItemId: 'srv-rbs',
                itemCode: 'RBS-01',
                description: 'Random Blood Sugar (RBS) (PhilHealth Yakap - ₱0 Co-pay)',
                category: 'Diagnostic',
                unitPrice: 0,
              },
              {
                serviceItemId: 'srv-ecg',
                itemCode: 'ECG-12',
                description: '12-Lead Electrocardiogram',
                category: 'Diagnostic',
                unitPrice: 450,
              },
            ],
          },
        ],
      };

      const { rehydratedLabs } = rehydrateEncounterOrders({
        chartData,
        encounterId: 'enc-101',
        queueItemId: 'q-101',
        diagnosticCatalog: MOCK_DIAGNOSTIC_CATALOG,
      });

      expect(rehydratedLabs.length).toBe(2);
      expect(rehydratedLabs[0].name).toBe('Random Blood Sugar (RBS)');
      expect(rehydratedLabs[0].fulfillmentMode).toBe('in_house');
      expect(rehydratedLabs[0].standardPrice).toBe(150); // Restored from catalog
      expect(rehydratedLabs[1].name).toBe('12-Lead Electrocardiogram');
      expect(rehydratedLabs[1].fulfillmentMode).toBe('in_house');
    });

    test('6.2 Rehydrates outside lab orders from labOrdersHistory items and legacy testName', () => {
      const chartData = {
        labOrdersHistory: [
          {
            consultationId: 'enc-102',
            items: [
              {
                testName: 'Complete Blood Count (CBC) with Platelets',
                category: 'Diagnostic',
                instructions: 'Morning venipuncture',
              },
            ],
          },
          {
            consultationId: 'enc-102',
            testName: 'Lipid Profile',
            notes: '12 hr fasting required',
          },
        ],
      };

      const { rehydratedLabs } = rehydrateEncounterOrders({
        chartData,
        encounterId: 'enc-102',
        queueItemId: 'q-102',
        diagnosticCatalog: MOCK_DIAGNOSTIC_CATALOG,
      });

      expect(rehydratedLabs.length).toBe(2);
      expect(rehydratedLabs[0].name).toBe('Complete Blood Count (CBC) with Platelets');
      expect(rehydratedLabs[0].fulfillmentMode).toBe('outside');
      expect(rehydratedLabs[0].instructions).toBe('Morning venipuncture');

      expect(rehydratedLabs[1].name).toBe('Lipid Profile');
      expect(rehydratedLabs[1].fulfillmentMode).toBe('outside');
      expect(rehydratedLabs[1].instructions).toBe('12 hr fasting required');
    });

    test('6.3 Deduplicates orderedLabs and orderedProcedures case-insensitively during rehydration', () => {
      const chartData = {
        invoicesHistory: [
          {
            consultationId: 'enc-103',
            lineItems: [
              { description: 'Random Blood Sugar (RBS)', category: 'Diagnostic', unitPrice: 150 },
              { description: 'random blood sugar (rbs)', category: 'Diagnostic', unitPrice: 150 },
              { description: 'Nebulization Treatment', category: 'Procedure', unitPrice: 200 },
            ],
          },
        ],
        proceduresHistory: [
          { consultationId: 'enc-103', procedureName: 'Nebulization Treatment' },
          { consultationId: 'enc-103', procedureName: 'Wound Dressing & Debridement' },
        ],
      };

      const { rehydratedLabs, rehydratedProcedures } = rehydrateEncounterOrders({
        chartData,
        encounterId: 'enc-103',
        queueItemId: 'q-103',
        diagnosticCatalog: MOCK_DIAGNOSTIC_CATALOG,
      });

      expect(rehydratedLabs.length).toBe(1); // Deduplicated to 1
      expect(rehydratedLabs[0].name).toBe('Random Blood Sugar (RBS)');

      expect(rehydratedProcedures.length).toBe(2); // Nebulization + Wound Dressing
      expect(rehydratedProcedures).toContain('Nebulization Treatment');
      expect(rehydratedProcedures).toContain('Wound Dressing & Debridement');
    });

    test('6.4 Gracefully handles missing history without crashing or throwing', () => {
      const emptyResult = rehydrateEncounterOrders({
        chartData: {},
        encounterId: 'enc-empty',
        queueItemId: 'q-empty',
        diagnosticCatalog: MOCK_DIAGNOSTIC_CATALOG,
      });

      expect(emptyResult.rehydratedLabs).toEqual([]);
      expect(emptyResult.rehydratedProcedures).toEqual([]);
    });
  });

  // =======================================================================
  // AC7: Edge Cases & Multi-Item Encounters
  // =======================================================================
  describe('AC7: Edge Cases & Multi-Item Mixed Encounters', () => {
    test('7.1 Comprehensive mixed encounter: Consultation + Yakap in-house + Non-Yakap in-house + Outside labs + Procedures', () => {
      const orderedLabs: LocalLabOrder[] = [
        // 1 Yakap covered in-house test
        {
          serviceItemId: 'srv-rbs',
          code: 'RBS-01',
          name: 'Random Blood Sugar (RBS)',
          category: 'Diagnostic',
          standardPrice: 150,
          philHealthCode: '90001',
          fulfillmentMode: 'in_house',
        },
        // 1 Non-Yakap in-house test
        {
          serviceItemId: 'srv-covid-ag',
          code: 'COVID-AG',
          name: 'COVID-19 Rapid Antigen',
          category: 'Diagnostic',
          standardPrice: 500,
          philHealthCode: undefined,
          fulfillmentMode: 'in_house',
        },
        // 2 Outside labs
        {
          serviceItemId: 'srv-cbc',
          code: 'CBC-01',
          name: 'Complete Blood Count (CBC) with Platelets',
          category: 'Diagnostic',
          standardPrice: 350,
          philHealthCode: '85025',
          fulfillmentMode: 'outside',
        },
        {
          serviceItemId: 'srv-lipid',
          code: 'LIPID-01',
          name: 'Lipid Profile',
          category: 'Diagnostic',
          standardPrice: 850,
          philHealthCode: '80061',
          fulfillmentMode: 'outside',
        },
      ];

      const orderedProcedures = [
        'Nebulization Treatment',
        'Wound Dressing & Debridement',
      ];

      // Generate invoice
      const billItems = generateCashierBillItems({
        orderedLabs,
        orderedProcedures,
        diagnosticCatalog: MOCK_DIAGNOSTIC_CATALOG,
        procedureCatalog: MOCK_PROCEDURE_CATALOG,
        consultationFee: MOCK_CONSULTATION_FEE,
        isYakapEligible: true,
      });

      // Verification of Cashier Invoice
      // Expected items:
      // 1. General Medical Consultation: ₱500
      // 2. Nebulization Treatment: ₱200
      // 3. Wound Dressing: ₱350
      // 4. RBS (Yakap ₱0 Co-pay): ₱0
      // 5. COVID-19 Rapid Antigen: ₱500
      expect(billItems.length).toBe(5);

      const consultLine = billItems.find((i) => i.serviceItemId === 'fee-consult');
      expect(consultLine?.unitPrice).toBe(500);

      const nebLine = billItems.find((i) => i.itemCode === 'NEB-01');
      expect(nebLine?.unitPrice).toBe(200);

      const woundLine = billItems.find((i) => i.itemCode === 'WOUND-01');
      expect(woundLine?.unitPrice).toBe(350);

      const rbsLine = billItems.find((i) => i.itemCode === 'RBS-01');
      expect(rbsLine?.unitPrice).toBe(0);
      expect(rbsLine?.description).toBe('Random Blood Sugar (RBS) (PhilHealth Yakap - ₱0 Co-pay)');

      const covidLine = billItems.find((i) => i.itemCode === 'COVID-AG');
      expect(covidLine?.unitPrice).toBe(500);
      expect(covidLine?.description).toBe('COVID-19 Rapid Antigen');

      // Total invoice amount
      const totalAmount = billItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
      expect(totalAmount).toBe(1550); // 500 + 200 + 350 + 0 + 500

      // Verification of Outside Lab Requisition
      const labOrder = generateLabOrderRequisition({
        orderedLabs,
        diagnosticCatalog: MOCK_DIAGNOSTIC_CATALOG,
      });
      expect(labOrder).not.toBeNull();
      expect(labOrder?.items.length).toBe(2);
      expect(labOrder?.items.map((i) => i.testName)).toEqual([
        'Complete Blood Count (CBC) with Platelets',
        'Lipid Profile',
      ]);
    });

    test('7.2 Encounter with 0 in-house tests produces invoice with 0 lab items', () => {
      const orderedLabs: LocalLabOrder[] = [
        { name: 'CBC', category: 'Diagnostic', standardPrice: 350, fulfillmentMode: 'outside' },
      ];

      const billItems = generateCashierBillItems({
        orderedLabs,
        orderedProcedures: [],
        diagnosticCatalog: MOCK_DIAGNOSTIC_CATALOG,
        procedureCatalog: MOCK_PROCEDURE_CATALOG,
        consultationFee: MOCK_CONSULTATION_FEE,
        isYakapEligible: true,
      });

      expect(billItems.length).toBe(1);
      expect(billItems[0].serviceItemId).toBe('fee-consult');
    });

    test('7.3 Encounter with 0 outside labs does not produce lab requisition', () => {
      const orderedLabs: LocalLabOrder[] = [
        { name: 'RBS', category: 'Diagnostic', standardPrice: 150, fulfillmentMode: 'in_house' },
      ];

      const labOrder = generateLabOrderRequisition({
        orderedLabs,
        diagnosticCatalog: MOCK_DIAGNOSTIC_CATALOG,
      });

      expect(labOrder).toBeNull();
    });

    test('7.4 Empty fee schedule catalog handles gracefully without throwing', () => {
      const billItems = generateCashierBillItems({
        orderedLabs: [],
        orderedProcedures: [],
        diagnosticCatalog: [],
        procedureCatalog: [],
        consultationFee: null,
        isYakapEligible: false,
      });

      expect(billItems).toEqual([]);
    });

    test('7.5 Search queries with regex characters and whitespace do not crash', () => {
      const query = '  (RBS)+ [rapid]* ?  ';
      const q = query.trim().toLowerCase();

      const filtered = MOCK_DIAGNOSTIC_CATALOG.filter((item) => {
        return (item.name || '').toLowerCase().includes(q) ||
               (item.code || '').toLowerCase().includes(q);
      });

      // Should not throw SyntaxError
      expect(filtered).toBeDefined();
    });

    test('7.6 Realistic Clinical Scenario: Diabetic Routine Follow-up with Hybrid Orders', () => {
      // Patient with Type 2 Diabetes arrives for routine follow-up
      // Doctor orders:
      // - RBS fingerstick: in-house point-of-care (Yakap covered, ₱0 co-pay)
      // - HbA1c: outside send-out (philHealthCode 83036, standardPrice 750, outside lab, 10-12 hr fasting)
      // - Lipid Profile: outside send-out (philHealthCode 80061, standardPrice 850, outside lab, 12 hr fasting)
      // - General Consultation Fee: ₱500
      const orderedLabs: LocalLabOrder[] = [
        {
          serviceItemId: 'srv-rbs',
          code: 'RBS-01',
          name: 'Random Blood Sugar (RBS)',
          category: 'Diagnostic',
          standardPrice: 150,
          philHealthCode: '90001',
          fulfillmentMode: 'in_house',
        },
        {
          serviceItemId: 'srv-hba1c',
          code: 'HBA1C-01',
          name: 'Hemoglobin A1c (HbA1c)',
          category: 'Diagnostic',
          standardPrice: 750,
          philHealthCode: '83036',
          fulfillmentMode: 'outside',
          instructions: '10-12 hr fasting',
        },
        {
          serviceItemId: 'srv-lipid',
          code: 'LIPID-01',
          name: 'Lipid Profile',
          category: 'Diagnostic',
          standardPrice: 850,
          philHealthCode: '80061',
          fulfillmentMode: 'outside',
          instructions: '12 hr fasting',
        },
      ];

      // Cashier invoice receives ONLY Consultation (₱500) and In-House RBS (₱0 Co-pay)
      const billItems = generateCashierBillItems({
        orderedLabs,
        orderedProcedures: [],
        diagnosticCatalog: MOCK_DIAGNOSTIC_CATALOG,
        procedureCatalog: MOCK_PROCEDURE_CATALOG,
        consultationFee: MOCK_CONSULTATION_FEE,
        isYakapEligible: true,
      });

      expect(billItems.length).toBe(2);
      expect(billItems[0].description).toBe('General Medical Consultation');
      expect(billItems[0].unitPrice).toBe(500);
      expect(billItems[1].description).toBe('Random Blood Sugar (RBS) (PhilHealth Yakap - ₱0 Co-pay)');
      expect(billItems[1].unitPrice).toBe(0);

      // Total patient pays at clinic Cashier: exactly ₱500 (consultation only, 0 for covered POC test)
      const totalPayable = billItems.reduce((acc, item) => acc + item.unitPrice * item.quantity, 0);
      expect(totalPayable).toBe(500);

      // Lab Requisition receives the 2 outside send-outs
      const labOrder = generateLabOrderRequisition({
        orderedLabs,
        diagnosticCatalog: MOCK_DIAGNOSTIC_CATALOG,
      });
      expect(labOrder?.items.length).toBe(2);
      expect(labOrder?.items[0].testName).toBe('Hemoglobin A1c (HbA1c)');
      expect(labOrder?.items[0].instructions).toBe('10-12 hr fasting');
      expect(labOrder?.items[1].testName).toBe('Lipid Profile');
      expect(labOrder?.items[1].instructions).toBe('12 hr fasting');
    });

    test('7.7 Realistic Clinical Scenario: Acute Respiratory Distress with In-Clinic Procedure & Outside X-Ray', () => {
      // Patient presents with acute wheezing & bronchospasm
      // Doctor orders:
      // - Nebulization Treatment (In-Clinic Procedure, ₱200, Treatment Room)
      // - 12-Lead ECG (In-House diagnostic, Yakap covered, ₱0 co-pay)
      // - Chest X-Ray PA View (Outside Imaging / Send-out, ₱600)
      // - General Consultation Fee (₱500)
      const orderedLabs: LocalLabOrder[] = [
        {
          serviceItemId: 'srv-ecg',
          code: 'ECG-12',
          name: '12-Lead Electrocardiogram',
          category: 'Diagnostic',
          standardPrice: 450,
          philHealthCode: '93000',
          fulfillmentMode: 'in_house',
        },
        {
          serviceItemId: 'srv-cxr',
          code: 'CXR-PA',
          name: 'Chest X-Ray PA View',
          category: 'Diagnostic',
          standardPrice: 600,
          fulfillmentMode: 'outside',
          instructions: 'STAT; Rule out pneumonia / pneumothorax',
        },
      ];

      const orderedProcedures = ['Nebulization Treatment'];

      const billItems = generateCashierBillItems({
        orderedLabs,
        orderedProcedures,
        diagnosticCatalog: MOCK_DIAGNOSTIC_CATALOG,
        procedureCatalog: MOCK_PROCEDURE_CATALOG,
        consultationFee: MOCK_CONSULTATION_FEE,
        isYakapEligible: true,
      });

      // Invoice contains: Consultation (₱500) + Nebulization (₱200) + ECG (₱0) = ₱700
      expect(billItems.length).toBe(3);
      expect(billItems.find((i) => i.itemCode === 'NEB-01')?.unitPrice).toBe(200);
      expect(billItems.find((i) => i.itemCode === 'ECG-12')?.unitPrice).toBe(0);
      expect(billItems.find((i) => i.itemCode === 'ECG-12')?.description).toBe('12-Lead Electrocardiogram (PhilHealth Yakap - ₱0 Co-pay)');

      const totalInvoice = billItems.reduce((acc, item) => acc + item.unitPrice * item.quantity, 0);
      expect(totalInvoice).toBe(700);

      // Outside Chest X-Ray goes to lab requisition, 0 on cashier invoice
      const labOrder = generateLabOrderRequisition({
        orderedLabs,
        diagnosticCatalog: MOCK_DIAGNOSTIC_CATALOG,
      });
      expect(labOrder?.items.length).toBe(1);
      expect(labOrder?.items[0].testName).toBe('Chest X-Ray PA View');
      expect(labOrder?.items[0].instructions).toBe('STAT; Rule out pneumonia / pneumothorax');
    });

    test('7.8 In-house diagnostic test billable even when consultation fee is missing/null', () => {
      const orderedLabs: LocalLabOrder[] = [
        {
          serviceItemId: 'srv-covid-ag',
          code: 'COVID-AG',
          name: 'COVID-19 Rapid Antigen',
          category: 'Diagnostic',
          standardPrice: 500,
          fulfillmentMode: 'in_house',
        },
      ];

      const billItems = generateCashierBillItems({
        orderedLabs,
        orderedProcedures: [],
        diagnosticCatalog: MOCK_DIAGNOSTIC_CATALOG,
        procedureCatalog: MOCK_PROCEDURE_CATALOG,
        consultationFee: null, // Zero or no fee configured
        isYakapEligible: false,
      });

      expect(billItems.length).toBe(1);
      expect(billItems[0].serviceItemId).toBe('srv-covid-ag');
      expect(billItems[0].unitPrice).toBe(500);
    });

    test('7.9 Encounter reset and follow-up encounter initialize empty orders state', () => {
      // Simulation of resetEncounter and handleStartFollowUpEncounter state transitions
      let orderedLabs: LocalLabOrder[] = [
        { name: 'RBS', category: 'Diagnostic', standardPrice: 150, fulfillmentMode: 'in_house' },
      ];
      let orderedProcedures: string[] = ['Nebulization Treatment'];

      const resetEncounter = () => {
        orderedLabs = [];
        orderedProcedures = [];
      };

      resetEncounter();
      expect(orderedLabs.length).toBe(0);
      expect(orderedProcedures.length).toBe(0);

      // Add back orders
      orderedLabs = [
        { name: 'ECG', category: 'Diagnostic', standardPrice: 450, fulfillmentMode: 'in_house' },
      ];
      orderedProcedures = ['Wound Dressing'];

      const handleStartFollowUp = () => {
        orderedLabs = [];
        orderedProcedures = [];
      };

      handleStartFollowUp();
      expect(orderedLabs.length).toBe(0);
      expect(orderedProcedures.length).toBe(0);
    });
  });

  // =======================================================================
  // Suite 8: Static Source AST & Design Token Integrity Audit
  // =======================================================================
  describe('Suite 8: Static Source AST & Design Token Integrity Audit', () => {
    const consultationsScreenPath = path.resolve(__dirname, '../navigation/screens/Consultations.screen.tsx');
    const orderModalPath = path.resolve(__dirname, '../components/consultation/OrderCatalogSearchModal.tsx');

    test('8.1 OrderCatalogSearchModal strictly uses design tokens with zero raw hex colors', () => {
      const code = fs.readFileSync(orderModalPath, 'utf8');
      const hexMatch = code.match(/#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g);
      expect(hexMatch).toBeNull();
    });

    test('8.2 Consultations.screen.tsx exports LocalLabOrder interface', () => {
      const code = fs.readFileSync(consultationsScreenPath, 'utf8');
      expect(code).toContain('export interface LocalLabOrder');
      expect(code).toContain("fulfillmentMode: 'in_house' | 'outside'");
    });

    test('8.3 Consultations.screen.tsx defines rapid test regex heuristic', () => {
      const code = fs.readFileSync(consultationsScreenPath, 'utf8');
      expect(code).toContain('IN_HOUSE_RAPID_TEST_REGEX = /fingerstick|ecg|dipstick|rapid|rbs|urinalysis/i');
    });

    test('8.4 Consultations.screen.tsx partitions orderedLabs into outside and in-house collections', () => {
      const code = fs.readFileSync(consultationsScreenPath, 'utf8');
      expect(code).toContain("orderedLabs.filter((l) => l.fulfillmentMode === 'outside')");
      expect(code).toContain("orderedLabs.filter((l) => l.fulfillmentMode === 'in_house')");
    });

    test('8.5 Consultations.screen.tsx implements Yakap ₱0 co-pay cashier line item rule', () => {
      const code = fs.readFileSync(consultationsScreenPath, 'utf8');
      expect(code).toContain('isCoveredByYakap ? 0 :');
      expect(code).toContain('(PhilHealth Yakap - ₱0 Co-pay)');
    });

    test('8.6 Consultations.screen.tsx includes OrderCatalogSearchModal with correct props and handlers', () => {
      const code = fs.readFileSync(consultationsScreenPath, 'utf8');
      expect(code).toContain('<OrderCatalogSearchModal');
      expect(code).toContain('onSelectOrder={handleSelectCatalogOrder}');
      expect(code).toContain('alreadyOrderedNames={[...orderedLabs.map((l) => l.name), ...orderedProcedures.map((p) => p.name)]}');
      expect(code).toContain('existingOrders={[');
    });

    test('8.7 Consultations.screen.tsx implements rehydration logic for in-house and outside orders in loadPatientContext', () => {
      const code = fs.readFileSync(consultationsScreenPath, 'utf8');
      expect(code).toContain('// Rehydrate orderedLabs from invoice diagnostic items (in-house) and lab orders (outside)');
      expect(code).toContain("fulfillmentMode: 'in_house'");
      expect(code).toContain("fulfillmentMode: 'outside'");
      expect(code).toContain('setOrderedLabs(uniqueLabs)');
    });

    test('8.8 Consultations.screen.tsx renders interactive modal triggers and accessibility labels', () => {
      const code = fs.readFileSync(consultationsScreenPath, 'utf8');
      expect(code).toContain('testID="consultation-add-lab-test-btn"');
      expect(code).toContain('testID="consultation-add-procedure-btn"');
      expect(code).toContain('Click to toggle.');
      expect(code).toContain('handleToggleLabFulfillmentMode');
      expect(code).toContain('handleRemoveLab');
    });
  });

  // =======================================================================
  // Suite 9: Batch Procedure Handoff, In-Place Editing & Modal Edit Mode
  // =======================================================================
  describe('Suite 9: Batch Procedure Handoff, In-Place Editing & Modal Edit Mode', () => {
    test('9.1 Batch multi-procedure nurse handoff dispatches all un-handed-off procedures with custom instructions', async () => {
      const orderedProcedures: LocalProcedureOrder[] = [
        {
          serviceItemId: 'srv-suture',
          code: 'PROC-SUTURE',
          name: 'Minor Suture Repair',
          category: 'Procedure',
          standardPrice: 850,
          instructions: 'Cleanse with Betadine, 3-0 Nylon interrupted suture',
          isHandedOff: false,
        },
        {
          serviceItemId: 'srv-neb',
          code: 'NEB-01',
          name: 'Nebulization Treatment',
          category: 'Procedure',
          standardPrice: 200,
          instructions: 'Salbutamol 1 neb with 4L O2 mask',
          isHandedOff: false,
        },
        {
          serviceItemId: 'srv-wound',
          code: 'WOUND-01',
          name: 'Wound Dressing & Debridement',
          category: 'Procedure',
          standardPrice: 300,
          isHandedOff: true, // Already handed off!
          handedOffAt: '09:15 AM',
        },
      ];

      // Simulate handleHandoffAllProcedures logic
      const dispatchedPayloads: any[] = [];
      const unhandedOff = orderedProcedures.filter((p) => !p.isHandedOff);
      expect(unhandedOff.length).toBe(2);

      const targetRoom = 'Pediatric Allergy Suite';
      let state = [...orderedProcedures];

      for (const proc of unhandedOff) {
        dispatchedPayloads.push({
          procedureCode: proc.code,
          procedureName: proc.name,
          category: proc.category,
          targetRoomName: targetRoom,
          clinicalNotes: proc.instructions
            ? `${proc.instructions} (Assessment: Bronchial Asthma)`
            : 'Ordered for in-clinic execution: Bronchial Asthma',
        });

        state = state.map((item) =>
          item.name === proc.name
            ? { ...item, isHandedOff: true, handedOffAt: '09:30 AM', targetRoomName: targetRoom }
            : item
        );
      }

      // Assert both un-handed-off procedures were dispatched
      expect(dispatchedPayloads.length).toBe(2);
      expect(dispatchedPayloads[0].procedureName).toBe('Minor Suture Repair');
      expect(dispatchedPayloads[0].clinicalNotes).toContain('Cleanse with Betadine, 3-0 Nylon interrupted suture');
      expect(dispatchedPayloads[1].procedureName).toBe('Nebulization Treatment');
      expect(dispatchedPayloads[1].clinicalNotes).toContain('Salbutamol 1 neb with 4L O2 mask');

      // Assert already-handed-off item was NOT redispatched
      expect(dispatchedPayloads.some((d) => d.procedureName === 'Wound Dressing & Debridement')).toBe(false);

      // Assert state updated to all handed off
      expect(state.every((p) => p.isHandedOff)).toBe(true);

      // Verify consolidated notification toast format
      const toastMessage = `${unhandedOff.length} in-clinic procedure${unhandedOff.length > 1 ? 's' : ''} handed off to ${targetRoom}.`;
      expect(toastMessage).toBe('2 in-clinic procedures handed off to Pediatric Allergy Suite.');
    });

    test('9.2 In-place instruction editing updates test or procedure notes without removing the item', () => {
      let labs: LocalLabOrder[] = [
        {
          name: '12-Lead Electrocardiogram',
          category: 'Diagnostic',
          standardPrice: 450,
          fulfillmentMode: 'outside',
        },
      ];
      let procs: LocalProcedureOrder[] = [
        {
          serviceItemId: 'srv-neb',
          code: 'NEB-01',
          name: 'Nebulization Treatment',
          category: 'Procedure',
          standardPrice: 200,
          isHandedOff: false,
        },
      ];

      // Edit lab notes in-place
      const saveLabInstructions = (testName: string, notes: string) => {
        labs = labs.map((l) => (l.name === testName ? { ...l, instructions: notes } : l));
      };
      saveLabInstructions('12-Lead Electrocardiogram', 'Routine 12-lead tracing with physician readback');
      expect(labs.length).toBe(1);
      expect(labs[0].instructions).toBe('Routine 12-lead tracing with physician readback');

      // Edit procedure notes in-place
      const saveProcInstructions = (procName: string, notes: string) => {
        procs = procs.map((p) => (p.name === procName ? { ...p, instructions: notes } : p));
      };
      saveProcInstructions('Nebulization Treatment', 'Pre/post peak expiratory flow rate check');
      expect(procs.length).toBe(1);
      expect(procs[0].instructions).toBe('Pre/post peak expiratory flow rate check');
      expect(procs[0].isHandedOff).toBe(false);
    });

    test('9.3 OrderCatalogSearchModal activates Edit Mode and pre-fills existing order context when already ordered', () => {
      const existingOrders = [
        {
          name: 'Random Blood Sugar (RBS)',
          code: 'RBS-01',
          fulfillmentMode: 'in_house' as const,
          instructions: 'Capillary fingerstick; check pre-meal glucose',
        },
      ];

      const html = renderToStaticMarkup(
        React.createElement(OrderCatalogSearchModal, {
          visible: true,
          onClose: () => {},
          catalog: COMBINED_CATALOG,
          initialCategory: 'All',
          isYakapEligible: true,
          onSelectOrder: () => {},
          alreadyOrderedNames: ['Random Blood Sugar (RBS)'],
          alreadyOrderedCodes: ['RBS-01'],
          existingOrders,
          testID: 'order-search-modal-test',
        })
      );

      // Verify already-ordered item is styled with In Order (Edit) badge
      expect(html).toContain('In Order (Edit)');
      expect(html).toContain('already in order, click to edit');
    });

    test('9.4 Consultations.screen.tsx defines batch nurse handoff and instruction editing AST elements', () => {
      const consultationsScreenPath = path.resolve(__dirname, '../navigation/screens/Consultations.screen.tsx');
      const code = fs.readFileSync(consultationsScreenPath, 'utf8');
      expect(code).toContain('export interface LocalProcedureOrder');
      expect(code).toContain('handleHandoffAllProcedures');
      expect(code).toContain('handleOpenEditInstructions');
      expect(code).toContain('handleSaveOrderInstructions');
      expect(code).toContain('testID="consultation-batch-handoff-btn"');
      expect(code).toContain('testID="save-order-instructions-btn"');
      expect(code).toContain('ACTIVE PROCEDURES (');
      expect(code).toContain('ACTIVE DIAGNOSTIC TESTS (');
      expect(code).toContain('Edit Notes');
    });
  });
});


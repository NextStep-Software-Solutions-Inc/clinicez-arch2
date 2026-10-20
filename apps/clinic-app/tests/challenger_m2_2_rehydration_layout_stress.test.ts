// token-guard:ignore-file
import { describe, expect, test, mock, beforeEach } from 'bun:test';
import fs from 'fs';
import path from 'path';

(globalThis as any).__DEV__ = true;

// Mock React Native modules for Bun environment
mock.module('react-native', () => ({
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
  RefreshControl: 'RefreshControl',
  Dimensions: { get: () => ({ width: 1280, height: 800 }), addEventListener: () => ({ remove: () => {} }) },
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
  Linking: { openURL: () => Promise.resolve(), canOpenURL: () => Promise.resolve(true) },
  PanResponder: { create: () => ({ panHandlers: {} }) },
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

mock.module('@expo-google-fonts/geist', () => ({
  useFonts: () => [true],
}));

mock.module('@expo-google-fonts/geist-mono', () => ({
  useFonts: () => [true],
}));

import type { LocalLabOrder } from '../navigation/screens/Consultations.screen';
import type { ClinicServiceItem } from '../services/clinicService';

// Reference implementation of rehydration algorithm from Consultations.screen.tsx
function simulateRehydration(params: {
  existingEncounter: { id?: string; queueItemId?: string };
  p: { id: string; patientId: string };
  chartData: {
    invoicesHistory?: Array<{
      id: string;
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
      id: string;
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
      id: string;
      consultationId?: string;
      queueItemId?: string;
      procedureName: string;
    }>;
  };
  diagnosticCatalog: ClinicServiceItem[];
}): { rehydratedLabs: LocalLabOrder[]; rehydratedProcedures: string[] } {
  const { existingEncounter, p, chartData, diagnosticCatalog } = params;

  const rehydratedLabs: LocalLabOrder[] = [];
  const existingInvoice = chartData.invoicesHistory?.find(
    (inv) =>
      (existingEncounter.id && inv.consultationId === existingEncounter.id) ||
      (p.id && inv.queueItemId === p.id)
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
      (p.id && (lo as any).queueItemId === p.id)
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

  // Rehydrate orderedProcedures from proceduresHistory and invoice line items
  const existingProcedures = chartData.proceduresHistory?.filter(
    (proc) =>
      (existingEncounter.id && proc.consultationId === existingEncounter.id) ||
      (p.id && proc.queueItemId === p.id)
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

describe('Challenger M2-2: Adversarial Rehydration & Workstation Layout Stress Suite', () => {
  const MOCK_CATALOG: ClinicServiceItem[] = [
    {
      id: 'cat-ecg-01',
      code: 'ECG-12L',
      name: '12-Lead Electrocardiogram',
      category: 'Diagnostic',
      standardPrice: 350,
      philHealthCode: '93000',
      isActive: true,
    },
    {
      id: 'cat-rbs-02',
      code: 'RBS-POC',
      name: 'Random Blood Sugar (Fingerstick)',
      category: 'Diagnostic',
      standardPrice: 150,
      philHealthCode: '82948',
      isActive: true,
    },
    {
      id: 'cat-cbc-03',
      code: 'CBC-AUTO',
      name: 'Complete Blood Count with Platelet',
      category: 'Diagnostic',
      standardPrice: 280,
      philHealthCode: '85025',
      isActive: true,
    },
    {
      id: 'cat-ua-04',
      code: 'URINE-DIP',
      name: 'Urinalysis Rapid Dipstick',
      category: 'Diagnostic',
      standardPrice: 120,
      philHealthCode: '81002',
      isActive: true,
    },
    {
      id: 'cat-lip-05',
      code: 'LIPID-PANEL',
      name: 'Lipid Profile',
      category: 'Diagnostic',
      standardPrice: 650,
      philHealthCode: '80061',
      isActive: true,
    },
  ];

  // =========================================================================
  // SUITE 1: In-House Diagnostic Tests Rehydration (invoicesHistory)
  // =========================================================================
  describe('Suite 1: In-House Diagnostic Tests Rehydration from invoicesHistory', () => {
    test('1.1 Rehydrates in-house diagnostic tests matching by serviceItemId with fulfillmentMode in_house', () => {
      const result = simulateRehydration({
        existingEncounter: { id: 'enc-101', queueItemId: 'q-101' },
        p: { id: 'q-101', patientId: 'pat-101' },
        chartData: {
          invoicesHistory: [
            {
              id: 'inv-101',
              consultationId: 'enc-101',
              queueItemId: 'q-101',
              lineItems: [
                {
                  serviceItemId: 'cat-ecg-01',
                  itemCode: 'ECG-12L',
                  description: '12-Lead Electrocardiogram',
                  category: 'Diagnostic',
                  unitPrice: 350,
                },
              ],
            },
          ],
        },
        diagnosticCatalog: MOCK_CATALOG,
      });

      expect(result.rehydratedLabs.length).toBe(1);
      const ecg = result.rehydratedLabs[0];
      expect(ecg.name).toBe('12-Lead Electrocardiogram');
      expect(ecg.fulfillmentMode).toBe('in_house');
      expect(ecg.serviceItemId).toBe('cat-ecg-01');
      expect(ecg.code).toBe('ECG-12L');
      expect(ecg.standardPrice).toBe(350);
      expect(ecg.philHealthCode).toBe('93000');
    });

    test('1.2 Strips PhilHealth Yakap annotation and restores fee schedule standard price', () => {
      const result = simulateRehydration({
        existingEncounter: { id: 'enc-102', queueItemId: 'q-102' },
        p: { id: 'q-102', patientId: 'pat-102' },
        chartData: {
          invoicesHistory: [
            {
              id: 'inv-102',
              consultationId: 'enc-102',
              queueItemId: 'q-102',
              lineItems: [
                {
                  description: 'Random Blood Sugar (Fingerstick) (PhilHealth Yakap - ₱0 Co-pay)',
                  category: 'Diagnostic',
                  unitPrice: 0, // Billed at ₱0 to patient
                },
              ],
            },
          ],
        },
        diagnosticCatalog: MOCK_CATALOG,
      });

      expect(result.rehydratedLabs.length).toBe(1);
      const rbs = result.rehydratedLabs[0];
      expect(rbs.name).toBe('Random Blood Sugar (Fingerstick)');
      expect(rbs.fulfillmentMode).toBe('in_house');
      // Standard price restored from fee schedule (150) rather than 0
      expect(rbs.standardPrice).toBe(150);
      expect(rbs.philHealthCode).toBe('82948');
    });

    test('1.3 Case-insensitive category check filters diagnostic items while ignoring medications and consultation fee', () => {
      const result = simulateRehydration({
        existingEncounter: { id: 'enc-103', queueItemId: 'q-103' },
        p: { id: 'q-103', patientId: 'pat-103' },
        chartData: {
          invoicesHistory: [
            {
              id: 'inv-103',
              consultationId: 'enc-103',
              lineItems: [
                { description: 'Standard General Consultation', category: 'Consultation', unitPrice: 500 },
                { description: 'Urinalysis Rapid Dipstick', category: 'diagnostic', unitPrice: 120 },
                { description: 'Amoxicillin 500mg Capsule', category: 'Medication', unitPrice: 15 },
              ],
            },
          ],
        },
        diagnosticCatalog: MOCK_CATALOG,
      });

      expect(result.rehydratedLabs.length).toBe(1);
      expect(result.rehydratedLabs[0].name).toBe('Urinalysis Rapid Dipstick');
      expect(result.rehydratedLabs[0].fulfillmentMode).toBe('in_house');
    });

    test('1.4 Falls back gracefully when diagnostic item is not present in clinic fee schedule catalog', () => {
      const result = simulateRehydration({
        existingEncounter: { id: 'enc-104', queueItemId: 'q-104' },
        p: { id: 'q-104', patientId: 'pat-104' },
        chartData: {
          invoicesHistory: [
            {
              id: 'inv-104',
              consultationId: 'enc-104',
              lineItems: [
                {
                  serviceItemId: 'custom-rapid-test-99',
                  description: 'Specialty Dengue NS1 Rapid Antigen',
                  category: 'Diagnostic',
                  unitPrice: 450,
                },
              ],
            },
          ],
        },
        diagnosticCatalog: MOCK_CATALOG,
      });

      expect(result.rehydratedLabs.length).toBe(1);
      const dengue = result.rehydratedLabs[0];
      expect(dengue.name).toBe('Specialty Dengue NS1 Rapid Antigen');
      expect(dengue.fulfillmentMode).toBe('in_house');
      expect(dengue.standardPrice).toBe(450);
      expect(dengue.serviceItemId).toBe('custom-rapid-test-99');
    });
  });

  // =========================================================================
  // SUITE 2: Outside Laboratory Orders Rehydration (labOrdersHistory)
  // =========================================================================
  describe('Suite 2: Outside Laboratory Orders Rehydration from labOrdersHistory', () => {
    test('2.1 Rehydrates multi-item lab orders with fulfillmentMode outside and preserves clinical instructions', () => {
      const result = simulateRehydration({
        existingEncounter: { id: 'enc-201', queueItemId: 'q-201' },
        p: { id: 'q-201', patientId: 'pat-201' },
        chartData: {
          labOrdersHistory: [
            {
              id: 'lo-201',
              consultationId: 'enc-201',
              queueItemId: 'q-201',
              items: [
                {
                  testName: 'Complete Blood Count with Platelet',
                  category: 'Hematology',
                  instructions: 'Fasting not required; purple top EDTA',
                },
                {
                  testName: 'Lipid Profile',
                  category: 'Clinical Chemistry',
                  instructions: 'Strict 10-12 hours fasting; plain red top',
                },
              ],
            },
          ],
        },
        diagnosticCatalog: MOCK_CATALOG,
      });

      expect(result.rehydratedLabs.length).toBe(2);

      const cbc = result.rehydratedLabs[0];
      expect(cbc.name).toBe('Complete Blood Count with Platelet');
      expect(cbc.fulfillmentMode).toBe('outside');
      expect(cbc.instructions).toBe('Fasting not required; purple top EDTA');
      expect(cbc.philHealthCode).toBe('85025');
      expect(cbc.standardPrice).toBe(280);

      const lipid = result.rehydratedLabs[1];
      expect(lipid.name).toBe('Lipid Profile');
      expect(lipid.fulfillmentMode).toBe('outside');
      expect(lipid.instructions).toBe('Strict 10-12 hours fasting; plain red top');
      expect(lipid.philHealthCode).toBe('80061');
      expect(lipid.standardPrice).toBe(650);
    });

    test('2.2 Rehydrates legacy single-item lab orders (lo.testName) with notes mapped to instructions', () => {
      const result = simulateRehydration({
        existingEncounter: { id: 'enc-202', queueItemId: 'q-202' },
        p: { id: 'q-202', patientId: 'pat-202' },
        chartData: {
          labOrdersHistory: [
            {
              id: 'lo-202',
              consultationId: 'enc-202',
              testName: 'Complete Blood Count with Platelet',
              notes: 'Stat outside send-out requisition',
            },
          ],
        },
        diagnosticCatalog: MOCK_CATALOG,
      });

      expect(result.rehydratedLabs.length).toBe(1);
      const cbc = result.rehydratedLabs[0];
      expect(cbc.name).toBe('Complete Blood Count with Platelet');
      expect(cbc.fulfillmentMode).toBe('outside');
      expect(cbc.instructions).toBe('Stat outside send-out requisition');
    });

    test('2.3 Outside test not found in catalog defaults to price 0 and category Diagnostic', () => {
      const result = simulateRehydration({
        existingEncounter: { id: 'enc-203', queueItemId: 'q-203' },
        p: { id: 'q-203', patientId: 'pat-203' },
        chartData: {
          labOrdersHistory: [
            {
              id: 'lo-203',
              consultationId: 'enc-203',
              testName: 'Serum Ferritin Send-Out',
              notes: 'Send to Reference Lab',
            },
          ],
        },
        diagnosticCatalog: MOCK_CATALOG,
      });

      expect(result.rehydratedLabs.length).toBe(1);
      const ferritin = result.rehydratedLabs[0];
      expect(ferritin.name).toBe('Serum Ferritin Send-Out');
      expect(ferritin.fulfillmentMode).toBe('outside');
      expect(ferritin.standardPrice).toBe(0);
      expect(ferritin.category).toBe('Diagnostic');
      expect(ferritin.instructions).toBe('Send to Reference Lab');
    });

    test('2.4 Strictly ignores lab orders belonging to other consultations or patients', () => {
      const result = simulateRehydration({
        existingEncounter: { id: 'enc-active', queueItemId: 'q-active' },
        p: { id: 'q-active', patientId: 'pat-active' },
        chartData: {
          labOrdersHistory: [
            {
              id: 'lo-other-1',
              consultationId: 'enc-DIFFERENT-999',
              queueItemId: 'q-DIFFERENT-999',
              testName: 'Complete Blood Count with Platelet',
            },
          ],
        },
        diagnosticCatalog: MOCK_CATALOG,
      });

      expect(result.rehydratedLabs.length).toBe(0);
    });
  });

  // =========================================================================
  // SUITE 3: Dual Fulfillment Integration, Partitioning & Deduplication
  // =========================================================================
  describe('Suite 3: Dual Fulfillment Integration, Partitioning & Deduplication', () => {
    test('3.1 Encounter with BOTH in-house diagnostic tests AND outside lab orders accurately populates both with correct fulfillmentMode', () => {
      const result = simulateRehydration({
        existingEncounter: { id: 'enc-dual-01', queueItemId: 'q-dual-01' },
        p: { id: 'q-dual-01', patientId: 'pat-dual-01' },
        chartData: {
          invoicesHistory: [
            {
              id: 'inv-dual-01',
              consultationId: 'enc-dual-01',
              queueItemId: 'q-dual-01',
              lineItems: [
                {
                  serviceItemId: 'cat-rbs-02',
                  itemCode: 'RBS-POC',
                  description: 'Random Blood Sugar (Fingerstick) (PhilHealth Yakap - ₱0 Co-pay)',
                  category: 'Diagnostic',
                  unitPrice: 0,
                },
                {
                  serviceItemId: 'cat-ecg-01',
                  itemCode: 'ECG-12L',
                  description: '12-Lead Electrocardiogram',
                  category: 'Diagnostic',
                  unitPrice: 350,
                },
              ],
            },
          ],
          labOrdersHistory: [
            {
              id: 'lo-dual-01',
              consultationId: 'enc-dual-01',
              queueItemId: 'q-dual-01',
              items: [
                {
                  testName: 'Complete Blood Count with Platelet',
                  category: 'Diagnostic',
                  instructions: 'Routine CBC',
                },
                {
                  testName: 'Lipid Profile',
                  category: 'Diagnostic',
                  instructions: '10 hr fasting',
                },
              ],
            },
          ],
        },
        diagnosticCatalog: MOCK_CATALOG,
      });

      expect(result.rehydratedLabs.length).toBe(4);

      const inHouseLabs = result.rehydratedLabs.filter((l) => l.fulfillmentMode === 'in_house');
      const outsideLabs = result.rehydratedLabs.filter((l) => l.fulfillmentMode === 'outside');

      expect(inHouseLabs.length).toBe(2);
      expect(outsideLabs.length).toBe(2);

      expect(inHouseLabs.map((l) => l.name)).toEqual([
        'Random Blood Sugar (Fingerstick)',
        '12-Lead Electrocardiogram',
      ]);
      expect(outsideLabs.map((l) => l.name)).toEqual([
        'Complete Blood Count with Platelet',
        'Lipid Profile',
      ]);
    });

    test('3.2 Encounter with ONLY invoice diagnostic items and NO lab orders produces in_house tests only', () => {
      const result = simulateRehydration({
        existingEncounter: { id: 'enc-invoice-only', queueItemId: 'q-inv' },
        p: { id: 'q-inv', patientId: 'pat-inv' },
        chartData: {
          invoicesHistory: [
            {
              id: 'inv-single',
              consultationId: 'enc-invoice-only',
              lineItems: [
                {
                  serviceItemId: 'cat-ecg-01',
                  description: '12-Lead Electrocardiogram',
                  category: 'Diagnostic',
                  unitPrice: 350,
                },
              ],
            },
          ],
          labOrdersHistory: [],
        },
        diagnosticCatalog: MOCK_CATALOG,
      });

      expect(result.rehydratedLabs.length).toBe(1);
      expect(result.rehydratedLabs[0].fulfillmentMode).toBe('in_house');
      expect(result.rehydratedLabs[0].name).toBe('12-Lead Electrocardiogram');
    });

    test('3.3 Encounter with ONLY outside lab orders and NO invoice produces outside tests only', () => {
      const result = simulateRehydration({
        existingEncounter: { id: 'enc-lab-only', queueItemId: 'q-lab' },
        p: { id: 'q-lab', patientId: 'pat-lab' },
        chartData: {
          invoicesHistory: [],
          labOrdersHistory: [
            {
              id: 'lo-single',
              consultationId: 'enc-lab-only',
              items: [
                {
                  testName: 'Lipid Profile',
                  category: 'Diagnostic',
                  instructions: 'Fasting required',
                },
              ],
            },
          ],
        },
        diagnosticCatalog: MOCK_CATALOG,
      });

      expect(result.rehydratedLabs.length).toBe(1);
      expect(result.rehydratedLabs[0].fulfillmentMode).toBe('outside');
      expect(result.rehydratedLabs[0].name).toBe('Lipid Profile');
      expect(result.rehydratedLabs[0].instructions).toBe('Fasting required');
    });

    test('3.4 Deduplication: Retains first occurrence when duplicate names appear with case-insensitivity', () => {
      const result = simulateRehydration({
        existingEncounter: { id: 'enc-dedup', queueItemId: 'q-dedup' },
        p: { id: 'q-dedup', patientId: 'pat-dedup' },
        chartData: {
          invoicesHistory: [
            {
              id: 'inv-dedup',
              consultationId: 'enc-dedup',
              lineItems: [
                {
                  description: '12-Lead Electrocardiogram',
                  category: 'Diagnostic',
                  unitPrice: 350,
                },
                // Duplicate entry in invoice with different casing
                {
                  description: '12-lead electrocardiogram',
                  category: 'Diagnostic',
                  unitPrice: 350,
                },
              ],
            },
          ],
          labOrdersHistory: [
            {
              id: 'lo-dedup',
              consultationId: 'enc-dedup',
              items: [
                // Duplicate name in outside lab order
                {
                  testName: '12-Lead Electrocardiogram',
                  category: 'Diagnostic',
                },
              ],
            },
          ],
        },
        diagnosticCatalog: MOCK_CATALOG,
      });

      expect(result.rehydratedLabs.length).toBe(1);
      expect(result.rehydratedLabs[0].name).toBe('12-Lead Electrocardiogram');
      expect(result.rehydratedLabs[0].fulfillmentMode).toBe('in_house'); // In-house appeared first
    });

    test('3.5 Missing or empty chart history arrays do not crash or throw unhandled exceptions', () => {
      expect(() =>
        simulateRehydration({
          existingEncounter: { id: 'enc-empty', queueItemId: 'q-empty' },
          p: { id: 'q-empty', patientId: 'pat-empty' },
          chartData: {},
          diagnosticCatalog: MOCK_CATALOG,
        })
      ).not.toThrow();

      const result = simulateRehydration({
        existingEncounter: { id: 'enc-empty', queueItemId: 'q-empty' },
        p: { id: 'q-empty', patientId: 'pat-empty' },
        chartData: {},
        diagnosticCatalog: MOCK_CATALOG,
      });

      expect(result.rehydratedLabs).toEqual([]);
      expect(result.rehydratedProcedures).toEqual([]);
    });
  });

  // =========================================================================
  // SUITE 4: In-Clinic Procedures Rehydration
  // =========================================================================
  describe('Suite 4: In-Clinic Procedures Rehydration from proceduresHistory and Invoices', () => {
    test('4.1 Rehydrates procedures from proceduresHistory matching consultationId and queueItemId', () => {
      const result = simulateRehydration({
        existingEncounter: { id: 'enc-proc-01', queueItemId: 'q-proc-01' },
        p: { id: 'q-proc-01', patientId: 'pat-proc-01' },
        chartData: {
          proceduresHistory: [
            {
              id: 'proc-1',
              consultationId: 'enc-proc-01',
              procedureName: 'Nebulization Therapy',
            },
            {
              id: 'proc-2',
              queueItemId: 'q-proc-01',
              procedureName: 'Wound Dressing & Debridement',
            },
            {
              id: 'proc-unrelated',
              consultationId: 'enc-OTHER-888',
              procedureName: 'Ear Irrigation',
            },
          ],
        },
        diagnosticCatalog: MOCK_CATALOG,
      });

      expect(result.rehydratedProcedures).toEqual([
        'Nebulization Therapy',
        'Wound Dressing & Debridement',
      ]);
    });

    test('4.2 Rehydrates procedures from invoice line items matching procedure or nursingservice category', () => {
      const result = simulateRehydration({
        existingEncounter: { id: 'enc-proc-02', queueItemId: 'q-proc-02' },
        p: { id: 'q-proc-02', patientId: 'pat-proc-02' },
        chartData: {
          invoicesHistory: [
            {
              id: 'inv-proc-02',
              consultationId: 'enc-proc-02',
              lineItems: [
                { description: 'Nebulization Therapy', category: 'Procedure', unitPrice: 200 },
                { description: 'IV Cannulation & Infusion', category: 'nursingservice', unitPrice: 150 },
                { description: 'Amoxicillin 500mg', category: 'Medication', unitPrice: 15 },
                { description: '12-Lead Electrocardiogram', category: 'Diagnostic', unitPrice: 350 },
              ],
            },
          ],
        },
        diagnosticCatalog: MOCK_CATALOG,
      });

      expect(result.rehydratedProcedures).toEqual([
        'Nebulization Therapy',
        'IV Cannulation & Infusion',
      ]);
    });

    test('4.3 Deduplicates procedures appearing in both proceduresHistory and invoice line items', () => {
      const result = simulateRehydration({
        existingEncounter: { id: 'enc-proc-03', queueItemId: 'q-proc-03' },
        p: { id: 'q-proc-03', patientId: 'pat-proc-03' },
        chartData: {
          proceduresHistory: [
            { id: 'proc-dup-1', consultationId: 'enc-proc-03', procedureName: 'Nebulization Therapy' },
            { id: 'proc-dup-2', consultationId: 'enc-proc-03', procedureName: 'Suture Removal' },
          ],
          invoicesHistory: [
            {
              id: 'inv-proc-03',
              consultationId: 'enc-proc-03',
              lineItems: [
                { description: 'Nebulization Therapy', category: 'Procedure', unitPrice: 200 },
                { description: 'Wound Dressing', category: 'Procedure', unitPrice: 100 },
              ],
            },
          ],
        },
        diagnosticCatalog: MOCK_CATALOG,
      });

      expect(result.rehydratedProcedures.length).toBe(3);
      expect(result.rehydratedProcedures).toContain('Nebulization Therapy');
      expect(result.rehydratedProcedures).toContain('Suture Removal');
      expect(result.rehydratedProcedures).toContain('Wound Dressing');
    });
  });

  // =========================================================================
  // SUITE 5: Reopening Signed Encounter — UI & Action Lockout Resilience
  // =========================================================================
  describe('Suite 5: Reopening Signed Encounter — UI & Action Lockout Resilience', () => {
    const consultationScreenPath = path.resolve(__dirname, '../navigation/screens/Consultations.screen.tsx');
    const sourceCode = fs.readFileSync(consultationScreenPath, 'utf8');

    test('5.1 "Add test" button is conditionally rendered only when !isSigned', () => {
      const addTestPattern = /rightAction=\{\s*!isSigned\s*\?\s*\(\s*<Button[^>]*title="(\+\s*)?Add test"/;
      expect(addTestPattern.test(sourceCode)).toBe(true);
    });

    test('5.2 "Add procedure" button is conditionally rendered only when !isSigned', () => {
      const addProcPattern = /rightAction=\{\s*!isSigned\s*\?\s*\(\s*<Button[^>]*title="(\+\s*)?Add procedure"/;
      expect(addProcPattern.test(sourceCode)).toBe(true);
    });

    test('5.3 Lab fulfillment mode toggle Pressable is disabled when isSigned is true', () => {
      const togglePressablePattern = /accessibilityLabel=\{`Fulfillment mode: \$\{isInHouse \? 'In-House' : 'Outside Lab'\}\. Click to toggle\.\`\}\s*disabled=\{isSigned\}/;
      expect(togglePressablePattern.test(sourceCode)).toBe(true);
    });

    test('5.4 handleToggleLabFulfillmentMode guards with defensive early return if isSigned', () => {
      const guardPattern = /const handleToggleLabFulfillmentMode\s*=\s*\([^)]*\)\s*=>\s*\{\s*if\s*\(isSigned\)\s*return;/;
      expect(guardPattern.test(sourceCode)).toBe(true);
    });

    test('5.5 Lab order delete button is conditionally rendered only when !isSigned', () => {
      const deleteBtnPattern = /\{!isSigned\s*\?\s*\(\s*<Pressable[^>]*accessibilityLabel=\{`Remove \$\{lab\.name\}`\}/;
      expect(deleteBtnPattern.test(sourceCode)).toBe(true);
    });

    test('5.6 handleRemoveLab guards with defensive early return if isSigned', () => {
      const removeGuardPattern = /const handleRemoveLab\s*=\s*\([^)]*\)\s*=>\s*\{\s*if\s*\(isSigned\)\s*return;/;
      expect(removeGuardPattern.test(sourceCode)).toBe(true);
    });

    test('5.7 Diagnostic quick-select ToggleChips have disabled={isSigned}', () => {
      const labChipsPattern = /<ToggleChip[\s\S]*?selected=\{(isOrdered|orderedLabs\.some)[\s\S]*?disabled=\{isSigned\}/;
      expect(labChipsPattern.test(sourceCode)).toBe(true);
    });

    test('5.8 Procedure quick-select ToggleChips have disabled={isSigned}', () => {
      const procChipsPattern = /<ToggleChip[^>]*selected=\{(isOrdered|orderedProcedures)[\s\S]*?disabled=\{isSigned\}/s;
      expect(procChipsPattern.test(sourceCode)).toBe(true);
    });

    test('5.9 Procedure nurse handoff action is hidden when isSigned is true', () => {
      const handoffPattern = /\{orderedProcedures\.length > 0 && !isSigned \? \(\s*<View style=\{styles\.procedureHandoff(Card|Row)\}>/;
      expect(handoffPattern.test(sourceCode)).toBe(true);
    });
  });

  // =========================================================================
  // SUITE 6: Workstation Layout Resilience & Split-Scroll Preservation
  // =========================================================================
  describe('Suite 6: Workstation Layout Resilience & Split-Scroll Preservation', () => {
    const consultationScreenPath = path.resolve(__dirname, '../navigation/screens/Consultations.screen.tsx');
    const sourceCode = fs.readFileSync(consultationScreenPath, 'utf8');

    const EXPECTED_10_SECTION_KEYS = [
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

    test('6.1 All 10 sectionOffsets.current[\'...\'] assignments remain intact in Consultations.screen.tsx', () => {
      for (const sectionKey of EXPECTED_10_SECTION_KEYS) {
        const pattern = new RegExp(`sectionOffsets\\.current\\['${sectionKey}'\\]\\s*=`);
        const exists = pattern.test(sourceCode);
        expect(exists).toBe(true);
      }
    });

    test('6.2 Desktop workstation layout renders independent chartScrollViewRef and soapScrollViewRef', () => {
      expect(sourceCode.includes('ref={chartScrollViewRef}')).toBe(true);
      expect(sourceCode.includes('ref={soapScrollViewRef}')).toBe(true);
      expect(sourceCode.includes('ref={scrollViewRef}')).toBe(true);
    });

    test('6.3 handleJumpToSection handles both spine and soap sections with appropriate scroll ref routing', () => {
      expect(sourceCode.includes("const isSpineSection = section === 'patient-pin' || section === 'vitals'")).toBe(true);
      expect(sourceCode.includes('soapScrollViewRef.current?.scrollTo')).toBe(true);
      expect(sourceCode.includes('scrollViewRef.current?.scrollTo')).toBe(true);
    });

    test('6.4 Reset encounter re-initializes orderedLabs and orderedProcedures cleanly', () => {
      const resetPattern = /const resetEncounter\s*=\s*\([^)]*\)\s*=>\s*\{[\s\S]*?setOrderedLabs\(\[\]\);[\s\S]*?setOrderedProcedures\(\[\]\);/;
      expect(resetPattern.test(sourceCode)).toBe(true);
    });

    test('6.5 Follow-up encounter re-initializes orderedLabs and orderedProcedures cleanly', () => {
      const followUpPattern = /const handleStartFollowUpEncounter\s*=\s*\(\)\s*=>\s*\{[\s\S]*?setOrderedLabs\(\[\]\);[\s\S]*?setOrderedProcedures\(\[\]\);/;
      expect(followUpPattern.test(sourceCode)).toBe(true);
    });
  });
});

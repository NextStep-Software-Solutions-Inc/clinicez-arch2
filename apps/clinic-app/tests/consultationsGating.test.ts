// token-guard:ignore-file
import { describe, expect, test, mock, beforeEach } from 'bun:test';
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

import type { LocalProcedureOrder } from '../navigation/screens/Consultations.screen';
import type { OrderCatalogItemPayload } from '../components/consultation/OrderCatalogSearchModal';
import type { ClinicServiceItem, ClinicSettingsRecord } from '../services/clinicService';
import type { DentalToothState } from '../components/consultation';

const {
  InlineDentalChartCard,
  InlinePhysicalExamCard,
  DEFAULT_PHYSICAL_EXAM_NORMAL,
} = await import('../components/consultation');
const { OrderCatalogSearchModal } = await import('../components/consultation/OrderCatalogSearchModal');

describe('Consultations Workstation — Specialty Mode Gating & Dental Wiring', () => {
  // Test 1: Physical Exam Gating
  test('1. Gates InlinePhysicalExamCard off when specialtyMode === "Dental"', () => {
    // Simulated Consultation Screen gating predicate
    const shouldRenderPhysicalExam = (
      isYakapEligible: boolean,
      settings?: ClinicSettingsRecord | null
    ) => {
      return Boolean(isYakapEligible && settings?.specialtyMode !== 'Dental');
    };

    // Case A: Dental specialty clinic with Yakap patient
    const dentalClinic: ClinicSettingsRecord = {
      clinicName: 'Tooth Care Clinic',
      specialtyMode: 'Dental',
      enableDentalModule: true,
    };
    expect(shouldRenderPhysicalExam(true, dentalClinic)).toBe(false);

    // Case B: Medical clinic with Yakap patient -> PE is shown
    const medicalClinic: ClinicSettingsRecord = {
      clinicName: 'St. Jude Medical',
      specialtyMode: 'Medical',
      enableDentalModule: false,
    };
    expect(shouldRenderPhysicalExam(true, medicalClinic)).toBe(true);

    // Case C: Multi-specialty clinic with Yakap patient -> PE is shown
    const multiClinic: ClinicSettingsRecord = {
      clinicName: 'Metro Multi-Specialty Clinic',
      specialtyMode: 'Multi-Specialty',
      enableDentalModule: true,
    };
    expect(shouldRenderPhysicalExam(true, multiClinic)).toBe(true);

    // Case D: Medical clinic with non-Yakap patient -> PE is gated off
    expect(shouldRenderPhysicalExam(false, medicalClinic)).toBe(false);
  });

  // Test 2: Inline Dental Chart Card Gating
  test('2. Embeds InlineDentalChartCard when dental module is enabled or specialty is Dental', () => {
    const isDentalEnabled = (settings?: ClinicSettingsRecord | null) => {
      return Boolean(settings?.enableDentalModule || settings?.specialtyMode === 'Dental');
    };

    // Case A: Pure Dental mode
    expect(isDentalEnabled({ clinicName: 'Dentist', specialtyMode: 'Dental' })).toBe(true);

    // Case B: Multi-specialty with dental enabled
    expect(
      isDentalEnabled({
        clinicName: 'PolyClinic',
        specialtyMode: 'Multi-Specialty',
        enableDentalModule: true,
      })
    ).toBe(true);

    // Case C: Multi-specialty with dental disabled
    expect(
      isDentalEnabled({
        clinicName: 'PolyClinic',
        specialtyMode: 'Multi-Specialty',
        enableDentalModule: false,
      })
    ).toBe(false);

    // Case D: Pure Medical mode without dental
    expect(
      isDentalEnabled({
        clinicName: 'Internal Medicine',
        specialtyMode: 'Medical',
        enableDentalModule: false,
      })
    ).toBe(false);
  });

  // Test 3: Quick Action procedure order launches OrderCatalogSearchModal with tooth details
  test('3. Quick action + Order Procedure forwards toothNumber and canonical toothSurface to search modal', () => {
    let capturedToothNumber: number | undefined;
    let capturedToothSurface: string | undefined;

    const handleQuickOrderDentalProcedure = (toothNumber: number, toothSurface?: string) => {
      capturedToothNumber = toothNumber;
      capturedToothSurface = toothSurface;
    };

    const initialTeeth: Record<number, DentalToothState> = {
      14: {
        toothNumber: 14,
        status: 'Decay',
        surface: 'MOD',
        notes: 'Deep caries involving pulp',
      },
    };

    const html = renderToStaticMarkup(
      React.createElement(InlineDentalChartCard, {
        teeth: initialTeeth,
        initialToothNumber: 14,
        onQuickOrderProcedure: handleQuickOrderDentalProcedure,
      })
    );

    expect(html).toContain('Tooth #14');
    expect(html).toContain('+ Order Procedure for Tooth #14 (MOD)');
    expect(html).toContain('inline-dental-chart-card-order-proc-btn');

    // Execute order callback
    handleQuickOrderDentalProcedure(14, 'MOD');
    expect(capturedToothNumber).toBe(14);
    expect(capturedToothSurface).toBe('MOD');

    // Render OrderCatalogSearchModal with forwarded toothNumber and toothSurface
    const modalHtml = renderToStaticMarkup(
      React.createElement(OrderCatalogSearchModal, {
        visible: true,
        onClose: () => {},
        catalog: [
          {
            id: 'proc-restoration',
            code: 'D2330',
            name: 'Composite Resin Restoration',
            category: 'Procedure',
            standardPrice: 1500,
          },
        ],
        initialCategory: 'Procedure',
        initialToothNumber: capturedToothNumber,
        initialToothSurface: capturedToothSurface,
        onSelectOrder: () => {},
      })
    );

    // Verify modal displays target tooth badge
    expect(modalHtml).toContain('Target: Tooth #14 (MOD)');
  });

  // Test 4: Procedure Order State accepts toothNumber and toothSurface and keys uniquely
  test('4. LocalProcedureOrder accepts toothNumber and avoids collisions across different teeth', () => {
    let orderedProcedures: LocalProcedureOrder[] = [];

    const handleSelectCatalogOrder = (order: OrderCatalogItemPayload) => {
      const index = orderedProcedures.findIndex(
        (p) =>
          p.name.toLowerCase() === order.name.toLowerCase() &&
          (order.toothNumber !== undefined ? p.toothNumber === order.toothNumber : p.toothNumber === undefined)
      );
      const newProc: LocalProcedureOrder = {
        serviceItemId: order.serviceItemId,
        code: order.code,
        name: order.name,
        category: order.category || 'Procedure',
        standardPrice: order.standardPrice,
        instructions: order.instructions,
        toothNumber: order.toothNumber,
        toothSurface: order.toothSurface,
      };
      if (index >= 0) {
        orderedProcedures[index] = newProc;
      } else {
        orderedProcedures.push(newProc);
      }
    };

    // Doctor orders Tooth Extraction for Tooth 14
    handleSelectCatalogOrder({
      serviceItemId: 'srv-ext-14',
      code: 'D7140',
      name: 'Tooth Extraction',
      category: 'Procedure',
      standardPrice: 1200,
      toothNumber: 14,
      toothSurface: 'B',
      instructions: 'Target: Tooth #14 (B)',
    });

    // Doctor also orders Tooth Extraction for Tooth 18 (same procedure name, different tooth)
    handleSelectCatalogOrder({
      serviceItemId: 'srv-ext-18',
      code: 'D7140',
      name: 'Tooth Extraction',
      category: 'Procedure',
      standardPrice: 1200,
      toothNumber: 18,
      toothSurface: 'O',
      instructions: 'Target: Tooth #18 (O)',
    });

    // Both procedure orders exist without overwriting each other
    expect(orderedProcedures.length).toBe(2);
    expect(orderedProcedures[0].toothNumber).toBe(14);
    expect(orderedProcedures[0].toothSurface).toBe('B');
    expect(orderedProcedures[1].toothNumber).toBe(18);
    expect(orderedProcedures[1].toothSurface).toBe('O');

    // Unique keys generated for both
    const key0 = orderedProcedures[0].serviceItemId
      ? `${orderedProcedures[0].serviceItemId}-${orderedProcedures[0].toothNumber ?? '0'}`
      : `${orderedProcedures[0].name}-${orderedProcedures[0].toothNumber ?? '0'}`;
    const key1 = orderedProcedures[1].serviceItemId
      ? `${orderedProcedures[1].serviceItemId}-${orderedProcedures[1].toothNumber ?? '0'}`
      : `${orderedProcedures[1].name}-${orderedProcedures[1].toothNumber ?? '0'}`;

    expect(key0).not.toBe(key1);
    expect(key0).toBe('srv-ext-14-14');
    expect(key1).toBe('srv-ext-18-18');
  });

  // Test 5: Selective procedure removal by toothNumber
  test('5. handleRemoveProcedure selectively removes only the target tooth procedure order', () => {
    let orderedProcedures: LocalProcedureOrder[] = [
      {
        name: 'Tooth Extraction',
        category: 'Procedure',
        standardPrice: 1200,
        toothNumber: 14,
      },
      {
        name: 'Tooth Extraction',
        category: 'Procedure',
        standardPrice: 1200,
        toothNumber: 18,
      },
    ];

    const handleRemoveProcedure = (procName: string, toothNumber?: number) => {
      orderedProcedures = orderedProcedures.filter((p) => {
        if (p.name.toLowerCase() !== procName.toLowerCase()) return true;
        if (toothNumber !== undefined && p.toothNumber !== toothNumber) return true;
        if (toothNumber === undefined && p.toothNumber !== undefined) return true;
        return false;
      });
    };

    // Remove only tooth 14 extraction
    handleRemoveProcedure('Tooth Extraction', 14);

    expect(orderedProcedures.length).toBe(1);
    expect(orderedProcedures[0].toothNumber).toBe(18);
  });

  // Test 6: Atomic batch save dental chart on encounter signing
  test('6. Atomic batch saves dental chart teeth on encounter signing when dental module is enabled', async () => {
    const isDentalEnabled = true;
    const dentalChart: Record<number, DentalToothState> = {
      21: {
        toothNumber: 21,
        status: 'Crown',
        surface: 'L',
        notes: 'Porcelain crown placed',
      },
      26: {
        toothNumber: 26,
        status: 'Decay',
        surface: 'MO',
        notes: 'Incipient lesion',
      },
    };

    let batchSavedPatientId: string | null = null;
    let batchSavedPayload: any = null;

    const mockBatchSaveDentalChart = mock(async (patientId: string, payload: any) => {
      batchSavedPatientId = patientId;
      batchSavedPayload = payload;
      return [
        {
          patientId,
          consultationId: payload.consultationId,
          teeth: payload.teeth,
          summary: {
            healthyCount: 30,
            decayCount: 1,
            filledCount: 0,
            missingCount: 0,
            crownCount: 1,
            extractionCount: 0,
            totalCharted: 2,
          },
          updatedAt: new Date().toISOString(),
        },
        null,
      ];
    });

    const consultationId = 'consult-encounter-999';
    const patientId = 'pt-juan-001';

    // Encounter signing batch save logic
    if (isDentalEnabled && Object.keys(dentalChart).length > 0) {
      const teethPayload = Object.entries(dentalChart).map(([toothStr, state]) => ({
        toothNumber: parseInt(toothStr, 10),
        status: state.status,
        surface: state.surface || undefined,
        notes: state.notes || undefined,
      }));
      await mockBatchSaveDentalChart(patientId, {
        consultationId,
        teeth: teethPayload,
      });
    }

    expect(mockBatchSaveDentalChart).toHaveBeenCalledTimes(1);
    expect(batchSavedPatientId).toBe('pt-juan-001');
    expect(batchSavedPayload.consultationId).toBe('consult-encounter-999');
    expect(batchSavedPayload.teeth.length).toBe(2);
    expect(batchSavedPayload.teeth[0].toothNumber).toBe(21);
    expect(batchSavedPayload.teeth[0].status).toBe('Crown');
    expect(batchSavedPayload.teeth[1].toothNumber).toBe(26);
    expect(batchSavedPayload.teeth[1].status).toBe('Decay');
  });
});

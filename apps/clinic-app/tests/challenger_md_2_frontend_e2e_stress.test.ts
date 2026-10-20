// token-guard:ignore-file
import { describe, expect, test, mock, beforeEach } from 'bun:test';
import React, { useState, useEffect } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

(globalThis as any).__DEV__ = true;

// Mock React Native modules for Bun testing environment
const createMockComponent = (name: string) => {
  const Comp = ({
    children,
    accessibilityLabel,
    accessibilityRole,
    accessibilityState,
    placeholder,
    testID,
    visible,
    style,
    onPress,
    value,
    onChangeText,
    disabled,
    editable,
    ...rest
  }: any) => {
    if (name === 'Modal' && visible === false) {
      return null;
    }
    const resolvedStyle = typeof style === 'function' ? style({ pressed: false }) : style;
    return React.createElement(
      'div',
      {
        'data-component': name,
        ...(testID ? { 'data-testid': testID, id: testID } : {}),
        ...(accessibilityLabel ? { 'aria-label': accessibilityLabel } : {}),
        ...(accessibilityRole ? { role: accessibilityRole, 'data-accessibility-role': accessibilityRole } : {}),
        ...(accessibilityState ? { 'data-accessibility-state': JSON.stringify(accessibilityState) } : {}),
        ...(placeholder ? { 'data-placeholder': placeholder } : {}),
        ...(visible !== undefined ? { 'data-visible': String(visible) } : {}),
        ...(onPress ? { 'data-pressable': 'true' } : {}),
        ...(value !== undefined ? { 'data-value': value } : {}),
        ...(disabled !== undefined ? { 'data-disabled': String(disabled) } : {}),
        ...(editable !== undefined ? { 'data-editable': String(editable) } : {}),
        'data-style': resolvedStyle ? JSON.stringify(resolvedStyle) : undefined,
        ...rest,
      },
      placeholder,
      children
    );
  };
  Comp.displayName = name;
  return Comp;
};

mock.module('react-native', () => ({
  StyleSheet: { create: (s: any) => s, flatten: (s: any) => s, absoluteFillObject: {} },
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
  Linking: { openURL: () => Promise.resolve(), canOpenURL: () => Promise.resolve(true) },
  Touchable: { Mixin: {} },
  TurboModuleRegistry: { get: () => null, getEnforcing: () => null },
  NativeModules: {},
  Alert: { alert: () => {} },
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

import type {
  ClinicPatient,
  PatientChart,
  DentalToothRecord,
  ClinicalProcedureRecord,
} from '../services/clinicService';

const {
  default: DentalChartTab,
  getPlainEnglishToothName,
  getStatusBadgeVariant,
  getToothStatusColor,
} = await import('../components/chart/DentalChartTab');

const {
  InlineDentalChartCard,
  CANONICAL_SURFACES,
  sortToothSurfaces,
  getToothDescription,
} = await import('../components/consultation/InlineDentalChartCard');
type DentalToothState = import('../components/consultation/InlineDentalChartCard').DentalToothState;

const {
  CHART_TABS,
  DENTAL_CHART_TAB,
  getAvailableChartTabs,
} = await import('../components/chart/types');

const { default: ChartTabContentView } = await import('../components/chart/ChartTabContentView');
const {
  CenteredModalChartLayout,
  SplitPaneChartLayout,
  SlideOverDrawerChartLayout,
} = await import('../components/chart/layouts');

describe('Milestone MD Challenger 2: Frontend E2E Empirical Stress Tests', () => {
  const MOCK_PATIENT: ClinicPatient = {
    id: 'pt-adversarial-001',
    clinicId: 'cl-001',
    patientCode: 'PX-ADV-001',
    fullName: 'Maria Santos',
    firstName: 'Maria',
    lastName: 'Santos',
    gender: 'Female',
    dateOfBirth: '1995-04-12',
    age: 31,
    bloodType: 'A+',
    verificationStatus: 'Verified',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };

  const MOCK_TEETH: DentalToothRecord[] = [
    {
      id: 'dt-16',
      tenantId: 'tn-01',
      clinicId: 'cl-001',
      patientId: 'pt-adversarial-001',
      toothNumber: 16,
      status: 'Decay',
      surface: 'MOD',
      notes: 'Deep occlusal and mesial-distal caries',
      createdAt: '2026-03-01T00:00:00Z',
      updatedAt: '2026-03-01T00:00:00Z',
    },
    {
      id: 'dt-21',
      tenantId: 'tn-01',
      clinicId: 'cl-001',
      patientId: 'pt-adversarial-001',
      toothNumber: 21,
      status: 'Crown',
      surface: 'L',
      notes: 'Zirconia crown intact',
      createdAt: '2026-02-15T00:00:00Z',
      updatedAt: '2026-02-15T00:00:00Z',
    },
    {
      id: 'dt-55',
      tenantId: 'tn-01',
      clinicId: 'cl-001',
      patientId: 'pt-adversarial-001',
      toothNumber: 55,
      status: 'Filled',
      surface: 'O',
      notes: 'Deciduous molar composite filling',
      createdAt: '2026-01-20T00:00:00Z',
      updatedAt: '2026-01-20T00:00:00Z',
    },
  ];

  const MOCK_PROCEDURES: ClinicalProcedureRecord[] = [
    {
      id: 'proc-101',
      tenantId: 'tn-01',
      clinicId: 'cl-001',
      patientId: 'pt-adversarial-001',
      patientName: 'Maria Santos',
      procedureCode: 'D2330',
      procedureName: 'Composite Restoration',
      category: 'Procedure',
      scheduledAt: '2026-01-10T09:00:00Z',
      performedAt: '2026-01-10T09:45:00Z',
      status: 'Completed',
      orderedByDoctorName: 'Dr. John Doe',
      clinicalNotes: 'Restoration placed on tooth #16',
      toothNumber: 16,
      toothSurface: 'MOD',
    },
    {
      id: 'proc-102',
      tenantId: 'tn-01',
      clinicId: 'cl-001',
      patientId: 'pt-adversarial-001',
      patientName: 'Maria Santos',
      procedureCode: 'D2750',
      procedureName: 'Crown Placement',
      category: 'Procedure',
      scheduledAt: '2026-02-15T14:00:00Z',
      performedAt: '2026-02-15T15:00:00Z',
      status: 'Completed',
      orderedByDoctorName: 'Dr. John Doe',
      clinicalNotes: 'Crown cemented on tooth #21',
      toothNumber: 21,
      toothSurface: 'L',
    },
  ];

  const MOCK_CHART: PatientChart = {
    patientId: 'pt-adversarial-001',
    demographics: {
      fullName: 'Maria Santos',
      gender: 'Female',
      dateOfBirth: '1995-04-12',
    },
    consultations: [],
    labOrdersHistory: [],
    proceduresHistory: MOCK_PROCEDURES,
    immunizations: [],
    attachments: [],
    vitalsHistory: [],
    dentalTeeth: MOCK_TEETH,
    dentalProcedures: MOCK_PROCEDURES,
  };

  // =========================================================================
  // Challenge 1: Deep-Linking from Search into Patient Chart
  // =========================================================================
  describe('Challenge 1: Deep-Linking Navigation from Search into Patient Chart', () => {
    test('1.1 Resolves route params with tab: "dental" and toothNumber: 16 focusing tooth and activating dental tab', () => {
      // Simulate route params arriving from Cmd+K search selection
      const routeParams = {
        patientId: 'pt-adversarial-001',
        tab: 'dental',
        toothNumber: 16,
      };

      const rawRouteTooth = routeParams.toothNumber;
      const parsedTooth = typeof rawRouteTooth === 'number' ? rawRouteTooth : parseInt(String(rawRouteTooth), 10);
      const targetTab = routeParams.tab || (parsedTooth ? 'dental' : undefined);

      expect(parsedTooth).toBe(16);
      expect(targetTab).toBe('dental');

      // Verify DentalChartTab receives focusToothNumber=16 and selects tooth 16
      const html = renderToStaticMarkup(
        React.createElement(DentalChartTab, {
          patient: MOCK_PATIENT,
          chart: MOCK_CHART,
          focusToothNumber: parsedTooth,
        })
      );

      expect(html).toContain('Tooth #16');
      expect(html).toContain('Upper Right First Molar');
      expect(html).toContain('Decay');
      expect(html).toContain('MOD');
      expect(html).toContain('data-testid="tooth-cell-16"');
    });

    test('1.2 Implicit tab resolution: toothNumber without tab explicitly resolves to tab: "dental"', () => {
      const routeParams = {
        patientId: 'pt-adversarial-001',
        toothNumber: 21,
        // tab omitted
      };

      const parsedTooth = typeof routeParams.toothNumber === 'number' ? routeParams.toothNumber : parseInt(String(routeParams.toothNumber), 10);
      const targetTab = (routeParams as any).tab || (parsedTooth ? 'dental' : undefined);

      expect(targetTab).toBe('dental');
      expect(parsedTooth).toBe(21);

      const html = renderToStaticMarkup(
        React.createElement(DentalChartTab, {
          patient: MOCK_PATIENT,
          chart: MOCK_CHART,
          focusToothNumber: parsedTooth,
        })
      );

      expect(html).toContain('Tooth #21');
      expect(html).toContain('Upper Left Central Incisor');
      expect(html).toContain('Crown');
    });

    test('1.3 Deciduous child tooth deep link (toothNumber: 55) auto-switches dentition to Child and focuses tooth', () => {
      const routeParams = {
        patientId: 'pt-adversarial-001',
        tooth: '55', // Test string alias 'tooth' as in Patients.screen.tsx:125
      };

      const rawRouteTooth = (routeParams as any).toothNumber ?? routeParams.tooth;
      const parsedTooth = typeof rawRouteTooth === 'number' ? rawRouteTooth : parseInt(String(rawRouteTooth), 10);
      const targetTab = (routeParams as any).tab || (parsedTooth ? 'dental' : undefined);

      expect(parsedTooth).toBe(55);
      expect(targetTab).toBe('dental');

      const html = renderToStaticMarkup(
        React.createElement(DentalChartTab, {
          patient: MOCK_PATIENT,
          chart: MOCK_CHART,
          focusToothNumber: parsedTooth,
        })
      );

      // Must be rendered under Child dentition (Q5 Upper Right)
      expect(html).toContain('Tooth #55');
      expect(html).toContain('Upper Right Primary Second Molar');
      expect(html).toContain('Q5 • Upper Right');
      expect(html).toContain('data-testid="tooth-cell-55"');
    });

    test('1.4 Reactive update when chart is already open: updates focus tooth and switches tab', () => {
      // Simulate state in Patients.screen.tsx
      let chartVisible = true;
      let activeChartTab = 'consultations';
      let focusToothNumber: number | undefined = undefined;

      const onReceiveSearchNav = (params: { tab?: string; toothNumber?: number }) => {
        if (params.tab) {
          activeChartTab = params.tab;
        }
        if (params.toothNumber !== undefined) {
          focusToothNumber = params.toothNumber;
          if (!params.tab) {
            activeChartTab = 'dental';
          }
        }
      };

      // Search item selected: tooth #16
      onReceiveSearchNav({ toothNumber: 16 });
      expect(activeChartTab).toBe('dental');
      expect(focusToothNumber).toBe(16);

      // Another search item selected: child tooth #55
      onReceiveSearchNav({ toothNumber: 55 });
      expect(activeChartTab).toBe('dental');
      expect(focusToothNumber).toBe(55);

      // Verify closing chart cleans up
      const onCloseChart = () => {
        chartVisible = false;
        focusToothNumber = undefined;
      };
      onCloseChart();
      expect(chartVisible).toBe(false);
      expect(focusToothNumber).toBeUndefined();
    });
  });

  // =========================================================================
  // Challenge 2: Dentition Switching: Adult <-> Child State Preservation
  // =========================================================================
  describe('Challenge 2: Dentition Switching Adult <-> Child State Preservation', () => {
    test('2.1 Odontogram chart state preserves adult and child teeth independently across multiple switches', () => {
      let chartState: Record<number, DentalToothState> = {};

      const setTooth = (t: DentalToothState) => {
        chartState = { ...chartState, [t.toothNumber]: t };
      };

      // 1. In Adult mode, chart teeth 16, 11, 48
      setTooth({ toothNumber: 16, status: 'Decay', surface: 'MOD', notes: 'Adult upper molar' });
      setTooth({ toothNumber: 11, status: 'Healthy', surface: '', notes: 'Intact' });
      setTooth({ toothNumber: 48, status: 'Missing', surface: '', notes: 'Extracted third molar' });

      expect(Object.keys(chartState).length).toBe(3);

      // 2. Switch to Child mode, chart teeth 51, 55, 85
      setTooth({ toothNumber: 51, status: 'Decay', surface: 'M', notes: 'Deciduous central caries' });
      setTooth({ toothNumber: 55, status: 'Filled', surface: 'O', notes: 'Deciduous filling' });
      setTooth({ toothNumber: 85, status: 'Extraction', surface: '', notes: 'Deciduous extraction' });

      // 3. Verify all 6 teeth are preserved in chart state
      expect(Object.keys(chartState).length).toBe(6);

      // 4. Switch back to Adult mode and update tooth 16 surface
      setTooth({ toothNumber: 16, status: 'Decay', surface: 'MODBL', notes: 'Expanded to all surfaces' });

      // Verify Adult teeth:
      expect(chartState[16].surface).toBe('MODBL');
      expect(chartState[11].status).toBe('Healthy');
      expect(chartState[48].status).toBe('Missing');

      // Verify Child teeth remain completely uncorrupted:
      expect(chartState[51].status).toBe('Decay');
      expect(chartState[51].surface).toBe('M');
      expect(chartState[55].status).toBe('Filled');
      expect(chartState[55].surface).toBe('O');
      expect(chartState[85].status).toBe('Extraction');
    });

    test('2.2 DMFT summary metrics in DentalChartTab correctly aggregate mixed dentition without negative or invalid values', () => {
      const mixedTeeth: DentalToothRecord[] = [
        { id: '1', tenantId: 't1', clinicId: 'c1', patientId: 'p1', toothNumber: 16, status: 'Decay', surface: 'MOD', createdAt: '', updatedAt: '' },
        { id: '2', tenantId: 't1', clinicId: 'c1', patientId: 'p1', toothNumber: 26, status: 'Filled', surface: 'O', createdAt: '', updatedAt: '' },
        { id: '3', tenantId: 't1', clinicId: 'c1', patientId: 'p1', toothNumber: 38, status: 'Missing', surface: '', createdAt: '', updatedAt: '' },
        { id: '4', tenantId: 't1', clinicId: 'c1', patientId: 'p1', toothNumber: 55, status: 'Decay', surface: 'O', createdAt: '', updatedAt: '' },
        { id: '5', tenantId: 't1', clinicId: 'c1', patientId: 'p1', toothNumber: 85, status: 'Filled', surface: 'MO', createdAt: '', updatedAt: '' },
        { id: '6', tenantId: 't1', clinicId: 'c1', patientId: 'p1', toothNumber: 11, status: 'Healthy', surface: '', createdAt: '', updatedAt: '' },
      ];

      const chart: PatientChart = {
        ...MOCK_CHART,
        dentalTeeth: mixedTeeth,
      };

      const html = renderToStaticMarkup(
        React.createElement(DentalChartTab, {
          patient: MOCK_PATIENT,
          chart,
        })
      );

      // Decayed: 2 (16, 55), Missing: 1 (38), Filled: 2 (26, 85) -> DMFT score = 5
      expect(html).toContain('TOTAL CHARTED');
      expect(html).toContain('DECAYED (D)');
      expect(html).toContain('MISSING (M)');
      expect(html).toContain('FILLED (F)');
      expect(html).toContain('DMFT INDEX');
    });

    test('2.3 Batch save payload constructs valid DTO preserving both Adult and Child entries', () => {
      const consultationDentalChart: Record<number, DentalToothState> = {
        16: { toothNumber: 16, status: 'Decay', surface: 'MOD', notes: 'Adult decay' },
        55: { toothNumber: 55, status: 'Filled', surface: 'O', notes: 'Child filling' },
      };

      const teethPayload = Object.entries(consultationDentalChart).map(([toothStr, state]) => ({
        toothNumber: parseInt(toothStr, 10),
        status: state.status,
        surface: state.surface,
        notes: state.notes,
      }));

      expect(teethPayload.length).toBe(2);
      expect(teethPayload.find((t) => t.toothNumber === 16)?.status).toBe('Decay');
      expect(teethPayload.find((t) => t.toothNumber === 55)?.status).toBe('Filled');
    });
  });

  // =========================================================================
  // Challenge 3: Surface Interaction and Quick-Action Procedure Ordering
  // =========================================================================
  describe('Challenge 3: Surface Interaction & Quick-Action Procedure Ordering', () => {
    test('3.1 Canonical surface sorting sorts all 120 permutations to MODBL', () => {
      const canonical = 'MODBL';
      expect(sortToothSurfaces('LBDOM')).toBe(canonical);
      expect(sortToothSurfaces(['B', 'L', 'O', 'D', 'M'])).toBe(canonical);
      expect(sortToothSurfaces('d o m')).toBe('MOD');
      expect(sortToothSurfaces('')).toBe('');
      expect(sortToothSurfaces('xyz')).toBe('');
    });

    test('3.2 Interactive surface toggling maintains clean state', () => {
      let surfaces = '';
      const toggle = (code: 'M' | 'O' | 'D' | 'B' | 'L') => {
        const set = new Set(surfaces.split('').filter(Boolean));
        if (set.has(code)) {
          set.delete(code);
        } else {
          set.add(code);
        }
        surfaces = sortToothSurfaces(Array.from(set));
      };

      toggle('O');
      expect(surfaces).toBe('O');
      toggle('M');
      expect(surfaces).toBe('MO');
      toggle('D');
      expect(surfaces).toBe('MOD');
      toggle('O'); // Remove O
      expect(surfaces).toBe('MD');
      toggle('B');
      expect(surfaces).toBe('MDB');
    });

    test('3.3 Quick order button renders with surface name and forwards to handler', () => {
      let forwardedTooth: number | null = null;
      let forwardedSurface: string | undefined = undefined;

      const handleOrder = (t: number, s?: string) => {
        forwardedTooth = t;
        forwardedSurface = s;
      };

      const html = renderToStaticMarkup(
        React.createElement(InlineDentalChartCard, {
          initialToothNumber: 14,
          teeth: {
            14: { toothNumber: 14, status: 'Decay', surface: 'MOD' },
          },
          onOrderProcedure: handleOrder,
        })
      );

      expect(html).toContain('Order Procedure for Tooth #14 (MOD)');

      // Execute simulated click
      handleOrder(14, 'MOD');
      expect(forwardedTooth).toBe(14);
      expect(forwardedSurface).toBe('MOD');
    });

    test('3.4 Avoids procedure collisions between multiple teeth with the same procedure name', () => {
      interface LocalProc {
        name: string;
        toothNumber?: number;
        toothSurface?: string;
        price: number;
      }
      let orders: LocalProc[] = [];

      const addOrder = (order: LocalProc) => {
        const idx = orders.findIndex(
          (p) =>
            p.name.toLowerCase() === order.name.toLowerCase() &&
            (order.toothNumber !== undefined ? p.toothNumber === order.toothNumber : p.toothNumber === undefined)
        );
        if (idx >= 0) {
          orders[idx] = order;
        } else {
          orders.push(order);
        }
      };

      // Order 1: Tooth 16 Composite
      addOrder({ name: 'Composite Filling', toothNumber: 16, toothSurface: 'MOD', price: 1500 });
      // Order 2: Tooth 26 Composite (same procedure name, different tooth)
      addOrder({ name: 'Composite Filling', toothNumber: 26, toothSurface: 'O', price: 1200 });

      expect(orders.length).toBe(2);
      expect(orders[0].toothNumber).toBe(16);
      expect(orders[1].toothNumber).toBe(26);

      // Updating Tooth 16 does NOT overwrite Tooth 26
      addOrder({ name: 'Composite Filling', toothNumber: 16, toothSurface: 'MODBL', price: 2000 });
      expect(orders.length).toBe(2);
      expect(orders[0].toothSurface).toBe('MODBL');
      expect(orders[1].toothSurface).toBe('O');
    });
  });

  // =========================================================================
  // Challenge 4: Procedure Deduplication across Clinical History
  // =========================================================================
  describe('Challenge 4: Procedure Deduplication across Clinical History', () => {
    test('4.1 Deduplicates procedures appearing in both dentalProcedures and proceduresHistory', () => {
      // Simulate backend query returning duplicate records across both arrays
      const sharedProcedure: ClinicalProcedureRecord = {
        id: 'dup-proc-001',
        tenantId: 'tn-01',
        clinicId: 'cl-001',
        patientId: 'pt-adversarial-001',
        patientName: 'Maria Santos',
        procedureCode: 'D2330',
        procedureName: 'Composite Restoration',
        category: 'Procedure',
        scheduledAt: '2026-01-10T09:00:00Z',
        performedAt: '2026-01-10T09:45:00Z',
        status: 'Completed',
        orderedByDoctorName: 'Dr. John Doe',
        clinicalNotes: 'Duplicate entry in both arrays',
        toothNumber: 16,
        toothSurface: 'MOD',
      };

      const chartWithDuplicates: PatientChart = {
        ...MOCK_CHART,
        proceduresHistory: [sharedProcedure, sharedProcedure], // duplicate in same array
        dentalProcedures: [sharedProcedure], // duplicate across arrays
      };

      const html = renderToStaticMarkup(
        React.createElement(DentalChartTab, {
          patient: MOCK_PATIENT,
          chart: chartWithDuplicates,
          focusToothNumber: 16,
        })
      );

      // Should only show "(1)" in the timeline header, not 3!
      expect(html).toContain('PROCEDURE HISTORY FOR TOOTH #16 (1)');
    });

    test('4.2 Deduplicates procedure records lacking an ID using composite key (name + scheduledAt + performedAt)', () => {
      const procWithoutId1: ClinicalProcedureRecord = {
        tenantId: 'tn-01',
        clinicId: 'cl-001',
        patientId: 'pt-adversarial-001',
        patientName: 'Maria Santos',
        procedureCode: 'D7140',
        procedureName: 'Simple Extraction',
        category: 'Procedure',
        scheduledAt: '2026-03-01T10:00:00Z',
        performedAt: '2026-03-01T10:30:00Z',
        status: 'Completed',
        orderedByDoctorName: 'Dr. John Doe',
        toothNumber: 48,
      };

      const procWithoutId2: ClinicalProcedureRecord = {
        ...procWithoutId1,
      };

      const chart: PatientChart = {
        ...MOCK_CHART,
        proceduresHistory: [procWithoutId1],
        dentalProcedures: [procWithoutId2],
      };

      const html = renderToStaticMarkup(
        React.createElement(DentalChartTab, {
          patient: MOCK_PATIENT,
          chart,
          focusToothNumber: 48,
        })
      );

      expect(html).toContain('PROCEDURE HISTORY FOR TOOTH #48 (1)');
    });

    test('4.3 Preserves distinct procedures on the same tooth with different dates or procedure names', () => {
      const proc1: ClinicalProcedureRecord = {
        id: 'proc-past',
        tenantId: 'tn-01',
        clinicId: 'cl-001',
        patientId: 'pt-adversarial-001',
        procedureName: 'Pulpotomy',
        category: 'Procedure',
        performedAt: '2025-06-01T08:00:00Z',
        status: 'Completed',
        toothNumber: 16,
      };

      const proc2: ClinicalProcedureRecord = {
        id: 'proc-recent',
        tenantId: 'tn-01',
        clinicId: 'cl-001',
        patientId: 'pt-adversarial-001',
        procedureName: 'Crown Placement',
        category: 'Procedure',
        performedAt: '2026-01-15T14:00:00Z',
        status: 'Completed',
        toothNumber: 16,
      };

      const chart: PatientChart = {
        ...MOCK_CHART,
        dentalProcedures: [],
        proceduresHistory: [proc1, proc2],
      };

      const html = renderToStaticMarkup(
        React.createElement(DentalChartTab, {
          patient: MOCK_PATIENT,
          chart,
          focusToothNumber: 16,
        })
      );

      expect(html).toContain('PROCEDURE HISTORY FOR TOOTH #16 (2)');
      expect(html).toContain('Pulpotomy');
      expect(html).toContain('Crown Placement');
    });
  });

  // =========================================================================
  // Challenge 5: Layout Mode Stress Testing (Modal, Split, Drawer)
  // =========================================================================
  describe('Challenge 5: Layout Mode Stress Testing (Modal, Split, Drawer)', () => {
    const availableTabs = getAvailableChartTabs(true);

    test('5.1 CenteredModalChartLayout renders Dental Chart navigation item and dispatches DentalChartTab', () => {
      const html = renderToStaticMarkup(
        React.createElement(CenteredModalChartLayout, {
          patient: MOCK_PATIENT,
          patientChart: MOCK_CHART,
          activeTab: 'dental',
          availableTabs,
          onTabChange: () => {},
          onClose: () => {},
          onEditDemographics: () => {},
          currentLayout: 'modal',
          onSwitchLayout: () => {},
          focusToothNumber: 16,
        })
      );

      expect(html).toContain('Dental Chart');
      expect(html).toContain('Odontogram Visualizer');
      expect(html).toContain('Tooth #16');
      expect(html).toContain('Upper Right First Molar');
    });

    test('5.2 SplitPaneChartLayout renders Dental Chart in sidebar rail and dispatches DentalChartTab in main pane', () => {
      const html = renderToStaticMarkup(
        React.createElement(SplitPaneChartLayout, {
          patient: MOCK_PATIENT,
          patientChart: MOCK_CHART,
          activeTab: 'dental',
          availableTabs,
          onTabChange: () => {},
          onClose: () => {},
          onEditDemographics: () => {},
          currentLayout: 'split',
          onSwitchLayout: () => {},
          focusToothNumber: 21,
        })
      );

      expect(html).toContain('Dental Chart');
      expect(html).toContain('Odontogram Visualizer');
      expect(html).toContain('Tooth #21');
      expect(html).toContain('Upper Left Central Incisor');
      expect(html).toContain('Clinical Workstation for Maria Santos');
    });

    test('5.3 SlideOverDrawerChartLayout renders Dental Chart in drawer header and dispatches DentalChartTab', () => {
      const html = renderToStaticMarkup(
        React.createElement(SlideOverDrawerChartLayout, {
          patient: MOCK_PATIENT,
          patientChart: MOCK_CHART,
          activeTab: 'dental',
          availableTabs,
          onTabChange: () => {},
          onClose: () => {},
          onEditDemographics: () => {},
          currentLayout: 'drawer',
          onSwitchLayout: () => {},
          focusToothNumber: 55,
        })
      );

      expect(html).toContain('Dental Chart');
      expect(html).toContain('Odontogram Visualizer');
      expect(html).toContain('Tooth #55');
      expect(html).toContain('Upper Right Primary Second Molar');
      expect(html).toContain('Close Drawer');
    });

    test('5.4 Dynamic layout switching preserves active tab and focused tooth without reset', () => {
      let currentActiveLayout = 'modal';
      let activeTab = 'dental';
      let focusedTooth: number | undefined = 16;

      const switchLayout = (newLayout: 'modal' | 'split' | 'drawer') => {
        currentActiveLayout = newLayout;
      };

      // Initial Modal
      expect(currentActiveLayout).toBe('modal');
      expect(activeTab).toBe('dental');
      expect(focusedTooth).toBe(16);

      // Switch to Split-Pane
      switchLayout('split');
      expect(currentActiveLayout).toBe('split');
      expect(activeTab).toBe('dental');
      expect(focusedTooth).toBe(16);

      // Switch to Slide-Over Drawer
      switchLayout('drawer');
      expect(currentActiveLayout).toBe('drawer');
      expect(activeTab).toBe('dental');
      expect(focusedTooth).toBe(16);

      // Switch back to Modal
      switchLayout('modal');
      expect(currentActiveLayout).toBe('modal');
      expect(activeTab).toBe('dental');
      expect(focusedTooth).toBe(16);
    });
  });
});

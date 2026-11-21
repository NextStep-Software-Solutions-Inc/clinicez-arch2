// token-guard:ignore-file
import { describe, expect, test, mock } from 'bun:test';
import fs from 'fs';
import path from 'path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  normalizeTeethToMultiRecord,
  getDominantToothStatus,
  calculateDmftMetrics,
  sortToothSurfaces,
  DentalToothRecord,
  ToothStatus,
} from '../components/dental/dentalUtils';

(globalThis as any).__DEV__ = true;

const renderedPressHandlers = new Map<string, () => void>();

const createMockComponent = (name: string) => {
  const Comp = ({ children, accessibilityLabel, accessibilityRole, placeholder, testID, onPress, ...props }: any) => {
    if (onPress && testID) {
      renderedPressHandlers.set(testID, onPress);
    }
    return React.createElement(
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
  };
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
    get: () => ({ width: 1440, height: 900 }),
    addEventListener: () => ({ remove: () => {} }),
  },
  useWindowDimensions: () => ({ width: 1440, height: 900 }),
  Keyboard: { dismiss: () => {}, addListener: () => ({ remove: () => {} }) },
  AppState: { addEventListener: () => ({ remove: () => {} }) },
  Platform: { OS: 'web', select: (obj: any) => obj.web ?? obj.default },
  Touchable: { Mixin: {} },
  TurboModuleRegistry: { get: () => null, getEnforcing: () => null },
  NativeModules: {},
  processColor: (c: any) => c,
  Animated: {
    Value: class {
      constructor(public val: any) {}
      setValue(val: any) { this.val = val; }
    },
    timing: () => ({ start: (cb?: any) => cb && cb() }),
    sequence: () => ({ start: (cb?: any) => cb && cb() }),
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
  Polyline: 'Polyline',
  Polygon: 'Polygon',
  Defs: ({ children }: any) => children,
  LinearGradient: ({ children }: any) => children,
  Stop: () => null,
  G: ({ children }: any) => children,
  Text: ({ children }: any) => children,
}));

mock.module('../constants/fonts', () => ({
  applyFontFamily: (s: any) => s,
  fontAssets: {},
}));

mock.module('expo-font', () => ({
  isLoaded: () => true,
  loadAsync: () => Promise.resolve(),
}));

mock.module('@expo/vector-icons', () => ({
  Ionicons: createMockComponent('Ionicons'),
  MaterialCommunityIcons: createMockComponent('MaterialCommunityIcons'),
  FontAwesome: createMockComponent('FontAwesome'),
  Feather: createMockComponent('Feather'),
}));

describe('Empirical Challenger: Instant Dental Chart Sync & Multi-Condition Stress', () => {
  // 1. Verify the exact payload shape emitted by InlineDentalChartCard on pressing Decay then Save Condition
  test('1.1 InlineDentalChartCard stages status locally when clicked and emits Record<number, DentalToothRecord[]> to onChange only when Save Condition is clicked', async () => {
    renderedPressHandlers.clear();
    const { InlineDentalChartCard } = await import('../components/consultation/InlineDentalChartCard');

    let receivedChart: any = null;
    let receivedTooth: any = null;

    renderToStaticMarkup(
      React.createElement(InlineDentalChartCard, {
        initialToothNumber: 18,
        onChange: (chart: any) => {
          receivedChart = chart;
        },
        onChangeTooth: (tooth: any) => {
          receivedTooth = tooth;
        },
      })
    );

    const decayButtonHandler = renderedPressHandlers.get('status-pill-decayed');
    const saveConditionHandler =
      renderedPressHandlers.get('inline-dental-chart-card-save-condition-btn') ??
      renderedPressHandlers.get('inline-dental-chart-card-save-condition-trigger');
    expect(decayButtonHandler).toBeDefined();
    expect(saveConditionHandler).toBeDefined();

    // Selecting status pill MUST NOT immediately add to Recorded Conditions or emit onChange
    decayButtonHandler!();
    expect(receivedChart).toBeNull();
    expect(receivedTooth).toBeNull();

    // Explicitly clicking Save Condition commits the staged condition and emits onChange
    saveConditionHandler!();

    // Verify what onChange received:
    expect(receivedChart).toBeDefined();
    expect(receivedChart[18]).toBeDefined();
    // CRITICAL EMPIRICAL PROOF: receivedChart[18] IS AN ARRAY, NOT AN OBJECT!
    expect(Array.isArray(receivedChart[18])).toBe(true);
    expect(receivedChart[18][0].status).toBe('Decayed');
    expect(receivedChart[18].status).toBeUndefined(); // Array has no .status!
  });

  // 2. Stress-test the exact handleDentalChartChange implementation from Consultations.screen.tsx
  test('1.2 Empirical Failure: Consultations.screen.tsx handleDentalChartChange maps state.status on array, causing undefined status', async () => {
    // When InlineDentalChartCard notifies changes, it produces nextMulti: Record<number, DentalToothRecord[]>
    const simulatedNextMultiFromInlineDentalChartCard: Record<number, DentalToothRecord[]> = {
      18: [
        {
          id: 'rec-18-decay-1700000000000',
          toothNumber: 18,
          status: 'Decayed',
          surface: 'O',
          notes: 'Deep caries noted',
          createdAt: new Date().toISOString(),
          recordedBy: 'Dr. Santos',
        },
      ],
      16: [
        {
          id: 'rec-16-filled-1700000000000',
          toothNumber: 16,
          status: 'Filled',
          surface: 'MOD',
          notes: 'Amalgam restoration intact',
          createdAt: new Date().toISOString(),
          recordedBy: 'Dr. Reyes',
        },
      ],
    };

    // This is the EXACT logic in Consultations.screen.tsx lines 565-575:
    const targetPatientId = 'pat-test-123';
    const settings = { tenantId: 'tenant-1', clinicId: 'clinic-1' };
    const patientRecord = { tenantId: 'tenant-1', clinicId: 'clinic-1', id: 'pat-test-123' };

    const syncedTeeth: DentalToothRecord[] = Object.entries(simulatedNextMultiFromInlineDentalChartCard).map(
      ([toothStr, state]: [string, any]) => ({
        id: `draft-tooth-${toothStr}`,
        tenantId: settings?.tenantId || (patientRecord as any)?.tenantId || '',
        clinicId: settings?.clinicId || (patientRecord as any)?.clinicId || '',
        patientId: targetPatientId,
        toothNumber: parseInt(toothStr, 10),
        status: state.status as any,
        surface: state.surface || null,
        notes: state.notes || null,
        createdAt: new Date().toISOString(),
      })
    );

    // EMPIRICAL OBSERVATION:
    // Because state is DentalToothRecord[] (Array), state.status is undefined!
    // state.surface is undefined, coerced to null!
    // state.notes is undefined, coerced to null!
    expect(syncedTeeth[0].status).toBeUndefined();
    expect(syncedTeeth[0].surface).toBeNull();
    expect(syncedTeeth[0].notes).toBeNull();

    expect(syncedTeeth[1].status).toBeUndefined();
    expect(syncedTeeth[1].surface).toBeNull();
    expect(syncedTeeth[1].notes).toBeNull();
  });

  // 3. Downstream impact: DentalChartTab reading patientChart.dentalTeeth
  test('1.3 Downstream Impact: DentalChartTab normalizes corrupted syncedTeeth back to Healthy', () => {
    // The corrupted syncedTeeth produced by Consultations.screen.tsx:
    const corruptedSyncedTeeth: any[] = [
      {
        id: 'draft-tooth-18',
        toothNumber: 18,
        status: undefined, // undefined because of state.status on array
        surface: null,
        notes: null,
      },
    ];

    // DentalChartTab runs: normalizeTeethToMultiRecord(chart?.dentalTeeth)
    const normalized = normalizeTeethToMultiRecord(corruptedSyncedTeeth);

    // The recorded Decay was lost and defaulted to Healthy!
    expect(normalized[18][0].status).toBe('Healthy');
    expect(normalized[18][0].surface).toBe('');
    expect(normalized[18][0].notes).toBe('');

    // The DMFT metric is 0 instead of showing 1 Decayed tooth!
    const dmft = calculateDmftMetrics(normalized);
    expect(dmft.decayedCount).toBe(0);
    expect(dmft.healthyCount).toBe(1);
    expect(dmft.dmftScore).toBe(0);
  });

  // 4. Multi-condition records destruction
  test('1.4 Multi-Condition Destruction: A tooth with both Filled and Decay is collapsed into a single undefined record', () => {
    const multiConditionNextMulti: Record<number, DentalToothRecord[]> = {
      16: [
        {
          id: 'rec-16-filled',
          toothNumber: 16,
          status: 'Filled',
          surface: 'O',
          notes: 'Old composite',
          createdAt: new Date().toISOString(),
        },
        {
          id: 'rec-16-decay',
          toothNumber: 16,
          status: 'Decayed',
          surface: 'M',
          notes: 'New recurrent caries',
          createdAt: new Date().toISOString(),
        },
      ],
    };

    // Consultations.screen.tsx maps 1 record per key:
    const syncedTeeth: any[] = Object.entries(multiConditionNextMulti).map(([toothStr, state]: [string, any]) => ({
      id: `draft-tooth-${toothStr}`,
      toothNumber: parseInt(toothStr, 10),
      status: state.status as any,
      surface: state.surface || null,
      notes: state.notes || null,
    }));

    // Only 1 record produced for tooth 16 instead of 2!
    expect(syncedTeeth.length).toBe(1);
    // And its status is undefined!
    expect(syncedTeeth[0].status).toBeUndefined();
  });

  // 5. Consultation Signing batch persistence failure
  test('1.5 Consultation Signing Failure: batchSaveDentalChart receives status: undefined', () => {
    // In Consultations.screen.tsx:
    // setDentalChart(nextChart) sets dentalChart to nextMulti (Record<number, DentalToothRecord[]>)
    const dentalChartState: Record<number, any> = {
      18: [
        {
          id: 'rec-18-decay',
          toothNumber: 18,
          status: 'Decayed',
          surface: 'O',
          notes: 'Cavity',
        },
      ],
    };

    // Lines 2149-2154 of Consultations.screen.tsx:
    const teethPayload = Object.entries(dentalChartState).map(([toothStr, state]: [string, any]) => ({
      toothNumber: parseInt(toothStr, 10),
      status: state.status,
      surface: state.surface || undefined,
      notes: state.notes || undefined,
    }));

    // teethPayload is corrupted:
    expect(teethPayload[0].status).toBeUndefined();
    expect(teethPayload[0].surface).toBeUndefined();
    expect(teethPayload[0].notes).toBeUndefined();
  });

  // 6. Proposed Mitigation Verification
  test('1.6 Mitigation Verification: normalizeTeethToMultiRecord correctly extracts multi-condition records and populates dentalTeeth & teethPayload', () => {
    const nextMulti: Record<number, DentalToothRecord[]> = {
      18: [
        {
          id: 'rec-18-decay',
          toothNumber: 18,
          status: 'Decayed',
          surface: 'O',
          notes: 'Cavity on occlusal',
          createdAt: '2026-10-20T01:00:00Z',
          recordedBy: 'Dr. Cruz',
        },
      ],
      16: [
        {
          id: 'rec-16-filled',
          toothNumber: 16,
          status: 'Filled',
          surface: 'O',
          notes: 'Old filling',
          createdAt: '2026-10-20T01:00:00Z',
          recordedBy: 'Dr. Cruz',
        },
        {
          id: 'rec-16-decay',
          toothNumber: 16,
          status: 'Decayed',
          surface: 'M',
          notes: 'Recurrent caries',
          createdAt: '2026-10-20T01:00:00Z',
          recordedBy: 'Dr. Cruz',
        },
      ],
    };

    // Robust extraction using normalizeTeethToMultiRecord:
    const multiMap = normalizeTeethToMultiRecord(nextMulti);
    const syncedTeeth: DentalToothRecord[] = Object.values(multiMap).flat();

    // Verify all 3 records preserved across both teeth:
    expect(syncedTeeth.length).toBe(3);

    const tooth18 = syncedTeeth.find((t) => t.toothNumber === 18);
    expect(tooth18?.status).toBe('Decayed');
    expect(tooth18?.surface).toBe('O');
    expect(tooth18?.notes).toBe('Cavity on occlusal');

    const tooth16Recs = syncedTeeth.filter((t) => t.toothNumber === 16);
    expect(tooth16Recs.length).toBe(2);
    expect(tooth16Recs.map((r) => r.status).sort()).toEqual(['Decayed', 'Filled']);

    // Downstream DentalChartTab verification:
    const chartTabNormalized = normalizeTeethToMultiRecord(syncedTeeth);
    const dmft = calculateDmftMetrics(chartTabNormalized);
    expect(dmft.decayedCount).toBe(2);
    expect(dmft.filledCount).toBe(1);
    expect(dmft.dmftScore).toBe(2); // Tooth 16 has both Decay and Filled; Decay takes precedence without double-counting

    // Signing payload verification:
    const teethPayload = syncedTeeth.map((rec) => ({
      toothNumber: rec.toothNumber,
      status: rec.status,
      surface: rec.surface || undefined,
      notes: rec.notes || undefined,
    }));
    expect(teethPayload.length).toBe(3);
    expect(teethPayload.every((t) => t.status !== undefined)).toBe(true);
  });

  // =========================================================================
  // 2. Encounter Signing teethPayload Multi-Condition Stress Verification
  // =========================================================================
  describe('2. Encounter Signing teethPayload Multi-Condition Stress Verification', () => {
    test('2.1 Multi-condition dental chart produces flat teethPayload with valid statuses, surfaces, and ZERO undefined status', () => {
      const multiConditionDentalChart: Record<number, DentalToothRecord[]> = {
        16: [
          {
            id: 'rec-16-1',
            toothNumber: 16,
            status: 'Filled',
            surface: 'O',
            notes: 'Existing composite restoration',
            createdAt: '2026-10-18T10:00:00Z',
          },
          {
            id: 'rec-16-2',
            toothNumber: 16,
            status: 'Decayed',
            surface: 'MD',
            notes: 'Recurrent marginal decay',
            createdAt: '2026-10-20T10:00:00Z',
          },
        ],
        18: [
          {
            id: 'rec-18-1',
            toothNumber: 18,
            status: 'Decayed',
            surface: 'O',
            notes: 'Deep pit cavity',
            createdAt: '2026-10-20T10:00:00Z',
          },
        ],
        21: [
          {
            id: 'rec-21-1',
            toothNumber: 21,
            status: 'Crowned',
            surface: 'MODBL',
            notes: 'PFM crown placed',
            createdAt: '2026-10-15T10:00:00Z',
          },
        ],
        36: [
          {
            id: 'rec-36-1',
            toothNumber: 36,
            status: 'ForExtraction',
            surface: '',
            notes: 'Grossly carious, indicated for extraction',
            createdAt: '2026-10-20T10:00:00Z',
          },
        ],
        47: [
          {
            id: 'rec-47-1',
            toothNumber: 47,
            status: 'Missing',
            surface: '',
            notes: 'Extracted previously',
            createdAt: '2026-10-10T10:00:00Z',
          },
        ],
        11: [
          {
            id: 'rec-11-1',
            toothNumber: 11,
            status: 'Healthy',
            surface: '',
            notes: '',
            createdAt: '2026-10-20T10:00:00Z',
          },
        ],
      };

      // Exact transformation logic from Consultations.screen.tsx:2138-2145
      const multiMap = normalizeTeethToMultiRecord(multiConditionDentalChart as any);
      const teethPayload = Object.values(multiMap).flat().map((rec) => ({
        toothNumber: rec.toothNumber,
        status: rec.status,
        surface: rec.surface || undefined,
        notes: rec.notes || undefined,
      }));

      // 1. Verify item count matches total conditions across all teeth (7 conditions)
      expect(teethPayload.length).toBe(7);

      // 2. CRITICAL EMPIRICAL PROOF: ZERO undefined status
      const undefinedStatusItems = teethPayload.filter((t) => t.status === undefined);
      expect(undefinedStatusItems.length).toBe(0);

      // 3. Every item has a valid ToothStatus string
      const validStatuses = new Set(['Decayed', 'Filled', 'Crowned', 'ForExtraction', 'Missing', 'Healthy']);
      for (const item of teethPayload) {
        expect(typeof item.toothNumber).toBe('number');
        expect(validStatuses.has(item.status)).toBe(true);
        expect(item.status).not.toBeUndefined();
      }

      // 4. Tooth 16 preserved as two flat items with distinct statuses and surfaces
      const tooth16Items = teethPayload.filter((t) => t.toothNumber === 16);
      expect(tooth16Items.length).toBe(2);
      expect(tooth16Items.map((t) => t.status).sort()).toEqual(['Decayed', 'Filled']);
      expect(tooth16Items.find((t) => t.status === 'Filled')?.surface).toBe('O');
      expect(tooth16Items.find((t) => t.status === 'Decayed')?.surface).toBe('MD');

      // 5. Blank surfaces or notes are mapped to undefined (not empty string) for clean JSON serialization
      const tooth36 = teethPayload.find((t) => t.toothNumber === 36);
      expect(tooth36?.surface).toBeUndefined();
      expect(tooth36?.notes).toBe('Grossly carious, indicated for extraction');

      const tooth11 = teethPayload.find((t) => t.toothNumber === 11);
      expect(tooth11?.status).toBe('Healthy');
      expect(tooth11?.surface).toBeUndefined();
      expect(tooth11?.notes).toBeUndefined();
    });

    test('2.2 Consultations.screen.tsx source code binds normalizeTeethToMultiRecord into encounter signing teethPayload', () => {
      const filePath = path.resolve(__dirname, '../navigation/screens/Consultations.screen.tsx');
      const content = fs.readFileSync(filePath, 'utf8');

      // Verify the encounter signing block
      expect(content).toContain('isDentalEnabled && Object.keys(dentalChart).length > 0');
      expect(content).toContain('const multiMap = normalizeTeethToMultiRecord(dentalChart as any);');
      expect(content).toContain('const teethPayload = currentEncounterRecords.map((rec) => ({');
      expect(content).toContain('toothNumber: rec.toothNumber,');
      expect(content).toContain('status: rec.status,');
      expect(content).toContain('surface: rec.surface || undefined,');
      expect(content).toContain('notes: rec.notes || undefined,');
      expect(content).toContain('clinicService.batchSaveDentalChart(selectedPatient.patientId, {');
    });

    test('2.3 Massive multi-condition mouth stress test: 52 teeth with multiple conditions produce 100% valid flat teethPayload', () => {
      const complexMouthChart: Record<number, DentalToothRecord[]> = {};

      // 32 adult teeth + 20 pediatric teeth
      const allTeeth = [
        18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28,
        48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38,
        55, 54, 53, 52, 51, 61, 62, 63, 64, 65,
        85, 84, 83, 82, 81, 71, 72, 73, 74, 75,
      ];

      for (const toothNum of allTeeth) {
        if (toothNum % 3 === 0) {
          // Multi-condition: Filled on O + Decay on M
          complexMouthChart[toothNum] = [
            {
              id: `rec-${toothNum}-filled`,
              toothNumber: toothNum,
              status: 'Filled',
              surface: 'O',
              notes: 'Restoration',
              createdAt: '2026-10-19T00:00:00Z',
            },
            {
              id: `rec-${toothNum}-decay`,
              toothNumber: toothNum,
              status: 'Decayed',
              surface: 'M',
              notes: 'Marginal caries',
              createdAt: '2026-10-20T00:00:00Z',
            },
          ];
        } else if (toothNum % 5 === 0) {
          complexMouthChart[toothNum] = [
            {
              id: `rec-${toothNum}-crown`,
              toothNumber: toothNum,
              status: 'Crowned',
              surface: 'MODBL',
              notes: 'Full coverage',
              createdAt: '2026-10-18T00:00:00Z',
            },
          ];
        } else {
          complexMouthChart[toothNum] = [
            {
              id: `rec-${toothNum}-healthy`,
              toothNumber: toothNum,
              status: 'Healthy',
              surface: '',
              notes: '',
              createdAt: '2026-10-20T00:00:00Z',
            },
          ];
        }
      }

      const multiMap = normalizeTeethToMultiRecord(complexMouthChart as any);
      const teethPayload = Object.values(multiMap).flat().map((rec) => ({
        toothNumber: rec.toothNumber,
        status: rec.status,
        surface: rec.surface || undefined,
        notes: rec.notes || undefined,
      }));

      // Ensure every single item has non-undefined status
      expect(teethPayload.length).toBeGreaterThanOrEqual(52);
      expect(teethPayload.some((t) => t.status === undefined)).toBe(false);
      expect(teethPayload.every((t) => typeof t.status === 'string')).toBe(true);
      expect(teethPayload.every((t) => typeof t.toothNumber === 'number')).toBe(true);
    });
  });
});

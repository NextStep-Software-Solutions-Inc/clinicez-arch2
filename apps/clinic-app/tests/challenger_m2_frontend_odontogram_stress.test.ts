// token-guard:ignore-file
import { describe, expect, test, mock } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

(globalThis as any).__DEV__ = true;

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

const {
  ToothSurfaceDiagram,
  isRightQuadrant,
  getSurfacesForQuadrant,
  getSurfaceZoneColor,
  calculateDmftMetrics,
  normalizeTeethToMultiRecord,
  sortToothSurfaces,
  subtractToothSurfaces,
  resolveToothEffectiveState,
  canApplyConditionToTooth,
  applyStagedConditionToTooth,
  getDominantToothStatus,
  getConditionDotColor,
  isWholeToothStatus,
  getCurrentEncounterLockedState,
} = await import('../components/dental');

const { theme } = await import('../constants/theme');
const { InlineDentalChartCard } = await import('../components/consultation/InlineDentalChartCard');
const { default: DentalChartTab, getPlainEnglishToothName } = await import('../components/chart/DentalChartTab');

describe('Challenger M2: Empirical Stress Test Suite (5-Surface Odontogram & Tooth Inspector)', () => {
  // =========================================================================
  // SUITE 1: Multi-Condition Tooth Inspector & Left/Right History Separation
  // =========================================================================
  describe('Suite 1: Multi-Condition Tooth Inspector Verification', () => {
    const quadConditionTooth16 = {
      16: [
        {
          id: 'cond-16-historical-decay',
          toothNumber: 16,
          status: 'Decayed' as const,
          surface: 'O',
          activeSurface: '',
          isCurrent: false,
          notes: 'Initial occlusal caries noted in previous encounter',
          createdAt: '2024-01-10T09:00:00Z',
          supersededAt: '2024-03-12T08:30:00Z',
          recordedBy: 'Dr. Roberto Cruz',
        },
        {
          id: 'cond-16-filled',
          toothNumber: 16,
          status: 'Filled' as const,
          surface: 'O',
          activeSurface: 'O',
          isCurrent: true,
          notes: 'Occlusal composite restoration placed in 2024',
          createdAt: '2024-03-12T08:30:00Z',
          recordedBy: 'Dr. Maria Santos',
        },
        {
          id: 'cond-16-decay',
          toothNumber: 16,
          status: 'Decayed' as const,
          surface: 'MD',
          activeSurface: 'MD',
          isCurrent: true,
          notes: 'Mesial and distal marginal leakage caries',
          createdAt: '2026-02-14T11:15:00Z',
          recordedBy: 'Dr. Juan Reyes',
        },
        {
          id: 'cond-16-crown',
          toothNumber: 16,
          status: 'Crowned' as const,
          surface: 'BL',
          activeSurface: 'BL',
          isCurrent: true,
          isCurrentEncounter: true,
          notes: 'Buccal-lingual partial onlay restoration',
          createdAt: '2026-06-01T14:00:00Z',
          recordedBy: 'Dr. Ana Lim',
        },
      ],
    };

    test('1.1 Right Screen (InlineDentalChartCard) renders ONLY current active conditions per surface, excludes superseded history, and keeps prior-encounter records untouchable', () => {
      const html = renderToStaticMarkup(
        React.createElement(InlineDentalChartCard, {
          chart: quadConditionTooth16,
          initialToothNumber: 16,
        })
      );

      // Section header
      expect(html).toContain('Recorded Conditions on Tooth #16');

      // 3 Current Active Condition Badges (1 per non-overlapping surface group: O, MD, BL)
      expect(html).toContain('data-testid="condition-item-cond-16-filled"');
      expect(html).toContain('data-testid="condition-item-cond-16-decay"');
      expect(html).toContain('data-testid="condition-item-cond-16-crown"');

      // Historical condition from previous encounter MUST NOT appear on Right Screen
      expect(html).not.toContain('data-testid="condition-item-cond-16-historical-decay"');
      expect(html).not.toContain('Initial occlusal caries noted in previous encounter');

      // Affected Surfaces
      expect(html).toContain('Surfaces: O');
      expect(html).toContain('Surfaces: MD');
      expect(html).toContain('Surfaces: BL');

      // Clinical Notes for each current condition
      expect(html).toContain('Occlusal composite restoration placed in 2024');
      expect(html).toContain('Mesial and distal marginal leakage caries');
      expect(html).toContain('Buccal-lingual partial onlay restoration');

      // Attending Clinicians for current conditions
      expect(html).toContain('Dr. Maria Santos');
      expect(html).toContain('Dr. Juan Reyes');
      expect(html).toContain('Dr. Ana Lim');

      // Untouchable prior-encounter records have NO remove button; only current-encounter record has Remove
      expect(html).not.toContain('data-testid="remove-condition-cond-16-filled"');
      expect(html).not.toContain('data-testid="remove-condition-cond-16-decay"');
      expect(html).toContain('data-testid="remove-condition-cond-16-crown"');
    });

    test('1.2 Left Screen (DentalChartTab) renders full chronological condition history stack with audit-safe Void buttons', () => {
      let voidedRecordId: string | null = null;
      const handleVoid = (tooth: number, recordId: string) => {
        voidedRecordId = `${tooth}:${recordId}`;
      };

      const html = renderToStaticMarkup(
        React.createElement(DentalChartTab, {
          chart: {
            dentalTeeth: quadConditionTooth16[16],
          },
          focusToothNumber: 16,
          onVoidCondition: handleVoid,
        })
      );

      // Inspector pane exists with full chronological stack
      expect(html).toContain('data-testid="tooth-inspector-pane"');
      expect(html).toContain('Tooth #16');
      expect(html).toContain('RECORDED CONDITIONS ON TOOTH #16 (3)');

      // All 3 active condition items rendered in DentalChartTab
      expect(html).toContain('data-testid="tab-condition-cond-16-filled"');
      expect(html).toContain('data-testid="tab-condition-cond-16-decay"');
      expect(html).toContain('data-testid="tab-condition-cond-16-crown"');

      // Superseded historical condition rendered in the stack on Left Screen!
      expect(html).toContain('data-testid="tab-historical-conditions-list"');
      expect(html).toContain('HISTORICAL CONDITIONS (PREVIOUS ENCOUNTERS) (1)');
      expect(html).toContain('data-testid="tab-historical-condition-cond-16-historical-decay"');
      expect(html).toContain('Initial occlusal caries noted in previous encounter');
      expect(html).toContain('Dr. Roberto Cruz');

      // Attending clinicians & audit-safe Void buttons (no destructive Remove)
      expect(html).toContain('Dr. Maria Santos');
      expect(html).toContain('data-testid="tab-void-condition-cond-16-filled"');
      expect(html).toContain('data-testid="tab-void-condition-cond-16-decay"');
      expect(html).toContain('data-testid="tab-void-condition-cond-16-crown"');
      expect(html).not.toContain('tab-remove-condition-');
      expect(voidedRecordId).toBeNull();
    });

    test('1.3 Healthy tooth renders healthy condition box with zero remove buttons', () => {
      const healthyToothChart = {
        11: [
          {
            id: 'cond-11-healthy',
            toothNumber: 11,
            status: 'Healthy' as const,
            createdAt: '2026-01-01T00:00:00Z',
          },
        ],
      };

      const html = renderToStaticMarkup(
        React.createElement(InlineDentalChartCard, {
          chart: healthyToothChart,
          initialToothNumber: 11,
        })
      );

      expect(html).toContain('Healthy — No abnormal conditions or restorations recorded');
      expect(html).not.toContain('remove-condition');
    });

    test('1.4 Co-existing active conditions render colored status dots on odontogram tooth cell', () => {
      const html = renderToStaticMarkup(
        React.createElement(DentalChartTab, {
          chart: {
            dentalTeeth: quadConditionTooth16[16],
          },
        })
      );

      expect(html).toContain('data-testid="multi-dots-16"');
      expect(html).toContain('data-testid="dot-decayed-16"');
      expect(html).toContain('data-testid="dot-filled-16"');
      expect(html).toContain('data-testid="dot-crowned-16"');
    });
  });

  // =========================================================================
  // SUITE 2: DMFT Index Permutation Stress Matrix (Double-Counting Prevention)
  // =========================================================================
  describe('Suite 2: DMFT Index Permutations & Single-Count Semantics', () => {
    test('2.1 Single tooth with co-existing Decay and Filled counts in D and F, but strictly ONCE in DMFT score', () => {
      const records = [
        {
          id: '1',
          toothNumber: 16,
          status: 'Filled' as const,
          surface: 'O',
          createdAt: '2025-01-01T00:00:00Z',
        },
        {
          id: '2',
          toothNumber: 16,
          status: 'Decayed' as const,
          surface: 'MD',
          createdAt: '2026-10-20T00:00:00Z',
        },
      ];

      const metrics = calculateDmftMetrics(records);
      expect(metrics.totalCharted).toBe(1);
      expect(metrics.decayedCount).toBe(1);
      expect(metrics.filledCount).toBe(1);
      expect(metrics.missingCount).toBe(0);
      expect(metrics.dmftScore).toBe(1); // Single tooth must count as 1 in DMFT!
    });

    test('2.2 Pathological tooth with Decay, Filled, AND Missing counts strictly ONCE in DMFT score', () => {
      const records = [
        { id: '1', toothNumber: 24, status: 'Filled' as const, surface: 'MOD', createdAt: '2024-01-01T00:00:00Z' },
        { id: '2', toothNumber: 24, status: 'Decayed' as const, surface: 'B', createdAt: '2025-01-01T00:00:00Z' },
        { id: '3', toothNumber: 24, status: 'Missing' as const, createdAt: '2026-10-01T00:00:00Z' },
      ];

      const metrics = calculateDmftMetrics(records);
      expect(metrics.totalCharted).toBe(1);
      expect(metrics.decayedCount).toBe(1);
      expect(metrics.filledCount).toBe(1);
      expect(metrics.missingCount).toBe(1);
      expect(metrics.dmftScore).toBe(1); // Distinct tooth count: {24} -> 1
    });

    test('2.3 Full 32-tooth permanent mouth permutation: 13 distinct DMFT teeth does NOT equal sum of D+M+F (18)', () => {
      const records: any[] = [
        // 4 teeth with Decay only (11, 12, 13, 14)
        { id: 'd1', toothNumber: 11, status: 'Decayed', surface: 'M', createdAt: '2026-01-01T00:00:00Z' },
        { id: 'd2', toothNumber: 12, status: 'Decayed', surface: 'D', createdAt: '2026-01-01T00:00:00Z' },
        { id: 'd3', toothNumber: 13, status: 'Decayed', surface: 'O', createdAt: '2026-01-01T00:00:00Z' },
        { id: 'd4', toothNumber: 14, status: 'Decayed', surface: 'B', createdAt: '2026-01-01T00:00:00Z' },

        // 3 teeth with Filled only (21, 22, 23)
        { id: 'f1', toothNumber: 21, status: 'Filled', surface: 'M', createdAt: '2026-01-01T00:00:00Z' },
        { id: 'f2', toothNumber: 22, status: 'Filled', surface: 'D', createdAt: '2026-01-01T00:00:00Z' },
        { id: 'f3', toothNumber: 23, status: 'Filled', surface: 'O', createdAt: '2026-01-01T00:00:00Z' },

        // 2 teeth with Missing only (31, 32)
        { id: 'm1', toothNumber: 31, status: 'Missing', createdAt: '2026-01-01T00:00:00Z' },
        { id: 'm2', toothNumber: 32, status: 'Missing', createdAt: '2026-01-01T00:00:00Z' },

        // 2 teeth with BOTH Decay and Filled (41, 42)
        { id: 'df1_f', toothNumber: 41, status: 'Filled', surface: 'O', createdAt: '2025-01-01T00:00:00Z' },
        { id: 'df1_d', toothNumber: 41, status: 'Decayed', surface: 'M', createdAt: '2026-01-01T00:00:00Z' },
        { id: 'df2_f', toothNumber: 42, status: 'Filled', surface: 'O', createdAt: '2025-01-01T00:00:00Z' },
        { id: 'df2_d', toothNumber: 42, status: 'Decayed', surface: 'D', createdAt: '2026-01-01T00:00:00Z' },

        // 1 tooth with BOTH Missing and Filled (43)
        { id: 'mf1_f', toothNumber: 43, status: 'Filled', surface: 'MOD', createdAt: '2025-01-01T00:00:00Z' },
        { id: 'mf1_m', toothNumber: 43, status: 'Missing', createdAt: '2026-01-01T00:00:00Z' },

        // 1 tooth with Decay, Missing, AND Filled (44)
        { id: 'dmf_d', toothNumber: 44, status: 'Decayed', surface: 'B', createdAt: '2026-01-01T00:00:00Z' },
        { id: 'dmf_m', toothNumber: 44, status: 'Missing', createdAt: '2026-02-01T00:00:00Z' },
        { id: 'dmf_f', toothNumber: 44, status: 'Filled', surface: 'L', createdAt: '2025-01-01T00:00:00Z' },

        // 3 teeth with Crown only (15, 25, 35)
        { id: 'c1', toothNumber: 15, status: 'Crowned', createdAt: '2026-01-01T00:00:00Z' },
        { id: 'c2', toothNumber: 25, status: 'Crowned', createdAt: '2026-01-01T00:00:00Z' },
        { id: 'c3', toothNumber: 35, status: 'Crowned', createdAt: '2026-01-01T00:00:00Z' },

        // 2 teeth with Extraction only (16, 26)
        { id: 'e1', toothNumber: 16, status: 'ForExtraction', createdAt: '2026-01-01T00:00:00Z' },
        { id: 'e2', toothNumber: 26, status: 'ForExtraction', createdAt: '2026-01-01T00:00:00Z' },

        // 14 remaining healthy teeth
        { id: 'h1', toothNumber: 17, status: 'Healthy', createdAt: '2026-01-01T00:00:00Z' },
        { id: 'h2', toothNumber: 18, status: 'Healthy', createdAt: '2026-01-01T00:00:00Z' },
        { id: 'h3', toothNumber: 27, status: 'Healthy', createdAt: '2026-01-01T00:00:00Z' },
        { id: 'h4', toothNumber: 28, status: 'Healthy', createdAt: '2026-01-01T00:00:00Z' },
        { id: 'h5', toothNumber: 33, status: 'Healthy', createdAt: '2026-01-01T00:00:00Z' },
        { id: 'h6', toothNumber: 34, status: 'Healthy', createdAt: '2026-01-01T00:00:00Z' },
        { id: 'h7', toothNumber: 36, status: 'Healthy', createdAt: '2026-01-01T00:00:00Z' },
        { id: 'h8', toothNumber: 37, status: 'Healthy', createdAt: '2026-01-01T00:00:00Z' },
        { id: 'h9', toothNumber: 38, status: 'Healthy', createdAt: '2026-01-01T00:00:00Z' },
        { id: 'h10', toothNumber: 45, status: 'Healthy', createdAt: '2026-01-01T00:00:00Z' },
        { id: 'h11', toothNumber: 46, status: 'Healthy', createdAt: '2026-01-01T00:00:00Z' },
        { id: 'h12', toothNumber: 47, status: 'Healthy', createdAt: '2026-01-01T00:00:00Z' },
        { id: 'h13', toothNumber: 48, status: 'Healthy', createdAt: '2026-01-01T00:00:00Z' },
        { id: 'h14', toothNumber: 999, status: 'Healthy', createdAt: '2026-01-01T00:00:00Z' },
      ];

      const metrics = calculateDmftMetrics(records);

      // Decayed teeth = {11, 12, 13, 14, 41, 42, 44} -> 7 teeth
      expect(metrics.decayedCount).toBe(7);

      // Missing teeth = {31, 32, 43, 44} -> 4 teeth
      expect(metrics.missingCount).toBe(4);

      // Filled teeth = {21, 22, 23, 41, 42, 43, 44} -> 7 teeth
      expect(metrics.filledCount).toBe(7);

      // Crown teeth = {15, 25, 35} -> 3 teeth
      expect(metrics.crownCount).toBe(3);

      // Extraction teeth = {16, 26} -> 2 teeth
      expect(metrics.extractionCount).toBe(2);

      // Distinct DMFT teeth = {11, 12, 13, 14, 21, 22, 23, 31, 32, 41, 42, 43, 44} -> exactly 13 teeth
      expect(metrics.dmftScore).toBe(13);

      // Verification: dmftScore (13) is strictly LESS than the naive sum (7 + 4 + 7 = 18)
      expect(metrics.dmftScore).toBeLessThan(metrics.decayedCount + metrics.missingCount + metrics.filledCount);
    });

    test('2.4 All-Healthy and Empty mouth records correctly yield 0 DMFT score', () => {
      const emptyMetrics = calculateDmftMetrics([]);
      expect(emptyMetrics.totalCharted).toBe(0);
      expect(emptyMetrics.dmftScore).toBe(0);
      expect(emptyMetrics.decayedCount).toBe(0);
      expect(emptyMetrics.missingCount).toBe(0);
      expect(emptyMetrics.filledCount).toBe(0);

      const allHealthy = [11, 12, 13, 14, 21, 22].map((num) => ({
        id: `h-${num}`,
        toothNumber: num,
        status: 'Healthy' as const,
        createdAt: '2026-01-01T00:00:00Z',
      }));

      const healthyMetrics = calculateDmftMetrics(allHealthy);
      expect(healthyMetrics.totalCharted).toBe(6);
      expect(healthyMetrics.healthyCount).toBe(6);
      expect(healthyMetrics.dmftScore).toBe(0);
    });

    test('2.5 Duplicate condition records on same tooth do not inflate counts', () => {
      const duplicateRecords = [
        { id: '1', toothNumber: 16, status: 'Decayed' as const, surface: 'O', createdAt: '2026-01-01T00:00:00Z' },
        { id: '2', toothNumber: 16, status: 'Decayed' as const, surface: 'O', createdAt: '2026-01-02T00:00:00Z' },
        { id: '3', toothNumber: 16, status: 'Decayed' as const, surface: 'M', createdAt: '2026-01-03T00:00:00Z' },
      ];

      const metrics = calculateDmftMetrics(duplicateRecords);
      expect(metrics.decayedCount).toBe(1);
      expect(metrics.dmftScore).toBe(1);
      expect(metrics.totalCharted).toBe(1);
    });
  });

  // =========================================================================
  // SUITE 3: 5-Surface Diagram Zone Coloring & Quadrant Midline Orientation
  // =========================================================================
  describe('Suite 3: 5-Surface Diagram Midline & Multi-Condition Color Mapping', () => {
    test('3.1 Right quadrants (Q1, Q4, Q5, Q8): Left is Distal (D) and Right is Mesial (M)', () => {
      for (const num of [16, 46, 55, 85]) {
        expect(isRightQuadrant(num)).toBe(true);
        const surfaces = getSurfacesForQuadrant(num);
        expect(surfaces.top).toBe('B');
        expect(surfaces.bottom).toBe('L');
        expect(surfaces.center).toBe('O');
        expect(surfaces.left).toBe('D');
        expect(surfaces.right).toBe('M');
      }
    });

    test('3.2 Left quadrants (Q2, Q3, Q6, Q7): Left is Mesial (M) and Right is Distal (D)', () => {
      for (const num of [26, 36, 65, 75]) {
        expect(isRightQuadrant(num)).toBe(false);
        const surfaces = getSurfacesForQuadrant(num);
        expect(surfaces.top).toBe('B');
        expect(surfaces.bottom).toBe('L');
        expect(surfaces.center).toBe('O');
        expect(surfaces.left).toBe('M');
        expect(surfaces.right).toBe('D');
      }
    });

    test('3.3 Multi-condition tooth surface coloring maps Filled(O) to infoBg and Decay(MD) to emergencyBg', () => {
      const conditions = [
        { status: 'Filled' as const, surface: 'O' },
        { status: 'Decayed' as const, surface: 'MD' },
      ];

      const oZone = getSurfaceZoneColor('O', conditions);
      expect(oZone.bg).toBe(theme.colors.infoBg);
      expect(oZone.border).toBe(theme.colors.infoBorder);
      expect(oZone.status).toBe('Filled');

      const mZone = getSurfaceZoneColor('M', conditions);
      expect(mZone.bg).toBe(theme.colors.emergencyBg);
      expect(mZone.border).toBe(theme.colors.emergencyBorder);
      expect(mZone.status).toBe('Decayed');

      const dZone = getSurfaceZoneColor('D', conditions);
      expect(dZone.bg).toBe(theme.colors.emergencyBg);
      expect(dZone.border).toBe(theme.colors.emergencyBorder);
      expect(dZone.status).toBe('Decayed');

      const bZone = getSurfaceZoneColor('B', conditions);
      expect(bZone.bg).toBe(theme.colors.surface);
      expect(bZone.border).toBe(theme.colors.border);
      expect(bZone.status).toBeUndefined();
    });
  });

  // =========================================================================
  // SUITE 4: Regression Audit (Empirical Fallback Verification)
  // =========================================================================
  describe('Suite 4: Regression Audit — getPlainEnglishToothName Fallback Verification', () => {
    test('4.1 Empirical demonstration: getPlainEnglishToothName returns robust fallback strings for non-standard teeth', () => {
      // Prior to M2 remediation, getPlainEnglishToothName returned invalid anatomical names.
      // With FDI range validation in getToothDescription, non-standard teeth return fallback string:
      const name99 = getPlainEnglishToothName(99);
      const name0 = getPlainEnglishToothName(0);
      const nameNeg = getPlainEnglishToothName(-1);

      // Verified robust fallback strings:
      expect(name99).toBe('Tooth #99');
      expect(name0).toBe('Tooth #0');
      expect(nameNeg).toBe('Tooth #-1');
    });
  });

  // =========================================================================
  // SUITE 5: 5-Surface Trapezoid SVG & Longitudinal Surface Progression (t1 -> t2 -> t3 -> t4)
  // =========================================================================
  describe('Suite 5: 5-Surface Trapezoid SVG & Longitudinal Surface Progression', () => {
    test('5.1 ToothSurfaceDiagram renders 5 angled SVG trapezoid/rect zones (B, L, M, D, O) with soft semantic fills and cross overlay for Missing/Extraction', () => {
      const html = renderToStaticMarkup(
        React.createElement(ToothSurfaceDiagram, {
          toothNumber: 16,
          conditions: [
            { status: 'Decayed', surface: 'M', activeSurface: 'M', isCurrent: true },
            { status: 'Filled', surface: 'O', activeSurface: 'O', isCurrent: true },
          ],
          size: 80,
          showLabels: true,
        })
      );

      expect(html).toContain('M 0 0 L 100 0 L 72 28 L 28 28 Z');
      expect(html).toContain('M 28 72 L 72 72 L 100 100 L 0 100 Z');
      expect(html).toContain('M 0 0 L 28 28 L 28 72 L 0 100 Z');
      expect(html).toContain('M 72 28 L 100 0 L 100 100 L 72 72 Z');

      const missingHtml = renderToStaticMarkup(
        React.createElement(ToothSurfaceDiagram, {
          toothNumber: 18,
          conditions: [{ status: 'Missing', surface: '', activeSurface: '', isCurrent: true }],
          size: 40,
        })
      );
      expect(missingHtml).toContain('x1="14"');
      expect(missingHtml).toContain('y2="86"');
    });

    test('5.2 Longitudinal progression: Decay(MO) -> Filled(O) -> Filled(MO) -> Missing tracks activeSurface, supersedes prior records, and guards Missing teeth', () => {
      // t1: Decay on MO
      let records = applyStagedConditionToTooth([], {
        id: 'rec-t1-decay',
        toothNumber: 16,
        status: 'Decayed',
        surface: 'MO',
        notes: 'Initial mesial-occlusal caries',
        recordedBy: 'Dr. Maria Santos',
        createdAt: '2026-01-10T09:00:00Z',
      });
      expect(records.length).toBe(1);
      expect(records[0].status).toBe('Decayed');
      expect(records[0].surface).toBe('MO');
      expect(records[0].activeSurface).toBe('MO');
      expect(records[0].isCurrent).toBe(true);

      // t2: Partial restoration — Filled on O (M remains decayed)
      records = applyStagedConditionToTooth(records, {
        id: 'rec-t2-filled-o',
        toothNumber: 16,
        status: 'Filled',
        surface: 'O',
        notes: 'Occlusal composite placed',
        recordedBy: 'Dr. Maria Santos',
        createdAt: '2026-02-01T10:00:00Z',
      });
      expect(records.length).toBe(2);
      const decayAfterPartial = records.find((r) => r.status === 'Decayed')!;
      const filledAfterPartial = records.find((r) => r.status === 'Filled')!;
      expect(decayAfterPartial.surface).toBe('MO'); // Historical surface preserved
      expect(decayAfterPartial.activeSurface).toBe('M'); // Only M still actively decayed
      expect(decayAfterPartial.isCurrent).toBe(true);
      expect(filledAfterPartial.activeSurface).toBe('O');
      expect(filledAfterPartial.isCurrent).toBe(true);

      expect(getSurfaceZoneColor('M', records).status).toBe('Decayed');
      expect(getSurfaceZoneColor('O', records).status).toBe('Filled');

      // t3: Complete restoration — Filled on M (completing MO)
      records = applyStagedConditionToTooth(records, {
        id: 'rec-t3-filled-m',
        toothNumber: 16,
        status: 'Filled',
        surface: 'M',
        notes: 'Mesial restoration completed',
        recordedBy: 'Dr. Maria Santos',
        createdAt: '2026-02-15T11:00:00Z',
      });
      const decayAfterComplete = records.find((r) => r.status === 'Decayed')!;
      const filledRecordsAfterComplete = records.filter((r) => r.status === 'Filled' && r.isCurrent !== false);
      expect(decayAfterComplete.surface).toBe('MO'); // Original recorded surface intact for audit
      expect(decayAfterComplete.activeSurface).toBe('');
      expect(decayAfterComplete.isCurrent).toBe(false); // Superseded!
      expect(decayAfterComplete.supersededAt).toBe('2026-02-15T11:00:00Z');
      expect(sortToothSurfaces(filledRecordsAfterComplete.map((r) => r.activeSurface || '').join(''))).toBe('MO');

      // Surface M and O now both resolve to Filled
      expect(getSurfaceZoneColor('M', records).status).toBe('Filled');
      expect(getSurfaceZoneColor('O', records).status).toBe('Filled');

      // DMFT metrics exclude superseded Decay from active decayedCount
      const dmftAtT3 = calculateDmftMetrics({ 16: records });
      expect(dmftAtT3.decayedCount).toBe(0);
      expect(dmftAtT3.filledCount).toBe(1);
      expect(dmftAtT3.dmftScore).toBe(1);

      // t4: Tooth extracted -> Missing supersedes all prior records
      records = applyStagedConditionToTooth(records, {
        id: 'rec-t4-missing',
        toothNumber: 16,
        status: 'Missing',
        notes: 'Tooth extracted',
        recordedBy: 'Dr. Roberto Cruz',
        createdAt: '2026-06-01T14:00:00Z',
      });
      expect(records.filter((r) => r.isCurrent !== false).length).toBe(1);
      expect(records.find((r) => r.isCurrent !== false)?.status).toBe('Missing');

      const dmftAtT4 = calculateDmftMetrics({ 16: records });
      expect(dmftAtT4.decayedCount).toBe(0);
      expect(dmftAtT4.filledCount).toBe(0);
      expect(dmftAtT4.missingCount).toBe(1);
      expect(dmftAtT4.dmftScore).toBe(1);

      // t5: Subsequent encounter -> Implant placed on previously Missing tooth supersedes Missing while preserving full stack
      expect(canApplyConditionToTooth(records, 'Implant').allowed).toBe(true);
      records = applyStagedConditionToTooth(records, {
        id: 'rec-t5-implant',
        toothNumber: 16,
        status: 'Implant',
        notes: 'Pontic / Implant placed at edentulous site',
        recordedBy: 'Dr. Roberto Cruz',
        createdAt: '2026-09-01T14:00:00Z',
        isCurrentEncounter: true,
      });
      expect(records.filter((r) => r.isCurrent !== false).length).toBe(1);
      expect(records.find((r) => r.isCurrent !== false)?.status).toBe('Implant');
      expect(records.find((r) => r.id === 'rec-t4-missing')?.isCurrent).toBe(false);
    });

    test('5.3 Whole-tooth statuses (Healthy, Missing, Extraction) disable surface selection and apply to whole tooth', () => {
      expect(isWholeToothStatus('Healthy')).toBe(true);
      expect(isWholeToothStatus('Missing')).toBe(true);
      expect(isWholeToothStatus('ForExtraction')).toBe(true);
      expect(isWholeToothStatus('Decayed')).toBe(false);
      expect(isWholeToothStatus('Filled')).toBe(false);
      expect(isWholeToothStatus('Crowned')).toBe(false);

      // Extraction clears surfaces and supersedes prior encounter surface conditions
      const priorDecay = applyStagedConditionToTooth([], {
        id: 'rec-enc1-decay',
        toothNumber: 16,
        status: 'Decayed',
        surface: 'MO',
        consultationId: 'enc-1',
        isCurrentEncounter: false,
      });

      const afterExtraction = applyStagedConditionToTooth(priorDecay, {
        id: 'rec-enc2-extraction',
        toothNumber: 16,
        status: 'ForExtraction',
        surface: 'MO', // Even if passed, must be cleared to ''
        consultationId: 'enc-2',
        isCurrentEncounter: true,
      });

      const activeExtraction = afterExtraction.find((r) => r.status === 'ForExtraction')!;
      const supersededDecay = afterExtraction.find((r) => r.status === 'Decayed')!;
      expect(activeExtraction.surface).toBe('');
      expect(activeExtraction.activeSurface).toBe('');
      expect(activeExtraction.isCurrent).toBe(true);
      expect(supersededDecay.isCurrent).toBe(false);
      expect(supersededDecay.activeSurface).toBe('');
    });

    test('5.4 Same-encounter surface conflict lock blocks overlapping status in current encounter, while new encounter supersedes into history', () => {
      // Encounter 1: Record Decay on surface O
      const enc1Records = applyStagedConditionToTooth([], {
        id: 'rec-enc1-o',
        toothNumber: 26,
        status: 'Decayed',
        surface: 'O',
        consultationId: 'enc-1',
        isCurrentEncounter: true,
        createdAt: '2026-01-10T09:00:00Z',
      });

      // Same encounter (enc-1): Surface O is locked! Cannot add Filled on O or MO in enc-1
      const lockInEnc1 = getCurrentEncounterLockedState(enc1Records, 'enc-1');
      expect(lockInEnc1.lockedSurfaces.has('O')).toBe(true);
      expect(lockInEnc1.lockedSurfaces.has('M')).toBe(false);

      expect(canApplyConditionToTooth(enc1Records, 'Filled', 'O', 'enc-1').allowed).toBe(false);
      expect(canApplyConditionToTooth(enc1Records, 'Filled', 'MO', 'enc-1').allowed).toBe(false);

      // Same encounter (enc-1): Non-overlapping surface M IS allowed!
      expect(canApplyConditionToTooth(enc1Records, 'Filled', 'M', 'enc-1').allowed).toBe(true);

      // Next encounter (enc-2): Prior encounter record has isCurrentEncounter = false
      const priorForEnc2 = enc1Records.map((r) => ({ ...r, isCurrentEncounter: false }));
      expect(canApplyConditionToTooth(priorForEnc2, 'Filled', 'O', 'enc-2').allowed).toBe(true);

      const enc2Records = applyStagedConditionToTooth(priorForEnc2, {
        id: 'rec-enc2-o',
        toothNumber: 26,
        status: 'Filled',
        surface: 'O',
        consultationId: 'enc-2',
        isCurrentEncounter: true,
        createdAt: '2026-02-10T09:00:00Z',
      });

      const historicalDecay = enc2Records.find((r) => r.status === 'Decayed')!;
      const currentFilled = enc2Records.find((r) => r.status === 'Filled')!;
      expect(historicalDecay.isCurrent).toBe(false);
      expect(currentFilled.isCurrent).toBe(true);
      expect(currentFilled.activeSurface).toBe('O');
    });

    test('5.5 Multiple surface statuses on the same tooth in the same encounter (Sealant on MOB + Fractured on DL) do not trigger false whole-tooth lock alert', () => {
      // Step 1: Record Sealant on MOB of Tooth #21 in enc-1
      let tooth21Records = applyStagedConditionToTooth([], {
        id: 'rec-21-sealant',
        toothNumber: 21,
        status: 'Sealant',
        surface: 'MOB',
        consultationId: 'enc-1',
        isCurrentEncounter: true,
      });

      const lockAfterFirst = getCurrentEncounterLockedState(tooth21Records, 'enc-1');
      expect(lockAfterFirst.isWholeToothLocked).toBe(false);
      expect(Array.from(lockAfterFirst.lockedSurfaces).sort()).toEqual(['B', 'M', 'O']);

      // Empty staged surface after saving does not emit a false conflict alert
      const emptySurfaceCheckAfterFirst = canApplyConditionToTooth(
        tooth21Records,
        'Fractured',
        '',
        'enc-1'
      );
      expect(emptySurfaceCheckAfterFirst.allowed).toBe(false);
      expect(emptySurfaceCheckAfterFirst.reason).toBeUndefined();

      // Selecting Fractured on remaining surfaces DL is allowed
      expect(canApplyConditionToTooth(tooth21Records, 'Fractured', undefined, 'enc-1').allowed).toBe(true);
      expect(canApplyConditionToTooth(tooth21Records, 'Fractured', 'DL', 'enc-1').allowed).toBe(true);

      // Step 2: Record Fractured on DL of Tooth #21 in the same encounter (enc-1)
      tooth21Records = applyStagedConditionToTooth(tooth21Records, {
        id: 'rec-21-fractured',
        toothNumber: 21,
        status: 'Fractured',
        surface: 'DL',
        consultationId: 'enc-1',
        isCurrentEncounter: true,
      });

      expect(tooth21Records.filter((r) => r.isCurrent !== false).length).toBe(2);
      const lockAfterSecond = getCurrentEncounterLockedState(tooth21Records, 'enc-1');
      // Even though all 5 surfaces (M, O, B, D, L) now have surface conditions, isWholeToothLocked must remain false
      expect(lockAfterSecond.isWholeToothLocked).toBe(false);
      expect(lockAfterSecond.lockedSurfaces.size).toBe(5);

      // Empty staged surface after saving second condition must NOT show a false warning reason
      const emptySurfaceCheckAfterSecond = canApplyConditionToTooth(
        tooth21Records,
        'Fractured',
        '',
        'enc-1'
      );
      expect(emptySurfaceCheckAfterSecond.allowed).toBe(false);
      expect(emptySurfaceCheckAfterSecond.reason).toBeUndefined();
    });
  });
});

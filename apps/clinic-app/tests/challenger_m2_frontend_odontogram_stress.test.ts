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
  getDominantToothStatus,
  getConditionDotColor,
} = await import('../components/dental');

const { theme } = await import('../constants/theme');
const { InlineDentalChartCard } = await import('../components/consultation/InlineDentalChartCard');
const { default: DentalChartTab, getPlainEnglishToothName } = await import('../components/chart/DentalChartTab');

describe('Challenger M2: Empirical Stress Test Suite (5-Surface Odontogram & Tooth Inspector)', () => {
  // =========================================================================
  // SUITE 1: Multi-Condition Tooth Inspector Stress Testing
  // =========================================================================
  describe('Suite 1: Multi-Condition Tooth Inspector Verification', () => {
    const quadConditionTooth16 = {
      16: [
        {
          id: 'cond-16-filled',
          toothNumber: 16,
          status: 'Filled' as const,
          surface: 'O',
          notes: 'Occlusal composite restoration placed in 2024',
          createdAt: '2024-03-12T08:30:00Z',
          recordedBy: 'Dr. Maria Santos',
        },
        {
          id: 'cond-16-decay',
          toothNumber: 16,
          status: 'Decay' as const,
          surface: 'MD',
          notes: 'Mesial and distal marginal leakage caries',
          createdAt: '2026-02-14T11:15:00Z',
          recordedBy: 'Dr. Juan Reyes',
        },
        {
          id: 'cond-16-crown',
          toothNumber: 16,
          status: 'Crown' as const,
          surface: '',
          notes: 'Full porcelain-fused-to-metal crown recommended',
          createdAt: '2026-06-01T14:00:00Z',
          recordedBy: 'Dr. Ana Lim',
        },
        {
          id: 'cond-16-extraction',
          toothNumber: 16,
          status: 'Extraction' as const,
          surface: '',
          notes: 'Severe grade 3 mobility, extraction planned',
          createdAt: '2026-10-20T09:45:00Z',
          recordedBy: 'Dr. Roberto Cruz',
        },
      ],
    };

    test('1.1 InlineDentalChartCard inspector renders all 4 simultaneous conditions with badges, notes, timestamp, doctor, and remove button', () => {
      const html = renderToStaticMarkup(
        React.createElement(InlineDentalChartCard, {
          chart: quadConditionTooth16,
          initialToothNumber: 16,
        })
      );

      // Section header
      expect(html).toContain('Recorded Conditions on Tooth #16');

      // 4 Condition Badges
      expect(html).toContain('data-testid="condition-item-cond-16-filled"');
      expect(html).toContain('data-testid="condition-item-cond-16-decay"');
      expect(html).toContain('data-testid="condition-item-cond-16-crown"');
      expect(html).toContain('data-testid="condition-item-cond-16-extraction"');

      // Affected Surfaces
      expect(html).toContain('Surfaces: O');
      expect(html).toContain('Surfaces: MD');
      expect(html).toContain('Full Tooth / Intact');

      // Clinical Notes for each condition
      expect(html).toContain('Occlusal composite restoration placed in 2024');
      expect(html).toContain('Mesial and distal marginal leakage caries');
      expect(html).toContain('Full porcelain-fused-to-metal crown recommended');
      expect(html).toContain('Severe grade 3 mobility, extraction planned');

      // Attending Clinicians
      expect(html).toContain('Dr. Maria Santos');
      expect(html).toContain('Dr. Juan Reyes');
      expect(html).toContain('Dr. Ana Lim');
      expect(html).toContain('Dr. Roberto Cruz');

      // Remove buttons for each condition
      expect(html).toContain('data-testid="remove-condition-cond-16-filled"');
      expect(html).toContain('data-testid="remove-condition-cond-16-decay"');
      expect(html).toContain('data-testid="remove-condition-cond-16-crown"');
      expect(html).toContain('data-testid="remove-condition-cond-16-extraction"');
    });

    test('1.2 DentalChartTab inspector renders all 4 simultaneous conditions with badges, notes, timestamp, doctor, and remove button', () => {
      let removedTooth: number | null = null;
      let removedCond: string | null = null;
      const handleRemove = (tooth: number, cond: string) => {
        removedTooth = tooth;
        removedCond = cond;
      };

      const html = renderToStaticMarkup(
        React.createElement(DentalChartTab, {
          chart: {
            dentalTeeth: quadConditionTooth16[16],
          },
          focusToothNumber: 16,
          onRemoveCondition: handleRemove,
        })
      );

      // Inspector pane exists
      expect(html).toContain('data-testid="tooth-inspector-pane"');
      expect(html).toContain('Tooth #16');
      expect(html).toContain('RECORDED CONDITIONS ON TOOTH #16 (4)');

      // All 4 condition items rendered in DentalChartTab
      expect(html).toContain('data-testid="tab-condition-cond-16-filled"');
      expect(html).toContain('data-testid="tab-condition-cond-16-decay"');
      expect(html).toContain('data-testid="tab-condition-cond-16-crown"');
      expect(html).toContain('data-testid="tab-condition-cond-16-extraction"');

      // Doctor names & notes
      expect(html).toContain('Dr. Maria Santos');
      expect(html).toContain('Dr. Roberto Cruz');
      expect(html).toContain('Severe grade 3 mobility, extraction planned');

      // Tab remove buttons
      expect(html).toContain('data-testid="tab-remove-condition-cond-16-filled"');
      expect(html).toContain('data-testid="tab-remove-condition-cond-16-decay"');
      expect(html).toContain('data-testid="tab-remove-condition-cond-16-crown"');
      expect(html).toContain('data-testid="tab-remove-condition-cond-16-extraction"');
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

    test('1.4 Co-existing conditions render colored status dots on odontogram tooth cell', () => {
      const html = renderToStaticMarkup(
        React.createElement(DentalChartTab, {
          chart: {
            dentalTeeth: quadConditionTooth16[16],
          },
        })
      );

      expect(html).toContain('data-testid="multi-dots-16"');
      expect(html).toContain('data-testid="dot-decay-16"');
      expect(html).toContain('data-testid="dot-filled-16"');
      expect(html).toContain('data-testid="dot-crown-16"');
      expect(html).toContain('data-testid="dot-extraction-16"');
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
          status: 'Decay' as const,
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
        { id: '2', toothNumber: 24, status: 'Decay' as const, surface: 'B', createdAt: '2025-01-01T00:00:00Z' },
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
        { id: 'd1', toothNumber: 11, status: 'Decay', surface: 'M', createdAt: '2026-01-01T00:00:00Z' },
        { id: 'd2', toothNumber: 12, status: 'Decay', surface: 'D', createdAt: '2026-01-01T00:00:00Z' },
        { id: 'd3', toothNumber: 13, status: 'Decay', surface: 'O', createdAt: '2026-01-01T00:00:00Z' },
        { id: 'd4', toothNumber: 14, status: 'Decay', surface: 'B', createdAt: '2026-01-01T00:00:00Z' },

        // 3 teeth with Filled only (21, 22, 23)
        { id: 'f1', toothNumber: 21, status: 'Filled', surface: 'M', createdAt: '2026-01-01T00:00:00Z' },
        { id: 'f2', toothNumber: 22, status: 'Filled', surface: 'D', createdAt: '2026-01-01T00:00:00Z' },
        { id: 'f3', toothNumber: 23, status: 'Filled', surface: 'O', createdAt: '2026-01-01T00:00:00Z' },

        // 2 teeth with Missing only (31, 32)
        { id: 'm1', toothNumber: 31, status: 'Missing', createdAt: '2026-01-01T00:00:00Z' },
        { id: 'm2', toothNumber: 32, status: 'Missing', createdAt: '2026-01-01T00:00:00Z' },

        // 2 teeth with BOTH Decay and Filled (41, 42)
        { id: 'df1_f', toothNumber: 41, status: 'Filled', surface: 'O', createdAt: '2025-01-01T00:00:00Z' },
        { id: 'df1_d', toothNumber: 41, status: 'Decay', surface: 'M', createdAt: '2026-01-01T00:00:00Z' },
        { id: 'df2_f', toothNumber: 42, status: 'Filled', surface: 'O', createdAt: '2025-01-01T00:00:00Z' },
        { id: 'df2_d', toothNumber: 42, status: 'Decay', surface: 'D', createdAt: '2026-01-01T00:00:00Z' },

        // 1 tooth with BOTH Missing and Filled (43)
        { id: 'mf1_f', toothNumber: 43, status: 'Filled', surface: 'MOD', createdAt: '2025-01-01T00:00:00Z' },
        { id: 'mf1_m', toothNumber: 43, status: 'Missing', createdAt: '2026-01-01T00:00:00Z' },

        // 1 tooth with Decay, Missing, AND Filled (44)
        { id: 'dmf_d', toothNumber: 44, status: 'Decay', surface: 'B', createdAt: '2026-01-01T00:00:00Z' },
        { id: 'dmf_m', toothNumber: 44, status: 'Missing', createdAt: '2026-02-01T00:00:00Z' },
        { id: 'dmf_f', toothNumber: 44, status: 'Filled', surface: 'L', createdAt: '2025-01-01T00:00:00Z' },

        // 3 teeth with Crown only (15, 25, 35)
        { id: 'c1', toothNumber: 15, status: 'Crown', createdAt: '2026-01-01T00:00:00Z' },
        { id: 'c2', toothNumber: 25, status: 'Crown', createdAt: '2026-01-01T00:00:00Z' },
        { id: 'c3', toothNumber: 35, status: 'Crown', createdAt: '2026-01-01T00:00:00Z' },

        // 2 teeth with Extraction only (16, 26)
        { id: 'e1', toothNumber: 16, status: 'Extraction', createdAt: '2026-01-01T00:00:00Z' },
        { id: 'e2', toothNumber: 26, status: 'Extraction', createdAt: '2026-01-01T00:00:00Z' },

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
        { id: '1', toothNumber: 16, status: 'Decay' as const, surface: 'O', createdAt: '2026-01-01T00:00:00Z' },
        { id: '2', toothNumber: 16, status: 'Decay' as const, surface: 'O', createdAt: '2026-01-02T00:00:00Z' },
        { id: '3', toothNumber: 16, status: 'Decay' as const, surface: 'M', createdAt: '2026-01-03T00:00:00Z' },
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
        { status: 'Decay' as const, surface: 'MD' },
      ];

      const oZone = getSurfaceZoneColor('O', conditions);
      expect(oZone.bg).toBe(theme.colors.infoBg);
      expect(oZone.border).toBe(theme.colors.infoBorder);
      expect(oZone.status).toBe('Filled');

      const mZone = getSurfaceZoneColor('M', conditions);
      expect(mZone.bg).toBe(theme.colors.emergencyBg);
      expect(mZone.border).toBe(theme.colors.emergencyBorder);
      expect(mZone.status).toBe('Decay');

      const dZone = getSurfaceZoneColor('D', conditions);
      expect(dZone.bg).toBe(theme.colors.emergencyBg);
      expect(dZone.border).toBe(theme.colors.emergencyBorder);
      expect(dZone.status).toBe('Decay');

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
});

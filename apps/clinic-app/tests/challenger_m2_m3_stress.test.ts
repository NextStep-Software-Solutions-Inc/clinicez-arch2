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
    testID,
    style,
    onPress,
    placeholder,
    ...props
  }: any) =>
    React.createElement(
      'div',
      {
        'data-component': name,
        ...(testID ? { 'data-testid': testID } : {}),
        ...(accessibilityLabel ? { 'aria-label': accessibilityLabel } : {}),
        ...(accessibilityRole ? { role: accessibilityRole } : {}),
        ...(placeholder ? { 'data-placeholder': placeholder } : {}),
        ...(onPress ? { onClick: onPress } : {}),
        ...props,
      },
      placeholder,
      children
    );
  Comp.displayName = name;
  return Comp;
};

mock.module('react-native', () => ({
  Linking: { openURL: () => Promise.resolve(), canOpenURL: () => Promise.resolve(true) },
  StyleSheet: { create: (s: any) => s, flatten: (s: any) => s, absoluteFill: {} },
  View: createMockComponent('View'),
  Pressable: createMockComponent('Pressable'),
  ScrollView: createMockComponent('ScrollView'),
  TextInput: createMockComponent('TextInput'),
  Text: createMockComponent('Text'),
  ActivityIndicator: createMockComponent('ActivityIndicator'),
  Modal: createMockComponent('Modal'),
  KeyboardAvoidingView: createMockComponent('KeyboardAvoidingView'),
  Platform: { OS: 'web', select: (obj: any) => obj.web ?? obj.default },
  Dimensions: { get: () => ({ width: 1280, height: 800 }), addEventListener: () => ({ remove: () => {} }) },
  useWindowDimensions: () => ({ width: 1280, height: 800 }),
  Keyboard: { dismiss: () => {}, addListener: () => ({ remove: () => {} }) },
  AppState: { addEventListener: () => ({ remove: () => {} }) },
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
}));

mock.module('react-native-svg', () => ({
  Svg: createMockComponent('Svg'),
  Path: createMockComponent('Path'),
  Circle: createMockComponent('Circle'),
  Rect: createMockComponent('Rect'),
  Line: createMockComponent('Line'),
  Defs: createMockComponent('Defs'),
  LinearGradient: createMockComponent('LinearGradient'),
  Stop: createMockComponent('Stop'),
  G: createMockComponent('G'),
  Text: createMockComponent('SvgText'),
  default: createMockComponent('Svg'),
}));

mock.module('../constants/fonts', () => ({
  applyFontFamily: (s: any) => s,
  fontAssets: {},
}));

const { default: TrendLineChart } = await import('../components/analytics/TrendLineChart');
const { default: WorkloadBarChart } = await import('../components/analytics/WorkloadBarChart');
const { default: TenderDonutChart } = await import('../components/analytics/TenderDonutChart');
const { default: MorbidityDistributionChart } = await import('../components/analytics/MorbidityDistributionChart');

describe('Challenger M2/M3: Adversarial SVG Charting Stress Suite', () => {

  // =========================================================================
  // 1. All-Zero Data Values & No NaN / Infinity Coordinates
  // =========================================================================
  describe('All-Zero Data Scenarios', () => {
    test('TrendLineChart with all-zero revenues produces valid SVG paths without NaN or Infinity', () => {
      const allZeroData = [
        { dateLabel: '2026-10-01', revenue: 0, patientCount: 0 },
        { dateLabel: '2026-10-02', revenue: 0, patientCount: 0 },
        { dateLabel: '2026-10-03', revenue: 0, patientCount: 0 },
      ];

      const markupRevenue = renderToStaticMarkup(
        React.createElement(TrendLineChart, { data: allZeroData, initialMetric: 'revenue' })
      );
      expect(markupRevenue).not.toContain('NaN');
      expect(markupRevenue).not.toContain('Infinity');
      expect(markupRevenue).toContain('data-component="Path"');
      expect(markupRevenue).toContain('data-component="Circle"');

      const markupVolume = renderToStaticMarkup(
        React.createElement(TrendLineChart, { data: allZeroData, initialMetric: 'volume' })
      );
      expect(markupVolume).not.toContain('NaN');
      expect(markupVolume).not.toContain('Infinity');
    });

    test('WorkloadBarChart with all-zero encounters and billed produces valid Rects without NaN or Infinity', () => {
      const allZeroWorkload = [
        { doctorName: 'Dr. Zero A', encountersCount: 0, totalBilled: 0 },
        { doctorName: 'Dr. Zero B', encountersCount: 0, totalBilled: 0 },
      ];

      const markup = renderToStaticMarkup(
        React.createElement(WorkloadBarChart, { data: allZeroWorkload })
      );
      expect(markup).not.toContain('NaN');
      expect(markup).not.toContain('Infinity');
      expect(markup).toContain('data-component="Rect"');
    });

    test('TenderDonutChart with all-zero amounts renders Empty State cleanly without dividing by zero', () => {
      const allZeroTenders = [
        { method: 'Cash', totalAmount: 0, percentage: 0 },
        { method: 'GCash', totalAmount: 0, percentage: 0 },
      ];

      const markup = renderToStaticMarkup(
        React.createElement(TenderDonutChart, { data: allZeroTenders })
      );
      expect(markup).not.toContain('NaN');
      expect(markup).not.toContain('Infinity');
      expect(markup).toContain('No Collections Recorded');
    });

    test('MorbidityDistributionChart with all-zero case counts produces valid bars without NaN', () => {
      const allZeroMorbidity = [
        { icd10Code: 'Z00.0', description: 'General checkup', totalCases: 0, percentageOfTotal: 0 },
        { icd10Code: 'R05', description: 'Cough', totalCases: 0, percentageOfTotal: 0 },
      ];

      const markup = renderToStaticMarkup(
        React.createElement(MorbidityDistributionChart, { data: allZeroMorbidity })
      );
      expect(markup).not.toContain('NaN');
      expect(markup).not.toContain('Infinity');
      expect(markup).toContain('data-component="Rect"');
    });
  });

  // =========================================================================
  // 2. Single Data Points & Arc Collapse Immunity
  // =========================================================================
  describe('Single Data Point Scenarios', () => {
    test('TrendLineChart single point renders a horizontal baseline without division by zero', () => {
      const singleData = [{ dateLabel: '2026-10-10', revenue: 25000, patientCount: 30 }];
      const markup = renderToStaticMarkup(
        React.createElement(TrendLineChart, { data: singleData })
      );
      expect(markup).not.toContain('NaN');
      expect(markup).not.toContain('Infinity');
      expect(markup).toContain('d="M');
      expect(markup).toContain('data-component="Circle"');
    });

    test('WorkloadBarChart single clinician renders centered bar without crash', () => {
      const singleDoc = [{ doctorName: 'Dr. Solo Clinician', encountersCount: 15, totalBilled: 45000 }];
      const markup = renderToStaticMarkup(
        React.createElement(WorkloadBarChart, { data: singleDoc })
      );
      expect(markup).not.toContain('NaN');
      expect(markup).not.toContain('Infinity');
      expect(markup).toContain('Dr. Solo Cl…');
    });

    test('TenderDonutChart 100% single share splits full 360-degree arc into two halves to prevent SVG arc collapse', () => {
      const singleTender = [{ method: 'Cash', totalAmount: 50000, percentage: 100 }];
      const markup = renderToStaticMarkup(
        React.createElement(TenderDonutChart, { data: singleTender })
      );
      expect(markup).not.toContain('NaN');
      expect(markup).not.toContain('Infinity');
      // Must contain dual SVG Arc command 'A '
      const matchArcs = markup.match(/A /g);
      expect(matchArcs).not.toBeNull();
      expect(matchArcs!.length).toBeGreaterThanOrEqual(2);
    });

    test('TenderDonutChart handles single non-zero item among multiple zero items without arc collapse', () => {
      const mixedTenders = [
        { method: 'Cash', totalAmount: 100000, percentage: 100 },
        { method: 'GCash', totalAmount: 0, percentage: 0 },
        { method: 'Maya', totalAmount: 0, percentage: 0 },
      ];
      const markup = renderToStaticMarkup(
        React.createElement(TenderDonutChart, { data: mixedTenders })
      );
      expect(markup).not.toContain('NaN');
      expect(markup).not.toContain('Infinity');
      const matchArcs = markup.match(/A /g);
      expect(matchArcs).not.toBeNull();
      expect(matchArcs!.length).toBeGreaterThanOrEqual(2);
    });

    test('MorbidityDistributionChart single item renders correctly', () => {
      const singleDisease = [{
        icd10Code: 'J06.9',
        description: 'Acute upper respiratory infection',
        totalCases: 50,
        pediatricCases: 25,
        adultCases: 20,
        seniorCases: 5,
        percentageOfTotal: 100,
      }];
      const markup = renderToStaticMarkup(
        React.createElement(MorbidityDistributionChart, { data: singleDisease })
      );
      expect(markup).not.toContain('NaN');
      expect(markup).not.toContain('Infinity');
      expect(markup).toContain('J06.9');
    });
  });

  // =========================================================================
  // 3. Empty Disease Lists and Empty Datasets (State 3 Verification)
  // =========================================================================
  describe('Empty Datasets Across All Charts', () => {
    test('TrendLineChart renders Empty State on empty array', () => {
      const markup = renderToStaticMarkup(React.createElement(TrendLineChart, { data: [] }));
      expect(markup).toContain('No Trend Data');
      expect(markup).not.toContain('NaN');
    });

    test('WorkloadBarChart renders Empty State on empty array', () => {
      const markup = renderToStaticMarkup(React.createElement(WorkloadBarChart, { data: [] }));
      expect(markup).toContain('No Clinician Workload');
      expect(markup).not.toContain('NaN');
    });

    test('TenderDonutChart renders Empty State on empty array', () => {
      const markup = renderToStaticMarkup(React.createElement(TenderDonutChart, { data: [] }));
      expect(markup).toContain('No Collections Recorded');
      expect(markup).not.toContain('NaN');
    });

    test('MorbidityDistributionChart renders Empty State on empty array', () => {
      const markup = renderToStaticMarkup(React.createElement(MorbidityDistributionChart, { data: [] }));
      expect(markup).toContain('No Morbidity Data');
      expect(markup).not.toContain('NaN');
    });
  });

  // =========================================================================
  // 4. Negative and Out-of-Order Data Handling
  // =========================================================================
  describe('Negative & Chronologically Out-of-Order Data', () => {
    test('TrendLineChart handles negative revenue (refunds) gracefully without NaN or coordinate explosion', () => {
      const negativeTrend = [
        { dateLabel: '2026-10-01', revenue: 10000, patientCount: 10 },
        { dateLabel: '2026-10-02', revenue: -5000, patientCount: 2 },
        { dateLabel: '2026-10-03', revenue: 15000, patientCount: 12 },
      ];
      const markup = renderToStaticMarkup(
        React.createElement(TrendLineChart, { data: negativeTrend })
      );
      expect(markup).not.toContain('NaN');
      expect(markup).not.toContain('Infinity');
      expect(markup).toContain('data-component="Path"');
    });

    test('TrendLineChart handles out-of-order dates without breaking SVG layout', () => {
      const outOfOrderTrend = [
        { dateLabel: '2026-10-25', revenue: 30000, patientCount: 20 },
        { dateLabel: '2026-10-01', revenue: 12000, patientCount: 8 },
        { dateLabel: '2026-10-15', revenue: 22000, patientCount: 15 },
      ];
      const markup = renderToStaticMarkup(
        React.createElement(TrendLineChart, { data: outOfOrderTrend })
      );
      expect(markup).not.toContain('NaN');
      expect(markup).not.toContain('Infinity');
      expect(markup).toContain('2026-10-25');
      expect(markup).toContain('2026-10-01');
    });

    test('WorkloadBarChart handles negative or zero billed amounts gracefully', () => {
      const negativeWorkload = [
        { doctorName: 'Dr. Adjusted', encountersCount: 5, totalBilled: -2000 },
        { doctorName: 'Dr. Regular', encountersCount: 10, totalBilled: 15000 },
      ];
      const markup = renderToStaticMarkup(
        React.createElement(WorkloadBarChart, { data: negativeWorkload, initialMetric: 'billed' })
      );
      expect(markup).not.toContain('NaN');
      expect(markup).not.toContain('Infinity');
    });

    test('TenderDonutChart ignores negative amounts and renders valid shares for remaining positive items', () => {
      const negativeTenders = [
        { method: 'Cash', totalAmount: 40000, percentage: 80 },
        { method: 'GCash', totalAmount: 10000, percentage: 20 },
        { method: 'Reversal', totalAmount: -5000, percentage: 0 },
      ];
      const markup = renderToStaticMarkup(
        React.createElement(TenderDonutChart, { data: negativeTenders })
      );
      expect(markup).not.toContain('NaN');
      expect(markup).not.toContain('Infinity');
      expect(markup).toContain('Cash');
      expect(markup).toContain('GCash');
    });
  });

  // =========================================================================
  // 5. Rigorous Coordinate & SVG Geometry Validation
  // =========================================================================
  describe('Rigorous SVG Coordinate and NaN/Infinity Regex Scan', () => {
    test('Extreme multi-million values across all 4 charts contain 0 NaN/Infinity occurrences', () => {
      const hugeTrend = [
        { dateLabel: '2026-10-01', revenue: 150000000, patientCount: 50000 },
        { dateLabel: '2026-10-02', revenue: 320000000, patientCount: 85000 },
      ];
      const hugeWorkload = [
        { doctorName: 'Dr. High Volume', encountersCount: 10000, totalBilled: 25000000 },
      ];
      const hugeTenders = [
        { method: 'Cash', totalAmount: 180000000, percentage: 60 },
        { method: 'HMO', totalAmount: 120000000, percentage: 40 },
      ];
      const hugeMorbidity = [
        { icd10Code: 'I10', description: 'Hypertension', totalCases: 500000, percentageOfTotal: 100 },
      ];

      const m1 = renderToStaticMarkup(React.createElement(TrendLineChart, { data: hugeTrend }));
      const m2 = renderToStaticMarkup(React.createElement(WorkloadBarChart, { data: hugeWorkload }));
      const m3 = renderToStaticMarkup(React.createElement(TenderDonutChart, { data: hugeTenders }));
      const m4 = renderToStaticMarkup(React.createElement(MorbidityDistributionChart, { data: hugeMorbidity }));

      [m1, m2, m3, m4].forEach((markup, idx) => {
        expect(markup).not.toMatch(/NaN/);
        expect(markup).not.toMatch(/Infinity/);
        expect(markup).not.toMatch(/="undefined"/);
        expect(markup).not.toMatch(/="null"/);
      });
    });
  });
});

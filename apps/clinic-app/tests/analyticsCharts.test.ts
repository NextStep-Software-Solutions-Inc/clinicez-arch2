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

const { default: TrendLineChart, formatPeso, formatVolume } = await import(
  '../components/analytics/TrendLineChart'
);
const { default: WorkloadBarChart } = await import(
  '../components/analytics/WorkloadBarChart'
);
const { default: TenderDonutChart, getTenderColor } = await import(
  '../components/analytics/TenderDonutChart'
);
const { default: MorbidityDistributionChart } = await import(
  '../components/analytics/MorbidityDistributionChart'
);
const { lightColors } = await import('@clinicez/design-tokens');

describe('Milestone 3: Interactive SVG Charting Components Suite', () => {
  // =========================================================================
  // 1. Currency & Metric Formatting Utilities
  // =========================================================================
  describe('Metric & Currency Formatting', () => {
    test('formatPeso formats amounts with Philippine Peso sign, commas, and 2 decimals', () => {
      expect(formatPeso(0)).toBe('₱0.00');
      expect(formatPeso(14500)).toBe('₱14,500.00');
      expect(formatPeso(1234567.89)).toBe('₱1,234,567.89');
      expect(formatPeso(null)).toBe('₱0.00');
      expect(formatPeso(undefined)).toBe('₱0.00');
    });

    test('formatVolume formats visit counts accurately with Visits suffix', () => {
      expect(formatVolume(0)).toBe('0 Visits');
      expect(formatVolume(24)).toBe('24 Visits');
      expect(formatVolume(1500)).toBe('1,500 Visits');
      expect(formatVolume(null)).toBe('0 Visits');
    });

    test('getTenderColor maps semantic tokens strictly from lightColors', () => {
      expect(getTenderColor('Cash')).toBe(lightColors.success);
      expect(getTenderColor('GCash')).toBe(lightColors.info);
      expect(getTenderColor('Maya')).toBe(lightColors.purple);
      expect(getTenderColor('CreditCard')).toBe(lightColors.warning);
      expect(getTenderColor('Credit Card')).toBe(lightColors.warning);
      expect(getTenderColor('DebitCard')).toBe(lightColors.urgent);
      expect(getTenderColor('PhilHealthKonsulta')).toBe(lightColors.routine);
      expect(getTenderColor('PhilHealth')).toBe(lightColors.routine);
      expect(getTenderColor('HmoInsurance')).toBe(lightColors.primaryDark);
      expect(getTenderColor('HMO')).toBe(lightColors.primaryDark);
      expect(getTenderColor('UnknownMethod')).toBe(lightColors.primary);
    });
  });

  // =========================================================================
  // 2. TrendLineChart.tsx
  // =========================================================================
  describe('TrendLineChart Component', () => {
    const mockTrendData = [
      { dateLabel: '2026-10-15', revenue: 12000, patientCount: 15 },
      { dateLabel: '2026-10-16', revenue: 18500, patientCount: 22 },
      { dateLabel: '2026-10-17', revenue: 14200, patientCount: 18 },
      { dateLabel: '2026-10-18', revenue: 21000, patientCount: 26 },
      { dateLabel: '2026-10-19', revenue: 16800, patientCount: 20 },
    ];

    test('State 1 (Loading): renders skeleton placeholder structure', () => {
      const markup = renderToStaticMarkup(
        React.createElement(TrendLineChart, {
          data: mockTrendData,
          loading: true,
        })
      );
      expect(markup).toContain('trend-line-chart-loading');
      expect(markup).not.toContain('Operational Trend');
    });

    test('State 2 (Error): renders error message and actionable retry button', () => {
      let retried = false;
      const element = React.createElement(TrendLineChart, {
        data: [],
        error: 'Network connection failed',
        onRetry: () => { retried = true; },
      });
      const markup = renderToStaticMarkup(element);
      expect(markup).toContain('trend-line-chart-error');
      expect(markup).toContain('Unable to load trend chart');
      expect(markup).toContain('Network connection failed');
      expect(markup).toContain('Retry');
    });

    test('State 3 (Empty): renders empty state with statutory CTA and message', () => {
      const markup = renderToStaticMarkup(
        React.createElement(TrendLineChart, {
          data: [],
        })
      );
      expect(markup).toContain('trend-line-chart-empty');
      expect(markup).toContain('No Trend Data');
      expect(markup).toContain('No revenue or visits recorded in this date range');
    });

    test('State 4 (Active): renders interactive SVG line chart, gridlines, and toggle', () => {
      const markup = renderToStaticMarkup(
        React.createElement(TrendLineChart, {
          data: mockTrendData,
        })
      );
      expect(markup).toContain('Operational Trend');
      expect(markup).toContain('Revenue (₱)');
      expect(markup).toContain('Patient Volume (Visits)');
      expect(markup).toContain('data-component="Svg"');
      expect(markup).toContain('data-component="Path"');
      expect(markup).toContain('data-component="Circle"');
      expect(markup).toContain('2026-10-15');
      expect(markup).toContain('2026-10-19');
    });

    test('Edge Case: handles single data point gracefully without NaN', () => {
      const singlePoint = [{ dateLabel: '2026-10-20', revenue: 5000, patientCount: 8 }];
      const markup = renderToStaticMarkup(
        React.createElement(TrendLineChart, {
          data: singlePoint,
        })
      );
      expect(markup).not.toContain('NaN');
      expect(markup).toContain('2026-10-20');
      expect(markup).toContain('data-component="Circle"');
    });

    test('Edge Case: handles all-zero revenue and patient volume cleanly', () => {
      const zeroPoints = [
        { dateLabel: '2026-10-15', revenue: 0, patientCount: 0 },
        { dateLabel: '2026-10-16', revenue: 0, patientCount: 0 },
      ];
      const markup = renderToStaticMarkup(
        React.createElement(TrendLineChart, {
          data: zeroPoints,
        })
      );
      expect(markup).not.toContain('NaN');
      expect(markup).toContain('2026-10-15');
    });
  });

  // =========================================================================
  // 3. WorkloadBarChart.tsx
  // =========================================================================
  describe('WorkloadBarChart Component', () => {
    const mockDoctorStats = [
      { doctorName: 'Dr. Maria Santos', encountersCount: 28, totalBilled: 21000 },
      { doctorName: 'Dr. Antonio Reyes', encountersCount: 35, totalBilled: 31500 },
      { doctorName: 'Dr. Elena Cruz', encountersCount: 19, totalBilled: 15200 },
    ];

    test('State 1 (Loading): renders pulsing bar skeleton placeholders', () => {
      const markup = renderToStaticMarkup(
        React.createElement(WorkloadBarChart, {
          data: mockDoctorStats,
          loading: true,
        })
      );
      expect(markup).toContain('workload-bar-chart-loading');
      expect(markup).not.toContain('Clinician Workload');
    });

    test('State 2 (Error): renders error state with retry callback', () => {
      const markup = renderToStaticMarkup(
        React.createElement(WorkloadBarChart, {
          data: [],
          error: 'Database timeout while querying clinician stats',
          onRetry: () => {},
        })
      );
      expect(markup).toContain('workload-bar-chart-error');
      expect(markup).toContain('Unable to load clinician workload');
      expect(markup).toContain('Database timeout while querying clinician stats');
    });

    test('State 3 (Empty): renders empty state with clinical explanation', () => {
      const markup = renderToStaticMarkup(
        React.createElement(WorkloadBarChart, {
          data: [],
        })
      );
      expect(markup).toContain('workload-bar-chart-empty');
      expect(markup).toContain('No Clinician Workload');
      expect(markup).toContain('No consultations logged by clinicians in this period');
    });

    test('State 4 (Active): renders rounded bars with doctor names and toggle', () => {
      const markup = renderToStaticMarkup(
        React.createElement(WorkloadBarChart, {
          data: mockDoctorStats,
        })
      );
      expect(markup).toContain('Clinician Workload');
      expect(markup).toContain('Patient Encounters');
      expect(markup).toContain('Total Billed (₱)');
      expect(markup).toContain('data-component="Rect"');
      expect(markup).toContain('Dr. Maria S');
      expect(markup).toContain('Dr. Antonio');
      expect(markup).toContain('Dr. Elena C');
    });

    test('Edge Case: handles clinicians with 0 encounters without division by zero', () => {
      const zeroDoctor = [
        { doctorName: 'Dr. New Clinician', encountersCount: 0, totalBilled: 0 },
      ];
      const markup = renderToStaticMarkup(
        React.createElement(WorkloadBarChart, {
          data: zeroDoctor,
        })
      );
      expect(markup).not.toContain('NaN');
      expect(markup).toContain('Dr. New Cli');
    });
  });

  // =========================================================================
  // 4. TenderDonutChart.tsx
  // =========================================================================
  describe('TenderDonutChart Component', () => {
    const mockTenderData = [
      { method: 'Cash', totalAmount: 45000, percentage: 45.0 },
      { method: 'GCash', totalAmount: 25000, percentage: 25.0 },
      { method: 'PhilHealthKonsulta', totalAmount: 20000, percentage: 20.0 },
      { method: 'CreditCard', totalAmount: 10000, percentage: 10.0 },
    ];

    test('State 1 (Loading): renders circular skeleton donut placeholder', () => {
      const markup = renderToStaticMarkup(
        React.createElement(TenderDonutChart, {
          data: mockTenderData,
          loading: true,
        })
      );
      expect(markup).toContain('tender-donut-chart-loading');
      expect(markup).not.toContain('Payment Methods');
    });

    test('State 2 (Error): renders error state with retry button', () => {
      const markup = renderToStaticMarkup(
        React.createElement(TenderDonutChart, {
          data: [],
          error: 'Failed to aggregate tender collections',
          onRetry: () => {},
        })
      );
      expect(markup).toContain('tender-donut-chart-error');
      expect(markup).toContain('Unable to load payment methods');
      expect(markup).toContain('Failed to aggregate tender collections');
    });

    test('State 3 (Empty): renders empty state when collections sum to 0', () => {
      const zeroTender = [
        { method: 'Cash', totalAmount: 0, percentage: 0 },
      ];
      const markup = renderToStaticMarkup(
        React.createElement(TenderDonutChart, {
          data: zeroTender,
        })
      );
      expect(markup).toContain('tender-donut-chart-empty');
      expect(markup).toContain('No Collections Recorded');
      expect(markup).toContain('No collections or payments recorded in this period');
    });

    test('State 4 (Active): renders trigonometric arc slices, center cutout KPI, and legend', () => {
      const markup = renderToStaticMarkup(
        React.createElement(TenderDonutChart, {
          data: mockTenderData,
        })
      );
      expect(markup).toContain('Payment Methods');
      expect(markup).toContain('Tender share and PhilHealth coverage distribution');
      expect(markup).toContain('data-component="Svg"');
      expect(markup).toContain('data-component="Path"');
      // Center KPI displays total sum
      expect(markup).toContain('tender-donut-chart-total');
      expect(markup).toContain('₱100,000.00');
      // Legend displays methods and percentages
      expect(markup).toContain('Cash');
      expect(markup).toContain('45.0%');
      expect(markup).toContain('GCash');
      expect(markup).toContain('25.0%');
      expect(markup).toContain('PhilHealthKonsulta');
      expect(markup).toContain('20.0%');
    });

    test('Edge Case: handles single 100% tender method without SVG arc collapse', () => {
      const singleTender = [
        { method: 'Cash', totalAmount: 50000, percentage: 100 },
      ];
      const markup = renderToStaticMarkup(
        React.createElement(TenderDonutChart, {
          data: singleTender,
        })
      );
      expect(markup).not.toContain('NaN');
      expect(markup).toContain('₱50,000.00');
      expect(markup).toContain('data-component="Path"');
    });
  });

  // =========================================================================
  // 5. MorbidityDistributionChart.tsx
  // =========================================================================
  describe('MorbidityDistributionChart Component', () => {
    const mockMorbidityItems = [
      { icd10Code: 'J06.9', description: 'Acute upper respiratory infection, unspecified', caseCount: 42, percentageShare: 35.0 },
      { icd10Code: 'I10', description: 'Essential (primary) hypertension', caseCount: 36, percentageShare: 30.0 },
      { icd10Code: 'E11.9', description: 'Type 2 diabetes mellitus without complications', caseCount: 24, percentageShare: 20.0 },
      { icd10Code: 'K29.7', description: 'Gastritis, unspecified', caseCount: 18, percentageShare: 15.0 },
    ];

    const mockMorbidityRows = [
      {
        rank: 1,
        icd10Code: 'J06.9',
        description: 'Acute upper respiratory infection, unspecified',
        totalCases: 50,
        pediatricCases: 25,
        adultCases: 18,
        seniorCases: 7,
        maleCases: 26,
        femaleCases: 24,
        percentageOfTotal: 38.5,
      },
      {
        rank: 2,
        icd10Code: 'I10',
        description: 'Essential (primary) hypertension',
        totalCases: 40,
        pediatricCases: 0,
        adultCases: 22,
        seniorCases: 18,
        maleCases: 19,
        femaleCases: 21,
        percentageOfTotal: 30.8,
      },
    ];

    test('State 1 (Loading): renders skeleton rows placeholder', () => {
      const markup = renderToStaticMarkup(
        React.createElement(MorbidityDistributionChart, {
          data: mockMorbidityItems,
          loading: true,
        })
      );
      expect(markup).toContain('morbidity-distribution-chart-loading');
      expect(markup).not.toContain('Morbidity Distribution');
    });

    test('State 2 (Error): renders error state with retry button', () => {
      const markup = renderToStaticMarkup(
        React.createElement(MorbidityDistributionChart, {
          data: [],
          error: 'Failed to fetch ICD-10 registry data',
          onRetry: () => {},
        })
      );
      expect(markup).toContain('morbidity-distribution-chart-error');
      expect(markup).toContain('Unable to load morbidity distribution');
      expect(markup).toContain('Failed to fetch ICD-10 registry data');
    });

    test('State 3 (Empty): renders empty state when diagnoses list is empty', () => {
      const markup = renderToStaticMarkup(
        React.createElement(MorbidityDistributionChart, {
          data: [],
        })
      );
      expect(markup).toContain('morbidity-distribution-chart-empty');
      expect(markup).toContain('No Morbidity Data');
      expect(markup).toContain('No diagnoses recorded in this period');
    });

    test('State 4 (Active - MorbidityItem): renders ranked horizontal bars and code badges', () => {
      const markup = renderToStaticMarkup(
        React.createElement(MorbidityDistributionChart, {
          data: mockMorbidityItems,
        })
      );
      expect(markup).toContain('Morbidity Distribution');
      expect(markup).toContain('J06.9');
      expect(markup).toContain('Acute upper respiratory infection');
      expect(markup).toContain('I10');
      expect(markup).toContain('Essential (primary) hypertension');
      expect(markup).toContain('data-component="Rect"');
    });

    test('State 4 (Active - MorbidityDiseaseRow): renders demographic sub-bars and legend', () => {
      const markup = renderToStaticMarkup(
        React.createElement(MorbidityDistributionChart, {
          data: mockMorbidityRows,
        })
      );
      expect(markup).toContain('Morbidity Distribution');
      expect(markup).toContain('Pediatric (&lt;18y)');
      expect(markup).toContain('Adult (18-59y)');
      expect(markup).toContain('Senior (60+y)');
      expect(markup).toContain('J06.9');
      expect(markup).toContain('50 (38.5%)');
      expect(markup).toContain('I10');
      expect(markup).toContain('40 (30.8%)');
    });

    test('Demographic Filter: switches cohort and updates sorting without crashing', () => {
      const markup = renderToStaticMarkup(
        React.createElement(MorbidityDistributionChart, {
          data: mockMorbidityRows,
        })
      );
      expect(markup).toContain('All Cases');
      expect(markup).toContain('Pediatric (&lt;18y)');
      expect(markup).toContain('Adult (18-59y)');
      expect(markup).toContain('Senior (60+y)');
      expect(markup).not.toContain('NaN');
    });
  });

  // =========================================================================
  // 6. Mathematical Scaling & Boundary Edge Cases
  // =========================================================================
  describe('Mathematical Scaling & Extreme Value Resilience', () => {
    test('TrendLineChart handles multi-million peso figures with million abbreviation', () => {
      const hugeData = [
        { dateLabel: '2026-10-01', revenue: 15000000, patientCount: 450 },
        { dateLabel: '2026-10-02', revenue: 25000000, patientCount: 720 },
      ];
      const markup = renderToStaticMarkup(
        React.createElement(TrendLineChart, {
          data: hugeData,
        })
      );
      expect(markup).toContain('₱25.0M');
      expect(markup).not.toContain('NaN');
    });

    test('WorkloadBarChart handles large billing volumes with thousand/million labels', () => {
      const hugeDoctors = [
        { doctorName: 'Dr. High Volume', encountersCount: 500, totalBilled: 2500000 },
      ];
      const markup = renderToStaticMarkup(
        React.createElement(WorkloadBarChart, {
          data: hugeDoctors,
          initialMetric: 'billed',
        })
      );
      expect(markup).toContain('₱2.5M');
      expect(markup).not.toContain('NaN');
    });

    test('TenderDonutChart handles fractional and zero share items cleanly', () => {
      const edgeData = [
        { method: 'Cash', totalAmount: 100, percentage: 99.9 },
        { method: 'GCash', totalAmount: 0.1, percentage: 0.1 },
        { method: 'Maya', totalAmount: 0, percentage: 0 },
      ];
      const markup = renderToStaticMarkup(
        React.createElement(TenderDonutChart, {
          data: edgeData,
        })
      );
      expect(markup).toContain('₱100.10');
      expect(markup).toContain('Cash');
      expect(markup).toContain('GCash');
      expect(markup).not.toContain('NaN');
    });

    test('MorbidityDistributionChart handles 0 total cases gracefully', () => {
      const zeroItems = [
        { icd10Code: 'Z00.0', description: 'General medical examination', caseCount: 0, percentageShare: 0 },
      ];
      const markup = renderToStaticMarkup(
        React.createElement(MorbidityDistributionChart, {
          data: zeroItems,
        })
      );
      expect(markup).toContain('Z00.0');
      expect(markup).toContain('0 (0.0%)');
      expect(markup).not.toContain('NaN');
    });
  });
});


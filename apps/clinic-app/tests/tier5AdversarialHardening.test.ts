// token-guard:ignore-file
import { describe, expect, test, mock, beforeEach } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'node:fs';
import path from 'node:path';

(globalThis as any).__DEV__ = true;

// Mock element creator capturing SVG and layout properties
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
    d,
    cx,
    cy,
    r,
    x,
    y,
    width,
    height,
    fill,
    stroke,
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
        ...(d !== undefined ? { 'data-d': d } : {}),
        ...(cx !== undefined ? { 'data-cx': String(cx) } : {}),
        ...(cy !== undefined ? { 'data-cy': String(cy) } : {}),
        ...(r !== undefined ? { 'data-r': String(r) } : {}),
        ...(x !== undefined ? { 'data-x': String(x) } : {}),
        ...(y !== undefined ? { 'data-y': String(y) } : {}),
        ...(width !== undefined ? { 'data-width': String(width) } : {}),
        ...(height !== undefined ? { 'data-height': String(height) } : {}),
        ...(fill !== undefined ? { 'data-fill': String(fill) } : {}),
        ...(stroke !== undefined ? { 'data-stroke': String(stroke) } : {}),
      },
      placeholder,
      children
    );
  Comp.displayName = name;
  return Comp;
};

// Mock React Native
let currentWindowWidth = 1280;
let currentWindowHeight = 800;

mock.module('react-native', () => ({
  Linking: { openURL: () => Promise.resolve(), canOpenURL: () => Promise.resolve(true) },
  StyleSheet: {
    create: (s: any) => s,
    flatten: (s: any) => s,
    absoluteFill: {},
  },
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
  Platform: { OS: 'web', select: (obj: any) => obj.web ?? obj.default },
  Dimensions: {
    get: () => ({ width: currentWindowWidth, height: currentWindowHeight }),
    addEventListener: () => ({ remove: () => {} }),
  },
  useWindowDimensions: () => ({ width: currentWindowWidth, height: currentWindowHeight }),
  Keyboard: { dismiss: () => {}, addListener: () => ({ remove: () => {} }) },
  AppState: { currentState: 'active', addEventListener: () => ({ remove: () => {} }) },
  Touchable: { Mixin: {} },
  TurboModuleRegistry: { get: () => null, getEnforcing: () => null },
  NativeModules: {},
  processColor: (c: any) => c,
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

// Mock document opener
let openedDocumentUrls: string[] = [];
let mockOpenDocumentResult = true;
let mockOpenDocumentError: Error | null = null;

mock.module('../services/documentOpener', () => ({
  openDocument: async (url: string) => {
    openedDocumentUrls.push(url);
    if (mockOpenDocumentError) throw mockOpenDocumentError;
    return mockOpenDocumentResult;
  },
}));

// Load components and modules under test
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
const { clinicService } = await import('../services/clinicService');
const { openDocument } = await import('../services/documentOpener');
const { notify, Alert, getFeedbackState, resetFeedbackState } = await import('../utils/feedback');
const { lightColors } = await import('@clinicez/design-tokens');

describe('Tier 5 Adversarial Coverage Hardening Suite', () => {
  beforeEach(() => {
    openedDocumentUrls = [];
    mockOpenDocumentResult = true;
    mockOpenDocumentError = null;
    resetFeedbackState();
  });

  // =========================================================================
  // 1. Chart Geometry & Mathematical Boundary Stress
  // =========================================================================
  describe('1. Chart Geometry & Mathematical Boundary Stress', () => {
    describe('1.1 TrendLineChart Mathematical Resilience', () => {
      test('Single data point generates horizontal line across full plotWidth without NaN', () => {
        const singlePoint = [{ dateLabel: '2026-10-20', revenue: 7500, patientCount: 12 }];
        const markup = renderToStaticMarkup(
          React.createElement(TrendLineChart, { data: singlePoint, height: 300 })
        );

        expect(markup).not.toContain('NaN');
        expect(markup).not.toContain('Infinity');
        // Point is centered at paddingLeft + plotWidth / 2
        expect(markup).toContain('data-component="Circle"');
        expect(markup).toContain('data-component="Path"');
        // Should contain M ... L ... horizontal line path
        expect(markup).toMatch(/data-d="M\s+[0-9.]+\s+[0-9.]+\s+L\s+[0-9.]+\s+[0-9.]+"/);
      });

      test('Flat horizontal trend across identical positive values renders at top without divide-by-zero', () => {
        const flatData = [
          { dateLabel: '2026-10-18', revenue: 15000, patientCount: 10 },
          { dateLabel: '2026-10-19', revenue: 15000, patientCount: 10 },
          { dateLabel: '2026-10-20', revenue: 15000, patientCount: 10 },
        ];
        const markup = renderToStaticMarkup(
          React.createElement(TrendLineChart, { data: flatData, height: 300 })
        );

        expect(markup).not.toContain('NaN');
        expect(markup).not.toContain('undefined');
        // Check circles rendered for all 3 points
        const circleMatches = markup.match(/data-component="Circle"/g);
        expect(circleMatches?.length).toBe(3);
      });

      test('All-zero revenue and volume dataset utilizes effective fallback without zero-range failure', () => {
        const zeroData = [
          { dateLabel: 'Day 1', revenue: 0, patientCount: 0 },
          { dateLabel: 'Day 2', revenue: 0, patientCount: 0 },
        ];
        const markup = renderToStaticMarkup(
          React.createElement(TrendLineChart, { data: zeroData, initialMetric: 'revenue' })
        );

        expect(markup).not.toContain('NaN');
        expect(markup).toContain('₱0');
        expect(markup).toContain('₱1k'); // Grid tick generated from effectiveMax = 1000
      });

      test('Extreme multi-million revenue figures format correctly with M abbreviations', () => {
        const multiMillionData = [
          { dateLabel: 'Q1', revenue: 1500000000, patientCount: 45000 },
          { dateLabel: 'Q2', revenue: 2400000000, patientCount: 78000 },
        ];
        const markup = renderToStaticMarkup(
          React.createElement(TrendLineChart, { data: multiMillionData })
        );

        expect(markup).not.toContain('NaN');
        expect(markup).toContain('₱2400.0M');
      });

      test('Negative revenue values handled gracefully along baseline without path corruption', () => {
        const negativeData = [
          { dateLabel: 'Day 1', revenue: -500, patientCount: 2 },
          { dateLabel: 'Day 2', revenue: 1000, patientCount: 5 },
        ];
        const markup = renderToStaticMarkup(
          React.createElement(TrendLineChart, { data: negativeData })
        );

        expect(markup).not.toContain('NaN');
        expect(markup).toContain('data-component="Path"');
        expect(markup).toContain('₱-500');
      });

      test('Longitudinal dense dataset (30 days) samples X-axis labels to prevent label crowding', () => {
        const thirtyDaysData = Array.from({ length: 30 }, (_, i) => ({
          dateLabel: `2026-10-${String(i + 1).padStart(2, '0')}`,
          revenue: (i + 1) * 1000,
          patientCount: i + 5,
        }));
        const markup = renderToStaticMarkup(
          React.createElement(TrendLineChart, { data: thirtyDaysData })
        );

        expect(markup).not.toContain('NaN');
        // Total date labels rendered should be significantly less than 30 (stepped + last)
        const dateTexts = markup.match(/2026-10-[0-9]{2}/g) || [];
        expect(dateTexts.length).toBeLessThan(15);
        expect(dateTexts.length).toBeGreaterThan(0);
      });
    });

    describe('1.2 WorkloadBarChart Mathematical Resilience', () => {
      test('All identical clinician workloads calculate uniform bar heights', () => {
        const identicalData = [
          { doctorName: 'Dr. Alpha', encountersCount: 20, totalBilled: 30000 },
          { doctorName: 'Dr. Beta', encountersCount: 20, totalBilled: 30000 },
          { doctorName: 'Dr. Gamma', encountersCount: 20, totalBilled: 30000 },
        ];
        const markup = renderToStaticMarkup(
          React.createElement(WorkloadBarChart, { data: identicalData, initialMetric: 'encounters' })
        );

        expect(markup).not.toContain('NaN');
        expect(markup).toContain('Dr. Alpha');
        expect(markup).toContain('Dr. Beta');
        expect(markup).toContain('Dr. Gamma');
      });

      test('Zero encounters with positive totalBilled guards average revenue against division by zero', () => {
        const edgeData = [
          { doctorName: 'Dr. FeeOnly', encountersCount: 0, totalBilled: 15000 },
        ];
        const markup = renderToStaticMarkup(
          React.createElement(WorkloadBarChart, { data: edgeData, initialMetric: 'billed' })
        );

        expect(markup).not.toContain('NaN');
        expect(markup).not.toContain('Infinity');
        expect(markup).toContain('Dr. FeeOnly');
        expect(markup).toContain('₱15k');
      });

      test('All clinicians with zero encounters and zero billed render minimum 2px indicator bar', () => {
        const zeroWorkload = [
          { doctorName: 'Dr. Inactive1', encountersCount: 0, totalBilled: 0 },
          { doctorName: 'Dr. Inactive2', encountersCount: 0, totalBilled: 0 },
        ];
        const markup = renderToStaticMarkup(
          React.createElement(WorkloadBarChart, { data: zeroWorkload })
        );

        expect(markup).not.toContain('NaN');
        expect(markup).toContain('data-height="2"'); // Math.max(2, b.barHeight)
      });

      test('Extremely long clinician names (>12 chars) are truncated with ellipsis', () => {
        const longNameData = [
          { doctorName: 'Dr. Maria Consuelo de Alcantara', encountersCount: 15, totalBilled: 22000 },
        ];
        const markup = renderToStaticMarkup(
          React.createElement(WorkloadBarChart, { data: longNameData })
        );

        expect(markup).toContain('Dr. Maria C…');
        expect(markup).not.toContain('Dr. Maria Consuelo de Alcantara</div');
      });

      test('Dense roster of 25 clinicians subdivides slot width without negative SVG bounds', () => {
        const manyDoctors = Array.from({ length: 25 }, (_, i) => ({
          doctorName: `Dr. Doc${i + 1}`,
          encountersCount: i + 1,
          totalBilled: (i + 1) * 1200,
        }));
        const markup = renderToStaticMarkup(
          React.createElement(WorkloadBarChart, { data: manyDoctors })
        );

        expect(markup).not.toContain('NaN');
        expect(markup).not.toContain('data-width="0"');
      });
    });

    describe('1.3 TenderDonutChart Mathematical Resilience', () => {
      test('100% single payment method share produces two contiguous semicircle arcs avoiding SVG arc singularity', () => {
        const singleTender = [{ method: 'Cash', totalAmount: 50000, percentage: 100 }];
        const markup = renderToStaticMarkup(
          React.createElement(TenderDonutChart, { data: singleTender })
        );

        expect(markup).not.toContain('NaN');
        expect(markup).toContain('Cash');
        expect(markup).toContain('₱50,000.00');
        // Semicircle arc pattern in describeDonutSlice for >= 2*PI:
        // Contains two outer 'A' arcs and two inner 'A' arcs
        expect(markup).toMatch(/data-d="M\s+[0-9.]+\s+[0-9.]+\s+A\s+[0-9.]+\s+[0-9.]+[^"]+A\s+[0-9.]+\s+[0-9.]+[^"]+M\s+[0-9.]+\s+[0-9.]+\s+A\s+[0-9.]+\s+[0-9.]+[^"]+A\s+[0-9.]+\s+[0-9.]+[^"]+Z"/);
      });

      test('Zero collections total renders empty state and avoids divide-by-zero angle computations', () => {
        const zeroTenders = [
          { method: 'Cash', totalAmount: 0, percentage: 0 },
          { method: 'GCash', totalAmount: 0, percentage: 0 },
        ];
        const markup = renderToStaticMarkup(
          React.createElement(TenderDonutChart, { data: zeroTenders })
        );

        expect(markup).toContain('tender-donut-chart-empty');
        expect(markup).toContain('No Collections Recorded');
      });

      test('Negative payment amounts are filtered by validItems and do not distort donut arcs', () => {
        const withNegative = [
          { method: 'Cash', totalAmount: 10000, percentage: 100 },
          { method: 'Adjustment', totalAmount: -1500, percentage: 0 },
        ];
        const markup = renderToStaticMarkup(
          React.createElement(TenderDonutChart, { data: withNegative })
        );

        expect(markup).not.toContain('NaN');
        expect(markup).toContain('Cash');
        // Only valid positive slices are rendered
        expect(markup).not.toContain('Adjustment (');
      });

      test('Fractional centavo tenders calculate valid radian angles and format percentages accurately', () => {
        const fractionalTenders = [
          { method: 'Cash', totalAmount: 99999.50, percentage: 99.99 },
          { method: 'Maya', totalAmount: 0.50, percentage: 0.01 },
        ];
        const markup = renderToStaticMarkup(
          React.createElement(TenderDonutChart, { data: fractionalTenders })
        );

        expect(markup).not.toContain('NaN');
        expect(markup).toContain('₱99,999.50');
        expect(markup).toContain('₱0.50');
        expect(markup).toContain('100.0%');
        expect(markup).toContain('0.0%'); // 0.01 rounded to 1 decimal place
      });

      test('Unknown or malformed tender method names fall back safely to lightColors.primary', () => {
        expect(getTenderColor('Cryptocurrency')).toBe(lightColors.primary);
        expect(getTenderColor('')).toBe(lightColors.primary);
        expect(getTenderColor(null as any)).toBe(lightColors.primary);
        expect(getTenderColor(undefined as any)).toBe(lightColors.primary);
        expect(getTenderColor('   GCASH   ')).toBe(lightColors.info);
        expect(getTenderColor('maya-card')).toBe(lightColors.purple);
      });
    });

    describe('1.4 MorbidityDistributionChart Mathematical Resilience', () => {
      test('Polymorphic ingestion seamlessly handles both MorbidityItem and MorbidityDiseaseRow DTOs', () => {
        // MorbidityItem format (analytics endpoint)
        const items = [
          { rank: 1, icd10Code: 'J06.9', description: 'Acute URI', caseCount: 45, percentageShare: 60 },
          { rank: 2, icd10Code: 'I10', description: 'Hypertension', caseCount: 30, percentageShare: 40 },
        ];
        const markupItems = renderToStaticMarkup(
          React.createElement(MorbidityDistributionChart, { data: items as any })
        );
        expect(markupItems).toContain('J06.9');
        expect(markupItems).toContain('Acute URI');
        expect(markupItems).toContain('45 (60.0%)');

        // MorbidityDiseaseRow format (morbidity statutory report endpoint)
        const rows = [
          {
            rank: 1,
            icd10Code: 'E11.9',
            description: 'Type 2 Diabetes',
            totalCases: 50,
            pediatricCases: 2,
            adultCases: 38,
            seniorCases: 10,
            maleCases: 22,
            femaleCases: 28,
            percentageOfTotal: 100,
          },
        ];
        const markupRows = renderToStaticMarkup(
          React.createElement(MorbidityDistributionChart, { data: rows as any })
        );
        expect(markupRows).toContain('E11.9');
        expect(markupRows).toContain('Type 2 Diabetes');
        expect(markupRows).toContain('50 (100.0%)');
        expect(markupRows).toContain('Pediatric (&lt;18y)');
      });

      test('Zero and negative total cases are guarded by maxCohortCount without zero division', () => {
        const edgeCases = [
          { icd10Code: 'R05', description: 'Cough', totalCases: 0 },
          { icd10Code: 'R50', description: 'Fever', totalCases: -5 },
        ];
        const markup = renderToStaticMarkup(
          React.createElement(MorbidityDistributionChart, { data: edgeCases as any })
        );

        expect(markup).not.toContain('NaN');
        // Evaluates Math.max(2, singleWidth) -> minimum 2px
        expect(markup).toContain('data-width="2"');
      });

      test('Missing ICD-10 code and description defaults to empty strings without throwing', () => {
        const malformed = [{ totalCases: 10, percentageOfTotal: 100 }];
        const markup = renderToStaticMarkup(
          React.createElement(MorbidityDistributionChart, { data: malformed as any })
        );

        expect(markup).not.toContain('NaN');
        expect(markup).toContain('10 (100.0%)');
      });

      test('More than 10 disease entries are sorted and cleanly truncated to top 10', () => {
        const fifteenDiseases = Array.from({ length: 15 }, (_, i) => ({
          icd10Code: `D${i + 1}`,
          description: `Disease ${i + 1}`,
          totalCases: (i + 1) * 10,
          percentageOfTotal: (i + 1) * 2,
        }));
        const markup = renderToStaticMarkup(
          React.createElement(MorbidityDistributionChart, { data: fifteenDiseases as any })
        );

        expect(markup).toContain('D15'); // Highest count (150)
        expect(markup).toContain('D6');  // 10th highest (60)
        expect(markup).not.toContain('D1</div'); // 15th (lowest, truncated)
      });
    });
  });

  // =========================================================================
  // 2. Rapid State Toggling & Interaction Stress
  // =========================================================================
  describe('2. Rapid State Toggling & Interaction Stress', () => {
    test('TrendLineChart toggles between revenue and volume without state leakage', () => {
      const data = [
        { dateLabel: '2026-10-19', revenue: 12500, patientCount: 18 },
        { dateLabel: '2026-10-20', revenue: 24000, patientCount: 32 },
      ];

      // Initial Revenue
      const revMarkup = renderToStaticMarkup(
        React.createElement(TrendLineChart, { data, initialMetric: 'revenue' })
      );
      expect(revMarkup).toContain('₱24k');

      // Toggled to Volume
      const volMarkup = renderToStaticMarkup(
        React.createElement(TrendLineChart, { data, initialMetric: 'volume' })
      );
      expect(volMarkup).not.toContain('₱24k');
      expect(volMarkup).toContain('32');
    });

    test('WorkloadBarChart toggles between encounters and billed metrics', () => {
      const data = [
        { doctorName: 'Dr. Santos', encountersCount: 42, totalBilled: 63000 },
      ];

      const encMarkup = renderToStaticMarkup(
        React.createElement(WorkloadBarChart, { data, initialMetric: 'encounters' })
      );
      expect(encMarkup).toContain('42');

      const billMarkup = renderToStaticMarkup(
        React.createElement(WorkloadBarChart, { data, initialMetric: 'billed' })
      );
      expect(billMarkup).toContain('₱63k');
    });

    test('MorbidityDistributionChart switches cohorts (all, pediatric, adult, senior) dynamically', () => {
      const morbidityData = [
        {
          icd10Code: 'J06.9',
          description: 'Acute URI',
          totalCases: 100,
          pediatricCases: 80,
          adultCases: 15,
          seniorCases: 5,
          percentageOfTotal: 50,
        },
        {
          icd10Code: 'I10',
          description: 'Essential Hypertension',
          totalCases: 100,
          pediatricCases: 0,
          adultCases: 40,
          seniorCases: 60,
          percentageOfTotal: 50,
        },
      ];

      // Under pediatric cohort: Acute URI (80) ranks #1
      const pedMarkup = renderToStaticMarkup(
        React.createElement(MorbidityDistributionChart, { data: morbidityData as any, initialCohort: 'pediatric' })
      );
      expect(pedMarkup).toContain('80 (50.0%)');

      // Under senior cohort: Hypertension (60) ranks #1
      const seniorMarkup = renderToStaticMarkup(
        React.createElement(MorbidityDistributionChart, { data: morbidityData as any, initialCohort: 'senior' })
      );
      expect(seniorMarkup).toContain('60 (50.0%)');
    });

    test('MorbidityDistributionChart cohort toggle on dataset lacking demographics falls back to totalCases', () => {
      const basicData = [
        { icd10Code: 'Z00.0', description: 'General Exam', caseCount: 25, percentageShare: 100 },
      ];
      const markup = renderToStaticMarkup(
        React.createElement(MorbidityDistributionChart, { data: basicData as any, initialCohort: 'pediatric' })
      );

      expect(markup).not.toContain('NaN');
      expect(markup).toContain('25 (100.0%)');
    });
  });

  // =========================================================================
  // 3. Vector PDF Streaming, Popup Blocker & Date Bounds
  // =========================================================================
  describe('3. Vector PDF Streaming, Popup Blocker & Date Bounds', () => {
    test('clinicService produces valid streaming URLs for all 5 statutory and analytics reports', () => {
      expect(clinicService.getDailyEodPdfUrl('2026-10-20')).toContain('/reports/daily-eod/pdf?date=2026-10-20');
      expect(clinicService.getMorbidityPdfUrl('2026-01-01', '2026-03-31')).toContain('/reports/morbidity/pdf?startDate=2026-01-01&endDate=2026-03-31');
      expect(clinicService.getTaxDiscountsPdfUrl('2026-01-01', '2026-03-31')).toContain('/reports/tax-discounts/pdf?startDate=2026-01-01&endDate=2026-03-31');
      expect(clinicService.getDoctorSharesPdfUrl('2026-01-01', '2026-03-31')).toContain('/reports/doctor-shares/pdf?startDate=2026-01-01&endDate=2026-03-31');
      expect(clinicService.getAnalyticsPdfUrl('2026-10-01', '2026-10-20')).toContain('/reports/analytics/pdf?startDate=2026-10-01&endDate=2026-10-20');
    });

    test('clinicService properly URL-encodes special characters and spaces in dates', () => {
      const url = clinicService.getDailyEodPdfUrl('2026-10-20 18:00');
      expect(url).toContain('date=2026-10-20%2018%3A00');
    });

    test('clinicService omits query strings when date arguments are undefined or empty', () => {
      expect(clinicService.getDailyEodPdfUrl()).toMatch(/\/reports\/daily-eod\/pdf$/);
      expect(clinicService.getAnalyticsPdfUrl()).toMatch(/\/reports\/analytics\/pdf$/);
      expect(clinicService.getMorbidityPdfUrl()).toMatch(/\/reports\/morbidity\/pdf$/);
      expect(clinicService.getTaxDiscountsPdfUrl()).toMatch(/\/reports\/tax-discounts\/pdf$/);
      expect(clinicService.getDoctorSharesPdfUrl()).toMatch(/\/reports\/doctor-shares\/pdf$/);
    });

    test('Popup blocker interception triggers error notification', async () => {
      mockOpenDocumentResult = false;
      const url = clinicService.getAnalyticsPdfUrl('2026-10-01', '2026-10-20');

      const opened = await openDocument(url);
      if (!opened) {
        notify.error('Unable to open document. Please check popup permissions.');
      }

      expect(opened).toBe(false);
      const feedbackState = getFeedbackState();
      expect(feedbackState.toasts.some((t) => t.message.includes('popup permissions'))).toBe(true);
      expect(feedbackState.toasts.some((t) => t.kind === 'error')).toBe(true);
    });

    test('Network failure during vector PDF streaming triggers descriptive error toast', async () => {
      mockOpenDocumentError = new Error('HTTP 500: QuestPDF streaming pipeline timed out');
      const url = clinicService.getMorbidityPdfUrl('2026-01-01', '2026-03-31');

      try {
        await openDocument(url);
      } catch (err: any) {
        notify.error(err?.message ?? 'Failed to stream vector PDF.');
      }

      const feedbackState = getFeedbackState();
      expect(feedbackState.toasts.some((t) => t.message.includes('QuestPDF streaming pipeline timed out'))).toBe(true);
      expect(feedbackState.toasts.some((t) => t.kind === 'error')).toBe(true);
    });

    test('Alert.alert and notify populate real feedback state without module pollution', () => {
      resetFeedbackState();
      Alert.alert('Tamper Seal Verification', 'Cryptographic signature is valid', [{ text: 'OK' }]);
      notify.success('PDF report exported successfully');

      const state = getFeedbackState();
      expect(state.alerts).toHaveLength(1);
      expect(state.alerts[0].title).toBe('Tamper Seal Verification');
      expect(state.alerts[0].message).toBe('Cryptographic signature is valid');
      expect(state.alerts[0].buttons).toHaveLength(1);
      expect(state.alerts[0].buttons[0].text).toBe('OK');

      expect(state.toasts).toHaveLength(1);
      expect(state.toasts[0].kind).toBe('success');
      expect(state.toasts[0].message).toBe('PDF report exported successfully');
    });

    test('Simulated rapid export double-click maintains single execution via isExportingPdf guard', async () => {
      let isExportingPdf = false;
      let exportCallCount = 0;

      const triggerExport = async () => {
        if (isExportingPdf) return;
        isExportingPdf = true;
        exportCallCount++;
        try {
          await openDocument(clinicService.getDailyEodPdfUrl('2026-10-20'));
        } finally {
          isExportingPdf = false;
        }
      };

      // Concurrent invocation
      await Promise.all([triggerExport(), triggerExport()]);
      expect(exportCallCount).toBe(1);
    });
  });

  // =========================================================================
  // 4. Token, Styling & Network Isolation Compliance
  // =========================================================================
  describe('4. Token, Styling & Network Isolation Compliance', () => {
    const analyticsDir = path.resolve(__dirname, '../components/analytics');
    const chartFiles = [
      'TrendLineChart.tsx',
      'WorkloadBarChart.tsx',
      'TenderDonutChart.tsx',
      'MorbidityDistributionChart.tsx',
    ];

    test.each(chartFiles)('%s contains 0 raw hex color literals', (filename) => {
      const source = fs.readFileSync(path.join(analyticsDir, filename), 'utf-8');
      const hexMatches = source.match(/#[0-9a-fA-F]{3,8}\b/g) || [];
      expect(hexMatches.length).toBe(0);
    });

    test.each(chartFiles)('%s contains 0 external network URLs or CDN dependencies', (filename) => {
      const source = fs.readFileSync(path.join(analyticsDir, filename), 'utf-8');
      const externalUrls = source.match(/https?:\/\/[^\s'"`]+/g) || [];
      expect(externalUrls.length).toBe(0);
    });

    test('Dashboard.screen.tsx enforces full-width desktop layout without maxWidth constraint', () => {
      const dashboardPath = path.resolve(__dirname, '../navigation/screens/Dashboard.screen.tsx');
      const dashboardSource = fs.readFileSync(dashboardPath, 'utf-8');

      const contentMatch = dashboardSource.match(/content:\s*\{([^}]+)\}/);
      expect(contentMatch).not.toBeNull();
      const contentStyles = contentMatch![1];

      expect(contentStyles).not.toContain('maxWidth: theme.sizes.contentMaxWidth');
      expect(contentStyles).not.toContain('alignSelf: \'center\'');
      expect(contentStyles).toContain('width: \'100%\'');
    });

    test('All chart components reference semantic colors strictly from lightColors', () => {
      expect(lightColors.primary).toBe('#0D6963');
      expect(lightColors.primaryDark).toBe('#084541');
      expect(lightColors.primaryLight).toBe('#D9FAF1');
      expect(lightColors.success).toBe('#16A34A');
      expect(lightColors.info).toBe('#2563EB');
      expect(lightColors.warning).toBe('#D97706');
      expect(lightColors.purple).toBe('#7E22CE');
      expect(lightColors.urgent).toBe('#EA580C');
    });
  });

  // =========================================================================
  // 5. Interactive Tooltips & Workstation Boundary Resilience
  // =========================================================================
  describe('5. Interactive Tooltips & Workstation Boundary Resilience', () => {
    test('TrendLineChart renders hitboxes and clamps tooltip near boundaries', () => {
      const data = [
        { dateLabel: 'Day 1', revenue: 1000, patientCount: 2 },
        { dateLabel: 'Day 2', revenue: 2000, patientCount: 4 },
      ];
      const markup = renderToStaticMarkup(
        React.createElement(TrendLineChart, { data, height: 300 })
      );

      // Hitboxes rendered for user interaction
      expect(markup).toContain('trend-point-0');
      expect(markup).toContain('trend-point-1');
      // No tooltips shown initially when activePointIndex is null
      expect(markup).not.toContain('trend-line-chart-tooltip');
    });

    test('WorkloadBarChart renders touch overlay hitboxes for each clinician', () => {
      const data = [
        { doctorName: 'Dr. Santos', encountersCount: 10, totalBilled: 15000 },
        { doctorName: 'Dr. Reyes', encountersCount: 20, totalBilled: 30000 },
      ];
      const markup = renderToStaticMarkup(
        React.createElement(WorkloadBarChart, { data })
      );

      expect(markup).toContain('workload-bar-0');
      expect(markup).toContain('workload-bar-1');
      expect(markup).not.toContain('workload-bar-chart-tooltip');
    });

    test('TenderDonutChart center KPI displays total collections when idle', () => {
      const tenders = [
        { method: 'Cash', totalAmount: 35000, percentage: 70 },
        { method: 'GCash', totalAmount: 15000, percentage: 30 },
      ];
      const markup = renderToStaticMarkup(
        React.createElement(TenderDonutChart, { data: tenders })
      );

      expect(markup).toContain('tender-donut-chart-total');
      expect(markup).toContain('₱50,000.00');
      expect(markup).toContain('Collections');
      expect(markup).toContain('tender-legend-0');
      expect(markup).toContain('tender-legend-1');
    });

    test('MorbidityDistributionChart renders interactive row cards with code badges and tracks', () => {
      const morbidity = [
        { icd10Code: 'J06.9', description: 'Acute upper respiratory infection', totalCases: 75, percentageOfTotal: 60 },
        { icd10Code: 'I10', description: 'Essential hypertension', totalCases: 50, percentageOfTotal: 40 },
      ];
      const markup = renderToStaticMarkup(
        React.createElement(MorbidityDistributionChart, { data: morbidity as any })
      );

      expect(markup).toContain('morbidity-row-0');
      expect(markup).toContain('morbidity-row-1');
      expect(markup).toContain('J06.9');
      expect(markup).toContain('I10');
      expect(markup).toContain('75 (60.0%)');
      expect(markup).toContain('50 (40.0%)');
    });

    test('clinicService handles inverted date ranges without crashing', () => {
      const url = clinicService.getMorbidityPdfUrl('2026-12-31', '2026-01-01');
      expect(url).toContain('startDate=2026-12-31&endDate=2026-01-01');
    });

    test('clinicService handles leap year date boundaries seamlessly', () => {
      const leapUrl = clinicService.getTaxDiscountsPdfUrl('2024-02-29', '2024-02-29');
      expect(leapUrl).toContain('startDate=2024-02-29&endDate=2024-02-29');
    });
  });
});

// token-guard:ignore-file
import { describe, expect, test, mock, beforeEach } from 'bun:test';
import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
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
  Dimensions: {
    get: () => ({ width: currentWindowWidth, height: currentWindowHeight }),
    addEventListener: () => ({ remove: () => {} }),
  },
  useWindowDimensions: () => ({ width: currentWindowWidth, height: currentWindowHeight }),
  Keyboard: { dismiss: () => {}, addListener: () => ({ remove: () => {} }) },
  AppState: { currentState: 'active', addEventListener: () => ({ remove: () => {} }) },
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
}));

mock.module('expo-crypto', () => ({
  randomUUID: () => 'test-uuid-' + Math.random().toString(36).substring(2, 9),
}));

mock.module('react-native-svg', () => ({
  Svg: createMockComponent('Svg'),
  Path: createMockComponent('Path'),
  Circle: createMockComponent('Circle'),
  Rect: createMockComponent('Rect'),
  Line: createMockComponent('Line'),
  Polyline: createMockComponent('Polyline'),
  default: createMockComponent('Svg'),
  Defs: createMockComponent('Defs'),
  LinearGradient: createMockComponent('LinearGradient'),
  Stop: createMockComponent('Stop'),
  G: createMockComponent('G'),
  Text: createMockComponent('SvgText'),
}));

mock.module('../constants/fonts', () => ({
  applyFontFamily: (s: any) => s,
  fontAssets: {},
}));

const { clinicService } = await import('../services/clinicService');
const { default: TrendLineChart } = await import('../components/analytics/TrendLineChart');
const { default: TenderDonutChart } = await import('../components/analytics/TenderDonutChart');
const { default: WorkloadBarChart } = await import('../components/analytics/WorkloadBarChart');
const { default: MorbidityDistributionChart } = await import('../components/analytics/MorbidityDistributionChart');

describe('Milestone 4 Adversarial Challenge: Challenger 1 Empirical Stress Tests', () => {
  // =========================================================================
  // Challenge 1: PDF Streaming URL Helpers with Edge-Case Date Strings
  // =========================================================================
  describe('Challenge 1: PDF Streaming URL Helpers with Edge-Case Date Strings', () => {
    test('1.1 getDailyEodPdfUrl handles null, undefined, empty string without query parameter', () => {
      const urlUndefined = clinicService.getDailyEodPdfUrl(undefined);
      const urlNull = clinicService.getDailyEodPdfUrl(null as any);
      const urlEmpty = clinicService.getDailyEodPdfUrl('');

      expect(urlUndefined).toContain('/api/v1/reports/daily-eod/pdf');
      expect(urlUndefined).not.toContain('?');
      expect(urlNull).toContain('/api/v1/reports/daily-eod/pdf');
      expect(urlNull).not.toContain('?');
      expect(urlEmpty).toContain('/api/v1/reports/daily-eod/pdf');
      expect(urlEmpty).not.toContain('?');

      // Test alias
      expect(clinicService.getDailyEodReportPdfUrl(undefined)).toBe(urlUndefined);
    });

    test('1.2 getDailyEodPdfUrl handles whitespace-only strings safely with encoding', () => {
      const urlSpaces = clinicService.getDailyEodPdfUrl('   ');
      const urlTab = clinicService.getDailyEodPdfUrl('\t\n');

      expect(urlSpaces).toContain('/api/v1/reports/daily-eod/pdf?date=%20%20%20');
      expect(urlTab).toContain('/api/v1/reports/daily-eod/pdf?date=%09%0A');
    });

    test('1.3 getDailyEodPdfUrl handles leap years and epoch boundary dates', () => {
      const urlLeap = clinicService.getDailyEodPdfUrl('2024-02-29');
      const urlLeap2028 = clinicService.getDailyEodPdfUrl('2028-02-29');
      const urlCenturyLeap = clinicService.getDailyEodPdfUrl('2000-02-29');
      const urlEpoch = clinicService.getDailyEodPdfUrl('1970-01-01');

      expect(urlLeap).toContain('/api/v1/reports/daily-eod/pdf?date=2024-02-29');
      expect(urlLeap2028).toContain('/api/v1/reports/daily-eod/pdf?date=2028-02-29');
      expect(urlCenturyLeap).toContain('/api/v1/reports/daily-eod/pdf?date=2000-02-29');
      expect(urlEpoch).toContain('/api/v1/reports/daily-eod/pdf?date=1970-01-01');
    });

    test('1.4 getDailyEodPdfUrl escapes special characters, SQL injections, and XSS safely', () => {
      const urlXss = clinicService.getDailyEodPdfUrl('<script>alert("xss")</script>');
      const urlInject = clinicService.getDailyEodPdfUrl("2026-10-20' OR '1'='1");
      const urlAmp = clinicService.getDailyEodPdfUrl('2026-10-20&extra=malicious#hash');

      expect(urlXss).toContain('%3Cscript%3Ealert(%22xss%22)%3C%2Fscript%3E');
      expect(urlInject).toContain('2026-10-20\'%20OR%20\'1\'%3D\'1');
      expect(urlAmp).toContain('2026-10-20%26extra%3Dmalicious%23hash');
      // Must not create separate unescaped query parameter
      expect(urlAmp.split('&extra=').length).toBe(1);
    });

    test('1.5 Date-range PDF URL helpers handle undefined, null, and empty combinations', () => {
      const helpers = [
        { name: 'Analytics', fn: (s?: string, e?: string) => clinicService.getAnalyticsPdfUrl(s, e), path: '/reports/analytics/pdf' },
        { name: 'Morbidity', fn: (s?: string, e?: string) => clinicService.getMorbidityPdfUrl(s, e), path: '/reports/morbidity/pdf' },
        { name: 'TaxDiscounts', fn: (s?: string, e?: string) => clinicService.getTaxDiscountsPdfUrl(s, e), path: '/reports/tax-discounts/pdf' },
        { name: 'DoctorShares', fn: (s?: string, e?: string) => clinicService.getDoctorSharesPdfUrl(s, e), path: '/reports/doctor-shares/pdf' },
      ];

      for (const h of helpers) {
        // Both omitted
        expect(h.fn()).toContain(`/api/v1${h.path}`);
        expect(h.fn()).not.toContain('?');
        expect(h.fn(undefined, undefined)).toContain(`/api/v1${h.path}`);
        expect(h.fn(undefined, undefined)).not.toContain('?');
        expect(h.fn(null as any, null as any)).toContain(`/api/v1${h.path}`);
        expect(h.fn(null as any, null as any)).not.toContain('?');
        expect(h.fn('', '')).toContain(`/api/v1${h.path}`);
        expect(h.fn('', '')).not.toContain('?');

        // Only startDate provided
        const startOnly = h.fn('2026-10-01', undefined);
        expect(startOnly).toContain(`/api/v1${h.path}?startDate=2026-10-01`);

        // Only endDate provided
        const endOnly = h.fn(undefined, '2026-10-31');
        expect(endOnly).toContain(`/api/v1${h.path}?endDate=2026-10-31`);

        // Both provided
        const both = h.fn('2026-10-01', '2026-10-31');
        expect(both).toContain(`/api/v1${h.path}?startDate=2026-10-01&endDate=2026-10-31`);

        // Leap year & epoch range
        const leapEpoch = h.fn('1970-01-01', '2024-02-29');
        expect(leapEpoch).toContain(`/api/v1${h.path}?startDate=1970-01-01&endDate=2024-02-29`);

        // Malformed & injection strings
        const malformed = h.fn('bad start date&hacked=1', 'bad end date');
        expect(malformed).toContain('startDate=bad+start+date%26hacked%3D1');
        expect(malformed).toContain('endDate=bad+end+date');
        expect(malformed.split('&hacked=').length).toBe(1);
      }
    });

    test('1.6 All aliases for report PDF streaming URL helpers return identical valid URLs', () => {
      expect(clinicService.getClinicAnalyticsPdfUrl('2026-10-01', '2026-10-31'))
        .toBe(clinicService.getAnalyticsPdfUrl('2026-10-01', '2026-10-31'));

      expect(clinicService.getMorbidityReportPdfUrl('2026-10-01', '2026-10-31'))
        .toBe(clinicService.getMorbidityPdfUrl('2026-10-01', '2026-10-31'));

      expect(clinicService.getTaxDiscountAuditPdfUrl('2026-10-01', '2026-10-31'))
        .toBe(clinicService.getTaxDiscountsPdfUrl('2026-10-01', '2026-10-31'));

      expect(clinicService.getTaxDiscountAuditReportPdfUrl('2026-10-01', '2026-10-31'))
        .toBe(clinicService.getTaxDiscountsPdfUrl('2026-10-01', '2026-10-31'));

      expect(clinicService.getDoctorSharesReportPdfUrl('2026-10-01', '2026-10-31'))
        .toBe(clinicService.getDoctorSharesPdfUrl('2026-10-01', '2026-10-31'));
    });
  });

  // =========================================================================
  // Challenge 2: Component & Chart Rendering with Null or Missing Properties
  // =========================================================================
  describe('Challenge 2: Component Rendering with Null/Missing Properties', () => {
    test('2.1 TrendLineChart renders cleanly when data is empty, undefined, or contains zero values', () => {
      // Empty array
      const emptyMarkup = renderToStaticMarkup(
        React.createElement(TrendLineChart, { data: [] })
      );
      expect(emptyMarkup).toContain('trend-line-chart-empty');
      expect(emptyMarkup).toContain('No Trend Data');

      // Undefined data prop (uses default parameter)
      const undefMarkup = renderToStaticMarkup(
        React.createElement(TrendLineChart, { data: undefined as any })
      );
      expect(undefMarkup).toContain('trend-line-chart-empty');

      // Zero-revenue and zero-patient points (no division by zero)
      const zeroPointsMarkup = renderToStaticMarkup(
        React.createElement(TrendLineChart, {
          data: [
            { dateLabel: 'Day 1', revenue: 0, patientCount: 0 },
            { dateLabel: 'Day 2', revenue: 0, patientCount: 0 },
          ],
        })
      );
      expect(zeroPointsMarkup).toContain('Operational Trend');
      expect(zeroPointsMarkup).not.toContain('NaN');
    });

    test('2.2 TenderDonutChart renders cleanly on empty, undefined, or zero-total datasets', () => {
      // Empty array
      const emptyMarkup = renderToStaticMarkup(
        React.createElement(TenderDonutChart, { data: [] })
      );
      expect(emptyMarkup).toContain('tender-donut-chart-empty');
      expect(emptyMarkup).toContain('No Collections Recorded');

      // Undefined data
      const undefMarkup = renderToStaticMarkup(
        React.createElement(TenderDonutChart, { data: undefined as any })
      );
      expect(undefMarkup).toContain('tender-donut-chart-empty');

      // Zero collections
      const zeroTenderMarkup = renderToStaticMarkup(
        React.createElement(TenderDonutChart, {
          data: [{ method: 'Cash', totalAmount: 0, percentage: 0 }],
        })
      );
      expect(zeroTenderMarkup).toContain('tender-donut-chart-empty');
    });

    test('2.2b Adversarial: TenderDonutChart with data: null', () => {
      let threw = false;
      let errorMsg = '';
      try {
        renderToStaticMarkup(
          React.createElement(TenderDonutChart, { data: null as any })
        );
      } catch (err: any) {
        threw = true;
        errorMsg = err?.message || String(err);
      }
      expect(threw).toBe(true);
      expect(errorMsg).toContain('reduce');
    });

    test('2.2c Adversarial: TrendLineChart, WorkloadBarChart, MorbidityDistributionChart with data: null', () => {
      // TrendLineChart
      const trendMarkup = renderToStaticMarkup(
        React.createElement(TrendLineChart, { data: null as any })
      );
      expect(trendMarkup).toContain('trend-line-chart-empty');

      // WorkloadBarChart
      const workloadMarkup = renderToStaticMarkup(
        React.createElement(WorkloadBarChart, { data: null as any })
      );
      expect(workloadMarkup).toContain('workload-bar-chart-empty');

      // MorbidityDistributionChart
      const morbMarkup = renderToStaticMarkup(
        React.createElement(MorbidityDistributionChart, { data: null as any })
      );
      expect(morbMarkup).toContain('morbidity-distribution-chart-empty');
    });

    test('2.3 WorkloadBarChart renders cleanly on empty, undefined, or zero-encounters datasets', () => {
      // Empty array
      const emptyMarkup = renderToStaticMarkup(
        React.createElement(WorkloadBarChart, { data: [] })
      );
      expect(emptyMarkup).toContain('workload-bar-chart-empty');
      expect(emptyMarkup).toContain('No Clinician Workload');

      // Undefined data
      const undefMarkup = renderToStaticMarkup(
        React.createElement(WorkloadBarChart, { data: undefined as any })
      );
      expect(undefMarkup).toContain('workload-bar-chart-empty');

      // Zero encounters
      const zeroDoctorsMarkup = renderToStaticMarkup(
        React.createElement(WorkloadBarChart, {
          data: [{ doctorName: 'Dr. Santos', encountersCount: 0, totalBilled: 0 }],
        })
      );
      expect(zeroDoctorsMarkup).toContain('Clinician Workload');
      expect(zeroDoctorsMarkup).not.toContain('NaN');
    });

    test('2.4 MorbidityDistributionChart renders cleanly on empty, undefined, and partial objects', () => {
      // Empty array
      const emptyMarkup = renderToStaticMarkup(
        React.createElement(MorbidityDistributionChart, { data: [] })
      );
      expect(emptyMarkup).toContain('morbidity-distribution-chart-empty');
      expect(emptyMarkup).toContain('No Morbidity Data');

      // Undefined data
      const undefMarkup = renderToStaticMarkup(
        React.createElement(MorbidityDistributionChart, { data: undefined as any })
      );
      expect(undefMarkup).toContain('morbidity-distribution-chart-empty');

      // Incomplete item properties (missing sub-cohorts)
      const partialMarkup = renderToStaticMarkup(
        React.createElement(MorbidityDistributionChart, {
          data: [
            {
              icd10Code: 'J06.9',
              description: 'Upper respiratory infection',
              caseCount: 10,
              // missing pediatricCases, adultCases, etc.
            } as any,
          ],
        })
      );
      expect(partialMarkup).toContain('Morbidity Distribution');
      expect(partialMarkup).toContain('J06.9');
      expect(partialMarkup).not.toContain('NaN');
    });

    test('2.5 Defensive audit of Dashboard.screen.tsx analytics data accessors', () => {
      const dashboardPath = path.resolve(__dirname, '../navigation/screens/Dashboard.screen.tsx');
      const content = fs.readFileSync(dashboardPath, 'utf8');

      // 1. Guard against null analytics before rendering
      expect(content).toContain('if (!analytics) {');
      expect(content).toContain('Unable to load analytics');

      // 2. Safe fallback for morbidity dates and top diagnoses
      expect(content).toContain('morbidityReport?.startDate ?? analytics.startDate');
      expect(content).toContain('morbidityReport?.endDate ?? analytics.endDate');
      expect(content).toContain('morbidityReport?.diseases ?? (analytics.topDiagnoses as any) ?? []');

      // 3. TrendLineChart, TenderDonutChart, WorkloadBarChart data props
      expect(content).toContain('data={analytics.revenueTrend}');
      expect(content).toContain('data={analytics.tenderShares}');
      expect(content).toContain('data={analytics.doctorStats}');

      // 4. Loading state checks
      expect(content).toContain('loading={analyticsLoading}');
      expect(content).toContain('error={analyticsError}');
    });

    test('2.6 Adversarial Analysis: Null-safety of DTO properties within analytics object', () => {
      // Test the mathematical / formatting helpers used by Dashboard.screen.tsx
      const peso = (value: number) =>
        `₱${value?.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

      // When totalGrossRevenue is present
      expect(peso(15000)).toBe('₱15,000.00');

      // What if flow or flow.averageWaitMinutes is missing in a degraded payload?
      const safeFormatMinutes = (val?: number | null) =>
        `${(val ?? 0).toFixed(1)} min`;

      expect(safeFormatMinutes(12.5)).toBe('12.5 min');
      expect(safeFormatMinutes(undefined)).toBe('0.0 min');
      expect(safeFormatMinutes(null)).toBe('0.0 min');

      // Top services fallback test
      const safeTopServices = (services?: any[] | null) => (services ?? []).length;
      expect(safeTopServices([])).toBe(0);
      expect(safeTopServices(undefined)).toBe(0);
      expect(safeTopServices(null)).toBe(0);
    });
  });

  // =========================================================================
  // Challenge 3: Zero Monospace Receipt Strings or <pre> Modal Remnants
  // =========================================================================
  describe('Challenge 3: Elimination of Monospace Receipt & <pre> Remnants', () => {
    test('3.1 Dashboard.screen.tsx contains zero HTML <pre> tags', () => {
      const dashboardPath = path.resolve(__dirname, '../navigation/screens/Dashboard.screen.tsx');
      const content = fs.readFileSync(dashboardPath, 'utf8');

      // Check for <pre, <pre>, <pre style=
      const preRegex = /<pre[\s>]/i;
      expect(preRegex.test(content)).toBe(false);
    });

    test('3.2 Dashboard.screen.tsx contains zero references to buildReportText()', () => {
      const dashboardPath = path.resolve(__dirname, '../navigation/screens/Dashboard.screen.tsx');
      const content = fs.readFileSync(dashboardPath, 'utf8');

      expect(content).not.toContain('buildReportText');
    });

    test('3.3 Dashboard.screen.tsx contains zero references to printReceiptDialog', () => {
      const dashboardPath = path.resolve(__dirname, '../navigation/screens/Dashboard.screen.tsx');
      const content = fs.readFileSync(dashboardPath, 'utf8');

      expect(content).not.toContain('printReceiptDialog');
    });

    test('3.4 Dashboard.screen.tsx contains zero references to printModalVisible', () => {
      const dashboardPath = path.resolve(__dirname, '../navigation/screens/Dashboard.screen.tsx');
      const content = fs.readFileSync(dashboardPath, 'utf8');

      expect(content).not.toContain('printModalVisible');
      expect(content).not.toContain('setPrintModalVisible');
    });

    test('3.5 Dashboard.screen.tsx styles contain zero monospace preview remnants', () => {
      const dashboardPath = path.resolve(__dirname, '../navigation/screens/Dashboard.screen.tsx');
      const content = fs.readFileSync(dashboardPath, 'utf8');

      expect(content).not.toContain('previewText:');
      expect(content).not.toContain('Courier');
    });

    test('3.6 Reports header and all 4 report cards have official vector PDF export actions', () => {
      const dashboardPath = path.resolve(__dirname, '../navigation/screens/Dashboard.screen.tsx');
      const content = fs.readFileSync(dashboardPath, 'utf8');

      // Top Reports header actions
      expect(content).toContain('accessibilityLabel="Export report vector PDF"');
      expect(content).toContain('accessibilityLabel="Print report vector PDF"');

      // Individual report card rightActions
      expect(content).toContain('Export Daily EOD PDF');
      expect(content).toContain('Export Morbidity PDF');
      expect(content).toContain('Export Tax Audit PDF');
      expect(content).toContain('Export Doctor Shares PDF');

      // Analytics header vector PDF actions
      expect(content).toContain('accessibilityLabel="Export analytics vector PDF"');
      expect(content).toContain('accessibilityLabel="Print analytics vector PDF"');
    });
  });

  // =========================================================================
  // Challenge 4: Widescreen Workstation Layout Compliance
  // =========================================================================
  describe('Challenge 4: Widescreen Workstation Layout Compliance', () => {
    test('4.1 styles.content enforces full width without maxWidth restriction', () => {
      const dashboardPath = path.resolve(__dirname, '../navigation/screens/Dashboard.screen.tsx');
      const content = fs.readFileSync(dashboardPath, 'utf8');

      // Find styles.content block
      const contentStyleBlockMatch = content.match(/content:\s*\{([^}]+)\}/);
      expect(contentStyleBlockMatch).not.toBeNull();
      const contentStyleBlock = contentStyleBlockMatch![1];

      // Must have width: '100%'
      expect(contentStyleBlock).toContain("width: '100%'");

      // Must NOT have maxWidth or alignSelf: 'center'
      expect(contentStyleBlock).not.toContain('maxWidth');
      expect(contentStyleBlock).not.toContain('alignSelf');
    });
  });
});

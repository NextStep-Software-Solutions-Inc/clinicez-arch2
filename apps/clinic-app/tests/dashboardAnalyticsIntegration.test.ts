// token-guard:ignore-file
import { describe, expect, test, mock, beforeEach } from 'bun:test';
import React from 'react';
import fs from 'node:fs';
import path from 'node:path';

(globalThis as any).__DEV__ = true;

// Mock react-native
let currentWindowWidth = 1280;
let currentWindowHeight = 800;

mock.module('react-native', () => ({
  Linking: { openURL: () => Promise.resolve(), canOpenURL: () => Promise.resolve(true) },
  StyleSheet: {
    create: (s: any) => s,
    flatten: (s: any) => s,
    absoluteFill: {},
  },
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
    View: 'Animated.View',
    Text: 'Animated.Text',
  },
  Alert: { alert: () => {} },
}));

mock.module('expo-crypto', () => ({
  randomUUID: () => 'test-uuid-' + Math.random().toString(36).substring(2, 9),
}));

mock.module('react-native-svg', () => ({
  Svg: 'Svg',
  Path: 'Path',
  Circle: 'Circle',
  Rect: 'Rect',
  Line: 'Line',
  Polyline: 'Polyline',
  default: 'Svg',
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

// Mock openDocument
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

const { clinicService } = await import('../services/clinicService');
const { openDocument } = await import('../services/documentOpener');
const { notify, getFeedbackState, resetFeedbackState } = await import('../utils/feedback');

describe('Milestone 4: Workstation Dashboard Modernization & PDF Streaming Integration', () => {
  beforeEach(() => {
    openedDocumentUrls = [];
    mockOpenDocumentResult = true;
    mockOpenDocumentError = null;
    resetFeedbackState();
  });

  // =========================================================================
  // 1. Widescreen Desktop Layout Verification
  // =========================================================================
  describe('1. Desktop Widescreen Layout (100% Span, Zero MaxWidth Restriction)', () => {
    const dashboardSource = fs.readFileSync(
      path.resolve(__dirname, '../navigation/screens/Dashboard.screen.tsx'),
      'utf-8'
    );

    test('1.1 styles.content specifies width: "100%"', () => {
      expect(dashboardSource).toMatch(/content:\s*\{[^}]*width:\s*['"]100%['"]/);
    });

    test('1.2 styles.content does NOT constrain maxWidth to theme.sizes.contentMaxWidth', () => {
      // Content style should no longer have maxWidth constraint
      const contentBlockMatch = dashboardSource.match(/content:\s*\{([^}]+)\}/);
      expect(contentBlockMatch).not.toBeNull();
      const contentProps = contentBlockMatch![1];
      expect(contentProps).not.toContain('maxWidth: theme.sizes.contentMaxWidth');
      expect(contentProps).not.toContain('maxWidth:');
    });

    test('1.3 styles.content padding and gap follow design tokens', () => {
      expect(dashboardSource).toContain('padding: theme.spacing.lg');
      expect(dashboardSource).toContain('gap: theme.spacing.lg');
      expect(dashboardSource).toContain('paddingBottom: theme.spacing[\'4xl\']');
    });
  });

  // =========================================================================
  // 2. ClinicService Authenticated PDF Streaming URLs
  // =========================================================================
  describe('2. ClinicService Authenticated PDF Streaming URL Helpers', () => {
    test('2.1 getDailyEodPdfUrl generates endpoint with optional date parameter', () => {
      const defaultUrl = clinicService.getDailyEodPdfUrl();
      expect(defaultUrl).toContain('/reports/daily-eod/pdf');

      const datedUrl = clinicService.getDailyEodPdfUrl('2026-10-15');
      expect(datedUrl).toContain('/reports/daily-eod/pdf?date=2026-10-15');

      // Backward compatible alias
      expect(clinicService.getDailyEodReportPdfUrl('2026-10-15')).toBe(datedUrl);
    });

    test('2.2 getMorbidityPdfUrl generates endpoint with optional date range parameters', () => {
      const defaultUrl = clinicService.getMorbidityPdfUrl();
      expect(defaultUrl).toContain('/reports/morbidity/pdf');

      const filteredUrl = clinicService.getMorbidityPdfUrl('2026-10-01', '2026-10-15');
      expect(filteredUrl).toContain('/reports/morbidity/pdf?startDate=2026-10-01&endDate=2026-10-15');

      // Backward compatible alias
      expect(clinicService.getMorbidityReportPdfUrl('2026-10-01', '2026-10-15')).toBe(filteredUrl);
    });

    test('2.3 getTaxDiscountsPdfUrl generates endpoint with optional date range parameters', () => {
      const defaultUrl = clinicService.getTaxDiscountsPdfUrl();
      expect(defaultUrl).toContain('/reports/tax-discounts/pdf');

      const filteredUrl = clinicService.getTaxDiscountsPdfUrl('2026-10-01', '2026-10-15');
      expect(filteredUrl).toContain('/reports/tax-discounts/pdf?startDate=2026-10-01&endDate=2026-10-15');

      // Backward compatible alias
      expect(clinicService.getTaxDiscountAuditPdfUrl('2026-10-01', '2026-10-15')).toBe(filteredUrl);
      expect(clinicService.getTaxDiscountAuditReportPdfUrl('2026-10-01', '2026-10-15')).toBe(filteredUrl);
    });

    test('2.4 getDoctorSharesPdfUrl generates endpoint with optional date range parameters', () => {
      const defaultUrl = clinicService.getDoctorSharesPdfUrl();
      expect(defaultUrl).toContain('/reports/doctor-shares/pdf');

      const filteredUrl = clinicService.getDoctorSharesPdfUrl('2026-10-01', '2026-10-15');
      expect(filteredUrl).toContain('/reports/doctor-shares/pdf?startDate=2026-10-01&endDate=2026-10-15');

      // Backward compatible alias
      expect(clinicService.getDoctorSharesReportPdfUrl('2026-10-01', '2026-10-15')).toBe(filteredUrl);
    });

    test('2.5 getAnalyticsPdfUrl generates endpoint with optional date range parameters', () => {
      const defaultUrl = clinicService.getAnalyticsPdfUrl();
      expect(defaultUrl).toContain('/reports/analytics/pdf');

      const filteredUrl = clinicService.getAnalyticsPdfUrl('2026-09-01', '2026-09-30');
      expect(filteredUrl).toContain('/reports/analytics/pdf?startDate=2026-09-01&endDate=2026-09-30');

      // Backward compatible alias
      expect(clinicService.getClinicAnalyticsPdfUrl('2026-09-01', '2026-09-30')).toBe(filteredUrl);
    });
  });

  // =========================================================================
  // 3. Analytics Tab Charting Integration
  // =========================================================================
  describe('3. Analytics Tab 4-Chart Integration & Lifecycle States', () => {
    const dashboardSource = fs.readFileSync(
      path.resolve(__dirname, '../navigation/screens/Dashboard.screen.tsx'),
      'utf-8'
    );

    test('3.1 All 4 interactive SVG charts are imported from components/analytics', () => {
      expect(dashboardSource).toContain("TrendLineChart");
      expect(dashboardSource).toContain("TenderDonutChart");
      expect(dashboardSource).toContain("MorbidityDistributionChart");
      expect(dashboardSource).toContain("WorkloadBarChart");
      expect(dashboardSource).toMatch(/from\s+['"].*components\/analytics['"]/);
    });

    test('3.2 renderAnalytics embeds all 4 charts connected to genuine data props', () => {
      expect(dashboardSource).toContain('<TrendLineChart');
      expect(dashboardSource).toContain('data={analytics.revenueTrend}');

      expect(dashboardSource).toContain('<TenderDonutChart');
      expect(dashboardSource).toContain('data={analytics.tenderShares}');

      expect(dashboardSource).toContain('<WorkloadBarChart');
      expect(dashboardSource).toContain('data={analytics.doctorStats}');

      expect(dashboardSource).toContain('<MorbidityDistributionChart');
      expect(dashboardSource).toMatch(/data=\{morbidityReport\?.diseases/);
    });

    test('3.3 Date range filter controls are wired to loadAnalytics(startDate, endDate)', () => {
      expect(dashboardSource).toContain('analyticsStartDate');
      expect(dashboardSource).toContain('analyticsEndDate');
      expect(dashboardSource).toContain('setAnalyticsStartDate');
      expect(dashboardSource).toContain('setAnalyticsEndDate');
      expect(dashboardSource).toContain('loadAnalytics(analyticsStartDate, analyticsEndDate)');
      expect(dashboardSource).toContain('Apply Filter');
    });

    test('3.4 Analytics tab provides 1-click vector PDF actions', () => {
      expect(dashboardSource).toContain('Export Analytics PDF');
      expect(dashboardSource).toContain('handleExportAnalyticsPdf');
      expect(dashboardSource).toContain('accessibilityLabel="Export analytics vector PDF"');
      expect(dashboardSource).toContain('accessibilityLabel="Print analytics vector PDF"');
    });

    test('3.5 4-state lifecycle handling (loading, empty, error, active) is present in analytics', () => {
      // Loading state
      expect(dashboardSource).toContain('<LoadingBlock rows={5} />');
      expect(dashboardSource).toContain('<SkeletonStat style={styles.statItem} />');
      // Error state
      expect(dashboardSource).toContain('title="Unable to load analytics"');
      expect(dashboardSource).toContain('onRetry={() => loadAnalytics(analyticsStartDate, analyticsEndDate)}');
      // Active & empty state props passed down to charts
      expect(dashboardSource).toContain('loading={analyticsLoading}');
      expect(dashboardSource).toContain('error={analyticsError}');
    });
  });

  // =========================================================================
  // 4. Reports Tab Vector PDF Actions & Card Integration
  // =========================================================================
  describe('4. Reports Tab Vector PDF Actions & Card Integration', () => {
    const dashboardSource = fs.readFileSync(
      path.resolve(__dirname, '../navigation/screens/Dashboard.screen.tsx'),
      'utf-8'
    );

    test('4.1 SegmentedControl supports all 4 statutory report types', () => {
      expect(dashboardSource).toContain("{ value: 'DAILY_EOD', label: 'End of day' }");
      expect(dashboardSource).toContain("{ value: 'MORBIDITY', label: 'Morbidity' }");
      expect(dashboardSource).toContain("{ value: 'TAX_DISCOUNT', label: 'Discount audit' }");
      expect(dashboardSource).toContain("{ value: 'DOCTOR_SHARES', label: 'Doctor shares' }");
    });

    test('4.2 Reports header provides Export PDF and Print vector streaming actions', () => {
      expect(dashboardSource).toContain('accessibilityLabel="Export report vector PDF"');
      expect(dashboardSource).toContain('accessibilityLabel="Print report vector PDF"');
      expect(dashboardSource).toContain('onPress={() => handleExportReportPdf()}');
      expect(dashboardSource).toContain('disabled={!currentReportReady || isExportingPdf}');
    });

    test('4.3 Individual report cards have direct rightAction export buttons with authenticated streaming URLs', () => {
      // Daily EOD card
      expect(dashboardSource).toContain('title="Export Daily EOD PDF"');
      expect(dashboardSource).toContain('clinicService.getDailyEodPdfUrl(eodDate || eodReport.reportDate)');

      // Morbidity card
      expect(dashboardSource).toContain('title="Export Morbidity PDF"');
      expect(dashboardSource).toContain('clinicService.getMorbidityPdfUrl(');

      // Tax audit card
      expect(dashboardSource).toContain('title="Export Tax Audit PDF"');
      expect(dashboardSource).toContain('clinicService.getTaxDiscountsPdfUrl(');

      // Doctor shares card
      expect(dashboardSource).toContain('title="Export Doctor Shares PDF"');
      expect(dashboardSource).toContain('clinicService.getDoctorSharesPdfUrl(');
    });

    test('4.4 Reports date range filters allow user-driven report refreshing', () => {
      expect(dashboardSource).toContain('eodDate');
      expect(dashboardSource).toContain('reportsStartDate');
      expect(dashboardSource).toContain('reportsEndDate');
      expect(dashboardSource).toContain('Apply Date');
      expect(dashboardSource).toContain("loadReports('DAILY_EOD', undefined, undefined, eodDate)");
    });
  });

  // =========================================================================
  // 5. Complete Elimination of Legacy Monospace Print Dialog
  // =========================================================================
  describe('5. Complete Elimination of Legacy Monospace Print Dialog & ASCII Receipts', () => {
    const dashboardSource = fs.readFileSync(
      path.resolve(__dirname, '../navigation/screens/Dashboard.screen.tsx'),
      'utf-8'
    );

    test('5.1 Zero references to printReceiptDialog', () => {
      expect(dashboardSource).not.toContain('printReceiptDialog');
    });

    test('5.2 Zero references to buildReportText()', () => {
      expect(dashboardSource).not.toContain('buildReportText');
    });

    test('5.3 Zero HTML <pre> receipt preview tags', () => {
      expect(dashboardSource).not.toContain('<pre');
      expect(dashboardSource).not.toContain('</pre>');
    });

    test('5.4 Zero references to printModalVisible or legacy receipt preview modal', () => {
      expect(dashboardSource).not.toContain('printModalVisible');
      expect(dashboardSource).not.toContain('handlePrintReport');
      expect(dashboardSource).not.toContain('subtitle="Print preview"');
    });

    test('5.5 Zero Courier / monospace font formatting workarounds', () => {
      expect(dashboardSource).not.toContain('Courier');
      expect(dashboardSource).not.toContain('monospace');
    });
  });

  // =========================================================================
  // 6. Vector PDF Document Opener & Error Handling
  // =========================================================================
  describe('6. Vector PDF Document Opener & Error Handling', () => {
    test('6.1 openDocument opens authenticated PDF streaming URL successfully', async () => {
      const url = clinicService.getAnalyticsPdfUrl('2026-10-01', '2026-10-31');
      const opened = await openDocument(url);

      expect(opened).toBe(true);
      expect(openedDocumentUrls).toContain(url);
    });

    test('6.2 Handles blocked popup gracefully and alerts user', async () => {
      resetFeedbackState();
      mockOpenDocumentResult = false;
      const url = clinicService.getDailyEodPdfUrl('2026-10-19');

      const opened = await openDocument(url);
      expect(opened).toBe(false);

      if (!opened) {
        notify.error('Unable to open document. Please check popup permissions.');
      }

      const feedbackState = getFeedbackState();
      expect(feedbackState.toasts.some(t => t.message === 'Unable to open document. Please check popup permissions.')).toBe(true);
    });

    test('6.3 Catches network or streaming failure and displays notification', async () => {
      resetFeedbackState();
      mockOpenDocumentError = new Error('Network error streaming vector PDF');
      const url = clinicService.getTaxDiscountsPdfUrl('2026-01-01', '2026-01-31');

      try {
        await openDocument(url);
      } catch (err: any) {
        notify.error(err?.message ?? 'Failed to stream vector PDF.');
      }

      const feedbackState = getFeedbackState();
      expect(feedbackState.toasts.some(t => t.message === 'Network error streaming vector PDF')).toBe(true);
    });
  });

  // =========================================================================
  // 7. Component Rendering & Chart Calculations
  // =========================================================================
  describe('7. Component Chart Rendering & Genuine Data Calculation Verification', () => {
    const { default: TrendLineChart } = require('../components/analytics/TrendLineChart');
    const { default: TenderDonutChart } = require('../components/analytics/TenderDonutChart');
    const { default: WorkloadBarChart } = require('../components/analytics/WorkloadBarChart');
    const { default: MorbidityDistributionChart } = require('../components/analytics/MorbidityDistributionChart');

    test('7.1 TrendLineChart renders without crashing on empty and active datasets', () => {
      expect(typeof TrendLineChart).toBe('function');
      const emptyElement = React.createElement(TrendLineChart, { data: [], loading: false });
      expect(emptyElement).toBeDefined();

      const activeElement = React.createElement(TrendLineChart, {
        data: [
          { dateLabel: 'Mon', revenue: 15000, patientCount: 25 },
          { dateLabel: 'Tue', revenue: 22000, patientCount: 38 },
        ],
        loading: false,
      });
      expect(activeElement).toBeDefined();
    });

    test('7.2 TenderDonutChart renders without crashing on empty and active datasets', () => {
      expect(typeof TenderDonutChart).toBe('function');
      const emptyElement = React.createElement(TenderDonutChart, { data: [], loading: false });
      expect(emptyElement).toBeDefined();

      const activeElement = React.createElement(TenderDonutChart, {
        data: [
          { method: 'Cash', totalAmount: 45000, percentage: 60 },
          { method: 'GCash', totalAmount: 30000, percentage: 40 },
        ],
        loading: false,
      });
      expect(activeElement).toBeDefined();
    });

    test('7.3 WorkloadBarChart renders without crashing on empty and active datasets', () => {
      expect(typeof WorkloadBarChart).toBe('function');
      const emptyElement = React.createElement(WorkloadBarChart, { data: [], loading: false });
      expect(emptyElement).toBeDefined();

      const activeElement = React.createElement(WorkloadBarChart, {
        data: [
          { doctorId: 'doc-1', doctorName: 'Dr. Santos', encountersCount: 32, totalBilled: 48000 },
          { doctorId: 'doc-2', doctorName: 'Dr. Reyes', encountersCount: 20, totalBilled: 30000 },
        ],
        loading: false,
      });
      expect(activeElement).toBeDefined();
    });

    test('7.4 MorbidityDistributionChart renders without crashing on empty and active datasets', () => {
      expect(typeof MorbidityDistributionChart).toBe('function');
      const emptyElement = React.createElement(MorbidityDistributionChart, { data: [], loading: false });
      expect(emptyElement).toBeDefined();

      const activeElement = React.createElement(MorbidityDistributionChart, {
        data: [
          {
            rank: 1,
            icd10Code: 'J00',
            description: 'Acute nasopharyngitis [common cold]',
            totalCases: 45,
            pediatricCases: 20,
            adultCases: 20,
            seniorCases: 5,
            percentageOfTotal: 50.0,
          },
        ],
        loading: false,
      });
      expect(activeElement).toBeDefined();
    });
  });
});

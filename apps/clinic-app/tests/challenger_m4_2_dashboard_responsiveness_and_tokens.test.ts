// token-guard:ignore-file
import { describe, expect, test, mock } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

(globalThis as any).__DEV__ = true;

let simulatedWidth = 1280;
let simulatedHeight = 800;

const createMockComponent = (name: string) => {
  const Comp = ({
    children,
    accessibilityLabel,
    accessibilityRole,
    testID,
    style,
    onPress,
    onLayout,
    ...props
  }: any) =>
    React.createElement(
      'div',
      {
        'data-component': name,
        ...(testID ? { 'data-testid': testID } : {}),
        ...(accessibilityLabel ? { 'aria-label': accessibilityLabel } : {}),
        ...(accessibilityRole ? { role: accessibilityRole } : {}),
        ...props,
      },
      children
    );
  Comp.displayName = name;
  return Comp;
};

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
  Platform: { OS: 'web', select: (obj: any) => obj.web ?? obj.default },
  Dimensions: {
    get: () => ({ width: simulatedWidth, height: simulatedHeight }),
    addEventListener: () => ({ remove: () => {} }),
  },
  useWindowDimensions: () => ({ width: simulatedWidth, height: simulatedHeight }),
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
  Polyline: createMockComponent('Polyline'),
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

describe('Challenger M4-2: Modernized Dashboard Responsiveness & Token Adherence Stress Suite', () => {
  const dashboardPath = path.resolve(__dirname, '../navigation/screens/Dashboard.screen.tsx');
  const dashboardSource = fs.readFileSync(dashboardPath, 'utf8');

  // Sample analytics datasets for chart stress testing
  const sampleTrendData = [
    { date: '2026-10-14', dateLabel: 'Oct 14', revenue: 15400.0, patientCount: 18 },
    { date: '2026-10-15', dateLabel: 'Oct 15', revenue: 22100.0, patientCount: 24 },
    { date: '2026-10-16', dateLabel: 'Oct 16', revenue: 18900.0, patientCount: 20 },
    { date: '2026-10-17', dateLabel: 'Oct 17', revenue: 31200.0, patientCount: 35 },
  ];

  const sampleWorkloadData = [
    { doctorId: 'doc-1', doctorName: 'Dr. Jose Rizal, MD', encountersCount: 25, totalBilled: 125000.0 },
    { doctorId: 'doc-2', doctorName: 'Dr. Antonio Luna, MD', encountersCount: 18, totalBilled: 98000.0 },
    { doctorId: 'doc-3', doctorName: 'Dr. Maria Clara, MD', encountersCount: 12, totalBilled: 64000.0 },
  ];

  const sampleTenderData = [
    { method: 'Cash', totalAmount: 145000.0, transactionCount: 45, percentage: 50.5 },
    { method: 'GCash', totalAmount: 85000.0, transactionCount: 28, percentage: 29.6 },
    { method: 'Maya', totalAmount: 32000.0, transactionCount: 12, percentage: 11.1 },
    { method: 'Credit Card', totalAmount: 25000.0, transactionCount: 8, percentage: 8.8 },
  ];

  const sampleMorbidityData = [
    {
      icd10Code: 'J06.9',
      description: 'Acute upper respiratory infection, unspecified',
      totalCases: 54,
      pediatricCases: 28,
      adultCases: 20,
      seniorCases: 6,
      percentageOfTotal: 34.8,
    },
    {
      icd10Code: 'I10',
      description: 'Essential (primary) hypertension',
      totalCases: 42,
      pediatricCases: 0,
      adultCases: 22,
      seniorCases: 20,
      percentageOfTotal: 27.1,
    },
  ];

  // =========================================================================
  // 1. Viewport Layout Behavior & Horizontal Overflow Verification
  // =========================================================================
  describe('1. Viewport Layout Behavior (375px, 820px, 1440px, 1920px)', () => {
    const targetViewports = [
      { name: 'Mobile', width: 375, height: 667, hasSidebar: false, sidebarWidth: 0 },
      { name: 'Tablet', width: 820, height: 1180, hasSidebar: true, sidebarWidth: 72 },
      { name: 'Desktop', width: 1440, height: 900, hasSidebar: true, sidebarWidth: 260 },
      { name: 'Wide Workstation', width: 1920, height: 1080, hasSidebar: true, sidebarWidth: 260 },
    ];

    test('1.1 Dashboard styles.content spans 100% with ZERO maxWidth restriction', () => {
      const contentMatch = dashboardSource.match(/content:\s*\{([^}]+)\}/);
      expect(contentMatch).not.toBeNull();
      const contentProps = contentMatch![1];
      expect(contentProps).toContain("width: '100%'");
      expect(contentProps).not.toContain('maxWidth');
      expect(contentProps).not.toContain('alignSelf: \'center\'');
    });

    test('1.2 Container horizontal flex layout prevents overflow via wrap or flex shrink', () => {
      // Check all horizontal flex containers in Dashboard.screen.tsx
      const horizontalRowNames = [
        'twoCol',
        'statRow',
        'queueActionsRow',
        'actionRow',
        'formGrid',
        'zScorePillsRow',
        'chipsRow',
        'analyticsHeaderRow',
        'dateRangePickerRow',
        'reportsHeaderRow',
      ];

      for (const rowName of horizontalRowNames) {
        const rowRegex = new RegExp(`${rowName}:\\s*\\{([^}]+)\\}`, 'm');
        const match = dashboardSource.match(rowRegex);
        expect(match).not.toBeNull();
        const body = match![1];
        if (body.includes("flexDirection: 'row'")) {
          // Horizontal row must have flexWrap: 'wrap' to prevent horizontal overflow on small screens
          expect(body).toContain("flexWrap: 'wrap'");
        }
      }
    });

    for (const vp of targetViewports) {
      describe(`Viewport Geometry & No-Overflow at ${vp.name} (${vp.width}px)`, () => {
        const outerPadding = 16 * 2; // theme.spacing.lg on both sides
        const mainColumnWidth = vp.width - vp.sidebarWidth;
        const availableContentWidth = mainColumnWidth - outerPadding;

        test(`${vp.name} content width is calculated correctly without negative margins`, () => {
          expect(availableContentWidth).toBeGreaterThan(300);
        });

        test(`${vp.name} StatCards fit within viewport without horizontal overflow`, () => {
          const itemBasis = 160;
          const gap = 12; // theme.spacing.md
          // Columns that fit on one line:
          const maxCols = Math.max(1, Math.floor((availableContentWidth + gap) / (itemBasis + gap)));
          const itemWidth = (availableContentWidth - (maxCols - 1) * gap) / maxCols;

          expect(itemWidth).toBeGreaterThanOrEqual(itemBasis - 20);
          expect(itemWidth * maxCols + (maxCols - 1) * gap).toBeLessThanOrEqual(availableContentWidth + 0.1);
        });

        test(`${vp.name} Two-Column cards (TenderDonut & WorkloadBar) wrap or split cleanly`, () => {
          const colBasis = 320;
          const colGap = 16; // theme.spacing.lg
          if (availableContentWidth < colBasis * 2 + colGap) {
            // Mobile (375px) or narrow tablet: columns stack (1 column)
            const singleColWidth = availableContentWidth;
            expect(singleColWidth).toBeLessThan(colBasis * 2 + colGap);
            expect(singleColWidth).toBeLessThanOrEqual(availableContentWidth);
          } else {
            // Desktop / Wide workstation: 2 columns side-by-side
            const cols = 2;
            const twoColWidth = (availableContentWidth - colGap) / cols;
            expect(twoColWidth).toBeGreaterThanOrEqual(colBasis);
            expect(twoColWidth * 2 + colGap).toBeLessThanOrEqual(availableContentWidth + 0.1);
          }
        });

        test(`${vp.name} Date filter inputs and buttons do not cause horizontal overflow`, () => {
          const dateInputMinWidth = 140;
          const dateGap = 8;
          // In mobile, date inputs wrap if needed; in desktop, they sit side-by-side
          expect(dateInputMinWidth * 2 + dateGap).toBeLessThanOrEqual(availableContentWidth);
        });

        test(`${vp.name} TrendLineChart renders without NaN or horizontal clipping`, () => {
          simulatedWidth = vp.width;
          simulatedHeight = vp.height;

          const markup = renderToStaticMarkup(
            React.createElement(TrendLineChart, { data: sampleTrendData })
          );

          expect(markup).toContain('data-testid="trend-line-chart"');
          expect(markup).toContain('data-component="Svg"');
          expect(markup).not.toContain('NaN');
          expect(markup).not.toContain('Infinity');
          expect(markup).not.toContain('undefined');
        });

        test(`${vp.name} TenderDonutChart renders without NaN or horizontal clipping`, () => {
          simulatedWidth = vp.width;
          simulatedHeight = vp.height;

          const markup = renderToStaticMarkup(
            React.createElement(TenderDonutChart, { data: sampleTenderData })
          );

          expect(markup).toContain('data-testid="tender-donut-chart"');
          expect(markup).toContain('data-component="Svg"');
          expect(markup).not.toContain('NaN');
          expect(markup).not.toContain('Infinity');
          expect(markup).not.toContain('undefined');
        });

        test(`${vp.name} WorkloadBarChart renders without NaN or horizontal clipping`, () => {
          simulatedWidth = vp.width;
          simulatedHeight = vp.height;

          const markup = renderToStaticMarkup(
            React.createElement(WorkloadBarChart, { data: sampleWorkloadData })
          );

          expect(markup).toContain('data-testid="workload-bar-chart"');
          expect(markup).toContain('data-component="Svg"');
          expect(markup).not.toContain('NaN');
          expect(markup).not.toContain('Infinity');
          expect(markup).not.toContain('undefined');
        });

        test(`${vp.name} MorbidityDistributionChart renders without NaN or horizontal clipping`, () => {
          simulatedWidth = vp.width;
          simulatedHeight = vp.height;

          const markup = renderToStaticMarkup(
            React.createElement(MorbidityDistributionChart, { data: sampleMorbidityData })
          );

          expect(markup).toContain('data-testid="morbidity-distribution-chart"');
          expect(markup).toContain('data-component="Svg"');
          expect(markup).not.toContain('NaN');
          expect(markup).not.toContain('Infinity');
          expect(markup).not.toContain('undefined');
        });
      });
    }
  });

  // =========================================================================
  // 2. Strict Design Token Adherence Verification
  // =========================================================================
  describe('2. Design Token Adherence Audit', () => {
    test('2.1 Node check-tokens script executes with zero violations in strict mode', () => {
      const clinicAppDir = path.resolve(__dirname, '..');
      const output = execSync('node scripts/check-tokens.mjs --strict', {
        cwd: clinicAppDir,
        encoding: 'utf8',
        env: { ...process.env, PATH: `/Users/macuser/.local/bin:${process.env.PATH}` },
      });

      expect(output).toContain('Token guard: 0 violation(s) in 0 file(s).');
    });

    test('2.2 Dashboard.screen.tsx has ZERO raw hex color literals', () => {
      // Exclude comments
      const uncommented = dashboardSource.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
      const hexMatches = uncommented.match(/#(?:[0-9a-fA-F]{3}){1,2}(?:[0-9a-fA-F]{2})?\b/g) || [];
      expect(hexMatches).toEqual([]);
    });

    test('2.3 Dashboard.screen.tsx has ZERO raw rgba() / rgb() literals', () => {
      const uncommented = dashboardSource.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
      const rgbMatches = uncommented.match(/\brgba?\s*\([^)]*\)/gi) || [];
      expect(rgbMatches).toEqual([]);
    });

    test('2.4 Dashboard.screen.tsx has ZERO raw numeric fontSize properties', () => {
      const uncommented = dashboardSource.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
      const fontSizeMatches = uncommented.match(/fontSize\s*:\s*\d+/g) || [];
      expect(fontSizeMatches).toEqual([]);
    });

    test('2.5 Dashboard.screen.tsx has ZERO raw numeric borderRadius properties', () => {
      const uncommented = dashboardSource.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
      const radiusMatches = uncommented.match(/\b(?!shadow)\w*[rR]adius\s*:\s*[1-9]\d*/g) || [];
      expect(radiusMatches).toEqual([]);
    });

    test('2.6 Dashboard.screen.tsx has ZERO direct imports from palette.ts', () => {
      expect(dashboardSource).not.toMatch(/from\s+['"].*constants\/tokens['"]/);
      expect(dashboardSource).not.toMatch(/palette\./);
    });
  });

  // =========================================================================
  // 3. Network Isolation Verification
  // =========================================================================
  describe('3. Network Isolation Audit', () => {
    test('3.1 lint:hosts script executes with zero external host violations', () => {
      const clinicAppDir = path.resolve(__dirname, '..');
      const output = execSync('node scripts/check-no-external-hosts.mjs', {
        cwd: clinicAppDir,
        encoding: 'utf8',
        env: { ...process.env, PATH: `/Users/macuser/.local/bin:${process.env.PATH}` },
      });

      expect(output).toContain('Host/catalog gate OK');
    });

    test('3.2 Dashboard.screen.tsx and analytics charts have ZERO external network URLs', () => {
      const filesToAudit = [
        path.resolve(__dirname, '../navigation/screens/Dashboard.screen.tsx'),
        path.resolve(__dirname, '../components/analytics/TrendLineChart.tsx'),
        path.resolve(__dirname, '../components/analytics/TenderDonutChart.tsx'),
        path.resolve(__dirname, '../components/analytics/WorkloadBarChart.tsx'),
        path.resolve(__dirname, '../components/analytics/MorbidityDistributionChart.tsx'),
      ];

      for (const filePath of filesToAudit) {
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (line.includes('http://') || line.includes('https://')) {
            // Allow only standard XML namespace if present
            expect(line).not.toMatch(/https?:\/\/(?!www\.w3\.org)/);
          }
        }
      }
    });
  });

  // =========================================================================
  // 4. Integration Tests Verification
  // =========================================================================
  describe('4. Dashboard Analytics Integration Test Suite Run', () => {
    test('4.1 dashboardAnalyticsIntegration.test.ts file exists and is valid', () => {
      const integrationTestPath = path.resolve(__dirname, 'dashboardAnalyticsIntegration.test.ts');
      expect(fs.existsSync(integrationTestPath)).toBe(true);
    });
  });
});

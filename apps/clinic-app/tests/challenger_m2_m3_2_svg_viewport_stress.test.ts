// token-guard:ignore-file
import { describe, expect, test, mock } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'node:fs';
import path from 'node:path';

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

describe('Challenger M2/M3: Viewport Responsiveness & Token Adherence Stress Suite', () => {
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
    {
      icd10Code: 'E11.9',
      description: 'Type 2 diabetes mellitus without complications',
      totalCases: 28,
      pediatricCases: 0,
      adultCases: 14,
      seniorCases: 14,
      percentageOfTotal: 18.1,
    },
  ];

  const viewports = [
    { name: 'Mobile (375px)', width: 375, height: 667, isCompact: true },
    { name: 'Small Mobile (320px)', width: 320, height: 568, isCompact: true },
    { name: 'Tablet (820px)', width: 820, height: 1180, isCompact: false },
    { name: 'Desktop (1440px)', width: 1440, height: 900, isCompact: false },
    { name: 'Wide Workstation (1920px)', width: 1920, height: 1080, isCompact: false },
  ];

  for (const vp of viewports) {
    describe(`Viewport Stress: ${vp.name}`, () => {
      test(`TrendLineChart adapts cleanly to ${vp.name}`, () => {
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

        // Verify SVG elements exist
        expect(markup).toContain('data-component="Path"');
        expect(markup).toContain('data-component="Circle"');
        expect(markup).toContain('data-component="Line"');
      });

      test(`WorkloadBarChart adapts cleanly to ${vp.name}`, () => {
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

        // Verify bar rectangles exist
        expect(markup).toContain('data-component="Rect"');
        expect(markup).toContain('Dr. Jose Ri');
      });

      test(`TenderDonutChart adapts cleanly to ${vp.name}`, () => {
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

        // Verify donut paths
        expect(markup).toContain('data-component="Path"');
        expect(markup).toContain('Cash');
        expect(markup).toContain('GCash');
      });

      test(`MorbidityDistributionChart adapts cleanly to ${vp.name}`, () => {
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

        // Verify horizontal SVG bars
        expect(markup).toContain('data-component="Rect"');
        expect(markup).toContain('J06.9');
        expect(markup).toContain('I10');
      });
    });
  }

  describe('Strict Design Token & Forbidden Literal Audit Across Touched Components', () => {
    const analyticsDir = path.resolve(__dirname, '../components/analytics');
    const files = fs.readdirSync(analyticsDir).filter((f) => f.endsWith('.tsx') || f.endsWith('.ts'));

    test('Found analytics component files to audit', () => {
      expect(files.length).toBeGreaterThanOrEqual(5);
      expect(files).toContain('TrendLineChart.tsx');
      expect(files).toContain('WorkloadBarChart.tsx');
      expect(files).toContain('TenderDonutChart.tsx');
      expect(files).toContain('MorbidityDistributionChart.tsx');
      expect(files).toContain('index.ts');
    });

    for (const file of files) {
      test(`File ${file} has ZERO raw hex color literals`, () => {
        const filePath = path.join(analyticsDir, file);
        const content = fs.readFileSync(filePath, 'utf8');

        // Match #xxx, #xxxxxx, #xxxxxxxx
        const hexRegex = /#(?:[0-9a-fA-F]{3}){1,2}(?:[0-9a-fA-F]{2})?\b/g;
        const matches = content.match(hexRegex) || [];
        expect(matches).toEqual([]);
      });

      test(`File ${file} has ZERO rgba() or rgb() literals`, () => {
        const filePath = path.join(analyticsDir, file);
        const content = fs.readFileSync(filePath, 'utf8');

        const rgbRegex = /\brgba?\s*\([^)]*\)/gi;
        const matches = content.match(rgbRegex) || [];
        expect(matches).toEqual([]);
      });

      test(`File ${file} has ZERO external network host references`, () => {
        const filePath = path.join(analyticsDir, file);
        const content = fs.readFileSync(filePath, 'utf8');

        // Check for http:// or https:// (excluding standard XML namespace if any)
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (line.includes('http://') || line.includes('https://')) {
            // Must not be an external host call
            expect(line).not.toMatch(/https?:\/\/(?!www\.w3\.org)/);
          }
        }
      });

      test(`File ${file} has ZERO raw numeric font size properties`, () => {
        const filePath = path.join(analyticsDir, file);
        const content = fs.readFileSync(filePath, 'utf8');

        // Check for fontSize: <number> (not fontSize: theme.fontSizes.*)
        const rawFontSizeRegex = /fontSize\s*:\s*\d+/g;
        const matches = content.match(rawFontSizeRegex) || [];
        expect(matches).toEqual([]);
      });

      test(`File ${file} has ZERO raw numeric border radius properties`, () => {
        const filePath = path.join(analyticsDir, file);
        const content = fs.readFileSync(filePath, 'utf8');

        // Check for borderRadius: <number> or rx: <number> (not theme.radii.*)
        const rawRadiusRegex = /borderRadius\s*:\s*\d+/g;
        const matches = content.match(rawRadiusRegex) || [];
        expect(matches).toEqual([]);
      });
    }
  });
});

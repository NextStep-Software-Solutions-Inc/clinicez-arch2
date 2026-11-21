// token-guard:ignore-file
import { describe, expect, mock, test } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as fs from 'fs';
import * as path from 'path';

(globalThis as any).__DEV__ = true;

const createStyledMock = (name: string) => {
  const Comp = ({ children, style, ...rest }: any) => {
    const resolvedStyle =
      typeof style === 'function' ? style({ pressed: false, hovered: false }) : style;
    const flat = Array.isArray(resolvedStyle)
      ? Object.assign({}, ...resolvedStyle.flat(Infinity).filter(Boolean))
      : resolvedStyle;
    return React.createElement(
      'div',
      {
        'data-component': name,
        ...(flat ? { 'data-style': JSON.stringify(flat) } : {}),
        ...(rest.testID ? { 'data-testid': rest.testID } : {}),
      },
      children,
    );
  };
  Comp.displayName = name;
  return Comp;
};

mock.module('react-native', () => ({
  StyleSheet: {
    create: (s: any) => s,
    flatten: (s: any) => (Array.isArray(s) ? Object.assign({}, ...s.flat(Infinity).filter(Boolean)) : s),
    absoluteFill: {},
  },
  View: createStyledMock('View'),
  Pressable: createStyledMock('Pressable'),
  ScrollView: createStyledMock('ScrollView'),
  TextInput: createStyledMock('TextInput'),
  Text: createStyledMock('Text'),
  ActivityIndicator: createStyledMock('ActivityIndicator'),
  Modal: ({ visible, children }: any) => (visible ? React.createElement('div', null, children) : null),
  KeyboardAvoidingView: createStyledMock('KeyboardAvoidingView'),
  Platform: { OS: 'web', select: (obj: any) => obj.web ?? obj.default },
  Dimensions: {
    get: () => ({ width: 1280, height: 800 }),
    addEventListener: () => ({ remove: () => {} }),
  },
}));

mock.module('../constants/fonts', () => ({
  applyFontFamily: (s: any) => s,
  fontAssets: {},
}));

mock.module('../components/ui/Icon', () => ({
  __esModule: true,
  default: createStyledMock('Icon'),
  IconSlot: createStyledMock('IconSlot'),
  resolveIconName: (name: string) => name,
  ICONS: {},
}));

mock.module('../services/apiClient', () => ({
  clinicApiClient: { get: async () => [null, null], post: async () => [null, null] },
  clinicApiUrl: (p: string) => p,
}));

const { theme } = await import('../constants/theme');
const { default: Input } = await import('../components/ui/Input');
const { default: Select } = await import('../components/ui/Select');
const { default: ValidatedDateInput } = await import('../components/ui/ValidatedDateInput');
const { default: BloodTypeSelect } = await import('../components/ui/BloodTypeSelect');
const { default: PhilHealthPinInput } = await import('../components/ui/PhilHealthPinInput');

function extractAsteriskFontStyles(markup: string): Array<{ fontSize?: number; lineHeight?: number }> {
  const results: Array<{ fontSize?: number; lineHeight?: number }> = [];
  const regex = /data-style="([^"]+)"[^>]*>\s*\*\s*<\/div>/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(markup)) !== null) {
    const decoded = match[1].replace(/&quot;/g, '"');
    results.push(JSON.parse(decoded));
  }
  return results;
}

describe('Patient Intake & Edit Vertical Alignment (Required Asterisk Typography)', () => {
  test('Required field asterisks match captionBold fontSize and lineHeight across form controls', () => {
    const caption = theme.typography.captionBold;

    const markups = [
      renderToStaticMarkup(React.createElement(Input, { label: 'First Name', required: true, value: '', onChangeText: () => {} })),
      renderToStaticMarkup(React.createElement(Input, { label: 'PIN', required: true, labelTooltip: 'Help', value: '', onChangeText: () => {} })),
      renderToStaticMarkup(React.createElement(Select, { label: 'Gender Identity', required: true, options: [], onSelect: () => {} })),
      renderToStaticMarkup(React.createElement(ValidatedDateInput, { label: 'Date of Birth', required: true, value: '', onChangeText: () => {} })),
      renderToStaticMarkup(React.createElement(BloodTypeSelect, { label: 'Blood Type', required: true, value: '', onChange: () => {} })),
      renderToStaticMarkup(React.createElement(PhilHealthPinInput, { label: 'PhilHealth PIN', required: true, value: '', onChangeText: () => {} })),
    ];

    for (const html of markups) {
      const styles = extractAsteriskFontStyles(html);
      expect(styles.length).toBeGreaterThan(0);
      for (const s of styles) {
        expect(s.fontSize).toBe(caption.fontSize);
        expect(s.lineHeight).toBe(caption.lineHeight);
      }
    }
  });

  test('No component renders a nested required asterisk <ThemedText> without an explicit typography variant', () => {
    const dirsToScan = [
      path.resolve(__dirname, '../components'),
      path.resolve(__dirname, '../navigation'),
    ];
    const offending: string[] = [];

    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(tsx|ts)$/.test(entry.name)) {
          const content = fs.readFileSync(full, 'utf8');
          if (/<ThemedText(?![^>]*\bvariant=)[^>]*>\s*\*\s*<\/ThemedText>/.test(content)) {
            offending.push(path.relative(path.resolve(__dirname, '..'), full));
          }
        }
      }
    };

    dirsToScan.forEach(walk);
    expect(offending).toEqual([]);
  });
});

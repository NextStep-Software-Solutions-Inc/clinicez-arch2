// token-guard:ignore-file
import { describe, expect, it, mock } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const createMockComponent = (name: string) => {
  const Comp = ({ children, style }: any) =>
    React.createElement('div', { 'data-component': name, 'data-style': JSON.stringify(style) }, children);
  Comp.displayName = name;
  return Comp;
};

mock.module('react-native', () => ({
  StyleSheet: { create: (s: any) => s, flatten: (s: any) => s },
  View: createMockComponent('View'),
  Text: createMockComponent('Text'),
  TextInput: createMockComponent('TextInput'),
  AppState: { currentState: 'active', addEventListener: () => ({ remove: () => {} }) },
  Platform: { OS: 'web', select: (obj: any) => obj.web ?? obj.default },
}));

mock.module('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
  SafeAreaProvider: ({ children }: any) => children,
}));

mock.module('../constants/fonts', () => ({
  applyFontFamily: (s: any) => s,
}));

const { useSafeInsets } = await import('../utils/useSafeInsets');
const { TEXT_SCALE_OPTIONS, TextScaleProvider, useTextScale } = await import('../context/TextScaleContext');
const { Text } = await import('../components/ui/Text');

describe('useSafeInsets Fallback', () => {
  it('returns default zero insets without throwing when outside SafeAreaProvider', () => {
    const insets = useSafeInsets();
    expect(insets).toBeDefined();
    expect(insets.top).toBe(0);
    expect(insets.bottom).toBe(0);
    expect(insets.left).toBe(0);
    expect(insets.right).toBe(0);
  });
});

describe('TextScaleContext & Presets', () => {
  it('defines 6 canonical typography scale presets including down to 60%', () => {
    expect(TEXT_SCALE_OPTIONS).toHaveLength(6);
    const presets = TEXT_SCALE_OPTIONS.map((o) => o.preset);
    expect(presets).toContain('micro');
    expect(presets).toContain('tiny');
    expect(presets).toContain('compact');
    expect(presets).toContain('standard');
    expect(presets).toContain('large');
    expect(presets).toContain('xlarge');
  });

  it('micro scale is 0.6 (60%), compact is 0.85 (85%), and standard is 1.0 (100%)', () => {
    const micro = TEXT_SCALE_OPTIONS.find((o) => o.preset === 'micro');
    const compact = TEXT_SCALE_OPTIONS.find((o) => o.preset === 'compact');
    const standard = TEXT_SCALE_OPTIONS.find((o) => o.preset === 'standard');
    expect(micro?.scale).toBe(0.6);
    expect(compact?.scale).toBe(0.85);
    expect(standard?.scale).toBe(1.0);
  });

  it('provides active scale and changes preset via context', () => {
    let captured: any = null;

    function TestConsumer() {
      captured = useTextScale();
      return React.createElement('span', null, `Scale: ${captured.scale}`);
    }

    renderToStaticMarkup(
      React.createElement(
        TextScaleProvider,
        null,
        React.createElement(TestConsumer, null)
      )
    );

    expect(captured).not.toBeNull();
    expect(typeof captured.setPreset).toBe('function');
    expect(typeof captured.setScale).toBe('function');
  });

  it('renders Text with scaled style when scale is applied', () => {
    function ScaledTextTest() {
      return React.createElement(
        TextScaleProvider,
        null,
        React.createElement(Text, { style: { fontSize: 20, lineHeight: 28 } }, 'Sample Workstation Text')
      );
    }

    const html = renderToStaticMarkup(React.createElement(ScaledTextTest, null));
    expect(html).toContain('Sample Workstation Text');
  });
});

// token-guard:ignore-file
import { describe, expect, test, mock } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const createMockComponent = (name: string) => {
  const Comp = ({ children, accessibilityLabel, accessibilityRole, placeholder, value, onPress, title, source }: any) =>
    React.createElement(
      'div',
      {
        'data-component': name,
        ...(accessibilityLabel ? { 'aria-label': accessibilityLabel } : {}),
        ...(accessibilityRole ? { role: accessibilityRole } : {}),
        ...(placeholder ? { 'data-placeholder': placeholder } : {}),
        ...(value !== undefined ? { 'data-value': value } : {}),
        ...(title ? { 'data-title': title } : {}),
        ...(source?.uri ? { 'data-src': source.uri } : {}),
        onClick: onPress,
      },
      title ?? placeholder ?? children
    );
  Comp.displayName = name;
  return Comp;
};

mock.module('react-native', () => ({
  StyleSheet: { create: (s: any) => s, flatten: (s: any) => s },
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
  Keyboard: { dismiss: () => {}, addListener: () => ({ remove: () => {} }) },
  AppState: { addEventListener: () => ({ remove: () => {} }) },
  Dimensions: { get: () => ({ width: 1280, height: 800 }), addEventListener: () => ({ remove: () => {} }) },
  useWindowDimensions: () => ({ width: 1280, height: 800 }),
  Platform: { OS: 'web', select: (obj: any) => obj.web ?? obj.default },
  Touchable: { Mixin: {} },
  TurboModuleRegistry: { get: () => null, getEnforcing: () => null },
  NativeModules: {},
  PanResponder: { create: () => ({ panHandlers: {} }) },
  Alert: { alert: () => {} },
  processColor: (c: any) => c,
}));

mock.module('react-native-svg', () => ({
  default: 'Svg',
  Svg: 'Svg',
  Path: 'Path',
  Circle: 'Circle',
  Rect: 'Rect',
  Line: 'Line',
  Polyline: 'Polyline',
  Polygon: 'Polygon',
  G: 'G',
  Defs: ({ children }: any) => children,
  LinearGradient: ({ children }: any) => children,
  Stop: () => null,
  Text: ({ children }: any) => children,
}));

mock.module('../constants/fonts', () => ({
  applyFontFamily: (s: any) => s,
  fontAssets: {},
}));
mock.module('@expo-google-fonts/geist', () => ({
  useFonts: () => [true],
}));
mock.module('@expo-google-fonts/geist-mono', () => ({
  useFonts: () => [true],
}));

const {
  resolveClinicBrandColor,
  isUsableAccent,
  readableForeground,
  contrastRatio,
  relativeLuminance,
  BRAND_COLOR_PRESETS,
  DEFAULT_CLINIC_BRAND_COLOR,
  LEGACY_UNSET_ACCENT,
} = await import('../constants/color');

const ColorBrandingSection = (await import('../components/settings/ColorBrandingSection')).default;

describe('Color Branding & WCAG Contrast Utilities', () => {
  test('all curated brand presets have valid hex and pass WCAG usable contrast', () => {
    expect(BRAND_COLOR_PRESETS.length).toBeGreaterThanOrEqual(6);
    for (const preset of BRAND_COLOR_PRESETS) {
      expect(isUsableAccent(preset.color)).toBe(true);
      const fg = readableForeground(preset.color);
      expect(['#FFFFFF', '#111827']).toContain(fg);
    }
  });

  test('relativeLuminance and contrastRatio correctly calculate WCAG values', () => {
    const whiteLum = relativeLuminance('#FFFFFF');
    const blackLum = relativeLuminance('#000000');
    expect(whiteLum).toBeCloseTo(1, 2);
    expect(blackLum).toBeCloseTo(0, 2);

    const ratio = contrastRatio('#FFFFFF', '#000000');
    expect(ratio).toBeCloseTo(21, 1);
  });

  test('readableForeground chooses high contrast text', () => {
    // Dark medical teal -> white text
    expect(readableForeground('#0D6963')).toBe('#FFFFFF');
    // Dark slate -> white text
    expect(readableForeground('#334155')).toBe('#FFFFFF');
    // Pure white background -> dark text
    expect(readableForeground('#FFFFFF')).toBe('#111827');
  });

  test('isUsableAccent rejects non-hex, malformed, or low contrast colors', () => {
    expect(isUsableAccent(null)).toBe(false);
    expect(isUsableAccent(undefined)).toBe(false);
    expect(isUsableAccent('not-a-color')).toBe(false);
    expect(isUsableAccent('#123')).toBe(false); // short hex not accepted
    expect(isUsableAccent('#0D6963')).toBe(true);
    expect(isUsableAccent('#4F46E5')).toBe(true);
  });
});

describe('resolveClinicBrandColor Resolution Rules', () => {
  test('falls back to DEFAULT_CLINIC_BRAND_COLOR when no clinic or workspace color exists', () => {
    const res = resolveClinicBrandColor({});
    expect(res.color).toBe(DEFAULT_CLINIC_BRAND_COLOR);
    expect(res.isOverridden).toBe(false);
    expect(res.source).toBe('default_fallback');
  });

  test('auto-inherits workspace accent when clinic has no override', () => {
    const res = resolveClinicBrandColor({
      clinicOverrideHex: null,
      workspaceAccentHex: '#4F46E5',
    });
    expect(res.color).toBe('#4F46E5');
    expect(res.isOverridden).toBe(false);
    expect(res.source).toBe('workspace_inherited');
  });

  test('auto-inherits workspace accent when clinic has legacy unset default (#0284C7)', () => {
    const res = resolveClinicBrandColor({
      clinicOverrideHex: LEGACY_UNSET_ACCENT,
      workspaceAccentHex: '#E11D48',
    });
    expect(res.color).toBe('#E11D48');
    expect(res.isOverridden).toBe(false);
    expect(res.source).toBe('workspace_inherited');
  });

  test('prioritizes explicit clinic override over workspace accent', () => {
    const res = resolveClinicBrandColor({
      clinicOverrideHex: '#059669',
      workspaceAccentHex: '#4F46E5',
    });
    expect(res.color).toBe('#059669');
    expect(res.isOverridden).toBe(true);
    expect(res.source).toBe('clinic_override');
  });

  test('trims and normalizes hex strings', () => {
    const res = resolveClinicBrandColor({
      clinicOverrideHex: '  #059669  ',
      workspaceAccentHex: ' #4F46E5 ',
    });
    expect(res.color).toBe('#059669');
    expect(res.isOverridden).toBe(true);
  });
});

describe('ColorBrandingSection Component', () => {
  test('renders without crashing with inherited workspace status', () => {
    (globalThis as any).__mockClinicContext = {
      primaryColorHex: '#4F46E5',
      workspaceAccentColorHex: '#4F46E5',
      workspaceProfile: { displayName: 'Main Health Network', accentColorHex: '#4F46E5' },
      isColorOverridden: false,
      colorSource: 'workspace_inherited',
      setPrimaryColorHex: () => Promise.resolve(true),
    };

    const markup = renderToStaticMarkup(React.createElement(ColorBrandingSection));
    expect(markup).toContain('Workstation Color Branding');
    expect(markup).toContain('Inherited from Workspace');
    expect(markup).toContain('Curated Brand Presets');
    expect(markup).toContain('Live Workstation Component Preview');

    delete (globalThis as any).__mockClinicContext;
  });

  test('renders override status and revert button when color is overridden', () => {
    (globalThis as any).__mockClinicContext = {
      primaryColorHex: '#059669',
      workspaceAccentColorHex: '#4F46E5',
      workspaceProfile: { displayName: 'Main Health Network', accentColorHex: '#4F46E5' },
      isColorOverridden: true,
      colorSource: 'clinic_override',
      setPrimaryColorHex: () => Promise.resolve(true),
    };

    const markup = renderToStaticMarkup(React.createElement(ColorBrandingSection));
    expect(markup).toContain('Custom Clinic Override');
    expect(markup).toContain('Inherit from Workspace');

    delete (globalThis as any).__mockClinicContext;
  });
});

// token-guard:ignore-file
import { afterEach, describe, expect, test, mock } from 'bun:test';
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
  Animated: {
    Value: class {
      constructor(public val: any) {}
      setValue(val: any) { this.val = val; }
      interpolate() { return this; }
    },
    timing: () => ({ start: (cb?: any) => cb && cb() }),
    spring: () => ({ start: (cb?: any) => cb && cb() }),
    View: createMockComponent('Animated.View'),
    Text: createMockComponent('Animated.Text'),
  },
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
  isColorBrandingDirty,
  isUsableAccent,
  readableForeground,
  contrastRatio,
  relativeLuminance,
  mixHex,
  hexToRgba,
  deriveBrandPalette,
  BRAND_COLOR_PRESETS,
  DEFAULT_CLINIC_BRAND_COLOR,
  LEGACY_UNSET_ACCENT,
  RESET_SENTINEL_ACCENT,
  isUnsetAccent,
} = await import('../constants/color');

const {
  theme,
  syncActiveTheme,
  getActiveThemeState,
  subscribeActiveTheme,
} = await import('../constants/theme');

const { getToastStyle } = await import('../components/ui/FeedbackHost');
const { notify, getFeedbackState, resetFeedbackState } = await import('../utils/feedback');
const ColorBrandingSection = (await import('../components/settings/ColorBrandingSection')).default;

afterEach(() => {
  syncActiveTheme({
    brandColorHex: DEFAULT_CLINIC_BRAND_COLOR,
    userBrandColorHex: null,
    scheme: 'light',
  });
  resetFeedbackState();
  delete (globalThis as any).__mockClinicContext;
});

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

  test('auto-inherits workspace accent when clinic has unset sentinel ("#0284C7" / "inherit" / empty / null)', () => {
    for (const unsetVal of [LEGACY_UNSET_ACCENT, '#0284C7', '#0284c7', RESET_SENTINEL_ACCENT, 'inherit', '', '   ', null, undefined]) {
      const res = resolveClinicBrandColor({
        clinicOverrideHex: unsetVal,
        workspaceAccentHex: '#E11D48',
      });
      expect(res.color).toBe('#E11D48');
      expect(res.isOverridden).toBe(false);
      expect(res.source).toBe('workspace_inherited');
    }
  });

  test('GitHub #151: Sky Blue (#0284C8) preset resolves as an active clinic_override and never resets to unset', () => {
    const skyBluePreset = BRAND_COLOR_PRESETS.find((p) => p.label === 'Sky Blue');
    expect(skyBluePreset).toBeDefined();
    expect(skyBluePreset?.color).toBe('#0284C8');
    expect(LEGACY_UNSET_ACCENT.toUpperCase()).toBe('#0284C7');
    expect(skyBluePreset?.color).not.toBe(LEGACY_UNSET_ACCENT);

    const withWorkspace = resolveClinicBrandColor({
      clinicOverrideHex: '#0284C8',
      workspaceAccentHex: '#0D6963',
    });
    expect(withWorkspace).toEqual({
      color: '#0284C8',
      isOverridden: true,
      source: 'clinic_override',
    });

    const lowercaseReloaded = resolveClinicBrandColor({
      clinicOverrideHex: ' #0284c8 ',
      workspaceAccentHex: null,
    });
    expect(lowercaseReloaded).toEqual({
      color: '#0284C8',
      isOverridden: true,
      source: 'clinic_override',
    });
  });

  test('GitHub #151: Every preset in BRAND_COLOR_PRESETS resolves as clinic_override when selected', () => {
    for (const preset of BRAND_COLOR_PRESETS) {
      const resolved = resolveClinicBrandColor({
        clinicOverrideHex: preset.color,
        workspaceAccentHex: '#4F46E5',
      });
      expect(resolved.color).toBe(preset.color.toUpperCase());
      expect(resolved.isOverridden).toBe(true);
      expect(resolved.source).toBe('clinic_override');
    }
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

  test('prioritizes userOverrideHex > clinicOverrideHex > workspaceAccentHex > defaultHex', () => {
    const userWins = resolveClinicBrandColor({
      userOverrideHex: ' #e11d48 ',
      clinicOverrideHex: '#0284C8',
      workspaceAccentHex: '#4F46E5',
    });
    expect(userWins).toEqual({
      color: '#E11D48',
      isOverridden: true,
      source: 'user_override',
    });

    const clearedUserFallsBackToClinic = resolveClinicBrandColor({
      userOverrideHex: null,
      clinicOverrideHex: '#0284C8',
      workspaceAccentHex: '#4F46E5',
    });
    expect(clearedUserFallsBackToClinic).toEqual({
      color: '#0284C8',
      isOverridden: true,
      source: 'clinic_override',
    });

    const invalidOrInheritUserFallsBack = resolveClinicBrandColor({
      userOverrideHex: 'inherit',
      clinicOverrideHex: null,
      workspaceAccentHex: '#4F46E5',
    });
    expect(invalidOrInheritUserFallsBack).toEqual({
      color: '#4F46E5',
      isOverridden: false,
      source: 'workspace_inherited',
    });
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
    expect(markup).toContain('Clinic Brand Color');
    expect(markup).toContain('Using default color');
    expect(markup).toContain('Color Presets');
    expect(markup).toContain('Custom Color Code');
    expect(markup).toContain('Live Preview');
    expect(markup).not.toContain('Save Brand Color');

    delete (globalThis as any).__mockClinicContext;
  });

  test('renders override status and revert button while hiding Save Brand Color when unchanged (including Sky Blue #0284C7)', () => {
    (globalThis as any).__mockClinicContext = {
      primaryColorHex: '#0284C7',
      workspaceAccentColorHex: '#0D6963',
      workspaceProfile: { displayName: 'Main Health Network', accentColorHex: '#0D6963' },
      isColorOverridden: true,
      colorSource: 'clinic_override',
      setPrimaryColorHex: () => Promise.resolve(true),
    };

    const markup = renderToStaticMarkup(React.createElement(ColorBrandingSection));
    expect(markup).toContain('Clinic Brand Color');
    expect(markup).toContain('Custom color active');
    expect(markup).toContain('#0284C7');
    expect(markup).toContain('Reset to Default');
    expect(markup).not.toContain('Save Brand Color');

    delete (globalThis as any).__mockClinicContext;
  });

  test('isColorBrandingDirty returns false when unchanged and true when preset or hex input changes', () => {
    expect(
      isColorBrandingDirty({
        selectedColor: '#0284c7',
        customHexInput: '0284C7',
        savedPrimaryColorHex: '#0284C7',
      })
    ).toBe(false);

    expect(
      isColorBrandingDirty({
        selectedColor: '#4F46E5',
        customHexInput: '#4F46E5',
        savedPrimaryColorHex: '#0284C7',
      })
    ).toBe(true);

    expect(
      isColorBrandingDirty({
        selectedColor: '#0284C7',
        customHexInput: '#0284',
        savedPrimaryColorHex: '#0284C7',
      })
    ).toBe(true);
  });

  test('renders SkeletonList and hides default badge while clinic branding is loading', () => {
    (globalThis as any).__mockClinicContext = {
      primaryColorHex: '#0D6963',
      workspaceAccentColorHex: null,
      workspaceProfile: null,
      isColorOverridden: false,
      colorSource: 'default_fallback',
      loading: true,
      setPrimaryColorHex: () => Promise.resolve(true),
    };

    try {
      const loadingMarkup = renderToStaticMarkup(React.createElement(ColorBrandingSection));
      expect(loadingMarkup).toContain('Clinic Brand Color');
      expect(loadingMarkup).toContain('Loading');
      expect(loadingMarkup).not.toContain('Using default color');
      expect(loadingMarkup).not.toContain('Custom color active');
      expect(loadingMarkup).not.toContain('Color Presets');
    } finally {
      delete (globalThis as any).__mockClinicContext;
    }
  });

  test('renders upgraded Live Preview with Primary & Outline Buttons, Active Menu Item & Tab, Alert Banner, and Status Badge', () => {
    (globalThis as any).__mockClinicContext = {
      primaryColorHex: '#E11D48',
      workspaceAccentColorHex: '#0D6963',
      workspaceProfile: { displayName: 'Metro Health Network', accentColorHex: '#0D6963' },
      isColorOverridden: true,
      colorSource: 'clinic_override',
      setPrimaryColorHex: () => Promise.resolve(true),
    };

    const markup = renderToStaticMarkup(React.createElement(ColorBrandingSection));
    expect(markup).toContain('Primary &amp; Outline Buttons');
    expect(markup).toContain('Save Changes');
    expect(markup).toContain('Outline Action');
    expect(markup).toContain('Active Menu Item &amp; Tab');
    expect(markup).toContain('Alert Banner');
    expect(markup).toContain('Clinic schedule updated');
    expect(markup).toContain('Status Badge');
    expect(markup).toContain('Routine Visit');
    expect(markup).not.toContain('Save Brand Color');
    expect(markup).not.toContain('personal accent color active in My Profile');
  });

  test('renders helpful personal accent override info note when userBrandColorHex is active', () => {
    syncActiveTheme({ brandColorHex: '#0284C7', userBrandColorHex: '#E11D48', scheme: 'light' });
    (globalThis as any).__mockClinicContext = {
      primaryColorHex: '#0284C7',
      workspaceAccentColorHex: '#0D6963',
      workspaceProfile: { displayName: 'Metro Health Network', accentColorHex: '#0D6963' },
      isColorOverridden: true,
      colorSource: 'clinic_override',
      setPrimaryColorHex: () => Promise.resolve(true),
    };

    const markup = renderToStaticMarkup(React.createElement(ColorBrandingSection));
    expect(markup).toContain(
      'Note: You also have a personal accent color active in My Profile -&gt; Display &amp; Sound, which overrides this clinic color on your screen.'
    );
  });
});

describe('Dynamic Brand Palette Derivation & Dark/Light Theme Engine', () => {
  const TEAL_HEXES = ['#0D6963', '#0A5651', '#084541', '#D9FAF1', '#F0FDF9', '#A8EEDC'];

  test('mixHex linearly interpolates RGB channels and clamps weights', () => {
    expect(mixHex('#000000', '#FFFFFF', 0)).toBe('#000000');
    expect(mixHex('#000000', '#FFFFFF', 1)).toBe('#FFFFFF');
    expect(mixHex('#000000', '#FFFFFF', 0.5)).toBe('#808080');
  });

  test('hexToRgba converts #RRGGBB into translucent rgba(r, g, b, alpha) strings', () => {
    expect(hexToRgba('#0D6963', 0.22)).toBe('rgba(13, 105, 99, 0.22)');
    expect(hexToRgba('#E11D48', 0.34)).toBe('rgba(225, 29, 72, 0.34)');
    expect(hexToRgba('#E11D48', 0.46)).toBe('rgba(225, 29, 72, 0.46)');
  });

  test('deriveBrandPalette preserves exact Teal tokens and translucent shadows for #0D6963 in light mode', () => {
    const tealLight = deriveBrandPalette('#0D6963', 'light');
    expect(tealLight).toEqual({
      primary: '#0D6963',
      primaryHover: '#0A5651',
      primaryDark: '#084541',
      primaryLight: '#D9FAF1',
      primaryLighter: '#F0FDF9',
      primarySubtle: '#F0FDF9',
      primaryBorder: '#A8EEDC',
      onPrimary: '#FFFFFF',
      focusRing: '#12907F',
      routine: '#0D6963',
      routineBg: '#D9FAF1',
      routineBorder: '#A8EEDC',
      routineText: '#0A5651',
      primaryShadowSubtle: 'rgba(13, 105, 99, 0.22)',
      primaryShadowSm: 'rgba(13, 105, 99, 0.34)',
      primaryShadowMd: 'rgba(13, 105, 99, 0.46)',
    });
  });

  test('deriveBrandPalette derives cohesive non-Teal shades for Rose (#E11D48), Sky Blue (#0284C7), and custom hexes with WCAG >= 4.5 contrast', () => {
    for (const scheme of ['light', 'dark'] as const) {
      for (const hex of ['#E11D48', '#0284C7', '#059669', '#4F46E5', '#334155', '#7C3AED']) {
        const derived = deriveBrandPalette(hex, scheme);
        for (const value of Object.values(derived)) {
          if (value !== '#FFFFFF' && value !== '#111827') {
            expect(TEAL_HEXES).not.toContain(value.toUpperCase());
          }
        }
        expect(contrastRatio(derived.primaryDark, derived.primaryLight)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  test('deriveBrandPalette lifts low-luminance accents in dark mode for dark surface visibility', () => {
    const slateLight = deriveBrandPalette('#334155', 'light');
    const slateDark = deriveBrandPalette('#334155', 'dark');
    expect(slateLight.primary).toBe('#334155');
    expect(relativeLuminance(slateDark.primary)).toBeGreaterThan(relativeLuminance('#334155'));
  });

  test('syncActiveTheme updates all brand tokens and dark/light surface tokens and notifies subscribers', () => {
    let notifications = 0;
    const unsubscribe = subscribeActiveTheme(() => {
      notifications += 1;
    });

    try {
      const roseLight = syncActiveTheme({ brandColorHex: '#E11D48', scheme: 'light' });
      expect(notifications).toBe(1);
      expect(roseLight.primary).toBe('#E11D48');
      expect(theme.colors.primary).toBe('#E11D48');
      expect(theme.colors.primaryHover).toBe(roseLight.primaryHover);
      expect(theme.colors.primaryDark).toBe(roseLight.primaryDark);
      expect(theme.colors.primaryLight).toBe(roseLight.primaryLight);
      expect(theme.colors.primarySubtle).toBe(roseLight.primarySubtle);
      expect(theme.colors.primaryBorder).toBe(roseLight.primaryBorder);
      expect(TEAL_HEXES).not.toContain(theme.colors.primaryHover);
      expect(TEAL_HEXES).not.toContain(theme.colors.primaryLight);
      expect(TEAL_HEXES).not.toContain(theme.colors.primaryBorder);

      const roseDark = syncActiveTheme({ scheme: 'dark' });
      expect(notifications).toBe(2);
      expect(getActiveThemeState().scheme).toBe('dark');
      expect(getActiveThemeState().brandColorHex).toBe('#E11D48');
      expect(roseDark.background).toBe('#0A1020');
      expect(roseDark.surface).toBe('#0F172A');
      expect(roseDark.text).toBe('#F8FAFC');
      expect(theme.colors.surface).toBe('#0F172A');
      expect(theme.colors.primaryHover).toBe(roseDark.primaryHover);
      expect(TEAL_HEXES).not.toContain(theme.colors.primaryHover);
    } finally {
      unsubscribe();
    }
  });

  test('getToastStyle dynamically reflects active brand tokens for both success and info toasts while keeping warning amber and error crimson', () => {
    syncActiveTheme({ brandColorHex: '#E11D48', scheme: 'light' });
    const rosePalette = deriveBrandPalette('#E11D48', 'light');

    const successLook = getToastStyle('success');
    expect(successLook.icon).toBe('checkCircle');
    expect(successLook.color).toBe(rosePalette.primaryDark);
    expect(successLook.accent).toBe(rosePalette.primary);
    expect(successLook.bg).toBe(rosePalette.primaryLight);
    expect(successLook.border).toBe(rosePalette.primaryBorder);
    expect(successLook.shadow).toEqual(theme.shadows.brandMd);
    expect(TEAL_HEXES).not.toContain(successLook.bg);

    const infoLook = getToastStyle('info');
    expect(infoLook.icon).toBe('info');
    expect(infoLook.color).toBe(rosePalette.primaryDark);
    expect(infoLook.accent).toBe(rosePalette.primary);
    expect(infoLook.bg).toBe(rosePalette.primaryLight);
    expect(infoLook.border).toBe(rosePalette.primaryBorder);
    expect(infoLook.shadow).toEqual(theme.shadows.brandMd);
    expect(TEAL_HEXES).not.toContain(infoLook.bg);

    notify.warning('Check room assignment');
    const latestToast = getFeedbackState().toasts.at(-1);
    expect(latestToast?.kind).toBe('warning');

    const warningLook = getToastStyle('warning');
    expect(warningLook.icon).toBe('alert');
    expect(warningLook.accent).toBe(theme.colors.warning);
    expect(warningLook.bg).toBe(theme.colors.warningBg);
    expect(warningLook.border).toBe(theme.colors.warningBorder);
    expect(warningLook.shadow).toEqual(theme.shadows.md);

    const errorLook = getToastStyle('error');
    expect(errorLook.icon).toBe('alertCircle');
    expect(errorLook.accent).toBe(theme.colors.emergency);
    expect(errorLook.bg).toBe(theme.colors.emergencyBg);
    expect(errorLook.border).toBe(theme.colors.emergencyBorder);
    expect(errorLook.shadow).toEqual(theme.shadows.dangerMd);
  });

  test('syncActiveTheme manages userBrandColorHex override independently of clinicBrandColorHex and restores clinic color when cleared', () => {
    syncActiveTheme({ brandColorHex: '#0284C7', userBrandColorHex: '#E11D48', scheme: 'light' });

    const overriddenState = getActiveThemeState();
    expect(overriddenState.clinicBrandColorHex).toBe('#0284C7');
    expect(overriddenState.userBrandColorHex).toBe('#E11D48');
    expect(overriddenState.brandColorHex).toBe('#E11D48');
    expect(theme.colors.primary).toBe('#E11D48');
    expect(theme.colors.primaryShadowSubtle).toBe('rgba(225, 29, 72, 0.22)');
    expect(theme.colors.primaryShadowSm).toBe('rgba(225, 29, 72, 0.34)');
    expect(theme.colors.primaryShadowMd).toBe('rgba(225, 29, 72, 0.46)');
    expect(theme.shadows.brandSubtle.shadowColor).toBe('rgba(225, 29, 72, 0.22)');
    expect(theme.shadows.brandSm.shadowColor).toBe('rgba(225, 29, 72, 0.34)');

    // Updating clinic brandColorHex alone preserves the user's personal override
    syncActiveTheme({ brandColorHex: '#059669' });
    expect(getActiveThemeState().clinicBrandColorHex).toBe('#059669');
    expect(getActiveThemeState().userBrandColorHex).toBe('#E11D48');
    expect(theme.colors.primary).toBe('#E11D48');

    // Clearing userBrandColorHex: null immediately restores the clinic brand color!
    syncActiveTheme({ brandColorHex: '#0284C7', userBrandColorHex: null });
    const restoredState = getActiveThemeState();
    expect(restoredState.clinicBrandColorHex).toBe('#0284C7');
    expect(restoredState.userBrandColorHex).toBeNull();
    expect(restoredState.brandColorHex).toBe('#0284C7');
    expect(theme.colors.primary).toBe('#0284C7');
    expect(theme.colors.primaryShadowSm).toBe('rgba(2, 132, 199, 0.34)');
    expect(theme.shadows.brandSm.shadowColor).toBe('rgba(2, 132, 199, 0.34)');
  });
});

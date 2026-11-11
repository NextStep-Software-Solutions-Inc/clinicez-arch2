// token-guard:ignore-file
import { afterEach, describe, expect, test, mock } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const capturedStyleCallbacks: Array<(state: any) => any> = [];

const createMockComponent = (name: string) => {
  const Comp = ({
    children,
    accessibilityLabel,
    accessibilityRole,
    accessibilityState,
    testID,
    title,
    style,
    disabled,
    onPress,
  }: any) => {
    let resolvedStyle = style;
    if (typeof style === 'function') {
      capturedStyleCallbacks.push(style);
      resolvedStyle = style({ pressed: false, hovered: false });
    }
    return React.createElement(
      'div',
      {
        'data-component': name,
        ...(testID ? { 'data-testid': testID } : {}),
        ...(accessibilityLabel ? { 'aria-label': accessibilityLabel } : {}),
        ...(accessibilityRole ? { role: accessibilityRole } : {}),
        ...(accessibilityState?.selected !== undefined
          ? { 'aria-selected': String(accessibilityState.selected) }
          : {}),
        ...(accessibilityState?.busy !== undefined
          ? { 'aria-busy': String(accessibilityState.busy) }
          : {}),
        ...(disabled !== undefined ? { 'data-disabled': String(disabled) } : {}),
        ...(title ? { title } : {}),
        ...(resolvedStyle ? { 'data-has-style': 'true' } : {}),
        onClick: onPress,
      },
      children
    );
  };
  Comp.displayName = name;
  return Comp;
};

mock.module('react-native', () => ({
  StyleSheet: {
    create: (s: any) => s,
    flatten: (s: any) =>
      Array.isArray(s)
        ? Object.assign({}, ...s.flat(Infinity).filter(Boolean))
        : s || {},
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
  Dimensions: { get: () => ({ width: 1280, height: 800 }), addEventListener: () => ({ remove: () => {} }) },
  useWindowDimensions: () => ({ width: 1280, height: 800 }),
  Animated: {
    Value: class {
      constructor(public val: any) {}
      setValue(val: any) {
        this.val = val;
      }
      interpolate() {
        return this;
      }
    },
    timing: () => ({ start: (cb?: any) => cb && cb() }),
    parallel: () => ({ start: (cb?: any) => cb && cb() }),
    View: createMockComponent('Animated.View'),
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

const { DEFAULT_CLINIC_BRAND_COLOR } = await import('../constants/color');
const {
  theme,
  syncActiveTheme,
  createThemeShadows,
  buildPreviewShadowStyle,
} = await import('../constants/theme');
const ButtonModule = await import('../components/ui/Button');
const Button = ButtonModule.default;
const {
  resolveButtonShadow,
  getButtonVariantStyles,
  getButtonSizeStyles,
} = ButtonModule;
const SegmentedControl = (await import('../components/ui/SegmentedControl')).default;
const SettingsTabBarModule = await import('../components/settings/SettingsTabBar');
const SettingsTabBar = SettingsTabBarModule.default;
const { SettingsNavModeSwitcher } = SettingsTabBarModule;
const SettingsVerticalRail = (await import('../components/settings/SettingsVerticalRail')).default;

function flattenStyles(s: any): Record<string, any> {
  if (!s) return {};
  if (Array.isArray(s)) {
    return Object.assign({}, ...s.flat(Infinity).filter(Boolean));
  }
  return { ...s };
}

afterEach(() => {
  capturedStyleCallbacks.length = 0;
  syncActiveTheme({
    brandColorHex: DEFAULT_CLINIC_BRAND_COLOR,
    userBrandColorHex: null,
    scheme: 'light',
  });
});

describe('Atomic <Button /> Elevation Shadows & Hue-Matched Brand Shadows', () => {
  test('neutral sm/md/lg shadows use translucent rgba(...) shadow colors and never opaque hex', () => {
    expect(theme.shadows.sm.shadowColor).toBe('rgba(15, 23, 42, 0.09)');
    expect(theme.shadows.md.shadowColor).toBe('rgba(15, 23, 42, 0.14)');
    expect(theme.shadows.lg.shadowColor).toBe('rgba(15, 23, 42, 0.20)');
    expect(theme.shadows.none.shadowOpacity).toBe(0);
  });

  test('createThemeShadows(..., true) and buildPreviewShadowStyle(..., true) emit dual-layer pure CSS boxShadow on Web with zero Android elevation or RN shadow* keys', () => {
    syncActiveTheme({ brandColorHex: '#E11D48', scheme: 'light' });
    const webShadows = createThemeShadows(theme.colors, true);

    const expectedKeys = [
      'none',
      'sm',
      'md',
      'lg',
      'brandSubtle',
      'brandSm',
      'brandMd',
      'dangerSm',
      'dangerMd',
      'successSm',
      'successMd',
    ] as const;

    for (const key of expectedKeys) {
      const entry = webShadows[key] as unknown as Record<string, unknown>;
      expect(typeof entry.boxShadow).toBe('string');
      expect('elevation' in entry).toBe(false);
      expect('shadowColor' in entry).toBe(false);
      expect('shadowOffset' in entry).toBe(false);
      expect('shadowOpacity' in entry).toBe(false);
      expect('shadowRadius' in entry).toBe(false);
    }

    expect((webShadows.none as any).boxShadow).toBe('none');
    expect((webShadows.sm as any).boxShadow).toBe(
      '0 2px 6px 0 rgba(15, 23, 42, 0.09), 0 6px 16px -2px rgba(15, 23, 42, 0.09)'
    );
    expect((webShadows.brandSubtle as any).boxShadow).toBe(
      '0 2px 6px 0 rgba(225, 29, 72, 0.22), 0 6px 14px -1px rgba(225, 29, 72, 0.22)'
    );
    expect((webShadows.brandSm as any).boxShadow).toBe(
      '0 4px 10px 0 rgba(225, 29, 72, 0.34), 0 8px 20px -2px rgba(225, 29, 72, 0.22)'
    );
    expect((webShadows.brandMd as any).boxShadow).toBe(
      '0 6px 16px 0 rgba(225, 29, 72, 0.46), 0 12px 28px -3px rgba(225, 29, 72, 0.34)'
    );

    const webPreviewSm = buildPreviewShadowStyle('rgba(124, 58, 237, 0.34)', 'sm', true) as any;
    expect(webPreviewSm).toEqual({
      boxShadow: '0 4px 10px 0 rgba(124, 58, 237, 0.34), 0 8px 20px -2px rgba(124, 58, 237, 0.34)',
    });
    expect('elevation' in webPreviewSm).toBe(false);
  });

  test('resolveButtonShadow applies hue-matched shadows across all 10 variants and NEVER uses neutral dark-gray shadows.sm or shadows.md', () => {
    // Primary: hue-matched brandSm at rest, brandMd on hover
    expect(resolveButtonShadow('primary', {})).toEqual(theme.shadows.brandSm);
    expect(resolveButtonShadow('primary', { hovered: true })).toEqual(theme.shadows.brandMd);

    // Outline, Secondary, Subtle: hue-matched brandSubtle at rest, brandSm on hover
    for (const v of ['outline', 'secondary', 'subtle'] as const) {
      expect(resolveButtonShadow(v, {})).toEqual(theme.shadows.brandSubtle);
      expect(resolveButtonShadow(v, { hovered: true })).toEqual(theme.shadows.brandSm);
    }

    // Ghost: none at rest, brandSubtle on hover
    expect(resolveButtonShadow('ghost', {})).toEqual(theme.shadows.none);
    expect(resolveButtonShadow('ghost', { hovered: true })).toEqual(theme.shadows.brandSubtle);

    // Danger variants: crimson hue-matched shadows (none at rest for outline/ghost)
    expect(resolveButtonShadow('danger', {})).toEqual(theme.shadows.dangerSm);
    expect(resolveButtonShadow('danger', { hovered: true })).toEqual(theme.shadows.dangerMd);
    expect(resolveButtonShadow('dangerOutline', {})).toEqual(theme.shadows.none);
    expect(resolveButtonShadow('dangerOutline', { hovered: true })).toEqual(theme.shadows.dangerSm);
    expect(resolveButtonShadow('dangerGhost', {})).toEqual(theme.shadows.none);
    expect(resolveButtonShadow('dangerGhost', { hovered: true })).toEqual(theme.shadows.dangerSm);

    // Success variants: emerald hue-matched shadows (none at rest for outline)
    expect(resolveButtonShadow('success', {})).toEqual(theme.shadows.successSm);
    expect(resolveButtonShadow('success', { hovered: true })).toEqual(theme.shadows.successMd);
    expect(resolveButtonShadow('successOutline', {})).toEqual(theme.shadows.none);
    expect(resolveButtonShadow('successOutline', { hovered: true })).toEqual(theme.shadows.successSm);

    const allVariants = [
      'primary',
      'secondary',
      'outline',
      'subtle',
      'ghost',
      'danger',
      'dangerOutline',
      'dangerGhost',
      'success',
      'successOutline',
    ] as const;

    // Zero variants ever use neutral dark-slate shadows.sm or shadows.md at rest or hover!
    for (const variant of allVariants) {
      for (const hovered of [false, true]) {
        const resolved = resolveButtonShadow(variant, { hovered });
        expect(resolved).not.toEqual(theme.shadows.sm);
        expect(resolved).not.toEqual(theme.shadows.md);
      }
      // Pressed, disabled, and loading states collapse elevation to shadows.none
      expect(resolveButtonShadow(variant, { pressed: true, hovered: true })).toEqual(theme.shadows.none);
      expect(resolveButtonShadow(variant, { disabled: true, hovered: true })).toEqual(theme.shadows.none);
      expect(resolveButtonShadow(variant, { loading: true, hovered: true })).toEqual(theme.shadows.none);
    }
  });

  test('hue-matched button shadows dynamically track Clinic Brand Color, Personal User Accent Color, and Dark Mode', () => {
    // Default Teal (#0D6963)
    expect(resolveButtonShadow('primary', {}).shadowColor).toBe('rgba(13, 105, 99, 0.34)');
    expect(resolveButtonShadow('primary', { hovered: true }).shadowColor).toBe('rgba(13, 105, 99, 0.46)');
    expect(resolveButtonShadow('outline', {}).shadowColor).toBe('rgba(13, 105, 99, 0.22)');
    expect(resolveButtonShadow('secondary', { hovered: true }).shadowColor).toBe('rgba(13, 105, 99, 0.34)');

    // Clinic Brand Color: Rose (#E11D48)
    syncActiveTheme({ brandColorHex: '#E11D48', scheme: 'light' });
    expect(resolveButtonShadow('primary', {}).shadowColor).toBe('rgba(225, 29, 72, 0.34)');
    expect(resolveButtonShadow('primary', { hovered: true }).shadowColor).toBe('rgba(225, 29, 72, 0.46)');
    expect(resolveButtonShadow('outline', {}).shadowColor).toBe('rgba(225, 29, 72, 0.22)');
    expect(resolveButtonShadow('subtle', { hovered: true }).shadowColor).toBe('rgba(225, 29, 72, 0.34)');

    // Personal User Accent Override (#4F46E5 Indigo) over Clinic Sky Blue (#0284C7)
    syncActiveTheme({ brandColorHex: '#0284C7', userBrandColorHex: '#4F46E5', scheme: 'light' });
    expect(resolveButtonShadow('primary', {}).shadowColor).toBe('rgba(79, 70, 229, 0.34)');
    expect(resolveButtonShadow('outline', {}).shadowColor).toBe('rgba(79, 70, 229, 0.22)');

    // Clearing Personal User Accent Override restores Clinic Sky Blue (#0284C7)
    syncActiveTheme({ userBrandColorHex: null });
    expect(resolveButtonShadow('primary', {}).shadowColor).toBe('rgba(2, 132, 199, 0.34)');
    expect(resolveButtonShadow('outline', {}).shadowColor).toBe('rgba(2, 132, 199, 0.22)');

    // Dark Mode translucent brand & neutral shadows (lifted dark-mode Rose #E85374 -> rgb(232, 83, 116))
    syncActiveTheme({ brandColorHex: '#E11D48', scheme: 'dark' });
    expect(resolveButtonShadow('primary', {}).shadowColor).toBe('rgba(232, 83, 116, 0.40)');
    expect(resolveButtonShadow('primary', { hovered: true }).shadowColor).toBe('rgba(232, 83, 116, 0.52)');
    expect(theme.shadows.sm.shadowColor).toBe('rgba(2, 6, 23, 0.44)');
  });
});

describe('Atomic <Button /> Variants, Sizes, & Interaction Props', () => {
  test('surface/outline variants use theme.colors.surface so outer drop shadows never bleed inward', () => {
    for (const v of ['secondary', 'outline', 'dangerOutline', 'successOutline'] as const) {
      const styles = getButtonVariantStyles(v);
      expect(styles.container.backgroundColor).toBe(theme.colors.surface);
    }
    expect(getButtonVariantStyles('ghost').container.backgroundColor).toBe(theme.colors.transparent);
    expect(getButtonVariantStyles('dangerGhost').container.backgroundColor).toBe(theme.colors.transparent);
  });

  test('getButtonSizeStyles supports xs, sm, md, lg and UI density scaling', () => {
    const xs = getButtonSizeStyles('xs', 1);
    const sm = getButtonSizeStyles('sm', 1);
    const md = getButtonSizeStyles('md', 1);
    const lg = getButtonSizeStyles('lg', 1);

    expect(xs.container.minHeight).toBe(28);
    expect(sm.container.minHeight).toBe(theme.sizes.controlSm);
    expect(md.container.minHeight).toBe(theme.sizes.controlMd);
    expect(lg.container.minHeight).toBe(theme.sizes.controlLg);
    expect(xs.iconSize).toBe(14);

    const compactMd = getButtonSizeStyles('md', 0.85);
    expect(compactMd.container.minHeight).toBeLessThan(md.container.minHeight);
  });

  test('renders iconOnly square dimensions, automatic web tooltip, style arrays, and strips duplicate + with icon="plus"', () => {
    capturedStyleCallbacks.length = 0;
    const iconOnlyHtml = renderToStaticMarkup(
      React.createElement(Button, {
        variant: 'ghost',
        size: 'xs',
        icon: 'close',
        iconOnly: true,
        accessibilityLabel: 'Close notification',
      })
    );
    expect(iconOnlyHtml).toContain('aria-label="Close notification"');
    expect(iconOnlyHtml).toContain('title="Close notification"');
    expect(capturedStyleCallbacks.length).toBeGreaterThan(0);

    const styleFn = capturedStyleCallbacks[0];
    const restFlat = flattenStyles(styleFn({ pressed: false, hovered: false }));
    expect(restFlat.width).toBe(28);
    expect(restFlat.paddingHorizontal).toBe(0);
    expect(restFlat.shadowOpacity).toBe(0);

    const hoverFlat = flattenStyles(styleFn({ pressed: false, hovered: true }));
    expect(hoverFlat.shadowColor).toBe(theme.shadows.brandSubtle.shadowColor);

    const plusHtml = renderToStaticMarkup(
      React.createElement(Button, {
        title: '+ Add Staff Member',
        icon: 'plus',
        rightIcon: 'chevronRight',
        tooltip: 'Provision a new staff seat',
        style: [{ marginTop: 4 }, { marginBottom: 4 }],
        textStyle: [{ letterSpacing: 0.2 }],
        testID: 'add-staff-btn',
      })
    );
    expect(plusHtml).toContain('Add Staff Member');
    expect(plusHtml).not.toContain('+ Add Staff Member');
    expect(plusHtml).toContain('title="Provision a new staff seat"');
    expect(plusHtml).toContain('data-testid="add-staff-btn"');
  });
});

describe('Active Tab Hue-Matched Brand Shadows (SegmentedControl & Settings Navigation)', () => {
  test('SegmentedControl, SettingsTabBar, SettingsNavModeSwitcher, and SettingsVerticalRail apply hue-matched brandSubtle shadows to active tabs', () => {
    syncActiveTheme({ brandColorHex: '#E11D48', scheme: 'light' });

    capturedStyleCallbacks.length = 0;
    renderToStaticMarkup(
      React.createElement(SegmentedControl, {
        value: 'active-tab',
        onChange: () => {},
        options: [
          { value: 'active-tab', label: 'Active Tab' },
          { value: 'other-tab', label: 'Other Tab' },
        ],
      })
    );
    const activeSegmentStyles = flattenStyles(capturedStyleCallbacks[0]({ pressed: false, hovered: false }));
    const inactiveSegmentStyles = flattenStyles(capturedStyleCallbacks[1]({ pressed: false, hovered: false }));
    expect(activeSegmentStyles.shadowRadius).toBe(theme.shadows.brandSubtle.shadowRadius);
    expect(inactiveSegmentStyles.shadowRadius).toBeUndefined();
    expect(theme.shadows.brandSubtle.shadowColor).toBe('rgba(225, 29, 72, 0.22)');

    // SettingsNavModeSwitcher + SettingsTabBar + SettingsVerticalRail render cleanly with active tab shadows
    const tabs = [
      { key: 'general' as const, label: 'General', icon: 'clinic' as const, groupKey: 'clinic' as const },
      { key: 'staff' as const, label: 'Staff & Schedules', icon: 'staff' as const, groupKey: 'team' as const },
    ];

    const switcherHtml = renderToStaticMarkup(
      React.createElement(SettingsNavModeSwitcher, {
        navMode: 'horizontal',
        onChangeNavMode: () => {},
      })
    );
    expect(switcherHtml).toContain('aria-label="Top tab bar"');

    const tabBarHtml = renderToStaticMarkup(
      React.createElement(SettingsTabBar, {
        tabs,
        activeTab: 'general',
        onSelectTab: () => {},
      })
    );
    expect(tabBarHtml).toContain('General');

    const railHtml = renderToStaticMarkup(
      React.createElement(SettingsVerticalRail, {
        tabs,
        activeTab: 'staff',
        onSelectTab: () => {},
        filterQuery: '',
        onChangeFilterQuery: () => {},
        navMode: 'vertical',
        onChangeNavMode: () => {},
      })
    );
    expect(railHtml).toContain('Staff &amp; Schedules');
  });
});

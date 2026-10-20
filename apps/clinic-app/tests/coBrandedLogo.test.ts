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
        ...(source?.uri ? { 'data-src': source.uri } : {}),
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
  Image: createMockComponent('Image'),
  AppState: { currentState: 'active', addEventListener: () => ({ remove: () => {} }) },
  Platform: { OS: 'web', select: (obj: any) => obj.web ?? obj.default },
}));

mock.module('react-native-svg', () => ({
  default: 'Svg',
  Svg: 'Svg',
  Path: 'Path',
  Rect: 'Rect',
  Defs: ({ children }: any) => children,
  LinearGradient: ({ children }: any) => children,
  Stop: () => null,
  G: ({ children }: any) => children,
  Text: ({ children }: any) => children,
  Polyline: 'Polyline',
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

const { default: CoBrandedLogo, getClinicInitials } = await import('../components/ui/CoBrandedLogo');
const { BrandMark, AuthScreen } = await import('../components/auth/AuthScreen');
const { setDeviceItem } = await import('../utils/deviceStorage');
const { CLINIC_LOGO_STORAGE_KEY } = await import('../context/ClinicContext');

describe('CoBrandedLogo & Clinic Initials Monogram Generator', () => {
  test('getClinicInitials extracts uppercase initials from multi-word facility names', () => {
    expect(getClinicInitials('Nextstep OPD')).toBe('NO');
    expect(getClinicInitials('Metro Health Care')).toBe('MC');
    expect(getClinicInitials('St. Jude General Hospital')).toBe('SH');
    expect(getClinicInitials('Apex Clinic')).toBe('AC');
  });

  test('getClinicInitials extracts 2 leading letters for single-word names and falls back to CL for empty', () => {
    expect(getClinicInitials('Nextstep')).toBe('NE');
    expect(getClinicInitials('Hospital')).toBe('HO');
    expect(getClinicInitials('   ')).toBe('CL');
    expect(getClinicInitials('')).toBe('CL');
  });

  test('renders ONLY Clinic EZ brand mark when neither clinicLogo nor clinicName is present', () => {
    const html = renderToStaticMarkup(React.createElement(CoBrandedLogo, {}));
    expect(html).toContain('Svg');
    expect(html).not.toContain('×');
    expect(html).not.toContain('Image');
  });

  test('renders co-branded Clinic EZ logo × Clinic Logo image when clinicLogo is provided', () => {
    const html = renderToStaticMarkup(
      React.createElement(CoBrandedLogo, {
        clinicLogo: 'https://example.com/clinic-logo.png',
        clinicName: 'Nextstep OPD',
      })
    );

    // Should contain Clinic EZ Mark (Svg)
    expect(html).toContain('Svg');
    // Should contain the co-branding multiplier symbol
    expect(html).toContain('×');
    // Should contain the clinic logo Image
    expect(html).toContain('Image');
    expect(html).toContain('https://example.com/clinic-logo.png');
    expect(html).toContain('Nextstep OPD partnered with Clinic EZ');
  });

  test('renders co-branded Clinic EZ logo × Monogram badge when clinicName is provided without custom image', () => {
    const html = renderToStaticMarkup(
      React.createElement(CoBrandedLogo, {
        clinicName: 'Nextstep OPD',
        primaryColor: '#0D6963',
      })
    );

    // Should contain Clinic EZ Mark
    expect(html).toContain('Svg');
    // Should contain the co-branding multiplier symbol
    expect(html).toContain('×');
    // Should contain the generated monogram "NO"
    expect(html).toContain('NO');
    // Should NOT contain an Image since no logo URL is provided
    expect(html).not.toContain('Image');
  });
});

describe('BrandMark & AuthScreen Co-Branding Integration', () => {
  test('BrandMark renders co-branded mark with explicit props', () => {
    const html = renderToStaticMarkup(
      React.createElement(BrandMark, {
        clinicName: 'Nextstep OPD',
        clinicLogo: 'data:image/png;base64,sampleLogoData',
      })
    );

    expect(html).toContain('Svg');
    expect(html).toContain('×');
    expect(html).toContain('Image');
    expect(html).toContain('sampleLogoData');
  });

  test('AuthScreen renders co-branded header on login card', () => {
    const html = renderToStaticMarkup(
      React.createElement(
        AuthScreen,
        {
          title: 'Sign in',
          subtitle: 'Welcome to Nextstep OPD.',
          clinicName: 'Nextstep OPD',
          clinicLogo: 'https://example.com/nextstep-logo.svg',
        },
        React.createElement('div', null, 'Form Body')
      )
    );

    expect(html).toContain('Sign in');
    expect(html).toContain('Welcome to Nextstep OPD.');
    expect(html).toContain('Svg');
    expect(html).toContain('×');
    expect(html).toContain('https://example.com/nextstep-logo.svg');
    expect(html).toContain('Form Body');
  });

  test('BrandMark falls back to cached device storage logo when license has not loaded', () => {
    setDeviceItem(CLINIC_LOGO_STORAGE_KEY, 'https://example.com/cached-clinic-logo.png');

    const html = renderToStaticMarkup(
      React.createElement(BrandMark, {
        clinicName: 'Nextstep OPD',
      })
    );

    expect(html).toContain('Svg');
    expect(html).toContain('×');
    expect(html).toContain('https://example.com/cached-clinic-logo.png');

    // Clean up
    setDeviceItem(CLINIC_LOGO_STORAGE_KEY, null);
  });
});

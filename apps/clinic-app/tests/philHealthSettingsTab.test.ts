// token-guard:ignore-file
import { describe, expect, test, mock } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

(globalThis as any).__DEV__ = true;
(globalThis as any).expo = {
  EventEmitter: class {
    addListener() { return { remove: () => {} }; }
    removeAllListeners() {}
    emit() {}
  },
};

mock.module('expo-document-picker', () => ({
  getDocumentAsync: () => Promise.resolve({ canceled: true, assets: null }),
}));

// Mock React Native modules for Bun environment
const createMockComponent = (name: string) => {
  const Comp = ({ children, accessibilityLabel, accessibilityRole, placeholder, onPress, testID, value, ...props }: any) =>
    React.createElement(
      'div',
      {
        'data-component': name,
        ...(testID ? { 'data-testid': testID } : {}),
        ...(accessibilityLabel ? { 'aria-label': accessibilityLabel } : {}),
        ...(accessibilityRole ? { role: accessibilityRole } : {}),
        ...(placeholder ? { 'data-placeholder': placeholder } : {}),
        ...(value !== undefined ? { 'data-value': value } : {}),
      },
      placeholder,
      children
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
  Dimensions: {
    get: () => ({ width: 1280, height: 800 }),
    addEventListener: () => ({ remove: () => {} }),
  },
  useWindowDimensions: () => ({ width: 1280, height: 800 }),
  Keyboard: { dismiss: () => {}, addListener: () => ({ remove: () => {} }) },
  AppState: { addEventListener: () => ({ remove: () => {} }) },
  Platform: { OS: 'web', select: (obj: any) => obj.web ?? obj.default },
  Linking: { openURL: () => Promise.resolve(), canOpenURL: () => Promise.resolve(true) },
  Touchable: { Mixin: {} },
  TurboModuleRegistry: { get: () => null, getEnforcing: () => null },
  NativeModules: {},
  NativeEventEmitter: class {
    addListener() { return { remove: () => {} }; }
    removeAllListeners() {}
  },
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
  Svg: 'Svg',
  Path: 'Path',
  Circle: 'Circle',
  Rect: 'Rect',
  Line: 'Line',
  default: 'Svg',
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

const { default: PhilHealthSettingsTab } = await import('../components/settings/PhilHealthSettingsTab');

describe('PhilHealthSettingsTab — Milestone 2 Branch Inheritance & Credentials Gating', () => {
  test('1. Renders Accredited HCI and Active ONLY when isPhilHealthConfigured is true', () => {
    const markup = renderToStaticMarkup(
      React.createElement(PhilHealthSettingsTab, {
        accreditationNumber: 'P123456789',
        clinicName: 'St. Jude Health Hub',
        settings: {
          id: 's-1',
          tenantId: 't-1',
          clinicId: 'c-1',
          clinicName: 'St. Jude Health Hub',
          accreditationNumber: 'P123456789',
          operatingHours: '8:00 AM - 5:00 PM',
          defaultSlotDurationMinutes: 15,
          queuePrefix: 'Q',
          invoicePrefix: 'INV',
          defaultConsultationFee: 500,
          vatRate: 0.12,
          isPhilHealthConfigured: true,
          isPhilHealthOverridden: false,
        } as any,
      })
    );

    expect(markup).toContain('Accredited HCI');
    expect(markup).toContain('Active');
    expect(markup).not.toContain('Credentials Pending');
    expect(markup).not.toContain('Accreditation Required');
  });

  test('2. Renders Credentials Pending when accreditationNumber is present but isPhilHealthConfigured is false', () => {
    const markup = renderToStaticMarkup(
      React.createElement(PhilHealthSettingsTab, {
        accreditationNumber: 'P123456789',
        clinicName: 'St. Jude Health Hub',
        settings: {
          id: 's-1',
          tenantId: 't-1',
          clinicId: 'c-1',
          clinicName: 'St. Jude Health Hub',
          accreditationNumber: 'P123456789',
          operatingHours: '8:00 AM - 5:00 PM',
          defaultSlotDurationMinutes: 15,
          queuePrefix: 'Q',
          invoicePrefix: 'INV',
          defaultConsultationFee: 500,
          vatRate: 0.12,
          isPhilHealthConfigured: false,
          isPhilHealthOverridden: false,
        } as any,
      })
    );

    expect(markup).toContain('Credentials Pending');
    expect(markup).not.toContain('Accredited HCI');
  });

  test('3. Renders Accreditation Required when accreditationNumber is empty and not configured', () => {
    const markup = renderToStaticMarkup(
      React.createElement(PhilHealthSettingsTab, {
        accreditationNumber: '',
        clinicName: 'St. Jude Health Hub',
        settings: {
          id: 's-1',
          tenantId: 't-1',
          clinicId: 'c-1',
          clinicName: 'St. Jude Health Hub',
          accreditationNumber: '',
          operatingHours: '8:00 AM - 5:00 PM',
          defaultSlotDurationMinutes: 15,
          queuePrefix: 'Q',
          invoicePrefix: 'INV',
          defaultConsultationFee: 500,
          vatRate: 0.12,
          isPhilHealthConfigured: false,
        } as any,
      })
    );

    expect(markup).toContain('Accreditation Required');
    expect(markup).toContain('Pending Accreditation');
  });

  test('4. Renders Inherited from Branch badge and branch baseline details when linked and not overridden', () => {
    const markup = renderToStaticMarkup(
      React.createElement(PhilHealthSettingsTab, {
        accreditationNumber: 'PH-BRANCH-001',
        clinicName: 'Branch Outpost',
        settings: {
          id: 's-1',
          tenantId: 't-1',
          clinicId: 'c-1',
          clinicName: 'Branch Outpost',
          accreditationNumber: 'PH-BRANCH-001',
          operatingHours: '8:00 AM - 5:00 PM',
          defaultSlotDurationMinutes: 15,
          queuePrefix: 'Q',
          invoicePrefix: 'INV',
          defaultConsultationFee: 500,
          vatRate: 0.12,
          isPhilHealthConfigured: true,
          isPhilHealthOverridden: false,
          branchId: 'branch-123',
          branchName: 'Metro Central HQ',
          branchPhilHealthAccreditationNumber: 'PH-BRANCH-001',
          branchPmccNumber: 'PMCC-999',
          branchSoftwareCertificateId: 'CERT-888',
          isBranchPhilHealthAccredited: true,
        } as any,
      })
    );

    expect(markup).toContain('Inherited from Branch');
    expect(markup).toContain('Metro Central HQ');
    expect(markup).toContain('Head Office / Branch Baseline');
    expect(markup).toContain('Active (Facility automatically inherits branch baseline)');
    expect(markup).not.toContain('Clinic Override');
    expect(markup).not.toContain('Revert to Branch Baseline');
  });

  test('5. Renders Clinic Override badge and Revert button when clinic has overridden credentials', () => {
    const markup = renderToStaticMarkup(
      React.createElement(PhilHealthSettingsTab, {
        accreditationNumber: 'CLINIC-OVERRIDE-ACC',
        clinicName: 'Branch Outpost',
        settings: {
          id: 's-1',
          tenantId: 't-1',
          clinicId: 'c-1',
          clinicName: 'Branch Outpost',
          accreditationNumber: 'CLINIC-OVERRIDE-ACC',
          operatingHours: '8:00 AM - 5:00 PM',
          defaultSlotDurationMinutes: 15,
          queuePrefix: 'Q',
          invoicePrefix: 'INV',
          defaultConsultationFee: 500,
          vatRate: 0.12,
          isPhilHealthConfigured: true,
          isPhilHealthOverridden: true,
          branchId: 'branch-123',
          branchName: 'Metro Central HQ',
          branchPhilHealthAccreditationNumber: 'PH-BRANCH-001',
          branchPmccNumber: 'PMCC-999',
          branchSoftwareCertificateId: 'CERT-888',
          isBranchPhilHealthAccredited: true,
        } as any,
      })
    );

    expect(markup).toContain('Clinic Override');
    expect(markup).toContain('Revert to Branch Baseline');
    expect(markup).toContain('Bypassed (Facility uses explicit override credentials)');
    expect(markup).not.toContain('Inherited from Branch');
  });
});

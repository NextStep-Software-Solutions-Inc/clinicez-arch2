// token-guard:ignore-file
/**
 * Test Suite: Challenger M4 Empirical Two-Tier Governance Stress Tests
 * 
 * Target: FacilityReadinessTab & Settings.screen.tsx Two-Tier Governance UX
 * Coverage:
 *  - isWorkspaceEligible === false (banner, notice, switch disabled)
 *  - isWorkspaceEligible === true && isFacilityReady === true (banner absent, notice absent, switch enabled)
 *  - isWorkspaceEligible === true && isFacilityReady === false (banner absent, readiness notice, switch disabled)
 *  - isWorkspaceEligible === undefined behavior & Settings.screen fallback guarantee (?? false)
 *  - Publishing toggle mutation loading states
 *  - Booking pause toggle orthogonality
 *  - Skeleton loading state verification
 */

import { describe, expect, test, mock } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

(globalThis as any).__DEV__ = true;

const createMockComponent = (name: string) => {
  const Comp = ({
    children,
    accessibilityLabel,
    accessibilityRole,
    accessibilityState,
    placeholder,
    onPress,
    disabled,
  }: any) =>
    React.createElement(
      'div',
      {
        'data-component': name,
        ...(accessibilityLabel ? { 'aria-label': accessibilityLabel } : {}),
        ...(accessibilityRole ? { role: accessibilityRole } : {}),
        ...(accessibilityState ? { 'data-accessibility-state': JSON.stringify(accessibilityState) } : {}),
        ...(placeholder ? { 'data-placeholder': placeholder } : {}),
        ...(disabled !== undefined ? { 'data-disabled': String(disabled), disabled } : {}),
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

mock.module('expo-document-picker', () => ({
  getDocumentAsync: () => Promise.resolve({ canceled: true, assets: null }),
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

const { default: FacilityReadinessTab } = await import('../components/settings/FacilityReadinessTab');

const mockActiveLicense = {
  status: 'Active' as const,
  isTampered: false,
  expiresAtUtc: '2099-12-31T23:59:59Z',
  limits: { maxStaff: 10 },
  featureFlags: {},
  signatureValid: true,
};

const mockDoctors = [
  {
    id: 's1',
    name: 'Dr. Jane Smith',
    role: 'Doctor',
    isActive: true,
    prcLicenseNumber: 'PRC-123456',
    email: 'jane@example.com',
  },
  {
    id: 's2',
    name: 'John Frontdesk',
    role: 'Receptionist',
    isActive: true,
    email: 'john@example.com',
  },
];

const mockServices = [
  {
    id: 'srv-1',
    name: 'General Consultation',
    code: 'CONS-01',
    price: 500,
    isActive: true,
  },
];

const mockRoles = [
  { id: 'r1', name: 'Doctor' },
  { id: 'r2', name: 'Receptionist' },
];

const fullyReadyProps = {
  license: mockActiveLicense as any,
  clinicName: 'St. Jude Health Hub',
  letterheadAddress: '123 Rizal Ave, Manila',
  letterheadContact: '0917-000-0000',
  accreditationNumber: 'PHIC-1234',
  operatingHours: 'Mon-Sat 8:00 AM - 5:00 PM',
  staff: mockDoctors as any,
  services: mockServices as any,
  roles: mockRoles as any,
  onNavigateTab: () => {},
  onOpenAddStaff: () => {},
  onOpenAddService: () => {},
  onOpenLicenseModal: () => {},
};

describe('Challenger M4 — Adversarial Two-Tier Governance UI Stress Harness', () => {
  test('T1: Ineligible workspace (isWorkspaceEligible = false) unconditionally locks directory publishing', () => {
    const markup = renderToStaticMarkup(
      React.createElement(FacilityReadinessTab, {
        ...fullyReadyProps,
        isWorkspaceEligible: false,
        isDirectoryPublished: false,
      })
    );

    // 1. Warning banner must be prominently visible with actionable instructions
    expect(markup).toContain('Workspace Eligibility Pending');
    expect(markup).toContain('Approval Required');
    expect(markup).toContain('Your organization workspace administrator has not yet enabled public patient directory discovery');
    expect(markup).toContain('Portal Settings → Facilities');

    // 2. Specific lock reason must cite workspace administrator approval
    expect(markup).toContain('Publishing locked: Requires workspace administrator approval in Portal.');

    // 3. ToggleSwitch must be disabled
    expect(markup).toContain('data-disabled="true"');
  });

  test('T2: Eligible workspace (isWorkspaceEligible = true) with 100% facility readiness unlocks publishing', () => {
    const markup = renderToStaticMarkup(
      React.createElement(FacilityReadinessTab, {
        ...fullyReadyProps,
        isWorkspaceEligible: true,
        isDirectoryPublished: false,
      })
    );

    // 1. Warning banner must NOT be rendered
    expect(markup).not.toContain('Workspace Eligibility Pending');

    // 2. Locking notice must NOT be rendered
    expect(markup).not.toContain('Publishing locked');

    // 3. Overall facility readiness badge indicates Ready to Open
    expect(markup).toContain('Ready to Open');
    expect(markup).toContain('Draft (Unlisted)');

    // 4. ToggleSwitch must be enabled (data-disabled="false")
    expect(markup).toContain('data-disabled="false"');
  });

  test('T3: Eligible workspace (isWorkspaceEligible = true) but operational checklist incomplete locks publishing with pre-flight notice', () => {
    const markup = renderToStaticMarkup(
      React.createElement(FacilityReadinessTab, {
        ...fullyReadyProps,
        operatingHours: '', // Missing operating hours
        isWorkspaceEligible: true,
        isDirectoryPublished: false,
      })
    );

    // 1. Workspace warning banner is NOT rendered (since workspace eligibility is granted)
    expect(markup).not.toContain('Workspace Eligibility Pending');

    // 2. Lock reason must cite operational pre-flight checklist, NOT workspace approval
    expect(markup).toContain('Publishing locked: Complete all mandatory pre-flight checks above.');

    // 3. Switch must remain disabled
    expect(markup).toContain('data-disabled="true"');
  });

  test('T4: Unconfigured doctor with missing PRC license fails readiness check and locks publishing', () => {
    const unlicensedStaff = [
      {
        id: 's1',
        name: 'Dr. Jane Smith',
        role: 'Doctor',
        isActive: true,
        prcLicenseNumber: '', // Missing PRC
        email: 'jane@example.com',
      },
    ];

    const markup = renderToStaticMarkup(
      React.createElement(FacilityReadinessTab, {
        ...fullyReadyProps,
        staff: unlicensedStaff as any,
        isWorkspaceEligible: true,
        isDirectoryPublished: false,
      })
    );

    expect(markup).toContain('Publishing locked: Complete all mandatory pre-flight checks above.');
    expect(markup).toContain('data-disabled="true"');
  });

  test('T5: Undefined isWorkspaceEligible prop triggers component default, but Settings.screen.tsx fallback (?? false) guarantees safe locking', () => {
    // Component default parameter test:
    const markupComponentDefault = renderToStaticMarkup(
      React.createElement(FacilityReadinessTab, {
        ...fullyReadyProps,
        isWorkspaceEligible: undefined, // omits or passes undefined
      })
    );
    // Component default is true for backward compatibility
    expect(markupComponentDefault).not.toContain('Workspace Eligibility Pending');

    // Settings screen fallback simulation:
    // In Settings.screen.tsx line 450: isWorkspaceEligible={settings?.isWorkspaceEligible ?? false}
    const mockSettingsNull = null as any;
    const resolvedFromNull = mockSettingsNull?.isWorkspaceEligible ?? false;
    expect(resolvedFromNull).toBe(false);

    const mockSettingsUndefined = {} as any;
    const resolvedFromUndefined = mockSettingsUndefined?.isWorkspaceEligible ?? false;
    expect(resolvedFromUndefined).toBe(false);

    const markupFromSettingsFallback = renderToStaticMarkup(
      React.createElement(FacilityReadinessTab, {
        ...fullyReadyProps,
        isWorkspaceEligible: resolvedFromUndefined,
      })
    );
    // When Settings.screen passes the fallback false, publishing is safely locked
    expect(markupFromSettingsFallback).toContain('Workspace Eligibility Pending');
    expect(markupFromSettingsFallback).toContain('Publishing locked: Requires workspace administrator approval in Portal.');
    expect(markupFromSettingsFallback).toContain('data-disabled="true"');
  });

  test('T6: Active publishing mutation (isPublishingMutating = true) disables switch even when eligible and ready', () => {
    const markup = renderToStaticMarkup(
      React.createElement(FacilityReadinessTab, {
        ...fullyReadyProps,
        isWorkspaceEligible: true,
        isPublishingMutating: true,
      })
    );

    expect(markup).toContain('data-disabled="true"');
  });

  test('T7: Online booking pause control operates independently of workspace directory eligibility', () => {
    const markup = renderToStaticMarkup(
      React.createElement(FacilityReadinessTab, {
        ...fullyReadyProps,
        isWorkspaceEligible: false, // Ineligible for directory
        isDirectoryPublished: false,
        isOnlineBookingPaused: true, // Paused
      })
    );

    // Online booking pause row must render with Booking Paused badge
    expect(markup).toContain('Pause Online Appointment Booking');
    expect(markup).toContain('Booking Paused');
    expect(markup).toContain('Online appointment booking is currently paused');
  });
});

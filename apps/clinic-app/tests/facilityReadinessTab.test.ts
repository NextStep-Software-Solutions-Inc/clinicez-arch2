// token-guard:ignore-file
import { describe, expect, test, mock } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

(globalThis as any).__DEV__ = true;

// Mock React Native modules for Bun environment
const createMockComponent = (name: string) => {
  const Comp = ({ children, accessibilityLabel, accessibilityRole, placeholder, onPress }: any) =>
    React.createElement(
      'div',
      {
        'data-component': name,
        ...(accessibilityLabel ? { 'aria-label': accessibilityLabel } : {}),
        ...(accessibilityRole ? { role: accessibilityRole } : {}),
        ...(placeholder ? { 'data-placeholder': placeholder } : {}),
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

const mockStaff = [
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

describe('FacilityReadinessTab — Milestone 2 Directory Readiness & Governance', () => {
  test('1. Blocks readiness when Operating Hours are not configured', () => {
    const markup = renderToStaticMarkup(
      React.createElement(FacilityReadinessTab, {
        license: mockActiveLicense as any,
        clinicName: 'St. Jude Health Hub',
        letterheadAddress: '123 Rizal Ave, Manila',
        letterheadContact: '0917-000-0000',
        accreditationNumber: 'PHIC-1234',
        operatingHours: '',
        staff: mockStaff as any,
        services: mockServices as any,
        roles: mockRoles as any,
        isDirectoryPublished: false,
        isOnlineBookingPaused: false,
        isWorkspaceEligible: true,
        onNavigateTab: () => {},
        onOpenAddStaff: () => {},
        onOpenAddService: () => {},
        onOpenLicenseModal: () => {},
      })
    );

    expect(markup).toContain('Operating Hours');
    expect(markup).toContain('Weekly operating hours and clinic schedule must be configured before admitting patients and publishing.');
    expect(markup).toContain('Set Operating Hours');
    // Overall facility readiness must indicate Setup Needed
    expect(markup).toContain('Facility Setup Required');
    expect(markup).toContain('5/6 Required');
  });

  test('2. Satisfies readiness when Operating Hours are configured', () => {
    const markup = renderToStaticMarkup(
      React.createElement(FacilityReadinessTab, {
        license: mockActiveLicense as any,
        clinicName: 'St. Jude Health Hub',
        letterheadAddress: '123 Rizal Ave, Manila',
        letterheadContact: '0917-000-0000',
        accreditationNumber: 'PHIC-1234',
        operatingHours: 'Mon-Sat 8:00 AM - 5:00 PM',
        staff: mockStaff as any,
        services: mockServices as any,
        roles: mockRoles as any,
        isDirectoryPublished: false,
        isOnlineBookingPaused: false,
        isWorkspaceEligible: true,
        onNavigateTab: () => {},
        onOpenAddStaff: () => {},
        onOpenAddService: () => {},
        onOpenLicenseModal: () => {},
      })
    );

    expect(markup).toContain('Operating Hours');
    expect(markup).toContain('Mon-Sat 8:00 AM - 5:00 PM');
    expect(markup).toContain('Edit Hours');
    expect(markup).toContain('Facility Ready');
    expect(markup).toContain('Ready to Open');
  });

  test('3. Renders Workspace Eligibility Pending warning banner when isWorkspaceEligible is false', () => {
    const markup = renderToStaticMarkup(
      React.createElement(FacilityReadinessTab, {
        license: mockActiveLicense as any,
        clinicName: 'St. Jude Health Hub',
        letterheadAddress: '123 Rizal Ave, Manila',
        letterheadContact: '0917-000-0000',
        accreditationNumber: 'PHIC-1234',
        operatingHours: 'Mon-Sat 8:00 AM - 5:00 PM',
        staff: mockStaff as any,
        services: mockServices as any,
        roles: mockRoles as any,
        isDirectoryPublished: false,
        isOnlineBookingPaused: false,
        isWorkspaceEligible: false,
        onNavigateTab: () => {},
        onOpenAddStaff: () => {},
        onOpenAddService: () => {},
        onOpenLicenseModal: () => {},
      })
    );

    expect(markup).toContain('Workspace Eligibility Pending');
    expect(markup).toContain('Your organization workspace administrator has not yet enabled public patient directory discovery for this facility branch');
    expect(markup).toContain('To resolve: Contact your workspace administrator to enable &quot;Patient App Discovery&quot; in Portal Settings → Facilities.');
  });

  test('4. Does not render Workspace Eligibility Pending warning banner when isWorkspaceEligible is true', () => {
    const markup = renderToStaticMarkup(
      React.createElement(FacilityReadinessTab, {
        license: mockActiveLicense as any,
        clinicName: 'St. Jude Health Hub',
        letterheadAddress: '123 Rizal Ave, Manila',
        letterheadContact: '0917-000-0000',
        accreditationNumber: 'PHIC-1234',
        operatingHours: 'Mon-Sat 8:00 AM - 5:00 PM',
        staff: mockStaff as any,
        services: mockServices as any,
        roles: mockRoles as any,
        isDirectoryPublished: false,
        isOnlineBookingPaused: false,
        isWorkspaceEligible: true,
        onNavigateTab: () => {},
        onOpenAddStaff: () => {},
        onOpenAddService: () => {},
        onOpenLicenseModal: () => {},
      })
    );

    expect(markup).not.toContain('Workspace Eligibility Pending');
  });

  test('5. Renders Online Presence & Patient Directory card with dual controls and 4-state badges', () => {
    // State A: Published and Accepting Bookings
    const markupA = renderToStaticMarkup(
      React.createElement(FacilityReadinessTab, {
        license: mockActiveLicense as any,
        clinicName: 'St. Jude Health Hub',
        letterheadAddress: '123 Rizal Ave, Manila',
        letterheadContact: '0917-000-0000',
        accreditationNumber: 'PHIC-1234',
        operatingHours: 'Mon-Sat 8:00 AM - 5:00 PM',
        staff: mockStaff as any,
        services: mockServices as any,
        roles: mockRoles as any,
        isDirectoryPublished: true,
        isOnlineBookingPaused: false,
        isWorkspaceEligible: true,
        onNavigateTab: () => {},
        onOpenAddStaff: () => {},
        onOpenAddService: () => {},
        onOpenLicenseModal: () => {},
      })
    );

    expect(markupA).toContain('Online Presence &amp; Patient Directory');
    expect(markupA).toContain('Publish to Patient Directory');
    expect(markupA).toContain('Pause Online Appointment Booking');
    expect(markupA).toContain('Published (Live)');
    expect(markupA).toContain('Booking Active');

    // State B: Published but Capacity Paused
    const markupB = renderToStaticMarkup(
      React.createElement(FacilityReadinessTab, {
        license: mockActiveLicense as any,
        clinicName: 'St. Jude Health Hub',
        letterheadAddress: '123 Rizal Ave, Manila',
        letterheadContact: '0917-000-0000',
        accreditationNumber: 'PHIC-1234',
        operatingHours: 'Mon-Sat 8:00 AM - 5:00 PM',
        staff: mockStaff as any,
        services: mockServices as any,
        roles: mockRoles as any,
        isDirectoryPublished: true,
        isOnlineBookingPaused: true,
        isWorkspaceEligible: true,
        onNavigateTab: () => {},
        onOpenAddStaff: () => {},
        onOpenAddService: () => {},
        onOpenLicenseModal: () => {},
      })
    );

    expect(markupB).toContain('Published (Live)');
    expect(markupB).toContain('Booking Paused');
    expect(markupB).toContain('Online appointment booking is currently paused');

    // State C: Offline (Not Listed)
    const markupC = renderToStaticMarkup(
      React.createElement(FacilityReadinessTab, {
        license: mockActiveLicense as any,
        clinicName: 'St. Jude Health Hub',
        letterheadAddress: '123 Rizal Ave, Manila',
        letterheadContact: '0917-000-0000',
        accreditationNumber: 'PHIC-1234',
        operatingHours: 'Mon-Sat 8:00 AM - 5:00 PM',
        staff: mockStaff as any,
        services: mockServices as any,
        roles: mockRoles as any,
        isDirectoryPublished: false,
        isOnlineBookingPaused: false,
        isWorkspaceEligible: true,
        onNavigateTab: () => {},
        onOpenAddStaff: () => {},
        onOpenAddService: () => {},
        onOpenLicenseModal: () => {},
      })
    );

    expect(markupC).toContain('Draft (Unlisted)');
  });

  test('6. Disables directory publishing switch when workspace is not eligible or readiness incomplete', () => {
    const markup = renderToStaticMarkup(
      React.createElement(FacilityReadinessTab, {
        license: mockActiveLicense as any,
        clinicName: 'St. Jude Health Hub',
        letterheadAddress: '123 Rizal Ave, Manila',
        letterheadContact: '0917-000-0000',
        accreditationNumber: 'PHIC-1234',
        operatingHours: '', // incomplete
        staff: mockStaff as any,
        services: mockServices as any,
        roles: mockRoles as any,
        isDirectoryPublished: false,
        isOnlineBookingPaused: false,
        isWorkspaceEligible: false, // ineligible
        onNavigateTab: () => {},
        onOpenAddStaff: () => {},
        onOpenAddService: () => {},
        onOpenLicenseModal: () => {},
      })
    );

    expect(markup).toContain('Publishing locked: Requires workspace administrator approval in Portal.');
  });

  test('7. Renders skeleton loading state when showSkeletons is true', () => {
    const markup = renderToStaticMarkup(
      React.createElement(FacilityReadinessTab, {
        license: null,
        clinicName: '',
        letterheadAddress: '',
        letterheadContact: '',
        accreditationNumber: '',
        operatingHours: '',
        staff: [],
        services: [],
        roles: [],
        isDirectoryPublished: false,
        isOnlineBookingPaused: false,
        isWorkspaceEligible: true,
        showSkeletons: true,
        onNavigateTab: () => {},
        onOpenAddStaff: () => {},
        onOpenAddService: () => {},
        onOpenLicenseModal: () => {},
      })
    );

    // Should render skeletons and not the main check list cards
    expect(markup).not.toContain('Operating Hours');
  });
});

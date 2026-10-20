// token-guard:ignore-file
import { describe, expect, test, mock, beforeEach, afterAll } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

(globalThis as any).__DEV__ = true;

const createMockComponent = (name: string) => {
  const Comp = ({ children, accessibilityLabel, accessibilityRole, placeholder, value, onPress, title, source, resizeMode }: any) =>
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
  Dimensions: {
    get: () => ({ width: 1280, height: 800 }),
    addEventListener: () => ({ remove: () => {} }),
  },
  useWindowDimensions: () => ({ width: 1280, height: 800 }),
  Keyboard: { dismiss: () => {}, addListener: () => ({ remove: () => {} }) },
  AppState: { addEventListener: () => ({ remove: () => {} }) },
  Platform: { OS: 'web', select: (obj: any) => obj.web ?? obj.default },
  Touchable: { Mixin: {} },
  TurboModuleRegistry: { get: () => null, getEnforcing: () => null },
  NativeModules: {},
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
  Alert: {
    alert: () => {},
  },
  Linking: {
    openURL: () => Promise.resolve(),
    canOpenURL: () => Promise.resolve(true),
  },
}));

mock.module('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
  SafeAreaProvider: ({ children }: any) => children,
  SafeAreaView: createMockComponent('SafeAreaView'),
}));

mock.module('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: () => {},
    goBack: () => {},
  }),
}));

mock.module('react-native-svg', () => ({
  Svg: createMockComponent('Svg'),
  Path: createMockComponent('Path'),
  Circle: createMockComponent('Circle'),
  Rect: createMockComponent('Rect'),
  Line: createMockComponent('Line'),
  default: createMockComponent('Svg'),
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

let mockClinicContext: any = {
  facilityName: 'NextStep OPD',
  planTier: 'pro',
  accreditationNumber: 'ACC-12345',
  clinicLogo: null,
  settings: { preferredChartLayout: 'centered' },
};

(globalThis as any).__mockClinicContext = mockClinicContext;

let mockAuthContext = {
  user: {
    id: 'user-1',
    name: 'Wave Ambray',
    role: 'Admin',
    roleName: 'Clinic Administrator',
  },
  can: () => true,
  offline: false,
};

mock.module('../context/AuthContext', () => ({
  useAuth: () => mockAuthContext,
  usePermission: () => true,
}));

const staffContextMockFactory = () => ({
  useStaff: () => (globalThis as any).__mockStaffContext ?? { current: null },
  formatStaffName: (s: any) => s?.name || [s?.title, s?.firstName, s?.lastName].filter(Boolean).join(' ').trim(),
  staffInitials: (s: any) => `${s?.firstName?.[0] ?? ''}${s?.lastName?.[0] ?? ''}`.toUpperCase() || '?',
  StaffProvider: ({ children }: any) => children,
});

mock.module('../context/StaffContext', staffContextMockFactory);
mock.module('@context/StaffContext', staffContextMockFactory);

const { default: WorkstationSidebar, WORKSTATION_NAV_ITEMS } = await import('../components/layout/WorkstationSidebar');

describe('WorkstationSidebar Component', () => {
  beforeEach(() => {
    mockClinicContext = {
      facilityName: 'NextStep OPD',
      planTier: 'pro',
      accreditationNumber: 'ACC-12345',
      clinicLogo: null,
      settings: { preferredChartLayout: 'centered' },
    };
    (globalThis as any).__mockClinicContext = mockClinicContext;
    (globalThis as any).__mockStaffContext = { current: null };
    mockAuthContext = {
      user: {
        id: 'user-1',
        name: 'Wave Ambray',
        role: 'Admin',
        roleName: 'Clinic Administrator',
      },
      can: () => true,
      offline: false,
    };
    mock.module('../context/AuthContext', () => ({
      useAuth: () => mockAuthContext,
      usePermission: () => true,
    }));
    mock.module('../context/StaffContext', staffContextMockFactory);
    mock.module('@context/StaffContext', staffContextMockFactory);
  });

  test('renders active clinic name and elevates plan tier badge to top header', () => {
    const html = renderToStaticMarkup(
      React.createElement(WorkstationSidebar, {
        currentRoute: 'Patients',
        onNavigate: () => {},
      })
    );

    // Header has the facility name as the primary title and uppercase tier badge
    expect(html).toContain('NextStep OPD');
    expect(html).toContain('PRO');
    expect(html).not.toContain('Clinic workstation');
  });

  test('renders fallback brand title when facility name is unconfigured', () => {
    mockClinicContext = {
      facilityName: '',
      planTier: 'pro',
      accreditationNumber: '',
      clinicLogo: null,
    };
    (globalThis as any).__mockClinicContext = mockClinicContext;

    const html = renderToStaticMarkup(
      React.createElement(WorkstationSidebar, {
        currentRoute: 'Patients',
        onNavigate: () => {},
      })
    );

    expect(html).toContain('Clinic EZ');
    expect(html).toContain('PRO');
  });

  test('handles enterprise plan tier badge formatting with clinic name', () => {
    mockClinicContext = {
      facilityName: 'St. Jude General Hospital',
      planTier: 'enterprise',
      accreditationNumber: '',
      clinicLogo: null,
      settings: { preferredChartLayout: 'centered' },
    };
    (globalThis as any).__mockClinicContext = mockClinicContext;

    const html = renderToStaticMarkup(
      React.createElement(WorkstationSidebar, {
        currentRoute: 'Dashboard',
        onNavigate: () => {},
      })
    );

    expect(html).toContain('St. Jude General Hospital');
    expect(html).toContain('ENTERPRISE');
  });

  test('renders cleanly without badge when planTier is empty', () => {
    mockClinicContext = {
      facilityName: 'Community Clinic',
      planTier: '',
      accreditationNumber: '',
      clinicLogo: null,
      settings: { preferredChartLayout: 'centered' },
    };
    (globalThis as any).__mockClinicContext = mockClinicContext;

    const html = renderToStaticMarkup(
      React.createElement(WorkstationSidebar, {
        currentRoute: 'Dashboard',
        onNavigate: () => {},
      })
    );

    expect(html).toContain('Community Clinic');
    expect(html).not.toContain('PRO');
    expect(html).not.toContain('ENTERPRISE');
  });

  test('renders custom clinic logo image when clinicLogo is provided', () => {
    mockClinicContext = {
      facilityName: 'Metro Health Care',
      planTier: 'pro',
      clinicLogo: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    };
    (globalThis as any).__mockClinicContext = mockClinicContext;

    const html = renderToStaticMarkup(
      React.createElement(WorkstationSidebar, {
        currentRoute: 'Dashboard',
        onNavigate: () => {},
      })
    );

    expect(html).toContain('data-component="Image"');
    expect(html).toContain('Metro Health Care logo');
    expect(html).toContain('data:image/png;base64');
  });

  test('renders all standard workstation navigation items in expanded mode', () => {
    const html = renderToStaticMarkup(
      React.createElement(WorkstationSidebar, {
        currentRoute: 'Patients',
        onNavigate: () => {},
        mode: 'open',
      })
    );

    for (const item of WORKSTATION_NAV_ITEMS) {
      expect(html).toContain(item.label);
    }
  });

  test('renders compact icon-rail mode (72px) without label texts', () => {
    const html = renderToStaticMarkup(
      React.createElement(WorkstationSidebar, {
        currentRoute: 'Patients',
        onNavigate: () => {},
        mode: 'icon',
        width: 72,
      })
    );

    // In icon mode, labels are in title/accessibility attributes, not rendered in body text
    expect(html).toContain('data-title="Patients"');
    expect(html).toContain('aria-label="Patients"');
    expect(html).not.toContain('Clinic workstation');
  });

  test('renders active user menu in footer', () => {
    const html = renderToStaticMarkup(
      React.createElement(WorkstationSidebar, {
        currentRoute: 'Patients',
        onNavigate: () => {},
      })
    );

    expect(html).toContain('Wave Ambray');
    expect(html).toContain('Clinic Administrator');
  });

  afterAll(() => {
    delete (globalThis as any).__mockClinicContext;
  });
});

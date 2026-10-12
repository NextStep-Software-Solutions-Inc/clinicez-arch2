// token-guard:ignore-file
import { describe, expect, test, mock, beforeEach } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

(globalThis as any).__DEV__ = true;

const createMockComponent = (name: string) => {
  const Comp = ({ children, accessibilityLabel, accessibilityRole, placeholder, value, onPress, title }: any) =>
    React.createElement(
      'div',
      {
        'data-component': name,
        ...(accessibilityLabel ? { 'aria-label': accessibilityLabel } : {}),
        ...(accessibilityRole ? { role: accessibilityRole } : {}),
        ...(placeholder ? { 'data-placeholder': placeholder } : {}),
        ...(value !== undefined ? { 'data-value': value } : {}),
        ...(title ? { 'data-title': title } : {}),
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
}));

mock.module('../constants/fonts', () => ({
  applyFontFamily: (s: any) => s,
  fontAssets: {},
}));

let mockClinicContext = {
  facilityName: 'NextStep OPD',
  planTier: 'pro',
  accreditationNumber: 'ACC-12345',
};

mock.module('../context/ClinicContext', () => ({
  useClinic: () => mockClinicContext,
}));

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
}));

mock.module('../context/StaffContext', () => ({
  useStaff: () => ({ current: null }),
  formatStaffName: (s: any) => s.name,
}));

const { default: WorkstationSidebar, WORKSTATION_NAV_ITEMS } = await import('../components/layout/WorkstationSidebar');

describe('WorkstationSidebar Component', () => {
  beforeEach(() => {
    mockClinicContext = {
      facilityName: 'NextStep OPD',
      planTier: 'pro',
      accreditationNumber: 'ACC-12345',
    };
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
  });

  test('renders Clinic EZ brand and elevates plan tier badge to top header', () => {
    const html = renderToStaticMarkup(
      React.createElement(WorkstationSidebar, {
        currentRoute: 'Patients',
        onNavigate: () => {},
      })
    );

    // Header has brand title and uppercase tier badge
    expect(html).toContain('Clinic EZ');
    expect(html).toContain('PRO');
    expect(html).toContain('NextStep OPD');
  });

  test('removes redundant clinic name from the bottom footer', () => {
    const html = renderToStaticMarkup(
      React.createElement(WorkstationSidebar, {
        currentRoute: 'Patients',
        onNavigate: () => {},
      })
    );

    // NextStep OPD should only appear once in the whole sidebar (in the top brand header)
    const matches = html.match(/NextStep OPD/g) || [];
    expect(matches.length).toBe(1);

    // The old footer format with accreditation or standalone pro text at the bottom is gone
    expect(html).not.toContain('Accreditation ACC-12345');
  });

  test('handles enterprise plan tier badge formatting', () => {
    mockClinicContext = {
      facilityName: 'St. Jude General Hospital',
      planTier: 'enterprise',
      accreditationNumber: '',
    };

    const html = renderToStaticMarkup(
      React.createElement(WorkstationSidebar, {
        currentRoute: 'Dashboard',
        onNavigate: () => {},
      })
    );

    expect(html).toContain('Clinic EZ');
    expect(html).toContain('ENTERPRISE');
    expect(html).toContain('St. Jude General Hospital');
    const matches = html.match(/St. Jude General Hospital/g) || [];
    expect(matches.length).toBe(1);
  });

  test('renders cleanly without badge when planTier is empty', () => {
    mockClinicContext = {
      facilityName: 'Community Clinic',
      planTier: '',
      accreditationNumber: '',
    };

    const html = renderToStaticMarkup(
      React.createElement(WorkstationSidebar, {
        currentRoute: 'Dashboard',
        onNavigate: () => {},
      })
    );

    expect(html).toContain('Clinic EZ');
    expect(html).toContain('Community Clinic');
    expect(html).not.toContain('PRO');
    expect(html).not.toContain('ENTERPRISE');
  });

  test('renders all standard workstation navigation items', () => {
    const html = renderToStaticMarkup(
      React.createElement(WorkstationSidebar, {
        currentRoute: 'Patients',
        onNavigate: () => {},
      })
    );

    for (const item of WORKSTATION_NAV_ITEMS) {
      expect(html).toContain(item.label);
    }
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
});

// token-guard:ignore-file
import { describe, expect, test, mock } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

(globalThis as any).__DEV__ = true;

const createMockComponent = (name: string) => {
  const Comp = ({
    children,
    accessibilityLabel,
    accessibilityRole,
    placeholder,
    value,
    onPress,
    title,
    visible,
  }: any) => {
    if (name === 'Modal' && visible === false) return null;
    return React.createElement(
      'div',
      {
        'data-component': name,
        ...(accessibilityLabel ? { 'aria-label': accessibilityLabel } : {}),
        ...(accessibilityRole ? { role: accessibilityRole } : {}),
        ...(placeholder ? { 'data-placeholder': placeholder } : {}),
        ...(value !== undefined ? { 'data-value': String(value) } : {}),
        ...(title ? { 'data-title': title } : {}),
        onClick: onPress,
      },
      title,
      placeholder,
      children
    );
  };
  Comp.displayName = name;
  return Comp;
};

mock.module('react-native', () => ({
  Linking: { openURL: () => Promise.resolve(), canOpenURL: () => Promise.resolve(true) },
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
  Dimensions: { get: () => ({ width: 1280, height: 800 }), addEventListener: () => ({ remove: () => {} }) },
  useWindowDimensions: () => ({ width: 1280, height: 800 }),
  Keyboard: { dismiss: () => {}, addListener: () => ({ remove: () => {} }) },
  AppState: { currentState: 'active', addEventListener: () => ({ remove: () => {} }) },
  Platform: { OS: 'web', select: (obj: any) => obj.web ?? obj.default },
  Touchable: { Mixin: {} },
  TurboModuleRegistry: { get: () => null, getEnforcing: () => null },
  NativeModules: {},
  PanResponder: { create: () => ({ panHandlers: {} }) },
  Alert: { alert: () => {} },
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
    sequence: () => ({ start: (cb?: any) => cb && cb() }),
    loop: () => ({ start: (cb?: any) => cb && cb() }),
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
  G: ({ children }: any) => children,
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
  findDuplicateStaffByEmail,
  validateAddStaffDuplicateEmail,
  DUPLICATE_STAFF_EMAIL_ERROR,
  default: StaffManagementTab,
} = await import('../components/settings/StaffManagementTab');

describe('GitHub #113: findDuplicateStaffByEmail pure helper', () => {
  const clinicStaffRoster = [
    { id: 'staff-1', email: 'dr.reyes@clinicez.ph', firstName: 'Maria', lastName: 'Reyes' },
    { id: 'staff-2', email: '  Nurse.Cruz@ClinicEZ.ph ', firstName: 'Juan', lastName: 'Cruz' },
    { id: 'staff-3', email: null, firstName: 'NoEmail', lastName: 'RosterOnly' },
    { id: 'staff-4', email: undefined, firstName: 'Undefined', lastName: 'Email' },
  ];

  test('detects exact, case-insensitive, and whitespace-padded duplicate emails', () => {
    expect(findDuplicateStaffByEmail('dr.reyes@clinicez.ph', clinicStaffRoster)?.id).toBe('staff-1');
    expect(findDuplicateStaffByEmail('  DR.REYES@CLINICEZ.PH  ', clinicStaffRoster)?.id).toBe('staff-1');
    expect(findDuplicateStaffByEmail('nurse.cruz@clinicez.ph', clinicStaffRoster)?.id).toBe('staff-2');
  });

  test('returns null for unique emails, empty/whitespace strings, or empty staff lists', () => {
    expect(findDuplicateStaffByEmail('new.doctor@clinicez.ph', clinicStaffRoster)).toBeNull();
    expect(findDuplicateStaffByEmail('', clinicStaffRoster)).toBeNull();
    expect(findDuplicateStaffByEmail('   ', clinicStaffRoster)).toBeNull();
    expect(findDuplicateStaffByEmail('dr.reyes@clinicez.ph', [])).toBeNull();
  });

  test('honors excludeStaffId when editing an existing staff record while still catching other staff duplicates', () => {
    expect(findDuplicateStaffByEmail('dr.reyes@clinicez.ph', clinicStaffRoster, 'staff-1')).toBeNull();
    expect(findDuplicateStaffByEmail('nurse.cruz@clinicez.ph', clinicStaffRoster, 'staff-1')?.id).toBe('staff-2');
  });
});

describe('GitHub #113: Add Staff Modal inline duplicate email validation & submission guard', () => {
  const roster = [
    {
      id: 'staff-1',
      firstName: 'Maria',
      lastName: 'Reyes',
      role: 'Doctor' as const,
      email: 'dr.reyes@clinicez.ph',
      isActive: true,
    },
  ];

  test('validateAddStaffDuplicateEmail returns exact inline message across Email Invite, Copy Link, and Direct Password modes', () => {
    expect(DUPLICATE_STAFF_EMAIL_ERROR).toBe(
      'This email address already belongs to an existing staff member in this clinic.'
    );

    expect(validateAddStaffDuplicateEmail('DR.REYES@clinicez.ph', roster, 'email')).toBe(
      'This email address already belongs to an existing staff member in this clinic.'
    );
    expect(validateAddStaffDuplicateEmail('  dr.reyes@clinicez.ph ', roster, 'link')).toBe(
      'This email address already belongs to an existing staff member in this clinic.'
    );
    expect(validateAddStaffDuplicateEmail('dr.reyes@clinicez.ph', roster, 'password')).toBe(
      'This email address already belongs to an existing staff member in this clinic.'
    );

    // No Login mode ignores email field
    expect(validateAddStaffDuplicateEmail('dr.reyes@clinicez.ph', roster, 'none')).toBeNull();

    // Unique or blank email returns null
    expect(validateAddStaffDuplicateEmail('unique.staff@clinicez.ph', roster, 'email')).toBeNull();
    expect(validateAddStaffDuplicateEmail('', roster, 'email')).toBeNull();
  });

  test('StaffManagementTab renders Add Staff Modal with email invite controls without crashing', () => {
    (globalThis as any).__mockClinicContext = {
      rooms: [],
      refreshRooms: async () => {},
    };

    try {
      const markup = renderToStaticMarkup(
        React.createElement(StaffManagementTab, {
          staff: roster as any,
          setStaff: () => {},
          roles: [],
          staffLoadError: null,
          showSkeletons: false,
          activeStaffCount: 1,
          maxStaffSeats: 10,
          onRefreshStaff: async () => {},
          showAddModal: true,
          setShowAddModal: () => {},
          onStaffAdded: async () => {},
        })
      );

      expect(markup).toContain('Add staff member');
      expect(markup).toContain('Email Invite');
      expect(markup).toContain('Sign-in email address');
      expect(markup).toContain('Send Invitation Email');
      expect(markup).not.toContain('doctor@clinic.com');
      expect(markup).not.toContain('0917-123-4567');
      expect(markup).not.toContain('DR. FIRST LAST');
      expect(markup).not.toContain('Clinic EZ');

      const skeletonMarkup = renderToStaticMarkup(
        React.createElement(StaffManagementTab, {
          staff: [],
          setStaff: () => {},
          roles: [],
          staffLoadError: null,
          showSkeletons: true,
          activeStaffCount: 0,
          maxStaffSeats: 10,
          onRefreshStaff: async () => {},
          showAddModal: false,
          setShowAddModal: () => {},
          onStaffAdded: async () => {},
        })
      );

      expect(skeletonMarkup).toContain('Loading');
      expect(skeletonMarkup).not.toContain('Staff seats used: 0');
      expect(skeletonMarkup).not.toContain('Active staff members: 0');
    } finally {
      delete (globalThis as any).__mockClinicContext;
    }
  });
});

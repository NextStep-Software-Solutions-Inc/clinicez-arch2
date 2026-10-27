import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { AuthUser } from '../services/authSession';
import type { StaffMember } from '../services/clinicService';

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
    source,
    style,
  }: any) =>
    React.createElement(
      'div',
      {
        'data-component': name,
        ...(accessibilityLabel ? { 'aria-label': accessibilityLabel } : {}),
        ...(accessibilityRole ? { role: accessibilityRole } : {}),
        ...(placeholder ? { 'data-placeholder': placeholder } : {}),
        ...(value !== undefined ? { 'data-value': String(value) } : {}),
        ...(title ? { 'data-title': title } : {}),
        ...(source?.uri ? { 'data-src': source.uri } : {}),
        ...(style ? { 'data-style': JSON.stringify(style) } : {}),
        onClick: onPress,
      },
      title,
      children,
    );
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
  Dimensions: {
    get: () => ({ width: 1280, height: 800 }),
    addEventListener: () => ({ remove: () => {} }),
  },
  useWindowDimensions: () => ({ width: 1280, height: 800 }),
  Keyboard: { dismiss: () => {}, addListener: () => ({ remove: () => {} }) },
  AppState: { currentState: 'active', addEventListener: () => ({ remove: () => {} }) },
  Platform: { OS: 'web', select: (obj: any) => obj.web ?? obj.default },
  Touchable: { Mixin: {} },
  TurboModuleRegistry: { get: () => null, getEnforcing: () => null },
  NativeModules: {},
  NativeEventEmitter: class {
    addListener() {
      return { remove: () => {} };
    }
    removeAllListeners() {}
  },
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
  Alert: { alert: () => {} },
  PanResponder: { create: (config: any) => ({ panHandlers: {}, ...config }) },
  RefreshControl: createMockComponent('RefreshControl'),
  processColor: (c: any) => c,
  Vibration: { vibrate: () => {}, cancel: () => {} },
}));

mock.module('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
  SafeAreaProvider: ({ children }: any) => children,
  SafeAreaView: createMockComponent('SafeAreaView'),
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
  Polygon: 'Polygon',
}));

mock.module('../constants/fonts', () => ({
  applyFontFamily: (s: any) => s,
  fontAssets: {},
}));

mock.module('../components/comms/ClinicChatDrawerHost', () => ({
  default: () => null,
}));

mock.module('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: () => {}, goBack: () => {} }),
  useRoute: () => ({ params: {} }),
}));

const defaultAuthMock = {
  state: 'signedOut' as const,
  user: null,
  permissions: [] as string[],
  offline: false,
  notice: null,
  login: async () => null,
  bootstrap: async () => null,
  changePassword: async () => null,
  completeUnlock: () => {},
  useDifferentAccount: async () => {},
  logout: async () => {},
  retry: () => {},
  can: () => false,
};

const authContextMockFactory = () => ({
  useAuth: () => (globalThis as any).__mockAuthContext ?? defaultAuthMock,
  usePermission: (perm: string) => {
    const ctx = (globalThis as any).__mockAuthContext;
    return ctx?.can ? Boolean(ctx.can(perm)) : true;
  },
  AuthProvider: ({ children }: any) => children,
});

const staffContextMockFactory = () => ({
  useStaff: () =>
    (globalThis as any).__mockStaffContext ?? {
      staff: [],
      current: null,
      currentName: '',
      loading: false,
      error: null,
      reload: async () => {},
    },
  formatStaffName: (s?: any) => {
    if (!s) return '';
    return [s.title, s.firstName, s.lastName].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  },
  staffInitials: (s?: any) => {
    if (!s) return '?';
    return `${s.firstName?.[0] ?? ''}${s.lastName?.[0] ?? ''}`.toUpperCase() || '?';
  },
  StaffProvider: ({ children }: any) => children,
});

mock.module('../context/AuthContext', authContextMockFactory);
mock.module('@context/AuthContext', authContextMockFactory);
mock.module('../context/StaffContext', staffContextMockFactory);
mock.module('@context/StaffContext', staffContextMockFactory);

const {
  normalizeStaffLoadError,
  resolveCurrentStaffMember,
  shouldFetchStaffDirectory,
} = await import('../services/staffProfileResolver');
const { default: ProfileScreen } = await import('../navigation/screens/Profile.screen');

describe('Issue 106: Doctor & Staff Account Email and Credentials in My Profile', () => {
  const doctorUser: AuthUser = {
    id: 'staff-doc-106',
    name: 'Ely An Real',
    email: 'lovelyjean.maureal@ustp.edu.ph',
    role: 'Doctor',
    roleName: 'Attending Physician / Doctor',
    clinicId: 'clinic-ustp-1',
    tenantId: 'tenant-ustp',
    clinicName: 'USTP CDO University Health Center',
    permissions: ['consultations:read', 'consultations:write', 'consultations:sign', 'staff:read'],
    mustChangePassword: false,
  };

  const doctorStaffProfile: StaffMember = {
    id: 'staff-doc-106',
    tenantId: 'tenant-ustp',
    clinicId: 'clinic-ustp-1',
    roleName: 'Attending Physician / Doctor',
    title: 'Dr.',
    firstName: 'Ely An',
    lastName: 'Real',
    middleName: 'M.',
    role: 'Doctor',
    email: 'lovelyjean.maureal@ustp.edu.ph',
    phoneNumber: '0917-555-0199',
    prcLicenseNumber: '010714',
    ptrNumber: 'PTR-2026-88991',
    s2LicenseNumber: 'S2-0918-77441',
    philHealthPan: '1200-1112223-4',
    specialty: 'Internal Medicine',
    isActive: true,
    createdAt: '2026-10-26T00:00:00Z',
  };

  beforeEach(() => {
    (globalThis as any).__mockClinicContext = {
      facilityName: 'USTP CDO University Health Center',
      planTier: 'Pro',
      accreditationNumber: 'ACC-106',
      clinicLogo: null,
      settings: { preferredChartLayout: 'centered' },
    };
    (globalThis as any).__mockStaffContext = {
      staff: [doctorStaffProfile],
      current: doctorStaffProfile,
      currentName: 'Dr. Ely An Real',
      loading: false,
      error: null,
      reload: async () => {},
    };
    (globalThis as any).__mockAuthContext = {
      state: 'signedIn',
      user: doctorUser,
      permissions: doctorUser.permissions,
      offline: false,
      notice: null,
      login: async () => null,
      bootstrap: async () => null,
      changePassword: async () => null,
      completeUnlock: () => {},
      useDifferentAccount: async () => {},
      logout: async () => {},
      retry: () => {},
      can: () => true,
    };
    mock.module('../context/AuthContext', authContextMockFactory);
    mock.module('@context/AuthContext', authContextMockFactory);
    mock.module('../context/StaffContext', staffContextMockFactory);
    mock.module('@context/StaffContext', staffContextMockFactory);
  });

  afterEach(() => {
    delete (globalThis as any).__mockClinicContext;
    delete (globalThis as any).__mockStaffContext;
    delete (globalThis as any).__mockAuthContext;
  });

  describe('1. StaffContext Profile Resolution (`staffProfileResolver`)', () => {
    test('1.1 Resolves full credentials and email from /staff/me when GET /staff directory is empty or restricted', () => {
      const restrictedDoctorUser: AuthUser = {
        ...doctorUser,
        email: undefined,
        permissions: ['consultations:read', 'consultations:write'],
      };

      const resolved = resolveCurrentStaffMember(restrictedDoctorUser, [], doctorStaffProfile);

      expect(resolved).not.toBeNull();
      expect(resolved?.email).toBe('lovelyjean.maureal@ustp.edu.ph');
      expect(resolved?.prcLicenseNumber).toBe('010714');
      expect(resolved?.ptrNumber).toBe('PTR-2026-88991');
      expect(resolved?.philHealthPan).toBe('1200-1112223-4');
      expect(resolved?.s2LicenseNumber).toBe('S2-0918-77441');
      expect(resolved?.specialty).toBe('Internal Medicine');
      expect(resolved?.phoneNumber).toBe('0917-555-0199');
      expect(resolved?.title).toBe('Dr.');
    });

    test('1.2 Merges directory room metadata with authoritative /staff/me credentials', () => {
      const directoryEntry: StaffMember = {
        ...doctorStaffProfile,
        prcLicenseNumber: undefined,
        assignedRoomIds: ['room-1'],
        assignedRoomNames: ['Consultation Room 1'],
      };

      const resolved = resolveCurrentStaffMember(doctorUser, [directoryEntry], doctorStaffProfile);

      expect(resolved?.assignedRoomNames).toEqual(['Consultation Room 1']);
      expect(resolved?.prcLicenseNumber).toBe('010714');
      expect(resolved?.email).toBe('lovelyjean.maureal@ustp.edu.ph');
    });

    test('1.3 Prevents cross-account leakage when stale myProfile belongs to a previous user', () => {
      const nurseUser: AuthUser = {
        id: 'staff-nurse-202',
        name: 'Maria Santos',
        email: 'maria.santos@ustp.edu.ph',
        role: 'Nurse',
        roleName: 'Triage Nurse',
        clinicId: 'clinic-ustp-1',
        tenantId: 'tenant-ustp',
        clinicName: 'USTP CDO University Health Center',
        permissions: ['triage:read', 'triage:write'],
        mustChangePassword: false,
      };

      const resolved = resolveCurrentStaffMember(nurseUser, [], doctorStaffProfile);

      expect(resolved?.id).toBe('staff-nurse-202');
      expect(resolved?.email).toBe('maria.santos@ustp.edu.ph');
      expect(resolved?.prcLicenseNumber).toBeUndefined();
    });

    test('1.4 Preserves session user.email in offline fallback when both directory and /staff/me are unavailable', () => {
      const resolved = resolveCurrentStaffMember(doctorUser, [], null);

      expect(resolved).not.toBeNull();
      expect(resolved?.firstName).toBe('Ely An');
      expect(resolved?.lastName).toBe('Real');
      expect(resolved?.email).toBe('lovelyjean.maureal@ustp.edu.ph');
    });

    test('1.5 Skips GET /staff when permissions explicitly omit staff:read and suppresses HTTP 403 error state', () => {
      expect(shouldFetchStaffDirectory(doctorUser)).toBe(true);
      expect(
        shouldFetchStaffDirectory({
          ...doctorUser,
          permissions: ['consultations:read'],
        }),
      ).toBe(false);
      expect(shouldFetchStaffDirectory(null)).toBe(false);

      expect(normalizeStaffLoadError({ status: 403, message: 'Forbidden' })).toBeNull();
      expect(normalizeStaffLoadError({ status: 500, message: 'Gateway timeout' })).toBe('Gateway timeout');
    });
  });

  describe('2. ProfileScreen Pre-Population & Account Email Rendering', () => {
    test('2.1 Renders sign-in email in hero card and read-only input plus pre-populates PRC and clinical credentials', () => {
      const markup = renderToStaticMarkup(React.createElement(ProfileScreen));

      // Hero card displays full formatted name and account email
      expect(markup).toContain('Dr. Ely An Real');
      expect(markup).toContain('Account: lovelyjean.maureal@ustp.edu.ph');

      // Sign-in email input and clinical credentials pre-populate with saved database values
      expect(markup).toContain('data-value="lovelyjean.maureal@ustp.edu.ph"');
      expect(markup).toContain('data-value="010714"');
      expect(markup).toContain('data-value="PTR-2026-88991"');
      expect(markup).toContain('data-value="1200-1112223-4"');
      expect(markup).toContain('data-value="S2-0918-77441"');
      expect(markup).toContain('data-value="Internal Medicine"');
      expect(markup).toContain('data-value="0917-555-0199"');

      // Official Physician Stamp renders configured PRC license instead of missing placeholder
      expect(markup).toContain('PRC License No. 010714');
      expect(markup).not.toContain('PRC License No. [Required for Prescriptions]');
    });

    test('2.2 Falls back to session user.email when staffCurrent is not yet loaded', () => {
      (globalThis as any).__mockStaffContext = {
        staff: [],
        current: null,
        currentName: '',
        loading: true,
        error: null,
        reload: async () => {},
      };

      const markup = renderToStaticMarkup(React.createElement(ProfileScreen));

      expect(markup).toContain('Account: lovelyjean.maureal@ustp.edu.ph');
      expect(markup).toContain('data-value="lovelyjean.maureal@ustp.edu.ph"');
    });
  });
});

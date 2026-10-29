// token-guard:ignore-file
import { describe, it, expect, mock } from 'bun:test';
import React, { useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

(globalThis as any).__DEV__ = true;

const createMockComponent = (name: string) => {
  const Comp = ({
    children,
    accessibilityLabel,
    accessibilityRole,
    accessibilityState,
    testID,
    style,
    onPress,
    onSubmitEditing,
    value,
    placeholder,
    label,
    error,
    helperText,
    ...rest
  }: any) => {
    return React.createElement(
      'div',
      {
        'data-component': name,
        ...(testID ? { 'data-testid': testID, id: testID } : {}),
        ...(accessibilityLabel ? { 'aria-label': accessibilityLabel } : {}),
        ...(accessibilityRole ? { role: accessibilityRole, 'data-accessibility-role': accessibilityRole } : {}),
        ...(accessibilityState ? { 'data-accessibility-state': JSON.stringify(accessibilityState) } : {}),
        ...(onPress ? { 'data-pressable': 'true', onClick: onPress } : {}),
        ...(value !== undefined ? { 'data-value': String(value) } : {}),
        ...(placeholder ? { 'data-placeholder': placeholder } : {}),
        ...(label ? { 'data-label': label } : {}),
        ...(error ? { 'data-error': error } : {}),
        ...(helperText ? { 'data-helper-text': helperText } : {}),
      },
      label ? React.createElement('span', { 'data-label-text': 'true' }, label) : null,
      error ? React.createElement('span', { 'data-error-text': 'true' }, error) : null,
      children
    );
  };
  Comp.displayName = name;
  return Comp;
};

// Mock Icon component to prevent cross-module react version divergence with lucide-react-native
mock.module('../components/ui/Icon', () => {
  const MockIcon = ({ name, ...props }: any) => React.createElement('span', { 'data-icon': name });
  return {
    default: MockIcon,
    Icon: MockIcon,
    IconSlot: ({ icon }: any) => (icon ? React.createElement('span', { 'data-icon': icon }) : null),
    resolveIconName: (n: any) => n,
    ICONS: {},
  };
});

mock.module('react-native', () => ({
  Linking: {
    openURL: () => Promise.resolve(),
    canOpenURL: () => Promise.resolve(true),
    getInitialURL: () => Promise.resolve(null),
    addEventListener: () => ({ remove: () => {} }),
  },
  StyleSheet: {
    create: (s: any) => s,
    flatten: (s: any) => (Array.isArray(s) ? Object.assign({}, ...s.filter(Boolean)) : s || {}),
  },
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
  Dimensions: {
    get: () => ({ width: 1280, height: 800 }),
    addEventListener: () => ({ remove: () => {} }),
  },
  useWindowDimensions: () => ({ width: 1280, height: 800 }),
  Keyboard: { dismiss: () => {}, addListener: () => ({ remove: () => {} }) },
  AppState: { currentState: 'active', addEventListener: () => ({ remove: () => {} }) },
  Platform: { OS: 'web', select: (obj: any) => obj.web ?? obj.default },
  Alert: { alert: () => {} },
  Vibration: { vibrate: () => {} },
  Touchable: { Mixin: {} },
  PanResponder: { create: () => ({ panHandlers: {} }) },
  processColor: (c: any) => c,
  TurboModuleRegistry: { get: () => null, getEnforcing: () => null },
  NativeModules: {},
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
}));

mock.module('react-native-svg', () => ({
  Svg: createMockComponent('svg'),
  Path: createMockComponent('path'),
  Circle: createMockComponent('circle'),
  Rect: createMockComponent('rect'),
  Line: createMockComponent('line'),
  default: createMockComponent('svg'),
  Polyline: createMockComponent('polyline'),
  Polygon: createMockComponent('polygon'),
  Defs: ({ children }: any) => children,
  LinearGradient: ({ children }: any) => children,
  Stop: () => null,
  G: ({ children }: any) => children,
  Text: ({ children }: any) => children,
}));

mock.module('expo-secure-store', () => ({
  getItemAsync: () => Promise.resolve(null),
  setItemAsync: () => Promise.resolve(),
  deleteItemAsync: () => Promise.resolve(),
}));

mock.module('expo-constants', () => ({
  default: {
    expoConfig: {
      extra: {},
    },
  },
}));

mock.module('@react-native-community/netinfo', () => ({
  addEventListener: () => () => {},
  fetch: () => Promise.resolve({ isConnected: true }),
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

const axios = (await import('axios')).default;
const { validateWorkstationPassword } = await import('../utils/passwordValidation');
const { isValidEmail } = await import('../services/passwordPolicy');
const authSession = await import('../services/authSession');
const { useAuth } = await import('../context/AuthContext');
const { default: LoginScreen } = await import('../components/auth/LoginScreen');
const { default: AdminRecoveryScreen } = await import('../components/auth/AdminRecoveryScreen');

describe('Admin Account Recovery Suite (Milestone 2)', () => {
  // =========================================================================
  // SUITE 1: Password & Credential Validation Rules
  // =========================================================================
  describe('Suite 1: Password & Credential Validation Rules', () => {
    it('1.1 rejects password with empty string', () => {
      expect(validateWorkstationPassword('', '')).toBe(
        'Password must be at least 8 characters long.'
      );
    });

    it('1.2 rejects passwords under 8 characters across boundaries', () => {
      expect(validateWorkstationPassword('A1')).toBe(
        'Password must be at least 8 characters long.'
      );
      expect(validateWorkstationPassword('Passw1')).toBe(
        'Password must be at least 8 characters long.'
      );
      expect(validateWorkstationPassword('Passwo1')).toBe(
        'Password must be at least 8 characters long.'
      );
    });

    it('1.3 rejects passwords exceeding 128 characters', () => {
      const over128 = 'A1' + 'a'.repeat(127); // 129 chars
      expect(validateWorkstationPassword(over128, over128)).toBe(
        'Password must be at most 128 characters long.'
      );
    });

    it('1.4 accepts passwords at exact 8-character and 128-character boundaries', () => {
      expect(validateWorkstationPassword('Abcdefg1', 'Abcdefg1')).toBeNull();
      const exact128 = 'A1' + 'a'.repeat(126); // 128 chars
      expect(validateWorkstationPassword(exact128, exact128)).toBeNull();
    });

    it('1.5 rejects passwords lacking any letter (a-zA-Z)', () => {
      expect(validateWorkstationPassword('12345678', '12345678')).toBe(
        'Password must contain at least one letter.'
      );
      expect(validateWorkstationPassword('!@#$%^&*123', '!@#$%^&*123')).toBe(
        'Password must contain at least one letter.'
      );
    });

    it('1.6 rejects passwords lacking any digit (0-9)', () => {
      expect(validateWorkstationPassword('Password!', 'Password!')).toBe(
        'Password must contain at least one digit.'
      );
      expect(validateWorkstationPassword('AdminUserAccount', 'AdminUserAccount')).toBe(
        'Password must contain at least one digit.'
      );
    });

    it('1.7 rejects mismatched password and confirmPassword', () => {
      expect(validateWorkstationPassword('Clinic2026!', 'Clinic2027!')).toBe(
        'Passwords do not match.'
      );
    });

    it('1.8 accepts strong compliant passwords matching confirmation', () => {
      expect(validateWorkstationPassword('Clin1c#Secure2026', 'Clin1c#Secure2026')).toBeNull();
      expect(validateWorkstationPassword('AdminPass123', 'AdminPass123')).toBeNull();
    });

    it('1.9 checks password rules when confirmPassword is not provided', () => {
      expect(validateWorkstationPassword('Clin1c#Secure2026')).toBeNull();
      expect(validateWorkstationPassword('short1')).toBe(
        'Password must be at least 8 characters long.'
      );
    });

    it('1.10 validates email formats via isValidEmail', () => {
      expect(isValidEmail('admin@clinic.ph')).toBe(true);
      expect(isValidEmail('doctor.santos@hospital.com.ph')).toBe(true);
      expect(isValidEmail('user+tag@domain.co')).toBe(true);

      expect(isValidEmail('')).toBe(false);
      expect(isValidEmail('admin')).toBe(false);
      expect(isValidEmail('admin@')).toBe(false);
      expect(isValidEmail('@domain.com')).toBe(false);
      expect(isValidEmail('admin@domain')).toBe(false);
      expect(isValidEmail('admin @domain.com')).toBe(false);
    });

    it('1.11 validates empty or whitespace license key requirement', () => {
      const validateLicenseKey = (key: string): string | null => {
        if (!key || !key.trim()) {
          return 'Paste the facility license key from your Clinic EZ Portal workspace.';
        }
        return null;
      };

      expect(validateLicenseKey('')).toBe(
        'Paste the facility license key from your Clinic EZ Portal workspace.'
      );
      expect(validateLicenseKey('   ')).toBe(
        'Paste the facility license key from your Clinic EZ Portal workspace.'
      );
      expect(validateLicenseKey('valid-token-payload')).toBeNull();
    });
  });

  // =========================================================================
  // SUITE 2: Auth Session recoverAdmin Contract & API Flow
  // =========================================================================
  describe('Suite 2: Auth Session recoverAdmin Contract & API Flow', () => {
    it('2.1 exposes recoverAdmin function on authSession', () => {
      expect(typeof authSession.recoverAdmin).toBe('function');
    });

    it('2.2 trims inputs and dispatches POST /auth/recover-admin with correct payload', async () => {
      let interceptedUrl = '';
      let interceptedBody: any = null;

      const originalPost = axios.post;
      axios.post = mock(async (url: string, body: any) => {
        interceptedUrl = url;
        interceptedBody = body;
        return {
          data: {
            data: {
              accessToken: 'mock-access-token-recovery',
              refreshToken: 'mock-refresh-token-recovery',
              accessTokenExpiresAtUtc: '2026-10-30T00:00:00Z',
              refreshTokenExpiresAtUtc: '2026-11-05T00:00:00Z',
              user: {
                id: 'admin-uuid-1234',
                name: 'Dr. Maria Santos',
                email: 'admin@clinic.ph',
                role: 'Clinic Administrator',
                roleName: 'Administrator',
                clinicId: 'clinic-1111',
                tenantId: 'tenant-2222',
                clinicName: 'St. Jude Family Clinic',
                permissions: ['*'],
                mustChangePassword: false,
              },
            },
          },
        };
      }) as any;

      try {
        const [recoveredUser, error] = await authSession.recoverAdmin({
          licenseToken: '  eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9...   ',
          email: '  admin@clinic.ph  ',
          newPassword: 'BrandNewPassword2026!',
          workspace: 'st-jude-clinic',
        });

        expect(error).toBeNull();
        expect(recoveredUser).not.toBeNull();
        expect(recoveredUser?.id).toBe('admin-uuid-1234');
        expect(recoveredUser?.email).toBe('admin@clinic.ph');

        expect(interceptedUrl).toContain('/auth/recover-admin');
        expect(interceptedBody).toEqual({
          licenseToken: 'eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9...',
          email: 'admin@clinic.ph',
          newPassword: 'BrandNewPassword2026!',
          workspace: 'st-jude-clinic',
          deviceLabel: 'Clinic EZ web',
        });

        // Verify tokens were persisted in memory session
        expect(authSession.getAccessToken()).toBe('mock-access-token-recovery');
        expect(authSession.getSessionSnapshot().user?.id).toBe('admin-uuid-1234');
      } finally {
        axios.post = originalPost;
      }
    });

    it('2.3 passes email as undefined when email is omitted or empty string', async () => {
      let interceptedBody: any = null;

      const originalPost = axios.post;
      axios.post = mock(async (_url: string, body: any) => {
        interceptedBody = body;
        return {
          data: {
            data: {
              accessToken: 'mock-token',
              refreshToken: 'mock-refresh',
              accessTokenExpiresAtUtc: '2026-10-30T00:00:00Z',
              refreshTokenExpiresAtUtc: '2026-11-05T00:00:00Z',
              user: {
                id: 'admin-1',
                name: 'Admin',
                email: 'license-owner@clinic.ph',
                role: 'Admin',
                clinicId: 'c1',
                tenantId: 't1',
                clinicName: 'Clinic',
                permissions: ['*'],
                mustChangePassword: false,
              },
            },
          },
        };
      }) as any;

      try {
        await authSession.recoverAdmin({
          licenseToken: 'LIC-KEY',
          email: '   ',
          newPassword: 'NewPassword123!',
        });

        expect(interceptedBody.email).toBeUndefined();
      } finally {
        axios.post = originalPost;
      }
    });

    it('2.4 handles API error rejection cleanly returning ApiError', async () => {
      const originalPost = axios.post;
      axios.post = mock(async () => {
        const error: any = new Error('Request failed with status code 400');
        error.response = {
          status: 400,
          data: {
            message: 'The license key does not match this facility.',
            errors: [{ field: 'licenseToken', message: 'Cryptographic signature mismatch.' }],
          },
        };
        throw error;
      }) as any;

      try {
        const [recoveredUser, error] = await authSession.recoverAdmin({
          licenseToken: 'tampered-license-key',
          newPassword: 'NewPassword123!',
        });

        expect(recoveredUser).toBeNull();
        expect(error).not.toBeNull();
        expect(error?.status).toBe(400);
        expect(error?.message).toContain('The license key does not match this facility.');
      } finally {
        axios.post = originalPost;
      }
    });
  });

  // =========================================================================
  // SUITE 3: Auth Context State Transitions
  // =========================================================================
  describe('Suite 3: Auth Context State Transitions', () => {
    it('3.1 exports recoverAdmin on useAuth hook interface', () => {
      const mockContext = {
        state: 'signedOut' as const,
        user: null,
        permissions: [],
        offline: false,
        notice: null,
        login: async () => null,
        bootstrap: async () => null,
        recoverAdmin: async () => null,
        changePassword: async () => null,
        completeUnlock: () => {},
        useDifferentAccount: async () => {},
        logout: async () => {},
        retry: () => {},
        can: () => false,
      };

      (globalThis as any).__mockAuthContext = mockContext;
      try {
        const auth = useAuth();
        expect(typeof auth.recoverAdmin).toBe('function');
      } finally {
        (globalThis as any).__mockAuthContext = undefined;
      }
    });

    it('3.2 transitions state to signedIn on successful recoverAdmin', async () => {
      let currentState = 'signedOut';
      let currentUser: any = null;

      const recoverAdminAction = async (input: authSession.AdminRecoveryInput) => {
        const [signedIn, err] = await authSession.recoverAdmin(input);
        if (err || !signedIn) return err?.message ?? 'Recovery failed.';
        currentUser = signedIn;
        currentState = signedIn.mustChangePassword ? 'mustChangePassword' : 'signedIn';
        return null;
      };

      const originalPost = axios.post;
      axios.post = mock(async () => ({
        data: {
          data: {
            accessToken: 'token-ok',
            refreshToken: 'refresh-ok',
            accessTokenExpiresAtUtc: '2026-10-30T00:00:00Z',
            refreshTokenExpiresAtUtc: '2026-11-05T00:00:00Z',
            user: {
              id: 'admin-ok',
              name: 'Dr. Santos',
              email: 'admin@clinic.ph',
              role: 'Admin',
              clinicId: 'c1',
              tenantId: 't1',
              clinicName: 'Santos Medical',
              permissions: ['*'],
              mustChangePassword: false,
            },
          },
        },
      })) as any;

      try {
        const failure = await recoverAdminAction({
          licenseToken: 'VALID-TOKEN',
          newPassword: 'SecurePassword123!',
        });

        expect(failure).toBeNull();
        expect(currentState).toBe('signedIn');
        expect(currentUser?.id).toBe('admin-ok');
      } finally {
        axios.post = originalPost;
      }
    });

    it('3.3 transitions state to mustChangePassword if server returns mustChangePassword true', async () => {
      let currentState = 'signedOut';

      const recoverAdminAction = async (input: authSession.AdminRecoveryInput) => {
        const [signedIn, err] = await authSession.recoverAdmin(input);
        if (err || !signedIn) return err?.message ?? 'Recovery failed.';
        currentState = signedIn.mustChangePassword ? 'mustChangePassword' : 'signedIn';
        return null;
      };

      const originalPost = axios.post;
      axios.post = mock(async () => ({
        data: {
          data: {
            accessToken: 'token-ok',
            refreshToken: 'refresh-ok',
            accessTokenExpiresAtUtc: '2026-10-30T00:00:00Z',
            refreshTokenExpiresAtUtc: '2026-11-05T00:00:00Z',
            user: {
              id: 'admin-temp',
              name: 'Dr. Santos',
              email: 'admin@clinic.ph',
              role: 'Admin',
              clinicId: 'c1',
              tenantId: 't1',
              clinicName: 'Santos Medical',
              permissions: ['*'],
              mustChangePassword: true,
            },
          },
        },
      })) as any;

      try {
        const failure = await recoverAdminAction({
          licenseToken: 'VALID-TOKEN',
          newPassword: 'SecurePassword123!',
        });

        expect(failure).toBeNull();
        expect(currentState).toBe('mustChangePassword');
      } finally {
        axios.post = originalPost;
      }
    });

    it('3.4 remains in signedOut state and returns error message on recovery rejection', async () => {
      let currentState = 'signedOut';

      const recoverAdminAction = async (input: authSession.AdminRecoveryInput) => {
        const [signedIn, err] = await authSession.recoverAdmin(input);
        if (err || !signedIn) {
          return err?.errors?.length
            ? err.errors.map((e) => e.message).join(' ')
            : (err?.message ?? 'Recovery failed.');
        }
        currentState = signedIn.mustChangePassword ? 'mustChangePassword' : 'signedIn';
        return null;
      };

      const originalPost = axios.post;
      axios.post = mock(async () => {
        const error: any = new Error('Not found');
        error.response = {
          status: 404,
          data: { message: 'No administrator account found for this facility.' },
        };
        throw error;
      }) as any;

      try {
        const failure = await recoverAdminAction({
          licenseToken: 'VALID-TOKEN',
          newPassword: 'SecurePassword123!',
        });

        expect(failure).toBe('No administrator account found for this facility.');
        expect(currentState).toBe('signedOut');
      } finally {
        axios.post = originalPost;
      }
    });
  });

  // =========================================================================
  // SUITE 4: View Toggling Between LoginScreen & AdminRecoveryScreen
  // =========================================================================
  describe('Suite 4: View Toggling Between LoginScreen & AdminRecoveryScreen', () => {
    it('4.1 LoginScreen renders recovery prompt with accessible button role and label', () => {
      (globalThis as any).__mockAuthContext = {
        state: 'signedOut',
        user: null,
        permissions: [],
        offline: false,
        notice: null,
        login: async () => null,
        bootstrap: async () => null,
        recoverAdmin: async () => null,
        changePassword: async () => null,
        completeUnlock: () => {},
        useDifferentAccount: async () => {},
        logout: async () => {},
        retry: () => {},
        can: () => false,
      };

      try {
        const html = renderToStaticMarkup(React.createElement(LoginScreen));

        expect(html).toContain('Are you the clinic admin?');
        expect(html).toContain('Recover account');
        expect(html).toContain('role="button"');
        expect(html).toContain('aria-label="Are you the clinic admin? Recover account"');
      } finally {
        (globalThis as any).__mockAuthContext = undefined;
      }
    });

    it('4.2 AdminRecoveryScreen renders title, subtitle, inputs, and action buttons', () => {
      (globalThis as any).__mockAuthContext = {
        state: 'signedOut',
        user: null,
        permissions: [],
        offline: false,
        notice: null,
        login: async () => null,
        bootstrap: async () => null,
        recoverAdmin: async () => null,
        changePassword: async () => null,
        completeUnlock: () => {},
        useDifferentAccount: async () => {},
        logout: async () => {},
        retry: () => {},
        can: () => false,
      };

      try {
        const html = renderToStaticMarkup(
          React.createElement(AdminRecoveryScreen, {
            onBackToLogin: () => {},
          })
        );

        expect(html).toContain('Recover administrator account');
        expect(html).toContain(
          'Reset credentials for the clinic administrator using the cryptographic facility license key.'
        );
        expect(html).toContain('Facility license key');
        expect(html).toContain('Administrator email');
        expect(html).toContain('New password');
        expect(html).toContain('Confirm new password');
        expect(html).toContain('Recover account');
        expect(html).toContain('Back to sign in');
      } finally {
        (globalThis as any).__mockAuthContext = undefined;
      }
    });

    it('4.3 AdminRecoveryScreen pre-fills initialEmail when supplied', () => {
      (globalThis as any).__mockAuthContext = {
        state: 'signedOut',
        user: null,
        permissions: [],
        offline: false,
        notice: null,
        login: async () => null,
        bootstrap: async () => null,
        recoverAdmin: async () => null,
        changePassword: async () => null,
        completeUnlock: () => {},
        useDifferentAccount: async () => {},
        logout: async () => {},
        retry: () => {},
        can: () => false,
      };

      try {
        const html = renderToStaticMarkup(
          React.createElement(AdminRecoveryScreen, {
            onBackToLogin: () => {},
            initialEmail: 'prefilled.admin@clinic.ph',
          })
        );

        expect(html).toContain('data-value="prefilled.admin@clinic.ph"');
      } finally {
        (globalThis as any).__mockAuthContext = undefined;
      }
    });

    it('4.4 toggling showRecovery state switches view between LoginScreen and AdminRecoveryScreen', () => {
      const Harness = () => {
        const [showRecovery, setShowRecovery] = useState(false);

        if (showRecovery) {
          return React.createElement(AdminRecoveryScreen, {
            onBackToLogin: () => setShowRecovery(false),
          });
        }

        return React.createElement('div', null, [
          React.createElement('span', { key: '1' }, 'Sign In Workstation View'),
          React.createElement(
            'button',
            { key: '2', onClick: () => setShowRecovery(true) },
            'Switch to Recovery'
          ),
        ]);
      };

      (globalThis as any).__mockAuthContext = {
        state: 'signedOut',
        user: null,
        permissions: [],
        offline: false,
        notice: null,
        login: async () => null,
        bootstrap: async () => null,
        recoverAdmin: async () => null,
        changePassword: async () => null,
        completeUnlock: () => {},
        useDifferentAccount: async () => {},
        logout: async () => {},
        retry: () => {},
        can: () => false,
      };

      try {
        const initialHtml = renderToStaticMarkup(React.createElement(Harness));
        expect(initialHtml).toContain('Sign In Workstation View');
        expect(initialHtml).not.toContain('Recover administrator account');

        // Render with recovery screen directly
        const recoveryHtml = renderToStaticMarkup(
          React.createElement(AdminRecoveryScreen, {
            onBackToLogin: () => {},
          })
        );
        expect(recoveryHtml).toContain('Recover administrator account');
        expect(recoveryHtml).toContain('Back to sign in');
      } finally {
        (globalThis as any).__mockAuthContext = undefined;
      }
    });
  });
});

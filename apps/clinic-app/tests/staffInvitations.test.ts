// token-guard:ignore-file
import { describe, it, expect, mock } from 'bun:test';

(globalThis as any).__DEV__ = true;

const createMockComponent = (name: string) => {
  const comp = (props: any) => props.children || null;
  comp.displayName = name;
  return comp;
};

// Mock react-native before any module imports
mock.module('react-native', () => ({
  Linking: {
    openURL: () => Promise.resolve(),
    canOpenURL: () => Promise.resolve(true),
    getInitialURL: () => Promise.resolve(null),
    addEventListener: () => ({ remove: () => {} }),
  },
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
  Svg: 'Svg',
  Path: 'Path',
  Circle: 'Circle',
  Rect: 'Rect',
  Line: 'Line',
  default: 'Svg',
  Polyline: 'Polyline',
  Polygon: 'Polygon',
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

const { extractInviteToken } = await import('../utils/inviteUrl');
const { resolveStaffBadge } = await import('../utils/staffStatus');
const { validateWorkstationPassword } = await import('../utils/passwordValidation');
const {
  buildStaffCreationPayload,
  validateStaffEmailNotInClinic,
  DUPLICATE_CLINIC_STAFF_EMAIL_MESSAGE,
} = await import('../utils/staffManagement');
const { clinicService } = await import('../services/clinicService');
const authSession = await import('../services/authSession');

type StaffMember = import('../services/clinicService').StaffMember;

describe('Staff Invitations & Facility Auth Suite', () => {
  describe('extractInviteToken', () => {
    it('extracts invitation token from standard relative path', () => {
      expect(extractInviteToken('/invitations/inv_tok_1234567890abcdef')).toBe('inv_tok_1234567890abcdef');
    });

    it('extracts token with trailing slash', () => {
      expect(extractInviteToken('/invitations/inv_token_trailing/')).toBe('inv_token_trailing');
    });

    it('extracts token from full HTTPS URL', () => {
      expect(extractInviteToken('https://clinic.example.com/invitations/secure_token_999')).toBe('secure_token_999');
    });

    it('extracts token from deep link URI scheme', () => {
      expect(extractInviteToken('clinicez://invitations/deep_link_token_abc')).toBe('deep_link_token_abc');
    });

    it('extracts token with query parameters attached', () => {
      expect(extractInviteToken('https://clinic.local:8080/invitations/param_token_xyz?channel=email&ref=admin')).toBe('param_token_xyz');
    });

    it('returns null for non-invitation paths', () => {
      expect(extractInviteToken('/dashboard')).toBeNull();
      expect(extractInviteToken('/settings/staff')).toBeNull();
      expect(extractInviteToken('/auth/login')).toBeNull();
      expect(extractInviteToken('/patients/invitations')).toBeNull();
      expect(extractInviteToken('/invitations/')).toBeNull();
      expect(extractInviteToken('/invitations')).toBeNull();
      expect(extractInviteToken('')).toBeNull();
      expect(extractInviteToken(null)).toBeNull();
      expect(extractInviteToken(undefined)).toBeNull();
    });
  });

  describe('Dynamic Status & Badge Resolution', () => {

    it('resolves active invitation with future expiration to Invited badge', () => {
      const future = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
      const badge = resolveStaffBadge({
        status: 'Invited',
        isActive: false,
        invitationExpiresAt: future,
        isExpired: false,
      });
      expect(badge.label).toBe('Invited');
      expect(badge.variant).toBe('purple');
      expect(badge.icon).toBe('mail');
    });

    it('resolves expired invitation with past expiration dynamically to Expired badge', () => {
      const past = new Date(Date.now() - 1000).toISOString();
      const badge = resolveStaffBadge({
        status: 'Invited',
        isActive: false,
        invitationExpiresAt: past,
      });
      expect(badge.label).toBe('Expired');
      expect(badge.variant).toBe('warning');
      expect(badge.icon).toBe('alertCircle');
    });

    it('resolves expired invitation when isExpired flag is true', () => {
      const badge = resolveStaffBadge({
        status: 'Invited',
        isActive: false,
        isExpired: true,
      });
      expect(badge.label).toBe('Expired');
      expect(badge.variant).toBe('warning');
      expect(badge.icon).toBe('alertCircle');
    });

    it('resolves suspended account to Suspended emergency badge', () => {
      const badge = resolveStaffBadge({
        status: 'Suspended',
        isActive: false,
      });
      expect(badge.label).toBe('Suspended');
      expect(badge.variant).toBe('emergency');
      expect(badge.icon).toBe('alertTriangle');
    });

    it('resolves inactive account to Suspended emergency badge', () => {
      const badge = resolveStaffBadge({
        isActive: false,
      });
      expect(badge.label).toBe('Suspended');
      expect(badge.variant).toBe('emergency');
      expect(badge.icon).toBe('alertTriangle');
    });

    it('resolves revoked invitation to Revoked emergency badge', () => {
      const badge = resolveStaffBadge({
        status: 'Revoked',
        isActive: false,
      });
      expect(badge.label).toBe('Revoked');
      expect(badge.variant).toBe('emergency');
      expect(badge.icon).toBe('close');
    });

    it('resolves active staff without pending reset to Active success badge', () => {
      const badge = resolveStaffBadge({
        status: 'Active',
        isActive: true,
        mustChangePassword: false,
      });
      expect(badge.label).toBe('Active');
      expect(badge.variant).toBe('success');
      expect(badge.icon).toBe('check');
    });

    it('resolves active staff with mustChangePassword to Password Reset Pending warning badge', () => {
      const badge = resolveStaffBadge({
        status: 'Active',
        isActive: true,
        mustChangePassword: true,
      });
      expect(badge.label).toBe('Password Reset Pending');
      expect(badge.variant).toBe('warning');
      expect(badge.icon).toBe('lock');
    });

    it('resolves legacy staff member with credentials to Login Active', () => {
      const badge = resolveStaffBadge({
        isActive: true,
        hasCredentials: true,
        mustChangePassword: false,
      });
      expect(badge.label).toBe('Login Active');
      expect(badge.variant).toBe('success');
      expect(badge.icon).toBe('check');
    });

    it('resolves credentialed staff member with status Invited to Login Active (healing migration anomaly)', () => {
      const badge = resolveStaffBadge({
        status: 'Invited',
        isActive: true,
        hasCredentials: true,
        mustChangePassword: false,
      });
      expect(badge.label).toBe('Login Active');
      expect(badge.variant).toBe('success');
      expect(badge.icon).toBe('check');
    });

    it('resolves staff without login credentials to No Login neutral badge', () => {
      const badge = resolveStaffBadge({
        isActive: true,
        hasCredentials: false,
      });
      expect(badge.label).toBe('No Login');
      expect(badge.variant).toBe('neutral');
      expect(badge.icon).toBeUndefined();
    });

    it('resolves default empty staff member to No Login neutral badge', () => {
      const badge = resolveStaffBadge({});
      expect(badge.label).toBe('No Login');
      expect(badge.variant).toBe('neutral');
      expect(badge.icon).toBeUndefined();
    });
  });

  describe('Add Staff Delivery Mode Options', () => {
    it('configures email delivery mode with sendInviteEmail true and no password', () => {
      const payload = buildStaffCreationPayload('email', 'nurse@clinic.ph');
      expect(payload.sendInviteEmail).toBe(true);
      expect(payload.initialPassword).toBeUndefined();
      expect(payload.email).toBe('nurse@clinic.ph');
    });

    it('throws error when email delivery mode is missing email address', () => {
      expect(() => buildStaffCreationPayload('email', '')).toThrow(
        'A valid email address is required to send an invitation email.'
      );
    });

    it('configures link delivery mode with sendInviteEmail false and no password', () => {
      const payload = buildStaffCreationPayload('link', 'doctor@clinic.ph');
      expect(payload.sendInviteEmail).toBe(false);
      expect(payload.initialPassword).toBeUndefined();
      expect(payload.email).toBe('doctor@clinic.ph');
    });

    it('allows optional email for link delivery mode', () => {
      const payload = buildStaffCreationPayload('link', '');
      expect(payload.sendInviteEmail).toBe(false);
      expect(payload.initialPassword).toBeUndefined();
      expect(payload.email).toBeUndefined();
    });

    it('configures direct password mode with initialPassword and sendInviteEmail false', () => {
      const payload = buildStaffCreationPayload('password', 'admin@clinic.ph', 'SuperSecret#123');
      expect(payload.sendInviteEmail).toBe(false);
      expect(payload.initialPassword).toBe('SuperSecret#123');
      expect(payload.email).toBe('admin@clinic.ph');
    });

    it('rejects direct password mode with password under 8 characters', () => {
      expect(() => buildStaffCreationPayload('password', 'admin@clinic.ph', 'short')).toThrow(
        'Temporary password must be at least 8 characters.'
      );
    });

    it('rejects direct password mode with missing email address', () => {
      expect(() => buildStaffCreationPayload('password', '', 'SuperSecret#123')).toThrow(
        'A valid email address is required when provisioning login credentials.'
      );
    });

    it('configures no login mode without email or password requirements', () => {
      const payload = buildStaffCreationPayload('none', '');
      expect(payload.sendInviteEmail).toBe(false);
      expect(payload.initialPassword).toBeUndefined();
      expect(payload.email).toBeUndefined();
    });
  });

  describe('Invitation Acceptance Validation Rules', () => {
    it('validates compliant strong password matching confirmation', () => {
      expect(validateWorkstationPassword('Clin1c#Secure2026', 'Clin1c#Secure2026')).toBeNull();
    });

    it('validates compliant password without confirmation parameter', () => {
      expect(validateWorkstationPassword('Clin1c#Secure2026')).toBeNull();
    });

    it('fails when password length is under 8 characters', () => {
      expect(validateWorkstationPassword('Ab1!', 'Ab1!')).toBe(
        'Password must be at least 8 characters long.'
      );
    });

    it('fails when password is empty', () => {
      expect(validateWorkstationPassword('', '')).toBe(
        'Password must be at least 8 characters long.'
      );
    });

    it('fails when password length exceeds 128 characters', () => {
      const over128 = 'A1' + 'a'.repeat(128);
      expect(validateWorkstationPassword(over128, over128)).toBe(
        'Password must be at most 128 characters long.'
      );
    });

    it('fails when password lacks any letter', () => {
      expect(validateWorkstationPassword('12345678', '12345678')).toBe(
        'Password must contain at least one letter.'
      );
    });

    it('fails when password lacks any digit', () => {
      expect(validateWorkstationPassword('AllLettersOnly', 'AllLettersOnly')).toBe(
        'Password must contain at least one digit.'
      );
    });

    it('fails when password and confirm password do not match', () => {
      expect(validateWorkstationPassword('Clin1c#Secure2026', 'Clin1c#Different2026')).toBe(
        'Passwords do not match.'
      );
    });
  });

  describe('Clinic Service Staff Invitation Endpoint Signatures', () => {
    it('exposes resendStaffInvitation method on clinicService', () => {
      expect(typeof clinicService.resendStaffInvitation).toBe('function');
    });

    it('exposes revokeStaffInvitation method on clinicService', () => {
      expect(typeof clinicService.revokeStaffInvitation).toBe('function');
    });

    it('exposes suspendStaffMember method on clinicService', () => {
      expect(typeof clinicService.suspendStaffMember).toBe('function');
    });

    it('exposes reactivateStaff method on clinicService', () => {
      expect(typeof clinicService.reactivateStaff).toBe('function');
    });
  });

  describe('Auth Session Invitation Methods', () => {
    it('exposes getInvitationDetails function in authSession', () => {
      expect(typeof authSession.getInvitationDetails).toBe('function');
    });

    it('exposes acceptInvitation function in authSession', () => {
      expect(typeof authSession.acceptInvitation).toBe('function');
    });
  });

  describe('Duplicate Clinic Staff Email Validation (Issue #113)', () => {
    const existingRoster: Array<{ id: string; email?: string | null }> = [
      { id: 'staff-1', email: 'dr.santos@clinicez.ph' },
      { id: 'staff-2', email: 'Pending.Invite@ClinicEz.ph' },
      { id: 'staff-3', email: null },
    ];

    it('returns null when email is undefined, null, or blank', () => {
      expect(validateStaffEmailNotInClinic(undefined, existingRoster)).toBeNull();
      expect(validateStaffEmailNotInClinic(null, existingRoster)).toBeNull();
      expect(validateStaffEmailNotInClinic('   ', existingRoster)).toBeNull();
    });

    it('returns null when email does not belong to any existing staff member in the clinic', () => {
      expect(validateStaffEmailNotInClinic('new.nurse@clinicez.ph', existingRoster)).toBeNull();
    });

    it('rejects exact and case-insensitive/whitespace-padded duplicate emails with canonical message', () => {
      expect(validateStaffEmailNotInClinic('dr.santos@clinicez.ph', existingRoster)).toBe(
        'This email address is already associated with an existing staff member in this clinic.'
      );
      expect(validateStaffEmailNotInClinic('  DR.SANTOS@CLINICEZ.PH  ', existingRoster)).toBe(
        DUPLICATE_CLINIC_STAFF_EMAIL_MESSAGE
      );
      expect(validateStaffEmailNotInClinic('pending.invite@clinicez.ph', existingRoster)).toBe(
        DUPLICATE_CLINIC_STAFF_EMAIL_MESSAGE
      );
    });

    it('allows keeping own email when excludeStaffId matches the edited staff record, while rejecting colleagues', () => {
      expect(validateStaffEmailNotInClinic('DR.SANTOS@clinicez.ph', existingRoster, 'staff-1')).toBeNull();
      expect(validateStaffEmailNotInClinic('pending.invite@clinicez.ph', existingRoster, 'staff-1')).toBe(
        DUPLICATE_CLINIC_STAFF_EMAIL_MESSAGE
      );
    });

    it('verifies StaffManagementTab integrates validateStaffEmailNotInClinic for create, edit, and inline blur', async () => {
      const fs = await import('node:fs');
      const path = await import('node:path');
      const staffTabPath = path.resolve(__dirname, '../components/settings/StaffManagementTab.tsx');
      const source = fs.readFileSync(staffTabPath, 'utf8');

      expect(source).toContain('validateStaffEmailNotInClinic(deliveryPayload.email, staff)');
      expect(source).toContain('validateStaffEmailNotInClinic(email, staff, editingStaff.id)');
      expect(source).toContain('onBlur={() => setEmailFieldError(validateStaffEmailNotInClinic(');
      expect(source).toContain('error={emailFieldError || undefined}');
    });
  });
});

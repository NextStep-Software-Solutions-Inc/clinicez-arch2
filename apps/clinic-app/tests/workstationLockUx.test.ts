import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

(globalThis as any).__DEV__ = true;

const pressHandlersByTestId = new Map<string, () => void>();

const createMockComponent = (name: string) => {
  const Comp = ({
    children,
    accessibilityLabel,
    accessibilityRole,
    placeholder,
    value,
    onPress,
    title,
    style,
    testID,
    visible,
  }: any) => {
    if (testID && typeof onPress === 'function') {
      pressHandlersByTestId.set(testID, onPress);
    }
    if (name === 'Modal' && visible === false) return null;
    const resolvedStyle =
      typeof style === 'function' ? style({ pressed: false, hovered: false }) : style;
    return React.createElement(
      'div',
      {
        'data-component': name,
        ...(testID ? { 'data-testid': testID } : {}),
        ...(accessibilityLabel ? { 'aria-label': accessibilityLabel } : {}),
        ...(accessibilityRole ? { role: accessibilityRole } : {}),
        ...(placeholder ? { 'data-placeholder': placeholder } : {}),
        ...(value !== undefined ? { 'data-value': String(value) } : {}),
        ...(title ? { 'data-title': title } : {}),
        ...(resolvedStyle ? { 'data-style': JSON.stringify(resolvedStyle) } : {}),
      },
      title,
      children,
    );
  };
  Comp.displayName = name;
  return Comp;
};

mock.module('react-native', () => ({
  StyleSheet: { create: (s: any) => s, flatten: (s: any) => s, absoluteFill: {} },
  View: createMockComponent('View'),
  Pressable: createMockComponent('Pressable'),
  ScrollView: createMockComponent('ScrollView'),
  TextInput: createMockComponent('TextInput'),
  Text: createMockComponent('Text'),
  ActivityIndicator: createMockComponent('ActivityIndicator'),
  Modal: createMockComponent('Modal'),
  KeyboardAvoidingView: createMockComponent('KeyboardAvoidingView'),
  Image: createMockComponent('Image'),
  Dimensions: {
    get: () => ({ width: 1280, height: 800 }),
    addEventListener: () => ({ remove: () => {} }),
  },
  useWindowDimensions: () => ({ width: 1280, height: 800 }),
  Keyboard: { dismiss: () => {}, addListener: () => ({ remove: () => {} }) },
  AppState: { currentState: 'active', addEventListener: () => ({ remove: () => {} }) },
  Platform: { OS: 'web', select: (obj: any) => obj.web ?? obj.default },
  Animated: {
    Value: class {
      constructor(public val: any) {}
      setValue(val: any) { this.val = val; }
      interpolate() { return this; }
      toJSON() { return this.val; }
    },
    timing: () => ({ start: (cb?: any) => cb && cb({ finished: true }) }),
    loop: () => ({ start: (cb?: any) => cb && cb() }),
    View: createMockComponent('Animated.View'),
    Text: createMockComponent('Animated.Text'),
  },
  Alert: { alert: () => {} },
}));

mock.module('../constants/fonts', () => ({
  applyFontFamily: (s: any) => s,
  fontAssets: {},
}));

mock.module('react-native-svg', () => ({
  __esModule: true,
  default: createMockComponent('Svg'),
  Svg: createMockComponent('Svg'),
  Path: createMockComponent('Path'),
  Rect: createMockComponent('Rect'),
  Circle: createMockComponent('Circle'),
  Text: ({ children }: any) => children,
  Polyline: 'Polyline',
  Polygon: 'Polygon',
}));

mock.module('../components/ui/Icon', () => ({
  __esModule: true,
  default: createMockComponent('Icon'),
  IconSlot: createMockComponent('IconSlot'),
  resolveIconName: (name: string) => name,
  ICONS: {},
}));

mock.module('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: () => {}, setParams: () => {} }),
  useRoute: () => ({ params: {} }),
}));

mock.module('../components/FacilityActivationGate', () => ({
  useFacilityLicense: () => ({
    license: { clinicName: 'Nextstep OPD', primaryLogoUrl: null, primaryColorHex: null },
    switchWorkspace: null,
  }),
}));

const updateSettingsCalls: any[] = [];
mock.module('../services/apiClient', () => ({
  clinicApiClient: {
    get: async () => [null, null],
    post: async () => [null, null],
    put: async (_url: string, body: any) => {
      updateSettingsCalls.push(body);
      return [{ ...body, id: 's1', clinicId: 'c1', tenantId: 't1', clinicName: 'Nextstep OPD' }, null];
    },
    patch: async () => [null, null],
    delete: async () => [null, null],
    sendKeepaliveJson: () => true,
  },
  clinicApiUrl: (p: string) => p,
}));

mock.module('../context/StaffContext', () => ({
  useStaff: () => ({ staff: [], current: null, currentName: '', loading: false, error: null, reload: async () => {} }),
  formatStaffName: (s?: any) => (s ? `${s.firstName ?? ''} ${s.lastName ?? ''}`.trim() : ''),
}));

const { default: IdleWarningModal } = await import('../components/auth/IdleWarningModal');
const { default: WorkstationLockScreen } = await import('../components/auth/WorkstationLockScreen');
const { default: WorkstationSessionPolicyCard } = await import('../components/settings/cards/WorkstationSessionPolicyCard');
const { default: ProfileSecurityTab } = await import('../components/profile/ProfileSecurityTab');
const { default: UserMenu } = await import('../components/layout/UserMenu');

describe('Workstation Lock, Idle Warning & PIN UX', () => {
  beforeEach(() => {
    pressHandlersByTestId.clear();
    updateSettingsCalls.length = 0;
    delete (globalThis as any).__mockAuthContext;
  });

  afterEach(() => {
    delete (globalThis as any).__mockAuthContext;
  });

  test('IdleWarningModal renders countdown, Stay signed in, and Lock now actions when visible', () => {
    let stayClicked = 0;
    let lockClicked = 0;

    const hiddenMarkup = renderToStaticMarkup(
      React.createElement(IdleWarningModal, {
        visible: false,
        secondsRemaining: null,
        onStaySignedIn: () => {},
        onLockNow: () => {},
      }),
    );
    expect(hiddenMarkup).toBe('');

    const visibleMarkup = renderToStaticMarkup(
      React.createElement(IdleWarningModal, {
        visible: true,
        secondsRemaining: 45,
        onStaySignedIn: () => { stayClicked += 1; },
        onLockNow: () => { lockClicked += 1; },
      }),
    );
    expect(visibleMarkup).toContain('Still there?');
    expect(visibleMarkup).toContain('Locking workstation in 45 seconds');
    expect(visibleMarkup).toContain('Stay signed in');
    expect(visibleMarkup).toContain('Lock now');

    pressHandlersByTestId.get('idle-warning-stay-signed-in')?.();
    pressHandlersByTestId.get('idle-warning-lock-now')?.();
    expect(stayClicked).toBe(1);
    expect(lockClicked).toBe(1);
  });

  test('WorkstationLockScreen renders 6-digit PIN input when user has PIN and clinic allows it', () => {
    let switched = 0;
    (globalThis as any).__mockAuthContext = {
      lockedSession: {
        staffId: 'staff-1',
        name: 'Dr. Maria Santos',
        email: 'maria@nextstep.example',
        role: 'Doctor',
        roleName: 'Attending Physician',
        clinicName: 'Nextstep OPD',
        hasQuickUnlockPin: true,
        allowStaffPinUnlock: true,
        lockedAtUtc: new Date().toISOString(),
        lockExpiresAtUtc: new Date(Date.now() + 8 * 3_600_000).toISOString(),
      },
      unlockWithPin: async () => null,
      unlockWithPassword: async () => null,
      switchStaffAccount: async () => { switched += 1; },
    };

    const markup = renderToStaticMarkup(React.createElement(WorkstationLockScreen));
    expect(markup).toContain('Workstation locked');
    expect(markup).toContain('Dr. Maria Santos');
    expect(markup).toContain('maria@nextstep.example');
    expect(markup).toContain('6-digit Quick-Unlock PIN');
    expect(markup).toContain('Use password instead');
    expect(markup).toContain('Switch staff member');

    pressHandlersByTestId.get('workstation-lock-switch-staff')?.();
    expect(switched).toBe(1);
  });

  test('WorkstationLockScreen falls back to password-only unlock when no PIN is configured', () => {
    (globalThis as any).__mockAuthContext = {
      lockedSession: {
        staffId: 'staff-2',
        name: 'Nurse Dela Cruz',
        email: 'nurse@nextstep.example',
        role: 'Nurse',
        roleName: null,
        clinicName: 'Nextstep OPD',
        hasQuickUnlockPin: false,
        allowStaffPinUnlock: true,
        lockedAtUtc: new Date().toISOString(),
        lockExpiresAtUtc: new Date(Date.now() + 8 * 3_600_000).toISOString(),
      },
      unlockWithPin: async () => null,
      unlockWithPassword: async () => null,
      switchStaffAccount: async () => {},
    };

    const markup = renderToStaticMarkup(React.createElement(WorkstationLockScreen));
    expect(markup).toContain('Nurse Dela Cruz');
    expect(markup).toContain('Unlock workstation');
    expect(markup).not.toContain('workstation-lock-pin-input');
    expect(markup).not.toContain('Unlock with PIN');
    expect(markup).toContain('Set a 6-digit Quick-Unlock PIN in My Profile');
  });

  test('UserMenu hides Lock screen when no personal PIN/biometrics is configured, and shows 1-click Lock screen when PIN is enabled online', () => {
    let lockCalled = 0;
    (globalThis as any).__mockAuthContext = {
      state: 'signedIn',
      offline: false,
      user: {
        id: 'staff-1',
        name: 'Dr. Maria Santos',
        email: 'maria@nextstep.example',
        role: 'Doctor',
        permissions: ['*'],
        hasQuickUnlockPin: false,
      },
      lockWorkstation: async () => { lockCalled += 1; },
      can: () => true,
    };

    const noPinMarkup = renderToStaticMarkup(React.createElement(UserMenu, { variant: 'card' }));
    expect(noPinMarkup).not.toContain('Lock screen');
    expect(noPinMarkup).not.toContain('user-menu-lock-button');
    expect(pressHandlersByTestId.has('user-menu-lock-button')).toBe(false);

    (globalThis as any).__mockAuthContext.user.hasQuickUnlockPin = true;
    (globalThis as any).__mockAuthContext.user.sessionPolicy = {
      idleLockMinutes: 15,
      maxLockedSessionHours: 8,
      allowStaffPinUnlock: false,
    };
    const adminDisabledMarkup = renderToStaticMarkup(React.createElement(UserMenu, { variant: 'card' }));
    expect(adminDisabledMarkup).not.toContain('Lock screen');
    expect(adminDisabledMarkup).not.toContain('user-menu-lock-button');

    (globalThis as any).__mockAuthContext.user.sessionPolicy.allowStaffPinUnlock = true;
    const onlineMarkup = renderToStaticMarkup(React.createElement(UserMenu, { variant: 'card' }));
    expect(onlineMarkup).toContain('Lock screen');
    expect(onlineMarkup).toContain('user-menu-lock-button');
    pressHandlersByTestId.get('user-menu-lock-button')?.();
    expect(lockCalled).toBe(1);

    (globalThis as any).__mockAuthContext.offline = true;
    const offlineMarkup = renderToStaticMarkup(React.createElement(UserMenu, { variant: 'card' }));
    expect(offlineMarkup).not.toContain('Lock screen');
  });

  test('ProfileSecurityTab renders Quick-Unlock PIN card with active/not-set/admin-disabled states', () => {
    const baseProps = {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
      savingPassword: false,
      passwordError: null,
      offline: false,
      serverLabel: 'Clinic Server',
      serverUrl: 'https://clinic.example',
      facilityName: 'Nextstep OPD',
      planTier: 'Pro',
      onChangeCurrentPassword: () => {},
      onChangeNewPassword: () => {},
      onChangeConfirmPassword: () => {},
      onUpdatePassword: () => {},
      onSetQuickUnlockPin: async () => null,
      onRemoveQuickUnlockPin: async () => null,
    };

    const notSetMarkup = renderToStaticMarkup(
      React.createElement(ProfileSecurityTab, { ...baseProps, hasQuickUnlockPin: false, allowStaffPinUnlock: true }),
    );
    expect(notSetMarkup).toContain('Quick-Unlock PIN');
    expect(notSetMarkup).toContain('Set 6-digit PIN');

    const activeMarkup = renderToStaticMarkup(
      React.createElement(ProfileSecurityTab, { ...baseProps, hasQuickUnlockPin: true, allowStaffPinUnlock: true }),
    );
    expect(activeMarkup).toContain('Active');
    expect(activeMarkup).toContain('Change 6-digit PIN');
    expect(activeMarkup).toContain('Remove PIN');

    const disabledMarkup = renderToStaticMarkup(
      React.createElement(ProfileSecurityTab, { ...baseProps, hasQuickUnlockPin: false, allowStaffPinUnlock: false }),
    );
    expect(disabledMarkup).toContain('Disabled by admin');
    expect(disabledMarkup).toContain('disabled in your clinic security settings');
  });

  test('WorkstationSessionPolicyCard renders clinic policy values cleanly', () => {
    (globalThis as any).__mockAuthContext = {
      updateSessionPolicy: () => {},
    };

    const markup = renderToStaticMarkup(
      React.createElement(WorkstationSessionPolicyCard, {
        settings: {
          id: 's1',
          tenantId: 't1',
          clinicId: 'c1',
          clinicName: 'Nextstep OPD',
          operatingHours: '',
          defaultSlotDurationMinutes: 30,
          queuePrefix: 'Q',
          invoicePrefix: 'INV',
          defaultConsultationFee: 400,
          vatRate: 0.12,
          idleLockMinutes: 15,
          maxLockedSessionHours: 8,
          allowStaffPinUnlock: true,
        },
      }),
    );

    expect(markup).toContain('Workstation Inactivity Lock &amp; Quick-Unlock');
    expect(markup).toContain('Locks at 15m');
    expect(markup).toContain('15 minutes');
    expect(markup).toContain('8 hours');
    expect(markup).toContain('Allow 6-digit staff Quick-Unlock PIN');
  });
});

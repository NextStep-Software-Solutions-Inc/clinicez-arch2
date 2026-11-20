// token-guard:ignore-file
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { StaffMember } from '../services/clinicService';

(globalThis as any).__DEV__ = true;

const createMockComponent = (name: string) => {
  const Comp = ({
    children,
    accessibilityLabel,
    accessibilityRole,
    accessibilityState,
    placeholder,
    value,
    onPress,
    title,
    disabled,
    testID,
  }: any) =>
    React.createElement(
      'div',
      {
        'data-component': name,
        ...(testID ? { 'data-testid': testID } : {}),
        ...(accessibilityLabel ? { 'aria-label': accessibilityLabel } : {}),
        ...(accessibilityRole ? { role: accessibilityRole } : {}),
        ...(accessibilityState ? { 'data-accessibility-state': JSON.stringify(accessibilityState) } : {}),
        ...(placeholder ? { 'data-placeholder': placeholder } : {}),
        ...(value !== undefined ? { 'data-value': String(value) } : {}),
        ...(title ? { 'data-title': title } : {}),
        ...(disabled !== undefined ? { 'data-disabled': String(disabled) } : {}),
        onClick: onPress,
      },
      title,
      children
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
  Modal: ({ visible, children, title, subtitle, footer }: any) =>
    visible
      ? React.createElement(
          'div',
          { 'data-component': 'Modal' },
          title ? React.createElement('div', null, title) : null,
          subtitle ? React.createElement('div', null, subtitle) : null,
          children,
          footer
        )
      : null,
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
  AppState: { addEventListener: () => ({ remove: () => {} }) },
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
  Polygon: 'Polygon',
}));

mock.module('../constants/fonts', () => ({
  applyFontFamily: (s: any) => s,
  fontAssets: {},
}));

mock.module('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: () => {}, goBack: () => {}, setParams: () => {} }),
  useRoute: () => ({ params: {} }),
}));

const {
  findDuplicateStaffByPrc,
  getDuplicateStaffPrcWarning,
  normalizeStaffTitle,
  getStaffRosterStatusBucket,
  filterStaffRoster,
} = await import('../utils/staffManagement');
const { getAvailableStaffActions } = await import('../utils/staffStatus');
const { getPractitionerDirectoryActions } = await import('../utils/directoryVerification');
const {
  default: StaffManagementTab,
  buildStaffOverflowMenuItems,
} = await import('../components/settings/StaffManagementTab');
const { Chip } = await import('../components/settings/common');

describe('Staff Management UX & Helper Enhancements', () => {
  beforeEach(() => {
    (globalThis as any).__mockAuthContext = {
      state: 'signedIn',
      user: {
        id: 'admin-1',
        name: 'Wave Ambray',
        email: 'wave@clinic.ph',
        role: 'Admin',
        clinicId: 'clinic-1',
        tenantId: 'tenant-1',
        permissions: ['*'],
      },
      permissions: ['*'],
      offline: false,
      can: () => true,
    };
    (globalThis as any).__mockStaffContext = {
      staff: [],
      current: null,
      currentName: 'Wave Ambray',
      loading: false,
      error: null,
      reload: async () => {},
    };
    (globalThis as any).__mockClinicContext = {
      facilityName: 'St. Jude Clinic',
      rooms: [],
      refreshRooms: async () => {},
    };
  });

  afterEach(() => {
    delete (globalThis as any).__mockAuthContext;
    delete (globalThis as any).__mockStaffContext;
    delete (globalThis as any).__mockClinicContext;
  });

  const sampleStaff: StaffMember[] = [
    {
      id: 'doc-invited',
      tenantId: 't1',
      clinicId: 'c1',
      firstName: 'Andre',
      lastName: 'Amamio',
      title: 'Dr.',
      role: 'Doctor',
      roleName: 'Attending Physician / Doctor',
      email: 'andre@ustp.edu.ph',
      prcLicenseNumber: '12345',
      isActive: true,
      status: 'Invited',
      createdAt: '2026-10-01T00:00:00Z',
      publicVerificationStatus: 'Unverified',
    },
    {
      id: 'admin-active',
      tenantId: 't1',
      clinicId: 'c1',
      firstName: 'Wave',
      lastName: 'Ambray',
      role: 'Admin',
      roleName: 'Clinic Administrator',
      email: 'wave@nextstep-software.com',
      isActive: true,
      status: 'Active',
      createdAt: '2026-10-01T00:00:00Z',
    },
    {
      id: 'nurse-active',
      tenantId: 't1',
      clinicId: 'c1',
      firstName: 'Joanne Jane',
      lastName: 'Awiten',
      title: 'RN',
      role: 'Nurse',
      roleName: 'Triage Nurse',
      email: 'joannejane@ustp.edu.ph',
      isActive: true,
      status: 'Active',
      createdAt: '2026-10-01T00:00:00Z',
      isDirectoryOptIn: false,
      publicVerificationStatus: 'Unverified',
    },
    {
      id: 'doc-suspended',
      tenantId: 't1',
      clinicId: 'c1',
      firstName: 'Carlo',
      lastName: 'Reyes',
      title: 'Dr.',
      role: 'Doctor',
      roleName: 'Consulting Specialist',
      email: 'carlo@ustp.edu.ph',
      prcLicenseNumber: '0098765',
      isActive: false,
      status: 'Suspended',
      createdAt: '2026-10-01T00:00:00Z',
    },
  ];

  test('1. Duplicate PRC detection normalizes prefixes and excludes self while editing', () => {
    expect(findDuplicateStaffByPrc('PRC-12345', sampleStaff)?.id).toBe('doc-invited');
    expect(findDuplicateStaffByPrc('0012345', sampleStaff)?.id).toBe('doc-invited');
    expect(findDuplicateStaffByPrc('98765', sampleStaff)?.id).toBe('doc-suspended');
    expect(findDuplicateStaffByPrc('12345', sampleStaff, 'doc-invited')).toBeNull();
    expect(findDuplicateStaffByPrc('   ', sampleStaff)).toBeNull();

    const warning = getDuplicateStaffPrcWarning('PRC-0012345', sampleStaff);
    expect(warning).toContain('Dr. Andre Amamio');
    expect(getDuplicateStaffPrcWarning('PRC-0012345', sampleStaff, 'doc-invited')).toBeNull();
    expect(getDuplicateStaffPrcWarning('5554433', sampleStaff)).toBeNull();
  });

  test('2. normalizeStaffTitle standardizes common clinical prefixes without altering custom titles', () => {
    expect(normalizeStaffTitle('DR')).toBe('Dr.');
    expect(normalizeStaffTitle('dr.')).toBe('Dr.');
    expect(normalizeStaffTitle('  dra ')).toBe('Dra.');
    expect(normalizeStaffTitle('rn')).toBe('RN');
    expect(normalizeStaffTitle('md.')).toBe('MD');
    expect(normalizeStaffTitle('dmd')).toBe('DMD');
    expect(normalizeStaffTitle('rph')).toBe('RPh');
    expect(normalizeStaffTitle('  Prof. Emeritus  ')).toBe('Prof. Emeritus');
    expect(normalizeStaffTitle('   ')).toBe('');
  });

  test('3. filterStaffRoster & getStaffRosterStatusBucket filter by query, status, and role accurately', () => {
    expect(getStaffRosterStatusBucket(sampleStaff[0])).toBe('invited');
    expect(getStaffRosterStatusBucket(sampleStaff[1])).toBe('active');
    expect(getStaffRosterStatusBucket(sampleStaff[3])).toBe('inactive');

    expect(filterStaffRoster(sampleStaff, { status: 'invited' }).map((s) => s.id)).toEqual(['doc-invited']);
    expect(filterStaffRoster(sampleStaff, { status: 'active' }).map((s) => s.id)).toEqual([
      'admin-active',
      'nurse-active',
    ]);
    expect(filterStaffRoster(sampleStaff, { status: 'inactive' }).map((s) => s.id)).toEqual(['doc-suspended']);
    expect(filterStaffRoster(sampleStaff, { role: 'Doctor' }).map((s) => s.id)).toEqual([
      'doc-invited',
      'doc-suspended',
    ]);
    expect(filterStaffRoster(sampleStaff, { query: 'PRC-12345' }).map((s) => s.id)).toEqual(['doc-invited']);
    expect(filterStaffRoster(sampleStaff, { query: 'triage' }).map((s) => s.id)).toEqual(['nurse-active']);
    expect(
      filterStaffRoster(sampleStaff, { query: 'ustp.edu.ph', status: 'active', role: 'Nurse' }).map((s) => s.id)
    ).toEqual(['nurse-active']);
  });

  test('4. buildStaffOverflowMenuItems separates verification, doctor tools, account actions, and destructive items cleanly', () => {
    const noop = () => {};
    const makeParams = (member: StaffMember, isSelf = false) => {
      const inviteUrl = member.status === 'Invited' ? 'https://clinic.test/invitations/abc' : undefined;
      const hydrated = inviteUrl ? { ...member, inviteUrl } : member;
      return {
        staffMember: hydrated,
        actions: getAvailableStaffActions(hydrated, { isSelf }),
        directoryActions: getPractitionerDirectoryActions(hydrated),
        isPendingInvite: hydrated.status === 'Invited' && !hydrated.hasCredentials,
        inviteUrl,
        onSubmitVerification: noop,
        onResubmitPrc: noop,
        onWithdrawVerification: noop,
        onOpenRoster: noop,
        onOpenStamp: noop,
        onCopyInvite: noop,
        onResendInvite: noop,
        onReinviteStaff: noop,
        onResetPassword: noop,
        onReactivateStaff: noop,
        onSuspendStaff: noop,
        onRevokeInvite: noop,
        onRemoveStaff: noop,
      };
    };

    // Pending Invited Doctor: zero verification or roster/stamp items, clean invite actions + divided revoke
    const invitedDocItems = buildStaffOverflowMenuItems(makeParams(sampleStaff[0]));
    expect(invitedDocItems.map((i) => i.id)).toEqual(['copy-invite', 'resend-invite', 'revoke-invite']);
    expect(invitedDocItems[0].dividerBefore).toBeUndefined();
    expect(invitedDocItems[2].dividerBefore).toBe(true);

    // Active Unverified Doctor: verification -> clinical -> account -> destructive
    const activeDoc: StaffMember = {
      ...sampleStaff[0],
      id: 'doc-active',
      status: 'Active',
      hasCredentials: true,
    };
    const activeDocItems = buildStaffOverflowMenuItems(makeParams(activeDoc));
    expect(activeDocItems.map((i) => i.id)).toEqual([
      'submit-verification',
      'roster',
      'stamp',
      'reset-pwd',
      'suspend-staff',
      'revoke-invite',
    ]);
    expect(activeDocItems[0].dividerBefore).toBeUndefined();
    expect(activeDocItems[1].dividerBefore).toBe(true);
    expect(activeDocItems[3].dividerBefore).toBe(true);
    expect(activeDocItems[4].dividerBefore).toBe(true);

    // Self Admin row: only Reset Password, no leading divider
    const selfAdminItems = buildStaffOverflowMenuItems(makeParams(sampleStaff[1], true));
    expect(selfAdminItems.map((i) => i.id)).toEqual(['reset-pwd']);
    expect(selfAdminItems[0].dividerBefore).toBeUndefined();

    // Active Nurse (unverified): Submit for Verification lives in overflow menu
    const activeNurseItems = buildStaffOverflowMenuItems(makeParams(sampleStaff[2]));
    expect(activeNurseItems.map((i) => i.id)).toEqual([
      'submit-verification',
      'reset-pwd',
      'suspend-staff',
      'revoke-invite',
    ]);
  });

  test('5. StaffManagementTab renders filter toolbar, non-duplicated roleName subtitles, and zero inline verification buttons', () => {
    const markup = renderToStaticMarkup(
      React.createElement(StaffManagementTab, {
        staff: sampleStaff,
        setStaff: () => {},
        roles: [],
        staffLoadError: null,
        showSkeletons: false,
        activeStaffCount: 3,
        maxStaffSeats: 16,
        onRefreshStaff: async () => {},
        showAddModal: false,
        setShowAddModal: () => {},
        onStaffAdded: async () => {},
      })
    );

    expect(markup).toContain('data-testid="staff-filter-toolbar"');
    expect(markup).toContain('data-testid="staff-search-input"');
    expect(markup).toContain('data-testid="staff-status-filter-scroll"');
    expect(markup).toContain('data-testid="staff-role-filter-scroll"');
    expect(markup).toContain('All (4)');
    expect(markup).toContain('Active (2)');
    expect(markup).toContain('Invited (1)');
    expect(markup).toContain('Inactive (1)');
    expect(markup).toContain('All Roles');
    expect(markup).toContain('Doctor (2)');
    expect(markup).toContain('Nurse (1)');
    expect(markup).toContain('Admin (1)');

    // Role titles appear once (in the subtitle), never duplicated as a purple badge
    expect(markup.match(/Attending Physician \/ Doctor/g)?.length).toBe(1);
    expect(markup.match(/Clinic Administrator/g)?.length).toBe(1);
    expect(markup.match(/Triage Nurse/g)?.length).toBe(1);

    // No inline verification buttons or passive Not Listed clutter on pending/nurse/suspended rows
    expect(markup).not.toContain('Submit for Verification');
    expect(markup).not.toContain('Resubmit PRC');
    expect(markup).not.toContain('Not Listed');
  });

  test('6. Chip size="sm" uses compact padding and caption typography for inline filter bars', () => {
    const smEl = Chip({ label: 'Active (9)', active: true, onPress: () => {}, size: 'sm' }) as any;
    const mdEl = Chip({ label: 'Doctor', active: false, onPress: () => {} }) as any;

    const smStyles = (smEl.props.style as any[]).filter(Boolean);
    const mdStyles = (mdEl.props.style as any[]).filter(Boolean);

    expect(smStyles.some((s) => s.paddingVertical === 4 && s.paddingHorizontal === 10)).toBe(true);
    expect(mdStyles.some((s) => s.paddingVertical === 4)).toBe(false);
    expect(smEl.props.children.props.variant).toBe('captionBold');
    expect(mdEl.props.children.props.variant).toBe('small');

    const smMarkup = renderToStaticMarkup(
      React.createElement(Chip, { label: 'All (15)', active: false, onPress: () => {}, size: 'sm' })
    );
    expect(smMarkup).toContain('All (15)');
  });
});

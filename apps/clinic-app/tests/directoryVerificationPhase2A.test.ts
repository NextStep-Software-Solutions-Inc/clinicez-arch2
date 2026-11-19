// token-guard:ignore-file
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as fs from 'node:fs';
import * as path from 'node:path';
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
  Modal: ({ visible, children, title, subtitle, footer }: any) =>
    visible
      ? React.createElement(
          'div',
          { 'data-component': 'Modal' },
          title ? React.createElement('div', null, title) : null,
          subtitle ? React.createElement('div', null, subtitle) : null,
          children,
          footer,
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

mock.module('../context/AuthContext', () => ({
  useAuth: () => ({
    state: 'signedIn',
    user: {
      id: 'admin-1',
      name: 'Admin User',
      email: 'admin@clinic.ph',
      role: 'Admin',
      clinicId: 'clinic-1',
      tenantId: 'tenant-1',
      permissions: ['*'],
    },
    offline: false,
  }),
  usePermission: () => true,
}));

mock.module('../context/StaffContext', () => ({
  useStaff: () => ({
    staff: [],
    current: null,
    currentName: 'Admin User',
    loading: false,
    error: null,
    reload: async () => {},
  }),
  formatStaffName: (s?: any) => (s ? `${s.firstName} ${s.lastName}` : ''),
}));

mock.module('../context/ClinicContext', () => ({
  useClinic: () => ({
    facilityName: 'St. Jude Clinic',
    rooms: [],
    refreshRooms: async () => {},
  }),
}));

const { clinicApiClient } = await import('../services/apiClient');
const { clinicService } = await import('../services/clinicService');
const {
  isClinicianRole,
  isValidPrcFormat,
  resolveFacilityVerificationBadge,
  resolvePractitionerVerificationBadge,
  getPractitionerDirectoryActions,
  validateClinicianDirectoryOptIn,
  isStaffRecordReadyForVerification,
} = await import('../utils/directoryVerification');
const { default: StaffManagementTab } = await import('../components/settings/StaffManagementTab');

describe('Phase 2A: Directory Verification Helpers, API Contracts & Staff Directory UX', () => {
  const originalPost = clinicApiClient.post.bind(clinicApiClient);
  const originalPut = clinicApiClient.put.bind(clinicApiClient);
  const originalGet = clinicApiClient.get.bind(clinicApiClient);

  afterEach(() => {
    clinicApiClient.post = originalPost;
    clinicApiClient.put = originalPut;
    clinicApiClient.get = originalGet;
  });

  test('1. clinicService wires all Phase 2A ClinicSettings & Staff verification endpoints cleanly', async () => {
    const calls: Array<{ method: string; url: string; data?: any; config?: any }> = [];

    clinicApiClient.get = (async (url: string, config?: any) => {
      calls.push({ method: 'GET', url, config });
      return [{ isReady: true } as any, null];
    }) as any;
    clinicApiClient.post = (async (url: string, data?: any, config?: any) => {
      calls.push({ method: 'POST', url, data, config });
      return [{ objectKey: 'tenants/t/clinics/c/doc.pdf', success: true } as any, null];
    }) as any;
    clinicApiClient.put = (async (url: string, data?: any, config?: any) => {
      calls.push({ method: 'PUT', url, data, config });
      return [{ success: true, isPublished: true, isPaused: false } as any, null];
    }) as any;

    const form = new FormData();
    await clinicService.getPublishingReadiness();
    await clinicService.uploadLtoProof(form);
    await clinicService.publishToDirectory(true);
    await clinicService.withdrawDirectoryPublishing('Updating LTO scan');
    await clinicService.toggleBookingPause(true);
    await clinicService.uploadStaffPrcProof('staff-123', form);
    await clinicService.submitStaffVerification('staff-123');
    await clinicService.withdrawStaffVerification('staff-123', 'No longer practicing');

    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      'GET /clinic-settings/readiness',
      'POST /clinic-settings/lto-proof',
      'PUT /clinic-settings/directory-publishing',
      'POST /clinic-settings/directory-publishing/withdraw',
      'PUT /clinic-settings/booking-pause',
      'POST /staff/staff-123/prc-proof',
      'POST /staff/staff-123/submit-verification',
      'POST /staff/staff-123/withdraw-verification',
    ]);

    expect(calls[1].config?.headers?.['Content-Type']).toBe('multipart/form-data');
    expect(calls[3].data).toEqual({ reason: 'Updating LTO scan' });
    expect(calls[4].data).toEqual({ isPaused: true });
    expect(calls[5].config?.headers?.['Content-Type']).toBe('multipart/form-data');
    expect(calls[7].data).toEqual({ reason: 'No longer practicing' });
  });

  test('2. directoryVerification helpers enforce clinician-only opt-in, PRC formatting, and plain clinical badges', () => {
    expect(isClinicianRole('Doctor')).toBe(true);
    expect(isClinicianRole('Nurse')).toBe(true);
    expect(isClinicianRole('Receptionist')).toBe(false);
    expect(isClinicianRole('Cashier')).toBe(false);
    expect(isClinicianRole('Admin')).toBe(false);

    expect(isValidPrcFormat('0108924')).toBe(true);
    expect(isValidPrcFormat('PRC-0108924')).toBe(true);
    expect(isValidPrcFormat('12ab')).toBe(false);
    expect(isValidPrcFormat('PRC')).toBe(false);
    expect(isValidPrcFormat('')).toBe(false);

    expect(resolveFacilityVerificationBadge('Unverified').label).toBe('Not Listed');
    expect(resolveFacilityVerificationBadge('PendingReview').label).toBe('Pending Review');
    expect(resolveFacilityVerificationBadge('Verified').label).toBe('Verified');
    expect(resolveFacilityVerificationBadge('Rejected').label).toBe('Action Required');
    expect(resolveFacilityVerificationBadge('Suspended').label).toBe('Action Required');

    expect(resolvePractitionerVerificationBadge('Unverified').label).toBe('Not Listed');
    expect(resolvePractitionerVerificationBadge('PendingVerification').label).toBe('Pending Review');
    expect(resolvePractitionerVerificationBadge('AwaitingConfirmation').label).toBe('Awaiting Confirmation');
    expect(resolvePractitionerVerificationBadge('Verified').label).toBe('Verified');
    expect(resolvePractitionerVerificationBadge('Rejected').label).toBe('Action Required');
    expect(resolvePractitionerVerificationBadge('Expired').label).toBe('Action Required');
    expect(resolvePractitionerVerificationBadge('Suspended').label).toBe('Action Required');

    expect(getPractitionerDirectoryActions({ role: 'Doctor', isActive: true, publicVerificationStatus: 'Unverified' })).toEqual([
      'submit-verification',
    ]);
    expect(getPractitionerDirectoryActions({ role: 'Nurse', isActive: true, publicVerificationStatus: 'PendingVerification' })).toEqual([
      'withdraw-verification',
    ]);
    expect(getPractitionerDirectoryActions({ role: 'Doctor', isActive: true, publicVerificationStatus: 'AwaitingConfirmation' })).toEqual([
      'withdraw-verification',
    ]);
    expect(getPractitionerDirectoryActions({ role: 'Doctor', isActive: true, publicVerificationStatus: 'Rejected' })).toEqual([
      'resubmit-prc',
    ]);
    expect(getPractitionerDirectoryActions({ role: 'Doctor', isActive: true, publicVerificationStatus: 'Verified' })).toEqual([]);
    expect(getPractitionerDirectoryActions({ role: 'Receptionist', isActive: true, publicVerificationStatus: 'Unverified' })).toEqual([]);
    expect(getPractitionerDirectoryActions({ role: 'Cashier', isActive: true })).toEqual([]);
    expect(getPractitionerDirectoryActions({ role: 'Admin', isActive: true })).toEqual([]);

    expect(
      validateClinicianDirectoryOptIn({
        role: 'Receptionist',
        prcLicenseNumber: '0108924',
        prcExpiryDate: '2099-12-31',
        prcEvidenceObjectKey: 'key.pdf',
        verificationContact: 'doc@clinic.ph',
      }),
    ).toContain('Only Doctors and Nurses');

    expect(
      isStaffRecordReadyForVerification({
        role: 'Doctor',
        isActive: true,
        prcLicenseNumber: '0108924',
        prcExpiryDate: '2099-12-31',
        prcEvidenceObjectKey: 'tenants/t/clinics/c/prc.pdf',
        verificationContact: 'doc@clinic.ph',
      }),
    ).toBe(true);
  });

  test('3. StaffManagementTab renders directory status pills & actions for Doctors/Nurses only and excludes Receptionist/Cashier/Admin', () => {
    const roster: StaffMember[] = [
      {
        id: 'doc-unverified',
        tenantId: 't1',
        clinicId: 'c1',
        firstName: 'Ana',
        lastName: 'Santos',
        title: 'Dr.',
        role: 'Doctor',
        prcLicenseNumber: '0108924',
        isActive: true,
        status: 'Active',
        createdAt: '2026-10-01T00:00:00Z',
        publicVerificationStatus: 'Unverified',
      },
      {
        id: 'nurse-pending',
        tenantId: 't1',
        clinicId: 'c1',
        firstName: 'Bea',
        lastName: 'Cruz',
        title: 'RN',
        role: 'Nurse',
        prcLicenseNumber: '0412345',
        isActive: true,
        status: 'Active',
        createdAt: '2026-10-01T00:00:00Z',
        isDirectoryOptIn: true,
        publicVerificationStatus: 'PendingVerification',
      },
      {
        id: 'doc-awaiting',
        tenantId: 't1',
        clinicId: 'c1',
        firstName: 'Carlo',
        lastName: 'Dizon',
        title: 'Dr.',
        role: 'Doctor',
        prcLicenseNumber: '0209911',
        isActive: true,
        status: 'Active',
        createdAt: '2026-10-01T00:00:00Z',
        isDirectoryOptIn: true,
        publicVerificationStatus: 'AwaitingConfirmation',
      },
      {
        id: 'doc-verified',
        tenantId: 't1',
        clinicId: 'c1',
        firstName: 'Diana',
        lastName: 'Reyes',
        title: 'Dr.',
        role: 'Doctor',
        prcLicenseNumber: '0307788',
        prcExpiryDate: '2029-05-01',
        isActive: true,
        status: 'Active',
        createdAt: '2026-10-01T00:00:00Z',
        isDirectoryOptIn: true,
        publicVerificationStatus: 'Verified',
      },
      {
        id: 'doc-rejected',
        tenantId: 't1',
        clinicId: 'c1',
        firstName: 'Eric',
        lastName: 'Lim',
        title: 'Dr.',
        role: 'Doctor',
        prcLicenseNumber: '0501122',
        isActive: true,
        status: 'Active',
        createdAt: '2026-10-01T00:00:00Z',
        isDirectoryOptIn: true,
        publicVerificationStatus: 'Rejected',
        publicVerificationReason: 'PRC ID photo cropped.',
      },
      {
        id: 'recep-1',
        tenantId: 't1',
        clinicId: 'c1',
        firstName: 'Faye',
        lastName: 'Tan',
        role: 'Receptionist',
        isActive: true,
        status: 'Active',
        createdAt: '2026-10-01T00:00:00Z',
      },
    ];

    const markup = renderToStaticMarkup(
      React.createElement(StaffManagementTab, {
        staff: roster,
        setStaff: () => {},
        roles: [],
        staffLoadError: null,
        showSkeletons: false,
        activeStaffCount: roster.length,
        maxStaffSeats: 10,
        onRefreshStaff: async () => {},
        showAddModal: false,
        setShowAddModal: () => {},
        onStaffAdded: async () => {},
      }),
    );

    expect(markup).toContain('Not Listed');
    expect(markup).toContain('Pending Review');
    expect(markup).toContain('Awaiting Confirmation');
    expect(markup).toContain('Verified');
    expect(markup).toContain('Action Required');
    expect(markup).toContain('Action required: PRC ID photo cropped.');
    expect(markup).toContain('Exp 2029-05-01');

    expect(markup).toContain('Submit for Verification');
    expect(markup).toContain('Resubmit PRC');
    expect(markup).toContain('Withdraw');

    // Receptionist row-only check: rendering solely a Receptionist must show zero directory badges or actions
    const receptionistOnlyMarkup = renderToStaticMarkup(
      React.createElement(StaffManagementTab, {
        staff: [roster[5]],
        setStaff: () => {},
        roles: [],
        staffLoadError: null,
        showSkeletons: false,
        activeStaffCount: 1,
        maxStaffSeats: 10,
        onRefreshStaff: async () => {},
        showAddModal: false,
        setShowAddModal: () => {},
        onStaffAdded: async () => {},
      }),
    );

    expect(receptionistOnlyMarkup).not.toContain('Not Listed');
    expect(receptionistOnlyMarkup).not.toContain('Submit for Verification');
    expect(receptionistOnlyMarkup).not.toContain('Resubmit PRC');
    expect(receptionistOnlyMarkup).not.toContain('Withdraw');
  });

  test('4. Add Staff modal renders List in Patient Directory opt-in section for default Doctor role', () => {
    const markup = renderToStaticMarkup(
      React.createElement(StaffManagementTab, {
        staff: [],
        setStaff: () => {},
        roles: [],
        staffLoadError: null,
        showSkeletons: false,
        activeStaffCount: 0,
        maxStaffSeats: 10,
        onRefreshStaff: async () => {},
        showAddModal: true,
        setShowAddModal: () => {},
        onStaffAdded: async () => {},
      }),
    );

    expect(markup).toContain('List in Patient Directory');
    expect(markup).toContain('switch-directory-opt-in-add');

    const staffTabSrc = fs.readFileSync(
      path.resolve(__dirname, '../components/settings/StaffManagementTab.tsx'),
      'utf8',
    );
    expect(staffTabSrc).toContain('Save & Submit for Verification');
    expect(staffTabSrc).toContain('PRC Expiry Date');
    expect(staffTabSrc).toContain('Upload PRC Proof');
    expect(staffTabSrc).toContain('EvidenceProofPreview');
    expect(staffTabSrc).toContain('fetchStaffPrcProofBlob');
    expect(staffTabSrc).toContain('Verification Contact');
    expect(staffTabSrc).toContain('Public Bio');

    const readinessTabSrc = fs.readFileSync(
      path.resolve(__dirname, '../components/settings/FacilityReadinessTab.tsx'),
      'utf8',
    );
    expect(readinessTabSrc).toContain('EvidenceProofPreview');
    expect(readinessTabSrc).toContain('fetchLtoProofBlob');
  });

  test('5. Dashboard.screen.tsx remains completely clean of directory publishing or verification controls', () => {
    const dashboardSrc = fs.readFileSync(
      path.resolve(__dirname, '../navigation/screens/Dashboard.screen.tsx'),
      'utf8',
    );
    expect(dashboardSrc).not.toContain('publishToDirectory');
    expect(dashboardSrc).not.toContain('withdrawDirectoryPublishing');
    expect(dashboardSrc).not.toContain('Submit for Verification');
    expect(dashboardSrc).not.toContain('uploadLtoProof');
    expect(dashboardSrc).not.toContain('submitStaffVerification');
  });
});

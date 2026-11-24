import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ApiError } from '@shared/safe';

(globalThis as any).__DEV__ = true;

const createMockComponent = (name: string) => {
  const Comp = ({
    children,
    accessibilityLabel,
    accessibilityRole,
    placeholder,
    testID,
    visible,
    value,
    disabled,
  }: any) => {
    if (name === 'Modal' && visible === false) {
      return null;
    }
    return React.createElement(
      'div',
      {
        'data-component': name,
        ...(testID ? { 'data-testid': testID } : {}),
        ...(accessibilityLabel ? { 'aria-label': accessibilityLabel } : {}),
        ...(accessibilityRole ? { role: accessibilityRole } : {}),
        ...(placeholder ? { 'data-placeholder': placeholder } : {}),
        ...(value !== undefined ? { 'data-value': String(value) } : {}),
        ...(disabled !== undefined ? { 'data-disabled': String(Boolean(disabled)) } : {}),
      },
      placeholder,
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
  RefreshControl: createMockComponent('RefreshControl'),
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

let mockPickedDocumentResult: any = { canceled: true, assets: null };

mock.module('expo-document-picker', () => ({
  getDocumentAsync: () => Promise.resolve(mockPickedDocumentResult),
}));

mock.module('react-native-svg', () => ({
  Svg: 'svg',
  Path: 'path',
  Circle: 'circle',
  Rect: 'rect',
  Line: 'line',
  default: 'svg',
  Defs: ({ children }: any) => children,
  LinearGradient: ({ children }: any) => children,
  Stop: () => null,
  G: ({ children }: any) => children,
  Text: ({ children }: any) => children,
  Polyline: 'polyline',
  Polygon: 'polygon',
}));

mock.module('../constants/fonts', () => ({
  applyFontFamily: (s: any) => s,
  fontAssets: {},
}));

mock.module('../utils/useBreakpoint', () => ({
  useBreakpoint: () => ({
    width: 1280,
    height: 800,
    isCompact: false,
    isWorkstation: true,
    isDesktop: true,
    isWide: true,
  }),
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
    can: () => true,
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
    refresh: async () => {},
    refreshRooms: async () => {},
  }),
}));

const { clinicApiClient } = await import('../services/apiClient');
const { clinicService, isVerificationConflictError } = await import('../services/clinicService');
const {
  PENDING_VERIFICATION_BUTTON_LABEL,
  PENDING_VERIFICATION_CONFLICT_CODE,
  PENDING_VERIFICATION_HELPER_NOTE,
  REGULATED_LTO_REVERIFICATION_NOTICE,
  REGULATED_PRC_REVERIFICATION_NOTICE,
  RESUBMIT_LTO_BUTTON_LABEL,
  RESUBMIT_VERIFICATION_BUTTON_LABEL,
  buildDohLtoSettingsPayload,
  hasRegulatedLtoCredentialsChanged,
  hasRegulatedPrcCredentialsChanged,
  isPendingVerificationConflictError,
} = await import('../utils/directoryVerification');
const { validateDateString } = await import('../components/ui/ValidatedDateInput');
const { default: FacilityReadinessTab } = await import('../components/settings/FacilityReadinessTab');
const { default: GeneralSettingsTab } = await import('../components/settings/GeneralSettingsTab');
const { default: DocumentTemplatesSettingsTab } = await import(
  '../components/settings/DocumentTemplatesSettingsTab'
);
const { default: ServicesCatalogTab } = await import('../components/settings/ServicesCatalogTab');
const { default: StaffManagementTab } = await import('../components/settings/StaffManagementTab');
const { default: ClinicalSpecialtyCard } = await import(
  '../components/settings/cards/ClinicalSpecialtyCard'
);
const { DoctorRosterCalendarModal } = await import('../components/roster/DoctorRosterCalendarModal');
const { getFeedbackState, resetFeedbackState } = await import('../utils/feedback');

function createLocalHookHarness<Result, Props = any>(
  hookFn: (props: Props) => Result,
  initialProps?: Props,
  contextValues: Map<React.Context<any>, any> = new Map(),
) {
  const stateSlots: any[] = [];
  const effectSlots: Array<{ fn: () => any; cleanup?: any; deps: any[]; hasChanged: boolean }> = [];
  const refSlots: Array<{ current: any }> = [];
  const memoSlots: Array<{ value: any; deps: any[] }> = [];
  let slotIndex = 0;
  let effectIndex = 0;
  let refIndex = 0;
  let memoIndex = 0;
  let currentProps = initialProps as Props;
  let result!: Result;
  let isRendering = false;
  let hasPendingRender = false;

  const mockHooks: any = {
    useState: (initial: any) => {
      const idx = slotIndex++;
      if (stateSlots.length <= idx) {
        stateSlots.push(typeof initial === 'function' ? initial() : initial);
      }
      const setState = (newVal: any) => {
        const nextVal = typeof newVal === 'function' ? newVal(stateSlots[idx]) : newVal;
        if (stateSlots[idx] !== nextVal) {
          stateSlots[idx] = nextVal;
          scheduleRender();
        }
      };
      return [stateSlots[idx], setState];
    },
    useRef: (initial: any) => {
      const idx = refIndex++;
      if (refSlots.length <= idx) refSlots.push({ current: initial });
      return refSlots[idx];
    },
    useCallback: (fn: any, deps: any[]) => mockHooks.useMemo(() => fn, deps),
    useMemo: (fn: any, deps: any[]) => {
      const idx = memoIndex++;
      const prev = memoSlots[idx];
      const changed = !prev || !deps || deps.some((d, i) => d !== prev.deps[i]);
      if (changed) {
        const value = fn();
        memoSlots[idx] = { value, deps };
        return value;
      }
      return prev.value;
    },
    useEffect: (fn: any, deps: any[]) => {
      const idx = effectIndex++;
      const prev = effectSlots[idx];
      const hasChanged = !prev || !deps || deps.some((d, i) => d !== prev?.deps[i]);
      effectSlots[idx] = { fn, deps, hasChanged, cleanup: prev?.cleanup };
    },
    useContext: (context: React.Context<any>) =>
      contextValues.has(context) ? contextValues.get(context) : (context as any)._currentValue,
    useSyncExternalStore: (_sub: any, getSnap: () => any) => getSnap(),
  };

  function scheduleRender() {
    if (isRendering) {
      hasPendingRender = true;
      return;
    }
    render();
  }

  function render() {
    if (isRendering) return;
    isRendering = true;
    try {
      do {
        hasPendingRender = false;
        slotIndex = 0;
        effectIndex = 0;
        refIndex = 0;
        memoIndex = 0;
        const internals = (React as any).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
        const prevDispatcher = internals ? internals.H : null;
        if (internals) internals.H = mockHooks;
        try {
          result = hookFn(currentProps);
        } finally {
          if (internals) internals.H = prevDispatcher;
        }
        for (const eff of effectSlots) {
          if (eff.hasChanged) {
            eff.hasChanged = false;
            if (typeof eff.cleanup === 'function') eff.cleanup();
            eff.cleanup = eff.fn();
          }
        }
      } while (hasPendingRender);
    } finally {
      isRendering = false;
    }
  }

  render();

  return {
    get result() {
      return { current: result };
    },
    rerender: (nextProps?: Props) => {
      if (nextProps !== undefined) currentProps = nextProps;
      render();
    },
    unmount: () => {
      for (const eff of effectSlots) {
        if (typeof eff.cleanup === 'function') eff.cleanup();
      }
    },
  };
}

function findNode(node: any, predicate: (el: any) => boolean): any {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findNode(child, predicate);
      if (found) return found;
    }
    return null;
  }
  if (predicate(node)) return node;
  if (node?.props?.visible === false) return null;
  const props = node.props;
  if (!props || typeof props !== 'object') return null;
  for (const key of ['children', 'footer', 'rightAction', 'header', 'leftAction']) {
    if (props[key]) {
      const found = findNode(props[key], predicate);
      if (found) return found;
    }
  }
  return null;
}

function findNodeByTestId(node: any, testID: string): any {
  return findNode(node, (el) => el?.props?.testID === testID);
}

describe('Issues 217 & 218 — clinic-app Pending Verification Sync & DOH LTO Expiry', () => {
  const originalGet = clinicApiClient.get;
  const originalPost = clinicApiClient.post;
  const originalPut = clinicApiClient.put;
  const originalDelete = clinicApiClient.delete;

  afterEach(() => {
    clinicApiClient.get = originalGet;
    clinicApiClient.post = originalPost;
    clinicApiClient.put = originalPut;
    clinicApiClient.delete = originalDelete;
  });

  test('1. clinicService exposes /pending endpoints and conditionally attaches skipPendingVerificationSync', async () => {
    const calls: Array<{ method: string; url: string; data?: any }> = [];

    clinicApiClient.post = (async (url: string, data?: any) => {
      calls.push({ method: 'POST', url, data });
      return [{ objectKey: 'k1', success: true } as any, null];
    }) as any;
    clinicApiClient.put = (async (url: string, data?: any) => {
      calls.push({ method: 'PUT', url, data });
      return [{ success: true, isPublished: true } as any, null];
    }) as any;
    clinicApiClient.delete = (async (url: string) => {
      calls.push({ method: 'DELETE', url });
      return [true as any, null];
    }) as any;

    const form = new FormData();

    await clinicService.updatePendingDirectoryVerification();
    await clinicService.updatePendingStaffVerification('staff-1');

    // Query-param endpoints with explicit skipPendingVerificationSync: true vs default
    await clinicService.uploadLtoProof(form, undefined, { skipPendingVerificationSync: true });
    await clinicService.uploadLtoProof(form);
    await clinicService.uploadStaffPrcProof('staff-1', form, undefined, {
      skipPendingVerificationSync: true,
    });
    await clinicService.uploadStaffPrcProof('staff-1', form);
    await clinicService.seedDentalServices({ skipPendingVerificationSync: true });
    await clinicService.seedDentalServices();
    await clinicService.deleteDoctorScheduleTemplate('doc-1', 'tpl-1', {
      skipPendingVerificationSync: true,
    });
    await clinicService.deleteDoctorScheduleTemplate('doc-1', 'tpl-1');

    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      'PUT /clinic-settings/directory-publishing/pending',
      'PUT /staff/staff-1/verification/pending',
      'POST /clinic-settings/lto-proof?skipPendingVerificationSync=true',
      'POST /clinic-settings/lto-proof',
      'POST /staff/staff-1/prc-proof?skipPendingVerificationSync=true',
      'POST /staff/staff-1/prc-proof',
      'POST /services/seed-dental?skipPendingVerificationSync=true',
      'POST /services/seed-dental',
      'DELETE /doctors/doc-1/schedules/templates/tpl-1?skipPendingVerificationSync=true',
      'DELETE /doctors/doc-1/schedules/templates/tpl-1',
    ]);

    calls.length = 0;

    // Body-flag endpoints with explicit skipPendingVerificationSync: true vs omitted default
    await clinicService.updateSettings({
      clinicName: 'Clinic A',
      dohLtoExpiryDate: '',
      skipPendingVerificationSync: true,
    });
    await clinicService.updateSettings({
      clinicName: 'Clinic A',
      dohLtoExpiryDate: '',
    });
    await clinicService.toggleBookingPause(true, { skipPendingVerificationSync: true });
    await clinicService.toggleBookingPause(true);
    await clinicService.bulkImportServices(
      [{ code: 'S1', name: 'Consult', category: 'Consultation', standardPrice: 500 }],
      { skipPendingVerificationSync: true },
    );
    await clinicService.bulkImportServices([
      { code: 'S1', name: 'Consult', category: 'Consultation', standardPrice: 500 },
    ]);

    expect(calls[0].data).toEqual({
      clinicName: 'Clinic A',
      skipPendingVerificationSync: true,
    });
    expect(calls[1].data).toEqual({ clinicName: 'Clinic A' });
    expect('dohLtoExpiryDate' in calls[1].data).toBe(false);
    expect('skipPendingVerificationSync' in calls[1].data).toBe(false);
    expect(calls[2].data).toEqual({ isPaused: true, skipPendingVerificationSync: true });
    expect(calls[3].data).toEqual({ isPaused: true });
    expect(calls[4].data).toEqual({
      items: [{ code: 'S1', name: 'Consult', category: 'Consultation', standardPrice: 500 }],
      skipPendingVerificationSync: true,
    });
    expect(calls[5].data).toEqual({
      items: [{ code: 'S1', name: 'Consult', category: 'Consultation', standardPrice: 500 }],
    });

    // All 5 remaining body-param mutations omit skipPendingVerificationSync unless === true
    calls.length = 0;

    await clinicService.createService({
      code: 'S2',
      name: 'Consult 2',
      category: 'Consultation',
      standardPrice: 600,
      skipPendingVerificationSync: false,
    });
    await clinicService.createService({
      code: 'S3',
      name: 'Consult 3',
      category: 'Consultation',
      standardPrice: 700,
      skipPendingVerificationSync: true,
    });
    await clinicService.updateService('svc-1', {
      name: 'Consult Updated',
      category: 'Consultation',
      standardPrice: 650,
      skipPendingVerificationSync: false,
    });
    await clinicService.updateService('svc-1', {
      name: 'Consult Updated',
      category: 'Consultation',
      standardPrice: 650,
      skipPendingVerificationSync: true,
    });
    await clinicService.updateStaff('s-1', {
      firstName: 'Ana',
      lastName: 'Cruz',
      role: 'Doctor',
      skipPendingVerificationSync: false,
    });
    await clinicService.updateStaff('s-1', {
      firstName: 'Ana',
      lastName: 'Cruz',
      role: 'Doctor',
      skipPendingVerificationSync: true,
    });
    await clinicService.updateMyProfile({
      firstName: 'Ana',
      lastName: 'Cruz',
      skipPendingVerificationSync: false,
    });
    await clinicService.updateMyProfile({
      firstName: 'Ana',
      lastName: 'Cruz',
      skipPendingVerificationSync: true,
    });
    await clinicService.upsertDoctorScheduleTemplate('doc-1', {
      dayOfWeek: 1,
      startTime: '08:00',
      endTime: '17:00',
      skipPendingVerificationSync: false,
    });
    await clinicService.upsertDoctorScheduleTemplate('doc-1', {
      dayOfWeek: 1,
      startTime: '08:00',
      endTime: '17:00',
      skipPendingVerificationSync: true,
    });

    expect('skipPendingVerificationSync' in calls[0].data).toBe(false);
    expect(calls[1].data.skipPendingVerificationSync).toBe(true);
    expect('skipPendingVerificationSync' in calls[2].data).toBe(false);
    expect(calls[3].data.skipPendingVerificationSync).toBe(true);
    expect('skipPendingVerificationSync' in calls[4].data).toBe(false);
    expect(calls[5].data.skipPendingVerificationSync).toBe(true);
    expect('skipPendingVerificationSync' in calls[6].data).toBe(false);
    expect(calls[7].data.skipPendingVerificationSync).toBe(true);
    expect('skipPendingVerificationSync' in calls[8].data).toBe(false);
    expect(calls[9].data.skipPendingVerificationSync).toBe(true);
  });

  test('2. Conflict error predicates identify 409 verification_request_not_pending accurately', () => {
    const exactConflict = new ApiError(
      'Already approved',
      409,
      [],
      PENDING_VERIFICATION_CONFLICT_CODE,
    );
    const generic409 = new ApiError('Conflict', 409, []);
    const other409 = new ApiError('Other conflict', 409, [], 'SOME_OTHER_CODE');
    const duplicate409 = new ApiError('Duplicate', 409, [], 'DUPLICATE_ENTRY');
    const badRequest = new ApiError('Bad request', 400, [], 'VALIDATION_ERROR');

    expect(isVerificationConflictError(exactConflict)).toBe(true);
    expect(isVerificationConflictError(generic409)).toBe(true);
    expect(isVerificationConflictError(other409)).toBe(false);
    expect(isVerificationConflictError(duplicate409)).toBe(false);
    expect(isVerificationConflictError(badRequest)).toBe(false);
    expect(isVerificationConflictError(null)).toBe(false);

    expect(isPendingVerificationConflictError(exactConflict)).toBe(true);
    expect(isPendingVerificationConflictError(generic409)).toBe(true);
    expect(isPendingVerificationConflictError(other409)).toBe(false);
    expect(isPendingVerificationConflictError(duplicate409)).toBe(false);
    expect(isPendingVerificationConflictError(badRequest)).toBe(false);
  });

  test('3. Issue 217 buildDohLtoSettingsPayload & ValidatedDateInput handle set, clear, and expired dates', () => {
    expect(
      buildDohLtoSettingsPayload({
        dohLto: ' DOH-LTO-2026-01 ',
        dohLtoExpiryDate: '2028-06-30',
        previousDohLtoExpiryDate: null,
        skipPendingVerificationSync: true,
      }),
    ).toEqual({
      letterheadDohLto: 'DOH-LTO-2026-01',
      dohLtoExpiryDate: '2028-06-30',
      skipPendingVerificationSync: true,
    });

    // Clearing previously saved date sets clearDohLtoExpiryDate: true and omits dohLtoExpiryDate
    const clearPayload = buildDohLtoSettingsPayload({
      dohLto: 'DOH-LTO-2026-01',
      dohLtoExpiryDate: '',
      previousDohLtoExpiryDate: '2028-06-30',
      skipPendingVerificationSync: false,
    });
    expect(clearPayload).toEqual({
      letterheadDohLto: 'DOH-LTO-2026-01',
      clearDohLtoExpiryDate: true,
    });
    expect('dohLtoExpiryDate' in clearPayload).toBe(false);
    expect('skipPendingVerificationSync' in clearPayload).toBe(false);

    // Blank when previously blank emits neither dohLtoExpiryDate nor clearDohLtoExpiryDate
    expect(
      buildDohLtoSettingsPayload({
        dohLto: 'DOH-LTO-2026-01',
        dohLtoExpiryDate: '',
        previousDohLtoExpiryDate: '',
      }),
    ).toEqual({ letterheadDohLto: 'DOH-LTO-2026-01' });

    // boundaryMode: 'any' allows expired LTO dates to be displayed/edited while rejecting invalid calendar dates
    expect(validateDateString('2020-01-15', { boundaryMode: 'any' }).isValid).toBe(true);
    expect(validateDateString('2026-02-29', { boundaryMode: 'any' }).isValid).toBe(false);
    expect(validateDateString('2026-10', { boundaryMode: 'any' }).isValid).toBe(false);
  });

  test('4. FacilityReadinessTab renders DOH LTO Expiry Date (Issue 217) and pending submission UX (Issue 218)', () => {
    const baseProps = {
      license: {
        status: 'Active',
        planTier: 'Growth',
        isTampered: false,
        limits: { maxStaff: 10 },
      } as any,
      clinicName: 'St. Jude Clinic',
      letterheadAddress: '123 Rizal Ave, Manila',
      letterheadContact: '0917-000-0000',
      accreditationNumber: 'PHIC-001',
      operatingHours: 'Mon-Fri 8am-5pm',
      letterheadDohLto: 'DOH-LTO-04A-2026-0089',
      dohLtoExpiryDate: '2028-06-30',
      staff: [
        {
          id: 'd1',
          role: 'Doctor',
          isActive: true,
          prcLicenseNumber: '0123456',
        },
        {
          id: 'r1',
          role: 'Receptionist',
          isActive: true,
        },
      ] as any,
      services: [{ id: 's1', isActive: true, name: 'Consult', category: 'Consultation', standardPrice: 500 }] as any,
      roles: [] as any,
      onSaveDohLto: async () => true,
      onNavigateTab: () => {},
      onOpenAddStaff: () => {},
      onOpenAddService: () => {},
      onOpenLicenseModal: () => {},
    };

    const pendingMarkup = renderToStaticMarkup(
      React.createElement(FacilityReadinessTab, {
        ...baseProps,
        platformVerificationStatus: 'PendingReview',
      }),
    );

    expect(pendingMarkup).toContain('DOH LTO Expiry Date');
    expect(pendingMarkup).toContain('data-testid="readiness-input-doh-lto-expiry"');
    expect(pendingMarkup).toContain('data-value="2028-06-30"');
    expect(pendingMarkup).toContain('Save &amp; Update Submission');
    expect(pendingMarkup).toContain(PENDING_VERIFICATION_HELPER_NOTE);

    const unverifiedMarkup = renderToStaticMarkup(
      React.createElement(FacilityReadinessTab, {
        ...baseProps,
        platformVerificationStatus: 'Unverified',
      }),
    );

    expect(unverifiedMarkup).toContain('Save LTO');
    expect(unverifiedMarkup).not.toContain('Save &amp; Update Submission');
  });

  test('5. GeneralSettingsTab cards, DocumentTemplatesSettingsTab, ServicesCatalogTab, and DoctorRosterCalendarModal surface pending labels', () => {
    const savedSettings = {
      id: 'set-1',
      tenantId: 't-1',
      clinicId: 'c-1',
      clinicName: 'St. Jude Clinic',
      accreditationNumber: 'PHIC-001',
      operatingHours: 'Mon-Fri 8am-5pm',
      defaultSlotDurationMinutes: 30,
      defaultConsultationFee: 500,
      queuePrefix: 'Q',
      invoicePrefix: 'INV',
      vatRate: 0.12,
      letterheadHeader: 'St. Jude Header',
      letterheadAddress: '123 Rizal Ave',
      letterheadContact: '0917-000-0000',
      specialtyMode: 'Medical',
      enableDentalModule: false,
      platformVerificationStatus: 'PendingReview',
    } as any;

    const generalPendingMarkup = renderToStaticMarkup(
      React.createElement(GeneralSettingsTab, {
        clinicName: 'St. Jude Clinic Updated',
        setClinicName: () => {},
        accreditationNumber: 'PHIC-001',
        setAccreditationNumber: () => {},
        operatingHours: 'Mon-Fri 8am-5pm',
        setOperatingHours: () => {},
        slotDuration: '30',
        setSlotDuration: () => {},
        consultationFee: '650',
        setConsultationFee: () => {},
        letterheadHeader: 'St. Jude Header',
        setLetterheadHeader: () => {},
        letterheadAddress: '456 Mabini St',
        setLetterheadAddress: () => {},
        letterheadContact: '0917-000-0000',
        setLetterheadContact: () => {},
        savingSettings: false,
        onSavePreferences: async () => {},
        showSkeletons: false,
        settingsLoadError: null,
        settings: savedSettings,
        specialtyMode: 'Dental',
        enableDentalModule: true,
        platformVerificationStatus: 'PendingReview',
      }),
    );

    // All 4 directory cards are dirty and must render Save & Update Submission + helper note
    const buttonOccurrences = generalPendingMarkup.split('Save &amp; Update Submission').length - 1;
    expect(buttonOccurrences).toBeGreaterThanOrEqual(4);
    expect(generalPendingMarkup).toContain(PENDING_VERIFICATION_HELPER_NOTE);

    // DocumentTemplatesSettingsTab when dirty under PendingReview
    const docsPendingMarkup = renderToStaticMarkup(
      React.createElement(DocumentTemplatesSettingsTab, {
        settings: { ...savedSettings, id: 'new' },
        platformVerificationStatus: 'PendingReview',
      }),
    );
    expect(docsPendingMarkup).toContain('Save &amp; Update Submission');
    expect(docsPendingMarkup).toContain(PENDING_VERIFICATION_HELPER_NOTE);

    // ServicesCatalogTab Add modal under PendingReview
    const servicesPendingMarkup = renderToStaticMarkup(
      React.createElement(ServicesCatalogTab, {
        services: [],
        setServices: () => {},
        servicesLoadError: null,
        showSkeletons: false,
        onRefreshServices: async () => {},
        formatPeso: (v: any) => `PHP ${v ?? 0}`,
        showAddModal: true,
        setShowAddModal: () => {},
        platformVerificationStatus: 'PendingReview',
      }),
    );
    expect(servicesPendingMarkup).toContain('Save &amp; Update Submission');
    expect(servicesPendingMarkup).toContain(PENDING_VERIFICATION_HELPER_NOTE);

    // DoctorRosterCalendarModal for PendingVerification opted-in doctor
    const pendingDoctorMarkup = renderToStaticMarkup(
      React.createElement(DoctorRosterCalendarModal, {
        visible: true,
        onClose: () => {},
        doctors: [
          {
            id: 'doc-pending',
            tenantId: 't-1',
            clinicId: 'c-1',
            firstName: 'Ana',
            lastName: 'Cruz',
            role: 'Doctor',
            isActive: true,
            isDirectoryOptIn: true,
            publicVerificationStatus: 'PendingVerification',
            createdAt: '2026-01-01T00:00:00Z',
          },
        ],
        initialDoctorId: 'doc-pending',
      }),
    );
    expect(pendingDoctorMarkup).toContain('Save &amp; Update Submission');
    expect(pendingDoctorMarkup).toContain(PENDING_VERIFICATION_HELPER_NOTE);

    // DoctorRosterCalendarModal for Verified doctor when Facility is Unverified -> standard Save Template
    const verifiedDoctorMarkup = renderToStaticMarkup(
      React.createElement(DoctorRosterCalendarModal, {
        visible: true,
        onClose: () => {},
        doctors: [
          {
            id: 'doc-verified',
            tenantId: 't-1',
            clinicId: 'c-1',
            firstName: 'Jose',
            lastName: 'Reyes',
            role: 'Doctor',
            isActive: true,
            isDirectoryOptIn: true,
            publicVerificationStatus: 'Verified',
            createdAt: '2026-01-01T00:00:00Z',
          },
        ],
        initialDoctorId: 'doc-verified',
        platformVerificationStatus: 'Unverified',
      }),
    );
    expect(verifiedDoctorMarkup).toContain('Save Template');
    expect(verifiedDoctorMarkup).not.toContain('Save &amp; Update Submission');
  });

  test('6. Runtime FacilityReadinessTab, DoctorRosterCalendarModal, DocumentTemplatesSettingsTab & ClinicalSpecialtyCard enforce /pending sync, LTO expiry guards, 409 refresh & 503 partial failures', async () => {
    resetFeedbackState();
    const origUpdateSettings = clinicService.updateSettings;
    const origUpdatePendingDir = clinicService.updatePendingDirectoryVerification;
    const origUpdatePendingStaff = clinicService.updatePendingStaffVerification;
    const origGetTemplates = clinicService.getDoctorScheduleTemplates;
    const origGetLeaves = clinicService.getDoctorLeaves;
    const origUpsertTemplate = clinicService.upsertDoctorScheduleTemplate;
    const origDeleteTemplate = clinicService.deleteDoctorScheduleTemplate;

    try {
      // A) FacilityReadinessTab: invalid LTO expiry blocks submit, clearing passes null (clearDohLtoExpiryDate), and 409 on LTO save/proof upload
      const savedLtoCalls: Array<{ dohLto: string; dohLtoExpiryDate?: string | null }> = [];
      let submitCalls = 0;
      let readinessConflictCount = 0;

      const baseReadinessProps: any = {
        license: {
          status: 'Active',
          planTier: 'Growth',
          isTampered: false,
          limits: { maxStaff: 10 },
        },
        clinicName: 'St. Jude Clinic',
        letterheadAddress: '123 Rizal Ave, Manila',
        letterheadContact: '0917-000-0000',
        accreditationNumber: 'PHIC-001',
        operatingHours: 'Mon-Fri 8am-5pm',
        letterheadDohLto: 'DOH-LTO-04A-2026-0089',
        dohLtoExpiryDate: '2028-06-30',
        ltoEvidenceObjectKey: 'lto/existing.pdf',
        staff: [
          { id: 'd1', role: 'Doctor', isActive: true, prcLicenseNumber: '0123456' },
          { id: 'r1', role: 'Receptionist', isActive: true },
        ],
        services: [{ id: 's1', isActive: true, name: 'Consult', category: 'Consultation', standardPrice: 500 }],
        roles: [],
        platformVerificationStatus: 'Unverified',
        onSaveDohLto: async (dohLto: string, expiry?: string | null) => {
          savedLtoCalls.push({ dohLto, dohLtoExpiryDate: expiry ?? null });
          return true;
        },
        onUploadLtoProof: async () => {
          readinessConflictCount += 1;
          return false;
        },
        onSubmitVerification: async () => {
          submitCalls += 1;
        },
        onNavigateTab: () => {},
        onOpenAddStaff: () => {},
        onOpenAddService: () => {},
        onOpenLicenseModal: () => {},
      };

      const readinessHarness = createLocalHookHarness(
        (props: any) => FacilityReadinessTab(props),
        baseReadinessProps,
      );

      // 1) Invalid LTO expiry blocks submit & disables Save LTO
      const expiryInput = findNodeByTestId(
        readinessHarness.result.current,
        'readiness-input-doh-lto-expiry',
      );
      expect(expiryInput).not.toBeNull();
      expiryInput.props.onChangeText('2026-02-29');

      const saveLtoBtnDisabled = findNodeByTestId(readinessHarness.result.current, 'btn-save-doh-lto');
      expect(saveLtoBtnDisabled.props.disabled).toBe(true);

      const submitBtn = findNodeByTestId(readinessHarness.result.current, 'btn-submit-verification');
      await submitBtn.props.onPress();
      expect(submitCalls).toBe(0);
      expect(savedLtoCalls).toHaveLength(0);

      // 2) Clearing expiry passes null -> buildDohLtoSettingsPayload maps to clearDohLtoExpiryDate: true
      findNodeByTestId(readinessHarness.result.current, 'readiness-input-doh-lto-expiry').props.onChangeText('');
      const saveLtoBtnEnabled = findNodeByTestId(readinessHarness.result.current, 'btn-save-doh-lto');
      expect(saveLtoBtnEnabled.props.disabled).toBe(false);
      await saveLtoBtnEnabled.props.onPress();
      expect(savedLtoCalls[0]).toEqual({ dohLto: 'DOH-LTO-04A-2026-0089', dohLtoExpiryDate: null });
      expect(
        buildDohLtoSettingsPayload({
          dohLto: savedLtoCalls[0].dohLto,
          dohLtoExpiryDate: savedLtoCalls[0].dohLtoExpiryDate ?? '',
          previousDohLtoExpiryDate: '2028-06-30',
          skipPendingVerificationSync: true,
        }),
      ).toEqual({
        letterheadDohLto: 'DOH-LTO-04A-2026-0089',
        clearDohLtoExpiryDate: true,
        skipPendingVerificationSync: true,
      });

      // 3) PendingReview LTO proof upload failure (409) does not mark local file replaced & LTO save surfaces conflict false
      readinessHarness.rerender({
        ...baseReadinessProps,
        platformVerificationStatus: 'PendingReview',
        onSaveDohLto: async (dohLto: string, expiry?: string | null) => {
          savedLtoCalls.push({ dohLto, dohLtoExpiryDate: expiry ?? null });
          readinessConflictCount += 1;
          return false;
        },
      });
      mockPickedDocumentResult = {
        canceled: false,
        assets: [{ uri: 'file:///lto-new.pdf', name: 'lto-new.pdf', mimeType: 'application/pdf', size: 1024 }],
      };
      await findNodeByTestId(readinessHarness.result.current, 'btn-upload-lto-proof').props.onPress();
      expect(readinessConflictCount).toBe(1);
      findNodeByTestId(readinessHarness.result.current, 'readiness-input-doh-lto').props.onChangeText(
        'DOH-LTO-NEW-2027',
      );
      await findNodeByTestId(readinessHarness.result.current, 'btn-save-doh-lto').props.onPress();
      expect(readinessConflictCount).toBe(2);
      readinessHarness.unmount();

      // B) DoctorRosterCalendarModal: PendingVerification -> updatePendingStaffVerification vs PendingReview -> updatePendingDirectoryVerification, plus 409 on save & delete
      const rosterCalls: string[] = [];
      let rosterRefreshCount = 0;

      clinicService.getDoctorScheduleTemplates = (async () => [
        [
          {
            id: 'tpl-mon',
            doctorId: 'doc-pending',
            dayOfWeek: 'Monday',
            startTime: '09:00:00',
            endTime: '17:00:00',
            isOvernightShift: false,
            slotDurationMinutes: 30,
            isActive: true,
            breaks: [],
          },
        ],
        null,
      ]) as any;
      clinicService.getDoctorLeaves = (async () => [[], null]) as any;
      clinicService.upsertDoctorScheduleTemplate = (async (_docId: string, payload: any) => {
        expect(payload.skipPendingVerificationSync).toBe(true);
        rosterCalls.push(`upsert:${payload.dayOfWeek}`);
        return [{ id: 'tpl-mon' }, null];
      }) as any;
      clinicService.deleteDoctorScheduleTemplate = (async (_docId: string, tplId: string, opts?: any) => {
        expect(opts?.skipPendingVerificationSync).toBe(true);
        rosterCalls.push(`delete:${tplId}`);
        return [true, null];
      }) as any;
      clinicService.updatePendingStaffVerification = (async (docId: string) => {
        rosterCalls.push(`pendingStaff:${docId}`);
        return [
          null,
          new ApiError('Practitioner no longer pending.', 409, [], PENDING_VERIFICATION_CONFLICT_CODE),
        ];
      }) as any;
      clinicService.updatePendingDirectoryVerification = (async () => {
        rosterCalls.push('pendingFacility');
        return [
          null,
          new ApiError('Facility no longer pending.', 409, [], PENDING_VERIFICATION_CONFLICT_CODE),
        ];
      }) as any;

      const docPending: any = {
        id: 'doc-pending',
        firstName: 'Ana',
        lastName: 'Cruz',
        role: 'Doctor',
        isActive: true,
        isDirectoryOptIn: true,
        publicVerificationStatus: 'PendingVerification',
      };
      const docVerified: any = {
        id: 'doc-verified',
        firstName: 'Jose',
        lastName: 'Reyes',
        role: 'Doctor',
        isActive: true,
        isDirectoryOptIn: true,
        publicVerificationStatus: 'Verified',
      };

      const rosterHarness = createLocalHookHarness((props: any) => DoctorRosterCalendarModal(props), {
        visible: true,
        onClose: () => {},
        doctors: [docPending, docVerified],
        initialDoctorId: 'doc-pending',
        platformVerificationStatus: 'PendingReview',
        onRefreshVerificationState: async () => {
          rosterRefreshCount += 1;
        },
      });
      await Promise.resolve();
      await Promise.resolve();

      // 1) PendingVerification doctor save -> routes to updatePendingStaffVerification & 409 refreshes
      const saveRosterBtn1 = findNode(
        rosterHarness.result.current,
        (el) =>
          el?.props?.title === PENDING_VERIFICATION_BUTTON_LABEL &&
          typeof el?.props?.onPress === 'function',
      );
      expect(saveRosterBtn1).not.toBeNull();
      await saveRosterBtn1.props.onPress();
      expect(rosterCalls).toEqual(['upsert:Monday', 'pendingStaff:doc-pending']);
      expect(rosterRefreshCount).toBe(1);

      // 2) PendingVerification doctor delete -> Alert confirm -> routes to updatePendingStaffVerification & 409 refreshes
      resetFeedbackState();
      const removeBtn1 = findNode(
        rosterHarness.result.current,
        (el) =>
          el?.props?.title === 'Remove Monday Schedule' &&
          typeof el?.props?.onPress === 'function',
      );
      expect(removeBtn1).not.toBeNull();
      removeBtn1.props.onPress();
      const alerts1 = getFeedbackState().alerts;
      expect(alerts1.length).toBe(1);
      const confirmDeleteBtn1 = alerts1[0].buttons.find((b) => b.text === 'Remove Day');
      await confirmDeleteBtn1?.onPress?.();
      expect(rosterCalls.slice(2)).toEqual(['delete:tpl-mon', 'pendingStaff:doc-pending']);
      expect(rosterRefreshCount).toBe(2);

      // 3) Verified opted-in doctor under PendingReview facility -> routes to updatePendingDirectoryVerification on save & delete
      rosterHarness.rerender({
        visible: true,
        onClose: () => {},
        doctors: [docPending, docVerified],
        initialDoctorId: 'doc-verified',
        platformVerificationStatus: 'PendingReview',
        onRefreshVerificationState: async () => {
          rosterRefreshCount += 1;
        },
      });
      await Promise.resolve();
      await Promise.resolve();

      const saveRosterBtn2 = findNode(
        rosterHarness.result.current,
        (el) =>
          el?.props?.title === PENDING_VERIFICATION_BUTTON_LABEL &&
          typeof el?.props?.onPress === 'function',
      );
      await saveRosterBtn2.props.onPress();
      expect(rosterCalls.slice(4)).toEqual(['upsert:Monday', 'pendingFacility']);
      expect(rosterRefreshCount).toBe(3);

      resetFeedbackState();
      findNode(
        rosterHarness.result.current,
        (el) =>
          el?.props?.title === 'Remove Monday Schedule' &&
          typeof el?.props?.onPress === 'function',
      ).props.onPress();
      const confirmDeleteBtn2 = getFeedbackState().alerts[0].buttons.find((b) => b.text === 'Remove Day');
      await confirmDeleteBtn2?.onPress?.();
      expect(rosterCalls.slice(6)).toEqual(['delete:tpl-mon', 'pendingFacility']);
      expect(rosterRefreshCount).toBe(4);
      rosterHarness.unmount();

      // C) DocumentTemplatesSettingsTab: 409 refresh + clearing defaultApproverName sends ""
      const docPayloads: any[] = [];
      let docRefreshCount = 0;
      clinicService.updateSettings = (async (payload: any) => {
        docPayloads.push(payload);
        return [
          {
            id: 'set-1',
            tenantId: 't-1',
            clinicId: 'c-1',
            clinicName: 'St. Jude Clinic',
            operatingHours: '8AM-5PM',
            defaultSlotDurationMinutes: 30,
            queuePrefix: 'Q',
            invoicePrefix: 'INV',
            defaultConsultationFee: 500,
            vatRate: 0.12,
            defaultApproverName: payload.defaultApproverName || null,
            defaultApproverTitle: payload.defaultApproverTitle || null,
            platformVerificationStatus: 'PendingReview',
          },
          null,
        ];
      }) as any;
      clinicService.updatePendingDirectoryVerification = (async () => [
        null,
        new ApiError('Facility review completed.', 409, [], PENDING_VERIFICATION_CONFLICT_CODE),
      ]) as any;

      const docHarness = createLocalHookHarness(
        (props: any) => DocumentTemplatesSettingsTab(props),
        {
          settings: {
            id: 'set-1',
            tenantId: 't-1',
            clinicId: 'c-1',
            clinicName: 'St. Jude Clinic',
            operatingHours: '8AM-5PM',
            defaultSlotDurationMinutes: 30,
            queuePrefix: 'Q',
            invoicePrefix: 'INV',
            defaultConsultationFee: 500,
            vatRate: 0.12,
            defaultApproverName: 'Dr. Old Approver',
            defaultApproverTitle: 'Medical Director',
            platformVerificationStatus: 'PendingReview',
          } as any,
          platformVerificationStatus: 'PendingReview',
          onRefreshVerificationState: async () => {
            docRefreshCount += 1;
          },
        },
      );

      findNodeByTestId(docHarness.result.current, 'input-default-approver-name').props.onChangeText('');
      await findNodeByTestId(docHarness.result.current, 'btn-save-settings').props.onPress();
      expect(docPayloads[0].skipPendingVerificationSync).toBe(true);
      expect(docPayloads[0].defaultApproverName).toBe('');
      expect(docRefreshCount).toBe(1);
      docHarness.unmount();

      // D) ClinicalSpecialtyCard: 409 triggers refresh vs 503 partial failure preserves updated settings without conflict refresh
      const specialtySettingsUpdates: any[] = [];
      let specialtyRefreshCount = 0;
      let pendingMode: '409' | '503' = '409';

      clinicService.updateSettings = (async (payload: any) => [
        {
          id: 'set-1',
          tenantId: 't-1',
          clinicId: 'c-1',
          clinicName: 'St. Jude Clinic',
          operatingHours: '8AM-5PM',
          defaultSlotDurationMinutes: 30,
          queuePrefix: 'Q',
          invoicePrefix: 'INV',
          defaultConsultationFee: 500,
          vatRate: 0.12,
          specialtyMode: payload.specialtyMode,
          enableDentalModule: payload.enableDentalModule,
          platformVerificationStatus: 'PendingReview',
        },
        null,
      ]) as any;
      clinicService.updatePendingDirectoryVerification = (async () =>
        pendingMode === '409'
          ? [null, new ApiError('No longer pending.', 409, [], PENDING_VERIFICATION_CONFLICT_CODE)]
          : [null, new ApiError('Portal sync timed out.', 503, [], 'SERVICE_UNAVAILABLE')]) as any;

      const specialtyHarness = createLocalHookHarness(
        (props: any) => ClinicalSpecialtyCard(props),
        {
          settings: {
            id: 'set-1',
            tenantId: 't-1',
            clinicId: 'c-1',
            clinicName: 'St. Jude Clinic',
            specialtyMode: 'Medical',
            enableDentalModule: false,
            platformVerificationStatus: 'PendingReview',
          } as any,
          showSkeletons: false,
          platformVerificationStatus: 'PendingReview',
          onSettingsUpdated: (u: any) => specialtySettingsUpdates.push(u),
          onRefreshVerificationState: async () => {
            specialtyRefreshCount += 1;
          },
        },
      );

      // Select Dental -> save with 409
      const dentalRadio = findNode(
        specialtyHarness.result.current,
        (el) =>
          el?.props?.accessibilityRole === 'radio' &&
          typeof el?.props?.accessibilityLabel === 'string' &&
          el.props.accessibilityLabel.startsWith('Dental Practice'),
      );
      expect(dentalRadio).not.toBeNull();
      dentalRadio.props.onPress();
      const saveSpecBtn409 = findNode(
        specialtyHarness.result.current,
        (el) =>
          el?.props?.title === PENDING_VERIFICATION_BUTTON_LABEL &&
          typeof el?.props?.onPress === 'function',
      );
      await saveSpecBtn409.props.onPress();
      expect(specialtySettingsUpdates).toHaveLength(1);
      expect(specialtyRefreshCount).toBe(1);

      // Select Multi-Specialty -> save with 503 partial failure (no 409 refresh, error toast surfaced)
      pendingMode = '503';
      resetFeedbackState();
      const multiRadio = findNode(
        specialtyHarness.result.current,
        (el) =>
          el?.props?.accessibilityRole === 'radio' &&
          typeof el?.props?.accessibilityLabel === 'string' &&
          el.props.accessibilityLabel.startsWith('Multi-Specialty Clinic'),
      );
      multiRadio.props.onPress();
      const saveSpecBtn503 = findNode(
        specialtyHarness.result.current,
        (el) =>
          el?.props?.title === PENDING_VERIFICATION_BUTTON_LABEL &&
          typeof el?.props?.onPress === 'function',
      );
      await saveSpecBtn503.props.onPress();
      expect(specialtySettingsUpdates).toHaveLength(2);
      expect(specialtyRefreshCount).toBe(1);
      expect(getFeedbackState().toasts.some((t) => t.kind === 'error' && t.message.includes('timed out'))).toBe(
        true,
      );
      specialtyHarness.unmount();
    } finally {
      mockPickedDocumentResult = { canceled: true, assets: null };
      resetFeedbackState();
      clinicService.updateSettings = origUpdateSettings;
      clinicService.updatePendingDirectoryVerification = origUpdatePendingDir;
      clinicService.updatePendingStaffVerification = origUpdatePendingStaff;
      clinicService.getDoctorScheduleTemplates = origGetTemplates;
      clinicService.getDoctorLeaves = origGetLeaves;
      clinicService.upsertDoctorScheduleTemplate = origUpsertTemplate;
      clinicService.deleteDoctorScheduleTemplate = origDeleteTemplate;
    }
  });

  test('7. Runtime StaffManagementTab syncs editingStaff from fresh server state on 409 during edit save and PRC upload', async () => {
    const origUpdateStaff = clinicService.updateStaff;
    const origUpdatePendingStaff = clinicService.updatePendingStaffVerification;
    const origUploadPrc = clinicService.uploadStaffPrcProof;
    const origGetStaff = clinicService.getStaff;

    const basePendingDoctor: any = {
      id: 'doc-pending-409',
      tenantId: 't-1',
      clinicId: 'c-1',
      firstName: 'Ana',
      lastName: 'Cruz',
      role: 'Doctor',
      email: 'ana@clinic.ph',
      prcLicenseNumber: '0123456',
      prcExpiryDate: '2029-12-31',
      prcEvidenceObjectKey: 'prc/old-proof.pdf',
      verificationContact: 'ana@clinic.ph',
      isDirectoryOptIn: true,
      publicVerificationStatus: 'PendingVerification',
      isActive: true,
      status: 'Active',
      createdAt: '2026-01-01T00:00:00Z',
    };

    try {
      // Scenario A: handleSaveEditStaff receives 409 -> refreshes editingStaff to Verified even standalone
      let currentStaffState: any[] = [basePendingDoctor];
      let verificationRefreshCount = 0;

      clinicService.updateStaff = (async (_id: string, payload: any) => {
        expect(payload.skipPendingVerificationSync).toBe(true);
        return [{ ...basePendingDoctor, firstName: payload.firstName }, null];
      }) as any;
      clinicService.updatePendingStaffVerification = (async () => [
        null,
        new ApiError('Submission is no longer pending review.', 409, [], PENDING_VERIFICATION_CONFLICT_CODE),
      ]) as any;
      clinicService.getStaff = (async () => [
        [{ ...basePendingDoctor, publicVerificationStatus: 'Verified' }],
        null,
      ]) as any;

      const harnessA = createLocalHookHarness((props: any) => StaffManagementTab(props), {
        staff: currentStaffState,
        setStaff: (updater: any) => {
          currentStaffState = typeof updater === 'function' ? updater(currentStaffState) : updater;
        },
        roles: [],
        staffLoadError: null,
        showSkeletons: false,
        activeStaffCount: 1,
        maxStaffSeats: 10,
        onRefreshStaff: async () => {},
        showAddModal: false,
        setShowAddModal: () => {},
        onStaffAdded: async () => {},
        platformVerificationStatus: 'Unverified',
        onRefreshVerificationState: async () => {
          verificationRefreshCount += 1;
        },
      });

      const editBtn = findNode(
        harnessA.result.current,
        (el) => el?.props?.title === 'Edit' && typeof el?.props?.onPress === 'function',
      );
      expect(editBtn).not.toBeNull();
      editBtn.props.onPress();

      expect(findNodeByTestId(harnessA.result.current, 'staff-edit-pending-helper-note')).not.toBeNull();
      const savePendingBtn = findNode(
        harnessA.result.current,
        (el) =>
          el?.props?.title === PENDING_VERIFICATION_BUTTON_LABEL &&
          typeof el?.props?.onPress === 'function',
      );
      expect(savePendingBtn).not.toBeNull();

      await savePendingBtn.props.onPress();
      expect(verificationRefreshCount).toBe(1);

      // Modal remains open with refreshed server status (Verified -> Save Changes, no pending helper note)
      expect(findNodeByTestId(harnessA.result.current, 'staff-edit-pending-helper-note')).toBeNull();
      expect(findNodeByTestId(harnessA.result.current, 'staff-prc-pending-helper-note')).toBeNull();
      const postConflictSaveBtn = findNode(
        harnessA.result.current,
        (el) => el?.props?.title === 'Save Changes' && typeof el?.props?.onPress === 'function',
      );
      expect(postConflictSaveBtn).not.toBeNull();
      harnessA.unmount();

      // Scenario B: handlePickOrUploadPrcProof receives 409 -> refreshes editingStaff to Rejected
      let staffStateB: any[] = [basePendingDoctor];
      mockPickedDocumentResult = {
        canceled: false,
        assets: [{ uri: 'file:///prc-new.pdf', name: 'prc-new.pdf', mimeType: 'application/pdf', size: 1024 }],
      };
      clinicService.uploadStaffPrcProof = (async (_id: string, _form: any, _name?: any, opts?: any) => {
        expect(opts?.skipPendingVerificationSync).toBe(true);
        return [{ objectKey: 'prc/new-proof.pdf' }, null];
      }) as any;
      clinicService.updatePendingStaffVerification = (async () => [
        null,
        new ApiError('Already rejected on Portal.', 409, [], PENDING_VERIFICATION_CONFLICT_CODE),
      ]) as any;
      clinicService.getStaff = (async () => [
        [
          {
            ...basePendingDoctor,
            prcEvidenceObjectKey: 'prc/new-proof.pdf',
            publicVerificationStatus: 'Rejected',
            publicVerificationReason: 'PRC photo blurry',
          },
        ],
        null,
      ]) as any;

      const harnessB = createLocalHookHarness((props: any) => StaffManagementTab(props), {
        staff: staffStateB,
        setStaff: (updater: any) => {
          staffStateB = typeof updater === 'function' ? updater(staffStateB) : updater;
        },
        roles: [],
        staffLoadError: null,
        showSkeletons: false,
        activeStaffCount: 1,
        maxStaffSeats: 10,
        onRefreshStaff: async () => {},
        showAddModal: false,
        setShowAddModal: () => {},
        onStaffAdded: async () => {},
        platformVerificationStatus: 'Unverified',
        onRefreshVerificationState: async () => {},
      });

      const editBtnB = findNode(
        harnessB.result.current,
        (el) => el?.props?.title === 'Edit' && typeof el?.props?.onPress === 'function',
      );
      editBtnB.props.onPress();

      const uploadBtn = findNodeByTestId(harnessB.result.current, 'btn-upload-prc-proof-edit');
      expect(uploadBtn).not.toBeNull();
      await uploadBtn.props.onPress();

      // Modal refreshes to Rejected -> Save & Submit for Verification, no pending helper note
      expect(findNodeByTestId(harnessB.result.current, 'staff-edit-pending-helper-note')).toBeNull();
      expect(findNodeByTestId(harnessB.result.current, 'staff-prc-pending-helper-note')).toBeNull();
      const resubmitBtn = findNode(
        harnessB.result.current,
        (el) =>
          el?.props?.title === 'Save & Submit for Verification' &&
          typeof el?.props?.onPress === 'function',
      );
      expect(resubmitBtn).not.toBeNull();
      harnessB.unmount();

      // Scenario C: Parent `staff` prop refresh via useEffect also syncs open Edit Staff modal
      const basePropsC = {
        staff: [basePendingDoctor],
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
        platformVerificationStatus: 'Unverified' as const,
        onRefreshVerificationState: async () => {},
      };
      const harnessC = createLocalHookHarness((props: any) => StaffManagementTab(props), basePropsC);
      findNode(
        harnessC.result.current,
        (el) => el?.props?.title === 'Edit' && typeof el?.props?.onPress === 'function',
      ).props.onPress();
      expect(findNodeByTestId(harnessC.result.current, 'staff-edit-pending-helper-note')).not.toBeNull();

      harnessC.rerender({
        ...basePropsC,
        staff: [{ ...basePendingDoctor, publicVerificationStatus: 'Verified' }],
      });
      expect(findNodeByTestId(harnessC.result.current, 'staff-edit-pending-helper-note')).toBeNull();
      expect(
        findNode(
          harnessC.result.current,
          (el) => el?.props?.title === 'Save Changes' && typeof el?.props?.onPress === 'function',
        ),
      ).not.toBeNull();
      harnessC.unmount();
    } finally {
      mockPickedDocumentResult = { canceled: true, assets: null };
      clinicService.updateStaff = origUpdateStaff;
      clinicService.updatePendingStaffVerification = origUpdatePendingStaff;
      clinicService.uploadStaffPrcProof = origUploadPrc;
      clinicService.getStaff = origGetStaff;
    }
  });

  test('8. Runtime StaffManagementTab PRC upload only triggers facility /pending sync for bundled active clinicians', async () => {
    const origUploadPrc = clinicService.uploadStaffPrcProof;
    const origUpdatePendingDir = clinicService.updatePendingDirectoryVerification;

    try {
      mockPickedDocumentResult = {
        canceled: false,
        assets: [{ uri: 'file:///prc.pdf', name: 'prc.pdf', mimeType: 'application/pdf', size: 1024 }],
      };

      const uploadCalls: Array<{ staffId: string; skipSync?: boolean }> = [];
      let pendingDirCallCount = 0;

      clinicService.uploadStaffPrcProof = (async (staffId: string, _form: any, _name?: any, opts?: any) => {
        uploadCalls.push({ staffId, skipSync: opts?.skipPendingVerificationSync });
        return [{ objectKey: `prc/${staffId}-new.pdf` }, null];
      }) as any;
      clinicService.updatePendingDirectoryVerification = (async () => {
        pendingDirCallCount += 1;
        return [{ success: true }, null];
      }) as any;

      const rejectedDoc: any = {
        id: 'doc-rejected',
        tenantId: 't-1',
        clinicId: 'c-1',
        firstName: 'Rej',
        lastName: 'Doctor',
        role: 'Doctor',
        email: 'rej@clinic.ph',
        prcLicenseNumber: '1111111',
        isDirectoryOptIn: true,
        publicVerificationStatus: 'Rejected',
        isActive: true,
        status: 'Active',
        createdAt: '2026-01-01T00:00:00Z',
      };
      const unverifiedDoc: any = {
        id: 'doc-unverified',
        tenantId: 't-1',
        clinicId: 'c-1',
        firstName: 'Unv',
        lastName: 'Doctor',
        role: 'Doctor',
        email: 'unv@clinic.ph',
        prcLicenseNumber: '2222222',
        isDirectoryOptIn: false,
        publicVerificationStatus: 'Unverified',
        isActive: true,
        status: 'Active',
        createdAt: '2026-01-01T00:00:00Z',
      };
      const verifiedDoc: any = {
        id: 'doc-verified',
        tenantId: 't-1',
        clinicId: 'c-1',
        firstName: 'Ver',
        lastName: 'Doctor',
        role: 'Doctor',
        email: 'ver@clinic.ph',
        prcLicenseNumber: '3333333',
        prcExpiryDate: '2029-01-01',
        prcEvidenceObjectKey: 'prc/ver-old.pdf',
        verificationContact: 'ver@clinic.ph',
        isDirectoryOptIn: true,
        publicVerificationStatus: 'Verified',
        isActive: true,
        status: 'Active',
        createdAt: '2026-01-01T00:00:00Z',
      };

      // Case 1: Rejected clinician under PendingReview facility -> NO skipPendingVerificationSync, NO updatePendingDirectoryVerification
      let staffList = [rejectedDoc, unverifiedDoc, verifiedDoc];
      const harness = createLocalHookHarness((props: any) => StaffManagementTab(props), {
        staff: staffList,
        setStaff: (updater: any) => {
          staffList = typeof updater === 'function' ? updater(staffList) : updater;
        },
        roles: [],
        staffLoadError: null,
        showSkeletons: false,
        activeStaffCount: 3,
        maxStaffSeats: 10,
        onRefreshStaff: async () => {},
        showAddModal: false,
        setShowAddModal: () => {},
        onStaffAdded: async () => {},
        platformVerificationStatus: 'PendingReview',
        onRefreshVerificationState: async () => {},
      });

      const editButtons: any[] = [];
      const collectEditButtons = (node: any) => {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) {
          node.forEach(collectEditButtons);
          return;
        }
        if (node?.props?.title === 'Edit' && typeof node?.props?.onPress === 'function') {
          editButtons.push(node);
        }
        if (node?.props?.children) collectEditButtons(node.props.children);
      };
      collectEditButtons(harness.result.current);
      expect(editButtons.length).toBe(3);

      // 1) Rejected clinician
      editButtons[0].props.onPress();
      await findNodeByTestId(harness.result.current, 'btn-upload-prc-proof-edit').props.onPress();
      expect(uploadCalls[0]).toEqual({ staffId: 'doc-rejected', skipSync: undefined });
      expect(pendingDirCallCount).toBe(0);

      // 2) Unverified clinician with unsaved opt-in toggle ON
      editButtons[1].props.onPress();
      findNodeByTestId(harness.result.current, 'switch-directory-opt-in-edit').props.onValueChange(true);
      await findNodeByTestId(harness.result.current, 'btn-upload-prc-proof-edit').props.onPress();
      expect(uploadCalls[1]).toEqual({ staffId: 'doc-unverified', skipSync: undefined });
      expect(pendingDirCallCount).toBe(0);

      // 3) Verified opted-in clinician (PRC unchanged) under PendingReview facility -> DOES sync facility pending
      editButtons[2].props.onPress();
      await findNodeByTestId(harness.result.current, 'btn-upload-prc-proof-edit').props.onPress();
      expect(uploadCalls[2]).toEqual({ staffId: 'doc-verified', skipSync: true });
      expect(pendingDirCallCount).toBe(1);

      harness.unmount();
    } finally {
      mockPickedDocumentResult = { canceled: true, assets: null };
      clinicService.uploadStaffPrcProof = origUploadPrc;
      clinicService.updatePendingDirectoryVerification = origUpdatePendingDir;
    }
  });

  test('9. Runtime ServicesCatalogTab refreshes verification state on 409 during toggle and seedDentalServices', async () => {
    const origUpdateService = clinicService.updateService;
    const origSeedDental = clinicService.seedDentalServices;
    const origUpdatePendingDir = clinicService.updatePendingDirectoryVerification;

    try {
      let servicesState: any[] = [
        {
          id: 'svc-1',
          code: 'CON-01',
          name: 'General Consultation',
          category: 'Consultation',
          standardPrice: 500,
          isActive: true,
        },
      ];
      let refreshServicesCount = 0;
      let refreshVerificationCount = 0;
      const updateServicePayloads: any[] = [];
      const seedCalls: any[] = [];

      clinicService.updateService = (async (_id: string, payload: any) => {
        updateServicePayloads.push(payload);
        return [{ ...servicesState[0], isActive: payload.isActive }, null];
      }) as any;
      clinicService.seedDentalServices = (async (opts?: any) => {
        seedCalls.push(opts);
        return [
          [
            {
              id: 'svc-dental-1',
              code: 'DEN-01',
              name: 'Oral Prophylaxis',
              category: 'Dental',
              standardPrice: 800,
              isActive: true,
            },
          ],
          null,
        ];
      }) as any;
      clinicService.updatePendingDirectoryVerification = (async () => [
        null,
        new ApiError('Submission no longer pending.', 409, [], PENDING_VERIFICATION_CONFLICT_CODE),
      ]) as any;

      const harness = createLocalHookHarness((props: any) => ServicesCatalogTab(props), {
        services: servicesState,
        setServices: (updater: any) => {
          servicesState = typeof updater === 'function' ? updater(servicesState) : updater;
        },
        servicesLoadError: null,
        showSkeletons: false,
        onRefreshServices: async () => {
          refreshServicesCount += 1;
        },
        formatPeso: (v: any) => `PHP ${v ?? 0}`,
        platformVerificationStatus: 'PendingReview',
        onRefreshVerificationState: async () => {
          refreshVerificationCount += 1;
        },
      });

      // 1) Toggle active triggers skipPendingVerificationSync: true + 409 refresh
      const toggleBtn = findNode(
        harness.result.current,
        (el) => el?.props?.title === 'Deactivate' && typeof el?.props?.onPress === 'function',
      );
      expect(toggleBtn).not.toBeNull();
      await toggleBtn.props.onPress();

      expect(updateServicePayloads[0].skipPendingVerificationSync).toBe(true);
      expect(refreshServicesCount).toBe(1);
      expect(refreshVerificationCount).toBe(1);

      // 2) Switch to Dental category (empty) and trigger Seed Dental Services -> 409 refresh
      const dentalChip = findNode(
        harness.result.current,
        (el) =>
          typeof el?.props?.label === 'string' &&
          el.props.label.startsWith('Dental') &&
          typeof el?.props?.onPress === 'function',
      );
      expect(dentalChip).not.toBeNull();
      dentalChip.props.onPress();

      const emptyStateNode = findNode(
        harness.result.current,
        (el) =>
          el?.props?.actionTitle === 'Seed Dental Services' &&
          typeof el?.props?.onAction === 'function',
      );
      expect(emptyStateNode).not.toBeNull();
      await emptyStateNode.props.onAction();

      expect(seedCalls[0]).toEqual({ skipPendingVerificationSync: true });
      expect(refreshServicesCount).toBe(3); // once in handleSeedDentalServices + once in 409 refresh
      expect(refreshVerificationCount).toBe(2);

      harness.unmount();
    } finally {
      clinicService.updateService = origUpdateService;
      clinicService.seedDentalServices = origSeedDental;
      clinicService.updatePendingDirectoryVerification = origUpdatePendingDir;
    }
  });

  test('10. Runtime StaffManagementTab clearing publicBio & verificationContact sends "" (not null) under PendingVerification / PendingReview', async () => {
    const origUpdateStaff = clinicService.updateStaff;
    const origUpdatePendingStaff = clinicService.updatePendingStaffVerification;

    try {
      const capturedPayloads: any[] = [];
      let pendingStaffCalls = 0;

      const doctorWithBio: any = {
        id: 'staff-bio-1',
        tenantId: 't-1',
        clinicId: 'c-1',
        firstName: 'Jose',
        lastName: 'Rizal',
        role: 'Doctor',
        email: 'rizal@clinic.ph',
        prcLicenseNumber: '0123456',
        prcExpiryDate: '2029-12-31',
        prcEvidenceObjectKey: 'prc/rizal.pdf',
        verificationContact: 'rizal@clinic.ph',
        publicBio: 'Senior Cardiology Consultant',
        isDirectoryOptIn: true,
        publicVerificationStatus: 'PendingVerification',
        isActive: true,
        status: 'Active',
        createdAt: '2026-01-01T00:00:00Z',
      };

      let staffState: any[] = [doctorWithBio];
      clinicService.updateStaff = (async (_id: string, payload: any) => {
        capturedPayloads.push(payload);
        return [
          {
            ...doctorWithBio,
            publicBio: payload.publicBio || null,
            verificationContact: payload.verificationContact || null,
            isDirectoryOptIn: payload.isDirectoryOptIn,
          },
          null,
        ];
      }) as any;
      clinicService.updatePendingStaffVerification = (async () => {
        pendingStaffCalls += 1;
        return [{ ...doctorWithBio, publicBio: null }, null];
      }) as any;

      const makeStaffProps = (): any => ({
        staff: staffState,
        setStaff: (updater: any) => {
          staffState = typeof updater === 'function' ? updater(staffState) : updater;
          harness.rerender(makeStaffProps());
        },
        roles: [],
        staffLoadError: null,
        showSkeletons: false,
        activeStaffCount: 1,
        maxStaffSeats: 10,
        onRefreshStaff: async () => {},
        showAddModal: false,
        setShowAddModal: () => {},
        onStaffAdded: async () => {},
        platformVerificationStatus: 'PendingReview',
        onRefreshVerificationState: async () => {},
      });

      const harness = createLocalHookHarness((props: any) => StaffManagementTab(props), {
        staff: staffState,
        setStaff: (updater: any) => {
          staffState = typeof updater === 'function' ? updater(staffState) : updater;
        },
        roles: [],
        staffLoadError: null,
        showSkeletons: false,
        activeStaffCount: 1,
        maxStaffSeats: 10,
        onRefreshStaff: async () => {},
        showAddModal: false,
        setShowAddModal: () => {},
        onStaffAdded: async () => {},
        platformVerificationStatus: 'PendingReview',
        onRefreshVerificationState: async () => {},
      });
      harness.rerender(makeStaffProps());

      // Open Edit Staff modal
      findNode(
        harness.result.current,
        (el) => el?.props?.title === 'Edit' && typeof el?.props?.onPress === 'function',
      ).props.onPress();

      // Clear Public Bio to "" while opted in under PendingVerification -> sends publicBio: ""
      const bioInput = findNode(
        harness.result.current,
        (el) => el?.props?.label === 'Public Bio' && typeof el?.props?.onChangeText === 'function',
      );
      expect(bioInput).not.toBeNull();
      bioInput.props.onChangeText('');

      const saveBtn = findNode(
        harness.result.current,
        (el) =>
          el?.props?.title === PENDING_VERIFICATION_BUTTON_LABEL &&
          typeof el?.props?.onPress === 'function',
      );
      expect(saveBtn).not.toBeNull();
      await saveBtn.props.onPress();

      expect(capturedPayloads).toHaveLength(1);
      expect(capturedPayloads[0].publicBio).toBe('');
      expect(capturedPayloads[0].publicBio).not.toBeNull();
      expect(capturedPayloads[0].verificationContact).toBe('rizal@clinic.ph');
      expect(capturedPayloads[0].skipPendingVerificationSync).toBe(true);
      expect(pendingStaffCalls).toBe(1);

      // Re-open Edit modal, clear Verification Contact + toggle opt-out -> sends verificationContact: "" & publicBio: ""
      findNode(
        harness.result.current,
        (el) => el?.props?.title === 'Edit' && typeof el?.props?.onPress === 'function',
      ).props.onPress();
      const contactInput = findNode(
        harness.result.current,
        (el) =>
          el?.props?.label === 'Verification Contact' &&
          typeof el?.props?.onChangeText === 'function',
      );
      contactInput.props.onChangeText('   ');
      findNodeByTestId(harness.result.current, 'switch-directory-opt-in-edit').props.onValueChange(
        false,
      );
      const saveChangesBtn = findNode(
        harness.result.current,
        (el) => el?.props?.title === 'Save Changes' && typeof el?.props?.onPress === 'function',
      );
      await saveChangesBtn.props.onPress();

      expect(capturedPayloads).toHaveLength(2);
      expect(capturedPayloads[1].verificationContact).toBe('');
      expect(capturedPayloads[1].publicBio).toBe('');

      harness.unmount();
    } finally {
      clinicService.updateStaff = origUpdateStaff;
      clinicService.updatePendingStaffVerification = origUpdatePendingStaff;
    }
  });

  test('11. Runtime ServicesCatalogTab Add & Edit Modals close after CRUD succeeds even when /pending returns 409 or 503', async () => {
    const origCreateService = clinicService.createService;
    const origUpdateService = clinicService.updateService;
    const origUpdatePendingDir = clinicService.updatePendingDirectoryVerification;

    try {
      const callSequence: string[] = [];
      let pendingStatusToReturn: 409 | 503 = 409;

      clinicService.createService = (async (payload: any) => {
        callSequence.push(`createService:${payload.code}`);
        return [
          {
            id: `svc-${callSequence.length}`,
            code: payload.code,
            name: payload.name,
            category: payload.category,
            standardPrice: payload.standardPrice,
            isActive: true,
          },
          null,
        ];
      }) as any;

      clinicService.updateService = (async (id: string, payload: any) => {
        callSequence.push(`updateService:${id}`);
        return [
          {
            id,
            code: 'LAB-CBC',
            name: payload.name,
            category: payload.category,
            standardPrice: payload.standardPrice,
            isActive: payload.isActive ?? true,
          },
          null,
        ];
      }) as any;

      clinicService.updatePendingDirectoryVerification = (async () => {
        callSequence.push(`updatePending:${pendingStatusToReturn}`);
        if (pendingStatusToReturn === 409) {
          return [
            null,
            new ApiError('Submission is no longer pending review.', 409, [], PENDING_VERIFICATION_CONFLICT_CODE),
          ];
        }
        return [null, new ApiError('Service unavailable (timeout).', 503, [], 'SERVICE_UNAVAILABLE')];
      }) as any;

      let refreshServicesCount = 0;
      let refreshVerificationCount = 0;

      // Stateful wrapper matching Settings.screen.tsx parent ownership of services + showAddModal
      function ServicesWrapper() {
        const [services, setServices] = React.useState<any[]>([]);
        const [showAddModal, setShowAddModal] = React.useState(false);
        return React.createElement(ServicesCatalogTab, {
          services,
          setServices,
          servicesLoadError: null,
          showSkeletons: false,
          onRefreshServices: async () => {
            refreshServicesCount += 1;
          },
          formatPeso: (v: any) => `PHP ${v ?? 0}`,
          showAddModal,
          setShowAddModal,
          platformVerificationStatus: 'PendingReview',
          onRefreshVerificationState: async () => {
            refreshVerificationCount += 1;
          },
        });
      }

      // Use a small recursive harness via ServicesCatalogTab directly with external state tracked by harness
      let servicesState: any[] = [];
      let showAddModalState = false;
      const harness = createLocalHookHarness(
        (props: any) => ServicesCatalogTab(props),
        {
          services: servicesState,
          setServices: (updater: any) => {
            servicesState = typeof updater === 'function' ? updater(servicesState) : updater;
          },
          servicesLoadError: null,
          showSkeletons: false,
          onRefreshServices: async () => {
            refreshServicesCount += 1;
          },
          formatPeso: (v: any) => `PHP ${v ?? 0}`,
          showAddModal: showAddModalState,
          setShowAddModal: (next: boolean) => {
            showAddModalState = next;
            harness.rerender({
              services: servicesState,
              setServices: (updater: any) => {
                servicesState = typeof updater === 'function' ? updater(servicesState) : updater;
              },
              servicesLoadError: null,
              showSkeletons: false,
              onRefreshServices: async () => {
                refreshServicesCount += 1;
              },
              formatPeso: (v: any) => `PHP ${v ?? 0}`,
              showAddModal: showAddModalState,
              setShowAddModal: (nextInner: boolean) => {
                showAddModalState = nextInner;
              },
              platformVerificationStatus: 'PendingReview',
              onRefreshVerificationState: async () => {
                refreshVerificationCount += 1;
              },
            });
          },
          platformVerificationStatus: 'PendingReview',
          onRefreshVerificationState: async () => {
            refreshVerificationCount += 1;
          },
        },
      );
      void ServicesWrapper;

      const syncProps = () => ({
        services: servicesState,
        setServices: (updater: any) => {
          servicesState = typeof updater === 'function' ? updater(servicesState) : updater;
        },
        servicesLoadError: null,
        showSkeletons: false,
        onRefreshServices: async () => {
          refreshServicesCount += 1;
        },
        formatPeso: (v: any) => `PHP ${v ?? 0}`,
        showAddModal: showAddModalState,
        setShowAddModal: (next: boolean) => {
          showAddModalState = next;
          harness.rerender(syncProps());
        },
        platformVerificationStatus: 'PendingReview' as const,
        onRefreshVerificationState: async () => {
          refreshVerificationCount += 1;
        },
      });
      harness.rerender(syncProps());

      // Case 1: 409 Conflict after createService succeeds -> closes Add modal & shows tab banner
      findNode(
        harness.result.current,
        (el) => el?.props?.title === 'Add service item' && typeof el?.props?.onPress === 'function',
      ).props.onPress();
      expect(showAddModalState).toBe(true);

      findNode(
        harness.result.current,
        (el) => el?.props?.label === 'Item code' && typeof el?.props?.onChangeText === 'function',
      ).props.onChangeText('LAB-CBC');
      findNode(
        harness.result.current,
        (el) =>
          el?.props?.label === 'Item description / name' &&
          typeof el?.props?.onChangeText === 'function',
      ).props.onChangeText('Complete Blood Count');
      findNode(
        harness.result.current,
        (el) =>
          el?.props?.label === 'Standard fee (₱)' && typeof el?.props?.onChangeText === 'function',
      ).props.onChangeText('350');

      const addSubmitBtn = findNode(
        harness.result.current,
        (el) =>
          el?.props?.title === PENDING_VERIFICATION_BUTTON_LABEL &&
          typeof el?.props?.onPress === 'function',
      );
      await addSubmitBtn.props.onPress();
      harness.rerender(syncProps());

      expect(showAddModalState).toBe(false);
      expect(servicesState).toHaveLength(1);
      expect(servicesState[0].code).toBe('LAB-CBC');
      expect(refreshServicesCount).toBe(1);
      expect(refreshVerificationCount).toBe(1);
      expect(callSequence).toEqual(['createService:LAB-CBC', 'updatePending:409']);
      expect(findNodeByTestId(harness.result.current, 'services-sync-error-banner')).not.toBeNull();

      // Verify Add modal is not stuck open (no modal submit button visible)
      const stuckModalBtn = findNode(
        harness.result.current,
        (el) =>
          el?.props?.title === 'Add catalog service item' && el?.props?.visible === true,
      );
      expect(stuckModalBtn).toBeNull();

      // Case 2: 503 Timeout after createService succeeds -> also closes Add modal & shows banner
      pendingStatusToReturn = 503;
      findNode(
        harness.result.current,
        (el) => el?.props?.title === 'Add service item' && typeof el?.props?.onPress === 'function',
      ).props.onPress();
      expect(showAddModalState).toBe(true);

      findNode(
        harness.result.current,
        (el) => el?.props?.label === 'Item code' && typeof el?.props?.onChangeText === 'function',
      ).props.onChangeText('LAB-UA');
      findNode(
        harness.result.current,
        (el) =>
          el?.props?.label === 'Item description / name' &&
          typeof el?.props?.onChangeText === 'function',
      ).props.onChangeText('Urinalysis');

      const addSubmitBtn2 = findNode(
        harness.result.current,
        (el) =>
          el?.props?.title === PENDING_VERIFICATION_BUTTON_LABEL &&
          typeof el?.props?.onPress === 'function',
      );
      await addSubmitBtn2.props.onPress();
      harness.rerender(syncProps());

      expect(showAddModalState).toBe(false);
      expect(servicesState).toHaveLength(2);
      expect(callSequence).toEqual([
        'createService:LAB-CBC',
        'updatePending:409',
        'createService:LAB-UA',
        'updatePending:503',
      ]);
      expect(findNodeByTestId(harness.result.current, 'services-sync-error-banner')).not.toBeNull();

      // Case 3: Edit modal closes on 503 after updateService succeeds too
      const editBtn = findNode(
        harness.result.current,
        (el) => el?.props?.title === 'Edit' && typeof el?.props?.onPress === 'function',
      );
      editBtn.props.onPress();
      const editSubmitBtn = findNode(
        harness.result.current,
        (el) =>
          el?.props?.title === PENDING_VERIFICATION_BUTTON_LABEL &&
          typeof el?.props?.onPress === 'function',
      );
      await editSubmitBtn.props.onPress();
      harness.rerender(syncProps());

      expect(callSequence[4]).toBe('updateService:svc-1');
      expect(callSequence[5]).toBe('updatePending:503');
      expect(
        findNode(
          harness.result.current,
          (el) => el?.props?.title === 'Edit catalog service item' && el?.props?.visible === true,
        ),
      ).toBeNull();
      expect(findNodeByTestId(harness.result.current, 'services-sync-error-banner')).not.toBeNull();

      harness.unmount();
    } finally {
      resetFeedbackState();
      clinicService.createService = origCreateService;
      clinicService.updateService = origUpdateService;
      clinicService.updatePendingDirectoryVerification = origUpdatePendingDir;
    }
  });

  test('12. Issue 225 — hasRegulatedPrcCredentialsChanged & clinicService.uploadStaffPrcProof stageOnly query param', async () => {
    expect(
      hasRegulatedPrcCredentialsChanged({
        previousPrcLicenseNumber: 'PRC-0123456',
        nextPrcLicenseNumber: '123456',
        previousPrcExpiryDate: '2029-01-01',
        nextPrcExpiryDate: '2029-01-01',
        previousPrcEvidenceObjectKey: 'prc/old.pdf',
        nextPrcEvidenceObjectKey: 'prc/old.pdf',
        hasPickedProofFile: false,
      }),
    ).toBe(false);

    expect(
      hasRegulatedPrcCredentialsChanged({
        previousPrcLicenseNumber: '0123456',
        nextPrcLicenseNumber: '0999888',
        previousPrcExpiryDate: '2029-01-01',
        nextPrcExpiryDate: '2029-01-01',
        previousPrcEvidenceObjectKey: 'prc/old.pdf',
        nextPrcEvidenceObjectKey: 'prc/old.pdf',
      }),
    ).toBe(true);

    expect(
      hasRegulatedPrcCredentialsChanged({
        previousPrcLicenseNumber: '0123456',
        nextPrcLicenseNumber: '0123456',
        previousPrcExpiryDate: '2029-01-01',
        nextPrcExpiryDate: '2030-06-30',
        previousPrcEvidenceObjectKey: 'prc/old.pdf',
        nextPrcEvidenceObjectKey: 'prc/old.pdf',
      }),
    ).toBe(true);

    expect(
      hasRegulatedPrcCredentialsChanged({
        previousPrcLicenseNumber: '0123456',
        nextPrcLicenseNumber: '0123456',
        previousPrcExpiryDate: '2029-01-01',
        nextPrcExpiryDate: '2029-01-01',
        previousPrcEvidenceObjectKey: 'prc/old.pdf',
        nextPrcEvidenceObjectKey: 'prc/new.pdf',
      }),
    ).toBe(true);

    expect(
      hasRegulatedPrcCredentialsChanged({
        previousPrcLicenseNumber: '0123456',
        nextPrcLicenseNumber: '0123456',
        previousPrcExpiryDate: '2029-01-01',
        nextPrcExpiryDate: '2029-01-01',
        previousPrcEvidenceObjectKey: 'prc/old.pdf',
        nextPrcEvidenceObjectKey: 'prc/old.pdf',
        hasPickedProofFile: true,
      }),
    ).toBe(true);

    const postUrls: string[] = [];
    clinicApiClient.post = (async (url: string) => {
      postUrls.push(url);
      return [{ objectKey: 'staged-key' } as any, null];
    }) as any;

    await clinicService.uploadStaffPrcProof('staff-225', new FormData(), undefined, {
      stageOnly: true,
    });
    expect(postUrls).toEqual(['/staff/staff-225/prc-proof?stageOnly=true']);
  });

  test('13. Issue 225 — Approved practitioner requires Save & Resubmit for Verification on PRC license/expiry/proof changes, preserves Save Changes for bio-only edits', async () => {
    const origUpdateStaff = clinicService.updateStaff;
    const origUploadPrc = clinicService.uploadStaffPrcProof;
    const origSubmitVerification = clinicService.submitStaffVerification;

    try {
      const approvedDoctor: any = {
        id: 'doc-approved-225',
        tenantId: 't-1',
        clinicId: 'c-1',
        firstName: 'Justine Mae',
        lastName: 'Tabasan',
        title: 'Dr.',
        role: 'Doctor',
        email: 'justine@clinic.ph',
        prcLicenseNumber: '0123456',
        prcExpiryDate: '2029-05-01',
        prcEvidenceObjectKey: 'tenants/t-1/clinics/c-1/verification/prc/doc-approved-225/old.pdf',
        verificationContact: 'justine@clinic.ph',
        publicBio: 'Family physician',
        isDirectoryOptIn: true,
        publicVerificationStatus: 'Verified',
        isActive: true,
        status: 'Active',
        createdAt: '2026-01-01T00:00:00Z',
      };

      let staffState: any[] = [approvedDoctor];
      const uploadCalls: Array<{ staffId: string; opts: any }> = [];
      const updatePayloads: any[] = [];
      let submitCalls = 0;

      clinicService.uploadStaffPrcProof = (async (staffId: string, _form: any, _name?: any, opts?: any) => {
        uploadCalls.push({ staffId, opts });
        return [{ objectKey: 'tenants/t-1/clinics/c-1/verification/prc/doc-approved-225/new.pdf' }, null];
      }) as any;

      clinicService.updateStaff = (async (_id: string, payload: any) => {
        updatePayloads.push(payload);
        const regulatedChanged = hasRegulatedPrcCredentialsChanged({
          previousPrcLicenseNumber: staffState[0].prcLicenseNumber,
          nextPrcLicenseNumber: payload.prcLicenseNumber,
          previousPrcExpiryDate: staffState[0].prcExpiryDate,
          nextPrcExpiryDate: payload.prcExpiryDate,
          previousPrcEvidenceObjectKey: staffState[0].prcEvidenceObjectKey,
          nextPrcEvidenceObjectKey: payload.prcEvidenceObjectKey,
        });
        return [
          {
            ...staffState[0],
            prcLicenseNumber: payload.prcLicenseNumber,
            prcExpiryDate: payload.prcExpiryDate,
            prcEvidenceObjectKey: payload.prcEvidenceObjectKey,
            publicBio: payload.publicBio,
            publicVerificationStatus: regulatedChanged ? 'PendingVerification' : 'Verified',
          },
          null,
        ];
      }) as any;

      clinicService.submitStaffVerification = (async () => {
        submitCalls += 1;
        return [staffState[0], null];
      }) as any;

      const makeProps = (): any => ({
        staff: staffState,
        setStaff: (updater: any) => {
          staffState = typeof updater === 'function' ? updater(staffState) : updater;
          harness.rerender(makeProps());
        },
        roles: [],
        staffLoadError: null,
        showSkeletons: false,
        activeStaffCount: 1,
        maxStaffSeats: 10,
        onRefreshStaff: async () => {},
        showAddModal: false,
        setShowAddModal: () => {},
        onStaffAdded: async () => {},
        platformVerificationStatus: 'Verified',
        onRefreshVerificationState: async () => {},
      });

      const harness = createLocalHookHarness((props: any) => StaffManagementTab(props), makeProps());

      const openEditModal = () => {
        const editBtn = findNode(
          harness.result.current,
          (el) => el?.props?.title === 'Edit' && typeof el?.props?.onPress === 'function',
        );
        expect(editBtn).not.toBeNull();
        editBtn.props.onPress();
      };

      const findPrimaryCta = (title: string) =>
        findNode(
          harness.result.current,
          (el) => el?.props?.title === title && typeof el?.props?.onPress === 'function',
        );

      // 1) Bio-only edit keeps "Save Changes", shows no re-verification notice, and keeps Verified
      openEditModal();
      expect(findNodeByTestId(harness.result.current, 'staff-prc-reverification-notice')).toBeNull();
      expect(findPrimaryCta('Save Changes')).not.toBeNull();
      expect(findPrimaryCta(RESUBMIT_VERIFICATION_BUTTON_LABEL)).toBeNull();

      findNode(
        harness.result.current,
        (el) => el?.props?.label === 'Public Bio' && typeof el?.props?.onChangeText === 'function',
      ).props.onChangeText('Senior family physician');

      expect(findNodeByTestId(harness.result.current, 'staff-prc-reverification-notice')).toBeNull();
      expect(findPrimaryCta('Save Changes')).not.toBeNull();
      await findPrimaryCta('Save Changes').props.onPress();

      expect(updatePayloads).toHaveLength(1);
      expect(updatePayloads[0].publicBio).toBe('Senior family physician');
      expect(submitCalls).toBe(0);
      expect(staffState[0].publicVerificationStatus).toBe('Verified');

      // 2) PRC License # edit triggers notice & CTA switch; reverting restores Save Changes
      openEditModal();
      const prcInput = findNode(
        harness.result.current,
        (el) => el?.props?.label === 'PRC license number' && typeof el?.props?.onChangeText === 'function',
      );
      prcInput.props.onChangeText('0999888');
      const noticeForPrc = findNodeByTestId(harness.result.current, 'staff-prc-reverification-notice');
      expect(noticeForPrc).not.toBeNull();
      expect(JSON.stringify(noticeForPrc)).toContain(REGULATED_PRC_REVERIFICATION_NOTICE);
      expect(findPrimaryCta(RESUBMIT_VERIFICATION_BUTTON_LABEL)).not.toBeNull();

      prcInput.props.onChangeText('0123456');
      expect(findNodeByTestId(harness.result.current, 'staff-prc-reverification-notice')).toBeNull();
      expect(findPrimaryCta('Save Changes')).not.toBeNull();

      // 3) PRC Expiry Date edit triggers notice & CTA switch
      const expiryInput = findNodeByTestId(harness.result.current, 'input-prc-expiry-edit');
      expiryInput.props.onChangeText('2031-12-31');
      expect(findNodeByTestId(harness.result.current, 'staff-prc-reverification-notice')).not.toBeNull();
      expect(findPrimaryCta(RESUBMIT_VERIFICATION_BUTTON_LABEL)).not.toBeNull();

      // Revert expiry, then test Replace PRC Proof (stageOnly: true) + Cancel does NOT mutate staff
      expiryInput.props.onChangeText('2029-05-01');
      expect(findNodeByTestId(harness.result.current, 'staff-prc-reverification-notice')).toBeNull();

      mockPickedDocumentResult = {
        canceled: false,
        assets: [
          {
            name: 'renewed-prc.pdf',
            size: 1024,
            mimeType: 'application/pdf',
            uri: 'file:///renewed-prc.pdf',
          },
        ],
      };
      await findNodeByTestId(harness.result.current, 'btn-upload-prc-proof-edit').props.onPress();
      expect(uploadCalls).toEqual([{ staffId: 'doc-approved-225', opts: { stageOnly: true } }]);
      expect(staffState[0].prcEvidenceObjectKey).toBe(
        'tenants/t-1/clinics/c-1/verification/prc/doc-approved-225/old.pdf',
      );
      expect(findNodeByTestId(harness.result.current, 'staff-prc-reverification-notice')).not.toBeNull();
      expect(findPrimaryCta(RESUBMIT_VERIFICATION_BUTTON_LABEL)).not.toBeNull();

      // Cancel discards staged proof without mutating staff
      findPrimaryCta('Cancel').props.onPress();
      expect(staffState[0].prcEvidenceObjectKey).toBe(
        'tenants/t-1/clinics/c-1/verification/prc/doc-approved-225/old.pdf',
      );
      expect(staffState[0].publicVerificationStatus).toBe('Verified');

      // 4) Re-open, replace PRC proof + expiry, and click Save & Resubmit for Verification
      openEditModal();
      await findNodeByTestId(harness.result.current, 'btn-upload-prc-proof-edit').props.onPress();
      findNodeByTestId(harness.result.current, 'input-prc-expiry-edit').props.onChangeText('2032-08-15');
      const resubmitBtn = findPrimaryCta(RESUBMIT_VERIFICATION_BUTTON_LABEL);
      expect(resubmitBtn).not.toBeNull();
      await resubmitBtn.props.onPress();

      expect(updatePayloads).toHaveLength(2);
      expect(updatePayloads[1].prcExpiryDate).toBe('2032-08-15');
      expect(updatePayloads[1].prcEvidenceObjectKey).toBe(
        'tenants/t-1/clinics/c-1/verification/prc/doc-approved-225/new.pdf',
      );
      expect(staffState[0].publicVerificationStatus).toBe('PendingVerification');
      expect(staffState[0].prcEvidenceObjectKey).toBe(
        'tenants/t-1/clinics/c-1/verification/prc/doc-approved-225/new.pdf',
      );
      expect(submitCalls).toBe(0);

      harness.unmount();
    } finally {
      mockPickedDocumentResult = { canceled: true, assets: null };
      resetFeedbackState();
      clinicService.updateStaff = origUpdateStaff;
      clinicService.uploadStaffPrcProof = origUploadPrc;
      clinicService.submitStaffVerification = origSubmitVerification;
    }
  });

  test('14. Issue 242 — hasRegulatedLtoCredentialsChanged, buildDohLtoSettingsPayload with ltoEvidenceObjectKey & uploadLtoProof stageOnly query param', async () => {
    expect(
      hasRegulatedLtoCredentialsChanged({
        previousDohLtoNumber: 'DOH-LTO-04A-2026-0089',
        nextDohLtoNumber: ' DOH-LTO-04A-2026-0089 ',
        previousDohLtoExpiryDate: '2028-06-30',
        nextDohLtoExpiryDate: '2028-06-30',
        previousLtoEvidenceObjectKey: 'lto/old.pdf',
        nextLtoEvidenceObjectKey: 'lto/old.pdf',
        hasPickedProofFile: false,
      }),
    ).toBe(false);

    expect(
      hasRegulatedLtoCredentialsChanged({
        previousDohLtoNumber: 'DOH-LTO-04A-2026-0089',
        nextDohLtoNumber: 'DOH-LTO-04A-2026-0099',
        previousDohLtoExpiryDate: '2028-06-30',
        nextDohLtoExpiryDate: '2028-06-30',
        previousLtoEvidenceObjectKey: 'lto/old.pdf',
        nextLtoEvidenceObjectKey: 'lto/old.pdf',
      }),
    ).toBe(true);

    expect(
      hasRegulatedLtoCredentialsChanged({
        previousDohLtoNumber: 'DOH-LTO-04A-2026-0089',
        nextDohLtoNumber: 'DOH-LTO-04A-2026-0089',
        previousDohLtoExpiryDate: '2028-06-30',
        nextDohLtoExpiryDate: '2029-12-31',
        previousLtoEvidenceObjectKey: 'lto/old.pdf',
        nextLtoEvidenceObjectKey: 'lto/old.pdf',
      }),
    ).toBe(true);

    expect(
      hasRegulatedLtoCredentialsChanged({
        previousDohLtoNumber: 'DOH-LTO-04A-2026-0089',
        nextDohLtoNumber: 'DOH-LTO-04A-2026-0089',
        previousDohLtoExpiryDate: '2028-06-30',
        nextDohLtoExpiryDate: '2028-06-30',
        previousLtoEvidenceObjectKey: 'lto/old.pdf',
        nextLtoEvidenceObjectKey: 'lto/new.pdf',
      }),
    ).toBe(true);

    expect(
      buildDohLtoSettingsPayload({
        dohLto: 'DOH-LTO-04A-2026-0089',
        dohLtoExpiryDate: '2029-12-31',
        previousDohLtoExpiryDate: '2028-06-30',
        ltoEvidenceObjectKey: 'tenants/t-1/clinics/c-1/verification/lto/new.pdf',
      }),
    ).toEqual({
      letterheadDohLto: 'DOH-LTO-04A-2026-0089',
      dohLtoExpiryDate: '2029-12-31',
      ltoEvidenceObjectKey: 'tenants/t-1/clinics/c-1/verification/lto/new.pdf',
    });

    const origPost = clinicApiClient.post;
    const postUrls: string[] = [];
    clinicApiClient.post = (async (url: string) => {
      postUrls.push(url);
      return [{ objectKey: 'staged-lto-key' } as any, null];
    }) as any;

    try {
      await clinicService.uploadLtoProof(new FormData(), undefined, {
        stageOnly: true,
      });
      expect(postUrls).toEqual(['/clinic-settings/lto-proof?stageOnly=true']);
    } finally {
      clinicApiClient.post = origPost;
    }
  });

  test('15. Issue 242 — Verified facility requires Save LTO & Resubmit for Verification on LTO number/expiry/proof edits and supports DocumentTemplatesSettingsTab LTO notice', async () => {
    resetFeedbackState();
    const origUpdateSettings = clinicService.updateSettings;
    const origGetBlob = clinicApiClient.getBlob;
    clinicApiClient.getBlob = (async () => [new Blob(['pdf'], { type: 'application/pdf' }), null]) as any;

    try {
      const saveCalls: Array<{
        dohLto: string;
        dohLtoExpiryDate?: string | null;
        ltoEvidenceObjectKey?: string | null;
      }> = [];
      const uploadCalls: Array<{ opts?: any }> = [];

      let currentLto = 'DOH-LTO-04A-2026-0089';
      let currentExpiry = '2028-06-30';
      let currentProofKey = 'tenants/t-1/clinics/c-1/verification/lto/old-lto.pdf';
      let currentStatus: any = 'Verified';

      const makeReadinessProps = (): any => ({
        license: {
          status: 'Active',
          planTier: 'Growth',
          isTampered: false,
          limits: { maxStaff: 10 },
        },
        clinicName: 'St. Jude Clinic',
        letterheadAddress: '123 Rizal Ave, Manila',
        letterheadContact: '0917-000-0000',
        accreditationNumber: 'PHIC-001',
        operatingHours: 'Mon-Fri 8am-5pm',
        letterheadDohLto: currentLto,
        dohLtoExpiryDate: currentExpiry,
        ltoEvidenceObjectKey: currentProofKey,
        staff: [
          { id: 'd1', role: 'Doctor', isActive: true, prcLicenseNumber: '0123456' },
          { id: 'r1', role: 'Receptionist', isActive: true },
        ],
        services: [{ id: 's1', isActive: true, name: 'Consult', category: 'Consultation', standardPrice: 500 }],
        roles: [],
        platformVerificationStatus: currentStatus,
        isDirectoryPublished: true,
        isWorkspaceEligible: true,
        onSaveDohLto: async (dohLto: string, dohLtoExpiryDate?: string | null, ltoEvidenceObjectKey?: string | null) => {
          saveCalls.push({ dohLto, dohLtoExpiryDate: dohLtoExpiryDate ?? null, ltoEvidenceObjectKey: ltoEvidenceObjectKey ?? null });
          currentLto = dohLto;
          currentExpiry = dohLtoExpiryDate ?? '';
          if (ltoEvidenceObjectKey) {
            currentProofKey = ltoEvidenceObjectKey;
          }
          currentStatus = 'PendingReview';
          harness.rerender(makeReadinessProps());
          return true;
        },
        onUploadLtoProof: async (_form: any, opts?: any) => {
          uploadCalls.push({ opts });
          return 'tenants/t-1/clinics/c-1/verification/lto/new-lto.pdf';
        },
        onNavigateTab: () => {},
        onOpenAddStaff: () => {},
        onOpenAddService: () => {},
        onOpenLicenseModal: () => {},
      });

      const harness = createLocalHookHarness((props: any) => FacilityReadinessTab(props), makeReadinessProps());

      // 1) Baseline Verified facility shows Save LTO (disabled) and no notice
      expect(findNodeByTestId(harness.result.current, 'readiness-lto-reverification-notice')).toBeNull();
      const baselineSaveBtn = findNodeByTestId(harness.result.current, 'btn-save-doh-lto');
      expect(baselineSaveBtn.props.title).toBe('Save LTO');
      expect(baselineSaveBtn.props.disabled).toBe(true);

      // 2) Editing DOH LTO Number shows notice & switches CTA; reverting restores Save LTO
      const ltoInput = findNodeByTestId(harness.result.current, 'readiness-input-doh-lto');
      ltoInput.props.onChangeText('DOH-LTO-04A-2026-0999');
      const noticeNum = findNodeByTestId(harness.result.current, 'readiness-lto-reverification-notice');
      expect(noticeNum).not.toBeNull();
      expect(JSON.stringify(noticeNum)).toContain(REGULATED_LTO_REVERIFICATION_NOTICE);
      const resubmitBtnNum = findNodeByTestId(harness.result.current, 'btn-save-doh-lto');
      expect(resubmitBtnNum.props.title).toBe(RESUBMIT_LTO_BUTTON_LABEL);
      expect(resubmitBtnNum.props.disabled).toBe(false);

      ltoInput.props.onChangeText('DOH-LTO-04A-2026-0089');
      expect(findNodeByTestId(harness.result.current, 'readiness-lto-reverification-notice')).toBeNull();
      expect(findNodeByTestId(harness.result.current, 'btn-save-doh-lto').props.title).toBe('Save LTO');

      // 3) Editing DOH LTO Expiry Date shows notice & switches CTA
      const expiryInput = findNodeByTestId(harness.result.current, 'readiness-input-doh-lto-expiry');
      expiryInput.props.onChangeText('2029-12-31');
      expect(findNodeByTestId(harness.result.current, 'readiness-lto-reverification-notice')).not.toBeNull();
      expect(findNodeByTestId(harness.result.current, 'btn-save-doh-lto').props.title).toBe(RESUBMIT_LTO_BUTTON_LABEL);

      // Revert expiry, test Replace LTO Proof (stageOnly: true) & Discard
      expiryInput.props.onChangeText('2028-06-30');
      expect(findNodeByTestId(harness.result.current, 'readiness-lto-reverification-notice')).toBeNull();

      mockPickedDocumentResult = {
        canceled: false,
        assets: [
          {
            name: 'renewed-lto.pdf',
            size: 2048,
            mimeType: 'application/pdf',
            uri: 'file:///renewed-lto.pdf',
          },
        ],
      };
      await findNodeByTestId(harness.result.current, 'btn-upload-lto-proof').props.onPress();
      expect(uploadCalls).toEqual([{ opts: { stageOnly: true } }]);
      expect(currentProofKey).toBe('tenants/t-1/clinics/c-1/verification/lto/old-lto.pdf');
      expect(findNodeByTestId(harness.result.current, 'readiness-lto-reverification-notice')).not.toBeNull();
      expect(findNodeByTestId(harness.result.current, 'btn-save-doh-lto').props.title).toBe(RESUBMIT_LTO_BUTTON_LABEL);
      expect(findNodeByTestId(harness.result.current, 'btn-save-doh-lto').props.disabled).toBe(false);

      // Discard staged proof restores clean state
      findNodeByTestId(harness.result.current, 'btn-discard-staged-lto-proof').props.onPress();
      expect(findNodeByTestId(harness.result.current, 'readiness-lto-reverification-notice')).toBeNull();
      expect(findNodeByTestId(harness.result.current, 'btn-save-doh-lto').props.title).toBe('Save LTO');

      // 4) Re-stage proof + update expiry and click Save LTO & Resubmit for Verification
      await findNodeByTestId(harness.result.current, 'btn-upload-lto-proof').props.onPress();
      findNodeByTestId(harness.result.current, 'readiness-input-doh-lto-expiry').props.onChangeText('2029-12-31');
      await findNodeByTestId(harness.result.current, 'btn-save-doh-lto').props.onPress();

      expect(saveCalls).toEqual([
        {
          dohLto: 'DOH-LTO-04A-2026-0089',
          dohLtoExpiryDate: '2029-12-31',
          ltoEvidenceObjectKey: 'tenants/t-1/clinics/c-1/verification/lto/new-lto.pdf',
        },
      ]);
      expect(currentStatus).toBe('PendingReview');
      expect(currentProofKey).toBe('tenants/t-1/clinics/c-1/verification/lto/new-lto.pdf');
      harness.unmount();

      // 5) DocumentTemplatesSettingsTab also surfaces notice & Save & Resubmit for Verification when Verified LTO # changes
      let refreshVerificationCalls = 0;
      const docsSettings: any = {
        id: 'set-242',
        tenantId: 't-1',
        clinicId: 'c-1',
        clinicName: 'St. Jude Clinic',
        letterheadDohLto: 'DOH-LTO-04A-2026-0089',
        dohLicenseToOperate: 'DOH-LTO-04A-2026-0089',
        platformVerificationStatus: 'Verified',
      };
      clinicService.updateSettings = (async (payload: any) => [
        {
          ...docsSettings,
          ...payload,
          platformVerificationStatus: 'PendingReview',
        },
        null,
      ]) as any;

      const docsHarness = createLocalHookHarness(
        (props: any) => DocumentTemplatesSettingsTab(props),
        {
          settings: docsSettings,
          platformVerificationStatus: 'Verified',
          onRefreshVerificationState: async () => {
            refreshVerificationCalls += 1;
          },
        } as any,
      );

      findNodeByTestId(docsHarness.result.current, 'input-doh-lto').props.onChangeText('DOH-LTO-04A-2026-8888');
      const docsNotice = findNodeByTestId(docsHarness.result.current, 'docs-lto-reverification-notice');
      expect(docsNotice).not.toBeNull();
      expect(JSON.stringify(docsNotice)).toContain(REGULATED_LTO_REVERIFICATION_NOTICE);
      const docsSaveBtn = findNodeByTestId(docsHarness.result.current, 'btn-save-settings');
      expect(docsSaveBtn.props.title).toBe(RESUBMIT_VERIFICATION_BUTTON_LABEL);

      await docsSaveBtn.props.onPress();
      expect(refreshVerificationCalls).toBe(1);
      docsHarness.unmount();
    } finally {
      mockPickedDocumentResult = { canceled: true, assets: null };
      resetFeedbackState();
      clinicService.updateSettings = origUpdateSettings;
      clinicApiClient.getBlob = origGetBlob;
    }
  });
});

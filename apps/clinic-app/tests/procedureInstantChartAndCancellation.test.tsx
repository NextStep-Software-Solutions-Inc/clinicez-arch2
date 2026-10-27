// token-guard:ignore-file
import { describe, expect, test, mock, beforeEach, afterEach, afterAll } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

(globalThis as any).__DEV__ = true;

const createMockComponent = (name: string) => {
  const Comp = ({ children, testID, title, subtitle, footer }: any) =>
    React.createElement(
      'div',
      {
        'data-component': name,
        ...(testID ? { 'data-testid': testID, id: testID } : {}),
      },
      title ? React.createElement('h3', null, title) : null,
      subtitle ? React.createElement('h4', null, subtitle) : null,
      children,
      footer ? React.createElement('div', { 'data-footer': true }, footer) : null
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
  Touchable: { Mixin: {} },
  Image: createMockComponent('Image'),
  RefreshControl: createMockComponent('RefreshControl'),
  Dimensions: { get: () => ({ width: 1280, height: 800 }), addEventListener: () => ({ remove: () => {} }) },
  useWindowDimensions: () => ({ width: 1280, height: 800 }),
  Keyboard: { dismiss: () => {}, addListener: () => ({ remove: () => {} }) },
  AppState: { currentState: 'active', addEventListener: () => ({ remove: () => {} }) },
  Platform: { OS: 'web', select: (obj: any) => obj.web ?? obj.default },
  TurboModuleRegistry: { get: () => null, getEnforcing: () => null },
  NativeModules: {},
  NativeEventEmitter: class {
    addListener() { return { remove: () => {} }; }
    removeAllListeners() {}
  },
  Alert: { alert: () => {} },
  processColor: (c: any) => c,
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
  Polyline: 'Polyline',
  default: 'Svg',
}));

mock.module('../constants/fonts', () => ({
  applyFontFamily: (s: any) => s,
  fontAssets: {},
}));

const defaultAuthMock = {
  state: 'booting' as const,
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
    if (typeof ctx?.can === 'function') return Boolean(ctx.can(perm));
    const perms: readonly string[] | undefined = ctx?.permissions ?? ctx?.user?.permissions;
    if (Array.isArray(perms)) {
      return perms.includes('*') || perms.some((p) => p.toLowerCase() === perm.toLowerCase());
    }
    return false;
  },
  AuthProvider: ({ children }: any) => children,
});

mock.module('../context/AuthContext', authContextMockFactory);
mock.module('../../context/AuthContext', authContextMockFactory);
mock.module('@context/AuthContext', authContextMockFactory);

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
    return s.name || [s.title, s.firstName, s.lastName].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  },
  staffInitials: (s?: any) => {
    if (!s) return '?';
    return `${s.firstName?.[0] ?? ''}${s.lastName?.[0] ?? ''}`.toUpperCase() || '?';
  },
  StaffProvider: ({ children }: any) => children,
});

mock.module('../context/StaffContext', staffContextMockFactory);
mock.module('../../context/StaffContext', staffContextMockFactory);
mock.module('@context/StaffContext', staffContextMockFactory);

const { clinicService } = await import('../services/clinicService');
const { clinicApiClient } = await import('../services/apiClient');
type ClinicalProcedureRecord = import('../services/clinicService').ClinicalProcedureRecord;
type ClinicLabOrderRecord = import('../services/clinicService').ClinicLabOrderRecord;

const { default: NursingProceduresTab } = await import('../components/chart/NursingProceduresTab');
const { default: DiagnosticLabTab } = await import('../components/chart/DiagnosticLabTab');

describe('Procedure Instant Chart Reflection & Cancellation Suite', () => {
  beforeEach(() => {
    mock.module('../context/AuthContext', authContextMockFactory);
    mock.module('../../context/AuthContext', authContextMockFactory);
    mock.module('@context/AuthContext', authContextMockFactory);
    mock.module('../context/StaffContext', staffContextMockFactory);
    mock.module('../../context/StaffContext', staffContextMockFactory);
    mock.module('@context/StaffContext', staffContextMockFactory);
    (globalThis as any).__mockAuthContext = {
      state: 'signedIn',
      user: { id: 'user-admin', name: 'Admin User', role: 'Admin', permissions: ['*'] },
      permissions: ['*'],
      can: () => true,
    };
    (globalThis as any).__mockClinicContext = {
      rooms: [
        { id: 'room-tx-1', name: 'Treatment Room 1', type: 'Treatment', isActive: true },
      ],
    };
    (globalThis as any).__mockStaffContext = {
      staff: [],
      current: null,
      currentName: '',
      loading: false,
      error: null,
      reload: async () => {},
    };
  });

  afterEach(() => {
    delete (globalThis as any).__mockAuthContext;
    delete (globalThis as any).__mockClinicContext;
    delete (globalThis as any).__mockStaffContext;
  });

  afterAll(() => {
    delete (globalThis as any).__mockAuthContext;
    delete (globalThis as any).__mockClinicContext;
    delete (globalThis as any).__mockStaffContext;
  });

  describe('1. clinicService API Contracts for Cancellation', () => {
    test('1.1 cancelProcedure posts to /procedures/:id/cancel with optional reason', async () => {
      const origPost = clinicApiClient.post;
      const mockPost = mock(() => Promise.resolve([{ id: 'proc-123', status: 'Cancelled' }, null]));
      (clinicApiClient as any).post = mockPost;

      const [res, err] = await clinicService.cancelProcedure('proc-123', 'Patient declined');
      expect(mockPost).toHaveBeenCalledWith('/procedures/proc-123/cancel', { reason: 'Patient declined' });
      expect(err).toBeNull();
      expect(res?.status).toBe('Cancelled');

      (clinicApiClient as any).post = origPost;
    });

    test('1.2 cancelLabOrder posts to /lab-orders/:id/cancel with optional reason', async () => {
      const origPost = clinicApiClient.post;
      const mockPost = mock(() => Promise.resolve([{ id: 'lab-456', status: 'Cancelled' }, null]));
      (clinicApiClient as any).post = mockPost;

      const [res, err] = await clinicService.cancelLabOrder('lab-456', 'Duplicate order');
      expect(mockPost).toHaveBeenCalledWith('/lab-orders/lab-456/cancel', { reason: 'Duplicate order' });
      expect(err).toBeNull();
      expect(res?.status).toBe('Cancelled');

      (clinicApiClient as any).post = origPost;
    });
  });

  describe('2. NursingProceduresTab — Cancel Action for Ordered Procedures', () => {
    const mockProcedure: ClinicalProcedureRecord = {
      id: 'proc-abc-1',
      tenantId: 'default',
      clinicId: 'clinic-1',
      patientId: 'patient-1',
      patientName: 'Agbayani, Maria Corazon M.',
      procedureName: 'Root Canal Therapy',
      category: 'Dental',
      scheduledAt: new Date().toISOString(),
      status: 'Ordered',
      targetRoomName: 'Treatment Room',
    };

    test('2.1 Renders "Cancel Order" button for Ordered procedures when user has permissions', () => {
      const html = renderToStaticMarkup(
        <NursingProceduresTab
          patientId="patient-1"
          procedures={[mockProcedure]}
          onRefreshChart={() => {}}
        />
      );

      expect(html).toContain('data-testid="cancel-procedure-action"');
      expect(html).toContain('Cancel Order');
    });

    test('2.2 Does NOT render "Cancel Order" button for Completed procedures', () => {
      const completedProc: ClinicalProcedureRecord = {
        ...mockProcedure,
        id: 'proc-comp-1',
        status: 'Completed',
        performedAt: new Date().toISOString(),
      };

      const html = renderToStaticMarkup(
        <NursingProceduresTab
          patientId="patient-1"
          procedures={[completedProc]}
          onRefreshChart={() => {}}
        />
      );

      expect(html).not.toContain('data-testid="cancel-procedure-action"');
    });
  });

  describe('3. DiagnosticLabTab — Cancel Requisition Action for Ordered Labs', () => {
    const mockLabOrder: ClinicLabOrderRecord = {
      id: 'lab-ord-1',
      tenantId: 'default',
      clinicId: 'clinic-1',
      orderNumber: 'LAB-20261027-001',
      patientId: 'patient-1',
      patientName: 'Agbayani, Maria Corazon M.',
      orderDate: new Date().toISOString(),
      status: 'Ordered',
      stage: 'Issued',
      items: [
        {
          id: 'item-1',
          testName: 'Complete Blood Count (CBC)',
          category: 'Hematology',
          status: 'Ordered',
        },
      ],
    };

    test('3.1 Renders "Cancel Requisition" button for Ordered lab requisitions', () => {
      const html = renderToStaticMarkup(
        <DiagnosticLabTab
          patientId="patient-1"
          labOrders={[mockLabOrder]}
          onRefreshChart={() => {}}
        />
      );

      expect(html).toContain(`data-testid="cancel-lab-order-${mockLabOrder.id}"`);
      expect(html).toContain('Cancel Requisition');
    });

    test('3.2 Does NOT render "Cancel Requisition" button for Completed lab orders', () => {
      const completedOrder: ClinicLabOrderRecord = {
        ...mockLabOrder,
        id: 'lab-ord-completed',
        status: 'Completed',
        stage: 'Completed',
      };

      const html = renderToStaticMarkup(
        <DiagnosticLabTab
          patientId="patient-1"
          labOrders={[completedOrder]}
          onRefreshChart={() => {}}
        />
      );

      expect(html).not.toContain(`data-testid="cancel-lab-order-${completedOrder.id}"`);
    });
  });

  describe('4. Consultations Screen Source Code Contract Verification', () => {
    test('4.1 handleHandoffToTreatmentRoom immediately updates patientChart and calls refreshPatientChart', async () => {
      const fs = await import('fs');
      const content = fs.readFileSync(
        'apps/clinic-app/navigation/screens/Consultations.screen.tsx',
        'utf8'
      );

      expect(content).toContain('handleHandoffToTreatmentRoom');
      expect(content).toContain('refreshPatientChart(selectedPatient.patientId)');
      expect(content).toContain('proceduresHistory: [proc,');
    });

    test('4.2 handleHandoffAllProcedures collects newlyCreatedProcs and updates patientChart', async () => {
      const fs = await import('fs');
      const content = fs.readFileSync(
        'apps/clinic-app/navigation/screens/Consultations.screen.tsx',
        'utf8'
      );

      expect(content).toContain('handleHandoffAllProcedures');
      expect(content).toContain('newlyCreatedProcs');
      expect(content).toContain('proceduresHistory: [...newlyCreatedProcs, ...existing]');
    });

    test('4.3 handleRemoveProcedure confirms and calls clinicService.cancelProcedure for sent procedures', async () => {
      const fs = await import('fs');
      const content = fs.readFileSync(
        'apps/clinic-app/navigation/screens/Consultations.screen.tsx',
        'utf8'
      );

      expect(content).toContain('handleRemoveProcedure');
      expect(content).toContain('clinicService.cancelProcedure');
    });
  });
});

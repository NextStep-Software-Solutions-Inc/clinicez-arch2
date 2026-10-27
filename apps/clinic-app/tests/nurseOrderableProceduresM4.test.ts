// token-guard:ignore-file
import { describe, expect, test, mock, beforeEach, afterAll } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

(globalThis as any).__DEV__ = true;

const createMockComponent = (name: string) => {
  const Comp = ({ children, testID }: any) =>
    React.createElement(
      'div',
      {
        'data-component': name,
        ...(testID ? { 'data-testid': testID, id: testID } : {}),
      },
      children
    );
  Comp.displayName = name;
  return Comp;
};

// Mock react-native
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
  AppState: { currentState: 'active', addEventListener: () => ({ remove: () => {} }) },
  Platform: { OS: 'web', select: (obj: any) => obj.web ?? obj.default },
  Alert: { alert: () => {} },
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

mock.module('expo-crypto', () => ({
  randomUUID: () => 'test-uuid-' + Math.random().toString(36).substring(2, 9),
}));

mock.module('react-native-svg', () => ({
  Svg: 'Svg',
  Path: 'Path',
  Circle: 'Circle',
  Rect: 'Rect',
  Line: 'Line',
  Polyline: 'Polyline',
  default: 'Svg',
  Defs: ({ children }: any) => children,
  LinearGradient: ({ children }: any) => children,
  Stop: () => null,
  G: ({ children }: any) => children,
  Text: ({ children }: any) => children,
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

const mockStaffContext = {
  useStaff: () => (globalThis as any).__mockStaffContext || ({
    current: { id: 'staff-nurse-1', name: 'Nurse Joy', role: 'Nurse' },
    currentStaff: { id: 'staff-nurse-1', name: 'Nurse Joy', role: 'Nurse' },
    staff: [],
  }),
  formatStaffName: (s: any) => s?.name || [s?.title, s?.firstName, s?.lastName].filter(Boolean).join(' ').trim() || 'Staff',
  staffInitials: (s: any) => `${s?.firstName?.[0] ?? ''}${s?.lastName?.[0] ?? ''}`.toUpperCase() || '?',
  StaffProvider: ({ children }: any) => children,
};
mock.module('../context/StaffContext', () => mockStaffContext);
mock.module('../../context/StaffContext', () => mockStaffContext);

// API Client Mock
let lastPostUrl = '';
let lastPostPayload: any = null;
let mockPostResponse: any = null;
let mockPostError: any = null;

mock.module('../services/apiClient', () => ({
  clinicApiClient: {
    get: async () => [null, null],
    put: async () => [null, null],
    post: async (url: string, data?: any) => {
      lastPostUrl = url;
      lastPostPayload = data;
      if (mockPostError) return [null, mockPostError];
      return [mockPostResponse, null];
    },
  },
  clinicApiUrl: (p: string) => `http://localhost:5000/api/v1${p}`,
}));

const { clinicService } = await import('../services/clinicService');
const { default: NursingProceduresTab, ProcedureExecutionModal } = await import('../components/chart/NursingProceduresTab');
const { default: DiagnosticLabTab, AttachExternalLabModal } = await import('../components/chart/DiagnosticLabTab');
const { default: AdministerVaccineModal } = await import('../components/chart/AdministerVaccineModal');
import type { ClinicalProcedureRecord } from '../services/clinicService';

describe('Milestone 4: Nurse-Orderable Procedures, Treatment Bay & Ambulatory Lab Intake Suite', () => {
  beforeEach(() => {
    mock.module('../context/AuthContext', authContextMockFactory);
    mock.module('../../context/AuthContext', authContextMockFactory);
    mock.module('@context/AuthContext', authContextMockFactory);
    mock.module('../context/StaffContext', () => mockStaffContext);
    mock.module('../../context/StaffContext', () => mockStaffContext);
    lastPostUrl = '';
    lastPostPayload = null;
    mockPostResponse = null;
    mockPostError = null;
    delete (globalThis as any).__mockAuthContext;
    delete (globalThis as any).__mockStaffContext;
  });

  afterAll(() => {
    delete (globalThis as any).__mockAuthContext;
    delete (globalThis as any).__mockStaffContext;
  });

  describe('1. clinicService API Contracts for Procedures & Vaccines', () => {
    test('1.1 orderProcedure posts expected payload to /procedures', async () => {
      mockPostResponse = { id: 'proc-101', procedureName: 'Nebulization Therapy' };
      const [res, err] = await clinicService.orderProcedure({
        patientId: 'pat-1',
        patientName: 'Juan Dela Cruz',
        procedureCode: 'PROC-NEB',
        procedureName: 'Nebulization Therapy',
        category: 'Procedure',
        targetRoomName: 'Treatment Bay 1',
      });

      expect(err).toBeNull();
      expect(res).toEqual({ id: 'proc-101', procedureName: 'Nebulization Therapy' });
      expect(lastPostUrl).toBe('/procedures');
      expect(lastPostPayload).toMatchObject({
        patientId: 'pat-1',
        procedureCode: 'PROC-NEB',
        targetRoomName: 'Treatment Bay 1',
      });
    });

    test('1.2 completeProcedure sends requiresDoctorReEvaluation flag to /procedures/:id/complete', async () => {
      mockPostResponse = { id: 'proc-101', status: 'Completed' };
      const [res, err] = await clinicService.completeProcedure('proc-101', {
        performedByStaffId: 'staff-nurse-1',
        performedByStaffName: 'Nurse Joy',
        clinicalNotes: 'Nebulization administered smoothly.',
        requiresDoctorReEvaluation: false,
      });

      expect(err).toBeNull();
      expect(res).toEqual({ id: 'proc-101', status: 'Completed' });
      expect(lastPostUrl).toBe('/procedures/proc-101/complete');
      expect(lastPostPayload).toMatchObject({
        performedByStaffName: 'Nurse Joy',
        requiresDoctorReEvaluation: false,
      });
    });

    test('1.3 completeProcedure with requiresDoctorReEvaluation=true routes back to doctor', async () => {
      mockPostResponse = { id: 'proc-102', status: 'Completed' };
      const [res, err] = await clinicService.completeProcedure('proc-102', {
        performedByStaffId: 'staff-nurse-1',
        performedByStaffName: 'Nurse Joy',
        requiresDoctorReEvaluation: true,
      });

      expect(err).toBeNull();
      expect(lastPostUrl).toBe('/procedures/proc-102/complete');
      expect(lastPostPayload.requiresDoctorReEvaluation).toBe(true);
    });

    test('1.4 administerVaccine sends queueItemId and completeVisit flag', async () => {
      mockPostResponse = { id: 'imm-1', vaccineName: 'BCG' };
      const [res, err] = await clinicService.administerVaccine('pat-baby', {
        philHealthLibrary: 'lib_immchild',
        philHealthCode: 'C01',
        vaccineName: 'BCG',
        lotBatchNumber: 'LOT-998',
        expirationDate: '2028-12-31',
        doseSequence: 1,
        isSeriesCompleted: true,
        route: 'Intradermal',
        injectionSite: 'Right Deltoid',
        administeredAtUtc: new Date().toISOString(),
        administeredByStaffId: 'staff-nurse-1',
        administeredByStaffName: 'Nurse Joy',
        queueItemId: 'queue-ticket-201',
        completeVisit: true,
      });

      expect(err).toBeNull();
      expect(lastPostUrl).toBe('/patients/pat-baby/immunizations/administer');
      expect(lastPostPayload).toMatchObject({
        queueItemId: 'queue-ticket-201',
        completeVisit: true,
      });
    });
  });

  describe('2. NursingProceduresTab Component & Procedure Ordering Modal', () => {
    const mockProcedures: ClinicalProcedureRecord[] = [
      {
        id: 'proc-1',
        patientId: 'pat-1',
        patientName: 'Juan Dela Cruz',
        procedureName: 'Nebulization Therapy',
        category: 'Procedure',
        status: 'Ordered',
        orderDate: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        targetRoomName: 'Treatment Bay 1',
      },
    ];

    test('2.1 renders order-procedure-button and execute-procedure-action testIDs', () => {
      const element = React.createElement(NursingProceduresTab, {
        procedures: mockProcedures,
        patientId: 'pat-1',
        patientName: 'Juan Dela Cruz',
        queueItemId: 'queue-101',
        onOrderProcedure: () => {},
      });

      expect(element).toBeDefined();
      const markup = renderToStaticMarkup(element);
      expect(markup).toContain('data-testid="order-procedure-button"');
      expect(markup).toContain('data-testid="execute-procedure-action"');
    });
  });

  describe('3. ProcedureExecutionModal Re-Evaluation & Auto-Discharge Flow', () => {
    const sampleProc: ClinicalProcedureRecord = {
      id: 'proc-exec-1',
      patientId: 'pat-1',
      patientName: 'Juan Dela Cruz',
      procedureName: 'Wound Dressing & Debridement',
      category: 'Procedure',
      status: 'Ordered',
      orderDate: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      targetRoomName: 'Bay 2 - Treatment',
    };

    test('3.1 renders execution modal with requires-doctor-re-eval-toggle', () => {
      const element = React.createElement(ProcedureExecutionModal, {
        visible: true,
        procedure: sampleProc,
        onClose: () => {},
        onSubmit: async () => {},
      });

      expect(element).toBeDefined();
      const markup = renderToStaticMarkup(element);
      expect(markup).toContain('data-testid="requires-doctor-re-eval-toggle"');
      expect(markup).toContain('Complete &amp; Discharge Patient');
    });
  });

  describe('4. AdministerVaccineModal Auto-Discharge Toggle', () => {
    test('4.1 accepts queueItemId and completes visit toggle', () => {
      const element = React.createElement(AdministerVaccineModal, {
        visible: true,
        patientId: 'pat-10',
        queueItemId: 'queue-item-vax-99',
        onClose: () => {},
        onAdministerVaccine: async () => {},
      });

      expect(element).toBeDefined();
      const markup = renderToStaticMarkup(element);
      expect(markup).toContain('data-testid="complete-visit-toggle"');
    });
  });

  describe('5. DiagnosticLabTab Diagnostic Ordering & External Attach', () => {
    test('5.1 DiagnosticLabTab renders Order Diagnostic button when doctor holds laborders:write and valid PRC', () => {
      (globalThis as any).__mockAuthContext = {
        state: 'signedIn',
        user: { id: 'u1', role: 'Doctor', permissions: ['laborders:write'] },
        permissions: ['laborders:write'],
      };
      (globalThis as any).__mockStaffContext = {
        current: { id: 'staff-doc-1', name: 'Dr. Gregory House', role: 'Doctor', prcLicenseNumber: 'PRC-1234567' },
        currentStaff: { id: 'staff-doc-1', name: 'Dr. Gregory House', role: 'Doctor', prcLicenseNumber: 'PRC-1234567' },
        staff: [],
      };

      const element = React.createElement(DiagnosticLabTab, {
        labOrders: [],
        patientId: 'pat-1',
        patientName: 'Juan Dela Cruz',
        onOrderDiagnostic: () => {},
      });

      expect(element).toBeDefined();
      const markup = renderToStaticMarkup(element);
      expect(markup).toContain('data-testid="order-diagnostic-button"');
      expect(markup).toContain('Order Diagnostic');
    });

    test('5.2 DiagnosticLabTab gates Order Diagnostic button when doctor lacks PRC license', () => {
      (globalThis as any).__mockAuthContext = {
        state: 'signedIn',
        user: { id: 'u2', role: 'Doctor', permissions: ['laborders:write'] },
        permissions: ['laborders:write'],
      };
      (globalThis as any).__mockStaffContext = {
        current: { id: 'staff-doc-2', name: 'Dr. Unlicensed', role: 'Doctor', prcLicenseNumber: '' },
        currentStaff: { id: 'staff-doc-2', name: 'Dr. Unlicensed', role: 'Doctor', prcLicenseNumber: '' },
        staff: [],
      };

      const element = React.createElement(DiagnosticLabTab, {
        labOrders: [],
        patientId: 'pat-1',
        patientName: 'Juan Dela Cruz',
      });

      const markup = renderToStaticMarkup(element);
      expect(markup).not.toContain('data-testid="order-diagnostic-button"');
      expect(markup).toContain('PRC License Required');
    });

    test('5.3 DiagnosticLabTab allows non-doctor with laborders:write to order diagnostics without PRC license', () => {
      (globalThis as any).__mockAuthContext = {
        state: 'signedIn',
        user: { id: 'u3', role: 'Nurse', permissions: ['laborders:write'] },
        permissions: ['laborders:write'],
      };
      (globalThis as any).__mockStaffContext = {
        current: { id: 'staff-nurse-1', name: 'Nurse Joy', role: 'Nurse' },
        currentStaff: { id: 'staff-nurse-1', name: 'Nurse Joy', role: 'Nurse' },
        staff: [],
      };

      const element = React.createElement(DiagnosticLabTab, {
        labOrders: [],
        patientId: 'pat-1',
        patientName: 'Juan Dela Cruz',
        onOrderDiagnostic: () => {},
      });

      const markup = renderToStaticMarkup(element);
      expect(markup).toContain('data-testid="order-diagnostic-button"');
      expect(markup).toContain('Order Diagnostic');
    });

    test('5.4 DiagnosticLabTab hides Order Diagnostic button when user lacks laborders:write permission', () => {
      (globalThis as any).__mockAuthContext = {
        state: 'signedIn',
        user: { id: 'u4', role: 'Nurse', permissions: ['laborders:read'] },
        permissions: ['laborders:read'],
      };
      (globalThis as any).__mockStaffContext = {
        current: { id: 'staff-nurse-1', name: 'Nurse Joy', role: 'Nurse' },
        currentStaff: { id: 'staff-nurse-1', name: 'Nurse Joy', role: 'Nurse' },
        staff: [],
      };

      const element = React.createElement(DiagnosticLabTab, {
        labOrders: [],
        patientId: 'pat-1',
        patientName: 'Juan Dela Cruz',
      });

      const markup = renderToStaticMarkup(element);
      expect(markup).not.toContain('data-testid="order-diagnostic-button"');
      expect(markup).not.toContain('PRC License Required');
    });

    test('5.5 AttachExternalLabModal renders file attachment selector with auto-detected format', () => {
      const element = React.createElement(AttachExternalLabModal, {
        visible: true,
        orderId: 'lab-order-123',
        onClose: () => {},
        onSuccess: () => {},
      });

      expect(element).toBeDefined();
      const markup = renderToStaticMarkup(element);
      expect(markup).toContain('Attach External Lab Result');
      expect(markup).toContain('Select Result Document (PDF / Photo)');
      expect(markup).toContain('Auto-detected format');
    });

    test('5.6 clinicService.attachExternalLabResult transmits base64 file and metadata', async () => {
      mockPostResponse = { id: 'lab-order-123', status: 'CompletedWithExternalReport' };
      const [res, err] = await clinicService.attachExternalLabResult('lab-order-123', {
        externalLabName: 'Hi-Precision Diagnostics',
        documentType: 'PDF',
        fileBase64: 'data:application/pdf;base64,JVBERi0xLjQK...',
        contentType: 'application/pdf',
        fileName: 'cbc_result.pdf',
        notes: 'Verified normal range',
      });

      expect(err).toBeNull();
      expect(lastPostUrl).toBe('/lab-orders/lab-order-123/attach-external-result');
      expect(lastPostPayload).toMatchObject({
        externalLabName: 'Hi-Precision Diagnostics',
        documentType: 'PDF',
        fileBase64: 'data:application/pdf;base64,JVBERi0xLjQK...',
        contentType: 'application/pdf',
        fileName: 'cbc_result.pdf',
        notes: 'Verified normal range',
      });
    });

    test('5.7 DiagnosticLabTab displays Attach External Result for Ordered labs and does not render specimen intake', () => {
      const orderedLab: any = {
        id: 'lab-1',
        orderNumber: 'LAB-001',
        orderDate: '2026-10-27T00:00:00Z',
        status: 'Ordered',
        stage: 'Issued',
        items: [{ testName: 'CBC', category: 'Hematology' }],
      };
      const collectedLab: any = {
        id: 'lab-2',
        orderNumber: 'LAB-002',
        orderDate: '2026-10-27T00:00:00Z',
        status: 'SpecimenCollected',
        stage: 'SpecimenCollected',
        stageReason: 'Specimen collected (Whole Blood (EDTA)). Barcode: SPEC-718400',
        items: [{ testName: 'Lipid Profile', category: 'Chemistry' }],
      };

      const element = React.createElement(DiagnosticLabTab, {
        labOrders: [orderedLab, collectedLab],
        patientId: 'pat-1',
      });

      const markup = renderToStaticMarkup(element);
      // Clinical attach action is rendered for active lab orders
      expect(markup).toContain('data-testid="attach-external-result-lab-1"');
      // Backward compatibility: SpecimenCollected orders render their status chip gracefully
      expect(markup).toContain('Specimen Collected');
      // Non-clinical phlebotomy intake button is NOT rendered
      expect(markup).not.toContain('data-testid="collect-specimen-lab-1"');
    });
  });
});

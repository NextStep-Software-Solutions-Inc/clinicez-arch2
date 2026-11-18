// token-guard:ignore-file
import { describe, expect, test, mock, beforeEach, afterAll } from 'bun:test';
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

let mockAuthUser: any = { id: 'u1', role: 'Admin', permissions: ['procedures:write'] };
const mockStaffList: any[] = [
  { id: 'doc-1', firstName: 'Gregory', lastName: 'House', role: 'Doctor', prcLicenseNumber: '0098765', isActive: true },
  { id: 'nurse-1', firstName: 'Joy', lastName: 'Nurse', role: 'Nurse', isActive: true },
];

const defaultAuthMock = {
  state: 'signedIn',
  user: null,
  permissions: [],
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
mock.module('../../context/AuthContext', authContextMockFactory);
mock.module('@context/AuthContext', authContextMockFactory);
mock.module('../context/StaffContext', staffContextMockFactory);
mock.module('../../context/StaffContext', staffContextMockFactory);
mock.module('@context/StaffContext', staffContextMockFactory);

const nursingProceduresModule = await import('../components/chart/NursingProceduresTab');
const { default: NursingProceduresTab, ProcedureExecutionModal } = nursingProceduresModule;
const { OrderCatalogSearchModal } = await import('../components/consultation/OrderCatalogSearchModal');
const { default: AdministrativeDocumentsTab } = await import('../components/chart/AdministrativeDocumentsTab');
const { default: EncountersTimelineTab } = await import('../components/chart/EncountersTimelineTab');
const { default: ExecutiveSummaryTab } = await import('../components/chart/ExecutiveSummaryTab');
const { default: PatientSummarySpine } = await import('../components/chart/PatientSummarySpine');
import type { ClinicalProcedureRecord, ClinicServiceItem } from '../services/clinicService';

describe('Consultation Chart, Lab Reports & Dialog Fixes Verification Suite', () => {
  beforeEach(() => {
    mock.module('../context/AuthContext', authContextMockFactory);
    mock.module('../../context/AuthContext', authContextMockFactory);
    mock.module('@context/AuthContext', authContextMockFactory);
    mock.module('../context/StaffContext', staffContextMockFactory);
    mock.module('../../context/StaffContext', staffContextMockFactory);
    mock.module('@context/StaffContext', staffContextMockFactory);
    mockAuthUser = { id: 'u1', role: 'Admin', permissions: ['procedures:write'] };
    (globalThis as any).__mockAuthContext = {
      get user() {
        return mockAuthUser;
      },
      get permissions() {
        return mockAuthUser ? mockAuthUser.permissions : [];
      },
      can: (p: string) => mockAuthUser?.permissions?.includes(p) ?? false,
    };
    (globalThis as any).__mockStaffContext = {
      current: mockStaffList[1], // Nurse by default
      staff: mockStaffList,
      currentName: 'Joy Nurse',
    };
    (globalThis as any).__mockClinicContext = {
      facilityName: 'Metro Health Center',
      rooms: [
        { id: 'rm-1', name: 'Treatment Bay 1', type: 'Treatment', isActive: true },
        { id: 'rm-2', name: 'Treatment Bay 2', type: 'Treatment', isActive: true },
      ],
    };
  });

  afterAll(() => {
    mockAuthUser = null;
    delete (globalThis as any).__mockAuthContext;
    delete (globalThis as any).__mockStaffContext;
    delete (globalThis as any).__mockClinicContext;
  });

  describe('1. Role & Permission Gating for "+ Order Procedure"', () => {
    const sampleProcedures: ClinicalProcedureRecord[] = [
      {
        id: 'proc-1',
        patientId: 'pat-1',
        patientName: 'Juan Dela Cruz',
        procedureName: 'Nebulization Therapy',
        category: 'Procedure',
        status: 'Ordered',
        scheduledAt: new Date().toISOString(),
        orderDate: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      },
    ];

    test('1.1 Renders "+ Order Procedure" when user holds procedures:write permission', () => {
      mockAuthUser = { id: 'u1', role: 'Nurse', permissions: ['procedures:write'] };
      const markup = renderToStaticMarkup(
        React.createElement(NursingProceduresTab, {
          procedures: sampleProcedures,
          patientId: 'pat-1',
          onOrderProcedure: () => {},
        })
      );
      expect(markup).toContain('data-testid="order-procedure-button"');
      expect(markup).toContain('Order Procedure');
    });

    test('1.2 Hides "+ Order Procedure" button when user lacks procedures:write permission', () => {
      mockAuthUser = { id: 'u2', role: 'Guest', permissions: ['procedures:read'] };
      const markup = renderToStaticMarkup(
        React.createElement(NursingProceduresTab, {
          procedures: sampleProcedures,
          patientId: 'pat-1',
          onOrderProcedure: () => {},
        })
      );
      expect(markup).not.toContain('data-testid="order-procedure-button"');
    });
  });

  describe('2. PhilHealth Covered Badge Granularity', () => {
    test('2.1 Does NOT display PhilHealth Covered badge for standard private procedures without PhilHealth code', () => {
      const procs: ClinicalProcedureRecord[] = [
        {
          id: 'proc-priv',
          patientId: 'pat-1',
          patientName: 'Pedro Penduko',
          procedureCode: 'PROC-WOUND',
          procedureName: 'Wound Suture and Dressing',
          category: 'Procedure',
          status: 'Ordered',
          scheduledAt: new Date().toISOString(),
          orderDate: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        },
      ];

      const markup = renderToStaticMarkup(
        React.createElement(NursingProceduresTab, {
          patient: { id: 'pat-1', firstName: 'Pedro', lastName: 'Penduko', philHealthNumber: '12-345678901-2' } as any,
          procedures: procs,
        })
      );

      expect(markup).toContain('Wound Suture and Dressing');
      expect(markup).not.toContain('PhilHealth Covered');
    });

    test('2.2 Displays PhilHealth Covered badge when patient is covered and procedure has statutory or PH code', () => {
      const procs: ClinicalProcedureRecord[] = [
        {
          id: 'proc-stat',
          patientId: 'pat-1',
          patientName: 'Maria Santos',
          procedureCode: '1',
          procedureName: 'Breastfeeding Program Education',
          category: 'Procedure',
          status: 'Completed',
          scheduledAt: new Date().toISOString(),
          orderDate: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        },
      ];

      const markup = renderToStaticMarkup(
        React.createElement(NursingProceduresTab, {
          patient: { id: 'pat-1', firstName: 'Maria', lastName: 'Santos', isYakapEligible: true } as any,
          procedures: procs,
        })
      );

      expect(markup).toContain('Breastfeeding Program Education');
      expect(markup).toContain('PhilHealth Covered');
    });
  });

  describe('3. Execution & Order Procedure Dialog Sticky Footers & Double Padding Removal', () => {
    test('3.1 ProcedureExecutionModal renders buttons in footer prop with sticky action row', () => {
      const sampleProc: ClinicalProcedureRecord = {
        id: 'proc-exec-1',
        patientId: 'pat-1',
        patientName: 'Juan Dela Cruz',
        procedureName: 'Nebulization Therapy',
        category: 'Procedure',
        status: 'Ordered',
        scheduledAt: new Date().toISOString(),
        orderDate: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      };

      const markup = renderToStaticMarkup(
        React.createElement(ProcedureExecutionModal, {
          visible: true,
          procedure: sampleProc,
          onClose: () => {},
        })
      );

      expect(markup).toContain('Execute Procedure: Nebulization Therapy');
      expect(markup).toContain('PRE-PROCEDURE VITALS');
      expect(markup).toContain('ADMINISTRATION &amp; LOT NUMBER TRACKING');
      expect(markup).toContain('POST-PROCEDURE VITALS &amp; OUTCOME');
      expect(markup).toContain('data-testid="requires-doctor-re-eval-toggle"');
      expect(markup).toContain('Complete &amp; Discharge Patient');
    });

    test('3.2 Legacy OrderProcedureModal is deleted and replaced by permission-aware OrderCatalogSearchModal ("Add Test or Procedure")', () => {
      expect((nursingProceduresModule as any).OrderProcedureModal).toBeUndefined();

      mockAuthUser = { id: 'nurse-1', role: 'Nurse', permissions: ['procedures:write'] };
      const catalog: ClinicServiceItem[] = [
        {
          id: 'svc-neb',
          code: 'PROC-NEB',
          name: 'Nebulization Therapy',
          category: 'Procedure',
          standardPrice: 250,
          isActive: true,
          isNurseOrderable: true,
        } as any,
        {
          id: 'svc-excise',
          code: 'PROC-EXCISE',
          name: 'Minor Cyst Excision',
          category: 'Procedure',
          standardPrice: 1200,
          isActive: true,
          isNurseOrderable: false,
        } as any,
        {
          id: 'svc-cbc',
          code: 'LAB-CBC',
          name: 'Complete Blood Count',
          category: 'Diagnostic',
          standardPrice: 300,
          isActive: true,
          isNurseOrderable: false,
        } as any,
      ];

      const markup = renderToStaticMarkup(
        React.createElement(OrderCatalogSearchModal, {
          visible: true,
          catalog,
          initialCategory: 'Procedure',
          initialSelectedItem: catalog[1], // non-nurse-orderable procedure selected by Nurse
          onClose: () => {},
          onSelectOrder: () => {},
        })
      );

      expect(markup).toContain('Add Test or Procedure');
      expect(markup).not.toContain('Order Clinical Procedure');
      expect(markup).toContain('Nurse-Orderable');
      // Nurse without laborders:write should not see non-nurse-orderable Diagnostic category tab
      expect(markup).not.toContain('Complete Blood Count');
      // Non-nurse-orderable procedure requires attending physician selection
      expect(markup).toContain('Attending Physician (Doctor Order) *');
      expect(markup).toContain('Doctor order required');
    });
  });

  describe('4. Ordering Attribution & Cancel Order Authorization (Admin or Ordering User Only)', () => {
    const orderedByDoctorProc: ClinicalProcedureRecord = {
      id: 'proc-doc-1',
      tenantId: 't1',
      clinicId: 'c1',
      patientId: 'pat-1',
      patientName: 'Clarisse Alvarado',
      procedureName: 'Nebulization Therapy',
      category: 'Procedure',
      status: 'Ordered',
      orderedByDoctorId: 'doc-1',
      orderedByDoctorName: 'Dr. Wave Ambray',
      createdBy: 'doc-1',
      scheduledAt: '2026-11-03T02:11:00.000Z',
    };

    test('4.1 Displays who ordered the procedure on the procedure card', () => {
      mockAuthUser = { id: 'admin-1', role: 'Admin', permissions: ['procedures:write'] };
      const markup = renderToStaticMarkup(
        React.createElement(NursingProceduresTab, {
          procedures: [orderedByDoctorProc],
          patientId: 'pat-1',
        })
      );
      expect(markup).toContain('Ordered by Dr. Wave Ambray');
      expect(markup).toContain('data-testid="cancel-procedure-action"');
    });

    test('4.2 Hides Cancel Order when authenticated non-admin user did NOT order the procedure', () => {
      mockAuthUser = { id: 'nurse-1', name: 'Joy Nurse', role: 'Nurse', permissions: ['procedures:write'] };
      (globalThis as any).__mockStaffContext = {
        current: { id: 'nurse-1', firstName: 'Joy', lastName: 'Nurse', role: 'Nurse', isActive: true },
        staff: mockStaffList,
        currentName: 'Joy Nurse',
      };
      const markup = renderToStaticMarkup(
        React.createElement(NursingProceduresTab, {
          procedures: [orderedByDoctorProc],
          patientId: 'pat-1',
        })
      );
      expect(markup).toContain('Ordered by Dr. Wave Ambray');
      expect(markup).toContain('data-testid="execute-procedure-action"');
      expect(markup).not.toContain('data-testid="cancel-procedure-action"');
    });

    test('4.3 Shows Cancel Order when authenticated user IS the ordering clinician', () => {
      mockAuthUser = { id: 'doc-1', name: 'Dr. Wave Ambray', role: 'Doctor', permissions: ['procedures:write'] };
      (globalThis as any).__mockStaffContext = {
        current: { id: 'doc-1', firstName: 'Wave', lastName: 'Ambray', role: 'Doctor', prcLicenseNumber: '12345', isActive: true },
        staff: mockStaffList,
        currentName: 'Dr. Wave Ambray',
      };
      const markup = renderToStaticMarkup(
        React.createElement(NursingProceduresTab, {
          procedures: [orderedByDoctorProc],
          patientId: 'pat-1',
        })
      );
      expect(markup).toContain('data-testid="cancel-procedure-action"');
    });
  });

  describe('5. Patient Chart Clinic Date Formatting, YAKAP Labeling, and Jargon-Free Highlighted Diagnoses', () => {
    test('5.1 AdministrativeDocumentsTab formats issueDate and referralDate using clinic dateFormat setting', () => {
      (globalThis as any).__mockClinicContext = {
        facilityName: 'Metro Health Center',
        dateFormat: 'MM/dd/yyyy',
        timeFormat: '12h',
        timeZoneId: 'Asia/Manila',
      };

      const markup = renderToStaticMarkup(
        React.createElement(AdministrativeDocumentsTab, {
          medicalCertificates: [
            {
              id: 'mc-1',
              certificateNumber: 'MC-20260613-00692-F2DC',
              patientId: 'pat-1',
              patientName: 'Clarisse Alvarado',
              doctorName: 'Dr. Jose Rizal',
              prcLicenseNumber: '0098765',
              issueDate: '2026-06-13',
              diagnosis: 'Tension-type headache',
              fitnessStatus: 'FitToWork',
              isSigned: true,
              createdAt: '2026-06-13T09:00:00Z',
            } as any,
          ],
          referralLetters: [
            {
              id: 'ref-1',
              referralNumber: 'REF-20260614-001',
              patientId: 'pat-1',
              patientName: 'Clarisse Alvarado',
              referringDoctorName: 'Dr. Jose Rizal',
              referralDate: '2026-06-14',
              referredToFacility: 'PGH',
              referredDepartment: 'Neurology',
              provisionalDiagnosis: 'Tension-type headache',
              reasonForReferral: 'Further evaluation',
              isSigned: true,
              createdAt: '2026-06-14T09:00:00Z',
            } as any,
          ],
        })
      );

      expect(markup).toContain('Issued on 06/13/2026');
      expect(markup).not.toContain('Issued on 2026-06-13');
      expect(markup).toContain('Referred on 06/14/2026');
      expect(markup).not.toContain('Referred on 2026-06-14');
    });

    test('5.2 EncountersTimelineTab renders YAKAP badge and highlighted diagnosis descriptions without ICD-10 code jargon', () => {
      (globalThis as any).__mockClinicContext = {
        facilityName: 'Metro Health Center',
        dateFormat: 'MMM d, yyyy',
        timeFormat: '12h',
        timeZoneId: 'Asia/Manila',
      };

      const markup = renderToStaticMarkup(
        React.createElement(EncountersTimelineTab, {
          consultations: [
            {
              id: 'enc-yakap-1',
              encounterDate: '2026-11-03T09:13:00Z',
              doctorId: 'doc-1',
              doctorName: 'Dr. Justine Mae Tabasan',
              doctorPrcLicense: '12345',
              isSigned: true,
              isYakapEligible: true,
              subjective: 'Patient presents with headache and loose stools.',
              objective: 'Awake, alert.',
              assessment: 'No narrative assessment documented.',
              plan: 'Hydration and rest.',
              diagnoses: [
                { id: 'd1', icd10Code: 'G44.2', description: 'Tension-type headache', isPrimary: true },
                { id: 'd2', icd10Code: 'A09.9', description: 'Diarrhea', isPrimary: false },
              ],
              prescriptions: [],
            } as any,
          ],
        })
      );

      expect(markup).toContain('YAKAP');
      expect(markup).not.toContain('PhilHealth Konsulta');
      expect(markup).toContain('Tension-type headache');
      expect(markup).toContain('Diarrhea');
      expect(markup).not.toContain('G44.2');
      expect(markup).not.toContain('A09.9');
    });

    test('5.3 ExecutiveSummaryTab and PatientSummarySpine omit ICD-10 codes and format problem onsetDate per clinic settings', () => {
      (globalThis as any).__mockClinicContext = {
        facilityName: 'Metro Health Center',
        dateFormat: 'MM/dd/yyyy',
        timeFormat: '12h',
        timeZoneId: 'Asia/Manila',
      };

      const problems = [
        {
          id: 'prob-1',
          clinicId: 'c1',
          patientId: 'pat-1',
          icd10Code: 'A09.9',
          problemTitle: 'Diarrhea',
          status: 'Active',
          severity: 'Moderate',
          isChronicNcd: false,
          onsetDate: '2026-11-03',
          recordedByDoctorId: 'doc-1',
          recordedByDoctorName: 'Dr. Tabasan',
          createdAt: '2026-11-03T00:00:00Z',
        },
        {
          id: 'prob-2',
          clinicId: 'c1',
          patientId: 'pat-1',
          icd10Code: 'M10.9',
          problemTitle: 'Gout, unspecified',
          status: 'Active',
          severity: 'Moderate',
          isChronicNcd: true,
          onsetDate: '2021-01-01',
          recordedByDoctorId: 'doc-1',
          recordedByDoctorName: 'Dr. Tabasan',
          createdAt: '2021-01-01T00:00:00Z',
        },
      ] as any;

      const summaryMarkup = renderToStaticMarkup(
        React.createElement(ExecutiveSummaryTab, {
          patient: { id: 'pat-1', firstName: 'Clarisse', lastName: 'Alvarado' } as any,
          chart: {
            patientId: 'pat-1',
            totalVisits: 2,
            consultations: [],
            vitalsHistory: [],
            proceduresHistory: [],
            labOrdersHistory: [],
            invoicesHistory: [],
            problems,
            allergies: [],
          } as any,
          onNavigateTab: () => {},
        })
      );

      expect(summaryMarkup).toContain('Diarrhea');
      expect(summaryMarkup).toContain('Gout, unspecified');
      expect(summaryMarkup).not.toContain('A09.9');
      expect(summaryMarkup).not.toContain('M10.9');
      expect(summaryMarkup).toContain('Onset: 11/03/2026');
      expect(summaryMarkup).toContain('Onset: 01/01/2021');
      expect(summaryMarkup).not.toContain('Onset: 2026-11-03');

      const spineMarkup = renderToStaticMarkup(
        React.createElement(PatientSummarySpine, {
          patient: {
            id: 'pat-1',
            patientCode: 'PAT-2026-01047',
            firstName: 'Clarisse',
            lastName: 'Alvarado',
            sex: 'Female',
            dateOfBirth: '1977-06-04',
          } as any,
          problems,
          allergies: [],
          consultations: [],
          vitalsHistory: [],
          defaultExpanded: true,
        })
      );

      expect(spineMarkup).toContain('Active Chronic Problems');
      expect(spineMarkup).not.toContain('Active Chronic Problems (ICD-10)');
      expect(spineMarkup).toContain('Diarrhea');
      expect(spineMarkup).toContain('Gout, unspecified');
      expect(spineMarkup).not.toContain('A09.9');
      expect(spineMarkup).not.toContain('M10.9');
    });
  });
});

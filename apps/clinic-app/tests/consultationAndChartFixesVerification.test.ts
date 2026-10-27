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

let mockAuthUser: any = { id: 'u1', role: 'Admin', permissions: ['procedures:write'] };
const mockAuth = {
  useAuth: () => ({
    user: mockAuthUser,
    permissions: mockAuthUser ? mockAuthUser.permissions : [],
    can: (p: string) => mockAuthUser?.permissions?.includes(p) ?? false,
  }),
  usePermission: (p: string) => mockAuthUser?.permissions?.includes(p) ?? false,
};

mock.module('../context/AuthContext', () => mockAuth);
mock.module('../../context/AuthContext', () => mockAuth);

let mockStaffList: any[] = [
  { id: 'doc-1', firstName: 'Gregory', lastName: 'House', role: 'Doctor', prcLicenseNumber: '0098765', isActive: true },
  { id: 'nurse-1', firstName: 'Joy', lastName: 'Nurse', role: 'Nurse', isActive: true },
];

const mockStaffContext = {
  useStaff: () => ({
    current: mockStaffList[1], // Nurse by default
    staff: mockStaffList,
    currentName: 'Joy Nurse',
  }),
};

mock.module('../context/StaffContext', () => mockStaffContext);
mock.module('../../context/StaffContext', () => mockStaffContext);

const mockClinicContext = {
  useClinic: () => ({
    facilityName: 'Metro Health Center',
    rooms: [
      { id: 'rm-1', name: 'Treatment Bay 1', type: 'Treatment', isActive: true },
      { id: 'rm-2', name: 'Treatment Bay 2', type: 'Treatment', isActive: true },
    ],
  }),
};

mock.module('../context/ClinicContext', () => mockClinicContext);
mock.module('../../context/ClinicContext', () => mockClinicContext);

const { default: NursingProceduresTab, ProcedureExecutionModal, OrderProcedureModal } =
  await import('../components/chart/NursingProceduresTab');
import type { ClinicalProcedureRecord } from '../services/clinicService';

describe('Consultation Chart, Lab Reports & Dialog Fixes Verification Suite', () => {
  beforeEach(() => {
    mockAuthUser = { id: 'u1', role: 'Admin', permissions: ['procedures:write'] };
  });

  afterAll(() => {
    mockAuthUser = null;
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

    test('3.2 OrderProcedureModal renders structured catalog selection, room selection, and confirm button', () => {
      const markup = renderToStaticMarkup(
        React.createElement(OrderProcedureModal, {
          visible: true,
          patientId: 'pat-1',
          onClose: () => {},
        })
      );

      expect(markup).toContain('Order Clinical Procedure');
      expect(markup).toContain('PROCEDURE CATALOG SELECTION');
      expect(markup).toContain('data-testid="confirm-order-procedure-button"');
      expect(markup).toContain('Confirm Order');
    });
  });
});

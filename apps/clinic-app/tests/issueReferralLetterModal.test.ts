// token-guard:ignore-file
import { describe, expect, test, mock, beforeEach } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

(globalThis as any).__DEV__ = true;

// Mock React Native modules for Bun environment
const createMockComponent = (name: string) => {
  const Comp = ({ children }: any) => React.createElement('div', { 'data-component': name }, children);
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
  Image: createMockComponent('Image'),
  Dimensions: {
    get: () => ({ width: 1024, height: 768 }),
    addEventListener: () => ({ remove: () => {} }),
  },
  useWindowDimensions: () => ({ width: 1024, height: 768 }),
  Keyboard: { dismiss: () => {}, addListener: () => ({ remove: () => {} }) },
  AppState: { addEventListener: () => ({ remove: () => {} }) },
  Platform: { OS: 'web', select: (obj: any) => obj.web ?? obj.default },
  Touchable: { Mixin: {} },
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
  Alert: { alert: () => {} },
}));

mock.module('expo-crypto', () => ({
  randomUUID: () => 'mock-uuid-' + Math.random().toString(36).substring(2, 9),
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
}));

mock.module('../constants/fonts', () => ({
  applyFontFamily: (s: any) => s,
  fontAssets: {},
}));

// API Client & Service Mock
let lastPostUrl = '';
let lastPostPayload: any = null;
let mockPostResponse: any = null;
let mockPostError: any = null;

let lastEnsureVisitPayload: any = null;
let mockEnsureVisitResponse: any = { id: 'direct-visit-123' };
let mockEnsureVisitError: any = null;

let openedDocumentUrl = '';

mock.module('../services/documentOpener', () => ({
  openDocument: async (url: string) => {
    openedDocumentUrl = url;
    return true;
  },
}));

mock.module('../services/clinicService', () => {
  const original = {
    issueReferralLetter: async (payload: any) => {
      lastPostPayload = payload;
      if (mockPostError) return [null, mockPostError];
      return [
        mockPostResponse || {
          id: 'ref-letter-1',
          referralNumber: 'REF-20261112-0001',
          patientId: payload.patientId,
          patientName: payload.patientName,
          referredToFacility: payload.referredToFacility,
          referredDepartment: payload.referredDepartment,
          urgency: payload.urgency || 'Routine',
          provisionalDiagnosis: payload.provisionalDiagnosis,
          reasonForReferral: payload.reasonForReferral,
          clinicalSummary: payload.clinicalSummary,
        },
        null,
      ];
    },
    ensureDirectVisit: async (payload: any) => {
      lastEnsureVisitPayload = payload;
      if (mockEnsureVisitError) return [null, mockEnsureVisitError];
      return [mockEnsureVisitResponse, null];
    },
    getReferralLetterPdfUrl: (id: string) => `http://localhost:5000/api/v1/documents/referrals/${id}/pdf`,
  };
  return {
    ...original,
    clinicService: original,
  };
});

// Mock Staff and Clinic Contexts
mock.module('../context/StaffContext', () => ({
  useStaff: () => ({
    current: { id: 'staff-dr-1', role: 'Doctor', title: 'Dr.', firstName: 'Jose', lastName: 'Rizal', status: 'Active' },
    currentName: 'Dr. Jose Rizal',
    staff: [
      { id: 'staff-dr-1', role: 'Doctor', title: 'Dr.', firstName: 'Jose', lastName: 'Rizal', status: 'Active' },
      { id: 'staff-dr-2', role: 'Doctor', title: 'Dr.', firstName: 'Maria', lastName: 'Santos', status: 'Active' },
    ],
  }),
}));

mock.module('../context/ClinicContext', () => ({
  useClinic: () => ({
    settings: {},
    dateFormat: 'YYYY-MM-DD',
    timeZoneId: 'Asia/Manila',
  }),
}));

const { default: IssueReferralLetterModal } = await import('../components/patient/IssueReferralLetterModal');

describe('IssueReferralLetterModal Unit Tests (Issue #167)', () => {
  beforeEach(() => {
    lastPostUrl = '';
    lastPostPayload = null;
    mockPostResponse = null;
    mockPostError = null;
    lastEnsureVisitPayload = null;
    mockEnsureVisitResponse = { id: 'direct-visit-123' };
    mockEnsureVisitError = null;
    openedDocumentUrl = '';
  });

  const mockPatient: any = {
    id: 'pat-999',
    fullName: 'Juan Luna',
    firstName: 'Juan',
    lastName: 'Luna',
    dateOfBirth: '1985-10-23',
  };

  test('1. Renders modal markup with all essential clinical referral fields', () => {
    const markup = renderToStaticMarkup(
      React.createElement(IssueReferralLetterModal, {
        visible: true,
        onClose: () => {},
        patient: mockPatient,
      })
    );

    expect(markup).toContain('Issue Referral Letter');
    expect(markup).toContain('Juan Luna');
    expect(markup).toContain('Referring Physician');
    expect(markup).toContain('Receiving Facility &amp; Department');
    expect(markup).toContain('Receiving Facility *');
    expect(markup).toContain('Department / Specialty *');
    expect(markup).toContain('Clinical Urgency');
    expect(markup).toContain('Routine');
    expect(markup).toContain('Urgent');
    expect(markup).toContain('Emergency (STAT)');
    expect(markup).toContain('Clinical Evaluation &amp; Reason');
    expect(markup).toContain('Provisional Diagnosis / Assessment *');
    expect(markup).toContain('Reason for Referral *');
    expect(markup).toContain('Clinical Summary / Findings *');
    expect(markup).toContain('Cancel');
    expect(markup).toContain('Dr. Rizal');
  });

  test('2. Exports from patient components index correctly', async () => {
    const indexExports = await import('../components/patient');
    expect(indexExports.IssueReferralLetterModal).toBeDefined();
  });
});

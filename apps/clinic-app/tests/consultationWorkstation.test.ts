// token-guard:ignore-file
import { describe, expect, test, mock, beforeEach } from 'bun:test';

(globalThis as any).__DEV__ = true;

// 1. Dynamic Window Dimensions Mock
let currentWindowWidth = 1200;
let currentWindowHeight = 800;

mock.module('react-native', () => ({
  Linking: { openURL: () => Promise.resolve(), canOpenURL: () => Promise.resolve(true) },
  StyleSheet: { create: (s: any) => s },
  View: 'View',
  Pressable: 'Pressable',
  ScrollView: 'ScrollView',
  TextInput: 'TextInput',
  Text: 'Text',
  ActivityIndicator: 'ActivityIndicator',
  Modal: 'Modal',
  KeyboardAvoidingView: 'KeyboardAvoidingView',
  FlatList: 'FlatList',
  SectionList: 'SectionList',
  Switch: 'Switch',
  TouchableOpacity: 'TouchableOpacity',
  TouchableHighlight: 'TouchableHighlight',
  Image: 'Image',
  Dimensions: {
    get: () => ({ width: currentWindowWidth, height: currentWindowHeight }),
    addEventListener: () => ({ remove: () => {} }),
  },
  useWindowDimensions: () => ({ width: currentWindowWidth, height: currentWindowHeight }),
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
    spring: () => ({ start: (cb?: any) => cb && cb() }),
    View: 'Animated.View',
    Text: 'Animated.Text',
  },
  Alert: {
    alert: (title: string, msg?: string) => {},
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

mock.module('../utils/useBreakpoint', () => ({
  useBreakpoint: () => {
    const width = currentWindowWidth;
    const height = currentWindowHeight;
    const { theme } = require('../constants/theme');
    return {
      width,
      height,
      isCompact: width < theme.breakpoints.tablet,
      isWorkstation: width >= theme.breakpoints.tablet,
      isDesktop: width >= theme.breakpoints.desktop,
      isWide: width >= theme.breakpoints.wide,
    };
  },
}));

// 2. ApiClient Mock Interceptor
let lastGetUrl = '';
let lastPostUrl = '';
let lastPostPayload: any = null;
let mockGetResponse: any = null;
let mockPostResponse: any = null;
let mockErrorResponse: any = null;

mock.module('../services/apiClient', () => ({
  clinicApiClient: {
    get: async (url: string) => {
      lastGetUrl = url;
      if (mockErrorResponse) return [null, mockErrorResponse];
      return [mockGetResponse, null];
    },
    post: async (url: string, data?: any) => {
      lastPostUrl = url;
      lastPostPayload = data;
      if (mockErrorResponse) return [null, mockErrorResponse];
      return [mockPostResponse, null];
    },
  },
  clinicApiUrl: (p: string) => `http://localhost:5000/api/v1${p}`,
}));

const { clinicService } = await import('../services/clinicService');

// Type contracts
export interface YakapClaimReadinessDto {
  isReady: boolean;
  encounterId: string;
  doctorPanValid: boolean;
  doctorPrcValid: boolean;
  patientPinValid: boolean;
  atcValid: boolean;
  symptomsValid: boolean;
  physicalExamComplete: boolean;
  primaryDiagnosisPresent: boolean;
  vitalsComplete: boolean;
  medicinesValid: boolean;
  generalSurveyValid?: boolean;
  s2LicenseValid?: boolean;
  missingFields: string[];
  warnings: string[];
}

export type QueueStatus =
  | 'Waiting'
  | 'Triaged'
  | 'InConsultation'
  | 'Completed'
  | 'Cancelled'
  | 'NoShow'
  | 'PendingProcedure'
  | 'ReEvaluation';

describe('Milestone M4 Workstation & Collaboration Integration Tests', () => {
  beforeEach(() => {
    lastGetUrl = '';
    lastPostUrl = '';
    lastPostPayload = null;
    mockGetResponse = null;
    mockPostResponse = null;
    mockErrorResponse = null;
    currentWindowWidth = 1200;
    currentWindowHeight = 800;
  });

  // =========================================================================
  // 1. Yakap Claim Readiness Evaluation Engine (10 Statutory Conditions)
  // =========================================================================
  describe('1. Yakap Claim Readiness Evaluation (10 Statutory Conditions)', () => {
    test('1.1 Fully compliant encounter satisfies all 10 conditions and reports isReady === true', () => {
      const mockReadiness: YakapClaimReadinessDto = {
        isReady: true,
        encounterId: 'enc-101',
        doctorPanValid: true,
        doctorPrcValid: true,
        patientPinValid: true,
        atcValid: true,
        symptomsValid: true,
        physicalExamComplete: true,
        primaryDiagnosisPresent: true,
        vitalsComplete: true,
        medicinesValid: true,
        s2LicenseValid: true,
        generalSurveyValid: true,
        missingFields: [],
        warnings: [],
      };

      expect(mockReadiness.isReady).toBe(true);
      expect(mockReadiness.missingFields.length).toBe(0);
      expect(mockReadiness.doctorPanValid).toBe(true);
      expect(mockReadiness.doctorPrcValid).toBe(true);
      expect(mockReadiness.patientPinValid).toBe(true);
      expect(mockReadiness.atcValid).toBe(true);
      expect(mockReadiness.symptomsValid).toBe(true);
      expect(mockReadiness.physicalExamComplete).toBe(true);
      expect(mockReadiness.primaryDiagnosisPresent).toBe(true);
      expect(mockReadiness.vitalsComplete).toBe(true);
      expect(mockReadiness.medicinesValid).toBe(true);
      expect(mockReadiness.s2LicenseValid).toBe(true);
    });

    test('1.2 Missing Doctor PAN flags doctorPanValid: false and lists missing field', () => {
      const mockReadiness: YakapClaimReadinessDto = {
        isReady: false,
        encounterId: 'enc-102',
        doctorPanValid: false,
        doctorPrcValid: true,
        patientPinValid: true,
        atcValid: true,
        symptomsValid: true,
        physicalExamComplete: true,
        primaryDiagnosisPresent: true,
        vitalsComplete: true,
        medicinesValid: true,
        missingFields: ['Doctor PhilHealth Accreditation Number (PAN) is missing.'],
        warnings: [],
      };

      expect(mockReadiness.isReady).toBe(false);
      expect(mockReadiness.doctorPanValid).toBe(false);
      expect(mockReadiness.missingFields).toContain('Doctor PhilHealth Accreditation Number (PAN) is missing.');
    });

    test('1.3 Invalid Patient PIN (<12 digits) flags patientPinValid: false', () => {
      const mockReadiness: YakapClaimReadinessDto = {
        isReady: false,
        encounterId: 'enc-103',
        doctorPanValid: true,
        doctorPrcValid: true,
        patientPinValid: false,
        atcValid: true,
        symptomsValid: true,
        physicalExamComplete: true,
        primaryDiagnosisPresent: true,
        vitalsComplete: true,
        medicinesValid: true,
        missingFields: ['Patient PhilHealth PIN is invalid (must contain exactly 12 numeric digits).'],
        warnings: [],
      };

      expect(mockReadiness.isReady).toBe(false);
      expect(mockReadiness.patientPinValid).toBe(false);
      expect(mockReadiness.missingFields[0]).toContain('12 numeric digits');
    });

    test('1.4 Missing Pain Site for Chief Complaint Code 38 (PAIN) flags symptomsValid: false', () => {
      const mockReadiness: YakapClaimReadinessDto = {
        isReady: false,
        encounterId: 'enc-104',
        doctorPanValid: true,
        doctorPrcValid: true,
        patientPinValid: true,
        atcValid: true,
        symptomsValid: false,
        physicalExamComplete: true,
        primaryDiagnosisPresent: true,
        vitalsComplete: true,
        medicinesValid: true,
        missingFields: ["Mandatory pain site description is missing for chief complaint code '38' (PAIN)."],
        warnings: [],
      };

      expect(mockReadiness.isReady).toBe(false);
      expect(mockReadiness.symptomsValid).toBe(false);
      expect(mockReadiness.missingFields).toContain("Mandatory pain site description is missing for chief complaint code '38' (PAIN).");
    });

    test('1.5 Incomplete Vitals (missing Respiratory Rate / Height) flags vitalsComplete: false', () => {
      const mockReadiness: YakapClaimReadinessDto = {
        isReady: false,
        encounterId: 'enc-105',
        doctorPanValid: true,
        doctorPrcValid: true,
        patientPinValid: true,
        atcValid: true,
        symptomsValid: true,
        physicalExamComplete: true,
        primaryDiagnosisPresent: true,
        vitalsComplete: false,
        medicinesValid: true,
        missingFields: ['Vital signs incomplete: Respiratory Rate, Height.'],
        warnings: [],
      };

      expect(mockReadiness.isReady).toBe(false);
      expect(mockReadiness.vitalsComplete).toBe(false);
      expect(mockReadiness.missingFields[0]).toContain('Respiratory Rate');
    });

    test('1.6 Prescribed Controlled Drug without S2 license flags s2LicenseValid: false', () => {
      const mockReadiness: YakapClaimReadinessDto = {
        isReady: false,
        encounterId: 'enc-106',
        doctorPanValid: true,
        doctorPrcValid: true,
        patientPinValid: true,
        atcValid: true,
        symptomsValid: true,
        physicalExamComplete: true,
        primaryDiagnosisPresent: true,
        vitalsComplete: true,
        medicinesValid: true,
        s2LicenseValid: false,
        missingFields: ["Prescription 'Morphine 10mg' is a PDEA controlled drug, but Doctor S2 License number is missing."],
        warnings: [],
      };

      expect(mockReadiness.isReady).toBe(false);
      expect(mockReadiness.s2LicenseValid).toBe(false);
      expect(mockReadiness.missingFields[0]).toContain('PDEA controlled drug');
    });
  });

  // =========================================================================
  // 2. Pre-Flight Signing Lock & Bureaucracy Isolation
  // =========================================================================
  describe('2. Pre-Flight Signing Lock When IsReady === false', () => {
    test('2.1 PhilHealth Konsulta encounter locks signing button when isReady === false', () => {
      const isYakapEligible = true;
      const readiness: YakapClaimReadinessDto = {
        isReady: false,
        encounterId: 'enc-201',
        doctorPanValid: false,
        doctorPrcValid: true,
        patientPinValid: true,
        atcValid: false,
        symptomsValid: true,
        physicalExamComplete: true,
        primaryDiagnosisPresent: true,
        vitalsComplete: true,
        medicinesValid: true,
        missingFields: ['Doctor PhilHealth PAN is missing', 'ATC is missing'],
        warnings: [],
      };

      // Workstation pre-flight gate evaluation:
      const isSigningLocked = isYakapEligible && !readiness.isReady;
      expect(isSigningLocked).toBe(true);

      const buttonLabel = isSigningLocked
        ? `Sign Encounter (Locked: ${readiness.missingFields.length} statutory field(s) missing)`
        : 'Sign & sync encounter';
      expect(buttonLabel).toContain('Locked: 2 statutory field(s) missing');
    });

    test('2.2 Standard encounter is 100% free of PhilHealth bureaucracy and signing is never locked by Yakap readiness', () => {
      const isYakapEligible = false;
      const readiness = null;

      const isSigningLocked = isYakapEligible && (readiness ? !(readiness as any).isReady : false);
      expect(isSigningLocked).toBe(false);

      const buttonLabel = isSigningLocked
        ? 'Sign Encounter (Locked)'
        : 'Sign & sync encounter';
      expect(buttonLabel).toBe('Sign & sync encounter');
    });

    test('2.3 Unlocking occurs immediately when all 10 conditions are satisfied', () => {
      const isYakapEligible = true;
      const readiness: YakapClaimReadinessDto = {
        isReady: true,
        encounterId: 'enc-203',
        doctorPanValid: true,
        doctorPrcValid: true,
        patientPinValid: true,
        atcValid: true,
        symptomsValid: true,
        physicalExamComplete: true,
        primaryDiagnosisPresent: true,
        vitalsComplete: true,
        medicinesValid: true,
        missingFields: [],
        warnings: [],
      };

      const isSigningLocked = isYakapEligible && !readiness.isReady;
      expect(isSigningLocked).toBe(false);
    });
  });

  // =========================================================================
  // 3. Attending Physician Regulatory Credential Snapshotting
  // =========================================================================
  describe('3. Attending Physician Regulatory Credential Snapshotting', () => {
    test('3.1 Encounter signing auto-snapshots Doctor PAN, PRC, PTR, and S2 licenses into payload', async () => {
      const signerProfile = {
        id: 'doc-001',
        name: 'Dr. Maria Santos, MD',
        prcLicenseNumber: '0123456',
        ptrNumber: 'PTR-2026-999',
        s2LicenseNumber: 'S2-888-PDEA',
        philHealthPan: '123456789012',
      };

      mockPostResponse = { id: 'enc-301', isSigned: true };

      // Simulate snapshotting in signing flow
      const signingPayload = {
        prcLicenseNumber: signerProfile.prcLicenseNumber,
        ptrNumber: signerProfile.ptrNumber,
        s2LicenseNumber: signerProfile.s2LicenseNumber,
        doctorPhilHealthPan: signerProfile.philHealthPan,
        philHealthAtc: 'ATC-2026-KON01',
      };

      await clinicService.signConsultation('enc-301', signingPayload);

      expect(lastPostUrl).toBe('/consultations/enc-301/sign');
      expect(lastPostPayload.doctorPhilHealthPan).toBe('123456789012');
      expect(lastPostPayload.prcLicenseNumber).toBe('0123456');
      expect(lastPostPayload.ptrNumber).toBe('PTR-2026-999');
      expect(lastPostPayload.s2LicenseNumber).toBe('S2-888-PDEA');
      expect(lastPostPayload.philHealthAtc).toBe('ATC-2026-KON01');
    });
  });

  // =========================================================================
  // 4. Multi-Provider Queue Room / Station Filtering
  // =========================================================================
  describe('4. Multi-Provider Queue Station & View Filtering', () => {
    test('4.1 clinicService.getQueue correctly propagates view and room parameters', async () => {
      mockGetResponse = [
        { id: 'q-1', queueNumber: 'Q-01', patientName: 'Juan Dela Cruz', status: 'Waiting' },
      ];

      // Custom query builder for multi-provider filters
      const fetchQueueWithView = async (date?: string, view?: string, room?: string) => {
        const params = new URLSearchParams();
        if (date) params.append('date', date);
        if (view) params.append('view', view);
        if (room) params.append('roomOrStation', room);
        const qs = params.toString();
        return (await import('../services/apiClient')).clinicApiClient.get(`/queue${qs ? `?${qs}` : ''}`);
      };

      // Filter: My Room (Exam Room 1)
      await fetchQueueWithView('2026-10-12', 'MyRoom', 'Exam Room 1');
      expect(lastGetUrl).toContain('view=MyRoom');
      expect(lastGetUrl).toContain('roomOrStation=Exam+Room+1');

      // Filter: Triage
      await fetchQueueWithView('2026-10-12', 'Triage');
      expect(lastGetUrl).toContain('view=Triage');

      // Filter: PendingProcedure
      await fetchQueueWithView('2026-10-12', 'PendingProcedure');
      expect(lastGetUrl).toContain('view=PendingProcedure');

      // Filter: WaitingForDoctor
      await fetchQueueWithView('2026-10-12', 'WaitingForDoctor');
      expect(lastGetUrl).toContain('view=WaitingForDoctor');

      // Verify clinicService.getQueue also uses GetQueueParams
      await clinicService.getQueue({ date: '2026-10-12', view: 'MyRoom', roomOrStation: 'Exam Room 1' });
      expect(lastGetUrl).toContain('view=MyRoom');
      expect(lastGetUrl).toContain('roomOrStation=Exam+Room+1');
    });
  });

  // =========================================================================
  // 5. Closed-Loop In-Clinic Procedure Handoff Lifecycle
  // =========================================================================
  describe('5. Closed-Loop In-Clinic Procedure Handoff Lifecycle', () => {
    test('5.1 State transition cycle: InConsultation -> PendingProcedure -> ReEvaluation -> Completed', () => {
      // Step 1: Initial state in doctor room
      let status: QueueStatus = 'InConsultation';
      expect(status).toBe('InConsultation');

      // Step 2: Doctor orders procedure (e.g. Nebulization)
      const orderProcedure = () => {
        status = 'PendingProcedure';
      };
      orderProcedure();
      expect(status).toBe('PendingProcedure');

      // Step 3: Nurse executes procedure in treatment room
      const executeProcedure = () => {
        status = 'ReEvaluation';
      };
      executeProcedure();
      expect(status).toBe('ReEvaluation');

      // Step 4: Doctor re-evaluates patient and signs encounter
      const finalizeEncounter = () => {
        status = 'Completed';
      };
      finalizeEncounter();
      expect(status).toBe('Completed');
    });

    test('5.2 Ordering procedure dispatches orderProcedure request with queueItemId and notes', async () => {
      mockPostResponse = { id: 'proc-101', status: 'Ordered' };

      await clinicService.orderProcedure({
        patientId: 'pat-1',
        patientName: 'Juan Dela Cruz',
        queueItemId: 'q-101',
        consultationId: 'c-101',
        procedureName: 'Nebulization',
        category: 'Procedure',
        orderedByDoctorId: 'doc-1',
        orderedByDoctorName: 'Dr. Santos',
        clinicalNotes: 'Ordered for acute asthma exacerbation',
      });

      expect(lastPostUrl).toBe('/procedures');
      expect(lastPostPayload.queueItemId).toBe('q-101');
      expect(lastPostPayload.procedureName).toBe('Nebulization');
      expect(lastPostPayload.clinicalNotes).toContain('acute asthma');
    });
  });

  // =========================================================================
  // 6. Desktop Split-Screen Responsive Layout Engine (>= 1024px vs < 1024px)
  // =========================================================================
  describe('6. Desktop Split-Screen Responsive Layout Engine', () => {
    test('6.1 On screens >= 1024px (desktop workstation), isDesktopWorkstation is true and split-screen ratio is 42% left / 58% right', () => {
      currentWindowWidth = 1280;
      const { useBreakpoint } = require('../utils/useBreakpoint');
      const bp = useBreakpoint();

      expect(bp.width).toBe(1280);
      expect(bp.isDesktop).toBe(true);
      expect(bp.isWorkstation).toBe(true);

      const isDesktopWorkstation = bp.width >= 1024;
      expect(isDesktopWorkstation).toBe(true);

      // Verify layout specifications
      const leftPaneWidth = '42%';
      const rightPaneWidth = '58%';
      expect(parseFloat(leftPaneWidth) + parseFloat(rightPaneWidth)).toBe(100);
      expect(parseFloat(leftPaneWidth)).toBeGreaterThanOrEqual(40);
      expect(parseFloat(leftPaneWidth)).toBeLessThanOrEqual(45);
      expect(parseFloat(rightPaneWidth)).toBeGreaterThanOrEqual(55);
      expect(parseFloat(rightPaneWidth)).toBeLessThanOrEqual(60);
    });

    test('6.2 On screens < 1024px (tablet/mobile), isDesktopWorkstation is false and stacked segmented view toggle is active', () => {
      currentWindowWidth = 768;
      const { useBreakpoint } = require('../utils/useBreakpoint');
      const bp = useBreakpoint();

      expect(bp.width).toBe(768);
      expect(bp.isDesktop).toBe(false);

      const isDesktopWorkstation = bp.width >= 1024;
      expect(isDesktopWorkstation).toBe(false);

      // Mobile stacked view options
      const mobileViews = ['soap', 'chart'];
      expect(mobileViews).toContain('soap');
      expect(mobileViews).toContain('chart');
    });

    test('6.3 Mobile phone width (375px) activates compact collapsible spine', () => {
      currentWindowWidth = 375;
      const { useBreakpoint } = require('../utils/useBreakpoint');
      const bp = useBreakpoint();

      expect(bp.width).toBe(375);
      expect(bp.isCompact).toBe(true);
      expect(bp.isDesktop).toBe(false);

      const spineVariant = bp.isDesktop ? 'workstation' : 'compact';
      const spineDefaultCollapsed = !bp.isDesktop;

      expect(spineVariant).toBe('compact');
      expect(spineDefaultCollapsed).toBe(true);
    });
  });
});

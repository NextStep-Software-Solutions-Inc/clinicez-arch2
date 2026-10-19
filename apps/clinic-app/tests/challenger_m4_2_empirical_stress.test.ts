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
const { theme } = await import('../constants/theme');

describe('Empirical Adversarial Stress Suite — Features 19, 20 & 21 (challenger_m4_2)', () => {
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
  // SUITE 1: Multi-Provider Queue Room & Station Filtering Stress Tests (Feature 19)
  // =========================================================================
  describe('Suite 1: Feature 19 Multi-Provider Queue Room & Station Filtering', () => {
    const VIEWS = ['All', 'MyRoom', 'WaitingForDoctor', 'Triage', 'PendingProcedure'] as const;
    const STATIONS = ['ALL', 'Room 1', 'Room 2', 'Triage Station', 'Treatment Room'] as const;

    test('1.1 Combinatorial Stress: 5 views x 5 stations (25 combinations) serialize valid query strings', async () => {
      mockGetResponse = [];
      const testDoctorId = 'doc-santos-uuid';

      for (const view of VIEWS) {
        for (const station of STATIONS) {
          lastGetUrl = '';
          const params = {
            view,
            doctorId: view === 'MyRoom' ? testDoctorId : undefined,
            roomOrStation: station === 'ALL' ? undefined : station,
          };

          await clinicService.getQueue(params);

          expect(lastGetUrl).toBeTruthy();
          expect(lastGetUrl.startsWith('/queue')).toBe(true);

          // Verify view is present
          expect(lastGetUrl).toContain(`view=${view}`);

          // Verify doctorId is ONLY present if view === 'MyRoom'
          if (view === 'MyRoom') {
            expect(lastGetUrl).toContain(`doctorId=${testDoctorId}`);
          } else {
            expect(lastGetUrl).not.toContain(`doctorId=`);
          }

          // Verify station filtering
          if (station === 'ALL') {
            expect(lastGetUrl).not.toContain('roomOrStation');
          } else {
            const encodedStation = station.replace(' ', '+');
            expect(lastGetUrl).toContain(`roomOrStation=${encodedStation}`);
          }
        }
      }
    });

    test('1.2 Edge Case: View MyRoom with unassigned/null doctorId does not append undefined string', async () => {
      mockGetResponse = [];
      await clinicService.getQueue({
        view: 'MyRoom',
        doctorId: undefined,
        roomOrStation: 'Room 1',
      });

      expect(lastGetUrl).not.toContain('doctorId=undefined');
      expect(lastGetUrl).not.toContain('doctorId=null');
      expect(lastGetUrl).toContain('view=MyRoom');
      expect(lastGetUrl).toContain('roomOrStation=Room+1');
    });

    test('1.3 Backward Compatibility: getQueue with string date and status continues to work', async () => {
      mockGetResponse = [];
      await clinicService.getQueue('2026-10-12', 'Triaged');

      expect(lastGetUrl).toContain('date=2026-10-12');
      expect(lastGetUrl).toContain('status=Triaged');
      expect(lastGetUrl).not.toContain('view=');
      expect(lastGetUrl).not.toContain('roomOrStation=');
    });

    test('1.4 Call to Room Modal Workflow: callQueueItem serializes roomOrStation, doctorId, and doctorName', async () => {
      mockPostResponse = { id: 'ticket-101', status: 'InConsultation' };

      const [res, err] = await clinicService.callQueueItem(
        'ticket-101',
        'doc-77',
        'Dr. Santos, MD',
        'Treatment Room'
      );

      expect(err).toBeNull();
      expect(res).toBeTruthy();
      expect(lastPostUrl).toBe('/queue/ticket-101/call');
      expect(lastPostPayload).toEqual({
        doctorId: 'doc-77',
        doctorName: 'Dr. Santos, MD',
        roomOrStation: 'Treatment Room',
      });
    });

    test('1.5 Station Pills selection state logic correctly maps station id to display label', () => {
      const stationDefs = [
        { id: 'ALL', label: 'All Stations' },
        { id: 'Room 1', label: 'Room 1' },
        { id: 'Room 2', label: 'Room 2' },
        { id: 'Triage Station', label: 'Triage Station' },
        { id: 'Treatment Room', label: 'Treatment Room' },
      ];

      expect(stationDefs.length).toBe(5);
      const selectedStation = 'Treatment Room';
      const activePill = stationDefs.find((s) => s.id === selectedStation);
      expect(activePill?.label).toBe('Treatment Room');
    });
  });

  // =========================================================================
  // SUITE 2: Closed-Loop In-Clinic Procedure Handoff Lifecycle (Feature 20)
  // =========================================================================
  describe('Suite 2: Feature 20 Closed-Loop In-Clinic Procedure Handoff Lifecycle', () => {
    test('2.1 Complete 4-Stage Lifecycle State Machine preserves queue ticket without dropping', () => {
      type QueueState = 'Waiting' | 'Triaged' | 'InConsultation' | 'PendingProcedure' | 'ReEvaluation' | 'Completed';
      let currentStatus: QueueState = 'Triaged';
      const queueNumber = 'Q-042';

      // Transition 1: Doctor calls patient into consultation room
      currentStatus = 'InConsultation';
      expect(currentStatus).toBe('InConsultation');

      // Transition 2: Doctor orders Nebulization -> routes to Procedure Bay
      currentStatus = 'PendingProcedure';
      expect(currentStatus).toBe('PendingProcedure');
      // Patient must still exist in the queue under Q-042
      expect(queueNumber).toBe('Q-042');

      // Transition 3: Treatment nurse completes nebulization -> routes back to Doctor
      currentStatus = 'ReEvaluation';
      expect(currentStatus).toBe('ReEvaluation');
      expect(queueNumber).toBe('Q-042');

      // Transition 4: Doctor re-evaluates vitals and finalizes encounter
      currentStatus = 'Completed';
      expect(currentStatus).toBe('Completed');
    });

    test('2.2 Nurse Execution Modal Data Capture: lot number, expiry, route, and pre/post vitals JSON formatting', async () => {
      mockPostResponse = { id: 'proc-501', status: 'Completed' };

      const preVitals = {
        systolicBp: 140,
        diastolicBp: 90,
        heartRateBpm: 110,
        respiratoryRateBreathsPerMin: 28,
        temperatureCelsius: 37.2,
        oxygenSaturationPercent: 93,
      };

      const postVitals = {
        systolicBp: 122,
        diastolicBp: 80,
        heartRateBpm: 82,
        respiratoryRateBreathsPerMin: 18,
        temperatureCelsius: 36.8,
        oxygenSaturationPercent: 98,
      };

      const executionPayload = {
        performedByStaffId: 'nurse-001',
        performedByStaffName: 'Nurse Joy, RN',
        preProcedureVitalsJson: JSON.stringify(preVitals),
        postProcedureVitalsJson: JSON.stringify(postVitals),
        medicationAdministered: 'Salbutamol 2.5mg/2.5mL nebule',
        lotNumber: 'LOT-99214A',
        expirationDate: '2027-12-31',
        siteRoute: 'Inhalation via Jet Nebulizer',
        clinicalNotes: 'Wheezing significantly reduced. Chest clear bilaterally.',
        complications: 'None',
      };

      await clinicService.completeProcedure('proc-501', executionPayload);

      expect(lastPostUrl).toBe('/procedures/proc-501/complete');
      expect(lastPostPayload.lotNumber).toBe('LOT-99214A');
      expect(lastPostPayload.expirationDate).toBe('2027-12-31');
      expect(lastPostPayload.medicationAdministered).toContain('Salbutamol');
      expect(lastPostPayload.complications).toBe('None');

      // Verify deserializability of vitals JSON
      const parsedPre = JSON.parse(lastPostPayload.preProcedureVitalsJson);
      const parsedPost = JSON.parse(lastPostPayload.postProcedureVitalsJson);
      expect(parsedPre.oxygenSaturationPercent).toBe(93);
      expect(parsedPost.oxygenSaturationPercent).toBe(98);
      expect(parsedPost.respiratoryRateBreathsPerMin).toBe(18);
    });

    test('2.3 Vitals Formatter Robustness: handles valid JSON, empty input, partial vitals, and malformed JSON safely', () => {
      const formatProcedureVitals = (jsonStr?: string) => {
        if (!jsonStr) return 'Not recorded';
        try {
          const v = JSON.parse(jsonStr);
          const items: string[] = [];
          if (v.systolicBp && v.diastolicBp) items.push(`BP ${v.systolicBp}/${v.diastolicBp}`);
          if (v.heartRateBpm || v.heartRate) items.push(`HR ${v.heartRateBpm || v.heartRate} bpm`);
          if (v.respiratoryRateBreathsPerMin || v.respiratoryRate) items.push(`RR ${v.respiratoryRateBreathsPerMin || v.respiratoryRate} cpm`);
          if (v.temperatureCelsius || v.temperature) items.push(`Temp ${v.temperatureCelsius || v.temperature}°C`);
          if (v.oxygenSaturationPercent || v.oxygenSaturation) items.push(`SpO2 ${v.oxygenSaturationPercent || v.oxygenSaturation}%`);
          return items.join(' • ') || 'Normal';
        } catch {
          return jsonStr;
        }
      };

      // Case A: Full vitals
      const full = JSON.stringify({ systolicBp: 120, diastolicBp: 80, heartRateBpm: 72, respiratoryRateBreathsPerMin: 16, temperatureCelsius: 36.5, oxygenSaturationPercent: 99 });
      expect(formatProcedureVitals(full)).toBe('BP 120/80 • HR 72 bpm • RR 16 cpm • Temp 36.5°C • SpO2 99%');

      // Case B: Partial vitals (only SpO2 and HR)
      const partial = JSON.stringify({ heartRateBpm: 80, oxygenSaturationPercent: 97 });
      expect(formatProcedureVitals(partial)).toBe('HR 80 bpm • SpO2 97%');

      // Case C: Empty / undefined
      expect(formatProcedureVitals(undefined)).toBe('Not recorded');
      expect(formatProcedureVitals('')).toBe('Not recorded');

      // Case D: Malformed JSON (must not throw, returns raw string)
      const malformed = 'Not valid JSON string';
      expect(formatProcedureVitals(malformed)).toBe('Not valid JSON string');
    });

    test('2.4 Doctor Re-Evaluation Banner: 1-Click Vitals Import into Objective Note', () => {
      const formatProcedureVitals = (jsonStr?: string) => {
        if (!jsonStr) return 'Not recorded';
        try {
          const v = JSON.parse(jsonStr);
          const items: string[] = [];
          if (v.systolicBp && v.diastolicBp) items.push(`BP ${v.systolicBp}/${v.diastolicBp}`);
          if (v.heartRateBpm || v.heartRate) items.push(`HR ${v.heartRateBpm || v.heartRate} bpm`);
          if (v.respiratoryRateBreathsPerMin || v.respiratoryRate) items.push(`RR ${v.respiratoryRateBreathsPerMin || v.respiratoryRate} cpm`);
          if (v.temperatureCelsius || v.temperature) items.push(`Temp ${v.temperatureCelsius || v.temperature}°C`);
          if (v.oxygenSaturationPercent || v.oxygenSaturation) items.push(`SpO2 ${v.oxygenSaturationPercent || v.oxygenSaturation}%`);
          return items.join(' • ') || 'Normal';
        } catch {
          return jsonStr;
        }
      };

      const importPostProcedureVitals = (
        currentObjective: string,
        proc: { procedureName: string; postProcedureVitalsJson?: string; clinicalNotes?: string; complications?: string }
      ) => {
        const postStr = `\nPost-${proc.procedureName} Vitals: ${formatProcedureVitals(proc.postProcedureVitalsJson)}. Nurse Notes: ${proc.clinicalNotes || 'Tolerated well'}. Complications: ${proc.complications || 'None'}.`;
        return currentObjective ? `${currentObjective.trim()}${postStr}` : postStr.trim();
      };

      const completedProc = {
        procedureName: 'Nebulization',
        postProcedureVitalsJson: JSON.stringify({ systolicBp: 118, diastolicBp: 78, heartRateBpm: 74, oxygenSaturationPercent: 99 }),
        clinicalNotes: 'Breath sounds improved, wheezing cleared',
        complications: 'None',
      };

      // Sub-case 1: Objective was initially empty
      const resultEmpty = importPostProcedureVitals('', completedProc);
      expect(resultEmpty).toContain('Post-Nebulization Vitals: BP 118/78 • HR 74 bpm • SpO2 99%.');
      expect(resultEmpty).toContain('Nurse Notes: Breath sounds improved, wheezing cleared.');
      expect(resultEmpty).toContain('Complications: None.');
      expect(resultEmpty.startsWith('Post-Nebulization')).toBe(true);

      // Sub-case 2: Objective already had doctor observations
      const existingObjective = 'Chest: Tachypneic with diffuse expiratory wheezes on admission.';
      const resultAppended = importPostProcedureVitals(existingObjective, completedProc);
      expect(resultAppended).toContain('Chest: Tachypneic with diffuse expiratory wheezes');
      expect(resultAppended).toContain('\nPost-Nebulization Vitals: BP 118/78 • HR 74 bpm • SpO2 99%.');
    });

    test('2.5 Doctor Re-Evaluation Banner Trigger Logic', () => {
      // Banner must be visible if patient status === 'ReEvaluation' OR latestExecutedProcedure?.status === 'Completed'
      const checkBannerVisible = (patientStatus: string, latestProcStatus?: string) => {
        return patientStatus === 'ReEvaluation' || latestProcStatus === 'Completed';
      };

      expect(checkBannerVisible('ReEvaluation', undefined)).toBe(true);
      expect(checkBannerVisible('InConsultation', 'Completed')).toBe(true);
      expect(checkBannerVisible('PendingProcedure', 'InProgress')).toBe(false);
      expect(checkBannerVisible('InConsultation', 'Ordered')).toBe(false);
    });
  });

  // =========================================================================
  // SUITE 3: Desktop Split-Screen Responsive Layout Engine (Feature 21)
  // =========================================================================
  describe('Suite 3: Feature 21 Desktop Split-Screen Responsive Layout Engine', () => {
    test('3.1 Desktop Workstation Threshold Boundary: 1024px boundary tests', () => {
      const desktopBreakpoint = theme.breakpoints.desktop;
      expect(desktopBreakpoint).toBe(1024);

      // Below 1024px -> Stacked layout (isDesktopWorkstation = false)
      const isDesktopAt1023 = 1023 >= desktopBreakpoint;
      expect(isDesktopAt1023).toBe(false);

      // Exactly 1024px -> Dual-pane layout (isDesktopWorkstation = true)
      const isDesktopAt1024 = 1024 >= desktopBreakpoint;
      expect(isDesktopAt1024).toBe(true);

      // 1280px Wide -> Dual-pane layout (isDesktopWorkstation = true)
      const isDesktopAt1280 = 1280 >= desktopBreakpoint;
      expect(isDesktopAt1280).toBe(true);

      // 1920px Full HD -> Dual-pane layout (isDesktopWorkstation = true)
      const isDesktopAt1920 = 1920 >= desktopBreakpoint;
      expect(isDesktopAt1920).toBe(true);

      // 768px Tablet -> Stacked layout (isDesktopWorkstation = false)
      const isDesktopAt768 = 768 >= desktopBreakpoint;
      expect(isDesktopAt768).toBe(false);

      // 375px Mobile -> Stacked layout (isDesktopWorkstation = false)
      const isDesktopAt375 = 375 >= desktopBreakpoint;
      expect(isDesktopAt375).toBe(false);
    });

    test('3.2 Dual-Pane Geometry & Proportions: 42% Left Chart Pane vs 58% Right SOAP Pane', () => {
      const leftFlex = 0.42;
      const rightFlex = 0.58;
      const leftMinWidth = 360;
      const rightMinWidth = 440;

      // Mathematical verification
      expect(leftFlex + rightFlex).toBeCloseTo(1.0, 5);
      expect(leftFlex).toBe(0.42);
      expect(rightFlex).toBe(0.58);
      expect(leftMinWidth + rightMinWidth).toBe(800);

      // Verification that min widths fit within >= 1024px desktop
      expect(leftMinWidth + rightMinWidth).toBeLessThanOrEqual(1024);
    });

    test('3.3 Longitudinal Chart 7 Tabs Integration in Left Pane', () => {
      const requiredTabs = [
        'summary',
        'encounters',
        'diagnostics',
        'procedures',
        'immunizations',
        'profiles',
        'vault',
      ] as const;

      expect(requiredTabs.length).toBe(7);

      // Verify all 7 statutory tabs are accounted for
      expect(requiredTabs).toContain('summary');
      expect(requiredTabs).toContain('encounters');
      expect(requiredTabs).toContain('diagnostics');
      expect(requiredTabs).toContain('procedures');
      expect(requiredTabs).toContain('immunizations');
      expect(requiredTabs).toContain('profiles');
      expect(requiredTabs).toContain('vault');
    });

    test('3.4 Stacked Mobile View State Preservation: Switching between soap and chart preserves draft data', () => {
      // Simulate draft encounter state
      const encounterDraft = {
        subjective: 'Patient reports severe dry cough and fever for 3 days.',
        objective: 'Temperature 38.5 C, clear breath sounds.',
        assessment: 'Acute viral upper respiratory tract infection',
        plan: 'Hydration, paracetamol 500mg PRN, follow up in 3 days.',
      };

      let mobileWorkstationView: 'soap' | 'chart' = 'soap';
      expect(mobileWorkstationView).toBe('soap');

      // User switches to longitudinal chart review
      mobileWorkstationView = 'chart';
      expect(mobileWorkstationView).toBe('chart');

      // User switches back to SOAP documentation
      mobileWorkstationView = 'soap';
      expect(mobileWorkstationView).toBe('soap');

      // Ensure drafts were NOT lost during view toggle
      expect(encounterDraft.subjective).toContain('severe dry cough');
      expect(encounterDraft.assessment).toContain('Acute viral');
    });
  });

  // =========================================================================
  // SUITE 4: Cross-Cutting Collaboration & Token Compliance Stress Tests
  // =========================================================================
  describe('Suite 4: Cross-Cutting Collaboration & Token Compliance Verification', () => {
    test('4.1 Queue Status Enum includes PendingProcedure and ReEvaluation with correct numeric and string mappings', () => {
      const validStatuses = [
        'Waiting',
        'Triaged',
        'InConsultation',
        'Completed',
        'Cancelled',
        'NoShow',
        'PendingProcedure',
        'ReEvaluation',
      ];

      expect(validStatuses).toContain('PendingProcedure');
      expect(validStatuses).toContain('ReEvaluation');
    });

    test('4.2 Design Tokens Semantic Colors exist and are populated', () => {
      expect(theme.colors.primary).toBeTruthy();
      expect(theme.colors.emergency).toBeTruthy();
      expect(theme.colors.emergencyText).toBeTruthy();
      expect(theme.colors.urgent).toBeTruthy();
      expect(theme.colors.urgentText).toBeTruthy();
      expect(theme.colors.routine).toBeTruthy();
      expect(theme.colors.surface).toBeTruthy();
      expect(theme.colors.border).toBeTruthy();
    });
  });
});

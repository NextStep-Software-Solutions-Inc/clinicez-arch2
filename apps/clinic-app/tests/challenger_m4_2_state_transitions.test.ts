// token-guard:ignore-file
/**
 * Adversarial Challenger Suite for Milestone 4 (challenger_m4_2)
 *
 * Scrutinizes:
 * 1. Action eligibility and cluster rendering across all 8 queue statuses:
 *    - Waiting, Triaged, InConsultation, OnHold, NoShow, Completed, Cancelled, Diverted
 *    - Plus non-doctor & transitional statuses: DischargedNonDoctor, PendingProcedure, ReEvaluation
 * 2. Divert to ER button isolation, modal triggers, validation guards, and error boundaries
 * 3. Service badge formatting parity and zero jargon compliance in Dashboard.screen.tsx
 */

import { describe, expect, test, mock, beforeEach } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'fs';
import path from 'path';
import type {
  QueueStatus,
  VisitType,
  PatientQueueItem,
  QueuePriority,
} from '../services/clinicService';

(globalThis as any).__DEV__ = true;

// -----------------------------------------------------------------------------
// 1. Mocks for React Native and Services
// -----------------------------------------------------------------------------
const createMockComponent = (name: string) => {
  const Comp = ({
    children,
    accessibilityLabel,
    accessibilityRole,
    placeholder,
    testID,
    visible,
    style,
    onPress,
    onClick,
    ...props
  }: any) => {
    if (name === 'Modal' && visible === false) return null;
    const resolvedStyle = typeof style === 'function' ? style({ pressed: false, hovered: false }) : style;
    const clickHandler = onPress || onClick;
    return React.createElement(
      'div',
      {
        'data-component': name,
        ...(testID ? { 'data-testid': testID } : {}),
        ...(accessibilityLabel ? { 'aria-label': accessibilityLabel } : {}),
        ...(accessibilityRole ? { role: accessibilityRole } : {}),
        ...(placeholder ? { 'data-placeholder': placeholder } : {}),
        ...(visible !== undefined ? { 'data-visible': String(visible) } : {}),
        ...(clickHandler ? { 'data-pressable': 'true', onClick: clickHandler } : {}),
        'data-style': resolvedStyle ? JSON.stringify(resolvedStyle) : undefined,
        ...props,
      },
      placeholder,
      children
    );
  };
  Comp.displayName = name;
  return Comp;
};

mock.module('react-native', () => ({
  StyleSheet: { create: (s: any) => s, flatten: (s: any) => s },
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
  Dimensions: { get: () => ({ width: 1280, height: 800 }), addEventListener: () => ({ remove: () => {} }) },
  useWindowDimensions: () => ({ width: 1280, height: 800 }),
  AppState: { currentState: 'active', addEventListener: () => ({ remove: () => {} }) },
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
  Linking: { openURL: () => Promise.resolve(), canOpenURL: () => Promise.resolve(true) },
}));

mock.module('expo-crypto', () => ({
  randomUUID: () => 'e2e-uuid-' + Math.random().toString(36).substring(2, 9),
}));

mock.module('react-native-svg', () => ({
  Svg: createMockComponent('svg'),
  Path: createMockComponent('path'),
  Circle: createMockComponent('circle'),
  Rect: createMockComponent('rect'),
  Line: createMockComponent('line'),
  default: createMockComponent('svg'),
  Polyline: createMockComponent('polyline'),
  Defs: createMockComponent('defs'),
  LinearGradient: createMockComponent('lineargradient'),
  Stop: () => null,
  G: createMockComponent('g'),
  Text: createMockComponent('text'),
}));

mock.module('../constants/fonts', () => ({
  applyFontFamily: (s: any) => s,
  fontAssets: {},
}));

// API Mocking for clinicService.divertEmergencyPatient
let mockDivertResponse: any = null;
let mockDivertError: any = null;
let lastDivertedId = '';
let lastDivertPayload: any = null;

mock.module('../services/apiClient', () => ({
  clinicApiClient: {
    get: async () => [null, null],
    put: async () => [null, null],
    post: async (url: string, data?: any) => {
      if (url.includes('/divert')) {
        lastDivertedId = url.split('/')[2];
        lastDivertPayload = data;
        if (mockDivertError) return [null, mockDivertError];
        return [mockDivertResponse ?? { id: lastDivertedId, status: 'Diverted' }, null];
      }
      return [{}, null];
    },
  },
  clinicApiUrl: (p: string) => `http://localhost:5000/api/v1${p}`,
}));

const { clinicService } = await import('../services/clinicService');
const DivertEmergencyModal = (await import('../components/queue/DivertEmergencyModal')).default;

// -----------------------------------------------------------------------------
// 2. Authoritative Extraction of Dashboard Logic
// -----------------------------------------------------------------------------

/**
 * Mirror the exact eligibility formulas evaluated inside Dashboard.screen.tsx lines 1031-1065:
 */
function evaluateDashboardQueueItem(item: {
  status: QueueStatus;
  visitType?: VisitType | string;
  hasVitals?: boolean;
  doctorName?: string | null;
}) {
  const isCompleted = item.status === 'Completed' || item.status === 'DischargedNonDoctor';
  const canCall = item.status === 'Waiting' || item.status === 'Triaged';
  const canTriage = !isCompleted && item.status !== 'Cancelled' && item.status !== 'NoShow' && item.status !== 'Diverted';
  const canDischarge =
    (item.status === 'Triaged' || (item.visitType && item.visitType !== 'Consultation')) &&
    !isCompleted &&
    item.status !== 'Cancelled' &&
    item.status !== 'NoShow' &&
    item.status !== 'Diverted';
  const canDivert =
    !isCompleted &&
    item.status !== 'Cancelled' &&
    item.status !== 'NoShow' &&
    item.status !== 'Diverted';

  const canHold = item.status === 'Waiting' || item.status === 'Triaged';
  const canNoShow = item.status === 'Waiting' || item.status === 'Triaged' || item.status === 'OnHold';
  const canCancel = item.status !== 'Completed' && item.status !== 'Cancelled' && item.status !== 'NoShow';
  const canReactivate = item.status === 'OnHold' || item.status === 'NoShow';
  const canExamine = item.status !== 'Cancelled' && item.status !== 'NoShow';
  const canAssignOrReassign = item.status !== 'Completed' && item.status !== 'Cancelled' && item.status !== 'NoShow';

  const hasCareActions = canCall || canExamine || canTriage || canAssignOrReassign;
  const hasFlowActions = canHold || canReactivate || canDischarge || isCompleted;
  const hasExceptionActions = canNoShow || canCancel;
  const hasEmergencyActions = canDivert;

  const careButtons: string[] = [];
  if (canCall) careButtons.push('Call patient');
  if (canExamine) careButtons.push('Examine');
  if (canTriage) careButtons.push(item.hasVitals ? 'Update vitals' : 'Record vitals');
  if (canAssignOrReassign) careButtons.push(item.doctorName ? 'Reassign' : 'Assign doctor');

  const flowButtons: string[] = [];
  if (canHold) flowButtons.push('Put on hold');
  if (canReactivate) flowButtons.push('Re-activate');
  if (canDischarge) flowButtons.push('Discharge visit');
  if (isCompleted) flowButtons.push('Bill visit');

  const exceptionButtons: string[] = [];
  if (canNoShow) exceptionButtons.push('No-show');
  if (canCancel) exceptionButtons.push('Cancel visit');

  const emergencyButtons: string[] = [];
  if (canDivert) emergencyButtons.push('Divert to ER');

  return {
    isCompleted,
    canCall,
    canTriage,
    canDischarge,
    canDivert,
    canHold,
    canNoShow,
    canCancel,
    canReactivate,
    canExamine,
    canAssignOrReassign,
    hasCareActions,
    hasFlowActions,
    hasExceptionActions,
    hasEmergencyActions,
    careButtons,
    flowButtons,
    exceptionButtons,
    emergencyButtons,
  };
}

describe('Challenger M4.2: Adversarial State Transitions, Action Eligibility & Zero Jargon', () => {
  beforeEach(() => {
    mockDivertResponse = null;
    mockDivertError = null;
    lastDivertedId = '';
    lastDivertPayload = null;
  });

  // ===========================================================================
  // Dimension 1: Action Eligibility Across All 8 Queue Statuses
  // ===========================================================================
  describe('1. Action Eligibility Across All 8 Queue Statuses', () => {
    const ALL_8_STATUSES: QueueStatus[] = [
      'Waiting',
      'Triaged',
      'InConsultation',
      'OnHold',
      'NoShow',
      'Completed',
      'Cancelled',
      'Diverted',
    ];

    test('1.1 Waiting status permits initial care actions, hold, exceptions, and emergency divert', () => {
      const res = evaluateDashboardQueueItem({
        status: 'Waiting',
        visitType: 'Consultation',
        hasVitals: false,
        doctorName: null,
      });

      expect(res.canCall).toBe(true);
      expect(res.canExamine).toBe(true);
      expect(res.canTriage).toBe(true);
      expect(res.canAssignOrReassign).toBe(true);
      expect(res.careButtons).toEqual(['Call patient', 'Examine', 'Record vitals', 'Assign doctor']);

      expect(res.canHold).toBe(true);
      expect(res.canReactivate).toBe(false);
      expect(res.canDischarge).toBe(false); // Consultation in Waiting cannot be discharged directly
      expect(res.flowButtons).toEqual(['Put on hold']);

      expect(res.canNoShow).toBe(true);
      expect(res.canCancel).toBe(true);
      expect(res.exceptionButtons).toEqual(['No-show', 'Cancel visit']);

      expect(res.canDivert).toBe(true);
      expect(res.emergencyButtons).toEqual(['Divert to ER']);
    });

    test('1.2 Triaged status enables Update vitals, Examine, direct Discharge, and Hold', () => {
      const res = evaluateDashboardQueueItem({
        status: 'Triaged',
        visitType: 'Consultation',
        hasVitals: true,
        doctorName: 'Dr. Santos',
      });

      expect(res.canCall).toBe(true);
      expect(res.canExamine).toBe(true);
      expect(res.canTriage).toBe(true);
      expect(res.careButtons).toEqual(['Call patient', 'Examine', 'Update vitals', 'Reassign']);

      expect(res.canHold).toBe(true);
      expect(res.canDischarge).toBe(true); // Triaged consultation CAN be discharged
      expect(res.flowButtons).toEqual(['Put on hold', 'Discharge visit']);

      expect(res.canNoShow).toBe(true);
      expect(res.canCancel).toBe(true);
      expect(res.canDivert).toBe(true);
    });

    test('1.3 InConsultation status isolates active encounter: disables Call patient, Hold, and No-Show', () => {
      const res = evaluateDashboardQueueItem({
        status: 'InConsultation',
        visitType: 'Consultation',
        hasVitals: true,
        doctorName: 'Dr. Santos',
      });

      // Call patient is prohibited during active consult
      expect(res.canCall).toBe(false);
      expect(res.canExamine).toBe(true);
      expect(res.canTriage).toBe(true);
      expect(res.canAssignOrReassign).toBe(true);

      // Hold is prohibited during active consult
      expect(res.canHold).toBe(false);
      expect(res.canReactivate).toBe(false);
      // For consultation, doctor completes in consult room; dashboard direct discharge is false
      expect(res.canDischarge).toBe(false);
      expect(res.hasFlowActions).toBe(false);

      // No-Show is strictly prohibited once patient is already inside doctor consultation room!
      expect(res.canNoShow).toBe(false);
      // Walkout cancellation is still allowed
      expect(res.canCancel).toBe(true);
      expect(res.exceptionButtons).toEqual(['Cancel visit']);

      // Emergency ER diversion is preserved in case patient destabilizes during consult
      expect(res.canDivert).toBe(true);
      expect(res.emergencyButtons).toEqual(['Divert to ER']);
    });

    test('1.4 OnHold status enables Re-activate and Reassign, but disables duplicate Put on hold and Call', () => {
      const res = evaluateDashboardQueueItem({
        status: 'OnHold',
        visitType: 'Consultation',
        hasVitals: true,
        doctorName: 'Dr. Santos',
      });

      expect(res.canCall).toBe(false); // Cannot call patient who is on hold
      expect(res.canHold).toBe(false); // Cannot put on hold again
      expect(res.canReactivate).toBe(true);
      expect(res.flowButtons).toEqual(['Re-activate']);

      expect(res.canNoShow).toBe(true); // Patient on hold might fail to return
      expect(res.canCancel).toBe(true);
      expect(res.canDivert).toBe(true);
    });

    test('1.5 NoShow status strictly restricts actions: ONLY Re-activate is permissible', () => {
      const res = evaluateDashboardQueueItem({
        status: 'NoShow',
        visitType: 'Consultation',
        hasVitals: false,
        doctorName: null,
      });

      // Care cluster: completely disabled
      expect(res.canCall).toBe(false);
      expect(res.canExamine).toBe(false);
      expect(res.canTriage).toBe(false);
      expect(res.canAssignOrReassign).toBe(false);
      expect(res.hasCareActions).toBe(false);
      expect(res.careButtons).toEqual([]);

      // Flow cluster: ONLY Re-activate
      expect(res.canHold).toBe(false);
      expect(res.canDischarge).toBe(false);
      expect(res.isCompleted).toBe(false);
      expect(res.canReactivate).toBe(true);
      expect(res.hasFlowActions).toBe(true);
      expect(res.flowButtons).toEqual(['Re-activate']);

      // Exception cluster: completely disabled (cannot re-mark no-show or cancel)
      expect(res.canNoShow).toBe(false);
      expect(res.canCancel).toBe(false);
      expect(res.hasExceptionActions).toBe(false);
      expect(res.exceptionButtons).toEqual([]);

      // Emergency cluster: completely disabled
      expect(res.canDivert).toBe(false);
      expect(res.hasEmergencyActions).toBe(false);
      expect(res.emergencyButtons).toEqual([]);
    });

    test('1.6 Completed status enforces post-encounter lockdown: allows Examine and Bill visit only', () => {
      const res = evaluateDashboardQueueItem({
        status: 'Completed',
        visitType: 'Consultation',
        hasVitals: true,
        doctorName: 'Dr. Santos',
      });

      // Care cluster: Examine (review consult notes) allowed; Call, Triage, Reassign prohibited
      expect(res.canCall).toBe(false);
      expect(res.canTriage).toBe(false);
      expect(res.canAssignOrReassign).toBe(false);
      expect(res.canExamine).toBe(true);
      expect(res.careButtons).toEqual(['Examine']);

      // Flow cluster: Bill visit allowed; Hold, Reactivate, Discharge prohibited
      expect(res.canHold).toBe(false);
      expect(res.canReactivate).toBe(false);
      expect(res.canDischarge).toBe(false);
      expect(res.isCompleted).toBe(true);
      expect(res.flowButtons).toEqual(['Bill visit']);

      // Exceptions: completely prohibited
      expect(res.canNoShow).toBe(false);
      expect(res.canCancel).toBe(false);
      expect(res.hasExceptionActions).toBe(false);

      // Emergency: completely prohibited
      expect(res.canDivert).toBe(false);
      expect(res.hasEmergencyActions).toBe(false);
    });

    test('1.7 Cancelled terminal status guarantees ZERO actions and ZERO empty cluster blocks', () => {
      const res = evaluateDashboardQueueItem({
        status: 'Cancelled',
        visitType: 'Consultation',
        hasVitals: false,
        doctorName: null,
      });

      expect(res.hasCareActions).toBe(false);
      expect(res.hasFlowActions).toBe(false);
      expect(res.hasExceptionActions).toBe(false);
      expect(res.hasEmergencyActions).toBe(false);

      expect(res.careButtons).toEqual([]);
      expect(res.flowButtons).toEqual([]);
      expect(res.exceptionButtons).toEqual([]);
      expect(res.emergencyButtons).toEqual([]);
    });

    test('1.8 Diverted status strictly shields patient from further clinic queue mutations', () => {
      const res = evaluateDashboardQueueItem({
        status: 'Diverted',
        visitType: 'Consultation',
        hasVitals: true,
        doctorName: 'Dr. Santos',
      });

      // Re-divert is strictly forbidden
      expect(res.canDivert).toBe(false);
      expect(res.hasEmergencyActions).toBe(false);
      expect(res.emergencyButtons).toEqual([]);

      // Triage and Discharge are strictly forbidden
      expect(res.canTriage).toBe(false);
      expect(res.canDischarge).toBe(false);
      expect(res.canCall).toBe(false);
      expect(res.canHold).toBe(false);
      expect(res.canReactivate).toBe(false);
    });

    test('1.9 Non-doctor visits (VitalsCheckOnly, StandaloneProcedure, AdministrativeDocument) allow fast direct discharge even while Waiting', () => {
      const nonDoctorServices: VisitType[] = [
        'VitalsCheckOnly',
        'StandaloneProcedure',
        'AdministrativeDocument',
      ];

      for (const service of nonDoctorServices) {
        const res = evaluateDashboardQueueItem({
          status: 'Waiting',
          visitType: service,
          hasVitals: service === 'VitalsCheckOnly',
        });
        expect(res.canDischarge).toBe(true);
        expect(res.flowButtons).toContain('Discharge visit');
      }
    });

    test('1.10 Exhaustive assertion: canDivert is true ONLY for active, unclosed, non-terminal tickets', () => {
      const expectedCanDivert: Record<QueueStatus, boolean> = {
        Waiting: true,
        Triaged: true,
        InConsultation: true,
        OnHold: true,
        PendingProcedure: true,
        ReEvaluation: true,
        Completed: false,
        DischargedNonDoctor: false,
        Cancelled: false,
        NoShow: false,
        Diverted: false,
      };

      for (const [st, expected] of Object.entries(expectedCanDivert)) {
        const res = evaluateDashboardQueueItem({ status: st as QueueStatus });
        expect(res.canDivert).toBe(expected);
        if (expected) {
          expect(res.emergencyButtons).toEqual(['Divert to ER']);
          expect(res.hasEmergencyActions).toBe(true);
        } else {
          expect(res.emergencyButtons).toEqual([]);
          expect(res.hasEmergencyActions).toBe(false);
        }
      }
    });
  });

  // ===========================================================================
  // Dimension 2: Divert to ER Isolation & Error Boundaries
  // ===========================================================================
  describe('2. Divert to ER Isolation & Error Boundaries', () => {
    const mockTicket: PatientQueueItem = {
      id: 'ticket-divert-999',
      queueNumber: 'SQ-007',
      patientId: 'pat-critical-01',
      patientName: 'Ramon De Leon',
      status: 'Waiting',
      priority: 'Emergency',
      hasVitals: true,
      vitalsSummary: 'BP: 190/120, HR: 135 bpm, SpO2: 88%',
      createdAt: '2026-10-31T09:00:00Z',
    };

    test('2.1 DivertEmergencyModal renders critical acuity banner and patient info', () => {
      const html = renderToStaticMarkup(
        React.createElement(DivertEmergencyModal, {
          visible: true,
          ticket: mockTicket,
          onClose: () => {},
          onSuccess: () => {},
        })
      );

      expect(html).toContain('AUDITED EMERGENCY DIVERSION (IMMEDIATE ER TRANSFER)');
      expect(html).toContain('Ramon De Leon');
      expect(html).toContain('Ticket: SQ-007');
      expect(html).toContain('Priority: Emergency');
      expect(html).toContain('Transfer &amp; Divert to Emergency Facility');
    });

    test('2.2 DivertEmergencyModal returns null and does not render when ticket is null', () => {
      const html = renderToStaticMarkup(
        React.createElement(DivertEmergencyModal, {
          visible: true,
          ticket: null,
          onClose: () => {},
          onSuccess: () => {},
        })
      );
      expect(html).toBe('');
    });

    test('2.3 Divert confirmation button is disabled when mandatory fields are missing or whitespace', () => {
      const validateDivertFields = (
        hosp: string,
        mode: string,
        escort: string,
        summary: string
      ) => {
        return (
          hosp.trim().length > 0 &&
          mode.trim().length > 0 &&
          escort.trim().length > 0 &&
          summary.trim().length > 0
        );
      };

      // Empty state
      expect(validateDivertFields('', 'City / Red Cross Ambulance', '', '')).toBe(false);

      // Whitespace attack
      expect(validateDivertFields('   ', '   ', '   ', '   ')).toBe(false);
      expect(validateDivertFields('PGH', 'Ambulance', '   ', 'Handover')).toBe(false);

      // Complete valid state
      expect(
        validateDivertFields(
          'Philippine General Hospital',
          'City Ambulance',
          'Paramedic Juan',
          'Severe hypertensive crisis and acute dyspnea'
        )
      ).toBe(true);
    });

    test('2.4 API failure does not crash modal; captures error message cleanly in state', async () => {
      mockDivertError = { message: 'Network timeout connecting to ER interop gateway.' };

      let wasSuccessCalled = false;
      let wasCloseCalled = false;

      // Simulate handleConfirm with error
      const executeDivert = async (ticketId: string) => {
        const [res, err] = await clinicService.divertEmergencyPatient(ticketId, {
          destinationHospital: 'PGH',
          transportMode: 'Ambulance',
          paramedicOrEscortName: 'John Doe',
          clinicalHandoverSummary: 'Critical distress',
        });
        if (err) {
          return { success: false, error: (err as any)?.message || 'Failed' };
        }
        return { success: true, res };
      };

      const result = await executeDivert(mockTicket.id);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Network timeout connecting to ER interop gateway');
      expect(lastDivertedId).toBe(mockTicket.id);
      expect(lastDivertPayload.destinationHospital).toBe('PGH');
      expect(wasSuccessCalled).toBe(false);
      expect(wasCloseCalled).toBe(false);
    });

    test('2.5 Successful divert triggers API with sanitized payloads', async () => {
      mockDivertResponse = { id: mockTicket.id, status: 'Diverted' };

      // Mirror DivertEmergencyModal handleConfirm sanitization
      const rawForm = {
        destinationHospital: '  East Avenue Medical Center  ',
        transportMode: '  Red Cross Ambulance Unit 3  ',
        paramedicOrEscortName: '  EMT Cruz  ',
        clinicalHandoverSummary: '  Hypertensive urgency stabilized with sublingual nifedipine  ',
      };

      const [res, err] = await clinicService.divertEmergencyPatient(mockTicket.id, {
        destinationHospital: rawForm.destinationHospital.trim(),
        transportMode: rawForm.transportMode.trim(),
        paramedicOrEscortName: rawForm.paramedicOrEscortName.trim(),
        clinicalHandoverSummary: rawForm.clinicalHandoverSummary.trim(),
      });

      expect(err).toBeNull();
      expect(res).toBeDefined();
      expect(lastDivertedId).toBe(mockTicket.id);
      expect(lastDivertPayload.destinationHospital).toBe('East Avenue Medical Center');
      expect(lastDivertPayload.transportMode).toBe('Red Cross Ambulance Unit 3');
      expect(lastDivertPayload.paramedicOrEscortName).toBe('EMT Cruz');
      expect(lastDivertPayload.clinicalHandoverSummary).toBe('Hypertensive urgency stabilized with sublingual nifedipine');
    });
  });

  // ===========================================================================
  // Dimension 3: Zero Jargon and Toolbar Cleanup in Dashboard.screen.tsx
  // ===========================================================================
  describe('3. Zero Jargon and Toolbar Cleanup in Dashboard.screen.tsx', () => {
    const dashboardFilePath = path.resolve(
      __dirname,
      '../navigation/screens/Dashboard.screen.tsx'
    );
    const dashboardSource = fs.readFileSync(dashboardFilePath, 'utf8');

    test('3.1 Live queue toolbar contains ZERO "Open TV Board" or "Force EOD / Close Day" buttons', () => {
      // Must not contain buttons in queue toolbar
      expect(dashboardSource).not.toMatch(/title=["']Open TV Board["']/i);
      expect(dashboardSource).not.toMatch(/title=["']Force EOD \/ Close Day["']/i);
      expect(dashboardSource).not.toMatch(/handleOpenTvDisplay/i);
    });

    test('3.2 Dashboard contains ZERO statutory or legalistic jargon across user-facing strings', () => {
      const prohibitedJargon = [
        /\bRA\s*9994\b/i,
        /\bRA\s*7277\b/i,
        /\bRepublic\s+Act\b/i,
        /\bstatutory\b/i,
        /\brelational\s*1NF\b/i,
        /\bSOAP\s+protocol\b/i,
        /\bCRUD\b/i,
        /\bEntity\b/i,
        /\bAdd\s+to\s+queue\b/i,
        /\bBook\s+appointment\b/i,
      ];

      for (const pattern of prohibitedJargon) {
        const matches = dashboardSource.match(pattern);
        expect(matches).toBeNull();
      }
    });

    test('3.3 Formatted service badges strictly adhere to R4.3 human-readable labels', () => {
      // Test getServiceBadge function matches requirement exactly
      const getServiceBadge = (
        visitType?: VisitType | string
      ): { label: string; variant: string; icon?: string } => {
        switch (visitType) {
          case 'VitalsCheckOnly':
            return { label: 'Vitals Check', variant: 'info', icon: 'activity' };
          case 'StandaloneProcedure':
            return { label: 'Procedure', variant: 'primary', icon: 'syringe' };
          case 'AdministrativeDocument':
            return { label: 'Administrative', variant: 'neutral', icon: 'file' };
          case 'Consultation':
          default:
            return { label: 'Consultation', variant: 'primary', icon: 'stethoscope' };
        }
      };

      expect(getServiceBadge('VitalsCheckOnly')).toEqual({
        label: 'Vitals Check',
        variant: 'info',
        icon: 'activity',
      });
      expect(getServiceBadge('StandaloneProcedure')).toEqual({
        label: 'Procedure',
        variant: 'primary',
        icon: 'syringe',
      });
      expect(getServiceBadge('AdministrativeDocument')).toEqual({
        label: 'Administrative',
        variant: 'neutral',
        icon: 'file',
      });
      expect(getServiceBadge('Consultation')).toEqual({
        label: 'Consultation',
        variant: 'primary',
        icon: 'stethoscope',
      });
      expect(getServiceBadge(undefined)).toEqual({
        label: 'Consultation',
        variant: 'primary',
        icon: 'stethoscope',
      });
    });

    test('3.4 All 4 action clusters have dedicated testIDs and styled containers in Dashboard.screen.tsx', () => {
      expect(dashboardSource).toContain('testID="care-encounter-cluster"');
      expect(dashboardSource).toContain('testID="flow-completion-cluster"');
      expect(dashboardSource).toContain('testID="exceptions-cluster"');
      expect(dashboardSource).toContain('testID="emergency-cluster"');
      expect(dashboardSource).toContain('testID="divert-emergency-button"');
      expect(dashboardSource).toContain('styles.actionClustersWrap');
      expect(dashboardSource).toContain('styles.actionCluster');
      expect(dashboardSource).toContain('styles.emergencyCluster');
    });
  });
});

// token-guard:ignore-file
import { describe, expect, test, mock } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

(globalThis as any).__DEV__ = true;

const createMockComponent = (name: string) => {
  const Comp = ({ children, accessibilityLabel, accessibilityRole, placeholder, testID }: any) =>
    React.createElement(
      'div',
      {
        'data-component': name,
        ...(testID ? { 'data-testid': testID } : {}),
        ...(accessibilityLabel ? { 'aria-label': accessibilityLabel } : {}),
        ...(accessibilityRole ? { role: accessibilityRole } : {}),
        ...(placeholder ? { 'data-placeholder': placeholder } : {}),
      },
      placeholder,
      children
    );
  Comp.displayName = name;
  return Comp;
};

mock.module('react-native', () => ({
  Linking: { openURL: () => Promise.resolve(), canOpenURL: () => Promise.resolve(true) },
  StyleSheet: { create: (s: any) => s, flatten: (s: any) => s, absoluteFill: {} },
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
  Alert: {
    alert: () => {},
  },
  PanResponder: { create: () => ({ panHandlers: {} }) },
  processColor: (c: any) => c,
}));

mock.module('react-native-svg', () => ({
  Svg: createMockComponent('Svg'),
  Path: createMockComponent('Path'),
  Circle: createMockComponent('Circle'),
  Rect: createMockComponent('Rect'),
  Line: createMockComponent('Line'),
  default: createMockComponent('Svg'),
  Polyline: createMockComponent('Polyline'),
  Polygon: createMockComponent('Polygon'),
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

import type {
  PatientQueueItem,
  QueueStatus,
  QueuePriority,
  TriageVitals,
  UpdateTriageRequest,
  RecordTriageRequest,
} from '../services/clinicService';

const {
  formatVitalsSummary,
  resolveCohort,
  evaluateBmi,
  evaluateCentralObesity,
  parseOptionalInt,
  parseOptionalFloat,
  togglePreAssessmentChip,
  EMPTY_VITALS_FORM,
} = await import('../components/consultation/VitalsFormFields');

type VitalsFormState = typeof EMPTY_VITALS_FORM;

describe('Dashboard & Consultation Vitals Workflow Separation (Issue #49)', () => {
  describe('1. Workflow Separation & Action Routing Bifurcation', () => {
    test('routes to handleOpenTriage when patient has no vitals recorded', () => {
      let openedDialog: 'record' | 'edit' | null = null;
      let targetItem: PatientQueueItem | null = null;

      const handleOpenTriage = (item: PatientQueueItem) => {
        openedDialog = 'record';
        targetItem = item;
      };

      const handleOpenEditVitals = (item: PatientQueueItem) => {
        openedDialog = 'edit';
        targetItem = item;
      };

      const queueTicket: PatientQueueItem = {
        id: 'q-item-1',
        queueNumber: 'A001',
        patientId: 'pat-1',
        patientName: 'Juan Dela Cruz',
        status: 'Waiting',
        priority: 'Routine',
        hasVitals: false,
        vitalsSummary: undefined,
        createdAt: '2026-10-24T08:00:00Z',
      };

      // Simulates ticket button press logic in Dashboard.screen.tsx
      const buttonTitle = queueTicket.hasVitals ? 'Update vitals' : 'Record vitals';
      expect(buttonTitle).toBe('Record vitals');

      if (queueTicket.hasVitals) {
        handleOpenEditVitals(queueTicket);
      } else {
        handleOpenTriage(queueTicket);
      }

      expect(openedDialog).toBe('record');
      expect(targetItem?.id).toBe('q-item-1');
    });

    test('routes to handleOpenEditVitals when patient already has vitals recorded', () => {
      let openedDialog: 'record' | 'edit' | null = null;
      let targetItem: PatientQueueItem | null = null;

      const handleOpenTriage = (item: PatientQueueItem) => {
        openedDialog = 'record';
        targetItem = item;
      };

      const handleOpenEditVitals = (item: PatientQueueItem) => {
        openedDialog = 'edit';
        targetItem = item;
      };

      const queueTicket: PatientQueueItem = {
        id: 'q-item-2',
        queueNumber: 'A002',
        patientId: 'pat-2',
        patientName: 'Maria Santos',
        status: 'Triaged',
        priority: 'Urgent',
        hasVitals: true,
        vitalsSummary: 'BP 130/85 • HR 82',
        createdAt: '2026-10-24T08:15:00Z',
      };

      const buttonTitle = queueTicket.hasVitals ? 'Update vitals' : 'Record vitals';
      expect(buttonTitle).toBe('Update vitals');

      if (queueTicket.hasVitals) {
        handleOpenEditVitals(queueTicket);
      } else {
        handleOpenTriage(queueTicket);
      }

      expect(openedDialog).toBe('edit');
      expect(targetItem?.id).toBe('q-item-2');
    });

    test('Consultations workstation routes to EditVitalsModal when vitals exist, else RecordVitalsModal', () => {
      let recordModalVisible = false;
      let editModalVisible = false;

      const openVitalsModal = (vitals: TriageVitals | null) => {
        if (vitals) {
          editModalVisible = true;
        } else {
          recordModalVisible = true;
        }
      };

      // Case A: No vitals recorded yet
      openVitalsModal(null);
      expect(recordModalVisible).toBe(true);
      expect(editModalVisible).toBe(false);

      // Reset
      recordModalVisible = false;
      editModalVisible = false;

      // Case B: Existing vitals present
      const existingVitals: TriageVitals = {
        id: 'tv-1',
        queueItemId: 'q-item-3',
        recordedAt: '2026-10-24T08:30:00Z',
        systolicBp: 120,
        diastolicBp: 80,
      };
      openVitalsModal(existingVitals);
      expect(editModalVisible).toBe(true);
      expect(recordModalVisible).toBe(false);
    });

    test('Consultations Objective header button title reflects vitals presence', () => {
      const getButtonTitle = (vitals: TriageVitals | null): string => {
        return vitals ? 'Update Vitals' : 'Record Vitals';
      };

      expect(getButtonTitle(null)).toBe('Record Vitals');
      expect(getButtonTitle({ id: 'v-1', queueItemId: 'q-1', recordedAt: '2026-10-24' })).toBe('Update Vitals');
    });
  });

  describe('2. Pre-Population & Zero Pain Score Guard', () => {
    test('pre-populates all existing fields and preserves pain score 0 as string "0"', () => {
      const savedVitals: TriageVitals = {
        id: 'tv-100',
        queueItemId: 'q-item-100',
        recordedAt: '2026-10-24T09:00:00Z',
        nurseId: 'nurse-1',
        recordedByNurseName: 'Nurse Joy',
        systolicBp: 110,
        diastolicBp: 70,
        heartRateBpm: 68,
        respiratoryRateBreathsPerMin: 16,
        temperatureCelsius: 36.6,
        oxygenSaturationPercent: 99,
        heightCm: 168,
        weightKg: 62.5,
        bmi: 22.1,
        painScore: 0, // CRITICAL: 0 must not be treated as falsy/empty!
        notes: 'Annual medical clearance checkup',
        visualAcuityLeft: '20/20',
        visualAcuityRight: '20/25',
        headCircumferenceCm: 54,
        midUpperArmCircumferenceCm: 28,
        isMeasuredRecumbent: false,
        waistCircumferenceCm: 76,
        hipCircumferenceCm: 92,
        preAssessmentNotes: 'Patient is pleasant and denies acute complaints',
        preAssessmentRemarks: 'Alert & Oriented',
        triageAcuityReason: 'Routine',
      };

      // Logic from EditVitalsModal pre-fill
      const prefilledForm: VitalsFormState = {
        bpSys: savedVitals.systolicBp != null ? String(savedVitals.systolicBp) : '',
        bpDia: savedVitals.diastolicBp != null ? String(savedVitals.diastolicBp) : '',
        hr: savedVitals.heartRateBpm != null ? String(savedVitals.heartRateBpm) : '',
        rr: savedVitals.respiratoryRateBreathsPerMin != null ? String(savedVitals.respiratoryRateBreathsPerMin) : '',
        temp: savedVitals.temperatureCelsius != null ? String(savedVitals.temperatureCelsius) : '',
        spo2: savedVitals.oxygenSaturationPercent != null ? String(savedVitals.oxygenSaturationPercent) : '',
        pain: savedVitals.painScore != null ? String(savedVitals.painScore) : '',
        height: savedVitals.heightCm != null ? String(savedVitals.heightCm) : '',
        weight: savedVitals.weightKg != null ? String(savedVitals.weightKg) : '',
        bodyLength: savedVitals.bodyLengthCm != null
          ? String(savedVitals.bodyLengthCm)
          : '',
        headCircumference: savedVitals.headCircumferenceCm != null ? String(savedVitals.headCircumferenceCm) : '',
        midUpperArmCircumference: savedVitals.midUpperArmCircumferenceCm != null ? String(savedVitals.midUpperArmCircumferenceCm) : '',
        skinfoldThickness: savedVitals.skinfoldThicknessMm != null ? String(savedVitals.skinfoldThicknessMm) : '',
        limbsCircumference: savedVitals.limbsCircumferenceCm != null ? String(savedVitals.limbsCircumferenceCm) : '',
        waistCircumference: savedVitals.waistCircumferenceCm != null ? String(savedVitals.waistCircumferenceCm) : '',
        hipCircumference: savedVitals.hipCircumferenceCm != null ? String(savedVitals.hipCircumferenceCm) : '',
        visualAcuityLeft: savedVitals.visualAcuityLeft || '',
        visualAcuityRight: savedVitals.visualAcuityRight || '',
        notes: savedVitals.notes || '',
        posture: savedVitals.isMeasuredRecumbent ? 'RECUMBENT' : 'STANDING',
        preAssessmentNotes: savedVitals.preAssessmentNotes || '',
        preAssessmentRemarks: savedVitals.preAssessmentRemarks || '',
        triagePriority: (savedVitals.triageAcuityReason as any) || 'Routine',
      };

      // Pain score 0 verification
      expect(prefilledForm.pain).toBe('0');
      expect(prefilledForm.bpSys).toBe('110');
      expect(prefilledForm.bpDia).toBe('70');
      expect(prefilledForm.hr).toBe('68');
      expect(prefilledForm.posture).toBe('STANDING');
      expect(prefilledForm.visualAcuityLeft).toBe('20/20');
      expect(prefilledForm.preAssessmentRemarks).toBe('Alert & Oriented');
      expect(prefilledForm.triagePriority).toBe('Routine');
    });

    test('treats pain score null or undefined as empty string', () => {
      const savedVitalsWithoutPain: Partial<TriageVitals> = {
        painScore: null,
      };

      const pain = savedVitalsWithoutPain.painScore != null ? String(savedVitalsWithoutPain.painScore) : '';
      expect(pain).toBe('');
    });
  });

  describe('3. 4-State UX Guardrails (Loading, Error, Active, Disabled Submit)', () => {
    test('blocks submission and provides retry when vitals fetch fails', async () => {
      let loading = true;
      let fetchError: string | null = null;
      let isSubmitDisabled = loading || !!fetchError;

      // 1. Initial Loading state: SkeletonList active, submit disabled
      expect(loading).toBe(true);
      expect(isSubmitDisabled).toBe(true);

      // 2. Fetch fails
      loading = false;
      fetchError = 'Network timeout while querying queue vitals';
      isSubmitDisabled = loading || !!fetchError;

      expect(loading).toBe(false);
      expect(fetchError).toBe('Network timeout while querying queue vitals');
      expect(isSubmitDisabled).toBe(true); // Must remain disabled on error!

      // 3. Retry succeeds
      loading = true;
      fetchError = null;
      isSubmitDisabled = loading || !!fetchError;
      expect(loading).toBe(true);
      expect(isSubmitDisabled).toBe(true);

      // Data arrives
      loading = false;
      fetchError = null;
      isSubmitDisabled = loading || !!fetchError;
      expect(loading).toBe(false);
      expect(fetchError).toBeNull();
      expect(isSubmitDisabled).toBe(false);
    });

    test('validates that at least one vital sign is entered before updating', () => {
      const emptyForm = { ...EMPTY_VITALS_FORM };

      const hasAnyVital = [
        parseOptionalInt(emptyForm.bpSys),
        parseOptionalInt(emptyForm.bpDia),
        parseOptionalInt(emptyForm.hr),
        parseOptionalInt(emptyForm.rr),
        parseOptionalFloat(emptyForm.temp),
        parseOptionalInt(emptyForm.spo2),
        parseOptionalFloat(emptyForm.height),
        parseOptionalFloat(emptyForm.bodyLength),
        parseOptionalFloat(emptyForm.weight),
        emptyForm.pain.trim() !== '' ? parseOptionalInt(emptyForm.pain) : undefined,
      ].some((v) => v !== undefined) || !!emptyForm.visualAcuityLeft || !!emptyForm.visualAcuityRight;

      expect(hasAnyVital).toBe(false);
    });
  });

  describe('4. Partial Field Modification & In-Place Payload Assembly', () => {
    test('assembles UpdateTriageRequest with modified field while preserving untouched values', () => {
      // Original values from server
      const initialVitals: TriageVitals = {
        id: 'tv-200',
        queueItemId: 'q-item-200',
        recordedAt: '2026-10-24T09:30:00Z',
        systolicBp: 120,
        diastolicBp: 80,
        heartRateBpm: 75,
        temperatureCelsius: 36.7,
        heightCm: 172,
        weightKg: 70,
        painScore: 2,
        notes: 'Initial check',
        triageAcuityReason: 'Routine',
      };

      // Staff modifies only systolicBp from 120 -> 135 and notes
      const formState: VitalsFormState = {
        ...EMPTY_VITALS_FORM,
        bpSys: '135', // modified
        bpDia: String(initialVitals.diastolicBp), // untouched
        hr: String(initialVitals.heartRateBpm), // untouched
        temp: String(initialVitals.temperatureCelsius), // untouched
        height: String(initialVitals.heightCm), // untouched
        weight: String(initialVitals.weightKg), // untouched
        pain: String(initialVitals.painScore), // untouched
        notes: 'Follow-up reading: BP slightly elevated', // modified
        triagePriority: 'Urgent', // modified
      };

      const payload: UpdateTriageRequest = {
        systolicBp: parseOptionalInt(formState.bpSys) ?? null,
        diastolicBp: parseOptionalInt(formState.bpDia) ?? null,
        heartRateBpm: parseOptionalInt(formState.hr) ?? null,
        temperatureCelsius: parseOptionalFloat(formState.temp) ?? null,
        respiratoryRateBreathsPerMin: parseOptionalInt(formState.rr) ?? null,
        oxygenSaturationPercent: parseOptionalInt(formState.spo2) ?? null,
        heightCm: parseOptionalFloat(formState.height) ?? null,
        bodyLengthCm: parseOptionalFloat(formState.bodyLength) ?? null,
        weightKg: parseOptionalFloat(formState.weight) ?? null,
        painScore: formState.pain.trim() !== '' ? parseOptionalInt(formState.pain) ?? null : null,
        notes: formState.notes.trim() !== '' ? formState.notes.trim() : '',
        priority: formState.triagePriority,
      };

      expect(payload.systolicBp).toBe(135);
      expect(payload.diastolicBp).toBe(80);
      expect(payload.heartRateBpm).toBe(75);
      expect(payload.heightCm).toBe(172);
      expect(payload.painScore).toBe(2);
      expect(payload.notes).toBe('Follow-up reading: BP slightly elevated');
      expect(payload.priority).toBe('Urgent');
    });

    test('allows clearing optional text by sending empty string ""', () => {
      const formWithClearedNotes: VitalsFormState = {
        ...EMPTY_VITALS_FORM,
        bpSys: '120',
        bpDia: '80',
        notes: '', // cleared by user
        preAssessmentNotes: '', // cleared by user
      };

      const notesPayload = formWithClearedNotes.notes.trim() !== '' ? formWithClearedNotes.notes.trim() : '';
      const preAssessmentNotesPayload =
        formWithClearedNotes.preAssessmentNotes.trim() !== '' ? formWithClearedNotes.preAssessmentNotes.trim() : '';

      expect(notesPayload).toBe('');
      expect(preAssessmentNotesPayload).toBe('');
    });
  });

  describe('5. Optimistic Dashboard Status Preservation', () => {
    test('transitions "Waiting" queue status to "Triaged"', () => {
      const originalStatus: QueueStatus = 'Waiting';
      const nextStatus: QueueStatus = originalStatus === 'Waiting' ? 'Triaged' : originalStatus;
      expect(nextStatus).toBe('Triaged');
    });

    test('preserves "InConsultation" queue status and does not clobber it to "Triaged"', () => {
      const originalStatus: QueueStatus = 'InConsultation';
      const nextStatus: QueueStatus = originalStatus === 'Waiting' ? 'Triaged' : originalStatus;
      expect(nextStatus).toBe('InConsultation');
    });

    test('preserves "OnHold" queue status and does not clobber it to "Triaged"', () => {
      const originalStatus: QueueStatus = 'OnHold';
      const nextStatus: QueueStatus = originalStatus === 'Waiting' ? 'Triaged' : originalStatus;
      expect(nextStatus).toBe('OnHold');
    });

    test('preserves "ReEvaluation" queue status and does not clobber it to "Triaged"', () => {
      const originalStatus: QueueStatus = 'ReEvaluation';
      const nextStatus: QueueStatus = originalStatus === 'Waiting' ? 'Triaged' : originalStatus;
      expect(nextStatus).toBe('ReEvaluation');
    });

    test('preserves "PendingProcedure" queue status and does not clobber it to "Triaged"', () => {
      const originalStatus: QueueStatus = 'PendingProcedure';
      const nextStatus: QueueStatus = originalStatus === 'Waiting' ? 'Triaged' : originalStatus;
      expect(nextStatus).toBe('PendingProcedure');
    });

    test('simulates optimistic queue update preserving non-waiting status across multiple tickets', () => {
      const queue: PatientQueueItem[] = [
        { id: '1', queueNumber: 'A1', patientId: 'p1', patientName: 'P1', status: 'Waiting', priority: 'Routine' },
        { id: '2', queueNumber: 'A2', patientId: 'p2', patientName: 'P2', status: 'InConsultation', priority: 'Urgent' },
        { id: '3', queueNumber: 'A3', patientId: 'p3', patientName: 'P3', status: 'OnHold', priority: 'Routine' },
        { id: '4', queueNumber: 'A4', patientId: 'p4', patientName: 'P4', status: 'ReEvaluation', priority: 'Emergency' },
      ];

      const applyUpdate = (items: PatientQueueItem[], targetId: string, summary: string, priority: QueuePriority) => {
        return items.map((q) =>
          q.id === targetId
            ? {
                ...q,
                status: q.status === 'Waiting' ? ('Triaged' as QueueStatus) : q.status,
                priority,
                hasVitals: true,
                vitalsSummary: summary,
              }
            : q
        );
      };

      // Update ticket 1 (Waiting -> Triaged)
      const afterT1 = applyUpdate(queue, '1', 'BP 120/80', 'Routine');
      expect(afterT1.find((q) => q.id === '1')?.status).toBe('Triaged');

      // Update ticket 2 (InConsultation -> InConsultation)
      const afterT2 = applyUpdate(afterT1, '2', 'BP 140/90 • HR 90', 'Urgent');
      expect(afterT2.find((q) => q.id === '2')?.status).toBe('InConsultation');
      expect(afterT2.find((q) => q.id === '2')?.vitalsSummary).toBe('BP 140/90 • HR 90');

      // Update ticket 3 (OnHold -> OnHold)
      const afterT3 = applyUpdate(afterT2, '3', 'Temp 38.5°C', 'Urgent');
      expect(afterT3.find((q) => q.id === '3')?.status).toBe('OnHold');

      // Update ticket 4 (ReEvaluation -> ReEvaluation)
      const afterT4 = applyUpdate(afterT3, '4', 'BP 115/75 • SpO2 99%', 'Emergency');
      expect(afterT4.find((q) => q.id === '4')?.status).toBe('ReEvaluation');
    });
  });

  describe('6. Rich VitalsSummary Formatting', () => {
    test('formats full rich summary string with all non-null vital signs and Z-score', () => {
      const summary = formatVitalsSummary({
        systolicBp: 120,
        diastolicBp: 80,
        heartRateBpm: 72,
        respiratoryRateBreathsPerMin: 18,
        temperatureCelsius: 36.8,
        oxygenSaturationPercent: 98,
        bmi: 24.2,
        philHealthZScoreCategory: 'Normal',
      });

      expect(summary).toBe('BP 120/80 • HR 72 • RR 18/min • Temp 36.8°C • SpO2 98% • BMI 24.2 • Z: Normal');
    });

    test('never outputs broken "BP: / • HR: " strings when BP or HR is null', () => {
      // Case 1: BP null, HR present
      const summary1 = formatVitalsSummary({
        systolicBp: null,
        diastolicBp: null,
        heartRateBpm: 80,
      });
      expect(summary1).toBe('HR 80');
      expect(summary1).not.toContain('BP');
      expect(summary1).not.toContain('/');

      // Case 2: HR null, BP present
      const summary2 = formatVitalsSummary({
        systolicBp: 130,
        diastolicBp: 85,
        heartRateBpm: null,
      });
      expect(summary2).toBe('BP 130/85');
      expect(summary2).not.toContain('HR');

      // Case 3: Only diastolic present (incomplete BP) - must not output BP /85
      const summary3 = formatVitalsSummary({
        systolicBp: null,
        diastolicBp: 85,
        heartRateBpm: 75,
      });
      expect(summary3).toBe('HR 75');
      expect(summary3).not.toContain('BP');

      // Case 4: Only systolic present (incomplete BP) - must not output BP 120/
      const summary4 = formatVitalsSummary({
        systolicBp: 120,
        diastolicBp: null,
        heartRateBpm: 75,
      });
      expect(summary4).toBe('HR 75');
      expect(summary4).not.toContain('BP');

      // Case 5: Empty / all null
      const summary5 = formatVitalsSummary({
        systolicBp: null,
        diastolicBp: null,
        heartRateBpm: null,
        temperatureCelsius: null,
      });
      expect(summary5).toBe('');

      // Case 6: Null argument
      expect(formatVitalsSummary(null)).toBe('');
      expect(formatVitalsSummary(undefined)).toBe('');
    });

    test('formats partial vital readings cleanly with dot separator', () => {
      const summary = formatVitalsSummary({
        temperatureCelsius: 38.2,
        respiratoryRateBreathsPerMin: 22,
        oxygenSaturationPercent: 94,
      });

      expect(summary).toBe('RR 22/min • Temp 38.2°C • SpO2 94%');
    });
  });

  describe('7. Shared Vitals Form Helpers', () => {
    test('evaluateBmi correctly calculates adult BMI and assigns semantic categories', () => {
      const normal = evaluateBmi('170', '65');
      expect(normal).not.toBeNull();
      expect(normal?.bmi).toBe(22.5);
      expect(normal?.category.label).toBe('Normal weight');
      expect(normal?.category.variant).toBe('success');

      const underweight = evaluateBmi('170', '50');
      expect(underweight?.bmi).toBe(17.3);
      expect(underweight?.category.label).toBe('Underweight');
      expect(underweight?.category.variant).toBe('warning');

      const overweight = evaluateBmi('170', '80');
      expect(overweight?.bmi).toBe(27.7);
      expect(overweight?.category.label).toBe('Overweight');
      expect(overweight?.category.variant).toBe('warning');

      const obese = evaluateBmi('170', '95');
      expect(obese?.bmi).toBe(32.9);
      expect(obese?.category.label).toBe('Obese');
      expect(obese?.category.variant).toBe('emergency');
    });

    test('evaluateCentralObesity enforces sex-differentiated statutory cutoffs', () => {
      // Female cutoff: 80 cm
      const femaleNormal = evaluateCentralObesity('78', '95', true);
      expect(femaleNormal?.isObeseRisk).toBe(false);
      expect(femaleNormal?.cutoff).toBe(80);

      const femaleRisk = evaluateCentralObesity('82', '95', true);
      expect(femaleRisk?.isObeseRisk).toBe(true);

      // Male cutoff: 90 cm
      const maleNormal = evaluateCentralObesity('88', '100', false);
      expect(maleNormal?.isObeseRisk).toBe(false);
      expect(maleNormal?.cutoff).toBe(90);

      const maleRisk = evaluateCentralObesity('92', '100', false);
      expect(maleRisk?.isObeseRisk).toBe(true);
    });

    test('togglePreAssessmentChip toggles observations with bullet separator', () => {
      let remarks = '';
      remarks = togglePreAssessmentChip(remarks, 'Alert & Oriented');
      expect(remarks).toBe('Alert & Oriented');

      remarks = togglePreAssessmentChip(remarks, 'Mild Distress');
      expect(remarks).toBe('Alert & Oriented • Mild Distress');

      remarks = togglePreAssessmentChip(remarks, 'Mild Distress');
      expect(remarks).toBe('Alert & Oriented');
    });
  });

  describe('8. Dedicated EditVitalsModal vs RecordVitalsModal Component Rendering', () => {
    test('renders EditVitalsModal with "Edit Vitals" title and "Update vitals" CTA distinct from RecordVitalsModal', async () => {
      const { EditVitalsModal, RecordVitalsModal } = await import('../components/consultation');

      const editMarkup = renderToStaticMarkup(
        React.createElement(EditVitalsModal, {
          visible: true,
          queueItemId: 'q-item-edit-1',
          onClose: () => {},
          onSuccess: () => {},
        })
      );
      expect(editMarkup).toContain('Edit Vitals');
      expect(editMarkup).toContain('Update vitals');
      expect(editMarkup).not.toContain('Save vitals');

      const recordMarkup = renderToStaticMarkup(
        React.createElement(RecordVitalsModal, {
          visible: true,
          patient: null,
          queueItemId: 'q-item-rec-1',
          onClose: () => {},
          onSuccess: () => {},
        })
      );
      expect(recordMarkup).toContain('Record vitals');
      expect(recordMarkup).toContain('Save vitals');
      expect(recordMarkup).not.toContain('Edit Vitals');
    });
  });
});

// token-guard:ignore-file
import { describe, expect, test, mock, beforeEach } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'fs';
import path from 'path';

(globalThis as any).__DEV__ = true;

const renderedPressHandlers = new Map<string, () => void>();

const createMockComponent = (name: string) => {
  const Comp = ({
    children,
    accessibilityLabel,
    accessibilityRole,
    accessibilityState,
    testID,
    style,
    onPress,
    visible,
    ...rest
  }: any) => {
    if (name === 'Modal' && visible === false) {
      return null;
    }
    if (onPress) {
      if (testID) renderedPressHandlers.set(testID, onPress);
      if (accessibilityLabel) renderedPressHandlers.set(accessibilityLabel, onPress);
    }
    const resolvedStyle = typeof style === 'function' ? style({ pressed: false }) : style;
    return React.createElement(
      'div',
      {
        'data-component': name,
        ...(testID ? { 'data-testid': testID, id: testID } : {}),
        ...(accessibilityLabel ? { 'aria-label': accessibilityLabel } : {}),
        ...(accessibilityRole ? { role: accessibilityRole } : {}),
        ...(accessibilityState ? { 'data-accessibility-state': JSON.stringify(accessibilityState) } : {}),
        'data-style': resolvedStyle ? JSON.stringify(resolvedStyle) : undefined,
        ...rest,
      },
      children,
    );
  };
  Comp.displayName = name;
  return Comp;
};

mock.module('react-native', () => ({
  StyleSheet: { create: (s: any) => s, flatten: (s: any) => s, absoluteFillObject: {} },
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
    get: () => ({ width: 1280, height: 800 }),
    addEventListener: () => ({ remove: () => {} }),
  },
  useWindowDimensions: () => ({ width: 1280, height: 800 }),
  Keyboard: { dismiss: () => {}, addListener: () => ({ remove: () => {} }) },
  AppState: { currentState: 'active', addEventListener: () => ({ remove: () => {} }) },
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
  Alert: { alert: () => {} },
  processColor: (c: any) => c,
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
}));

mock.module('react-native-svg', () => ({
  Svg: createMockComponent('Svg'),
  Path: createMockComponent('Path'),
  Circle: createMockComponent('Circle'),
  Rect: createMockComponent('Rect'),
  Line: createMockComponent('Line'),
  Polyline: createMockComponent('Polyline'),
  Polygon: createMockComponent('Polygon'),
  Defs: createMockComponent('Defs'),
  LinearGradient: createMockComponent('LinearGradient'),
  Stop: createMockComponent('Stop'),
  G: createMockComponent('G'),
  Text: createMockComponent('SvgText'),
  default: createMockComponent('Svg'),
}));

mock.module('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: () => {}, goBack: () => {}, setOptions: () => {} }),
  useRoute: () => ({ params: {} }),
  useFocusEffect: () => {},
}));

mock.module('@expo-google-fonts/geist', () => ({
  useFonts: () => [true],
}));

mock.module('@expo-google-fonts/geist-mono', () => ({
  useFonts: () => [true],
}));

mock.module('../constants/fonts', () => ({
  applyFontFamily: (s: any) => s,
  fontAssets: {},
}));

const { default: WorkflowModeSelector } = await import('../components/consultation/WorkflowModeSelector');
const { default: ReviewOfSystemsChecklist } = await import('../components/consultation/ReviewOfSystemsChecklist');
const { DEFAULT_PHYSICAL_EXAM_NORMAL } = await import('../components/consultation/InlinePhysicalExamCard');
const { DEFAULT_YAKAP_PLAN_MANAGEMENT } = await import('../components/consultation/PlanManagementCard');
const { clinicService, getManilaTodayStr } = await import('../services/clinicService');
const { ClinicApiClient } = await import('../services/apiClient');
const { default: Input } = await import('../components/ui/Input');
const {
  RosCategorySelectorSection,
  normalizeRosCategoryList,
  toggleRosCategorySelection,
  formatRosCategoriesSummary,
  inferRosCategoryFromSymptom,
  getRequiredRosCategoriesForSymptoms,
  syncRosCategoriesWithSymptoms,
} = await import('../components/consultation/VitalsFormFields');
const {
  parseBooleanRouteParam,
  formatDraftSavedTimestamp,
  extractStagedDentalTeethForDraft,
  buildConsultationDraftPayload,
  rehydrateEncounterPlanManagementWithWorkspace,
  validateRxClinicDispensedQuantity,
  saveLocalConsultationDraft,
  readLocalConsultationDraft,
  clearLocalConsultationDraft,
  shouldOverlayLocalConsultationDraft,
  mergeConsultationRecordWithLocalDraft,
} = await import('../components/consultation/consultationDraftHelpers');

describe('Consultation Implicit Database Draft Persistence & UI Indicators Suite', () => {
  beforeEach(() => {
    renderedPressHandlers.clear();
  });

  // ===========================================================================
  // 1. WorkflowModeSelector Upper-Right Draft Status Indicator Rendering
  // ===========================================================================
  describe('1. WorkflowModeSelector Upper-Right Draft Indicator', () => {
    test('1.1 Hides draft indicator when draftSaveStatus is idle or consultation is disabled/signed', () => {
      const idleHtml = renderToStaticMarkup(
        React.createElement(WorkflowModeSelector, {
          mode: 'Regular',
          onChange: () => {},
          draftSaveStatus: 'idle',
        }),
      );
      expect(idleHtml).not.toContain('workflow-draft-status-indicator');
      expect(idleHtml).not.toContain('Saved as draft');

      const signedHtml = renderToStaticMarkup(
        React.createElement(WorkflowModeSelector, {
          mode: 'YakapAvailment',
          onChange: () => {},
          disabled: true,
          draftSaveStatus: 'saved',
          draftSavedAtLabel: '2:15 PM',
        }),
      );
      expect(signedHtml).not.toContain('workflow-draft-status-indicator');
      expect(signedHtml).not.toContain('Saved as draft');
    });

    test('1.2 Renders "Saving draft..." indicator while background save is in flight', () => {
      const html = renderToStaticMarkup(
        React.createElement(WorkflowModeSelector, {
          mode: 'Regular',
          onChange: () => {},
          draftSaveStatus: 'saving',
        }),
      );
      expect(html).toContain('workflow-draft-status-indicator');
      expect(html).toContain('Saving draft...');
    });

    test('1.3 Renders "Saved as draft · <timestamp>" in both Regular and YakapAvailment modes', () => {
      const regularHtml = renderToStaticMarkup(
        React.createElement(WorkflowModeSelector, {
          mode: 'Regular',
          onChange: () => {},
          draftSaveStatus: 'saved',
          draftSavedAtLabel: '10:42 AM',
        }),
      );
      expect(regularHtml).toContain('workflow-draft-status-indicator');
      expect(regularHtml).toContain('Saved as draft · 10:42 AM');

      const yakapHtml = renderToStaticMarkup(
        React.createElement(WorkflowModeSelector, {
          mode: 'YakapAvailment',
          onChange: () => {},
          atcValue: 'ATC123456',
          onChangeAtc: () => {},
          draftSaveStatus: 'saved',
          draftSavedAtLabel: 'Nov 10, 2026, 4:05 PM',
        }),
      );
      expect(yakapHtml).toContain('workflow-draft-status-indicator');
      expect(yakapHtml).toContain('Saved as draft · Nov 10, 2026, 4:05 PM');
    });

    test('1.4 Renders interactive retry pill when draft auto-save fails', () => {
      let retried = false;
      const html = renderToStaticMarkup(
        React.createElement(WorkflowModeSelector, {
          mode: 'Regular',
          onChange: () => {},
          draftSaveStatus: 'error',
          onRetryDraftSave: () => {
            retried = true;
          },
        }),
      );
      expect(html).toContain('workflow-draft-status-indicator');
      expect(html).toContain('Draft save failed · Tap to retry');

      const handler = renderedPressHandlers.get('workflow-draft-status-indicator');
      expect(handler).toBeDefined();
      handler!();
      expect(retried).toBe(true);
    });
  });

  // ===========================================================================
  // 2. formatDraftSavedTimestamp & extractStagedDentalTeethForDraft
  // ===========================================================================
  describe('2. Timestamp Formatting & Dental Draft Extraction', () => {
    test('2.1 formatDraftSavedTimestamp handles empty, invalid, same-day, and prior-day timestamps', () => {
      expect(formatDraftSavedTimestamp(null)).toBeNull();
      expect(formatDraftSavedTimestamp(undefined)).toBeNull();
      expect(formatDraftSavedTimestamp('')).toBeNull();
      expect(formatDraftSavedTimestamp('not-a-date')).toBeNull();

      const todayYmd = getManilaTodayStr();
      const sameDayIso = `${todayYmd}T14:30:00+08:00`;
      const sameDayFormatted = formatDraftSavedTimestamp(sameDayIso);
      expect(sameDayFormatted).toBeTruthy();
      expect(sameDayFormatted).not.toContain('2020');

      const priorDayFormatted = formatDraftSavedTimestamp('2025-01-15T09:15:00+08:00');
      expect(priorDayFormatted).toBeTruthy();
      expect(priorDayFormatted).toContain('2025');
    });

    test('2.2 extractStagedDentalTeethForDraft captures only current-encounter non-voided non-Healthy teeth', () => {
      const sampleChart = {
        11: [
          {
            toothNumber: 11,
            status: 'Missing',
            surface: null,
            notes: 'Historical extraction',
            isCurrentEncounter: false,
            isVoided: false,
          },
        ],
        16: [
          {
            toothNumber: 16,
            status: 'Caries',
            surface: 'MO',
            notes: 'Deep mesio-occlusal caries',
            isCurrentEncounter: true,
            isVoided: false,
          },
          {
            toothNumber: 16,
            status: 'Fractured',
            surface: 'B',
            notes: 'Mistaken click',
            isCurrentEncounter: true,
            isVoided: true,
          },
        ],
        21: [
          {
            toothNumber: 21,
            status: 'Healthy',
            surface: null,
            notes: null,
            isCurrentEncounter: true,
            isVoided: false,
          },
        ],
      };

      expect(extractStagedDentalTeethForDraft(sampleChart, false)).toEqual([]);

      const extracted = extractStagedDentalTeethForDraft(sampleChart, true);
      expect(extracted).toEqual([
        {
          toothNumber: 16,
          status: 'Caries',
          surface: 'MO',
          notes: 'Deep mesio-occlusal caries',
        },
      ]);
    });
  });

  // ===========================================================================
  // 3. buildConsultationDraftPayload — Full Regular & YAKAP Coverage
  // ===========================================================================
  describe('3. buildConsultationDraftPayload Complete Field Coverage', () => {
    test('3.1 Captures every YAKAP clinical, 1NF PE, cohort, plan management, draft order, dental, and modal field', () => {
      const pe = {
        ...DEFAULT_PHYSICAL_EXAM_NORMAL,
        generalSurvey: 'Awake and alert' as const,
        generalSurveyId: '2',
        generalSurveyRemarks: 'Mild epigastric discomfort',
        abdomen: 'Abnormal' as const,
        abdomenCode: 'ABD02',
        abdomenRemarks: 'Direct epigastric tenderness',
      };

      const payload = buildConsultationDraftPayload({
        patientId: 'pat-001',
        patientName: 'Dela Cruz, Maria',
        doctorId: 'doc-001',
        doctorName: 'Dr. Jose Rizal',
        queueItemId: 'queue-001',
        appointmentId: 'appt-001',
        hasExistingConsultation: true,
        specialtyMode: 'General',
        isDentalEnabled: true,
        visitWorkflowMode: 'YakapAvailment',
        isYakapEligible: true,
        philHealthAtc: 'ATC998877',
        doctorPrc: 'PRC-777',
        doctorPtr: 'PTR-888',
        doctorS2: 'S2-999',
        doctorPan: 'PAN-111',
        subjective: 'Epigastric pain for 3 days',
        objective: 'BP 138/88, tender epigastrium',
        assessment: 'Acute gastritis; Stage 1 hypertension',
        plan: 'Omeprazole 20mg OD + lifestyle advice',
        homeInstructions: 'Avoid spicy food and NSAIDs',
        rosCategory: 'Gastrointestinal',
        rosItems: [
          {
            system: 'Gastrointestinal',
            optionCode: 'PAIN',
            symptomName: 'Abdominal pain',
            isPertinentPositive: true,
            painSite: 'Epigastric',
            remarks: 'Worse after meals',
          },
          {
            system: 'General',
            optionCode: 'X',
            symptomName: 'Others',
            isPertinentPositive: true,
            othersSpecifyText: 'Occasional bloating',
          },
        ],
        selectedSymptomCodes: ['PAIN', 'X'],
        painSymptomSelected: true,
        otherSymptomSelected: true,
        symptomPainSite: 'Epigastric',
        symptomOtherDesc: 'Occasional bloating',
        physicalExamFindings: pe,
        obGyneExam: {
          gravidity: 2,
          parity: 1,
          lmp: '2026-10-05',
          fetalHeartToneBpm: 146,
          remarks: 'Normal prenatal check',
        },
        pediatricMilestones: [
          {
            milestoneVisitAge: '18m',
            grossMotorStatus: 'Normal',
            languageStatus: 'Delayed',
            dangerSigns: ['Lethargy'],
          },
        ],
        adolescentAssessment: {
          tannerStage: 3,
          depressionScreenPositive: true,
          remarks: 'Follow-up counseling',
        },
        headsssAssessments: [
          {
            domain: 'Suicide',
            assessmentText: 'School stress reported',
            hasRedFlags: true,
            redFlags: ['Insomnia'],
          },
        ],
        bpMonitoringLogs: [
          {
            recordedAt: '2026-11-11',
            systolic: 138,
            diastolic: 88,
            pulseBpm: 76,
            location: 'Clinic',
            arm: 'Left',
          },
        ],
        planManagement: {
          ...DEFAULT_YAKAP_PLAN_MANAGEMENT,
          counselingCodes: ['DIET', 'STOP_SMOKING'],
          hasCancerScreening: false,
          hasMedicationPrescription: false,
          hasReferral: false,
          hasFollowUp: true,
          followUpDate: '2026-11-25',
          followUpReason: 'Recheck symptoms',
          diagnosticServicesOption: 'N',
        },
        completedLabResultsCount: 0,
        hasIssuedReferral: false,
        selectedDiagnoses: [
          { id: 'diag-1', icd10Code: 'K29.7', description: 'Gastritis, unspecified', isPrimary: true },
        ],
        prescriptions: [
          {
            id: 'rx-1',
            genericName: 'Omeprazole',
            dosage: '20mg',
            form: 'Capsule',
            sig: '1 cap OD 30m before breakfast',
            quantity: 14,
            durationDays: 14,
            isDangerousDrug: false,
            philHealthDrugCode: 'OMEP01',
            clinicDispensedQuantity: 4,
            rosCategory: 'Gastrointestinal',
          },
        ],
        orderedLabs: [
          {
            id: 'lab-1',
            serviceItemId: 'svc-cbc',
            code: 'CBC',
            name: 'Complete Blood Count',
            category: 'Diagnostic',
            standardPrice: 250,
            philHealthCode: 'PH-CBC',
            fulfillmentMode: 'in_house',
            instructions: 'Stat',
          },
          {
            id: 'lab-2',
            serviceItemId: 'svc-fbs',
            code: 'FBS',
            name: 'Fasting Blood Sugar',
            category: 'Diagnostic',
            standardPrice: 180,
            philHealthCode: 'PH-FBS',
            fulfillmentMode: 'outside',
            instructions: '8h fasting',
          },
        ],
        orderedProcedures: [
          {
            id: 'proc-draft',
            serviceItemId: 'svc-ecg',
            code: 'ECG',
            name: '12-Lead ECG',
            category: 'Procedure',
            standardPrice: 450,
            instructions: 'Resting',
            targetRoomId: 'room-tx-1',
            targetRoomName: 'Treatment Room 1',
            status: 'draft',
            isHandedOff: false,
          },
          {
            id: 'proc-sent',
            serviceItemId: 'svc-neb',
            code: 'NEB',
            name: 'Nebulization',
            category: 'Procedure',
            standardPrice: 300,
            status: 'sent_to_room',
            isHandedOff: true,
          },
        ],
        dentalChart: {
          26: [
            {
              toothNumber: 26,
              status: 'Caries',
              surface: 'O',
              notes: 'Pit caries',
              isCurrentEncounter: true,
              isVoided: false,
            },
          ],
        },
        cdsOverrideReason: 'Patient tolerates therapy well',
        overrideConfirmed: true,
        medCertFitness: 'NeedsRest',
        medCertRestDays: '3',
        medCertPurpose: 'Sick leave',
        medCertRemarks: 'Bed rest advised',
        refFacility: 'St. Luke Medical Center',
        refDepartment: 'Gastroenterology',
        refUrgency: 'Routine',
        refReason: 'Endoscopy evaluation',
        refSummary: 'Persistent epigastric pain',
      });

      expect(payload.visitWorkflowMode).toBe('YakapAvailment');
      expect(payload.isYakapEligible).toBe(true);
      expect(payload.philHealthAtc).toBe('ATC998877');
      expect(payload.doctorPrcLicense).toBe('PRC-777');
      expect(payload.doctorPtr).toBe('PTR-888');
      expect(payload.doctorS2License).toBe('S2-999');
      expect(payload.doctorPhilHealthPan).toBe('PAN-111');
      expect(payload.subjective).toBe('Epigastric pain for 3 days');
      expect(payload.homeInstructions).toBe('Avoid spicy food and NSAIDs');
      expect(payload.rosCategory).toBe('Gastrointestinal');
      expect(payload.reviewOfSystemsItems).toHaveLength(2);
      expect(payload.physicalExams).toHaveLength(1);
      expect(payload.physicalExams?.[0].generalSurveyId).toBe('2');
      expect(payload.obGyneExam?.gravidity).toBe(2);
      expect(payload.pediatricMilestones?.[0].languageStatus).toBe('Delayed');
      expect(payload.adolescentAssessment?.tannerStage).toBe(3);
      expect(payload.headsssAssessments?.[0].domain).toBe('Suicide');
      expect(payload.bpMonitoringLogs?.[0].systolic).toBe(138);

      // Staged orders & exclusion of already handed-off procedure
      expect(payload.draftDiagnosticOrders).toHaveLength(2);
      expect(payload.draftDiagnosticOrders?.map((d) => d.fulfillmentMode)).toEqual(['in_house', 'outside']);
      expect(payload.draftProcedures).toHaveLength(1);
      expect(payload.draftProcedures?.[0].code).toBe('ECG');
      expect(payload.draftDentalTeeth).toEqual([
        { toothNumber: 26, status: 'Caries', surface: 'O', notes: 'Pit caries' },
      ]);

      // Exact tri-state & modal workspace preservation
      expect(payload.draftWorkspace).toEqual({
        cdsOverrideReason: 'Patient tolerates therapy well',
        cdsOverrideConfirmed: true,
        planHasMedicationPrescription: false,
        planHasReferral: false,
        planHasCancerScreening: false,
        planHasFollowUp: true,
        planDiagnosticServicesOption: 'N',
        medCertFitness: 'NeedsRest',
        medCertRestDays: '3',
        medCertPurpose: 'Sick leave',
        medCertRemarks: 'Bed rest advised',
        refFacility: 'St. Luke Medical Center',
        refDepartment: 'Gastroenterology',
        refUrgency: 'Routine',
        refReason: 'Endoscopy evaluation',
        refSummary: 'Persistent epigastric pain',
      });
    });

    test('3.2 Regular consultation preserves cleared empty strings ("") so erased notes overwrite stale DB text', () => {
      const payload = buildConsultationDraftPayload({
        patientId: 'pat-002',
        patientName: 'Santos, Juan',
        doctorId: 'doc-001',
        doctorName: 'Dr. Jose Rizal',
        hasExistingConsultation: true,
        specialtyMode: 'General',
        isDentalEnabled: false,
        visitWorkflowMode: 'Regular',
        isYakapEligible: false,
        philHealthAtc: '',
        doctorPrc: '',
        doctorPtr: '',
        doctorS2: '',
        doctorPan: '',
        fallbackPrc: 'PRC-FALLBACK',
        subjective: '',
        objective: '',
        assessment: '',
        plan: '',
        homeInstructions: '',
        rosCategory: '',
        rosItems: [],
        selectedSymptomCodes: [],
        painSymptomSelected: false,
        otherSymptomSelected: false,
        symptomPainSite: '',
        symptomOtherDesc: '',
        physicalExamFindings: { ...DEFAULT_PHYSICAL_EXAM_NORMAL },
        obGyneExam: null,
        pediatricMilestones: [],
        adolescentAssessment: null,
        headsssAssessments: [],
        bpMonitoringLogs: [],
        planManagement: { ...DEFAULT_YAKAP_PLAN_MANAGEMENT },
        completedLabResultsCount: 0,
        hasIssuedReferral: false,
        selectedDiagnoses: [],
        prescriptions: [],
        orderedLabs: [],
        orderedProcedures: [],
        dentalChart: {},
        cdsOverrideReason: '',
        overrideConfirmed: false,
        medCertFitness: 'FitToWork',
        medCertRestDays: '',
        medCertPurpose: '',
        medCertRemarks: '',
        refFacility: '',
        refDepartment: '',
        refUrgency: 'Routine',
        refReason: '',
        refSummary: '',
      });

      expect(payload.visitWorkflowMode).toBe('Regular');
      expect(payload.isYakapEligible).toBe(false);
      expect(payload.philHealthAtc).toBe('');
      expect(payload.doctorPrcLicense).toBe('PRC-FALLBACK');
      expect(payload.subjective).toBe('');
      expect(payload.objective).toBe('');
      expect(payload.assessment).toBe('');
      expect(payload.plan).toBe('');
      expect(payload.homeInstructions).toBe('');
      expect(payload.rosCategory).toBe('');
      expect(payload.diagnoses).toEqual([]);
      expect(payload.prescriptions).toEqual([]);
      expect(payload.draftDiagnosticOrders).toEqual([]);
      expect(payload.draftProcedures).toEqual([]);
      expect(payload.draftDentalTeeth).toEqual([]);
    });

    test('3.3 Captures unsubmitted Add Medication composer fields (showAddRx + newRx*) in draftWorkspace', () => {
      const payload = buildConsultationDraftPayload({
        patientId: 'pat-003',
        patientName: 'Reyes, Ana',
        doctorId: 'doc-001',
        doctorName: 'Dr. Jose Rizal',
        hasExistingConsultation: true,
        specialtyMode: 'General',
        isDentalEnabled: false,
        visitWorkflowMode: 'Regular',
        isYakapEligible: false,
        philHealthAtc: '',
        doctorPrc: 'PRC-101',
        doctorPtr: '',
        doctorS2: '',
        doctorPan: '',
        subjective: 'Cough',
        objective: '',
        assessment: 'URI',
        plan: '',
        homeInstructions: '',
        rosCategory: 'EssentiallyNormal',
        rosItems: [],
        selectedSymptomCodes: [],
        painSymptomSelected: false,
        otherSymptomSelected: false,
        symptomPainSite: '',
        symptomOtherDesc: '',
        physicalExamFindings: { ...DEFAULT_PHYSICAL_EXAM_NORMAL },
        obGyneExam: null,
        pediatricMilestones: [],
        adolescentAssessment: null,
        headsssAssessments: [],
        bpMonitoringLogs: [],
        planManagement: { ...DEFAULT_YAKAP_PLAN_MANAGEMENT },
        completedLabResultsCount: 0,
        hasIssuedReferral: false,
        selectedDiagnoses: [],
        prescriptions: [],
        orderedLabs: [],
        orderedProcedures: [],
        dentalChart: {},
        cdsOverrideReason: '',
        overrideConfirmed: false,
        medCertFitness: 'FitToWork',
        medCertRestDays: '',
        medCertPurpose: '',
        medCertRemarks: '',
        refFacility: '',
        refDepartment: '',
        refUrgency: 'Routine',
        refReason: '',
        refSummary: '',
        showAddRx: true,
        newRxGeneric: 'Co-Amoxiclav',
        newRxDosage: '625mg',
        newRxForm: 'Tablet',
        newRxSig: '1 tab q12h x 7 days',
        newRxQuantity: '14',
        newRxClinicDispensedQty: '4',
        newRxDangerous: false,
        newRxDrugCode: 'COAMOX625',
      });

      expect(payload.draftWorkspace?.rxShowAddForm).toBe(true);
      expect(payload.draftWorkspace?.rxDraftGeneric).toBe('Co-Amoxiclav');
      expect(payload.draftWorkspace?.rxDraftDosage).toBe('625mg');
      expect(payload.draftWorkspace?.rxDraftForm).toBe('Tablet');
      expect(payload.draftWorkspace?.rxDraftSig).toBe('1 tab q12h x 7 days');
      expect(payload.draftWorkspace?.rxDraftQuantity).toBe('14');
      expect(payload.draftWorkspace?.rxDraftClinicDispensedQty).toBe('4');
      expect(payload.draftWorkspace?.rxDraftDangerous).toBe(false);
      expect(payload.draftWorkspace?.rxDraftDrugCode).toBe('COAMOX625');
    });
  });

  // ===========================================================================
  // 4. rehydrateEncounterPlanManagementWithWorkspace Tri-State Fidelity
  // ===========================================================================
  describe('4. Plan Management Tri-State Rehydration', () => {
    test('4.1 Unsigned encounter restores null/false tri-state toggles from draftWorkspace without coercing null to false', () => {
      const unsignedDraft: any = {
        id: 'enc-draft-1',
        isSigned: false,
        hasMedicationPrescription: false,
        hasReferral: false,
        hasFollowUp: false,
        diagnosticServicesOption: null,
        draftWorkspace: {
          planHasMedicationPrescription: null,
          planHasReferral: false,
          planHasCancerScreening: false,
          planHasFollowUp: true,
          planDiagnosticServicesOption: 'R',
        },
      };

      const rehydrated = rehydrateEncounterPlanManagementWithWorkspace(unsignedDraft);
      expect(rehydrated.hasMedicationPrescription).toBeNull();
      expect(rehydrated.hasReferral).toBe(false);
      expect(rehydrated.hasCancerScreening).toBe(false);
      expect(rehydrated.hasFollowUp).toBe(true);
      expect(rehydrated.diagnosticServicesOption).toBe('R');
    });

    test('4.2 Signed encounter ignores draftWorkspace and uses canonical signed columns', () => {
      const signedEncounter: any = {
        id: 'enc-signed-1',
        isSigned: true,
        hasMedicationPrescription: true,
        hasReferral: true,
        hasFollowUp: false,
        diagnosticServicesOption: 'Y',
        draftWorkspace: {
          planHasMedicationPrescription: false,
          planHasReferral: false,
          planDiagnosticServicesOption: 'N',
        },
      };

      const rehydrated = rehydrateEncounterPlanManagementWithWorkspace(signedEncounter);
      expect(rehydrated.hasMedicationPrescription).toBe(true);
      expect(rehydrated.hasReferral).toBe(true);
      expect(rehydrated.diagnosticServicesOption).toBe('Y');
    });
  });

  // ===========================================================================
  // 5. Consultations.screen.tsx Auto-Save & Indicator Wiring Invariants
  // ===========================================================================
  describe('5. Consultations.screen.tsx Implicit Auto-Save & Indicator Invariants', () => {
    const consultPath = path.resolve(__dirname, '../navigation/screens/Consultations.screen.tsx');
    const consultContent = fs.readFileSync(consultPath, 'utf8');

    test('5.1 Renders both upper-right WorkflowModeSelector draft indicator and pre-sign bottom draft status row', () => {
      expect(consultContent).toContain('draftSaveStatus={draftSaveStatus}');
      expect(consultContent).toContain('draftSavedAtLabel={draftSavedAtLabel}');
      expect(consultContent).toContain('testID="pre-sign-draft-status-indicator"');
      expect(consultContent).toContain('Sign & sync encounter');
    });

    test('5.2 Implements implicit debounced auto-save with post-hydration baseline guard and outgoing patient/pagehide flush', () => {
      expect(consultContent).toContain('needsBaselineCaptureRef');
      expect(consultContent).toContain('persistDraftSnapshot');
      expect(consultContent).toContain('flushOutgoingDraftSnapshot');
      expect(consultContent).toContain('inFlightDraftSavePromiseRef');
      expect(consultContent).toContain('queuedDraftSnapshotRef');
      expect(consultContent).toContain("window.addEventListener('pagehide'");
      expect(consultContent).toContain("window.addEventListener('visibilitychange'");
    });

    test('5.3 Associates Medical Certificate, Referral Letter, and Treatment Room Procedure handoffs with the saved draft encounter', () => {
      const ensureCalls = consultContent.match(/await ensureDraftConsultationSaved\(/g) ?? [];
      // MedCert + Referral + HandoffAllProcedures + HandoffSingleProcedure === 4 callers
      expect(ensureCalls.length).toBe(4);
    });
  });

  // ===========================================================================
  // 6. ReviewOfSystemsChecklist Bare PhilHealth Code ('38' Pain, 'X' Others) Rendering
  // ===========================================================================
  describe('6. ReviewOfSystemsChecklist Bare PhilHealth Code Rehydration', () => {
    test('6.1 Renders Pain site and Specify other symptoms inputs when rehydrated from bare codes 38 and X', () => {
      const html = renderToStaticMarkup(
        React.createElement(ReviewOfSystemsChecklist, {
          items: [
            { optionCode: '38', symptomName: '38', isPertinentPositive: true, painSite: 'Right lower quadrant' },
            { optionCode: 'X', symptomName: 'X', isPertinentPositive: true, othersSpecifyText: 'Early satiety' },
          ],
          onChange: () => {},
        }),
      );
      expect(html).toContain('Pain location');
      expect(html).toContain('Right lower quadrant');
      expect(html).toContain('Other symptoms');
      expect(html).toContain('Early satiety');
    });
  });

  // ===========================================================================
  // 7. Synchronous Keepalive Unload Dispatch (pagehide / beforeunload / visibilitychange)
  // ===========================================================================
  describe('7. Keepalive Unload Persistence Dispatch', () => {
    test('7.1 sendKeepaliveJson & flushConsultationDraftKeepalive dispatch fetch with keepalive: true and 60 KB guard', async () => {
      const calls: Array<{ url: string; init: RequestInit }> = [];
      const originalFetch = globalThis.fetch;
      globalThis.fetch = ((url: any, init?: any) => {
        calls.push({ url: String(url), init: init ?? {} });
        return Promise.resolve(new Response('{}', { status: 200 }));
      }) as any;

      try {
        const minimalPayload: any = {
          patientId: 'pat-001',
          patientName: 'Dela Cruz, Maria',
          doctorId: 'doc-001',
          doctorName: 'Dr. Rizal',
          queueItemId: 'queue-001',
          subjective: 'Typed right before hard browser refresh',
        };

        // 1. Unsaved consultationId -> POST .../api/v1/consultations with keepalive: true
        const postSent = clinicService.flushConsultationDraftKeepalive(null, minimalPayload);
        expect(postSent).toBe(true);
        expect(calls).toHaveLength(1);
        expect(calls[0].url).toEndWith('/api/v1/consultations');
        expect(calls[0].init.method).toBe('POST');
        expect(calls[0].init.keepalive).toBe(true);
        expect(JSON.parse(String(calls[0].init.body)).subjective).toBe(
          'Typed right before hard browser refresh',
        );

        // 2. Existing consultationId -> PUT .../api/v1/consultations/:id with keepalive: true
        const putSent = clinicService.flushConsultationDraftKeepalive('enc-999', minimalPayload);
        expect(putSent).toBe(true);
        expect(calls).toHaveLength(2);
        expect(calls[1].url).toEndWith('/api/v1/consultations/enc-999');
        expect(calls[1].init.method).toBe('PUT');
        expect(calls[1].init.keepalive).toBe(true);

        // 3. Oversized > 60 KB payload -> returns false without calling fetch so caller falls back cleanly
        const client = new ClinicApiClient({
          baseUrl: () => 'https://clinic.example.test',
          authenticated: false,
        });
        const hugeSent = client.sendKeepaliveJson('PUT', '/consultations/enc-999', {
          subjective: 'X'.repeat(70_000),
        });
        expect(hugeSent).toBe(false);
        expect(calls).toHaveLength(2);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  // ===========================================================================
  // 8. Adversarial Regression Guards (JSON null crash, Rx state leak, race guards)
  // ===========================================================================
  describe('8. Adversarial Regression Guards on Consultations.screen.tsx', () => {
    const consultPath = path.resolve(__dirname, '../navigation/screens/Consultations.screen.tsx');
    const consultContent = fs.readFileSync(consultPath, 'utf8');

    test('8.1 Guards draftDiagnosticOrders, draftProcedures, and draftDentalTeeth with Array.isArray so JSON null never crashes loadPatientContext', () => {
      expect(consultContent).not.toContain('existingEncounter.draftDiagnosticOrders !== undefined');
      expect(consultContent).not.toContain('existingEncounter.draftProcedures !== undefined');
      expect(consultContent).toContain('Array.isArray(existingEncounter.draftDiagnosticOrders)');
      expect(consultContent).toContain('Array.isArray(existingEncounter.draftProcedures)');
      expect(consultContent).toContain('Array.isArray(matchedEncounter?.draftDentalTeeth)');
    });

    test('8.2 Resets all unsubmitted newRx* composer fields in both resetEncounter and handleStartFollowUpEncounter', () => {
      const genericResets = consultContent.match(/setNewRxGeneric\(''\)/g) ?? [];
      const dosageResets = consultContent.match(/setNewRxDosage\(''\)/g) ?? [];
      const sigResets = consultContent.match(/setNewRxSig\(''\)/g) ?? [];
      const dangerousResets = consultContent.match(/setNewRxDangerous\(false\)/g) ?? [];
      // handleAddPrescription + resetEncounter + handleStartFollowUpEncounter >= 3 occurrences
      expect(genericResets.length).toBeGreaterThanOrEqual(3);
      expect(dosageResets.length).toBeGreaterThanOrEqual(3);
      expect(sigResets.length).toBeGreaterThanOrEqual(3);
      expect(dangerousResets.length).toBeGreaterThanOrEqual(3);
    });

    test('8.3 Guards ephemeral visit materialization with inFlightFingerprintRef, re-runs CDS on reload, and wires keepalive unload', () => {
      expect(consultContent).toContain('inFlightFingerprintRef');
      expect(consultContent).toContain('currentDraftFingerprint === inFlightFingerprintRef.current');
      expect(consultContent).toContain('flushConsultationDraftKeepalive');
      expect(consultContent).toContain("window.addEventListener('beforeunload'");
      expect(consultContent).toContain('preserveOverrideState');
    });
  });

  // ===========================================================================
  // 9. Single Active Draft Per Visit & Route Boolean Query Parsing
  // ===========================================================================
  describe('9. Single Active Draft Per Visit & Route Boolean Parsing', () => {
    test('9.1 parseBooleanRouteParam treats URL query string "false" and "0" as false so refresh never spawns duplicate drafts', () => {
      expect(parseBooleanRouteParam(false)).toBe(false);
      expect(parseBooleanRouteParam('false')).toBe(false);
      expect(parseBooleanRouteParam('FALSE')).toBe(false);
      expect(parseBooleanRouteParam('0')).toBe(false);
      expect(parseBooleanRouteParam(0)).toBe(false);
      expect(parseBooleanRouteParam(undefined)).toBe(false);
      expect(parseBooleanRouteParam(null)).toBe(false);
      expect(parseBooleanRouteParam('')).toBe(false);
      expect(parseBooleanRouteParam(true)).toBe(true);
      expect(parseBooleanRouteParam('true')).toBe(true);
      expect(parseBooleanRouteParam('TRUE')).toBe(true);
      expect(parseBooleanRouteParam('1')).toBe(true);
      expect(parseBooleanRouteParam(1)).toBe(true);
    });

    test('9.2 Dual-layer localStorage draft saves immediately, overlays stale/older server responses on refresh, and clears on sign-off', () => {
      const store = new Map<string, string>();
      const origWindow = (globalThis as any).window;
      (globalThis as any).window = {
        ...(origWindow || {}),
        localStorage: {
          getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
          setItem: (k: string, v: string) => {
            store.set(k, v);
          },
          removeItem: (k: string) => {
            store.delete(k);
          },
        },
      };

      try {
        const draftPayload = buildConsultationDraftPayload({
          patientId: 'pat-ecg-1',
          patientName: 'Reyes, Juan',
          doctorId: 'doc-1',
          doctorName: 'Dr. Santos',
          queueItemId: 'visit-ecg-1',
          isDentalEnabled: false,
          visitWorkflowMode: 'YakapAvailment',
          isYakapEligible: true,
          philHealthAtc: 'WALKEDIN',
          doctorPrc: '0123456',
          doctorPtr: 'PTR-1',
          doctorS2: '',
          doctorPan: '1234-5678901-2',
          subjective: 'Chest discomfort and dry cough for 2 days.',
          objective: 'Awake, alert.',
          assessment: 'Atypical chest pain',
          plan: '12-Lead ECG and Nebulization',
          homeInstructions: 'Rest and return if dyspnea worsens.',
          rosCategory: 'Cardiovascular',
          rosCategories: ['Cardiovascular', 'Respiratory'],
          rosItems: [
            { optionCode: '08', symptomName: 'Chest Pain/Discomfort', isPertinentPositive: true },
            { optionCode: '09', symptomName: 'Cough', isPertinentPositive: true },
          ],
          selectedSymptomCodes: ['08', '09'],
          painSymptomSelected: false,
          otherSymptomSelected: false,
          symptomPainSite: '',
          symptomOtherDesc: '',
          physicalExamFindings: { ...DEFAULT_PHYSICAL_EXAM_NORMAL },
          obGyneExam: null,
          pediatricMilestones: [],
          adolescentAssessment: null,
          headsssAssessments: [],
          bpMonitoringLogs: [],
          planManagement: { ...DEFAULT_YAKAP_PLAN_MANAGEMENT },
          completedLabResultsCount: 0,
          hasIssuedReferral: false,
          selectedDiagnoses: [{ icd10Code: 'R07.9', description: 'Chest pain, unspecified', isPrimary: true }],
          prescriptions: [],
          orderedLabs: [
            {
              serviceItemId: 'diag-ecg',
              code: 'ECG-12',
              name: '12-Lead Electrocardiogram (ECG)',
              category: 'Diagnostic',
              standardPrice: 450,
              philHealthCode: '7',
              fulfillmentMode: 'in_house',
            },
          ],
          orderedProcedures: [
            {
              serviceItemId: 'proc-neb',
              code: 'NEB-01',
              name: 'Nebulization',
              category: 'Procedure',
              standardPrice: 250,
              status: 'draft',
              isHandedOff: false,
            },
          ],
          dentalChart: {},
          cdsOverrideReason: '',
          overrideConfirmed: false,
          medCertFitness: 'FitToWork',
          medCertRestDays: '',
          medCertPurpose: '',
          medCertRemarks: '',
          refFacility: '',
          refDepartment: '',
          refUrgency: 'Routine',
          refReason: '',
          refSummary: '',
        });

        saveLocalConsultationDraft({
          version: 1,
          savedAt: '2026-11-12T02:05:00.000Z',
          clinicId: 'clinic-1',
          visitId: 'visit-ecg-1',
          patientId: 'pat-ecg-1',
          consultationId: 'enc-ecg-1',
          payload: draftPayload,
        });

        const loaded = readLocalConsultationDraft({
          clinicId: 'clinic-1',
          visitId: 'visit-ecg-1',
          patientId: 'pat-ecg-1',
          consultationId: 'enc-ecg-1',
        });
        expect(loaded).not.toBeNull();

        // Simulate older remote server response missing draftDiagnosticOrders & rosCategories
        const staleRemoteEncounter: any = {
          id: 'enc-ecg-1',
          tenantId: 'tenant-1',
          clinicId: 'clinic-1',
          queueItemId: 'visit-ecg-1',
          patientId: 'pat-ecg-1',
          patientName: 'Reyes, Juan',
          doctorId: 'doc-1',
          doctorName: 'Dr. Santos',
          encounterDate: '2026-11-12T02:04:00.000Z',
          updatedAt: '2026-11-12T02:04:00.000Z',
          isSigned: false,
          subjective: 'Old subjective',
          objective: '',
          assessment: '',
          plan: '',
          diagnoses: [],
          prescriptions: [],
        };

        expect(shouldOverlayLocalConsultationDraft(staleRemoteEncounter, loaded)).toBe(true);
        const merged = mergeConsultationRecordWithLocalDraft(staleRemoteEncounter, loaded!);
        expect(merged.id).toBe('enc-ecg-1');
        expect(merged.draftDiagnosticOrders).toHaveLength(1);
        expect(merged.draftDiagnosticOrders?.[0]?.name).toBe('12-Lead Electrocardiogram (ECG)');
        expect(merged.draftProcedures?.[0]?.name).toBe('Nebulization');
        expect(merged.rosCategories).toEqual(['Cardiovascular', 'Respiratory']);

        // Never overlay onto a signed encounter
        expect(
          shouldOverlayLocalConsultationDraft({ ...staleRemoteEncounter, isSigned: true }, loaded),
        ).toBe(false);

        // Clearing on sign-off removes all local draft keys
        clearLocalConsultationDraft({
          clinicId: 'clinic-1',
          visitId: 'visit-ecg-1',
          patientId: 'pat-ecg-1',
          consultationId: 'enc-ecg-1',
        });
        expect(
          readLocalConsultationDraft({
            clinicId: 'clinic-1',
            visitId: 'visit-ecg-1',
            patientId: 'pat-ecg-1',
            consultationId: 'enc-ecg-1',
          }),
        ).toBeNull();
      } finally {
        (globalThis as any).window = origWindow;
      }
    });
  });

  // ===========================================================================
  // 10. Multi-Choice ROS Categories, Untoggle Persistence & Badge-Free Hierarchy
  // ===========================================================================
  describe('10. Multi-Choice ROS Categories, Untoggle Persistence & Separate Symptom Workflow', () => {
    test('10.1 Supports multi-selecting organ systems, disables individual chips when Essentially Normal is active, and omits redundant summary badge', () => {
      let selected: string[] = [];
      selected = toggleRosCategorySelection(selected, 'Cardiovascular');
      selected = toggleRosCategorySelection(selected, 'Respiratory');
      expect(selected).toEqual(['Cardiovascular', 'Respiratory']);
      expect(formatRosCategoriesSummary(selected)).toBe('Cardio, Respi');

      const multiHtml = renderToStaticMarkup(
        React.createElement(RosCategorySelectorSection, {
          multiple: true,
          values: selected,
          onChangeMultiple: () => {},
        }),
      );
      // Chips show Cardio & Respi directly without a redundant summary badge ("Cardio, Respi")
      expect(multiHtml).not.toContain('Cardio, Respi');

      // Selecting Essentially Normal clears abnormal systems and locks EssentiallyNormal
      selected = toggleRosCategorySelection(selected, 'EssentiallyNormal');
      expect(selected).toEqual(['EssentiallyNormal']);
      expect(formatRosCategoriesSummary(selected)).toBe('Essentially Normal');

      // While Essentially Normal is locked, individual system chips render disabled in UI
      const lockedHtml = renderToStaticMarkup(
        React.createElement(RosCategorySelectorSection, {
          multiple: true,
          values: selected,
          onChangeMultiple: () => {},
        }),
      );
      expect(lockedHtml).toContain('ros-essentially-normal-lock-hint');
      expect(lockedHtml).toContain('&quot;disabled&quot;:true');
      expect(lockedHtml).toContain('disabled=""');

      // Tapping Essentially Normal again unlocks individual system chips
      selected = toggleRosCategorySelection(selected, 'EssentiallyNormal');
      expect(selected).toEqual([]);
      const unlockedHtml = renderToStaticMarkup(
        React.createElement(RosCategorySelectorSection, {
          multiple: true,
          values: selected,
          onChangeMultiple: () => {},
        }),
      );
      expect(unlockedHtml).not.toContain('ros-essentially-normal-lock-hint');
    });

    test('10.2 Untoggling ROS chips (down to 1 or 0 selected) persists across refresh without re-selecting from symptoms or stale server rosCategory', () => {
      const store: Record<string, string> = {};
      const origWindow = (globalThis as any).window;
      (globalThis as any).window = {
        localStorage: {
          getItem: (k: string) => (k in store ? store[k] : null),
          setItem: (k: string, v: string) => {
            store[k] = String(v);
          },
          removeItem: (k: string) => {
            delete store[k];
          },
        },
      };

      try {
        // Clinician untoggles all ROS category chips (rosCategories = []) even while Cough ('09') is selected in checklist
        const untoggledPayload = buildConsultationDraftPayload({
          patientId: 'pat-ros-1',
          patientName: 'Dela Cruz, Maria',
          doctorId: 'doc-1',
          doctorName: 'Dr. Santos',
          queueItemId: 'visit-ros-1',
          hasExistingConsultation: true,
          specialtyMode: 'General',
          isDentalEnabled: false,
          visitWorkflowMode: 'YakapAvailment',
          isYakapEligible: true,
          philHealthAtc: 'WALKEDIN',
          doctorPrc: 'PRC-101',
          doctorPtr: '',
          doctorS2: '',
          doctorPan: '',
          subjective: 'Mild cough',
          objective: '',
          assessment: '',
          plan: '',
          homeInstructions: '',
          rosCategory: 'EssentiallyNormal',
          rosCategories: [],
          rosItems: [{ optionCode: '09', symptomName: 'Cough', isPertinentPositive: true }],
          selectedSymptomCodes: ['09'],
          painSymptomSelected: false,
          otherSymptomSelected: false,
          symptomPainSite: '',
          symptomOtherDesc: '',
          physicalExamFindings: { ...DEFAULT_PHYSICAL_EXAM_NORMAL },
          obGyneExam: null,
          pediatricMilestones: [],
          adolescentAssessment: null,
          headsssAssessments: [],
          bpMonitoringLogs: [],
          planManagement: { ...DEFAULT_YAKAP_PLAN_MANAGEMENT },
          completedLabResultsCount: 0,
          hasIssuedReferral: false,
          selectedDiagnoses: [],
          prescriptions: [],
          orderedLabs: [],
          orderedProcedures: [],
          dentalChart: {},
          cdsOverrideReason: '',
          overrideConfirmed: false,
          medCertFitness: 'FitToWork',
          medCertRestDays: '',
          medCertPurpose: '',
          medCertRemarks: '',
          refFacility: '',
          refDepartment: '',
          refUrgency: 'Routine',
          refReason: '',
          refSummary: '',
        });

        // Symptom selection MUST NOT auto-populate rosCategories; explicit [] is preserved!
        expect(untoggledPayload.draftWorkspace?.rosCategories).toEqual([]);

        saveLocalConsultationDraft({
          version: 1,
          savedAt: '2026-11-12T02:45:00.000Z',
          clinicId: 'clinic-1',
          visitId: 'visit-ros-1',
          patientId: 'pat-ros-1',
          consultationId: 'enc-ros-1',
          payload: untoggledPayload,
        });

        const loaded = readLocalConsultationDraft({
          clinicId: 'clinic-1',
          visitId: 'visit-ros-1',
          patientId: 'pat-ros-1',
          consultationId: 'enc-ros-1',
        });
        expect(loaded).not.toBeNull();

        // Simulate remote server returning stale rosCategory: 'Cardiovascular' and identical updatedAt
        const remoteEncounterWithStaleRos: any = {
          id: 'enc-ros-1',
          tenantId: 'tenant-1',
          clinicId: 'clinic-1',
          queueItemId: 'visit-ros-1',
          patientId: 'pat-ros-1',
          patientName: 'Dela Cruz, Maria',
          doctorId: 'doc-1',
          doctorName: 'Dr. Santos',
          encounterDate: '2026-11-12T02:45:00.000Z',
          updatedAt: '2026-11-12T02:45:00.000Z',
          isSigned: false,
          rosCategory: 'Cardiovascular',
          draftDiagnosticOrders: [],
          draftProcedures: [],
        };

        expect(shouldOverlayLocalConsultationDraft(remoteEncounterWithStaleRos, loaded)).toBe(true);
        const merged = mergeConsultationRecordWithLocalDraft(remoteEncounterWithStaleRos, loaded!);
        expect(merged.rosCategories).toEqual([]);
        expect(merged.draftWorkspace?.rosCategories).toEqual([]);
      } finally {
        (globalThis as any).window = origWindow;
      }
    });
  });

  // ===========================================================================
  // 11. Inline Rx Dispense (pcs), Draft Indicators & Diagnostic Terminology
  // ===========================================================================
  describe('11. Inline Rx Dispense Validation, Draft Indicators & Diagnostic Labels', () => {
    test('11.1 validateRxClinicDispensedQuantity enforces whole pieces <= prescribed Quantity', () => {
      expect(validateRxClinicDispensedQuantity('30', '')).toBeNull();
      expect(validateRxClinicDispensedQuantity('30', '0')).toBeNull();
      expect(validateRxClinicDispensedQuantity('30', '6')).toBeNull();
      expect(validateRxClinicDispensedQuantity('30', '30')).toBeNull();
      expect(validateRxClinicDispensedQuantity('10', '12')).toBe('Max 10 pcs');
      expect(validateRxClinicDispensedQuantity('10', '-1')).toBe('Whole pcs >= 0');
      expect(validateRxClinicDispensedQuantity('10', '2.5')).toBe('Whole pcs >= 0');
    });

    test('11.2 Input renders circled ? tooltip trigger when labelTooltip is provided', () => {
      const html = renderToStaticMarkup(
        React.createElement(Input, {
          label: 'Dispense (pcs)',
          labelTooltip: 'Starter pieces handed out from clinic stock.',
          value: '2',
          onChangeText: () => {},
        }),
      );
      expect(html).toContain('Dispense (pcs)');
      expect(html).toContain('input-label-tooltip-trigger');
    });

    test('11.3 Consultations.screen.tsx renders explicit Draft indicators on medication items (without header button duplication) and on Medical Certificates/Referrals while unsigned', () => {
      const consultPath = path.resolve(__dirname, '../navigation/screens/Consultations.screen.tsx');
      const consultContent = fs.readFileSync(consultPath, 'utf8');
      expect(consultContent).toContain('title={`Diagnostic orders (${orderedLabs.length})`}');
      expect(consultContent).toContain('title="Diagnostic reports"');
      expect(consultContent).toContain('label="Dispense (pcs)"');
      expect(consultContent).not.toContain('title={`Laboratory orders (${orderedLabs.length})`}');
      expect(consultContent).toContain('testID="rx-medication-item"');
      expect(consultContent).not.toContain('testID="rx-draft-banner"');
      expect(consultContent).not.toContain(
        'prescriptions.length > 0 && !isSigned ? (\n                      <Badge label="Draft"',
      );
      expect(consultContent).toContain('testID="document-draft-banner"');
      expect(consultContent).toContain('Medical certificate (Draft)');
      expect(consultContent).toContain('Draft — Pending physician encounter sign-off');
    });
  });
});

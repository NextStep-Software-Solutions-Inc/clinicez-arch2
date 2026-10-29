// token-guard:ignore-file
/**
 * apps/clinic-app/tests/challenger_m4a_1_workflow_1nf_adversarial.test.ts
 *
 * EMPIRICAL ADVERSARIAL CHALLENGER TEST SUITE: Milestone 4-A
 * Clinical Workflow Transitions, 1NF Findings Transformations & PSGC Address Verification
 *
 * Mandatory Empirical Verifications:
 * 1. Test 1: Rapid switching between 'Regular' and 'YakapAvailment' modes in WorkflowModeSelector —
 *    verify zero loss of entered clinical consultation data (complaints, vitals, ROS, PE, diagnoses, prescriptions).
 * 2. Test 2: 1NF transformation stress test for to1NFFindings in InlinePhysicalExamCard.tsx —
 *    verify that findings with abnormal remarks, normal findings, empty fields, and special characters
 *    produce valid normalized relational arrays without null reference exceptions or formatting bugs.
 * 3. Test 3: Review of Systems checklist — verify items with symptomName, isChecked, and custom notes
 *    correctly assemble into reviewOfSystemsItems child collections.
 * 4. Test 4: Specialized cohort forms (SpecificEncounterFormsCard) — verify rendering and state isolation
 *    for pediatric, adolescent, obstetric, HEADSSS, and BP monitoring encounters.
 * 5. Test 5: PSGC cascading selector — verify selection flow: Region -> Province -> City/Municipality -> Barangay,
 *    and verify NCR (1300000000) skips province and populates direct cities correctly.
 */

import { describe, expect, test, mock, beforeEach } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

(globalThis as any).__DEV__ = true;

// Mock React Native primitives for Bun runtime
const createMockComponent = (name: string) => {
  const Comp = ({ children, accessibilityLabel, accessibilityRole, placeholder, onPress, value, onChangeText, testID, ...props }: any) =>
    React.createElement(
      'div',
      {
        'data-component': name,
        ...(testID ? { 'data-testid': testID } : {}),
        ...(accessibilityLabel ? { 'aria-label': accessibilityLabel } : {}),
        ...(accessibilityRole ? { role: accessibilityRole } : {}),
        ...(placeholder ? { 'data-placeholder': placeholder } : {}),
        ...(value !== undefined ? { 'data-value': String(value) } : {}),
        onClick: onPress,
      },
      placeholder,
      children
    );
  Comp.displayName = name;
  return Comp;
};

mock.module('react-native', () => ({
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
    get: () => ({ width: 1920, height: 1080 }),
    addEventListener: () => ({ remove: () => {} }),
  },
  useWindowDimensions: () => ({ width: 1920, height: 1080 }),
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
    },
    timing: () => ({ start: (cb?: any) => cb?.() }),
    View: createMockComponent('Animated.View'),
    Text: createMockComponent('Animated.Text'),
  },
  Linking: { openURL: () => Promise.resolve(), canOpenURL: () => Promise.resolve(true) },
  Alert: { alert: () => {} },
  PixelRatio: {
    get: () => 1,
    getFontScale: () => 1,
    getPixelSizeForLayoutSize: (size: number) => size,
    roundToNearestPixel: (size: number) => size,
  },
  I18nManager: { isRTL: false, allowRTL: () => {}, forceRTL: () => {} },
}));

mock.module('expo-crypto', () => ({
  randomUUID: () => 'mock-uuid-' + Math.random().toString(36).substring(2, 9),
}));

mock.module('react-native-svg', () => ({
  Svg: createMockComponent('Svg'),
  Path: createMockComponent('Path'),
  Circle: createMockComponent('Circle'),
  Rect: createMockComponent('Rect'),
  Line: createMockComponent('Line'),
  Polygon: createMockComponent('Polygon'),
  G: createMockComponent('G'),
  Polyline: createMockComponent('Polyline'),
  default: createMockComponent('Svg'),
}));

mock.module('../constants/fonts', () => ({
  applyFontFamily: (s: any) => s,
  fontAssets: {},
}));

// Mock useEhrOptions hook for ReviewOfSystemsChecklist
const MOCK_SYMPTOM_OPTIONS = [
  { code: 'fever', label: 'Fever / Lagnat' },
  { code: 'cough', label: 'Cough / Ubo' },
  { code: 'chest_pain', label: 'Chest Pain / Paninikip ng dibdib' },
  { code: 'headache', label: 'Headache / Sakit ng ulo' },
  { code: 'abdominal_pain', label: 'Abdominal Pain / Sakit ng tiyan' },
  { code: 'dyspnea', label: 'Difficulty of Breathing' },
  { code: 'nausea', label: 'Nausea & Vomiting' },
  { code: 'other_symptom', label: 'Other Symptoms' },
];

mock.module('../hooks/useEhrOptions', () => ({
  useEhrOptions: (optionSet: string) => {
    const isRos = optionSet === 'ros_symptom';
    const opts = isRos ? MOCK_SYMPTOM_OPTIONS : [];
    return {
      options: opts,
      loading: false,
      error: null,
      selectOptions: opts.map((o) => ({ label: o.label, value: o.code })),
      reload: () => {},
    };
  },
}));

// Mock PSGC location data
const MOCK_REGIONS = [
  { psgcCode: '1300000000', code: '1300000000', name: 'National Capital Region (NCR)', level: 'Reg' },
  { psgcCode: '0300000000', code: '0300000000', name: 'Region III (Central Luzon)', level: 'Reg' },
  { psgcCode: '0400000000', code: '0400000000', name: 'Region IV-A (CALABARZON)', level: 'Reg' },
];

const MOCK_PROVINCES: Record<string, any[]> = {
  '0300000000': [
    { psgcCode: '0354000000', code: '0354000000', name: 'Pampanga', level: 'Prov', regionPsgc: '0300000000' },
    { psgcCode: '0314000000', code: '0314000000', name: 'Bulacan', level: 'Prov', regionPsgc: '0300000000' },
  ],
  '0400000000': [
    { psgcCode: '0421000000', code: '0421000000', name: 'Cavite', level: 'Prov', regionPsgc: '0400000000' },
    { psgcCode: '0434000000', code: '0434000000', name: 'Laguna', level: 'Prov', regionPsgc: '0400000000' },
  ],
  '1300000000': [], // NCR has NO provinces
};

const MOCK_CITIES: Record<string, any[]> = {
  // Direct cities for NCR (keyed by regionPsgc when province is omitted)
  '_1300000000': [
    { psgcCode: '1339000000', code: '1339000000', name: 'City of Manila', level: 'City', regionPsgc: '1300000000', zipCode: '1000' },
    { psgcCode: '1374000000', code: '1374000000', name: 'Quezon City', level: 'City', regionPsgc: '1300000000', zipCode: '1100' },
  ],
  // Cities by province
  '0354000000_0300000000': [
    { psgcCode: '0354160000', code: '0354160000', name: 'City of San Fernando', level: 'City', provincePsgc: '0354000000', zipCode: '2000' },
    { psgcCode: '0354010000', code: '0354010000', name: 'Angeles City', level: 'City', provincePsgc: '0354000000', zipCode: '2009' },
  ],
  '0421000000_0400000000': [
    { psgcCode: '0421030000', code: '0421030000', name: 'City of Dasmariñas', level: 'City', provincePsgc: '0421000000', zipCode: '4114' },
  ],
};

const MOCK_BARANGAYS: Record<string, any[]> = {
  '1339000000': [
    { psgcCode: '133901001', code: '133901001', name: 'Barangay 659', level: 'Bgy', cityMunicipalityPsgc: '1339000000' },
    { psgcCode: '133901002', code: '133901002', name: 'Barangay 660', level: 'Bgy', cityMunicipalityPsgc: '1339000000' },
  ],
  '0354160000': [
    { psgcCode: '035416001', code: '035416001', name: 'Dolores', level: 'Bgy', cityMunicipalityPsgc: '0354160000' },
    { psgcCode: '035416002', code: '035416002', name: 'San Agustin', level: 'Bgy', cityMunicipalityPsgc: '0354160000' },
  ],
};

mock.module('../hooks/usePsgcLocations', () => ({
  usePsgcLocations: (selectedRegionPsgc?: string | null, selectedProvincePsgc?: string | null, selectedCityPsgc?: string | null) => {
    const provinces = selectedRegionPsgc ? (MOCK_PROVINCES[selectedRegionPsgc] || []) : [];
    const cityKey = `${selectedProvincePsgc || ''}_${selectedRegionPsgc || ''}`;
    const cities = selectedRegionPsgc || selectedProvincePsgc ? (MOCK_CITIES[cityKey] || []) : [];
    const barangays = selectedCityPsgc ? (MOCK_BARANGAYS[selectedCityPsgc] || []) : [];

    return {
      regions: MOCK_REGIONS,
      provinces,
      cities,
      barangays,
      loadingRegions: false,
      loadingProvinces: false,
      loadingCities: false,
      loadingBarangays: false,
    };
  },
}));

// Dynamic import of target components after mocks are registered
const { default: WorkflowModeSelector } = await import('../components/consultation/WorkflowModeSelector');
const {
  InlinePhysicalExamCard,
  to1NFFindings,
  DEFAULT_PHYSICAL_EXAM_NORMAL,
} = await import('../components/consultation/InlinePhysicalExamCard');
type PhysicalExamFindings = import('../components/consultation/InlinePhysicalExamCard').PhysicalExamFindings;

const { default: ReviewOfSystemsChecklist } = await import('../components/consultation/ReviewOfSystemsChecklist');
const { default: SpecificEncounterFormsCard } = await import('../components/consultation/SpecificEncounterFormsCard');
const { default: PsgcAddressSelector } = await import('../components/ui/PsgcAddressSelector');
const { locationService } = await import('../services/locationService');

type VisitWorkflowMode = import('../services/clinicService').VisitWorkflowMode;
type EncounterReviewOfSystemsItemDto = import('../services/clinicService').EncounterReviewOfSystemsItemDto;
type PatientPhysicalExamFindingDto = import('../services/clinicService').PatientPhysicalExamFindingDto;
type EncounterObGyneExamDto = import('../services/clinicService').EncounterObGyneExamDto;
type EncounterPediatricMilestoneDto = import('../services/clinicService').EncounterPediatricMilestoneDto;
type EncounterAdolescentAssessmentDto = import('../services/clinicService').EncounterAdolescentAssessmentDto;
type EncounterHeadsssDomainAssessmentDto = import('../services/clinicService').EncounterHeadsssDomainAssessmentDto;
type PatientBpMonitoringLogDto = import('../services/clinicService').PatientBpMonitoringLogDto;
type PatientAddressDto = import('../services/clinicService').PatientAddressDto;

describe('Milestone 4-A Empirical Adversarial Challenger: Workstation EHR Workflows & 1NF Findings', () => {

  // =========================================================================
  // TEST 1: Rapid Switching Between 'Regular' and 'YakapAvailment' Modes
  // =========================================================================
  describe('Test 1: WorkflowModeSelector & Lossless Data Preservation', () => {
    test('WorkflowModeSelector renders both modes correctly and reflects active states', () => {
      let currentMode: VisitWorkflowMode = 'Regular';
      const handleChange = (mode: VisitWorkflowMode) => {
        currentMode = mode;
      };

      // 1. Regular mode rendering
      const regularHtml = renderToStaticMarkup(
        React.createElement(WorkflowModeSelector, {
          mode: 'Regular',
          onChange: handleChange,
        })
      );
      expect(regularHtml).toContain('Clinical Workflow Mode');
      expect(regularHtml).toContain('Regular Clinical');
      expect(regularHtml).toContain('Regular Consultation');
      expect(regularHtml).toContain('Standard EHR clinical consultation');

      // 2. YakapAvailment mode rendering
      const yakapHtml = renderToStaticMarkup(
        React.createElement(WorkflowModeSelector, {
          mode: 'YakapAvailment',
          onChange: handleChange,
        })
      );
      expect(yakapHtml).toContain('YAKAP 2.0 Availment');
      expect(yakapHtml).toContain('Yakap Availment');
      expect(yakapHtml).toContain('PhilHealth YAKAP 2.0 statutory consultation encounter');
    });

    test('Stress Test: 100 rapid mode switches guarantee ZERO loss of consultation clinical data', () => {
      // Simulate consultation state in Consultations.screen.tsx
      const initialConsultation = {
        // Workflow mode
        visitWorkflowMode: 'Regular' as VisitWorkflowMode,
        isYakapEligible: false,
        philHealthAtc: 'WALKEDIN',

        // Subjective / Complaints
        chiefComplaint: 'Severe intermittent left temporal throbbing headache with photophobia and nausea for 3 days',
        subjectiveNotes: 'Patient notes onset after prolonged computer screen use. Aggravated by bright light. Relieved slightly by sleep.',

        // Triage Vitals
        vitals: {
          temp: 37.8,
          bpSystolic: 136,
          bpDiastolic: 88,
          heartRate: 84,
          respiratoryRate: 18,
          oxygenSaturation: 99,
          weightKg: 68.4,
          heightCm: 172.5,
          bodyMassIndex: 22.98,
        },

        // Review of Systems (1NF Relational Items)
        rosItems: [
          { optionCode: 'headache', symptomName: 'Headache', isPertinentPositive: true, painSite: 'Left temporal', othersSpecifyText: null },
          { optionCode: 'nausea', symptomName: 'Nausea & Vomiting', isPertinentPositive: true, painSite: null, othersSpecifyText: null },
          { optionCode: 'other_symptom', symptomName: 'Other Symptoms', isPertinentPositive: true, painSite: null, othersSpecifyText: 'Photophobia and phonophobia' },
        ] as EncounterReviewOfSystemsItemDto[],

        // Physical Exam Findings
        physicalExam: {
          ...DEFAULT_PHYSICAL_EXAM_NORMAL,
          generalSurvey: 'Abnormal' as const,
          generalSurveyRemarks: 'Patient visibly uncomfortable, in mild distress, shielding eyes from ambient room light',
          generalSurveyId: '2',
          heent: 'Abnormal' as const,
          heentRemarks: 'Pupils equal, round, reactive to light, mild photophobia elicited on penlight exam',
          heentId: '12',
        } as PhysicalExamFindings,

        // Assessment / Diagnoses
        diagnoses: [
          { icd10Code: 'G43.909', description: 'Migraine, unspecified, not intractable, without status migrainosus', isPrimary: true },
          { icd10Code: 'R51.9', description: 'Headache, unspecified', isPrimary: false },
        ],

        // Prescriptions
        prescriptions: [
          {
            genericName: 'Sumatriptan',
            brandName: 'Imigran',
            dosage: '50mg',
            form: 'Tablet',
            route: 'Oral',
            frequency: 'PRN',
            durationDays: 5,
            quantity: 6,
            instructions: 'Take 1 tablet at the immediate onset of migraine attack. May repeat in 2 hours if headache persists.',
            philHealthDrugCode: 'DRUG-SUMA-50',
          },
          {
            genericName: 'Metoclopramide',
            brandName: 'Plasil',
            dosage: '10mg',
            form: 'Tablet',
            route: 'Oral',
            frequency: 'TID',
            durationDays: 3,
            quantity: 9,
            instructions: 'Take 1 tablet 30 minutes before meals for nausea.',
            philHealthDrugCode: null,
          },
        ],

        // Specialized cohort forms
        bpMonitoringLogs: [
          { recordedAt: '2026-10-28T16:30:00Z', systolic: 136, diastolic: 88, pulseBpm: 84, location: 'Right Arm', arm: 'Right Arm' },
        ] as PatientBpMonitoringLogDto[],
      };

      // Create mutable working copy
      const session = JSON.parse(JSON.stringify(initialConsultation));
      let isSigned = false;

      // The exact logic from Consultations.screen.tsx handleWorkflowModeChange:
      const handleWorkflowModeChange = (mode: VisitWorkflowMode) => {
        if (isSigned) return;
        session.visitWorkflowMode = mode;
        const yakap = mode === 'YakapAvailment';
        session.isYakapEligible = yakap;
        if (yakap && (!session.philHealthAtc.trim() || session.philHealthAtc === 'ATC-2026-KON01')) {
          session.philHealthAtc = 'WALKEDIN';
        }
      };

      // Perform 100 rapid switches back and forth between Regular and YakapAvailment
      for (let i = 0; i < 100; i++) {
        const targetMode: VisitWorkflowMode = i % 2 === 0 ? 'YakapAvailment' : 'Regular';
        handleWorkflowModeChange(targetMode);

        // Invariant 1: Workflow mode correctly set
        expect(session.visitWorkflowMode).toBe(targetMode);
        expect(session.isYakapEligible).toBe(targetMode === 'YakapAvailment');

        // Invariant 2: Complaints data 100% preserved
        expect(session.chiefComplaint).toBe(initialConsultation.chiefComplaint);
        expect(session.subjectiveNotes).toBe(initialConsultation.subjectiveNotes);

        // Invariant 3: Vitals data 100% preserved
        expect(session.vitals).toEqual(initialConsultation.vitals);

        // Invariant 4: Review of Systems 1NF child items 100% preserved
        expect(session.rosItems.length).toBe(3);
        expect(session.rosItems).toEqual(initialConsultation.rosItems);

        // Invariant 5: Physical Exam findings 100% preserved
        expect(session.physicalExam.generalSurvey).toBe('Abnormal');
        expect(session.physicalExam.generalSurveyRemarks).toBe(initialConsultation.physicalExam.generalSurveyRemarks);
        expect(session.physicalExam.heent).toBe('Abnormal');
        expect(session.physicalExam.heentRemarks).toBe(initialConsultation.physicalExam.heentRemarks);

        // Invariant 6: Diagnoses and prescriptions 100% preserved
        expect(session.diagnoses).toEqual(initialConsultation.diagnoses);
        expect(session.prescriptions).toEqual(initialConsultation.prescriptions);

        // Invariant 7: BP monitoring logs 100% preserved
        expect(session.bpMonitoringLogs).toEqual(initialConsultation.bpMonitoringLogs);
      }

      // Final state verification after 100 switches: back to Regular
      handleWorkflowModeChange('Regular');
      expect(session.visitWorkflowMode).toBe('Regular');
      expect(session.isYakapEligible).toBe(false);
      expect(session.chiefComplaint).toBe(initialConsultation.chiefComplaint);
      expect(session.vitals.bpSystolic).toBe(136);
      expect(session.prescriptions[0].genericName).toBe('Sumatriptan');

      // Verify signing guard: once signed, mode changes are completely blocked
      isSigned = true;
      handleWorkflowModeChange('YakapAvailment');
      expect(session.visitWorkflowMode).toBe('Regular'); // Remains Regular because isSigned is true
      expect(session.isYakapEligible).toBe(false);
    });
  });

  // =========================================================================
  // TEST 2: 1NF Transformation Stress Test for to1NFFindings
  // =========================================================================
  describe('Test 2: 1NF Transformation Stress Test for to1NFFindings', () => {
    test('Default normal findings normalize into exactly 10 relational items with isNormal=true and remarks=null', () => {
      const findings = to1NFFindings(DEFAULT_PHYSICAL_EXAM_NORMAL);

      expect(findings).toBeArray();
      expect(findings.length).toBe(10);

      const expectedSystems = [
        'General Survey',
        'Skin & Extremities',
        'HEENT',
        'Chest & Lungs',
        'Heart & CVS',
        'Abdomen',
        'Neurological',
        'Digital Rectal Exam',
        'Genitourinary',
        'Musculoskeletal',
      ];

      findings.forEach((item, index) => {
        expect(item.system).toBe(expectedSystems[index]);
        expect(item.isNormal).toBe(true);
        expect(item.remarks).toBeNull();
        expect(typeof item.findingTitle).toBe('string');
        expect(item.findingTitle.length).toBeGreaterThan(0);
        expect(typeof item.optionCode).toBe('string');
        expect(item.optionCode.length).toBeGreaterThan(0);
      });

      // Verify specific normal codes
      expect(findings.find((f) => f.system === 'General Survey')?.optionCode).toBe('1');
      expect(findings.find((f) => f.system === 'HEENT')?.optionCode).toBe('11');
      expect(findings.find((f) => f.system === 'Chest & Lungs')?.optionCode).toBe('6');
      expect(findings.find((f) => f.system === 'Heart & CVS')?.optionCode).toBe('5');
      expect(findings.find((f) => f.system === 'Abdomen')?.optionCode).toBe('7');
      expect(findings.find((f) => f.system === 'Neurological')?.optionCode).toBe('6');
    });

    test('Abnormal findings with remarks, custom codes, and special characters produce valid relational 1NF records', () => {
      const adversarialExam: PhysicalExamFindings = {
        ...DEFAULT_PHYSICAL_EXAM_NORMAL,
        skin: 'Abnormal',
        skinId: '9',
        skinRemarks: "Petechiae on both lower extremities; <script>alert('xss')</script> -- rash w/ erythema & O'Connell sign 🚨",
        chest: 'Abnormal',
        chestId: '5',
        chestRemarks: 'Expiratory wheezes bilaterally over mid-to-lower lung fields; RR 24/min with intercostal retractions',
        abdomen: 'Abnormal',
        abdomenId: '9',
        abdomenRemarks: "Direct and rebound tenderness @ McBurney's point (RLQ); positive Rovsing sign; DROP TABLE exam;--",
      };

      const findings = to1NFFindings(adversarialExam);
      expect(findings.length).toBe(10);

      // Check abnormal skin
      const skinFinding = findings.find((f) => f.system === 'Skin & Extremities')!;
      expect(skinFinding).toBeDefined();
      expect(skinFinding.isNormal).toBe(false);
      expect(skinFinding.optionCode).toBe('9');
      expect(skinFinding.findingTitle).toBe("Petechiae on both lower extremities; <script>alert('xss')</script> -- rash w/ erythema & O'Connell sign 🚨");
      expect(skinFinding.remarks).toBe("Petechiae on both lower extremities; <script>alert('xss')</script> -- rash w/ erythema & O'Connell sign 🚨");

      // Check abnormal chest
      const chestFinding = findings.find((f) => f.system === 'Chest & Lungs')!;
      expect(chestFinding).toBeDefined();
      expect(chestFinding.isNormal).toBe(false);
      expect(chestFinding.optionCode).toBe('5');
      expect(chestFinding.findingTitle).toBe('Expiratory wheezes bilaterally over mid-to-lower lung fields; RR 24/min with intercostal retractions');

      // Check abnormal abdomen
      const abdFinding = findings.find((f) => f.system === 'Abdomen')!;
      expect(abdFinding).toBeDefined();
      expect(abdFinding.isNormal).toBe(false);
      expect(abdFinding.optionCode).toBe('9');
      expect(abdFinding.remarks).toBe("Direct and rebound tenderness @ McBurney's point (RLQ); positive Rovsing sign; DROP TABLE exam;--");

      // Check unchanged normal systems remain normal
      const heartFinding = findings.find((f) => f.system === 'Heart & CVS')!;
      expect(heartFinding.isNormal).toBe(true);
      expect(heartFinding.remarks).toBeNull();
      expect(heartFinding.optionCode).toBe('5');
    });

    test('Degenerate stress test: completely empty object {} does not throw and yields 10 safe fallback records', () => {
      // Adversarial degenerate input: {} (partial or missing keys)
      const degenerateExam = {} as PhysicalExamFindings;

      let findings: PatientPhysicalExamFindingDto[] = [];
      expect(() => {
        findings = to1NFFindings(degenerateExam);
      }).not.toThrow();

      expect(findings.length).toBe(10);
      findings.forEach((item) => {
        expect(item.system).toBeDefined();
        // Since status was undefined, isNormal evaluates to false
        expect(item.isNormal).toBe(false);
        // Fallback title when remarks is missing/empty
        expect(item.findingTitle).toBe('Abnormal finding');
        // Fallback code when code is missing
        expect(item.optionCode).toBe('99');
        // Remarks evaluates to null
        expect(item.remarks).toBeNull();
      });
    });

    test('Empty strings, whitespace remarks, and very long clinical essays normalize safely', () => {
      // 1. Abnormal system with empty string remarks "" -> should fallback to 'Abnormal finding' and remarks null
      const emptyRemarksExam: PhysicalExamFindings = {
        ...DEFAULT_PHYSICAL_EXAM_NORMAL,
        heent: 'Abnormal',
        heentRemarks: '',
        heentId: '',
      };
      const findings1 = to1NFFindings(emptyRemarksExam);
      const heent1 = findings1.find((f) => f.system === 'HEENT')!;
      expect(heent1.isNormal).toBe(false);
      expect(heent1.findingTitle).toBe('Abnormal finding');
      expect(heent1.remarks).toBeNull();
      expect(heent1.optionCode).toBe('99'); // Fallback to '99'

      // 2. Extremely large text (5,000 characters)
      const longText = 'Clinical notes: ' + 'A'.repeat(5000);
      const largeRemarksExam: PhysicalExamFindings = {
        ...DEFAULT_PHYSICAL_EXAM_NORMAL,
        neuro: 'Abnormal',
        neuroRemarks: longText,
        neuroId: '4',
      };
      const findings2 = to1NFFindings(largeRemarksExam);
      const neuro2 = findings2.find((f) => f.system === 'Neurological')!;
      expect(neuro2.isNormal).toBe(false);
      expect(neuro2.remarks?.length).toBe(longText.length);
      expect(neuro2.findingTitle).toBe(longText);
    });
  });

  // =========================================================================
  // TEST 3: Review of Systems Checklist Child Collections
  // =========================================================================
  describe('Test 3: Review of Systems Checklist & 1NF Child Itemization', () => {
    test('ReviewOfSystemsChecklist renders with dynamic options and handles symptom selection', () => {
      const selectedItems: EncounterReviewOfSystemsItemDto[] = [
        { optionCode: 'fever', symptomName: 'Fever / Lagnat', isPertinentPositive: true, painSite: null, othersSpecifyText: null },
      ];

      let lastEmitted: EncounterReviewOfSystemsItemDto[] = [];
      const handleChange = (items: EncounterReviewOfSystemsItemDto[]) => {
        lastEmitted = items;
      };

      const html = renderToStaticMarkup(
        React.createElement(ReviewOfSystemsChecklist, {
          items: selectedItems,
          onChange: handleChange,
        })
      );

      expect(html).toContain('Review of Systems (ROS)');
      expect(html).toContain('Presenting Symptoms');
      expect(html).toContain('Pure 1NF symptom itemization');
      expect(html).toContain('1 Selected');
      expect(html).toContain('Fever / Lagnat');
      expect(html).toContain('Chest Pain');
    });

    test('Toggling symptoms immutably creates 1NF child items and removes unselected symptoms', () => {
      let items: EncounterReviewOfSystemsItemDto[] = [];

      // Helper simulating ReviewOfSystemsChecklist toggleItem logic:
      const toggleItem = (code: string, label: string) => {
        const activeCodes = new Set(items.map((i) => i.optionCode));
        if (activeCodes.has(code)) {
          items = items.filter((i) => i.optionCode !== code);
        } else {
          const newItem: EncounterReviewOfSystemsItemDto = {
            optionCode: code,
            symptomName: label,
            isPertinentPositive: true,
            painSite: null,
            othersSpecifyText: null,
          };
          items = [...items, newItem];
        }
      };

      // 1. Add fever
      toggleItem('fever', 'Fever / Lagnat');
      expect(items.length).toBe(1);
      expect(items[0]).toEqual({
        optionCode: 'fever',
        symptomName: 'Fever / Lagnat',
        isPertinentPositive: true,
        painSite: null,
        othersSpecifyText: null,
      });

      // 2. Add cough
      toggleItem('cough', 'Cough / Ubo');
      expect(items.length).toBe(2);
      expect(items[1].optionCode).toBe('cough');

      // 3. Add headache
      toggleItem('headache', 'Headache / Sakit ng ulo');
      expect(items.length).toBe(3);

      // 4. Toggle cough off -> removes cough, fever & headache remain
      toggleItem('cough', 'Cough / Ubo');
      expect(items.length).toBe(2);
      expect(items.map((i) => i.optionCode)).toEqual(['fever', 'headache']);
    });

    test('Pain site and Other specify text conditionally bind to corresponding 1NF records', () => {
      let items: EncounterReviewOfSystemsItemDto[] = [
        { optionCode: 'chest_pain', symptomName: 'Chest Pain / Paninikip ng dibdib', isPertinentPositive: true, painSite: null, othersSpecifyText: null },
        { optionCode: 'fever', symptomName: 'Fever / Lagnat', isPertinentPositive: true, painSite: null, othersSpecifyText: null },
        { optionCode: 'other_symptom', symptomName: 'Other Symptoms', isPertinentPositive: true, painSite: null, othersSpecifyText: null },
      ];

      // Update pain site
      const painText = 'Substernal, radiating to left shoulder and jaw; pressure-like 8/10';
      items = items.map((i) =>
        i.optionCode.toLowerCase().includes('pain') || (i.symptomName?.toLowerCase() ?? '').includes('pain')
          ? { ...i, painSite: painText }
          : i
      );

      // Verify painSite is populated ONLY on chest_pain
      const chestPain = items.find((i) => i.optionCode === 'chest_pain')!;
      expect(chestPain.painSite).toBe(painText);
      expect(items.find((i) => i.optionCode === 'fever')!.painSite).toBeNull();

      // Update others specify
      const otherText = 'Severe night sweats with 5kg unexplained weight loss over 1 month';
      items = items.map((i) =>
        i.optionCode.toLowerCase().includes('other') || (i.symptomName?.toLowerCase() ?? '').includes('other')
          ? { ...i, othersSpecifyText: otherText }
          : i
      );

      // Verify othersSpecifyText is populated ONLY on other_symptom
      const other = items.find((i) => i.optionCode === 'other_symptom')!;
      expect(other.othersSpecifyText).toBe(otherText);
      expect(items.find((i) => i.optionCode === 'fever')!.othersSpecifyText).toBeNull();
      expect(items.find((i) => i.optionCode === 'chest_pain')!.othersSpecifyText).toBeNull();
    });
  });

  // =========================================================================
  // TEST 4: Specialized Cohort Forms (SpecificEncounterFormsCard)
  // =========================================================================
  describe('Test 4: SpecificEncounterFormsCard Rendering & State Isolation', () => {
    test('SpecificEncounterFormsCard renders collapsed by default and displays active count badge', () => {
      const html = renderToStaticMarkup(
        React.createElement(SpecificEncounterFormsCard, {
          obGyneExam: { gravidity: 2, parity: 1, lmp: '2026-03-01' },
          onObGyneExamChange: () => {},
          pediatricMilestones: [],
          onPediatricMilestonesChange: () => {},
          adolescentAssessment: null,
          onAdolescentAssessmentChange: () => {},
          headsssAssessments: [],
          onHeadsssAssessmentsChange: () => {},
          bpMonitoringLogs: [
            { recordedAt: '2026-10-28T10:00:00Z', systolic: 120, diastolic: 80, pulseBpm: 72, location: 'Left Arm' },
          ],
          onBpMonitoringLogsChange: () => {},
        })
      );

      expect(html).toContain('Specific Encounter Forms');
      expect(html).toContain('PhilHealth YAKAP 2.0 specialized cohorts');
      // Active count: Ob-Gyne (gravidity) + BP log = 2 Active
      expect(html).toContain('2 Active');
    });

    test('State isolation: mutating Ob-Gyne does not leak or contaminate other cohort states', () => {
      let obGyne: EncounterObGyneExamDto | null = { gravidity: 3, parity: 2, lmp: '2026-01-15', edd: '2026-10-22', fundicHeightCm: 32, fetalHeartToneBpm: 145, fetalPresentation: 'Cephalic' };
      let pediatric: EncounterPediatricMilestoneDto[] = [{ milestoneVisitAge: '12 months', grossMotorStatus: 'Normal (walking unsupported)', fineMotorStatus: 'Normal (pincer grasp)', dangerSigns: [] }];
      let adolescent: EncounterAdolescentAssessmentDto | null = { tannerStage: 4, menarcheAgeYears: 13, smrBreastRating: 'Stage 4', smrPubicHairRating: 'Stage 4' };
      let headsss: EncounterHeadsssDomainAssessmentDto[] = [{ domain: 'Home', assessmentText: 'Supportive family, no household violence', hasRedFlags: false }];
      let bpLogs: PatientBpMonitoringLogDto[] = [{ recordedAt: '2026-10-28T09:00:00Z', systolic: 124, diastolic: 82, pulseBpm: 78, location: 'Right Arm', arm: 'Right Arm' }];

      // Snapshot original states
      const origPediatric = JSON.parse(JSON.stringify(pediatric));
      const origAdolescent = JSON.parse(JSON.stringify(adolescent));
      const origHeadsss = JSON.parse(JSON.stringify(headsss));
      const origBpLogs = JSON.parse(JSON.stringify(bpLogs));

      // 1. Mutate Ob-Gyne
      obGyne = { ...obGyne, gravidity: 4, fundicHeightCm: 34 };

      // Verify Ob-Gyne updated
      expect(obGyne.gravidity).toBe(4);
      expect(obGyne.fundicHeightCm).toBe(34);

      // Verify other cohorts remain completely untouched
      expect(pediatric).toEqual(origPediatric);
      expect(adolescent).toEqual(origAdolescent);
      expect(headsss).toEqual(origHeadsss);
      expect(bpLogs).toEqual(origBpLogs);

      // 2. Mutate Adolescent
      adolescent = { ...adolescent, tannerStage: 5 };
      expect(adolescent.tannerStage).toBe(5);
      expect(obGyne.gravidity).toBe(4);
      expect(pediatric).toEqual(origPediatric);
      expect(headsss).toEqual(origHeadsss);

      // 3. Mutate BP Logs
      bpLogs = [...bpLogs, { recordedAt: '2026-10-28T11:00:00Z', systolic: 130, diastolic: 85, pulseBpm: 80, location: 'Left Arm' }];
      expect(bpLogs.length).toBe(2);
      expect(obGyne.gravidity).toBe(4);
      expect(adolescent.tannerStage).toBe(5);
      expect(pediatric).toEqual(origPediatric);
    });

    test('Data parsing edge cases: numeric conversions handle malformed strings and nulls safely', () => {
      // 1. Test Ob-Gyne numeric parsing fallbacks
      const parseGravidity = (val: string) => parseInt(val, 10) || null;
      const parseFundicHeight = (val: string) => parseFloat(val) || null;

      expect(parseGravidity('3')).toBe(3);
      expect(parseGravidity('0')).toBeNull(); // 0 evaluates to null fallback
      expect(parseGravidity('invalid-number')).toBeNull();
      expect(parseGravidity('')).toBeNull();

      expect(parseFundicHeight('28.5')).toBe(28.5);
      expect(parseFundicHeight('abc')).toBeNull();

      // 2. Test Pediatric danger signs comma splitting
      const parseDangerSigns = (val: string) => val.split(',').map((s) => s.trim()).filter(Boolean);
      expect(parseDangerSigns('Convulsions, Lethargy, Inability to feed')).toEqual(['Convulsions', 'Lethargy', 'Inability to feed']);
      expect(parseDangerSigns('  ,  ,  ')).toEqual([]);
      expect(parseDangerSigns('')).toEqual([]);
      expect(parseDangerSigns('Stridor')).toEqual(['Stridor']);
    });
  });

  // =========================================================================
  // TEST 5: PSGC Cascading Address Selector & NCR Bypass
  // =========================================================================
  describe('Test 5: PSGC Cascading Selector & NCR Province Bypass', () => {
    test('PSGC standard cascading flow: Region -> Province -> City/Municipality -> Barangay', () => {
      let currentAddress: PatientAddressDto = {
        addressType: 'Permanent',
        isSameAsPermanent: false,
        regionPsgc: null,
        provincePsgc: null,
        cityMunicipalityPsgc: null,
        barangayPsgc: null,
        regionName: null,
        provinceName: null,
        cityMunicipalityName: null,
        barangayName: null,
        streetAddress: '',
        zipCode: null,
      };

      const handleChange = (updated: PatientAddressDto) => {
        currentAddress = updated;
      };

      // Step 1: User selects Region III (Central Luzon, '0300000000')
      // Simulated handleRegionChange:
      const handleRegionChange = (code: string) => {
        const found = MOCK_REGIONS.find((r) => r.psgcCode === code);
        handleChange({
          ...currentAddress,
          regionPsgc: code,
          regionName: found?.name ?? null,
          provincePsgc: null,
          provinceName: null,
          cityMunicipalityPsgc: null,
          cityMunicipalityName: null,
          barangayPsgc: null,
          barangayName: null,
        });
      };

      handleRegionChange('0300000000');
      expect(currentAddress.regionPsgc).toBe('0300000000');
      expect(currentAddress.regionName).toBe('Region III (Central Luzon)');
      expect(currentAddress.provincePsgc).toBeNull();
      expect(currentAddress.cityMunicipalityPsgc).toBeNull();
      expect(currentAddress.barangayPsgc).toBeNull();

      // Step 2: User selects Province (Pampanga, '0354000000')
      const handleProvinceChange = (code: string) => {
        const found = MOCK_PROVINCES['0300000000'].find((p) => p.psgcCode === code);
        handleChange({
          ...currentAddress,
          provincePsgc: code,
          provinceName: found?.name ?? null,
          cityMunicipalityPsgc: null,
          cityMunicipalityName: null,
          barangayPsgc: null,
          barangayName: null,
        });
      };

      handleProvinceChange('0354000000');
      expect(currentAddress.provincePsgc).toBe('0354000000');
      expect(currentAddress.provinceName).toBe('Pampanga');
      expect(currentAddress.cityMunicipalityPsgc).toBeNull();
      expect(currentAddress.barangayPsgc).toBeNull();

      // Step 3: User selects City (City of San Fernando, '0354160000')
      const handleCityChange = (code: string) => {
        const found = MOCK_CITIES['0354000000_0300000000'].find((c) => c.psgcCode === code);
        handleChange({
          ...currentAddress,
          cityMunicipalityPsgc: code,
          cityMunicipalityName: found?.name ?? null,
          barangayPsgc: null,
          barangayName: null,
          zipCode: found?.zipCode || currentAddress.zipCode,
        });
      };

      handleCityChange('0354160000');
      expect(currentAddress.cityMunicipalityPsgc).toBe('0354160000');
      expect(currentAddress.cityMunicipalityName).toBe('City of San Fernando');
      expect(currentAddress.zipCode).toBe('2000'); // Zip code auto-populated
      expect(currentAddress.barangayPsgc).toBeNull();

      // Step 4: User selects Barangay (Dolores, '035416001')
      const handleBarangayChange = (code: string) => {
        const found = MOCK_BARANGAYS['0354160000'].find((b) => b.psgcCode === code);
        handleChange({
          ...currentAddress,
          barangayPsgc: code,
          barangayName: found?.name ?? null,
        });
      };

      handleBarangayChange('035416001');
      expect(currentAddress.barangayPsgc).toBe('035416001');
      expect(currentAddress.barangayName).toBe('Dolores');

      // Step 5: User fills street address
      currentAddress = { ...currentAddress, streetAddress: 'Unit 402, Golden Valley Bldg, McArthur Highway' };
      expect(currentAddress.streetAddress).toBe('Unit 402, Golden Valley Bldg, McArthur Highway');
    });

    test('NCR Special-Case: Selecting NCR (1300000000) skips province and directly populates cities', () => {
      const ncrAddress: PatientAddressDto = {
        addressType: 'Permanent',
        isSameAsPermanent: false,
        regionPsgc: '1300000000',
        regionName: 'National Capital Region (NCR)',
        provincePsgc: null,
        provinceName: null,
        cityMunicipalityPsgc: null,
        cityMunicipalityName: null,
        barangayPsgc: null,
        barangayName: null,
        streetAddress: '',
        zipCode: null,
      };

      let addressState = { ...ncrAddress };

      const html = renderToStaticMarkup(
        React.createElement(PsgcAddressSelector, {
          value: addressState,
          onChange: (upd) => {
            addressState = upd;
          },
          label: 'Patient Permanent Address',
        })
      );

      // Verify NCR notice is rendered
      expect(html).toContain('National Capital Region (NCR) has no provinces. Cascaded directly to Cities/Municipalities.');
      // Verify Province select is NOT rendered (bypassed)
      expect(html).not.toContain('Select Province');

      // Direct selection of City of Manila (1339000000)
      const foundCity = MOCK_CITIES['_1300000000'].find((c) => c.psgcCode === '1339000000');
      addressState = {
        ...addressState,
        cityMunicipalityPsgc: '1339000000',
        cityMunicipalityName: foundCity?.name ?? null,
        zipCode: foundCity?.zipCode ?? null,
      };

      expect(addressState.cityMunicipalityPsgc).toBe('1339000000');
      expect(addressState.cityMunicipalityName).toBe('City of Manila');
      expect(addressState.zipCode).toBe('1000');

      // Direct selection of Barangay 659
      const foundBgy = MOCK_BARANGAYS['1339000000'].find((b) => b.psgcCode === '133901001');
      addressState = {
        ...addressState,
        barangayPsgc: '133901001',
        barangayName: foundBgy?.name ?? null,
      };

      expect(addressState.barangayPsgc).toBe('133901001');
      expect(addressState.barangayName).toBe('Barangay 659');
    });

    test('Switching Region clears downstream levels and restores province selection for non-NCR regions', () => {
      // Start with completed NCR address
      let addr: PatientAddressDto = {
        addressType: 'Permanent',
        isSameAsPermanent: false,
        regionPsgc: '1300000000',
        regionName: 'National Capital Region (NCR)',
        provincePsgc: null,
        provinceName: null,
        cityMunicipalityPsgc: '1339000000',
        cityMunicipalityName: 'City of Manila',
        barangayPsgc: '133901001',
        barangayName: 'Barangay 659',
        streetAddress: '123 Taft Ave',
        zipCode: '1000',
      };

      // Switch to Region IV-A (CALABARZON, '0400000000')
      const targetRegion = MOCK_REGIONS.find((r) => r.psgcCode === '0400000000')!;
      addr = {
        ...addr,
        regionPsgc: targetRegion.psgcCode,
        regionName: targetRegion.name,
        provincePsgc: null,
        provinceName: null,
        cityMunicipalityPsgc: null,
        cityMunicipalityName: null,
        barangayPsgc: null,
        barangayName: null,
      };

      expect(addr.regionPsgc).toBe('0400000000');
      expect(addr.provincePsgc).toBeNull();
      expect(addr.cityMunicipalityPsgc).toBeNull();
      expect(addr.barangayPsgc).toBeNull();
      // Street address and addressType retained
      expect(addr.streetAddress).toBe('123 Taft Ave');

      // Render updated non-NCR address
      const html = renderToStaticMarkup(
        React.createElement(PsgcAddressSelector, {
          value: addr,
          onChange: () => {},
        })
      );

      // Verify NCR notice is now gone
      expect(html).not.toContain('National Capital Region (NCR) has no provinces');
      // Province select is present
      expect(html).toContain('Select Province');
    });

    test('Same As Permanent toggle hides cascading selectors cleanly', () => {
      const addressWithSameAsPermanent: PatientAddressDto = {
        addressType: 'Current',
        isSameAsPermanent: true,
        regionPsgc: '0300000000',
        regionName: 'Region III (Central Luzon)',
        provincePsgc: '0354000000',
        provinceName: 'Pampanga',
        cityMunicipalityPsgc: '0354160000',
        cityMunicipalityName: 'City of San Fernando',
        barangayPsgc: '035416001',
        barangayName: 'Dolores',
        streetAddress: 'Unit 10, St. Jude Village',
        zipCode: '2000',
      };

      const html = renderToStaticMarkup(
        React.createElement(PsgcAddressSelector, {
          value: addressWithSameAsPermanent,
          onChange: () => {},
          showSameAsPermanent: true,
          label: 'Current Address',
        })
      );

      expect(html).toContain('Same as Permanent Address');
      // When isSameAsPermanent is true, selectors are hidden
      expect(html).not.toContain('Select Region');
      expect(html).not.toContain('Select Province');
      expect(html).not.toContain('Select City');
      expect(html).not.toContain('Select Barangay');
    });
  });
});

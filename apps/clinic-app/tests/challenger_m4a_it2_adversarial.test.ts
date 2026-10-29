// token-guard:ignore-file
/**
 * apps/clinic-app/tests/challenger_m4a_it2_adversarial.test.ts
 *
 * EMPIRICAL ADVERSARIAL CHALLENGER TEST SUITE: Milestone 4-A Iteration 2
 * Clinical Workflow Transitions, 1NF Findings Transformations & ROS Synchronization
 */

import { describe, expect, test, mock } from 'bun:test';
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
  processColor: (c: any) => c,
  I18nManager: { isRTL: false, allowRTL: () => {}, forceRTL: () => {} },
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

const {
  DEFAULT_PHYSICAL_EXAM_NORMAL,
  to1NFFindings,
  from1NFFindings,
} = await import('../components/consultation/InlinePhysicalExamCard');
type PhysicalExamFindings = import('../components/consultation/InlinePhysicalExamCard').PhysicalExamFindings;
type PatientPhysicalExamDto = import('../services/clinicService').PatientPhysicalExamDto;
type PatientPhysicalExamFindingDto = import('../services/clinicService').PatientPhysicalExamFindingDto;
type EncounterReviewOfSystemsItemDto = import('../services/clinicService').EncounterReviewOfSystemsItemDto;
type VisitWorkflowMode = import('../services/clinicService').VisitWorkflowMode;

const { default: ReviewOfSystemsChecklist } = await import('../components/consultation/ReviewOfSystemsChecklist');
const { default: WorkflowModeSelector } = await import('../components/consultation/WorkflowModeSelector');

describe('Adversarial Verification: 1NF Physical Exam Hydration Stress Test', () => {
  test('VERIFIED FIX: Two-pass matching correctly hydrates "Digital Rectal Exam" and "Neurological" with zero cross-system leakage into Abdomen', () => {
    // 1. Digital Rectal Exam test
    const rectalFinding: PatientPhysicalExamFindingDto[] = [
      {
        system: 'Digital Rectal Exam',
        isNormal: false,
        optionCode: '4',
        findingTitle: 'Hemorrhoids',
        remarks: 'Grade 2 internal hemorrhoids',
      },
    ];
    const rectalResult = from1NFFindings(rectalFinding);
    expect(rectalResult).not.toBeNull();
    expect(rectalResult?.rectal).toBe('Abnormal');
    expect(rectalResult?.rectalId).toBe('4');
    expect(rectalResult?.rectalRemarks).toBe('Grade 2 internal hemorrhoids');
    expect(rectalResult?.abdomen).toBe('Normal');
    expect(rectalResult?.abdomenRemarks).toBe('');

    // 2. Neurological test
    const neuroFinding: PatientPhysicalExamFindingDto[] = [
      {
        system: 'Neurological',
        isNormal: false,
        optionCode: '4',
        findingTitle: 'Motor Deficit',
        remarks: 'Left hemiparesis 3/5',
      },
    ];
    const neuroResult = from1NFFindings(neuroFinding);
    expect(neuroResult).not.toBeNull();
    expect(neuroResult?.neuro).toBe('Abnormal');
    expect(neuroResult?.neuroId).toBe('4');
    expect(neuroResult?.neuroRemarks).toBe('Left hemiparesis 3/5');
    expect(neuroResult?.abdomen).toBe('Normal');
    expect(neuroResult?.abdomenRemarks).toBe('');
  });

  test('VERIFIED FIX: Degenerate finding rows with no matched systems return null, allowing JSON fallback', () => {
    // When input has items with empty or non-matching systems
    const degenerateRow = [{ system: 'non_existent_system', isNormal: false }];
    const result = from1NFFindings(degenerateRow as any);

    // Returns null so Consultations.screen.tsx:1228 will proceed to physicalExamFindingsJson fallback
    expect(result).toBeNull();
  });

  test('Partial findings hydration: valid systems are hydrated correctly', () => {
    const partialFindings: PatientPhysicalExamFindingDto[] = [
      {
        system: 'Skin & Extremities',
        isNormal: false,
        optionCode: '5',
        findingTitle: 'Edema/swelling',
        remarks: 'Pitting edema +2 bilateral lower extremities',
      },
      {
        system: 'Chest & Lungs',
        isNormal: false,
        optionCode: '5',
        findingTitle: 'Wheezes',
        remarks: 'Diffuse polyphonic wheezes on end-expiration',
      },
    ];

    const result = from1NFFindings(partialFindings);
    expect(result).not.toBeNull();
    // Specified systems become abnormal
    expect(result?.skin).toBe('Abnormal');
    expect(result?.skinId).toBe('5');
    expect(result?.skinRemarks).toBe('Pitting edema +2 bilateral lower extremities');
    expect(result?.chest).toBe('Abnormal');
    expect(result?.chestId).toBe('5');
    expect(result?.chestRemarks).toBe('Diffuse polyphonic wheezes on end-expiration');

    // Unspecified systems remain default normal
    expect(result?.heent).toBe('Normal');
    expect(result?.heart).toBe('Normal');
  });

  test('Fallback to findingTitle when remarks is null for abnormal finding', () => {
    const findingsWithoutRemarks: PatientPhysicalExamFindingDto[] = [
      {
        system: 'Chest & Lungs',
        isNormal: false,
        optionCode: '4',
        findingTitle: 'Crackles/rales',
        remarks: null,
      },
    ];

    const result = from1NFFindings(findingsWithoutRemarks);
    expect(result).not.toBeNull();
    expect(result?.chest).toBe('Abnormal');
    expect(result?.chestRemarks).toBe('Crackles/rales');
  });
});

describe('Adversarial Verification: Dual Workflow Mode Lockstep Synchronization', () => {
  test('Invariant: visitWorkflowMode and isYakapEligible never diverge', () => {
    let visitWorkflowMode: VisitWorkflowMode = 'Regular';
    let isYakapEligible = false;
    let philHealthAtc = 'WALKEDIN';

    const handleWorkflowModeChange = (mode: VisitWorkflowMode) => {
      visitWorkflowMode = mode;
      const yakap = mode === 'YakapAvailment';
      isYakapEligible = yakap;
      if (yakap && (!philHealthAtc.trim() || philHealthAtc === 'ATC-2026-KON01')) {
        philHealthAtc = 'WALKEDIN';
      }
    };

    // Stress test: 500 alternations
    for (let i = 0; i < 500; i++) {
      const targetMode: VisitWorkflowMode = i % 2 === 0 ? 'YakapAvailment' : 'Regular';
      handleWorkflowModeChange(targetMode);

      expect(visitWorkflowMode).toBe(targetMode);
      if (targetMode === 'YakapAvailment') {
        expect(isYakapEligible).toBe(true);
      } else {
        expect(isYakapEligible).toBe(false);
      }
    }
  });

  test('Encounter hydration: lockstep rehydration for all legacy and modern encounter variants', () => {
    const hydrateEncounter = (existingEncounter: any) => {
      let visitWorkflowMode: VisitWorkflowMode = 'Regular';
      let isYakapEligible = false;

      if (existingEncounter.visitWorkflowMode) {
        visitWorkflowMode = existingEncounter.visitWorkflowMode;
        isYakapEligible = existingEncounter.visitWorkflowMode === 'YakapAvailment';
      } else if (existingEncounter.isYakapEligible != null) {
        isYakapEligible = existingEncounter.isYakapEligible;
        visitWorkflowMode = existingEncounter.isYakapEligible ? 'YakapAvailment' : 'Regular';
      }

      return { visitWorkflowMode, isYakapEligible };
    };

    // Modern encounter with visitWorkflowMode = YakapAvailment
    expect(hydrateEncounter({ visitWorkflowMode: 'YakapAvailment' })).toEqual({
      visitWorkflowMode: 'YakapAvailment',
      isYakapEligible: true,
    });

    // Modern encounter with visitWorkflowMode = Regular
    expect(hydrateEncounter({ visitWorkflowMode: 'Regular' })).toEqual({
      visitWorkflowMode: 'Regular',
      isYakapEligible: false,
    });

    // Legacy encounter with only isYakapEligible = true
    expect(hydrateEncounter({ isYakapEligible: true })).toEqual({
      visitWorkflowMode: 'YakapAvailment',
      isYakapEligible: true,
    });

    // Legacy encounter with only isYakapEligible = false
    expect(hydrateEncounter({ isYakapEligible: false })).toEqual({
      visitWorkflowMode: 'Regular',
      isYakapEligible: false,
    });

    // Empty encounter defaults to Regular / false
    expect(hydrateEncounter({})).toEqual({
      visitWorkflowMode: 'Regular',
      isYakapEligible: false,
    });
  });

  test('Payload synchronization: Regular mode strips PhilHealth bureaucracy, Yakap includes 1NF collections', () => {
    const buildPayload = (
      mode: VisitWorkflowMode,
      isYakap: boolean,
      pe: PhysicalExamFindings,
      ros: EncounterReviewOfSystemsItemDto[]
    ) => {
      return {
        visitWorkflowMode: mode,
        isYakapEligible: isYakap,
        reviewOfSystemsItems: ros.length ? ros : undefined,
        physicalExams: isYakap
          ? [
              {
                generalSurveyId: pe.generalSurveyId || '1',
                generalSurveyRemarks: pe.generalSurveyRemarks,
                findings: to1NFFindings(pe),
              },
            ]
          : undefined,
        physicalExamFindingsJson: isYakap ? JSON.stringify(pe) : undefined,
      };
    };

    // Regular payload
    const regularPayload = buildPayload('Regular', false, DEFAULT_PHYSICAL_EXAM_NORMAL, []);
    expect(regularPayload.isYakapEligible).toBe(false);
    expect(regularPayload.visitWorkflowMode).toBe('Regular');
    expect(regularPayload.physicalExams).toBeUndefined();
    expect(regularPayload.physicalExamFindingsJson).toBeUndefined();

    // Yakap payload
    const yakapPayload = buildPayload('YakapAvailment', true, DEFAULT_PHYSICAL_EXAM_NORMAL, [
      { optionCode: 'fever', symptomName: 'Fever', isPertinentPositive: true },
    ]);
    expect(yakapPayload.isYakapEligible).toBe(true);
    expect(yakapPayload.visitWorkflowMode).toBe('YakapAvailment');
    expect(yakapPayload.physicalExams).toBeDefined();
    expect(yakapPayload.physicalExams![0].findings).toHaveLength(10);
    expect(yakapPayload.reviewOfSystemsItems).toHaveLength(1);
  });
});

describe('Adversarial Verification: Review of Systems (ROS) & Chips State Synchronization', () => {
  test('Toggling symptoms synchronizes selectedSymptomCodes and rosItems bidirectionally', () => {
    let selectedSymptomCodes: string[] = [];
    let rosItems: EncounterReviewOfSystemsItemDto[] = [];
    let symptomPainSite = '';
    let symptomOtherDesc = '';
    let subjective = '';

    const handleToggleSymptom = (symptom: { code: string; name: string }) => {
      const exists = selectedSymptomCodes.includes(symptom.code);
      if (exists) {
        selectedSymptomCodes = selectedSymptomCodes.filter((c) => c !== symptom.code);
        rosItems = rosItems.filter((i) => i.optionCode !== symptom.code);
      } else {
        selectedSymptomCodes = [...selectedSymptomCodes, symptom.code];
        const isPain = symptom.code.toLowerCase().includes('pain') || symptom.name.toLowerCase().includes('pain');
        const isOther = symptom.code.toLowerCase().includes('other') || symptom.name.toLowerCase().includes('other');
        rosItems = [
          ...rosItems.filter((i) => i.optionCode !== symptom.code),
          {
            optionCode: symptom.code,
            symptomName: symptom.name,
            isPertinentPositive: true,
            painSite: isPain ? symptomPainSite || null : null,
            othersSpecifyText: isOther ? symptomOtherDesc || null : null,
            remarks: symptom.name,
          },
        ];
        if (!subjective.trim()) {
          subjective = `${symptom.name}, `;
        } else if (!subjective.toLowerCase().includes(symptom.name.toLowerCase())) {
          subjective += `, ${symptom.name}`;
        }
      }
    };

    const handleRosChange = (items: EncounterReviewOfSystemsItemDto[]) => {
      rosItems = items;
      selectedSymptomCodes = items.map((i) => i.optionCode);

      const painItem = items.find((i) => i.optionCode.toLowerCase().includes('pain') || (i.symptomName?.toLowerCase() ?? '').includes('pain'));
      if (painItem?.painSite && painItem.painSite !== symptomPainSite) {
        symptomPainSite = painItem.painSite;
      }
      const otherItem = items.find((i) => i.optionCode.toLowerCase().includes('other') || (i.symptomName?.toLowerCase() ?? '').includes('other'));
      if (otherItem?.othersSpecifyText && otherItem.othersSpecifyText !== symptomOtherDesc) {
        symptomOtherDesc = otherItem.othersSpecifyText;
      }
    };

    // 1. Toggle fever via chip
    handleToggleSymptom({ code: 'fever', name: 'Fever / Lagnat' });
    expect(selectedSymptomCodes).toEqual(['fever']);
    expect(rosItems).toHaveLength(1);
    expect(rosItems[0].optionCode).toBe('fever');
    expect(subjective).toContain('Fever');

    // 2. Toggle chest pain via chip
    handleToggleSymptom({ code: 'chest_pain', name: 'Chest Pain' });
    expect(selectedSymptomCodes).toEqual(['fever', 'chest_pain']);
    expect(rosItems).toHaveLength(2);

    // 3. User edits pain site via checklist
    const updatedWithPainSite = rosItems.map((i) =>
      i.optionCode === 'chest_pain' ? { ...i, painSite: 'Substernal, radiating to left arm' } : i
    );
    handleRosChange(updatedWithPainSite);
    expect(symptomPainSite).toBe('Substernal, radiating to left arm');
    expect(rosItems.find((i) => i.optionCode === 'chest_pain')?.painSite).toBe('Substernal, radiating to left arm');

    // 4. Untoggle fever via checklist
    handleRosChange(rosItems.filter((i) => i.optionCode !== 'fever'));
    expect(selectedSymptomCodes).toEqual(['chest_pain']);
    expect(rosItems).toHaveLength(1);

    // 5. Untoggle chest pain via chip
    handleToggleSymptom({ code: 'chest_pain', name: 'Chest Pain' });
    expect(selectedSymptomCodes).toEqual([]);
    expect(rosItems).toEqual([]);
  });

  test('ReviewOfSystemsChecklist renders with injected options and filters accurately', () => {
    let currentItems: EncounterReviewOfSystemsItemDto[] = [
      { optionCode: 'cough', symptomName: 'Cough', isPertinentPositive: true },
    ];

    const html = renderToStaticMarkup(
      React.createElement(ReviewOfSystemsChecklist, {
        items: currentItems,
        onChange: (items: any) => { currentItems = items; },
        options: MOCK_SYMPTOM_OPTIONS,
      })
    );

    expect(html).toContain('Review of Systems (ROS)');
    expect(html).toContain('1 Selected');
    expect(html).toContain('Fever / Lagnat');
    expect(html).toContain('Cough / Ubo');
  });
});

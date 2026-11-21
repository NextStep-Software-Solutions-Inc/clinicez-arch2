// token-guard:ignore-file
/**
 * apps/clinic-app/tests/challenger_m4a_it3_adversarial.test.ts
 *
 * EMPIRICAL ADVERSARIAL CHALLENGER TEST SUITE: Milestone 4-A Iteration 3
 * Clinical 1NF Hydration & Substring Collision Challenger
 *
 * Objectives:
 * 1. Verify two-pass matching across all 10 exam systems in complete isolation.
 * 2. Verify ZERO cross-system finding leakage (specifically Abdomen isolation).
 * 3. Verify degenerate and boundary input handling (null, empty, unrecognized, mixed rows).
 * 4. Verify fallback preservation contract (null return when 0 systems matched and generalSurveyId absent).
 * 5. Verify 10-system simultaneous abnormal hydration and roundtrip idempotency.
 */

import { describe, expect, test, mock } from 'bun:test';
import React from 'react';

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


const {
  DEFAULT_PHYSICAL_EXAM_NORMAL,
  to1NFFindings,
  from1NFFindings,
} = await import('../components/consultation/InlinePhysicalExamCard');

type PhysicalExamFindings = import('../components/consultation/InlinePhysicalExamCard').PhysicalExamFindings;
type PatientPhysicalExamDto = import('../services/clinicService').PatientPhysicalExamDto;
type PatientPhysicalExamFindingDto = import('../services/clinicService').PatientPhysicalExamFindingDto;

const ALL_10_SYSTEMS = [
  { key: 'generalSurvey', label: 'General Survey', codeKey: 'generalSurveyId', remarksKey: 'generalSurveyRemarks', testCode: '2', testRemarks: 'Lethargic, in moderate respiratory distress' },
  { key: 'skin', label: 'Skin & Extremities', codeKey: 'skinId', remarksKey: 'skinRemarks', testCode: '9', testRemarks: 'Maculopapular rash on bilateral arms' },
  { key: 'heent', label: 'HEENT', codeKey: 'heentId', remarksKey: 'heentRemarks', testCode: '15', testRemarks: 'Icteric sclerae, dry buccal mucosa' },
  { key: 'chest', label: 'Chest & Lungs', codeKey: 'chestId', remarksKey: 'chestRemarks', testCode: '5', testRemarks: 'Bilateral expiratory wheezing' },
  { key: 'heart', label: 'Heart & CVS', codeKey: 'heartId', remarksKey: 'heartRemarks', testCode: '4', testRemarks: 'Grade 3/6 systolic murmur at left sternal border' },
  { key: 'abdomen', label: 'Abdomen', codeKey: 'abdomenId', remarksKey: 'abdomenRemarks', testCode: '9', testRemarks: 'Direct tenderness in right lower quadrant with guarding' },
  { key: 'neuro', label: 'Neurological', codeKey: 'neuroId', remarksKey: 'neuroRemarks', testCode: '4', testRemarks: 'Left upper and lower extremity hemiparesis 3/5' },
  { key: 'rectal', label: 'Digital Rectal Exam', codeKey: 'rectalId', remarksKey: 'rectalRemarks', testCode: '4', testRemarks: 'Grade 2 internal hemorrhoids, trace blood on glove' },
  { key: 'gu', label: 'Genitourinary', codeKey: 'guId', remarksKey: 'guRemarks', testCode: '4', testRemarks: 'Purulent urethral discharge with mild dysuria' },
  { key: 'musculoskeletal', label: 'Musculoskeletal', codeKey: 'musculoskeletalId', remarksKey: 'musculoskeletalRemarks', testCode: '99', testRemarks: 'Right knee joint effusion and decreased range of motion' },
] as const;

describe('Adversarial Challenge: Complete 10-System Isolation & Zero Leakage', () => {
  for (const sys of ALL_10_SYSTEMS) {
    test(`System Isolation: Finding for "${sys.label}" (${sys.key}) hydrates into ${sys.key} and NEVER leaks into any other system`, () => {
      const singleFinding: PatientPhysicalExamFindingDto[] = [
        {
          system: sys.label,
          isNormal: false,
          optionCode: sys.testCode,
          findingTitle: sys.testRemarks,
          remarks: sys.testRemarks,
        },
      ];

      const hydrated = from1NFFindings(singleFinding);
      expect(hydrated).not.toBeNull();
      if (!hydrated) return;

      // The target system MUST be Abnormal with matching code and remarks
      expect(hydrated[sys.key as keyof PhysicalExamFindings]).toBe('Abnormal');
      expect(hydrated[sys.codeKey as keyof PhysicalExamFindings]).toBe(sys.testCode);
      expect(hydrated[sys.remarksKey as keyof PhysicalExamFindings]).toBe(sys.testRemarks);

      // CRITICAL INVARIANT: ALL OTHER 9 systems MUST remain strictly 'Normal', with empty remarks
      for (const other of ALL_10_SYSTEMS) {
        if (other.key === sys.key) continue;

        expect(hydrated[other.key as keyof PhysicalExamFindings]).toBe('Normal');
        expect(hydrated[other.remarksKey as keyof PhysicalExamFindings]).toBe('');
        // Ensure default normal ID is maintained
        expect(hydrated[other.codeKey as keyof PhysicalExamFindings]).toBe(DEFAULT_PHYSICAL_EXAM_NORMAL[other.codeKey as keyof PhysicalExamFindings]);
      }

      // Explicit assertion: If target system is NOT abdomen, abdomen MUST be completely untouched!
      if (sys.key !== 'abdomen') {
        expect(hydrated.abdomen).toBe('Normal');
        expect(hydrated.abdomenRemarks).toBe('');
        expect(hydrated.abdomenId).toBe(DEFAULT_PHYSICAL_EXAM_NORMAL.abdomenId);
      }
    });
  }
});

describe('Adversarial Challenge: Substring Collision & Pass 2 Fuzzy Heuristic Stress Test', () => {
  const SUBSTRING_ADVERSARIAL_CASES: Array<{
    inputSystem: string;
    expectedKey: keyof PhysicalExamFindings;
    expectedCodeKey: keyof PhysicalExamFindings;
    expectedRemarksKey: keyof PhysicalExamFindings;
    description: string;
  }> = [
    {
      inputSystem: 'Digital Rectal',
      expectedKey: 'rectal',
      expectedCodeKey: 'rectalId',
      expectedRemarksKey: 'rectalRemarks',
      description: 'Contains "gi" (digital) -> MUST resolve to rectal, NEVER abdomen',
    },
    {
      inputSystem: 'digital_rectal_exam',
      expectedKey: 'rectal',
      expectedCodeKey: 'rectalId',
      expectedRemarksKey: 'rectalRemarks',
      description: 'Snake case digital rectal exam -> resolves to rectal',
    },
    {
      inputSystem: 'DRE',
      expectedKey: 'rectal',
      expectedCodeKey: 'rectalId',
      expectedRemarksKey: 'rectalRemarks',
      description: 'Abbreviation DRE -> resolves to rectal',
    },
    {
      inputSystem: 'Neurological',
      expectedKey: 'neuro',
      expectedCodeKey: 'neuroId',
      expectedRemarksKey: 'neuroRemarks',
      description: 'Contains "gi" (neurological) -> MUST resolve to neuro, NEVER abdomen',
    },
    {
      inputSystem: 'neuro_cns',
      expectedKey: 'neuro',
      expectedCodeKey: 'neuroId',
      expectedRemarksKey: 'neuroRemarks',
      description: 'Includes "cns" -> resolves to neuro',
    },
    {
      inputSystem: 'Gastrointestinal',
      expectedKey: 'abdomen',
      expectedCodeKey: 'abdomenId',
      expectedRemarksKey: 'abdomenRemarks',
      description: 'Includes "gastro" -> safely resolves to abdomen',
    },
    {
      inputSystem: 'GI',
      expectedKey: 'abdomen',
      expectedCodeKey: 'abdomenId',
      expectedRemarksKey: 'abdomenRemarks',
      description: 'Exact normalized "gi" -> safely resolves to abdomen',
    },
    {
      inputSystem: 'GITRACT',
      expectedKey: 'abdomen',
      expectedCodeKey: 'abdomenId',
      expectedRemarksKey: 'abdomenRemarks',
      description: 'Exact normalized "gitract" -> safely resolves to abdomen',
    },
    {
      inputSystem: 'Abdominal Wall',
      expectedKey: 'abdomen',
      expectedCodeKey: 'abdomenId',
      expectedRemarksKey: 'abdomenRemarks',
      description: 'Includes "abdo" -> safely resolves to abdomen',
    },
    {
      inputSystem: 'Pulmonary / Respiratory',
      expectedKey: 'chest',
      expectedCodeKey: 'chestId',
      expectedRemarksKey: 'chestRemarks',
      description: 'Includes "pulmo" and "respirat" -> resolves to chest',
    },
    {
      inputSystem: 'Lungs',
      expectedKey: 'chest',
      expectedCodeKey: 'chestId',
      expectedRemarksKey: 'chestRemarks',
      description: 'Includes "lung" -> resolves to chest',
    },
    {
      inputSystem: 'Cardiovascular (CVS)',
      expectedKey: 'heart',
      expectedCodeKey: 'heartId',
      expectedRemarksKey: 'heartRemarks',
      description: 'Includes "cvs" and "cardio" -> resolves to heart',
    },
    {
      inputSystem: 'Skin and Extremities',
      expectedKey: 'skin',
      expectedCodeKey: 'skinId',
      expectedRemarksKey: 'skinRemarks',
      description: 'Includes "extremit" and "skin" -> resolves to skin',
    },
    {
      inputSystem: 'Genitourinary System',
      expectedKey: 'gu',
      expectedCodeKey: 'guId',
      expectedRemarksKey: 'guRemarks',
      description: 'Includes "genito" -> resolves to gu',
    },
    {
      inputSystem: 'GU',
      expectedKey: 'gu',
      expectedCodeKey: 'guId',
      expectedRemarksKey: 'guRemarks',
      description: 'Exact normalized "gu" -> resolves to gu',
    },
    {
      inputSystem: 'Musculoskeletal (MSK)',
      expectedKey: 'musculoskeletal',
      expectedCodeKey: 'musculoskeletalId',
      expectedRemarksKey: 'musculoskeletalRemarks',
      description: 'Includes "msk" and "musculo" -> resolves to musculoskeletal',
    },
    {
      inputSystem: 'Head, Eyes, Ears, Nose, Throat (HEENT)',
      expectedKey: 'heent',
      expectedCodeKey: 'heentId',
      expectedRemarksKey: 'heentRemarks',
      description: 'Includes "heent", "head", "eye" -> resolves to heent',
    },
    {
      inputSystem: 'General Survey Assessment',
      expectedKey: 'generalSurvey',
      expectedCodeKey: 'generalSurveyId',
      expectedRemarksKey: 'generalSurveyRemarks',
      description: 'Includes "general" and "survey" -> resolves to generalSurvey',
    },
  ];

  for (const item of SUBSTRING_ADVERSARIAL_CASES) {
    test(`Fuzzy / Substring Match: "${item.inputSystem}" -> ${String(item.expectedKey)} (${item.description})`, () => {
      const finding: PatientPhysicalExamFindingDto[] = [
        {
          system: item.inputSystem,
          isNormal: false,
          optionCode: '99',
          findingTitle: `Abnormal finding in ${item.inputSystem}`,
          remarks: `Clinician note for ${item.inputSystem}`,
        },
      ];

      const res = from1NFFindings(finding);
      expect(res).not.toBeNull();
      if (!res) return;

      expect(res[item.expectedKey]).toBe('Abnormal');
      expect(res[item.expectedRemarksKey]).toBe(`Clinician note for ${item.inputSystem}`);
      expect(res[item.expectedCodeKey]).toBe('99');

      // Verify abdomen isolation for non-abdomen target
      if (item.expectedKey !== 'abdomen') {
        expect(res.abdomen).toBe('Normal');
        expect(res.abdomenRemarks).toBe('');
      }
    });
  }
});

describe('Adversarial Challenge: Degenerate, Empty, and Malformed Input Boundary Tests', () => {
  test('Null, undefined, and empty array inputs return null', () => {
    expect(from1NFFindings(null)).toBeNull();
    expect(from1NFFindings(undefined)).toBeNull();
    expect(from1NFFindings([])).toBeNull();
  });

  test('Single unrecognized system row [{ system: "unrecognized_system" }] returns null', () => {
    const input = [{ system: 'unrecognized_system', isNormal: false }];
    const res = from1NFFindings(input as any);
    expect(res).toBeNull();
  });

  test('Multiple unrecognized rows return null', () => {
    const input = [
      { system: 'unknown_system_1', isNormal: false },
      { system: 'non_existent_2', isNormal: true },
      { system: 'gibberish_123', isNormal: false },
    ];
    const res = from1NFFindings(input as any);
    expect(res).toBeNull();
  });

  test('Empty string or whitespace-only system rows return null', () => {
    const input = [
      { system: '', isNormal: false },
      { system: '   ', isNormal: false },
      { system: '---***---', isNormal: false }, // normalizes to empty string ""
    ];
    const res = from1NFFindings(input as any);
    expect(res).toBeNull();
  });

  test('Object without findings or system property returns null', () => {
    const input = [{ someRandomProp: 123 }];
    const res = from1NFFindings(input as any);
    expect(res).toBeNull();
  });

  test('Mixed valid and invalid rows: valid system hydrates successfully while unrecognized rows are safely ignored', () => {
    const input: PatientPhysicalExamFindingDto[] = [
      { system: 'unrecognized_garbage_row', isNormal: false, remarks: 'Should not appear' },
      {
        system: 'Abdomen',
        isNormal: false,
        optionCode: '9',
        findingTitle: 'Abdominal tenderness',
        remarks: 'Direct tenderness over epigastrium',
      },
      { system: 'another_bogus_system', isNormal: false, remarks: 'Ignore me' },
    ];

    const res = from1NFFindings(input);
    expect(res).not.toBeNull();
    if (!res) return;

    // Abdomen is correctly hydrated
    expect(res.abdomen).toBe('Abnormal');
    expect(res.abdomenId).toBe('9');
    expect(res.abdomenRemarks).toBe('Direct tenderness over epigastrium');

    // All other 9 systems remain normal
    expect(res.chest).toBe('Normal');
    expect(res.heart).toBe('Normal');
    expect(res.neuro).toBe('Normal');
    expect(res.rectal).toBe('Normal');
    expect(res.skin).toBe('Normal');
    expect(res.heent).toBe('Normal');
    expect(res.gu).toBe('Normal');
    expect(res.musculoskeletal).toBe('Normal');
    expect(res.generalSurvey).toBe('Normal');
  });

  test('Nested PatientPhysicalExamDto: empty findings with present generalSurveyId hydrates generalSurvey', () => {
    // Normal general survey
    const peNormal: PatientPhysicalExamDto = {
      generalSurveyId: '1',
      generalSurveyRemarks: 'Alert and oriented',
      findings: [],
    };
    const resNormal = from1NFFindings([peNormal]);
    expect(resNormal).not.toBeNull();
    expect(resNormal?.generalSurveyId).toBe('1');
    expect(resNormal?.generalSurveyRemarks).toBe('Alert and oriented');
    expect(resNormal?.generalSurvey).toBe('Normal');

    // Abnormal general survey (code '2')
    const peAbnormal: PatientPhysicalExamDto = {
      generalSurveyId: '2',
      generalSurveyRemarks: 'Lethargic, in severe respiratory distress',
      findings: [],
    };
    const resAbnormal = from1NFFindings([peAbnormal]);
    expect(resAbnormal).not.toBeNull();
    expect(resAbnormal?.generalSurveyId).toBe('2');
    expect(resAbnormal?.generalSurveyRemarks).toBe('Lethargic, in severe respiratory distress');
    expect(resAbnormal?.generalSurvey).toBe('Abnormal');

    // Abnormal general survey (code '99')
    const peOther: PatientPhysicalExamDto = {
      generalSurveyId: '99',
      generalSurveyRemarks: 'Comatose, GCS 7',
      findings: [],
    };
    const resOther = from1NFFindings([peOther]);
    expect(resOther).not.toBeNull();
    expect(resOther?.generalSurveyId).toBe('99');
    expect(resOther?.generalSurveyRemarks).toBe('Comatose, GCS 7');
    expect(resOther?.generalSurvey).toBe('Abnormal');
  });

  test('Nested PatientPhysicalExamDto: empty findings with whitespace or absent generalSurveyId returns null', () => {
    // generalSurveyId is undefined
    const peEmptyId: PatientPhysicalExamDto = {
      findings: [],
    };
    expect(from1NFFindings([peEmptyId])).toBeNull();

    // generalSurveyId is whitespace only
    const peWhitespaceId: PatientPhysicalExamDto = {
      generalSurveyId: '   ',
      findings: [],
    };
    expect(from1NFFindings([peWhitespaceId])).toBeNull();

    // generalSurveyId is empty and findings contains only degenerate rows
    const peDegenerate: PatientPhysicalExamDto = {
      generalSurveyId: '',
      findings: [{ system: 'unrecognized_sys', isNormal: false }],
    };
    expect(from1NFFindings([peDegenerate])).toBeNull();
  });
});

describe('Adversarial Challenge: Simultaneous 10-System Abnormal Roundtrip & Idempotency', () => {
  test('Simultaneous 10-system abnormal hydration: all 10 systems retain distinct pathology with zero cross-talk', () => {
    const inputFindings: PatientPhysicalExamFindingDto[] = ALL_10_SYSTEMS.map((s) => ({
      system: s.label,
      isNormal: false,
      optionCode: s.testCode,
      findingTitle: s.testRemarks,
      remarks: s.testRemarks,
    }));

    const result = from1NFFindings(inputFindings);
    expect(result).not.toBeNull();
    if (!result) return;

    for (const s of ALL_10_SYSTEMS) {
      expect(result[s.key as keyof PhysicalExamFindings]).toBe('Abnormal');
      expect(result[s.codeKey as keyof PhysicalExamFindings]).toBe(s.testCode);
      expect(result[s.remarksKey as keyof PhysicalExamFindings]).toBe(s.testRemarks);
    }
  });

  test('Roundtrip idempotency: PhysicalExamFindings -> to1NFFindings -> from1NFFindings -> to1NFFindings preserves all systems', () => {
    const initialFormState: PhysicalExamFindings = {
      generalSurvey: 'Abnormal',
      generalSurveyId: '2',
      generalSurveyRemarks: 'Patient in acute distress, diaphoresis',
      skin: 'Abnormal',
      skinId: '9',
      skinRemarks: 'Diffuse petechial rash over trunk',
      heent: 'Abnormal',
      heentId: '15',
      heentRemarks: 'Deep scleral icterus',
      chest: 'Abnormal',
      chestId: '4',
      chestRemarks: 'Coarse bibasilar crackles',
      heart: 'Abnormal',
      heartId: '7',
      heartRemarks: 'Irregularly irregular rhythm, heart rate 130 bpm',
      abdomen: 'Abnormal',
      abdomenId: '9',
      abdomenRemarks: 'Marked tenderness in RUQ, positive Murphy sign',
      neuro: 'Abnormal',
      neuroId: '4',
      neuroRemarks: 'Right facial droop and right hemiplegia',
      rectal: 'Abnormal',
      rectalId: '4',
      rectalRemarks: 'Large thrombosed external hemorrhoid at 3 oclock',
      gu: 'Abnormal',
      guId: '4',
      guRemarks: 'Gross hematuria in Foley bag',
      musculoskeletal: 'Abnormal',
      musculoskeletalId: '6',
      musculoskeletalRemarks: 'Swollen warm right first MTP joint',
    };

    // Step 1: to 1NF
    const oneNF_1 = to1NFFindings(initialFormState);
    expect(oneNF_1).toHaveLength(10);

    // Step 2: back from 1NF
    const reconstructed = from1NFFindings(oneNF_1);
    expect(reconstructed).not.toBeNull();
    if (!reconstructed) return;

    // Verify all 10 systems match initialFormState exactly
    for (const s of ALL_10_SYSTEMS) {
      expect(reconstructed[s.key as keyof PhysicalExamFindings]).toBe('Abnormal');
      expect(reconstructed[s.codeKey as keyof PhysicalExamFindings]).toBe(initialFormState[s.codeKey as keyof PhysicalExamFindings]);
      expect(reconstructed[s.remarksKey as keyof PhysicalExamFindings]).toBe(initialFormState[s.remarksKey as keyof PhysicalExamFindings]);
    }

    // Step 3: to 1NF again
    const oneNF_2 = to1NFFindings(reconstructed);
    expect(oneNF_2).toHaveLength(10);

    // Verify byte-for-byte property equality between oneNF_1 and oneNF_2
    for (let i = 0; i < 10; i++) {
      expect(oneNF_2[i].system).toBe(oneNF_1[i].system);
      expect(oneNF_2[i].isNormal).toBe(oneNF_1[i].isNormal);
      expect(oneNF_2[i].optionCode).toBe(oneNF_1[i].optionCode);
      expect(oneNF_2[i].remarks).toBe(oneNF_1[i].remarks);
    }
  });
});

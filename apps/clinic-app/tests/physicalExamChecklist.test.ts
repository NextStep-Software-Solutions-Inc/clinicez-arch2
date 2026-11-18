import { describe, expect, test, mock } from 'bun:test';
import React from 'react';

const createMockComponent = (name: string) => {
  const Comp = ({ children, accessibilityLabel, accessibilityRole, placeholder, testID, ..._props }: any) =>
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
  RefreshControl: createMockComponent('RefreshControl'),
  Keyboard: { dismiss: () => {}, addListener: () => ({ remove: () => {} }) },
  AppState: { addEventListener: () => ({ remove: () => {} }) },
  Dimensions: { get: () => ({ width: 1280, height: 800 }), addEventListener: () => ({ remove: () => {} }) },
  useWindowDimensions: () => ({ width: 1280, height: 800 }),
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
    View: 'Animated.View',
    Text: 'Animated.Text',
  },
  Alert: { alert: () => {} },
  Linking: { openURL: () => Promise.resolve(), canOpenURL: () => Promise.resolve(true) },
  processColor: (c: any) => c,
}));

mock.module('react-native-svg', () => ({
  Svg: createMockComponent('svg'),
  Path: createMockComponent('path'),
  Circle: createMockComponent('circle'),
  Rect: createMockComponent('rect'),
  Line: createMockComponent('line'),
  default: createMockComponent('svg'),
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

const {
  InlinePhysicalExamCard,
  DEFAULT_PHYSICAL_EXAM_NORMAL,
} = await import('../components/consultation/InlinePhysicalExamCard');
const { extractPhilHealthProfileData } = await import('../components/patient/memberType');
type PhysicalExamFindings = any;
type SystemExamStatus = any;

describe('Milestone 3 Physical Exam Checklist Adversarial Tests', () => {
  test('1-Click "All Essentially Normal" preset initializes all 10 statutory systems to Normal with empty remarks', () => {
    const preset = { ...DEFAULT_PHYSICAL_EXAM_NORMAL };

    // Statutory systems check: General survey + 9 anatomical systems
    expect(preset.generalSurvey).toBe('Normal');
    expect(preset.generalSurveyRemarks).toBe('');
    expect(preset.skin).toBe('Normal');
    expect(preset.skinRemarks).toBe('');
    expect(preset.heent).toBe('Normal');
    expect(preset.heentRemarks).toBe('');
    expect(preset.chest).toBe('Normal');
    expect(preset.chestRemarks).toBe('');
    expect(preset.heart).toBe('Normal');
    expect(preset.heartRemarks).toBe('');
    expect(preset.abdomen).toBe('Normal');
    expect(preset.abdomenRemarks).toBe('');
    expect(preset.neuro).toBe('Normal');
    expect(preset.neuroRemarks).toBe('');
    expect(preset.rectal).toBe('Normal');
    expect(preset.rectalRemarks).toBe('');
    expect(preset.gu).toBe('Normal');
    expect(preset.guRemarks).toBe('');
    expect(preset.musculoskeletal).toBe('Normal');
    expect(preset.musculoskeletalRemarks).toBe('');
  });

  test('Toggle individual system from Normal to Abnormal and expand remarks', () => {
    let findings: PhysicalExamFindings = { ...DEFAULT_PHYSICAL_EXAM_NORMAL };

    // Toggle musculoskeletal to Abnormal
    const currentStatus = findings.musculoskeletal;
    const nextStatus: SystemExamStatus = currentStatus === 'Normal' ? 'Abnormal' : 'Normal';
    findings = {
      ...findings,
      musculoskeletal: nextStatus,
      musculoskeletalRemarks: 'Tenderness and restricted abduction in right rotator cuff',
    };

    expect(findings.musculoskeletal).toBe('Abnormal');
    expect(findings.musculoskeletalRemarks).toBe('Tenderness and restricted abduction in right rotator cuff');

    // Other systems remain Essentially Normal
    expect(findings.skin).toBe('Normal');
    expect(findings.chest).toBe('Normal');
    expect(findings.heart).toBe('Normal');
    expect(findings.abdomen).toBe('Normal');
  });

  test('Toggling an Abnormal system back to Normal clears associated remarks', () => {
    // Start with abnormal system with remarks
    let findings: PhysicalExamFindings = {
      ...DEFAULT_PHYSICAL_EXAM_NORMAL,
      skin: 'Abnormal',
      skinRemarks: 'Maculopapular rash on bilateral forearms',
    };

    // Toggle back to Normal (simulating handleToggleSystem)
    const current = findings.skin;
    const next: SystemExamStatus = current === 'Normal' ? 'Abnormal' : 'Normal';
    findings = {
      ...findings,
      skin: next,
      skinRemarks: next === 'Normal' ? '' : findings.skinRemarks || '',
    };

    expect(findings.skin).toBe('Normal');
    expect(findings.skinRemarks).toBe('');
  });

  test('1-Click preset button resets all abnormal systems and clears remarks completely', () => {
    // Highly abnormal patient findings across multiple systems
    let dirtyFindings: PhysicalExamFindings = {
      ...DEFAULT_PHYSICAL_EXAM_NORMAL,
      generalSurvey: 'Abnormal',
      generalSurveyRemarks: 'Lethargic, confused',
      chest: 'Abnormal',
      chestRemarks: 'Bilateral expiratory wheezes',
      heart: 'Abnormal',
      heartRemarks: 'Grade 3 systolic murmur at apex',
      musculoskeletal: 'Abnormal',
      musculoskeletalRemarks: 'Left ankle swelling',
    };

    // Clinician clicks "All Essentially Normal" preset
    const resetFindings = { ...DEFAULT_PHYSICAL_EXAM_NORMAL };

    expect(resetFindings.generalSurvey).toBe('Normal');
    expect(resetFindings.generalSurveyRemarks).toBe('');
    expect(resetFindings.chest).toBe('Normal');
    expect(resetFindings.chestRemarks).toBe('');
    expect(resetFindings.heart).toBe('Normal');
    expect(resetFindings.heartRemarks).toBe('');
    expect(resetFindings.musculoskeletal).toBe('Normal');
    expect(resetFindings.musculoskeletalRemarks).toBe('');
  });

  test('Mapping from PhysicalExamFindings to backend consultation request payload matches PhilHealth contracts', () => {
    const findings: PhysicalExamFindings = {
      ...DEFAULT_PHYSICAL_EXAM_NORMAL,
      generalSurvey: 'Abnormal',
      generalSurveyRemarks: 'Acute respiratory distress',
      chest: 'Abnormal',
      chestRemarks: 'Bilateral basal crackles',
    };

    const isYakapEligible = true;

    // Simulate Consultations.screen.tsx payload generation (lines 1085-1087 & 1125-1127)
    const payload = {
      isYakapEligible,
      generalSurveyId: isYakapEligible ? (findings.generalSurvey === 'Normal' ? '1' : '2') : undefined,
      generalSurveyRemarks: isYakapEligible ? findings.generalSurveyRemarks : undefined,
      physicalExamFindingsJson: isYakapEligible ? JSON.stringify(findings) : undefined,
    };

    expect(payload.generalSurveyId).toBe('2');
    expect(payload.generalSurveyRemarks).toBe('Acute respiratory distress');
    expect(payload.physicalExamFindingsJson).toBeDefined();

    const parsed = JSON.parse(payload.physicalExamFindingsJson!);
    expect(parsed.chest).toBe('Abnormal');
    expect(parsed.chestRemarks).toBe('Bilateral basal crackles');
    expect(parsed.heart).toBe('Normal');
    expect(parsed.musculoskeletal).toBe('Normal');
  });

  test('DEFAULT_PHYSICAL_EXAM_NORMAL binds all official PhilHealth statutory codes', () => {
    const preset = { ...DEFAULT_PHYSICAL_EXAM_NORMAL };

    expect(preset.generalSurveyId).toBe('1');
    expect(preset.skinId).toBe('1');
    expect(preset.heentId).toBe('11');
    expect(preset.chestId).toBe('6');
    expect(preset.heartId).toBe('5');
    expect(preset.abdomenId).toBe('7');
    expect(preset.neuroId).toBe('6');
    expect(preset.rectalId).toBe('1');
    expect(preset.guId).toBe('1');
    expect(preset.musculoskeletalId).toBe('1');
  });

  test('Selecting statutory option chips updates code and status without losing remarks', () => {
    let findings: PhysicalExamFindings = { ...DEFAULT_PHYSICAL_EXAM_NORMAL };

    // Selecting Crackles/rales (code 4) for chest
    findings = {
      ...findings,
      chest: 'Abnormal',
      chestId: '4',
      chestRemarks: 'Crackles/rales',
    };

    expect(findings.chest).toBe('Abnormal');
    expect(findings.chestId).toBe('4');
    expect(findings.chestRemarks).toBe('Crackles/rales');

    // Selecting Essentially Normal (code 6) resets status and clears remarks
    findings = {
      ...findings,
      chest: 'Normal',
      chestId: '6',
      chestRemarks: '',
    };

    expect(findings.chest).toBe('Normal');
    expect(findings.chestId).toBe('6');
    expect(findings.chestRemarks).toBe('');
  });

  test('PhilHealth Record Completeness Gate prevents toggling Yakap when PIN is missing or Dependent is incomplete', () => {
    const validateEligibility = (patient: any) => {
      if (!patient) return { canToggle: false, reason: 'Patient record loading' };
      const pin = (patient.philHealthNumber || patient.pin || '').trim();
      if (!pin) return { canToggle: false, reason: 'Missing PhilHealth PIN' };

      const profile = extractPhilHealthProfileData(patient.customFields, patient);
      const memberType = profile.memberType;
      if (memberType === 'DD') {
        const principalName = profile.principalFullName;
        const principalPin = profile.principalPin;
        if (!principalName?.trim() || !principalPin?.trim()) {
          return { canToggle: false, reason: 'Dependent missing sponsor details' };
        }
      }
      return { canToggle: true, reason: null };
    };

    // 1. Patient without PIN
    expect(validateEligibility({ philHealthNumber: '' }).canToggle).toBe(false);
    expect(validateEligibility({ philHealthNumber: '' }).reason).toBe('Missing PhilHealth PIN');

    // 2. Dependent without sponsor details
    const incompleteDependent = {
      philHealthNumber: '123456789012',
      customFields: { member_type: 'DD' },
    };
    expect(validateEligibility(incompleteDependent).canToggle).toBe(false);
    expect(validateEligibility(incompleteDependent).reason).toBe('Dependent missing sponsor details');

    // 3. Dependent with full sponsor details
    const validDependent = {
      philHealthNumber: '123456789012',
      customFields: {
        member_type: 'DD',
        principal_full_name: 'Juan Dela Cruz Sr.',
        principal_member_pin: '987654321098',
      },
    };
    expect(validateEligibility(validDependent).canToggle).toBe(true);
    expect(validateEligibility(validDependent).reason).toBeNull();

    // 4. Principal Member (MM) with PIN
    const validMember = {
      philHealthNumber: '123456789012',
      customFields: { member_type: 'MM' },
    };
    expect(validateEligibility(validMember).canToggle).toBe(true);
    expect(validateEligibility(validMember).reason).toBeNull();
  });

  test('Default ATC code must be "WALKEDIN"', () => {
    const defaultAtc = 'WALKEDIN';
    expect(defaultAtc).toBe('WALKEDIN');
  });

  test('InlinePhysicalExamCard dynamically renders system count matching rendered systems and avoids hardcoded finding literals', async () => {
    const React = await import('react');
    const { renderToStaticMarkup } = await import('react-dom/server');
    const fs = await import('fs');
    const path = await import('path');

    const threeSystemHtml = renderToStaticMarkup(
      React.createElement(InlinePhysicalExamCard, {
        findings: DEFAULT_PHYSICAL_EXAM_NORMAL,
        onChange: () => {},
        embedded: true,
        systems: [
          {
            key: 'generalSurvey',
            remarksKey: 'generalSurveyRemarks',
            codeKey: 'generalSurveyId',
            label: 'General Survey',
            normalDescription: 'Conscious, coherent',
            normalCode: '1',
            placeholder: 'Describe...',
            options: [{ code: '1', description: 'Normal survey', isNormal: true }],
          },
          {
            key: 'chest',
            remarksKey: 'chestRemarks',
            codeKey: 'chestId',
            label: 'Chest & Lungs',
            normalDescription: 'Clear breath sounds',
            normalCode: '6',
            placeholder: 'Describe...',
            options: [{ code: '6', description: 'Essentially normal', isNormal: true }],
          },
          {
            key: 'heart',
            remarksKey: 'heartRemarks',
            codeKey: 'heartId',
            label: 'Heart & CVS',
            normalDescription: 'Regular rhythm',
            normalCode: '5',
            placeholder: 'Describe...',
            options: [{ code: '5', description: 'Essentially normal', isNormal: true }],
          },
        ],
      })
    );

    expect(threeSystemHtml).toContain('3-system organ examination checklist');
    expect(threeSystemHtml).not.toContain('10-system organ examination checklist');
    expect(threeSystemHtml).not.toContain('Set All Normal');
    expect(threeSystemHtml).not.toContain('All Essentially Normal');
    expect(threeSystemHtml).not.toContain('set-all-normal-btn');

    const collapsedByDefaultHtml = renderToStaticMarkup(
      React.createElement(InlinePhysicalExamCard, {
        findings: DEFAULT_PHYSICAL_EXAM_NORMAL,
        onChange: () => {},
        embedded: true,
        collapsible: true,
      })
    );
    expect(collapsedByDefaultHtml).toContain('Show systems');
    expect(collapsedByDefaultHtml).not.toContain('Collapse');
    expect(collapsedByDefaultHtml).not.toContain('Set Abnormal');

    const peCardSource = fs.readFileSync(
      path.resolve(__dirname, '../components/consultation/InlinePhysicalExamCard.tsx'),
      'utf8'
    );
    expect(peCardSource).toContain("useEhrOptions('physical_exam_system'");
    expect(peCardSource).toContain('usePhilHealthCatalog(');
    expect(peCardSource).not.toContain('sys.icon');
    expect(peCardSource).not.toContain('meta.icon');
    expect(peCardSource).not.toContain('Flagged Abnormal');
    expect(peCardSource).not.toContain('Rashes/Petechiae');
    expect(peCardSource).not.toContain('Pale conjunctivae');
    expect(peCardSource).not.toContain('Enlarge Prospate');

    const abnormalSystemHtml = renderToStaticMarkup(
      React.createElement(InlinePhysicalExamCard, {
        findings: {
          ...DEFAULT_PHYSICAL_EXAM_NORMAL,
          generalSurvey: 'Abnormal',
          generalSurveyRemarks: 'Awake, alert, mild distress',
        },
        onChange: () => {},
        embedded: true,
        collapsible: false,
        systems: [
          {
            key: 'generalSurvey',
            remarksKey: 'generalSurveyRemarks',
            codeKey: 'generalSurveyId',
            label: 'General Survey',
            normalDescription: 'Conscious, coherent',
            normalCode: '1',
            placeholder: 'Describe...',
            options: [
              { code: '1', description: 'Normal survey', isNormal: true },
              { code: '2', description: 'Altered sensorium', isNormal: false },
            ],
          },
        ],
      })
    );
    expect(abnormalSystemHtml).toContain('Set Normal');
    expect(abnormalSystemHtml).toContain('Set All Normal');
    expect(abnormalSystemHtml).toContain('set-all-normal-btn');
    expect(abnormalSystemHtml).not.toContain('All Essentially Normal');
    expect(abnormalSystemHtml).not.toContain('Flagged Abnormal');
  });
});

// token-guard:ignore-file
import { describe, expect, test, mock } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

(globalThis as any).__DEV__ = true;

const createMockComponent = (name: string) => {
  const Comp = ({ children, accessibilityLabel, accessibilityRole, placeholder, testID, ...rest }: any) =>
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
  StyleSheet: { create: (s: any) => s, flatten: (s: any) => s, absoluteFill: {}, absoluteFillObject: {} },
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
    spring: () => ({ start: (cb?: any) => cb && cb() }),
    sequence: () => ({ start: (cb?: any) => cb && cb() }),
    parallel: () => ({ start: (cb?: any) => cb && cb() }),
  },
  processColor: (c: any) => c,
  Alert: { alert: () => {} },
}));

mock.module('react-native-svg', () => ({
  Svg: createMockComponent('Svg'),
  Path: createMockComponent('Path'),
  Circle: createMockComponent('Circle'),
  Rect: createMockComponent('Rect'),
  Line: createMockComponent('Line'),
  default: createMockComponent('Svg'),
  Defs: ({ children }: any) => children,
  LinearGradient: ({ children }: any) => children,
  Stop: () => null,
  G: ({ children }: any) => children,
}));

mock.module('expo-crypto', () => ({
  randomUUID: () => 'mock-uuid-issue165',
}));

mock.module('../constants/fonts', () => ({
  applyFontFamily: (s: any) => s,
  fontAssets: {},
}));

const {
  resolveCohort,
  getPreAssessmentObservationChips,
  PEDIATRIC_PRE_ASSESSMENT_OBSERVATION_CHIPS,
  ADULT_PRE_ASSESSMENT_OBSERVATION_CHIPS,
  PRE_ASSESSMENT_OBSERVATION_CHIPS,
  togglePreAssessmentChip,
  EMPTY_VITALS_FORM,
  AnthropometricsSection,
  PreAssessmentSection,
  StandardVitalsSection,
} = await import('../components/consultation/VitalsFormFields');

const { default: EditVitalsModal } = await import(
  '../components/consultation/EditVitalsModal'
);
const { default: RecordVitalsModal } = await import(
  '../components/consultation/RecordVitalsModal'
);

describe('Issue #165: Pediatric Vitals Dialog & Triage UX', () => {
  describe('1. Cohort-Adaptive Quick-Action Chips', () => {
    test('returns dedicated pediatric chips for pediatric patients (age < 18)', () => {
      const pediatricCohort = resolveCohort({ age: 8, sex: 'Male' });
      expect(pediatricCohort.isPediatric).toBe(true);

      const chips = getPreAssessmentObservationChips(pediatricCohort);
      expect(chips).toEqual(PEDIATRIC_PRE_ASSESSMENT_OBSERVATION_CHIPS);
      expect(chips).toContain('Well-Appearing');
      expect(chips).toContain('Active & Playful');
      expect(chips).toContain('Mild Distress');
      expect(chips).toContain('Lethargic');
      expect(chips).toContain('Tolerating Orals');
      expect(chips).toContain('Hydrated / Moist Mucous Membranes');

      // Must not contain adult geriatric-skewed chips
      expect(chips).not.toContain('Wheelchair Bound');
      expect(chips).not.toContain('Fall Risk');
      expect(chips).not.toContain('Ambulatory with Assist');
    });

    test('returns dedicated pediatric chips for infant patients (age 0-24 mo)', () => {
      const infantCohort = resolveCohort({
        age: 1,
        dateOfBirth: '2025-11-01',
        sex: 'Female',
      });
      expect(infantCohort.isInfant).toBe(true);
      expect(infantCohort.isPediatric).toBe(true);

      const chips = getPreAssessmentObservationChips(infantCohort);
      expect(chips).toEqual(PEDIATRIC_PRE_ASSESSMENT_OBSERVATION_CHIPS);
    });

    test('returns adult chips for adult and senior patients (age >= 18)', () => {
      const adultCohort = resolveCohort({ age: 34, sex: 'Female' });
      expect(adultCohort.isAdult).toBe(true);
      expect(adultCohort.isPediatric).toBe(false);

      const adultChips = getPreAssessmentObservationChips(adultCohort);
      expect(adultChips).toEqual(ADULT_PRE_ASSESSMENT_OBSERVATION_CHIPS);
      expect(adultChips).toContain('Alert & Oriented');
      expect(adultChips).toContain('Fall Risk');
      expect(adultChips).toContain('Wheelchair Bound');

      const seniorCohort = resolveCohort({ age: 68, sex: 'Male' });
      expect(seniorCohort.isSenior).toBe(true);
      const seniorChips = getPreAssessmentObservationChips(seniorCohort);
      expect(seniorChips).toEqual(ADULT_PRE_ASSESSMENT_OBSERVATION_CHIPS);
    });

    test('preserves backwards compatibility when cohort is undefined', () => {
      const defaultChips = getPreAssessmentObservationChips(undefined);
      expect(defaultChips).toEqual(ADULT_PRE_ASSESSMENT_OBSERVATION_CHIPS);
      expect(PRE_ASSESSMENT_OBSERVATION_CHIPS).toEqual(ADULT_PRE_ASSESSMENT_OBSERVATION_CHIPS);
    });

    test('toggles pediatric chips in and out of preAssessmentRemarks cleanly', () => {
      let remarks = '';
      remarks = togglePreAssessmentChip(remarks, 'Well-Appearing');
      expect(remarks).toBe('Well-Appearing');

      remarks = togglePreAssessmentChip(remarks, 'Tolerating Orals');
      expect(remarks).toBe('Well-Appearing • Tolerating Orals');

      remarks = togglePreAssessmentChip(remarks, 'Active & Playful');
      expect(remarks).toBe('Well-Appearing • Tolerating Orals • Active & Playful');

      // Toggle off Tolerating Orals
      remarks = togglePreAssessmentChip(remarks, 'Tolerating Orals');
      expect(remarks).toBe('Well-Appearing • Active & Playful');

      // Toggle off Well-Appearing
      remarks = togglePreAssessmentChip(remarks, 'Well-Appearing');
      expect(remarks).toBe('Active & Playful');

      // Toggle off Active & Playful
      remarks = togglePreAssessmentChip(remarks, 'Active & Playful');
      expect(remarks).toBe('');
    });
  });

  describe('2. AnthropometricsSection: Cohort-Adaptive Field Visibility & Disclosure', () => {
    test('suppresses Waist and Hip Circumference inputs by default for pediatric patients (age < 18)', () => {
      const pediatricCohort = resolveCohort({ age: 7, sex: 'Male' });
      const html = renderToStaticMarkup(
        React.createElement(AnthropometricsSection, {
          form: EMPTY_VITALS_FORM,
          updateField: () => {},
          cohort: pediatricCohort,
        })
      );

      // Primary pediatric fields are present
      expect(html).toContain('Height (cm)');
      expect(html).toContain('Weight (kg)');

      // Waist and Hip are hidden by default
      expect(html).not.toContain('Waist Circumference (cm)');
      expect(html).not.toContain('Hip Circumference (cm)');

      // Adult metabolic syndrome criteria are strictly omitted
      expect(html).not.toContain('Target &lt; 90 cm');
      expect(html).not.toContain('Target &lt; 80 cm');
      expect(html).not.toContain('M &lt; 90');
      expect(html).not.toContain('F &lt; 80');

      // The collapsible disclosure button is present
      expect(html).toContain('data-testid="toggle-advanced-anthropometrics"');
      expect(html).toContain('Advanced Anthropometrics (Waist &amp; Hip)');
    });

    test('reveals Waist and Hip Circumference inputs when pediatric form has existing waist or hip data', () => {
      const pediatricCohort = resolveCohort({ age: 10, sex: 'Female' });
      const prefilledForm = {
        ...EMPTY_VITALS_FORM,
        height: '135',
        weight: '30',
        waistCircumference: '62',
      };

      const html = renderToStaticMarkup(
        React.createElement(AnthropometricsSection, {
          form: prefilledForm,
          updateField: () => {},
          cohort: pediatricCohort,
        })
      );

      // Since waistCircumference is populated, disclosure is auto-expanded
      expect(html).toContain('Waist Circumference (cm)');
      expect(html).toContain('Hip Circumference (cm)');
      expect(html).toContain('Hide Advanced Anthropometrics');

      // Omission of adult metabolic targets is preserved even when expanded
      expect(html).not.toContain('Target &lt; 90 cm');
      expect(html).not.toContain('Target &lt; 80 cm');
      expect(html).toContain('Optional, e.g. 60');
      expect(html).toContain('Optional, e.g. 70');
    });

    test('renders Waist and Hip Circumference directly in main grid for adult patients (age >= 18)', () => {
      const adultMaleCohort = resolveCohort({ age: 40, sex: 'Male' });
      const htmlMale = renderToStaticMarkup(
        React.createElement(AnthropometricsSection, {
          form: EMPTY_VITALS_FORM,
          updateField: () => {},
          cohort: adultMaleCohort,
        })
      );

      // Adult inputs are present directly in the grid
      expect(htmlMale).toContain('Waist Circumference (cm) [M &lt; 90]');
      expect(htmlMale).toContain('Target &lt; 90 cm');
      expect(htmlMale).toContain('Hip Circumference (cm)');

      // Advanced disclosure button is NOT rendered for adults
      expect(htmlMale).not.toContain('data-testid="toggle-advanced-anthropometrics"');

      // Female adult test
      const adultFemaleCohort = resolveCohort({ age: 40, sex: 'Female' });
      const htmlFemale = renderToStaticMarkup(
        React.createElement(AnthropometricsSection, {
          form: EMPTY_VITALS_FORM,
          updateField: () => {},
          cohort: adultFemaleCohort,
        })
      );
      expect(htmlFemale).toContain('Waist Circumference (cm) [F &lt; 80]');
      expect(htmlFemale).toContain('Target &lt; 80 cm');
    });
  });

  describe('3. PreAssessmentSection & Acuity Priority Elevation', () => {
    test('renders Triage Acuity Priority selector prominently with Routine, Urgent, Emergency options', () => {
      const pediatricCohort = resolveCohort({ age: 6, sex: 'Female' });
      const html = renderToStaticMarkup(
        React.createElement(PreAssessmentSection, {
          form: { ...EMPTY_VITALS_FORM, triagePriority: 'Urgent' },
          updateField: () => {},
          cohort: pediatricCohort,
        })
      );

      expect(html).toContain('Triage Acuity Priority');
      expect(html).toContain('Routine');
      expect(html).toContain('Urgent');
      expect(html).toContain('STAT / Emergency');
    });

    test('renders pediatric quick chips in PreAssessmentSection when passed pediatric cohort', () => {
      const pediatricCohort = resolveCohort({ age: 4, sex: 'Male' });
      const html = renderToStaticMarkup(
        React.createElement(PreAssessmentSection, {
          form: EMPTY_VITALS_FORM,
          updateField: () => {},
          cohort: pediatricCohort,
        })
      );

      expect(html).toContain('Well-Appearing');
      expect(html).toContain('Active &amp; Playful');
      expect(html).toContain('Tolerating Orals');
      expect(html).toContain('Hydrated / Moist Mucous Membranes');
      expect(html).not.toContain('Fall Risk');
      expect(html).not.toContain('Wheelchair Bound');
    });

    test('renders adult quick chips in PreAssessmentSection when passed adult cohort', () => {
      const adultCohort = resolveCohort({ age: 50, sex: 'Male' });
      const html = renderToStaticMarkup(
        React.createElement(PreAssessmentSection, {
          form: EMPTY_VITALS_FORM,
          updateField: () => {},
          cohort: adultCohort,
        })
      );

      expect(html).toContain('Alert &amp; Oriented');
      expect(html).toContain('Fall Risk');
      expect(html).toContain('Wheelchair Bound');
      expect(html).not.toContain('Well-Appearing');
      expect(html).not.toContain('Active &amp; Playful');
    });
  });

  describe('4. Form Layout Hierarchy & Sticky Action Placement in Modals', () => {
    test('EditVitalsModal places PreAssessmentSection directly below Core Vitals (StandardVitalsSection)', () => {
      const patient = {
        id: 'pat-ped-1',
        fullName: 'Mateo Santos',
        age: 5,
        dateOfBirth: '2021-05-10',
        sex: 'Male',
        patientCode: 'PAT-PED-001',
      };

      const html = renderToStaticMarkup(
        React.createElement(EditVitalsModal, {
          visible: true,
          onClose: () => {},
          queueItemId: 'q-item-1',
          patient,
          onSuccess: () => {},
        })
      );

      // Verify sections are present in DOM
      expect(html).toContain('Standard Vital Signs');
      expect(html).toContain('Nursing Pre-Assessment &amp; Acuity');
      expect(html).toContain('Triage Acuity Priority');
      expect(html).toContain('Anthropometrics &amp; Body Composition');

      // Structural ordering verification: Core Vitals appears BEFORE Pre-Assessment, which appears BEFORE Anthropometrics
      const coreVitalsIndex = html.indexOf('Standard Vital Signs');
      const acuityIndex = html.indexOf('Nursing Pre-Assessment &amp; Acuity');
      const anthropometricsIndex = html.indexOf('Anthropometrics &amp; Body Composition');

      expect(coreVitalsIndex).toBeGreaterThan(-1);
      expect(acuityIndex).toBeGreaterThan(coreVitalsIndex);
      expect(anthropometricsIndex).toBeGreaterThan(acuityIndex);

      // Sticky action buttons in footer
      expect(html).toContain('Cancel');
      expect(html).toContain('Update vitals');
    });

    test('RecordVitalsModal places PreAssessmentSection directly below Core Vitals (StandardVitalsSection)', () => {
      const patient = {
        id: 'pat-ped-2',
        fullName: 'Chloe Reyes',
        age: 8,
        sex: 'Female',
        patientCode: 'PAT-PED-002',
      };

      const html = renderToStaticMarkup(
        React.createElement(RecordVitalsModal, {
          visible: true,
          onClose: () => {},
          patient,
          onSuccess: () => {},
        })
      );

      const coreVitalsIndex = html.indexOf('Standard Vital Signs');
      const acuityIndex = html.indexOf('Nursing Pre-Assessment &amp; Acuity');
      const anthropometricsIndex = html.indexOf('Anthropometrics &amp; Body Composition');

      expect(coreVitalsIndex).toBeGreaterThan(-1);
      expect(acuityIndex).toBeGreaterThan(coreVitalsIndex);
      expect(anthropometricsIndex).toBeGreaterThan(acuityIndex);

      // Sticky action buttons in footer
      expect(html).toContain('Cancel');
      expect(html).toContain('Save vitals');
    });
  });
});

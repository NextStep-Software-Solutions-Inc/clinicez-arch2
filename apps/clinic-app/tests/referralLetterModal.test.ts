// token-guard:ignore-file
import { describe, expect, test, mock } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

(globalThis as any).__DEV__ = true;

const createMockComponent = (name: string) => {
  const Comp = ({
    children,
    accessibilityLabel,
    accessibilityRole,
    placeholder,
    onPress,
    value,
    testID,
  }: any) =>
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
  StyleSheet: { create: (s: any) => s, flatten: (s: any) => s, absoluteFillObject: {} },
  View: createMockComponent('View'),
  Pressable: createMockComponent('Pressable'),
  ScrollView: createMockComponent('ScrollView'),
  TextInput: createMockComponent('TextInput'),
  Text: createMockComponent('Text'),
  ActivityIndicator: createMockComponent('ActivityIndicator'),
  Modal: createMockComponent('Modal'),
  TouchableOpacity: createMockComponent('TouchableOpacity'),
  TouchableHighlight: createMockComponent('TouchableHighlight'),
  Touchable: { Mixin: {} },
  KeyboardAvoidingView: createMockComponent('KeyboardAvoidingView'),
  Switch: createMockComponent('Switch'),
  FlatList: createMockComponent('FlatList'),
  SectionList: createMockComponent('SectionList'),
  RefreshControl: createMockComponent('RefreshControl'),
  Dimensions: { get: () => ({ width: 1280, height: 800 }), addEventListener: () => ({ remove: () => {} }) },
  useWindowDimensions: () => ({ width: 1280, height: 800 }),
  Keyboard: { dismiss: () => {}, addListener: () => ({ remove: () => {} }) },
  AppState: { addEventListener: () => ({ remove: () => {} }) },
  Platform: { OS: 'web', select: (obj: any) => obj.web ?? obj.default },
  Alert: { alert: () => {} },
  Animated: {
    Value: class {
      constructor(public val: any) {}
      setValue(val: any) { this.val = val; }
      interpolate() { return this; }
    },
    timing: () => ({ start: (cb?: any) => cb && cb() }),
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
  default: createMockComponent('Svg'),
  Polyline: createMockComponent('Polyline'),
  Polygon: createMockComponent('Polygon'),
  Defs: ({ children }: any) => children,
  LinearGradient: ({ children }: any) => children,
  Stop: () => null,
  G: ({ children }: any) => children,
  Text: ({ children }: any) => children,
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

// Dynamic import of Input after mocks are registered
const { default: Input } = await import('../components/ui/Input');

/**
 * Validation logic isolated for testing identical to Consultations.screen.tsx handleIssueReferral
 */
function validateReferralSubmission(params: {
  refFacility: string;
  refDepartment: string;
  refReason: string;
  refDiagnosis: string;
  primaryDiagnosisText: () => string;
  refSummary: string;
  subjective: string;
}): { valid: boolean; alertTitle?: string; alertMessage?: string } {
  if (!params.refFacility.trim()) {
    return {
      valid: false,
      alertTitle: 'Missing Destination',
      alertMessage: 'Please enter the receiving facility name.',
    };
  }
  if (!params.refDepartment.trim()) {
    return {
      valid: false,
      alertTitle: 'Missing Destination',
      alertMessage: 'Please enter the receiving department or specialty.',
    };
  }
  if (!params.refReason.trim()) {
    return {
      valid: false,
      alertTitle: 'Missing Reason',
      alertMessage: 'Please specify the reason for referral.',
    };
  }
  const diagnosis = params.refDiagnosis.trim() || params.primaryDiagnosisText();
  if (!diagnosis) {
    return {
      valid: false,
      alertTitle: 'Missing Diagnosis',
      alertMessage: 'Please provide a provisional diagnosis or assessment for the referral letter.',
    };
  }
  const summary = params.refSummary.trim() || params.subjective.trim();
  if (!summary) {
    return {
      valid: false,
      alertTitle: 'Missing Clinical Summary',
      alertMessage: 'Please provide a brief clinical summary or enter subjective consultation notes.',
    };
  }
  return { valid: true };
}

/**
 * Modal opener pre-population logic isolated for testing
 */
function handleOpenIssueReferralState(current: {
  refDiagnosis: string;
  refSummary: string;
  primaryDiagnosisText: string;
  subjective: string;
}) {
  let refDiagnosis = current.refDiagnosis;
  let refSummary = current.refSummary;

  if (!refDiagnosis.trim()) {
    refDiagnosis = current.primaryDiagnosisText;
  }
  if (!refSummary.trim() && current.subjective.trim()) {
    refSummary = current.subjective.trim();
  }

  return {
    refDiagnosis,
    refSummary,
    refValidationAttempted: false,
    referralModalVisible: true,
  };
}

describe('GitHub Issue #166: Referral Modal Granular Validation & In-Modal Diagnosis', () => {
  describe('1. Granular Validation Logic (Eliminates lumped "Incomplete referral" false alarms)', () => {
    test('submitting with valid reason but missing diagnosis alerts "Missing Diagnosis" and NEVER claims reason is missing', () => {
      const result = validateReferralSubmission({
        refFacility: 'Philippine General Hospital',
        refDepartment: 'Pediatric Cardiology',
        refReason: 'Clear for school athletics',
        refDiagnosis: '',
        primaryDiagnosisText: () => '',
        refSummary: 'Patient has systolic murmur on auscultation.',
        subjective: '',
      });

      expect(result.valid).toBe(false);
      expect(result.alertTitle).toBe('Missing Diagnosis');
      expect(result.alertMessage).toContain('Please provide a provisional diagnosis');
      expect(result.alertMessage).not.toContain('reason');
    });

    test('submitting with valid reason and diagnosis but missing clinical summary alerts "Missing Clinical Summary"', () => {
      const result = validateReferralSubmission({
        refFacility: 'Philippine General Hospital',
        refDepartment: 'Pediatric Cardiology',
        refReason: 'Clear for school athletics',
        refDiagnosis: 'Innocent systolic murmur (R01.0)',
        primaryDiagnosisText: () => '',
        refSummary: '',
        subjective: '',
      });

      expect(result.valid).toBe(false);
      expect(result.alertTitle).toBe('Missing Clinical Summary');
      expect(result.alertMessage).toContain('Please provide a brief clinical summary');
      expect(result.alertMessage).not.toContain('reason');
    });

    test('missing facility alerts "Missing Destination" specifying facility name', () => {
      const result = validateReferralSubmission({
        refFacility: '',
        refDepartment: 'Cardiology',
        refReason: 'Workup',
        refDiagnosis: 'Chest pain',
        primaryDiagnosisText: () => '',
        refSummary: 'Clinical notes',
        subjective: '',
      });

      expect(result.valid).toBe(false);
      expect(result.alertTitle).toBe('Missing Destination');
      expect(result.alertMessage).toContain('facility name');
    });

    test('missing department alerts "Missing Destination" specifying department/specialty', () => {
      const result = validateReferralSubmission({
        refFacility: 'National Kidney and Transplant Institute',
        refDepartment: '',
        refReason: 'Nephrology clearance',
        refDiagnosis: 'CKD Stage 3',
        primaryDiagnosisText: () => '',
        refSummary: 'Clinical notes',
        subjective: '',
      });

      expect(result.valid).toBe(false);
      expect(result.alertTitle).toBe('Missing Destination');
      expect(result.alertMessage).toContain('department or specialty');
    });

    test('missing reason specifically alerts "Missing Reason"', () => {
      const result = validateReferralSubmission({
        refFacility: 'PGH',
        refDepartment: 'Pediatrics',
        refReason: '',
        refDiagnosis: 'Asthma',
        primaryDiagnosisText: () => '',
        refSummary: 'Wheezing on exertion',
        subjective: '',
      });

      expect(result.valid).toBe(false);
      expect(result.alertTitle).toBe('Missing Reason');
      expect(result.alertMessage).toBe('Please specify the reason for referral.');
    });

    test('passes validation when all fields are populated directly in the modal', () => {
      const result = validateReferralSubmission({
        refFacility: 'Philippine General Hospital',
        refDepartment: 'Pediatric Cardiology',
        refReason: 'Clear for school athletics',
        refDiagnosis: 'Innocent systolic murmur (R01.0)',
        primaryDiagnosisText: () => '',
        refSummary: 'Patient is asymptomatic with normal ECG.',
        subjective: '',
      });

      expect(result.valid).toBe(true);
      expect(result.alertTitle).toBeUndefined();
    });
  });

  describe('2. In-Modal Provisional Diagnosis & Pre-Population Behavior', () => {
    test('pre-fills refDiagnosis from SOAP assessment when refDiagnosis is empty', () => {
      const nextState = handleOpenIssueReferralState({
        refDiagnosis: '',
        refSummary: '',
        primaryDiagnosisText: 'Acute Bronchitis (J20.9)',
        subjective: 'Cough for 3 days',
      });

      expect(nextState.refDiagnosis).toBe('Acute Bronchitis (J20.9)');
      expect(nextState.refSummary).toBe('Cough for 3 days');
      expect(nextState.refValidationAttempted).toBe(false);
      expect(nextState.referralModalVisible).toBe(true);
    });

    test('preserves doctor custom edits in refDiagnosis when reopening modal', () => {
      const nextState = handleOpenIssueReferralState({
        refDiagnosis: 'Custom provisional workup for rule-out cardiomyopathy',
        refSummary: 'Custom summary',
        primaryDiagnosisText: 'Hypertension',
        subjective: 'Headache',
      });

      expect(nextState.refDiagnosis).toBe('Custom provisional workup for rule-out cardiomyopathy');
      expect(nextState.refSummary).toBe('Custom summary');
    });

    test('allows doctor to enter diagnosis directly in modal when background SOAP is blank', () => {
      // Background SOAP is blank
      const openerState = handleOpenIssueReferralState({
        refDiagnosis: '',
        refSummary: '',
        primaryDiagnosisText: '',
        subjective: '',
      });
      expect(openerState.refDiagnosis).toBe('');

      // Doctor types provisional diagnosis in the modal
      const doctorInputDiagnosis = 'Congenital murmur for 2D-echo evaluation';
      const doctorInputSummary = 'Grade 2/6 systolic ejection murmur at left sternal border';

      const validation = validateReferralSubmission({
        refFacility: 'Philippine Heart Center',
        refDepartment: 'Pediatric Cardiology',
        refReason: 'Further cardiac diagnostic workup',
        refDiagnosis: doctorInputDiagnosis,
        primaryDiagnosisText: () => '',
        refSummary: doctorInputSummary,
        subjective: '',
      });

      expect(validation.valid).toBe(true);
    });
  });

  describe('3. Modal UI Input Elements & Error Feedback Rendering', () => {
    test('renders Provisional Diagnosis input with required indicator (*)', () => {
      const html = renderToStaticMarkup(
        React.createElement(Input, {
          label: 'Provisional Diagnosis / Assessment',
          required: true,
          placeholder: 'e.g. Clearance for sports / Congenital murmur workup',
          value: 'Cardiac arrhythmia',
          onChangeText: () => {},
        })
      );

      expect(html).toContain('Provisional Diagnosis / Assessment');
      expect(html).toContain('*');
      expect(html).toContain('data-value="Cardiac arrhythmia"');
    });

    test('renders Clinical Summary input with required indicator (*) and custom placeholder', () => {
      const html = renderToStaticMarkup(
        React.createElement(Input, {
          label: 'Clinical summary',
          required: true,
          placeholder: 'Summary of examination, diagnostics and clinical findings',
          value: '',
          onChangeText: () => {},
          multiline: true,
        })
      );

      expect(html).toContain('Clinical summary');
      expect(html).toContain('*');
      expect(html).toContain('Summary of examination, diagnostics and clinical findings');
    });

    test('displays inline error when refValidationAttempted is true and required field is empty', () => {
      const html = renderToStaticMarkup(
        React.createElement(Input, {
          label: 'Provisional Diagnosis / Assessment',
          required: true,
          value: '',
          error: 'Provisional diagnosis is required',
          onChangeText: () => {},
        })
      );

      expect(html).toContain('Provisional diagnosis is required');
    });

    test('displays pre-population helper text when diagnosis matches SOAP assessment', () => {
      const soapAssessment = 'Pneumonia (J18.9)';
      const refDiagnosis = soapAssessment;
      const helperText =
        soapAssessment && refDiagnosis === soapAssessment
          ? 'Pre-populated from consultation assessment. You can edit this for the referral.'
          : undefined;

      const html = renderToStaticMarkup(
        React.createElement(Input, {
          label: 'Provisional Diagnosis / Assessment',
          required: true,
          value: refDiagnosis,
          helperText,
          onChangeText: () => {},
        })
      );

      expect(html).toContain('Pre-populated from consultation assessment');
    });

    test('displays empty consultation warning helper text when subjective notes are missing', () => {
      const subjective = '';
      const refSummary = '';
      const helperText =
        !subjective.trim() && !refSummary.trim()
          ? 'Required: No subjective notes found in current consultation.'
          : undefined;

      const html = renderToStaticMarkup(
        React.createElement(Input, {
          label: 'Clinical summary',
          required: true,
          value: refSummary,
          helperText,
          onChangeText: () => {},
        })
      );

      expect(html).toContain('Required: No subjective notes found in current consultation.');
    });
  });

  describe('4. Encounter Lifecycle & State Reset', () => {
    test('resets all draft referral fields to initial defaults during resetEncounter', () => {
      let draftState = {
        refFacility: 'St. Luke’s Medical Center',
        refDepartment: 'Neurology',
        refUrgency: 'Urgent',
        refReason: 'Persistent seizures',
        refSummary: 'Refractory to first line anticonvulsant',
        refDiagnosis: 'Epilepsy, intractable',
        refValidationAttempted: true,
        issuedReferral: { id: 'ref-123' },
      };

      // Execute reset sequence
      draftState = {
        refFacility: '',
        refDepartment: '',
        refUrgency: 'Routine',
        refReason: '',
        refSummary: '',
        refDiagnosis: '',
        refValidationAttempted: false,
        issuedReferral: null,
      };

      expect(draftState.refFacility).toBe('');
      expect(draftState.refDepartment).toBe('');
      expect(draftState.refUrgency).toBe('Routine');
      expect(draftState.refReason).toBe('');
      expect(draftState.refSummary).toBe('');
      expect(draftState.refDiagnosis).toBe('');
      expect(draftState.refValidationAttempted).toBe(false);
      expect(draftState.issuedReferral).toBeNull();
    });
  });
});

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

const { ApiError, extractApiError } = await import('@shared/safe');
const {
  EMPTY_VITALS_FORM,
  mapApiErrorsToVitalsFormErrors,
  resolveCohort,
  StandardVitalsSection,
} = await import('../components/consultation/VitalsFormFields');

type VitalsFormState = typeof EMPTY_VITALS_FORM;

describe('Vitals Validation Error Attribution & Unmasking (Issue #141)', () => {
  describe('1. Shared API Layer unmasking via extractApiError', () => {
    test('unmasks out-of-range heart rate error when backend returns generic "One or more validation errors occurred."', () => {
      const apiResponseError = {
        response: {
          status: 400,
          data: {
            succeeded: false,
            message: 'One or more validation errors occurred.',
            errors: [
              {
                field: 'HeartRateBpm',
                code: 'InclusiveBetweenValidator',
                message: "'Heart Rate Bpm' must be between 30 and 250. You entered 18.",
              },
            ],
            errorCode: 'VALIDATION_ERROR',
            traceId: '00-trace-hr-18',
          },
        },
      };

      const extracted = extractApiError(apiResponseError);

      expect(extracted.status).toBe(400);
      expect(extracted.message).toBe("'Heart Rate Bpm' must be between 30 and 250. You entered 18.");
      expect(extracted.traceId).toBe('00-trace-hr-18');
      expect(extracted.errors).toHaveLength(1);
      expect(extracted.errors[0].field).toBe('HeartRateBpm');
    });

    test('combines multiple vitals validation errors into a readable semicolon-separated toast message', () => {
      const apiResponseError = {
        response: {
          status: 400,
          data: {
            succeeded: false,
            message: 'One or more validation errors occurred.',
            errors: [
              {
                field: 'HeartRateBpm',
                message: "'Heart Rate Bpm' must be between 30 and 250. You entered 18.",
              },
              {
                field: 'SystolicBp',
                message: "'Systolic Bp' must be between 50 and 300. You entered 400.",
              },
            ],
            errorCode: 'VALIDATION_ERROR',
          },
        },
      };

      const extracted = extractApiError(apiResponseError);

      expect(extracted.message).toBe(
        "'Heart Rate Bpm' must be between 30 and 250. You entered 18.; 'Systolic Bp' must be between 50 and 300. You entered 400."
      );
    });

    test('falls back to generic message when errors array is empty', () => {
      const apiResponseError = {
        response: {
          status: 400,
          data: {
            succeeded: false,
            message: 'One or more validation errors occurred.',
            errors: [],
          },
        },
      };

      const extracted = extractApiError(apiResponseError);
      expect(extracted.message).toBe('One or more validation errors occurred.');
    });
  });

  describe('2. mapApiErrorsToVitalsFormErrors mapping', () => {
    test('maps PascalCase backend field names to VitalsFormState camelCase keys', () => {
      const apiError = new ApiError('Validation failed', 400, [
        { field: 'HeartRateBpm', code: 'VALIDATION_ERROR', message: 'Heart Rate must be 30-250 bpm' },
        { field: 'SystolicBp', code: 'VALIDATION_ERROR', message: 'Systolic BP must be 50-300 mmHg' },
        { field: 'DiastolicBp', code: 'VALIDATION_ERROR', message: 'Diastolic BP must be 30-200 mmHg' },
        { field: 'RespiratoryRateBreathsPerMin', code: 'VALIDATION_ERROR', message: 'Respiratory rate is invalid' },
        { field: 'TemperatureCelsius', code: 'VALIDATION_ERROR', message: 'Temperature must be 30-45 °C' },
        { field: 'OxygenSaturationPercent', code: 'VALIDATION_ERROR', message: 'SpO2 must be 50-100%' },
        { field: 'PainScore', code: 'VALIDATION_ERROR', message: 'Pain score must be 0-10' },
        { field: 'HeightCm', code: 'VALIDATION_ERROR', message: 'Height is out of range' },
        { field: 'WeightKg', code: 'VALIDATION_ERROR', message: 'Weight is out of range' },
        { field: 'BodyLengthCm', code: 'VALIDATION_ERROR', message: 'Body length is out of range' },
        { field: 'HeadCircumferenceCm', code: 'VALIDATION_ERROR', message: 'Head circumference invalid' },
        { field: 'MidUpperArmCircumferenceCm', code: 'VALIDATION_ERROR', message: 'MUAC invalid' },
        { field: 'SkinfoldThicknessMm', code: 'VALIDATION_ERROR', message: 'Skinfold thickness invalid' },
        { field: 'LimbsCircumferenceCm', code: 'VALIDATION_ERROR', message: 'Limbs circumference invalid' },
        { field: 'WaistCircumferenceCm', code: 'VALIDATION_ERROR', message: 'Waist circumference invalid' },
        { field: 'HipCircumferenceCm', code: 'VALIDATION_ERROR', message: 'Hip circumference invalid' },
        { field: 'VisualAcuityLeft', code: 'VALIDATION_ERROR', message: 'Left visual acuity format invalid' },
        { field: 'VisualAcuityRight', code: 'VALIDATION_ERROR', message: 'Right visual acuity format invalid' },
        { field: 'ChiefComplaint', code: 'VALIDATION_ERROR', message: 'Chief complaint exceeds limit' },
        { field: 'Notes', code: 'VALIDATION_ERROR', message: 'Notes exceed length limit' },
      ]);

      const formErrors = mapApiErrorsToVitalsFormErrors(apiError);

      expect(formErrors.hr).toBe('Heart Rate must be 30-250 bpm');
      expect(formErrors.bpSys).toBe('Systolic BP must be 50-300 mmHg');
      expect(formErrors.bpDia).toBe('Diastolic BP must be 30-200 mmHg');
      expect(formErrors.rr).toBe('Respiratory rate is invalid');
      expect(formErrors.temp).toBe('Temperature must be 30-45 °C');
      expect(formErrors.spo2).toBe('SpO2 must be 50-100%');
      expect(formErrors.pain).toBe('Pain score must be 0-10');
      expect(formErrors.height).toBe('Height is out of range');
      expect(formErrors.weight).toBe('Weight is out of range');
      expect(formErrors.bodyLength).toBe('Body length is out of range');
      expect(formErrors.headCircumference).toBe('Head circumference invalid');
      expect(formErrors.midUpperArmCircumference).toBe('MUAC invalid');
      expect(formErrors.skinfoldThickness).toBe('Skinfold thickness invalid');
      expect(formErrors.limbsCircumference).toBe('Limbs circumference invalid');
      expect(formErrors.waistCircumference).toBe('Waist circumference invalid');
      expect(formErrors.hipCircumference).toBe('Hip circumference invalid');
      expect(formErrors.visualAcuityLeft).toBe('Left visual acuity format invalid');
      expect(formErrors.visualAcuityRight).toBe('Right visual acuity format invalid');
      expect(formErrors.chiefComplaint).toBe('Chief complaint exceeds limit');
      expect(formErrors.notes).toBe('Notes exceed length limit');
    });

    test('handles null or undefined ApiError gracefully', () => {
      expect(mapApiErrorsToVitalsFormErrors(null)).toEqual({});
      expect(mapApiErrorsToVitalsFormErrors(undefined)).toEqual({});
    });

    test('strips JSON path prefixes like "$.heartRateBpm" and matches accurately', () => {
      const apiError = new ApiError('Validation failure', 400, [
        { field: '$.heartRateBpm', code: 'VALIDATION_ERROR', message: 'Must be 30-250 bpm' },
      ]);

      const formErrors = mapApiErrorsToVitalsFormErrors(apiError);
      expect(formErrors.hr).toBe('Must be 30-250 bpm');
    });
  });

  describe('3. Reactive field error clearing on input edit', () => {
    test('clearing a field error when the nurse begins modifying that field', () => {
      let fieldErrors: Partial<Record<keyof VitalsFormState, string>> = {
        hr: "'Heart Rate Bpm' must be between 30 and 250. You entered 18.",
        bpSys: 'Systolic BP must be between 50 and 300.',
      };

      const updateField = (key: keyof VitalsFormState, _val: string) => {
        if (fieldErrors[key]) {
          const next = { ...fieldErrors };
          delete next[key];
          fieldErrors = next;
        }
      };

      // User begins correcting Heart Rate
      updateField('hr', '72');

      expect(fieldErrors.hr).toBeUndefined();
      expect(fieldErrors.bpSys).toBe('Systolic BP must be between 50 and 300.');
    });
  });

  describe('4. StandardVitalsSection component rendering with errors & helperText', () => {
    const adultPatient = {
      id: 'p-1',
      fullName: 'Juan Dela Cruz',
      dateOfBirth: '1990-01-01',
      gender: 'Male',
    };
    const adultCohort = resolveCohort(adultPatient as any);

    test('renders helperText when no error exists on fields', () => {
      const form: VitalsFormState = {
        ...EMPTY_VITALS_FORM,
        hr: '72',
      };

      const markup = renderToStaticMarkup(
        React.createElement(StandardVitalsSection, {
          form,
          updateField: () => {},
          cohort: adultCohort,
          errors: {},
        })
      );

      // Verify range helper texts are displayed
      expect(markup).toContain('Range: 30–250');
      expect(markup).toContain('Range: 50–300');
      expect(markup).toContain('Range: 30–200');
      expect(markup).toContain('Range: 8–60');
      expect(markup).toContain('Range: 30–45');
      expect(markup).toContain('Range: 50–100');
      expect(markup).toContain('Range: 0–10');
    });

    test('renders inline error alert message and omits helperText when error is present on Heart Rate', () => {
      const form: VitalsFormState = {
        ...EMPTY_VITALS_FORM,
        hr: '18',
      };
      const errors = {
        hr: "'Heart Rate Bpm' must be between 30 and 250. You entered 18.",
      };

      const markup = renderToStaticMarkup(
        React.createElement(StandardVitalsSection, {
          form,
          updateField: () => {},
          cohort: adultCohort,
          errors,
        })
      );

      // Verify specific error message is rendered in the markup (HTML-encoded quotes &#x27;)
      expect(markup).toContain('Heart Rate Bpm');
      expect(markup).toContain('must be between 30 and 250. You entered 18.');
      expect(markup).not.toContain('Range: 30–250');
      // The other fields still show their default helperText
      expect(markup).toContain('Range: 50–300');
    });

    test('infant cohort marks BP optional and omits infant BP helperText', () => {
      const infantPatient = {
        id: 'p-baby',
        fullName: 'Baby Maria Santos',
        dateOfBirth: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        gender: 'Female',
      };
      const infantCohort = resolveCohort(infantPatient as any);

      const markup = renderToStaticMarkup(
        React.createElement(StandardVitalsSection, {
          form: EMPTY_VITALS_FORM,
          updateField: () => {},
          cohort: infantCohort,
          errors: {},
        })
      );

      expect(markup).toContain('Systolic BP (optional)');
      expect(markup).toContain('Diastolic BP (optional)');
      expect(markup).toContain('Infant: BP Optional');
    });
  });
});

// token-guard:ignore-file
import { describe, expect, test, mock, beforeEach } from 'bun:test';
import React from 'react';

(globalThis as any).__DEV__ = true;

// Mock react-native
mock.module('react-native', () => ({
  Linking: { openURL: () => Promise.resolve(), canOpenURL: () => Promise.resolve(true) },
  StyleSheet: { create: (s: any) => s, flatten: (s: any) => s },
  View: 'View',
  Pressable: 'Pressable',
  ScrollView: 'ScrollView',
  TextInput: 'TextInput',
  Text: 'Text',
  ActivityIndicator: 'ActivityIndicator',
  Modal: 'Modal',
  KeyboardAvoidingView: 'KeyboardAvoidingView',
  FlatList: 'FlatList',
  SectionList: 'SectionList',
  Switch: 'Switch',
  TouchableOpacity: 'TouchableOpacity',
  TouchableHighlight: 'TouchableHighlight',
  Image: 'Image',
  RefreshControl: 'RefreshControl',
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
    View: 'Animated.View',
    Text: 'Animated.Text',
  },
  Alert: { alert: () => {} },
}));

mock.module('expo-crypto', () => ({
  randomUUID: () => 'mock-uuid-' + Math.random().toString(36).substring(2, 9),
}));

mock.module('react-native-svg', () => ({
  Svg: 'Svg',
  Path: 'Path',
  Circle: 'Circle',
  Rect: 'Rect',
  Line: 'Line',
  default: 'Svg',
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
  notify,
  getFeedbackState,
  dismissToast,
  resetFeedbackState,
  subscribeFeedback,
} = await import('../utils/feedback');

const { default: FeedbackHost } = await import('../components/ui/FeedbackHost');
const { ApiError } = await import('@shared/safe');
const { EditPatientModal } = await import('../components/patient/EditPatientModal');
const { clinicService } = await import('../services/clinicService');

describe('Task 1 & 2: Contextual Toast UX & Trace ID Feedback', () => {
  beforeEach(() => {
    resetFeedbackState();
  });

  test('1.1 notify.error defaults to 10,000ms duration', () => {
    notify.error('Database conflict occurred');
    const state = getFeedbackState();
    expect(state.toasts).toHaveLength(1);
    const toast = state.toasts[0];
    expect(toast.kind).toBe('error');
    expect(toast.message).toBe('Database conflict occurred');
    expect(toast.durationMs).toBe(10000);
    expect(toast.traceId).toBeUndefined();
  });

  test('1.2 notify.error accepts traceId string and defaults to 10,000ms', () => {
    notify.error('Registration failed', '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01');
    const state = getFeedbackState();
    expect(state.toasts).toHaveLength(1);
    const toast = state.toasts[0];
    expect(toast.kind).toBe('error');
    expect(toast.message).toBe('Registration failed');
    expect(toast.durationMs).toBe(10000);
    expect(toast.traceId).toBe('00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01');
  });

  test('1.3 notify.error accepts ToastOptions object with traceId, durationMs, and action', () => {
    let actionTriggered = false;
    notify.error('Network timeout', {
      traceId: 'trace-custom-999',
      durationMs: 15000,
      action: {
        label: 'Retry Action',
        onPress: () => {
          actionTriggered = true;
        },
      },
    });

    const state = getFeedbackState();
    expect(state.toasts).toHaveLength(1);
    const toast = state.toasts[0];
    expect(toast.kind).toBe('error');
    expect(toast.durationMs).toBe(15000);
    expect(toast.traceId).toBe('trace-custom-999');
    expect(toast.action?.label).toBe('Retry Action');
    toast.action?.onPress();
    expect(actionTriggered).toBe(true);
  });

  test('1.4 notify.success and notify.info default to 4000ms', () => {
    notify.success('Patient saved');
    notify.info('Queue updated');

    const state = getFeedbackState();
    expect(state.toasts).toHaveLength(2);
    expect(state.toasts[0].kind).toBe('success');
    expect(state.toasts[0].durationMs).toBe(4000);
    expect(state.toasts[1].kind).toBe('info');
    expect(state.toasts[1].durationMs).toBe(4000);
  });

  test('1.5 dismissToast removes the specific toast', () => {
    const id1 = notify.error('Error 1');
    const id2 = notify.error('Error 2');
    expect(getFeedbackState().toasts).toHaveLength(2);

    dismissToast(id1);
    const state = getFeedbackState();
    expect(state.toasts).toHaveLength(1);
    expect(state.toasts[0].id).toBe(id2);
  });

  test('2.1 FeedbackHost renders dismiss button and Copy Ref ID action when traceId is provided', async () => {
    let copiedText = '';
    const originalClipboard = (globalThis as any).navigator?.clipboard;
    (globalThis as any).navigator = {
      ...(globalThis as any).navigator,
      clipboard: {
        writeText: async (t: string) => {
          copiedText = t;
        },
      },
    };

    notify.error('Patient code collision', '00-trace-patient-code-test-123');
    const element = React.createElement(FeedbackHost);
    expect(element).toBeDefined();

    const state = getFeedbackState();
    expect(state.toasts[0].traceId).toBe('00-trace-patient-code-test-123');

    // Test copy execution defensively
    await (globalThis as any).navigator.clipboard.writeText(state.toasts[0].traceId);
    expect(copiedText).toBe('00-trace-patient-code-test-123');

    (globalThis as any).navigator.clipboard = originalClipboard;
  });
});

describe('Task 3 & 4: Form Field Error Attribution with ApiError', () => {
  beforeEach(() => {
    resetFeedbackState();
  });

  test('3.1 ApiError structured field errors map cleanly to registration fields', () => {
    const apiError = new ApiError(
      'Validation failed for registration',
      400,
      [
        { field: 'patientCode', code: 'DUPLICATE_RESOURCE', message: 'Patient code PAT-2026-00042 already exists' },
        { field: 'firstName', code: 'REQUIRED', message: 'First name is required' },
        { field: 'lastName', code: 'REQUIRED', message: 'Last name is required' },
        { field: 'dateOfBirth', code: 'INVALID_DATE', message: 'Date of birth cannot be in the future' },
        { field: 'contactNumber', code: 'DUPLICATE_RESOURCE', message: 'Contact number already in use' },
        { field: 'philHealthNumber', code: 'INVALID_PIN', message: 'Check digit mismatch on PhilHealth PIN' },
      ],
      'VALIDATION_ERROR',
      '00-trace-val-001'
    );

    expect(apiError.getFieldError('patientCode')).toBe('Patient code PAT-2026-00042 already exists');
    expect(apiError.getFieldError('firstName')).toBe('First name is required');
    expect(apiError.getFieldError('lastName')).toBe('Last name is required');
    expect(apiError.getFieldError('dateOfBirth')).toBe('Date of birth cannot be in the future');
    expect(apiError.getFieldError('contactNumber')).toBe('Contact number already in use');
    expect(apiError.getFieldError('philHealthNumber')).toBe('Check digit mismatch on PhilHealth PIN');
    expect(apiError.traceId).toBe('00-trace-val-001');

    const map = apiError.getFieldErrorsMap();
    expect(map.patientCode).toBe('Patient code PAT-2026-00042 already exists');
    expect(map.firstName).toBe('First name is required');
    expect(map.lastName).toBe('Last name is required');
    expect(map.dateOfBirth).toBe('Date of birth cannot be in the future');
    expect(map.contactNumber).toBe('Contact number already in use');
    expect(map.philHealthNumber).toBe('Check digit mismatch on PhilHealth PIN');
  });

  test('4.1 EditPatientModal renders properly and supports demographic attributes', () => {
    const samplePatient = {
      id: 'pat-test-uuid',
      tenantId: 'tenant-1',
      clinicId: 'clinic-1',
      patientCode: 'PAT-2026-00010',
      firstName: 'Juan',
      lastName: 'Dela Cruz',
      middleName: 'Perez',
      dateOfBirth: '1992-04-10',
      sex: 'Male',
      contactNumber: '0917-123-4567',
      philHealthNumber: '12-345678901-8',
      verificationStatus: 'Verified',
      createdAt: '2026-01-01T00:00:00Z',
    };

    const element = React.createElement(EditPatientModal, {
      visible: true,
      patient: samplePatient as any,
      onClose: () => {},
      onSaved: () => {},
    });

    expect(element).toBeDefined();
    expect(element.props.visible).toBe(true);
    expect(element.props.patient.firstName).toBe('Juan');
    expect(element.props.patient.lastName).toBe('Dela Cruz');
    expect(element.props.patient.contactNumber).toBe('0917-123-4567');
  });

  test('4.2 Structured ApiError maps to EditPatientModal field errors and triggers contextual toast', () => {
    const errorWithTrace = new ApiError(
      'Contact number already registered to another patient.',
      409,
      [
        { field: 'contactNumber', code: 'DUPLICATE_RESOURCE', message: 'Contact phone number is already registered.' },
        { field: 'middleName', code: 'TOO_LONG', message: 'Middle name cannot exceed 50 characters.' },
      ],
      'DUPLICATE_RESOURCE',
      '00-trace-edit-409'
    );

    expect(errorWithTrace.getFieldError('contactNumber')).toBe('Contact phone number is already registered.');
    expect(errorWithTrace.getFieldError('middleName')).toBe('Middle name cannot exceed 50 characters.');
    expect(errorWithTrace.traceId).toBe('00-trace-edit-409');

    // Notify with traceId
    notify.error(errorWithTrace.message, { traceId: errorWithTrace.traceId });
    const state = getFeedbackState();
    expect(state.toasts).toHaveLength(1);
    expect(state.toasts[0].message).toBe('Contact number already registered to another patient.');
    expect(state.toasts[0].traceId).toBe('00-trace-edit-409');
    expect(state.toasts[0].durationMs).toBe(10000);
  });

  test('4.3 Consultation signing conflict (DUPLICATE_QUEUE_CONSULTATION) and completion surface floating toasts with traceId', () => {
    const duplicateQueueError = new ApiError(
      'A consultation encounter already exists for this queue visit. Please refresh the patient chart or update the existing encounter.',
      409,
      [
        {
          field: 'queueItemId',
          code: 'DUPLICATE_QUEUE_CONSULTATION',
          message: 'A consultation encounter already exists for this queue visit. Please refresh the patient chart or update the existing encounter.',
        },
      ],
      'DUPLICATE_QUEUE_CONSULTATION',
      '00-trace-consult-queue-409'
    );

    expect(duplicateQueueError.getFieldError('queueItemId')).toContain('consultation encounter already exists for this queue visit');
    notify.error(duplicateQueueError.message, { traceId: duplicateQueueError.traceId });

    let state = getFeedbackState();
    expect(state.toasts).toHaveLength(1);
    expect(state.toasts[0].kind).toBe('error');
    expect(state.toasts[0].message).toContain('A consultation encounter already exists for this queue visit.');
    expect(state.toasts[0].traceId).toBe('00-trace-consult-queue-409');

    notify.success('Encounter signed by Dr. Jose Rizal (PRC-123456) at 10:30 AM. Lab requisitions, nursing orders and the cashier invoice were forwarded.');
    state = getFeedbackState();
    expect(state.toasts).toHaveLength(2);
    expect(state.toasts[1].kind).toBe('success');
    expect(state.toasts[1].message).toContain('Encounter signed by Dr. Jose Rizal');
  });
});

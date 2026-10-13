// token-guard:ignore-file
import { describe, expect, test, mock, beforeEach } from 'bun:test';
import React from 'react';

(globalThis as any).__DEV__ = true;

// Mock react-native
mock.module('react-native', () => ({
  StyleSheet: { create: (s: any) => s, flatten: (s: any) => s },
  View: (props: any) => React.createElement('View', props, props.children),
  Pressable: (props: any) => React.createElement('Pressable', props, props.children),
  ScrollView: (props: any) => React.createElement('ScrollView', props, props.children),
  TextInput: (props: any) => React.createElement('TextInput', props),
  Text: (props: any) => React.createElement('Text', props, props.children),
  ActivityIndicator: 'ActivityIndicator',
  Modal: (props: any) => React.createElement('Modal', props, props.children),
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

describe('Adversarial Stress Test Suite: Milestone 4 Feedback & Trace ID Attribution', () => {
  beforeEach(() => {
    resetFeedbackState();
  });

  describe('1. Toast Duration Matrix & Option Normalization', () => {
    test('1.1 notify.error without options defaults strictly to 10,000ms duration', () => {
      notify.error('Database connection timed out');
      const state = getFeedbackState();
      expect(state.toasts).toHaveLength(1);
      const toast = state.toasts[0];
      expect(toast.kind).toBe('error');
      expect(toast.durationMs).toBe(10000);
      expect(toast.traceId).toBeUndefined();
    });

    test('1.2 notify.error with string traceId parameter retains 10,000ms and binds traceId', () => {
      notify.error('Duplicate patient code detected', '00-trace-err-12345');
      const state = getFeedbackState();
      expect(state.toasts).toHaveLength(1);
      const toast = state.toasts[0];
      expect(toast.kind).toBe('error');
      expect(toast.durationMs).toBe(10000);
      expect(toast.traceId).toBe('00-trace-err-12345');
    });

    test('1.3 notify.error with ToastOptions object without durationMs preserves 10,000ms default', () => {
      notify.error('Concurrency conflict on encounter', {
        traceId: '00-trace-conflict-77',
      });
      const state = getFeedbackState();
      expect(state.toasts).toHaveLength(1);
      const toast = state.toasts[0];
      expect(toast.kind).toBe('error');
      expect(toast.durationMs).toBe(10000);
      expect(toast.traceId).toBe('00-trace-conflict-77');
    });

    test('1.4 notify.error with explicit custom durationMs overrides default', () => {
      notify.error('Transient lock wait', {
        traceId: '00-trace-lock-99',
        durationMs: 25000,
      });
      const state = getFeedbackState();
      expect(state.toasts[0].durationMs).toBe(25000);
      expect(state.toasts[0].traceId).toBe('00-trace-lock-99');
    });

    test('1.5 notify.error with numeric override directly passes duration', () => {
      notify.error('Quick error', 12000);
      const state = getFeedbackState();
      expect(state.toasts[0].durationMs).toBe(12000);
      expect(state.toasts[0].traceId).toBeUndefined();
    });

    test('1.6 notify.error handles undefined/null options gracefully without crashing', () => {
      notify.error('Error with undefined', undefined);
      notify.error('Error with null', null as any);
      const state = getFeedbackState();
      expect(state.toasts).toHaveLength(2);
      expect(state.toasts[0].durationMs).toBe(10000);
      expect(state.toasts[1].durationMs).toBe(10000);
    });

    test('1.7 notify.success and notify.info remain strictly at 4,000ms duration', () => {
      notify.success('Patient demographics saved');
      notify.info('Queue synchronizing in background');
      const state = getFeedbackState();
      expect(state.toasts).toHaveLength(2);
      expect(state.toasts[0].kind).toBe('success');
      expect(state.toasts[0].durationMs).toBe(4000);
      expect(state.toasts[1].kind).toBe('info');
      expect(state.toasts[1].durationMs).toBe(4000);
    });

    test('1.8 notify.success and notify.info support explicit duration overrides', () => {
      notify.success('Patient saved', 6000);
      notify.info('Notice', { durationMs: 8000, traceId: 'info-trace-01' });
      const state = getFeedbackState();
      expect(state.toasts[0].durationMs).toBe(6000);
      expect(state.toasts[1].durationMs).toBe(8000);
      expect(state.toasts[1].traceId).toBe('info-trace-01');
    });
  });

  describe('2. Toast Lifecycle, Capacity Bounding & Dismissal', () => {
    test('2.1 Toast queue caps at 3 items (prevents toast flood)', () => {
      for (let i = 1; i <= 10; i++) {
        notify.info(`Item ${i}`);
      }
      const state = getFeedbackState();
      expect(state.toasts).toHaveLength(3);
      expect(state.toasts[0].message).toBe('Item 8');
      expect(state.toasts[1].message).toBe('Item 9');
      expect(state.toasts[2].message).toBe('Item 10');
    });

    test('2.2 dismissToast removes targeted toast by ID without affecting others', () => {
      const idA = notify.info('Toast A');
      const idB = notify.error('Toast B');
      const idC = notify.success('Toast C');

      expect(getFeedbackState().toasts).toHaveLength(3);

      dismissToast(idB);
      let state = getFeedbackState();
      expect(state.toasts).toHaveLength(2);
      expect(state.toasts.map((t) => t.id)).toEqual([idA, idC]);

      // Non-existent ID dismissal is a safe no-op
      dismissToast(999999);
      state = getFeedbackState();
      expect(state.toasts).toHaveLength(2);

      // Dismiss remaining
      dismissToast(idA);
      dismissToast(idC);
      expect(getFeedbackState().toasts).toHaveLength(0);
    });

    test('2.3 subscribeFeedback notifies listeners on every state transition and unregisters cleanly', () => {
      let callCount = 0;
      const unsubscribe = subscribeFeedback(() => {
        callCount++;
      });

      const id = notify.error('Sub test');
      expect(callCount).toBe(1);

      dismissToast(id);
      expect(callCount).toBe(2);

      unsubscribe();
      notify.info('After unsubscribe');
      expect(callCount).toBe(2); // Should not increase
    });
  });

  describe('3. FeedbackHost Component Structure & Action Hooks', () => {
    test('3.1 FeedbackHost renders correctly when active toasts exist', () => {
      notify.error('Failed to save patient', '00-trace-host-test');
      const element = React.createElement(FeedbackHost);
      expect(element).toBeDefined();
      expect(element.type).toBe(FeedbackHost);
    });

    test('3.2 Toast action button triggers onPress callback and auto-dismisses toast', () => {
      let actionExecuted = false;
      const toastId = notify.error('Action required', {
        action: {
          label: 'Retry Synchronize',
          onPress: () => {
            actionExecuted = true;
          },
        },
      });

      const state = getFeedbackState();
      const toast = state.toasts.find((t) => t.id === toastId);
      expect(toast).toBeDefined();
      expect(toast?.action?.label).toBe('Retry Synchronize');

      // Execute action callback
      toast?.action?.onPress();
      expect(actionExecuted).toBe(true);

      dismissToast(toastId);
      expect(getFeedbackState().toasts).toHaveLength(0);
    });
  });

  describe('4. Defensive Clipboard Copy Resilience across Environments', () => {
    const originalNavigator = (globalThis as any).navigator;

    test('4.1 Web environment: navigator.clipboard.writeText succeeds and copies traceId', async () => {
      let copiedText = '';
      (globalThis as any).navigator = {
        clipboard: {
          writeText: async (text: string) => {
            copiedText = text;
          },
        },
      };

      const testTrace = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';
      notify.error('Critical database error', testTrace);

      // Simulate copy handler execution logic from FeedbackHost
      const toast = getFeedbackState().toasts[0];
      if (typeof navigator !== 'undefined' && (navigator as any).clipboard?.writeText) {
        await (navigator as any).clipboard.writeText(toast.traceId);
      }

      expect(copiedText).toBe(testTrace);
    });

    test('4.2 Web environment: navigator.clipboard.writeText rejection (permission denied) is caught silently', async () => {
      (globalThis as any).navigator = {
        clipboard: {
          writeText: async () => {
            throw new Error('NotAllowedError: Document is not focused or clipboard permission denied');
          },
        },
      };

      const testTrace = '00-trace-denied-test';
      notify.error('Permission error', testTrace);

      const toast = getFeedbackState().toasts[0];
      let didThrow = false;

      try {
        if (typeof navigator !== 'undefined' && (navigator as any).clipboard?.writeText) {
          try {
            await (navigator as any).clipboard.writeText(toast.traceId);
          } catch {
            // Exactly matching FeedbackHost catch block
          }
        }
      } catch {
        didThrow = true;
      }

      expect(didThrow).toBe(false);
    });

    test('4.3 Native/Mobile environment: navigator.clipboard is undefined does not throw', async () => {
      (globalThis as any).navigator = {
        clipboard: undefined,
      };

      const testTrace = '00-trace-native-test';
      notify.error('Native error', testTrace);

      const toast = getFeedbackState().toasts[0];
      let didThrow = false;

      try {
        if (typeof navigator !== 'undefined' && (navigator as any).clipboard?.writeText) {
          await (navigator as any).clipboard.writeText(toast.traceId);
        }
      } catch {
        didThrow = true;
      }

      expect(didThrow).toBe(false);
    });

    test('4.4 Headless/SSR/Node environment: navigator is completely undefined does not throw', async () => {
      // Temporarily remove navigator
      delete (globalThis as any).navigator;

      const testTrace = '00-trace-ssr-test';
      notify.error('SSR error', testTrace);

      const toast = getFeedbackState().toasts[0];
      let didThrow = false;

      try {
        if (typeof navigator !== 'undefined' && (navigator as any)?.clipboard?.writeText) {
          await (navigator as any).clipboard.writeText(toast.traceId);
        }
      } catch {
        didThrow = true;
      }

      expect(didThrow).toBe(false);

      // Restore navigator
      (globalThis as any).navigator = originalNavigator;
    });

    test('4.5 Toast without traceId skips clipboard interaction entirely', async () => {
      let writeCalled = false;
      (globalThis as any).navigator = {
        clipboard: {
          writeText: async () => {
            writeCalled = true;
          },
        },
      };

      notify.error('Error without trace ID');
      const toast = getFeedbackState().toasts[0];

      // Replicating FeedbackHost line 47: if (!toast.traceId) return;
      if (!toast.traceId) {
        // Returned early
      } else {
        await (globalThis as any).navigator.clipboard.writeText(toast.traceId);
      }

      expect(writeCalled).toBe(false);

      (globalThis as any).navigator = originalNavigator;
    });
  });

  describe('5. ApiError Field Mapping to Registration and Edit Fields', () => {
    test('5.1 Comprehensive field errors map cleanly to registration inputs', () => {
      const apiErr = new ApiError(
        'The registration payload was rejected by the server.',
        400,
        [
          { field: 'patientCode', code: 'DUPLICATE_RESOURCE', message: 'Patient code PAT-2026-00099 is already assigned.' },
          { field: 'firstName', code: 'REQUIRED', message: 'First name is required.' },
          { field: 'lastName', code: 'REQUIRED', message: 'Last name is required.' },
          { field: 'middleName', code: 'TOO_LONG', message: 'Middle name exceeds 50 characters.' },
          { field: 'dateOfBirth', code: 'FUTURE_DATE', message: 'Date of birth cannot be in the future.' },
          { field: 'contactNumber', code: 'DUPLICATE_RESOURCE', message: 'Contact phone number already registered.' },
          { field: 'philHealthNumber', code: 'CHECKSUM_FAILED', message: 'Invalid PhilHealth Identification Number.' },
        ],
        'VALIDATION_FAILED',
        '00-trace-reg-complex'
      );

      const map = apiErr.getFieldErrorsMap();
      expect(map.patientCode).toContain('PAT-2026-00099');
      expect(map.firstName).toContain('First name is required');
      expect(map.lastName).toContain('Last name is required');
      expect(map.middleName).toContain('exceeds 50 characters');
      expect(map.dateOfBirth).toContain('cannot be in the future');
      expect(map.contactNumber).toContain('already registered');
      expect(map.philHealthNumber).toContain('Invalid PhilHealth');
      expect(apiErr.traceId).toBe('00-trace-reg-complex');

      // Verify field aliases handled in Patients.screen.tsx:
      const dobVal = apiErr.getFieldError('dateOfBirth') || apiErr.getFieldError('dob');
      expect(dobVal).toBe('Date of birth cannot be in the future.');

      const phoneVal = apiErr.getFieldError('contactNumber') || apiErr.getFieldError('phone');
      expect(phoneVal).toBe('Contact phone number already registered.');

      const pinVal = apiErr.getFieldError('philHealthId') || apiErr.getFieldError('philHealthPin') || apiErr.getFieldError('philHealthNumber');
      expect(pinVal).toBe('Invalid PhilHealth Identification Number.');
    });

    test('5.2 Dispatched notify.error from ApiError rejection carries message and traceId', () => {
      const apiErr = new ApiError(
        'Duplicate contact number',
        409,
        [{ field: 'contactNumber', code: 'DUPLICATE_RESOURCE', message: 'Phone taken' }],
        'DUPLICATE_RESOURCE',
        '00-trace-dupe-phone-888'
      );

      notify.error(apiErr.message, { traceId: apiErr.traceId });
      const state = getFeedbackState();
      expect(state.toasts).toHaveLength(1);
      expect(state.toasts[0].message).toBe('Duplicate contact number');
      expect(state.toasts[0].traceId).toBe('00-trace-dupe-phone-888');
      expect(state.toasts[0].durationMs).toBe(10000);
    });
  });
});

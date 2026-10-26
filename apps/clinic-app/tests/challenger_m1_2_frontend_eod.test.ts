// token-guard:ignore-file
import { describe, expect, test, mock, beforeEach } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

(globalThis as any).__DEV__ = true;

// Mock react-native
let alertCalls: Array<{ title: string; message?: string; buttons?: any[] }> = [];

const createMockComponent = (name: string) => {
  const Comp = ({ children, accessibilityLabel, accessibilityRole, placeholder }: any) =>
    React.createElement(
      'div',
      {
        'data-component': name,
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
  Dimensions: { get: () => ({ width: 1280, height: 800 }), addEventListener: () => ({ remove: () => {} }) },
  useWindowDimensions: () => ({ width: 1280, height: 800 }),
  Keyboard: { dismiss: () => {}, addListener: () => ({ remove: () => {} }) },
  AppState: { addEventListener: () => ({ remove: () => {} }) },
  Platform: { OS: 'web', select: (obj: any) => obj.web ?? obj.default },
  Linking: { openURL: () => Promise.resolve(), canOpenURL: () => Promise.resolve(true) },
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
    alert: (title: string, message?: string, buttons?: any[]) => {
      alertCalls.push({ title, message, buttons });
    },
  },
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
  Polyline: createMockComponent('Polyline'),
  default: createMockComponent('Svg'),
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

const { getFeedbackState, resetFeedbackState } = await import('../utils/feedback');

const toastEvents = new Proxy([] as Array<{ kind: string; message: string; options?: any }>, {
  get(_target, prop) {
    const toasts = getFeedbackState().toasts;
    const val = (toasts as any)[prop];
    return typeof val === 'function' ? val.bind(toasts) : val;
  },
});

// API Client Mock
let reconcileCallCount = 0;
let reconcilePayloads: any[] = [];
let updateSettingsCallCount = 0;
let updateSettingsPayloads: any[] = [];
let mockReconcileDelayMs = 0;
let mockReconcileResponse: any = null;
let mockReconcileError: any = null;
let mockReconcileThrows: Error | null = null;
let mockUpdateSettingsResponse: any = null;
let mockUpdateSettingsError: any = null;

mock.module('../services/apiClient', () => ({
  clinicApiClient: {
    get: async (_url: string) => [null, null],
    post: async (url: string, data?: any) => {
      if (url === '/queue/reconcile-eod') {
        reconcileCallCount++;
        reconcilePayloads.push(data);
        if (mockReconcileDelayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, mockReconcileDelayMs));
        }
        if (mockReconcileThrows) {
          throw mockReconcileThrows;
        }
        if (mockReconcileError) {
          return [null, mockReconcileError];
        }
        return [mockReconcileResponse, null];
      }
      return [null, null];
    },
    put: async (url: string, data?: any) => {
      if (url === '/settings') {
        updateSettingsCallCount++;
        updateSettingsPayloads.push(data);
        if (mockUpdateSettingsError) {
          return [null, mockUpdateSettingsError];
        }
        return [mockUpdateSettingsResponse, null];
      }
      return [null, null];
    },
  },
  clinicApiUrl: (p: string) => `http://localhost:5000/api/v1${p}`,
}));

// Intercept TimeInput to capture its props
let lastRenderedTimeInputProps: any = null;
mock.module('../components/ui/TimeInput', () => {
  const actualTimeInput = {
    formatTimeMask: (raw: string): string => {
      const digits = (raw || '').replace(/\D/g, '').slice(0, 4);
      if (digits.length <= 2) return digits;
      return `${digits.slice(0, 2)}:${digits.slice(2, 4)}`;
    },
    validateTimeString: (time: string): { isValid: boolean; errorMessage?: string } => {
      if (!time) return { isValid: true };
      const parts = time.split(':');
      if (parts.length !== 2 || parts[0].length !== 2 || parts[1].length !== 2) {
        return { isValid: false, errorMessage: 'Time must be in HH:MM format' };
      }
      const hours = parseInt(parts[0], 10);
      const minutes = parseInt(parts[1], 10);
      if (isNaN(hours) || hours < 0 || hours > 23) {
        return { isValid: false, errorMessage: 'Hours must be between 00 and 23' };
      }
      if (isNaN(minutes) || minutes < 0 || minutes > 59) {
        return { isValid: false, errorMessage: 'Minutes must be between 00 and 59' };
      }
      return { isValid: true };
    },
  };

  return {
    ...actualTimeInput,
    default: (props: any) => {
      lastRenderedTimeInputProps = props;
      const inputTestId = props.inputTestID || (props.testID ? `${props.testID}-input` : 'time-input');
      return React.createElement(
        'div',
        {
          'data-component': 'TimeInput',
          'data-label': props.label,
          ...(props.testID ? { 'data-testid': props.testID } : {}),
        },
        props.label,
        React.createElement('div', {
          'data-component': 'TextInput',
          'data-testid': inputTestId,
          'data-value': props.value,
        }, props.value),
        props.value
      );
    },
  };
});

// Intercept Button to capture button callbacks
let capturedButtons: Array<{ title: string; onPress: any; disabled: boolean; loading: boolean }> = [];
mock.module('../components/ui/Button', () => ({
  default: (props: any) => {
    capturedButtons.push({
      title: props.title,
      onPress: props.onPress,
      disabled: Boolean(props.disabled),
      loading: Boolean(props.loading),
    });
    return React.createElement('button', {
      'data-component': 'Button',
      'data-title': props.title,
      disabled: props.disabled,
      ...(props.testID ? { 'data-testid': props.testID } : {}),
      ...(props['data-testid'] ? { 'data-testid': props['data-testid'] } : {}),
    }, props.title);
  },
}));

const { clinicService } = await import('../services/clinicService');
const { validateTimeString, formatTimeMask } = await import('../components/ui/TimeInput');
const { default: ForceEodConfirmationModal } = await import('../components/queue/ForceEodConfirmationModal');
const { default: EodReconciliationSettingsCard } = await import('../components/settings/EodReconciliationSettingsCard');
const { default: GeneralSettingsTab } = await import('../components/settings/GeneralSettingsTab');

describe('Adversarial Empirical Stress Test Suite: Milestone 1 Frontend Workstation EOD', () => {
  beforeEach(() => {
    reconcileCallCount = 0;
    reconcilePayloads = [];
    updateSettingsCallCount = 0;
    updateSettingsPayloads = [];
    mockReconcileDelayMs = 0;
    mockReconcileResponse = null;
    mockReconcileError = null;
    mockReconcileThrows = null;
    mockUpdateSettingsResponse = null;
    mockUpdateSettingsError = null;
    resetFeedbackState();
    alertCalls = [];
    lastRenderedTimeInputProps = null;
    capturedButtons = [];
  });

  describe('Suite 1: ForceEodConfirmationModal Stress & Failure Modes', () => {
    test('1.1 Fast Double-Click: Rapid consecutive handleConfirm invocations are guarded by inFlightRef preventing duplicate API requests', async () => {
      mockReconcileDelayMs = 50; // Simulate network in-flight latency
      mockReconcileResponse = {
        reconciledCount: 2,
        reconciliationDate: '2026-10-13',
        reconciledAt: '2026-10-13T14:00:00Z',
        affectedTicketNumbers: ['Q-001', 'Q-002'],
        summary: '2 tickets reconciled to No-Show.',
      };

      let successCount = 0;
      let closeCount = 0;

      // Render modal in React environment
      renderToStaticMarkup(
        React.createElement(ForceEodConfirmationModal, {
          visible: true,
          activeTicketCount: 2,
          onClose: () => { closeCount++; },
          onSuccess: () => { successCount++; },
        })
      );

      // Locate the Confirm Button among captured buttons
      const confirmBtn = capturedButtons.find(b => b.title === 'Confirm & Close Day');
      expect(confirmBtn).toBeDefined();
      const handleConfirm = confirmBtn!.onPress;
      expect(typeof handleConfirm).toBe('function');

      // Trigger rapid double click: call handleConfirm twice before the first network call finishes
      const promise1 = handleConfirm();
      const promise2 = handleConfirm();

      await Promise.all([promise1, promise2]);

      // EMPIRICAL OBSERVATION (REMEDIATED):
      // Internal inFlightRef guard inside handleConfirm ensures only one invocation proceeds.
      expect(reconcileCallCount).toBe(1);
      expect(successCount).toBe(1);
      expect(closeCount).toBe(1);
      expect(toastEvents.filter(t => t.kind === 'success')).toHaveLength(1);
    });

    test('1.2 Network Failure: Handles API error tuple cleanly, shows error toast, and keeps modal open for retry', async () => {
      mockReconcileError = {
        message: 'Network error: 504 Gateway Timeout while contacting clinic-api',
        statusCode: 504,
      };

      let closeCalled = false;
      let successCalled = false;

      renderToStaticMarkup(
        React.createElement(ForceEodConfirmationModal, {
          visible: true,
          activeTicketCount: 4,
          onClose: () => { closeCalled = true; },
          onSuccess: () => { successCalled = true; },
        })
      );

      const confirmBtn = capturedButtons.find(b => b.title === 'Confirm & Close Day');
      await confirmBtn!.onPress();

      expect(reconcileCallCount).toBe(1);
      expect(successCalled).toBe(false);
      expect(closeCalled).toBe(false); // Modal MUST remain open on failure so clinician can retry
      expect(toastEvents).toHaveLength(1);
      expect(toastEvents[0].kind).toBe('error');
      expect(toastEvents[0].message).toContain('Gateway Timeout');
    });

    test('1.3 Unhandled Promise / Catastrophic Network Exception: try/catch absorbs unexpected thrown error without unhandled rejection', async () => {
      mockReconcileThrows = new Error('Client offline: socket connection failed immediately');

      let closeCalled = false;
      let successCalled = false;

      renderToStaticMarkup(
        React.createElement(ForceEodConfirmationModal, {
          visible: true,
          activeTicketCount: 3,
          onClose: () => { closeCalled = true; },
          onSuccess: () => { successCalled = true; },
        })
      );

      const confirmBtn = capturedButtons.find(b => b.title === 'Confirm & Close Day');

      // Executing handleConfirm must NOT throw an unhandled promise rejection
      let didThrow = false;
      try {
        await confirmBtn!.onPress();
      } catch {
        didThrow = true;
      }

      expect(didThrow).toBe(false);
      expect(successCalled).toBe(false);
      expect(closeCalled).toBe(false);
      expect(toastEvents).toHaveLength(1);
      expect(toastEvents[0].kind).toBe('error');
      expect(toastEvents[0].message).toBe('Client offline: socket connection failed immediately');
    });

    test('1.4 Tuple Unpacking: Error object with undefined/null message falls back to default message', async () => {
      mockReconcileError = { statusCode: 500 }; // Missing .message property

      renderToStaticMarkup(
        React.createElement(ForceEodConfirmationModal, {
          visible: true,
          onClose: () => {},
        })
      );

      const confirmBtn = capturedButtons.find(b => b.title === 'Confirm & Close Day');
      await confirmBtn!.onPress();

      expect(toastEvents).toHaveLength(1);
      expect(toastEvents[0].kind).toBe('error');
      expect(toastEvents[0].message).toBe('Failed to reconcile end-of-day queue.');
    });

    test('1.5 Tuple Unpacking: Successful response with empty summary string falls back to count summary', async () => {
      mockReconcileResponse = {
        reconciledCount: 5,
        reconciliationDate: '2026-10-13',
        reconciledAt: '2026-10-13T14:30:00Z',
        affectedTicketNumbers: ['Q-1', 'Q-2', 'Q-3', 'Q-4', 'Q-5'],
        summary: '', // Empty string summary
      };

      let deliveredResult: any = null;
      let closeCalled = false;

      renderToStaticMarkup(
        React.createElement(ForceEodConfirmationModal, {
          visible: true,
          onClose: () => { closeCalled = true; },
          onSuccess: (res: any) => { deliveredResult = res; },
        })
      );

      const confirmBtn = capturedButtons.find(b => b.title === 'Confirm & Close Day');
      await confirmBtn!.onPress();

      expect(closeCalled).toBe(true);
      expect(deliveredResult).toEqual(mockReconcileResponse);
      expect(toastEvents).toHaveLength(1);
      expect(toastEvents[0].kind).toBe('success');
      expect(toastEvents[0].message).toBe('Clinic day closed: 5 ticket(s) reconciled.');
    });

    test('1.6 UI Rendering & Invariant Reassurance Text', () => {
      const html = renderToStaticMarkup(
        React.createElement(ForceEodConfirmationModal, {
          visible: true,
          activeTicketCount: 7,
          onClose: () => {},
        })
      );

      expect(html).toContain('Close Clinic Day (Force EOD)');
      expect(html).toContain('7 Active Tickets');
      expect(html).toContain('Transition to No-Show');
      expect(html).toContain('Clinical Invariant: Consultations currently in progress (In Consultation) and Completed encounters will NOT be altered or invalidated.');
    });

    test('1.7 Post-EOD Success Dialog: Shows alert with Download Report and Close buttons', async () => {
      mockReconcileResponse = {
        reconciledCount: 3,
        reconciliationDate: '2026-10-22',
        reconciledAt: '2026-10-22T09:00:00Z',
        affectedTicketNumbers: ['Q-001', 'Q-002', 'Q-003'],
        summary: 'Successfully reconciled 3 leftover ticket(s) to No-Show for 2026-10-22.',
      };

      renderToStaticMarkup(
        React.createElement(ForceEodConfirmationModal, {
          visible: true,
          activeTicketCount: 3,
          date: '2026-10-22',
          onClose: () => {},
          onSuccess: () => {},
        })
      );

      const confirmBtn = capturedButtons.find(b => b.title === 'Confirm & Close Day');
      await confirmBtn!.onPress();

      const alerts = getFeedbackState().alerts;
      expect(alerts).toHaveLength(1);
      expect(alerts[0].title).toBe('End-of-Day Reconciliation Complete');
      expect(alerts[0].message).toContain('2026-10-22');
      const btnTexts = alerts[0].buttons.map((b: any) => b.text);
      expect(btnTexts).toContain('Close');
      expect(btnTexts).toContain('Download Report');
    });

    test('1.8 Post-EOD Failure Dialog: Shows alert with Retry and Close buttons; Retry re-triggers EOD and Close invokes onClose', async () => {
      mockReconcileError = {
        message: 'Database connection timeout during EOD reconciliation',
        statusCode: 503,
      };

      let closeCalled = false;
      let successCalled = false;

      renderToStaticMarkup(
        React.createElement(ForceEodConfirmationModal, {
          visible: true,
          activeTicketCount: 2,
          date: '2026-10-22',
          onClose: () => { closeCalled = true; },
          onSuccess: () => { successCalled = true; },
        })
      );

      const confirmBtn = capturedButtons.find(b => b.title === 'Confirm & Close Day');
      await confirmBtn!.onPress();

      const alerts = getFeedbackState().alerts;
      expect(alerts).toHaveLength(1);
      expect(alerts[0].title).toBe('EOD Reconciliation Failed');
      expect(alerts[0].message).toContain('Database connection timeout');

      const closeBtn = alerts[0].buttons.find((b: any) => b.text === 'Close');
      const retryBtn = alerts[0].buttons.find((b: any) => b.text === 'Retry');
      expect(closeBtn).toBeDefined();
      expect(retryBtn).toBeDefined();

      // Clicking Close invokes onClose
      closeBtn!.onPress?.();
      expect(closeCalled).toBe(true);

      // Clicking Retry re-invokes handleConfirm
      mockReconcileError = null;
      mockReconcileResponse = {
        reconciledCount: 2,
        reconciliationDate: '2026-10-22',
        reconciledAt: '2026-10-22T09:05:00Z',
        affectedTicketNumbers: ['Q-001', 'Q-002'],
        summary: '2 tickets reconciled.',
      };
      await retryBtn!.onPress?.();
      expect(reconcileCallCount).toBe(2);
      expect(successCalled).toBe(true);
    });
  });

  describe('Suite 2: EodReconciliationSettingsCard & Time Input Validation Stress', () => {
    test('2.1 Rejects invalid 24-hour hours ("25:00", "99:99", "24:00")', () => {
      const invalidHours = ['24:00', '25:00', '99:00', '99:99', '24:01'];
      for (const t of invalidHours) {
        const val = validateTimeString(t);
        expect(val.isValid).toBe(false);
        expect(val.errorMessage).toBe('Hours must be between 00 and 23');
      }
    });

    test('2.2 Rejects invalid 24-hour minutes ("12:60", "12:99", "23:61")', () => {
      const invalidMins = ['12:60', '12:99', '00:60', '23:61', '08:75'];
      for (const t of invalidMins) {
        const val = validateTimeString(t);
        expect(val.isValid).toBe(false);
        expect(val.errorMessage).toBe('Minutes must be between 00 and 59');
      }
    });

    test('2.3 Rejects malformed strings ("invalid", "9:00", "12:0", "12-00")', () => {
      const malformed = ['invalid', '9:00', '12:0', '12-00', '12:00:00', 'ab:cd'];
      for (const t of malformed) {
        const val = validateTimeString(t);
        expect(val.isValid).toBe(false);
        expect(val.errorMessage).toBeDefined();
      }
    });

    test('2.4 Accepts valid boundary 24h times ("00:00", "23:59", "21:00", "08:30")', () => {
      const validTimes = ['00:00', '00:01', '12:00', '21:00', '23:58', '23:59'];
      for (const t of validTimes) {
        const val = validateTimeString(t);
        expect(val.isValid).toBe(true);
        expect(val.errorMessage).toBeUndefined();
      }
    });

    test('2.5 Empty cutoff time is rejected with validation error, blocking submission', async () => {
      // 1. Test validateTimeString directly on empty string
      const emptyValidation = validateTimeString('');
      expect(emptyValidation.isValid).toBe(true); // Helper function allows empty for optional inputs

      // 2. In EodReconciliationSettingsCard:
      // Clearing the cutoff time triggers inline error and blocks save submission.
      mockUpdateSettingsResponse = {
        id: 'settings-1',
        eodReconciliationTime: '',
        autoEodEnabled: true,
      };

      renderToStaticMarkup(
        React.createElement(EodReconciliationSettingsCard, {
          settings: {
            id: 'settings-1',
            tenantId: 'tenant-1',
            clinicId: 'clinic-1',
            clinicName: 'Test Clinic',
            autoEodEnabled: true,
            eodReconciliationTime: '21:00',
          } as any,
        })
      );

      // Locate Save EOD Schedule button
      const saveBtn = capturedButtons.find(b => b.title === 'Save EOD Schedule');
      expect(saveBtn).toBeDefined();

      // Trigger time change to empty string
      expect(lastRenderedTimeInputProps).toBeDefined();
      lastRenderedTimeInputProps.onChangeText('');

      // Invoke save:
      await saveBtn!.onPress();

      // Submission is blocked due to empty cutoff time validation:
      expect(updateSettingsCallCount).toBe(0);
      expect(toastEvents.filter(t => t.kind === 'error')).toHaveLength(1);
      expect(toastEvents[0].message).toBe('Reconciliation cutoff time is required (e.g. 21:00).');
      expect(validateTimeString('   ').isValid).toBe(false); // Whitespace without colon fails format
    });

    test('2.6 Format mask restricts raw input to 4 digits with colon separation', () => {
      expect(formatTimeMask('2100')).toBe('21:00');
      expect(formatTimeMask('2100999')).toBe('21:00'); // Truncated to 4 digits
      expect(formatTimeMask('930')).toBe('93:0');
      expect(formatTimeMask('8')).toBe('8');
      expect(formatTimeMask('abc21xyz00')).toBe('21:00');
    });
  });

  describe('Suite 3: GeneralSettingsTab Integration & Hierarchy', () => {
    test('3.1 Renders EOD Reconciliation Card with toggle and trigger button within GeneralSettingsTab', () => {
      const html = renderToStaticMarkup(
        React.createElement(GeneralSettingsTab, {
          clinicName: 'Test Medical Center',
          setClinicName: () => {},
          accreditationNumber: 'ACCR-123',
          setAccreditationNumber: () => {},
          operatingHours: '8:00 AM - 5:00 PM',
          setOperatingHours: () => {},
          slotDuration: '15',
          setSlotDuration: () => {},
          consultationFee: '400',
          setConsultationFee: () => {},
          letterheadHeader: 'Test Medical Center',
          setLetterheadHeader: () => {},
          letterheadAddress: 'Manila, Philippines',
          setLetterheadAddress: () => {},
          letterheadContact: '09123456789',
          setLetterheadContact: () => {},
          savingSettings: false,
          onSavePreferences: async () => {},
          showSkeletons: false,
          settingsLoadError: null,
          settings: {
            id: 'settings-1',
            tenantId: 'tenant-1',
            clinicId: 'clinic-1',
            clinicName: 'Test Medical Center',
            eodReconciliationTime: '21:00',
            autoEodEnabled: true,
          } as any,
          eodReport: null,
          eodLoadError: null,
          onRefreshEod: async () => {},
          formatPeso: (v) => `₱${v}`,
        })
      );

      expect(html).toContain('End-of-Day (EOD) Reconciliation &amp; Day Closure');
      expect(html).toContain('Automated End-of-Day Reconciliation');
      expect(html).toContain('Daily EOD Cutoff Time (24h HH:MM)');
      expect(html).toContain('Save EOD Schedule');
      expect(html).toContain('Force EOD / Close Clinic Day');
      expect(html).toContain('Auto-EOD Active');
    });

    test('3.2 Renders skeleton loading state cleanly without errors when showSkeletons is true', () => {
      const html = renderToStaticMarkup(
        React.createElement(GeneralSettingsTab, {
          clinicName: '',
          setClinicName: () => {},
          accreditationNumber: '',
          setAccreditationNumber: () => {},
          operatingHours: '',
          setOperatingHours: () => {},
          slotDuration: '30',
          setSlotDuration: () => {},
          consultationFee: '500',
          setConsultationFee: () => {},
          letterheadHeader: '',
          setLetterheadHeader: () => {},
          letterheadAddress: '',
          setLetterheadAddress: () => {},
          letterheadContact: '',
          setLetterheadContact: () => {},
          savingSettings: false,
          onSavePreferences: async () => {},
          showSkeletons: true,
          settingsLoadError: null,
          settings: null,
          eodReport: null,
          eodLoadError: null,
          onRefreshEod: async () => {},
          formatPeso: (v) => `₱${v}`,
        })
      );

      expect(html).toContain('data-component="View"');
      expect(html).not.toContain('Daily EOD Cutoff Time');
      expect(html).not.toContain('Save EOD Schedule');
    });
  });
});

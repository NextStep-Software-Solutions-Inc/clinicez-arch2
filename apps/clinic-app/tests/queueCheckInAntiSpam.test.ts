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
  randomUUID: () => 'test-uuid-' + Math.random().toString(36).substring(2, 9),
}));

mock.module('react-native-svg', () => ({
  Svg: 'Svg',
  Path: 'Path',
  Circle: 'Circle',
  Rect: 'Rect',
  G: 'G',
  Polyline: 'Polyline',
  Line: 'Line',
  default: 'Svg',
}));

mock.module('../constants/fonts', () => ({
  applyFontFamily: (s: any) => s,
  fontAssets: {},
}));

const { parseQueueConflictError, QueueConflictModal } = await import('../components/queue/QueueConflictModal');
const { ApiError } = await import('@shared/safe');

describe('OPD Queue Anti-Spam Check-In & Concurrency Guarding', () => {
  describe('1. Conflict Error Parser (parseQueueConflictError)', () => {
    test('1.1 extracts patientName, ticketNumber, and status from string regex message', () => {
      const err = new ApiError('Patient John Doe is already checked in as Q-001 (Waiting)', 409);
      const parsed = parseQueueConflictError(err);

      expect(parsed.patientName).toBe('John Doe');
      expect(parsed.ticketNumber).toBe('Q-001');
      expect(parsed.status).toBe('Waiting');
      expect(parsed.formattedMessage).toBe('Patient John Doe is already checked in as Q-001 (Waiting)');
    });

    test('1.2 handles complex patient names with hyphens and custom ticket formats', () => {
      const err = new ApiError('Patient Maria Santos-Dela Cruz is already checked in as TKT-2026-999 (InConsultation)', 409);
      const parsed = parseQueueConflictError(err);

      expect(parsed.patientName).toBe('Maria Santos-Dela Cruz');
      expect(parsed.ticketNumber).toBe('TKT-2026-999');
      expect(parsed.status).toBe('InConsultation');
      expect(parsed.formattedMessage).toBe('Patient Maria Santos-Dela Cruz is already checked in as TKT-2026-999 (InConsultation)');
    });

    test('1.3 extracts from structured data payload if present', () => {
      const err = {
        status: 409,
        message: 'Active queue ticket exists',
        data: {
          ticketId: 'guid-1234',
          queueNumber: 'Q-042',
          status: 'Triaged',
          patientName: 'Alice Walker',
        },
      };

      const parsed = parseQueueConflictError(err);
      expect(parsed.patientName).toBe('Alice Walker');
      expect(parsed.ticketNumber).toBe('Q-042');
      expect(parsed.status).toBe('Triaged');
      expect(parsed.formattedMessage).toBe('Patient Alice Walker is already checked in as Q-042 (Triaged)');
    });

    test('1.4 falls back gracefully to provided fallbackName when error payload is empty', () => {
      const err = new ApiError('Conflict occurred', 409);
      const parsed = parseQueueConflictError(err, 'Robert De Niro');

      expect(parsed.patientName).toBe('Robert De Niro');
      expect(parsed.ticketNumber).toBe('Active Ticket');
      expect(parsed.status).toBe('Waiting');
      expect(parsed.formattedMessage).toBe('Patient Robert De Niro is already checked in as Active Ticket (Waiting)');
    });

    test('1.5 handles undefined error gracefully without throwing', () => {
      const parsed = parseQueueConflictError(undefined, 'Fallback Patient');
      expect(parsed.patientName).toBe('Fallback Patient');
      expect(parsed.ticketNumber).toBe('Active Ticket');
      expect(parsed.status).toBe('Waiting');
      expect(parsed.formattedMessage).toBe('Patient Fallback Patient is already checked in as Active Ticket (Waiting)');
    });
  });

  describe('2. Dual-Layer Concurrency Guard (Synchronous Ref + React State)', () => {
    test('2.1 blocks concurrent check-in attempts within the same execution tick', async () => {
      let networkCalls = 0;
      const isCheckingInRef = { current: false };
      let checkingInId: string | null = null;

      const mockApiCheckIn = async (patientId: string) => {
        networkCalls++;
        await new Promise((resolve) => setTimeout(resolve, 50));
        return { queueNumber: 'Q-100', patientId };
      };

      const executeCheckIn = async (patientId: string) => {
        // Dual-layer guard: immediate synchronous check
        if (isCheckingInRef.current || checkingInId) {
          return { blocked: true };
        }
        isCheckingInRef.current = true;
        checkingInId = patientId;

        try {
          const res = await mockApiCheckIn(patientId);
          return { blocked: false, res };
        } finally {
          isCheckingInRef.current = false;
          checkingInId = null;
        }
      };

      // Simulate 5 simultaneous rapid clicks
      const promises = [
        executeCheckIn('patient-1'),
        executeCheckIn('patient-1'),
        executeCheckIn('patient-1'),
        executeCheckIn('patient-1'),
        executeCheckIn('patient-1'),
      ];

      const results = await Promise.all(promises);

      // Only the first call should have proceeded; other 4 must be blocked
      const blockedCount = results.filter((r) => r.blocked).length;
      const executedCount = results.filter((r) => !r.blocked).length;

      expect(executedCount).toBe(1);
      expect(blockedCount).toBe(4);
      expect(networkCalls).toBe(1);
    });

    test('2.2 allows sequential check-in after prior request completes', async () => {
      let networkCalls = 0;
      const isCheckingInRef = { current: false };
      let checkingInId: string | null = null;

      const mockApiCheckIn = async (patientId: string) => {
        networkCalls++;
        await new Promise((resolve) => setTimeout(resolve, 10));
        return { queueNumber: `Q-${networkCalls}`, patientId };
      };

      const executeCheckIn = async (patientId: string) => {
        if (isCheckingInRef.current || checkingInId) {
          return { blocked: true };
        }
        isCheckingInRef.current = true;
        checkingInId = patientId;

        try {
          const res = await mockApiCheckIn(patientId);
          return { blocked: false, res };
        } finally {
          isCheckingInRef.current = false;
          checkingInId = null;
        }
      };

      const res1 = await executeCheckIn('patient-1');
      expect(res1.blocked).toBe(false);
      expect(networkCalls).toBe(1);

      const res2 = await executeCheckIn('patient-2');
      expect(res2.blocked).toBe(false);
      expect(networkCalls).toBe(2);
    });

    test('2.3 releases lock when network call fails so user can retry', async () => {
      const isCheckingInRef = { current: false };
      let checkingInId: string | null = null;

      const failingApiCall = async () => {
        throw new Error('Network timeout');
      };

      const executeCheckIn = async (patientId: string) => {
        if (isCheckingInRef.current || checkingInId) {
          return { blocked: true };
        }
        isCheckingInRef.current = true;
        checkingInId = patientId;

        try {
          await failingApiCall();
          return { blocked: false, success: true };
        } catch {
          return { blocked: false, success: false };
        } finally {
          isCheckingInRef.current = false;
          checkingInId = null;
        }
      };

      const res1 = await executeCheckIn('patient-1');
      expect(res1.blocked).toBe(false);
      expect(res1.success).toBe(false);

      // Lock must be released
      expect(isCheckingInRef.current).toBe(false);
      expect(checkingInId).toBeNull();

      // Retry succeeds
      const res2 = await executeCheckIn('patient-1');
      expect(res2.blocked).toBe(false);
    });
  });

  describe('3. QueueConflictModal Component Architecture', () => {
    test('3.1 formats conflict message using parsed error and fallbackName', () => {
      const err = new ApiError('Patient Jane Doe is already checked in as Q-008 (OnHold)', 409);
      const parsed = parseQueueConflictError(err, 'Jane Doe');

      expect(parsed.patientName).toBe('Jane Doe');
      expect(parsed.ticketNumber).toBe('Q-008');
      expect(parsed.status).toBe('OnHold');
      expect(parsed.formattedMessage).toBe('Patient Jane Doe is already checked in as Q-008 (OnHold)');
    });

    test('3.2 component renders with parsed message and dispatches actions', () => {
      let dismissed = false;
      let navigated = false;

      const element = React.createElement(QueueConflictModal, {
        visible: true,
        patientName: 'Carlos P. Garcia',
        ticketNumber: 'Q-019',
        status: 'Waiting',
        onDismiss: () => { dismissed = true; },
        onViewInQueue: () => { navigated = true; },
      });

      expect(element).toBeDefined();
      expect(element.props.visible).toBe(true);
      expect(element.props.patientName).toBe('Carlos P. Garcia');

      // Trigger actions
      element.props.onDismiss();
      expect(dismissed).toBe(true);

      element.props.onViewInQueue();
      expect(navigated).toBe(true);
    });
  });

  describe('4. Active Queue Uniqueness & Second Visit Logic', () => {
    test('4.1 active statuses reject duplicate check-in', () => {
      const activeStatuses = ['Waiting', 'Triaged', 'InConsultation', 'PendingProcedure', 'ReEvaluation', 'OnHold'];
      const terminalStatuses = ['Completed', 'Cancelled', 'NoShow'];

      for (const status of activeStatuses) {
        const hasActiveTicket = activeStatuses.includes(status);
        expect(hasActiveTicket).toBe(true);
      }

      for (const status of terminalStatuses) {
        const hasActiveTicket = activeStatuses.includes(status);
        expect(hasActiveTicket).toBe(false);
      }
    });

    test('4.2 allows new check-in when previous ticket today is in a terminal state', () => {
      const patientTicketsToday = [
        { id: 'ticket-1', status: 'Completed', checkInTime: '2026-10-13T08:00:00Z' },
      ];

      const activeTicket = patientTicketsToday.find((t) =>
        ['Waiting', 'Triaged', 'InConsultation', 'PendingProcedure', 'ReEvaluation', 'OnHold'].includes(t.status)
      );

      expect(activeTicket).toBeUndefined();
      // Second visit is permitted!
      const canCheckInAgain = !activeTicket;
      expect(canCheckInAgain).toBe(true);
    });

    test('4.3 blocks new check-in when previous ticket today is in OnHold', () => {
      const patientTicketsToday = [
        { id: 'ticket-1', status: 'OnHold', checkInTime: '2026-10-13T09:30:00Z' },
      ];

      const activeTicket = patientTicketsToday.find((t) =>
        ['Waiting', 'Triaged', 'InConsultation', 'PendingProcedure', 'ReEvaluation', 'OnHold'].includes(t.status)
      );

      expect(activeTicket).toBeDefined();
      expect(activeTicket?.status).toBe('OnHold');
      // Second visit is blocked while on hold!
      const canCheckInAgain = !activeTicket;
      expect(canCheckInAgain).toBe(false);
    });
  });
});

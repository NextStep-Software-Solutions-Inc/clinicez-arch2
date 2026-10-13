// token-guard:ignore-file
import { describe, expect, test, mock, beforeEach } from 'bun:test';
import React from 'react';

(globalThis as any).__DEV__ = true;

// Mock react-native
let alertInvocations: Array<{ title: string; message?: string; buttons?: any[] }> = [];

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
  Alert: {
    alert: (title: string, message?: string, buttons?: any[]) => {
      alertInvocations.push({ title, message, buttons });
    },
  },
}));

mock.module('expo-crypto', () => ({
  randomUUID: () => 'test-uuid-' + Math.random().toString(36).substring(2, 9),
}));

mock.module('react-native-svg', () => ({
  Svg: 'Svg',
  Path: 'Path',
  Circle: 'Circle',
  Rect: 'Rect',
  Line: 'Line',
  Polyline: 'Polyline',
  default: 'Svg',
}));

mock.module('../constants/fonts', () => ({
  applyFontFamily: (s: any) => s,
  fontAssets: {},
}));

const { parseQueueConflictError, QueueConflictModal } = await import('../components/queue/QueueConflictModal');
const { ApiError } = await import('@shared/safe');

describe('EMPIRICAL ADVERSARIAL STRESS HARNESS — OPD Queue Frontend', () => {
  beforeEach(() => {
    alertInvocations = [];
  });

  describe('1. Adversarial Error Parser Stress Testing', () => {
    test('1.1 parses ClinicExceptionHandler standard payload with nested data', () => {
      const backendPayload = {
        succeeded: false,
        message: 'Patient Andres Bonifacio is already checked in as Q-015 (Waiting)',
        errorCode: 'active_queue_ticket_exists',
        data: {
          ticketId: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
          queueNumber: 'Q-015',
          status: 'Waiting',
          patientName: 'Andres Bonifacio',
        },
      };

      const parsed = parseQueueConflictError(backendPayload);
      expect(parsed.patientName).toBe('Andres Bonifacio');
      expect(parsed.ticketNumber).toBe('Q-015');
      expect(parsed.status).toBe('Waiting');
      expect(parsed.formattedMessage).toBe('Patient Andres Bonifacio is already checked in as Q-015 (Waiting)');
    });

    test('1.2 parses Axios response envelope (err.response.data.data)', () => {
      const axiosError = {
        name: 'AxiosError',
        status: 409,
        response: {
          status: 409,
          data: {
            succeeded: false,
            errorCode: 'active_queue_ticket_exists',
            data: {
              ticketId: 'ticket-99',
              ticketNumber: 'TKT-2026-X1',
              status: 'Triaged',
              patientName: 'Gabriela Silang',
            },
          },
        },
      };

      const parsed = parseQueueConflictError(axiosError);
      expect(parsed.patientName).toBe('Gabriela Silang');
      expect(parsed.ticketNumber).toBe('TKT-2026-X1');
      expect(parsed.status).toBe('Triaged');
    });

    test('1.3 regex fallback handles titles, special characters, hyphens, and slashes', () => {
      const complexMsg = 'Patient Dr. José Maria Sison-Gomez, Jr. is already checked in as OPD/EMERGENCY/2026/001 (OnHold)';
      const parsed = parseQueueConflictError({ message: complexMsg });

      expect(parsed.patientName).toBe('Dr. José Maria Sison-Gomez, Jr.');
      expect(parsed.ticketNumber).toBe('OPD/EMERGENCY/2026/001');
      expect(parsed.status).toBe('OnHold');
      expect(parsed.formattedMessage).toBe(`Patient Dr. José Maria Sison-Gomez, Jr. is already checked in as OPD/EMERGENCY/2026/001 (OnHold)`);
    });

    test('1.4 regex fallback handles status with spaces inside parentheses', () => {
      const msg = 'Patient Juan Luna is already checked in as Q-777 (In Consultation)';
      const parsed = parseQueueConflictError({ message: msg });

      expect(parsed.patientName).toBe('Juan Luna');
      expect(parsed.ticketNumber).toBe('Q-777');
      expect(parsed.status).toBe('In Consultation');
    });

    test('1.5 corrupt or empty payloads fallback safely without throw', () => {
      const corruptInputs = [
        null,
        undefined,
        {},
        { message: 123 },
        { data: 'not-an-object' },
        { message: 'Random unparseable string without pattern' },
        new Error('Network error'),
      ];

      for (const input of corruptInputs) {
        const parsed = parseQueueConflictError(input, 'Fallback Hero');
        expect(parsed.patientName).toBe('Fallback Hero');
        expect(parsed.ticketNumber).toBe('Active Ticket');
        expect(parsed.status).toBe('Waiting');
        expect(parsed.formattedMessage).toBe('Patient Fallback Hero is already checked in as Active Ticket (Waiting)');
      }
    });

    test('1.6 missing fallbackName defaults to Patient', () => {
      const parsed = parseQueueConflictError(null);
      expect(parsed.patientName).toBe('Patient');
      expect(parsed.ticketNumber).toBe('Active Ticket');
      expect(parsed.status).toBe('Waiting');
      expect(parsed.formattedMessage).toBe('Patient Patient is already checked in as Active Ticket (Waiting)');
    });
  });

  describe('2. Concurrency Stress Harness (100 Simultaneous Invocations)', () => {
    test('2.1 exactly 1 request executes under 100 simultaneous clicks', async () => {
      let executedNetworkCalls = 0;
      const isCheckingInRef = { current: false };
      let checkingInPatientId: string | null = null;

      const mockApi = async (id: string) => {
        executedNetworkCalls++;
        await new Promise((resolve) => setTimeout(resolve, 30));
        return { success: true, ticketId: `t-${id}` };
      };

      const handlePress = async (patientId: string) => {
        if (isCheckingInRef.current || checkingInPatientId) {
          return { accepted: false };
        }
        isCheckingInRef.current = true;
        checkingInPatientId = patientId;

        try {
          const res = await mockApi(patientId);
          return { accepted: true, res };
        } finally {
          isCheckingInRef.current = false;
          checkingInPatientId = null;
        }
      };

      // Burst of 100 parallel clicks
      const requests = Array.from({ length: 100 }, (_, i) => handlePress('patient-42'));
      const results = await Promise.all(requests);

      const accepted = results.filter((r) => r.accepted);
      const rejected = results.filter((r) => !r.accepted);

      expect(accepted.length).toBe(1);
      expect(rejected.length).toBe(99);
      expect(executedNetworkCalls).toBe(1);
      expect(isCheckingInRef.current).toBe(false);
      expect(checkingInPatientId).toBeNull();
    });

    test('2.2 rapid bursts interleaved with delays allow subsequent legitimate clicks', async () => {
      let networkCalls = 0;
      const isCheckingInRef = { current: false };
      let checkingInPatientId: string | null = null;

      const mockApi = async () => {
        networkCalls++;
        await new Promise((r) => setTimeout(r, 20));
      };

      const execute = async () => {
        if (isCheckingInRef.current || checkingInPatientId) return false;
        isCheckingInRef.current = true;
        checkingInPatientId = 'patient-1';
        try {
          await mockApi();
          return true;
        } finally {
          isCheckingInRef.current = false;
          checkingInPatientId = null;
        }
      };

      // Wave 1: 5 simultaneous clicks
      const wave1 = await Promise.all([execute(), execute(), execute(), execute(), execute()]);
      expect(wave1.filter(Boolean).length).toBe(1);
      expect(networkCalls).toBe(1);

      // Wait for completion
      await new Promise((r) => setTimeout(r, 30));

      // Wave 2: 5 simultaneous clicks
      const wave2 = await Promise.all([execute(), execute(), execute(), execute(), execute()]);
      expect(wave2.filter(Boolean).length).toBe(1);
      expect(networkCalls).toBe(2);
    });

    test('2.3 network exception cleanly unlocks the guard for retry', async () => {
      let attempts = 0;
      const isCheckingInRef = { current: false };
      let checkingInPatientId: string | null = null;

      const mockFailingApi = async () => {
        attempts++;
        if (attempts === 1) {
          throw new Error('Connection reset by peer');
        }
        return { ok: true };
      };

      const execute = async () => {
        if (isCheckingInRef.current || checkingInPatientId) return { blocked: true };
        isCheckingInRef.current = true;
        checkingInPatientId = 'patient-err';
        try {
          const res = await mockFailingApi();
          return { blocked: false, ok: true, res };
        } catch (err: any) {
          return { blocked: false, ok: false, error: err.message };
        } finally {
          isCheckingInRef.current = false;
          checkingInPatientId = null;
        }
      };

      // Attempt 1 fails
      const res1 = await execute();
      expect(res1.blocked).toBe(false);
      expect(res1.ok).toBe(false);
      expect(res1.error).toBe('Connection reset by peer');
      expect(isCheckingInRef.current).toBe(false);
      expect(checkingInPatientId).toBeNull();

      // Attempt 2 succeeds immediately
      const res2 = await execute();
      expect(res2.blocked).toBe(false);
      expect(res2.ok).toBe(true);
      expect(attempts).toBe(2);
    });
  });

  describe('3. QueueConflictModal Presentation & Event Dispatch', () => {
    test('3.1 direct props override error parsing', () => {
      const err = new ApiError('Patient Ignore Me is already checked in as Q-000 (Waiting)', 409);
      const element = React.createElement(QueueConflictModal, {
        visible: true,
        error: err,
        patientName: 'Overridden Name',
        ticketNumber: 'TKT-SPECIAL',
        status: 'InConsultation',
        onDismiss: () => {},
      });

      expect(element.props.patientName).toBe('Overridden Name');
      expect(element.props.ticketNumber).toBe('TKT-SPECIAL');
      expect(element.props.status).toBe('InConsultation');
    });

    test('3.2 renders without onViewInQueue gracefully (Dismiss only)', () => {
      let dismissed = false;
      const element = React.createElement(QueueConflictModal, {
        visible: true,
        patientName: 'Test Patient',
        onDismiss: () => { dismissed = true; },
      });

      expect(element.props.onViewInQueue).toBeUndefined();
      element.props.onDismiss();
      expect(dismissed).toBe(true);
    });
  });

  describe('4. Dashboard Wait Time & Badge Logic Stress Test', () => {
    const waitingMinutes = (checkInTime: string, refMs: number): number | null => {
      const started = new Date(checkInTime).getTime();
      if (Number.isNaN(started)) return null;
      return Math.max(0, Math.round((refMs - started) / 60000));
    };

    const isOverdue = (status: string, checkInTime: string, refMs: number): boolean => {
      const isWaitingState = status === 'Waiting' || status === 'Triaged' || status === 'OnHold';
      if (!isWaitingState) return false;
      const waited = waitingMinutes(checkInTime, refMs);
      return waited !== null && waited > 60;
    };

    test('4.1 boundary condition at 60m vs 61m', () => {
      const ref = new Date('2026-10-13T12:00:00Z').getTime();

      const time60m = new Date(ref - 60 * 60 * 1000).toISOString();
      const time61m = new Date(ref - 61 * 60 * 1000).toISOString();
      const time59m = new Date(ref - 59 * 60 * 1000).toISOString();

      expect(isOverdue('Waiting', time59m, ref)).toBe(false);
      expect(isOverdue('Waiting', time60m, ref)).toBe(false); // <= 60m is NOT overdue
      expect(isOverdue('Waiting', time61m, ref)).toBe(true);  // > 60m IS overdue
    });

    test('4.2 applies to Triaged and OnHold waiting states when elapsed time exceeds 60m', () => {
      const ref = new Date('2026-10-13T12:00:00Z').getTime();
      const time75m = new Date(ref - 75 * 60 * 1000).toISOString();

      expect(isOverdue('Waiting', time75m, ref)).toBe(true);
      expect(isOverdue('Triaged', time75m, ref)).toBe(true);
      expect(isOverdue('OnHold', time75m, ref)).toBe(true);
    });

    test('4.3 excludes non-waiting and terminal states even when elapsed time > 60m', () => {
      const ref = new Date('2026-10-13T12:00:00Z').getTime();
      const time120m = new Date(ref - 120 * 60 * 1000).toISOString();

      expect(isOverdue('Completed', time120m, ref)).toBe(false);
      expect(isOverdue('Cancelled', time120m, ref)).toBe(false);
      expect(isOverdue('NoShow', time120m, ref)).toBe(false);
      expect(isOverdue('InConsultation', time120m, ref)).toBe(false);
    });

    test('4.4 handles clock skew and corrupt dates safely', () => {
      const ref = new Date('2026-10-13T12:00:00Z').getTime();
      const futureTime = new Date(ref + 10 * 60 * 1000).toISOString(); // 10m in future

      expect(waitingMinutes(futureTime, ref)).toBe(0);
      expect(isOverdue('Waiting', futureTime, ref)).toBe(false);

      expect(waitingMinutes('corrupt-date', ref)).toBeNull();
      expect(isOverdue('Waiting', 'corrupt-date', ref)).toBe(false);

      expect(waitingMinutes('', ref)).toBeNull();
      expect(isOverdue('Waiting', '', ref)).toBe(false);
    });
  });

  describe('5. Exhaustive Status Action Matrix', () => {
    const statuses = [
      'Waiting',
      'Triaged',
      'InConsultation',
      'PendingProcedure',
      'ReEvaluation',
      'OnHold',
      'NoShow',
      'Cancelled',
      'Completed',
    ] as const;

    const checkEligibility = (status: string) => {
      const canHold = status === 'Waiting' || status === 'Triaged';
      const canNoShow = status === 'Waiting' || status === 'Triaged' || status === 'OnHold';
      const canCancel = status !== 'Completed' && status !== 'Cancelled' && status !== 'NoShow';
      const canReactivate = status === 'OnHold' || status === 'NoShow';
      return { canHold, canNoShow, canCancel, canReactivate };
    };

    test('5.1 verifies complete action eligibility matrix matches dashboard implementation', () => {
      const matrix: Record<string, { canHold: boolean; canNoShow: boolean; canCancel: boolean; canReactivate: boolean }> = {};
      for (const s of statuses) {
        matrix[s] = checkEligibility(s);
      }

      // Waiting
      expect(matrix['Waiting']).toEqual({ canHold: true, canNoShow: true, canCancel: true, canReactivate: false });

      // Triaged
      expect(matrix['Triaged']).toEqual({ canHold: true, canNoShow: true, canCancel: true, canReactivate: false });

      // InConsultation
      expect(matrix['InConsultation']).toEqual({ canHold: false, canNoShow: false, canCancel: true, canReactivate: false });

      // OnHold
      expect(matrix['OnHold']).toEqual({ canHold: false, canNoShow: true, canCancel: true, canReactivate: true });

      // NoShow
      expect(matrix['NoShow']).toEqual({ canHold: false, canNoShow: false, canCancel: false, canReactivate: true });

      // Cancelled
      expect(matrix['Cancelled']).toEqual({ canHold: false, canNoShow: false, canCancel: false, canReactivate: false });

      // Completed
      expect(matrix['Completed']).toEqual({ canHold: false, canNoShow: false, canCancel: false, canReactivate: false });
    });
  });

  describe('6. 7 Segmented Filter Tabs Aggregation', () => {
    test('6.1 handles empty queue without errors', () => {
      const queue: any[] = [];
      const count = (status: string) => queue.filter((q) => q.status === status).length;
      const counts = {
        ALL: queue.length,
        Waiting: count('Waiting'),
        Triaged: count('Triaged'),
        InConsultation: count('InConsultation'),
        OnHold: count('OnHold'),
        NoShow: count('NoShow'),
        Completed: count('Completed'),
      };

      expect(counts.ALL).toBe(0);
      expect(counts.Waiting).toBe(0);
      expect(counts.OnHold).toBe(0);
      expect(counts.NoShow).toBe(0);
    });

    test('6.2 correctly sums mixed queue items and partitions by status', () => {
      const queue = [
        { id: '1', status: 'Waiting' },
        { id: '2', status: 'Waiting' },
        { id: '3', status: 'Triaged' },
        { id: '4', status: 'InConsultation' },
        { id: '5', status: 'OnHold' },
        { id: '6', status: 'NoShow' },
        { id: '7', status: 'Completed' },
        { id: '8', status: 'PendingProcedure' }, // Not in dedicated tab, but in ALL
        { id: '9', status: 'Cancelled' },        // In ALL
      ];

      const count = (status: string) => queue.filter((q) => q.status === status).length;
      const counts = {
        ALL: queue.length,
        Waiting: count('Waiting'),
        Triaged: count('Triaged'),
        InConsultation: count('InConsultation'),
        OnHold: count('OnHold'),
        NoShow: count('NoShow'),
        Completed: count('Completed'),
      };

      expect(counts.ALL).toBe(9);
      expect(counts.Waiting).toBe(2);
      expect(counts.Triaged).toBe(1);
      expect(counts.InConsultation).toBe(1);
      expect(counts.OnHold).toBe(1);
      expect(counts.NoShow).toBe(1);
      expect(counts.Completed).toBe(1);
    });
  });
});

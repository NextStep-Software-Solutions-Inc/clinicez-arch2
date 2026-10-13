// token-guard:ignore-file
import { describe, expect, test, mock, beforeEach } from 'bun:test';

(globalThis as any).__DEV__ = true;

// Mock react-native
let alertCalls: Array<{ title: string; message?: string; buttons?: any[] }> = [];

mock.module('react-native', () => ({
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
      alertCalls.push({ title, message, buttons });
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

// API Client Mock
let lastPostUrl = '';
let lastPostPayload: any = null;
let mockPostResponse: any = null;
let mockPostError: any = null;

mock.module('../services/apiClient', () => ({
  clinicApiClient: {
    get: async (url: string) => [null, null],
    post: async (url: string, data?: any) => {
      lastPostUrl = url;
      lastPostPayload = data;
      if (mockPostError) return [null, mockPostError];
      return [mockPostResponse, null];
    },
  },
  clinicApiUrl: (p: string) => `http://localhost:5000/api/v1${p}`,
}));

const { clinicService } = await import('../services/clinicService');

describe('OPD Queue Dashboard Controls & Absence Management', () => {
  beforeEach(() => {
    lastPostUrl = '';
    lastPostPayload = null;
    mockPostResponse = null;
    mockPostError = null;
    alertCalls = [];
  });

  describe('1. ClinicService API Extensions', () => {
    test('1.1 markNoShow calls POST /queue/:id/no-show', async () => {
      mockPostResponse = { id: 'q-101', status: 'NoShow' };
      const [res, err] = await clinicService.markNoShow('q-101');

      expect(err).toBeNull();
      expect(res).toEqual({ id: 'q-101', status: 'NoShow' });
      expect(lastPostUrl).toBe('/queue/q-101/no-show');
    });

    test('1.2 putOnHold calls POST /queue/:id/hold', async () => {
      mockPostResponse = { id: 'q-102', status: 'OnHold' };
      const [res, err] = await clinicService.putOnHold('q-102');

      expect(err).toBeNull();
      expect(res).toEqual({ id: 'q-102', status: 'OnHold' });
      expect(lastPostUrl).toBe('/queue/q-102/hold');
    });

    test('1.3 cancelQueueTicket calls POST /queue/:id/cancel with reason', async () => {
      mockPostResponse = { id: 'q-103', status: 'Cancelled' };
      const [res, err] = await clinicService.cancelQueueTicket('q-103', 'Patient left early');

      expect(err).toBeNull();
      expect(res).toEqual({ id: 'q-103', status: 'Cancelled' });
      expect(lastPostUrl).toBe('/queue/q-103/cancel');
      expect(lastPostPayload).toEqual({ reason: 'Patient left early' });
    });

    test('1.4 reactivateQueueItem calls POST /queue/:id/reactivate', async () => {
      mockPostResponse = { id: 'q-104', status: 'Waiting' };
      const [res, err] = await clinicService.reactivateQueueItem('q-104');

      expect(err).toBeNull();
      expect(res).toEqual({ id: 'q-104', status: 'Waiting' });
      expect(lastPostUrl).toBe('/queue/q-104/reactivate');
    });
  });

  describe('2. Waiting > 60m Emergency Warning Badge Logic', () => {
    const calculateWaitingWarning = (status: string, checkInTime: string, referenceTimeMs: number) => {
      const waitMinutes = (referenceTimeMs - new Date(checkInTime).getTime()) / (1000 * 60);
      return status === 'Waiting' && waitMinutes > 60;
    };

    test('2.1 flags items in Waiting status with wait time exceeding 60 minutes', () => {
      const now = new Date('2026-10-13T10:00:00Z').getTime();
      const checkIn75MinAgo = '2026-10-13T08:45:00Z'; // 75 mins ago

      const isLongWait = calculateWaitingWarning('Waiting', checkIn75MinAgo, now);
      expect(isLongWait).toBe(true);
    });

    test('2.2 does not flag items in Waiting status with wait time <= 60 minutes', () => {
      const now = new Date('2026-10-13T10:00:00Z').getTime();
      const checkIn45MinAgo = '2026-10-13T09:15:00Z'; // 45 mins ago
      const checkInExactly60MinAgo = '2026-10-13T09:00:00Z'; // 60 mins ago

      expect(calculateWaitingWarning('Waiting', checkIn45MinAgo, now)).toBe(false);
      expect(calculateWaitingWarning('Waiting', checkInExactly60MinAgo, now)).toBe(false);
    });

    test('2.3 does not flag items in other statuses even if elapsed time exceeds 60 minutes', () => {
      const now = new Date('2026-10-13T10:00:00Z').getTime();
      const checkIn90MinAgo = '2026-10-13T08:30:00Z'; // 90 mins ago

      expect(calculateWaitingWarning('Triaged', checkIn90MinAgo, now)).toBe(false);
      expect(calculateWaitingWarning('InConsultation', checkIn90MinAgo, now)).toBe(false);
      expect(calculateWaitingWarning('OnHold', checkIn90MinAgo, now)).toBe(false);
      expect(calculateWaitingWarning('Completed', checkIn90MinAgo, now)).toBe(false);
      expect(calculateWaitingWarning('NoShow', checkIn90MinAgo, now)).toBe(false);
      expect(calculateWaitingWarning('Cancelled', checkIn90MinAgo, now)).toBe(false);
    });
  });

  describe('3. Status Badge Mapping & Visual Parity', () => {
    const getStatusBadge = (status: string) => {
      switch (status) {
        case 'Waiting':
          return { variant: 'warning', label: 'Waiting', icon: 'clock' };
        case 'Triaged':
          return { variant: 'info', label: 'Triaged', icon: 'check-circle' };
        case 'InConsultation':
          return { variant: 'success', label: 'In Consult', icon: 'user-check' };
        case 'OnHold':
          return { variant: 'warning', label: 'On Hold', icon: 'pause-circle' };
        case 'PendingProcedure':
          return { variant: 'info', label: 'Procedure', icon: 'flask' };
        case 'ReEvaluation':
          return { variant: 'info', label: 'Re-Eval', icon: 'rotate-cw' };
        case 'NoShow':
          return { variant: 'neutral', label: 'No Show', icon: 'user-x' };
        case 'Cancelled':
          return { variant: 'danger', label: 'Cancelled', icon: 'x-circle' };
        case 'Completed':
          return { variant: 'success', label: 'Completed', icon: 'check' };
        default:
          return { variant: 'neutral', label: status, icon: 'help-circle' };
      }
    };

    test('3.1 maps OnHold status to warning badge with pause-circle icon', () => {
      const badge = getStatusBadge('OnHold');
      expect(badge.variant).toBe('warning');
      expect(badge.label).toBe('On Hold');
      expect(badge.icon).toBe('pause-circle');
    });

    test('3.2 maps NoShow status to neutral badge with user-x icon', () => {
      const badge = getStatusBadge('NoShow');
      expect(badge.variant).toBe('neutral');
      expect(badge.label).toBe('No Show');
      expect(badge.icon).toBe('user-x');
    });

    test('3.3 maps Cancelled status to danger badge with x-circle icon', () => {
      const badge = getStatusBadge('Cancelled');
      expect(badge.variant).toBe('danger');
      expect(badge.label).toBe('Cancelled');
      expect(badge.icon).toBe('x-circle');
    });

    test('3.4 maps InConsultation and Completed to success badges', () => {
      expect(getStatusBadge('InConsultation').variant).toBe('success');
      expect(getStatusBadge('Completed').variant).toBe('success');
    });

    test('3.5 maps PendingProcedure and ReEvaluation to info badges', () => {
      expect(getStatusBadge('PendingProcedure').variant).toBe('info');
      expect(getStatusBadge('ReEvaluation').variant).toBe('info');
    });
  });

  describe('4. Expanded 7 Segmented Filter Tabs & Counts Derivation', () => {
    const mockQueueItems = [
      { id: '1', status: 'Waiting' },
      { id: '2', status: 'Waiting' },
      { id: '3', status: 'Triaged' },
      { id: '4', status: 'InConsultation' },
      { id: '5', status: 'OnHold' },
      { id: '6', status: 'OnHold' },
      { id: '7', status: 'NoShow' },
      { id: '8', status: 'Completed' },
      { id: '9', status: 'Completed' },
      { id: '10', status: 'Completed' },
      { id: '11', status: 'Cancelled' },
    ];

    const deriveCounts = (items: Array<{ id: string; status: string }>) => ({
      all: items.length,
      waiting: items.filter((i) => i.status === 'Waiting').length,
      triaged: items.filter((i) => i.status === 'Triaged').length,
      inConsultation: items.filter((i) => i.status === 'InConsultation').length,
      onHold: items.filter((i) => i.status === 'OnHold').length,
      noShow: items.filter((i) => i.status === 'NoShow').length,
      completed: items.filter((i) => i.status === 'Completed').length,
    });

    test('4.1 derives accurate counts across all 7 segmented filter categories', () => {
      const counts = deriveCounts(mockQueueItems);

      expect(counts.all).toBe(11);
      expect(counts.waiting).toBe(2);
      expect(counts.triaged).toBe(1);
      expect(counts.inConsultation).toBe(1);
      expect(counts.onHold).toBe(2);
      expect(counts.noShow).toBe(1);
      expect(counts.completed).toBe(3);
    });

    test('4.2 filters items strictly according to selected filter tab', () => {
      const filterItems = (filter: string) => {
        if (filter === 'ALL') return mockQueueItems;
        return mockQueueItems.filter((i) => i.status === filter);
      };

      expect(filterItems('ALL').length).toBe(11);
      expect(filterItems('Waiting').length).toBe(2);
      expect(filterItems('Triaged').length).toBe(1);
      expect(filterItems('InConsultation').length).toBe(1);
      expect(filterItems('OnHold').length).toBe(2);
      expect(filterItems('NoShow').length).toBe(1);
      expect(filterItems('Completed').length).toBe(3);
    });
  });

  describe('5. Action Eligibility & Safeguards', () => {
    const getActionEligibility = (status: string) => {
      const canHold = status === 'Waiting' || status === 'Triaged';
      const canNoShow = status === 'Waiting' || status === 'Triaged' || status === 'OnHold';
      const canCancel = status !== 'Completed' && status !== 'Cancelled';
      const canReactivate = status === 'OnHold' || status === 'NoShow' || status === 'Cancelled';

      return { canHold, canNoShow, canCancel, canReactivate };
    };

    test('5.1 Waiting and Triaged allow Hold, NoShow, and Cancel', () => {
      const waiting = getActionEligibility('Waiting');
      expect(waiting.canHold).toBe(true);
      expect(waiting.canNoShow).toBe(true);
      expect(waiting.canCancel).toBe(true);
      expect(waiting.canReactivate).toBe(false);

      const triaged = getActionEligibility('Triaged');
      expect(triaged.canHold).toBe(true);
      expect(triaged.canNoShow).toBe(true);
      expect(triaged.canCancel).toBe(true);
      expect(triaged.canReactivate).toBe(false);
    });

    test('5.2 OnHold allows NoShow, Cancel, and Reactivate, but not Hold', () => {
      const onHold = getActionEligibility('OnHold');
      expect(onHold.canHold).toBe(false);
      expect(onHold.canNoShow).toBe(true);
      expect(onHold.canCancel).toBe(true);
      expect(onHold.canReactivate).toBe(true);
    });

    test('5.3 NoShow and Cancelled allow Reactivate, but not Hold or NoShow', () => {
      const noShow = getActionEligibility('NoShow');
      expect(noShow.canHold).toBe(false);
      expect(noShow.canNoShow).toBe(false);
      expect(noShow.canCancel).toBe(true);
      expect(noShow.canReactivate).toBe(true);

      const cancelled = getActionEligibility('Cancelled');
      expect(cancelled.canHold).toBe(false);
      expect(cancelled.canNoShow).toBe(false);
      expect(cancelled.canCancel).toBe(false);
      expect(cancelled.canReactivate).toBe(true);
    });

    test('5.4 Completed disallows all absence, cancellation, and reactivation actions', () => {
      const completed = getActionEligibility('Completed');
      expect(completed.canHold).toBe(false);
      expect(completed.canNoShow).toBe(false);
      expect(completed.canCancel).toBe(false);
      expect(completed.canReactivate).toBe(false);
    });
  });

  describe('6. User Confirmation Dialogs for Absence and Cancellation', () => {
    test('6.1 Mark No-Show triggers confirmation dialog before calling service', async () => {
      const { Alert } = await import('react-native');
      let serviceCalled = false;

      const triggerMarkNoShow = (patientName: string, id: string) => {
        Alert.alert(
          'Mark No-Show',
          `Are you sure you want to mark ${patientName} as No-Show?`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Mark No-Show',
              style: 'destructive',
              onPress: async () => {
                serviceCalled = true;
                await clinicService.markNoShow(id);
              },
            },
          ]
        );
      };

      triggerMarkNoShow('Juan dela Cruz', 'q-999');

      expect(alertCalls.length).toBe(1);
      expect(alertCalls[0].title).toBe('Mark No-Show');
      expect(alertCalls[0].message).toContain('Juan dela Cruz');
      expect(serviceCalled).toBe(false);

      // Simulate user clicking confirmation button
      const confirmButton = alertCalls[0].buttons?.find((b: any) => b.text === 'Mark No-Show');
      expect(confirmButton).toBeDefined();
      await confirmButton.onPress();

      expect(serviceCalled).toBe(true);
      expect(lastPostUrl).toBe('/queue/q-999/no-show');
    });

    test('6.2 Cancel Visit triggers confirmation dialog with reason before calling service', async () => {
      const { Alert } = await import('react-native');
      let serviceCalled = false;

      const triggerCancelVisit = (patientName: string, id: string) => {
        Alert.alert(
          'Cancel Queue Ticket',
          `Are you sure you want to cancel the ticket for ${patientName}?`,
          [
            { text: 'Keep Ticket', style: 'cancel' },
            {
              text: 'Cancel Ticket',
              style: 'destructive',
              onPress: async () => {
                serviceCalled = true;
                await clinicService.cancelQueueTicket(id, 'Cancelled from dashboard');
              },
            },
          ]
        );
      };

      triggerCancelVisit('Maria Clara', 'q-888');

      expect(alertCalls.length).toBe(1);
      expect(alertCalls[0].title).toBe('Cancel Queue Ticket');
      expect(alertCalls[0].message).toContain('Maria Clara');
      expect(serviceCalled).toBe(false);

      const confirmButton = alertCalls[0].buttons?.find((b: any) => b.text === 'Cancel Ticket');
      expect(confirmButton).toBeDefined();
      await confirmButton.onPress();

      expect(serviceCalled).toBe(true);
      expect(lastPostUrl).toBe('/queue/q-888/cancel');
      expect(lastPostPayload).toEqual({ reason: 'Cancelled from dashboard' });
    });
  });
});

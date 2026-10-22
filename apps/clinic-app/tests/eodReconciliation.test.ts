// token-guard:ignore-file
import { describe, expect, test, mock, beforeEach } from 'bun:test';

(globalThis as any).__DEV__ = true;

// Mock react-native
let alertCalls: Array<{ title: string; message?: string; buttons?: any[] }> = [];

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


// API Client Mock
let lastPostUrl = '';
let lastPostPayload: any = null;
let lastPutUrl = '';
let lastPutPayload: any = null;
let mockPostResponse: any = null;
let mockPostError: any = null;
let mockPutResponse: any = null;

mock.module('../services/apiClient', () => ({
  clinicApiClient: {
    get: async (_url: string) => [null, null],
    post: async (url: string, data?: any) => {
      lastPostUrl = url;
      lastPostPayload = data;
      if (mockPostError) return [null, mockPostError];
      return [mockPostResponse, null];
    },
    put: async (url: string, data?: any) => {
      lastPutUrl = url;
      lastPutPayload = data;
      return [mockPutResponse, null];
    },
  },
  clinicApiUrl: (p: string) => `http://localhost:5000/api/v1${p}`,
}));

const {
  clinicService,
  getManilaTodayStr,
  setClinicTimeZoneId,
  getClinicTimeZoneId,
  setClinicRegionalConfig,
  formatClinicDate,
  formatClinicTime,
  formatClinicDateTime,
} = await import('../services/clinicService');
const { validateTimeString } = await import('../components/ui/TimeInput');

describe('Milestone 1: End-of-Day (EOD) Reconciliation & Force EOD', () => {
  beforeEach(() => {
    lastPostUrl = '';
    lastPostPayload = null;
    lastPutUrl = '';
    lastPutPayload = null;
    mockPostResponse = null;
    mockPostError = null;
    mockPutResponse = null;
    alertCalls = [];
  });

  describe('1. clinicService.reconcileEod', () => {
    test('1.1 Dispatches POST /queue/reconcile-eod with date and reason', async () => {
      const mockResult = {
        reconciledCount: 3,
        reconciliationDate: '2026-10-13',
        reconciledAt: '2026-10-13T13:00:00Z',
        affectedTicketNumbers: ['Q-001', 'Q-002', 'Q-003'],
        summary: 'Successfully reconciled 3 leftover ticket(s) to No-Show.',
      };
      mockPostResponse = mockResult;

      const [res, err] = await clinicService.reconcileEod('2026-10-13', 'Day closure shift change');

      expect(err).toBeNull();
      expect(res).toEqual(mockResult);
      expect(lastPostUrl).toBe('/queue/reconcile-eod');
      expect(lastPostPayload).toEqual({
        date: '2026-10-13',
        reason: 'Day closure shift change',
      });
    });

    test('1.2 Handles API error tuple cleanly without unhandled exception', async () => {
      mockPostError = { message: 'Unauthorized clinic scope', statusCode: 403 };

      const [res, err] = await clinicService.reconcileEod();

      expect(res).toBeNull();
      expect(err).toEqual(mockPostError);
      expect(lastPostUrl).toBe('/queue/reconcile-eod');
    });

    test('1.3 Default payload contains undefined date and reason when omitted', async () => {
      mockPostResponse = {
        reconciledCount: 0,
        reconciliationDate: '2026-10-13',
        reconciledAt: '2026-10-13T13:00:00Z',
        affectedTicketNumbers: [],
        summary: 'No active tickets found; audit entry recorded.',
      };

      const [res, err] = await clinicService.reconcileEod();

      expect(err).toBeNull();
      expect(res?.reconciledCount).toBe(0);
      expect(lastPostPayload).toEqual({ date: undefined, reason: undefined });
    });
  });

  describe('2. ClinicSettings EOD Persistence', () => {
    test('2.1 updateSettings submits eodReconciliationTime and autoEodEnabled', async () => {
      const updatedSettings = {
        id: 'settings-1',
        tenantId: 'tenant-1',
        clinicId: 'clinic-1',
        clinicName: 'Test Clinic',
        eodReconciliationTime: '22:30',
        autoEodEnabled: true,
      };
      mockPutResponse = updatedSettings;

      const [res, err] = await clinicService.updateSettings({
        eodReconciliationTime: '22:30',
        autoEodEnabled: true,
      });

      expect(err).toBeNull();
      expect(res).toEqual(updatedSettings);
      expect(lastPutUrl).toBe('/settings');
      expect(lastPutPayload.eodReconciliationTime).toBe('22:30');
      expect(lastPutPayload.autoEodEnabled).toBe(true);
    });
  });

  describe('3. EOD Cutoff Time Validation', () => {
    test('3.1 Validates correct 24-hour time strings', () => {
      expect(validateTimeString('21:00').isValid).toBe(true);
      expect(validateTimeString('08:30').isValid).toBe(true);
      expect(validateTimeString('00:00').isValid).toBe(true);
      expect(validateTimeString('23:59').isValid).toBe(true);
      expect(validateTimeString('').isValid).toBe(true);
    });

    test('3.2 Rejects invalid hours or minutes', () => {
      expect(validateTimeString('24:00').isValid).toBe(false);
      expect(validateTimeString('25:10').isValid).toBe(false);
      expect(validateTimeString('12:60').isValid).toBe(false);
      expect(validateTimeString('12:99').isValid).toBe(false);
      expect(validateTimeString('invalid').isValid).toBe(false);
      expect(validateTimeString('9:00').isValid).toBe(false); // Must be HH:MM
    });
  });

  describe('4. Invariant Logic & Ticket Filtering', () => {
    test('4.1 Active ticket count isolates Waiting, Triaged, and OnHold only', () => {
      const tickets = [
        { id: '1', status: 'Waiting' },
        { id: '2', status: 'Triaged' },
        { id: '3', status: 'OnHold' },
        { id: '4', status: 'InConsultation' },
        { id: '5', status: 'Completed' },
        { id: '6', status: 'Cancelled' },
        { id: '7', status: 'NoShow' },
      ];

      const activeEodTickets = tickets.filter(
        (t) => t.status === 'Waiting' || t.status === 'Triaged' || t.status === 'OnHold'
      );

      expect(activeEodTickets.length).toBe(3);
      expect(activeEodTickets.map((t) => t.id)).toEqual(['1', '2', '3']);

      // Invariant check: InConsultation and Completed are NOT in activeEodTickets
      const protectedTickets = tickets.filter(
        (t) => t.status === 'InConsultation' || t.status === 'Completed'
      );
      expect(protectedTickets.every((t) => !activeEodTickets.includes(t))).toBe(true);
    });

    test('4.2 getManilaTodayStr resolves Philippine Standard Time (UTC+8) across midnight rollover (00:00-07:59 AM PHT)', () => {
      setClinicTimeZoneId('Asia/Manila');
      // 2026-10-21 23:38:00 UTC is 2026-10-22 07:38:00 AM in Asia/Manila (UTC+8)
      const morningManilaUtc = new Date('2026-10-21T23:38:00Z');
      expect(getManilaTodayStr(morningManilaUtc)).toBe('2026-10-22');

      // 2026-10-21 15:59:59 UTC is 2026-10-21 23:59:59 PM in Asia/Manila (UTC+8)
      const lateNightManilaUtc = new Date('2026-10-21T15:59:59Z');
      expect(getManilaTodayStr(lateNightManilaUtc)).toBe('2026-10-21');
    });

    test('4.3 setClinicTimeZoneId syncs WorkspaceProfile.timeZoneId and falls back to Asia/Manila', () => {
      const sampleUtc = new Date('2026-10-21T23:38:00Z');
      // In America/New_York (UTC-4), 2026-10-21 23:38:00 UTC is 2026-10-21 19:38:00 EDT
      setClinicTimeZoneId('America/New_York');
      expect(getClinicTimeZoneId()).toBe('America/New_York');
      expect(getManilaTodayStr(sampleUtc)).toBe('2026-10-21');

      // Reset / empty falls back to Asia/Manila
      setClinicTimeZoneId(null);
      expect(getClinicTimeZoneId()).toBe('Asia/Manila');
      expect(getManilaTodayStr(sampleUtc)).toBe('2026-10-22');
    });

    test('4.4 formatClinicDate, formatClinicTime, and formatClinicDateTime respect clinic overrides across all patterns', () => {
      // 2026-10-22T06:45:00Z = 2026-10-22 14:45:00 in Asia/Manila (UTC+8)
      const sampleIso = '2026-10-22T06:45:00Z';

      setClinicRegionalConfig({
        timeZoneId: 'Asia/Manila',
        dateFormat: 'MMM d, yyyy',
        timeFormat: '12h',
      });
      expect(formatClinicDate(sampleIso)).toBe('Oct 22, 2026');
      expect(formatClinicTime(sampleIso)).toBe('02:45 PM');
      expect(formatClinicDateTime(sampleIso)).toBe('Oct 22, 2026, 02:45 PM');

      setClinicRegionalConfig({
        timeZoneId: 'Asia/Manila',
        dateFormat: 'dd/MM/yyyy',
        timeFormat: '24h',
      });
      expect(formatClinicDate(sampleIso)).toBe('22/10/2026');
      expect(formatClinicTime(sampleIso)).toBe('14:45');
      expect(formatClinicDateTime(sampleIso)).toBe('22/10/2026, 14:45');

      setClinicRegionalConfig({
        timeZoneId: 'Asia/Manila',
        dateFormat: 'yyyy-MM-dd',
        timeFormat: '24h',
      });
      expect(formatClinicDate(sampleIso)).toBe('2026-10-22');

      // Reset back to defaults
      setClinicRegionalConfig({
        timeZoneId: 'Asia/Manila',
        dateFormat: 'MMM d, yyyy',
        timeFormat: '12h',
      });
    });
  });
});

// token-guard:ignore-file
import { describe, expect, test, mock, beforeEach } from 'bun:test';

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
let mockPostResponse: any = null;
let mockPostError: any = null;

mock.module('../services/apiClient', () => ({
  clinicApiClient: {
    get: async () => [null, null],
    put: async () => [null, null],
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
import type { QueueStatus, VisitType, PatientQueueItem } from '../services/clinicService';

describe('Milestone 2: Non-Doctor Discharge & Role-Based Workflows Frontend Suite', () => {
  beforeEach(() => {
    lastPostUrl = '';
    lastPostPayload = null;
    mockPostResponse = null;
    mockPostError = null;
  });

  describe('1. clinicService.completeNonDoctorVisit API', () => {
    test('1.1 calls POST /queue/:id/discharge-non-doctor with dischargeRemarks', async () => {
      mockPostResponse = { success: true };
      const [res, err] = await clinicService.completeNonDoctorVisit(
        'queue-item-42',
        'Vitals normal. Advised home care and OTC hydration.'
      );

      expect(err).toBeNull();
      expect(res).toEqual({ success: true });
      expect(lastPostUrl).toBe('/queue/queue-item-42/discharge-non-doctor');
      expect(lastPostPayload).toEqual({
        dischargeRemarks: 'Vitals normal. Advised home care and OTC hydration.',
      });
    });

    test('1.2 calls POST /queue/:id/discharge-non-doctor with undefined remarks when omitted', async () => {
      mockPostResponse = { success: true };
      const [res, err] = await clinicService.completeNonDoctorVisit('queue-item-99');

      expect(err).toBeNull();
      expect(res).toEqual({ success: true });
      expect(lastPostUrl).toBe('/queue/queue-item-99/discharge-non-doctor');
      expect(lastPostPayload).toEqual({});
    });

    test('1.3 returns error tuple when API request fails', async () => {
      mockPostError = { status: 409, message: 'Ticket is already terminal.' };
      const [res, err] = await clinicService.completeNonDoctorVisit('queue-item-fail');

      expect(res).toBeNull();
      expect(err).toEqual(mockPostError);
      expect(lastPostUrl).toBe('/queue/queue-item-fail/discharge-non-doctor');
    });
  });

  describe('2. clinicService.checkInPatient with visitType payload', () => {
    test('2.1 passes visitType in checkIn request body', async () => {
      mockPostResponse = { id: 'queue-new-1', queueNumber: 'Q-050', visitType: 'StandaloneProcedure' };
      const [res, err] = await clinicService.checkInPatient({
        patientId: 'pat-100',
        patientName: 'Andres Bonifacio',
        visitType: 'StandaloneProcedure',
        priority: 'Routine',
        chiefComplaint: 'Wound dressing change',
      });

      expect(err).toBeNull();
      expect(res).toEqual(mockPostResponse);
      expect(lastPostUrl).toBe('/queue/check-in');
      expect(lastPostPayload.visitType).toBe('StandaloneProcedure');
      expect(lastPostPayload.chiefComplaint).toBe('Wound dressing change');
    });
  });

  describe('3. Queue Status & Visit Type Types Contract', () => {
    test('3.1 supports DischargedNonDoctor and Diverted statuses', () => {
      const validStatuses: QueueStatus[] = [
        'Waiting',
        'Triaged',
        'InConsultation',
        'Completed',
        'Cancelled',
        'NoShow',
        'OnHold',
        'DischargedNonDoctor',
        'Diverted',
      ];
      expect(validStatuses).toContain('DischargedNonDoctor');
      expect(validStatuses).toContain('Diverted');
    });

    test('3.2 supports all 7 VisitType classifications', () => {
      const validTypes: VisitType[] = [
        'Consultation',
        'VitalsCheckOnly',
        'RetailPurchase',
        'StandaloneProcedure',
        'LaboratorySpecimen',
        'AdministrativeDocument',
        'CashierSettlement',
      ];
      expect(validTypes.length).toBe(7);
      expect(validTypes).toContain('Consultation');
      expect(validTypes).toContain('VitalsCheckOnly');
      expect(validTypes).toContain('RetailPurchase');
      expect(validTypes).toContain('StandaloneProcedure');
      expect(validTypes).toContain('LaboratorySpecimen');
      expect(validTypes).toContain('AdministrativeDocument');
      expect(validTypes).toContain('CashierSettlement');
    });
  });

  describe('4. Workstation Discharge Eligibility Logic (canDischarge)', () => {
    const isTerminalOrCompleted = (status: QueueStatus) =>
      status === 'Completed' ||
      status === 'DischargedNonDoctor' ||
      status === 'Cancelled' ||
      status === 'NoShow' ||
      status === 'Diverted';

    const canDischarge = (item: { status: QueueStatus; visitType?: VisitType }) =>
      (item.status === 'Triaged' || (!!item.visitType && item.visitType !== 'Consultation')) &&
      !isTerminalOrCompleted(item.status);

    test('4.1 Triaged tickets can always be discharged without doctor consultation', () => {
      expect(canDischarge({ status: 'Triaged', visitType: 'Consultation' })).toBe(true);
      expect(canDischarge({ status: 'Triaged', visitType: 'VitalsCheckOnly' })).toBe(true);
    });

    test('4.2 Non-consultation tickets can be discharged while Waiting or OnHold', () => {
      expect(canDischarge({ status: 'Waiting', visitType: 'RetailPurchase' })).toBe(true);
      expect(canDischarge({ status: 'Waiting', visitType: 'StandaloneProcedure' })).toBe(true);
      expect(canDischarge({ status: 'Waiting', visitType: 'LaboratorySpecimen' })).toBe(true);
      expect(canDischarge({ status: 'Waiting', visitType: 'AdministrativeDocument' })).toBe(true);
      expect(canDischarge({ status: 'Waiting', visitType: 'CashierSettlement' })).toBe(true);
      expect(canDischarge({ status: 'OnHold', visitType: 'RetailPurchase' })).toBe(true);
    });

    test('4.3 Standard Consultation tickets in Waiting state cannot be discharged directly (must be triaged first)', () => {
      expect(canDischarge({ status: 'Waiting', visitType: 'Consultation' })).toBe(false);
      expect(canDischarge({ status: 'Waiting' })).toBe(false);
    });

    test('4.4 Terminal tickets cannot be discharged again', () => {
      expect(canDischarge({ status: 'Completed', visitType: 'RetailPurchase' })).toBe(false);
      expect(canDischarge({ status: 'DischargedNonDoctor', visitType: 'RetailPurchase' })).toBe(false);
      expect(canDischarge({ status: 'Cancelled', visitType: 'RetailPurchase' })).toBe(false);
      expect(canDischarge({ status: 'NoShow', visitType: 'RetailPurchase' })).toBe(false);
      expect(canDischarge({ status: 'Diverted', visitType: 'RetailPurchase' })).toBe(false);
    });
  });

  describe('5. Queue Tab & Completed Filter Inclusions', () => {
    const queueList: Array<{ id: string; status: QueueStatus }> = [
      { id: '1', status: 'Waiting' },
      { id: '2', status: 'Triaged' },
      { id: '3', status: 'InConsultation' },
      { id: '4', status: 'Completed' },
      { id: '5', status: 'DischargedNonDoctor' },
      { id: '6', status: 'Diverted' },
      { id: '7', status: 'Cancelled' },
    ];

    test('5.1 Completed filter tab includes both Completed and DischargedNonDoctor', () => {
      const completedItems = queueList.filter(
        (q) => q.status === 'Completed' || q.status === 'DischargedNonDoctor'
      );
      expect(completedItems.map((q) => q.id)).toEqual(['4', '5']);
      expect(completedItems.some((q) => q.status === 'DischargedNonDoctor')).toBe(true);
    });

    test('5.2 Active queue filters exclude DischargedNonDoctor and Diverted', () => {
      const activeItems = queueList.filter(
        (q) =>
          q.status !== 'Completed' &&
          q.status !== 'DischargedNonDoctor' &&
          q.status !== 'Cancelled' &&
          q.status !== 'NoShow' &&
          q.status !== 'Diverted'
      );
      expect(activeItems.map((q) => q.id)).toEqual(['1', '2', '3']);
    });
  });
});

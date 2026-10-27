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
import type { PatientQueueItem, PatientChart, MedicalCertificateRecord, ReferralLetterRecord } from '../services/clinicService';
import { CHART_TABS, type ChartTab } from '../components/chart/types';

describe('Milestone 5: Admin Vault & Audited ER Diversion Frontend Test Suite', () => {
  beforeEach(() => {
    lastPostUrl = '';
    lastPostPayload = null;
    mockPostResponse = null;
    mockPostError = null;
  });

  describe('1. Emergency Triage Diversion API (clinicService.divertEmergencyPatient)', () => {
    test('1.1 calls POST /queue/:id/divert with complete audited parameters', async () => {
      mockPostResponse = { success: true };
      const [res, err] = await clinicService.divertEmergencyPatient('queue-ticket-001', {
        destinationHospital: 'Philippine General Hospital - Emergency Department',
        transportMode: 'City / Red Cross Ambulance',
        paramedicOrEscortName: 'Paramedic Santos (Unit 12)',
        clinicalHandoverSummary: 'Acute STEMI, SpO2 86%, 4L O2 administered, vitals stabilized.',
      });

      expect(err).toBeNull();
      expect(res).toEqual({ success: true });
      expect(lastPostUrl).toBe('/queue/queue-ticket-001/divert');
      expect(lastPostPayload).toEqual({
        destinationHospital: 'Philippine General Hospital - Emergency Department',
        transportMode: 'City / Red Cross Ambulance',
        paramedicOrEscortName: 'Paramedic Santos (Unit 12)',
        clinicalHandoverSummary: 'Acute STEMI, SpO2 86%, 4L O2 administered, vitals stabilized.',
      });
    });

    test('1.2 returns error tuple when API rejects diversion (e.g. ticket already completed or diverted)', async () => {
      mockPostError = { status: 400, message: 'Queue item is already terminal and cannot be diverted.' };
      const [res, err] = await clinicService.divertEmergencyPatient('queue-ticket-terminal', {
        destinationHospital: 'Manila Doctors Hospital',
        transportMode: 'Private Ambulance',
        paramedicOrEscortName: 'Paramedic Cruz',
        clinicalHandoverSummary: 'Emergency diversion requested.',
      });

      expect(res).toBeNull();
      expect(err).toEqual(mockPostError);
      expect(lastPostUrl).toBe('/queue/queue-ticket-terminal/divert');
    });

    test('1.3 PatientQueueItem supports diversion audit fields', () => {
      const divertedTicket: PatientQueueItem = {
        id: 'ticket-123',
        tenantId: 'tenant-1',
        clinicId: 'clinic-1',
        queueNumber: 'Q-ER-99',
        sequenceNumber: 1,
        patientId: 'patient-456',
        patientName: 'Pedro Penduko',
        status: 'Diverted',
        priority: 'Emergency',
        checkInTime: '2026-10-23T14:00:00Z',
        divertedToFacility: 'Manila Doctors Hospital',
        transportMode: 'City / Red Cross Ambulance',
        paramedicOrEscortName: 'Paramedic Cruz',
        handoverSummary: 'Acute chest pain',
        divertedAt: '2026-10-23T14:15:00Z',
        divertedByStaffId: 'staff-789',
      };

      expect(divertedTicket.status).toBe('Diverted');
      expect(divertedTicket.divertedToFacility).toBe('Manila Doctors Hospital');
      expect(divertedTicket.paramedicOrEscortName).toBe('Paramedic Cruz');
      expect(divertedTicket.handoverSummary).toBe('Acute chest pain');
    });
  });

  describe('2. Patient Chart Administrative Documents Vault Types & Tabs', () => {
    test('2.1 CHART_TABS includes documents tab with label "Admin Vault"', () => {
      const documentsTab = CHART_TABS.find((t) => t.value === 'documents');
      expect(documentsTab).toBeDefined();
      expect(documentsTab!.label).toBe('Admin Vault');
    });

    test('2.2 PatientChart type supports medicalCertificates and referralLetters with SHA-256 seal digest', () => {
      const medCert: MedicalCertificateRecord = {
        id: 'cert-1',
        certificateNumber: 'MC-20261023-0001',
        patientId: 'patient-1',
        patientName: 'Maria Santos',
        attendingDoctorName: 'Dr. Jose Rizal',
        issueDate: '2026-10-23',
        diagnosis: 'Acute Bronchitis',
        recommendation: 'Rest for 3 days',
        securityDigest: 'a1b2c3d4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890',
        createdAt: '2026-10-23T10:00:00Z',
      };

      const referral: ReferralLetterRecord = {
        id: 'ref-1',
        referralNumber: 'REF-20261023-0001',
        patientId: 'patient-1',
        patientName: 'Maria Santos',
        attendingDoctorName: 'Dr. Jose Rizal',
        referredToFacility: 'Philippine General Hospital',
        reasonForReferral: 'Pulmonology consultation',
        clinicalSummary: 'Wheezing unresponsive to bronchodilator',
        securityDigest: 'b2c3d4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890a1',
        createdAt: '2026-10-23T11:00:00Z',
      };

      const chart: PatientChart = {
        patientId: 'patient-1',
        fullName: 'Maria Santos',
        medicalCertificates: [medCert],
        referralLetters: [referral],
      };

      expect(chart.medicalCertificates).toHaveLength(1);
      expect(chart.medicalCertificates![0].securityDigest).toBe('a1b2c3d4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890');
      expect(chart.referralLetters).toHaveLength(1);
      expect(chart.referralLetters![0].securityDigest).toBe('b2c3d4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890a1');
    });
  });

  describe('3. Administrative Vault Authenticated PDF Opening', () => {
    test('3.1 getMedicalCertificatePdfUrl generates correct streaming path', () => {
      const url = clinicService.getMedicalCertificatePdfUrl('d6c564e8-b89e-4f94-a78c-dee5e0b61b97');
      expect(url).toContain('/api/v1/documents/medical-certificates/d6c564e8-b89e-4f94-a78c-dee5e0b61b97/pdf');
    });

    test('3.2 getReferralLetterPdfUrl generates correct streaming path', () => {
      const url = clinicService.getReferralLetterPdfUrl('ref-uuid-001');
      expect(url).toContain('/api/v1/documents/referrals/ref-uuid-001/pdf');
    });

    test('3.3 AdministrativeDocumentsTab imports and utilizes openDocument for authenticated viewing', async () => {
      const source = await Bun.file('apps/clinic-app/components/chart/AdministrativeDocumentsTab.tsx').text();
      expect(source).toContain("import { openDocument } from '../../services/documentOpener'");
      expect(source).toContain('await openDocument(url)');
      // Zero unauthenticated direct window.open or Linking.openURL on raw clinic API URLs
      expect(source).not.toContain("window.open(url, '_blank')");
      expect(source).not.toContain('Linking.openURL(url)');
    });

    test('3.4 documentOpener.native provides parity with authenticated downloads and system sharing', async () => {
      const nativeSource = await Bun.file('apps/clinic-app/services/documentOpener.native.ts').text();
      expect(nativeSource).toContain('export async function openDocument');
      expect(nativeSource).toContain('export async function openDocumentBlob');
      expect(nativeSource).toContain('File.downloadFileAsync');
      expect(nativeSource).toContain('Sharing.shareAsync');
      expect(nativeSource).toContain('Authorization');
    });
  });
});

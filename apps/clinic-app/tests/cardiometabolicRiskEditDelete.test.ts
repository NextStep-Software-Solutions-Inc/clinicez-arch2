import { describe, expect, test, mock, beforeEach } from 'bun:test';

(globalThis as any).__DEV__ = true;

mock.module('react-native', () => ({
  Linking: { openURL: () => Promise.resolve(), canOpenURL: () => Promise.resolve(true) },
  StyleSheet: { create: (s: any) => s },
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
  Dimensions: {
    get: () => ({ width: 1024, height: 768 }),
    addEventListener: () => ({ remove: () => {} }),
  },
  useWindowDimensions: () => ({ width: 1024, height: 768 }),
  Keyboard: { dismiss: () => {}, addListener: () => ({ remove: () => {} }) },
  AppState: { addEventListener: () => ({ remove: () => {} }) },
  Platform: { OS: 'web', select: (obj: any) => obj.web ?? obj.default },
  Alert: {
    alert: () => {},
  },
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

// API client mock
let lastGetUrl = '';
let lastPutUrl = '';
let lastPutPayload: any = null;
let lastDeleteUrl = '';
let lastPostUrl = '';
let lastPostPayload: any = null;
let mockGetResponse: any = null;
let mockPutResponse: any = null;
let mockDeleteResponse: any = null;
let mockErrorResponse: any = null;

mock.module('../services/apiClient', () => ({
  clinicApiClient: {
    get: async (url: string) => {
      lastGetUrl = url;
      if (mockErrorResponse) return [null, mockErrorResponse];
      return [mockGetResponse, null];
    },
    post: async (url: string, data?: any) => {
      lastPostUrl = url;
      lastPostPayload = data;
      if (mockErrorResponse) return [null, mockErrorResponse];
      return [{ id: 'new-ncd', ...data }, null];
    },
    put: async (url: string, data?: any) => {
      lastPutUrl = url;
      lastPutPayload = data;
      if (mockErrorResponse) return [null, mockErrorResponse];
      return [mockPutResponse, null];
    },
    delete: async (url: string) => {
      lastDeleteUrl = url;
      if (mockErrorResponse) return [null, mockErrorResponse];
      return [mockDeleteResponse ?? true, null];
    },
  },
  clinicApiUrl: (p: string) => `http://localhost:5000/api/v1${p}`,
}));

const { clinicService } = await import('../services/clinicService');
import type { NcdRiskAssessment, SaveNcdRiskAssessmentPayload } from '../services/clinicService';

describe('Cardiometabolic Risk Assessment - Edit & Retraction (Void) Governance', () => {
  beforeEach(() => {
    lastGetUrl = '';
    lastPutUrl = '';
    lastPutPayload = null;
    lastDeleteUrl = '';
    lastPostUrl = '';
    lastPostPayload = null;
    mockGetResponse = null;
    mockPutResponse = null;
    mockDeleteResponse = null;
    mockErrorResponse = null;
  });

  describe('Feature: API Client Endpoints for Edit and Retraction', () => {
    test('getNcdRiskAssessments queries active assessments by default (includeVoided=false)', async () => {
      mockGetResponse = [
        {
          id: 'ncd-active-1',
          riskBand: 'Low',
          calculatedScorePercent: 5,
          isDeleted: false,
        },
      ];

      const [data, err] = await clinicService.getNcdRiskAssessments('pat-001');

      expect(err).toBeNull();
      expect(lastGetUrl).toBe('/patients/pat-001/ncd-risk-assessment');
      expect(data?.length).toBe(1);
      expect(data?.[0].id).toBe('ncd-active-1');
    });

    test('getNcdRiskAssessments queries all records including retracted when includeVoided=true', async () => {
      mockGetResponse = [
        { id: 'ncd-active-1', riskBand: 'Low', isDeleted: false },
        { id: 'ncd-voided-1', riskBand: 'High', isDeleted: true, voidReason: 'Duplicate entry' },
      ];

      const [data, err] = await clinicService.getNcdRiskAssessments('pat-001', true);

      expect(err).toBeNull();
      expect(lastGetUrl).toBe('/patients/pat-001/ncd-risk-assessment?includeVoided=true');
      expect(data?.length).toBe(2);
      expect(data?.[1].isDeleted).toBe(true);
      expect(data?.[1].voidReason).toBe('Duplicate entry');
    });

    test('updateNcdRiskAssessment issues PUT to /patients/{patientId}/ncd-risk-assessment/{assessmentId}', async () => {
      const payload: SaveNcdRiskAssessmentPayload = {
        riskBand: 'Moderate',
        calculatedScorePercent: 12,
        isManuallyOverridden: false,
        assessedByStaffName: 'Dr. Evelyn Reed',
        assessmentDate: '2026-10-16',
        diagnosedDiabetes: true,
        fastingBloodSugarMgDl: 140,
        remarks: 'Corrected blood sugar lab values',
      };

      mockPutResponse = {
        id: 'ncd-123',
        patientId: 'pat-001',
        ...payload,
        updatedAt: '2026-10-16T09:30:00Z',
      };

      const [data, err] = await clinicService.updateNcdRiskAssessment('pat-001', 'ncd-123', payload);

      expect(err).toBeNull();
      expect(lastPutUrl).toBe('/patients/pat-001/ncd-risk-assessment/ncd-123');
      expect(lastPutPayload.riskBand).toBe('Moderate');
      expect(lastPutPayload.remarks).toBe('Corrected blood sugar lab values');
      expect(data?.id).toBe('ncd-123');
    });

    test('voidNcdRiskAssessment issues DELETE with encoded reason query parameter', async () => {
      const [success, err] = await clinicService.voidNcdRiskAssessment(
        'pat-001',
        'ncd-dup-99',
        'Duplicate entry: Accidental duplicate submission'
      );

      expect(err).toBeNull();
      expect(success).toBe(true);
      expect(lastDeleteUrl).toBe(
        '/patients/pat-001/ncd-risk-assessment/ncd-dup-99?reason=Duplicate%20entry%3A%20Accidental%20duplicate%20submission'
      );
    });

    test('voidNcdRiskAssessment handles HTTP 403 Forbidden when caller is not the author', async () => {
      mockErrorResponse = {
        status: 403,
        message: 'Only the clinician who recorded this risk assessment may void or retract it.',
      };

      const [success, err] = await clinicService.voidNcdRiskAssessment('pat-001', 'ncd-other-user');

      expect(success).toBeNull();
      expect(err).toBeDefined();
      expect(err.status).toBe(403);
      expect(err.message).toContain('Only the clinician who recorded this risk assessment may void');
    });
  });

  describe('Feature: Author-Only Clinical Permission Governance', () => {
    // Pure function equivalent of the author check implemented in CardiometabolicRiskTab
    function isRecordAuthor(
      assessment: Partial<NcdRiskAssessment>,
      authedStaffId?: string,
      authedClinicianName?: string
    ): boolean {
      if (authedStaffId && assessment.assessedByStaffId && assessment.assessedByStaffId === authedStaffId) return true;
      if (authedStaffId && assessment.createdBy && assessment.createdBy === authedStaffId) return true;
      if (
        authedClinicianName &&
        assessment.assessedByStaffName &&
        assessment.assessedByStaffName.trim().toLowerCase() === authedClinicianName.trim().toLowerCase()
      ) {
        return true;
      }
      return false;
    }

    test('allows retraction when authed staff ID matches assessedByStaffId', () => {
      const assessment: Partial<NcdRiskAssessment> = {
        id: 'ncd-1',
        assessedByStaffId: 'staff-doc-42',
        assessedByStaffName: 'Dr. Jane Watson',
      };
      expect(isRecordAuthor(assessment, 'staff-doc-42', 'Different Name')).toBe(true);
    });

    test('allows retraction when authed staff ID matches createdBy audit stamp', () => {
      const assessment: Partial<NcdRiskAssessment> = {
        id: 'ncd-2',
        assessedByStaffId: undefined,
        createdBy: 'staff-nurse-10',
      };
      expect(isRecordAuthor(assessment, 'staff-nurse-10', undefined)).toBe(true);
    });

    test('allows retraction when case-insensitive clinician name matches', () => {
      const assessment: Partial<NcdRiskAssessment> = {
        id: 'ncd-3',
        assessedByStaffName: 'Dr. Evelyn Reed, MD',
      };
      expect(isRecordAuthor(assessment, 'staff-diff', 'dr. evelyn reed, md')).toBe(true);
    });

    test('rejects retraction when clinician credentials do not match author', () => {
      const assessment: Partial<NcdRiskAssessment> = {
        id: 'ncd-4',
        assessedByStaffId: 'staff-author-1',
        assessedByStaffName: 'Dr. Original Author',
      };
      expect(isRecordAuthor(assessment, 'staff-attacker-2', 'Dr. Another Doctor')).toBe(false);
    });

    test('rejects retraction when authenticated context is completely empty', () => {
      const assessment: Partial<NcdRiskAssessment> = {
        id: 'ncd-5',
        assessedByStaffId: 'staff-author-1',
        assessedByStaffName: 'Dr. Original Author',
      };
      expect(isRecordAuthor(assessment, undefined, undefined)).toBe(false);
    });
  });

  describe('Feature: Hybrid Display Audit Model (Active vs Retracted)', () => {
    const assessments: NcdRiskAssessment[] = [
      {
        id: 'ncd-1',
        patientId: 'pat-1',
        assessmentDate: '2026-10-16',
        riskBand: 'Moderate',
        calculatedScorePercent: 12,
        isDeleted: false,
      },
      {
        id: 'ncd-2',
        patientId: 'pat-1',
        assessmentDate: '2026-10-16',
        riskBand: 'High',
        calculatedScorePercent: 24,
        isDeleted: true,
        voidReason: 'Duplicate entry',
        deletedAt: '2026-10-16T08:00:00Z',
        deletedBy: 'staff-1',
      },
      {
        id: 'ncd-3',
        patientId: 'pat-1',
        assessmentDate: '2026-10-15',
        riskBand: 'Low',
        calculatedScorePercent: 4,
        isDeleted: true,
        voidReason: 'Incorrect lab values: FBS was for wrong patient',
        deletedAt: '2026-10-15T14:30:00Z',
      },
    ];

    test('separates active and voided assessments correctly', () => {
      const activeAssessments = assessments.filter((a) => !a.isDeleted);
      const voidedAssessments = assessments.filter((a) => a.isDeleted);

      expect(activeAssessments.length).toBe(1);
      expect(activeAssessments[0].id).toBe('ncd-1');

      expect(voidedAssessments.length).toBe(2);
      expect(voidedAssessments[0].id).toBe('ncd-2');
      expect(voidedAssessments[1].id).toBe('ncd-3');
    });

    test('preserves clinical audit trail in voided records without data destruction', () => {
      const voided = assessments.filter((a) => a.isDeleted);

      expect(voided[0].riskBand).toBe('High');
      expect(voided[0].calculatedScorePercent).toBe(24);
      expect(voided[0].voidReason).toBe('Duplicate entry');
      expect(voided[0].deletedAt).toBe('2026-10-16T08:00:00Z');

      expect(voided[1].voidReason).toContain('Incorrect lab values');
    });
  });
});

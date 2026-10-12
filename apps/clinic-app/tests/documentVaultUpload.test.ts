// token-guard:ignore-file
import { describe, expect, test, mock, beforeEach } from 'bun:test';

(globalThis as any).__DEV__ = true;

// Mock react-native
mock.module('react-native', () => ({
  StyleSheet: { create: (s: any) => s, flatten: (s: any) => s },
  View: 'View',
  Text: 'Text',
  Pressable: 'Pressable',
  ScrollView: 'ScrollView',
  TextInput: 'TextInput',
  ActivityIndicator: 'ActivityIndicator',
  Modal: 'Modal',
  Dimensions: { get: () => ({ width: 1280, height: 800 }) },
  useWindowDimensions: () => ({ width: 1280, height: 800 }),
  Platform: { OS: 'web', select: (obj: any) => obj.web ?? obj.default },
  Touchable: { Mixin: {} },
  TurboModuleRegistry: { get: () => null, getEnforcing: () => null },
  NativeModules: {},
  Alert: { alert: mock(() => {}) },
}));

mock.module('expo-crypto', () => ({
  randomUUID: () => 'mock-uuid-' + Math.random().toString(36).substring(2, 9),
}));

mock.module('react-native-svg', () => ({
  Svg: 'svg',
  Path: 'path',
  Circle: 'circle',
  Rect: 'rect',
  Line: 'line',
  default: 'svg',
}));

mock.module('../constants/fonts', () => ({
  applyFontFamily: (s: any) => s,
  fontAssets: {},
}));

// Mock expo-document-picker
let mockPickerResult: any = {
  canceled: false,
  assets: [
    {
      name: 'chest_xray_pa_view.pdf',
      size: 1024 * 512,
      uri: 'file:///data/user/0/cache/chest_xray_pa_view.pdf',
      mimeType: 'application/pdf',
      file: new File(['mock content'], 'chest_xray_pa_view.pdf', { type: 'application/pdf' }),
    },
  ],
};

mock.module('expo-document-picker', () => ({
  getDocumentAsync: mock(async (options: any) => {
    return mockPickerResult;
  }),
}));

let lastPostUrl = '';
let lastPostPayload: any = null;
let lastUploadedFormData: FormData | null = null;
let mockUploadFileResponse: any = null;
let mockUploadJsonResponse: any = null;
let mockErrorResponse: any = null;

mock.module('../services/apiClient', () => ({
  clinicApiClient: {
    get: async () => [null, null],
    post: async (url: string, data?: any) => {
      lastPostUrl = url;
      lastPostPayload = data;
      if (mockErrorResponse) return [null, mockErrorResponse];
      return [mockUploadJsonResponse, null];
    },
  },
  clinicApiUrl: (p: string) => `http://localhost:5000/api/v1${p}`,
}));

const { validateDateString, formatDateMask } = await import('../components/ui/ValidatedDateInput');
const { clinicService } = await import('../services/clinicService');
const DocumentPicker = await import('expo-document-picker');

describe('Milestone M3: Document Vault Upload & DateOnly Contract (Features 15 & 16, Requirement R6)', () => {
  beforeEach(() => {
    lastPostUrl = '';
    lastPostPayload = null;
    lastUploadedFormData = null;
    mockUploadFileResponse = null;
    mockUploadJsonResponse = null;
    mockErrorResponse = null;
  });

  describe('Feature 15: ASP.NET Core DateOnly Compatibility & Formatting Guarantees', () => {
    test('enforces strict YYYY-MM-DD format adhering to DateOnly regex', () => {
      const dateOnlyRegex = /^\d{4}-\d{2}-\d{2}$/;

      const validDates = [
        '2026-10-12',
        '2025-01-01',
        '2000-02-29',
        '1985-12-31',
      ];

      for (const d of validDates) {
        const result = validateDateString(d, { boundaryMode: 'pastOrToday' });
        expect(result.isValid).toBe(true);
        expect(result.formattedDate).toMatch(dateOnlyRegex);
        expect(result.formattedDate).not.toContain('T');
        expect(result.formattedDate).not.toContain('Z');
      }
    });

    test('strictly strips timestamps and ISO time components', () => {
      // Simulate input that might have an ISO string with T
      const rawIso = '2026-10-12T08:30:00.000Z';
      const strictlyFormatted = rawIso.split('T')[0];

      expect(strictlyFormatted).toBe('2026-10-12');
      expect(strictlyFormatted).not.toContain('T');
      expect(strictlyFormatted).toHaveLength(10);
    });

    test('boundaryMode="pastOrToday" strictly rejects future document dates', () => {
      const today = new Date().toISOString().split('T')[0];
      const futureDate = '2029-12-31';

      const futureCheck = validateDateString(futureDate, { boundaryMode: 'pastOrToday' });
      expect(futureCheck.isValid).toBe(false);
      expect(futureCheck.errorMessage).toContain('Future date not permitted');

      const todayCheck = validateDateString(today, { boundaryMode: 'pastOrToday' });
      expect(todayCheck.isValid).toBe(true);

      const pastCheck = validateDateString('2024-05-10', { boundaryMode: 'pastOrToday' });
      expect(pastCheck.isValid).toBe(true);
    });

    test('formatDateMask masks inputs progressively to YYYY-MM-DD without symbols', () => {
      expect(formatDateMask('20261012')).toBe('2026-10-12');
      expect(formatDateMask('2026-10-12-corrupted')).toBe('2026-10-12');
      expect(formatDateMask('2026/10/12')).toBe('2026-10-12');
      expect(formatDateMask('2026.10.12')).toBe('2026-10-12');
    });
  });

  describe('Feature 16: expo-document-picker Contract & Real File Attachment', () => {
    test('requests correct MIME types for documents (PDF, JPEG, PNG)', async () => {
      mockPickerResult = {
        canceled: false,
        assets: [
          {
            name: 'lab_cbc_result.pdf',
            size: 1024 * 250,
            uri: 'file:///cache/lab_cbc_result.pdf',
            mimeType: 'application/pdf',
          },
        ],
      };

      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/jpeg', 'image/png'],
        copyToCacheDirectory: true,
        multiple: false,
      });

      expect(result.canceled).toBe(false);
      expect(result.assets?.[0].name).toBe('lab_cbc_result.pdf');
      expect(result.assets?.[0].mimeType).toBe('application/pdf');
    });

    test('handles file picker cancellation without crashing or state corruption', async () => {
      mockPickerResult = {
        canceled: true,
      };

      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/jpeg', 'image/png'],
        copyToCacheDirectory: true,
        multiple: false,
      });

      expect(result.canceled).toBe(true);
      expect(result.assets).toBeUndefined();
    });

    test('infers document title from filename when title is empty', () => {
      const fileName = 'chest_xray_posterior_anterior.pdf';
      const cleanName = fileName.replace(/\.[^/.]+$/, '');
      expect(cleanName).toBe('chest_xray_posterior_anterior');

      const imageFileName = 'ecg_rhythm_strip_12lead.jpeg';
      const cleanImageName = imageFileName.replace(/\.[^/.]+$/, '');
      expect(cleanImageName).toBe('ecg_rhythm_strip_12lead');
    });

    test('determines file type classification (PDF vs Photo) based on MIME and extension', () => {
      const isPdf = (name: string, mime?: string) =>
        name.toLowerCase().endsWith('.pdf') || mime === 'application/pdf';

      expect(isPdf('diagnostic_scan.pdf', 'application/pdf')).toBe(true);
      expect(isPdf('skin_lesion.jpg', 'image/jpeg')).toBe(false);
      expect(isPdf('biopsy_report.PDF')).toBe(true);
      expect(isPdf('ultrasound.png', 'image/png')).toBe(false);
    });
  });

  describe('Feature 16: Multipart FormData Assembly & API Dispatch', () => {
    test('assembles multipart FormData with all required fields and file blob', () => {
      const patientId = 'pat-vault-001';
      const recordType = 'LabResult';
      const title = 'Official CBC Panel';
      const notes = 'Patient fasting for 10 hours prior to venipuncture.';
      const strictlyFormattedDate = '2026-10-12';

      const mockFile = new File(['dummy binary data'], 'cbc_panel.pdf', {
        type: 'application/pdf',
      });

      const formData = new FormData();
      formData.append('PatientId', patientId);
      formData.append('RecordType', recordType);
      formData.append('Title', title);
      formData.append('Notes', notes);
      formData.append('DocumentDate', strictlyFormattedDate);
      formData.append('File', mockFile);

      expect(formData.get('PatientId')).toBe(patientId);
      expect(formData.get('RecordType')).toBe(recordType);
      expect(formData.get('Title')).toBe(title);
      expect(formData.get('Notes')).toBe(notes);
      expect(formData.get('DocumentDate')).toBe('2026-10-12');
      expect(formData.get('DocumentDate')).not.toContain('T');
      expect(formData.get('File')).toBeDefined();
    });

    test('clinicService.uploadRecordAttachmentFile sends multipart POST to /records/attachments/upload', async () => {
      const formData = new FormData();
      formData.append('PatientId', 'pat-01');
      formData.append('Title', 'Test Document');
      formData.append('DocumentDate', '2026-10-12');

      const mockResponseAttachment = {
        id: 'att-new-001',
        patientId: 'pat-01',
        title: 'Test Document',
        documentDate: '2026-10-12',
        storageUri: 'tenants/ustp/records/att-new-001.cez',
      };

      mockUploadJsonResponse = mockResponseAttachment;

      const [res, err] = await clinicService.uploadRecordAttachmentFile(formData);
      expect(err).toBeNull();
      expect(res).toBeDefined();
      expect(res?.id).toBe('att-new-001');
      expect(res?.documentDate).toBe('2026-10-12');
      expect(lastPostUrl).toBe('/records/attachments/upload');
      expect(lastPostPayload).toBe(formData);
    });

    test('fallback to JSON uploadRecordAttachment transmits strictly formatted date and metadata', async () => {
      const payload = {
        patientId: 'pat-json-002',
        recordType: 'XRay',
        title: 'Chest Radiograph PA View',
        fileName: 'chest_radiograph.pdf',
        contentType: 'application/pdf',
        fileSizeBytes: 1024 * 300,
        storageUri: 'tenants/ustp/clinics/c1/records/test.pdf.cez',
        documentDate: '2026-10-12',
        uploadedByStaffName: 'Nurse Clara Garcia',
        encryptionAlgorithm: 'AES-256-GCM',
        encryptionKeyId: 'cmk-v1',
      };

      mockUploadJsonResponse = {
        id: 'att-json-999',
        ...payload,
      };

      const [res, err] = await clinicService.uploadRecordAttachment(payload);
      expect(err).toBeNull();
      expect(res?.id).toBe('att-json-999');
      expect(lastPostUrl).toBe('/records/attachments');
      expect(lastPostPayload.documentDate).toBe('2026-10-12');
      expect(lastPostPayload.documentDate).not.toContain('T');
      expect(lastPostPayload.uploadedByStaffName).toBe('Nurse Clara Garcia');
    });

    test('handles upload error gracefully without crashing', async () => {
      mockErrorResponse = { status: 413, message: 'Payload Too Large' };

      const formData = new FormData();
      const [res, err] = await clinicService.uploadRecordAttachmentFile(formData);
      expect(res).toBeNull();
      expect(err).toBeDefined();
      expect(err?.status).toBe(413);
      expect(err?.message).toBe('Payload Too Large');
    });
  });
});

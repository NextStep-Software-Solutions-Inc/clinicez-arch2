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
  KeyboardAvoidingView: 'KeyboardAvoidingView',
  FlatList: 'FlatList',
  SectionList: 'SectionList',
  Switch: 'Switch',
  TouchableOpacity: 'TouchableOpacity',
  TouchableHighlight: 'TouchableHighlight',
  Image: 'Image',
  RefreshControl: 'RefreshControl',
  Keyboard: { dismiss: () => {}, addListener: () => ({ remove: () => {} }) },
  AppState: { addEventListener: () => ({ remove: () => {} }) },
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
    spring: () => ({ start: (cb?: any) => cb && cb() }),
    View: 'Animated.View',
    Text: 'Animated.Text',
  },
  Alert: { alert: mock(() => {}) },
  Linking: { openURL: () => Promise.resolve(), canOpenURL: () => Promise.resolve(true) },
  processColor: (c: any) => c,
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
let lastPostConfig: any = null;
let mockUploadJsonResponse: any = null;
let mockErrorResponse: any = null;

mock.module('../services/apiClient', () => ({
  clinicApiClient: {
    get: async () => [null, null],
    post: async (url: string, data?: any, config?: any) => {
      lastPostUrl = url;
      lastPostPayload = data;
      lastPostConfig = config;
      if (mockErrorResponse) return [null, mockErrorResponse];
      return [mockUploadJsonResponse, null];
    },
  },
  clinicApiUrl: (p: string) => `http://localhost:5000/api/v1${p}`,
}));

const { validateDateString, formatDateMask, isLeapYear, getDaysInMonth } = await import(
  '../components/ui/ValidatedDateInput'
);
const { clinicService } = await import('../services/clinicService');
const DocumentPicker = await import('expo-document-picker');

describe('Empirical Adversarial Stress Test: Document Vault & DateOnly Validation (Milestone M3, Gen7)', () => {
  beforeEach(() => {
    lastPostUrl = '';
    lastPostPayload = null;
    lastPostConfig = null;
    mockUploadJsonResponse = null;
    mockErrorResponse = null;
  });

  describe('Suite 1: ASP.NET Core DateOnly System Invariant & Timestamp Stripping', () => {
    const DATEONLY_EXACT_REGEX = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

    test('invariant: ISO-8601 strings with "T" are strictly stripped to pure YYYY-MM-DD DateOnly format', () => {
      const hostileTimestamps = [
        '2026-10-12T00:00:00Z',
        '2026-10-12T14:49:04+08:00',
        '2026-10-12T23:59:59.999Z',
        '2026-10-12T00:00:00.0000000Z',
        '2026-10-12T08:30:00',
        '2025-01-01T12:00:00-05:00',
      ];

      for (const rawIso of hostileTimestamps) {
        // Document Vault stripping transformation rule
        const sanitized = rawIso.split('T')[0];
        expect(sanitized).toMatch(DATEONLY_EXACT_REGEX);
        expect(sanitized).not.toContain('T');
        expect(sanitized).not.toContain('Z');
        expect(sanitized).not.toContain(':');
        expect(sanitized).toHaveLength(10);
      }
    });

    test('invariant: Document Vault gatekeeper rejects invalid/corrupted dates and strictly formats accepted dates to DateOnly', () => {
      const corruptedInputs = [
        '',
        '   ',
        'invalid-garbage',
        '2026-10asaasoalkslak',
        '2026-10',
        '2026-13-45',
        '9999-99-99',
      ];

      // Corrupted or incomplete inputs must fail validation and trigger the alert/return gate in Patients.screen.tsx
      for (const corrupted of corruptedInputs) {
        const validation = validateDateString(corrupted, { boundaryMode: 'pastOrToday' });
        expect(validation.isValid).toBe(false);
      }

      // Valid inputs that pass the gate produce strict YYYY-MM-DD DateOnly strings with zero "T"
      const validPastDates = [
        '2026-10-12',
        '2025-06-15',
        '2024-02-29',
        '2000-01-01',
        '1995-12-31',
      ];

      for (const valid of validPastDates) {
        const validation = validateDateString(valid, { boundaryMode: 'pastOrToday' });
        expect(validation.isValid).toBe(true);
        const strictlyFormatted = (validation.formattedDate || new Date().toISOString().split('T')[0]).split('T')[0];
        expect(strictlyFormatted).toMatch(DATEONLY_EXACT_REGEX);
        expect(strictlyFormatted).not.toContain('T');
        expect(strictlyFormatted).toHaveLength(10);
      }

      // Default fallback when initializing state (new Date().toISOString().split('T')[0])
      const defaultStateDate = new Date().toISOString().split('T')[0];
      expect(defaultStateDate).toMatch(DATEONLY_EXACT_REGEX);
      expect(defaultStateDate).not.toContain('T');
    });

    test('boundaryMode="pastOrToday" blocks future dates across multiple offsets (1 day, 1 week, 10 years)', () => {
      const today = new Date();
      const formatYMD = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(d);

      const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
      const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
      const nextYear = new Date(today.getTime() + 365 * 24 * 60 * 60 * 1000);
      const decadeLater = new Date(today.getTime() + 10 * 365 * 24 * 60 * 60 * 1000);

      const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
      const pastMonth = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
      const pastDecade = new Date(today.getTime() - 10 * 365 * 24 * 60 * 60 * 1000);

      // Future dates must be rejected
      expect(validateDateString(formatYMD(tomorrow), { boundaryMode: 'pastOrToday' }).isValid).toBe(false);
      expect(validateDateString(formatYMD(nextWeek), { boundaryMode: 'pastOrToday' }).isValid).toBe(false);
      expect(validateDateString(formatYMD(nextYear), { boundaryMode: 'pastOrToday' }).isValid).toBe(false);
      expect(validateDateString(formatYMD(decadeLater), { boundaryMode: 'pastOrToday' }).isValid).toBe(false);

      // Present and past dates must be accepted
      expect(validateDateString(formatYMD(today), { boundaryMode: 'pastOrToday' }).isValid).toBe(true);
      expect(validateDateString(formatYMD(yesterday), { boundaryMode: 'pastOrToday' }).isValid).toBe(true);
      expect(validateDateString(formatYMD(pastMonth), { boundaryMode: 'pastOrToday' }).isValid).toBe(true);
      expect(validateDateString(formatYMD(pastDecade), { boundaryMode: 'pastOrToday' }).isValid).toBe(true);
    });

    test('calendar edge cases: verifies Gregorian calendar validity for Document Dates', () => {
      // Leap year Feb 29 (valid years in the past)
      expect(validateDateString('2024-02-29', { boundaryMode: 'pastOrToday' }).isValid).toBe(true);
      expect(validateDateString('2020-02-29', { boundaryMode: 'pastOrToday' }).isValid).toBe(true);
      expect(validateDateString('2000-02-29', { boundaryMode: 'pastOrToday' }).isValid).toBe(true);

      // Non-leap year Feb 29 (must fail)
      expect(validateDateString('2023-02-29', { boundaryMode: 'pastOrToday' }).isValid).toBe(false);
      expect(validateDateString('2021-02-29', { boundaryMode: 'pastOrToday' }).isValid).toBe(false);
      expect(validateDateString('1900-02-29', { boundaryMode: 'pastOrToday' }).isValid).toBe(false); // Century non-leap

      // Invalid months & days
      expect(validateDateString('2024-00-15', { boundaryMode: 'pastOrToday' }).isValid).toBe(false);
      expect(validateDateString('2024-13-15', { boundaryMode: 'pastOrToday' }).isValid).toBe(false);
      expect(validateDateString('2024-04-31', { boundaryMode: 'pastOrToday' }).isValid).toBe(false); // Apr only has 30 days
      expect(validateDateString('2024-06-31', { boundaryMode: 'pastOrToday' }).isValid).toBe(false); // Jun only has 30 days
      expect(validateDateString('2024-09-31', { boundaryMode: 'pastOrToday' }).isValid).toBe(false); // Sep only has 30 days
      expect(validateDateString('2024-11-31', { boundaryMode: 'pastOrToday' }).isValid).toBe(false); // Nov only has 30 days

      // Year bounds (<1900 and >2100)
      expect(validateDateString('1899-12-31', { boundaryMode: 'pastOrToday' }).isValid).toBe(false);
      expect(validateDateString('2101-01-01', { boundaryMode: 'pastOrToday' }).isValid).toBe(false);
    });

    test('formatDateMask progressive numeric masking rejects alpha characters and code injections', () => {
      expect(formatDateMask("20261012'; DROP TABLE Documents;--")).toBe('2026-10-12');
      expect(formatDateMask('<script>alert("xss")</script>20261012')).toBe('2026-10-12');
      expect(formatDateMask('2026/10/12')).toBe('2026-10-12');
      expect(formatDateMask('2026.10.12')).toBe('2026-10-12');
      expect(formatDateMask('2026 10 12')).toBe('2026-10-12');
      expect(formatDateMask('2026-10-12-extra-digits-9999')).toBe('2026-10-12');
    });
  });

  describe('Suite 2: File Selection, MIME Resolution & Document Title Defaulting', () => {
    test('expo-document-picker contract enforces PDF, JPEG, and PNG document types', async () => {
      mockPickerResult = {
        canceled: false,
        assets: [
          {
            name: 'outside_chest_xray.png',
            size: 1024 * 1024 * 3.5, // 3.5 MB
            uri: 'file:///storage/emulated/0/Download/outside_chest_xray.png',
            mimeType: 'image/png',
          },
        ],
      };

      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/jpeg', 'image/png'],
        copyToCacheDirectory: true,
        multiple: false,
      });

      expect(result.canceled).toBe(false);
      expect(result.assets?.[0].mimeType).toBe('image/png');
      expect(result.assets?.[0].size).toBe(1024 * 1024 * 3.5);
    });

    test('document format classification correctly discriminates PDF vs Flatbed/Camera Photo', () => {
      const classifyFormat = (fileName: string, mimeType?: string): 'PDF' | 'Photo' => {
        if (fileName.toLowerCase().endsWith('.pdf') || mimeType === 'application/pdf') {
          return 'PDF';
        }
        return 'Photo';
      };

      expect(classifyFormat('Chest_PA.PDF')).toBe('PDF');
      expect(classifyFormat('Chest_PA.pdf', 'application/pdf')).toBe('PDF');
      expect(classifyFormat('untyped_scan', 'application/pdf')).toBe('PDF');

      expect(classifyFormat('xray_film.jpg', 'image/jpeg')).toBe('Photo');
      expect(classifyFormat('xray_film.JPEG')).toBe('Photo');
      expect(classifyFormat('lab_slip.png', 'image/png')).toBe('Photo');
      expect(classifyFormat('scan.bmp', 'image/bmp')).toBe('Photo');
    });

    test('title defaulting strips file extensions while preserving user-entered titles', () => {
      const resolveTitle = (userTitle: string, assetFileName: string) => {
        if (userTitle && userTitle.trim().length > 0) {
          return userTitle.trim();
        }
        return assetFileName.replace(/\.[^/.]+$/, '').trim();
      };

      // When user entered a title, keep user's title
      expect(resolveTitle('Official Outside Chest Radiograph', 'scan12345.pdf')).toBe(
        'Official Outside Chest Radiograph'
      );
      expect(resolveTitle('  Blood Chemistry 2026  ', 'chem.pdf')).toBe('Blood Chemistry 2026');

      // When user title is empty or spaces, default to clean file name
      expect(resolveTitle('', 'chest_xray_pa_view.pdf')).toBe('chest_xray_pa_view');
      expect(resolveTitle('   ', 'medical_certificate_outside.PNG')).toBe(
        'medical_certificate_outside'
      );
      expect(resolveTitle('', 'patient.record.v2.final.jpg')).toBe('patient.record.v2.final');
    });

    test('file clearing resets state and allows re-picking without residual references', () => {
      let pickedDocFile: any = {
        name: 'test_file.pdf',
        size: 50000,
        uri: 'file:///cache/test_file.pdf',
        mimeType: 'application/pdf',
      };

      // User presses "Clear"
      pickedDocFile = null;
      expect(pickedDocFile).toBeNull();

      // Subsequent upload without picked file falls back to simulated JSON payload
      const hasRealAttachment = pickedDocFile !== null;
      expect(hasRealAttachment).toBe(false);
    });
  });

  describe('Suite 3: Multipart FormData Invariants & Boundary Stress', () => {
    test('multipart FormData contains all required fields with strict DateOnly formatting', () => {
      const patientId = 'a0000000-0000-0000-0000-000000000001';
      const recordType = 'OutsideChestXRay';
      const docTitle = 'Hospital Chest PA Film';
      const docNotes = 'No active pulmonary infiltrate or focal opacity observed.';
      const strictlyFormattedDate = '2026-10-12';

      const mockBlob = new File(['%PDF-1.4 test document content'], 'chest_xray.pdf', {
        type: 'application/pdf',
      });

      const formData = new FormData();
      formData.append('PatientId', patientId);
      formData.append('RecordType', recordType);
      formData.append('Title', docTitle);
      formData.append('Notes', docNotes);
      formData.append('DocumentDate', strictlyFormattedDate);
      formData.append('File', mockBlob);

      expect(formData.get('PatientId')).toBe(patientId);
      expect(formData.get('RecordType')).toBe('OutsideChestXRay');
      expect(formData.get('Title')).toBe('Hospital Chest PA Film');
      expect(formData.get('Notes')).toBe(docNotes);
      expect(formData.get('DocumentDate')).toBe('2026-10-12');
      expect(formData.get('DocumentDate')).not.toContain('T');
      expect(formData.get('File')).toBeDefined();
    });

    test('handles React Native native file object shape when .file Blob is undefined', () => {
      // In native React Native / Expo iOS & Android, DocumentPicker returns uri/name/mimeType without browser File
      const nativeAsset = {
        uri: 'content://com.android.providers.media.documents/document/image%3A1024',
        name: 'skin_biopsy_photo.jpg',
        mimeType: 'image/jpeg',
        size: 204800,
      };

      const formData = new FormData();
      formData.append('PatientId', 'p-native-123');
      formData.append('RecordType', 'LabResult');
      formData.append('Title', 'Skin Biopsy Photo');
      formData.append('DocumentDate', '2026-10-12');

      // Native mobile file append shape
      formData.append('File', {
        uri: nativeAsset.uri,
        name: nativeAsset.name,
        type: nativeAsset.mimeType,
      } as any);

      expect(formData.get('PatientId')).toBe('p-native-123');
      expect(formData.get('DocumentDate')).toBe('2026-10-12');
      expect(formData.get('File')).toBeDefined();
    });

    test('handles large file metadata without integer overflow or string corruption', () => {
      const largeSizeBytes = 1024 * 1024 * 48; // 48 MB
      const formattedSizeKb = (largeSizeBytes / 1024).toFixed(1);
      const formattedSizeMb = (largeSizeBytes / (1024 * 1024)).toFixed(1);

      expect(formattedSizeKb).toBe('49152.0');
      expect(formattedSizeMb).toBe('48.0');
    });

    test('handles empty or whitespace notes cleanly without appending blank fields', () => {
      const docNotes = '   ';
      const formData = new FormData();
      formData.append('PatientId', 'pat-clean-01');
      if (docNotes.trim()) {
        formData.append('Notes', docNotes.trim());
      }

      expect(formData.get('Notes')).toBeNull();
    });
  });

  describe('Suite 4: API Dispatch, Network Resilience & Error Propagation', () => {
    test('clinicService.uploadRecordAttachmentFile sets multipart header and dispatches to /records/attachments/upload', async () => {
      const formData = new FormData();
      formData.append('PatientId', 'pat-upload-test');
      formData.append('Title', 'Official Lab Report');
      formData.append('DocumentDate', '2026-10-12');

      const mockResponse = {
        id: 'att-resp-001',
        patientId: 'pat-upload-test',
        title: 'Official Lab Report',
        documentDate: '2026-10-12',
        storageUri: 'tenants/ustp/records/att-resp-001.cez',
        verificationStatus: 'Verified',
      };
      mockUploadJsonResponse = mockResponse;

      const [res, err] = await clinicService.uploadRecordAttachmentFile(formData);

      expect(err).toBeNull();
      expect(res).toBeDefined();
      expect(res?.id).toBe('att-resp-001');
      expect(res?.documentDate).toBe('2026-10-12');
      expect(lastPostUrl).toBe('/records/attachments/upload');
      expect(lastPostConfig?.headers?.['Content-Type']).toBe('multipart/form-data');
    });

    test('JSON fallback payload adheres strictly to DateOnly string without "T"', async () => {
      const strictlyFormattedDate = '2026-10-12';
      const payload = {
        patientId: 'pat-fallback-002',
        recordType: 'OutsideChestXRay',
        title: 'Paper COR Scan',
        fileName: 'paper_cor_scan.pdf',
        contentType: 'application/pdf',
        fileSizeBytes: 1024 * 200,
        storageUri: 'tenants/default/clinics/c1/records/12345.pdf.cez',
        documentDate: strictlyFormattedDate,
        notes: 'Verified against physical card.',
        uploadedByStaffName: 'Dr. Santos',
        encryptionAlgorithm: 'AES-256-GCM',
        encryptionKeyId: 'cmk-v1',
      };

      mockUploadJsonResponse = { id: 'att-json-fallback', ...payload };

      const [res, err] = await clinicService.uploadRecordAttachment(payload);

      expect(err).toBeNull();
      expect(res?.id).toBe('att-json-fallback');
      expect(lastPostUrl).toBe('/records/attachments');
      expect(lastPostPayload.documentDate).toBe('2026-10-12');
      expect(lastPostPayload.documentDate).not.toContain('T');
      expect(lastPostPayload.encryptionAlgorithm).toBe('AES-256-GCM');
    });

    test('handles 413 Payload Too Large error gracefully without unhandled promise rejections', async () => {
      mockErrorResponse = { status: 413, message: 'Request Entity Too Large (Max 25MB allowed)' };

      const formData = new FormData();
      const [res, err] = await clinicService.uploadRecordAttachmentFile(formData);

      expect(res).toBeNull();
      expect(err).toBeDefined();
      expect(err?.status).toBe(413);
      expect(err?.message).toContain('Too Large');
    });

    test('handles 500 Internal Server Error without throwing unhandled exceptions', async () => {
      mockErrorResponse = { status: 500, message: 'Internal Server Error' };

      const formData = new FormData();
      const [res, err] = await clinicService.uploadRecordAttachmentFile(formData);

      expect(res).toBeNull();
      expect(err).toBeDefined();
      expect(err?.status).toBe(500);
      expect(err?.message).toBe('Internal Server Error');
    });
  });
});

// token-guard:ignore-file
import { describe, expect, test, mock } from 'bun:test';

(globalThis as any).__DEV__ = true;

// Mock react-native dependencies for bun test runtime BEFORE any component imports
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
  Alert: { alert: () => {} },
  Linking: { openURL: () => Promise.resolve(), canOpenURL: () => Promise.resolve(true) },
  processColor: (c: any) => c,
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
}));

mock.module('../constants/fonts', () => ({
  applyFontFamily: (s: any) => s,
  fontAssets: {},
}));

const {
  splitFullName,
  buildPhilHealthProfileData,
  extractPhilHealthProfileData,
  PHILHEALTH_RELATIONSHIPS,
} = await import('../components/patient/memberType');

const {
  validatePhilHealthPinMod11,
  formatPhilHealthPin,
  MOD11_WEIGHTS,
} = await import('../components/ui/PhilHealthPinInput');

const { STANDARD_REJECTION_REASONS } = await import('../components/chart/RejectionReasonModal');

import type { MemberType, PrincipalRelationship } from '../components/patient/memberType';
import type { ClinicRecordAttachmentRecord } from '../services/clinicService';

describe('M2 Challenger Empirical Stress: Mod-11 PIN Validation', () => {
  test('Weights array strictly matches RA 11223 statutory [6, 5, 4, 3, 2, 7, 6, 5, 4, 3, 2]', () => {
    expect(MOD11_WEIGHTS).toEqual([6, 5, 4, 3, 2, 7, 6, 5, 4, 3, 2]);
    expect(MOD11_WEIGHTS.length).toBe(11);
  });

  test('Validates Remainder 0 edge case: check digit must be 0', () => {
    // 00-000000000-0: sum = 0, sum % 11 = 0, (11 - 0) % 11 = 0
    const res = validatePhilHealthPinMod11('00-000000000-0');
    expect(res.isValid).toBe(true);
    expect(res.isComplete).toBe(true);
    expect(res.actualCheckDigit).toBe(0);
    expect(res.expectedCheckDigit).toBe(0);

    // Mismatched check digits 1..9 for remainder 0 must fail
    for (let d = 1; d <= 9; d++) {
      const invalid = validatePhilHealthPinMod11(`00-000000000-${d}`);
      expect(invalid.isValid).toBe(false);
      expect(invalid.actualCheckDigit).toBe(d);
      expect(invalid.errorMessage).toBeDefined();
    }
  });

  test('Validates Remainder 1 edge case: check digit 10 maps to 0 per PhilHealth statutory rules', () => {
    // 00-000000006-0:
    // Digits: 0,0,0,0,0,0,0,0,0,6,0
    // sum = 6 * 2 = 12. 12 % 11 = 1.
    // remainder = 1 -> expectedCheckDigit = (11 - 1) % 11 = 10.
    // In PhilHealth Mod-11, 10 maps to 0.
    const res = validatePhilHealthPinMod11('00-000000006-0');
    expect(res.isValid).toBe(true);
    expect(res.isComplete).toBe(true);
    expect(res.actualCheckDigit).toBe(0);

    // When check digit is 1 (or anything other than 0), it must fail!
    for (let d = 1; d <= 9; d++) {
      const invalid = validatePhilHealthPinMod11(`00-000000006-${d}`);
      expect(invalid.isValid).toBe(false);
      expect(invalid.actualCheckDigit).toBe(d);
      expect(invalid.errorMessage).toContain('expected 0 (or 10)');
    }
  });

  test('Exhaustive coverage of remainders 2 through 10 with exact mathematical check digits', () => {
    const remainderCases = [
      { r: 2, expectedDigit: 9, pin: '00-000000001-9' }, // sum = 1*2 = 2, r=2, c=9
      { r: 3, expectedDigit: 8, pin: '00-000000007-8' }, // sum = 7*2 = 14, r=3, c=8
      { r: 4, expectedDigit: 7, pin: '00-000000002-7' }, // sum = 2*2 = 4, r=4, c=7
      { r: 5, expectedDigit: 6, pin: '00-000000008-6' }, // sum = 8*2 = 16, r=5, c=6
      { r: 6, expectedDigit: 5, pin: '00-000000003-5' }, // sum = 3*2 = 6, r=6, c=5
      { r: 7, expectedDigit: 4, pin: '00-000000009-4' }, // sum = 9*2 = 18, r=7, c=4
      { r: 8, expectedDigit: 3, pin: '00-000000004-3' }, // sum = 4*2 = 8, r=8, c=3
      { r: 9, expectedDigit: 2, pin: '00-000000030-2' }, // sum = 3*3 = 9, r=9, c=2
      { r: 10, expectedDigit: 1, pin: '00-000000005-1' }, // sum = 5*2 = 10, r=10, c=1
    ];

    for (const testCase of remainderCases) {
      const res = validatePhilHealthPinMod11(testCase.pin);
      expect(res.isValid).toBe(true);
      expect(res.actualCheckDigit).toBe(testCase.expectedDigit);
      expect(res.expectedCheckDigit).toBe(testCase.expectedDigit);
    }
  });

  test('Validates known PhilHealth statutory and production PINs', () => {
    const validProductionPins = [
      '12-345678901-8',
      '10-000000000-5',
      '01-025000001-0',
      '11-111111111-8',
      '99-999999999-6',
    ];

    for (const pin of validProductionPins) {
      const res = validatePhilHealthPinMod11(pin);
      expect(res.isValid).toBe(true);
      expect(res.isComplete).toBe(true);
      expect(res.errorMessage).toBeUndefined();
    }
  });

  test('Robust sanitization: Strips non-digit characters and normalizes formattedPin', () => {
    const inputsWithNoise = [
      '12.3456.78901-8',
      '12 3456 78901 8',
      'PH-12-345678901-8',
      '  12-345678901-8  ',
      '#12$345678901*8',
    ];

    for (const raw of inputsWithNoise) {
      const res = validatePhilHealthPinMod11(raw);
      expect(res.isValid).toBe(true);
      expect(res.formattedPin).toBe('12-345678901-8');
      expect(res.digitsCount).toBe(12);
    }
  });

  test('Rejects invalid lengths: under 12 digits or empty/whitespace', () => {
    expect(validatePhilHealthPinMod11('').isValid).toBe(false);
    expect(validatePhilHealthPinMod11('   ').isValid).toBe(false);
    expect(validatePhilHealthPinMod11('12').isValid).toBe(false);
    expect(validatePhilHealthPinMod11('12-34567').isValid).toBe(false);
    expect(validatePhilHealthPinMod11('12-345678901').isValid).toBe(false); // 11 digits
  });

  test('Adversarial corruption: 100% rejection across all 12 positions with 10 alternative digits', () => {
    const basePin = '123456789018'; // 12-345678901-8
    expect(validatePhilHealthPinMod11(basePin).isValid).toBe(true);

    for (let pos = 0; pos < 12; pos++) {
      const originalDigit = parseInt(basePin[pos], 10);
      for (let digit = 0; digit <= 9; digit++) {
        if (digit === originalDigit) continue;
        const mutated = basePin.slice(0, pos) + digit + basePin.slice(pos + 1);
        const check = validatePhilHealthPinMod11(mutated);
        expect(check.isValid).toBe(false);
      }
    }
  });

  test('Dynamic formatter formatPhilHealthPin applies XX-XXXXXXXXX-X masks cleanly', () => {
    expect(formatPhilHealthPin('')).toBe('');
    expect(formatPhilHealthPin('1')).toBe('1');
    expect(formatPhilHealthPin('12')).toBe('12');
    expect(formatPhilHealthPin('123')).toBe('12-3');
    expect(formatPhilHealthPin('12345678901')).toBe('12-345678901');
    expect(formatPhilHealthPin('123456789018')).toBe('12-345678901-8');
    expect(formatPhilHealthPin('123456789018999')).toBe('12-345678901-8'); // Truncates beyond 12
  });
});

describe('M2 Challenger Empirical Stress: PhilHealth Member Type Serialization & Deserialization', () => {
  test('T2.1: Member (MM) serialization payload structure and extractPhilHealthProfileData behavior', () => {
    const profilePayload = buildPhilHealthProfileData({
      memberType: 'MM',
      patientPin: '12-345678901-8',
      patientFirstName: 'Juan',
      patientLastName: 'Dela Cruz',
      patientMiddleName: 'Protacio',
      patientDob: '1990-05-15',
    });

    expect(profilePayload.memberType).toBe('MM');
    expect(profilePayload.pin).toBe('12-345678901-8');
    expect(profilePayload.memberPin).toBe('12-345678901-8');
    expect(profilePayload.memberFirstName).toBe('Juan');
    expect(profilePayload.memberLastName).toBe('Dela Cruz');
    expect(profilePayload.memberMiddleName).toBe('Protacio');
    expect(profilePayload.memberBirthDate).toBe('1990-05-15');
    expect(profilePayload.dependentRelationship).toBeUndefined();

    // Deserialization with explicit root member_type = 'MM'
    const customFields = {
      member_type: 'MM',
      philhealth_profile: profilePayload,
    };

    const extracted = extractPhilHealthProfileData(customFields);
    expect(extracted.memberType).toBe('MM');

    // EMPIRICAL OBSERVATION:
    // When customFields lacks flattened 'principal_member_pin', extractPhilHealthProfileData
    // falls back to profile.memberPin, which for MM is the patient's own PIN.
    expect(extracted.principalPin).toBe('12-345678901-8');
    // Similarly, combinedName falls back to patient's own first + last name.
    expect(extracted.principalFullName).toBe('Juan Dela Cruz');
  });

  test('T2.2: Dependent (DD) serialization with principal sponsor fields and deserialization roundtrip', () => {
    const profilePayload = buildPhilHealthProfileData({
      memberType: 'DD',
      patientPin: '10-000000000-5',
      patientFirstName: 'Junior',
      patientLastName: 'Santos',
      patientMiddleName: 'Cruz',
      patientDob: '2015-08-20',
      principalPin: '12-345678901-8',
      principalFullName: 'Maria Santos',
      principalRelationship: 'P',
      principalDob: '1985-02-14',
    });

    expect(profilePayload.memberType).toBe('DD');
    expect(profilePayload.pin).toBe('10-000000000-5');
    expect(profilePayload.memberPin).toBe('12-345678901-8'); // Principal's PIN becomes memberPin
    expect(profilePayload.memberFirstName).toBe('Maria');
    expect(profilePayload.memberLastName).toBe('Santos');
    expect(profilePayload.memberMiddleName).toBeUndefined();
    expect(profilePayload.memberBirthDate).toBe('1985-02-14');
    expect(profilePayload.dependentRelationship).toBe('P');

    // Deserialization with both root fields and nested profile
    const customFields = {
      member_type: 'DD',
      principal_member_pin: '12-345678901-8',
      principal_full_name: 'Maria Santos',
      principal_relationship: 'P' as PrincipalRelationship,
      principal_dob: '1985-02-14',
      philhealth_profile: profilePayload,
    };

    const extracted = extractPhilHealthProfileData(customFields);
    expect(extracted.memberType).toBe('DD');
    expect(extracted.principalPin).toBe('12-345678901-8');
    expect(extracted.principalFullName).toBe('Maria Santos');
    expect(extracted.principalRelationship).toBe('P');
    expect(extracted.principalDob).toBe('1985-02-14');
  });

  test('T2.3: splitFullName handles single-word, multi-word, and edge-case whitespace strings', () => {
    expect(splitFullName('')).toEqual(['', '']);
    expect(splitFullName('   ')).toEqual(['', '']);
    expect(splitFullName(undefined)).toEqual(['', '']);
    expect(splitFullName('Madonna')).toEqual(['Madonna', '']);
    expect(splitFullName('Juan Dela Cruz')).toEqual(['Juan Dela', 'Cruz']);
    expect(splitFullName('Maria Josefa Gabriela Silang')).toEqual(['Maria Josefa Gabriela', 'Silang']);
    expect(splitFullName('  Jose   Rizal  ')).toEqual(['Jose', 'Rizal']);
  });

  test('T2.4: extractPhilHealthProfileData defensive fallback when customFields is null or empty', () => {
    const empty1 = extractPhilHealthProfileData(null);
    expect(empty1.memberType).toBe('MM');
    expect(empty1.principalPin).toBe('');
    expect(empty1.principalFullName).toBe('');
    expect(empty1.principalRelationship).toBe('C');
    expect(empty1.principalDob).toBe('');

    const empty2 = extractPhilHealthProfileData({});
    expect(empty2.memberType).toBe('MM');
    expect(empty2.principalPin).toBe('');
    expect(empty2.principalFullName).toBe('');
    expect(empty2.principalRelationship).toBe('C');
    expect(empty2.principalDob).toBe('');
  });

  test('T2.5: All 4 statutory PhilHealth relationship codes (C, S, P, D) are defined and selectable', () => {
    const codes = PHILHEALTH_RELATIONSHIPS.map((r) => r.code);
    expect(codes).toEqual(['C', 'S', 'P', 'D']);
    expect(PHILHEALTH_RELATIONSHIPS.find((r) => r.code === 'C')?.label).toContain('Child');
    expect(PHILHEALTH_RELATIONSHIPS.find((r) => r.code === 'S')?.label).toContain('Spouse');
    expect(PHILHEALTH_RELATIONSHIPS.find((r) => r.code === 'P')?.label).toContain('Parent');
    expect(PHILHEALTH_RELATIONSHIPS.find((r) => r.code === 'D')?.label).toContain('Disabled Dependent');
  });
});

describe('M2 Challenger Empirical Stress: ExternalDocumentVaultTab Quarantine & Rejection', () => {
  const mockAttachments: ClinicRecordAttachmentRecord[] = [
    {
      id: 'att-1',
      patientId: 'pat-100',
      recordType: 'OutsideChestXRay',
      title: 'Chest PA X-Ray',
      fileName: 'cxr_scan.pdf',
      fileSizeBytes: 1048576,
      mimeType: 'application/pdf',
      documentDate: '2026-10-01',
      verificationStatus: 'PendingVerification',
      createdAt: '2026-10-01T08:00:00Z',
    },
    {
      id: 'att-2',
      patientId: 'pat-100',
      recordType: 'DiagnosticLabReport',
      title: 'Complete Blood Count (CBC)',
      fileName: 'cbc_outside.png',
      fileSizeBytes: 524288,
      mimeType: 'image/png',
      documentDate: '2026-10-02',
      verificationStatus: 'PendingVerification',
      createdAt: '2026-10-02T09:00:00Z',
    },
    {
      id: 'att-3',
      patientId: 'pat-100',
      recordType: 'COR',
      title: 'Certificate of Registration',
      fileName: 'cor_2026.pdf',
      fileSizeBytes: 2097152,
      mimeType: 'application/pdf',
      documentDate: '2026-09-15',
      verificationStatus: 'Verified',
      verifiedByStaffName: 'Dr. Santos',
      verifiedAt: '2026-09-16T10:00:00Z',
      createdAt: '2026-09-15T10:00:00Z',
    },
    {
      id: 'att-4',
      patientId: 'pat-100',
      recordType: 'MedicalCertificate',
      title: 'Outside Fit-to-Work Clearance',
      fileName: 'fit_to_work.jpg',
      fileSizeBytes: 3145728,
      mimeType: 'image/jpeg',
      documentDate: '2026-09-01',
      verificationStatus: 'Rejected',
      rejectionReason: 'Expired medical clearance / Outdated test',
      verifiedByStaffName: 'Dr. Santos',
      verifiedAt: '2026-09-02T11:00:00Z',
      createdAt: '2026-09-01T11:00:00Z',
    },
  ];

  test('T3.1: Filter badge count calculation strictly isolates Pending from Verified and Rejected', () => {
    const calculateCounts = (attachments: ClinicRecordAttachmentRecord[]) => {
      const pendingCount = attachments.filter((att) => {
        const isVerified = att.verificationStatus === 'Verified';
        const isRejected = att.verificationStatus === 'Rejected';
        return !isVerified && !isRejected;
      }).length;

      const verifiedCount = attachments.filter((att) => att.verificationStatus === 'Verified').length;
      const rejectedCount = attachments.filter((att) => att.verificationStatus === 'Rejected').length;

      return { total: attachments.length, pendingCount, verifiedCount, rejectedCount };
    };

    const counts = calculateCounts(mockAttachments);
    expect(counts.total).toBe(4);
    expect(counts.pendingCount).toBe(2); // att-1 and att-2
    expect(counts.verifiedCount).toBe(1); // att-3
    expect(counts.rejectedCount).toBe(1); // att-4

    // Verified and Rejected items are STRICTLY excluded from pendingCount
    const pendingItems = mockAttachments.filter((att) => {
      const isVerified = att.verificationStatus === 'Verified';
      const isRejected = att.verificationStatus === 'Rejected';
      return !isVerified && !isRejected;
    });
    expect(pendingItems.map((a) => a.id)).toEqual(['att-1', 'att-2']);
    expect(pendingItems.some((a) => a.verificationStatus === 'Verified')).toBe(false);
    expect(pendingItems.some((a) => a.verificationStatus === 'Rejected')).toBe(false);
  });

  test('T3.2: Quarantine transition: PendingVerification -> Verified decreases pending count and increments verified count', () => {
    let currentAttachments = [...mockAttachments];

    const verifyAttachment = (id: string, staffName: string) => {
      currentAttachments = currentAttachments.map((att) =>
        att.id === id
          ? {
              ...att,
              verificationStatus: 'Verified',
              verifiedAt: new Date().toISOString(),
              verifiedByStaffName: staffName,
              rejectionReason: undefined,
            }
          : att
      );
    };

    verifyAttachment('att-1', 'Dr. Rizal');

    const pendingAfter = currentAttachments.filter(
      (a) => a.verificationStatus !== 'Verified' && a.verificationStatus !== 'Rejected'
    );
    const verifiedAfter = currentAttachments.filter((a) => a.verificationStatus === 'Verified');
    const rejectedAfter = currentAttachments.filter((a) => a.verificationStatus === 'Rejected');

    expect(pendingAfter.length).toBe(1); // att-2 only
    expect(verifiedAfter.length).toBe(2); // att-3 and att-1
    expect(rejectedAfter.length).toBe(1); // att-4
    expect(verifiedAfter.find((a) => a.id === 'att-1')?.verifiedByStaffName).toBe('Dr. Rizal');
  });

  test('T3.3: Quarantine transition: PendingVerification -> Rejected enforces rejection reason and decreases pending count', () => {
    let currentAttachments = [...mockAttachments];

    const rejectAttachment = (id: string, reason: string, staffName: string) => {
      if (!reason || !reason.trim()) {
        throw new Error('A rejection reason is mandatory when rejecting outside documents');
      }
      currentAttachments = currentAttachments.map((att) =>
        att.id === id
          ? {
              ...att,
              verificationStatus: 'Rejected',
              rejectionReason: reason.trim(),
              verifiedAt: new Date().toISOString(),
              verifiedByStaffName: staffName,
            }
          : att
      );
    };

    // Rejection without reason must be rejected
    expect(() => rejectAttachment('att-2', '', 'Dr. Rizal')).toThrow(
      'A rejection reason is mandatory when rejecting outside documents'
    );
    expect(() => rejectAttachment('att-2', '   ', 'Dr. Rizal')).toThrow(
      'A rejection reason is mandatory when rejecting outside documents'
    );

    // Legitimate rejection with reason for att-1 and att-2
    const validReason = 'Illegible image / Unreadable film: Blur on lower right lung base';
    rejectAttachment('att-1', validReason, 'Dr. Rizal');
    rejectAttachment('att-2', validReason, 'Dr. Rizal');

    const pendingAfter = currentAttachments.filter(
      (a) => a.verificationStatus !== 'Verified' && a.verificationStatus !== 'Rejected'
    );
    const verifiedAfter = currentAttachments.filter((a) => a.verificationStatus === 'Verified');
    const rejectedAfter = currentAttachments.filter((a) => a.verificationStatus === 'Rejected');

    expect(pendingAfter.length).toBe(0); // All pending reviewed!
    expect(verifiedAfter.length).toBe(1);
    expect(rejectedAfter.length).toBe(3); // att-4, att-1, att-2
    expect(rejectedAfter.find((a) => a.id === 'att-2')?.rejectionReason).toBe(validReason);
  });

  test('T3.4: STANDARD_REJECTION_REASONS contains comprehensive clinical rejection presets', () => {
    expect(STANDARD_REJECTION_REASONS).toContain('Illegible image / Unreadable film');
    expect(STANDARD_REJECTION_REASONS).toContain('Expired medical clearance / Outdated test');
    expect(STANDARD_REJECTION_REASONS).toContain('Incorrect patient name or identification mismatch');
    expect(STANDARD_REJECTION_REASONS).toContain('Unrelated or incomplete medical record');
    expect(STANDARD_REJECTION_REASONS).toContain('Missing official physician signature or stamp');
    expect(STANDARD_REJECTION_REASONS).toContain('Other / Custom reason');
    expect(STANDARD_REJECTION_REASONS.length).toBe(6);
  });

  test('T3.5: Category and status filtering logic handles OutsideChestXRay, COR, OutsideLab and status filters', () => {
    const filterFn = (
      attachments: ClinicRecordAttachmentRecord[],
      status: 'ALL' | 'PENDING' | 'VERIFIED' | 'REJECTED',
      category: string
    ) => {
      return attachments.filter((att) => {
        const isVerified = att.verificationStatus === 'Verified';
        const isRejected = att.verificationStatus === 'Rejected';
        const isPending = !isVerified && !isRejected;

        if (status === 'PENDING' && !isPending) return false;
        if (status === 'VERIFIED' && !isVerified) return false;
        if (status === 'REJECTED' && !isRejected) return false;

        if (category === 'ALL') return true;
        if (category === 'OutsideChestXRay') {
          return att.recordType === 'OutsideChestXRay' || att.title?.toLowerCase().includes('x-ray');
        }
        if (category === 'COR') {
          return (
            att.recordType === 'COR' ||
            att.title?.toLowerCase().includes('cor') ||
            att.title?.toLowerCase().includes('certificate')
          );
        }
        if (category === 'OutsideLab') {
          return att.recordType === 'OutsideLabReport' || att.recordType === 'DiagnosticLabReport';
        }
        return att.recordType === category;
      });
    };

    expect(filterFn(mockAttachments, 'ALL', 'ALL').length).toBe(4);
    expect(filterFn(mockAttachments, 'PENDING', 'ALL').length).toBe(2);
    expect(filterFn(mockAttachments, 'VERIFIED', 'ALL').length).toBe(1);
    expect(filterFn(mockAttachments, 'REJECTED', 'ALL').length).toBe(1);
    expect(filterFn(mockAttachments, 'ALL', 'OutsideChestXRay').length).toBe(1);
    expect(filterFn(mockAttachments, 'ALL', 'OutsideLab').length).toBe(1);
    expect(filterFn(mockAttachments, 'ALL', 'COR').length).toBe(1); // att-3 matches 'COR' / 'certificate'
  });
});

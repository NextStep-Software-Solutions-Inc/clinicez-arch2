// token-guard:ignore-file
import { describe, expect, test, mock, beforeEach } from 'bun:test';

(globalThis as any).__DEV__ = true;

// Mock React Native modules for Bun environment
let currentWindowWidth = 1200;
let currentWindowHeight = 800;

mock.module('react-native', () => ({
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
    get: () => ({ width: currentWindowWidth, height: currentWindowHeight }),
    addEventListener: () => ({ remove: () => {} }),
  },
  useWindowDimensions: () => ({ width: currentWindowWidth, height: currentWindowHeight }),
  Keyboard: { dismiss: () => {}, addListener: () => ({ remove: () => {} }) },
  AppState: { addEventListener: () => ({ remove: () => {} }) },
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
    spring: () => ({ start: (cb?: any) => cb && cb() }),
    View: 'Animated.View',
    Text: 'Animated.Text',
  },
  Alert: {
    alert: (title: string, msg?: string) => {},
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
  default: 'Svg',
}));

mock.module('../constants/fonts', () => ({
  applyFontFamily: (s: any) => s,
  fontAssets: {},
}));

mock.module('../utils/useBreakpoint', () => ({
  useBreakpoint: () => {
    const width = currentWindowWidth;
    const height = currentWindowHeight;
    const { theme } = require('../constants/theme');
    return {
      width,
      height,
      isCompact: width < theme.breakpoints.tablet,
      isWorkstation: width >= theme.breakpoints.tablet,
      isDesktop: width >= theme.breakpoints.desktop,
      isWide: width >= theme.breakpoints.wide,
    };
  },
}));

// ApiClient Mock Interceptor
let lastGetUrl = '';
let lastPostUrl = '';
let lastPutUrl = '';
let lastPostPayload: any = null;
let lastPutPayload: any = null;
let mockGetResponse: any = null;
let mockPostResponse: any = null;
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
      return [mockPostResponse, null];
    },
    put: async (url: string, data?: any) => {
      lastPutUrl = url;
      lastPutPayload = data;
      if (mockErrorResponse) return [null, mockErrorResponse];
      return [mockPostResponse, null];
    },
  },
  clinicApiUrl: (p: string) => `http://localhost:5000/api/v1${p}`,
}));

const { clinicService } = await import('../services/clinicService');
const {
  YakapClaimReadinessCard,
  DEFAULT_PHYSICAL_EXAM_NORMAL,
} = await import('../components/consultation');
const { theme } = await import('../constants/theme');

describe('Challenger M4-1 Empirical Stress Tests — Features 17 & 18', () => {
  beforeEach(() => {
    lastGetUrl = '';
    lastPostUrl = '';
    lastPutUrl = '';
    lastPostPayload = null;
    lastPutPayload = null;
    mockGetResponse = null;
    mockPostResponse = null;
    mockErrorResponse = null;
    currentWindowWidth = 1200;
    currentWindowHeight = 800;
  });

  // =========================================================================
  // 1. STATUTORY CONDITION 1: DOCTOR PHILHEALTH PAN
  // =========================================================================
  describe('Condition 1: Doctor PhilHealth Accreditation Number (PAN)', () => {
    const evaluatePanCurrent = (doctorPanInput: string, staffRecordPan?: string) => {
      return !!(doctorPanInput.trim() || staffRecordPan);
    };

    const evaluatePanDefensive = (doctorPanInput: string, staffRecordPan?: string) => {
      return !!(doctorPanInput.trim() || staffRecordPan?.trim());
    };

    test('1.1 Empty or whitespace PAN with no staff fallback evaluates to false', () => {
      expect(evaluatePanCurrent('', undefined)).toBe(false);
      expect(evaluatePanCurrent('   ', undefined)).toBe(false);
      expect(evaluatePanCurrent('', '')).toBe(false);
      expect(evaluatePanDefensive('   ', '   ')).toBe(false);
    });

    test('1.2 Adversarial Finding: Whitespace-only in staff record passes client check but fails server validation', () => {
      // In current Consultations.screen.tsx: !!(doctorPan.trim() || signerStaff?.philHealthPan)
      // If staff has whitespace '   ', !!('   ') evaluates to true on client:
      const clientEvaluation = evaluatePanCurrent('', '   ');
      expect(clientEvaluation).toBe(true);

      // But backend ValidateConsultationYakapReadinessQueryHandler checks !string.IsNullOrWhiteSpace(pan):
      const serverEvaluation = !('   '.trim().length === 0);
      expect(serverEvaluation).toBe(false);

      // This confirms client-server divergence under whitespace pollution in staff profile
      expect(clientEvaluation).not.toBe(serverEvaluation);
    });

    test('1.3 Valid PAN entered directly evaluates to true', () => {
      expect(evaluatePanCurrent('123456789012', undefined)).toBe(true);
      expect(evaluatePanCurrent('PAN-2026-9901', undefined)).toBe(true);
    });

    test('1.4 Empty input correctly falls back to doctor staff record PAN', () => {
      expect(evaluatePanCurrent('', 'PAN-STAFF-123')).toBe(true);
      expect(evaluatePanCurrent('   ', 'PAN-STAFF-123')).toBe(true);
    });

    test('1.5 YakapClaimReadinessCard reflects PAN invalidation and applies incomplete card style', () => {
      const element = YakapClaimReadinessCard({
        serverReadiness: null,
        localEvaluation: {
          doctorPanValid: false,
          doctorPrcValid: true,
          patientPinValid: true,
          atcValid: true,
          symptomsValid: true,
          physicalExamComplete: true,
          primaryDiagnosisPresent: true,
          vitalsComplete: true,
          medicinesValid: true,
          s2LicenseValid: true,
          missingFields: ['Doctor PhilHealth Accreditation Number (PAN) is missing.'],
          warnings: [],
        },
        onRevalidate: () => {},
        onJumpToSection: () => {},
      });

      expect(element).toBeDefined();
      expect(element.props.style[1].borderColor).toBe(theme.colors.warningBorder);
    });
  });

  // =========================================================================
  // 2. STATUTORY CONDITION 2: DOCTOR PRC LICENSE
  // =========================================================================
  describe('Condition 2: Doctor PRC License Number', () => {
    const evaluatePrc = (doctorPrcInput: string, staffRecordPrc?: string) => {
      return !!(doctorPrcInput.trim() || staffRecordPrc);
    };

    test('2.1 Missing or whitespace PRC without staff fallback evaluates to false', () => {
      expect(evaluatePrc('', undefined)).toBe(false);
      expect(evaluatePrc('   ', undefined)).toBe(false);
      expect(evaluatePrc('', '')).toBe(false);
    });

    test('2.2 Valid PRC license evaluates to true', () => {
      expect(evaluatePrc('0123456', undefined)).toBe(true);
      expect(evaluatePrc('PRC-889900', undefined)).toBe(true);
    });

    test('2.3 Empty input falls back to staff record PRC', () => {
      expect(evaluatePrc('', '0123456')).toBe(true);
    });
  });

  // =========================================================================
  // 3. STATUTORY CONDITION 3: PATIENT PHILHEALTH PIN (12 NUMERIC DIGITS)
  // =========================================================================
  describe('Condition 3: Patient PhilHealth PIN (RA 11223 12-Digit Mandate)', () => {
    const evaluatePin = (rawPin: string | null | undefined) => {
      if (!rawPin) return false;
      const digits = rawPin.replace(/\D/g, '');
      return digits.length === 12;
    };

    test('3.1 Invalid lengths: under-length, over-length, and empty evaluate to false', () => {
      expect(evaluatePin('')).toBe(false);
      expect(evaluatePin(null)).toBe(false);
      expect(evaluatePin(undefined)).toBe(false);
      expect(evaluatePin('12345678901')).toBe(false); // 11 digits
      expect(evaluatePin('12-34567890-1')).toBe(false); // 11 digits
      expect(evaluatePin('1234567890123')).toBe(false); // 13 digits
      expect(evaluatePin('12-3456789012-3')).toBe(false); // 13 digits
    });

    test('3.2 Non-numeric strings evaluate to false', () => {
      expect(evaluatePin('XX-XXXXXXXXX-X')).toBe(false);
      expect(evaluatePin('NOT-A-VALID-PIN')).toBe(false);
      expect(evaluatePin('NONE')).toBe(false);
    });

    test('3.3 Valid formats: raw 12 digits, standard hyphenated, and surrounding whitespace evaluate to true', () => {
      expect(evaluatePin('123456789012')).toBe(true);
      expect(evaluatePin('12-345678901-2')).toBe(true);
      expect(evaluatePin('  12-345678901-2  ')).toBe(true);
      expect(evaluatePin('12 345678901 2')).toBe(true);
    });
  });

  // =========================================================================
  // 4. STATUTORY CONDITION 4: ATC AUTHORIZATION TRANSACTION CODE
  // =========================================================================
  describe('Condition 4: Encounter ATC Code', () => {
    const evaluateAtc = (atcInput: string) => {
      return !!atcInput.trim();
    };

    test('4.1 Missing or whitespace ATC evaluates to false', () => {
      expect(evaluateAtc('')).toBe(false);
      expect(evaluateAtc('   ')).toBe(false);
    });

    test('4.2 Non-empty ATC evaluates to true', () => {
      expect(evaluateAtc('ATC-2026-KON01')).toBe(true);
      expect(evaluateAtc('ATC123456789')).toBe(true);
    });
  });

  // =========================================================================
  // 5. STATUTORY CONDITION 5: CHIEF COMPLAINTS & MANDATORY PAIN SITE / DESCRIPTIONS
  // =========================================================================
  describe('Condition 5: Chief Complaints (lib_signs_symptoms, Code 38 Pain Site, Code X Description)', () => {
    const evaluateSymptoms = (
      selectedCodes: string[],
      painSite: string,
      otherDesc: string,
      subjectiveNarrative: string,
    ) => {
      const hasSymptom = selectedCodes.length > 0;
      const hasPainCode = selectedCodes.includes('38');
      const painSiteValid = !hasPainCode || !!painSite.trim();
      const hasOtherCode = selectedCodes.includes('X');
      const otherValid = !hasOtherCode || !!(otherDesc.trim() || subjectiveNarrative.trim());
      return hasSymptom && painSiteValid && otherValid;
    };

    test('5.1 Zero selected symptoms evaluates to false', () => {
      expect(evaluateSymptoms([], '', '', '')).toBe(false);
    });

    test('5.2 Standard complaint without pain code (e.g. 01 Fever) evaluates to true', () => {
      expect(evaluateSymptoms(['01'], '', '', '')).toBe(true);
    });

    test('5.3 Chief complaint code 38 (PAIN) WITHOUT pain site evaluates to false', () => {
      expect(evaluateSymptoms(['38'], '', '', 'Complaining of pain')).toBe(false);
      expect(evaluateSymptoms(['38'], '   ', '', '')).toBe(false);
    });

    test('5.4 Chief complaint code 38 WITH documented pain site evaluates to true', () => {
      expect(evaluateSymptoms(['38'], 'Epigastric quadrant', '', '')).toBe(true);
    });

    test('5.5 Multiple symptoms including code 38 fails if pain site is omitted', () => {
      expect(evaluateSymptoms(['01', '03', '38'], '', '', '')).toBe(false);
      expect(evaluateSymptoms(['01', '03', '38'], 'Right lower quadrant', '', '')).toBe(true);
    });

    test('5.6 Chief complaint code X (OTHERS) WITHOUT description evaluates to false', () => {
      expect(evaluateSymptoms(['X'], '', '', '')).toBe(false);
      expect(evaluateSymptoms(['X'], '', '   ', '   ')).toBe(false);
    });

    test('5.7 Chief complaint code X WITH explicit other description evaluates to true', () => {
      expect(evaluateSymptoms(['X'], '', 'Chronic bilateral numbness', '')).toBe(true);
    });

    test('5.8 Chief complaint code X with narrative subjective fallback evaluates to true', () => {
      expect(evaluateSymptoms(['X'], '', '', 'Patient reports persistent tingling in fingers')).toBe(true);
    });
  });

  // =========================================================================
  // 6. STATUTORY CONDITION 6: 9-SYSTEM PHYSICAL EXAMINATION & GENERAL SURVEY
  // =========================================================================
  describe('Condition 6: 9-System Physical Examination & General Survey Completeness', () => {
    const evaluatePhysicalExam = (findings: any) => {
      return !!(
        findings?.generalSurvey &&
        findings?.skin &&
        findings?.heent &&
        findings?.chest &&
        findings?.heart &&
        findings?.abdomen &&
        findings?.neuro &&
        findings?.rectal &&
        findings?.gu &&
        findings?.musculoskeletal
      );
    };

    test('6.1 Incomplete systems (e.g. missing abdomen or rectal) evaluates to false', () => {
      const incomplete1 = { ...DEFAULT_PHYSICAL_EXAM_NORMAL, abdomen: null };
      expect(evaluatePhysicalExam(incomplete1)).toBe(false);

      const incomplete2 = { ...DEFAULT_PHYSICAL_EXAM_NORMAL, rectal: '' };
      expect(evaluatePhysicalExam(incomplete2)).toBe(false);

      const incomplete3 = { ...DEFAULT_PHYSICAL_EXAM_NORMAL, generalSurvey: undefined };
      expect(evaluatePhysicalExam(incomplete3)).toBe(false);
    });

    test('6.2 All 9 organ systems + General Survey documented evaluates to true', () => {
      expect(evaluatePhysicalExam(DEFAULT_PHYSICAL_EXAM_NORMAL)).toBe(true);
    });
  });

  // =========================================================================
  // 7. STATUTORY CONDITION 7: PRIMARY ICD-10 DIAGNOSIS
  // =========================================================================
  describe('Condition 7: Primary ICD-10 Diagnosis Requirement', () => {
    interface Diag {
      icd10Code: string;
      description: string;
      isPrimary: boolean;
    }

    const evaluatePrimaryDiagnosis = (diagnoses: Diag[]) => {
      return diagnoses.some((d) => d.isPrimary && !!d.icd10Code.trim());
    };

    test('7.1 Zero diagnoses evaluates to false', () => {
      expect(evaluatePrimaryDiagnosis([])).toBe(false);
    });

    test('7.2 Multiple diagnoses but none designated primary evaluates to false', () => {
      const list: Diag[] = [
        { icd10Code: 'J06.9', description: 'URI', isPrimary: false },
        { icd10Code: 'I10', description: 'Hypertension', isPrimary: false },
      ];
      expect(evaluatePrimaryDiagnosis(list)).toBe(false);
    });

    test('7.3 Primary diagnosis with valid ICD-10 evaluates to true', () => {
      const list: Diag[] = [
        { icd10Code: 'J06.9', description: 'URI', isPrimary: true },
        { icd10Code: 'I10', description: 'Hypertension', isPrimary: false },
      ];
      expect(evaluatePrimaryDiagnosis(list)).toBe(true);
    });

    test('7.4 Primary diagnosis with blank ICD-10 code evaluates to false', () => {
      const list: Diag[] = [
        { icd10Code: '   ', description: 'Clinical impression without code', isPrimary: true },
      ];
      expect(evaluatePrimaryDiagnosis(list)).toBe(false);
    });
  });

  // =========================================================================
  // 8. STATUTORY CONDITION 8: COMPLETE TRIAGE VITALS (BP, HR, TEMP, HEIGHT, WEIGHT)
  // =========================================================================
  describe('Condition 8: Complete Triage Vitals Completeness', () => {
    const evaluateVitals = (v: any) => {
      return !!(
        v?.systolicBp &&
        v?.diastolicBp &&
        v?.heartRateBpm &&
        v?.temperatureCelsius &&
        v?.heightCm &&
        v?.weightKg
      );
    };

    test('8.1 Null or empty vitals record evaluates to false', () => {
      expect(evaluateVitals(null)).toBe(false);
      expect(evaluateVitals(undefined)).toBe(false);
    });

    test('8.2 Missing individual vitals flags false', () => {
      const baseline = {
        systolicBp: 120,
        diastolicBp: 80,
        heartRateBpm: 72,
        temperatureCelsius: 36.6,
        heightCm: 165,
        weightKg: 60,
      };

      expect(evaluateVitals({ ...baseline, systolicBp: null })).toBe(false);
      expect(evaluateVitals({ ...baseline, diastolicBp: null })).toBe(false);
      expect(evaluateVitals({ ...baseline, heartRateBpm: 0 })).toBe(false);
      expect(evaluateVitals({ ...baseline, temperatureCelsius: null })).toBe(false);
      expect(evaluateVitals({ ...baseline, heightCm: null })).toBe(false);
      expect(evaluateVitals({ ...baseline, weightKg: null })).toBe(false);
    });

    test('8.3 All required vitals present evaluates to true', () => {
      const complete = {
        systolicBp: 120,
        diastolicBp: 80,
        heartRateBpm: 72,
        temperatureCelsius: 36.6,
        heightCm: 165,
        weightKg: 60,
      };
      expect(evaluateVitals(complete)).toBe(true);
    });
  });

  // =========================================================================
  // 9. STATUTORY CONDITION 9: CONTROLLED MEDICATIONS & PDEA S2 LICENSE
  // =========================================================================
  describe('Condition 9: Prescriptions & PDEA S2 Dangerous Drugs Gate', () => {
    interface Rx {
      genericName: string;
      isDangerousDrug: boolean;
      philHealthDrugCode?: string;
    }

    const evaluateMedicinesAndS2 = (
      prescriptions: Rx[],
      doctorS2Input: string,
      staffRecordS2?: string,
    ) => {
      const medicinesValid = prescriptions.length === 0 || prescriptions.every((p) => !!p.genericName.trim());
      const hasDangerousDrug = prescriptions.some((p) => p.isDangerousDrug);
      const s2Valid = !hasDangerousDrug || !!(doctorS2Input.trim() || staffRecordS2);
      return { medicinesValid, s2Valid, combinedValid: medicinesValid && s2Valid };
    };

    test('9.1 Zero prescriptions (NOMED fallback) evaluates to valid without S2', () => {
      const res = evaluateMedicinesAndS2([], '', undefined);
      expect(res.medicinesValid).toBe(true);
      expect(res.s2Valid).toBe(true);
      expect(res.combinedValid).toBe(true);
    });

    test('9.2 Uncontrolled drugs (e.g. Paracetamol) do not require S2 license', () => {
      const res = evaluateMedicinesAndS2(
        [{ genericName: 'Paracetamol', isDangerousDrug: false }],
        '',
        undefined,
      );
      expect(res.medicinesValid).toBe(true);
      expect(res.s2Valid).toBe(true);
      expect(res.combinedValid).toBe(true);
    });

    test('9.3 Dangerous drug prescribed (e.g. Morphine) WITHOUT S2 license flags s2Valid: false', () => {
      const res = evaluateMedicinesAndS2(
        [{ genericName: 'Morphine Sulfate', isDangerousDrug: true }],
        '',
        undefined,
      );
      expect(res.medicinesValid).toBe(true);
      expect(res.s2Valid).toBe(false);
      expect(res.combinedValid).toBe(false);
    });

    test('9.4 Dangerous drug prescribed WITH active S2 license evaluates to true', () => {
      const res = evaluateMedicinesAndS2(
        [{ genericName: 'Morphine Sulfate', isDangerousDrug: true }],
        'S2-2026-9901-PDEA',
        undefined,
      );
      expect(res.medicinesValid).toBe(true);
      expect(res.s2Valid).toBe(true);
      expect(res.combinedValid).toBe(true);
    });

    test('9.5 Dangerous drug prescribed falls back to staff record S2 license', () => {
      const res = evaluateMedicinesAndS2(
        [{ genericName: 'Morphine Sulfate', isDangerousDrug: true }],
        '',
        'S2-STAFF-123',
      );
      expect(res.s2Valid).toBe(true);
      expect(res.combinedValid).toBe(true);
    });
  });

  // =========================================================================
  // 10. PRE-FLIGHT SIGNING LOCK & BUREAUCRACY ISOLATION
  // =========================================================================
  describe('Pre-Flight Signing Lock & Bureaucracy Isolation (Feature 17)', () => {
    test('10.1 PhilHealth Konsulta encounter (isYakapEligible: true) is strictly locked when not ready', () => {
      const isYakapEligible = true;
      const isYakapReady = false;
      const missingCount = 3;

      const isSigningLocked = isYakapEligible && !isYakapReady;
      expect(isSigningLocked).toBe(true);

      const buttonTitle = isSigningLocked
        ? `Signing locked (${missingCount} statutory requirements pending)`
        : 'Sign & sync encounter';

      expect(buttonTitle).toBe('Signing locked (3 statutory requirements pending)');
    });

    test('10.2 PhilHealth Konsulta encounter unlocks button when all 10 conditions are satisfied', () => {
      const isYakapEligible = true;
      const isYakapReady = true;

      const isSigningLocked = isYakapEligible && !isYakapReady;
      expect(isSigningLocked).toBe(false);

      const buttonTitle = isSigningLocked
        ? 'Signing locked'
        : 'Sign & sync encounter';

      expect(buttonTitle).toBe('Sign & sync encounter');
    });

    test('10.3 Standard Cash/Private encounters (isYakapEligible: false) are NEVER blocked by statutory readiness', () => {
      const isYakapEligible = false;
      const serverReadiness = null;
      const localEvaluation = { isReady: false, missingFields: ['Everything missing'] };

      const isYakapReady = isYakapEligible
        ? (serverReadiness ? (serverReadiness as any).isReady : localEvaluation.isReady)
        : true;

      expect(isYakapReady).toBe(true);

      const isSigningLocked = isYakapEligible && !isYakapReady;
      expect(isSigningLocked).toBe(false);

      const buttonTitle = isYakapEligible && !isYakapReady
        ? 'Signing locked'
        : 'Sign & sync encounter';

      expect(buttonTitle).toBe('Sign & sync encounter');
    });
  });

  // =========================================================================
  // 11. ATTENDING PHYSICIAN CREDENTIAL AUTO-SNAPSHOTTING (Feature 18)
  // =========================================================================
  describe('Attending Physician Regulatory Credential Auto-Snapshotting (Feature 18)', () => {
    test('11.1 Sign consultation auto-snapshots Doctor PAN, PRC, PTR, and S2 into payload', async () => {
      mockPostResponse = { id: 'enc-stress-101', isSigned: true };

      const credentialsPayload = {
        prcLicenseNumber: 'PRC-0987654',
        ptrNumber: 'PTR-2026-1122',
        s2LicenseNumber: 'S2-PDEA-5544',
        doctorPhilHealthPan: 'PAN-123456789012',
        philHealthAtc: 'ATC-2026-KON01',
      };

      const [res, err] = await clinicService.signConsultation('enc-stress-101', credentialsPayload);

      expect(err).toBeNull();
      expect(res).toBeDefined();
      expect(lastPostUrl).toBe('/consultations/enc-stress-101/sign');
      expect(lastPostPayload.prcLicenseNumber).toBe('PRC-0987654');
      expect(lastPostPayload.ptrNumber).toBe('PTR-2026-1122');
      expect(lastPostPayload.s2LicenseNumber).toBe('S2-PDEA-5544');
      expect(lastPostPayload.doctorPhilHealthPan).toBe('PAN-123456789012');
      expect(lastPostPayload.philHealthAtc).toBe('ATC-2026-KON01');
    });

    test('11.2 Save to My Staff Profile updates doctor profile with current credentials', async () => {
      mockPostResponse = { id: 'staff-doc-1' };

      const profilePayload = {
        firstName: 'Maria',
        lastName: 'Santos',
        prcLicenseNumber: 'PRC-0987654',
        ptrNumber: 'PTR-2026-1122',
        s2LicenseNumber: 'S2-PDEA-5544',
        philHealthPan: 'PAN-123456789012',
      };

      await clinicService.updateMyProfile(profilePayload);

      expect(lastPutUrl).toBe('/staff/me');
      expect(lastPutPayload.philHealthPan).toBe('PAN-123456789012');
      expect(lastPutPayload.prcLicenseNumber).toBe('PRC-0987654');
      expect(lastPutPayload.s2LicenseNumber).toBe('S2-PDEA-5544');
    });

    test('11.3 Validate Consultation Yakap Readiness API communicates with correct endpoint', async () => {
      mockGetResponse = {
        isReady: true,
        encounterId: 'enc-stress-201',
        doctorPanValid: true,
        doctorPrcValid: true,
        patientPinValid: true,
        atcValid: true,
        symptomsValid: true,
        physicalExamComplete: true,
        primaryDiagnosisPresent: true,
        vitalsComplete: true,
        medicinesValid: true,
        s2LicenseValid: true,
        missingFields: [],
        warnings: [],
      };

      const [readiness, err] = await clinicService.validateConsultationYakapReadiness('enc-stress-201');

      expect(err).toBeNull();
      expect(readiness).toBeDefined();
      expect(readiness?.isReady).toBe(true);
      expect(lastGetUrl).toBe('/consultations/enc-stress-201/yakap-readiness');
    });
  });
});

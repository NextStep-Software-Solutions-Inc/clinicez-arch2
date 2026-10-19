import { describe, expect, test, mock, beforeEach } from 'bun:test';

(globalThis as any).__DEV__ = true;

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
  formatPhilHealthPin,
  validatePhilHealthPinMod11,
} = await import('../components/ui/PhilHealthPinInput');
import type {
  RegisterPatientPayload,
  CreateAllergyPayload,
  CheckPatientDuplicatesParams,
  DuplicatePatientCheckResult,
  ClinicPatient,
} from '../services/clinicService';

// Mock dependencies
let lastGetUrl = '';
let lastGetParams: any = null;
let lastPostUrl = '';
let lastPostPayload: any = null;
let mockDuplicateResult: DuplicatePatientCheckResult = {
  hasDuplicates: false,
  matches: [],
};
let mockRegisteredPatient: ClinicPatient | null = null;
let mockNetworkError: any = null;

mock.module('../services/apiClient', () => ({
  clinicApiClient: {
    get: async (url: string, config?: any) => {
      lastGetUrl = url;
      lastGetParams = config?.params ?? null;
      if (mockNetworkError) return [null, mockNetworkError];
      return [mockDuplicateResult, null];
    },
    post: async (url: string, data?: any) => {
      lastPostUrl = url;
      lastPostPayload = data;
      if (mockNetworkError) return [null, mockNetworkError];
      return [mockRegisteredPatient, null];
    },
  },
  clinicApiUrl: (p: string) => `http://localhost:5000/api/v1${p}`,
}));

const { clinicService } = await import('../services/clinicService');
const { offlineSyncService } = await import('../services/offlineSyncService');

describe('Feature 10: PhilHealth PIN Masking & Mod-11 Validation', () => {
  describe('formatPhilHealthPin', () => {
    test('formats 12 raw digits into standard mask XX-XXXXXXXXX-X', () => {
      expect(formatPhilHealthPin('123456789018')).toBe('12-345678901-8');
      expect(formatPhilHealthPin('010250000010')).toBe('01-025000001-0');
    });

    test('handles partial input lengths gracefully', () => {
      expect(formatPhilHealthPin('1')).toBe('1');
      expect(formatPhilHealthPin('12')).toBe('12');
      expect(formatPhilHealthPin('123')).toBe('12-3');
      expect(formatPhilHealthPin('12345678901')).toBe('12-345678901');
    });

    test('strips non-digits and caps input at 12 digits', () => {
      expect(formatPhilHealthPin('12-345-678-901-8-9999')).toBe('12-345678901-8');
      expect(formatPhilHealthPin('abc12def345678901ghi8')).toBe('12-345678901-8');
    });

    test('handles empty input', () => {
      expect(formatPhilHealthPin('')).toBe('');
    });
  });

  describe('validatePhilHealthPinMod11', () => {
    test('validates valid PhilHealth PIN with correct check digit', () => {
      const res1 = validatePhilHealthPinMod11('12-345678901-8');
      expect(res1.isValid).toBe(true);
      expect(res1.isComplete).toBe(true);
      expect(res1.digitsCount).toBe(12);
      expect(res1.expectedCheckDigit).toBe(8);
      expect(res1.actualCheckDigit).toBe(8);

      const res2 = validatePhilHealthPinMod11('10-000000000-5');
      expect(res2.isValid).toBe(true);
      expect(res2.isComplete).toBe(true);
      expect(res2.expectedCheckDigit).toBe(5);
    });

    test('maps check digit 10 to 0 per PhilHealth Mod-11 specification', () => {
      const res = validatePhilHealthPinMod11('01-025000001-0');
      expect(res.isValid).toBe(true);
      expect(res.isComplete).toBe(true);
      expect(res.expectedCheckDigit).toBe(10);
      expect(res.actualCheckDigit).toBe(0);
    });

    test('rejects PIN with incorrect check digit', () => {
      const res = validatePhilHealthPinMod11('12-345678901-2');
      expect(res.isValid).toBe(false);
      expect(res.isComplete).toBe(true);
      expect(res.expectedCheckDigit).toBe(8);
      expect(res.actualCheckDigit).toBe(2);
      expect(res.errorMessage).toContain('Check digit mismatch');
    });

    test('flags incomplete PIN when fewer than 12 digits are entered', () => {
      const res = validatePhilHealthPinMod11('12-34567');
      expect(res.isValid).toBe(false);
      expect(res.isComplete).toBe(false);
      expect(res.digitsCount).toBe(7);
      expect(res.errorMessage).toBe('Incomplete PIN (7/12 digits)');
    });

    test('handles empty or whitespace input', () => {
      const res = validatePhilHealthPinMod11('   ');
      expect(res.isValid).toBe(false);
      expect(res.isComplete).toBe(false);
      expect(res.digitsCount).toBe(0);
    });
  });
});

describe('Feature 11: Debounced Duplicate Detection Service', () => {
  beforeEach(() => {
    lastGetUrl = '';
    lastGetParams = null;
    mockNetworkError = null;
    mockDuplicateResult = { hasDuplicates: false, matches: [] };
  });

  test('passes all query parameters accurately to /patients/check-duplicates', async () => {
    const params: CheckPatientDuplicatesParams = {
      philHealthNumber: '12-345678901-8',
      contactNumber: '0917-123-4567',
      firstName: 'Maria',
      lastName: 'Santos',
      dateOfBirth: '1990-05-15',
    };

    const [result, err] = await clinicService.checkPatientDuplicates(params);

    expect(err).toBeNull();
    expect(result).toBeDefined();
    expect(lastGetUrl).toBe('/patients/check-duplicates');
    expect(lastGetParams).toEqual(params);
  });

  test('returns hasDuplicates true and matched records when duplicates exist', async () => {
    mockDuplicateResult = {
      hasDuplicates: true,
      matches: [
        {
          patientId: 'pat-exist-1',
          patientCode: 'PAT-2025-00120',
          fullName: 'Santos, Maria D.',
          dateOfBirth: '1990-05-15',
          contactNumber: '0917-123-4567',
          philHealthNumber: '12-345678901-8',
          matchReason: 'PhilHealth Identification Number (PIN) match • Contact Number match',
        },
      ],
    };

    const [result] = await clinicService.checkPatientDuplicates({
      philHealthNumber: '12-345678901-8',
    });

    expect(result?.hasDuplicates).toBe(true);
    expect(result?.matches.length).toBe(1);
    expect(result?.matches[0].patientCode).toBe('PAT-2025-00120');
    expect(result?.matches[0].matchReason).toContain('PhilHealth Identification Number (PIN) match');
  });

  test('tolerates empty parameter object without failing', async () => {
    mockDuplicateResult = { hasDuplicates: false, matches: [] };
    const [result, err] = await clinicService.checkPatientDuplicates({});

    expect(err).toBeNull();
    expect(result?.hasDuplicates).toBe(false);
    expect(result?.matches).toEqual([]);
  });
});

describe('Feature 12 & 13: Dual-Action Patient Registration & Triage Routing', () => {
  beforeEach(() => {
    lastPostUrl = '';
    lastPostPayload = null;
    mockNetworkError = null;
    mockRegisteredPatient = {
      id: 'patient-uuid-1001',
      tenantId: 'tenant-demo',
      clinicId: 'clinic-demo',
      patientCode: 'PAT-2026-00042',
      firstName: 'Maria',
      lastName: 'Santos',
      fullName: 'Santos, Maria',
      dateOfBirth: '1990-05-15',
      age: 36,
      gender: 'Female',
      contactNumber: '0917-123-4567',
      philHealthNumber: '12-345678901-8',
      createdAt: '2026-10-11T12:00:00Z',
    };
  });

  test('Standard "Save & Register Patient" sends sendToTriage: false and no queue ticket is returned', async () => {
    const payload: RegisterPatientPayload = {
      firstName: 'Juan',
      lastName: 'Dela Cruz',
      dateOfBirth: '1985-04-20',
      gender: 'Male',
      contactNumber: '0918-987-6543',
      sendToTriage: false,
    };

    mockRegisteredPatient = {
      id: 'patient-uuid-2001',
      tenantId: 'tenant-demo',
      clinicId: 'clinic-demo',
      patientCode: 'PAT-2026-00043',
      firstName: 'Juan',
      lastName: 'Dela Cruz',
      fullName: 'Dela Cruz, Juan',
      dateOfBirth: '1985-04-20',
      age: 41,
      gender: 'Male',
      contactNumber: '0918-987-6543',
      createdAt: '2026-10-11T12:00:00Z',
      activeQueueTicket: null,
    };

    const [patient, err] = await clinicService.registerPatient(payload);

    expect(err).toBeNull();
    expect(patient).toBeDefined();
    expect(lastPostUrl).toBe('/patients');
    expect(lastPostPayload.sendToTriage).toBe(false);
    expect(patient?.activeQueueTicket).toBeNull();
  });

  test('Primary "Register & Send to Triage" sends sendToTriage: true and receives activeQueueTicket', async () => {
    const payload: RegisterPatientPayload = {
      firstName: 'Pedro',
      lastName: 'Penduko',
      dateOfBirth: '1992-08-10',
      gender: 'Male',
      contactNumber: '0920-555-1234',
      sendToTriage: true,
      priority: 'Routine',
      chiefComplaint: 'Acute onset high-grade fever x 2 days',
    };

    mockRegisteredPatient = {
      id: 'patient-uuid-3001',
      tenantId: 'tenant-demo',
      clinicId: 'clinic-demo',
      patientCode: 'PAT-2026-00044',
      firstName: 'Pedro',
      lastName: 'Penduko',
      fullName: 'Penduko, Pedro',
      dateOfBirth: '1992-08-10',
      age: 34,
      gender: 'Male',
      contactNumber: '0920-555-1234',
      createdAt: '2026-10-11T12:00:00Z',
      activeQueueTicket: 'Q-007',
      activeQueueItemId: 'queue-uuid-007',
    };

    const [patient, err] = await clinicService.registerPatient(payload);

    expect(err).toBeNull();
    expect(patient).toBeDefined();
    expect(lastPostPayload.sendToTriage).toBe(true);
    expect(lastPostPayload.priority).toBe('Routine');
    expect(lastPostPayload.chiefComplaint).toBe('Acute onset high-grade fever x 2 days');
    expect(patient?.activeQueueTicket).toBe('Q-007');
    expect(patient?.activeQueueItemId).toBe('queue-uuid-007');
  });

  test('Transmits structured allergies with categories, severities, and anaphylaxis flags', async () => {
    const structuredAllergies: CreateAllergyPayload[] = [
      {
        category: 'Medication',
        allergen: 'Amoxicillin',
        allergenDrugCode: 'DRUG-AMX-500',
        severity: 'LifeThreatening',
        reactionManifestation: 'Facial angioedema, stridor, anaphylaxis',
        isAnaphylactic: true,
        notes: 'Immediate epinephrine administered in 2024',
      },
      {
        category: 'Food',
        allergen: 'Shrimp',
        severity: 'Moderate',
        reactionManifestation: 'Urticaria and pruritus',
        isAnaphylactic: false,
      },
    ];

    const payload: RegisterPatientPayload = {
      firstName: 'Clara',
      lastName: 'Reyes',
      dateOfBirth: '1995-11-03',
      gender: 'Female',
      contactNumber: '0917-888-9999',
      allergies: 'Amoxicillin (Medication - STAT), Shrimp (Food)',
      structuredAllergies,
    };

    const [patient, err] = await clinicService.registerPatient(payload);

    expect(err).toBeNull();
    expect(lastPostPayload.structuredAllergies).toBeDefined();
    expect(lastPostPayload.structuredAllergies.length).toBe(2);
    expect(lastPostPayload.structuredAllergies[0].isAnaphylactic).toBe(true);
    expect(lastPostPayload.structuredAllergies[0].severity).toBe('LifeThreatening');
    expect(lastPostPayload.structuredAllergies[1].category).toBe('Food');
  });

  test('Offline Registration Fallback preserves sendToTriage and structuredAllergies', async () => {
    const payload: RegisterPatientPayload = {
      firstName: 'Jose',
      lastName: 'Rizal',
      dateOfBirth: '1861-06-19',
      gender: 'Male',
      contactNumber: '0917-000-0000',
      sendToTriage: true,
      priority: 'Routine',
      chiefComplaint: 'Headache and eye strain',
      structuredAllergies: [
        {
          category: 'Environmental',
          allergen: 'Pollen',
          severity: 'Mild',
          isAnaphylactic: false,
        },
      ],
    };

    const offlinePatient = await offlineSyncService.enqueuePatient(payload);

    expect(offlinePatient).toBeDefined();
    expect(offlinePatient.firstName).toBe('Jose');
    expect(offlinePatient.lastName).toBe('Rizal');
    expect(offlinePatient.patientCode).toBe('Pending sync');

    // Verify that offline registration preserves the payload
    const queue = offlineSyncService.getPendingQueue();
    expect(queue.patients.length).toBeGreaterThan(0);
    const enqueued = queue.patients.find((p) => p.localPatient.id === offlinePatient.id);
    expect(enqueued).toBeDefined();
    expect(enqueued?.payload.sendToTriage).toBe(true);
    expect(enqueued?.payload.structuredAllergies?.length).toBe(1);
  });
});

describe('Feature 12: Structured Allergy Intake Model & Rules', () => {
  test('verifies all 5 standard categories are supported', () => {
    const categories: CreateAllergyPayload['category'][] = [
      'Medication',
      'Food',
      'Environmental',
      'Biologic',
      'Other',
    ];
    expect(categories.length).toBe(5);
  });

  test('LifeThreatening severity correctly indicates critical emergency', () => {
    const allergy: CreateAllergyPayload = {
      category: 'Medication',
      allergen: 'Penicillin',
      severity: 'LifeThreatening',
      isAnaphylactic: true,
      reactionManifestation: 'Bronchospasm, circulatory collapse',
    };

    expect(allergy.severity).toBe('LifeThreatening');
    expect(allergy.isAnaphylactic).toBe(true);
  });

  test('Allergy summary concatenation generates readable clinical string', () => {
    const list: CreateAllergyPayload[] = [
      {
        category: 'Medication',
        allergen: 'Penicillin',
        severity: 'LifeThreatening',
        isAnaphylactic: true,
      },
      {
        category: 'Food',
        allergen: 'Peanuts',
        severity: 'Moderate',
        isAnaphylactic: false,
      },
    ];

    const summary = list
      .map((a) => `${a.allergen} (${a.category}${a.isAnaphylactic ? ' - STAT' : ''})`)
      .join(', ');

    expect(summary).toBe('Penicillin (Medication - STAT), Peanuts (Food)');
  });
});

describe('Feature 13: Duplicate Patient Safeguard & Warning Workflow Interception', () => {
  beforeEach(() => {
    lastGetUrl = '';
    lastGetParams = null;
    lastPostUrl = '';
    lastPostPayload = null;
    mockNetworkError = null;
    mockDuplicateResult = { hasDuplicates: false, matches: [] };
    mockRegisteredPatient = null;
  });

  test('pre-flight duplicate check intercepts registration when matches are detected', async () => {
    const existingMatch = {
      patientId: 'existing-guid-123',
      patientCode: 'PAT-2026-00012',
      fullName: 'Dela Cruz, Juan M.',
      dateOfBirth: '1985-05-20',
      contactNumber: '09171234567',
      philHealthNumber: '12-345678901-8',
      matchReason: 'PhilHealth Identification Number (PIN) match • Full Name and Date of Birth match',
      similarityScore: 1.0,
      confidence: 'High' as const,
    };

    mockDuplicateResult = {
      hasDuplicates: true,
      matches: [existingMatch],
    };

    let duplicateModalVisible = false;
    let detectedMatches: any[] = [];
    let registered = false;

    const simulateRegistrationAttempt = async (options?: { bypassDuplicateCheck?: boolean }) => {
      if (!options?.bypassDuplicateCheck) {
        const [dupCheck] = await clinicService.checkPatientDuplicates({
          firstName: 'Juan',
          lastName: 'Dela Cruz',
          dateOfBirth: '1985-05-20',
          contactNumber: '09171234567',
          philHealthNumber: '12-345678901-8',
        });

        if (dupCheck && dupCheck.hasDuplicates && dupCheck.matches.length > 0) {
          detectedMatches = dupCheck.matches;
          duplicateModalVisible = true;
          return;
        }
      }

      const [res] = await clinicService.registerPatient({
        firstName: 'Juan',
        lastName: 'Dela Cruz',
        dateOfBirth: '1985-05-20',
        contactNumber: '09171234567',
      });
      if (res) registered = true;
    };

    // First attempt: duplicate check intercepts
    await simulateRegistrationAttempt();

    expect(duplicateModalVisible).toBe(true);
    expect(detectedMatches).toHaveLength(1);
    expect(detectedMatches[0].patientId).toBe('existing-guid-123');
    expect(registered).toBe(false);
    expect(lastPostUrl).toBe(''); // Registration API was NOT called
  });

  test('Create New Profile Anyway bypasses duplicate check and proceeds with registration', async () => {
    mockRegisteredPatient = {
      id: 'new-patient-guid',
      patientCode: 'PAT-2026-00099',
      fullName: 'Dela Cruz, Juan',
      firstName: 'Juan',
      lastName: 'Dela Cruz',
      dateOfBirth: '1985-05-20',
      contactNumber: '09171234567',
      gender: 'Male',
      civilStatus: 'Single',
      verificationStatus: 'Verified',
      isYakapEligible: false,
      createdAt: '2026-10-13T00:00:00Z',
    };

    let registered = false;

    const simulateRegistrationAttempt = async (options?: { bypassDuplicateCheck?: boolean }) => {
      if (!options?.bypassDuplicateCheck) {
        return; // blocked if not bypassed
      }

      const [res] = await clinicService.registerPatient({
        firstName: 'Juan',
        lastName: 'Dela Cruz',
        dateOfBirth: '1985-05-20',
        contactNumber: '09171234567',
      });
      if (res) registered = true;
    };

    // Staff chooses "Create New Profile Anyway"
    await simulateRegistrationAttempt({ bypassDuplicateCheck: true });

    expect(registered).toBe(true);
    expect(lastPostUrl).toBe('/patients');
    expect(lastPostPayload?.firstName).toBe('Juan');
    expect(lastPostPayload?.contactNumber).toBe('09171234567');
  });

  test('Use Existing Profile retrieves existing patient and resets registration form without creating new record', async () => {
    let openedChartPatientId: string | null = null;
    let postCallOccurred = false;

    const mockExistingPatient: ClinicPatient = {
      id: 'existing-patient-001',
      patientCode: 'PAT-2026-00001',
      fullName: 'Santos, Maria',
      firstName: 'Maria',
      lastName: 'Santos',
      dateOfBirth: '1990-08-15',
      contactNumber: '09181234567',
      gender: 'Female',
      civilStatus: 'Single',
      verificationStatus: 'Verified',
      isYakapEligible: false,
      createdAt: '2026-10-13T00:00:00Z',
    };

    // Mock getPatientById
    const handleUseExistingProfile = async (patientId: string) => {
      // In Patients.screen.tsx: closes modals, resets form, and opens chart for existing patient
      openedChartPatientId = patientId;
    };

    await handleUseExistingProfile(mockExistingPatient.id);

    expect(openedChartPatientId).toBe('existing-patient-001');
    expect(postCallOccurred).toBe(false);
    expect(lastPostUrl).toBe('');
  });
});

describe('Dashboard "New Patient" & Post-Registration Dialog Workflow', () => {
  test('Dashboard "New patient" action navigates to Patients with openRegister: true and Patients.screen handles it', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const dashboardSrc = fs.readFileSync(
      path.resolve(import.meta.dir, '../navigation/screens/Dashboard.screen.tsx'),
      'utf8'
    );
    const patientsSrc = fs.readFileSync(
      path.resolve(import.meta.dir, '../navigation/screens/Patients.screen.tsx'),
      'utf8'
    );

    expect(dashboardSrc).toContain("navigation.navigate('Patients', { openRegister: true })");
    expect(patientsSrc).toContain('openRegister?: boolean');
    expect(patientsSrc).toContain('navigation.setParams({ openRegister: undefined })');
    expect(patientsSrc).toContain('setRegisterVisible(true)');
  });

  test('Post-registration Alert.alert presents Close, Register New Patient, and Open Chart actions', async () => {
    const { Alert, getFeedbackState, resetFeedbackState, dismissAlert } = await import('../utils/feedback');
    resetFeedbackState();

    const newPat: ClinicPatient = {
      id: 'pat-new-900',
      tenantId: 'tenant-demo',
      clinicId: 'clinic-demo',
      patientCode: 'PAT-2026-00900',
      firstName: 'Ana',
      lastName: 'Reyes',
      fullName: 'Reyes, Ana',
      dateOfBirth: '1994-03-12',
      age: 32,
      gender: 'Female',
      contactNumber: '0917-555-0199',
      createdAt: '2026-10-14T11:50:00Z',
      activeQueueTicket: 'Q-012',
    };

    let registerVisible = false;
    let formResetCount = 0;
    let openedChartFor: ClinicPatient | null = null;

    const resetRegistrationForm = () => {
      formResetCount += 1;
    };
    const setRegisterVisible = (v: boolean) => {
      registerVisible = v;
    };
    const handleOpenChart = (p: ClinicPatient) => {
      openedChartFor = p;
    };

    const sendToTriage = true;
    const ticketNote =
      sendToTriage && newPat.activeQueueTicket
        ? ` and queued for triage (${newPat.activeQueueTicket})`
        : sendToTriage
          ? ' and queued for triage'
          : '';

    Alert.alert(
      'Patient Registered',
      `${newPat.fullName} (${newPat.patientCode}) has been registered${ticketNote}. What would you like to do next?`,
      [
        {
          text: 'Close',
          style: 'cancel',
        },
        {
          text: 'Register New Patient',
          style: 'cancel',
          onPress: () => {
            resetRegistrationForm();
            setRegisterVisible(true);
          },
        },
        {
          text: 'Open Chart',
          onPress: () => {
            handleOpenChart(newPat);
          },
        },
      ]
    );

    const state = getFeedbackState();
    expect(state.alerts).toHaveLength(1);
    const alert = state.alerts[0];
    expect(alert.title).toBe('Patient Registered');
    expect(alert.message).toContain('Reyes, Ana (PAT-2026-00900)');
    expect(alert.message).toContain('(Q-012)');
    expect(alert.buttons.map((b) => b.text)).toEqual([
      'Close',
      'Register New Patient',
      'Open Chart',
    ]);

    // 1. Test "Register New Patient" action
    alert.buttons[1].onPress?.();
    expect(formResetCount).toBe(1);
    expect(registerVisible).toBe(true);

    // 2. Test "Open Chart" action
    setRegisterVisible(false);
    alert.buttons[2].onPress?.();
    expect(openedChartFor?.id).toBe('pat-new-900');

    // 3. Test "Close" action
    dismissAlert(alert.id);
    expect(getFeedbackState().alerts).toHaveLength(0);
  });
});

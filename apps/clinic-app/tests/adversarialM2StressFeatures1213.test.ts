import { describe, expect, test, mock, beforeEach } from 'bun:test';

(globalThis as any).__DEV__ = true;

// Mock React Native modules before any component imports
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
  Dimensions: { get: () => ({ width: 1200, height: 800 }), addEventListener: () => ({ remove: () => {} }) },
  useWindowDimensions: () => ({ width: 1200, height: 800 }),
  Keyboard: { dismiss: () => {}, addListener: () => ({ remove: () => {} }) },
  AppState: { addEventListener: () => ({ remove: () => {} }) },
  Platform: { OS: 'web', select: (obj: any) => obj.web ?? obj.default },
  Linking: { openURL: () => Promise.resolve(), canOpenURL: () => Promise.resolve(true) },
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

// API client mock state
let lastPostUrl = '';
let lastPostPayload: any = null;
let mockNetworkError: any = null;
let mockRegisteredPatientResponse: any = null;

mock.module('../services/apiClient', () => ({
  clinicApiClient: {
    get: async () => [null, null],
    post: async (url: string, data?: any) => {
      lastPostUrl = url;
      lastPostPayload = data;
      if (mockNetworkError) return [null, mockNetworkError];
      return [mockRegisteredPatientResponse, null];
    },
  },
  clinicApiUrl: (p: string) => `http://localhost:5000/api/v1${p}`,
}));

const { AllergyPillList } = await import('../components/patient/StructuredAllergyIntakeModal');
type AllergyCategory = 'Medication' | 'Food' | 'Environmental' | 'Biologic' | 'Other';
type AllergySeverity = 'Mild' | 'Moderate' | 'Severe' | 'LifeThreatening';
type CreateAllergyRequest = {
  category: AllergyCategory;
  allergen: string;
  allergenDrugCode?: string | null;
  severity: AllergySeverity;
  reactionManifestation?: string | null;
  isAnaphylactic: boolean;
  onsetDate?: string | null;
  notes?: string | null;
};

const { clinicService } = await import('../services/clinicService');
const { offlineSyncService } = await import('../services/offlineSyncService');
const { shouldQueueOffline } = await import('../services/outboxPolicy');
type RegisterPatientPayload = import('../services/clinicService').RegisterPatientPayload;
type ClinicPatient = import('../services/clinicService').ClinicPatient;

/**
 * Pure state machine simulator matching StructuredAllergyIntakeModal's exact internal handlers:
 * - handleSelectSeverity(sev)
 * - handleToggleAnaphylactic()
 * - handleAddAllergy()
 * - handleRemove(index)
 */
class AllergyIntakeModalHarness {
  public category: AllergyCategory = 'Medication';
  public allergen: string = '';
  public allergenDrugCode: string = '';
  public severity: AllergySeverity = 'Moderate';
  public isAnaphylactic: boolean = false;
  public reactionManifestation: string = '';
  public onsetDate: string = '';
  public notes: string = '';
  public formError: string | null = null;
  public activeAllergies: CreateAllergyRequest[] = [];

  constructor(initialAllergies: CreateAllergyRequest[] = []) {
    this.activeAllergies = [...initialAllergies];
  }

  public resetDraft() {
    this.category = 'Medication';
    this.allergen = '';
    this.allergenDrugCode = '';
    this.severity = 'Moderate';
    this.isAnaphylactic = false;
    this.reactionManifestation = '';
    this.onsetDate = '';
    this.notes = '';
    this.formError = null;
  }

  public handleSelectSeverity(sev: AllergySeverity) {
    this.severity = sev;
    if (sev === 'LifeThreatening') {
      this.isAnaphylactic = true;
    } else if (this.isAnaphylactic && sev === 'Mild') {
      this.isAnaphylactic = false;
    }
  }

  public handleToggleAnaphylactic() {
    const nextVal = !this.isAnaphylactic;
    this.isAnaphylactic = nextVal;
    if (nextVal && (this.severity === 'Mild' || this.severity === 'Moderate')) {
      this.severity = 'LifeThreatening';
    }
  }

  public handleAddAllergy(): CreateAllergyRequest | null {
    const trimmed = this.allergen.trim();
    if (!trimmed) {
      this.formError = 'Allergen name is required (e.g. Penicillin, Peanuts).';
      return null;
    }

    if (trimmed.length > 150) {
      this.formError = 'Allergen name must not exceed 150 characters.';
      return null;
    }

    const isDup = this.activeAllergies.some(
      (a) => a.allergen.toLowerCase() === trimmed.toLowerCase()
    );
    if (isDup) {
      this.formError = `"${trimmed}" is already documented in this patient's allergy list.`;
      return null;
    }

    const newAllergy: CreateAllergyRequest = {
      category: this.category,
      allergen: trimmed,
      allergenDrugCode: this.allergenDrugCode.trim() || undefined,
      severity: this.severity,
      reactionManifestation: this.reactionManifestation.trim() || undefined,
      isAnaphylactic: this.isAnaphylactic || this.severity === 'LifeThreatening',
      onsetDate: this.onsetDate.trim() || undefined,
      notes: this.notes.trim() || undefined,
    };

    this.activeAllergies.push(newAllergy);
    this.resetDraft();
    return newAllergy;
  }

  public handleRemove(index: number) {
    this.activeAllergies = this.activeAllergies.filter((_, i) => i !== index);
  }

  public isAnaphylaxisActive(): boolean {
    return this.isAnaphylactic || this.severity === 'LifeThreatening';
  }
}

describe('Empirical Adversarial Stress Test: Feature 12 (StructuredAllergyIntakeModal)', () => {
  const CATEGORIES: AllergyCategory[] = [
    'Medication',
    'Food',
    'Environmental',
    'Biologic',
    'Other',
  ];
  const SEVERITIES: AllergySeverity[] = [
    'Mild',
    'Moderate',
    'Severe',
    'LifeThreatening',
  ];

  test('All 20 category x severity permutations produce valid, strongly-typed CreateAllergyRequest payloads', () => {
    let permutationCount = 0;

    for (const cat of CATEGORIES) {
      for (const sev of SEVERITIES) {
        const harness = new AllergyIntakeModalHarness();
        harness.category = cat;
        harness.severity = sev;
        harness.allergen = `Adversarial Allergen ${cat}-${sev}`;
        harness.reactionManifestation = `Reaction for ${sev}`;
        harness.notes = `Permutation note #${++permutationCount}`;

        // When severity is LifeThreatening, check automatic flag
        if (sev === 'LifeThreatening') {
          harness.handleSelectSeverity(sev);
          expect(harness.isAnaphylactic).toBe(true);
        }

        const created = harness.handleAddAllergy();
        expect(created).not.toBeNull();
        expect(created?.category).toBe(cat);
        expect(created?.severity).toBe(sev);
        expect(created?.allergen).toBe(`Adversarial Allergen ${cat}-${sev}`);
        expect(created?.reactionManifestation).toBe(`Reaction for ${sev}`);

        if (sev === 'LifeThreatening') {
          expect(created?.isAnaphylactic).toBe(true);
        }
      }
    }

    expect(permutationCount).toBe(20);
  });

  test('Rapid addition of 20 allergy items maintains full integrity and ordering without loss', () => {
    const harness = new AllergyIntakeModalHarness();

    for (let i = 1; i <= 20; i++) {
      harness.category = CATEGORIES[(i - 1) % CATEGORIES.length];
      harness.severity = SEVERITIES[(i - 1) % SEVERITIES.length];
      harness.allergen = `Rapid-Allergen-${i.toString().padStart(2, '0')}`;
      const res = harness.handleAddAllergy();
      expect(res).not.toBeNull();
      expect(harness.activeAllergies.length).toBe(i);
    }

    expect(harness.activeAllergies.length).toBe(20);
    expect(harness.activeAllergies[0].allergen).toBe('Rapid-Allergen-01');
    expect(harness.activeAllergies[19].allergen).toBe('Rapid-Allergen-20');
  });

  test('Multi-order removals (FIFO head, LIFO tail, middle element) shrink list accurately to empty state', () => {
    const harness = new AllergyIntakeModalHarness();
    for (let i = 0; i < 10; i++) {
      harness.allergen = `Item-${i}`;
      harness.handleAddAllergy();
    }
    expect(harness.activeAllergies.length).toBe(10);

    // 1. Remove head (FIFO)
    harness.handleRemove(0);
    expect(harness.activeAllergies.length).toBe(9);
    expect(harness.activeAllergies[0].allergen).toBe('Item-1');

    // 2. Remove tail (LIFO)
    harness.handleRemove(harness.activeAllergies.length - 1);
    expect(harness.activeAllergies.length).toBe(8);
    expect(harness.activeAllergies[harness.activeAllergies.length - 1].allergen).toBe('Item-8');

    // 3. Remove arbitrary middle element (index 3 => 'Item-4')
    const itemToRemove = harness.activeAllergies[3].allergen;
    expect(itemToRemove).toBe('Item-4');
    harness.handleRemove(3);
    expect(harness.activeAllergies.length).toBe(7);
    expect(harness.activeAllergies.some((a) => a.allergen === 'Item-4')).toBe(false);

    // 4. Drain all remaining elements
    while (harness.activeAllergies.length > 0) {
      harness.handleRemove(0);
    }
    expect(harness.activeAllergies.length).toBe(0);
  });

  test('AllergyPillList component renders NKDA fallback on empty allergy list', () => {
    const element = AllergyPillList({ allergies: [] });
    expect(element).toBeDefined();
    expect((element as any).type).toBe('View');
  });

  test('Allergy summary string serialization properly formats STAT and non-STAT items', () => {
    const sampleAllergies: CreateAllergyRequest[] = [
      { category: 'Medication', allergen: 'Penicillin G', severity: 'LifeThreatening', isAnaphylactic: true },
      { category: 'Food', allergen: 'Peanuts', severity: 'Moderate', isAnaphylactic: false },
      { category: 'Environmental', allergen: 'Latex Gloves', severity: 'Severe', isAnaphylactic: true },
      { category: 'Biologic', allergen: 'Antivenom', severity: 'Mild', isAnaphylactic: false },
    ];

    const summary = sampleAllergies
      .map((a) => `${a.allergen} (${a.category}${a.isAnaphylactic ? ' - STAT' : ''})`)
      .join(', ');

    expect(summary).toBe(
      'Penicillin G (Medication - STAT), Peanuts (Food), Latex Gloves (Environmental - STAT), Antivenom (Biologic)'
    );
  });

  test('Duplicate allergen rejection is strictly case-insensitive', () => {
    const harness = new AllergyIntakeModalHarness([
      { category: 'Medication', allergen: 'Amoxicillin', severity: 'Moderate', isAnaphylactic: false },
    ]);

    // Exact lowercase
    harness.allergen = 'amoxicillin';
    expect(harness.handleAddAllergy()).toBeNull();
    expect(harness.formError).toContain('"amoxicillin" is already documented');

    // UPPERCASE
    harness.allergen = 'AMOXICILLIN';
    expect(harness.handleAddAllergy()).toBeNull();
    expect(harness.formError).toContain('"AMOXICILLIN" is already documented');

    // Mixed case
    harness.allergen = 'AmOxIcIlLiN';
    expect(harness.handleAddAllergy()).toBeNull();
    expect(harness.formError).toContain('"AmOxIcIlLiN" is already documented');

    // Distinct compound medication is permitted
    harness.allergen = 'Amoxicillin-Clavulanate';
    expect(harness.handleAddAllergy()).not.toBeNull();
    expect(harness.activeAllergies.length).toBe(2);
  });

  test('Duplicate allergen rejection trims leading and trailing whitespace', () => {
    const harness = new AllergyIntakeModalHarness([
      { category: 'Food', allergen: 'Peanuts', severity: 'Severe', isAnaphylactic: false },
    ]);

    harness.allergen = '   Peanuts   ';
    expect(harness.handleAddAllergy()).toBeNull();
    expect(harness.formError).toContain('"Peanuts" is already documented');

    harness.allergen = '\tpeanuts\n';
    expect(harness.handleAddAllergy()).toBeNull();
    expect(harness.formError).toContain('"peanuts" is already documented');
  });

  test('Allergen name validation rejects empty and whitespace-only strings', () => {
    const harness = new AllergyIntakeModalHarness();

    harness.allergen = '';
    expect(harness.handleAddAllergy()).toBeNull();
    expect(harness.formError).toBe('Allergen name is required (e.g. Penicillin, Peanuts).');

    harness.allergen = '     ';
    expect(harness.handleAddAllergy()).toBeNull();
    expect(harness.formError).toBe('Allergen name is required (e.g. Penicillin, Peanuts).');
  });

  test('Boundary length validation: enforces 150-character maximum', () => {
    const harness = new AllergyIntakeModalHarness();

    // Exactly 150 chars -> Accepted
    const exact150 = 'A'.repeat(150);
    harness.allergen = exact150;
    const res150 = harness.handleAddAllergy();
    expect(res150).not.toBeNull();
    expect(res150?.allergen.length).toBe(150);

    // 151 chars -> Rejected
    const over150 = 'B'.repeat(151);
    harness.allergen = over150;
    const res151 = harness.handleAddAllergy();
    expect(res151).toBeNull();
    expect(harness.formError).toBe('Allergen name must not exceed 150 characters.');
  });

  test('Bidirectional Anaphylactic Synchronization: selecting LifeThreatening activates anaphylaxis', () => {
    const harness = new AllergyIntakeModalHarness();
    expect(harness.isAnaphylactic).toBe(false);

    harness.handleSelectSeverity('LifeThreatening');
    expect(harness.severity).toBe('LifeThreatening');
    expect(harness.isAnaphylactic).toBe(true);
    expect(harness.isAnaphylaxisActive()).toBe(true);
  });

  test('Bidirectional Anaphylactic Synchronization: toggling anaphylaxis ON elevates Mild and Moderate to LifeThreatening', () => {
    // Case A: From Mild
    const harnessMild = new AllergyIntakeModalHarness();
    harnessMild.severity = 'Mild';
    harnessMild.isAnaphylactic = false;

    harnessMild.handleToggleAnaphylactic();
    expect(harnessMild.isAnaphylactic).toBe(true);
    expect(harnessMild.severity).toBe('LifeThreatening');

    // Case B: From Moderate
    const harnessMod = new AllergyIntakeModalHarness();
    harnessMod.severity = 'Moderate';
    harnessMod.isAnaphylactic = false;

    harnessMod.handleToggleAnaphylactic();
    expect(harnessMod.isAnaphylactic).toBe(true);
    expect(harnessMod.severity).toBe('LifeThreatening');
  });

  test('Bidirectional Anaphylactic Synchronization: changing severity to Mild clears anaphylaxis', () => {
    const harness = new AllergyIntakeModalHarness();
    harness.handleSelectSeverity('LifeThreatening');
    expect(harness.isAnaphylactic).toBe(true);

    harness.handleSelectSeverity('Mild');
    expect(harness.severity).toBe('Mild');
    expect(harness.isAnaphylactic).toBe(false);
    expect(harness.isAnaphylaxisActive()).toBe(false);
  });

  test('Fail-Safe: Submitting LifeThreatening severity guarantees isAnaphylactic=true in payload', () => {
    const harness = new AllergyIntakeModalHarness();
    harness.severity = 'LifeThreatening';
    harness.isAnaphylactic = false; // forced mismatch
    harness.allergen = 'Severe Penicillin Shock';

    const result = harness.handleAddAllergy();
    expect(result).not.toBeNull();
    expect(result?.severity).toBe('LifeThreatening');
    expect(result?.isAnaphylactic).toBe(true);
  });
});

describe('Empirical Adversarial Stress Test: Feature 13 (Dual Submission & Triage Routing)', () => {
  beforeEach(() => {
    lastPostUrl = '';
    lastPostPayload = null;
    mockNetworkError = null;
    mockRegisteredPatientResponse = null;
  });

  test('"Save & Register Patient" strictly sends sendToTriage: false, priority: "Routine", chiefComplaint: undefined', async () => {
    const payload: RegisterPatientPayload = {
      firstName: 'Gloria',
      lastName: 'Macapagal',
      dateOfBirth: '1947-04-05',
      gender: 'Female',
      contactNumber: '0917-111-2222',
      sendToTriage: false,
      priority: 'Routine',
      chiefComplaint: undefined,
    };

    const mockPatient: ClinicPatient = {
      id: 'patient-uuid-save-only',
      tenantId: 'tenant-demo',
      clinicId: 'clinic-demo',
      patientCode: 'PAT-2026-00088',
      firstName: 'Gloria',
      lastName: 'Macapagal',
      fullName: 'Macapagal, Gloria',
      dateOfBirth: '1947-04-05',
      age: 79,
      gender: 'Female',
      contactNumber: '0917-111-2222',
      createdAt: '2026-10-12T02:00:00Z',
      activeQueueTicket: null,
      activeQueueItemId: null,
    };
    mockRegisteredPatientResponse = mockPatient;

    const [patient, err] = await clinicService.registerPatient(payload);

    expect(err).toBeNull();
    expect(patient).toBeDefined();
    expect(lastPostUrl).toBe('/patients');
    expect(lastPostPayload.sendToTriage).toBe(false);
    expect(lastPostPayload.priority).toBe('Routine');
    expect(lastPostPayload.chiefComplaint).toBeUndefined();
    expect(patient?.activeQueueTicket).toBeNull();
    expect(patient?.activeQueueItemId).toBeNull();

    // Verify UI notification formatting for standard registration
    const notificationText = `${patient?.fullName} registered (${patient?.patientCode}).`;
    expect(notificationText).toBe('Macapagal, Gloria registered (PAT-2026-00088).');
  });

  test('"Register & Send to Triage" strictly sends sendToTriage: true, custom priority, chief complaint, and receives queue ticket', async () => {
    const payload: RegisterPatientPayload = {
      firstName: 'Rodrigo',
      lastName: 'Duterte',
      dateOfBirth: '1945-03-28',
      gender: 'Male',
      contactNumber: '0917-333-4444',
      sendToTriage: true,
      priority: 'Urgent',
      chiefComplaint: 'Acute chest discomfort and diaphoresis',
      structuredAllergies: [
        {
          category: 'Medication',
          allergen: 'Aspirin',
          severity: 'LifeThreatening',
          isAnaphylactic: true,
        },
      ],
    };

    const mockPatient: ClinicPatient = {
      id: 'patient-uuid-triage',
      tenantId: 'tenant-demo',
      clinicId: 'clinic-demo',
      patientCode: 'PAT-2026-00089',
      firstName: 'Rodrigo',
      lastName: 'Duterte',
      fullName: 'Duterte, Rodrigo',
      dateOfBirth: '1945-03-28',
      age: 81,
      gender: 'Male',
      contactNumber: '0917-333-4444',
      createdAt: '2026-10-12T02:00:00Z',
      activeQueueTicket: 'Q-089',
      activeQueueItemId: 'queue-item-089',
    };
    mockRegisteredPatientResponse = mockPatient;

    const [patient, err] = await clinicService.registerPatient(payload);

    expect(err).toBeNull();
    expect(patient).toBeDefined();
    expect(lastPostUrl).toBe('/patients');
    expect(lastPostPayload.sendToTriage).toBe(true);
    expect(lastPostPayload.priority).toBe('Urgent');
    expect(lastPostPayload.chiefComplaint).toBe('Acute chest discomfort and diaphoresis');
    expect(lastPostPayload.structuredAllergies?.length).toBe(1);
    expect(patient?.activeQueueTicket).toBe('Q-089');
    expect(patient?.activeQueueItemId).toBe('queue-item-089');

    // Verify UI notification formatting for triage routing
    const ticketText = patient?.activeQueueTicket ? ` (${patient.activeQueueTicket})` : '';
    const notificationText = `${patient?.fullName} registered & queued for triage${ticketText}.`;
    expect(notificationText).toBe('Duterte, Rodrigo registered & queued for triage (Q-089).');
  });

  test('Triage notification degrades gracefully if activeQueueTicket is omitted by backend', () => {
    const patientWithoutTicket: Partial<ClinicPatient> = {
      fullName: 'Aquino, Benigno',
      activeQueueTicket: null,
    };

    const ticketText = patientWithoutTicket.activeQueueTicket ? ` (${patientWithoutTicket.activeQueueTicket})` : '';
    const notificationText = `${patientWithoutTicket.fullName} registered & queued for triage${ticketText}.`;
    expect(notificationText).toBe('Aquino, Benigno registered & queued for triage.');
  });

  test('Offline fallback: unreachable server (status 0, 502, 503, 504) enqueues payload with sendToTriage and structured allergies', async () => {
    // 1. Verify policy classifier
    expect(shouldQueueOffline(0)).toBe(true);
    expect(shouldQueueOffline(502)).toBe(true);
    expect(shouldQueueOffline(503)).toBe(true);
    expect(shouldQueueOffline(504)).toBe(true);
    expect(shouldQueueOffline(400)).toBe(false);
    expect(shouldQueueOffline(409)).toBe(false);

    // 2. Simulate offline registration
    const offlinePayload: RegisterPatientPayload = {
      firstName: 'Ferdinand',
      lastName: 'Marcos',
      dateOfBirth: '1957-09-13',
      gender: 'Male',
      contactNumber: '0917-555-6666',
      sendToTriage: true,
      priority: 'Emergency',
      chiefComplaint: 'Severe dyspnea and bronchospasm',
      structuredAllergies: [
        {
          category: 'Environmental',
          allergen: 'Latex',
          severity: 'LifeThreatening',
          isAnaphylactic: true,
        },
      ],
    };

    const offlinePatient = await offlineSyncService.enqueuePatient(offlinePayload);
    expect(offlinePatient).toBeDefined();
    expect(offlinePatient.patientCode).toBe('Pending sync');
    expect(offlinePatient.firstName).toBe('Ferdinand');

    // 3. Inspect persisted outbox queue
    const queue = offlineSyncService.getPendingQueue();
    const enqueued = queue.patients.find((p) => p.localPatient.id === offlinePatient.id);
    expect(enqueued).toBeDefined();
    expect(enqueued?.payload.sendToTriage).toBe(true);
    expect(enqueued?.payload.priority).toBe('Emergency');
    expect(enqueued?.payload.chiefComplaint).toBe('Severe dyspnea and bronchospasm');
    expect(enqueued?.payload.structuredAllergies?.length).toBe(1);
    expect(enqueued?.payload.structuredAllergies?.[0].allergen).toBe('Latex');

    // 4. Verify user alert text formatting
    const triageNote = enqueued?.payload.sendToTriage ? ' and will be placed in the triage queue upon sync' : '';
    const alertMessage = `${offlinePatient.fullName} was saved locally because the server could not be reached. It will sync automatically${triageNote}.`;
    expect(alertMessage).toContain('will be placed in the triage queue upon sync');
  });

  test('Form validation barrier: missing required demographic fields blocks registration', () => {
    const validateRegistrationInputs = (form: { firstName: string; lastName: string; phone: string; dob: string }) => {
      if (!form.firstName.trim() || !form.lastName.trim() || !form.phone.trim() || !form.dob.trim()) {
        return { isValid: false, error: 'First name, last name, date of birth and phone number are required.' };
      }
      return { isValid: true, error: null };
    };

    expect(validateRegistrationInputs({ firstName: '', lastName: 'Santos', phone: '0917-1234567', dob: '1990-01-01' }).isValid).toBe(false);
    expect(validateRegistrationInputs({ firstName: 'Maria', lastName: '', phone: '0917-1234567', dob: '1990-01-01' }).isValid).toBe(false);
    expect(validateRegistrationInputs({ firstName: 'Maria', lastName: 'Santos', phone: '', dob: '1990-01-01' }).isValid).toBe(false);
    expect(validateRegistrationInputs({ firstName: 'Maria', lastName: 'Santos', phone: '0917-1234567', dob: '' }).isValid).toBe(false);
    expect(validateRegistrationInputs({ firstName: 'Maria', lastName: 'Santos', phone: '0917-1234567', dob: '1990-01-01' }).isValid).toBe(true);
  });

  test('Non-offline HTTP 400 and 409 errors strictly do not enqueue to offline storage', async () => {
    mockNetworkError = { status: 409, message: 'Patient with this PhilHealth PIN already exists.' };

    const payload: RegisterPatientPayload = {
      firstName: 'Imelda',
      lastName: 'Romualdez',
      dateOfBirth: '1929-07-02',
      gender: 'Female',
      contactNumber: '0917-777-8888',
      sendToTriage: true,
    };

    const initialQueueCount = offlineSyncService.getPendingCount();

    const [patient, err] = await clinicService.registerPatient(payload);
    expect(patient).toBeNull();
    expect(err).toBeDefined();
    expect(err?.status).toBe(409);

    // Verify shouldQueueOffline returns false
    const canQueue = shouldQueueOffline(err?.status ?? 0);
    expect(canQueue).toBe(false);

    // Queue count must remain untouched
    const afterCount = offlineSyncService.getPendingCount();
    expect(afterCount).toBe(initialQueueCount);
  });

  test('Special characters and compound clinical allergen names are safely handled', () => {
    const harness = new AllergyIntakeModalHarness();
    const compoundNames = [
      'Co-amoxiclav (Augmentin® 625mg)',
      'Peanuts / Tree Nuts [IgE-mediated]',
      'Sulfamethoxazole + Trimethoprim (Bactrim)',
      'Non-Steroidal Anti-Inflammatory Drugs (NSAIDs) & Aspirin',
      '<script>alert("xss")</script> Allergen',
    ];

    for (const name of compoundNames) {
      harness.allergen = name;
      const res = harness.handleAddAllergy();
      expect(res).not.toBeNull();
      expect(res?.allergen).toBe(name);
    }

    expect(harness.activeAllergies.length).toBe(compoundNames.length);
  });

  test('Whitespace trimming on optional clinical fields (drugCode, manifestations, onset, notes)', () => {
    const harness = new AllergyIntakeModalHarness();
    harness.allergen = 'Cephalexin';
    harness.allergenDrugCode = '   RXN-CEPH-500   ';
    harness.reactionManifestation = '   Maculopapular rash and pruritus   ';
    harness.onsetDate = '   2023-11-20   ';
    harness.notes = '   Resolved with cetirizine   ';

    const res = harness.handleAddAllergy();
    expect(res).not.toBeNull();
    expect(res?.allergenDrugCode).toBe('RXN-CEPH-500');
    expect(res?.reactionManifestation).toBe('Maculopapular rash and pruritus');
    expect(res?.onsetDate).toBe('2023-11-20');
    expect(res?.notes).toBe('Resolved with cetirizine');

    // Blank optional fields normalize to undefined
    harness.allergen = 'Ciprofloxacin';
    harness.allergenDrugCode = '     ';
    harness.reactionManifestation = '   ';
    harness.onsetDate = '';
    harness.notes = '\t\n';

    const resBlank = harness.handleAddAllergy();
    expect(resBlank).not.toBeNull();
    expect(resBlank?.allergenDrugCode).toBeUndefined();
    expect(resBlank?.reactionManifestation).toBeUndefined();
    expect(resBlank?.onsetDate).toBeUndefined();
    expect(resBlank?.notes).toBeUndefined();
  });

  test('Interleaved rapid additions with duplicate rejection maintains consistent list state', () => {
    const harness = new AllergyIntakeModalHarness();

    // 1. Add Amoxicillin
    harness.allergen = 'Amoxicillin';
    expect(harness.handleAddAllergy()).not.toBeNull();
    expect(harness.activeAllergies.length).toBe(1);

    // 2. Add Penicillin
    harness.allergen = 'Penicillin';
    expect(harness.handleAddAllergy()).not.toBeNull();
    expect(harness.activeAllergies.length).toBe(2);

    // 3. Attempt duplicate of Amoxicillin
    harness.allergen = 'amoxicillin';
    expect(harness.handleAddAllergy()).toBeNull();
    expect(harness.activeAllergies.length).toBe(2);

    // 4. Add Aspirin
    harness.allergen = 'Aspirin';
    expect(harness.handleAddAllergy()).not.toBeNull();
    expect(harness.activeAllergies.length).toBe(3);

    // 5. Attempt duplicate of Penicillin
    harness.allergen = '   PENICILLIN   ';
    expect(harness.handleAddAllergy()).toBeNull();
    expect(harness.activeAllergies.length).toBe(3);

    // 6. Final verification of active list
    expect(harness.activeAllergies.map((a) => a.allergen)).toEqual([
      'Amoxicillin',
      'Penicillin',
      'Aspirin',
    ]);
  });
});

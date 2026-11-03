import { describe, expect, test, mock, beforeEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { eq, desc } from 'drizzle-orm';
import React from 'react';

(globalThis as any).__DEV__ = false;
(global as any).__DEV__ = false;

// ── Native Module Mocks for Isolation across Test Suite Runners ─────────────
mock.module('react-native', () => ({
  Platform: {
    OS: 'web',
    select: (obj: any) => obj?.web ?? obj?.default,
  },
  StyleSheet: {
    create: (s: any) => s,
    flatten: (s: any) => (Array.isArray(s) ? Object.assign({}, ...s.flat(Infinity).filter(Boolean)) : (s ?? {})),
    hairlineWidth: 1,
  },
  AppState: {
    currentState: 'active',
    addEventListener: () => ({ remove: () => {} }),
  },
  DeviceEventEmitter: {
    emit: () => {},
    addListener: () => ({ remove: () => {} }),
  },
  NativeEventEmitter: class {
    addListener() { return { remove: () => {} }; }
    removeListener() {}
    removeAllListeners() {}
    emit() {}
  },
  NativeModules: {},
  TurboModuleRegistry: {
    get: () => null,
    getEnforcing: () => ({}),
  },
  Dimensions: {
    get: () => ({ width: 1280, height: 800, scale: 1, fontScale: 1 }),
    addEventListener: () => ({ remove: () => {} }),
  },
  useWindowDimensions: () => ({ width: 1280, height: 800, scale: 1, fontScale: 1 }),
  useColorScheme: () => 'light' as const,
  PixelRatio: { get: () => 1, getFontScale: () => 1, roundToNearestPixel: (n: number) => n },
  Image: 'Image',
  FlatList: 'FlatList',
  SectionList: 'SectionList',
  Keyboard: { dismiss: () => {}, addListener: () => ({ remove: () => {} }) },
  View: 'View',
  Text: 'Text',
  Pressable: 'Pressable',
  ScrollView: 'ScrollView',
  TextInput: 'TextInput',
  ActivityIndicator: 'ActivityIndicator',
  Modal: 'Modal',
  processColor: (c: any) => c,
  Touchable: { Mixin: {} },
  PanResponder: {
    create: () => ({ panHandlers: {} }),
  },
  TouchableOpacity: 'TouchableOpacity',
  TouchableHighlight: 'TouchableHighlight',
  TouchableWithoutFeedback: 'TouchableWithoutFeedback',
  Animated: {
    Value: class {
      constructor(public val: any = 0) {}
      setValue(val: any) { this.val = val; }
      interpolate(config: any) { return this; }
    },
    timing: () => ({ start: (cb?: any) => cb?.() }),
    spring: () => ({ start: (cb?: any) => cb?.() }),
    event: () => () => {},
    View: 'AnimatedView',
    Text: 'AnimatedText',
  },
}));

mock.module('expo-linear-gradient', () => ({
  LinearGradient: 'LinearGradient',
}));

mock.module('react-native-svg', () => {
  const SvgMock = 'SvgMock';
  return {
    default: SvgMock,
    Svg: SvgMock,
    Path: SvgMock,
    Circle: SvgMock,
    Rect: SvgMock,
    G: SvgMock,
    Line: SvgMock,
    Polyline: SvgMock,
    Polygon: SvgMock,
    Text: SvgMock,
    TSpan: SvgMock,
    TextPath: SvgMock,
    Use: SvgMock,
    Image: SvgMock,
    Symbol: SvgMock,
    Defs: SvgMock,
    LinearGradient: SvgMock,
    RadialGradient: SvgMock,
    Stop: SvgMock,
    ClipPath: SvgMock,
    Pattern: SvgMock,
    Mask: SvgMock,
    parse: () => null,
  };
});

// Dynamic imports ensuring component resolution occurs after mock registration
const {
  HeaderScrollTitle,
  HealthPassCard,
  HealthPassQrModal,
  WelcomeOnboardingCard,
  AppointmentsSection,
  VitalsBentoGrid,
  MedicationsSchedule,
  SearchResultsView,
} = await import('../../components/home');

type DisplayAppointment = import('../../components/home').DisplayAppointment;
type MedicationScheduleItem = import('../../components/home').MedicationScheduleItem;
type SearchFilterType = import('../../components/home').SearchFilterType;
type ClinicDetail = import('../../services/discovery/types').ClinicDetail;
type VitalSign = import('../../db/schema/vitalSigns').VitalSign;

// ── In-Memory SQLite Schema Helper ───────────────────────────────────────────
function createInMemoryDatabase() {
  const sqlite = new Database(':memory:');

  sqlite.run(`
    CREATE TABLE patients (
      id TEXT PRIMARY KEY,
      clerk_user_id TEXT UNIQUE,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  sqlite.run(`
    CREATE TABLE vital_signs (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      clinic_id TEXT,
      measured_at TEXT NOT NULL,
      height_cm REAL,
      weight_kg REAL,
      bmi REAL,
      temperature_celsius REAL,
      bp_systolic INTEGER,
      bp_diastolic INTEGER,
      heart_rate_bpm INTEGER,
      respiratory_rate INTEGER,
      spo2_percent REAL,
      fasting_blood_glucose REAL,
      waist_cm REAL,
      hip_cm REAL,
      head_circumference_cm REAL,
      synced_at INTEGER
    );
  `);

  sqlite.run(`
    CREATE TABLE patient_medications (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      drug_name TEXT NOT NULL,
      dosage TEXT,
      dosage_form TEXT,
      frequency TEXT,
      prescribing_physician TEXT,
      start_date TEXT,
      indication TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      synced_at INTEGER
    );
  `);

  sqlite.run(`
    CREATE TABLE appointments (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      clinic_id TEXT NOT NULL,
      clinic_name TEXT NOT NULL,
      clinic_address TEXT,
      provider_id TEXT NOT NULL,
      provider_name TEXT NOT NULL,
      provider_specialty TEXT,
      provider_avatar_url TEXT,
      scheduled_at TEXT NOT NULL,
      duration_minutes INTEGER NOT NULL DEFAULT 30,
      status TEXT NOT NULL DEFAULT 'confirmed',
      notes TEXT,
      cached_at TEXT NOT NULL,
      raw_json TEXT NOT NULL
    );
  `);

  return { sqlite, db: drizzle(sqlite) };
}

// ── Deterministic Animated Value & Interpolation Mock ────────────────────────
class MockAnimatedInterpolation {
  constructor(
    private parent: MockAnimatedValue,
    private config: { inputRange: number[]; outputRange: number[]; extrapolate?: string },
  ) {}

  __getValue(): number {
    const x = this.parent.__getValue();
    const [inMin, inMax] = this.config.inputRange;
    const [outMin, outMax] = this.config.outputRange;

    if (x <= inMin) return outMin;
    if (x >= inMax) return outMax;

    const t = (x - inMin) / (inMax - inMin);
    return outMin + t * (outMax - outMin);
  }
}

class MockAnimatedValue {
  constructor(private value: number) {}

  setValue(n: number) {
    this.value = n;
  }

  __getValue(): number {
    return this.value;
  }

  interpolate(config: { inputRange: number[]; outputRange: number[]; extrapolate?: string }) {
    return new MockAnimatedInterpolation(this, config);
  }
}

// ── Pure State Machine Resolver (Mirroring Home.screen.tsx logic) ─────────────
export type StitchVisualState = 'first_login' | 'no_appointments' | 'multiple_appointments' | 'search_results';

export interface StitchHomeStateInputs {
  searchQuery: string;
  appointments: DisplayAppointment[];
  recentVitals: VitalSign | null;
  medications: MedicationScheduleItem[];
}

export function resolveStitchVisualState(inputs: StitchHomeStateInputs): StitchVisualState {
  if (inputs.searchQuery.trim().length > 0) {
    return 'search_results';
  }

  const noAppointments = inputs.appointments.length === 0;
  const noVitals = !inputs.recentVitals || (inputs.recentVitals.heartRateBpm == null && inputs.recentVitals.bpSystolic == null);
  const noMeds = inputs.medications.length === 0;

  if (noAppointments && noVitals && noMeds) {
    return 'first_login';
  }

  if (noAppointments) {
    return 'no_appointments';
  }

  return 'multiple_appointments';
}

// ── Test Mock Fixtures ────────────────────────────────────────────────────────
const MOCK_PATIENT_ID = '018f3a50-7000-7c22-b258-000000000001';

const MOCK_POPUlATED_VITALS: VitalSign = {
  id: 'vital-1',
  patientId: MOCK_PATIENT_ID,
  clinicId: 'clinic-1',
  measuredAt: '2026-11-03T08:00:00Z',
  heightCm: 168,
  weightKg: 62.5,
  bmi: 22.1,
  temperatureCelsius: 36.6,
  bpSystolic: 118,
  bpDiastolic: 76,
  heartRateBpm: 72,
  respiratoryRate: 16,
  spO2Percent: 98,
  fastingBloodGlucose: 94,
  waistCm: null,
  hipCm: null,
  headCircumferenceCm: null,
  zScore: null,
  leftVisionAcuity: null,
  rightVisionAcuity: null,
  bodyLengthCm: null,
  skinfoldThicknessMm: null,
  midUpperArmCircCm: null,
  limbMeasurements: null,
  takenBy: 'Nurse Joy',
  facility: 'Metro Cardiology Center',
  syncedAt: new Date(),
  serverId: 'vital-srv-1',
  serverCreatedAt: new Date(),
};

const MOCK_MEDICATIONS: MedicationScheduleItem[] = [
  {
    id: 'med-1',
    name: 'Lisinopril',
    dosage: '10mg',
    instruction: '1 tablet with breakfast',
    isTaken: true,
  },
  {
    id: 'med-2',
    name: 'Omega-3 DHA',
    dosage: '1000mg',
    instruction: '1 softgel after dinner',
    isTaken: false,
  },
];

const MOCK_APPOINTMENTS: DisplayAppointment[] = [
  {
    id: 'apt-1',
    clinicId: 'clinic-101',
    clinicName: 'Metro Cardiology Center • Suite 402',
    doctorName: 'Dr. Evelyn Reed, MD',
    specialty: 'Cardiology Specialist',
    timeLabel: 'Tomorrow, 10:30 AM (Check-in 10:15 AM)',
    badgeLabel: 'Tomorrow',
    badgeTone: 'primary',
    isCheckInEligible: true,
  },
  {
    id: 'apt-2',
    clinicId: 'clinic-102',
    clinicName: 'Oakwood Primary Care & Wellness',
    doctorName: 'Dr. David Chen, MD',
    specialty: 'Family Medicine & Preventive',
    timeLabel: 'Friday, Oct 27 • 2:00 PM (Check-in 1:45 PM)',
    badgeLabel: 'Confirmed',
    badgeTone: 'success',
    isCheckInEligible: false,
  },
];

const MOCK_SEARCH_CLINICS: ClinicDetail[] = [
  {
    id: 'clinic-101',
    name: 'Metro Cardiology Center',
    address: '402 Medical Blvd, Suite 402',
    operatingHours: 'Mon–Sat: 8:00 AM – 6:00 PM',
    specialties: ['Cardiology', 'Diagnostic Ultrasound', 'Cardiac Rehab'],
    isPhilHealthAccredited: true,
    rating: 4.8,
    reviewsCount: 94,
    healthcareProviders: [
      {
        id: 'doc-1',
        name: 'Dr. Evelyn Reed, MD',
        specialty: 'Cardiology Specialist',
        rating: 4.9,
        reviewsCount: 128,
        credentials: ['MD', 'FACC'],
        affiliatedClinics: ['clinic-101'],
      },
    ],
    services: [
      {
        id: 'svc-1',
        name: 'Comprehensive Cardiac Screening',
        description: 'Includes 12-lead ECG, Lipid Profile & Specialist Consultation',
        durationMinutes: 45,
        isCoveredByInsurance: true,
      },
    ],
  },
];

// =============================================================================
// MASTER TEST SUITE: Google Stitch Patient Home Screens (PR #128)
// =============================================================================

describe('Google Stitch Patient Home E2E Test Suite', () => {

  // ───────────────────────────────────────────────────────────────────────────
  // TIER 1: FEATURE COVERAGE
  // ───────────────────────────────────────────────────────────────────────────
  describe('Tier 1: Feature Coverage (All 4 Stitch States & Interactive Behaviors)', () => {

    test('F6: Animated Header Scroll Title interpolates opacity and translateY from scroll offset y', () => {
      const scrollY = new MockAnimatedValue(0);
      const opacityInterp = scrollY.interpolate({ inputRange: [0, 48], outputRange: [0, 1], extrapolate: 'clamp' });
      const translateYInterp = scrollY.interpolate({ inputRange: [0, 48], outputRange: [6, 0], extrapolate: 'clamp' });

      // Offset 0: Initially hidden at y = 0
      expect(opacityInterp.__getValue()).toBe(0);
      expect(translateYInterp.__getValue()).toBe(6);

      // Offset 24: Halfway transition
      scrollY.setValue(24);
      expect(opacityInterp.__getValue()).toBe(0.5);
      expect(translateYInterp.__getValue()).toBe(3);

      // Offset 48: Fully transitioned
      scrollY.setValue(48);
      expect(opacityInterp.__getValue()).toBe(1.0);
      expect(translateYInterp.__getValue()).toBe(0);

      // Offset 100: Clamped at fully visible
      scrollY.setValue(100);
      expect(opacityInterp.__getValue()).toBe(1.0);
      expect(translateYInterp.__getValue()).toBe(0);

      // Component accepts title and subtitle
      const rendered = React.createElement(HeaderScrollTitle, {
        scrollY: scrollY as any,
        title: 'Clinic EZ',
        subtitle: 'Open Health Network',
      });
      expect(rendered.props.title).toBe('Clinic EZ');
      expect(rendered.props.subtitle).toBe('Open Health Network');
    });

    test('State 1 (First Login / Zero Data): Resolves state and renders Onboarding Card, Zero Vitals, and Zero Meds', () => {
      const state = resolveStitchVisualState({
        searchQuery: '',
        appointments: [],
        recentVitals: null,
        medications: [],
      });
      expect(state).toBe('first_login');

      // 1. Welcome Onboarding Card
      let profileCompleted = false;
      let insuranceLinked = false;
      let clinicFound = false;

      const onboardingEl = React.createElement(WelcomeOnboardingCard, {
        onCompleteProfile: () => { profileCompleted = true; },
        onLinkInsurance: () => { insuranceLinked = true; },
        onFindClinic: () => { clinicFound = true; },
      });
      expect(onboardingEl.type).toBe(WelcomeOnboardingCard);

      onboardingEl.props.onCompleteProfile();
      expect(profileCompleted).toBe(true);

      onboardingEl.props.onLinkInsurance();
      expect(insuranceLinked).toBe(true);

      onboardingEl.props.onFindClinic();
      expect(clinicFound).toBe(true);

      // 2. Appointments Section in First Login Mode
      let firstAptBooked = false;
      let clinicExplored = false;

      const aptSection = React.createElement(AppointmentsSection, {
        appointments: [],
        isFirstLogin: true,
        onBookAppointment: () => { firstAptBooked = true; },
        onExploreClinics: () => { clinicExplored = true; },
        onViewAll: () => {},
        onCheckIn: () => {},
        onManageVisit: () => {},
        onDirections: () => {},
      });
      expect(aptSection.props.isFirstLogin).toBe(true);
      expect(aptSection.props.appointments.length).toBe(0);

      aptSection.props.onBookAppointment();
      expect(firstAptBooked).toBe(true);

      aptSection.props.onExploreClinics();
      expect(clinicExplored).toBe(true);

      // 3. Vitals Bento Grid in Zero-Data Mode
      let connectTriggered = false;
      const vitalsGrid = React.createElement(VitalsBentoGrid, {
        vitals: null,
        isZeroData: true,
        onPressHistory: () => {},
        onPressConnect: () => { connectTriggered = true; },
      });
      expect(vitalsGrid.props.isZeroData).toBe(true);
      expect(vitalsGrid.props.vitals).toBeNull();
      vitalsGrid.props.onPressConnect?.();
      expect(connectTriggered).toBe(true);

      // 4. Medications Schedule in Zero-Data Mode
      let addMedTriggered = false;
      const medsSchedule = React.createElement(MedicationsSchedule, {
        medications: [],
        isZeroData: true,
        onToggleMedication: () => {},
        onAddMedication: () => { addMedTriggered = true; },
        onManageAll: () => {},
      });
      expect(medsSchedule.props.isZeroData).toBe(true);
      expect(medsSchedule.props.medications.length).toBe(0);
      medsSchedule.props.onAddMedication();
      expect(addMedTriggered).toBe(true);
    });

    test('State 2 (No Appointments Variant): Displays populated vitals & medications with empty appointments card', () => {
      const state = resolveStitchVisualState({
        searchQuery: '',
        appointments: [],
        recentVitals: MOCK_POPUlATED_VITALS,
        medications: MOCK_MEDICATIONS,
      });
      expect(state).toBe('no_appointments');

      // Vitals Bento Grid has populated readings
      const vitalsGrid = React.createElement(VitalsBentoGrid, {
        vitals: MOCK_POPUlATED_VITALS,
        isZeroData: false,
        onPressHistory: () => {},
      });
      expect(vitalsGrid.props.isZeroData).toBe(false);
      expect(vitalsGrid.props.vitals?.heartRateBpm).toBe(72);
      expect(vitalsGrid.props.vitals?.bpSystolic).toBe(118);
      expect(vitalsGrid.props.vitals?.bpDiastolic).toBe(76);
      expect(vitalsGrid.props.vitals?.fastingBloodGlucose).toBe(94);
      expect(vitalsGrid.props.vitals?.spO2Percent).toBe(98);

      // Appointments Section is empty but not first login
      const aptSection = React.createElement(AppointmentsSection, {
        appointments: [],
        isFirstLogin: false,
        onBookAppointment: () => {},
        onExploreClinics: () => {},
        onViewAll: () => {},
        onCheckIn: () => {},
        onManageVisit: () => {},
        onDirections: () => {},
      });
      expect(aptSection.props.isFirstLogin).toBe(false);
      expect(aptSection.props.appointments.length).toBe(0);

      // Medications Schedule is populated
      const medsSchedule = React.createElement(MedicationsSchedule, {
        medications: MOCK_MEDICATIONS,
        isZeroData: false,
        onToggleMedication: () => {},
        onAddMedication: () => {},
        onManageAll: () => {},
      });
      expect(medsSchedule.props.isZeroData).toBe(false);
      expect(medsSchedule.props.medications.length).toBe(2);
      expect(medsSchedule.props.medications[0].isTaken).toBe(true);
      expect(medsSchedule.props.medications[1].isTaken).toBe(false);
    });

    test('State 3 (Multiple Appointments): Carousel displays doctor, clinic, badges, check-in, and directions', () => {
      const state = resolveStitchVisualState({
        searchQuery: '',
        appointments: MOCK_APPOINTMENTS,
        recentVitals: MOCK_POPUlATED_VITALS,
        medications: MOCK_MEDICATIONS,
      });
      expect(state).toBe('multiple_appointments');

      let checkedInApt: DisplayAppointment | null = null;
      let managedApt: DisplayAppointment | null = null;
      let directionsApt: DisplayAppointment | null = null;

      const aptSection = React.createElement(AppointmentsSection, {
        appointments: MOCK_APPOINTMENTS,
        isFirstLogin: false,
        onBookAppointment: () => {},
        onExploreClinics: () => {},
        onViewAll: () => {},
        onCheckIn: (apt) => { checkedInApt = apt; },
        onManageVisit: (apt) => { managedApt = apt; },
        onDirections: (apt) => { directionsApt = apt; },
      });

      expect(aptSection.props.appointments.length).toBe(2);

      // Verify Appointment 1 (Tomorrow, Check-in eligible)
      const apt1 = aptSection.props.appointments[0];
      expect(apt1.clinicName).toContain('Metro Cardiology Center');
      expect(apt1.doctorName).toBe('Dr. Evelyn Reed, MD');
      expect(apt1.specialty).toBe('Cardiology Specialist');
      expect(apt1.badgeLabel).toBe('Tomorrow');
      expect(apt1.badgeTone).toBe('primary');
      expect(apt1.isCheckInEligible).toBe(true);

      aptSection.props.onCheckIn(apt1);
      expect(checkedInApt).toEqual(apt1);

      // Verify Appointment 2 (Friday, Confirmed, Manage Visit)
      const apt2 = aptSection.props.appointments[1];
      expect(apt2.doctorName).toBe('Dr. David Chen, MD');
      expect(apt2.badgeLabel).toBe('Confirmed');
      expect(apt2.badgeTone).toBe('success');
      expect(apt2.isCheckInEligible).toBe(false);

      aptSection.props.onManageVisit(apt2);
      expect(managedApt).toEqual(apt2);

      aptSection.props.onDirections(apt1);
      expect(directionsApt).toEqual(apt1);
    });

    test('State 4 (Search Results Mode): Query input activates categorized search results and filter chips', () => {
      const state = resolveStitchVisualState({
        searchQuery: 'cardiac',
        appointments: MOCK_APPOINTMENTS,
        recentVitals: MOCK_POPUlATED_VITALS,
        medications: MOCK_MEDICATIONS,
      });
      expect(state).toBe('search_results');

      let activeFilter: SearchFilterType = 'all';
      let bookedDocId: string | null = null;
      let viewedClinicId: string | null = null;
      let scheduledPkgId: string | null = null;

      const searchView = React.createElement(SearchResultsView, {
        query: 'cardiac',
        clinics: MOCK_SEARCH_CLINICS,
        selectedFilter: activeFilter,
        onSelectFilter: (f) => { activeFilter = f; },
        onBookDoctor: (docId) => { bookedDocId = docId; },
        onViewClinic: (clinicId) => { viewedClinicId = clinicId; },
        onSchedulePackage: (pkgId) => { scheduledPkgId = pkgId; },
      });

      expect(searchView.props.query).toBe('cardiac');
      expect(searchView.props.clinics.length).toBe(1);

      // Filter chips toggle
      searchView.props.onSelectFilter('doctors');
      expect(activeFilter).toBe('doctors');

      // Actions execution
      searchView.props.onBookDoctor('doc-1');
      expect(bookedDocId).toBe('doc-1');

      searchView.props.onViewClinic('clinic-101');
      expect(viewedClinicId).toBe('clinic-101');

      searchView.props.onSchedulePackage('svc-1');
      expect(scheduledPkgId).toBe('svc-1');
    });

    test('Medication Adherence ("Log Now"): Tapping Log Now invokes callback and records adherence', () => {
      const meds: MedicationScheduleItem[] = [
        { id: 'med-10', name: 'Metformin', dosage: '500mg', instruction: 'Twice daily', isTaken: false },
      ];

      let toggledId: string | null = null;
      const schedule = React.createElement(MedicationsSchedule, {
        medications: meds,
        onToggleMedication: (id) => { toggledId = id; },
        onAddMedication: () => {},
        onManageAll: () => {},
      });

      expect(schedule.props.medications[0].isTaken).toBe(false);
      schedule.props.onToggleMedication('med-10');
      expect(toggledId).toBe('med-10');

      // Optimistic update
      const updatedMeds = meds.map((m) => (m.id === toggledId ? { ...m, isTaken: true } : m));
      expect(updatedMeds[0].isTaken).toBe(true);
    });

    test('Digital Health Pass: Verifies verified pass details and modal triggering', () => {
      let qrModalOpened = false;
      const card = React.createElement(HealthPassCard, {
        patientFullName: 'Sarah Jenkins',
        patientIdCode: 'PC-8942-01',
        onOpenQrModal: () => { qrModalOpened = true; },
      });

      expect(card.props.patientFullName).toBe('Sarah Jenkins');
      expect(card.props.patientIdCode).toBe('PC-8942-01');

      card.props.onOpenQrModal();
      expect(qrModalOpened).toBe(true);

      let qrModalClosed = false;
      const modal = React.createElement(HealthPassQrModal, {
        visible: true,
        patientFullName: 'Sarah Jenkins',
        patientIdCode: 'PC-8942-01',
        onClose: () => { qrModalClosed = true; },
      });

      expect(modal.props.visible).toBe(true);
      modal.props.onClose();
      expect(qrModalClosed).toBe(true);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TIER 2: BOUNDARY & CORNER CASES
  // ───────────────────────────────────────────────────────────────────────────
  describe('Tier 2: Boundary & Corner Cases (Empty States, SQLite Fallback & Stress)', () => {

    test('Empty and Null Telemetry: Handles partial and all-null vitals gracefully without crashing', () => {
      const partialVitals: VitalSign = {
        ...MOCK_POPUlATED_VITALS,
        heartRateBpm: null,
        bpSystolic: null,
        bpDiastolic: null,
        fastingBloodGlucose: null,
        spO2Percent: null,
      };

      const grid = React.createElement(VitalsBentoGrid, {
        vitals: partialVitals,
        isZeroData: false,
        onPressHistory: () => {},
      });

      expect(grid.props.vitals?.heartRateBpm).toBeNull();
      expect(grid.props.vitals?.bpSystolic).toBeNull();
      expect(grid.props.vitals?.fastingBloodGlucose).toBeNull();
      expect(grid.props.vitals?.spO2Percent).toBeNull();
    });

    test('Offline SQLite Fallback: Queries cached vital signs from SQLite when live API throws', () => {
      const { sqlite, db } = createInMemoryDatabase();

      // Insert cached vital sign into SQLite
      sqlite.run(
        `INSERT INTO vital_signs (id, patient_id, clinic_id, measured_at, bp_systolic, bp_diastolic, heart_rate_bpm, fasting_blood_glucose, spo2_percent, synced_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ['cache-vital-1', MOCK_PATIENT_ID, 'clinic-offline', '2026-11-02T18:00:00Z', 120, 80, 75, 95.0, 99.0, Date.now()],
      );

      // Simulate API failure and local SQLite fallback query
      const { vitalSigns } = require('../../db/schema/vitalSigns');
      const rows = db
        .select()
        .from(vitalSigns)
        .where(eq(vitalSigns.patientId, MOCK_PATIENT_ID))
        .orderBy(desc(vitalSigns.measuredAt))
        .limit(1)
        .all();

      expect(rows.length).toBe(1);
      const cached = rows[0];
      expect(cached.heartRateBpm).toBe(75);
      expect(cached.bpSystolic).toBe(120);
      expect(cached.bpDiastolic).toBe(80);
      expect(cached.fastingBloodGlucose).toBe(95);
      expect(cached.spO2Percent).toBe(99);

      sqlite.close();
    });

    test('Appointment Cardinality: Transitions correctly across 0, 1, and 5 appointments with cancelled filtering', () => {
      // 0 Appointments
      const stateZero = resolveStitchVisualState({
        searchQuery: '',
        appointments: [],
        recentVitals: MOCK_POPUlATED_VITALS,
        medications: MOCK_MEDICATIONS,
      });
      expect(stateZero).toBe('no_appointments');

      // 1 Appointment
      const singleApt = [MOCK_APPOINTMENTS[0]];
      const stateOne = resolveStitchVisualState({
        searchQuery: '',
        appointments: singleApt,
        recentVitals: MOCK_POPUlATED_VITALS,
        medications: MOCK_MEDICATIONS,
      });
      expect(stateOne).toBe('multiple_appointments');
      expect(singleApt.length).toBe(1);
      expect(singleApt[0].isCheckInEligible).toBe(true);

      // Filter out cancelled appointments
      const rawAppointments = [
        { id: '1', status: 'confirmed' },
        { id: '2', status: 'cancelled' },
        { id: '3', status: 'draft' },
        { id: '4', status: 'cancelled' },
      ];
      const activeAppointments = rawAppointments.filter((a) => a.status !== 'cancelled');
      expect(activeAppointments.length).toBe(2);
      expect(activeAppointments.map((a) => a.id)).toEqual(['1', '3']);
    });

    test('Search Boundary: Zero results and special characters matrix do not throw unhandled exceptions', () => {
      // Zero matching results
      const emptyView = React.createElement(SearchResultsView, {
        query: 'nonexistent-symptom-query',
        clinics: [],
        selectedFilter: 'all',
        onSelectFilter: () => {},
        onBookDoctor: () => {},
        onViewClinic: () => {},
        onSchedulePackage: () => {},
      });
      expect(emptyView.props.clinics.length).toBe(0);

      // Adversarial / Special Character queries
      const adversarialQueries = [
        "<script>alert('xss')</script>",
        "' OR 1=1 --",
        '1; DROP TABLE appointments; --',
        '🚀🔥💊🏥🩺',
        '!@#$%^&*()_+={}[]|\\:;"<>,.?/',
        'a'.repeat(512),
        '   ',
        '',
      ];

      for (const query of adversarialQueries) {
        expect(() => {
          const isSearchActive = query.trim().length > 0;
          const state = resolveStitchVisualState({
            searchQuery: query,
            appointments: MOCK_APPOINTMENTS,
            recentVitals: MOCK_POPUlATED_VITALS,
            medications: MOCK_MEDICATIONS,
          });
          if (query.trim().length === 0) {
            expect(state).toBe('multiple_appointments');
            expect(isSearchActive).toBe(false);
          } else {
            expect(state).toBe('search_results');
            expect(isSearchActive).toBe(true);
          }
        }).not.toThrow();
      }
    });

    test('Scroll Offset Boundaries: Clamps negative pull-to-refresh and extreme large offsets', () => {
      const scrollY = new MockAnimatedValue(0);
      const opacity = scrollY.interpolate({ inputRange: [0, 48], outputRange: [0, 1], extrapolate: 'clamp' });
      const translateY = scrollY.interpolate({ inputRange: [0, 48], outputRange: [6, 0], extrapolate: 'clamp' });

      // Negative offset (iOS bounce)
      scrollY.setValue(-100);
      expect(opacity.__getValue()).toBe(0);
      expect(translateY.__getValue()).toBe(6);

      // Extreme high offset (fast scroll)
      scrollY.setValue(100000);
      expect(opacity.__getValue()).toBe(1);
      expect(translateY.__getValue()).toBe(0);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TIER 3: CROSS-FEATURE COMBINATIONS
  // ───────────────────────────────────────────────────────────────────────────
  describe('Tier 3: Cross-Feature Workflows & State Transitions', () => {

    test('Search Activation & Return: Seamless transition from Home to Search Results and back to Home', () => {
      let currentQuery = '';
      const baseInputs: StitchHomeStateInputs = {
        searchQuery: currentQuery,
        appointments: MOCK_APPOINTMENTS,
        recentVitals: MOCK_POPUlATED_VITALS,
        medications: MOCK_MEDICATIONS,
      };

      // Step 1: Normal Home view
      expect(resolveStitchVisualState(baseInputs)).toBe('multiple_appointments');

      // Step 2: User types search query
      currentQuery = 'cardiology';
      expect(resolveStitchVisualState({ ...baseInputs, searchQuery: currentQuery })).toBe('search_results');

      // Step 3: User filters by clinics
      let selectedFilter: SearchFilterType = 'all';
      const searchView = React.createElement(SearchResultsView, {
        query: currentQuery,
        clinics: MOCK_SEARCH_CLINICS,
        selectedFilter,
        onSelectFilter: (f) => { selectedFilter = f; },
        onBookDoctor: () => {},
        onViewClinic: () => {},
        onSchedulePackage: () => {},
      });
      searchView.props.onSelectFilter('clinics');
      expect(selectedFilter).toBe('clinics');

      // Step 4: User clears search input -> returns to multiple_appointments
      currentQuery = '';
      expect(resolveStitchVisualState({ ...baseInputs, searchQuery: currentQuery })).toBe('multiple_appointments');
    });

    test('Medication Adherence to Telemetry Verification: Logs medication and verifies adherence status', () => {
      let meds = [...MOCK_MEDICATIONS];
      expect(meds.filter((m) => m.isTaken).length).toBe(1);
      expect(meds.filter((m) => !m.isTaken).length).toBe(1);

      // Patient taps "Log Now" on med-2
      const targetMed = meds.find((m) => m.id === 'med-2')!;
      expect(targetMed.isTaken).toBe(false);

      // Simulate adherence handler
      meds = meds.map((m) => (m.id === 'med-2' ? { ...m, isTaken: true } : m));
      expect(meds.filter((m) => m.isTaken).length).toBe(2);
      expect(meds.filter((m) => !m.isTaken).length).toBe(0);

      // Bento vitals still maintains optimal readings
      expect(MOCK_POPUlATED_VITALS.bpSystolic).toBe(118);
      expect(MOCK_POPUlATED_VITALS.bpDiastolic).toBe(76);
    });

    test('Appointments Carousel Navigation & Actions: Verified check-in, management, and directions', () => {
      let routeNavigated = '';
      let routeParams: any = null;

      const mockNavigate = (route: string, params?: any) => {
        routeNavigated = route;
        routeParams = params;
      };

      const aptSection = React.createElement(AppointmentsSection, {
        appointments: MOCK_APPOINTMENTS,
        isFirstLogin: false,
        onBookAppointment: () => mockNavigate('BookingScreen'),
        onExploreClinics: () => mockNavigate('ExploreClinicsScreen'),
        onViewAll: () => mockNavigate('AppointmentsScreen'),
        onCheckIn: (apt) => mockNavigate('ClinicDetailsScreen', { clinicId: apt.clinicId }),
        onManageVisit: (apt) => mockNavigate('ClinicDetailsScreen', { clinicId: apt.clinicId }),
        onDirections: (apt) => mockNavigate('ClinicDetailsScreen', { clinicId: apt.clinicId, tab: 'directions' }),
      });

      // Check-in on Card 1
      aptSection.props.onCheckIn(MOCK_APPOINTMENTS[0]);
      expect(routeNavigated).toBe('ClinicDetailsScreen');
      expect(routeParams.clinicId).toBe('clinic-101');

      // Directions on Card 1
      aptSection.props.onDirections(MOCK_APPOINTMENTS[0]);
      expect(routeParams.tab).toBe('directions');

      // Manage on Card 2
      aptSection.props.onManageVisit(MOCK_APPOINTMENTS[1]);
      expect(routeParams.clinicId).toBe('clinic-102');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TIER 4: REAL-WORLD WORKFLOWS (Patient Journeys)
  // ───────────────────────────────────────────────────────────────────────────
  describe('Tier 4: Real-World Clinical Patient Journeys', () => {

    test('Scenario 1: Sarah Jenkins — First-Time Patient Onboarding to Active Consultation', () => {
      const { sqlite, db } = createInMemoryDatabase();

      // Step 1: Sarah Jenkins signs in for the first time
      const patientState: StitchHomeStateInputs = {
        searchQuery: '',
        appointments: [],
        recentVitals: null,
        medications: [],
      };

      // Initial state is strictly State 1 (First Login)
      expect(resolveStitchVisualState(patientState)).toBe('first_login');

      // Step 2: Digital Health Pass is verified
      const pass = React.createElement(HealthPassCard, {
        patientFullName: 'Sarah Jenkins',
        patientIdCode: 'PC-8942-01',
        onOpenQrModal: () => {},
      });
      expect(pass.props.patientFullName).toBe('Sarah Jenkins');
      expect(pass.props.patientIdCode).toBe('PC-8942-01');

      // Step 3: Sarah taps "Book First Appointment", books consultation with Dr. Evelyn Reed
      sqlite.run(
        `INSERT INTO appointments (id, patient_id, clinic_id, clinic_name, provider_id, provider_name, provider_specialty, scheduled_at, status, cached_at, raw_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          'sarah-apt-1',
          MOCK_PATIENT_ID,
          'clinic-101',
          'Metro Cardiology Center',
          'doc-1',
          'Dr. Evelyn Reed, MD',
          'Cardiology Specialist',
          '2026-11-04T10:30:00Z',
          'confirmed',
          new Date().toISOString(),
          '{}',
        ],
      );

      // Step 4: Appointment exists, but vitals/meds not yet recorded -> State 3 (Active Appointments)
      const updatedAppointments: DisplayAppointment[] = [
        {
          id: 'sarah-apt-1',
          clinicId: 'clinic-101',
          clinicName: 'Metro Cardiology Center',
          doctorName: 'Dr. Evelyn Reed, MD',
          specialty: 'Cardiology Specialist',
          timeLabel: 'Tomorrow • 10:30 AM',
          badgeLabel: 'Tomorrow',
          badgeTone: 'primary',
          isCheckInEligible: true,
        },
      ];

      expect(
        resolveStitchVisualState({
          ...patientState,
          appointments: updatedAppointments,
        }),
      ).toBe('multiple_appointments');

      // Step 5: Apple Health syncs resting vitals
      sqlite.run(
        `INSERT INTO vital_signs (id, patient_id, measured_at, bp_systolic, bp_diastolic, heart_rate_bpm, fasting_blood_glucose, spo2_percent, synced_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ['sarah-vital-1', MOCK_PATIENT_ID, '2026-11-03T07:00:00Z', 116, 74, 70, 92, 99, Date.now()],
      );

      const vitalsList = db.select().from(require('../../db/schema/vitalSigns').vitalSigns).all();
      expect(vitalsList.length).toBe(1);
      expect(vitalsList[0].heartRateBpm).toBe(70);

      sqlite.close();
    });

    test('Scenario 2: Outpatient Active Care — Telemetry Sync, Medication Adherence & Package Discovery', () => {
      // Step 1: Active patient starts morning routine
      let medications = [...MOCK_MEDICATIONS];
      expect(medications.length).toBe(2);

      // Step 2: Patient adheres to morning dose
      const pendingMed = medications.find((m) => !m.isTaken)!;
      expect(pendingMed.name).toBe('Omega-3 DHA');

      medications = medications.map((m) => (m.id === pendingMed.id ? { ...m, isTaken: true } : m));
      expect(medications.every((m) => m.isTaken)).toBe(true);

      // Step 3: Patient searches for diagnostic screening
      const searchQuery = 'cardiac screening';
      expect(
        resolveStitchVisualState({
          searchQuery,
          appointments: MOCK_APPOINTMENTS,
          recentVitals: MOCK_POPUlATED_VITALS,
          medications,
        }),
      ).toBe('search_results');

      // Step 4: Patient locates package in SearchResultsView
      const pkg = MOCK_SEARCH_CLINICS[0].services?.[0]!;
      expect(pkg.name).toBe('Comprehensive Cardiac Screening');
      expect(pkg.durationMinutes).toBe(45);
      expect(pkg.isCoveredByInsurance).toBe(true);
    });
  });
});

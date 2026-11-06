import { describe, expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  computeAppointmentsSection,
  computeDailyMindfulMoment,
  computeRecentVitals,
  computeTodayMedicationSchedule,
  computeWelcomeChecklist,
  deriveClinicEzId,
  extractInitials,
  formatBloodGroupDisplay,
  HEADER_REVEAL_SCROLL_END,
  HEADER_REVEAL_SCROLL_START,
  parseVisitedStepsJson,
} from '../services/home/homeDashboardService';
import { filterOfflineSearchCatalog } from '../services/search/patientSearchService';
import { resolveIsOnlineFromNetInfo } from '../hooks/useNetworkOnline';
import { iconNames } from '../components/ui/iconNames';

const APP_ROOT = join(import.meta.dir, '..');
const readAppFile = (rel: string): string =>
  readFileSync(join(APP_ROOT, rel), 'utf8').replace(/\r\n/g, '\n');

describe('Patient Home & Dedicated Search Replacement Suite', () => {
  test('1. Header: initially hides title/subtitle at scroll top and animates on scroll, with Bell + User Avatar', () => {
    expect(HEADER_REVEAL_SCROLL_START).toBeGreaterThan(0);
    expect(HEADER_REVEAL_SCROLL_END).toBeGreaterThan(HEADER_REVEAL_SCROLL_START);
    expect(extractInitials('Sarah Jenkins')).toBe('SJ');
    expect(extractInitials('David Chen')).toBe('DC');
    expect(extractInitials('Cher')).toBe('CH');

    const headerSrc = readAppFile('components/home/HomeHeader.tsx');
    expect(headerSrc.includes('outputRange: [0, 1]')).toBe(true);
    expect(headerSrc.includes('outputRange: [8, 0]')).toBe(true);
    expect(headerSrc.includes('name="notifications"')).toBe(true);
    expect(headerSrc.includes('ClinicEzMark')).toBe(true);
    expect(headerSrc.includes('showBrand = true')).toBe(true);
    expect(headerSrc.includes('alwaysShowTitle = false')).toBe(true);
    expect(headerSrc.includes('centerSlot')).toBe(true);

    const homeNativeSrc = readAppFile('navigation/screens/Home.screen.tsx');
    const homeWebSrc = readAppFile('navigation/screens/Home.screen.web.tsx');
    expect(homeNativeSrc.includes('Animated.ScrollView')).toBe(true);
    expect(homeNativeSrc.includes('Animated.event')).toBe(true);
    expect(homeNativeSrc.includes('showBrand=')).toBe(false);
    expect(homeWebSrc.includes('Animated.ScrollView')).toBe(true);
    expect(homeWebSrc.includes('showBrand={!isWorkstation}')).toBe(true);
    expect(homeWebSrc.includes('alwaysShowTitle={isWorkstation}')).toBe(true);
    expect(homeWebSrc.includes('compact')).toBe(true);
    expect(homeWebSrc.includes('{!isWorkstation ? (')).toBe(true);
    expect(homeWebSrc.includes("navigateToMainRoute('NotificationScreen')")).toBe(true);
    expect(homeWebSrc.includes("navigateToMainRoute('ProfileScreen')")).toBe(true);

    const sidebarSrc = readAppFile('components/layout/WebSidebar.web.tsx');
    expect(sidebarSrc.includes('user?.imageUrl')).toBe(true);
    expect(sidebarSrc.includes('source={{ uri: avatarUrl }}')).toBe(true);
    expect(sidebarSrc.includes('extractInitials')).toBe(true);
    expect(sidebarSrc.includes('confirmSignOut')).toBe(false);
    expect(sidebarSrc.includes('name="logout"')).toBe(false);

    const logoSrc = readAppFile('components/ui/ClinicEzLogo.tsx');
    expect(logoSrc.includes('brandSubtitle')).toBe(true);
  });

  test('2. Bottom Tabs: preserves native SF/Material symbols while updating strictly to Home, Records, Appointments, Messages', () => {
    const nativeTabsSrc = readAppFile('navigation/navigators/MainBottomTabs.tsx');
    const webTabsSrc = readAppFile('navigation/navigators/MainBottomTabs.web.tsx');

    // Exact 4-tab order in MainBottomTabs.tsx
    const screensBlock = nativeTabsSrc.slice(nativeTabsSrc.indexOf('screens: {'));
    const idxHome = screensBlock.indexOf("createScreen('HomeScreen')");
    const idxRecords = screensBlock.indexOf("createScreen('RecordsScreen')");
    const idxAppts = screensBlock.indexOf("createScreen('AppointmentsScreen')");
    const idxMessages = screensBlock.indexOf("createScreen('MessagesScreen')");

    expect(idxHome).toBeGreaterThan(-1);
    expect(idxRecords).toBeGreaterThan(idxHome);
    expect(idxAppts).toBeGreaterThan(idxRecords);
    expect(idxMessages).toBeGreaterThan(idxAppts);
    expect(screensBlock.includes("createScreen('ProfileScreen')")).toBe(false);

    // Native symbol probe preserved
    expect(nativeTabsSrc.includes("type: 'sfSymbol'")).toBe(true);
    expect(nativeTabsSrc.includes("type: 'materialSymbol'")).toBe(true);
    expect(nativeTabsSrc.includes('checkAndroidSymbolSupport')).toBe(true);

    // Web bottom tabs match exact same 4-tab order
    const webIdxHome = webTabsSrc.indexOf('HomeScreen:');
    const webIdxRecords = webTabsSrc.indexOf('RecordsScreen:');
    const webIdxAppts = webTabsSrc.indexOf('AppointmentsScreen:');
    const webIdxMessages = webTabsSrc.indexOf('MessagesScreen:');
    expect(webIdxHome).toBeGreaterThan(-1);
    expect(webIdxRecords).toBeGreaterThan(webIdxHome);
    expect(webIdxAppts).toBeGreaterThan(webIdxRecords);
    expect(webIdxMessages).toBeGreaterThan(webIdxAppts);
    expect(webTabsSrc.includes('ProfileScreen:')).toBe(false);
  });

  test('3. Search Bar & Dedicated Search Screen: registered inside HomeStack and filters live catalog counts accurately', () => {
    const homeStackSrc = readAppFile('navigation/navigators/HomeStack.tsx');
    const homeStackWebSrc = readAppFile('navigation/navigators/HomeStack.web.tsx');
    const searchSrc = readAppFile('navigation/screens/Search.screen.tsx');

    expect(homeStackSrc.includes('PatientSearch:')).toBe(true);
    expect(homeStackWebSrc.includes('PatientSearch:')).toBe(true);
    expect(searchSrc.includes('DOCTORS & SPECIALISTS')).toBe(true);
    expect(searchSrc.includes('CLINICS & CARE CENTERS')).toBe(true);
    expect(searchSrc.includes('SPECIALIZED CARE PACKAGES')).toBe(true);
    expect(searchSrc.includes('Book Visit')).toBe(true);
    expect(searchSrc.includes('View Clinic')).toBe(true);
    expect(searchSrc.includes('Schedule')).toBe(true);

    const searchResult = filterOfflineSearchCatalog({
      query: 'cardio',
      category: 'all',
      doctors: [
        {
          id: 'doc-1',
          clinicId: 'clinic-1',
          name: 'Dr. Evelyn Reed, MD',
          specialty: 'Cardiology Specialist',
          avatarUrl: null,
          professionalLicenseNo: 'PRC-1001',
          isVerified: true,
          clinicName: 'Metro Cardiology Center',
          clinicAddress: 'Suite 402',
          clinicSupportsAppointments: true,
          nextAvailableAt: null,
          nextAvailableLabel: 'Tomorrow, 10:30 AM',
          tags: ['Accepts Insurance', 'In-Person & Telehealth'],
        },
        {
          id: 'doc-2',
          clinicId: 'clinic-2',
          name: 'Dr. Hannah Lim, MD',
          specialty: 'Pediatrics',
          avatarUrl: null,
          professionalLicenseNo: 'PRC-1002',
          isVerified: true,
          clinicName: 'Child Care Clinic',
          clinicAddress: '12 Oak Ave',
          clinicSupportsAppointments: true,
          nextAvailableAt: null,
          nextAvailableLabel: 'Friday, 9:00 AM',
          tags: ['Open Network'],
        },
      ],
      clinics: [
        {
          id: 'clinic-1',
          name: 'Metro Cardiology Clinic',
          primarySpecialty: 'Comprehensive Heart Care',
          description: 'Echo & Diagnostic Lab',
          address: 'Suite 402, Medical Arts Wing',
          logoUrl: null,
          coverImageUrl: null,
          operatingHours: '8:00 AM - 5:00 PM',
          openStatusLabel: 'Open Now',
          isOpenNow: true,
          supportsAppointments: true,
          isPublic: true,
          isGated: false,
          isUnlocked: true,
          activeMemberCount: 5,
          nextAvailableAt: null,
          nextAvailableLabel: 'Today 3:00 PM',
          tags: ['Walk-ins Welcome'],
        },
      ],
      services: [
        {
          id: 'svc-1',
          clinicId: 'clinic-1',
          clinicName: 'Metro Cardiology Clinic',
          name: 'Comprehensive Cardiac Checkup',
          subtitle: 'Full Cardiovascular Panel',
          description: 'Includes 12-lead ECG & lipid profile',
          durationMinutes: 45,
          price: null,
          priceBadgeLabel: 'Covered',
          tags: ['Fully Covered by Insurance', 'Prep Guide Included'],
        },
      ],
    });

    expect(searchResult.counts).toEqual({
      all: 3,
      doctors: 1,
      clinics: 1,
      services: 1,
    });

    const doctorsOnly = filterOfflineSearchCatalog({
      query: 'cardio',
      category: 'doctors',
      doctors: searchResult.doctors,
      clinics: searchResult.clinics,
      services: searchResult.services,
    });
    expect(doctorsOnly.counts.all).toBe(3);
    expect(doctorsOnly.doctors.length).toBe(1);
    expect(doctorsOnly.clinics.length).toBe(0);
    expect(doctorsOnly.services.length).toBe(0);
  });

  test('4 & 5. Health Pass Card, Lucide Icon Parity & Quick Actions', () => {
    expect(deriveClinicEzId('9b583f44-6e29-4245-9222-119b2a4d77aa')).toMatch(/^PC-\d{4}-\d{2}$/);
    expect(formatBloodGroupDisplay('APositive')).toBe('A+');
    expect(formatBloodGroupDisplay('ONegative')).toBe('O-');
    expect(formatBloodGroupDisplay('Unknown')).toBeNull();

    const requiredLucideIcons = [
      'mic',
      'sliders',
      'flag',
      'arrowRight',
      'plusCircle',
      'navigation',
      'headset',
      'squarePlus',
      'folderHeart',
      'clipboardPen',
      'calendarCheck',
      'userCheck',
      'history',
      'droplet',
      'gauge',
      'moon',
      'trendingUp',
      'arrowLeftRight',
      'nfc',
      'badgeCheck',
      'heart',
      'scanBarcode',
    ] as const;

    const iconRegistrySrc = readAppFile('components/ui/iconRegistry.ts');
    const iconWebSrc = readAppFile('components/ui/Icon.web.tsx');

    for (const icon of requiredLucideIcons) {
      expect(iconNames.includes(icon)).toBe(true);
      expect(iconRegistrySrc.includes(`${icon}:`)).toBe(true);
      expect(iconWebSrc.includes(`${icon}:`)).toBe(true);
    }

    const healthPassSrc = readAppFile('components/home/HealthPassCard.tsx');
    expect(healthPassSrc.includes('CLINIC EZ •')).toBe(false);
    expect(healthPassSrc.includes('Tap terminal or present barcode')).toBe(false);
    expect(healthPassSrc.includes('Present QR code for quick record transfer')).toBe(true);
    expect(healthPassSrc.includes('name="qrCode"')).toBe(true);

    const quickActionsSrc = readAppFile('components/home/QuickActionsGrid.tsx');
    expect(quickActionsSrc.includes("title: 'Reach Dr.'")).toBe(true);
    expect(quickActionsSrc.includes("title: 'Services'")).toBe(true);
    expect(quickActionsSrc.includes("title: 'Records'")).toBe(true);
    expect(quickActionsSrc.includes("title: 'Prescriptions'")).toBe(true);
  });

  test('6. Welcome Checklist Banner: tracks visited steps and hides automatically once all 3 links are visited', () => {
    const fresh = computeWelcomeChecklist({
      visitedSteps: [],
      hasHealthProfileData: false,
      hasInsuranceLinked: false,
      hasPrimaryClinic: false,
    });
    expect(fresh.isHidden).toBe(false);
    expect(fresh.completedCount).toBe(0);
    expect(fresh.currentStepNumber).toBe(1);

    const twoDone = computeWelcomeChecklist({
      visitedSteps: parseVisitedStepsJson('["health_profile","link_insurance"]'),
      hasHealthProfileData: true,
      hasInsuranceLinked: true,
      hasPrimaryClinic: false,
    });
    expect(twoDone.isHidden).toBe(false);
    expect(twoDone.completedCount).toBe(2);
    expect(twoDone.currentStepNumber).toBe(3);

    const allThreeVisited = computeWelcomeChecklist({
      visitedSteps: ['health_profile', 'link_insurance', 'primary_clinic'],
      hasHealthProfileData: true,
      hasInsuranceLinked: true,
      hasPrimaryClinic: true,
    });
    expect(allThreeVisited.completedCount).toBe(3);
    expect(allThreeVisited.isHidden).toBe(true);
  });

  test('7. Appointment Carousel: accurately distinguishes first_time, active, and returning_empty states', () => {
    const now = new Date('2026-11-03T10:00:00.000Z');

    // State 1: Fresh patient (0 upcoming, 0 past)
    const state1 = computeAppointmentsSection([], 0, now);
    expect(state1.carouselState).toBe('first_time');
    expect(state1.scheduledCount).toBe(0);
    expect(state1.pastVisitsCount).toBe(0);

    // State 2: Active scheduled appointments
    const state2 = computeAppointmentsSection(
      [
        {
          id: 'appt-1',
          patientId: 'p-1',
          clinicId: 'c-1',
          clinicName: 'Metro Cardiology Center',
          clinicAddress: 'Suite 402',
          clinicLogoUrl: null,
          clinicCoverImageUrl: null,
          clinicPhoneNumber: null,
          providerId: 'dr-1',
          providerName: 'Dr. Evelyn Reed, MD',
          providerSpecialty: 'Cardiology Specialist',
          providerAvatarUrl: null,
          providerBio: null,
          providerCredentialsJson: '[]',
          providerAffiliatedClinicsJson: '[]',
          serviceType: 'Consultation',
          scheduledAt: '2026-11-04T10:30:00.000Z',
          durationMinutes: 30,
          status: 'confirmed',
          notes: null,
          attachedDocumentsJson: '[]',
          cachedAt: '2026-11-03T09:00:00.000Z',
          rawJson: '{}',
        },
      ],
      1,
      now,
      { 'appt-1': '2026-11-04T10:16:00.000Z' },
    );
    expect(state2.carouselState).toBe('active');
    expect(state2.scheduledCount).toBe(1);
    expect(state2.upcomingItems[0].checkInOpensAt).toBe('2026-11-04T10:15:00.000Z');
    expect(state2.upcomingItems[0].isCheckedIn).toBe(true);

    // State 3: Returning patient with 0 upcoming but >=1 past consultations
    const state3 = computeAppointmentsSection([], 2, now);
    expect(state3.carouselState).toBe('returning_empty');
    expect(state3.scheduledCount).toBe(0);
    expect(state3.pastVisitsCount).toBe(2);
  });

  test('8 & 9. Recent Vitals Telemetry & Today Medication Schedule compute empty and populated states without mock data', () => {
    const emptyVitals = computeRecentVitals([]);
    expect(emptyVitals.hasAnyReadings).toBe(false);
    expect(emptyVitals.heartRateBpm).toBeNull();
    expect(emptyVitals.systolicBp).toBeNull();
    expect(emptyVitals.fastingBloodGlucoseMgDl).toBeNull();
    expect(emptyVitals.sleepDurationMinutes).toBeNull();

    const populatedVitals = computeRecentVitals([
      {
        id: 'v-1',
        patientId: 'p-1',
        clinicId: null,
        measuredAt: '2026-11-02T08:00:00.000Z',
        heightCm: null,
        weightKg: null,
        bmi: null,
        temperatureCelsius: null,
        bpSystolic: 120,
        bpDiastolic: 78,
        heartRateBpm: 70,
        respiratoryRate: null,
        spO2Percent: null,
        fastingBloodGlucose: 92,
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
        takenBy: null,
        facility: null,
        sleepDurationMinutes: 415,
        deepSleepMinutes: 115,
        source: 'Apple Health',
        syncedAt: null,
        serverId: 'v-1',
        serverCreatedAt: null,
      },
      {
        id: 'v-2',
        patientId: 'p-1',
        clinicId: null,
        measuredAt: '2026-11-03T08:00:00.000Z',
        heightCm: null,
        weightKg: null,
        bmi: null,
        temperatureCelsius: null,
        bpSystolic: 118,
        bpDiastolic: 76,
        heartRateBpm: 72,
        respiratoryRate: null,
        spO2Percent: null,
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
        takenBy: null,
        facility: null,
        sleepDurationMinutes: 465,
        deepSleepMinutes: 130,
        source: 'Apple Health',
        syncedAt: null,
        serverId: 'v-2',
        serverCreatedAt: null,
      },
    ]);

    expect(populatedVitals.hasAnyReadings).toBe(true);
    expect(populatedVitals.heartRateBpm).toBe(72);
    expect(populatedVitals.heartRateDeltaBpm).toBe(2);
    expect(populatedVitals.bloodPressureStatus).toBe('Optimal');
    expect(populatedVitals.bloodGlucoseStatus).toBe('Normal 70–99');
    expect(populatedVitals.sleepDurationMinutes).toBe(465);
    expect(populatedVitals.sleepDeltaPercent).toBe(12);

    const now = new Date('2026-11-03T09:00:00.000Z');
    const medSchedule = computeTodayMedicationSchedule(
      [
        {
          id: 'med-1',
          patientId: 'p-1',
          drugName: 'Lisinopril',
          dosage: '10mg',
          dosageForm: '1 tablet',
          frequency: 'with breakfast',
          prescribingPhysician: 'Dr. Reed',
          startDate: '2026-10-01',
          indication: null,
          isActive: true,
          createdAt: now,
          updatedAt: now,
          syncedAt: now,
          serverId: 'med-1',
          deletedAt: null,
        },
        {
          id: 'med-2',
          patientId: 'p-1',
          drugName: 'Omega-3 DHA',
          dosage: '1000mg',
          dosageForm: '1 softgel',
          frequency: 'after dinner',
          prescribingPhysician: 'Dr. Reed',
          startDate: '2026-10-01',
          indication: null,
          isActive: true,
          createdAt: now,
          updatedAt: now,
          syncedAt: now,
          serverId: 'med-2',
          deletedAt: null,
        },
      ],
      [
        {
          id: 'log-1',
          patientId: 'p-1',
          medicationId: 'med-1',
          logDate: '2026-11-03',
          scheduledTimeLabel: '8:00 AM',
          takenAt: '2026-11-03T08:05:00.000Z',
          notes: null,
          syncedAt: now,
          serverId: 'log-1',
        },
      ],
    );

    expect(medSchedule.activeCount).toBe(2);
    expect(medSchedule.items[0].isTakenToday).toBe(true);
    expect(medSchedule.items[1].isTakenToday).toBe(false);
    expect(medSchedule.items[1].scheduledTimeLabel).toBe('7:00 PM');

    const mindful = computeDailyMindfulMoment(now);
    expect(mindful.category).toBe('DAILY MINDFUL MOMENT');
    expect(mindful.body.length).toBeGreaterThan(20);
  });

  test('10. Offline Banner & Drizzle Migration 0018 apply cleanly on SQLite', () => {
    expect(resolveIsOnlineFromNetInfo({ isConnected: true, isInternetReachable: true })).toBe(true);
    expect(resolveIsOnlineFromNetInfo({ isConnected: false, isInternetReachable: false })).toBe(false);
    expect(resolveIsOnlineFromNetInfo({ isConnected: true, isInternetReachable: false })).toBe(false);

    const offlineSrc = readAppFile('components/home/HomeOfflinePillBanner.tsx');
    expect(offlineSrc.includes('No network connection')).toBe(true);
    expect(offlineSrc.includes('OFFLINE')).toBe(true);

    // Apply all SQLite migrations through 0018 on an in-memory SQLite database
    const journal = JSON.parse(readAppFile('drizzle/meta/_journal.json')) as {
      entries: Array<{ tag: string }>;
    };
    const sqlite = new Database(':memory:');
    for (const entry of journal.entries) {
      const sql = readAppFile(`drizzle/${entry.tag}.sql`);
      const statements = sql.split('--> statement-breakpoint');
      for (const stmt of statements) {
        const trimmed = stmt.trim();
        if (trimmed) sqlite.run(trimmed);
      }
    }

    const homeCacheCols = sqlite
      .query('PRAGMA table_info(patient_home_cache)')
      .all()
      .map((r: any) => String(r.name));
    expect(homeCacheCols.includes('clinic_ez_id')).toBe(true);
    expect(homeCacheCols.includes('welcome_visited_steps_json')).toBe(true);
    expect(homeCacheCols.includes('checked_in_appointments_json')).toBe(true);

    const telemetryCols = sqlite
      .query('PRAGMA table_info(patient_vital_telemetry)')
      .all()
      .map((r: any) => String(r.name));
    expect(telemetryCols.includes('sleep_duration_minutes')).toBe(true);
    expect(telemetryCols.includes('deep_sleep_minutes')).toBe(true);
    expect(telemetryCols.includes('source')).toBe(true);

    const medLogCols = sqlite
      .query('PRAGMA table_info(patient_medication_logs)')
      .all()
      .map((r: any) => String(r.name));
    expect(medLogCols.includes('medication_id')).toBe(true);
    expect(medLogCols.includes('log_date')).toBe(true);
    expect(medLogCols.includes('taken_at')).toBe(true);
    sqlite.close();
  });
});

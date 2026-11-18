import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { iconNames } from '../components/ui/iconNames';
import {
  applyDoctorAffiliation,
  isDirectoryBookingPaused,
  practitionerProfileToDoctorDto,
  resolveDefaultAffiliation,
} from '../services/search/directorySearchService';

const APP_ROOT = join(import.meta.dir, '..');
const readAppFile = (rel: string): string =>
  readFileSync(join(APP_ROOT, rel), 'utf8').replace(/\r\n/g, '\n');

describe('Patient Appointment Booking Flow Replacement Suite', () => {
  test('1. Icon Registry: includes newly registered Lucide icons for booking flows', () => {
    expect(iconNames.includes('calendarX')).toBe(true);
    expect(iconNames.includes('video')).toBe(true);
    expect(iconNames.includes('helpCircle')).toBe(true);
    expect(iconNames.includes('sun')).toBe(true);
    expect(iconNames.includes('sunset')).toBe(true);
    expect(iconNames.includes('car')).toBe(true);
    expect(iconNames.includes('zap')).toBe(true);
    expect(iconNames.includes('shieldCheck')).toBe(true);

    const iconRegistrySrc = readAppFile('components/ui/iconRegistry.ts');
    expect(iconRegistrySrc.includes('calendarX:')).toBe(true);
    expect(iconRegistrySrc.includes('video:')).toBe(true);
    expect(iconRegistrySrc.includes('helpCircle:')).toBe(true);
    expect(iconRegistrySrc.includes('sun:')).toBe(true);
    expect(iconRegistrySrc.includes('sunset:')).toBe(true);
    expect(iconRegistrySrc.includes('car:')).toBe(true);
    expect(iconRegistrySrc.includes('zap:')).toBe(true);
    expect(iconRegistrySrc.includes('shieldCheck:')).toBe(true);
  });

  test('2. Step Indicator & Dedicated Seamless Chrome: renders 3 steps, seamless header, and sticky bottom CTA bar', () => {
    const indicatorSrc = readAppFile('components/booking/BookingStepIndicator.tsx');
    expect(indicatorSrc.includes("label: 'Doctor'")).toBe(true);
    expect(indicatorSrc.includes("label: 'Slot'")).toBe(true);
    expect(indicatorSrc.includes("label: 'Confirm'")).toBe(true);
    expect(indicatorSrc.includes('isDone')).toBe(true);
    expect(indicatorSrc.includes('isCurrent')).toBe(true);
    expect(indicatorSrc.includes('onSelectStep')).toBe(true);

    const headerSrc = readAppFile('components/booking/BookingSeamlessHeader.tsx');
    expect(headerSrc.includes('Book Appointment')).toBe(true);
    expect(headerSrc.includes('Done')).toBe(true);
    expect(headerSrc.includes('ClinicEzLogo')).toBe(true);
    expect(headerSrc.includes('HEADER_REVEAL_SCROLL_START')).toBe(true);
    expect(headerSrc.includes('onHelpPress = NO_OP')).toBe(true);

    const footerSrc = readAppFile('components/booking/BookingStickyFooter.tsx');
    expect(footerSrc.includes('SELECTED CONSULTATION')).toBe(true);
    expect(footerSrc.includes('Proceed to Choose Slot')).toBe(true);
    expect(footerSrc.includes('SELECTED APPOINTMENT SLOT')).toBe(true);
    expect(footerSrc.includes('Continue to Review &amp; Confirm')).toBe(true);
    expect(footerSrc.includes('Estimated Copay')).toBe(true);
    expect(footerSrc.includes('Confirm & Book')).toBe(true);
  });

  test('3. Step 1 (Doctor Selection): renders search with strict no-op filter button, checkCircle specialty pill, provider cards, and real facility card', () => {
    const doctorStepSrc = readAppFile('components/booking/BookingDoctorStep.tsx');
    expect(doctorStepSrc.includes('RECOMMENDED PROVIDERS')).toBe(true);
    expect(doctorStepSrc.includes('SELECTED FACILITY LOCATION')).toBe(true);
    expect(doctorStepSrc.includes('No-Hassle Rescheduling')).toBe(true);
    expect(doctorStepSrc.includes('name="checkCircle"')).toBe(true);
    expect(doctorStepSrc.includes('onFilterSlidersPress = NO_OP')).toBe(true);
    expect(doctorStepSrc.includes('onViewAllHubs')).toBe(true);
    expect(doctorStepSrc.includes('onViewClinicInfo')).toBe(true);
    expect(doctorStepSrc.includes('selectedClinic.openStatusLabel')).toBe(true);
  });

  test('4. Step 2 (Slot Selection): renders selected doctor header, in-person vs telehealth toggle, Today pill, 6-day calendar strip, time period counts, and arrival guarantee', () => {
    const slotStepSrc = readAppFile('components/booking/BookingSlotStep.tsx');
    expect(slotStepSrc.includes('In-Person Visit')).toBe(true);
    expect(slotStepSrc.includes('Telehealth Video')).toBe(true);
    expect(slotStepSrc.includes('Today')).toBe(true);
    expect(slotStepSrc.includes('Morning')).toBe(true);
    expect(slotStepSrc.includes('Afternoon')).toBe(true);
    expect(slotStepSrc.includes('Evening')).toBe(true);
    expect(slotStepSrc.includes('On-Time Clinic Arrival Guarantee')).toBe(true);
    expect(slotStepSrc.includes('s.available !== false')).toBe(true);
  });

  test('5. Step 3 (Review & Confirm): renders 15-minute live countdown timer, consultation mode, editable reason input, real cost breakdown, and guarantees', () => {
    const reviewStepSrc = readAppFile('components/booking/BookingReviewStep.tsx');
    expect(reviewStepSrc.includes('Slot reserved for')).toBe(true);
    expect(reviewStepSrc.includes('Time &amp; Consultation Mode')).toBe(true);
    expect(reviewStepSrc.includes('REASON FOR VISIT')).toBe(true);
    expect(reviewStepSrc.includes('onChangeReasonForVisit')).toBe(true);
    expect(reviewStepSrc.includes('Estimated Cost Breakdown')).toBe(true);
    expect(reviewStepSrc.includes('Total Patient Responsibility')).toBe(true);
    expect(reviewStepSrc.includes('Clinic EZ Guarantees')).toBe(true);
    expect(reviewStepSrc.includes('SMS &amp; Calendar reminders')).toBe(true);
    expect(reviewStepSrc.includes('setInterval')).toBe(true);
  });

  test('6. Step 4 (Confirmation): renders 3-ring success hero, reference code with copy action, 3-task pre-visit checklist, and navigation actions', () => {
    const confirmStepSrc = readAppFile('components/booking/BookingConfirmationStep.tsx');
    expect(confirmStepSrc.includes('STEP 3 OF 3 • COMPLETED')).toBe(true);
    expect(confirmStepSrc.includes('Appointment Confirmed!')).toBe(true);
    expect(confirmStepSrc.includes('Booking Ref')).toBe(true);
    expect(confirmStepSrc.includes('setStringAsync')).toBe(true);
    expect(confirmStepSrc.includes('Before Your Visit')).toBe(true);
    expect(confirmStepSrc.includes('View in My Appointments')).toBe(true);
    expect(confirmStepSrc.includes('Back to Home')).toBe(true);
  });

  test('7. Dedicated Screen Integration, Strict No-Ops & Zero Mock Data: configures full-screen presentation, wires backend, and purges fake clinical placeholders', () => {
    const webFrameSrc = readAppFile('components/layout/WebAppFrame.web.tsx');
    expect(webFrameSrc.includes("'BookingDraftScreen'")).toBe(true);
    expect(webFrameSrc.includes('{isWorkstation ? (')).toBe(true);
    expect(webFrameSrc.includes('DEDICATED_FULLSCREEN_SCREENS')).toBe(false);

    const mainStackSrc = readAppFile('navigation/navigators/MainStack.tsx');
    const bookingRouteSection = mainStackSrc.slice(
      mainStackSrc.indexOf('BookingDraftScreen:'),
      mainStackSrc.indexOf('AppointmentDetailScreen:'),
    );
    expect(bookingRouteSection.includes("presentation: 'formSheet'")).toBe(false);
    expect(bookingRouteSection.includes('headerShown: false')).toBe(true);

    const screenNativeSrc = readAppFile('navigation/screens/BookingDraft.screen.tsx');
    const screenWebSrc = readAppFile('navigation/screens/BookingDraft.screen.web.tsx');

    for (const src of [screenNativeSrc, screenWebSrc]) {
      expect(src.includes('<BookingSeamlessHeader')).toBe(true);
      expect(src.includes('<BookingStickyFooter')).toBe(true);
      expect(src.includes('<HomeOfflinePillBanner')).toBe(true);
      expect(src.includes('Animated.ScrollView')).toBe(true);
      expect(src.includes('getTokenRef')).toBe(true);
      expect(src.includes('hasLoadedCatalogRef')).toBe(true);
      expect(src.includes('queryDirectorySearchCatalog')).toBe(true);
      expect(src.includes('createBookingDraftOnline')).toBe(true);
      expect(src.includes('submitBookingDraftOnline')).toBe(true);
      expect(src.includes('saveBookingDraft')).toBe(true);
      expect(src.includes('onHelpPress={NO_OP}')).toBe(true);
      expect(src.includes('onFilterSlidersPress={NO_OP}')).toBe(true);
      expect(src.includes('AppointmentsTab')).toBe(false);
      expect(src.includes("'AppointmentsScreen'")).toBe(true);
      expect(src.includes("'HomeScreen'")).toBe(true);
      expect(src.includes("'ClinicDetailsScreen'")).toBe(true);
      expect(src.includes("'ExploreClinicsScreen'")).toBe(true);
      expect(src.includes('Booking Assistance')).toBe(false);
      expect(src.includes('Booking Notice')).toBe(false);
      expect(src.includes('Math.random()')).toBe(false);
    }

    // Keyboard avoidance & safe insets on native
    expect(screenNativeSrc.includes('useKeyboardVisible')).toBe(true);
    expect(screenNativeSrc.includes('isKeyboardVisible')).toBe(true);

    // Zero hardcoded booking mock data across screens & components
    const forbiddenBookingMocks = [
      'Blue Shield PPO',
      '450 Elm Blvd',
      'Medical District, Metro City',
      'Diagnostic 12-Lead ECG',
      '₱180.00',
      'EZ-84920',
      '128 reviews',
      'Health Parkway',
      'Clinic Suite',
      'Routine Cardiology Follow-up',
      'Ste 320',
      'Open Now • Walk-ins Welcome',
    ];
    const bookingFiles = [
      'navigation/screens/BookingDraft.screen.tsx',
      'navigation/screens/BookingDraft.screen.web.tsx',
      'components/booking/BookingSeamlessHeader.tsx',
      'components/booking/BookingStickyFooter.tsx',
      'components/booking/BookingStepIndicator.tsx',
      'components/booking/BookingDoctorStep.tsx',
      'components/booking/BookingSlotStep.tsx',
      'components/booking/BookingReviewStep.tsx',
      'components/booking/BookingConfirmationStep.tsx',
    ];
    for (const file of bookingFiles) {
      const content = readAppFile(file);
      for (const forbidden of forbiddenBookingMocks) {
        expect(content.includes(forbidden)).toBe(false);
      }
    }
  });

  test('8. Header & Routing: Appointments screens use seamless scroll-animated HomeHeader, exempt outer headers, and wire NotificationScreen/BookingDraftScreen', () => {
    const webFrameSrc = readAppFile('components/layout/WebAppFrame.web.tsx');
    expect(webFrameSrc.includes("headerInfo.tabKey !== 'AppointmentsScreen'")).toBe(true);
    expect(webFrameSrc.includes("'AppointmentDetailScreen'")).toBe(true);
    expect(webFrameSrc.includes("'BookingDraftScreen'")).toBe(true);

    const apptsStackSrc = readAppFile('navigation/navigators/AppointmentsStack.tsx');
    expect(apptsStackSrc.includes('headerShown: false')).toBe(true);

    const mainStackSrc = readAppFile('navigation/navigators/MainStack.tsx');
    expect(mainStackSrc.includes('AppointmentDetailScreen')).toBe(true);

    for (const screenPath of [
      'navigation/screens/Appointments.screen.tsx',
      'navigation/screens/Appointments.screen.web.tsx',
    ]) {
      const src = readAppFile(screenPath);
      expect(src.includes('<HomeHeader')).toBe(true);
      expect(src.includes('Animated.ScrollView')).toBe(true);
      expect(src.includes('Animated.event')).toBe(true);
      expect(src.includes('title="Appointments"')).toBe(true);
      expect(src.includes('subtitle="Scheduled visits across open network"')).toBe(true);
      expect(src.includes('alwaysShowTitle={false}')).toBe(true);
      expect(src.includes("navigateToMainRoute('NotificationScreen')")).toBe(true);
      expect(src.includes("navigateToMainRoute('NotificationsScreen')")).toBe(false);
      expect(src.includes("navigateToMainRoute('ProfileScreen')")).toBe(true);
      expect(src.includes("navigateToMainRoute('BookingDraftScreen')")).toBe(true);
      expect(src.includes('<HomeOfflinePillBanner isOnline={isOnline} />')).toBe(true);
    }
  });

  test('9. Button Wiring & Strict No-Ops: newly introduced buttons without screens stay no-ops and card buttons call stopPropagation', () => {
    const upcomingCardSrc = readAppFile('components/appointments/UpcomingAppointmentCard.tsx');
    expect(upcomingCardSrc.includes('onPrepGuidePress?: () => void')).toBe(true);
    expect(upcomingCardSrc.includes('stopPropagation?.()')).toBe(true);
    expect(upcomingCardSrc.includes('onPrepGuidePress?.()')).toBe(true);

    const pastCardSrc = readAppFile('components/appointments/PastAppointmentCard.tsx');
    expect(pastCardSrc.includes('stopPropagation?.()')).toBe(true);

    const emptyViewSrc = readAppFile('components/appointments/EmptyAppointmentsView.tsx');
    expect(emptyViewSrc.includes('onQuickConnectPress ?? (() => {})')).toBe(true);
    expect(emptyViewSrc.includes('service.onPress ?? (() => {})')).toBe(true);

    const filterBarSrc = readAppFile('components/appointments/AppointmentsFilterBar.tsx');
    expect(filterBarSrc.includes('onFilterSlidersPress ?? (() => {})')).toBe(true);

    for (const screenPath of [
      'navigation/screens/Appointments.screen.tsx',
      'navigation/screens/Appointments.screen.web.tsx',
    ]) {
      const src = readAppFile(screenPath);
      // Newly introduced Instant Connect button is a no-op
      expect(src.includes("buttonLabel: 'Instant Connect'")).toBe(true);
      expect(src.includes('onPress: () => {}')).toBe(true);
      // Prep Guide & Quick Connect are omitted (no-op) and Reschedule passes full params
      expect(src.includes('onPrepGuidePress')).toBe(false);
      expect(src.includes('onQuickConnectPress')).toBe(false);
      expect(src.includes('clinicId: item.clinic.id')).toBe(true);
      expect(src.includes('currentScheduledAt: item.scheduledAt')).toBe(true);
    }

    const detailSrc = readAppFile('navigation/screens/appointments/AppointmentDetail.screen.tsx');
    expect(detailSrc.includes('onTapEnlarge')).toBe(false);
    expect(detailSrc.includes('Share.share')).toBe(false);
    expect(detailSrc.includes("dialog.alert('Calendar'")).toBe(false);
    expect(detailSrc.includes('clinicPhone ? handleCallClinic : () => {}')).toBe(true);

    const passCardSrc = readAppFile('components/appointments/DigitalClinicPassCard.tsx');
    expect(passCardSrc.includes('onTapEnlarge ?? (() => {})')).toBe(true);
  });

  test('10. Zero Mock Data: purges hardcoded demo clinical strings across all appointment screens and components', () => {
    const forbiddenMocks = [
      'Fellow ACC',
      'BlueCross BlueShield',
      'Lisinopril',
      'Room 304',
      'Bay Terminal',
      '0281234567',
      '128 verified reviews',
      'Garage B',
      '$25.00',
      'Medical Arts Wing',
      '1.2 miles away',
      'Deductible Met',
      'Ready at 10:15 AM',
    ];

    const filesToSweep = [
      'navigation/screens/Appointments.screen.tsx',
      'navigation/screens/Appointments.screen.web.tsx',
      'navigation/screens/appointments/AppointmentDetail.screen.tsx',
      'components/appointments/UpcomingAppointmentCard.tsx',
      'components/appointments/PastAppointmentCard.tsx',
      'components/appointments/EmptyAppointmentsView.tsx',
      'components/appointments/DigitalClinicPassCard.tsx',
    ];

    for (const file of filesToSweep) {
      const content = readAppFile(file);
      for (const forbidden of forbiddenMocks) {
        expect(content.includes(forbidden)).toBe(false);
      }
    }
  });

  test('11. Multi-Clinic Affiliations, Provider Attribution (providerId/providerName), and Booking Paused Blocking', () => {
    const bookingApiSrc = readAppFile('services/api/bookingApi.ts');
    const discoverySrc = readAppFile('services/discovery/discoveryService.ts');
    expect(bookingApiSrc.includes('providerId?: string | null')).toBe(true);
    expect(bookingApiSrc.includes('providerName?: string | null')).toBe(true);
    expect(discoverySrc.includes('providerId?: string | null')).toBe(true);
    expect(discoverySrc.includes('providerName?: string | null')).toBe(true);

    for (const screenPath of [
      'navigation/screens/BookingDraft.screen.tsx',
      'navigation/screens/BookingDraft.screen.web.tsx',
    ]) {
      const src = readAppFile(screenPath);
      expect(src.includes('providerId: selectedDoctor.id')).toBe(true);
      expect(src.includes('providerName: selectedDoctor.name')).toBe(true);
      expect(src.includes('if (isBookingPaused)')).toBe(true);
      expect(src.includes('onSelectClinic')).toBe(true);
    }

    const doctorStepSrc = readAppFile('components/booking/BookingDoctorStep.tsx');
    const slotStepSrc = readAppFile('components/booking/BookingSlotStep.tsx');
    const reviewStepSrc = readAppFile('components/booking/BookingReviewStep.tsx');
    const footerSrc = readAppFile('components/booking/BookingStickyFooter.tsx');
    expect(doctorStepSrc.includes('Booking Paused')).toBe(true);
    expect(doctorStepSrc.includes('Clinic locations')).toBe(true);
    expect(slotStepSrc.includes('Booking Paused')).toBe(true);
    expect(slotStepSrc.includes('disabled={isBookingPaused}')).toBe(true);
    expect(reviewStepSrc.includes('Booking Paused')).toBe(true);
    expect(footerSrc.includes('Booking Paused')).toBe(true);
    expect(footerSrc.includes('disabled={isSubmitting || bookingPaused}')).toBe(true);

    const multiClinicDoctor = practitionerProfileToDoctorDto({
      id: 'prac-1',
      practitionerId: 'prac-1',
      name: 'Dr. Maria Santos',
      firstName: 'Maria',
      lastName: 'Santos',
      role: 'Doctor',
      primarySpecialty: 'Internal Medicine',
      bio: null,
      avatarUrl: null,
      displayPrcLicenseNo: '0012345',
      prcExpiryDate: null,
      verificationLevel: 'Verified',
      isVerified: true,
      verifiedAtUtc: null,
      affiliations: [
        {
          clinicId: 'clinic-paused',
          clinicName: 'Paused Satellite Clinic',
          clinicAddress: '1 Paused Ave',
          supportsAppointments: false,
          localSpecialty: 'General Medicine',
          nextAvailableAt: null,
          nextAvailableLabel: 'Booking Paused',
          availabilities: [],
          providerId: 'prov-paused',
        },
        {
          clinicId: 'clinic-open',
          clinicName: 'Active Heart Center',
          clinicAddress: '2 Open Blvd',
          supportsAppointments: true,
          localSpecialty: 'Cardiology',
          nextAvailableAt: '2026-11-19T09:00:00.000Z',
          nextAvailableLabel: 'Tomorrow, 9:00 AM',
          availabilities: [{ dayOfWeek: 'Thursday', startTime: '09:00', endTime: '17:00' }],
          providerId: 'prov-open',
        },
      ],
    });
    expect(multiClinicDoctor).not.toBeNull();

    // Default affiliation prefers bookable clinic
    const defaultAff = resolveDefaultAffiliation(multiClinicDoctor!);
    expect(defaultAff?.clinicId).toBe('clinic-open');
    expect(defaultAff?.providerId).toBe('prov-open');
    const activeDoc = applyDoctorAffiliation(multiClinicDoctor!, defaultAff);
    expect(activeDoc.id).toBe('prov-open');
    expect(activeDoc.specialty).toBe('Cardiology');
    expect(isDirectoryBookingPaused(activeDoc, null)).toBe(false);

    // Selecting paused affiliation blocks booking
    const pausedAff = resolveDefaultAffiliation(multiClinicDoctor!, 'clinic-paused');
    const pausedDoc = applyDoctorAffiliation(multiClinicDoctor!, pausedAff);
    expect(pausedDoc.id).toBe('prov-paused');
    expect(pausedDoc.clinicSupportsAppointments).toBe(false);
    expect(isDirectoryBookingPaused(pausedDoc, null)).toBe(true);
  });
});

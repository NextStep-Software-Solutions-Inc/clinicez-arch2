import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { iconNames } from '../components/ui/iconNames';

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

  test('2. Step Indicator: renders 3 steps with proper active and completed states', () => {
    const indicatorSrc = readAppFile('components/booking/BookingStepIndicator.tsx');
    expect(indicatorSrc.includes("label: 'Doctor'")).toBe(true);
    expect(indicatorSrc.includes("label: 'Slot'")).toBe(true);
    expect(indicatorSrc.includes("label: 'Confirm'")).toBe(true);
    expect(indicatorSrc.includes('isDone')).toBe(true);
    expect(indicatorSrc.includes('isCurrent')).toBe(true);
  });

  test('3. Step 1 (Doctor Selection): renders search, specialty filter chips, provider cards, facility card, and bottom consultation bar', () => {
    const doctorStepSrc = readAppFile('components/booking/BookingDoctorStep.tsx');
    expect(doctorStepSrc.includes('RECOMMENDED PROVIDERS')).toBe(true);
    expect(doctorStepSrc.includes('SELECTED FACILITY LOCATION')).toBe(true);
    expect(doctorStepSrc.includes('No-Hassle Rescheduling')).toBe(true);
    expect(doctorStepSrc.includes('Proceed to Choose Slot')).toBe(true);
    expect(doctorStepSrc.includes('ADA')).toBe(true);
    expect(doctorStepSrc.includes('Garage')).toBe(true);
  });

  test('4. Step 2 (Slot Selection): renders selected doctor header, in-person vs telehealth toggle, horizontal calendar strip, time period filters, and arrival guarantee', () => {
    const slotStepSrc = readAppFile('components/booking/BookingSlotStep.tsx');
    expect(slotStepSrc.includes('In-Person Visit')).toBe(true);
    expect(slotStepSrc.includes('Telehealth Video')).toBe(true);
    expect(slotStepSrc.includes('Morning')).toBe(true);
    expect(slotStepSrc.includes('Afternoon')).toBe(true);
    expect(slotStepSrc.includes('Evening')).toBe(true);
    expect(slotStepSrc.includes('On-Time Clinic Arrival Guarantee')).toBe(true);
    expect(slotStepSrc.includes('Continue to Review & Confirm')).toBe(true);
  });

  test('5. Step 3 (Review & Confirm): renders 15-minute live countdown timer, consultation mode, estimated cost breakdown, guarantees, and confirm button', () => {
    const reviewStepSrc = readAppFile('components/booking/BookingReviewStep.tsx');
    expect(reviewStepSrc.includes('Slot reserved for')).toBe(true);
    expect(reviewStepSrc.includes('Time & Consultation Mode')).toBe(true);
    expect(reviewStepSrc.includes('Estimated Cost Breakdown')).toBe(true);
    expect(reviewStepSrc.includes('Total Patient Responsibility')).toBe(true);
    expect(reviewStepSrc.includes('Clinic EZ Guarantees')).toBe(true);
    expect(reviewStepSrc.includes('SMS & Calendar reminders')).toBe(true);
    expect(reviewStepSrc.includes('Confirm & Book')).toBe(true);
    expect(reviewStepSrc.includes('setInterval')).toBe(true);
  });

  test('6. Step 4 (Confirmation): renders brand header, success hero checkmark, reference code with copy action, 3-task pre-visit checklist, and navigation actions', () => {
    const confirmStepSrc = readAppFile('components/booking/BookingConfirmationStep.tsx');
    expect(confirmStepSrc.includes('Appointment Confirmed!')).toBe(true);
    expect(confirmStepSrc.includes('Booking Reference')).toBe(true);
    expect(confirmStepSrc.includes('setStringAsync')).toBe(true);
    expect(confirmStepSrc.includes('Before Your Visit')).toBe(true);
    expect(confirmStepSrc.includes('View in My Appointments')).toBe(true);
    expect(confirmStepSrc.includes('Back to Home')).toBe(true);
  });

  test('7. Screen Integration: both native and web screens wire to patient-api without mock data and respect keyboard and safe area handling', () => {
    const screenNativeSrc = readAppFile('navigation/screens/BookingDraft.screen.tsx');
    const screenWebSrc = readAppFile('navigation/screens/BookingDraft.screen.web.tsx');

    // Wired to backend services
    expect(screenNativeSrc.includes('queryPatientSearchCatalog')).toBe(true);
    expect(screenNativeSrc.includes('createBookingDraftOnline')).toBe(true);
    expect(screenNativeSrc.includes('submitBookingDraftOnline')).toBe(true);
    expect(screenNativeSrc.includes('saveBookingDraft')).toBe(true);

    expect(screenWebSrc.includes('queryPatientSearchCatalog')).toBe(true);
    expect(screenWebSrc.includes('createBookingDraftOnline')).toBe(true);
    expect(screenWebSrc.includes('submitBookingDraftOnline')).toBe(true);
    expect(screenWebSrc.includes('saveBookingDraft')).toBe(true);

    // Keyboard avoidance & safe insets
    expect(screenNativeSrc.includes('useKeyboardVisible')).toBe(true);
    expect(screenNativeSrc.includes('isKeyboardVisible')).toBe(true);
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
});

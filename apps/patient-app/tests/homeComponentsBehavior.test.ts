import { describe, expect, test } from 'bun:test';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const APP_ROOT = join(import.meta.dir, '..');
const readComp = (rel: string): string => readFileSync(join(APP_ROOT, 'components/home', rel), 'utf8');

describe('Home Components Deep Behavioral & Prop Contract Suite', () => {
  describe('index.ts barrel exports', () => {
    test('exports all components and type interfaces', () => {
      const src = readComp('index.ts');
      expect(src).toContain('HeaderScrollTitle');
      expect(src).toContain('HeaderScrollTitleProps');
      expect(src).toContain('HealthPassCard');
      expect(src).toContain('HealthPassCardProps');
      expect(src).toContain('HealthPassQrModal');
      expect(src).toContain('HealthPassQrModalProps');
      expect(src).toContain('WelcomeOnboardingCard');
      expect(src).toContain('WelcomeOnboardingCardProps');
      expect(src).toContain('QuickActionsGrid');
      expect(src).toContain('QuickActionsGridProps');
      expect(src).toContain('AppointmentsSection');
      expect(src).toContain('AppointmentsSectionProps');
      expect(src).toContain('DisplayAppointment');
      expect(src).toContain('VitalsBentoGrid');
      expect(src).toContain('VitalsBentoGridProps');
      expect(src).toContain('VitalsData');
      expect(src).toContain('MedicationsSchedule');
      expect(src).toContain('MedicationsScheduleProps');
      expect(src).toContain('MedicationScheduleItem');
      expect(src).toContain('SearchResultsView');
      expect(src).toContain('SearchResultsViewProps');
      expect(src).toContain('SearchFilterType');
      expect(src).toContain('SearchDoctorItem');
      expect(src).toContain('SearchPackageItem');
      expect(src).toContain('DailyMindfulMoment');
      expect(src).toContain('DailyMindfulMomentProps');
    });
  });

  describe('HeaderScrollTitle.tsx', () => {
    test('implements exact 0 to 48px scroll range for opacity and translateY', () => {
      const src = readComp('HeaderScrollTitle.tsx');
      expect(src).toContain('inputRange: [0, 48]');
      expect(src).toContain('outputRange: [0, 1]');
      expect(src).toContain('outputRange: [6, 0]');
      expect(src).toContain("extrapolate: 'clamp'");
      expect(src).toContain('accessibilityRole="header"');
    });
  });

  describe('HealthPassCard.tsx & HealthPassQrModal.tsx', () => {
    test('HealthPassCard renders gradient, verified badge, and tap terminal NFC prompt', () => {
      const src = readComp('HealthPassCard.tsx');
      expect(src).toContain('LinearGradient');
      expect(src).toContain('CLINIC EZ • HEALTH PASS');
      expect(src).toContain('Tap terminal or present barcode');
      expect(src).toContain('View Card');
      expect(src).toContain('accessibilityLabel="View Health Pass Card"');
    });

    test('HealthPassQrModal implements dismissal, brightness note, and security pill', () => {
      const src = readComp('HealthPassQrModal.tsx');
      expect(src).toContain('VERIFIED HEALTH PASS');
      expect(src).toContain('CLINIC-EZ-VERIFIED');
      expect(src).toContain('Screen brightness automatically optimized');
      expect(src).toContain('Done / Tap to Dismiss');
      expect(src).toContain('accessibilityLabel="Close enlarged QR code"');
    });
  });

  describe('WelcomeOnboardingCard.tsx', () => {
    test('implements 3-step getting started checklist for State 1 First Login', () => {
      const src = readComp('WelcomeOnboardingCard.tsx');
      expect(src).toContain('Welcome to Clinic EZ');
      expect(src).toContain('Step 1 of 3');
      expect(src).toContain('Complete health profile');
      expect(src).toContain('Link health insurance & benefits');
      expect(src).toContain('Find and bookmark primary clinic');
      expect(src).toContain('onCompleteProfile');
      expect(src).toContain('onLinkInsurance');
      expect(src).toContain('onFindClinic');
    });
  });

  describe('AppointmentsSection.tsx', () => {
    test('handles State 1 (First Login) zero-data consultation prompt', () => {
      const src = readComp('AppointmentsSection.tsx');
      expect(src).toContain('Book Your First Consultation');
      expect(src).toContain("No appointments yet • Let's get you set up with your first visit at any network clinic or tele-health doctor.");
      expect(src).toContain('Book First Appointment');
      expect(src).toContain('Find Clinics Nearby');
    });

    test('handles State 2 (No Appointments) with View Visit History CTA', () => {
      const src = readComp('AppointmentsSection.tsx');
      expect(src).toContain('No Upcoming Consultations');
      expect(src).toContain("You don't have any appointments scheduled across network clinics.");
      expect(src).toContain('Book an Appointment');
      expect(src).toContain('View Visit History');
      expect(src).toContain('onViewHistory');
    });

    test('handles State 3 (Multiple Appointments) snap carousel with doctor portrait & suite', () => {
      const src = readComp('AppointmentsSection.tsx');
      expect(src).toContain('snapToInterval={carouselCardWidth + spacing.md}');
      expect(src).toContain('snapToAlignment="start"');
      expect(src).toContain('decelerationRate="fast"');
      expect(src).toContain('clinicSuite');
      expect(src).toContain('doctorAvatarUrl');
      expect(src).toContain('Check in');
      expect(src).toContain('Manage Visit');
      expect(src).toContain('Directions');
    });
  });

  describe('VitalsBentoGrid.tsx', () => {
    test('renders 2x2 Bento grid with SVG curves and Apple Health connect banner', () => {
      const src = readComp('VitalsBentoGrid.tsx');
      expect(src).toContain('Recent Vitals');
      expect(src).toContain('Heart Rate');
      expect(src).toContain('Blood Pressure');
      expect(src).toContain('Blood Glucose');
      expect(src).toContain('Sleep Total');
      expect(src).toContain('Sync Apple Health or Log Manually');
      expect(src).toContain('react-native-svg');
      expect(src).toContain('M0,14 L12,12 L22,16 L32,8 L42,11 L56,4');
      expect(src).toContain('M0,10 L14,14 L28,8 L40,11 L56,9');
      expect(src).toContain('sleepBars');
      expect(src).toContain('colors.purpleBg');
      expect(src).not.toContain('colors.purpleLight');
    });
  });

  describe('MedicationsSchedule.tsx', () => {
    test('renders Today schedule with Log Now adherence and scheduledTime', () => {
      const src = readComp('MedicationsSchedule.tsx');
      expect(src).toContain("Today's Schedule");
      expect(src).toContain('No active medications scheduled');
      expect(src).toContain('+ Add Medication');
      expect(src).toContain('Log Now');
      expect(src).toContain('Taken');
      expect(src).toContain('onToggleAdherence');
      expect(src).toContain('scheduledTime');
    });
  });

  describe('SearchResultsView.tsx', () => {
    test('implements Stitch Screen 4 filter chips and categorized sections', () => {
      const src = readComp('SearchResultsView.tsx');
      expect(src).toContain('All (');
      expect(src).toContain('Doctors (');
      expect(src).toContain('Clinics (');
      expect(src).toContain('Services (');
      expect(src).toContain('Available Today');
      expect(src).toContain('Doctors & Specialists');
      expect(src).toContain('Clinics & Care Centers');
      expect(src).toContain('Specialized Care Packages');
      expect(src).toContain('Book Visit');
      expect(src).toContain('View Clinic');
      expect(src).toContain('Schedule');
      expect(src).toContain('No Results Found');
      expect(src).toContain('onClearSearch');
    });
  });

  describe('DailyMindfulMoment.tsx & QuickActionsGrid.tsx', () => {
    test('DailyMindfulMoment displays wellness hydration tip', () => {
      const src = readComp('DailyMindfulMoment.tsx');
      expect(src).toContain('DAILY MINDFUL MOMENT');
      expect(src).toContain('Hydration check');
    });

    test('QuickActionsGrid displays 4-column self-service care actions', () => {
      const src = readComp('QuickActionsGrid.tsx');
      expect(src).toContain('Reach Dr.');
      expect(src).toContain('Services');
      expect(src).toContain('Records');
      expect(src).toContain('Prescriptions');
    });
  });
});

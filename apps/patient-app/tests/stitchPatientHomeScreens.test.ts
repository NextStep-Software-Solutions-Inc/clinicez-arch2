import { describe, expect, test } from 'bun:test';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const APP_ROOT = join(import.meta.dir, '..');
const readApp = (rel: string): string => readFileSync(join(APP_ROOT, rel), 'utf8');

describe('Google Stitch - Patient App Home Screens Implementation Suite', () => {
  describe('Modular Home Components Suite (apps/patient-app/components/home/)', () => {
    test('all modular components exist and are exported from index.ts', () => {
      expect(existsSync(join(APP_ROOT, 'components/home/HeaderScrollTitle.tsx'))).toBe(true);
      expect(existsSync(join(APP_ROOT, 'components/home/HealthPassCard.tsx'))).toBe(true);
      expect(existsSync(join(APP_ROOT, 'components/home/HealthPassQrModal.tsx'))).toBe(true);
      expect(existsSync(join(APP_ROOT, 'components/home/WelcomeOnboardingCard.tsx'))).toBe(true);
      expect(existsSync(join(APP_ROOT, 'components/home/QuickActionsGrid.tsx'))).toBe(true);
      expect(existsSync(join(APP_ROOT, 'components/home/AppointmentsSection.tsx'))).toBe(true);
      expect(existsSync(join(APP_ROOT, 'components/home/VitalsBentoGrid.tsx'))).toBe(true);
      expect(existsSync(join(APP_ROOT, 'components/home/MedicationsSchedule.tsx'))).toBe(true);
      expect(existsSync(join(APP_ROOT, 'components/home/SearchResultsView.tsx'))).toBe(true);
      expect(existsSync(join(APP_ROOT, 'components/home/DailyMindfulMoment.tsx'))).toBe(true);
      expect(existsSync(join(APP_ROOT, 'components/home/HomeOfflinePill.tsx'))).toBe(true);
      expect(existsSync(join(APP_ROOT, 'components/home/index.ts'))).toBe(true);
    });

    test('HeaderScrollTitle implements initial hidden state and scroll animation interpolation', () => {
      const src = readApp('components/home/HeaderScrollTitle.tsx');
      expect(src.includes('inputRange: [0, 48]')).toBe(true);
      expect(src.includes('outputRange: [0, 1]')).toBe(true);
      expect(src.includes('outputRange: [6, 0]')).toBe(true);
      expect(src.includes('Animated.View')).toBe(true);
      expect(src.includes('Clinic EZ')).toBe(true);
      expect(src.includes('Open Health Network')).toBe(true);
    });

    test('HealthPassCard implements verified digital health pass gradient and NFC prompt', () => {
      const src = readApp('components/home/HealthPassCard.tsx');
      expect(src.includes('LinearGradient')).toBe(true);
      expect(src.includes('CLINIC EZ • HEALTH PASS')).toBe(true);
      expect(src.includes('Tap terminal or present barcode')).toBe(true);
      expect(src.includes('View Card')).toBe(true);
    });

    test('HealthPassQrModal implements verified enlarged QR dialog', () => {
      const src = readApp('components/home/HealthPassQrModal.tsx');
      expect(src.includes('VERIFIED HEALTH PASS')).toBe(true);
      expect(src.includes('CLINIC-EZ-VERIFIED')).toBe(true);
      expect(src.includes('Screen brightness automatically optimized')).toBe(true);
      expect(src.includes('Done / Tap to Dismiss')).toBe(true);
    });

    test('WelcomeOnboardingCard implements State 1 3-step getting started guidance', () => {
      const src = readApp('components/home/WelcomeOnboardingCard.tsx');
      expect(src.includes('Welcome to Clinic EZ')).toBe(true);
      expect(src.includes('Step 1 of 3')).toBe(true);
      expect(src.includes('Complete health profile')).toBe(true);
      expect(src.includes('Link health insurance & benefits')).toBe(true);
      expect(src.includes('Find and bookmark primary clinic')).toBe(true);
    });

    test('QuickActionsGrid implements 4-column self-service care tiles', () => {
      const src = readApp('components/home/QuickActionsGrid.tsx');
      expect(src.includes('Quick Actions')).toBe(true);
      expect(src.includes('Self-Service')).toBe(true);
      expect(src.includes('Reach Dr.')).toBe(true);
      expect(src.includes('Services')).toBe(true);
      expect(src.includes('Records')).toBe(true);
      expect(src.includes('Prescriptions')).toBe(true);
    });

    test('AppointmentsSection handles State 1 zero-data, State 2 empty, and State 3 carousel', () => {
      const src = readApp('components/home/AppointmentsSection.tsx');
      expect(src.includes('Book Your First Consultation')).toBe(true);
      expect(src.includes('Book First Appointment')).toBe(true);
      expect(src.includes('No Upcoming Consultations')).toBe(true);
      expect(src.includes('Book an Appointment')).toBe(true);
      expect(src.includes('Check in')).toBe(true);
      expect(src.includes('Directions')).toBe(true);
      expect(src.includes('appointmentCarouselCard')).toBe(true);
    });

    test('VitalsBentoGrid implements 2x2 telemetry grid with zero-data and populated states', () => {
      const src = readApp('components/home/VitalsBentoGrid.tsx');
      expect(src.includes('Recent Vitals')).toBe(true);
      expect(src.includes('Heart Rate')).toBe(true);
      expect(src.includes('Blood Pressure')).toBe(true);
      expect(src.includes('Blood Glucose')).toBe(true);
      expect(src.includes('Sync Apple Health or Log Manually')).toBe(true);
    });

    test('MedicationsSchedule implements today schedule, zero-data, and Log Now adherence', () => {
      const src = readApp('components/home/MedicationsSchedule.tsx');
      expect(src.includes("Today's Schedule")).toBe(true);
      expect(src.includes('No active medications scheduled')).toBe(true);
      expect(src.includes('+ Add Medication')).toBe(true);
      expect(src.includes('Log Now')).toBe(true);
      expect(src.includes('Taken')).toBe(true);
    });

    test('SearchResultsView implements State 4 search filters, doctors, clinics, and packages', () => {
      const src = readApp('components/home/SearchResultsView.tsx');
      expect(src.includes('Doctors & Specialists')).toBe(true);
      expect(src.includes('Clinics & Care Centers')).toBe(true);
      expect(src.includes('Specialized Care Packages')).toBe(true);
      expect(src.includes('Available Today')).toBe(true);
      expect(src.includes('Book Visit')).toBe(true);
      expect(src.includes('View Clinic')).toBe(true);
      expect(src.includes('Schedule')).toBe(true);
    });
  });

  describe('Mobile Home Screen (Home.screen.tsx)', () => {
    const source = readApp('navigation/screens/Home.screen.tsx');

    test('file exists and exports default HomeScreen component', () => {
      expect(existsSync(join(APP_ROOT, 'navigation/screens/Home.screen.tsx'))).toBe(true);
      expect(source.includes('export default function HomeScreen')).toBe(true);
    });

    test('implements header scroll animation with HeaderScrollTitle and scrollY tracker', () => {
      expect(source.includes('HeaderScrollTitle')).toBe(true);
      expect(source.includes('scrollY')).toBe(true);
      expect(source.includes('onScroll={Animated.event')).toBe(true);
      expect(source.includes('ClinicEzLogo')).toBe(true);
      expect(source.includes('showWordmark={false}')).toBe(true);
      expect(source.includes('unreadCount')).toBe(true);
      expect(source.includes('patientInitials')).toBe(true);
    });

    test('implements interactive care search input and State 4 toggle', () => {
      expect(source.includes('searchQuery')).toBe(true);
      expect(source.includes('setSearchQuery')).toBe(true);
      expect(source.includes('isSearchActive')).toBe(true);
      expect(source.includes('SearchResultsView')).toBe(true);
      expect(source.includes('Search medical records, doctors, and tests...')).toBe(true);
    });

    test('implements State 1 First Login detection and onboarding checklist', () => {
      expect(source.includes('isFirstLogin')).toBe(true);
      expect(source.includes('WelcomeOnboardingCard')).toBe(true);
    });

    test('wires live backend APIs without hardcoded mock doctor fallbacks', () => {
      expect(source.includes('getPatientVitals')).toBe(true);
      expect(source.includes('getPatientMedications')).toBe(true);
      expect(source.includes('logPatientMedication')).toBe(true);
      expect(source.includes('fetchAppointments')).toBe(true);
      expect(source.includes('listClinics')).toBe(true);

      // Verify no hardcoded mock doctor fallbacks
      expect(source.includes('Dr. Evelyn Reed')).toBe(false);
      expect(source.includes('Dr. David Chen')).toBe(false);
    });

    test('does NOT render Yakap promo or active cards on the Stitch home screen', () => {
      expect(source.includes('YakapActiveCard')).toBe(false);
      expect(source.includes('YakapPromoCard')).toBe(false);
      expect(source.includes('HomeOfflinePill')).toBe(true);
      expect(source.includes('DailyMindfulMoment')).toBe(true);
    });
  });

  describe('Responsive Web Home Screen (Home.screen.web.tsx)', () => {
    const source = readApp('navigation/screens/Home.screen.web.tsx');

    test('file exists and exports default HomeScreenWeb component', () => {
      expect(existsSync(join(APP_ROOT, 'navigation/screens/Home.screen.web.tsx'))).toBe(true);
      expect(source.includes('export default function HomeScreenWeb')).toBe(true);
    });

    test('implements responsive breakpoint layouts (desktop 2-column workstation rail vs mobile column)', () => {
      expect(source.includes('useBreakpoint')).toBe(true);
      expect(source.includes('isDesktop')).toBe(true);
      expect(source.includes('desktopColumns')).toBe(true);
      expect(source.includes('mainColDesktop')).toBe(true);
      expect(source.includes('rightColDesktop')).toBe(true);
    });

    test('implements full suite of Stitch components on web with zero mock fallbacks', () => {
      expect(source.includes('HeaderScrollTitle')).toBe(true);
      expect(source.includes('HealthPassCard')).toBe(true);
      expect(source.includes('HealthPassQrModal')).toBe(true);
      expect(source.includes('QuickActionsGrid')).toBe(true);
      expect(source.includes('AppointmentsSection')).toBe(true);
      expect(source.includes('VitalsBentoGrid')).toBe(true);
      expect(source.includes('MedicationsSchedule')).toBe(true);
      expect(source.includes('SearchResultsView')).toBe(true);
      expect(source.includes('DailyMindfulMoment')).toBe(true);
      expect(source.includes('HomeOfflinePill')).toBe(true);
      expect(source.includes('YakapActiveCard')).toBe(false);
      expect(source.includes('YakapPromoCard')).toBe(false);

      // Verify no hardcoded mock doctor fallbacks
      expect(source.includes('Dr. Evelyn Reed')).toBe(false);
      expect(source.includes('Dr. David Chen')).toBe(false);
    });
  });

  describe('Strict Design System Token Compliance', () => {
    test('all screens and components do not contain forbidden hardcoded hex colors or raw numeric font sizes in styles', () => {
      const filesToTest = [
        'navigation/screens/Home.screen.tsx',
        'navigation/screens/Home.screen.web.tsx',
        'components/home/HeaderScrollTitle.tsx',
        'components/home/HealthPassCard.tsx',
        'components/home/HealthPassQrModal.tsx',
        'components/home/WelcomeOnboardingCard.tsx',
        'components/home/QuickActionsGrid.tsx',
        'components/home/AppointmentsSection.tsx',
        'components/home/VitalsBentoGrid.tsx',
        'components/home/MedicationsSchedule.tsx',
        'components/home/SearchResultsView.tsx',
        'components/home/DailyMindfulMoment.tsx',
        'components/home/HomeOfflinePill.tsx',
      ];

      const strip = (s: string) =>
        s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

      for (const rel of filesToTest) {
        const raw = readApp(rel);
        const clean = strip(raw);

        // Verify no hex color literals
        const hexRegex = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g;
        const hexMatches = clean.match(hexRegex);
        expect(hexMatches).toBeNull();

        // Verify no raw numeric fontSize in StyleSheet
        const fontSizeRegex = /\bfontSize:\s*\d+/g;
        const fontMatches = clean.match(fontSizeRegex);
        expect(fontMatches).toBeNull();
      }
    });
  });
});

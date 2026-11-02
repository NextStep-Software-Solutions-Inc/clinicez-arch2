import { describe, expect, test } from 'bun:test';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const APP_ROOT = join(import.meta.dir, '..');
const readApp = (rel: string): string => readFileSync(join(APP_ROOT, rel), 'utf8');

describe('Google Stitch - Patient App Home Screens Implementation Suite', () => {
  describe('Mobile Home Screen (Home.screen.tsx)', () => {
    const source = readApp('navigation/screens/Home.screen.tsx');

    test('file exists and exports default HomeScreen component', () => {
      expect(existsSync(join(APP_ROOT, 'navigation/screens/Home.screen.tsx'))).toBe(true);
      expect(source.includes('export default function HomeScreen')).toBe(true);
    });

    test('implements seamless dynamic header with ClinicEzLogo, unread notifications, and avatar', () => {
      expect(source.includes('ClinicEzLogo')).toBe(true);
      expect(source.includes('subtitle="Open Health Network"')).toBe(true);
      expect(source.includes('useNotificationContext')).toBe(true);
      expect(source.includes('unreadCount')).toBe(true);
      expect(source.includes('patientInitials')).toBe(true);
      expect(source.includes('isScrolled')).toBe(true);
      expect(source.includes('onScroll={handleScroll}')).toBe(true);
    });

    test('implements interactive care and symptoms search bar', () => {
      expect(source.includes('searchQuery')).toBe(true);
      expect(source.includes('setSearchQuery')).toBe(true);
      expect(source.includes('Search medical records, doctors, and tests...')).toBe(true);
      expect(source.includes('ExploreClinicsScreen')).toBe(true);
    });

    test('implements verified PulseCare / ClinicEZ digital health pass card', () => {
      expect(source.includes('LinearGradient')).toBe(true);
      expect(source.includes('CLINIC EZ • HEALTH PASS')).toBe(true);
      expect(source.includes('patientFullName')).toBe(true);
      expect(source.includes('patientIdCode')).toBe(true);
      expect(source.includes('Blood Group: A+')).toBe(true);
      expect(source.includes('Tap terminal or present barcode')).toBe(true);
      expect(source.includes('View Card')).toBe(true);
    });

    test('implements enlarged Health Pass QR code modal with dismissibility', () => {
      expect(source.includes('showQrModal')).toBe(true);
      expect(source.includes('setShowQrModal')).toBe(true);
      expect(source.includes('VERIFIED HEALTH PASS')).toBe(true);
      expect(source.includes('CLINIC-EZ-VERIFIED')).toBe(true);
      expect(source.includes('Screen brightness automatically optimized')).toBe(true);
      expect(source.includes('Done / Tap to Dismiss')).toBe(true);
    });

    test('implements 4-column quick care actions grid with correct navigation links', () => {
      expect(source.includes('Reach Dr.')).toBe(true);
      expect(source.includes('MessagesInboxScreen')).toBe(true);
      expect(source.includes('Services')).toBe(true);
      expect(source.includes('ExploreClinicsScreen')).toBe(true);
      expect(source.includes('Records')).toBe(true);
      expect(source.includes('RecordsScreen')).toBe(true);
      expect(source.includes('Prescriptions')).toBe(true);
      expect(source.includes('PrescriptionsScreen')).toBe(true);
    });

    test('implements appointments multi-card carousel and empty state', () => {
      expect(source.includes('Appointments')).toBe(true);
      expect(source.includes('View All')).toBe(true);
      expect(source.includes('displayAppointments')).toBe(true);
      expect(source.includes('Check in')).toBe(true);
      expect(source.includes('Directions')).toBe(true);
      expect(source.includes('No Upcoming Consultations')).toBe(true);
      expect(source.includes('Book an Appointment')).toBe(true);
    });

    test('implements 2x2 Bento telemetry grid for recent vitals', () => {
      expect(source.includes('Recent Vitals')).toBe(true);
      expect(source.includes('Apple Health • Updated recently')).toBe(true);
      expect(source.includes('VitalSignsScreen')).toBe(true);
      expect(source.includes('Heart Rate')).toBe(true);
      expect(source.includes('Blood Pressure')).toBe(true);
      expect(source.includes('Blood Glucose')).toBe(true);
      expect(source.includes('Sleep Duration')).toBe(true);
    });

    test('implements interactive today schedule and medication tracker', () => {
      expect(source.includes("Today's Schedule")).toBe(true);
      expect(source.includes('Lisinopril')).toBe(true);
      expect(source.includes('Omega-3 DHA')).toBe(true);
      expect(source.includes('handleToggleMedication')).toBe(true);
      expect(source.includes('Log Now')).toBe(true);
      expect(source.includes('Manage All')).toBe(true);
    });

    test('integrates PhilHealth YAKAP benefit card and 7-day After Visit Summary', () => {
      expect(source.includes('YakapActiveCard')).toBe(true);
      expect(source.includes('YakapPromoCard')).toBe(true);
      expect(source.includes('AfterVisitSummaryCard')).toBe(true);
      expect(source.includes('DAILY MINDFUL MOMENT')).toBe(true);
    });
  });

  describe('Responsive Web Home Screen (Home.screen.web.tsx)', () => {
    const source = readApp('navigation/screens/Home.screen.web.tsx');

    test('file exists and exports default HomeScreenWeb component', () => {
      expect(existsSync(join(APP_ROOT, 'navigation/screens/Home.screen.web.tsx'))).toBe(true);
      expect(source.includes('export default function HomeScreenWeb')).toBe(true);
    });

    test('implements responsive breakpoint layouts (desktop rail vs mobile column)', () => {
      expect(source.includes('useBreakpoint')).toBe(true);
      expect(source.includes('isDesktop')).toBe(true);
      expect(source.includes('isCompact')).toBe(true);
      expect(source.includes('mainColDesktop')).toBe(true);
      expect(source.includes('rightColDesktop')).toBe(true);
    });

    test('implements full suite of Stitch components on web', () => {
      expect(source.includes('ClinicEzLogo')).toBe(true);
      expect(source.includes('CLINIC EZ • HEALTH PASS')).toBe(true);
      expect(source.includes('showQrModal')).toBe(true);
      expect(source.includes('quickActionsGrid')).toBe(true);
      expect(source.includes('appointmentsWebGrid')).toBe(true);
      expect(source.includes('Recent Vitals')).toBe(true);
      expect(source.includes("Today's Schedule")).toBe(true);
      expect(source.includes('DAILY MINDFUL MOMENT')).toBe(true);
    });
  });

  describe('Strict Design System Token Compliance', () => {
    test('screens do not contain forbidden hardcoded hex colors or raw numeric font sizes in styles', () => {
      const mobile = readApp('navigation/screens/Home.screen.tsx');
      const web = readApp('navigation/screens/Home.screen.web.tsx');

      // Strip comments
      const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
      const cleanMobile = strip(mobile);
      const cleanWeb = strip(web);

      // Verify no hex color literals
      const hexRegex = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g;
      expect(cleanMobile.match(hexRegex)).toBeNull();
      expect(cleanWeb.match(hexRegex)).toBeNull();

      // Verify no raw numeric fontSize in StyleSheet
      const fontSizeRegex = /\bfontSize:\s*\d+/g;
      expect(cleanMobile.match(fontSizeRegex)).toBeNull();
      expect(cleanWeb.match(fontSizeRegex)).toBeNull();
    });
  });
});

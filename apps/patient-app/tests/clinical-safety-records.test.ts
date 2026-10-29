import { describe, expect, test } from 'bun:test';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const APP_ROOT = join(import.meta.dir, '..');
const readApp = (rel: string): string =>
  readFileSync(join(APP_ROOT, rel), 'utf8').replace(/\r\n/g, '\n');

describe('Part 1 Requirement R3: Clinical Safety & UI/UX Expert Compliance', () => {
  // ─── 1. Prescriptions.screen.tsx Fake Data Purge & Authentic QR Matrix ──────
  describe('Prescriptions screen clinical safety & fake data purge', () => {
    const content = readApp('navigation/screens/profile/Prescriptions.screen.tsx');

    test('purges fake demo prescriptions injected when data is empty', () => {
      expect(content.includes('Amlodipine Besylate')).toBe(false);
      expect(content.includes('Amoxicillin + Clavulanic Acid')).toBe(false);
      expect(content.includes('UPSC-HCI990001-2026-000142')).toBe(false);
    });

    test('purges hardcoded clinic and prescriber strings', () => {
      expect(content.includes('Fuente Osmeña Branch')).toBe(false);
      expect(content.includes('Dr. Roberto Cruz, MD')).toBe(false);
      expect(content.includes('Dr. Roberto Cruz')).toBe(false);
      expect(content.includes('Metro Health Outpatient Clinic')).toBe(false);
      expect(content.includes('0149281')).toBe(false);
      expect(content.includes('PHIL-AMLO-5MG-001')).toBe(false);
      expect(content.includes('PHIL-AMLO')).toBe(false);
    });

    test('uses real QrCodeView matrix instead of fake icon boxes', () => {
      expect(content.includes('QrCodeView')).toBe(true);
      expect(content.includes('components/sharing/QrCodeView')).toBe(true);
      expect(content.includes('PHILHEALTH:YAKAP:UPSC:')).toBe(true);
      expect(content.includes('Path B: External Pharmacy Verification')).toBe(true);
    });

    test('implements authentic EmptyState and RecordSkeletonList states', () => {
      expect(content.includes('RecordSkeletonList')).toBe(true);
      expect(content.includes('EmptyState')).toBe(true);
      expect(content.includes('No Prescriptions')).toBe(true);
    });
  });

  // ─── 2. LabResults.screen.tsx Fake Data Purge & Verification Badging ────────
  describe('LabResults screen clinical safety & fake data purge', () => {
    const content = readApp('navigation/screens/profile/LabResults.screen.tsx');

    test('purges fake lab results and hardcoded abnormal values', () => {
      expect(content.includes('CBC with Platelet Count')).toBe(false);
      expect(content.includes('Fasting Blood Sugar')).toBe(false);
      expect(content.includes('108.4')).toBe(false);
    });

    test('purges hardcoded diagnostic facility, pathologist, medtech, and physician strings', () => {
      expect(content.includes('Metro Health Diagnostic Lab')).toBe(false);
      expect(content.includes('Dr. Evelyn Lim, MD, FPSP')).toBe(false);
      expect(content.includes('Dr. Evelyn Lim')).toBe(false);
      expect(content.includes('PRC-0078912')).toBe(false);
      expect(content.includes('Mark Joshua Bautista, RMT')).toBe(false);
      expect(content.includes('Mark Joshua Bautista')).toBe(false);
      expect(content.includes('PRC-0091823')).toBe(false);
      expect(content.includes('Dr. Roberto Cruz, MD')).toBe(false);
      expect(content.includes('Dr. Roberto Cruz')).toBe(false);
    });

    test('purges fake PDF export alert and uses authentic EmptyState & RecordSkeletonList', () => {
      expect(content.includes('PDF Export')).toBe(false);
      expect(content.includes('Preparing encrypted PDF report')).toBe(false);
      expect(content.includes('RecordSkeletonList')).toBe(true);
      expect(content.includes('EmptyState')).toBe(true);
      expect(content.includes('No Diagnostic Results')).toBe(true);
    });
  });

  // ─── 3. Teleconsultation Safety Gating & Session Readiness Copy ────────────
  describe('Teleconsultation clinical visit gating & demo flag isolation', () => {
    test('AppointmentDetail gates teleconsultation entry strictly to teleconsult visit types', () => {
      const content = readApp('navigation/screens/appointments/AppointmentDetail.screen.tsx');
      expect(content.includes("item.serviceType === 'teleconsult'")).toBe(true);
      expect(content.includes("item.serviceType === 'virtual'")).toBe(true);
      expect(content.includes('Virtual Teleconsultation')).toBe(true);
    });

    test('TeleconsultWaitingRoom gates 2.5s doctor admission behind EXPO_PUBLIC_DEMO_TELECONSULT and purges mock appointmentId', () => {
      const content = readApp('navigation/screens/teleconsult/TeleconsultWaitingRoom.screen.tsx');
      expect(content.includes('EXPO_PUBLIC_DEMO_TELECONSULT')).toBe(true);
      expect(
        content.includes('Teleconsultation session will connect once your physician initiates the call room')
      ).toBe(true);
      expect(content.includes('APT-TC-001')).toBe(false);
    });

    test('TeleconsultCall gates mock call room connection behind EXPO_PUBLIC_DEMO_TELECONSULT and purges mock clinician', () => {
      const content = readApp('navigation/screens/teleconsult/TeleconsultCall.screen.tsx');
      expect(content.includes('EXPO_PUBLIC_DEMO_TELECONSULT')).toBe(true);
      expect(content.includes('Dr. Maria Santos, MD')).toBe(false);
      expect(content.includes('Dr. Maria Santos')).toBe(false);
      expect(content.includes("route.params?.clinicianName ?? 'Attending Clinician'")).toBe(true);
    });
  });

  // ─── 4. Consolidated Records Hub: Clinic Documents vs My Uploads ────────────
  describe('Consolidated Records Hub two-segment architecture', () => {
    test('RecordsScreen is organized into Clinic Documents vs My Uploads', () => {
      const content = readApp('navigation/screens/records/Records.screen.tsx');
      expect(content.includes('SegmentedControl')).toBe(true);
      expect(content.includes('Clinic Documents')).toBe(true);
      expect(content.includes('My Uploads')).toBe(true);
      expect(content.includes('CategoryPillBar')).toBe(true);
      expect(content.includes('FileRow')).toBe(true);
      expect(content.includes('AfterVisitSummaryCard')).toBe(true);
      expect(content.includes('FilterChipBar')).toBe(true);
    });

    test('FilesStack and FilesStack.web mount RecordsScreen for FilesBrowserScreen', () => {
      const nativeContent = readApp('navigation/navigators/FilesStack.tsx');
      const webContent = readApp('navigation/navigators/FilesStack.web.tsx');
      expect(nativeContent.includes('RecordsScreen')).toBe(true);
      expect(nativeContent.includes('screens/records/Records.screen')).toBe(true);
      expect(webContent.includes('RecordsScreen')).toBe(true);
      expect(webContent.includes('screens/records/Records.screen')).toBe(true);
    });
  });

  // ─── 5. Profile Read-Only Section Purge & loadCounts Scoping ────────────────
  describe('Profile screen duplicate section purge & query scoping', () => {
    test('purges duplicate read-only Health Records section in native and web Profile', () => {
      const nativeContent = readApp('navigation/screens/profile/Profile.screen.tsx');
      const webContent = readApp('navigation/screens/profile/Profile.screen.web.tsx');

      expect(nativeContent.includes('title="Health Records"')).toBe(false);
      expect(webContent.includes('title="Health Records"')).toBe(false);
    });

    test('scopes all loadCounts queries strictly to active patientId and non-deleted records', () => {
      const nativeContent = readApp('navigation/screens/profile/Profile.screen.tsx');
      const webContent = readApp('navigation/screens/profile/Profile.screen.web.tsx');

      expect(nativeContent.includes('and(eq(patientAddresses.patientId, patientId), isNull(patientAddresses.deletedAt))')).toBe(true);
      expect(nativeContent.includes('and(eq(patientMedications.patientId, patientId), isNull(patientMedications.deletedAt))')).toBe(true);
      expect(nativeContent.includes('and(eq(patientAllergies.patientId, patientId), isNull(patientAllergies.deletedAt))')).toBe(true);

      expect(webContent.includes('and(eq(patientAddresses.patientId, patientId), isNull(patientAddresses.deletedAt))')).toBe(true);
      expect(webContent.includes('and(eq(patientMedications.patientId, patientId), isNull(patientMedications.deletedAt))')).toBe(true);
      expect(webContent.includes('and(eq(patientAllergies.patientId, patientId), isNull(patientAllergies.deletedAt))')).toBe(true);
    });
  });

  // ─── 6. Desktop Accessibility on ProfileListItemCard ─────────────────────────
  describe('ProfileListItemCard desktop accessibility & touch targets', () => {
    test('renders visible Edit and Delete buttons with >=44px touch targets', () => {
      const content = readApp('components/profile/ProfileListItemCard.tsx');
      expect(content.includes('minWidth: 44')).toBe(true);
      expect(content.includes('minHeight: 44')).toBe(true);
      expect(content.includes('accessibilityLabel="Edit"')).toBe(true);
      expect(content.includes('accessibilityLabel="Delete"')).toBe(true);
    });
  });

  // ─── 7. After-Visit Summary (AVS) Component & Surface Integration ───────────
  describe('After-Visit Summary (AVS) component & integrations', () => {
    test('AfterVisitSummaryCard component exists and provides clinical discharge details', () => {
      expect(existsSync(join(APP_ROOT, 'components/records/AfterVisitSummaryCard.tsx'))).toBe(true);
      const content = readApp('components/records/AfterVisitSummaryCard.tsx');
      expect(content.includes('homeInstructions')).toBe(true);
      expect(content.includes('treatmentPlan')).toBe(true);
      expect(content.includes('primaryDiagnosis')).toBe(true);
      expect(content.includes('onBookFollowUp')).toBe(true);
      expect(content.includes('onMessageClinic')).toBe(true);
    });

    test('Home screen surfaces pinned AVS card if consultation occurred within last 7 days', () => {
      const nativeHome = readApp('navigation/screens/Home.screen.tsx');
      const webHome = readApp('navigation/screens/Home.screen.web.tsx');

      expect(nativeHome.includes('AfterVisitSummaryCard')).toBe(true);
      expect(nativeHome.includes('differenceInCalendarDays')).toBe(true);
      expect(nativeHome.includes('diff <= 7')).toBe(true);

      expect(webHome.includes('AfterVisitSummaryCard')).toBe(true);
      expect(webHome.includes('differenceInCalendarDays')).toBe(true);
      expect(webHome.includes('diff <= 7')).toBe(true);
    });

    test('AppointmentDetail surfaces AfterVisitSummaryCard for completed visits', () => {
      const content = readApp('navigation/screens/appointments/AppointmentDetail.screen.tsx');
      expect(content.includes('AfterVisitSummaryCard')).toBe(true);
      expect(content.includes("status === 'completed'")).toBe(true);
    });
  });

  // ─── 8. Deep-Link Parameter Resolution & Route Crash Resilience ─────────────
  describe('Deep-link route parameter safety & linking configuration', () => {
    test('linking.ts contains all 7 deep link routes', () => {
      const linking = readApp('navigation/linking.ts');
      expect(linking.includes('notifications/:id')).toBe(true);
      expect(linking.includes('providers/:id')).toBe(true);
      expect(linking.includes('explore/clinics/:id')).toBe(true);
      expect(linking.includes('explore/orgs/:id')).toBe(true);
      expect(linking.includes('appointments/:id')).toBe(true);
      expect(linking.includes('appointments/:id/reschedule')).toBe(true);
      expect(linking.includes('appointments/:id/attach-files')).toBe(true);
    });

    test('NotificationDetail safely resolves param id and falls back to SQLite lookup', () => {
      const content = readApp('navigation/screens/NotificationDetail.screen.tsx');
      expect(content.includes('rawParams?.id ?? initialNotification?.id')).toBe(true);
      expect(content.includes('from(notifications)')).toBe(true);
    });

    test('ProviderProfile safely resolves param id and falls back to SQLite lookup', () => {
      const content = readApp('navigation/screens/appointments/ProviderProfile.screen.tsx');
      expect(content.includes('rawParams?.id ?? initialProvider?.id')).toBe(true);
      expect(content.includes('from(patientHealthcareProviders)')).toBe(true);
    });

    test('ClinicDetails safely resolves param id and falls back to route.params?.id', () => {
      const nativeContent = readApp('navigation/screens/ClinicDetails.screen.tsx');
      const webContent = readApp('navigation/screens/ClinicDetails.screen.web.tsx');
      expect(nativeContent.includes('route.params?.clinicId ?? route.params?.id')).toBe(true);
      expect(webContent.includes('route.params?.clinicId ?? route.params?.id')).toBe(true);
    });

    test('OrganizationDetails safely resolves param id and falls back to route.params?.id', () => {
      const nativeContent = readApp('navigation/screens/OrganizationDetails.screen.tsx');
      const webContent = readApp('navigation/screens/OrganizationDetails.screen.web.tsx');
      expect(nativeContent.includes('route.params?.organizationId ?? route.params?.id')).toBe(true);
      expect(webContent.includes('route.params?.organizationId ?? route.params?.id')).toBe(true);
    });

    test('Reschedule and AttachFiles safely resolve param id and appointmentId', () => {
      const rescheduleContent = readApp('navigation/screens/appointments/Reschedule.screen.tsx');
      expect(rescheduleContent.includes('rawParams.appointmentId ?? rawParams.id')).toBe(true);
      const attachContent = readApp('navigation/screens/appointments/AttachFiles.screen.tsx');
      expect(attachContent.includes('rawParams?.appointmentId ?? rawParams?.id')).toBe(true);
    });
  });

  // ─── 9. Header Hierarchy: Eliminate Duplicate Cover Header ───────────────────
  describe('Header hierarchy & cover screen configuration', () => {
    test('MainStack disables large titles for ClinicDetails and OrganizationDetails', () => {
      const content = readApp('navigation/navigators/MainStack.tsx');
      expect(content.includes('ClinicDetailsScreen')).toBe(true);
      expect(content.includes('OrganizationDetailsScreen')).toBe(true);
      expect(content.includes('headerLargeTitleEnabled: false')).toBe(true);
    });
  });

  // ─── 10. Philippine Data Privacy Act Compliance (RA 10173) ──────────────────
  describe('Philippine Data Privacy Act (RA 10173) compliance', () => {
    test('Login screen references RA 10173 and purges US HIPAA references', () => {
      const nativeLogin = readApp('navigation/screens/Login.screen.tsx');
      const webLogin = readApp('navigation/screens/Login.screen.web.tsx');

      expect(nativeLogin.includes('Data Privacy Act of 2012 (RA 10173)')).toBe(true);
      expect(nativeLogin.includes('HIPAA')).toBe(false);

      expect(webLogin.includes('Data Privacy Act of 2012 (RA 10173)')).toBe(true);
      expect(webLogin.includes('HIPAA')).toBe(false);
    });
  });

  // ─── 11. Cross-Screen Clinical Safety & Forbidden Mock Token Sweep ──────────
  describe('Cross-Screen Clinical Safety & Forbidden Mock Token Sweep', () => {
    const CLINICAL_SCREENS = [
      'navigation/screens/profile/Prescriptions.screen.tsx',
      'navigation/screens/profile/LabResults.screen.tsx',
      'navigation/screens/teleconsult/TeleconsultCall.screen.tsx',
      'navigation/screens/teleconsult/TeleconsultWaitingRoom.screen.tsx',
      'navigation/screens/appointments/AppointmentDetail.screen.tsx',
      'navigation/screens/records/Records.screen.tsx',
      'components/records/AfterVisitSummaryCard.tsx',
      'navigation/screens/profile/HealthcareProviders.screen.tsx',
    ];

    const FORBIDDEN_TOKENS = [
      'Dr. Roberto Cruz, MD',
      'Dr. Roberto Cruz',
      'Dr. Maria Santos, MD',
      'Dr. Maria Santos',
      'Dr. Evelyn Lim, MD, FPSP',
      'Dr. Evelyn Lim',
      'Mark Joshua Bautista, RMT',
      'Mark Joshua Bautista',
      'PHIL-AMLO-5MG-001',
      'PHIL-AMLO',
      'APT-TC-001',
      'Fuente Osmeña Branch',
      'Metro Health Outpatient Clinic',
      'Metro Health Diagnostic Lab',
      'UPSC-HCI990001-2026-000142',
      '0149281',
      'PRC-0078912',
      'PRC-0091823',
    ];

    test('all clinical screens pass comprehensive forbidden mock token sweep', () => {
      for (const screenPath of CLINICAL_SCREENS) {
        const content = readApp(screenPath);
        for (const token of FORBIDDEN_TOKENS) {
          expect(content.includes(token)).toBe(false);
        }
      }
    });
  });
});

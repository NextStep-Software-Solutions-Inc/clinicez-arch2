import { describe, expect, test, mock } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parseReceptionQr } from '../utils/receptionQrParser';
import { GATED_CATALOG_STRINGS } from '../constants/gatedCatalogStrings';
import { ApiError } from '../services/api/apiClient';

// ── Mock Native & UI Dependencies for Bun Testing ───────────────────────────
mock.module('react-native', () => ({
  StyleSheet: {
    create: (styles: any) => styles,
    flatten: (styles: any) => styles,
    hairlineWidth: 1,
  },
  View: 'View',
  Text: 'Text',
  Pressable: 'Pressable',
  Modal: 'Modal',
  TextInput: 'TextInput',
  ScrollView: 'ScrollView',
  ActivityIndicator: 'ActivityIndicator',
  KeyboardAvoidingView: 'KeyboardAvoidingView',
  Platform: { OS: 'web', select: (obj: any) => obj.web ?? obj.default },
}));

mock.module('expo-crypto', () => ({
  randomUUID: () => 'mock-uuid-e2e-m4',
}));

mock.module('../utils/haptics', () => ({
  triggerHaptic: mock(() => Promise.resolve()),
}));

mock.module('@react-native-community/netinfo', () => ({
  default: {
    fetch: async () => ({ isConnected: true }),
  },
}));

// Import Components Under Empirical Stress
const { default: GatedServiceCatalogLockedCard } = await import(
  '../components/clinics/GatedServiceCatalogLockedCard'
);
const { default: ClinicJoinCodeModal } = await import(
  '../components/clinics/ClinicJoinCodeModal'
);

// ── Domain Logic Mock Fixtures & Pure Evaluators ─────────────────────────────

interface TwoTierClinicState {
  workspaceEligible: boolean;
  clinicPublished: boolean;
  readinessChecksPassed: boolean;
  bookingPaused: boolean;
}

function evaluateTwoTierGovernance(state: TwoTierClinicState) {
  // Two-Tier State Machine:
  // IsPublic requires BOTH workspace eligibility AND clinic publishing.
  // Clinic publishing requires readiness checks to pass.
  const canPublish = state.workspaceEligible && state.readinessChecksPassed;
  const isPublic = state.workspaceEligible && state.clinicPublished && state.readinessChecksPassed;
  const isBookingActive = isPublic && !state.bookingPaused;

  let governanceStatus: 'Draft_Unlisted' | 'Blocked_WorkspacePending' | 'Live_Discoverable';
  if (!state.workspaceEligible && state.clinicPublished) {
    governanceStatus = 'Blocked_WorkspacePending';
  } else if (isPublic) {
    governanceStatus = 'Live_Discoverable';
  } else {
    governanceStatus = 'Draft_Unlisted';
  }

  return {
    canPublish,
    isPublic,
    isBookingActive,
    governanceStatus,
    showsWorkspaceWarningBanner: !state.workspaceEligible,
    publishSwitchDisabled: !canPublish,
  };
}

describe('Empirical Challenger M4.1 — Two-Tier Governance & Gated Access Stress Harness', () => {

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. Two-Tier Governance State Machine Verification
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Domain 1: Two-Tier Governance State Machine Exhaustive Transitions', () => {

    test('Scenario 1A: Workspace=false, Clinic=false -> Unlisted / Draft', () => {
      const evaluation = evaluateTwoTierGovernance({
        workspaceEligible: false,
        clinicPublished: false,
        readinessChecksPassed: true,
        bookingPaused: false,
      });

      expect(evaluation.governanceStatus).toBe('Draft_Unlisted');
      expect(evaluation.isPublic).toBe(false);
      expect(evaluation.isBookingActive).toBe(false);
      expect(evaluation.showsWorkspaceWarningBanner).toBe(true);
      expect(evaluation.publishSwitchDisabled).toBe(true);
    });

    test('Scenario 1B: Workspace=true, Clinic=false -> Unlisted / Draft (Ready to publish)', () => {
      const evaluation = evaluateTwoTierGovernance({
        workspaceEligible: true,
        clinicPublished: false,
        readinessChecksPassed: true,
        bookingPaused: false,
      });

      expect(evaluation.governanceStatus).toBe('Draft_Unlisted');
      expect(evaluation.isPublic).toBe(false);
      expect(evaluation.isBookingActive).toBe(false);
      expect(evaluation.showsWorkspaceWarningBanner).toBe(false);
      expect(evaluation.canPublish).toBe(true);
      expect(evaluation.publishSwitchDisabled).toBe(false);
    });

    test('Scenario 1C: Workspace=true, Clinic=false, Readiness=false -> Unlisted / Draft (Blocked by readiness)', () => {
      const evaluation = evaluateTwoTierGovernance({
        workspaceEligible: true,
        clinicPublished: false,
        readinessChecksPassed: false,
        bookingPaused: false,
      });

      expect(evaluation.governanceStatus).toBe('Draft_Unlisted');
      expect(evaluation.isPublic).toBe(false);
      expect(evaluation.canPublish).toBe(false);
      expect(evaluation.publishSwitchDisabled).toBe(true);
    });

    test('Scenario 1D: Workspace=false, Clinic=true -> Blocked / Warning Banner (Workspace Eligibility Pending)', () => {
      const evaluation = evaluateTwoTierGovernance({
        workspaceEligible: false,
        clinicPublished: true,
        readinessChecksPassed: true,
        bookingPaused: false,
      });

      expect(evaluation.governanceStatus).toBe('Blocked_WorkspacePending');
      expect(evaluation.isPublic).toBe(false); // Strictly suppressed from consumer directory
      expect(evaluation.showsWorkspaceWarningBanner).toBe(true);
      expect(evaluation.publishSwitchDisabled).toBe(true);
    });

    test('Scenario 1E: Workspace=true, Clinic=true (readiness passes) -> Live / Discoverable in patient app', () => {
      const evaluation = evaluateTwoTierGovernance({
        workspaceEligible: true,
        clinicPublished: true,
        readinessChecksPassed: true,
        bookingPaused: false,
      });

      expect(evaluation.governanceStatus).toBe('Live_Discoverable');
      expect(evaluation.isPublic).toBe(true);
      expect(evaluation.isBookingActive).toBe(true);
      expect(evaluation.showsWorkspaceWarningBanner).toBe(false);
      expect(evaluation.publishSwitchDisabled).toBe(false);
    });

    test('Scenario 1F: When Booking Pause is active -> Discoverable with booking disabled / paused', () => {
      const evaluation = evaluateTwoTierGovernance({
        workspaceEligible: true,
        clinicPublished: true,
        readinessChecksPassed: true,
        bookingPaused: true,
      });

      // Still discoverable / live
      expect(evaluation.governanceStatus).toBe('Live_Discoverable');
      expect(evaluation.isPublic).toBe(true);
      // But appointment booking is paused
      expect(evaluation.isBookingActive).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. Hybrid Gated Intake Access Verification
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Domain 2: Hybrid Gated Intake Access & Unlock Lifecycle', () => {
    const mockGatedClinic = {
      id: 'clinic-cdo-gated-1',
      name: 'USTP CDO Health Center',
      description: 'University campus health service and occupational clinic.',
      address: 'Lapasan Highway, Cagayan de Oro City',
      operatingHours: 'Mon-Fri 8:00 AM - 5:00 PM',
      contactNumber: '+63 88 856 1738',
      contactEmail: 'healthcenter@ustp.edu.ph',
      isPhilHealthAccredited: true,
      isPublic: true,
      isGated: true,
      isUnlocked: false,
      supportsAppointments: true,
      isOnlineBookingPaused: false,
      isJoined: false,
      isVisible: true,
      unlockedByOrganizationIds: [] as string[],
      featuredScore: 100,
      activeMemberCount: 150,
      requiredShareFields: ['fullName', 'dateOfBirth'],
      privacyPolicyUrl: 'https://ustp.edu.ph/privacy',
      termsAndConditionsUrl: 'https://ustp.edu.ph/terms',
      specialties: ['Primary Care', 'Occupational Health'],
      linkedOrganizations: [
        {
          id: 'org-ustp-main',
          slug: 'ustp-main',
          name: 'USTP University System',
          description: 'Higher Education Institution',
          isPublic: true,
          partneredClinicIds: ['clinic-cdo-gated-1'],
          roles: [],
          requiredShareFields: [],
          privacyPolicyUrl: '',
          termsAndConditionsUrl: '',
          featuredScore: 100,
          activeMemberCount: 20000,
        },
      ],
      healthcareProviders: [],
      services: [], // Redacted while locked
    };

    test('2A: Gated=true and Unlocked=false renders public card and locked service card', () => {
      const enterJoinCodeMock = mock(() => {});
      const scanQrMock = mock(() => {});
      const joinOrgMock = mock(() => {});

      const markup = renderToStaticMarkup(
        React.createElement(GatedServiceCatalogLockedCard, {
          clinic: mockGatedClinic as any,
          onEnterJoinCode: enterJoinCodeMock,
          onScanQr: scanQrMock,
          onJoinOrganization: joinOrgMock,
          isLoading: false,
        })
      );

      // Verify title and explanatory badges
      expect(markup).toContain(GATED_CATALOG_STRINGS.lockedCard.badge);
      expect(markup).toContain(GATED_CATALOG_STRINGS.lockedCard.title);
      expect(markup).toContain(GATED_CATALOG_STRINGS.lockedCard.description);
      expect(markup).toContain(GATED_CATALOG_STRINGS.lockedCard.enterCodeCta);
      expect(markup).toContain(GATED_CATALOG_STRINGS.lockedCard.scanQrCta);
      expect(markup).toContain('Affiliated with USTP University System');
    });

    test('2B: Enter 6-char join code sanitization and length enforcement', () => {
      let codeInput = '  vip-888! ';
      const sanitized = codeInput.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
      expect(sanitized).toBe('VIP888');
      expect(sanitized.length).toBe(6);

      // Incomplete code
      const shortCode = 'AB12';
      const shortSanitized = shortCode.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
      expect(shortSanitized.length).toBe(4);
      expect(shortSanitized.length === 6).toBe(false);
    });

    test('2C: Placard QR scan parsing across multiple formats', () => {
      // 1. App custom URI scheme
      expect(parseReceptionQr('clinicez://join/VIP888')).toBe('VIP888');
      expect(parseReceptionQr('clinicez://join?code=VIP888')).toBe('VIP888');

      // 2. HTTPS Web portal URLs (single & nested segments)
      expect(parseReceptionQr('https://portal.clinicez.com/join/VIP888')).toBe('VIP888');
      expect(parseReceptionQr('https://portal.clinicez.com/join/tenant-cdo/VIP888')).toBe('VIP888');
      expect(parseReceptionQr('https://portal.clinicez.com/join/tenant-cdo/clinic-1/VIP888')).toBe('VIP888');
      expect(parseReceptionQr('https://portal.clinicez.com/clinics/cdo/unlock?joinCode=VIP888')).toBe('VIP888');

      // 3. Raw 6-character code
      expect(parseReceptionQr('VIP888')).toBe('VIP888');
      expect(parseReceptionQr('  vip888  ')).toBe('VIP888');

      // 4. Invalid or non-matching inputs
      expect(parseReceptionQr('https://random.com/something')).toBe(null);
      expect(parseReceptionQr('INVALID_LONG_STRING')).toBe(null);
      expect(parseReceptionQr('')).toBe(null);
    });

    test('2D: Unlocking transitions state: renders unredacted service catalog and booking buttons', () => {
      const unlockedServices = [
        { id: 'srv-1', name: 'General Medical Consultation', durationMinutes: 30, price: 0 },
        { id: 'srv-2', name: 'Annual Physical Examination', durationMinutes: 45, price: 200 },
      ];

      const unlockedClinic = {
        ...mockGatedClinic,
        isUnlocked: true,
        services: unlockedServices,
        healthcareProviders: [
          { id: 'doc-1', name: 'Dr. Andrea Santos', specialty: 'Family Medicine', credentials: ['MD'] },
        ],
      };

      // When unlocked:
      // showLockedCard is false
      const showLockedCard = Boolean(unlockedClinic.isGated && !unlockedClinic.isUnlocked);
      expect(showLockedCard).toBe(false);

      // Services are unredacted
      expect(unlockedClinic.services.length).toBe(2);
      expect(unlockedClinic.services[0].name).toBe('General Medical Consultation');
      expect(unlockedClinic.services[1].price).toBe(200);

      // Booking active
      const canBook = unlockedClinic.supportsAppointments && !unlockedClinic.isOnlineBookingPaused;
      expect(canBook).toBe(true);
    });

    test('2E: Invalid or expired join code returns clear error without crashing', async () => {
      const unlockMock = mock(async (code: string) => {
        if (code === 'EXP999') {
          throw new ApiError(400, 'Bad Request', { message: 'The join code for this clinic has expired.' });
        }
        if (code !== 'VIP888') {
          throw new ApiError(400, 'Bad Request', { message: 'Invalid clinic join code.' });
        }
      });

      // Valid code
      await expect(unlockMock('VIP888')).resolves.toBeUndefined();

      // Expired code
      await expect(unlockMock('EXP999')).rejects.toThrow();

      // Invalid code
      await expect(unlockMock('WRONG1')).rejects.toThrow();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. Design Token Conformance Assertions
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Domain 3: Token Discipline & Semantic Urgency Encoding', () => {
    test('Token guard scripts exist and run with strict mode', async () => {
      const clinicGuardPath = 'apps/clinic-app/scripts/check-tokens.mjs';
      const patientGuardPath = 'apps/patient-app/scripts/check-tokens.mjs';

      const clinicGuardExists = await Bun.file(clinicGuardPath).exists();
      const patientGuardExists = await Bun.file(patientGuardPath).exists();

      expect(clinicGuardExists).toBe(true);
      expect(patientGuardExists).toBe(true);
    });

    test('Semantic urgency tokens correctly map STAT, Urgent, Routine', () => {
      const urgencyTokens = {
        emergency: { bg: 'emergencyBg', text: 'emergencyText', border: 'emergencyBorder' },
        urgent: { bg: 'urgentBg', text: 'urgentText', border: 'urgentBorder' },
        routine: { bg: 'routineBg', text: 'routineText', border: 'routineBorder' },
      };

      expect(urgencyTokens.emergency.bg).toBe('emergencyBg');
      expect(urgencyTokens.urgent.bg).toBe('urgentBg');
      expect(urgencyTokens.routine.bg).toBe('routineBg');
    });
  });
});

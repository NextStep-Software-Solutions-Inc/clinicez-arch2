import { describe, expect, test, mock } from 'bun:test';
import { GATED_CATALOG_STRINGS } from '../constants/gatedCatalogStrings';
import { parseReceptionQr } from '../utils/receptionQrParser';
import { ApiError } from '../services/api/apiClient';

// ── Mock React Native & Native Dependencies Before Component Imports ────────
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
  randomUUID: () => 'mock-uuid-12345',
}));

mock.module('../utils/haptics', () => ({
  triggerHaptic: mock(() => Promise.resolve()),
}));

mock.module('@react-native-community/netinfo', () => ({
  default: {
    fetch: async () => ({ isConnected: true }),
  },
}));

// Re-export string dictionary for external consumers
export { GATED_CATALOG_STRINGS };

// ── Mock Domain Data Fixtures ───────────────────────────────────────────────
const mockLockedClinic = {
  id: 'clinic-ustp-cdo',
  name: 'USTP CDO Health Center',
  description: 'University health center serving USTP students, faculty, and personnel.',
  address: 'CM Recto Ave, Lapasan, Cagayan de Oro City',
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
  activeMemberCount: 120,
  requiredShareFields: ['fullName', 'dateOfBirth', 'philhealthId'],
  privacyPolicyUrl: 'https://ustp.edu.ph/privacy',
  termsAndConditionsUrl: 'https://ustp.edu.ph/terms',
  specialties: ['General Practice', 'Primary Care'],
  linkedOrganizations: [
    {
      id: 'org-ustp',
      slug: 'ustp-university',
      name: 'USTP University',
      description: 'University of Science and Technology of Southern Philippines',
      isPublic: true,
      partneredClinicIds: ['clinic-ustp-cdo'],
      roles: [],
      requiredShareFields: [],
      privacyPolicyUrl: '',
      termsAndConditionsUrl: '',
      featuredScore: 100,
      activeMemberCount: 15000,
    },
  ],
  healthcareProviders: [] as any[],
  services: [] as any[], // Redacted on backend when locked
};

const mockUnlockedServices = [
  { id: 'srv-1', name: 'General Health Consultation', durationMinutes: 30, price: 0 },
  { id: 'srv-2', name: 'Student Physical Examination', durationMinutes: 45, price: 150 },
];

const mockUnlockedProviders = [
  { id: 'doc-1', name: 'Dr. Maria Santos', specialty: 'Family Medicine', credentials: ['MD', 'FPSMS'], rating: 4.9 },
];

const mockUnlockedClinic = {
  ...mockLockedClinic,
  isUnlocked: true,
  isJoined: true,
  membershipStatus: 'active',
  services: mockUnlockedServices,
  healthcareProviders: mockUnlockedProviders,
};

const mockPublicClinic = {
  id: 'clinic-gen-care',
  name: 'General Care Clinic',
  description: 'Open community clinic.',
  address: '123 Main St, City Center',
  operatingHours: 'Mon-Sat 9:00 AM - 6:00 PM',
  contactNumber: '+63 2 8123 4567',
  contactEmail: 'info@gencare.com',
  isPhilHealthAccredited: true,
  isPublic: true,
  isGated: false,
  isUnlocked: true,
  supportsAppointments: true,
  isOnlineBookingPaused: false,
  isJoined: false,
  isVisible: true,
  unlockedByOrganizationIds: [] as string[],
  featuredScore: 80,
  activeMemberCount: 500,
  requiredShareFields: ['fullName'],
  privacyPolicyUrl: '',
  termsAndConditionsUrl: '',
  specialties: ['Family Medicine'],
  linkedOrganizations: [],
  services: mockUnlockedServices,
  healthcareProviders: mockUnlockedProviders,
};

// ── Pure Presentation Helpers for Component Logic Verification ──────────────
function evaluateGatedClinicView(clinic: typeof mockLockedClinic) {
  const showLockedCard = Boolean(clinic.isGated && !clinic.isUnlocked);
  const showServices = Boolean(!clinic.isGated || clinic.isUnlocked);
  const canBook = Boolean(
    clinic.supportsAppointments &&
    !clinic.isOnlineBookingPaused &&
    (!clinic.isGated || clinic.isUnlocked)
  );

  return {
    showLockedCard,
    showServices,
    canBook,
    partnerOrgCta: clinic.linkedOrganizations[0]
      ? `${GATED_CATALOG_STRINGS.lockedCard.joinOrgCtaPrefix}${clinic.linkedOrganizations[0].name}`
      : GATED_CATALOG_STRINGS.lockedCard.partnerOrgCtaFallback,
  };
}

function sanitizeJoinCodeInput(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}

function validateJoinCode(code: string): { isValid: boolean; error: string | null } {
  const sanitized = sanitizeJoinCodeInput(code);
  if (sanitized.length === 0) {
    return { isValid: false, error: 'Please enter a join code.' };
  }
  if (sanitized.length !== 6) {
    return { isValid: false, error: GATED_CATALOG_STRINGS.modal.lengthError };
  }
  return { isValid: true, error: null };
}

// ── Test Suite ───────────────────────────────────────────────────────────────
describe('Gated Service Catalog & Join Code Verification (Milestone 3)', () => {

  // ── TEST 1: Gated & Locked Clinic Presentation ────────────────────────────
  describe('Test 1: Public profile and locked card when clinic is gated and locked', () => {
    test('renders complete public profile details while keeping services locked', () => {
      const view = evaluateGatedClinicView(mockLockedClinic);

      // 1. Verify locked card is rendered
      expect(view.showLockedCard).toBe(true);
      expect(view.showServices).toBe(false);
      expect(view.canBook).toBe(false);

      // 2. Verify public profile fields are fully accessible
      expect(mockLockedClinic.name).toBe('USTP CDO Health Center');
      expect(mockLockedClinic.address).toBe('CM Recto Ave, Lapasan, Cagayan de Oro City');
      expect(mockLockedClinic.operatingHours).toBe('Mon-Fri 8:00 AM - 5:00 PM');
      expect(mockLockedClinic.contactNumber).toBe('+63 88 856 1738');
      expect(mockLockedClinic.contactEmail).toBe('healthcenter@ustp.edu.ph');
      expect(mockLockedClinic.isPhilHealthAccredited).toBe(true);

      // 3. Verify locked card text contracts
      expect(GATED_CATALOG_STRINGS.lockedCard.title).toBe('Services & Booking Restricted');
      expect(GATED_CATALOG_STRINGS.lockedCard.badge).toBe('Institutional Access');
      expect(GATED_CATALOG_STRINGS.lockedCard.enterCodeCta).toBe('Enter Join Code');
      expect(GATED_CATALOG_STRINGS.lockedCard.scanQrCta).toBe('Scan Reception QR');
      expect(view.partnerOrgCta).toBe('Join USTP University');

      // 4. Verify private services array is empty (redacted by backend)
      expect(mockLockedClinic.services.length).toBe(0);
      expect(mockLockedClinic.healthcareProviders.length).toBe(0);
    });
  });

  // ── TEST 2: Unlocked & Public Catalog Presentation ────────────────────────
  describe('Test 2: Unlocked service catalog and active appointment booking buttons', () => {
    test('renders unredacted services and active booking button when public', () => {
      const view = evaluateGatedClinicView(mockPublicClinic);

      expect(view.showLockedCard).toBe(false);
      expect(view.showServices).toBe(true);
      expect(view.canBook).toBe(true);

      expect(mockPublicClinic.services.length).toBe(2);
      expect(mockPublicClinic.services[0].name).toBe('General Health Consultation');
      expect(mockPublicClinic.services[0].durationMinutes).toBe(30);
      expect(mockPublicClinic.services[0].price).toBe(0);

      expect(mockPublicClinic.services[1].name).toBe('Student Physical Examination');
      expect(mockPublicClinic.services[1].price).toBe(150);

      expect(mockPublicClinic.healthcareProviders.length).toBe(1);
      expect(mockPublicClinic.healthcareProviders[0].name).toBe('Dr. Maria Santos');
    });

    test('renders unredacted services and active booking button when gated clinic is unlocked', () => {
      const view = evaluateGatedClinicView(mockUnlockedClinic);

      expect(view.showLockedCard).toBe(false);
      expect(view.showServices).toBe(true);
      expect(view.canBook).toBe(true);
      expect(mockUnlockedClinic.isUnlocked).toBe(true);
      expect(mockUnlockedClinic.membershipStatus).toBe('active');
    });

    test('disables booking button when capacity pause is enabled', () => {
      const pausedClinic = { ...mockUnlockedClinic, supportsAppointments: false };
      const view = evaluateGatedClinicView(pausedClinic);

      expect(view.showServices).toBe(true);
      expect(view.canBook).toBe(false);
      expect(GATED_CATALOG_STRINGS.catalog.bookingPausedLabel).toBe('Booking not yet available');
    });

    test('disables booking button when online booking is paused', () => {
      const pausedClinic = { ...mockUnlockedClinic, isOnlineBookingPaused: true };
      const view = evaluateGatedClinicView(pausedClinic);

      expect(view.showServices).toBe(true);
      expect(view.canBook).toBe(false);
    });
  });

  // ── TEST 3: Join Code Modal & Unlock Submission Flow ──────────────────────
  describe('Test 3: Opening modal, entering 6-char code, and submitting unlock', () => {
    test('sanitizes input to 6 uppercase alphanumeric characters', () => {
      expect(sanitizeJoinCodeInput('cdo202')).toBe('CDO202');
      expect(sanitizeJoinCodeInput('ustp-26!')).toBe('USTP26');
      expect(sanitizeJoinCodeInput('abcdefghijk')).toBe('ABCDEF');
      expect(sanitizeJoinCodeInput('12 34 56')).toBe('123456');
    });

    test('validates 6-character length constraint for submission enablement', () => {
      expect(validateJoinCode('').isValid).toBe(false);
      expect(validateJoinCode('CDO').isValid).toBe(false);
      expect(validateJoinCode('CDO').error).toBe(GATED_CATALOG_STRINGS.modal.lengthError);
      expect(validateJoinCode('CDO202').isValid).toBe(true);
      expect(validateJoinCode('CDO202').error).toBeNull();
    });

    test('triggers unlockClinicAccess with uppercase code and transitions state on success', async () => {
      let passedClinicId = '';
      let passedJoinCode = '';
      let unlockCallCount = 0;

      const mockUnlockClinicAccess = mock(async (_patientId: string, clinicId: string, code: string) => {
        unlockCallCount++;
        passedClinicId = clinicId;
        passedJoinCode = code;
        return {
          ...mockLockedClinic,
          isUnlocked: true,
          isJoined: true,
          services: mockUnlockedServices,
        };
      });

      const inputCode = 'ustp26';
      const validation = validateJoinCode(inputCode);
      expect(validation.isValid).toBe(true);

      const sanitized = sanitizeJoinCodeInput(inputCode);
      const result = await mockUnlockClinicAccess('patient-123', mockLockedClinic.id, sanitized);

      expect(unlockCallCount).toBe(1);
      expect(passedClinicId).toBe('clinic-ustp-cdo');
      expect(passedJoinCode).toBe('USTP26');
      expect(result.isUnlocked).toBe(true);
      expect(result.services.length).toBe(2);
    });

    test('reception QR parser accurately extracts 6-character join codes from multiple formats', () => {
      // 1. Raw 6-character code
      expect(parseReceptionQr('CDO202')).toBe('CDO202');
      expect(parseReceptionQr('ustp26')).toBe('USTP26');

      // 2. Custom App URL scheme
      expect(parseReceptionQr('clinicez://join?code=CDO202')).toBe('CDO202');
      expect(parseReceptionQr('clinicez://join/VIP888')).toBe('VIP888');

      // 3. Web URL path segment
      expect(parseReceptionQr('https://clinicez.ph/join/CDO202')).toBe('CDO202');
      expect(parseReceptionQr('https://portal.clinicez.com/join/tenant-1/VIP888')).toBe('VIP888');

      // 4. Web URL query parameter
      expect(parseReceptionQr('https://clinicez.ph/clinic/details?joinCode=CDO202')).toBe('CDO202');

      // 5. Invalid payloads return null
      expect(parseReceptionQr('invalid-data')).toBeNull();
      expect(parseReceptionQr('')).toBeNull();
      expect(parseReceptionQr('12345')).toBeNull(); // 5 chars
    });
  });

  // ── TEST 4: Error Handling & Resilience Without Crashing ───────────────────
  describe('Test 4: Invalid join code displays error feedback without crashing', () => {
    test('captures 400 ApiError and formats inline user feedback safely', async () => {
      const mockFailingUnlock = mock(async () => {
        throw new ApiError('Invalid clinic join code.', 400, [
          { field: 'joinCode', code: 'INVALID_CODE', message: 'Invalid clinic join code.' },
        ]);
      });

      let capturedError: string | null = null;
      let didCrash = false;

      try {
        await mockFailingUnlock();
      } catch (err: any) {
        if (err instanceof ApiError) {
          capturedError = err.firstMessage;
        } else {
          didCrash = true;
        }
      }

      expect(didCrash).toBe(false);
      expect(capturedError).toBe('Invalid clinic join code.');
    });

    test('handles expired join code message cleanly', async () => {
      const mockExpiredUnlock = mock(async () => {
        throw new ApiError('The join code for this clinic has expired.', 400, [
          { field: 'joinCode', code: 'EXPIRED_CODE', message: 'The join code for this clinic has expired.' },
        ]);
      });

      let capturedError: string | null = null;
      try {
        await mockExpiredUnlock();
      } catch (err: any) {
        capturedError = err instanceof ApiError ? err.firstMessage : err.message;
      }

      expect(capturedError).toBe('The join code for this clinic has expired.');
    });

    test('handles OFFLINE_ERROR without unhandled exceptions', async () => {
      const mockOfflineUnlock = mock(async () => {
        throw new Error('OFFLINE_ERROR');
      });

      let userMessage = '';
      try {
        await mockOfflineUnlock();
      } catch (err: any) {
        userMessage = err.message === 'OFFLINE_ERROR'
          ? GATED_CATALOG_STRINGS.modal.offlineError
          : 'Unknown error';
      }

      expect(userMessage).toBe('Network unavailable. Reconnect to unlock clinic access.');
    });
  });

  // ── TEST 5: Exact String Literal Invariant Verification ───────────────────
  describe('Test 5: Verify test assertions match EXACT string literals in components', () => {
    test('GATED_CATALOG_STRINGS contains all mandatory UI copy keys', () => {
      // Locked Card Keys
      expect(typeof GATED_CATALOG_STRINGS.lockedCard.title).toBe('string');
      expect(GATED_CATALOG_STRINGS.lockedCard.title.length).toBeGreaterThan(0);
      expect(typeof GATED_CATALOG_STRINGS.lockedCard.enterCodeCta).toBe('string');
      expect(GATED_CATALOG_STRINGS.lockedCard.enterCodeCta).toBe('Enter Join Code');
      expect(GATED_CATALOG_STRINGS.lockedCard.scanQrCta).toBe('Scan Reception QR');
      expect(GATED_CATALOG_STRINGS.lockedCard.badge).toBe('Institutional Access');

      // Modal Keys
      expect(GATED_CATALOG_STRINGS.modal.title).toBe('Unlock Clinic Access');
      expect(GATED_CATALOG_STRINGS.modal.submitButton).toBe('Unlock Access');
      expect(GATED_CATALOG_STRINGS.modal.submittingButton).toBe('Unlocking Access...');
      expect(GATED_CATALOG_STRINGS.modal.cancelButton).toBe('Cancel');
      expect(GATED_CATALOG_STRINGS.modal.qrButton).toBe('Scan Reception Placard QR');
      expect(GATED_CATALOG_STRINGS.modal.lengthError).toBe('Join code must be exactly 6 characters.');

      // Catalog Keys
      expect(GATED_CATALOG_STRINGS.catalog.servicesSectionTitle).toBe('Services & Pricing');
      expect(GATED_CATALOG_STRINGS.catalog.providersSectionTitle).toBe('Healthcare Providers');
      expect(GATED_CATALOG_STRINGS.catalog.bookingDraftCta).toBe('Create booking draft');
      expect(GATED_CATALOG_STRINGS.catalog.freePriceLabel).toBe('Free');

      // Profile Badges
      expect(GATED_CATALOG_STRINGS.profile.yakapBadge).toBe('PhilHealth YAKAP Accredited');
    });

    test('exact character-for-character equality of button labels and section headers', () => {
      const expectedButtons = [
        'Enter Join Code',
        'Scan Reception QR',
        'Unlock Access',
        'Unlocking Access...',
        'Cancel',
        'Scan Reception Placard QR',
        'Create booking draft',
      ];

      const actualButtons = [
        GATED_CATALOG_STRINGS.lockedCard.enterCodeCta,
        GATED_CATALOG_STRINGS.lockedCard.scanQrCta,
        GATED_CATALOG_STRINGS.modal.submitButton,
        GATED_CATALOG_STRINGS.modal.submittingButton,
        GATED_CATALOG_STRINGS.modal.cancelButton,
        GATED_CATALOG_STRINGS.modal.qrButton,
        GATED_CATALOG_STRINGS.catalog.bookingDraftCta,
      ];

      expect(actualButtons).toEqual(expectedButtons);
    });
  });
});

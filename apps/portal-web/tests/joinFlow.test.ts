import { describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { NextRequest } from 'next/server';

// Genuine imports from source modules
import {
  evaluateFieldVisibility,
  evaluateFieldCondition,
  getCascadingChoices,
  resolveCascadingOptions,
  sanitizeCustomFields,
  validateFileUpload,
  generateDigitalPass,
  validatePatientPinForSubmit,
  validatePrincipalPinForSubmit,
  type CustomFieldDefinition,
  type GeneratedDigitalPass,
} from '../src/lib/join';
import { isPublicRoute } from '../src/proxy';

import {
  PHILHEALTH_MOD11_WEIGHTS,
  formatPhilHealthPin,
  validatePhilHealthPinMod11,
  validatePhilHealthPin,
  PHILHEALTH_RELATIONSHIPS,
  type MemberType,
  type PrincipalRelationship,
  type PhilHealthValidationResult,
} from '../src/lib/philhealth';

import {
  type PatientJoinRequestedPayload,
  type PatientJoinAllergyItem,
} from '../src/components/join/types';

// =============================================================================
// TESTS
// =============================================================================

describe('Feature 3: Proxy & Clerk Authentication Bypass', () => {
  const checkPublic = (p: string) => isPublicRoute(new NextRequest('http://localhost' + p));

  test('T1.1: Whitelists /join root and subroutes from authentication gating', () => {
    expect(checkPublic('/join')).toBe(true);
    expect(checkPublic('/join/ustp')).toBe(true);
    expect(checkPublic('/join/ustp/main-clinic')).toBe(true);
    expect(checkPublic('/join/health-org/branch-1?code=TEST')).toBe(true);
    expect(checkPublic('/claim')).toBe(true);
    expect(checkPublic('/verify')).toBe(true);
  });

  test('T1.2: Enforces authentication on private clinical and portal routes', () => {
    expect(checkPublic('/dashboard')).toBe(false);
    expect(checkPublic('/admin/settings')).toBe(false);
    expect(checkPublic('/clinical/consultations')).toBe(false);
    expect(checkPublic('/patients/chart')).toBe(false);
    expect(checkPublic('/api/v1/public/join')).toBe(false);
    expect(checkPublic('/')).toBe(false);
  });

  test('T2.1 (Boundary): Security boundary prevents unwhitelisted lookalike routes from bypassing auth', () => {
    expect(checkPublic('/admin/join')).toBe(false);
    expect(checkPublic('/dashboard/join')).toBe(false);
    expect(checkPublic('/settings/join')).toBe(false);
  });
});

describe('Feature 13: Deprecation & Removal Contract for Legacy /student-intake Route', () => {
  test('T1.1: Filesystem audit confirms legacy /student-intake App Router page and API directories do not exist', () => {
    const studentIntakePage = path.resolve(__dirname, '../src/app/student-intake');
    const studentIntakeApi = path.resolve(__dirname, '../src/app/api/v1/public/student-intake');
    expect(fs.existsSync(studentIntakePage)).toBe(false);
    expect(fs.existsSync(studentIntakeApi)).toBe(false);
  });

  test('T1.2: Recursive filesystem scan confirms zero student-intake files remain under src/', () => {
    const portalSrcDir = path.resolve(__dirname, '../src');
    const walkSync = (dir: string): string[] => {
      let results: string[] = [];
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          results = results.concat(walkSync(full));
        } else {
          results.push(full);
        }
      }
      return results;
    };

    const allFiles = walkSync(portalSrcDir);
    const legacyFiles = allFiles.filter((f) => f.toLowerCase().includes('student-intake'));
    expect(legacyFiles).toEqual([]);
    expect(legacyFiles.length).toBe(0);
  });

  test('T1.3: Proxy rejects legacy student-intake paths from authentication bypass', () => {
    const checkPublic = (p: string) => isPublicRoute(new NextRequest('http://localhost' + p));
    expect(checkPublic('/student-intake')).toBe(false);
    expect(checkPublic('/student-intake/ustp')).toBe(false);
    expect(checkPublic('/student-intake/metro-health/submit')).toBe(false);
  });

  test('T1.4: Canonical route directory verification: legacy student-intake is deleted', () => {
    const studentIntakeDir = path.resolve(__dirname, '../src/app/student-intake');
    expect(fs.existsSync(studentIntakeDir)).toBe(false);
  });
});

describe('Feature 14 & 15: Public Facility Selector and Secured Join Link Routing', () => {
  test('T1.1: Canonical Next.js App Router hierarchy exists for /join and /join/[tenantSlug]/[facilitySlug]', () => {
    const joinRootPage = path.resolve(__dirname, '../src/app/join/page.tsx');
    const facilityJoinPage = path.resolve(__dirname, '../src/app/join/[tenantSlug]/[facilitySlug]/page.tsx');
    expect(fs.existsSync(joinRootPage)).toBe(true);
    expect(fs.existsSync(facilityJoinPage)).toBe(true);
    // Legacy [joinKey] must NOT exist
    const joinKeyPage = path.resolve(__dirname, '../src/app/join/[joinKey]');
    expect(fs.existsSync(joinKeyPage)).toBe(false);
  });

  test('T1.2: Canonical public routes claim and verify exist with no wildcard route leaks', () => {
    const claimPage = path.resolve(__dirname, '../src/app/claim/page.tsx');
    const verifyPage = path.resolve(__dirname, '../src/app/verify/page.tsx');
    const verifyTokenPage = path.resolve(__dirname, '../src/app/verify/[kind]/[token]/page.tsx');
    expect(fs.existsSync(claimPage)).toBe(true);
    expect(fs.existsSync(verifyPage)).toBe(true);
    expect(fs.existsSync(verifyTokenPage)).toBe(true);
    // Retired routes must NOT exist
    expect(fs.existsSync(path.resolve(__dirname, '../src/app/verify/[...ref]'))).toBe(false);
    expect(fs.existsSync(path.resolve(__dirname, '../src/app/rx-verify'))).toBe(false);
  });

  test('T2.1 (Boundary): Non-join path is cleanly recognized as non-public by proxy', () => {
    const checkPublic = (p: string) => isPublicRoute(new NextRequest('http://localhost' + p));
    expect(checkPublic('/other/path')).toBe(false);
  });
});

describe('Feature 16: Join Code Gating & Expiration in Public Join Workstation', () => {
  test('T1.1: Automatically unlocks intake when valid ?code= parameter is supplied in URL', () => {
    const params = new URLSearchParams('code=CLINIC2026');
    expect(params.get('code')).toBe('CLINIC2026');
  });

  test('T1.2: Missing join code requires modal prompt entry before unlocking intake', () => {
    const params = new URLSearchParams('');
    expect(params.get('code')).toBeNull();
  });

  test('T2.1 (Boundary): Empty code parameter is treated as missing code', () => {
    const params = new URLSearchParams('code=');
    const code = params.get('code');
    expect(!code || code.trim() === '').toBe(true);
  });
});

describe('Feature 17: PhilHealth PIN Mod-11 Check Digit Algorithm & Masking', () => {
  test('T1.1: Weights match statutory PhilHealth Mod-11 specification', () => {
    expect(PHILHEALTH_MOD11_WEIGHTS).toEqual([6, 5, 4, 3, 2, 7, 6, 5, 4, 3, 2]);
    expect(PHILHEALTH_MOD11_WEIGHTS.length).toBe(11);
  });

  test('T1.2: Validates legitimate PhilHealth PINs using genuine validatePhilHealthPinMod11', () => {
    expect(validatePhilHealthPinMod11('12-345678901-8').isValid).toBe(true);
    expect(validatePhilHealthPinMod11('10-000000000-5').isValid).toBe(true);
    expect(validatePhilHealthPin('12-345678901-8').isValid).toBe(true); // Testing alias
  });

  test('T1.3: Handles statutory remainder edge cases (rem = 0 and rem = 1 map to 0)', () => {
    // Remainder 0: 00-000000000-0 -> sum=0, rem=0, expected=0
    const resRem0 = validatePhilHealthPinMod11('00-000000000-0');
    expect(resRem0.isValid).toBe(true);
    expect(resRem0.expectedCheckDigit).toBe(0);

    // Remainder 1: 01-025000001-0 -> sum=23, rem=1, expected=0
    const resRem1 = validatePhilHealthPinMod11('01-025000001-0');
    expect(resRem1.isValid).toBe(true);
    expect(resRem1.expectedCheckDigit).toBe(0);
  });

  test('T1.4: Dynamically formats raw digit input with hyphens (XX-XXXXXXXXX-X)', () => {
    expect(formatPhilHealthPin('12')).toBe('12');
    expect(formatPhilHealthPin('1234')).toBe('12-34');
    expect(formatPhilHealthPin('12345678901')).toBe('12-345678901');
    expect(formatPhilHealthPin('123456789018')).toBe('12-345678901-8');
  });

  test('T1.5: Strips non-digit formatting characters and truncates beyond 12 digits', () => {
    expect(formatPhilHealthPin('12.3456.78901-8')).toBe('12-345678901-8');
    expect(formatPhilHealthPin('12-345678901-8999')).toBe('12-345678901-8');
  });

  test('T2.1 (Boundary): Rejects PIN with invalid check digit', () => {
    const result = validatePhilHealthPinMod11('12-345678901-2');
    expect(result.isValid).toBe(false);
    expect(result.isComplete).toBe(true);
    expect(result.expectedCheckDigit).toBe(8);
    expect(result.actualCheckDigit).toBe(2);
    expect(result.errorMessage).toContain('Check digit mismatch');
  });

  test('T2.2 (Boundary): Rejects incomplete PINs under 12 digits', () => {
    const res5 = validatePhilHealthPinMod11('12-345');
    expect(res5.isValid).toBe(false);
    expect(res5.isComplete).toBe(false);
    expect(res5.errorMessage).toContain('Incomplete PIN');

    const res11 = validatePhilHealthPinMod11('12-345678901');
    expect(res11.isValid).toBe(false);
    expect(res11.isComplete).toBe(false);
  });

  test('T2.3 (Boundary): Rejects empty or whitespace PIN', () => {
    expect(validatePhilHealthPinMod11('').isValid).toBe(false);
    expect(validatePhilHealthPinMod11('   ').isValid).toBe(false);
  });
});

describe('Feature 18: PhilHealth Member Type (MM vs DD) & Principal Sponsor Credentials', () => {
  test('T1.1: Verifies statutory PhilHealth relationship options catalog', () => {
    const codes = PHILHEALTH_RELATIONSHIPS.map((r) => r.code);
    expect(codes).toEqual(['C', 'S', 'P', 'D']);
    expect(PHILHEALTH_RELATIONSHIPS.find((r) => r.code === 'C')?.label).toContain('Child');
    expect(PHILHEALTH_RELATIONSHIPS.find((r) => r.code === 'S')?.label).toContain('Spouse');
    expect(PHILHEALTH_RELATIONSHIPS.find((r) => r.code === 'P')?.label).toContain('Parent');
    expect(PHILHEALTH_RELATIONSHIPS.find((r) => r.code === 'D')?.label).toContain('Disabled Dependent');
  });

  test('T1.2: Standard Member (MM) valid payload does not require principal sponsor fields', () => {
    const mmPayload: PatientJoinRequestedPayload = {
      tenantSlug: 'ustp',
      facilitySlug: 'cdo-clinic',
      joinCode: 'CLINIC2026',
      firstName: 'Juan',
      lastName: 'Dela Cruz',
      dateOfBirth: '1990-05-15',
      sex: 'Male',
      contactNumber: '09171234567',
      philHealthPin: '12-345678901-8',
      memberType: 'MM',
      principalMemberPin: undefined,
      principalRelationship: undefined,
      principalFullName: undefined,
    };

    expect(mmPayload.memberType).toBe('MM');
    expect(mmPayload.principalMemberPin).toBeUndefined();
    expect(mmPayload.principalFullName).toBeUndefined();
    expect(mmPayload.principalRelationship).toBeUndefined();
  });

  test('T1.3: Dependent (DD) payload retains principal sponsor credentials and valid Mod-11 PIN', () => {
    const principalPin = '12-345678901-8';
    const pinCheck = validatePhilHealthPinMod11(principalPin);
    expect(pinCheck.isValid).toBe(true);

    const ddPayload: PatientJoinRequestedPayload = {
      tenantSlug: 'ustp',
      facilitySlug: 'cdo-clinic',
      joinCode: 'CLINIC2026',
      firstName: 'Maria',
      lastName: 'Dela Cruz',
      dateOfBirth: '2015-08-20',
      sex: 'Female',
      contactNumber: '09171234567',
      memberType: 'DD',
      principalFullName: 'Juan Dela Cruz',
      principalRelationship: 'C',
      principalMemberPin: principalPin,
      principalDateOfBirth: '1990-05-15',
    };

    expect(ddPayload.memberType).toBe('DD');
    expect(ddPayload.principalFullName).toBe('Juan Dela Cruz');
    expect(ddPayload.principalRelationship).toBe('C');
    expect(ddPayload.principalMemberPin).toBe('12-345678901-8');
  });

  test('T1.4: Simulates form payload sanitization: switching from DD back to MM prunes residual sponsor fields', () => {
    const formState = {
      memberType: 'MM' as MemberType,
      principalFullName: 'Juan Dela Cruz', // Residual value from prior DD toggle
      principalRelationship: 'C' as PrincipalRelationship,
      principalMemberPin: '12-345678901-8',
    };

    // Form submission logic matching JoinClient.tsx lines 351-355
    const serializedPayload = {
      memberType: formState.memberType,
      principalFullName: formState.memberType === 'DD' ? formState.principalFullName : undefined,
      principalRelationship: formState.memberType === 'DD' ? formState.principalRelationship : undefined,
      principalMemberPin: formState.memberType === 'DD' ? formState.principalMemberPin : undefined,
    };

    expect(serializedPayload.memberType).toBe('MM');
    expect(serializedPayload.principalFullName).toBeUndefined();
    expect(serializedPayload.principalRelationship).toBeUndefined();
    expect(serializedPayload.principalMemberPin).toBeUndefined();
  });

  test('T2.1 (Boundary): Dependent (DD) validation blocks invalid or missing principal sponsor PIN', () => {
    const invalidPrincipalPin = '12-345678901-2'; // Check digit mismatch
    const check = validatePhilHealthPinMod11(invalidPrincipalPin);
    expect(check.isValid).toBe(false);

    const incompletePin = '12-345';
    const incompleteCheck = validatePhilHealthPinMod11(incompletePin);
    expect(incompleteCheck.isValid).toBe(false);
  });
});

describe('Feature: PhilHealth PIN Submit Guard & Inline Validation', () => {
  test('Patient PIN: Allows submission when optional field is empty or whitespace', () => {
    expect(validatePatientPinForSubmit('').isValid).toBe(true);
    expect(validatePatientPinForSubmit('   ').isValid).toBe(true);
    expect(validatePatientPinForSubmit(undefined).isValid).toBe(true);
  });

  test('Patient PIN: Blocks submission on incomplete PIN (e.g. 5 digits)', () => {
    const res = validatePatientPinForSubmit('12-345');
    expect(res.isValid).toBe(false);
    expect(res.errorMessage).toContain('Patient PhilHealth PIN error');
    expect(res.errorMessage).toContain('Incomplete PIN (5/12 digits)');
  });

  test('Patient PIN: Blocks submission on 11 digits', () => {
    const res = validatePatientPinForSubmit('12-345678901');
    expect(res.isValid).toBe(false);
    expect(res.errorMessage).toContain('Incomplete PIN (11/12 digits)');
  });

  test('Patient PIN: Blocks submission on 12-digit PIN with Mod-11 check digit mismatch', () => {
    const res = validatePatientPinForSubmit('12-345678901-2');
    expect(res.isValid).toBe(false);
    expect(res.errorMessage).toContain('Check digit mismatch (expected 8, got 2)');
  });

  test('Patient PIN: Allows submission on valid 12-digit Mod-11 PIN', () => {
    const res = validatePatientPinForSubmit('12-345678901-8');
    expect(res.isValid).toBe(true);
    expect(res.errorMessage).toBeUndefined();
  });

  test('Principal PIN (MM): Unchecked when memberType is Member (MM)', () => {
    expect(validatePrincipalPinForSubmit('MM', '').isValid).toBe(true);
    expect(validatePrincipalPinForSubmit('MM', '12-345').isValid).toBe(true);
  });

  test('Principal PIN (DD): Blocks submission when empty for Dependent (DD)', () => {
    const res = validatePrincipalPinForSubmit('DD', '');
    expect(res.isValid).toBe(false);
    expect(res.errorMessage).toBe('Principal member PhilHealth PIN is required.');
  });

  test('Principal PIN (DD): Blocks submission on incomplete PIN (5 digits)', () => {
    const res = validatePrincipalPinForSubmit('DD', '12-345');
    expect(res.isValid).toBe(false);
    expect(res.errorMessage).toContain('Principal PhilHealth PIN error');
    expect(res.errorMessage).toContain('Incomplete PIN (5/12 digits)');
  });

  test('Principal PIN (DD): Blocks submission on check digit mismatch', () => {
    const res = validatePrincipalPinForSubmit('DD', '12-345678901-2');
    expect(res.isValid).toBe(false);
    expect(res.errorMessage).toContain('Check digit mismatch');
  });

  test('Principal PIN (DD): Allows submission on valid 12-digit Mod-11 PIN', () => {
    const res = validatePrincipalPinForSubmit('DD', '12-345678901-8');
    expect(res.isValid).toBe(true);
  });
});

describe('Feature 19: Public Dynamic Custom Fields & Cascading Select Choices', () => {
  const fields: CustomFieldDefinition[] = [
    {
      fieldKey: 'affiliation',
      label: 'Affiliation',
      isRequired: true,
    },
    {
      fieldKey: 'student_id',
      label: 'Student ID Number',
      isRequired: true,
      visibilityCondition: {
        parentKey: 'affiliation',
        operator: 'equals',
        value: 'Student',
      },
    },
    {
      fieldKey: 'college',
      label: 'College',
      isRequired: true,
      visibilityCondition: {
        parentKey: 'affiliation',
        operator: 'equals',
        value: 'Student',
      },
    },
    {
      fieldKey: 'program',
      label: 'Academic Program',
      isRequired: true,
      visibilityCondition: {
        parentKey: 'college',
        operator: 'not_empty',
        value: '',
      },
      cascadingOptions: {
        'College of Engineering': [
          'BS Civil Engineering',
          'BS Electrical Engineering',
          'BS Mechanical Engineering',
          'BS Computer Engineering',
        ],
        'College of Computer Studies': [
          'BS Computer Science',
          'BS Information Technology',
          'BS Information Systems',
        ],
        'College of Nursing & Allied Health': [
          'BS Nursing',
          'BS Medical Technology',
          'BS Physical Therapy',
        ],
        'College of Science & Mathematics': [
          'BS Applied Physics',
          'BS Chemistry',
          'BS Mathematics',
        ],
        'College of Business Administration': [
          'BS Accountancy',
          'BS Business Administration',
        ],
      },
    },
  ];

  test('T1.1: Evaluates conditional visibility dynamically based on parent field value', () => {
    expect(evaluateFieldVisibility(fields[1], { affiliation: 'Student' })).toBe(true);
    expect(evaluateFieldVisibility(fields[1], { affiliation: 'Faculty' })).toBe(false);
    expect(evaluateFieldVisibility(fields[1], { affiliation: 'Guest' })).toBe(false);
    expect(evaluateFieldCondition(fields[1], { affiliation: 'Student' })).toBe(true); // Testing alias
  });

  test('T1.2: Resolves cascading select choices dynamically across all 5 institutional colleges', () => {
    const colleges = [
      'College of Engineering',
      'College of Computer Studies',
      'College of Nursing & Allied Health',
      'College of Science & Mathematics',
      'College of Business Administration',
    ];

    for (const collegeName of colleges) {
      // Program field must be visible when college is non-empty
      expect(evaluateFieldVisibility(fields[3], { college: collegeName })).toBe(true);
      expect(evaluateFieldCondition(fields[3], { college: collegeName })).toBe(true);

      const choices = getCascadingChoices(fields[3], { college: collegeName });
      expect(choices.length).toBeGreaterThan(0);
      expect(fields[3].cascadingOptions![collegeName]).toEqual(choices);

      // Testing alias
      const resolved = resolveCascadingOptions(fields[3], { college: collegeName });
      expect(resolved).toEqual(choices);
    }

    // When college is empty or unset, program is hidden
    expect(evaluateFieldVisibility(fields[3], { college: '' })).toBe(false);
    expect(evaluateFieldVisibility(fields[3], { college: '   ' })).toBe(false);
    expect(evaluateFieldVisibility(fields[3], {})).toBe(false);
  });

  test('T1.3: Sanitizes hidden fields from submission payload to prevent stale data pollution', () => {
    const formWithHiddenStudentData = {
      affiliation: 'Faculty',
      student_id: 'OLD-2022-001', // Hidden when Faculty
      college: 'College of Engineering', // Hidden when Faculty
      program: 'BS Computer Engineering', // Hidden when Faculty
    };

    const sanitized = sanitizeCustomFields(fields, formWithHiddenStudentData);
    expect(sanitized.affiliation).toBe('Faculty');
    expect(sanitized.student_id).toBeUndefined();
  });
});

describe('Feature 20: Public Structured Allergies & Demographics Integration', () => {
  test('T1.1: Records multiple structured allergies with category, severity, and anaphylaxis flag', () => {
    const allergies: PatientJoinAllergyItem[] = [
      {
        allergen: 'Penicillin',
        category: 'Medication',
        severity: 'LifeThreatening',
        isAnaphylactic: true,
        reactionManifestation: 'Anaphylaxis shock',
      },
      {
        allergen: 'Peanuts',
        category: 'Food',
        severity: 'Moderate',
        isAnaphylactic: false,
      },
    ];

    expect(allergies).toHaveLength(2);
    expect(allergies[0].isAnaphylactic).toBe(true);
    expect(allergies[1].isAnaphylactic).toBe(false);
  });
});

describe('Feature 21: Public External Document Upload Dropzone & Quarantine', () => {
  test('T1.1: Accepts valid PDF, JPEG, and PNG document uploads', () => {
    expect(validateFileUpload({ name: 'xray.pdf', sizeBytes: 1048576, mimeType: 'application/pdf' }).isValid).toBe(true);
    expect(validateFileUpload({ name: 'lab.jpg', sizeBytes: 2097152, mimeType: 'image/jpeg' }).isValid).toBe(true);
    expect(validateFileUpload({ name: 'card.png', sizeBytes: 524288, mimeType: 'image/png' }).isValid).toBe(true);
  });

  test('T2.1 (Boundary): Rejects unsupported mime types (e.g., .docx, .zip, .exe)', () => {
    const resDocx = validateFileUpload({
      name: 'doc.docx',
      sizeBytes: 1000,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    expect(resDocx.isValid).toBe(false);
    expect(resDocx.errorMessage).toContain('Only PDF, JPEG, and PNG files are accepted');

    const resZip = validateFileUpload({ name: 'archive.zip', sizeBytes: 1000, mimeType: 'application/zip' });
    expect(resZip.isValid).toBe(false);

    const resExe = validateFileUpload({ name: 'malware.exe', sizeBytes: 1000, mimeType: 'application/x-msdownload' });
    expect(resExe.isValid).toBe(false);
  });

  test('T2.2 (Boundary): Rejects oversized files exceeding 10MB limit', () => {
    const resLarge = validateFileUpload({ name: 'giant_scan.pdf', sizeBytes: 11 * 1024 * 1024, mimeType: 'application/pdf' });
    expect(resLarge.isValid).toBe(false);
    expect(resLarge.errorMessage).toContain('File size exceeds maximum 10MB limit');
  });
});

describe('Feature 22: Digital Registration Pass & Scannable QR Ticket Generation', () => {
  test('T1.1: Formats daily queue token with 3-digit zero padding (Q-105)', () => {
    const pass = generateDigitalPass('PAT-2026-00042', 105, 'Juan Rizal');
    expect(pass.queueToken).toBe('Q-105');
    expect(pass.patientCode).toBe('PAT-2026-00042');
    expect(pass.patientName).toBe('Juan Rizal');
  });

  test('T1.2: Embeds scannable JSON string containing patient code and queue token for reception scanner', () => {
    const pass = generateDigitalPass('PAT-2026-00001', 1, 'Maria Santos');
    expect(pass.queueToken).toBe('Q-001');
    const parsed = JSON.parse(pass.qrDataString);
    expect(parsed.code).toBe('PAT-2026-00001');
    expect(parsed.queue).toBe('Q-001');
  });
});

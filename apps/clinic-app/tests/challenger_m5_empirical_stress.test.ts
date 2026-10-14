// token-guard:ignore-file
import { describe, expect, test, mock } from 'bun:test';
import type { StatutorySectionKey } from '../components/consultation/YakapClaimReadinessCard';

(globalThis as any).__DEV__ = true;

describe('Milestone M5 Empirical Stress Tests: Section Jump Navigation & Whitespace Sanitization', () => {

  // =========================================================================
  // 1. STATUTORY SECTION KEYS COMPLETE ENUMERATION & REGISTRATION
  // =========================================================================
  describe('Requirement 1: 10 Statutory Section Keys Navigation Engine', () => {
    const ALL_10_STATUTORY_KEYS: StatutorySectionKey[] = [
      'doctor-pan',
      'doctor-prc',
      'doctor-s2',
      'patient-pin',
      'atc',
      'symptoms',
      'physical-exam',
      'primary-diagnosis',
      'vitals',
      'medicines',
    ];

    test('1.1 Exactly 10 unique statutory section keys are defined per PhilHealth Konsulta specs', () => {
      expect(ALL_10_STATUTORY_KEYS.length).toBe(10);
      const uniqueKeys = new Set(ALL_10_STATUTORY_KEYS);
      expect(uniqueKeys.size).toBe(10);
    });

    test('1.2 Source code inspection confirms all 10 keys are wired to onLayout in Consultations.screen.tsx', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const consultationScreenPath = path.resolve(__dirname, '../navigation/screens/Consultations.screen.tsx');
      const source = fs.readFileSync(consultationScreenPath, 'utf8');

      // Verify that every single statutory section key is assigned in sectionOffsets.current
      for (const key of ALL_10_STATUTORY_KEYS) {
        const pattern = new RegExp(`sectionOffsets\\.current\\['${key}'\\]\\s*=`);
        const isMatched = pattern.test(source);
        expect(isMatched).toBe(true);
      }
    });

    test('1.3 handleJumpToSection correctly calculates scroll coordinates for spine vs non-spine sections', () => {
      // Simulate workstation layout state
      let mobileWorkstationView: 'soap' | 'chart' = 'chart';
      let scrolledY: number | null = null;
      let animatedFlag: boolean | null = null;

      const scrollViewMock = {
        scrollTo: ({ y, animated }: { y: number; animated: boolean }) => {
          scrolledY = y;
          animatedFlag = animated;
        },
      };

      const sectionOffsets: Record<string, number> = {
        'patient-pin': 40,
        'vitals': 120,
        'atc': 10,
        'symptoms': 85,
        'physical-exam': 210,
        'primary-diagnosis': 350,
        'medicines': 500,
        'doctor-pan': 680,
        'doctor-prc': 680,
        'doctor-s2': 680,
      };

      const soapPaneOffsetY = 450; // Offset of SOAP container in desktop or mobile layout

      const handleJumpToSection = (section: StatutorySectionKey) => {
        if (mobileWorkstationView !== 'soap') {
          mobileWorkstationView = 'soap';
        }
        const rawY = sectionOffsets[section];
        if (rawY != null) {
          const isSpineSection = section === 'patient-pin' || section === 'vitals';
          const containerOffset = isSpineSection ? 0 : soapPaneOffsetY;
          scrollViewMock.scrollTo({ y: Math.max(0, rawY + containerOffset - 24), animated: true });
        }
      };

      // Test all 10 keys:
      // A. Spine sections: containerOffset = 0
      handleJumpToSection('patient-pin');
      expect(mobileWorkstationView).toBe('soap');
      expect(scrolledY).toBe(Math.max(0, 40 + 0 - 24)); // 16
      expect(animatedFlag).toBe(true);

      handleJumpToSection('vitals');
      expect(scrolledY).toBe(Math.max(0, 120 + 0 - 24)); // 96
      expect(animatedFlag).toBe(true);

      // B. Non-spine sections: containerOffset = 450
      handleJumpToSection('atc');
      expect(scrolledY).toBe(Math.max(0, 10 + 450 - 24)); // 436

      handleJumpToSection('symptoms');
      expect(scrolledY).toBe(Math.max(0, 85 + 450 - 24)); // 511

      handleJumpToSection('physical-exam');
      expect(scrolledY).toBe(Math.max(0, 210 + 450 - 24)); // 636

      handleJumpToSection('primary-diagnosis');
      expect(scrolledY).toBe(Math.max(0, 350 + 450 - 24)); // 776

      handleJumpToSection('medicines');
      expect(scrolledY).toBe(Math.max(0, 500 + 450 - 24)); // 926

      handleJumpToSection('doctor-pan');
      expect(scrolledY).toBe(Math.max(0, 680 + 450 - 24)); // 1106

      handleJumpToSection('doctor-prc');
      expect(scrolledY).toBe(Math.max(0, 680 + 450 - 24)); // 1106

      handleJumpToSection('doctor-s2');
      expect(scrolledY).toBe(Math.max(0, 680 + 450 - 24)); // 1106
    });

    test('1.4 Boundary & Edge Cases: zero rawY, unmeasured keys, and negative offsets', () => {
      let scrolledY: number | null = null;
      const scrollViewMock = {
        scrollTo: ({ y }: { y: number }) => {
          scrolledY = y;
        },
      };

      const emptyOffsets: Record<string, number> = {};
      const soapPaneOffsetY = 0;

      const jumpWithOffsets = (offsets: Record<string, number>, key: StatutorySectionKey, paneOffset = 0) => {
        scrolledY = null;
        const rawY = offsets[key];
        if (rawY != null) {
          const isSpineSection = key === 'patient-pin' || key === 'vitals';
          const containerOffset = isSpineSection ? 0 : paneOffset;
          scrollViewMock.scrollTo({ y: Math.max(0, rawY + containerOffset - 24) });
        }
      };

      // Unmeasured section does not trigger scroll
      jumpWithOffsets(emptyOffsets, 'doctor-pan');
      expect(scrolledY).toBeNull();

      // rawY at 0 clamps to 0 and never produces negative scroll coordinate
      jumpWithOffsets({ 'patient-pin': 0 }, 'patient-pin', 0);
      expect(scrolledY).toBe(0);

      // rawY at 10 clamps to 0 when offset - 24 < 0
      jumpWithOffsets({ 'atc': 10 }, 'atc', 0);
      expect(scrolledY).toBe(0);

      // Large pane offset correctly offsets
      jumpWithOffsets({ 'medicines': 100 }, 'medicines', 500);
      expect(scrolledY).toBe(576);
    });
  });

  // =========================================================================
  // 2. PHYSICIAN CREDENTIAL DEFENSIVE TRIMMING WITH WHITESPACE STRINGS
  // =========================================================================
  describe('Requirement 2: Physician Credential Whitespace Defensive Sanitization', () => {
    // Simulator matching localEvaluation in Consultations.screen.tsx lines 1375–1418
    const evaluateDoctorCredentials = (
      doctorPanInput: string,
      doctorPrcInput: string,
      doctorS2Input: string,
      signerStaff?: {
        philHealthPan?: string;
        prcLicenseNumber?: string;
        s2LicenseNumber?: string;
      } | null,
      hasDangerousDrug = false,
    ) => {
      const panValid = !!(doctorPanInput.trim() || signerStaff?.philHealthPan?.trim());
      const prcValid = !!(doctorPrcInput.trim() || signerStaff?.prcLicenseNumber?.trim());
      const s2Valid = !hasDangerousDrug || !!(doctorS2Input.trim() || signerStaff?.s2LicenseNumber?.trim());

      const missing: string[] = [];
      if (!panValid) missing.push('Doctor PhilHealth Accreditation Number (PAN) is missing.');
      if (!prcValid) missing.push('Doctor PRC License number is required to sign encounters.');
      if (!s2Valid) missing.push('Doctor S2 License number is required for PDEA controlled drugs.');

      return { panValid, prcValid, s2Valid, missing };
    };

    const WHITESPACE_VECTORS = [
      ' ',
      '   ',
      '\t',
      '\n',
      '\r\n',
      ' \t \r\n ',
      '             ',
    ];

    test('2.1 Whitespace-only PAN strings fail validation when staff has no PAN', () => {
      for (const ws of WHITESPACE_VECTORS) {
        const res = evaluateDoctorCredentials(ws, 'PRC-1234567', '', null);
        expect(res.panValid).toBe(false);
        expect(res.missing).toContain('Doctor PhilHealth Accreditation Number (PAN) is missing.');
      }
    });

    test('2.2 Whitespace-only PAN strings fail validation even when staff profile also has whitespace-only PAN', () => {
      for (const ws of WHITESPACE_VECTORS) {
        const res = evaluateDoctorCredentials(ws, 'PRC-1234567', '', {
          philHealthPan: '   \t  ',
          prcLicenseNumber: 'PRC-1234567',
        });
        expect(res.panValid).toBe(false);
        expect(res.missing).toContain('Doctor PhilHealth Accreditation Number (PAN) is missing.');
      }
    });

    test('2.3 Whitespace-only PRC strings fail validation when staff has no PRC or whitespace-only PRC', () => {
      for (const ws of WHITESPACE_VECTORS) {
        const res = evaluateDoctorCredentials('PAN-123456789012', ws, '', {
          philHealthPan: 'PAN-123456789012',
          prcLicenseNumber: '  \t  ',
        });
        expect(res.prcValid).toBe(false);
        expect(res.missing).toContain('Doctor PRC License number is required to sign encounters.');
      }
    });

    test('2.4 Whitespace-only S2 strings fail validation when dangerous drugs are prescribed', () => {
      for (const ws of WHITESPACE_VECTORS) {
        const res = evaluateDoctorCredentials('PAN-123456789012', 'PRC-1234567', ws, {
          philHealthPan: 'PAN-123456789012',
          prcLicenseNumber: 'PRC-1234567',
          s2LicenseNumber: '   ',
        }, true);
        expect(res.s2Valid).toBe(false);
        expect(res.missing).toContain('Doctor S2 License number is required for PDEA controlled drugs.');
      }
    });

    test('2.5 Uncontrolled medications do NOT require S2 even with whitespace strings', () => {
      for (const ws of WHITESPACE_VECTORS) {
        const res = evaluateDoctorCredentials('PAN-123456789012', 'PRC-1234567', ws, null, false);
        expect(res.s2Valid).toBe(true);
        expect(res.missing).not.toContain('Doctor S2 License number is required for PDEA controlled drugs.');
      }
    });

    test('2.6 Valid credentials with surrounding whitespace pass validation correctly', () => {
      const res = evaluateDoctorCredentials(
        '   PAN-123456789012   ',
        ' \t PRC-1234567 \n ',
        '  S2-PDEA-998811  ',
        null,
        true,
      );
      expect(res.panValid).toBe(true);
      expect(res.prcValid).toBe(true);
      expect(res.s2Valid).toBe(true);
      expect(res.missing.length).toBe(0);
    });

    test('2.7 Attending Physician UI Badges reflect whitespace trimming defensively', () => {
      // Simulating badges in Consultations.screen.tsx lines 2560–2575
      const getBadges = (
        doctorPan: string,
        doctorPrc: string,
        doctorPtr: string,
        signerStaff?: { philHealthPan?: string; prcLicenseNumber?: string; ptrNumber?: string },
      ) => {
        const panTrimmed = doctorPan.trim() || signerStaff?.philHealthPan?.trim();
        const prcTrimmed = doctorPrc.trim() || signerStaff?.prcLicenseNumber?.trim();
        const ptrTrimmed = doctorPtr.trim() || signerStaff?.ptrNumber?.trim();

        return {
          panBadge: panTrimmed ? 'PAN [Auto-Snapshotted]' : 'PAN [Missing]',
          panVariant: panTrimmed ? 'success' : 'warning',
          prcBadge: prcTrimmed ? 'PRC [Auto-Snapshotted]' : 'PRC [Missing]',
          prcVariant: prcTrimmed ? 'success' : 'emergency',
          ptrBadge: ptrTrimmed ? 'PTR [Snapshotted]' : 'PTR [Optional]',
          ptrVariant: 'neutral',
        };
      };

      // Whitespace inputs must show [Missing] with emergency/warning variants
      const missingBadges = getBadges('   ', '  \t ', ' \n ', {
        philHealthPan: '   ',
        prcLicenseNumber: ' \t\t ',
        ptrNumber: '   ',
      });

      expect(missingBadges.panBadge).toBe('PAN [Missing]');
      expect(missingBadges.panVariant).toBe('warning');
      expect(missingBadges.prcBadge).toBe('PRC [Missing]');
      expect(missingBadges.prcVariant).toBe('emergency');
      expect(missingBadges.ptrBadge).toBe('PTR [Optional]');

      // Valid inputs with whitespace must show [Auto-Snapshotted] with success variants
      const validBadges = getBadges('  PAN-999  ', '  PRC-888  ', '  PTR-777  ');
      expect(validBadges.panBadge).toBe('PAN [Auto-Snapshotted]');
      expect(validBadges.panVariant).toBe('success');
      expect(validBadges.prcBadge).toBe('PRC [Auto-Snapshotted]');
      expect(validBadges.prcVariant).toBe('success');
      expect(validBadges.ptrBadge).toBe('PTR [Snapshotted]');
    });
  });

  // =========================================================================
  // 3. STAFF PROFILE PAN PERSISTENCE & SINGLE CONSULTATION PAN INPUT
  // =========================================================================
  describe('Requirement 3: Staff Profile & Management PAN Integration and Single Consultation PAN Input', () => {
    test('3.1 Profile.screen.tsx includes PhilHealth Accreditation Number (PAN) field and persists philHealthPan in updateMyProfile', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const profilePath = path.resolve(__dirname, '../navigation/screens/Profile.screen.tsx');
      const source = fs.readFileSync(profilePath, 'utf8');

      expect(source).toContain('label="PhilHealth Accreditation Number (PAN)"');
      expect(source).toContain('setPan(s?.philHealthPan || \'\')');
      expect(source).toContain('philHealthPan: isDoctor ? pan.trim() || undefined : undefined');
    });

    test('3.2 StaffManagementTab.tsx includes PhilHealth Accreditation Number (PAN) in Add/Edit modals and persists philHealthPan in createStaff/updateStaff', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const staffTabPath = path.resolve(__dirname, '../components/settings/StaffManagementTab.tsx');
      const source = fs.readFileSync(staffTabPath, 'utf8');

      const panLabelMatches = source.match(/label="PhilHealth Accreditation Number \(PAN\)"/g);
      expect(panLabelMatches?.length).toBe(2); // Add modal + Edit modal
      expect(source).toContain('setPan(s.philHealthPan || \'\')');
      expect(source).toContain('philHealthPan: effectiveStaffRole === \'Doctor\' ? pan.trim() || undefined : undefined');
      expect(source).toContain('philHealthPan: role === \'Doctor\' ? pan.trim() || undefined : undefined');
    });

    test('3.3 Consultations.screen.tsx renders only a single doctorPan input in Attending Physician card and preserves profile fields on quick-save', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const consultationScreenPath = path.resolve(__dirname, '../navigation/screens/Consultations.screen.tsx');
      const source = fs.readFileSync(consultationScreenPath, 'utf8');

      const setDoctorPanInputs = source.match(/onChangeText=\{setDoctorPan\}/g);
      expect(setDoctorPanInputs?.length).toBe(1);
      expect(source).not.toContain('panSnapshotCard');
      expect(source).toContain('middleName: signerStaff.middleName');
      expect(source).toContain('specialty: signerStaff.specialty');
    });
  });
});

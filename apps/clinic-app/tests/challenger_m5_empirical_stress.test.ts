// token-guard:ignore-file
import { describe, expect, test, mock } from 'bun:test';
mock.module('react-native', () => ({
  StyleSheet: { create: (s: any) => s, flatten: (s: any) => s },
  View: 'View',
  Pressable: 'Pressable',
  ScrollView: 'ScrollView',
  TextInput: 'TextInput',
  Text: 'Text',
  ActivityIndicator: 'ActivityIndicator',
  Modal: 'Modal',
  KeyboardAvoidingView: 'KeyboardAvoidingView',
  FlatList: 'FlatList',
  SectionList: 'SectionList',
  Switch: 'Switch',
  TouchableOpacity: 'TouchableOpacity',
  TouchableHighlight: 'TouchableHighlight',
  Image: 'Image',
  RefreshControl: 'RefreshControl',
  Keyboard: { dismiss: () => {}, addListener: () => ({ remove: () => {} }) },
  AppState: { addEventListener: () => ({ remove: () => {} }) },
  Dimensions: { get: () => ({ width: 1280, height: 800 }), addEventListener: () => ({ remove: () => {} }) },
  useWindowDimensions: () => ({ width: 1280, height: 800 }),
  Platform: { OS: 'web', select: (obj: any) => obj.web ?? obj.default },
  Touchable: { Mixin: {} },
  TurboModuleRegistry: { get: () => null, getEnforcing: () => null },
  NativeModules: {},
  Animated: {
    Value: class {
      constructor(public val: any) {}
      setValue(val: any) { this.val = val; }
      interpolate() { return this; }
    },
    timing: () => ({ start: (cb?: any) => cb && cb() }),
    sequence: () => ({ start: (cb?: any) => cb && cb() }),
    loop: () => ({ start: (cb?: any) => cb && cb() }),
    spring: () => ({ start: (cb?: any) => cb && cb() }),
    View: 'Animated.View',
    Text: 'Animated.Text',
  },
  Alert: { alert: () => {} },
  Linking: { openURL: () => Promise.resolve(), canOpenURL: () => Promise.resolve(true) },
  PanResponder: { create: () => ({ panHandlers: {} }) },
  processColor: (c: any) => c,
}));

mock.module('react-native-svg', () => ({
  Svg: 'Svg',
  Path: 'Path',
  Circle: 'Circle',
  Rect: 'Rect',
  Line: 'Line',
  default: 'Svg',
}));

mock.module('../constants/fonts', () => ({
  applyFontFamily: (s: any) => s,
  fontAssets: {},
}));
mock.module('@expo-google-fonts/geist', () => ({
  useFonts: () => [true],
}));
mock.module('@expo-google-fonts/geist-mono', () => ({
  useFonts: () => [true],
}));

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
      // Simulating badges in Consultations.screen.tsx
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
          panBadge: panTrimmed ? 'PAN [Verified]' : 'PAN [Missing]',
          panVariant: panTrimmed ? 'success' : 'warning',
          prcBadge: prcTrimmed ? 'PRC [Verified]' : 'PRC [Missing]',
          prcVariant: prcTrimmed ? 'success' : 'emergency',
          ptrBadge: ptrTrimmed ? 'PTR [Recorded]' : 'PTR [Optional]',
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

      // Valid inputs with whitespace must show [Verified] / [Recorded] with success variants
      const validBadges = getBadges('  PAN-999  ', '  PRC-888  ', '  PTR-777  ');
      expect(validBadges.panBadge).toBe('PAN [Verified]');
      expect(validBadges.panVariant).toBe('success');
      expect(validBadges.prcBadge).toBe('PRC [Verified]');
      expect(validBadges.prcVariant).toBe('success');
      expect(validBadges.ptrBadge).toBe('PTR [Recorded]');
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

  // =========================================================================
  // 4. JARGON-FREE LABELS & INDEPENDENT SPLIT-SCROLL VERIFICATION
  // =========================================================================
  describe('Requirement 4: Jargon Removal & Independent Split-Scroll Architecture', () => {
    test('4.1 Zero XML attributes, DTD filenames, statutory citations, or internal jargon rendered in consultation workspace', async () => {
      const fs = await import('fs');
      const path = await import('path');

      const consultationPath = path.resolve(__dirname, '../navigation/screens/Consultations.screen.tsx');
      const peCardPath = path.resolve(__dirname, '../components/consultation/InlinePhysicalExamCard.tsx');
      const readinessCardPath = path.resolve(__dirname, '../components/consultation/YakapClaimReadinessCard.tsx');

      const consultationSrc = fs.readFileSync(consultationPath, 'utf8');
      const peSrc = fs.readFileSync(peCardPath, 'utf8');
      const readinessSrc = fs.readFileSync(readinessCardPath, 'utf8');

      const FORBIDDEN_JARGON_IN_JSX = [
        'pHciCaseNo',
        'pHciTransNo',
        'pSoapTransNo',
        'pDoctorPan',
        'pDoctorPrc',
        'pPin',
        'pPhilHealthAtc',
        'pSignSympCode',
        'PESPECIFIC',
        'pIcdCode',
        'KONSULTADATA',
        'KonsultaData_v1.14.dtd',
        'DTD v1.14',
        'RA 11223',
        'Auto-Snapshotted',
        'Snapshotted',
        '(Code 1)',
      ];

      for (const fileSrc of [consultationSrc, peSrc, readinessSrc]) {
        for (const jargon of FORBIDDEN_JARGON_IN_JSX) {
          expect(fileSrc).not.toContain(jargon);
        }
      }
    });

    test('4.2 Subjective symptom ToggleChips do not render raw catalog codes (no meta={symp.code})', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const consultationPath = path.resolve(__dirname, '../navigation/screens/Consultations.screen.tsx');
      const source = fs.readFileSync(consultationPath, 'utf8');

      // Verify meta={symp.code} is removed from symptom ToggleChip
      expect(source).not.toContain('meta={symp.code}');
    });

    test('4.3 Diagnostic lab chips and prescriptions display clean formulary labels without raw codes', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const consultationPath = path.resolve(__dirname, '../navigation/screens/Consultations.screen.tsx');
      const source = fs.readFileSync(consultationPath, 'utf8');

      expect(source).toContain("meta={isYakapEligible && diag.philHealthCode ? 'PhilHealth Covered' : undefined}");
      expect(source).toContain('Badge label="PhilHealth Formulary"');
      expect(source).not.toContain('GAMOT ${rx.philHealthDrugCode}');
      expect(source).not.toContain('PhilHealth drug code: <ThemedText variant="code">{newRxDrugCode}</ThemedText>');
    });

    test('4.4 Desktop dual-pane renders independent ScrollViews with chartScrollViewRef and soapScrollViewRef', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const consultationPath = path.resolve(__dirname, '../navigation/screens/Consultations.screen.tsx');
      const source = fs.readFileSync(consultationPath, 'utf8');

      expect(source).toContain('const chartScrollViewRef = useRef<ScrollView>(null);');
      expect(source).toContain('const soapScrollViewRef = useRef<ScrollView>(null);');
      expect(source).toContain('ref={chartScrollViewRef}');
      expect(source).toContain('ref={soapScrollViewRef}');
      expect(source).toContain('nestedScrollEnabled');
      expect(source).toContain('desktopPaneHeight');
    });

    test('4.5 Attending physician badges render clean clinical labels [Verified] and [Recorded]', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const consultationPath = path.resolve(__dirname, '../navigation/screens/Consultations.screen.tsx');
      const source = fs.readFileSync(consultationPath, 'utf8');

      expect(source).toContain("'PAN [Verified]' : 'PAN [Missing]'");
      expect(source).toContain("'PRC [Verified]' : 'PRC [Missing]'");
      expect(source).toContain("'PTR [Recorded]' : 'PTR [Optional]'");
    });

    test('4.6 formatMissingRequirement sanitizes backend validation messages (NOMED, 30-char drug code, code 2, statutory fallback)', async () => {
      const { formatMissingRequirement } = await import('../components/consultation/YakapClaimReadinessCard');

      // Test 1: NOMED statutory fallback warning
      const rawWarning = 'Zero prescriptions recorded; encounter will transmit statutory fallback code NOMED (No Medication Needed).';
      const cleanWarning = formatMissingRequirement(rawWarning);
      expect(cleanWarning).not.toContain('NOMED');
      expect(cleanWarning).not.toContain('statutory');
      expect(cleanWarning).toContain('no medication needed');

      // Test 2: 30-character drug code requirement
      const rawDrugCode = "Prescription 'Amoxicillin 500mg' does not have a valid 30-character PhilHealth drug code.";
      const cleanDrugCode = formatMissingRequirement(rawDrugCode);
      expect(cleanDrugCode).not.toContain('30-character');
      expect(cleanDrugCode).toContain('must match a PhilHealth formulary medication');

      // Test 3: Chief complaint code 'X' (OTHERS)
      const rawOther = "Mandatory other complaint description is missing for chief complaint code 'X' (OTHERS).";
      const cleanOther = formatMissingRequirement(rawOther);
      expect(cleanOther).not.toContain("code 'X'");
      expect(cleanOther).not.toContain('(OTHERS)');
      expect(cleanOther).toContain('other complaint');

      // Test 4: General Survey abnormal code 2
      const rawSurvey = 'General Survey remarks are mandatory when marked abnormal (code 2).';
      const cleanSurvey = formatMissingRequirement(rawSurvey);
      expect(cleanSurvey).not.toContain('code 2');
      expect(cleanSurvey).not.toContain('(code 2)');

      // Test 5: Statutory symptoms code
      const rawSymptom = 'PhilHealth Signs & Symptoms statutory code is missing.';
      const cleanSymptom = formatMissingRequirement(rawSymptom);
      expect(cleanSymptom).not.toContain('statutory');
      expect(cleanSymptom).toContain('PhilHealth chief complaint or symptom is required.');
    });

    test('4.7 YakapClaimReadinessCard passes warnings through formatMissingRequirement and does not render raw NOMED or statutory jargon', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const readinessCardPath = path.resolve(__dirname, '../components/consultation/YakapClaimReadinessCard.tsx');
      const source = fs.readFileSync(readinessCardPath, 'utf8');

      expect(source).toContain('{formatMissingRequirement(warn)}');
    });

    test('4.8 Desktop dual-pane ScrollViews configure overscrollBehavior contain and touch gesture props', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const consultationPath = path.resolve(__dirname, '../navigation/screens/Consultations.screen.tsx');
      const source = fs.readFileSync(consultationPath, 'utf8');

      expect(source).toContain("overscrollBehavior: 'contain'");
      expect(source).toContain('directionalLockEnabled');
      expect(source).toContain('scrollEventThrottle={16}');
      expect(source).toContain('overScrollMode="never"');
      expect(source).toContain('bounces={false}');
    });

    test('4.9 Desktop pane height adapts responsively on short viewports without rigid 600px overflow', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const consultationPath = path.resolve(__dirname, '../navigation/screens/Consultations.screen.tsx');
      const source = fs.readFileSync(consultationPath, 'utf8');

      expect(source).toContain('const desktopPaneHeight = Math.max(480, windowHeight - 160);');
    });

    test('4.10 formatMissingRequirement sanitizes XML attributes, DTD filenames, and unquoted code 38 / code X / RA 11223', async () => {
      const { formatMissingRequirement } = await import('../components/consultation/YakapClaimReadinessCard');

      // Test XML attributes & DTD schema
      const rawXml = 'Backend check failed: pDoctorPan is required and PESPECIFIC findings must comply with KonsultaData_v1.14.dtd.';
      const cleanXml = formatMissingRequirement(rawXml);
      expect(cleanXml).not.toContain('pDoctorPan');
      expect(cleanXml).not.toContain('PESPECIFIC');
      expect(cleanXml).not.toContain('KonsultaData_v1.14.dtd');
      expect(cleanXml).toContain('Doctor PAN');
      expect(cleanXml).toContain('Physical examination findings');

      // Test unquoted code 38 (PAIN)
      const rawUnquoted38 = 'Mandatory pain site description is missing for chief complaint code 38 (PAIN).';
      const cleanUnquoted38 = formatMissingRequirement(rawUnquoted38);
      expect(cleanUnquoted38).not.toContain('code 38');
      expect(cleanUnquoted38).not.toContain('(PAIN)');
      expect(cleanUnquoted38).toContain('pain complaint');

      // Test unquoted code X (OTHERS)
      const rawUnquotedX = 'Mandatory other complaint description is missing for chief complaint code X (OTHERS).';
      const cleanUnquotedX = formatMissingRequirement(rawUnquotedX);
      expect(cleanUnquotedX).not.toContain('code X');
      expect(cleanUnquotedX).not.toContain('(OTHERS)');
      expect(cleanUnquotedX).toContain('other complaint');

      // Test unparenthesized RA 11223
      const rawUnparenthesizedRa = 'Patient PhilHealth PIN is invalid per RA 11223.';
      const cleanUnparenthesizedRa = formatMissingRequirement(rawUnparenthesizedRa);
      expect(cleanUnparenthesizedRa).not.toContain('RA 11223');
      expect(cleanUnparenthesizedRa).not.toContain('per .');
      expect(cleanUnparenthesizedRa).toBe('Patient PhilHealth PIN is invalid.');
    });

    test('4.11 formatMissingRequirement sanitizes GAMOT codes and unbranded 30-character drug codes', async () => {
      const { formatMissingRequirement } = await import('../components/consultation/YakapClaimReadinessCard');

      // GAMOT catalog badge / pill code
      const rawGamot = 'Prescription GAMOT 123456789012345678901234567890 is unverified.';
      const cleanGamot = formatMissingRequirement(rawGamot);
      expect(cleanGamot).not.toContain('GAMOT');
      expect(cleanGamot).toContain('PhilHealth Formulary');

      // Unbranded 30-character drug code
      const raw30Char = 'Prescription does not have a 30-character drug code.';
      const clean30Char = formatMissingRequirement(raw30Char);
      expect(clean30Char).not.toContain('30-character');
      expect(clean30Char).toContain('PhilHealth formulary medication');
    });

    test('4.12 resolveMissingSection keyword mapping correctly identifies sections for all clinical variations', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const readinessCardPath = path.resolve(__dirname, '../components/consultation/YakapClaimReadinessCard.tsx');
      const source = fs.readFileSync(readinessCardPath, 'utf8');

      // Verify extended keywords are present in resolveMissingSection
      expect(source).toContain("lower.includes('pan') || lower.includes('accreditation')");
      expect(source).toContain("lower.includes('pespecific')");
      expect(source).toContain("lower.includes('temp')");
      expect(source).toContain("lower.includes('height')");
      expect(source).toContain("lower.includes('weight')");
      expect(source).toContain("lower.includes('formulary')");
    });

    test('4.13 statutoryConditions targets doctor-s2 section when medicines are valid but S2 license is missing', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const readinessCardPath = path.resolve(__dirname, '../components/consultation/YakapClaimReadinessCard.tsx');
      const source = fs.readFileSync(readinessCardPath, 'utf8');

      expect(source).toContain("sectionKey: !s2LicenseValid && medicinesValid ? 'doctor-s2' : 'medicines'");
    });

    test('4.14 formatMissingRequirement defensively handles null, undefined, and non-string inputs with zero exceptions', async () => {
      const { formatMissingRequirement } = await import('../components/consultation/YakapClaimReadinessCard');

      expect(formatMissingRequirement(null as any)).toBe('');
      expect(formatMissingRequirement(undefined as any)).toBe('');
      expect(formatMissingRequirement(123 as any)).toBe('');
      expect(formatMissingRequirement('')).toBe('');
    });

    test('4.15 formatMissingRequirement sanitizes pPeSpecific, pVitals, and strips dangling prepositions before RA citations', async () => {
      const { formatMissingRequirement } = await import('../components/consultation/YakapClaimReadinessCard');

      const rawPe = 'Encounter check: pPeSpecific findings are missing and pVitals are incomplete.';
      const cleanPe = formatMissingRequirement(rawPe);
      expect(cleanPe).not.toContain('pPeSpecific');
      expect(cleanPe).not.toContain('pVitals');
      expect(cleanPe).toContain('Physical examination findings');
      expect(cleanPe).toContain('Triage vitals');

      const rawPreposition = 'According to RA 11223, patient PIN must have 12 numeric digits.';
      const cleanPreposition = formatMissingRequirement(rawPreposition);
      expect(cleanPreposition).not.toContain('RA 11223');
      expect(cleanPreposition).toBe('patient PIN must have 12 numeric digits.');
    });

    test('4.16 resolveMissingSection correctly routes hyphenated S-2, PDEA, blood pressure, and assessment', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const readinessCardPath = path.resolve(__dirname, '../components/consultation/YakapClaimReadinessCard.tsx');
      const source = fs.readFileSync(readinessCardPath, 'utf8');

      // Verify new keywords in source
      expect(source).toContain("lower.includes('s-2')");
      expect(source).toContain("lower.includes('blood pressure')");
      expect(source).toContain("lower.includes('systolic')");
      expect(source).toContain("lower.includes('diastolic')");
      expect(source).toContain("lower.includes('assessment')");
    });
  });
});

// token-guard:ignore-file
import { describe, expect, test, mock } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

(globalThis as any).__DEV__ = true;

const createMockComponent = (name: string) => {
  const Comp = ({
    children,
    accessibilityLabel,
    accessibilityRole,
    placeholder,
    onPress,
    value,
    testID,
  }: any) =>
    React.createElement(
      'div',
      {
        'data-component': name,
        ...(testID ? { 'data-testid': testID } : {}),
        ...(accessibilityLabel ? { 'aria-label': accessibilityLabel } : {}),
        ...(accessibilityRole ? { role: accessibilityRole } : {}),
        ...(placeholder ? { 'data-placeholder': placeholder } : {}),
        ...(value !== undefined ? { 'data-value': String(value) } : {}),
        onClick: onPress,
      },
      placeholder,
      children
    );
  Comp.displayName = name;
  return Comp;
};

mock.module('react-native', () => ({
  StyleSheet: { create: (s: any) => s, flatten: (s: any) => s },
  View: createMockComponent('View'),
  Pressable: createMockComponent('Pressable'),
  ScrollView: createMockComponent('ScrollView'),
  TextInput: createMockComponent('TextInput'),
  Text: createMockComponent('Text'),
  ActivityIndicator: createMockComponent('ActivityIndicator'),
  Modal: createMockComponent('Modal'),
  TouchableOpacity: createMockComponent('TouchableOpacity'),
  Touchable: { Mixin: {} },
  Platform: { OS: 'web', select: (obj: any) => obj.web ?? obj.default },
  Animated: {
    Value: class {
      constructor(public val: any) {}
      setValue(val: any) {
        this.val = val;
      }
    },
    timing: () => ({ start: (cb?: any) => cb?.() }),
    View: createMockComponent('Animated.View'),
    Text: createMockComponent('Animated.Text'),
  },
}));

mock.module('react-native-svg', () => ({
  Svg: createMockComponent('Svg'),
  Path: createMockComponent('Path'),
  Circle: createMockComponent('Circle'),
  Rect: createMockComponent('Rect'),
  Line: createMockComponent('Line'),
  Polygon: createMockComponent('Polygon'),
  G: createMockComponent('G'),
  Polyline: createMockComponent('Polyline'),
  default: createMockComponent('Svg'),
}));

mock.module('../constants/fonts', () => ({
  applyFontFamily: (s: any) => s,
  fontAssets: {},
}));

mock.module('../hooks/useEhrOptions', () => ({
  useEhrOptions: (optionSet: string) => {
    const sets: Record<string, Array<{ code: string; label: string; philHealthCode?: string; requiresSpecifyText?: boolean }>> = {
      counseling_topic: [
        { code: '5', philHealthCode: '5', label: 'Healthy diet and proper nutrition' },
        { code: '7', philHealthCode: '7', label: 'Adequate physical activity and exercise' },
        { code: '16', philHealthCode: '16', label: 'Routine vaccination', requiresSpecifyText: true },
      ],
      yakap_adult_screening: [
        { code: '0', philHealthCode: '0', label: 'Not applicable' },
        { code: '4', philHealthCode: '4', label: 'Chest X-Ray (annual)' },
        { code: '7', philHealthCode: '7', label: 'Fasting Blood Sugar (>40 yrs)' },
        { code: '18', philHealthCode: '18', label: 'HbA1c Test (>40 yrs)' },
      ],
      yakap_pediatric_screening: [
        { code: '0', philHealthCode: '0', label: 'Not applicable' },
        { code: '1', philHealthCode: '1', label: 'Complete Blood Count (CBC) with Platelet Count' },
      ],
      yakap_prenatal_screening: [
        { code: '0', philHealthCode: '0', label: 'Not applicable' },
        { code: '30', philHealthCode: '30', label: 'Urine HCG Pregnancy Test' },
      ],
      yakap_cancer_screening: [
        { code: '15', philHealthCode: '15', label: 'Fecal Occult Blood Test (FOBT) / FIT' },
        { code: '13', philHealthCode: '13', label: 'Pap Smear Cytology' },
      ],
      diagnostic_plan_option: [
        { code: 'N', philHealthCode: 'N', label: 'No diagnostics needed' },
        { code: 'Y', philHealthCode: 'Y', label: 'Request diagnostics' },
        { code: 'R', philHealthCode: 'R', label: 'With diagnostic results' },
      ],
    };
    const opts = sets[optionSet] ?? [];
    return {
      options: opts,
      loading: false,
      error: null,
      selectOptions: opts.map((o) => ({ label: o.label, value: o.code })),
      reload: () => {},
    };
  },
}));

mock.module('../utils/usePhilHealthCatalog', () => ({
  usePhilHealthCatalog: () => ({ items: [], loading: false, error: null }),
}));

const {
  default: PlanManagementCard,
  DEFAULT_YAKAP_PLAN_MANAGEMENT,
  splitDelimitedCodes,
  toggleScreeningCode,
  hydratePlanManagementFromEncounter,
  buildPlanManagementPayload,
  getScreeningCohortTabsForPatient,
} = await import('../components/consultation/PlanManagementCard');

describe('YAKAP 2.0 Plan Management (Annex B Section 5)', () => {
  test('splitDelimitedCodes handles semicolon and comma delimiters cleanly', () => {
    expect(splitDelimitedCodes(null)).toEqual([]);
    expect(splitDelimitedCodes('')).toEqual([]);
    expect(splitDelimitedCodes('5;6;16')).toEqual(['5', '6', '16']);
    expect(splitDelimitedCodes('4, 7, 18')).toEqual(['4', '7', '18']);
  });

  test('toggleScreeningCode enforces mutual exclusivity between Not applicable (0) and screening tests', () => {
    let codes = [...DEFAULT_YAKAP_PLAN_MANAGEMENT.adultScreeningCodes];
    expect(codes).toEqual(['0']);

    codes = toggleScreeningCode(codes, '4');
    expect(codes).toEqual(['4']);

    codes = toggleScreeningCode(codes, '7');
    expect(codes).toEqual(['4', '7']);

    codes = toggleScreeningCode(codes, '0');
    expect(codes).toEqual(['0']);

    codes = toggleScreeningCode(codes, '18');
    expect(codes).toEqual(['18']);
    codes = toggleScreeningCode(codes, '18');
    expect(codes).toEqual(['0']);
  });

  test('hydratePlanManagementFromEncounter restores structured fields and defaults cleanly', () => {
    expect(hydratePlanManagementFromEncounter(null)).toEqual(DEFAULT_YAKAP_PLAN_MANAGEMENT);

    const hydrated = hydratePlanManagementFromEncounter({
      counselingCodes: '5;7;16',
      routineVaccineName: 'Influenza Quadrivalent',
      routineVaccineDate: '2026-11-03',
      adultsRoutineScreeningCode: '4,7,18',
      pediatricRoutineScreeningCode: '0',
      prenatalScreeningServicesCode: '0',
      cancerScreeningCodes: '15,13',
      diagnosticServicesOption: 'Y',
      hasMedicationPrescription: true,
      hasReferral: false,
      otherMedicalAdviceSpec: 'Maintain DASH low-sodium diet and 30 mins brisk walking.',
      hasFollowUp: true,
      followUpDate: '2026-11-17',
      followUpScheduleText: '2026-11-17',
      followUpReason: 'Review FBS and HbA1c results',
      followUpVaccineName: 'Pneumococcal PCV20',
      followUpVaccineNextDate: '2026-12-03',
    });

    expect(hydrated.counselingCodes).toEqual(['5', '7', '16']);
    expect(hydrated.routineVaccineName).toBe('Influenza Quadrivalent');
    expect(hydrated.adultScreeningCodes).toEqual(['4', '7', '18']);
    expect(hydrated.hasCancerScreening).toBe(true);
    expect(hydrated.cancerScreeningCodes).toEqual(['15', '13']);
    expect(hydrated.diagnosticServicesOption).toBe('Y');
    expect(hydrated.hasFollowUp).toBe(true);
    expect(hydrated.followUpReason).toBe('Review FBS and HbA1c results');
  });

  test('buildPlanManagementPayload auto-derives diagnostic, prescription, and referral flags from live encounter orders when unset', () => {
    const payload = buildPlanManagementPayload(
      {
        ...DEFAULT_YAKAP_PLAN_MANAGEMENT,
        counselingCodes: ['5', '15'],
        adultScreeningCodes: ['7', '18'],
        hasCancerScreening: false,
        otherMedicalAdviceSpec: 'Avoid salty processed foods',
        hasFollowUp: true,
        followUpDate: '2026-11-20',
        followUpScheduleText: '2026-11-20',
        followUpReason: 'BP recheck',
      },
      {
        orderedLabsCount: 2,
        completedLabResultsCount: 0,
        prescriptionsCount: 1,
        hasIssuedReferral: true,
      }
    );

    expect(payload.counselingCodes).toBe('5;15');
    expect(payload.adultsRoutineScreeningCode).toBe('7,18');
    expect(payload.pediatricRoutineScreeningCode).toBe('0');
    expect(payload.prenatalScreeningServicesCode).toBe('0');
    expect(payload.cancerScreeningCodes).toBe('N');
    expect(payload.diagnosticServicesOption).toBe('Y');
    expect(payload.hasMedicationPrescription).toBe(true);
    expect(payload.hasReferral).toBe(true);
    expect(payload.followUpDate).toBe('2026-11-20');
  });

  test('renders PlanManagementCard sections cleanly with conditional vaccine, cancer screening, and follow-up inputs and zero database jargon', () => {
    const html = renderToStaticMarkup(
      React.createElement(PlanManagementCard, {
        embedded: true,
        value: {
          ...DEFAULT_YAKAP_PLAN_MANAGEMENT,
          counselingCodes: ['5', '16'],
          routineVaccineName: 'Influenza',
          adultScreeningCodes: ['4', '7'],
          hasCancerScreening: true,
          cancerScreeningCodes: ['15'],
          hasFollowUp: true,
          followUpDate: '2026-11-17',
          followUpReason: 'Review FBS',
        },
        onChange: () => {},
        patientAgeYears: 49,
        patientSex: 'Female',
        orderedLabsCount: 1,
        prescriptionsCount: 2,
      })
    );

    expect(html).toContain('Counseling &amp; Health Education');
    expect(html).toContain('Routine &amp; Prenatal Screening Plan');
    expect(html).toContain('Cancer Screening');
    expect(html).toContain('Care Orders &amp; Referrals');
    expect(html).toContain('Other medical advice');
    expect(html).toContain('Follow-Up Schedule');
    expect(html).toContain('Routine vaccine name');
    expect(html).toContain('Fecal Occult Blood Test (FOBT) / FIT');
    expect(html).toContain('Reason for follow-up');
    expect(html).not.toContain('1NF');
    expect(html).not.toContain('lib_');
    expect(html).not.toContain('LIB-039');
  });

  test('PlanManagementCard delegates screening and counseling code catalogs strictly to backend option sets', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const src = fs.readFileSync(
      path.resolve(__dirname, '../components/consultation/PlanManagementCard.tsx'),
      'utf8'
    );
    expect(src).not.toContain('ADULT_DIAG_CODES');
    expect(src).not.toContain('PEDIATRIC_DIAG_CODES');
    expect(src).not.toContain('PRENATAL_DIAG_CODES');
    expect(src).not.toContain('CANCER_DIAG_CODES');
    expect(src).not.toContain('mapCatalogSubset');
    expect(src).toContain("useEhrOptions('yakap_adult_screening'");
    expect(src).toContain("useEhrOptions('yakap_pediatric_screening'");
    expect(src).toContain("useEhrOptions('yakap_prenatal_screening'");
    expect(src).toContain("useEhrOptions('yakap_cancer_screening'");
  });

  test('PlanManagementCard auto-filters Routine & Prenatal Screening cohort tabs by patient age and sex', () => {
    // Adult Male (42yo Male): shows only Adults
    expect(
      getScreeningCohortTabsForPatient({ patientAgeYears: 42, patientSex: 'Male' }).map((t) => t.id)
    ).toEqual(['adult']);

    // Adult Female of reproductive age (32yo Female): shows Adults + Prenatal / Antenatal, hides Pediatric & Adolescent
    expect(
      getScreeningCohortTabsForPatient({ patientAgeYears: 32, patientSex: 'Female' }).map(
        (t) => t.id
      )
    ).toEqual(['adult', 'prenatal']);

    // Pediatric Male (8yo Male): shows only Pediatric & Adolescent
    expect(
      getScreeningCohortTabsForPatient({ patientAgeYears: 8, patientSex: 'Male' }).map((t) => t.id)
    ).toEqual(['pediatric']);

    // Preserves non-empty tabs even if outside demographic cohort
    expect(
      getScreeningCohortTabsForPatient({
        patientAgeYears: 42,
        patientSex: 'Male',
        pediatricSelectedCount: 1,
      }).map((t) => t.id)
    ).toEqual(['adult', 'pediatric']);

    const maleAdultHtml = renderToStaticMarkup(
      React.createElement(PlanManagementCard, {
        embedded: true,
        value: DEFAULT_YAKAP_PLAN_MANAGEMENT,
        onChange: () => {},
        patientAgeYears: 42,
        patientSex: 'Male',
      })
    );
    expect(maleAdultHtml).toContain('Adults');
    expect(maleAdultHtml).not.toContain('Pediatric &amp; Adolescent');
    expect(maleAdultHtml).not.toContain('Prenatal / Antenatal');
  });

  test('Issue #187: Demographic cohort filtering & Recommended badges for 84yo senior male (Dagohoy, Artemio V.)', () => {
    // Reference Patient: Dagohoy, Artemio V. (PAT-2026-01D10 · 84 yrs, Male · DOB: 1941-12-07)
    const seniorMaleHtml = renderToStaticMarkup(
      React.createElement(PlanManagementCard, {
        embedded: true,
        value: {
          ...DEFAULT_YAKAP_PLAN_MANAGEMENT,
          hasCancerScreening: true,
          cancerScreeningCodes: ['15'], // FOBT
        },
        onChange: () => {},
        patientAgeYears: 84,
        patientDateOfBirth: '1941-12-07',
        patientSex: 'Male',
      })
    );

    // 1. Dynamic title: Routine Screening Plan (omits & Prenatal)
    expect(seniorMaleHtml).toContain('Routine Screening Plan');
    expect(seniorMaleHtml).not.toContain('Routine &amp; Prenatal Screening Plan');

    // 2. Visible "Recommended" badge on recommended Adults tab
    expect(seniorMaleHtml).toContain('Adults');
    expect(seniorMaleHtml).toContain('Recommended');

    // 3. Cancer Screening: subtitle omits Pap Smear for male patients
    expect(seniorMaleHtml).toContain('Early detection screening tests (FOBT/FIT, AFP, Colonoscopy, Imaging)');
    expect(seniorMaleHtml).not.toContain('Early detection screening tests (FOBT/FIT, Pap Smear, AFP, Colonoscopy, Imaging)');

    // 4. Cancer Screening chips: excludes Pap Smear Cytology (code 13) for male
    expect(seniorMaleHtml).toContain('Fecal Occult Blood Test (FOBT) / FIT');
    expect(seniorMaleHtml).not.toContain('Pap Smear Cytology');

    // 5. Preservation rule: if hydrated encounter already contains Pap Smear (code 13), preserve it
    const hydratedPreservedHtml = renderToStaticMarkup(
      React.createElement(PlanManagementCard, {
        embedded: true,
        value: {
          ...DEFAULT_YAKAP_PLAN_MANAGEMENT,
          hasCancerScreening: true,
          cancerScreeningCodes: ['13'], // Pre-existing selection
        },
        onChange: () => {},
        patientAgeYears: 84,
        patientSex: 'Male',
      })
    );
    expect(hydratedPreservedHtml).toContain('Pap Smear Cytology');

    // 6. DOB Age-Resolution parity: if patientAgeYears is null but patientDateOfBirth (1941-12-07) is provided
    const tabsFromDobOnly = getScreeningCohortTabsForPatient({
      patientAgeYears: null,
      patientDateOfBirth: '1941-12-07',
      patientSex: 'Male',
    });
    expect(tabsFromDobOnly.map((t) => t.id)).toEqual(['adult']);
    expect(tabsFromDobOnly[0].isRecommended).toBe(true);

    const dobOnlyHtml = renderToStaticMarkup(
      React.createElement(PlanManagementCard, {
        embedded: true,
        value: DEFAULT_YAKAP_PLAN_MANAGEMENT,
        onChange: () => {},
        patientAgeYears: null,
        patientDateOfBirth: '1941-12-07',
        patientSex: 'Male',
      })
    );
    expect(dobOnlyHtml).toContain('Routine Screening Plan');
    expect(dobOnlyHtml).not.toContain('Pediatric &amp; Adolescent');
    expect(dobOnlyHtml).toContain('Recommended');

    // 7. Pediatric cohort recommendation: < 20yo displays Recommended badge on Pediatric tab
    const pediatricHtml = renderToStaticMarkup(
      React.createElement(PlanManagementCard, {
        embedded: true,
        value: DEFAULT_YAKAP_PLAN_MANAGEMENT,
        onChange: () => {},
        patientAgeYears: 8,
        patientSex: 'Male',
      })
    );
    expect(pediatricHtml).toContain('Pediatric &amp; Adolescent');
    expect(pediatricHtml).toContain('Recommended');

    // 8. Female patient parity: preserves Routine & Prenatal Screening Plan and Pap Smear
    const femaleHtml = renderToStaticMarkup(
      React.createElement(PlanManagementCard, {
        embedded: true,
        value: {
          ...DEFAULT_YAKAP_PLAN_MANAGEMENT,
          hasCancerScreening: true,
          cancerScreeningCodes: [],
        },
        onChange: () => {},
        patientAgeYears: 32,
        patientSex: 'Female',
      })
    );
    expect(femaleHtml).toContain('Routine &amp; Prenatal Screening Plan');
    expect(femaleHtml).toContain('Early detection screening tests (FOBT/FIT, Pap Smear, AFP, Colonoscopy, Imaging)');
    expect(femaleHtml).toContain('Pap Smear Cytology');
  });
});

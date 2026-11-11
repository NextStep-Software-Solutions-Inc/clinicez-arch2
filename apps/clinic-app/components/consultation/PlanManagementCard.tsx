import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import ThemedText from '../ui/ThemedText';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import Icon from '../ui/Icon';
import Input from '../ui/Input';
import { theme } from '../../constants/theme';
import { useEhrOptions } from '../../hooks/useEhrOptions';
import type { ConsultationRecord } from '../../services/clinicService';

export interface PlanManagementOption {
  code: string;
  label: string;
  requiresSpecifyText?: boolean;
}

export type DiagnosticPlanFlag = 'N' | 'Y' | 'R';

export interface YakapPlanManagementState {
  counselingCodes: string[];
  routineVaccineName: string;
  routineVaccineDate: string;
  adultScreeningCodes: string[];
  pediatricScreeningCodes: string[];
  prenatalScreeningCodes: string[];
  hasCancerScreening: boolean;
  cancerScreeningCodes: string[];
  diagnosticServicesOption: DiagnosticPlanFlag | null;
  hasMedicationPrescription: boolean | null;
  hasReferral: boolean | null;
  otherMedicalAdviceSpec: string;
  hasFollowUp: boolean;
  followUpDate: string;
  followUpScheduleText: string;
  followUpReason: string;
  followUpVaccineName: string;
  followUpVaccineNextDate: string;
}

export const DEFAULT_YAKAP_PLAN_MANAGEMENT: YakapPlanManagementState = {
  counselingCodes: [],
  routineVaccineName: '',
  routineVaccineDate: '',
  adultScreeningCodes: ['0'],
  pediatricScreeningCodes: ['0'],
  prenatalScreeningCodes: ['0'],
  hasCancerScreening: false,
  cancerScreeningCodes: [],
  diagnosticServicesOption: null,
  hasMedicationPrescription: null,
  hasReferral: null,
  otherMedicalAdviceSpec: '',
  hasFollowUp: false,
  followUpDate: '',
  followUpScheduleText: '',
  followUpReason: '',
  followUpVaccineName: '',
  followUpVaccineNextDate: '',
};

export function splitDelimitedCodes(raw?: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(/[;,]/)
    .map((code) => code.trim())
    .filter(Boolean);
}

export function toggleScreeningCode(currentCodes: string[], code: string): string[] {
  if (code === '0') {
    return ['0'];
  }
  const withoutNotApplicable = currentCodes.filter((c) => c !== '0');
  if (withoutNotApplicable.includes(code)) {
    const next = withoutNotApplicable.filter((c) => c !== code);
    return next.length > 0 ? next : ['0'];
  }
  return [...withoutNotApplicable, code];
}

export function hydratePlanManagementFromEncounter(
  encounter?: Partial<ConsultationRecord> | null
): YakapPlanManagementState {
  if (!encounter) {
    return { ...DEFAULT_YAKAP_PLAN_MANAGEMENT };
  }

  const adultCodes = splitDelimitedCodes(encounter.adultsRoutineScreeningCode);
  const pediatricCodes = splitDelimitedCodes(encounter.pediatricRoutineScreeningCode);
  const prenatalCodes = splitDelimitedCodes(encounter.prenatalScreeningServicesCode);
  const rawCancer = encounter.cancerScreeningCodes?.trim();
  const cancerCodes = rawCancer && rawCancer !== 'N' ? splitDelimitedCodes(rawCancer) : [];
  const diagOpt = encounter.diagnosticServicesOption?.trim().toUpperCase();

  return {
    counselingCodes: splitDelimitedCodes(encounter.counselingCodes),
    routineVaccineName: encounter.routineVaccineName ?? '',
    routineVaccineDate: encounter.routineVaccineDate ?? '',
    adultScreeningCodes: adultCodes.length > 0 ? adultCodes : ['0'],
    pediatricScreeningCodes: pediatricCodes.length > 0 ? pediatricCodes : ['0'],
    prenatalScreeningCodes: prenatalCodes.length > 0 ? prenatalCodes : ['0'],
    hasCancerScreening: cancerCodes.length > 0,
    cancerScreeningCodes: cancerCodes,
    diagnosticServicesOption:
      diagOpt === 'Y' || diagOpt === 'R' || diagOpt === 'N' ? (diagOpt as DiagnosticPlanFlag) : null,
    hasMedicationPrescription:
      typeof encounter.hasMedicationPrescription === 'boolean' ? encounter.hasMedicationPrescription : null,
    hasReferral: typeof encounter.hasReferral === 'boolean' ? encounter.hasReferral : null,
    otherMedicalAdviceSpec: encounter.otherMedicalAdviceSpec ?? '',
    hasFollowUp: Boolean(encounter.hasFollowUp),
    followUpDate: encounter.followUpDate ?? '',
    followUpScheduleText: encounter.followUpScheduleText ?? '',
    followUpReason: encounter.followUpReason ?? '',
    followUpVaccineName: encounter.followUpVaccineName ?? '',
    followUpVaccineNextDate: encounter.followUpVaccineNextDate ?? '',
  };
}

export function buildPlanManagementPayload(
  state: YakapPlanManagementState,
  context: {
    orderedLabsCount: number;
    completedLabResultsCount: number;
    prescriptionsCount: number;
    hasIssuedReferral: boolean;
  }
) {
  const effectiveDiagOption: DiagnosticPlanFlag =
    state.diagnosticServicesOption ??
    (context.completedLabResultsCount > 0 ? 'R' : context.orderedLabsCount > 0 ? 'Y' : 'N');

  const effectiveHasRx = state.hasMedicationPrescription ?? context.prescriptionsCount > 0;
  const effectiveHasReferral = state.hasReferral ?? context.hasIssuedReferral;

  const trimmedFollowUpInput = (state.followUpDate || state.followUpScheduleText).trim();
  const looksLikeIsoOrUsDate = /^\d{4}-\d{2}-\d{2}$|^\d{1,2}\/\d{1,2}\/\d{4}$/.test(trimmedFollowUpInput);

  return {
    counselingCodes: state.counselingCodes.length > 0 ? state.counselingCodes.join(';') : undefined,
    routineVaccineName: state.routineVaccineName.trim() || undefined,
    routineVaccineDate: state.routineVaccineDate.trim() || undefined,
    adultsRoutineScreeningCode:
      state.adultScreeningCodes.length > 0 ? state.adultScreeningCodes.join(',') : '0',
    pediatricRoutineScreeningCode:
      state.pediatricScreeningCodes.length > 0 ? state.pediatricScreeningCodes.join(',') : '0',
    prenatalScreeningServicesCode:
      state.prenatalScreeningCodes.length > 0 ? state.prenatalScreeningCodes.join(',') : '0',
    cancerScreeningCodes:
      state.hasCancerScreening && state.cancerScreeningCodes.length > 0
        ? state.cancerScreeningCodes.join(',')
        : 'N',
    diagnosticServicesOption: effectiveDiagOption,
    hasMedicationPrescription: effectiveHasRx,
    hasReferral: effectiveHasReferral,
    otherMedicalAdviceSpec: state.otherMedicalAdviceSpec.trim() || undefined,
    hasFollowUp: state.hasFollowUp,
    followUpDate: state.hasFollowUp && looksLikeIsoOrUsDate ? trimmedFollowUpInput : undefined,
    followUpScheduleText:
      state.hasFollowUp && trimmedFollowUpInput ? trimmedFollowUpInput : undefined,
    followUpReason: state.hasFollowUp ? state.followUpReason.trim() || undefined : undefined,
    followUpVaccineName:
      state.hasFollowUp ? state.followUpVaccineName.trim() || undefined : undefined,
    followUpVaccineNextDate:
      state.hasFollowUp ? state.followUpVaccineNextDate.trim() || undefined : undefined,
  };
}

export type ScreeningCohortTab = 'adult' | 'pediatric' | 'prenatal';

export interface ScreeningCohortTabDescriptor {
  id: ScreeningCohortTab;
  label: string;
  count: number;
  isRecommended: boolean;
}

export function getScreeningCohortTabsForPatient(params: {
  patientAgeYears?: number | null;
  patientSex?: string | null;
  adultSelectedCount?: number;
  pediatricSelectedCount?: number;
  prenatalSelectedCount?: number;
}): ScreeningCohortTabDescriptor[] {
  const {
    patientAgeYears,
    patientSex,
    adultSelectedCount = 0,
    pediatricSelectedCount = 0,
    prenatalSelectedCount = 0,
  } = params;

  const ageYears =
    typeof patientAgeYears === 'number' && !Number.isNaN(patientAgeYears)
      ? Math.max(0, patientAgeYears)
      : null;
  const rawSex = patientSex?.trim().toLowerCase() ?? '';
  const sex: 'female' | 'male' | null = rawSex.startsWith('f')
    ? 'female'
    : rawSex.startsWith('m')
      ? 'male'
      : null;
  const hasDemographics = ageYears !== null || sex !== null;

  const allTabs: Array<ScreeningCohortTabDescriptor & { visible: boolean }> = [
    {
      id: 'adult',
      label: 'Adults',
      count: adultSelectedCount,
      isRecommended: ageYears !== null && ageYears >= 20,
      visible: !hasDemographics || adultSelectedCount > 0 || ageYears === null || ageYears >= 20,
    },
    {
      id: 'pediatric',
      label: 'Pediatric & Adolescent',
      count: pediatricSelectedCount,
      isRecommended: ageYears !== null && ageYears < 20,
      visible: !hasDemographics || pediatricSelectedCount > 0 || ageYears === null || ageYears < 20,
    },
    {
      id: 'prenatal',
      label: 'Prenatal / Antenatal',
      count: prenatalSelectedCount,
      isRecommended: prenatalSelectedCount > 0,
      visible:
        !hasDemographics ||
        prenatalSelectedCount > 0 ||
        (sex !== 'male' && (ageYears === null || (ageYears >= 10 && ageYears <= 55))),
    },
  ];

  const visible = allTabs
    .filter((t) => t.visible)
    .map(({ visible: _visible, ...tab }) => tab);

  return visible.length > 0
    ? visible
    : [{ id: 'adult', label: 'Adults', count: adultSelectedCount, isRecommended: false }];
}

export interface PlanManagementCardProps {
  value: YakapPlanManagementState;
  onChange: (next: YakapPlanManagementState) => void;
  disabled?: boolean;
  embedded?: boolean;
  patientAgeYears?: number | null;
  patientSex?: string | null;
  orderedLabsCount?: number;
  completedLabResultsCount?: number;
  prescriptionsCount?: number;
  hasIssuedReferral?: boolean;
  onOpenOrderDiagnostics?: () => void;
  onOpenAddMedication?: () => void;
  onOpenIssueReferral?: () => void;
  counselingOptionsOverride?: PlanManagementOption[];
  adultScreeningOptionsOverride?: PlanManagementOption[];
  pediatricScreeningOptionsOverride?: PlanManagementOption[];
  prenatalScreeningOptionsOverride?: PlanManagementOption[];
  cancerScreeningOptionsOverride?: PlanManagementOption[];
}

export default function PlanManagementCard({
  value,
  onChange,
  disabled = false,
  embedded = false,
  patientAgeYears,
  patientSex,
  orderedLabsCount = 0,
  completedLabResultsCount = 0,
  prescriptionsCount = 0,
  hasIssuedReferral = false,
  onOpenOrderDiagnostics,
  onOpenAddMedication,
  onOpenIssueReferral,
  counselingOptionsOverride,
  adultScreeningOptionsOverride,
  pediatricScreeningOptionsOverride,
  prenatalScreeningOptionsOverride,
  cancerScreeningOptionsOverride,
}: PlanManagementCardProps) {
  const defaultCohort: ScreeningCohortTab = useMemo(() => {
    if (typeof patientAgeYears === 'number' && patientAgeYears < 20) {
      return 'pediatric';
    }
    return 'adult';
  }, [patientAgeYears]);

  const [activeCohort, setActiveCohort] = useState<ScreeningCohortTab>(defaultCohort);
  useEffect(() => {
    setActiveCohort(defaultCohort);
  }, [defaultCohort]);

  // Backend-driven option sets from EhrStaticOptions / EHR Options API
  const { options: counselingEhr } = useEhrOptions('counseling_topic', {
    enabled: !counselingOptionsOverride?.length,
  });
  const { options: adultEhr } = useEhrOptions('yakap_adult_screening', {
    enabled: !adultScreeningOptionsOverride?.length,
  });
  const { options: pediatricEhr } = useEhrOptions('yakap_pediatric_screening', {
    enabled: !pediatricScreeningOptionsOverride?.length,
  });
  const { options: prenatalEhr } = useEhrOptions('yakap_prenatal_screening', {
    enabled: !prenatalScreeningOptionsOverride?.length,
  });
  const { options: cancerEhr } = useEhrOptions('yakap_cancer_screening', {
    enabled: !cancerScreeningOptionsOverride?.length,
  });
  const { options: diagnosticPlanEhr } = useEhrOptions('diagnostic_plan_option');

  const counselingOptions: PlanManagementOption[] = useMemo(() => {
    if (counselingOptionsOverride?.length) return counselingOptionsOverride;
    return counselingEhr.map((opt) => ({
      code: opt.philHealthCode || opt.code,
      label: opt.label,
      requiresSpecifyText: opt.requiresSpecifyText,
    }));
  }, [counselingOptionsOverride, counselingEhr]);

  const adultOptions: PlanManagementOption[] = useMemo(() => {
    if (adultScreeningOptionsOverride?.length) return adultScreeningOptionsOverride;
    return adultEhr.map((o) => ({ code: o.philHealthCode || o.code, label: o.label }));
  }, [adultScreeningOptionsOverride, adultEhr]);

  const pediatricOptions: PlanManagementOption[] = useMemo(() => {
    if (pediatricScreeningOptionsOverride?.length) return pediatricScreeningOptionsOverride;
    return pediatricEhr.map((o) => ({ code: o.philHealthCode || o.code, label: o.label }));
  }, [pediatricScreeningOptionsOverride, pediatricEhr]);

  const prenatalOptions: PlanManagementOption[] = useMemo(() => {
    if (prenatalScreeningOptionsOverride?.length) return prenatalScreeningOptionsOverride;
    return prenatalEhr.map((o) => ({ code: o.philHealthCode || o.code, label: o.label }));
  }, [prenatalScreeningOptionsOverride, prenatalEhr]);

  const cancerOptions: PlanManagementOption[] = useMemo(() => {
    if (cancerScreeningOptionsOverride?.length) return cancerScreeningOptionsOverride;
    return cancerEhr.map((o) => ({ code: o.philHealthCode || o.code, label: o.label }));
  }, [cancerScreeningOptionsOverride, cancerEhr]);

  const diagnosticServiceChoices: Array<{ code: DiagnosticPlanFlag; label: string }> = useMemo(() => {
    return diagnosticPlanEhr
      .map((o) => ({
        code: (o.philHealthCode || o.code) as DiagnosticPlanFlag,
        label: o.label,
      }))
      .filter((o) => o.code === 'N' || o.code === 'Y' || o.code === 'R');
  }, [diagnosticPlanEhr]);

  const effectiveDiagOption: DiagnosticPlanFlag =
    value.diagnosticServicesOption ??
    (completedLabResultsCount > 0 ? 'R' : orderedLabsCount > 0 ? 'Y' : 'N');
  const effectiveHasRx = value.hasMedicationPrescription ?? prescriptionsCount > 0;
  const effectiveHasReferral = value.hasReferral ?? hasIssuedReferral;

  const hasRoutineVaccinationSelected = useMemo(() => {
    return value.counselingCodes.some((code) => {
      const opt = counselingOptions.find((o) => o.code === code);
      return Boolean(opt?.requiresSpecifyText || opt?.label.toLowerCase().includes('vaccin'));
    });
  }, [value.counselingCodes, counselingOptions]);

  const handleToggleCounseling = (code: string) => {
    if (disabled) return;
    const exists = value.counselingCodes.includes(code);
    const nextCodes = exists
      ? value.counselingCodes.filter((c) => c !== code)
      : [...value.counselingCodes, code];
    onChange({
      ...value,
      counselingCodes: nextCodes,
    });
  };

  const handleToggleCohortScreening = (cohort: ScreeningCohortTab, code: string) => {
    if (disabled) return;
    if (cohort === 'adult') {
      onChange({ ...value, adultScreeningCodes: toggleScreeningCode(value.adultScreeningCodes, code) });
    } else if (cohort === 'pediatric') {
      onChange({
        ...value,
        pediatricScreeningCodes: toggleScreeningCode(value.pediatricScreeningCodes, code),
      });
    } else {
      onChange({
        ...value,
        prenatalScreeningCodes: toggleScreeningCode(value.prenatalScreeningCodes, code),
      });
    }
  };

  const handleToggleCancerCode = (code: string) => {
    if (disabled) return;
    const exists = value.cancerScreeningCodes.includes(code);
    const nextCodes = exists
      ? value.cancerScreeningCodes.filter((c) => c !== code)
      : [...value.cancerScreeningCodes, code];
    onChange({
      ...value,
      hasCancerScreening: true,
      cancerScreeningCodes: nextCodes,
    });
  };

  const renderChip = (
    key: string,
    label: string,
    selected: boolean,
    onPress: () => void,
    testID?: string
  ) => (
    <Pressable
      key={key}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={[
        styles.chip,
        selected ? styles.chipSelected : styles.chipIdle,
        disabled ? styles.chipDisabled : null,
      ]}
    >
      <Icon
        name={selected ? 'check' : 'plus'}
        size={13}
        color={selected ? theme.colors.primaryDark : theme.colors.textSecondary}
      />
      <ThemedText
        variant="small"
        style={{
          color: selected ? theme.colors.primaryDark : theme.colors.text,
          fontWeight: selected ? '600' : '500',
        }}
      >
        {label}
      </ThemedText>
    </Pressable>
  );

  const countSelectedTests = (codes: string[]) => codes.filter((c) => c !== '0').length;
  const adultSelectedCount = countSelectedTests(value.adultScreeningCodes);
  const pediatricSelectedCount = countSelectedTests(value.pediatricScreeningCodes);
  const prenatalSelectedCount = countSelectedTests(value.prenatalScreeningCodes);

  const cohortTabs = useMemo(
    () =>
      getScreeningCohortTabsForPatient({
        patientAgeYears,
        patientSex,
        adultSelectedCount,
        pediatricSelectedCount,
        prenatalSelectedCount,
      }),
    [patientAgeYears, patientSex, adultSelectedCount, pediatricSelectedCount, prenatalSelectedCount]
  );

  const effectiveActiveCohort: ScreeningCohortTab = cohortTabs.some((t) => t.id === activeCohort)
    ? activeCohort
    : (cohortTabs.find((t) => t.isRecommended)?.id ?? cohortTabs[0]?.id ?? defaultCohort);

  const activeScreeningOptions =
    effectiveActiveCohort === 'adult'
      ? adultOptions
      : effectiveActiveCohort === 'pediatric'
        ? pediatricOptions
        : prenatalOptions;

  const activeScreeningCodes =
    effectiveActiveCohort === 'adult'
      ? value.adultScreeningCodes
      : effectiveActiveCohort === 'pediatric'
        ? value.pediatricScreeningCodes
        : value.prenatalScreeningCodes;

  const followUpScheduleValue = value.followUpDate || value.followUpScheduleText;

  return (
    <View style={embedded ? styles.embeddedRoot : styles.standaloneCard} testID="yakap-plan-management-card">
      {/* A. Counseling and Health Education */}
      <View style={styles.sectionBlock}>
        <View style={styles.sectionHeaderRow}>
          <View style={styles.sectionTitleWrap}>
            <ThemedText variant="bodyBold">Counseling & Health Education</ThemedText>
            <ThemedText variant="caption" color={theme.colors.textSecondary}>
              Select preventive counseling and health education topics discussed during this visit
            </ThemedText>
          </View>
          {value.counselingCodes.length > 0 ? (
            <Badge
              variant="info"
              size="sm"
              label={`${value.counselingCodes.length} selected`}
            />
          ) : null}
        </View>

        <View style={styles.chipGrid}>
          {counselingOptions.map((opt) =>
            renderChip(
              opt.code,
              opt.label,
              value.counselingCodes.includes(opt.code),
              () => handleToggleCounseling(opt.code),
              `counseling-chip-${opt.code}`
            )
          )}
        </View>

        {hasRoutineVaccinationSelected ? (
          <View style={styles.nestedBox}>
            <View style={styles.twoColRow}>
              <Input
                label="Routine vaccine name"
                placeholder="e.g. Influenza, Pneumococcal, Td"
                value={value.routineVaccineName}
                onChangeText={(text) => onChange({ ...value, routineVaccineName: text })}
                editable={!disabled}
                containerStyle={styles.flexField}
              />
              <Input
                label="Date administered"
                placeholder="YYYY-MM-DD"
                value={value.routineVaccineDate}
                onChangeText={(text) => onChange({ ...value, routineVaccineDate: text })}
                editable={!disabled}
                containerStyle={styles.dateField}
              />
            </View>
          </View>
        ) : null}
      </View>

      {/* B–D. Routine & Prenatal Screening Plan */}
      <View style={[styles.sectionBlock, styles.sectionDivider]}>
        <View style={styles.sectionHeaderRow}>
          <View style={styles.sectionTitleWrap}>
            <ThemedText variant="bodyBold">Routine & Prenatal Screening Plan</ThemedText>
            <ThemedText variant="caption" color={theme.colors.textSecondary}>
              Age- and cohort-appropriate preventive screening tests recommended for this patient
            </ThemedText>
          </View>
        </View>

        <View style={styles.cohortTabBar}>
          {cohortTabs.map((tab) => {
            const active = effectiveActiveCohort === tab.id;
            return (
              <Pressable
                key={tab.id}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                onPress={() => setActiveCohort(tab.id)}
                testID={`screening-tab-${tab.id}`}
                style={[styles.cohortTab, active ? styles.cohortTabActive : styles.cohortTabIdle]}
              >
                <ThemedText
                  variant="small"
                  style={{
                    color:
                      active || tab.isRecommended
                        ? theme.colors.primaryDark
                        : theme.colors.textSecondary,
                    fontWeight: active || tab.isRecommended ? '600' : '500',
                  }}
                >
                  {tab.label}
                </ThemedText>
                <View
                  style={[
                    styles.cohortCountPill,
                    tab.count > 0 ? styles.cohortCountPillActive : styles.cohortCountPillNeutral,
                  ]}
                >
                  <ThemedText
                    variant="caption"
                    style={{
                      color: tab.count > 0 ? theme.colors.primaryDark : theme.colors.textMuted,
                      fontWeight: '600',
                    }}
                  >
                    {`${tab.count}`}
                  </ThemedText>
                </View>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.chipGrid}>
          {activeScreeningOptions.map((opt) =>
            renderChip(
              `${effectiveActiveCohort}-${opt.code}`,
              opt.label,
              activeScreeningCodes.includes(opt.code),
              () => handleToggleCohortScreening(effectiveActiveCohort, opt.code),
              `screening-chip-${effectiveActiveCohort}-${opt.code}`
            )
          )}
        </View>
      </View>

      {/* E. Cancer Screening Tests */}
      <View style={[styles.sectionBlock, styles.sectionDivider]}>
        <View style={styles.inlineToggleRow}>
          <View style={styles.sectionTitleWrap}>
            <ThemedText variant="bodyBold">Cancer Screening</ThemedText>
            <ThemedText variant="caption" color={theme.colors.textSecondary}>
              Early detection screening tests (FOBT/FIT, Pap Smear, AFP, Colonoscopy, Imaging)
            </ThemedText>
          </View>
          <View style={styles.segmentedGroup}>
            {[
              { flag: false, label: 'No' },
              { flag: true, label: 'Yes' },
            ].map((choice) => {
              const selected = value.hasCancerScreening === choice.flag;
              return (
                <Pressable
                  key={choice.label}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected, disabled }}
                  disabled={disabled}
                  onPress={() =>
                    onChange({
                      ...value,
                      hasCancerScreening: choice.flag,
                      cancerScreeningCodes: choice.flag ? value.cancerScreeningCodes : [],
                    })
                  }
                  testID={`cancer-screening-${choice.flag ? 'yes' : 'no'}`}
                  style={[
                    styles.segmentBtn,
                    selected ? styles.segmentBtnActive : styles.segmentBtnIdle,
                  ]}
                >
                  <ThemedText
                    variant="small"
                    style={{
                      color: selected ? theme.colors.primaryDark : theme.colors.textSecondary,
                      fontWeight: selected ? '600' : '500',
                    }}
                  >
                    {choice.label}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
        </View>

        {value.hasCancerScreening ? (
          <View style={styles.chipGrid}>
            {cancerOptions.map((opt) =>
              renderChip(
                `cancer-${opt.code}`,
                opt.label,
                value.cancerScreeningCodes.includes(opt.code),
                () => handleToggleCancerCode(opt.code),
                `cancer-chip-${opt.code}`
              )
            )}
          </View>
        ) : null}
      </View>

      {/* F–H. Care Orders & Disposition */}
      <View style={[styles.sectionBlock, styles.sectionDivider]}>
        <View style={styles.sectionTitleWrap}>
          <ThemedText variant="bodyBold">Care Orders & Referrals</ThemedText>
          <ThemedText variant="caption" color={theme.colors.textSecondary}>
            Diagnostic requests, prescriptions, and specialist or facility referrals for this encounter
          </ThemedText>
        </View>

        <View style={styles.dispositionList}>
          {/* F. Diagnostic Services */}
          <View style={styles.dispositionRow}>
            <View style={styles.dispositionLabelCol}>
              <View style={styles.dispositionTitleRow}>
                <Icon name="lab" size={15} color={theme.colors.primary} />
                <ThemedText variant="small" style={styles.dispositionTitle}>
                  Diagnostic Services
                </ThemedText>
                {orderedLabsCount > 0 ? (
                  <Badge variant="info" size="sm" label={`${orderedLabsCount} ordered`} />
                ) : null}
              </View>
            </View>
            <View style={styles.dispositionControls}>
              <View style={styles.segmentedGroup}>
                {diagnosticServiceChoices.map((choice) => {
                  const selected = effectiveDiagOption === choice.code;
                  return (
                    <Pressable
                      key={choice.code}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: selected, disabled }}
                      disabled={disabled}
                      onPress={() => onChange({ ...value, diagnosticServicesOption: choice.code })}
                      testID={`diag-option-${choice.code}`}
                      style={[
                        styles.segmentBtn,
                        selected ? styles.segmentBtnActive : styles.segmentBtnIdle,
                      ]}
                    >
                      <ThemedText
                        variant="small"
                        style={{
                          color: selected ? theme.colors.primaryDark : theme.colors.textSecondary,
                          fontWeight: selected ? '600' : '500',
                        }}
                      >
                        {choice.label}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>
              {!disabled && onOpenOrderDiagnostics && effectiveDiagOption === 'Y' ? (
                <Button
                  title="Order labs"
                  icon="plus"
                  variant="outline"
                  size="sm"
                  onPress={onOpenOrderDiagnostics}
                />
              ) : null}
            </View>
          </View>

          {/* G. Medication Prescription */}
          <View style={styles.dispositionRow}>
            <View style={styles.dispositionLabelCol}>
              <View style={styles.dispositionTitleRow}>
                <Icon name="pill" size={15} color={theme.colors.primary} />
                <ThemedText variant="small" style={styles.dispositionTitle}>
                  Medication Prescription
                </ThemedText>
                {prescriptionsCount > 0 ? (
                  <Badge variant="info" size="sm" label={`${prescriptionsCount} prescribed`} />
                ) : null}
              </View>
            </View>
            <View style={styles.dispositionControls}>
              <View style={styles.segmentedGroup}>
                {[
                  { flag: false, label: 'No' },
                  { flag: true, label: 'Yes' },
                ].map((choice) => {
                  const selected = effectiveHasRx === choice.flag;
                  return (
                    <Pressable
                      key={choice.label}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: selected, disabled }}
                      disabled={disabled}
                      onPress={() =>
                        onChange({ ...value, hasMedicationPrescription: choice.flag })
                      }
                      testID={`rx-flag-${choice.flag ? 'yes' : 'no'}`}
                      style={[
                        styles.segmentBtn,
                        selected ? styles.segmentBtnActive : styles.segmentBtnIdle,
                      ]}
                    >
                      <ThemedText
                        variant="small"
                        style={{
                          color: selected ? theme.colors.primaryDark : theme.colors.textSecondary,
                          fontWeight: selected ? '600' : '500',
                        }}
                      >
                        {choice.label}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>
              {!disabled && onOpenAddMedication && effectiveHasRx && prescriptionsCount === 0 ? (
                <Button
                  title="Add Rx"
                  icon="plus"
                  variant="outline"
                  size="sm"
                  onPress={onOpenAddMedication}
                />
              ) : null}
            </View>
          </View>

          {/* H. Referral */}
          <View style={styles.dispositionRow}>
            <View style={styles.dispositionLabelCol}>
              <View style={styles.dispositionTitleRow}>
                <Icon name="arrowUpRight" size={15} color={theme.colors.primary} />
                <ThemedText variant="small" style={styles.dispositionTitle}>
                  Facility / Specialist Referral
                </ThemedText>
                {hasIssuedReferral ? (
                  <Badge variant="success" size="sm" label="Issued" />
                ) : null}
              </View>
            </View>
            <View style={styles.dispositionControls}>
              <View style={styles.segmentedGroup}>
                {[
                  { flag: false, label: 'No' },
                  { flag: true, label: 'Yes' },
                ].map((choice) => {
                  const selected = effectiveHasReferral === choice.flag;
                  return (
                    <Pressable
                      key={choice.label}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: selected, disabled }}
                      disabled={disabled}
                      onPress={() => onChange({ ...value, hasReferral: choice.flag })}
                      testID={`referral-flag-${choice.flag ? 'yes' : 'no'}`}
                      style={[
                        styles.segmentBtn,
                        selected ? styles.segmentBtnActive : styles.segmentBtnIdle,
                      ]}
                    >
                      <ThemedText
                        variant="small"
                        style={{
                          color: selected ? theme.colors.primaryDark : theme.colors.textSecondary,
                          fontWeight: selected ? '600' : '500',
                        }}
                      >
                        {choice.label}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>
              {!disabled && onOpenIssueReferral && effectiveHasReferral && !hasIssuedReferral ? (
                <Button
                  title="Issue referral"
                  icon="file"
                  variant="outline"
                  size="sm"
                  onPress={onOpenIssueReferral}
                />
              ) : null}
            </View>
          </View>
        </View>
      </View>

      {/* Other Medical Advice */}
      <View style={[styles.sectionBlock, styles.sectionDivider]}>
        <Input
          label="Other medical advice"
          placeholder="Specific dietary guidance, activity precautions, or counseling remarks"
          value={value.otherMedicalAdviceSpec}
          onChangeText={(text) => onChange({ ...value, otherMedicalAdviceSpec: text })}
          editable={!disabled}
        />
      </View>

      {/* I. Follow-Up */}
      <View style={[styles.sectionBlock, styles.sectionDivider]}>
        <View style={styles.inlineToggleRow}>
          <View style={styles.sectionTitleWrap}>
            <ThemedText variant="bodyBold">Follow-Up Schedule</ThemedText>
            <ThemedText variant="caption" color={theme.colors.textSecondary}>
              Return visit date, clinical reason, and next immunization schedule if applicable
            </ThemedText>
          </View>
          <View style={styles.segmentedGroup}>
            {[
              { flag: false, label: 'No' },
              { flag: true, label: 'Yes' },
            ].map((choice) => {
              const selected = value.hasFollowUp === choice.flag;
              return (
                <Pressable
                  key={choice.label}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected, disabled }}
                  disabled={disabled}
                  onPress={() => onChange({ ...value, hasFollowUp: choice.flag })}
                  testID={`followup-flag-${choice.flag ? 'yes' : 'no'}`}
                  style={[
                    styles.segmentBtn,
                    selected ? styles.segmentBtnActive : styles.segmentBtnIdle,
                  ]}
                >
                  <ThemedText
                    variant="small"
                    style={{
                      color: selected ? theme.colors.primaryDark : theme.colors.textSecondary,
                      fontWeight: selected ? '600' : '500',
                    }}
                  >
                    {choice.label}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
        </View>

        {value.hasFollowUp ? (
          <View style={styles.nestedBox}>
            <View style={styles.twoColRow}>
              <Input
                label="Follow-up date or schedule"
                placeholder="YYYY-MM-DD or After 2 weeks"
                value={followUpScheduleValue}
                onChangeText={(text) =>
                  onChange({
                    ...value,
                    followUpDate: /^\d{4}-\d{2}-\d{2}$/.test(text.trim()) ? text.trim() : '',
                    followUpScheduleText: text,
                  })
                }
                editable={!disabled}
                containerStyle={styles.dateField}
              />
              <Input
                label="Reason for follow-up"
                placeholder="e.g. Review lab results and blood pressure control"
                value={value.followUpReason}
                onChangeText={(text) => onChange({ ...value, followUpReason: text })}
                editable={!disabled}
                containerStyle={styles.flexField}
              />
            </View>
            <View style={styles.twoColRow}>
              <Input
                label="Next vaccine (optional)"
                placeholder="e.g. Hepatitis B Dose 2"
                value={value.followUpVaccineName}
                onChangeText={(text) => onChange({ ...value, followUpVaccineName: text })}
                editable={!disabled}
                containerStyle={styles.flexField}
              />
              <Input
                label="Next vaccination date (optional)"
                placeholder="YYYY-MM-DD"
                value={value.followUpVaccineNextDate}
                onChangeText={(text) => onChange({ ...value, followUpVaccineNextDate: text })}
                editable={!disabled}
                containerStyle={styles.dateField}
              />
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  embeddedRoot: {
    gap: theme.spacing.md,
  },
  standaloneCard: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.md,
    gap: theme.spacing.md,
  },
  sectionBlock: {
    gap: theme.spacing.sm,
  },
  sectionDivider: {
    paddingTop: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderLight,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  inlineToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  sectionTitleWrap: {
    flex: 1,
    minWidth: 220,
    gap: theme.spacing.xs,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radii.full,
    borderWidth: 1,
  },
  chipIdle: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.borderDark,
  },
  chipSelected: {
    backgroundColor: theme.colors.primaryLight,
    borderColor: theme.colors.primary,
  },
  chipDisabled: {
    opacity: 0.6,
  },
  cohortTabBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  cohortTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radii.md,
    borderWidth: 1,
  },
  cohortTabIdle: {
    backgroundColor: theme.colors.surfaceMuted,
    borderColor: theme.colors.border,
  },
  cohortTabActive: {
    backgroundColor: theme.colors.primarySubtle,
    borderColor: theme.colors.primary,
    ...theme.shadows.brandSubtle,
  },
  cohortCountPill: {
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: 2,
    borderRadius: theme.radii.full,
  },
  cohortCountPillActive: {
    backgroundColor: theme.colors.primaryLight,
  },
  cohortCountPillNeutral: {
    backgroundColor: theme.colors.surfaceSubtle,
  },
  segmentedGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 2,
    gap: 2,
  },
  segmentBtn: {
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radii.sm,
  },
  segmentBtnIdle: {
    backgroundColor: 'transparent',
  },
  segmentBtnActive: {
    backgroundColor: theme.colors.primaryLight,
    ...theme.shadows.brandSubtle,
  },
  dispositionList: {
    gap: theme.spacing.xs,
  },
  dispositionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  dispositionLabelCol: {
    flex: 1,
    minWidth: 180,
  },
  dispositionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    flexWrap: 'wrap',
  },
  dispositionTitle: {
    fontWeight: '600',
    color: theme.colors.text,
  },
  dispositionControls: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  nestedBox: {
    backgroundColor: theme.colors.surfaceMuted,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    padding: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  twoColRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  flexField: {
    flex: 2,
    minWidth: 220,
  },
  dateField: {
    flex: 1,
    minWidth: 160,
  },
});

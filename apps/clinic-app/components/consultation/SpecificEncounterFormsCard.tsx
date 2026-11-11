import React, { useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import ThemedText from '../ui/ThemedText';
import Badge from '../ui/Badge';
import Icon from '../ui/Icon';
import Input from '../ui/Input';
import { theme } from '../../constants/theme';
import type {
  EncounterObGyneExamDto,
  EncounterPediatricMilestoneDto,
  EncounterAdolescentAssessmentDto,
  EncounterHeadsssDomainAssessmentDto,
  PatientBpMonitoringLogDto,
} from '../../services/clinicService';

export type FormTab = 'obgyne' | 'pediatric' | 'adolescent' | 'headsss' | 'bplog';

export interface EncounterFormTabDescriptor {
  id: FormTab;
  label: string;
  shortLabel: string;
  hasData: boolean;
  isRecommended: boolean;
}

export interface EncounterFormsCohortInput {
  patientAgeYears?: number | null;
  patientDateOfBirth?: string | null;
  patientSex?: string | null;
  obGyneExam?: EncounterObGyneExamDto | null;
  pediatricMilestones?: EncounterPediatricMilestoneDto[];
  adolescentAssessment?: EncounterAdolescentAssessmentDto | null;
  headsssAssessments?: EncounterHeadsssDomainAssessmentDto[];
  bpMonitoringLogs?: PatientBpMonitoringLogDto[];
}

function normalizePatientSex(sex?: string | null): 'female' | 'male' | null {
  if (!sex) return null;
  const normalized = sex.trim().toLowerCase();
  if (normalized.startsWith('f')) return 'female';
  if (normalized.startsWith('m')) return 'male';
  return null;
}

function resolveAgeYears(patientAgeYears?: number | null, patientDateOfBirth?: string | null): number | null {
  if (patientDateOfBirth) {
    const dob = new Date(patientDateOfBirth);
    if (!Number.isNaN(dob.getTime())) {
      const now = new Date();
      let years = now.getFullYear() - dob.getFullYear();
      const birthdayThisYear = new Date(now.getFullYear(), dob.getMonth(), dob.getDate());
      if (now < birthdayThisYear) {
        years -= 1;
      }
      return Math.max(0, years);
    }
  }
  if (typeof patientAgeYears === 'number' && !Number.isNaN(patientAgeYears)) {
    return Math.max(0, patientAgeYears);
  }
  return null;
}

export function getEncounterFormTabsForPatient({
  patientAgeYears,
  patientDateOfBirth,
  patientSex,
  obGyneExam,
  pediatricMilestones = [],
  adolescentAssessment,
  headsssAssessments = [],
  bpMonitoringLogs = [],
}: EncounterFormsCohortInput): EncounterFormTabDescriptor[] {
  const ageYears = resolveAgeYears(patientAgeYears, patientDateOfBirth);
  const sex = normalizePatientSex(patientSex);
  const hasDemographics = ageYears !== null || sex !== null;

  const hasObGyneData = Boolean(
    obGyneExam &&
      (obGyneExam.gravidity != null ||
        obGyneExam.parity != null ||
        Boolean(obGyneExam.lmp) ||
        Boolean(obGyneExam.edd) ||
        obGyneExam.fundicHeightCm != null ||
        obGyneExam.fetalHeartToneBpm != null ||
        Boolean(obGyneExam.fetalPresentation))
  );
  const hasPediatricData = pediatricMilestones.length > 0;
  const hasAdolescentData = Boolean(
    adolescentAssessment &&
      (adolescentAssessment.tannerStage != null ||
        adolescentAssessment.menarcheAgeYears != null ||
        Boolean(adolescentAssessment.smrBreastRating) ||
        Boolean(adolescentAssessment.smrPubicHairRating))
  );
  const hasHeadsssData = headsssAssessments.length > 0;
  const hasBpLogData = bpMonitoringLogs.length > 0;

  const allTabs: Array<EncounterFormTabDescriptor & { visible: boolean }> = [
    {
      id: 'obgyne',
      label: 'Ob-Gyne Exam',
      shortLabel: 'Ob-Gyne',
      hasData: hasObGyneData,
      isRecommended:
        hasDemographics &&
        sex === 'female' &&
        (ageYears === null || (ageYears >= 12 && ageYears <= 55)),
      visible:
        !hasDemographics ||
        hasObGyneData ||
        (sex !== 'male' && (ageYears === null || ageYears >= 10)),
    },
    {
      id: 'pediatric',
      label: 'Pediatric Milestones',
      shortLabel: 'Pediatric',
      hasData: hasPediatricData,
      isRecommended: ageYears !== null && ageYears < 10,
      visible: !hasDemographics || hasPediatricData || ageYears === null || ageYears < 10,
    },
    {
      id: 'adolescent',
      label: 'Adolescent Assessment',
      shortLabel: 'Adolescent',
      hasData: hasAdolescentData,
      isRecommended: ageYears !== null && ageYears >= 10 && ageYears <= 19,
      visible:
        !hasDemographics ||
        hasAdolescentData ||
        ageYears === null ||
        (ageYears >= 10 && ageYears <= 19),
    },
    {
      id: 'headsss',
      label: 'HEADSSS Assessment',
      shortLabel: 'HEADSSS',
      hasData: hasHeadsssData,
      isRecommended: ageYears !== null && ageYears >= 10 && ageYears <= 19,
      visible:
        !hasDemographics ||
        hasHeadsssData ||
        ageYears === null ||
        (ageYears >= 10 && ageYears <= 19),
    },
    {
      id: 'bplog',
      label: 'BP Monitoring Log',
      shortLabel: 'BP Log',
      hasData: hasBpLogData,
      isRecommended: ageYears !== null && ageYears >= 20,
      visible: !hasDemographics || hasBpLogData || ageYears === null || ageYears >= 3,
    },
  ];

  const visibleTabs = allTabs
    .filter((t) => t.visible)
    .map(({ visible: _visible, ...tab }) => tab);

  if (visibleTabs.length === 0) {
    const fallback = allTabs[allTabs.length - 1];
    return [
      {
        id: fallback.id,
        label: fallback.label,
        shortLabel: fallback.shortLabel,
        hasData: fallback.hasData,
        isRecommended: fallback.isRecommended,
      },
    ];
  }

  return visibleTabs;
}

export interface SpecificEncounterFormsCardProps {
  obGyneExam?: EncounterObGyneExamDto | null;
  onObGyneExamChange: (val: EncounterObGyneExamDto | null) => void;

  pediatricMilestones?: EncounterPediatricMilestoneDto[];
  onPediatricMilestonesChange: (val: EncounterPediatricMilestoneDto[]) => void;

  adolescentAssessment?: EncounterAdolescentAssessmentDto | null;
  onAdolescentAssessmentChange: (val: EncounterAdolescentAssessmentDto | null) => void;

  headsssAssessments?: EncounterHeadsssDomainAssessmentDto[];
  onHeadsssAssessmentsChange: (val: EncounterHeadsssDomainAssessmentDto[]) => void;

  bpMonitoringLogs?: PatientBpMonitoringLogDto[];
  onBpMonitoringLogsChange: (val: PatientBpMonitoringLogDto[]) => void;

  patientAgeYears?: number | null;
  patientDateOfBirth?: string | null;
  patientSex?: string | null;
  defaultExpanded?: boolean;
  disabled?: boolean;
}

export default function SpecificEncounterFormsCard({
  obGyneExam,
  onObGyneExamChange,
  pediatricMilestones = [],
  onPediatricMilestonesChange,
  adolescentAssessment,
  onAdolescentAssessmentChange,
  headsssAssessments = [],
  onHeadsssAssessmentsChange,
  bpMonitoringLogs = [],
  onBpMonitoringLogsChange,
  patientAgeYears,
  patientDateOfBirth,
  patientSex,
  defaultExpanded = false,
  disabled = false,
}: SpecificEncounterFormsCardProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const visibleTabs = useMemo(
    () =>
      getEncounterFormTabsForPatient({
        patientAgeYears,
        patientDateOfBirth,
        patientSex,
        obGyneExam,
        pediatricMilestones,
        adolescentAssessment,
        headsssAssessments,
        bpMonitoringLogs,
      }),
    [
      patientAgeYears,
      patientDateOfBirth,
      patientSex,
      obGyneExam,
      pediatricMilestones,
      adolescentAssessment,
      headsssAssessments,
      bpMonitoringLogs,
    ]
  );

  const preferredTab: FormTab = useMemo(() => {
    const withData = visibleTabs.find((t) => t.hasData);
    if (withData) return withData.id;
    const recommended = visibleTabs.find((t) => t.isRecommended);
    if (recommended) return recommended.id;
    return visibleTabs[0]?.id ?? 'bplog';
  }, [visibleTabs]);

  const [activeTab, setActiveTab] = useState<FormTab>(preferredTab);

  const demographicKey = `${resolveAgeYears(patientAgeYears, patientDateOfBirth) ?? 'u'}:${normalizePatientSex(patientSex) ?? 'u'}`;
  useEffect(() => {
    setActiveTab(preferredTab);
    // Reset active tab when the patient demographic cohort changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demographicKey]);

  const effectiveActiveTab: FormTab = visibleTabs.some((t) => t.id === activeTab)
    ? activeTab
    : preferredTab;

  const activeCount = [
    Boolean(
      obGyneExam &&
        (obGyneExam.gravidity != null ||
          obGyneExam.parity != null ||
          Boolean(obGyneExam.lmp) ||
          Boolean(obGyneExam.edd) ||
          obGyneExam.fundicHeightCm != null ||
          obGyneExam.fetalHeartToneBpm != null ||
          Boolean(obGyneExam.fetalPresentation))
    ),
    pediatricMilestones.length > 0,
    Boolean(
      adolescentAssessment &&
        (adolescentAssessment.tannerStage != null ||
          adolescentAssessment.menarcheAgeYears != null ||
          Boolean(adolescentAssessment.smrBreastRating) ||
          Boolean(adolescentAssessment.smrPubicHairRating))
    ),
    headsssAssessments.length > 0,
    bpMonitoringLogs.length > 0,
  ].filter(Boolean).length;

  const normalizedSex = normalizePatientSex(patientSex);
  const showFemaleSmrFields =
    normalizedSex !== 'male' ||
    Boolean(adolescentAssessment?.menarcheAgeYears != null || adolescentAssessment?.smrBreastRating);

  const cohortSummaryLabel = visibleTabs.map((t) => t.shortLabel).join(', ');

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderRadius: theme.radii.lg,
          padding: theme.spacing.md,
        },
      ]}
    >
      {/* Header with expand / collapse toggle */}
      <TouchableOpacity
        onPress={() => setIsExpanded((prev) => !prev)}
        style={styles.headerRow}
      >
        <View style={styles.titleInfo}>
          <ThemedText variant="bodyBold">Specific Encounter Forms</ThemedText>
          <ThemedText variant="small" color={theme.colors.textSecondary}>
            PhilHealth YAKAP 2.0 specialized cohorts ({cohortSummaryLabel})
          </ThemedText>
        </View>
        <View style={styles.headerRight}>
          <Badge
            variant={activeCount > 0 ? 'primary' : 'neutral'}
            label={`${activeCount} Active`}
          />
          <Icon
            name={isExpanded ? 'chevronUp' : 'chevronDown'}
            size={theme.sizes.iconMd}
            color={theme.colors.textSecondary}
          />
        </View>
      </TouchableOpacity>

      {isExpanded && (
        <View style={{ marginTop: theme.spacing.md }}>
          {/* Tab Selector */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={[styles.tabBar, { gap: theme.spacing.xs, marginBottom: theme.spacing.md }]}
          >
            {visibleTabs.map((tab) => {
              const selected = effectiveActiveTab === tab.id;
              const highlighted = !selected && (tab.isRecommended || tab.hasData);
              return (
                <TouchableOpacity
                  key={tab.id}
                  testID={`encounter-form-tab-${tab.id}`}
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                  onPress={() => setActiveTab(tab.id)}
                  style={[
                    styles.tabPill,
                    {
                      backgroundColor: selected
                        ? theme.colors.primaryLight
                        : highlighted
                          ? theme.colors.primaryLighter
                          : theme.colors.surfaceSubtle,
                      borderColor: selected
                        ? theme.colors.primary
                        : highlighted
                          ? theme.colors.primaryBorder
                          : theme.colors.border,
                      borderRadius: theme.radii.full,
                      paddingHorizontal: theme.spacing.md,
                      paddingVertical: theme.spacing.xs,
                    },
                    selected && theme.shadows.brandSubtle,
                  ]}
                >
                  {tab.hasData ? (
                    <Icon
                      name="check"
                      size={theme.sizes.iconSm}
                      color={selected ? theme.colors.primaryDark : theme.colors.success}
                    />
                  ) : tab.isRecommended ? (
                    <View
                      style={[
                        styles.recommendedDot,
                        {
                          backgroundColor: selected ? theme.colors.primaryDark : theme.colors.primary,
                          borderRadius: theme.radii.full,
                        },
                      ]}
                    />
                  ) : null}
                  <ThemedText
                    variant="caption"
                    style={{
                      color: selected || highlighted ? theme.colors.primaryDark : theme.colors.text,
                      fontWeight: selected ? '700' : highlighted ? '600' : '500',
                    }}
                  >
                    {tab.label}
                  </ThemedText>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Tab 1: Ob-Gyne Exam */}
          {effectiveActiveTab === 'obgyne' && (
            <View style={{ gap: theme.spacing.sm }}>
              <View style={styles.rowTwo}>
                <Input
                  label="Gravidity (G)"
                  value={obGyneExam?.gravidity != null ? String(obGyneExam.gravidity) : ''}
                  onChangeText={(val) => onObGyneExamChange({ ...obGyneExam, gravidity: parseInt(val, 10) || null })}
                  keyboardType="numeric"
                  editable={!disabled}
                  containerStyle={styles.flexField}
                />
                <Input
                  label="Parity (P)"
                  value={obGyneExam?.parity != null ? String(obGyneExam.parity) : ''}
                  onChangeText={(val) => onObGyneExamChange({ ...obGyneExam, parity: parseInt(val, 10) || null })}
                  keyboardType="numeric"
                  editable={!disabled}
                  containerStyle={styles.flexField}
                />
              </View>
              <View style={styles.rowTwo}>
                <Input
                  label="Last Menstrual Period (LMP)"
                  value={obGyneExam?.lmp || ''}
                  onChangeText={(val) => onObGyneExamChange({ ...obGyneExam, lmp: val })}
                  placeholder="YYYY-MM-DD"
                  editable={!disabled}
                  containerStyle={styles.flexField}
                />
                <Input
                  label="Expected Date of Delivery (EDD)"
                  value={obGyneExam?.edd || ''}
                  onChangeText={(val) => onObGyneExamChange({ ...obGyneExam, edd: val })}
                  placeholder="YYYY-MM-DD"
                  editable={!disabled}
                  containerStyle={styles.flexField}
                />
              </View>
              <View style={styles.rowTwo}>
                <Input
                  label="Fundic Height (cm)"
                  value={obGyneExam?.fundicHeightCm != null ? String(obGyneExam.fundicHeightCm) : ''}
                  onChangeText={(val) => onObGyneExamChange({ ...obGyneExam, fundicHeightCm: parseFloat(val) || null })}
                  keyboardType="numeric"
                  editable={!disabled}
                  containerStyle={styles.flexField}
                />
                <Input
                  label="Fetal Heart Tone (bpm)"
                  value={obGyneExam?.fetalHeartToneBpm != null ? String(obGyneExam.fetalHeartToneBpm) : ''}
                  onChangeText={(val) => onObGyneExamChange({ ...obGyneExam, fetalHeartToneBpm: parseInt(val, 10) || null })}
                  keyboardType="numeric"
                  editable={!disabled}
                  containerStyle={styles.flexField}
                />
              </View>
              <Input
                label="Fetal Presentation / Remarks"
                value={obGyneExam?.fetalPresentation || ''}
                onChangeText={(val) => onObGyneExamChange({ ...obGyneExam, fetalPresentation: val })}
                placeholder="e.g. Cephalic, Breech, Transverse"
                editable={!disabled}
              />
            </View>
          )}

          {/* Tab 2: Pediatric Milestones */}
          {effectiveActiveTab === 'pediatric' && (
            <View style={{ gap: theme.spacing.sm }}>
              <Input
                label="Milestone Age / Visit Age"
                value={pediatricMilestones[0]?.milestoneVisitAge || ''}
                onChangeText={(val) => {
                  const first = pediatricMilestones[0] || { grossMotorStatus: 'Normal' };
                  onPediatricMilestonesChange([{ ...first, milestoneVisitAge: val }]);
                }}
                placeholder="e.g. 2 months, 6 months, 1 year"
                editable={!disabled}
              />
              <View style={styles.rowTwo}>
                <Input
                  label="Gross Motor"
                  value={pediatricMilestones[0]?.grossMotorStatus || ''}
                  onChangeText={(val) => {
                    const first = pediatricMilestones[0] || {};
                    onPediatricMilestonesChange([{ ...first, grossMotorStatus: val }]);
                  }}
                  placeholder="e.g. Normal, Delayed"
                  editable={!disabled}
                  containerStyle={styles.flexField}
                />
                <Input
                  label="Fine Motor"
                  value={pediatricMilestones[0]?.fineMotorStatus || ''}
                  onChangeText={(val) => {
                    const first = pediatricMilestones[0] || {};
                    onPediatricMilestonesChange([{ ...first, fineMotorStatus: val }]);
                  }}
                  placeholder="e.g. Normal, Delayed"
                  editable={!disabled}
                  containerStyle={styles.flexField}
                />
              </View>
              <Input
                label="Pediatric Danger Signs (comma-separated)"
                value={pediatricMilestones[0]?.dangerSigns?.join(', ') || ''}
                onChangeText={(val) => {
                  const first = pediatricMilestones[0] || {};
                  const signs = val.split(',').map((s) => s.trim()).filter(Boolean);
                  onPediatricMilestonesChange([{ ...first, dangerSigns: signs }]);
                }}
                placeholder="e.g. Convulsions, Lethargy, Inability to feed"
                editable={!disabled}
              />
            </View>
          )}

          {/* Tab 3: Adolescent Assessment */}
          {effectiveActiveTab === 'adolescent' && (
            <View style={{ gap: theme.spacing.sm }}>
              {showFemaleSmrFields ? (
                <>
                  <View style={styles.rowTwo}>
                    <Input
                      label="Tanner Stage (1 - 5)"
                      value={adolescentAssessment?.tannerStage != null ? String(adolescentAssessment.tannerStage) : ''}
                      onChangeText={(val) => onAdolescentAssessmentChange({ ...adolescentAssessment, tannerStage: parseInt(val, 10) || null })}
                      keyboardType="numeric"
                      editable={!disabled}
                      containerStyle={styles.flexField}
                    />
                    <Input
                      label="Menarche Age (Years)"
                      value={adolescentAssessment?.menarcheAgeYears != null ? String(adolescentAssessment.menarcheAgeYears) : ''}
                      onChangeText={(val) => onAdolescentAssessmentChange({ ...adolescentAssessment, menarcheAgeYears: parseInt(val, 10) || null })}
                      keyboardType="numeric"
                      editable={!disabled}
                      containerStyle={styles.flexField}
                    />
                  </View>
                  <View style={styles.rowTwo}>
                    <Input
                      label="SMR Breast Rating"
                      value={adolescentAssessment?.smrBreastRating || ''}
                      onChangeText={(val) => onAdolescentAssessmentChange({ ...adolescentAssessment, smrBreastRating: val })}
                      placeholder="Stage 1 - 5"
                      editable={!disabled}
                      containerStyle={styles.flexField}
                    />
                    <Input
                      label="SMR Pubic Hair Rating"
                      value={adolescentAssessment?.smrPubicHairRating || ''}
                      onChangeText={(val) => onAdolescentAssessmentChange({ ...adolescentAssessment, smrPubicHairRating: val })}
                      placeholder="Stage 1 - 5"
                      editable={!disabled}
                      containerStyle={styles.flexField}
                    />
                  </View>
                </>
              ) : (
                <View style={styles.rowTwo}>
                  <Input
                    label="Tanner Stage (1 - 5)"
                    value={adolescentAssessment?.tannerStage != null ? String(adolescentAssessment.tannerStage) : ''}
                    onChangeText={(val) => onAdolescentAssessmentChange({ ...adolescentAssessment, tannerStage: parseInt(val, 10) || null })}
                    keyboardType="numeric"
                    editable={!disabled}
                    containerStyle={styles.flexField}
                  />
                  <Input
                    label="SMR Pubic Hair Rating"
                    value={adolescentAssessment?.smrPubicHairRating || ''}
                    onChangeText={(val) => onAdolescentAssessmentChange({ ...adolescentAssessment, smrPubicHairRating: val })}
                    placeholder="Stage 1 - 5"
                    editable={!disabled}
                    containerStyle={styles.flexField}
                  />
                </View>
              )}
            </View>
          )}

          {/* Tab 4: HEADSSS Assessment */}
          {effectiveActiveTab === 'headsss' && (
            <View style={{ gap: theme.spacing.sm }}>
              {['Home', 'Education', 'Activities', 'Drugs', 'Sexuality', 'Suicide', 'Safety'].map((domain) => {
                const existing = headsssAssessments.find((h) => h.domain === domain);
                return (
                  <Input
                    key={domain}
                    label={`HEADSSS: ${domain}`}
                    value={existing?.assessmentText || ''}
                    onChangeText={(val) => {
                      const updated = headsssAssessments.filter((h) => h.domain !== domain);
                      if (val.trim()) {
                        updated.push({ domain, assessmentText: val, hasRedFlags: false });
                      }
                      onHeadsssAssessmentsChange(updated);
                    }}
                    placeholder={`Clinical observations regarding ${domain}...`}
                    editable={!disabled}
                  />
                );
              })}
            </View>
          )}

          {/* Tab 5: BP Monitoring Log */}
          {effectiveActiveTab === 'bplog' && (
            <View style={{ gap: theme.spacing.sm }}>
              <View style={styles.rowTwo}>
                <Input
                  label="Systolic (mmHg)"
                  value={bpMonitoringLogs[0]?.systolic != null ? String(bpMonitoringLogs[0].systolic) : ''}
                  onChangeText={(val) => {
                    const first = bpMonitoringLogs[0] || { recordedAt: new Date().toISOString(), diastolic: 80 };
                    onBpMonitoringLogsChange([{ ...first, systolic: parseInt(val, 10) || 120 }]);
                  }}
                  keyboardType="numeric"
                  editable={!disabled}
                  containerStyle={styles.flexField}
                />
                <Input
                  label="Diastolic (mmHg)"
                  value={bpMonitoringLogs[0]?.diastolic != null ? String(bpMonitoringLogs[0].diastolic) : ''}
                  onChangeText={(val) => {
                    const first = bpMonitoringLogs[0] || { recordedAt: new Date().toISOString(), systolic: 120 };
                    onBpMonitoringLogsChange([{ ...first, diastolic: parseInt(val, 10) || 80 }]);
                  }}
                  keyboardType="numeric"
                  editable={!disabled}
                  containerStyle={styles.flexField}
                />
              </View>
              <View style={styles.rowTwo}>
                <Input
                  label="Pulse (bpm)"
                  value={bpMonitoringLogs[0]?.pulseBpm != null ? String(bpMonitoringLogs[0].pulseBpm) : ''}
                  onChangeText={(val) => {
                    const first = bpMonitoringLogs[0] || { recordedAt: new Date().toISOString(), systolic: 120, diastolic: 80 };
                    onBpMonitoringLogsChange([{ ...first, pulseBpm: parseInt(val, 10) || null }]);
                  }}
                  keyboardType="numeric"
                  editable={!disabled}
                  containerStyle={styles.flexField}
                />
                <Input
                  label="Location / Arm"
                  value={bpMonitoringLogs[0]?.location || bpMonitoringLogs[0]?.arm || ''}
                  onChangeText={(val) => {
                    const first = bpMonitoringLogs[0] || { recordedAt: new Date().toISOString(), systolic: 120, diastolic: 80 };
                    onBpMonitoringLogsChange([{ ...first, location: val, arm: val }]);
                  }}
                  placeholder="e.g. Right Arm, Sitting"
                  editable={!disabled}
                  containerStyle={styles.flexField}
                />
              </View>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: theme.sizes.borderWidth,
    width: '100%',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  titleInfo: {
    flex: 1,
    marginRight: theme.spacing.md,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  tabBar: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tabPill: {
    borderWidth: theme.sizes.borderWidth,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  recommendedDot: {
    width: theme.spacing.xs + 2,
    height: theme.spacing.xs + 2,
  },
  rowTwo: {
    flexDirection: 'row',
    gap: theme.spacing.md,
  },
  flexField: {
    flex: 1,
  },
});

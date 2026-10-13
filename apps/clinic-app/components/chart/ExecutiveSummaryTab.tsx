import React, { useMemo, useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Pressable } from 'react-native';
import { theme } from '../../constants/theme';
import { ThemedText, Badge, Icon, EmptyState } from '../ui';
import {
  ORGAN_SYSTEMS,
  type OrganSystemDef,
} from './OrganSystemsExamSection';
import { usePhilHealthCatalog } from '../../utils/usePhilHealthCatalog';
import {
  clinicService,
  type ClinicPatient,
  type PatientChart,
  type PatientProblemRecord,
  type PatientAllergyRecord,
  type ConsultationRecord,
  type ClinicLabOrderRecord,
  type TriageVitals,
  type PhilHealthPatientProfile,
} from '../../services/clinicService';

export interface ExecutiveSummaryTabProps {
  patient?: ClinicPatient | null;
  chart?: PatientChart | null;
  patientChart?: PatientChart | null;
  profile?: PhilHealthPatientProfile | null;
  onNavigateTab: (tab: any) => void;
  onRefreshChart?: () => void;
  onOpenAddProblemModal?: () => void;
  onOpenAddAllergyModal?: () => void;
}

interface OrganSystemSummaryCardProps {
  system: OrganSystemDef;
  code?: string;
  remarks?: string;
  onPress?: () => void;
}

function OrganSystemSummaryCard({ system, code, remarks, onPress }: OrganSystemSummaryCardProps) {
  const { items } = usePhilHealthCatalog(system.library);
  const selectedItem = items.find((i) => i.code === code);
  const isNormal = code ? code === system.defaultNormalCode : true;
  const displayLabel = selectedItem?.description || (isNormal ? 'Essentially normal' : `Code: ${code}`);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${system.label}: ${displayLabel}`}
      style={[styles.organSummaryCard, !isNormal && styles.organSummaryCard_abnormal]}
    >
      <View style={styles.organSummaryCardTop}>
        <ThemedText variant="captionBold" color={theme.colors.textSecondary} numberOfLines={1}>
          {system.label}
        </ThemedText>
        <Badge
          label={isNormal ? 'Normal' : 'Abnormal'}
          variant={isNormal ? 'routine' : 'warning'}
          size="sm"
        />
      </View>
      <ThemedText
        variant="bodyBold"
        color={isNormal ? theme.colors.text : theme.colors.warningText}
        numberOfLines={1}
        style={{ marginTop: 2 }}
      >
        {displayLabel}
      </ThemedText>
      {remarks ? (
        <ThemedText variant="caption" color={theme.colors.textMuted} numberOfLines={1} style={{ marginTop: 2 }}>
          {remarks}
        </ThemedText>
      ) : null}
    </Pressable>
  );
}

export default function ExecutiveSummaryTab({
  patient,
  chart: chartProp,
  patientChart,
  profile: profileProp,
  onNavigateTab,
  onRefreshChart,
  onOpenAddProblemModal,
  onOpenAddAllergyModal,
}: ExecutiveSummaryTabProps) {
  const chart = chartProp || patientChart;

  // PhilHealth Patient Profile & Organ Systems Examination findings
  const [organProfile, setOrganProfile] = useState<PhilHealthPatientProfile | null>(profileProp || null);

  useEffect(() => {
    if (profileProp) {
      setOrganProfile(profileProp);
      return;
    }
    const pid = patient?.id || chart?.patientId;
    if (!pid) return;

    let isMounted = true;
    clinicService
      .getPhilHealthPatientProfile(pid)
      .then(([data]) => {
        if (isMounted && data) {
          setOrganProfile(data);
        }
      })
      .catch(() => {
        // Fallback gracefully without breaking view
      });

    return () => {
      isMounted = false;
    };
  }, [patient?.id, chart?.patientId, profileProp]);

  const abnormalOrganCount = useMemo(() => {
    if (!organProfile) return 0;
    return ORGAN_SYSTEMS.filter((sys) => {
      const val = organProfile[sys.key as keyof PhilHealthPatientProfile] as string | undefined;
      return val && val !== sys.defaultNormalCode;
    }).length;
  }, [organProfile]);

  const activeProblems: PatientProblemRecord[] = useMemo(() => {
    if (chart?.problems && chart.problems.length > 0) {
      return chart.problems.filter((p) => p.status === 'Active');
    }
    if (patient?.chronicConditions) {
      return patient.chronicConditions.split(',').map((c, i) => ({
        id: `c-${i}`,
        clinicId: '',
        patientId: patient.id,
        icd10Code: 'CHRONIC',
        problemTitle: c.trim(),
        status: 'Active' as const,
        severity: 'Moderate' as const,
        isChronicNcd: true,
        recordedByDoctorId: '',
        recordedByDoctorName: '',
        createdAt: '',
      }));
    }
    return [];
  }, [chart?.problems, patient?.chronicConditions, patient?.id]);

  const allergies: PatientAllergyRecord[] = useMemo(() => {
    if (chart?.allergies && chart.allergies.length > 0) {
      return chart.allergies;
    }
    if (patient?.allergies) {
      return [
        {
          id: 'alg-legacy',
          clinicId: '',
          patientId: patient.id,
          category: 'Other' as const,
          allergen: patient.allergies,
          severity: /anaphylax|severe|penicillin/i.test(patient.allergies) ? ('LifeThreatening' as const) : ('Moderate' as const),
          isAnaphylactic: /anaphylax|severe|penicillin/i.test(patient.allergies),
          status: 'Active' as const,
          createdAt: '',
        },
      ];
    }
    return [];
  }, [chart?.allergies, patient?.allergies, patient?.id]);

  const hasAnaphylaxis = useMemo(() => {
    return allergies.some((a) => a.isAnaphylactic || a.severity === 'LifeThreatening');
  }, [allergies]);

  // Active prescriptions extracted from recent consultations
  const activePrescriptions = useMemo(() => {
    const list: Array<{
      id: string;
      genericName: string;
      dosage: string;
      form?: string;
      sig?: string;
      doctorName?: string;
      date?: string;
      philHealthDrugCode?: string;
    }> = [];

    const consultations = chart?.consultations || [];
    consultations.slice(0, 5).forEach((c) => {
      (c.prescriptions || []).forEach((rx) => {
        list.push({
          id: rx.id || `${c.id}-${rx.genericName}`,
          genericName: rx.genericName,
          dosage: rx.dosage || '',
          form: rx.form,
          sig: rx.sig,
          doctorName: c.doctorName,
          date: c.encounterDate,
          philHealthDrugCode: (rx as any)?.philHealthDrugCode,
        });
      });
    });
    return list;
  }, [chart?.consultations]);

  // Latest vitals and recent labs
  const latestVitals: TriageVitals | null = chart?.vitalsHistory?.[0] || null;
  const recentLabs: ClinicLabOrderRecord[] = useMemo(() => {
    return (chart?.labOrdersHistory || []).slice(0, 3);
  }, [chart?.labOrdersHistory]);

  const hasCriticalPanicAlert = useMemo(() => {
    return (chart?.labOrdersHistory || []).some(
      (order: any) => order.hasCriticalPanicAlert && !order.isPanicAcknowledged
    );
  }, [chart?.labOrdersHistory]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* ========================================================================= */}
      {/* QUICK STATS METRIC BAR                                                    */}
      {/* ========================================================================= */}
      <View style={styles.statsBar}>
        <View style={styles.statBox}>
          <ThemedText variant="caption" color={theme.colors.textSecondary}>Total Visits</ThemedText>
          <ThemedText variant="h2" color={theme.colors.primaryDark}>
            {chart?.totalVisits ?? 0}
          </ThemedText>
        </View>
        <View style={styles.statBox}>
          <ThemedText variant="caption" color={theme.colors.textSecondary}>Active Problems</ThemedText>
          <ThemedText variant="h2" color={activeProblems.length > 0 ? theme.colors.text : theme.colors.textMuted}>
            {activeProblems.length}
          </ThemedText>
        </View>
        <View style={[styles.statBox, hasAnaphylaxis && styles.statBox_emergency]}>
          <ThemedText variant="caption" color={hasAnaphylaxis ? theme.colors.emergencyText : theme.colors.textSecondary}>
            Allergies
          </ThemedText>
          <ThemedText variant="h2" color={hasAnaphylaxis ? theme.colors.emergencyText : allergies.length > 0 ? theme.colors.text : theme.colors.textMuted}>
            {allergies.length}
          </ThemedText>
        </View>
        <View style={styles.statBox}>
          <ThemedText variant="caption" color={theme.colors.textSecondary}>Active Regimens</ThemedText>
          <ThemedText variant="h2" color={activePrescriptions.length > 0 ? theme.colors.routineText : theme.colors.textMuted}>
            {activePrescriptions.length}
          </ThemedText>
        </View>
      </View>

      {/* ========================================================================= */}
      {/* 4-QUADRANT GRID                                                           */}
      {/* ========================================================================= */}
      <View style={styles.grid}>
        {/* QUADRANT 1: ACTIVE PROBLEMS & CHRONIC NCDs */}
        <View style={styles.quadrantCard}>
          <View style={styles.quadrantHeader}>
            <View style={styles.headerTitleGroup}>
              <Icon name="activity" size={theme.sizes.iconSm} color={theme.colors.primaryDark} />
              <ThemedText variant="h3" color={theme.colors.text}>Active Problems</ThemedText>
              <Badge label={String(activeProblems.length)} variant="routine" size="sm" />
            </View>
            {onOpenAddProblemModal ? (
              <Pressable onPress={onOpenAddProblemModal} style={styles.addBtn}>
                <Icon name="plus" size={14} color={theme.colors.primaryDark} />
                <ThemedText variant="captionBold" color={theme.colors.primaryDark}>Add</ThemedText>
              </Pressable>
            ) : null}
          </View>

          <View style={styles.quadrantBody}>
            {activeProblems.length > 0 ? (
              activeProblems.map((prob) => (
                <View key={prob.id} style={styles.problemItem}>
                  <View style={styles.problemItemTop}>
                    <Badge label={prob.icd10Code} variant="routine" size="sm" />
                    {prob.isChronicNcd ? (
                      <Badge label="Chronic NCD" variant="info" size="sm" />
                    ) : null}
                    <Badge
                      label={prob.severity}
                      variant={
                        prob.severity === 'Severe'
                          ? 'emergency'
                          : prob.severity === 'Moderate'
                          ? 'warning'
                          : 'success'
                      }
                      size="sm"
                    />
                  </View>
                  <ThemedText variant="bodyBold" color={theme.colors.text} style={{ marginTop: 4 }}>
                    {prob.problemTitle}
                  </ThemedText>
                  {prob.onsetDate ? (
                    <ThemedText variant="caption" color={theme.colors.textMuted}>
                      Onset: {prob.onsetDate}
                    </ThemedText>
                  ) : null}
                </View>
              ))
            ) : (
              <EmptyState
                icon="activity"
                title="No active problems recorded"
                description="Patient has zero documented active problems or NCDs."
              />
            )}
          </View>
        </View>

        {/* QUADRANT 2: VERIFIED ALLERGIES & ANAPHYLAXIS */}
        <View style={[styles.quadrantCard, hasAnaphylaxis && styles.quadrantCard_emergency]}>
          <View style={styles.quadrantHeader}>
            <View style={styles.headerTitleGroup}>
              <Icon
                name={hasAnaphylaxis ? 'emergency' : 'alert'}
                size={theme.sizes.iconSm}
                color={hasAnaphylaxis ? theme.colors.emergencyText : theme.colors.warningText}
              />
              <ThemedText variant="h3" color={hasAnaphylaxis ? theme.colors.emergencyText : theme.colors.text}>
                Verified Allergies
              </ThemedText>
              <Badge
                label={String(allergies.length)}
                variant={hasAnaphylaxis ? 'emergency' : allergies.length > 0 ? 'warning' : 'neutral'}
                size="sm"
              />
            </View>
            {onOpenAddAllergyModal ? (
              <Pressable onPress={onOpenAddAllergyModal} style={styles.addBtn}>
                <Icon name="plus" size={14} color={theme.colors.primaryDark} />
                <ThemedText variant="captionBold" color={theme.colors.primaryDark}>Add</ThemedText>
              </Pressable>
            ) : null}
          </View>

          {hasAnaphylaxis ? (
            <View style={styles.anaphylaxisWarningBanner}>
              <Icon name="emergency" size={theme.sizes.iconSm} color={theme.colors.emergencyText} />
              <ThemedText variant="captionBold" color={theme.colors.emergencyText} style={{ flex: 1 }}>
                CRITICAL SAFETY WARNING: Patient has confirmed life-threatening / anaphylactic allergies!
              </ThemedText>
            </View>
          ) : null}

          <View style={styles.quadrantBody}>
            {allergies.length > 0 ? (
              allergies.map((alg) => (
                <View key={alg.id} style={[styles.allergyItem, alg.isAnaphylactic && styles.allergyItem_emergency]}>
                  <View style={styles.allergyItemTop}>
                    <Badge label={alg.category} variant="neutral" size="sm" />
                    <Badge
                      label={alg.severity}
                      variant={
                        alg.severity === 'LifeThreatening' || alg.isAnaphylactic
                          ? 'emergency'
                          : alg.severity === 'Severe'
                          ? 'urgent'
                          : 'warning'
                      }
                      size="sm"
                    />
                  </View>
                  <ThemedText
                    variant="bodyBold"
                    color={alg.isAnaphylactic ? theme.colors.emergencyText : theme.colors.text}
                    style={{ marginTop: 4 }}
                  >
                    {alg.allergen}
                  </ThemedText>
                  {alg.reactionManifestation ? (
                    <ThemedText variant="caption" color={theme.colors.textSecondary}>
                      Reaction: {alg.reactionManifestation}
                    </ThemedText>
                  ) : null}
                </View>
              ))
            ) : (
              <EmptyState
                icon="shield"
                title="No known allergies recorded"
                description="Zero documented drug, food, or environmental allergies."
              />
            )}
          </View>
        </View>

        {/* QUADRANT 3: ONGOING MEDICATIONS & REGIMENS */}
        <View style={styles.quadrantCard}>
          <View style={styles.quadrantHeader}>
            <View style={styles.headerTitleGroup}>
              <Icon name="pill" size={theme.sizes.iconSm} color={theme.colors.routineText} />
              <ThemedText variant="h3" color={theme.colors.text}>Ongoing Medications</ThemedText>
              <Badge label={String(activePrescriptions.length)} variant="routine" size="sm" />
            </View>
            <Pressable onPress={() => onNavigateTab('encounters')} style={styles.actionLink}>
              <ThemedText variant="captionBold" color={theme.colors.primaryDark}>View E-Rx</ThemedText>
              <Icon name="arrowRight" size={12} color={theme.colors.primaryDark} />
            </Pressable>
          </View>

          <View style={styles.quadrantBody}>
            {activePrescriptions.length > 0 ? (
              activePrescriptions.slice(0, 5).map((rx) => (
                <View key={rx.id} style={styles.medItem}>
                  <View style={styles.medItemTop}>
                    <ThemedText variant="bodyBold" color={theme.colors.text} numberOfLines={1}>
                      {rx.genericName}
                    </ThemedText>
                    {rx.dosage ? (
                      <Badge label={rx.dosage} variant="routine" size="sm" />
                    ) : null}
                  </View>
                  {rx.sig ? (
                    <ThemedText variant="caption" color={theme.colors.textSecondary}>
                      Sig: {rx.sig}
                    </ThemedText>
                  ) : null}
                  {rx.doctorName ? (
                    <ThemedText variant="caption" color={theme.colors.textMuted}>
                      Prescribed by {rx.doctorName}
                    </ThemedText>
                  ) : null}
                </View>
              ))
            ) : (
              <EmptyState
                icon="pill"
                title="No active medications"
                description="No active prescriptions found from recent clinical encounters."
              />
            )}
          </View>
        </View>

        {/* QUADRANT 4: LONGITUDINAL VITALS & LAB TIMELINE */}
        <View style={styles.quadrantCard}>
          <View style={styles.quadrantHeader}>
            <View style={styles.headerTitleGroup}>
              <Icon name="heartPulse" size={theme.sizes.iconSm} color={theme.colors.primaryDark} />
              <ThemedText variant="h3" color={theme.colors.text}>Vitals & Lab Status</ThemedText>
            </View>
            <Pressable onPress={() => onNavigateTab('diagnostics')} style={styles.actionLink}>
              <ThemedText variant="captionBold" color={theme.colors.primaryDark}>Full Labs</ThemedText>
              <Icon name="arrowRight" size={12} color={theme.colors.primaryDark} />
            </Pressable>
          </View>

          {hasCriticalPanicAlert ? (
            <View style={styles.panicWarningBanner}>
              <Icon name="emergency" size={theme.sizes.iconSm} color={theme.colors.emergencyText} />
              <ThemedText variant="captionBold" color={theme.colors.emergencyText} style={{ flex: 1 }}>
                CRITICAL LAB PANIC: Critical value reported requiring verbal readback!
              </ThemedText>
            </View>
          ) : null}

          <View style={styles.quadrantBody}>
            {latestVitals ? (
              <View style={styles.vitalsMiniGrid}>
                <View style={styles.vitalMiniItem}>
                  <ThemedText variant="caption" color={theme.colors.textSecondary}>BP (mmHg)</ThemedText>
                  <ThemedText variant="bodyBold" color={theme.colors.text}>
                    {latestVitals.systolicBp && latestVitals.diastolicBp
                      ? `${latestVitals.systolicBp}/${latestVitals.diastolicBp}`
                      : '—'}
                  </ThemedText>
                </View>
                <View style={styles.vitalMiniItem}>
                  <ThemedText variant="caption" color={theme.colors.textSecondary}>HR (bpm)</ThemedText>
                  <ThemedText variant="bodyBold" color={theme.colors.text}>
                    {latestVitals.heartRateBpm ?? '—'}
                  </ThemedText>
                </View>
                <View style={styles.vitalMiniItem}>
                  <ThemedText variant="caption" color={theme.colors.textSecondary}>Temp (°C)</ThemedText>
                  <ThemedText variant="bodyBold" color={theme.colors.text}>
                    {latestVitals.temperatureCelsius ? `${latestVitals.temperatureCelsius}°C` : '—'}
                  </ThemedText>
                </View>
                <View style={styles.vitalMiniItem}>
                  <ThemedText variant="caption" color={theme.colors.textSecondary}>SpO2 (%)</ThemedText>
                  <ThemedText variant="bodyBold" color={theme.colors.text}>
                    {latestVitals.oxygenSaturationPercent ? `${latestVitals.oxygenSaturationPercent}%` : '—'}
                  </ThemedText>
                </View>
              </View>
            ) : (
              <ThemedText variant="caption" color={theme.colors.textMuted} style={{ fontStyle: 'italic', marginBottom: 8 }}>
                No vitals recorded for today.
              </ThemedText>
            )}

            <ThemedText variant="captionBold" color={theme.colors.textSecondary} style={{ marginTop: 8, marginBottom: 4 }}>
              Recent Diagnostic Lab Orders
            </ThemedText>
            {recentLabs.length > 0 ? (
              recentLabs.map((lab) => (
                <View key={lab.id} style={styles.labMiniItem}>
                  <View style={{ flex: 1 }}>
                    <ThemedText variant="captionBold" color={theme.colors.text}>
                      {lab.orderNumber}
                    </ThemedText>
                    <ThemedText variant="caption" color={theme.colors.textMuted}>
                      {(lab.items || []).map((i) => i.testName).join(', ') || 'Diagnostic tests'}
                    </ThemedText>
                  </View>
                  <Badge label={lab.status} variant={lab.status === 'Completed' ? 'success' : 'info'} size="sm" />
                </View>
              ))
            ) : (
              <ThemedText variant="caption" color={theme.colors.textMuted} style={{ fontStyle: 'italic' }}>
                No recent laboratory orders.
              </ThemedText>
            )}
          </View>
        </View>
      </View>

      {/* ========================================================================= */}
      {/* ORGAN SYSTEMS EXAMINATION (PHILHEALTH PHYSICAL EXAM)                       */}
      {/* ========================================================================= */}
      <View style={styles.organExamSectionCard}>
        <View style={styles.quadrantHeader}>
          <View style={styles.headerTitleGroup}>
            <Icon name="activity" size={theme.sizes.iconSm} color={theme.colors.primaryDark} />
            <ThemedText variant="h3" color={theme.colors.text}>
              Organ Systems Examination
            </ThemedText>
            <Badge
              label={
                abnormalOrganCount > 0
                  ? `${abnormalOrganCount} Abnormal Finding${abnormalOrganCount > 1 ? 's' : ''}`
                  : 'All Essentially Normal'
              }
              variant={abnormalOrganCount > 0 ? 'warning' : 'routine'}
              size="sm"
            />
          </View>
          <Pressable
            onPress={() => onNavigateTab('profiles')}
            accessibilityRole="button"
            accessibilityLabel="Review and edit organ systems examination in health profiles"
            style={styles.actionLink}
          >
            <ThemedText variant="captionBold" color={theme.colors.primaryDark}>
              Review &amp; Edit
            </ThemedText>
            <Icon name="arrowRight" size={12} color={theme.colors.primaryDark} />
          </Pressable>
        </View>

        <ThemedText variant="caption" color={theme.colors.textSecondary} style={{ marginBottom: theme.spacing.sm }}>
          PhilHealth statutory physical examination findings across 8 organ systems. Scroll horizontally to inspect each system.
        </ThemedText>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.organScroll}
          contentContainerStyle={styles.organScrollContent}
        >
          {ORGAN_SYSTEMS.map((sys) => {
            const code =
              (organProfile?.[sys.key as keyof PhilHealthPatientProfile] as string) ||
              sys.defaultNormalCode;
            const remarks = organProfile?.[sys.remarksKey as keyof PhilHealthPatientProfile] as
              | string
              | undefined;
            return (
              <OrganSystemSummaryCard
                key={sys.key}
                system={sys}
                code={code}
                remarks={remarks}
                onPress={() => onNavigateTab('profiles')}
              />
            );
          })}
        </ScrollView>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: theme.spacing.lg,
  },
  statsBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  statBox: {
    flex: 1,
    minWidth: 120,
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    padding: theme.spacing.sm,
    gap: 2,
  },
  statBox_emergency: {
    backgroundColor: theme.colors.emergencyBg,
    borderColor: theme.colors.emergencyBorder,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
  },
  quadrantCard: {
    flex: 1,
    minWidth: 320,
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    padding: theme.spacing.md,
    shadowColor: theme.colors.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  quadrantCard_emergency: {
    borderColor: theme.colors.emergencyBorder,
  },
  quadrantHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.sm,
    paddingBottom: theme.spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  headerTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.primarySubtle,
  },
  actionLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  anaphylaxisWarningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    backgroundColor: theme.colors.emergencyBg,
    borderColor: theme.colors.emergencyBorder,
    borderWidth: 1,
    borderRadius: theme.radii.sm,
    padding: theme.spacing.xs,
    marginBottom: theme.spacing.sm,
  },
  panicWarningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    backgroundColor: theme.colors.emergencyBg,
    borderColor: theme.colors.emergencyBorder,
    borderWidth: 1,
    borderRadius: theme.radii.sm,
    padding: theme.spacing.xs,
    marginBottom: theme.spacing.sm,
  },
  quadrantBody: {
    gap: theme.spacing.xs,
  },
  problemItem: {
    padding: theme.spacing.xs,
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: theme.radii.sm,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  problemItemTop: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
  },
  allergyItem: {
    padding: theme.spacing.xs,
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: theme.radii.sm,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  allergyItem_emergency: {
    backgroundColor: theme.colors.emergencyBg,
    borderColor: theme.colors.emergencyBorder,
  },
  allergyItemTop: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
  },
  medItem: {
    padding: theme.spacing.xs,
    backgroundColor: theme.colors.routineBg,
    borderRadius: theme.radii.sm,
    borderWidth: 1,
    borderColor: theme.colors.routineBorder,
  },
  medItemTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 4,
  },
  vitalsMiniGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginBottom: theme.spacing.xs,
  },
  vitalMiniItem: {
    flex: 1,
    minWidth: 70,
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: theme.radii.sm,
    padding: 6,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  labMiniItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
    paddingHorizontal: 6,
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: theme.radii.sm,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    marginTop: 2,
  },
  organExamSectionCard: {
    marginTop: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    padding: theme.spacing.md,
    shadowColor: theme.colors.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  organScroll: {
    marginHorizontal: -theme.spacing.xs,
  },
  organScrollContent: {
    paddingHorizontal: theme.spacing.xs,
    gap: theme.spacing.sm,
  },
  organSummaryCard: {
    minWidth: 175,
    maxWidth: 220,
    padding: theme.spacing.sm,
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: theme.radii.sm,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    gap: 2,
  },
  organSummaryCard_abnormal: {
    backgroundColor: theme.colors.warningBg,
    borderColor: theme.colors.warningBorder,
  },
  organSummaryCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.xs,
    marginBottom: 2,
  },
});

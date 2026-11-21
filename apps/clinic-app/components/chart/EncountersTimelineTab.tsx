import React, { useState, useMemo, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Pressable, TextInput } from 'react-native';
import { theme } from '../../constants/theme';
import { ThemedText, Badge, Icon, EmptyState, ErrorState, SkeletonList, Button, type BadgeVariant } from '../ui';
import { useClinic } from '../../context/ClinicContext';
import ClinicRecordingPlayerModal from '../teleconsult/ClinicRecordingPlayerModal';
import {
  clinicService,
  type ClinicPatient,
  type ConsultationRecord,
  type HealthScreeningRecord,
  type HealthScreeningType,
  type HealthScreeningDisposition,
  type TriageVitals,
  type NcdRiskAssessment,
  formatClinicDate,
  formatClinicTime,
  formatClinicDateTime,
} from '../../services/clinicService';

export interface EncountersTimelineTabProps {
  patient?: ClinicPatient | null;
  patientId?: string;
  consultations: ConsultationRecord[];
  healthScreenings?: HealthScreeningRecord[];
  vitalsHistory?: TriageVitals[];
  latestNcdAssessment?: NcdRiskAssessment | null;
  onViewPrescriptionSlip?: (consultation: ConsultationRecord) => void;
  onOpenExternalDispense?: (consultation: ConsultationRecord) => void;
  onRefreshChart?: () => void;
}

type TimelineEntry =
  | { kind: 'consultation'; id: string; sortTs: number; data: ConsultationRecord }
  | { kind: 'screening'; id: string; sortTs: number; data: HealthScreeningRecord };

function getScreeningTypeBadgeLabel(type: HealthScreeningType): string {
  switch (type) {
    case 'AnnualPhysicalExam':
      return 'APE';
    case 'PreEmployment':
      return 'Pre-Employment';
    case 'SchoolPhysical':
      return 'School Physical';
    case 'YakapFpe':
      return 'PhilHealth Checkup';
    case 'RoutineWellness':
      return 'Wellness';
    case 'CommunityScreening':
      return 'Community Screening';
    default:
      return 'Health Screening';
  }
}

function getScreeningDispositionBadge(
  status: HealthScreeningRecord['status'],
  disposition?: HealthScreeningDisposition | null
): { label: string; variant: BadgeVariant } {
  if (status === 'AwaitingDoctor') {
    return { label: 'Awaiting Doctor PE', variant: 'warning' };
  }
  if (status === 'EscalatedToConsultation' || disposition === 'EscalatedToConsultation') {
    return { label: 'Escalated to MD', variant: 'urgent' };
  }
  switch (disposition) {
    case 'Cleared':
      return { label: 'Cleared', variant: 'success' };
    case 'ClearedWithAdvice':
      return { label: 'Cleared w/ Advice', variant: 'info' };
    case 'ForWorkup':
      return { label: 'For Workup', variant: 'warning' };
    default:
      return { label: status === 'Completed' ? 'Completed' : 'In Progress', variant: status === 'Completed' ? 'success' : 'neutral' };
  }
}

function formatDuration(totalSeconds?: number): string {
  if (!totalSeconds || totalSeconds < 0) return '00:00';
  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.floor(totalSeconds % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export default function EncountersTimelineTab({
  patient,
  patientId,
  consultations = [],
  healthScreenings,
  vitalsHistory = [],
  latestNcdAssessment = null,
  onViewPrescriptionSlip,
  onOpenExternalDispense,
  onRefreshChart,
}: EncountersTimelineTabProps) {
  const { dateFormat, timeFormat, timeZoneId } = useClinic();
  const [selectedDoctorFilter, setSelectedDoctorFilter] = useState<string>('ALL');
  const [encounterTypeFilter, setEncounterTypeFilter] = useState<'ALL' | 'YAKAP' | 'STANDARD'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [fetchedScreenings, setFetchedScreenings] = useState<HealthScreeningRecord[] | null>(null);
  const [loadingScreenings, setLoadingScreenings] = useState<boolean>(false);
  const [screeningsError, setScreeningsError] = useState<string | null>(null);

  const effectivePatientId = patientId || patient?.id;

  const loadFallbackScreenings = useMemo(
    () => async (targetPatientId: string) => {
      setLoadingScreenings(true);
      setScreeningsError(null);
      try {
        const [rows, err] = await clinicService.getPatientHealthScreenings(targetPatientId);
        if (err) {
          setScreeningsError(err.message || 'Unable to load health screenings.');
        } else {
          setFetchedScreenings(rows ?? []);
        }
      } catch (e: any) {
        setScreeningsError(e?.message || 'Unable to load health screenings.');
      } finally {
        setLoadingScreenings(false);
      }
    },
    []
  );

  useEffect(() => {
    if (healthScreenings !== undefined || !effectivePatientId) {
      setFetchedScreenings(null);
      setScreeningsError(null);
      setLoadingScreenings(false);
      return;
    }
    let active = true;
    setLoadingScreenings(true);
    setScreeningsError(null);
    clinicService
      .getPatientHealthScreenings(effectivePatientId)
      .then(([rows, err]) => {
        if (!active) return;
        if (err) {
          setScreeningsError(err.message || 'Unable to load health screenings.');
        } else {
          setFetchedScreenings(rows ?? []);
        }
      })
      .catch((e: any) => {
        if (!active) return;
        setScreeningsError(e?.message || 'Unable to load health screenings.');
      })
      .finally(() => {
        if (active) setLoadingScreenings(false);
      });
    return () => {
      active = false;
    };
  }, [healthScreenings, effectivePatientId]);

  const signedConsultations = useMemo(
    () => consultations.filter((c) => c.isSigned !== false),
    [consultations],
  );

  const activeScreenings = useMemo(
    () => (healthScreenings ?? fetchedScreenings ?? []).filter((hs) => hs.status !== 'Cancelled'),
    [healthScreenings, fetchedScreenings],
  );

  const [expandedEncounterIds, setExpandedEncounterIds] = useState<Record<string, boolean>>({
    // Auto-expand the latest signed encounter by default
    ...(signedConsultations.length > 0 ? { [signedConsultations[0].id]: true } : {}),
  });
  const [selectedRecordingSession, setSelectedRecordingSession] = useState<{
    sessionId: string;
    consultationId?: string;
  } | null>(null);

  // Extract unique doctors across consultations and screenings
  const doctorsList = useMemo(() => {
    const map = new Map<string, string>();
    signedConsultations.forEach((c) => {
      if (c.doctorId && c.doctorName) {
        map.set(c.doctorId, c.doctorName);
      }
    });
    activeScreenings.forEach((hs) => {
      if (hs.examinedByDoctorId && hs.examinedByDoctorName) {
        map.set(hs.examinedByDoctorId, hs.examinedByDoctorName);
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [signedConsultations, activeScreenings]);

  // Build chronologically sorted and filtered timeline entries
  const filteredEntries = useMemo<TimelineEntry[]>(() => {
    const entries: TimelineEntry[] = [];
    const q = searchQuery.trim().toLowerCase();

    for (const c of signedConsultations) {
      if (selectedDoctorFilter !== 'ALL' && c.doctorId !== selectedDoctorFilter) continue;
      if (encounterTypeFilter === 'YAKAP' && !c.isYakapEligible) continue;
      if (encounterTypeFilter === 'STANDARD' && c.isYakapEligible) continue;
      if (q) {
        const matchesDiag = (c.diagnoses || []).some(
          (d) => d.icd10Code?.toLowerCase().includes(q) || d.description?.toLowerCase().includes(q)
        );
        const matchesDoctor = c.doctorName?.toLowerCase().includes(q);
        const matchesNotes =
          c.subjective?.toLowerCase().includes(q) ||
          c.objective?.toLowerCase().includes(q) ||
          c.assessment?.toLowerCase().includes(q) ||
          c.plan?.toLowerCase().includes(q);
        const matchesCase =
          c.hciCaseNo?.toLowerCase().includes(q) ||
          c.hciTransNo?.toLowerCase().includes(q) ||
          c.soapTransNo?.toLowerCase().includes(q);
        if (!matchesDiag && !matchesDoctor && !matchesNotes && !matchesCase) continue;
      }
      entries.push({
        kind: 'consultation',
        id: c.id,
        sortTs: new Date(c.encounterDate).getTime() || 0,
        data: c,
      });
    }

    for (const hs of activeScreenings) {
      const isYakapScreening = hs.workflowMode === 'YakapAvailment' || hs.screeningType === 'YakapFpe';
      if (selectedDoctorFilter !== 'ALL' && hs.examinedByDoctorId !== selectedDoctorFilter) continue;
      if (encounterTypeFilter === 'YAKAP' && !isYakapScreening) continue;
      if (encounterTypeFilter === 'STANDARD' && isYakapScreening) continue;
      if (q) {
        const typeLabel = getScreeningTypeBadgeLabel(hs.screeningType).toLowerCase();
        const dispLabel = getScreeningDispositionBadge(hs.status, hs.disposition).label.toLowerCase();
        const matchesScreening =
          typeLabel.includes(q) ||
          dispLabel.includes(q) ||
          hs.clinicalImpression?.toLowerCase().includes(q) ||
          hs.preventiveCounselingNotes?.toLowerCase().includes(q) ||
          hs.nurseScreeningNotes?.toLowerCase().includes(q) ||
          hs.screenedByNurseName?.toLowerCase().includes(q) ||
          hs.examinedByDoctorName?.toLowerCase().includes(q) ||
          hs.profilingTransNo?.toLowerCase().includes(q) ||
          hs.philHealthAtc?.toLowerCase().includes(q) ||
          hs.queueNumber?.toLowerCase().includes(q);
        if (!matchesScreening) continue;
      }
      entries.push({
        kind: 'screening',
        id: `hs-${hs.id}`,
        sortTs: new Date(hs.completedAtUtc || hs.screeningDateUtc).getTime() || 0,
        data: hs,
      });
    }

    entries.sort((a, b) => b.sortTs - a.sortTs);
    return entries;
  }, [signedConsultations, activeScreenings, selectedDoctorFilter, encounterTypeFilter, searchQuery]);

  const totalEpisodesCount = signedConsultations.length + activeScreenings.length;

  const toggleExpand = (id: string) => {
    setExpandedEncounterIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* ========================================================================= */}
      {/* FILTER & SEARCH CONTROLS                                                  */}
      {/* ========================================================================= */}
      <View style={styles.controlsBar}>
        {/* Search Input */}
        <View style={styles.searchRow}>
          <Icon name="search" size={theme.sizes.iconSm} color={theme.colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search encounters by diagnosis, notes, doctor, case #..."
            placeholderTextColor={theme.colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery ? (
            <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
              <Icon name="close" size={theme.sizes.iconSm} color={theme.colors.textSecondary} />
            </Pressable>
          ) : null}
        </View>

        {/* Doctor Filters */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterPillsRow}>
          <Pressable
            onPress={() => setSelectedDoctorFilter('ALL')}
            style={[styles.filterPill, selectedDoctorFilter === 'ALL' && styles.filterPill_active]}
          >
            <ThemedText
              variant="captionBold"
              color={selectedDoctorFilter === 'ALL' ? theme.colors.onPrimary : theme.colors.textSecondary}
            >
              All Doctors ({totalEpisodesCount})
            </ThemedText>
          </Pressable>
          {doctorsList.map((doc) => (
            <Pressable
              key={doc.id}
              onPress={() => setSelectedDoctorFilter(doc.id)}
              style={[styles.filterPill, selectedDoctorFilter === doc.id && styles.filterPill_active]}
            >
              <ThemedText
                variant="captionBold"
                color={selectedDoctorFilter === doc.id ? theme.colors.onPrimary : theme.colors.textSecondary}
              >
                {doc.name}
              </ThemedText>
            </Pressable>
          ))}
        </ScrollView>

        {/* Encounter Type Toggle */}
        <View style={styles.typeToggleRow}>
          <Pressable
            onPress={() => setEncounterTypeFilter('ALL')}
            style={[styles.typeToggleBtn, encounterTypeFilter === 'ALL' && styles.typeToggleBtn_active]}
          >
            <ThemedText
              variant="caption"
              color={encounterTypeFilter === 'ALL' ? theme.colors.primaryDark : theme.colors.textSecondary}
              style={{ fontWeight: encounterTypeFilter === 'ALL' ? '700' : '500' }}
            >
              All Encounters
            </ThemedText>
          </Pressable>
          <Pressable
            onPress={() => setEncounterTypeFilter('YAKAP')}
            style={[styles.typeToggleBtn, encounterTypeFilter === 'YAKAP' && styles.typeToggleBtn_active]}
          >
            <ThemedText
              variant="caption"
              color={encounterTypeFilter === 'YAKAP' ? theme.colors.primaryDark : theme.colors.textSecondary}
              style={{ fontWeight: encounterTypeFilter === 'YAKAP' ? '700' : '500' }}
            >
              YAKAP
            </ThemedText>
          </Pressable>
          <Pressable
            onPress={() => setEncounterTypeFilter('STANDARD')}
            style={[styles.typeToggleBtn, encounterTypeFilter === 'STANDARD' && styles.typeToggleBtn_active]}
          >
            <ThemedText
              variant="caption"
              color={encounterTypeFilter === 'STANDARD' ? theme.colors.primaryDark : theme.colors.textSecondary}
              style={{ fontWeight: encounterTypeFilter === 'STANDARD' ? '700' : '500' }}
            >
              Standard
            </ThemedText>
          </Pressable>
        </View>
      </View>

      {/* ========================================================================= */}
      {/* TIMELINE ENCOUNTER & HEALTH SCREENING CARDS                               */}
      {/* ========================================================================= */}
      {screeningsError && effectivePatientId ? (
        <ErrorState
          compact
          title="Unable to load health screenings"
          message={screeningsError}
          onRetry={() => void loadFallbackScreenings(effectivePatientId)}
        />
      ) : null}
      {loadingScreenings && filteredEntries.length === 0 ? (
        <SkeletonList rows={3} />
      ) : filteredEntries.length > 0 ? (
        <View style={styles.timelineList}>
          {filteredEntries.map((entry, idx) => {
            if (entry.kind === 'consultation') {
              const enc = entry.data;
              const isExpanded = Boolean(expandedEncounterIds[enc.id]);
              const orderedDiagnoses = [...(enc.diagnoses || [])]
                .filter((d) => Boolean(d.description?.trim()))
                .sort((a, b) => Number(Boolean(b.isPrimary)) - Number(Boolean(a.isPrimary)));

              return (
                <View key={enc.id} style={styles.timelineItem}>
                  {/* Node Rail */}
                  <View style={styles.railColumn}>
                    <View style={[styles.nodeCircle, enc.isYakapEligible && styles.nodeCircle_yakap]}>
                      <Icon
                        name={enc.isYakapEligible ? 'yakap' : 'consultations'}
                        size={12}
                        color={enc.isYakapEligible ? theme.colors.primaryDark : theme.colors.textSecondary}
                      />
                    </View>
                    {idx < filteredEntries.length - 1 ? <View style={styles.railLine} /> : null}
                  </View>

                  {/* Encounter Card */}
                  <View style={styles.encounterCard}>
                    <Pressable onPress={() => toggleExpand(enc.id)} style={styles.cardHeader}>
                      <View style={styles.cardHeaderLeft}>
                        <View style={styles.dateAndDoctorRow}>
                          <ThemedText variant="captionBold" color={theme.colors.text}>
                            {formatClinicDate(enc.encounterDate, { dateFormat, timeZoneId })} •{' '}
                            {formatClinicTime(enc.encounterDate, { timeFormat, timeZoneId })}
                          </ThemedText>
                          <ThemedText variant="caption" color={theme.colors.textSecondary}>
                            {enc.doctorName}
                          </ThemedText>
                          {enc.doctorPrcLicense ? (
                            <Badge label={`PRC: ${enc.doctorPrcLicense}`} variant="neutral" size="sm" />
                          ) : null}
                        </View>

                        {orderedDiagnoses.length > 0 ? (
                          <View style={styles.diagRow}>
                            {orderedDiagnoses.map((diag, diagIdx) => {
                              const isPrimaryPill = Boolean(diag.isPrimary) || diagIdx === 0;
                              return (
                                <View
                                  key={diag.id || `${enc.id}-hdr-diag-${diagIdx}`}
                                  style={[
                                    styles.headerDiagPill,
                                    !isPrimaryPill && styles.headerDiagPill_secondary,
                                  ]}
                                >
                                  <ThemedText
                                    variant="captionBold"
                                    color={isPrimaryPill ? theme.colors.primaryDark : theme.colors.infoText}
                                    numberOfLines={1}
                                  >
                                    {diag.description}
                                  </ThemedText>
                                </View>
                              );
                            })}
                          </View>
                        ) : null}
                      </View>

                      <View style={styles.cardHeaderRight}>
                        {(enc as any).recordingStatus || (enc as any).isLegalHold || (enc as any).hasRecording ? (
                          <Badge
                            label={
                              (enc as any).recordingStatus === 'LegalHold' || (enc as any).isLegalHold
                                ? 'Medico-Legal Hold'
                                : (enc as any).recordingStatus === 'Purged'
                                  ? 'Purged'
                                  : `Recorded • ${formatDuration((enc as any).recordingDurationSeconds ?? 930)}`
                            }
                            variant={
                              (enc as any).recordingStatus === 'LegalHold' || (enc as any).isLegalHold
                                ? 'emergency'
                                : (enc as any).recordingStatus === 'Purged'
                                  ? 'neutral'
                                  : 'purple'
                            }
                            size="sm"
                            icon="consultations"
                          />
                        ) : null}
                        {enc.rosCategoryLabel || enc.rosCategory ? (
                          <Badge
                            label={`ROS: ${enc.rosCategoryLabel || enc.rosCategory}`}
                            variant="info"
                            size="sm"
                          />
                        ) : null}
                        {enc.isYakapEligible ? (
                          <Badge label="YAKAP" variant="purple" size="sm" />
                        ) : (
                          <Badge label="Standard" variant="neutral" size="sm" />
                        )}
                        {enc.isSigned ? (
                          <Badge label="Signed" variant="success" size="sm" icon="checkCircle" />
                        ) : (
                          <Badge label="Draft" variant="warning" size="sm" />
                        )}
                        <Icon
                          name={isExpanded ? 'chevronUp' : 'chevronDown'}
                          size={theme.sizes.iconSm}
                          color={theme.colors.textSecondary}
                        />
                      </View>
                    </Pressable>

                    {/* PhilHealth Statutory Identification Badges */}
                    {enc.isYakapEligible && (enc.hciCaseNo || enc.hciTransNo || enc.soapTransNo) ? (
                      <View style={styles.statutoryStrip}>
                        {enc.hciCaseNo ? (
                          <ThemedText variant="caption" color={theme.colors.purpleText}>
                            Case: <ThemedText variant="captionBold" color={theme.colors.purpleText}>{enc.hciCaseNo}</ThemedText>
                          </ThemedText>
                        ) : null}
                        {enc.hciTransNo ? (
                          <ThemedText variant="caption" color={theme.colors.purpleText}>
                            Trans: <ThemedText variant="captionBold" color={theme.colors.purpleText}>{enc.hciTransNo}</ThemedText>
                          </ThemedText>
                        ) : null}
                        {enc.soapTransNo ? (
                          <ThemedText variant="caption" color={theme.colors.purpleText}>
                            SOAP Trans: <ThemedText variant="captionBold" color={theme.colors.purpleText}>{enc.soapTransNo}</ThemedText>
                          </ThemedText>
                        ) : null}
                      </View>
                    ) : null}

                    {/* Expanded SOAP Notes */}
                    {isExpanded ? (
                      <View style={styles.cardBody}>
                        {/* S: Subjective */}
                        <View style={styles.soapSection}>
                          <ThemedText variant="captionBold" color={theme.colors.primaryDark}>
                            SUBJECTIVE (S)
                          </ThemedText>
                          <ThemedText variant="body" color={theme.colors.text}>
                            {enc.subjective || 'No subjective narrative documented.'}
                          </ThemedText>
                          {enc.philHealthPainSite ? (
                            <ThemedText variant="caption" color={theme.colors.textSecondary}>
                              Pain Site: {enc.philHealthPainSite}
                            </ThemedText>
                          ) : null}
                        </View>

                        {/* O: Objective */}
                        <View style={styles.soapSection}>
                          <ThemedText variant="captionBold" color={theme.colors.primaryDark}>
                            OBJECTIVE (O)
                          </ThemedText>
                          <ThemedText variant="body" color={theme.colors.text}>
                            {enc.objective || 'No objective findings documented.'}
                          </ThemedText>
                        </View>

                        {/* A: Assessment */}
                        <View style={styles.soapSection}>
                          <ThemedText variant="captionBold" color={theme.colors.primaryDark}>
                            ASSESSMENT (A)
                          </ThemedText>
                          <ThemedText variant="body" color={theme.colors.text}>
                            {enc.assessment || 'No narrative assessment documented.'}
                          </ThemedText>
                          {orderedDiagnoses.length > 0 ? (
                            <View style={styles.diagPillsRow}>
                              {orderedDiagnoses.map((d, diagIdx) => {
                                const isPrimaryPill = Boolean(d.isPrimary) || diagIdx === 0;
                                return (
                                  <View
                                    key={d.id || `${enc.id}-soap-diag-${diagIdx}`}
                                    style={[styles.diagPill, isPrimaryPill && styles.diagPill_primary]}
                                  >
                                    <ThemedText
                                      variant="captionBold"
                                      color={isPrimaryPill ? theme.colors.primaryDark : theme.colors.infoText}
                                    >
                                      {d.description}
                                    </ThemedText>
                                  </View>
                                );
                              })}
                            </View>
                          ) : null}
                        </View>

                        {/* P: Plan */}
                        <View style={styles.soapSection}>
                          <ThemedText variant="captionBold" color={theme.colors.primaryDark}>
                            PLAN (P)
                          </ThemedText>
                          <ThemedText variant="body" color={theme.colors.text}>
                            {enc.plan || 'No management plan documented.'}
                          </ThemedText>
                        </View>

                        {/* Prescriptions & Actions */}
                        {(enc.prescriptions || []).length > 0 ? (
                          <View style={styles.prescriptionsBlock}>
                            <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
                              Prescribed Medications ({enc.prescriptions.length})
                            </ThemedText>
                            {enc.prescriptions.map((rx) => (
                              <View key={rx.id || rx.genericName} style={styles.rxRow}>
                                <Icon name="pill" size={14} color={theme.colors.routineText} />
                                <View style={{ flex: 1 }}>
                                  <ThemedText variant="captionBold" color={theme.colors.text}>
                                    {rx.genericName} {rx.dosage || ''} ({rx.form || ''})
                                  </ThemedText>
                                  <ThemedText variant="caption" color={theme.colors.textSecondary}>
                                    Qty: {rx.quantity} • Sig: {rx.sig}
                                  </ThemedText>
                                </View>
                                {enc.isSigned && rx.isClinicDispensed && rx.clinicDispensedQuantity ? (() => {
                                  const dispensedQty = Math.min(rx.quantity, Math.max(0, rx.clinicDispensedQuantity));
                                  const remainingQty = Math.max(0, rx.quantity - dispensedQty);
                                  return (
                                    <Badge
                                      label={
                                        remainingQty > 0
                                          ? `Clinic stock: ${dispensedQty}/${rx.quantity} (${remainingQty} ext.)`
                                          : `Clinic stock: all ${rx.quantity} pcs`
                                      }
                                      variant="routine"
                                      size="xs"
                                    />
                                  );
                                })() : null}
                              </View>
                            ))}
                          </View>
                        ) : null}

                        {/* Dental Findings & Procedures Summary Section */}
                        {Boolean(
                          ((enc as any).dentalFindings && (enc as any).dentalFindings.length > 0) ||
                          ((enc as any).procedures && (enc as any).procedures.some((p: any) => p.toothNumber != null))
                        ) && (
                          <View style={styles.dentalSummaryBlock} testID={`encounter-dental-summary-${enc.id}`}>
                            <View style={styles.dentalSummaryHeader}>
                              <Icon name="medical" size={14} color={theme.colors.primaryDark} />
                              <ThemedText variant="captionBold" color={theme.colors.primaryDark}>
                                DENTAL FINDINGS & PROCEDURES
                              </ThemedText>
                            </View>
                            <View style={styles.dentalSummaryContent}>
                              {(enc as any).dentalFindings?.map((tooth: any, tIdx: number) => {
                                const toothLabel = `Tooth #${tooth.toothNumber}${tooth.surface ? ` (${tooth.surface})` : ''} - ${tooth.status}`;
                                return (
                                  <View key={`dental-finding-${enc.id}-${tIdx}`} style={styles.dentalFindingRow}>
                                    <Badge
                                      label={toothLabel}
                                      variant={tooth.status === 'Healthy' ? 'success' : 'warning'}
                                      size="sm"
                                    />
                                    {tooth.notes ? (
                                      <ThemedText variant="caption" color={theme.colors.textSecondary} numberOfLines={1}>
                                        {tooth.notes}
                                      </ThemedText>
                                    ) : null}
                                    {tooth.recordedBy ? (
                                      <ThemedText variant="caption" color={theme.colors.textMuted}>
                                        • Dr. {String(tooth.recordedBy).replace(/^Dr\.\s*/, '')}
                                      </ThemedText>
                                    ) : null}
                                  </View>
                                );
                              })}
                              {(enc as any).procedures
                                ?.filter((p: any) => p.toothNumber != null)
                                .map((proc: any, pIdx: number) => (
                                  <View key={`dental-proc-${enc.id}-${pIdx}`} style={styles.dentalProcRow}>
                                    <Badge
                                      label={`Tooth #${proc.toothNumber}${proc.toothSurface ? ` (${proc.toothSurface})` : ''}`}
                                      variant="purple"
                                      size="sm"
                                    />
                                    <ThemedText variant="captionBold" color={theme.colors.text}>
                                      {proc.procedureName || proc.name}
                                    </ThemedText>
                                    {proc.status ? <Badge label={proc.status} variant="neutral" size="sm" /> : null}
                                  </View>
                                ))}
                            </View>
                          </View>
                        )}

                        {/* Action Bar */}
                        <View style={styles.actionBar}>
                          {enc.isSigned ? (
                            <>
                              {onViewPrescriptionSlip ? (
                                <Button
                                  variant="outline"
                                  size="xs"
                                  icon="file"
                                  title="View E-Rx Slip"
                                  onPress={() => onViewPrescriptionSlip(enc)}
                                />
                              ) : null}
                              {onOpenExternalDispense ? (
                                <Button
                                  variant="outline"
                                  size="xs"
                                  icon="check"
                                  title="Log External Dispense"
                                  onPress={() => onOpenExternalDispense(enc)}
                                />
                              ) : null}
                            </>
                          ) : (enc.prescriptions || []).length > 0 ? (
                            <Badge
                              label="Draft — Sign encounter to validate Rx"
                              variant="warning"
                              size="sm"
                            />
                          ) : null}
                        </View>

                        {/* Doctor Credential Snapshot Footer */}
                        <View style={styles.signingFooter}>
                          <ThemedText variant="caption" color={theme.colors.textMuted}>
                            Attending Physician: {enc.doctorName}
                            {enc.doctorPhilHealthPan ? ` • PAN: ${enc.doctorPhilHealthPan}` : ''}
                            {enc.doctorPtr ? ` • PTR: ${enc.doctorPtr}` : ''}
                            {enc.doctorS2License ? ` • S2: ${enc.doctorS2License}` : ''}
                          </ThemedText>
                          {enc.signedAt ? (
                            <ThemedText variant="caption" color={theme.colors.textMuted}>
                              Signed at: {formatClinicDateTime(enc.signedAt, { dateFormat, timeFormat, timeZoneId })}
                            </ThemedText>
                          ) : null}
                        </View>

                        {/* Teleconsultation Recording Action */}
                        {((enc as any).recordingSessionId || (enc as any).recordingStatus || (enc as any).hasRecording || (enc as any).isTeleconsult) ? (
                          <View style={styles.recordingActionRow}>
                            <Button
                              variant="secondary"
                              size="sm"
                              icon="consultations"
                              title="Play Recording"
                              onPress={() => setSelectedRecordingSession({
                                sessionId: (enc as any).recordingSessionId || enc.id,
                                consultationId: enc.id,
                              })}
                              style={styles.touchableMinSize}
                            />
                          </View>
                        ) : null}
                      </View>
                    ) : null}
                  </View>
                </View>
              );
            }

            const hs = entry.data;
            const isExpanded = Boolean(expandedEncounterIds[entry.id]);
            const isYakapScreening = hs.workflowMode === 'YakapAvailment' || hs.screeningType === 'YakapFpe';
            const typeLabel = getScreeningTypeBadgeLabel(hs.screeningType);
            const dispBadge = getScreeningDispositionBadge(hs.status, hs.disposition);
            const matchedVitals =
              (hs.patientVitalsId ? vitalsHistory.find((v) => v.id === hs.patientVitalsId) : undefined) ??
              (hs.queueItemId ? vitalsHistory.find((v) => v.queueItemId === hs.queueItemId) : undefined);
            const vitalsSummaryParts: string[] = [];
            if (matchedVitals?.systolicBp != null && matchedVitals?.diastolicBp != null) {
              vitalsSummaryParts.push(`BP ${matchedVitals.systolicBp}/${matchedVitals.diastolicBp}`);
            }
            if (matchedVitals?.heartRateBpm != null) vitalsSummaryParts.push(`HR ${matchedVitals.heartRateBpm}`);
            if (matchedVitals?.temperatureCelsius != null) vitalsSummaryParts.push(`Temp ${matchedVitals.temperatureCelsius}°C`);
            if (matchedVitals?.oxygenSaturationPercent != null) vitalsSummaryParts.push(`SpO2 ${matchedVitals.oxygenSaturationPercent}%`);
            if (matchedVitals?.bmi != null) vitalsSummaryParts.push(`BMI ${matchedVitals.bmi}`);
            const matchedNcd =
              hs.ncdRiskAssessmentId && latestNcdAssessment?.id === hs.ncdRiskAssessmentId
                ? latestNcdAssessment
                : null;

            return (
              <View key={entry.id} style={styles.timelineItem} testID={`timeline-screening-card-${hs.id}`}>
                <View style={styles.railColumn}>
                  <View style={[styles.nodeCircle, isYakapScreening && styles.nodeCircle_yakap]}>
                    <Icon
                      name="heartPulse"
                      size={12}
                      color={isYakapScreening ? theme.colors.primaryDark : theme.colors.infoText}
                    />
                  </View>
                  {idx < filteredEntries.length - 1 ? <View style={styles.railLine} /> : null}
                </View>

                <View style={styles.encounterCard}>
                  <Pressable onPress={() => toggleExpand(entry.id)} style={styles.cardHeader}>
                    <View style={styles.cardHeaderLeft}>
                      <View style={styles.dateAndDoctorRow}>
                        <ThemedText variant="captionBold" color={theme.colors.text}>
                          {formatClinicDate(hs.completedAtUtc || hs.screeningDateUtc, { dateFormat, timeZoneId })} •{' '}
                          {formatClinicTime(hs.completedAtUtc || hs.screeningDateUtc, { timeFormat, timeZoneId })}
                        </ThemedText>
                        <ThemedText variant="caption" color={theme.colors.textSecondary}>
                          {hs.examinedByDoctorName || hs.screenedByNurseName || 'Screening Team'}
                        </ThemedText>
                        {hs.queueNumber ? (
                          <Badge label={hs.queueNumber} variant="neutral" size="sm" />
                        ) : null}
                      </View>
                      {vitalsSummaryParts.length > 0 || matchedNcd ? (
                        <View style={styles.diagRow}>
                          {vitalsSummaryParts.length > 0 ? (
                            <Badge label={vitalsSummaryParts.join(' · ')} variant="info" size="sm" />
                          ) : null}
                          {matchedNcd ? (
                            <Badge
                              label={`WHO/ISH Risk: ${matchedNcd.riskBand}${matchedNcd.calculatedRiskScorePercent != null ? ` (${matchedNcd.calculatedRiskScorePercent}%)` : ''}`}
                              variant="warning"
                              size="sm"
                            />
                          ) : null}
                        </View>
                      ) : null}
                    </View>

                    <View style={styles.cardHeaderRight}>
                      <Badge label={typeLabel} variant={isYakapScreening ? 'purple' : 'info'} size="sm" icon="heartPulse" />
                      <Badge label={dispBadge.label} variant={dispBadge.variant} size="sm" />
                      <Icon
                        name={isExpanded ? 'chevronUp' : 'chevronDown'}
                        size={theme.sizes.iconSm}
                        color={theme.colors.textSecondary}
                      />
                    </View>
                  </Pressable>

                  {isYakapScreening && (hs.profilingTransNo || hs.philHealthAtc || hs.isWalkedIn) ? (
                    <View style={styles.statutoryStrip}>
                      {hs.profilingTransNo ? (
                        <ThemedText variant="caption" color={theme.colors.purpleText}>
                          PhilHealth Ref No:{' '}
                          <ThemedText variant="captionBold" color={theme.colors.purpleText}>
                            {hs.profilingTransNo}
                          </ThemedText>
                        </ThemedText>
                      ) : null}
                      <ThemedText variant="caption" color={theme.colors.purpleText}>
                        Visit Code:{' '}
                        <ThemedText variant="captionBold" color={theme.colors.purpleText}>
                          {hs.philHealthAtc || (hs.isWalkedIn ? 'Walk-In' : '—')}
                        </ThemedText>
                      </ThemedText>
                    </View>
                  ) : null}

                  {isExpanded ? (
                    <View style={styles.cardBody}>
                      {hs.clinicalImpression ? (
                        <View style={styles.soapSection}>
                          <ThemedText variant="captionBold" color={theme.colors.primaryDark}>
                            CLINICAL IMPRESSION
                          </ThemedText>
                          <ThemedText variant="body" color={theme.colors.text}>
                            {hs.clinicalImpression}
                          </ThemedText>
                        </View>
                      ) : null}
                      {hs.preventiveCounselingNotes ? (
                        <View style={styles.soapSection}>
                          <ThemedText variant="captionBold" color={theme.colors.primaryDark}>
                            PREVENTIVE COUNSELING
                          </ThemedText>
                          <ThemedText variant="body" color={theme.colors.text}>
                            {hs.preventiveCounselingNotes}
                          </ThemedText>
                        </View>
                      ) : null}
                      {hs.nurseScreeningNotes ? (
                        <View style={styles.soapSection}>
                          <ThemedText variant="captionBold" color={theme.colors.primaryDark}>
                            NURSE SCREENING NOTES
                          </ThemedText>
                          <ThemedText variant="body" color={theme.colors.text}>
                            {hs.nurseScreeningNotes}
                          </ThemedText>
                        </View>
                      ) : null}
                      <View style={styles.signingFooter}>
                        <ThemedText variant="caption" color={theme.colors.textMuted}>
                          {hs.screenedByNurseName ? `Intake Nurse: ${hs.screenedByNurseName}` : 'Health Screening Episode'}
                          {hs.examinedByDoctorName ? ` • Examining Clinician: ${hs.examinedByDoctorName}` : ''}
                        </ThemedText>
                        {hs.recommendedFollowUpDate ? (
                          <ThemedText variant="caption" color={theme.colors.textMuted}>
                            Recommended Follow-up: {formatClinicDate(hs.recommendedFollowUpDate, { dateFormat, timeZoneId })}
                          </ThemedText>
                        ) : null}
                      </View>
                    </View>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>
      ) : (
        <EmptyState
          icon="consultations"
          title="No encounters found"
          description={
            searchQuery
              ? `No encounter or health screening records matched the filter "${searchQuery}".`
              : 'Zero longitudinal SOAP encounter records documented for this patient.'
          }
        />
      )}
      <ClinicRecordingPlayerModal
        visible={!!selectedRecordingSession}
        sessionId={selectedRecordingSession?.sessionId}
        onClose={() => setSelectedRecordingSession(null)}
      />
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
  controlsBar: {
    marginBottom: theme.spacing.md,
    gap: theme.spacing.xs,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    paddingHorizontal: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  searchInput: {
    flex: 1,
    height: 38,
    color: theme.colors.text,
  },
  filterPillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingVertical: 2,
  },
  filterPill: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: theme.radii.full,
    backgroundColor: theme.colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  filterPill_active: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  typeToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    marginTop: 2,
  },
  typeToggleBtn: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.surfaceSubtle,
  },
  typeToggleBtn_active: {
    backgroundColor: theme.colors.primarySubtle,
    borderWidth: 1,
    borderColor: theme.colors.primaryBorder,
  },
  timelineList: {
    gap: theme.spacing.md,
  },
  timelineItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
  },
  railColumn: {
    alignItems: 'center',
    width: 24,
    paddingTop: 6,
  },
  nodeCircle: {
    width: 22,
    height: 22,
    borderRadius: theme.radii.full,
    backgroundColor: theme.colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nodeCircle_yakap: {
    backgroundColor: theme.colors.primarySubtle,
    borderColor: theme.colors.primaryBorder,
  },
  railLine: {
    width: 2,
    flex: 1,
    backgroundColor: theme.colors.borderLight,
    marginTop: 4,
    minHeight: 40,
  },
  encounterCard: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    overflow: 'hidden',
    shadowColor: theme.colors.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.spacing.sm,
    backgroundColor: theme.colors.surfaceSubtle,
  },
  cardHeaderLeft: {
    flex: 1,
    gap: 4,
  },
  cardHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  dateAndDoctorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  diagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  headerDiagPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.primarySubtle,
    borderWidth: 1,
    borderColor: theme.colors.primaryBorder,
  },
  headerDiagPill_secondary: {
    backgroundColor: theme.colors.infoBg,
    borderColor: theme.colors.infoBorder,
  },
  statutoryStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    backgroundColor: theme.colors.purpleBg,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.purpleBorder,
  },
  cardBody: {
    padding: theme.spacing.md,
    gap: theme.spacing.md,
  },
  soapSection: {
    gap: 4,
  },
  diagPillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  diagPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: theme.colors.infoBg,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: theme.radii.sm,
    borderWidth: 1,
    borderColor: theme.colors.infoBorder,
  },
  diagPill_primary: {
    backgroundColor: theme.colors.primarySubtle,
    borderColor: theme.colors.primaryBorder,
  },
  prescriptionsBlock: {
    padding: theme.spacing.sm,
    backgroundColor: theme.colors.routineBg,
    borderColor: theme.colors.routineBorder,
    borderWidth: 1,
    borderRadius: theme.radii.sm,
    gap: 6,
  },
  rxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingTop: theme.spacing.xs,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderLight,
  },
  signingFooter: {
    paddingTop: theme.spacing.xs,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderLight,
    gap: 2,
  },
  dentalSummaryBlock: {
    backgroundColor: theme.colors.surfaceSubtle,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.sm,
    padding: theme.spacing.sm,
    gap: theme.spacing.xs,
    marginTop: theme.spacing.xs,
  },
  dentalSummaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  dentalSummaryContent: {
    gap: theme.spacing.xs,
  },
  dentalFindingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    flexWrap: 'wrap',
  },
  dentalProcRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    flexWrap: 'wrap',
  },
  recordingActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: theme.spacing.sm,
    borderTopWidth: theme.sizes.borderWidth,
    borderTopColor: theme.colors.borderLight,
  },
  touchableMinSize: {
    minHeight: theme.sizes.touchTarget,
    minWidth: theme.sizes.touchTarget,
  },
});

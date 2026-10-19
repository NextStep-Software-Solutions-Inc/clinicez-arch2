import React, { useState, useMemo } from 'react';
import { View, StyleSheet, ScrollView, Pressable, TextInput } from 'react-native';
import { theme } from '../../constants/theme';
import { ThemedText, Badge, Icon, EmptyState } from '../ui';
import type {
  ClinicPatient,
  ConsultationRecord,
} from '../../services/clinicService';

export interface EncountersTimelineTabProps {
  patient?: ClinicPatient | null;
  patientId?: string;
  consultations: ConsultationRecord[];
  onViewPrescriptionSlip?: (consultation: ConsultationRecord) => void;
  onOpenExternalDispense?: (consultation: ConsultationRecord) => void;
  onRefreshChart?: () => void;
}

export default function EncountersTimelineTab({
  patient,
  patientId,
  consultations = [],
  onViewPrescriptionSlip,
  onOpenExternalDispense,
  onRefreshChart,
}: EncountersTimelineTabProps) {
  const [selectedDoctorFilter, setSelectedDoctorFilter] = useState<string>('ALL');
  const [encounterTypeFilter, setEncounterTypeFilter] = useState<'ALL' | 'YAKAP' | 'STANDARD'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [expandedEncounterIds, setExpandedEncounterIds] = useState<Record<string, boolean>>({
    // Auto-expand the latest encounter by default
    ...(consultations.length > 0 ? { [consultations[0].id]: true } : {}),
  });

  // Extract unique doctors
  const doctorsList = useMemo(() => {
    const map = new Map<string, string>();
    consultations.forEach((c) => {
      if (c.doctorId && c.doctorName) {
        map.set(c.doctorId, c.doctorName);
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [consultations]);

  // Filter consultations
  const filteredConsultations = useMemo(() => {
    return consultations.filter((c) => {
      // Doctor filter
      if (selectedDoctorFilter !== 'ALL' && c.doctorId !== selectedDoctorFilter) {
        return false;
      }
      // Type filter
      if (encounterTypeFilter === 'YAKAP' && !c.isYakapEligible) {
        return false;
      }
      if (encounterTypeFilter === 'STANDARD' && c.isYakapEligible) {
        return false;
      }
      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
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

        return matchesDiag || matchesDoctor || matchesNotes || matchesCase;
      }
      return true;
    });
  }, [consultations, selectedDoctorFilter, encounterTypeFilter, searchQuery]);

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
              All Doctors ({consultations.length})
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
              PhilHealth Konsulta Only
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
              Private / Cash
            </ThemedText>
          </Pressable>
        </View>
      </View>

      {/* ========================================================================= */}
      {/* TIMELINE ENCOUNTER CARDS                                                  */}
      {/* ========================================================================= */}
      {filteredConsultations.length > 0 ? (
        <View style={styles.timelineList}>
          {filteredConsultations.map((enc, idx) => {
            const isExpanded = Boolean(expandedEncounterIds[enc.id]);
            const primaryDiag = (enc.diagnoses || []).find((d) => d.isPrimary) || (enc.diagnoses || [])[0];

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
                  {idx < filteredConsultations.length - 1 ? <View style={styles.railLine} /> : null}
                </View>

                {/* Encounter Card */}
                <View style={styles.encounterCard}>
                  <Pressable onPress={() => toggleExpand(enc.id)} style={styles.cardHeader}>
                    <View style={styles.cardHeaderLeft}>
                      <View style={styles.dateAndDoctorRow}>
                        <ThemedText variant="captionBold" color={theme.colors.text}>
                          {new Date(enc.encounterDate).toLocaleDateString(undefined, {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })}{' '}
                          • {new Date(enc.encounterDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </ThemedText>
                        <ThemedText variant="caption" color={theme.colors.textSecondary}>
                          {enc.doctorName}
                        </ThemedText>
                        {enc.doctorPrcLicense ? (
                          <Badge label={`PRC: ${enc.doctorPrcLicense}`} variant="neutral" size="sm" />
                        ) : null}
                      </View>

                      {primaryDiag ? (
                        <View style={styles.diagRow}>
                          <Badge label={primaryDiag.icd10Code} variant="routine" size="sm" />
                          <ThemedText variant="bodyBold" color={theme.colors.text} numberOfLines={1}>
                            {primaryDiag.description}
                          </ThemedText>
                        </View>
                      ) : null}
                    </View>

                    <View style={styles.cardHeaderRight}>
                      {enc.isYakapEligible ? (
                        <Badge label="PhilHealth Konsulta" variant="purple" size="sm" icon="yakap" />
                      ) : (
                        <Badge label="Standard Encounter" variant="neutral" size="sm" />
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
                        {enc.philHealthSignSympCode ? (
                          <ThemedText variant="caption" color={theme.colors.textSecondary}>
                            PhilHealth Symptom Code: {enc.philHealthSignSympCode}
                            {enc.philHealthPainSite ? ` • Pain Site: ${enc.philHealthPainSite}` : ''}
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
                        {(enc.diagnoses || []).length > 0 ? (
                          <View style={styles.diagPillsRow}>
                            {enc.diagnoses.map((d) => (
                              <View key={d.id || d.icd10Code} style={styles.diagPill}>
                                <Badge label={d.icd10Code} variant={d.isPrimary ? 'routine' : 'neutral'} size="sm" />
                                <ThemedText variant="caption" color={theme.colors.text}>
                                  {d.description}
                                </ThemedText>
                              </View>
                            ))}
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
                            </View>
                          ))}
                        </View>
                      ) : null}

                      {/* Action Bar */}
                      <View style={styles.actionBar}>
                        {onViewPrescriptionSlip ? (
                          <Pressable
                            onPress={() => onViewPrescriptionSlip(enc)}
                            style={styles.actionBtn}
                          >
                            <Icon name="file" size={14} color={theme.colors.primaryDark} />
                            <ThemedText variant="captionBold" color={theme.colors.primaryDark}>
                              View E-Rx Slip
                            </ThemedText>
                          </Pressable>
                        ) : null}
                        {onOpenExternalDispense ? (
                          <Pressable
                            onPress={() => onOpenExternalDispense(enc)}
                            style={styles.actionBtn}
                          >
                            <Icon name="check" size={14} color={theme.colors.primaryDark} />
                            <ThemedText variant="captionBold" color={theme.colors.primaryDark}>
                              Log External Dispense
                            </ThemedText>
                          </Pressable>
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
                            Signed at: {new Date(enc.signedAt).toLocaleString()}
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
              ? `No consultation records matched the filter "${searchQuery}".`
              : 'Zero longitudinal SOAP encounter records documented for this patient.'
          }
        />
      )}
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
    gap: 6,
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
    gap: 4,
    backgroundColor: theme.colors.surfaceSubtle,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: theme.radii.xs,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
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
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.primarySubtle,
    borderWidth: 1,
    borderColor: theme.colors.primaryBorder,
  },
  signingFooter: {
    paddingTop: theme.spacing.xs,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderLight,
    gap: 2,
  },
});

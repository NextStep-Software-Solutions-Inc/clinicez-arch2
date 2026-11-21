import React, { useState, useMemo } from 'react';
import { View, StyleSheet, ScrollView, Pressable, TextInput } from 'react-native';
import { theme } from '../../constants/theme';
import { ThemedText, Badge, Icon, EmptyState, Button, Modal } from '../ui';
import AdministerVaccineModal from './AdministerVaccineModal';
import HistoricalVaccineModal from './HistoricalVaccineModal';
import {
  useImmunizationCohorts,
  resolveCohortCategoryLabel,
  resolvePatientAgeYears,
  isValidVaccineCohortKey,
  shouldDisplayImmunizationInjectionSite,
  type VaccineCohortKey,
} from './immunizationCatalog';
import { clinicService, formatClinicDate } from '../../services/clinicService';
import { useClinic } from '../../context/ClinicContext';
import { useEhrOptions } from '../../hooks/useEhrOptions';
import { notify } from '../../utils/feedback';

export { resolveCohortCategoryLabel };
import type {
  ClinicPatient,
  PatientDemographics,
  PatientImmunizationRecord,
  AdministerVaccinePayload,
  RecordHistoricalImmunizationPayload,
  RecordAefiPayload,
} from '../../services/clinicService';

export interface StatutoryImmunizationsTabProps {
  patient?: ClinicPatient | null;
  patientId?: string;
  demographics?: PatientDemographics | null;
  immunizations?: PatientImmunizationRecord[];
  onAdministerVaccine?: (payload: AdministerVaccinePayload) => Promise<void>;
  onRecordHistoricalVaccine?: (payload: RecordHistoricalImmunizationPayload) => Promise<void>;
  onRecordAefi?: (immunizationId: string, payload: RecordAefiPayload) => Promise<void>;
  onRefreshChart?: () => void;
  queueItemId?: string | null;
}

export default function StatutoryImmunizationsTab({
  patient,
  patientId,
  demographics: demoProp,
  immunizations = [],
  onAdministerVaccine,
  onRecordHistoricalVaccine,
  onRecordAefi,
  onRefreshChart,
  queueItemId,
}: StatutoryImmunizationsTabProps) {
  const { dateFormat, timeZoneId } = useClinic();
  const { cohorts } = useImmunizationCohorts();
  const { options: severityOptions } = useEhrOptions('allergy_severity');
  const availableSeverities = useMemo(() => severityOptions.map((s) => s.label), [severityOptions]);

  const [selectedCohort, setSelectedCohort] = useState<string>('ALL');
  const [administerModalVisible, setAdministerModalVisible] = useState(false);
  const [historicalModalVisible, setHistoricalModalVisible] = useState(false);
  const [aefiModalVisible, setAefiModalVisible] = useState(false);
  const [targetAefiImm, setTargetAefiImm] = useState<PatientImmunizationRecord | null>(null);
  const [aefiSeverity, setAefiSeverity] = useState<'Mild' | 'Moderate' | 'Severe' | 'LifeThreatening'>('Moderate');
  const [aefiRemarks, setAefiRemarks] = useState('');
  const [submittingAefi, setSubmittingAefi] = useState(false);

  // Determine patient age and cohort suitability
  const resolvedAge = resolvePatientAgeYears(demoProp, patient);
  const age = resolvedAge ?? 0;
  const sex = (demoProp?.sex || patient?.sex || '').toLowerCase();

  const isChild = age < 18;
  const isYoungWoman = sex === 'female' && age >= 9 && age <= 49;
  const isSenior = age >= 60 || Boolean(demoProp?.isSenior);
  const isAdultGeneral = age >= 18 && !isYoungWoman && !isSenior;
  const modalPreferredCohort: VaccineCohortKey | undefined = isValidVaccineCohortKey(selectedCohort, cohorts)
    ? selectedCohort
    : undefined;

  const isCohortRecommended = (cohortKey: VaccineCohortKey): boolean => {
    if (cohortKey === 'lib_immchild') return isChild;
    if (cohortKey === 'lib_immyoungw') return isYoungWoman;
    if (cohortKey === 'lib_immelderly') return isSenior;
    if (cohortKey === 'OtherImm') return isAdultGeneral;
    return false;
  };

  const filteredImmunizations = useMemo(() => {
    return immunizations.filter((imm) => {
      if (selectedCohort === 'ALL') return true;
      if (selectedCohort === 'OtherImm') {
        return !imm.philHealthLibrary || !imm.philHealthLibrary.startsWith('lib_imm');
      }
      return imm.philHealthLibrary === selectedCohort;
    });
  }, [immunizations, selectedCohort]);

  const hasAnyRecorded = immunizations.length > 0;

  const handleOpenAefi = (imm: PatientImmunizationRecord) => {
    setTargetAefiImm(imm);
    setAefiSeverity('Moderate');
    setAefiRemarks('Localized erythema, pain at injection site, low-grade fever.');
    setAefiModalVisible(true);
  };

  const handleSaveAefi = async () => {
    if (!targetAefiImm) return;
    setSubmittingAefi(true);
    try {
      const aefiPayload: RecordAefiPayload = {
        adverseReactionSeverity: aefiSeverity,
        adverseReactionRemarks: aefiRemarks,
        recordedAtUtc: new Date().toISOString(),
      };
      if (onRecordAefi) {
        await onRecordAefi(targetAefiImm.id, aefiPayload);
      } else {
        const targetPatientId = patientId || patient?.id;
        if (!targetPatientId) {
          notify.error('No patient selected for recording adverse reaction.');
          return;
        }
        const [, err] = await clinicService.recordImmunizationAefi(targetPatientId, targetAefiImm.id, aefiPayload);
        if (err) {
          notify.error(err.message || 'Could not record adverse reaction.');
          return;
        }
        notify.success('Adverse event (AEFI) recorded.');
      }
      setAefiModalVisible(false);
      setTargetAefiImm(null);
      if (onRefreshChart) onRefreshChart();
    } catch (err: any) {
      notify.error(err?.message || 'Could not record adverse reaction.');
    } finally {
      setSubmittingAefi(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* ========================================================================= */}
      {/* INLINE COHORT TABS (LEFT, HORIZONTAL SCROLL) + ACTION BUTTONS (RIGHT)     */}
      {/* ========================================================================= */}
      <View style={styles.headerActionBar}>
        <View style={styles.filterScrollWrap}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.filterScrollView}
            contentContainerStyle={styles.cohortFilterRow}
          >
            <Pressable
              onPress={() => setSelectedCohort('ALL')}
              style={[styles.cohortPill, selectedCohort === 'ALL' && styles.cohortPill_active]}
            >
              <ThemedText
                variant="captionBold"
                numberOfLines={1}
                color={selectedCohort === 'ALL' ? theme.colors.primaryDark : theme.colors.textSecondary}
              >
                All Recorded ({immunizations.length})
              </ThemedText>
            </Pressable>

            {cohorts.map((cohort) => {
              const isActive = selectedCohort === cohort.key;
              const recommended = isCohortRecommended(cohort.key);
              return (
                <Pressable
                  key={cohort.key}
                  onPress={() => setSelectedCohort(cohort.key)}
                  style={[styles.cohortPill, isActive && styles.cohortPill_active]}
                >
                  <ThemedText
                    variant="captionBold"
                    numberOfLines={1}
                    color={isActive ? theme.colors.primaryDark : theme.colors.textSecondary}
                  >
                    {cohort.tabLabel}
                    {recommended ? ' • Recommended' : ''}
                  </ThemedText>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        <View style={styles.actionButtonsRow}>
          <Button
            title="Administer Vax"
            variant="primary"
            icon="plus"
            size="sm"
            onPress={() => setAdministerModalVisible(true)}
          />
          <Button
            title="Log Vax History"
            variant="outline"
            icon="plus"
            size="sm"
            onPress={() => setHistoricalModalVisible(true)}
          />
        </View>
      </View>

      {/* ========================================================================= */}
      {/* IMMUNIZATION DOCUMENTATION STATUS BANNER                                  */}
      {/* ========================================================================= */}
      {!hasAnyRecorded ? (
        <View style={styles.documentationStatusCard}>
          <View style={styles.documentationStatusTopRow}>
            <Icon name="info" size={theme.sizes.iconMd} color={theme.colors.primaryDark} />
            <View style={{ flex: 1 }}>
              <ThemedText variant="bodyBold" color={theme.colors.primaryDark}>
                Immunization Documentation Status
              </ThemedText>
              <ThemedText variant="caption" color={theme.colors.textSecondary} style={{ marginTop: 2 }}>
                No immunizations are currently documented for this patient. Review the recommended vaccination schedule for their cohort, record any previously administered doses under &quot;Log Vax History&quot;, or administer new vaccines during this encounter.
              </ThemedText>
            </View>
          </View>
        </View>
      ) : null}

      {/* ========================================================================= */}
      {/* IMMUNIZATION RECORDS LIST                                                 */}
      {/* ========================================================================= */}
      {filteredImmunizations.length > 0 ? (
        <View style={styles.immunizationsList}>
          {filteredImmunizations.map((imm) => (
            <View key={imm.id} style={styles.immCard}>
              {/* Header */}
              <View style={styles.immCardHeader}>
                <View style={styles.immHeaderLeft}>
                  <View style={styles.vaccineNameRow}>
                    <ThemedText variant="bodyBold" color={theme.colors.text}>
                      {imm.vaccineName}
                    </ThemedText>
                    {imm.brandName ? (
                      <ThemedText variant="caption" color={theme.colors.textMuted}>
                        ({imm.brandName})
                      </ThemedText>
                    ) : null}
                  </View>
                  <View style={styles.libraryRow}>
                    <Badge
                      label={resolveCohortCategoryLabel(imm.philHealthLibrary, cohorts)}
                      variant="purple"
                      size="sm"
                    />
                    <Badge
                      label={`Dose ${imm.doseSequence}${imm.isSeriesCompleted ? ' (Completed)' : ''}`}
                      variant={imm.isSeriesCompleted ? 'success' : 'info'}
                      size="sm"
                    />
                  </View>
                </View>

                <View style={styles.immHeaderRight}>
                  {imm.isHistorical ? (
                    <Badge label="Historical" variant="neutral" size="sm" />
                  ) : (
                    <Badge label="In-Clinic Administered" variant="success" size="sm" icon="checkCircle" />
                  )}
                  {imm.isSynchronizedToPatientApp ? (
                    <Badge label="Synced to App" variant="routine" size="sm" />
                  ) : null}
                </View>
              </View>

              {/* Technical Administration Data */}
              <View style={styles.immMetaGrid}>
                {imm.lotBatchNumber ? (
                  <View style={styles.immMetaItem}>
                    <ThemedText variant="caption" color={theme.colors.textSecondary}>Batch / Lot #:</ThemedText>
                    <ThemedText variant="captionBold" color={theme.colors.text}>{imm.lotBatchNumber}</ThemedText>
                  </View>
                ) : null}
                {imm.expirationDate ? (
                  <View style={styles.immMetaItem}>
                    <ThemedText variant="caption" color={theme.colors.textSecondary}>Exp Date:</ThemedText>
                    <ThemedText variant="captionBold" color={theme.colors.text}>
                      {formatClinicDate(imm.expirationDate, { dateFormat, timeZoneId })}
                    </ThemedText>
                  </View>
                ) : null}
                {imm.route ? (
                  <View style={styles.immMetaItem}>
                    <ThemedText variant="caption" color={theme.colors.textSecondary}>Route:</ThemedText>
                    <ThemedText variant="captionBold" color={theme.colors.text}>{imm.route}</ThemedText>
                  </View>
                ) : null}
                {shouldDisplayImmunizationInjectionSite(imm.route, imm.injectionSite) ? (
                  <View style={styles.immMetaItem}>
                    <ThemedText variant="caption" color={theme.colors.textSecondary}>Injection Site:</ThemedText>
                    <ThemedText variant="captionBold" color={theme.colors.text}>{imm.injectionSite}</ThemedText>
                  </View>
                ) : null}
              </View>

              {/* Clinician / Facility Details */}
              <View style={styles.providerRow}>
                <ThemedText variant="caption" color={theme.colors.textMuted}>
                  {imm.isHistorical
                    ? `Historical Facility: ${imm.historicalFacilityName || 'Previous Clinic'}${imm.administeredAtUtc ? ` • ${formatClinicDate(imm.administeredAtUtc, { dateFormat, timeZoneId })}` : ''}`
                    : `Administered by: ${imm.administeredByStaffName}${imm.administeredByPrcLicense ? ` (PRC: ${imm.administeredByPrcLicense})` : ''} on ${formatClinicDate(imm.administeredAtUtc, { dateFormat, timeZoneId })}`}
                </ThemedText>
              </View>

              {/* Adverse Events (AEFI) Tracking */}
              {imm.hasAdverseReaction ? (
                <View style={styles.aefiCard}>
                  <View style={styles.aefiTop}>
                    <Icon name="emergency" size={14} color={theme.colors.emergencyText} />
                    <ThemedText variant="captionBold" color={theme.colors.emergencyText}>
                      AEFI REPORTED: Severity: {imm.adverseReactionSeverity}
                    </ThemedText>
                  </View>
                  {imm.adverseReactionRemarks ? (
                    <ThemedText variant="caption" color={theme.colors.emergencyText}>
                      Remarks: {imm.adverseReactionRemarks}
                    </ThemedText>
                  ) : null}
                </View>
              ) : (
                <View style={styles.immFooter}>
                  <Pressable
                    onPress={() => handleOpenAefi(imm)}
                    style={styles.aefiBtn}
                  >
                    <Icon name="alert" size={12} color={theme.colors.warningText} />
                    <ThemedText variant="caption" color={theme.colors.warningText}>
                      Report Adverse Reaction (AEFI)
                    </ThemedText>
                  </Pressable>
                </View>
              )}
            </View>
          ))}
        </View>
      ) : (
        <EmptyState
          icon="syringe"
          title="No immunizations recorded"
          description={
            hasAnyRecorded
              ? `No vaccines recorded for ${cohorts.find((c) => c.key === selectedCohort)?.tabLabel || 'this category'}.`
              : 'No vaccination records found for this patient. Click "Administer Vax" to record a dose given today or "Log Vax History" to document past immunizations.'
          }
        />
      )}

      {/* ========================================================================= */}
      {/* AEFI REPORTING MODAL                                                      */}
      {/* ========================================================================= */}
      <Modal
        visible={aefiModalVisible}
        onClose={() => setAefiModalVisible(false)}
        title="Report Adverse Event (AEFI)"
        subtitle={targetAefiImm?.vaccineName ? `Vaccine: ${targetAefiImm.vaccineName}` : 'Document post-vaccination adverse reaction'}
        maxWidth={540}
        maxHeight="90%"
        footer={
          <View style={styles.modalActions}>
            <Button
              title="Cancel"
              variant="ghost"
              onPress={() => setAefiModalVisible(false)}
              disabled={submittingAefi}
            />
            <Button
              title={submittingAefi ? 'Recording...' : 'Save AEFI Report'}
              variant="primary"
              onPress={handleSaveAefi}
              loading={submittingAefi}
            />
          </View>
        }
      >
        <View style={styles.severityPickerRow}>
          <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
            Reaction Severity *
          </ThemedText>
          <View style={styles.severityButtons}>
            {availableSeverities.map((sev) => (
              <Pressable
                key={sev}
                onPress={() => setAefiSeverity(sev as any)}
                style={[styles.sevBtn, aefiSeverity === sev && styles.sevBtn_active]}
              >
                <ThemedText
                  variant="captionBold"
                  color={aefiSeverity === sev ? theme.colors.onPrimary : theme.colors.textSecondary}
                >
                  {sev}
                </ThemedText>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.severityPickerRow}>
          <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
            Adverse Reaction Remarks / Clinical Symptoms
          </ThemedText>
          <TextInput
            style={styles.aefiInput}
            multiline
            numberOfLines={3}
            value={aefiRemarks}
            onChangeText={setAefiRemarks}
            placeholder="Describe adverse reaction, onset duration, fever, swelling, or systemic reactions..."
            placeholderTextColor={theme.colors.textMuted}
          />
        </View>
      </Modal>

      {/* ========================================================================= */}
      {/* ADMINISTER VACCINE MODAL (F12)                                            */}
      {/* ========================================================================= */}
      <AdministerVaccineModal
        visible={administerModalVisible}
        onClose={() => setAdministerModalVisible(false)}
        patient={patient}
        patientId={patientId || patient?.id}
        demographics={demoProp}
        preferredCohort={modalPreferredCohort}
        queueItemId={queueItemId}
        onAdministerVaccine={async (payload) => {
          if (onAdministerVaccine) {
            await onAdministerVaccine(payload);
          } else {
            const targetPatientId = patientId || patient?.id;
            if (!targetPatientId) {
              notify.error('No patient selected for vaccine administration.');
              throw new Error('No patient selected for vaccine administration.');
            }
            const [, err] = await clinicService.administerVaccine(targetPatientId, payload);
            if (err) {
              notify.error(err.message || 'Could not record vaccine administration.');
              throw new Error(err.message || 'Could not record vaccine administration.');
            }
            notify.success('Vaccine administration recorded.');
          }
          if (onRefreshChart) {
            onRefreshChart();
          }
        }}
      />

      {/* ========================================================================= */}
      {/* HISTORICAL VACCINE MODAL (F13)                                            */}
      {/* ========================================================================= */}
      <HistoricalVaccineModal
        visible={historicalModalVisible}
        onClose={() => setHistoricalModalVisible(false)}
        patient={patient}
        patientId={patientId || patient?.id}
        demographics={demoProp}
        preferredCohort={modalPreferredCohort}
        onRecordHistoricalVaccine={async (payload) => {
          if (onRecordHistoricalVaccine) {
            await onRecordHistoricalVaccine(payload);
          } else {
            const targetPatientId = patientId || patient?.id;
            if (!targetPatientId) {
              notify.error('No patient selected for recording historical immunization.');
              throw new Error('No patient selected for recording historical immunization.');
            }
            const [, err] = await clinicService.recordHistoricalImmunization(targetPatientId, payload);
            if (err) {
              notify.error(err.message || 'Could not record historical immunization.');
              throw new Error(err.message || 'Could not record historical immunization.');
            }
            notify.success('Historical immunization added.');
          }
          if (onRefreshChart) {
            onRefreshChart();
          }
        }}
      />
    </ScrollView>
  );
}

export const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  headerActionBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'nowrap',
    gap: theme.spacing.sm,
    width: '100%',
    minWidth: 0,
  },
  filterScrollWrap: {
    flexDirection: 'row',
    flex: 1,
    minWidth: 0,
  },
  filterScrollView: {
    flexGrow: 0,
    flexShrink: 1,
    minWidth: 0,
    maxWidth: '100%',
  },
  actionButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: theme.spacing.xs,
    flexWrap: 'nowrap',
    flexShrink: 0,
  },
  documentationStatusCard: {
    backgroundColor: theme.colors.primarySubtle,
    borderColor: theme.colors.primaryBorder,
    borderWidth: theme.sizes.borderWidth,
    borderRadius: theme.radii.md,
    padding: theme.spacing.sm,
  },
  documentationStatusTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
  },
  fallbackNoticeCard: {
    backgroundColor: theme.colors.primarySubtle,
    borderColor: theme.colors.primaryBorder,
    borderWidth: theme.sizes.borderWidth,
    borderRadius: theme.radii.md,
    padding: theme.spacing.sm,
  },
  fallbackTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
  },
  cohortFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'nowrap',
    gap: theme.spacing.xs,
  },
  cohortPill: {
    flexShrink: 0,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radii.full,
    backgroundColor: theme.colors.surfaceSubtle,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.borderLight,
  },
  cohortPill_active: {
    backgroundColor: theme.colors.primarySubtle,
    borderColor: theme.colors.primaryBorder,
  },
  immunizationsList: {
    gap: theme.spacing.sm,
  },
  immCard: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    padding: theme.spacing.sm,
    gap: theme.spacing.xs,
    shadowColor: theme.colors.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  immCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  immHeaderLeft: {
    flex: 1,
    gap: 4,
  },
  immHeaderRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  vaccineNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  libraryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
  },
  immMetaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    marginVertical: 4,
  },
  immMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  providerRow: {
    paddingTop: 2,
  },
  aefiCard: {
    backgroundColor: theme.colors.emergencyBg,
    borderColor: theme.colors.emergencyBorder,
    borderWidth: 1,
    borderRadius: theme.radii.sm,
    padding: theme.spacing.xs,
    gap: 2,
    marginTop: 4,
  },
  aefiTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  immFooter: {
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderLight,
    alignItems: 'flex-start',
  },
  aefiBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  severityPickerRow: {
    gap: theme.spacing.xs,
  },
  severityButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  sevBtn: {
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surfaceSubtle,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.borderLight,
  },
  sevBtn_active: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  aefiInput: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.borderDark,
    borderWidth: theme.sizes.borderWidth,
    borderRadius: theme.radii.md,
    padding: theme.spacing.md,
    color: theme.colors.text,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
});

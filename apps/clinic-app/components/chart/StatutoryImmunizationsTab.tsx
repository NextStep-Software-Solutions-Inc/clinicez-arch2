import React, { useState, useMemo } from 'react';
import { View, StyleSheet, ScrollView, Pressable, TextInput, Modal } from 'react-native';
import { theme } from '../../constants/theme';
import { ThemedText, Badge, Icon, EmptyState, Button } from '../ui';
import AdministerVaccineModal from './AdministerVaccineModal';
import HistoricalVaccineModal from './HistoricalVaccineModal';
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
}

export const PHILHEALTH_STATUTORY_VACCINES = {
  lib_immchild: [
    { code: 'C01', name: 'BCG (Bacillus Calmette-Guérin)' },
    { code: 'C02', name: 'OPV 1 (Oral Polio Vaccine 1)' },
    { code: 'C03', name: 'OPV 2 (Oral Polio Vaccine 2)' },
    { code: 'C04', name: 'OPV 3 (Oral Polio Vaccine 3)' },
    { code: 'C05', name: 'DPT-HepB-Hib 1 (Pentavalent 1)' },
    { code: 'C06', name: 'DPT-HepB-Hib 2 (Pentavalent 2)' },
    { code: 'C07', name: 'DPT-HepB-Hib 3 (Pentavalent 3)' },
    { code: 'C08', name: 'Measles Vaccine (MCV1)' },
    { code: 'C09', name: 'Hepatitis B (Birth Dose)' },
    { code: 'C10', name: 'Rotavirus Vaccine 1' },
    { code: 'C11', name: 'Rotavirus Vaccine 2' },
    { code: 'C12', name: 'Inactivated Polio Vaccine (IPV)' },
    { code: 'C13', name: 'MMR 1 (Measles, Mumps, Rubella)' },
  ],
  lib_immyoungw: [
    { code: 'Y01', name: 'Human Papillomavirus Vaccine (HPV)' },
    { code: 'Y02', name: 'MMR Booster (Young Women)' },
  ],
  lib_immpregw: [
    { code: 'P01', name: 'Tetanus Toxoid / Td 1' },
    { code: 'P02', name: 'Tetanus Toxoid / Td 2' },
    { code: 'P03', name: 'Tetanus Toxoid / Td 3' },
    { code: 'P04', name: 'Tetanus Toxoid / Td 4' },
    { code: 'P05', name: 'Tetanus Toxoid / Td 5' },
  ],
  lib_immelderly: [
    { code: 'E01', name: 'Pneumococcal Polysaccharide Vaccine (PPSV23 / PCV13)' },
    { code: 'E02', name: 'Seasonal Influenza Vaccine (Quadrivalent)' },
  ],
};

export default function StatutoryImmunizationsTab({
  patient,
  patientId,
  demographics: demoProp,
  immunizations = [],
  onAdministerVaccine,
  onRecordHistoricalVaccine,
  onRecordAefi,
  onRefreshChart,
}: StatutoryImmunizationsTabProps) {
  const [selectedCohort, setSelectedCohort] = useState<string>('ALL');
  const [administerModalVisible, setAdministerModalVisible] = useState(false);
  const [historicalModalVisible, setHistoricalModalVisible] = useState(false);
  const [aefiModalVisible, setAefiModalVisible] = useState(false);
  const [targetAefiImm, setTargetAefiImm] = useState<PatientImmunizationRecord | null>(null);
  const [aefiSeverity, setAefiSeverity] = useState<'Mild' | 'Moderate' | 'Severe'>('Moderate');
  const [aefiRemarks, setAefiRemarks] = useState('');
  const [submittingAefi, setSubmittingAefi] = useState(false);

  // Determine patient age and cohort suitability
  const age = demoProp?.age ?? patient?.age ?? 0;
  const gender = (demoProp?.gender || patient?.gender || '').toLowerCase();

  const isChild = age < 18;
  const isYoungWoman = gender === 'female' && age >= 9 && age <= 26;
  const isSenior = age >= 60 || demoProp?.isSenior;

  const filteredImmunizations = useMemo(() => {
    return immunizations.filter((imm) => {
      if (selectedCohort === 'ALL') return true;
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
      if (onRecordAefi) {
        await onRecordAefi(targetAefiImm.id, {
          adverseReactionSeverity: aefiSeverity,
          adverseReactionRemarks: aefiRemarks,
          recordedAtUtc: new Date().toISOString(),
        });
      }
      setAefiModalVisible(false);
      setTargetAefiImm(null);
      if (onRefreshChart) onRefreshChart();
    } finally {
      setSubmittingAefi(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* ========================================================================= */}
      {/* HEADER ACTION CONTROLS (+ Administer Vaccine, + Add Historical Vaccine)   */}
      {/* ========================================================================= */}
      <View style={styles.headerActionBar}>
        <View style={styles.actionButtonsRow}>
          <Button
            title="+ Administer Vaccine"
            variant="primary"
            icon="plus"
            size="sm"
            onPress={() => setAdministerModalVisible(true)}
          />
          <Button
            title="+ Add Historical Vaccine"
            variant="outline"
            icon="plus"
            size="sm"
            onPress={() => setHistoricalModalVisible(true)}
          />
        </View>
      </View>

      {/* ========================================================================= */}
      {/* PHILHEALTH STATUTORY COMPLIANCE BANNER / 999 FALLBACK NOTICE              */}
      {/* ========================================================================= */}
      {!hasAnyRecorded ? (
        <View style={styles.fallbackNoticeCard}>
          <View style={styles.fallbackTopRow}>
            <Icon name="yakap" size={theme.sizes.iconMd} color={theme.colors.primaryDark} />
            <View style={{ flex: 1 }}>
              <ThemedText variant="bodyBold" color={theme.colors.primaryDark}>
                PhilHealth Konsulta Statutory Coverage (Fallback Code 999)
              </ThemedText>
              <ThemedText variant="caption" color={theme.colors.textSecondary} style={{ marginTop: 2 }}>
                Under PhilHealth Konsulta DTD v1.14 specification, claim transmittals require an &lt;IMMUNIZATION+&gt; block. When a patient has zero recorded vaccines, statutory fallback code 999 (&quot;None / Not Given&quot;) is automatically emitted to guarantee 100% claim compliance without rejections.
              </ThemedText>
            </View>
          </View>
        </View>
      ) : null}

      {/* ========================================================================= */}
      {/* COHORT FILTERS                                                            */}
      {/* ========================================================================= */}
      <View style={styles.cohortFilterRow}>
        <Pressable
          onPress={() => setSelectedCohort('ALL')}
          style={[styles.cohortPill, selectedCohort === 'ALL' && styles.cohortPill_active]}
        >
          <ThemedText
            variant="captionBold"
            color={selectedCohort === 'ALL' ? theme.colors.primaryDark : theme.colors.textSecondary}
          >
            All Recorded ({immunizations.length})
          </ThemedText>
        </Pressable>

        <Pressable
          onPress={() => setSelectedCohort('lib_immchild')}
          style={[styles.cohortPill, selectedCohort === 'lib_immchild' && styles.cohortPill_active]}
        >
          <ThemedText
            variant="captionBold"
            color={selectedCohort === 'lib_immchild' ? theme.colors.primaryDark : theme.colors.textSecondary}
          >
            Child Schedule (0–17y) {isChild ? '• Recommended' : ''}
          </ThemedText>
        </Pressable>

        <Pressable
          onPress={() => setSelectedCohort('lib_immyoungw')}
          style={[styles.cohortPill, selectedCohort === 'lib_immyoungw' && styles.cohortPill_active]}
        >
          <ThemedText
            variant="captionBold"
            color={selectedCohort === 'lib_immyoungw' ? theme.colors.primaryDark : theme.colors.textSecondary}
          >
            Young Women (HPV) {isYoungWoman ? '• Recommended' : ''}
          </ThemedText>
        </Pressable>

        <Pressable
          onPress={() => setSelectedCohort('lib_immpregw')}
          style={[styles.cohortPill, selectedCohort === 'lib_immpregw' && styles.cohortPill_active]}
        >
          <ThemedText
            variant="captionBold"
            color={selectedCohort === 'lib_immpregw' ? theme.colors.primaryDark : theme.colors.textSecondary}
          >
            Maternal (Td / Tdap)
          </ThemedText>
        </Pressable>

        <Pressable
          onPress={() => setSelectedCohort('lib_immelderly')}
          style={[styles.cohortPill, selectedCohort === 'lib_immelderly' && styles.cohortPill_active]}
        >
          <ThemedText
            variant="captionBold"
            color={selectedCohort === 'lib_immelderly' ? theme.colors.primaryDark : theme.colors.textSecondary}
          >
            Senior Citizens (60+) {isSenior ? '• Recommended' : ''}
          </ThemedText>
        </Pressable>
      </View>

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
                    <Badge label={imm.philHealthLibrary} variant="purple" size="sm" />
                    <Badge label={`Code: ${imm.philHealthCode}`} variant="routine" size="sm" />
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
                    <ThemedText variant="captionBold" color={theme.colors.text}>{imm.expirationDate}</ThemedText>
                  </View>
                ) : null}
                {imm.route ? (
                  <View style={styles.immMetaItem}>
                    <ThemedText variant="caption" color={theme.colors.textSecondary}>Route:</ThemedText>
                    <ThemedText variant="captionBold" color={theme.colors.text}>{imm.route}</ThemedText>
                  </View>
                ) : null}
                {imm.injectionSite ? (
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
                    ? `Historical Facility: ${imm.historicalFacilityName || 'Previous Clinic'}`
                    : `Administered by: ${imm.administeredByStaffName}${imm.administeredByPrcLicense ? ` (PRC: ${imm.administeredByPrcLicense})` : ''} on ${new Date(imm.administeredAtUtc).toLocaleDateString()}`}
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
              ? `Zero vaccines recorded for ${selectedCohort}.`
              : 'Zero statutory vaccines documented for this patient. Fallback code 999 will be automatically used for PhilHealth claims.'
          }
        />
      )}

      {/* ========================================================================= */}
      {/* AEFI REPORTING MODAL                                                      */}
      {/* ========================================================================= */}
      <Modal visible={aefiModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <Icon name="alert" size={theme.sizes.iconMd} color={theme.colors.warningText} />
              <ThemedText variant="h3" color={theme.colors.text}>
                Report Adverse Event (AEFI)
              </ThemedText>
            </View>

            <ThemedText variant="body" color={theme.colors.textSecondary}>
              Vaccine: {targetAefiImm?.vaccineName} ({targetAefiImm?.philHealthCode})
            </ThemedText>

            <View style={styles.severityPickerRow}>
              <ThemedText variant="captionBold" color={theme.colors.text}>
                Reaction Severity:
              </ThemedText>
              <View style={styles.severityButtons}>
                {(['Mild', 'Moderate', 'Severe'] as const).map((sev) => (
                  <Pressable
                    key={sev}
                    onPress={() => setAefiSeverity(sev)}
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

            <ThemedText variant="captionBold" color={theme.colors.text} style={{ marginBottom: 4 }}>
              Adverse Reaction Remarks / Clinical Symptoms:
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
          </View>
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
        onAdministerVaccine={async (payload) => {
          if (onAdministerVaccine) {
            await onAdministerVaccine(payload);
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
        onRecordHistoricalVaccine={async (payload) => {
          if (onRecordHistoricalVaccine) {
            await onRecordHistoricalVaccine(payload);
          }
          if (onRefreshChart) {
            onRefreshChart();
          }
        }}
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
  headerActionBar: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    flexWrap: 'wrap',
  },
  fallbackNoticeCard: {
    backgroundColor: theme.colors.primarySubtle,
    borderColor: theme.colors.primaryBorder,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    padding: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  fallbackTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
  },
  cohortFilterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.md,
  },
  cohortPill: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: theme.radii.full,
    backgroundColor: theme.colors.surfaceSubtle,
    borderWidth: 1,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: theme.colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.md,
  },
  modalBox: {
    width: '100%',
    maxWidth: 480,
    maxHeight: '95%',
    overflow: 'hidden',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.md,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  severityPickerRow: {
    gap: 4,
  },
  severityButtons: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  sevBtn: {
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  sevBtn_active: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  aefiInput: {
    backgroundColor: theme.colors.surfaceSubtle,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.sm,
    padding: theme.spacing.sm,
    color: theme.colors.text,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.xs,
  },
});

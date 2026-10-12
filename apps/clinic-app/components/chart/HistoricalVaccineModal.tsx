import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Modal,
} from 'react-native';
import { theme } from '../../constants/theme';
import { ThemedText, Button, Icon, Badge, ValidatedDateInput, validateDateString } from '../ui';
import { PHILHEALTH_STATUTORY_VACCINES } from './StatutoryImmunizationsTab';
import { COHORTS, VACCINE_ROUTES, INJECTION_SITES } from './AdministerVaccineModal';
import type {
  ClinicPatient,
  PatientDemographics,
  RecordHistoricalImmunizationPayload,
} from '../../services/clinicService';

export interface HistoricalVaccineModalProps {
  visible: boolean;
  onClose: () => void;
  patient?: ClinicPatient | null;
  patientId?: string;
  demographics?: PatientDemographics | null;
  onRecordHistoricalVaccine: (payload: RecordHistoricalImmunizationPayload) => Promise<void>;
  onSuccess?: () => void;
}

export default function HistoricalVaccineModal({
  visible,
  onClose,
  patient,
  patientId,
  demographics,
  onRecordHistoricalVaccine,
  onSuccess,
}: HistoricalVaccineModalProps) {
  // Determine initial cohort by patient demographics
  const age = demographics?.age ?? patient?.age ?? 0;
  const gender = (demographics?.gender || patient?.gender || '').toLowerCase();

  const getInitialCohort = (): 'lib_immchild' | 'lib_immyoungw' | 'lib_immpregw' | 'lib_immelderly' => {
    if (age < 18) return 'lib_immchild';
    if (gender === 'female' && age >= 9 && age <= 49) return 'lib_immyoungw';
    if (age >= 60 || demographics?.isSenior) return 'lib_immelderly';
    return 'lib_immchild';
  };

  const [selectedCohort, setSelectedCohort] = useState<keyof typeof PHILHEALTH_STATUTORY_VACCINES>(getInitialCohort());
  const [selectedVaccineCode, setSelectedVaccineCode] = useState<string>('C01');
  const [administeredDate, setAdministeredDate] = useState('');
  const [doseSequence, setDoseSequence] = useState('1');
  const [isSeriesCompleted, setIsSeriesCompleted] = useState(false);
  const [historicalFacilityName, setHistoricalFacilityName] = useState('');
  const [lotBatchNumber, setLotBatchNumber] = useState('');
  const [route, setRoute] = useState<string>(VACCINE_ROUTES[0]);
  const [injectionSite, setInjectionSite] = useState<string>(INJECTION_SITES[0]);
  const [remarks, setRemarks] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Sync initial state when modal opens
  useEffect(() => {
    if (visible) {
      const cohort = getInitialCohort();
      setSelectedCohort(cohort);
      const vaccines = PHILHEALTH_STATUTORY_VACCINES[cohort];
      if (vaccines && vaccines.length > 0) {
        setSelectedVaccineCode(vaccines[0].code);
      }
      setAdministeredDate(new Date().toISOString().split('T')[0]);
      setDoseSequence('1');
      setIsSeriesCompleted(false);
      setHistoricalFacilityName('');
      setLotBatchNumber('');
      setRoute(VACCINE_ROUTES[0]);
      setInjectionSite(INJECTION_SITES[0]);
      setRemarks('');
      setValidationError(null);
    }
  }, [visible]);

  const handleCohortChange = (cohort: keyof typeof PHILHEALTH_STATUTORY_VACCINES) => {
    setSelectedCohort(cohort);
    const vaccines = PHILHEALTH_STATUTORY_VACCINES[cohort];
    if (vaccines && vaccines.length > 0) {
      setSelectedVaccineCode(vaccines[0].code);
    }
  };

  const currentVaccineList = PHILHEALTH_STATUTORY_VACCINES[selectedCohort] || [];
  const selectedVaccine = currentVaccineList.find((v) => v.code === selectedVaccineCode) || currentVaccineList[0];

  const handleRecord = async () => {
    setValidationError(null);

    const adminDateValidation = validateDateString(administeredDate, { boundaryMode: 'pastOrToday' });
    if (!adminDateValidation.isValid) {
      setValidationError(adminDateValidation.errorMessage || 'Valid past or today administration date required (YYYY-MM-DD).');
      return;
    }

    const seqNum = parseInt(doseSequence, 10);
    if (isNaN(seqNum) || seqNum < 1) {
      setValidationError('Dose sequence must be a positive integer (e.g. 1, 2, 3).');
      return;
    }

    setSubmitting(true);
    try {
      const payload: RecordHistoricalImmunizationPayload = {
        philHealthLibrary: selectedCohort,
        philHealthCode: selectedVaccine?.code || selectedVaccineCode,
        vaccineName: selectedVaccine?.name || 'Statutory Vaccine',
        administeredDate: adminDateValidation.formattedDate,
        doseSequence: seqNum,
        isSeriesCompleted,
        lotBatchNumber: lotBatchNumber.trim() || undefined,
        historicalFacilityName: historicalFacilityName.trim() || undefined,
        route: route.trim() || undefined,
        injectionSite: injectionSite.trim() || undefined,
        remarks: remarks.trim() || undefined,
      };

      await onRecordHistoricalVaccine(payload);
      onSuccess?.();
      onClose();
    } catch (err: any) {
      setValidationError(err?.message || 'Failed to record historical immunization.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <View style={styles.headerTitleRow}>
              <Icon name="clock" size={theme.sizes.iconMd} color={theme.colors.info} />
              <View>
                <ThemedText variant="h3" color={theme.colors.text}>
                  Add Historical Vaccine
                </ThemedText>
                <ThemedText variant="caption" color={theme.colors.textSecondary}>
                  Record vaccines received outside this facility
                </ThemedText>
              </View>
            </View>
            <Pressable onPress={onClose} hitSlop={8} style={styles.closeBtn}>
              <Icon name="close" size={theme.sizes.iconSm} color={theme.colors.textSecondary} />
            </Pressable>
          </View>

          <ScrollView style={styles.formScroll} contentContainerStyle={styles.formScrollContent}>
            {/* Validation Banner */}
            {validationError ? (
              <View style={styles.errorBanner}>
                <Icon name="alertCircle" size={16} color={theme.colors.emergencyText} />
                <ThemedText variant="captionBold" color={theme.colors.emergencyText} style={{ flex: 1 }}>
                  {validationError}
                </ThemedText>
              </View>
            ) : null}

            {/* Vaccine Category Selector */}
            <View style={styles.fieldSection}>
              <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
                1. Vaccine Category *
              </ThemedText>
              <View style={styles.chipRow}>
                {COHORTS.map((c) => (
                  <Pressable
                    key={c.key}
                    onPress={() => handleCohortChange(c.key)}
                    style={[styles.cohortChip, selectedCohort === c.key && styles.cohortChip_active]}
                  >
                    <ThemedText
                      variant="captionBold"
                      color={selectedCohort === c.key ? theme.colors.onPrimary : theme.colors.textSecondary}
                    >
                      {c.label}
                    </ThemedText>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Vaccine Selection */}
            <View style={styles.fieldSection}>
              <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
                2. Select Vaccine ({currentVaccineList.length} available) *
              </ThemedText>
              <View style={styles.vaccineListContainer}>
                <ScrollView
                  style={styles.vaccineListScroll}
                  contentContainerStyle={styles.vaccineListContent}
                  nestedScrollEnabled={true}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={true}
                >
                  {currentVaccineList.map((vac) => {
                    const isSelected = selectedVaccineCode === vac.code;
                    return (
                      <Pressable
                        key={vac.code}
                        onPress={() => setSelectedVaccineCode(vac.code)}
                        style={[styles.vaccineItem, isSelected && styles.vaccineItem_active]}
                      >
                        {isSelected ? (
                          <Icon name="check" size={14} color={theme.colors.primaryDark} />
                        ) : (
                          <View style={{ width: 14 }} />
                        )}
                        <ThemedText
                          variant="captionBold"
                          color={isSelected ? theme.colors.primaryDark : theme.colors.text}
                          style={{ flex: 1 }}
                        >
                          {vac.name}
                        </ThemedText>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            </View>

            {/* Administered Date & Dose Sequence Row */}
            <View style={styles.twoColumnRow}>
              <View style={styles.halfCol}>
                <ValidatedDateInput
                  label="Date Administered *"
                  required
                  boundaryMode="pastOrToday"
                  placeholder="YYYY-MM-DD"
                  value={administeredDate}
                  onChangeText={setAdministeredDate}
                />
              </View>

              <View style={styles.halfCol}>
                <ThemedText variant="captionBold" color={theme.colors.textSecondary} style={styles.fieldLabel}>
                  Dose Sequence Number *
                </ThemedText>
                <TextInput
                  style={styles.textInput}
                  placeholder="1"
                  placeholderTextColor={theme.colors.textMuted}
                  keyboardType="numeric"
                  value={doseSequence}
                  onChangeText={setDoseSequence}
                />
              </View>
            </View>

            {/* Series Completed & Historical Facility */}
            <View style={styles.twoColumnRow}>
              <View style={styles.halfCol}>
                <ThemedText variant="captionBold" color={theme.colors.textSecondary} style={styles.fieldLabel}>
                  Outside Clinic / Facility Name
                </ThemedText>
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. City Health Center, Private Pedia"
                  placeholderTextColor={theme.colors.textMuted}
                  value={historicalFacilityName}
                  onChangeText={setHistoricalFacilityName}
                />
              </View>

              <View style={[styles.halfCol, styles.switchContainer]}>
                <View style={{ flex: 1 }}>
                  <ThemedText variant="captionBold" color={theme.colors.text}>
                    Series Completed?
                  </ThemedText>
                  <ThemedText variant="caption" color={theme.colors.textSecondary}>
                    Mark full immunization series
                  </ThemedText>
                </View>
                <Pressable
                  accessibilityRole="switch"
                  accessibilityState={{ checked: isSeriesCompleted }}
                  onPress={() => setIsSeriesCompleted(!isSeriesCompleted)}
                  style={[styles.toggleTrack, isSeriesCompleted && styles.toggleTrackActive]}
                >
                  <View style={[styles.toggleThumb, isSeriesCompleted && styles.toggleThumbActive]} />
                </Pressable>
              </View>
            </View>

            {/* Optional Lot / Batch */}
            <View style={styles.fieldSection}>
              <ThemedText variant="captionBold" color={theme.colors.textSecondary} style={styles.fieldLabel}>
                Lot / Batch Number (If documented on card)
              </ThemedText>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. LOT-HIST-2024"
                placeholderTextColor={theme.colors.textMuted}
                value={lotBatchNumber}
                onChangeText={setLotBatchNumber}
              />
            </View>

            {/* Route & Injection Site */}
            <View style={styles.fieldSection}>
              <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
                Administration Route (Optional)
              </ThemedText>
              <View style={styles.chipRow}>
                {VACCINE_ROUTES.map((r) => (
                  <Pressable
                    key={r}
                    onPress={() => setRoute(r)}
                    style={[styles.smallChip, route === r && styles.smallChip_active]}
                  >
                    <ThemedText
                      variant="caption"
                      color={route === r ? theme.colors.onPrimary : theme.colors.text}
                    >
                      {r}
                    </ThemedText>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.fieldSection}>
              <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
                Injection Site (Optional)
              </ThemedText>
              <View style={styles.chipRow}>
                {INJECTION_SITES.map((s) => (
                  <Pressable
                    key={s}
                    onPress={() => setInjectionSite(s)}
                    style={[styles.smallChip, injectionSite === s && styles.smallChip_active]}
                  >
                    <ThemedText
                      variant="caption"
                      color={injectionSite === s ? theme.colors.onPrimary : theme.colors.text}
                    >
                      {s}
                    </ThemedText>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Remarks */}
            <View style={styles.fieldSection}>
              <ThemedText variant="captionBold" color={theme.colors.textSecondary} style={styles.fieldLabel}>
                Clinical Remarks / Card Verification Notes
              </ThemedText>
              <TextInput
                style={[styles.textInput, styles.textArea]}
                placeholder="Verified from physical child health immunization card / yellow booklet..."
                placeholderTextColor={theme.colors.textMuted}
                multiline
                numberOfLines={2}
                value={remarks}
                onChangeText={setRemarks}
              />
            </View>
          </ScrollView>

          {/* Modal Actions */}
          <View style={styles.modalFooter}>
            <Button
              title="Cancel"
              variant="ghost"
              onPress={onClose}
              disabled={submitting}
            />
            <Button
              title={submitting ? 'Recording Historical...' : 'Save Historical Vaccine'}
              variant="primary"
              icon="checkCircle"
              onPress={handleRecord}
              loading={submitting}
              disabled={submitting}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: theme.colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.md,
  },
  modalContent: {
    width: '100%',
    maxWidth: 620,
    maxHeight: '95%',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.lg,
    overflow: 'hidden',
    shadowColor: theme.colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
    backgroundColor: theme.colors.surfaceSubtle,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  closeBtn: {
    padding: theme.spacing.xs,
    borderRadius: theme.radii.sm,
  },
  formScroll: {
    flexShrink: 1,
    maxHeight: 520,
  },
  formScrollContent: {
    padding: theme.spacing.md,
    gap: theme.spacing.md,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    backgroundColor: theme.colors.emergencyBg,
    borderColor: theme.colors.emergencyBorder,
    borderWidth: 1,
    borderRadius: theme.radii.sm,
    padding: theme.spacing.sm,
  },
  fieldSection: {
    gap: theme.spacing.xs,
  },
  fieldLabel: {
    marginBottom: 4,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
    marginTop: 2,
  },
  cohortChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: theme.radii.full,
    backgroundColor: theme.colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  cohortChip_active: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  smallChip: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  smallChip_active: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  vaccineListContainer: {
    maxHeight: 180,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.surfaceSubtle,
    overflow: 'hidden',
  },
  vaccineListScroll: {
    maxHeight: 180,
  },
  vaccineListContent: {
    flexGrow: 0,
  },
  vaccineItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  vaccineItem_active: {
    backgroundColor: theme.colors.primarySubtle,
  },
  twoColumnRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  halfCol: {
    flex: 1,
  },
  textInput: {
    borderWidth: 1,
    borderColor: theme.colors.borderDark,
    borderRadius: theme.radii.md,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 8,
    fontSize: theme.fontSizes.sm,
    color: theme.colors.text,
    backgroundColor: theme.colors.surface,
    minHeight: theme.sizes.controlMd,
  },
  textArea: {
    minHeight: 56,
    textAlignVertical: 'top',
  },
  switchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  toggleTrack: {
    width: 44,
    height: 24,
    borderRadius: theme.radii.full,
    backgroundColor: theme.colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: theme.colors.border,
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  toggleTrackActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  toggleThumb: {
    width: 18,
    height: 18,
    borderRadius: theme.radii.full,
    backgroundColor: theme.colors.onPrimary,
  },
  toggleThumbActive: {
    alignSelf: 'flex-end',
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderLight,
    backgroundColor: theme.colors.surfaceSubtle,
  },
});

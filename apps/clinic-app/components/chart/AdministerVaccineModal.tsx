import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Alert,
} from 'react-native';
import { theme } from '../../constants/theme';
import { ThemedText, Button, Icon, Badge, ValidatedDateInput, validateDateString, Modal } from '../ui';
import { notify } from '../../utils/feedback';
import { useStaff } from '../../context/StaffContext';
import { useEhrOptions } from '../../hooks/useEhrOptions';
import { PHILHEALTH_STATUTORY_VACCINES } from './StatutoryImmunizationsTab';
import type {
  ClinicPatient,
  PatientDemographics,
  AdministerVaccinePayload,
} from '../../services/clinicService';

export interface AdministerVaccineModalProps {
  visible: boolean;
  onClose: () => void;
  patient?: ClinicPatient | null;
  patientId?: string;
  demographics?: PatientDemographics | null;
  queueItemId?: string | null;
  onAdministerVaccine: (payload: AdministerVaccinePayload) => Promise<void>;
  onSuccess?: () => void;
}

export const VACCINE_ROUTES = [
  'Intramuscular (IM)',
  'Subcutaneous (SC)',
  'Oral (PO)',
  'Intradermal (ID)',
] as const;

export const INJECTION_SITES = [
  'Left Deltoid',
  'Right Deltoid',
  'Left Anterolateral Thigh',
  'Right Anterolateral Thigh',
  'Oral',
] as const;

export const COHORTS = [
  { key: 'lib_immchild', label: 'Child (0–17y)' },
  { key: 'lib_immyoungw', label: 'Young Women' },
  { key: 'lib_immpregw', label: 'Maternal (Td)' },
  { key: 'lib_immelderly', label: 'Senior (60+)' },
] as const;

export default function AdministerVaccineModal({
  visible,
  onClose,
  patient,
  patientId,
  demographics,
  queueItemId,
  onAdministerVaccine,
  onSuccess,
}: AdministerVaccineModalProps) {
  const { current: currentStaff, currentName } = useStaff();

  // Determine initial cohort by patient demographics
  const age = demographics?.age ?? patient?.age ?? 0;
  const sex = (demographics?.sex || patient?.sex || '').toLowerCase();

  const getInitialCohort = (): 'lib_immchild' | 'lib_immyoungw' | 'lib_immpregw' | 'lib_immelderly' => {
    if (age < 18) return 'lib_immchild';
    if (sex === 'female' && age >= 9 && age <= 49) return 'lib_immyoungw';
    if (age >= 60 || demographics?.isSenior) return 'lib_immelderly';
    return 'lib_immchild';
  };

  const [selectedCohort, setSelectedCohort] = useState<keyof typeof PHILHEALTH_STATUTORY_VACCINES>(getInitialCohort());
  const [selectedVaccineCode, setSelectedVaccineCode] = useState<string>('C01');
  const [lotBatchNumber, setLotBatchNumber] = useState('');
  const [expirationDate, setExpirationDate] = useState('');
  const [doseSequence, setDoseSequence] = useState('1');
  const [isSeriesCompleted, setIsSeriesCompleted] = useState(false);
  const { options: dynamicRoutes } = useEhrOptions('medicine_route');
  const availableRoutes = useMemo(() => {
    return dynamicRoutes.length > 0 ? dynamicRoutes.map((r) => r.label) : (VACCINE_ROUTES as readonly string[]);
  }, [dynamicRoutes]);
  const [route, setRoute] = useState<string>(VACCINE_ROUTES[0]);
  const [injectionSite, setInjectionSite] = useState<string>(INJECTION_SITES[0]);
  const [brandName, setBrandName] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [staffName, setStaffName] = useState('');
  const [prcLicense, setPrcLicense] = useState('');
  const [remarks, setRemarks] = useState('');
  const [completeVisit, setCompleteVisit] = useState(false);
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
      setLotBatchNumber('');
      setExpirationDate('');
      setDoseSequence('1');
      setIsSeriesCompleted(false);
      setRoute(VACCINE_ROUTES[0]);
      setInjectionSite(INJECTION_SITES[0]);
      setBrandName('');
      setManufacturer('');
      setStaffName(currentName || '');
      setPrcLicense(currentStaff?.prcLicenseNumber || '');
      setRemarks('');
      setCompleteVisit(false);
      setValidationError(null);
    }
  }, [visible, currentName, currentStaff]);

  // When cohort changes, auto-select first vaccine of that cohort
  const handleCohortChange = (cohort: keyof typeof PHILHEALTH_STATUTORY_VACCINES) => {
    setSelectedCohort(cohort);
    const vaccines = PHILHEALTH_STATUTORY_VACCINES[cohort];
    if (vaccines && vaccines.length > 0) {
      setSelectedVaccineCode(vaccines[0].code);
    }
  };

  const currentVaccineList = PHILHEALTH_STATUTORY_VACCINES[selectedCohort] || [];
  const selectedVaccine = currentVaccineList.find((v) => v.code === selectedVaccineCode) || currentVaccineList[0];

  const handleAdminister = async () => {
    setValidationError(null);

    if (!lotBatchNumber.trim()) {
      setValidationError('Lot / Batch number is required.');
      notify.error('Lot / Batch number is required.');
      return;
    }

    const expValidation = validateDateString(expirationDate, { boundaryMode: 'futureOrToday' });
    if (!expValidation.isValid) {
      const err = expValidation.errorMessage || 'Valid future expiration date required (YYYY-MM-DD).';
      setValidationError(err);
      notify.error(err);
      return;
    }

    const seqNum = parseInt(doseSequence, 10);
    if (isNaN(seqNum) || seqNum < 1) {
      setValidationError('Dose sequence must be a positive integer (e.g. 1, 2, 3).');
      notify.error('Dose sequence must be a positive integer (e.g. 1, 2, 3).');
      return;
    }

    const adminName = staffName.trim() || currentName || 'Staff Clinician';
    if (!adminName) {
      setValidationError('Administering clinician name is required.');
      notify.error('Administering clinician name is required.');
      return;
    }

    const isValidGuid = (val?: string | null) =>
      Boolean(val && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val));

    setSubmitting(true);
    try {
      const payload: AdministerVaccinePayload = {
        philHealthLibrary: selectedCohort,
        philHealthCode: selectedVaccine?.code || selectedVaccineCode,
        vaccineName: selectedVaccine?.name || 'Statutory Vaccine',
        brandName: brandName.trim() || undefined,
        manufacturer: manufacturer.trim() || undefined,
        lotBatchNumber: lotBatchNumber.trim(),
        expirationDate: expValidation.formattedDate,
        doseSequence: seqNum,
        isSeriesCompleted,
        route,
        injectionSite,
        administeredAtUtc: new Date().toISOString(),
        administeredByStaffId: isValidGuid(currentStaff?.id) ? currentStaff!.id : (currentStaff?.id || '00000000-0000-0000-0000-000000000000'),
        administeredByStaffName: adminName,
        administeredByPrcLicense: prcLicense.trim() || undefined,
        remarks: remarks.trim() || undefined,
        queueItemId: queueItemId || undefined,
        completeVisit: completeVisit,
      };

      await onAdministerVaccine(payload);
      onSuccess?.();
      onClose();
    } catch (err: any) {
      const msg = err?.message || 'Failed to record vaccine administration.';
      setValidationError(msg);
      notify.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal raw visible={visible} transparent animationType="slide" onClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <View style={styles.headerTitleRow}>
              <Icon name="syringe" size={theme.sizes.iconMd} color={theme.colors.primary} />
              <View>
                <ThemedText variant="h3" color={theme.colors.text}>
                  Administer Vaccine
                </ThemedText>
                <ThemedText variant="caption" color={theme.colors.textSecondary}>
                  Document In-Clinic Administration
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

            {/* Lot & Expiration Row */}
            <View style={styles.twoColumnRow}>
              <View style={styles.halfCol}>
                <ThemedText variant="captionBold" color={theme.colors.textSecondary} style={styles.fieldLabel}>
                  Lot / Batch Number *
                </ThemedText>
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. LOT-2026-X99"
                  placeholderTextColor={theme.colors.textMuted}
                  value={lotBatchNumber}
                  onChangeText={setLotBatchNumber}
                />
              </View>

              <View style={styles.halfCol}>
                <ValidatedDateInput
                  label="Expiration Date *"
                  required
                  boundaryMode="futureOrToday"
                  placeholder="YYYY-MM-DD"
                  value={expirationDate}
                  onChangeText={setExpirationDate}
                />
              </View>
            </View>

            {/* Brand & Manufacturer Row */}
            <View style={styles.twoColumnRow}>
              <View style={styles.halfCol}>
                <ThemedText variant="captionBold" color={theme.colors.textSecondary} style={styles.fieldLabel}>
                  Brand Name (Optional)
                </ThemedText>
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. Priorix, Gardasil"
                  placeholderTextColor={theme.colors.textMuted}
                  value={brandName}
                  onChangeText={setBrandName}
                />
              </View>

              <View style={styles.halfCol}>
                <ThemedText variant="captionBold" color={theme.colors.textSecondary} style={styles.fieldLabel}>
                  Manufacturer (Optional)
                </ThemedText>
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. GSK, Sanofi"
                  placeholderTextColor={theme.colors.textMuted}
                  value={manufacturer}
                  onChangeText={setManufacturer}
                />
              </View>
            </View>

            {/* Dose Sequence & Series Completed */}
            <View style={styles.twoColumnRow}>
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

              <View style={[styles.halfCol, styles.switchContainer]}>
                <View style={{ flex: 1 }}>
                  <ThemedText variant="captionBold" color={theme.colors.text}>
                    Series Completed?
                  </ThemedText>
                  <ThemedText variant="caption" color={theme.colors.textSecondary}>
                    Mark final dose in sequence
                  </ThemedText>
                </View>
                <Pressable
                  style={[styles.toggleBtn, isSeriesCompleted && styles.toggleBtnActive]}
                  onPress={() => setIsSeriesCompleted(!isSeriesCompleted)}
                >
                  <ThemedText
                    variant="captionBold"
                    color={isSeriesCompleted ? theme.colors.onPrimary : theme.colors.textSecondary}
                  >
                    {isSeriesCompleted ? 'Yes' : 'No'}
                  </ThemedText>
                </Pressable>
              </View>
            </View>

            {/* Route & Injection Site */}
            <View style={styles.fieldSection}>
              <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
                Administration Route *
              </ThemedText>
              <View style={styles.chipRow}>
                {availableRoutes.map((r) => (
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
                Injection Site *
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

            {/* Clinician Credentials */}
            <View style={styles.twoColumnRow}>
              <View style={styles.halfCol}>
                <ThemedText variant="captionBold" color={theme.colors.textSecondary} style={styles.fieldLabel}>
                  Administering Staff Name *
                </ThemedText>
                <TextInput
                  style={styles.textInput}
                  placeholder="Nurse / Physician Name"
                  placeholderTextColor={theme.colors.textMuted}
                  value={staffName}
                  onChangeText={setStaffName}
                />
              </View>

              <View style={styles.halfCol}>
                <ThemedText variant="captionBold" color={theme.colors.textSecondary} style={styles.fieldLabel}>
                  PRC License Number
                </ThemedText>
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. 0123456"
                  placeholderTextColor={theme.colors.textMuted}
                  value={prcLicense}
                  onChangeText={setPrcLicense}
                />
              </View>
            </View>

            {/* Remarks */}
            <View style={styles.fieldSection}>
              <ThemedText variant="captionBold" color={theme.colors.textSecondary} style={styles.fieldLabel}>
                Clinical Remarks (Optional)
              </ThemedText>
              <TextInput
                style={[styles.textInput, styles.textArea]}
                placeholder="Tolerance noted, patient monitored for 15 minutes post-vaccination..."
                placeholderTextColor={theme.colors.textMuted}
                multiline
                numberOfLines={2}
                value={remarks}
                onChangeText={setRemarks}
              />
            </View>

            {/* Auto-Discharge / Complete Visit Toggle */}
            <View style={styles.fieldSection}>
              <View style={styles.switchContainer}>
                <View style={{ flex: 1, paddingRight: theme.spacing.sm }}>
                  <ThemedText variant="captionBold" color={theme.colors.text}>
                    Complete & Discharge Visit?
                  </ThemedText>
                  <ThemedText variant="caption" color={theme.colors.textSecondary}>
                    Automatically mark queue visit as completed and discharged
                  </ThemedText>
                </View>
                <Pressable
                  testID="complete-visit-toggle"
                  style={[styles.toggleBtn, completeVisit && styles.toggleBtnActive]}
                  onPress={() => setCompleteVisit(!completeVisit)}
                >
                  <ThemedText
                    variant="captionBold"
                    color={completeVisit ? theme.colors.onPrimary : theme.colors.textSecondary}
                  >
                    {completeVisit ? 'Yes' : 'No'}
                  </ThemedText>
                </Pressable>
              </View>
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
              title={submitting ? 'Recording Administration...' : 'Administer Vaccine'}
              variant="primary"
              icon="checkCircle"
              onPress={handleAdminister}
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
  toggleBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  toggleBtnActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
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

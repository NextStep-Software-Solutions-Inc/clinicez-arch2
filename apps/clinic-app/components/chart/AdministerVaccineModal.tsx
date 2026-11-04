import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
} from 'react-native';
import { theme } from '../../constants/theme';
import {
  ThemedText,
  Button,
  Icon,
  ValidatedDateInput,
  validateDateString,
  Modal,
  SkeletonList,
  ErrorState,
} from '../ui';
import { notify } from '../../utils/feedback';
import { useStaff } from '../../context/StaffContext';
import {
  CUSTOM_VACCINE_CODE,
  useImmunizationCohorts,
  useCohortVaccines,
  useImmunizationAdministrationOptions,
  doesVaccineRouteRequireInjectionSite,
  inferPreferredVaccineRoute,
  resolveInitialVaccineCohort,
  resolveVaccineSelection,
  type BackendVaccineOption,
  type VaccineCohortKey,
} from './immunizationCatalog';
import type {
  ClinicPatient,
  PatientDemographics,
  AdministerVaccinePayload,
} from '../../services/clinicService';

export {
  CUSTOM_VACCINE_CODE,
  doesVaccineRouteRequireInjectionSite,
  inferPreferredVaccineRoute,
  resolveInitialVaccineCohort,
  resolveVaccineSelection,
  type VaccineCohortKey,
};

export interface AdministerVaccineModalProps {
  visible: boolean;
  onClose: () => void;
  patient?: ClinicPatient | null;
  patientId?: string;
  demographics?: PatientDemographics | null;
  preferredCohort?: VaccineCohortKey;
  queueItemId?: string | null;
  onAdministerVaccine: (payload: AdministerVaccinePayload) => Promise<void>;
  onSuccess?: () => void;
}

export default function AdministerVaccineModal({
  visible,
  onClose,
  patient,
  demographics,
  preferredCohort,
  queueItemId,
  onAdministerVaccine,
  onSuccess,
}: AdministerVaccineModalProps) {
  const { current: currentStaff, currentName } = useStaff();

  const initialCohort = resolveInitialVaccineCohort(demographics, patient, preferredCohort);
  const [selectedCohort, setSelectedCohort] = useState<VaccineCohortKey>(initialCohort);

  const { cohorts } = useImmunizationCohorts(visible);
  const {
    vaccines: currentVaccineList,
    loading: vaccinesLoading,
    errorMessage: vaccinesError,
    reload: reloadVaccines,
  } = useCohortVaccines(selectedCohort, visible);
  const {
    routes: availableRoutes,
    injectionSites: availableSites,
    routeDescriptors,
  } = useImmunizationAdministrationOptions(visible);

  const [selectedVaccineCode, setSelectedVaccineCode] = useState<string>(
    () => currentVaccineList[0]?.code ?? ''
  );
  const [customVaccineName, setCustomVaccineName] = useState('');
  const [lotBatchNumber, setLotBatchNumber] = useState('');
  const [expirationDate, setExpirationDate] = useState('');
  const [doseSequence, setDoseSequence] = useState('1');
  const [isSeriesCompleted, setIsSeriesCompleted] = useState(false);
  const [route, setRoute] = useState<string>(() => availableRoutes[0] ?? '');
  const [injectionSite, setInjectionSite] = useState<string>(() => availableSites[0] ?? '');
  const [brandName, setBrandName] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [staffName, setStaffName] = useState('');
  const [prcLicense, setPrcLicense] = useState('');
  const [remarks, setRemarks] = useState('');
  const [completeVisit, setCompleteVisit] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      const cohort = resolveInitialVaccineCohort(demographics, patient, preferredCohort);
      setSelectedCohort(cohort);
      setSelectedVaccineCode('');
      setCustomVaccineName('');
      setLotBatchNumber('');
      setExpirationDate('');
      setDoseSequence('1');
      setIsSeriesCompleted(false);
      setRoute(availableRoutes[0] ?? '');
      setInjectionSite(availableSites[0] ?? '');
      setBrandName('');
      setManufacturer('');
      setStaffName(currentName || '');
      setPrcLicense(currentStaff?.prcLicenseNumber || '');
      setRemarks('');
      setCompleteVisit(false);
      setValidationError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, currentName, currentStaff, demographics, patient, preferredCohort]);

  useEffect(() => {
    if (selectedVaccineCode === CUSTOM_VACCINE_CODE) return;
    if (currentVaccineList.length > 0) {
      const exists = currentVaccineList.some((v) => v.code === selectedVaccineCode);
      if (!exists) {
        const firstVac = currentVaccineList[0];
        setSelectedVaccineCode(firstVac.code);
        const preferred = inferPreferredVaccineRoute(
          firstVac.code,
          firstVac.name,
          availableRoutes,
          routeDescriptors
        );
        if (preferred) {
          setRoute(preferred);
          if (!doesVaccineRouteRequireInjectionSite(preferred, routeDescriptors)) {
            setInjectionSite('');
          } else if (!injectionSite && availableSites.length > 0) {
            setInjectionSite(availableSites[0]);
          }
        }
      }
    }
  }, [currentVaccineList, selectedVaccineCode, availableRoutes, availableSites, routeDescriptors, injectionSite]);

  useEffect(() => {
    if (!route && availableRoutes.length > 0) {
      setRoute(availableRoutes[0]);
    }
  }, [availableRoutes, route]);

  useEffect(() => {
    const activeRoute = route || availableRoutes[0] || '';
    const needsSite = doesVaccineRouteRequireInjectionSite(activeRoute, routeDescriptors);
    if (!needsSite) {
      if (injectionSite) setInjectionSite('');
      return;
    }
    if (!injectionSite && availableSites.length > 0) {
      setInjectionSite(availableSites[0]);
    }
  }, [availableSites, availableRoutes, routeDescriptors, route, injectionSite]);

  const handleCohortChange = (cohort: VaccineCohortKey) => {
    setSelectedCohort(cohort);
    setSelectedVaccineCode('');
    setValidationError(null);
  };

  const handleSelectVaccine = (vac: BackendVaccineOption) => {
    setSelectedVaccineCode(vac.code);
    const preferred = inferPreferredVaccineRoute(
      vac.code,
      vac.name,
      availableRoutes,
      routeDescriptors
    );
    if (preferred) {
      setRoute(preferred);
      if (!doesVaccineRouteRequireInjectionSite(preferred, routeDescriptors)) {
        setInjectionSite('');
      } else if (!injectionSite && availableSites.length > 0) {
        setInjectionSite(availableSites[0]);
      }
    }
  };

  const handleSelectRoute = (nextRoute: string) => {
    setRoute(nextRoute);
    if (!doesVaccineRouteRequireInjectionSite(nextRoute, routeDescriptors)) {
      setInjectionSite('');
    } else if (!injectionSite && availableSites.length > 0) {
      setInjectionSite(availableSites[0]);
    }
  };

  const isCustomVaccine = selectedVaccineCode === CUSTOM_VACCINE_CODE;
  const effectiveSelectedVaccineCode = isCustomVaccine
    ? CUSTOM_VACCINE_CODE
    : currentVaccineList.some((v) => v.code === selectedVaccineCode)
      ? selectedVaccineCode
      : (currentVaccineList[0]?.code ?? '');

  const effectiveRoute = route || availableRoutes[0] || '';
  const requiresInjectionSite = doesVaccineRouteRequireInjectionSite(effectiveRoute, routeDescriptors);
  const effectiveSite = requiresInjectionSite ? (injectionSite || availableSites[0] || '') : '';

  const handleToggleCustomMode = () => {
    if (isCustomVaccine) {
      setSelectedVaccineCode(currentVaccineList[0]?.code ?? '');
    } else {
      setSelectedVaccineCode(CUSTOM_VACCINE_CODE);
    }
    setValidationError(null);
  };

  const handleAdminister = async () => {
    setValidationError(null);

    const resolvedSelection = resolveVaccineSelection({
      cohort: selectedCohort,
      vaccineCode: effectiveSelectedVaccineCode,
      customVaccineName,
      availableVaccines: currentVaccineList,
    });
    if (!resolvedSelection.valid) {
      setValidationError(resolvedSelection.error);
      notify.error(resolvedSelection.error);
      return;
    }

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

    if (!effectiveRoute.trim()) {
      setValidationError('Administration route is required.');
      notify.error('Administration route is required.');
      return;
    }

    if (requiresInjectionSite && !effectiveSite.trim()) {
      setValidationError('Injection site is required.');
      notify.error('Injection site is required.');
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
        philHealthLibrary: resolvedSelection.philHealthLibrary,
        philHealthCode: resolvedSelection.philHealthCode,
        vaccineName: resolvedSelection.vaccineName,
        brandName: brandName.trim() || undefined,
        manufacturer: manufacturer.trim() || undefined,
        lotBatchNumber: lotBatchNumber.trim(),
        expirationDate: expValidation.formattedDate,
        doseSequence: seqNum,
        isSeriesCompleted,
        route: effectiveRoute.trim(),
        injectionSite: requiresInjectionSite ? effectiveSite.trim() : 'Not Applicable',
        administeredAtUtc: new Date().toISOString(),
        administeredByStaffId: isValidGuid(currentStaff?.id)
          ? currentStaff!.id
          : (currentStaff?.id || '00000000-0000-0000-0000-000000000000'),
        administeredByStaffName: adminName,
        administeredByPrcLicense: prcLicense.trim() || undefined,
        remarks: remarks.trim() || undefined,
        queueItemId: queueItemId || undefined,
        completeVisit,
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
    <Modal
      visible={visible}
      onClose={onClose}
      title="Administer Vaccine"
      subtitle="Document In-Clinic Administration"
      maxWidth={640}
      maxHeight="90%"
      footer={
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
      }
    >
      {/* Validation Banner */}
      {validationError ? (
        <View style={styles.errorBanner}>
          <Icon name="alertCircle" size={theme.sizes.iconSm} color={theme.colors.emergencyText} />
          <ThemedText variant="captionBold" color={theme.colors.emergencyText} style={styles.flex1}>
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
          {cohorts.map((c) => (
            <Pressable
              key={c.key}
              onPress={() => handleCohortChange(c.key)}
              style={[styles.cohortChip, selectedCohort === c.key && styles.cohortChip_active]}
            >
              <ThemedText
                variant="captionBold"
                color={selectedCohort === c.key ? theme.colors.onPrimary : theme.colors.textSecondary}
              >
                {c.modalLabel}
              </ThemedText>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Vaccine Selection + Custom Unlisted Entry */}
      <View style={styles.fieldSection}>
        <View style={styles.sectionHeaderRow}>
          <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
            2. Select Vaccine ({vaccinesLoading && currentVaccineList.length === 0 ? 'Loading...' : `${currentVaccineList.length} available`}) *
          </ThemedText>
          <Pressable
            testID="toggle-custom-vaccine-btn"
            accessibilityRole="button"
            onPress={handleToggleCustomMode}
            style={[styles.customVaccinePill, isCustomVaccine && styles.customVaccinePillActive]}
          >
            <Icon
              name={isCustomVaccine ? 'list' : 'plus'}
              size={theme.sizes.iconSm}
              color={isCustomVaccine ? theme.colors.primaryDark : theme.colors.primary}
            />
            <ThemedText
              variant="captionBold"
              color={isCustomVaccine ? theme.colors.primaryDark : theme.colors.primary}
            >
              {isCustomVaccine ? 'Choose from Category List' : 'Custom / Unlisted Vaccine'}
            </ThemedText>
          </Pressable>
        </View>

        {isCustomVaccine ? (
          <View style={styles.customVaccineBox}>
            <ThemedText variant="captionBold" color={theme.colors.textSecondary} style={styles.fieldLabel}>
              Vaccine Name (Not in Category List) *
            </ThemedText>
            <TextInput
              testID="custom-vaccine-name-input"
              style={styles.textInput}
              placeholder="Enter vaccine name..."
              placeholderTextColor={theme.colors.textMuted}
              maxLength={150}
              value={customVaccineName}
              onChangeText={setCustomVaccineName}
            />
            <ThemedText variant="caption" color={theme.colors.textMuted}>
              Recorded under Adult / Other immunizations on the patient chart.
            </ThemedText>
          </View>
        ) : vaccinesLoading && currentVaccineList.length === 0 ? (
          <View style={styles.loadingBox}>
            <SkeletonList rows={3} rowHeight={theme.sizes.controlMd} />
          </View>
        ) : vaccinesError && currentVaccineList.length === 0 ? (
          <ErrorState
            compact
            title="Unable to load vaccines"
            message={vaccinesError}
            onRetry={reloadVaccines}
          />
        ) : currentVaccineList.length === 0 ? (
          <View style={styles.emptyVaccineBox}>
            <ThemedText variant="caption" color={theme.colors.textSecondary}>
              No catalog vaccines returned for this category. Use Custom / Unlisted Vaccine to specify a vaccine name.
            </ThemedText>
            <Pressable
              onPress={() => setSelectedVaccineCode(CUSTOM_VACCINE_CODE)}
              style={styles.vaccineItemCustomRow}
            >
              <Icon name="plus" size={theme.sizes.iconSm} color={theme.colors.primary} />
              <ThemedText variant="captionBold" color={theme.colors.primary} style={styles.flex1}>
                Other / Unlisted Vaccine (Specify name)
              </ThemedText>
            </Pressable>
          </View>
        ) : (
          <View style={styles.vaccineListContainer}>
            <ScrollView
              style={styles.vaccineListScroll}
              contentContainerStyle={styles.vaccineListContent}
              nestedScrollEnabled={true}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={true}
            >
              {currentVaccineList.map((vac) => {
                const isSelected = effectiveSelectedVaccineCode === vac.code;
                return (
                  <Pressable
                    key={vac.code}
                    onPress={() => handleSelectVaccine(vac)}
                    style={[styles.vaccineItem, isSelected && styles.vaccineItem_active]}
                  >
                    {isSelected ? (
                      <Icon name="check" size={theme.sizes.iconSm} color={theme.colors.primaryDark} />
                    ) : (
                      <View style={styles.checkSpacer} />
                    )}
                    <ThemedText
                      variant="captionBold"
                      color={isSelected ? theme.colors.primaryDark : theme.colors.text}
                      style={styles.flex1}
                    >
                      {vac.name}
                    </ThemedText>
                  </Pressable>
                );
              })}

              <Pressable
                onPress={() => setSelectedVaccineCode(CUSTOM_VACCINE_CODE)}
                style={styles.vaccineItemCustomRow}
              >
                <Icon name="plus" size={theme.sizes.iconSm} color={theme.colors.primary} />
                <ThemedText variant="captionBold" color={theme.colors.primary} style={styles.flex1}>
                  Other / Unlisted Vaccine (Specify name)
                </ThemedText>
              </Pressable>
            </ScrollView>
          </View>
        )}
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
            placeholder="Manufacturer brand name"
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
            placeholder="Vaccine manufacturer"
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
          <View style={styles.flex1}>
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
        {availableRoutes.length > 0 ? (
          <View style={styles.chipRow}>
            {availableRoutes.map((r) => (
              <Pressable
                key={r}
                onPress={() => handleSelectRoute(r)}
                style={[styles.smallChip, effectiveRoute === r && styles.smallChip_active]}
              >
                <ThemedText
                  variant="caption"
                  color={effectiveRoute === r ? theme.colors.onPrimary : theme.colors.text}
                >
                  {r}
                </ThemedText>
              </Pressable>
            ))}
          </View>
        ) : (
          <TextInput
            style={styles.textInput}
            placeholder="Enter administration route"
            placeholderTextColor={theme.colors.textMuted}
            value={route}
            onChangeText={handleSelectRoute}
          />
        )}
      </View>

      {requiresInjectionSite ? (
        <View style={styles.fieldSection}>
          <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
            Injection Site *
          </ThemedText>
          {availableSites.length > 0 ? (
            <View style={styles.chipRow}>
              {availableSites.map((s) => (
                <Pressable
                  key={s}
                  onPress={() => setInjectionSite(s)}
                  style={[styles.smallChip, effectiveSite === s && styles.smallChip_active]}
                >
                  <ThemedText
                    variant="caption"
                    color={effectiveSite === s ? theme.colors.onPrimary : theme.colors.text}
                  >
                    {s}
                  </ThemedText>
                </Pressable>
              ))}
            </View>
          ) : (
            <TextInput
              style={styles.textInput}
              placeholder="Enter anatomical injection site"
              placeholderTextColor={theme.colors.textMuted}
              value={injectionSite}
              onChangeText={setInjectionSite}
            />
          )}
        </View>
      ) : null}

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
          <View style={styles.switchTextWrap}>
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
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex1: {
    flex: 1,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.emergencyBg,
    borderColor: theme.colors.emergencyBorder,
    borderWidth: theme.sizes.borderWidth,
    borderRadius: theme.radii.md,
    padding: theme.spacing.md,
  },
  fieldSection: {
    gap: theme.spacing.sm,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  fieldLabel: {
    marginBottom: theme.spacing.xs,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  cohortChip: {
    paddingVertical: theme.spacing.xs + 2,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radii.full,
    backgroundColor: theme.colors.surfaceSubtle,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.borderLight,
  },
  cohortChip_active: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  customVaccinePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm + 2,
    borderRadius: theme.radii.full,
    backgroundColor: theme.colors.primarySubtle,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.primaryBorder,
  },
  customVaccinePillActive: {
    backgroundColor: theme.colors.primaryLight,
    borderColor: theme.colors.primary,
  },
  customVaccineBox: {
    padding: theme.spacing.md,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surfaceSubtle,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.primaryBorder,
    gap: theme.spacing.xs,
  },
  loadingBox: {
    padding: theme.spacing.sm,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surfaceSubtle,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.borderLight,
  },
  emptyVaccineBox: {
    padding: theme.spacing.md,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surfaceSubtle,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.borderLight,
    gap: theme.spacing.sm,
  },
  smallChip: {
    paddingVertical: theme.spacing.xs + 2,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surfaceSubtle,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.borderLight,
  },
  smallChip_active: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  vaccineListContainer: {
    maxHeight: 192,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.borderLight,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surfaceSubtle,
    overflow: 'hidden',
  },
  vaccineListScroll: {
    maxHeight: 192,
  },
  vaccineListContent: {
    flexGrow: 0,
  },
  vaccineItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderBottomWidth: theme.sizes.borderWidth,
    borderBottomColor: theme.colors.borderLight,
  },
  vaccineItem_active: {
    backgroundColor: theme.colors.primarySubtle,
  },
  vaccineItemCustomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    backgroundColor: theme.colors.surface,
  },
  checkSpacer: {
    width: theme.sizes.iconSm,
  },
  twoColumnRow: {
    flexDirection: 'row',
    gap: theme.spacing.lg,
  },
  halfCol: {
    flex: 1,
    minWidth: 0,
  },
  textInput: {
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.borderDark,
    borderRadius: theme.radii.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    fontSize: theme.fontSizes.sm,
    color: theme.colors.text,
    backgroundColor: theme.colors.surface,
    minHeight: theme.sizes.controlMd,
  },
  textArea: {
    minHeight: 64,
    textAlignVertical: 'top',
  },
  switchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.borderLight,
    gap: theme.spacing.sm,
  },
  switchTextWrap: {
    flex: 1,
    paddingRight: theme.spacing.sm,
  },
  toggleBtn: {
    paddingVertical: theme.spacing.xs + 2,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surface,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
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
  },
});

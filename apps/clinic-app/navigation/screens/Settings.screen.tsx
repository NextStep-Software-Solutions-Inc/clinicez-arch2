import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, ScrollView, Pressable, RefreshControl } from 'react-native';
import {
  ThemedText,
  Badge,
  Button,
  Input,
  Card,
  CardHeader,
  CardContent,
  Icon,
  Modal,
  EmptyState,
  ErrorState,
  SkeletonList,
  StatCard,
} from '@ui';
import type { BadgeVariant } from '@ui';
import { ResponsiveLayout } from '@layout';
import { theme } from '@constants/theme';
import { Alert, notify } from '@utils/feedback';
import { useFacilityLicense } from '../../components/FacilityActivationGate';
import { BulkStudentImportModal } from '../../components/BulkStudentImportModal';
import { useClinic } from '../../context/ClinicContext';
import { useStaff } from '../../context/StaffContext';
import { usePermission } from '../../context/AuthContext';
import { PERMISSIONS } from '../../constants/permissions';
import StaffAccessModal from '../../components/settings/StaffAccessModal';
import SecuritySection from '../../components/settings/SecuritySection';
import {
  clinicService,
  DailyEodReport,
  ClinicSettingsRecord,
  StaffMember,
  StaffRole,
  ClinicCustomFieldDefinition,
  ClinicServiceItem,
} from '../../services/clinicService';
import PhilHealthCatalogMappingModal, {
  CatalogMappingResult,
} from '../../components/PhilHealthCatalogMappingModal';
import CsvCatalogImportModal from '../../components/CsvCatalogImportModal';

const formatPeso = (amount: number | undefined | null) =>
  `₱${(amount ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;

/** Selectable pill used for category filters and single-choice form options. */
function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[styles.chip, active && styles.chipActive]}
    >
      <ThemedText variant={active ? 'smallBold' : 'small'} color={active ? theme.colors.primary : theme.colors.textSecondary}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

function InfoRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <View style={styles.infoRow}>
      <ThemedText variant="small" color={theme.colors.textSecondary}>
        {label}
      </ThemedText>
      <ThemedText variant="smallBold" color={valueColor}>
        {value}
      </ThemedText>
    </View>
  );
}

function FormError({ message }: { message: string }) {
  return (
    <View style={styles.formError}>
      <Icon name="alertCircle" size={theme.sizes.iconSm} color={theme.colors.emergencyText} />
      <ThemedText variant="small" color={theme.colors.emergencyText} style={styles.flex}>
        {message}
      </ThemedText>
    </View>
  );
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.fieldGroup}>
      <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
        {label}
      </ThemedText>
      {children}
    </View>
  );
}

const FIELD_TYPE_BADGE: Record<ClinicCustomFieldDefinition['dataType'], BadgeVariant> = {
  Text: 'primary',
  Number: 'warning',
  Date: 'info',
  Select: 'purple',
  Boolean: 'neutral',
};

const FIELD_CATEGORY_LABEL: Record<string, string> = {
  All: 'All fields',
  Student: 'Students',
  Employee: 'Employees',
  General: 'General',
};

const SERVICE_CATEGORY_LABEL: Record<string, string> = {
  All: 'All services',
  Medicine: 'Medicines',
  Diagnostic: 'Diagnostics',
  Procedure: 'Procedures',
  Consultation: 'Consultations',
  NursingService: 'Nursing',
};

const LICENSE_STATUS: Record<string, { label: string; variant: BadgeVariant }> = {
  Active: { label: 'Active', variant: 'success' },
  ActivationRequired: { label: 'Activation required', variant: 'warning' },
  Expired: { label: 'Expired', variant: 'emergency' },
  Tampered: { label: 'Verification failed', variant: 'emergency' },
};

export default function SettingsScreen() {
  const { license, openActivationModal, refreshLicense } = useFacilityLicense();
  const { refresh: refreshClinic } = useClinic();
  const { reload: reloadStaffContext } = useStaff();
  const canManageStaff = usePermission(PERMISSIONS.staffManage);
  const [accessStaff, setAccessStaff] = useState<StaffMember | null>(null);

  const [eodReport, setEodReport] = useState<DailyEodReport | null>(null);
  const [settings, setSettings] = useState<ClinicSettingsRecord | null>(null);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  // Per-section load errors, shown with a Retry instead of fabricated data.
  const [eodLoadError, setEodLoadError] = useState<string | null>(null);
  const [settingsLoadError, setSettingsLoadError] = useState<string | null>(null);
  const [staffLoadError, setStaffLoadError] = useState<string | null>(null);
  const [fieldsLoadError, setFieldsLoadError] = useState<string | null>(null);
  const [servicesLoadError, setServicesLoadError] = useState<string | null>(null);

  // Staff creation modal states
  const [showAddStaffModal, setShowAddStaffModal] = useState(false);
  const [newStaffFirstName, setNewStaffFirstName] = useState('');
  const [newStaffLastName, setNewStaffLastName] = useState('');
  const [newStaffTitle, setNewStaffTitle] = useState('');
  const [newStaffRole, setNewStaffRole] = useState<StaffRole>('Doctor');
  const [newStaffPrc, setNewStaffPrc] = useState('');
  const [newStaffSpecialty, setNewStaffSpecialty] = useState('');
  const [newStaffEmail, setNewStaffEmail] = useState('');
  const [addingStaff, setAddingStaff] = useState(false);
  const [staffError, setStaffError] = useState<string | null>(null);

  // Tenant Custom Field Builder states
  const [customFields, setCustomFields] = useState<ClinicCustomFieldDefinition[]>([]);
  const [selectedFieldCategory, setSelectedFieldCategory] = useState<'All' | 'Student' | 'Employee' | 'General'>('All');
  const [showAddFieldModal, setShowAddFieldModal] = useState(false);
  const [showBulkImportModal, setShowBulkImportModal] = useState(false);
  const [newFieldLabel, setNewFieldLabel] = useState('');
  const [newFieldKey, setNewFieldKey] = useState('');
  const [newFieldCategory, setNewFieldCategory] = useState<'Student' | 'Employee' | 'General'>('Student');
  const [newFieldDataType, setNewFieldDataType] = useState<'Text' | 'Number' | 'Date' | 'Select' | 'Boolean'>('Text');
  const [newFieldPlaceholder, setNewFieldPlaceholder] = useState('');
  const [newFieldOptions, setNewFieldOptions] = useState('');
  const [newFieldRequired, setNewFieldRequired] = useState(false);
  const [savingField, setSavingField] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  // Services & Formulary Catalog State
  const [services, setServices] = useState<ClinicServiceItem[]>([]);
  const [selectedServiceCategory, setSelectedServiceCategory] = useState<string>('All');
  const [showAddServiceModal, setShowAddServiceModal] = useState(false);
  const [showCsvCatalogImportModal, setShowCsvCatalogImportModal] = useState(false);
  const [showPhilHealthMappingModal, setShowPhilHealthMappingModal] = useState(false);

  // New Service Form State
  const [newServiceCode, setNewServiceCode] = useState('');
  const [newServiceName, setNewServiceName] = useState('');
  const [newServiceCategory, setNewServiceCategory] = useState<string>('Medicine');
  const [newServicePrice, setNewServicePrice] = useState('');
  const [newServiceDesc, setNewServiceDesc] = useState('');
  const [newServicePhilHealthCode, setNewServicePhilHealthCode] = useState<string | undefined>(undefined);
  const [newServicePhilHealthDesc, setNewServicePhilHealthDesc] = useState<string | undefined>(undefined);
  const [newServiceIsFormulary, setNewServiceIsFormulary] = useState(false);
  const [savingService, setSavingService] = useState(false);
  const [serviceError, setServiceError] = useState<string | null>(null);

  // Target item for inline PhilHealth mapping edit
  const [mappingTargetItem, setMappingTargetItem] = useState<ClinicServiceItem | null>(null);

  // Form states for preferences. Start empty and are filled from the saved clinic settings.
  const [clinicName, setClinicName] = useState('');
  const [accreditationNumber, setAccreditationNumber] = useState('');
  const [operatingHours, setOperatingHours] = useState('');
  const [slotDuration, setSlotDuration] = useState('');
  const [consultationFee, setConsultationFee] = useState('');
  const [letterheadHeader, setLetterheadHeader] = useState('');
  const [letterheadAddress, setLetterheadAddress] = useState('');
  const [letterheadContact, setLetterheadContact] = useState('');

  const loadAll = useCallback(async () => {
    const [
      [eodData, eodErr],
      [settingsData, settingsErr],
      [staffData, staffErr],
      [customFieldsData, fieldsErr],
      [servicesData, servicesErr],
    ] = await Promise.all([
      clinicService.getDailyEodReport(),
      clinicService.getSettings(),
      clinicService.getStaff(),
      clinicService.getCustomFields('ClinicPatient'),
      clinicService.getServices(),
    ]);

    setEodLoadError(eodErr ? eodErr.message || 'Unable to load today\'s collections.' : null);
    if (!eodErr) setEodReport(eodData ?? null);

    setSettingsLoadError(settingsErr ? settingsErr.message || 'Unable to load clinic settings.' : null);
    if (settingsData) {
      setSettings(settingsData);
      setClinicName(settingsData.clinicName ?? '');
      setAccreditationNumber(settingsData.accreditationNumber ?? '');
      setOperatingHours(settingsData.operatingHours ?? '');
      setSlotDuration(
        settingsData.defaultSlotDurationMinutes != null ? String(settingsData.defaultSlotDurationMinutes) : ''
      );
      setConsultationFee(
        settingsData.defaultConsultationFee != null ? String(settingsData.defaultConsultationFee) : ''
      );
      setLetterheadHeader(settingsData.letterheadHeader ?? '');
      setLetterheadAddress(settingsData.letterheadAddress ?? '');
      setLetterheadContact(settingsData.letterheadContact ?? '');
    }

    setStaffLoadError(staffErr ? staffErr.message || 'Unable to load staff.' : null);
    if (!staffErr) setStaff(staffData ?? []);

    setFieldsLoadError(fieldsErr ? fieldsErr.message || 'Unable to load custom fields.' : null);
    if (!fieldsErr) setCustomFields(customFieldsData ?? []);

    setServicesLoadError(servicesErr ? servicesErr.message || 'Unable to load the service catalog.' : null);
    if (!servicesErr) setServices(servicesData ?? []);
  }, []);

  useEffect(() => {
    setLoading(true);
    loadAll().finally(() => setLoading(false));
  }, [loadAll]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  }, [loadAll]);

  const retryAll = useCallback(async () => {
    setLoading(true);
    await loadAll();
    setLoading(false);
  }, [loadAll]);

  const handleSavePreferences = async () => {
    const slotMinutes = parseInt(slotDuration, 10);
    const fee = parseFloat(consultationFee);
    if (!clinicName.trim()) {
      Alert.alert('Facility name required', 'Enter the facility name before saving.');
      return;
    }
    if (!slotMinutes || slotMinutes <= 0) {
      Alert.alert('Check appointment slot', 'Enter the appointment slot length in minutes.');
      return;
    }
    if (isNaN(fee) || fee < 0) {
      Alert.alert('Check consultation fee', 'Enter the default consultation fee as a number.');
      return;
    }

    setSavingSettings(true);
    const [saved, err] = await clinicService.updateSettings({
      clinicName: clinicName.trim(),
      accreditationNumber: accreditationNumber.trim(),
      operatingHours: operatingHours.trim(),
      defaultSlotDurationMinutes: slotMinutes,
      defaultConsultationFee: fee,
      letterheadHeader: letterheadHeader.trim(),
      letterheadAddress: letterheadAddress.trim(),
      letterheadContact: letterheadContact.trim(),
    });
    setSavingSettings(false);

    if (err) {
      notify.error(err.message || 'Could not save settings.');
      return;
    }
    if (saved) setSettings(saved);
    notify.success('Settings saved.');
    await refreshClinic();
  };

  const maxStaffSeats = license?.limits?.maxStaff;
  const activeStaffCount = staff.filter((s) => s.isActive).length;
  const staffQuotaReached = maxStaffSeats != null && activeStaffCount >= maxStaffSeats;

  const handleOpenAddStaff = () => {
    if (staffQuotaReached) {
      Alert.alert(
        'Staff limit reached',
        `Your ${license?.planTier ?? 'current'} plan allows ${maxStaffSeats} active staff. Update the license key to add more.`
      );
      return;
    }
    setStaffError(null);
    setShowAddStaffModal(true);
  };

  const handleAddStaff = async () => {
    if (!newStaffFirstName.trim() || !newStaffLastName.trim()) {
      setStaffError('First and last name are required.');
      return;
    }

    setAddingStaff(true);
    setStaffError(null);

    const [created, err] = await clinicService.createStaff({
      firstName: newStaffFirstName.trim(),
      lastName: newStaffLastName.trim(),
      title: newStaffTitle.trim() || undefined,
      role: newStaffRole,
      prcLicenseNumber: newStaffPrc.trim() || undefined,
      specialty: newStaffSpecialty.trim() || undefined,
      email: newStaffEmail.trim() || undefined,
    });

    setAddingStaff(false);

    if (err) {
      setStaffError(err.message || 'Failed to add staff member. Quota limit may have been reached.');
      return;
    }

    if (created) {
      setStaff((prev) => [...prev, created]);
      setShowAddStaffModal(false);
      setNewStaffFirstName('');
      setNewStaffLastName('');
      setNewStaffTitle('');
      setNewStaffPrc('');
      setNewStaffSpecialty('');
      setNewStaffEmail('');
      await refreshLicense();
      await reloadStaffContext();
    }
  };

  const handleDeactivateStaff = async (staffId: string) => {
    const [, err] = await clinicService.deactivateStaff(staffId);
    if (err) {
      notify.error(err.message || 'Could not deactivate this staff member.');
      return;
    }
    setStaff((prev) => prev.filter((s) => s.id !== staffId));
    await refreshLicense();
    await reloadStaffContext();
  };

  const handleCreateCustomField = async () => {
    if (!newFieldLabel.trim()) {
      setFieldError('Field display label is required.');
      return;
    }
    const computedKey = (newFieldKey.trim() || newFieldLabel.trim()).toLowerCase().replace(/[^a-z0-9]/g, '_');
    setSavingField(true);
    setFieldError(null);

    const payload: Partial<ClinicCustomFieldDefinition> = {
      entityType: 'ClinicPatient',
      fieldKey: computedKey,
      label: newFieldLabel.trim(),
      category: newFieldCategory,
      dataType: newFieldDataType,
      isRequired: newFieldRequired,
      displayOrder: customFields.length + 1,
      placeholder: newFieldPlaceholder.trim() || undefined,
      optionsJson: newFieldDataType === 'Select' && newFieldOptions.trim()
        ? JSON.stringify(newFieldOptions.split(',').map((s) => s.trim()).filter(Boolean))
        : undefined,
      isActive: true,
    };

    const [created, err] = await clinicService.createCustomField(payload);
    setSavingField(false);

    if (err || !created) {
      setFieldError(err?.message || 'Could not save the custom field. Please try again.');
      return;
    }

    setCustomFields((prev) => [...prev, created]);
    setShowAddFieldModal(false);
    setNewFieldLabel('');
    setNewFieldKey('');
    setNewFieldPlaceholder('');
    setNewFieldOptions('');
    setNewFieldRequired(false);
  };

  const handleDeleteCustomField = async (fieldId: string) => {
    const [, err] = await clinicService.deleteCustomField(fieldId);
    if (err) {
      notify.error(err.message || 'Could not delete this field.');
      return;
    }
    setCustomFields((prev) => prev.filter((f) => f.id !== fieldId));
  };

  // Service Catalog Actions
  const handleOpenAddService = () => {
    setNewServiceCode('');
    setNewServiceName('');
    setNewServiceCategory('Medicine');
    setNewServicePrice('');
    setNewServiceDesc('');
    setNewServicePhilHealthCode(undefined);
    setNewServicePhilHealthDesc(undefined);
    setNewServiceIsFormulary(false);
    setServiceError(null);
    setShowAddServiceModal(true);
  };

  const handleInitiateSaveService = () => {
    if (!newServiceCode.trim() || !newServiceName.trim()) {
      setServiceError('Item code and name are required.');
      return;
    }
    const priceVal = parseFloat(newServicePrice);
    if (isNaN(priceVal) || priceVal < 0) {
      setServiceError('Please enter a valid non-negative standard price.');
      return;
    }

    const isClinical = newServiceCategory === 'Medicine' || newServiceCategory === 'Diagnostic';
    // If clinical item and not yet mapped to PhilHealth, intercept with PhilHealth mapping modal!
    if (isClinical && !newServicePhilHealthCode && !newServiceIsFormulary) {
      setShowPhilHealthMappingModal(true);
      return;
    }

    // Otherwise directly execute save
    executeCreateService(newServicePhilHealthCode, newServicePhilHealthDesc, newServiceIsFormulary);
  };

  const executeCreateService = async (
    philHealthCode?: string,
    philHealthDesc?: string,
    isFormulary?: boolean
  ) => {
    try {
      setSavingService(true);
      setServiceError(null);

      const [res, err] = await clinicService.createService({
        code: newServiceCode.trim().toUpperCase(),
        name: newServiceName.trim(),
        category: newServiceCategory,
        standardPrice: parseFloat(newServicePrice) || 0,
        description: newServiceDesc.trim() || undefined,
        philHealthCode,
        philHealthDescription: philHealthDesc,
        isPhilHealthFormulary: isFormulary ?? false,
      });

      if (res) {
        setServices((prev) => [...prev, res]);
        setShowAddServiceModal(false);
        setShowPhilHealthMappingModal(false);
      } else {
        setServiceError(err?.message || 'Failed to create service item.');
      }
    } catch (e: any) {
      setServiceError(e.message || 'Error saving service item.');
    } finally {
      setSavingService(false);
    }
  };

  const handlePhilHealthMappingConfirmed = async (mapping: CatalogMappingResult) => {
    if (mappingTargetItem) {
      // Editing mapping on an existing item
      const [updated] = await clinicService.updateService(mappingTargetItem.id, {
        name: mappingTargetItem.name,
        category: mappingTargetItem.category,
        standardPrice: mappingTargetItem.standardPrice,
        description: mappingTargetItem.description,
        isActive: mappingTargetItem.isActive,
        philHealthCode: mapping.code,
        philHealthDescription: mapping.description,
        isPhilHealthFormulary: !mapping.isNonFormulary,
      });

      if (updated) {
        setServices((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
      }
      setMappingTargetItem(null);
    } else {
      // Mapping for new service item being created
      setNewServicePhilHealthCode(mapping.code);
      setNewServicePhilHealthDesc(mapping.description);
      setNewServiceIsFormulary(!mapping.isNonFormulary);
      setShowPhilHealthMappingModal(false);
      await executeCreateService(mapping.code, mapping.description, !mapping.isNonFormulary);
    }
  };

  const handleToggleServiceActive = async (item: ClinicServiceItem) => {
    const nextActive = !item.isActive;
    const [updated] = await clinicService.updateService(item.id, {
      name: item.name,
      category: item.category,
      standardPrice: item.standardPrice,
      description: item.description,
      isActive: nextActive,
      philHealthCode: item.philHealthCode,
      philHealthDescription: item.philHealthDescription,
      isPhilHealthFormulary: item.isPhilHealthFormulary,
    });

    if (updated) {
      setServices((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    }
  };

  const isClinicalCategory = (category: string) =>
    category.toLowerCase() === 'medicine' || category.toLowerCase() === 'diagnostic';

  const visibleFields = customFields.filter(
    (f) => selectedFieldCategory === 'All' || f.category === selectedFieldCategory
  );
  const visibleServices = services.filter(
    (s) => selectedServiceCategory === 'All' || s.category.toLowerCase() === selectedServiceCategory.toLowerCase()
  );

  const showSkeletons = loading && !refreshing;
  const licenseStatus = license ? LICENSE_STATUS[license.status] ?? { label: license.status, variant: 'neutral' as BadgeVariant } : null;

  return (
    <ResponsiveLayout headerTitle="Settings">
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.colors.primary]} />}
      >
        {/* Today's collections */}
        <Card>
          <CardHeader
            title="Today's collections"
            subtitle="End-of-day census and cashier remittance"
            rightAction={<Button title="Refresh" icon="refresh" variant="ghost" size="sm" onPress={onRefresh} />}
          />
          <CardContent>
            {showSkeletons ? (
              <SkeletonList rows={3} />
            ) : eodLoadError ? (
              <ErrorState compact title="Could not load today's collections" message={eodLoadError} onRetry={onRefresh} />
            ) : eodReport ? (
              <>
                <View style={styles.statGrid}>
                  <StatCard
                    style={styles.statCell}
                    label="Cash in drawer"
                    value={formatPeso(eodReport.cashInDrawer)}
                    subtext="For bank deposit or handover"
                    icon="cash"
                  />
                  <StatCard
                    style={styles.statCell}
                    label="Total collections"
                    value={formatPeso(eodReport.totalAmountCollected)}
                    subtext={`Net: ${formatPeso(eodReport.totalNetAmount)}`}
                    icon="receipt"
                  />
                  <StatCard
                    style={styles.statCell}
                    label="Checked in"
                    value={eodReport.totalCheckedIn}
                    icon="patients"
                  />
                  <StatCard
                    style={styles.statCell}
                    label="Visits completed"
                    value={eodReport.totalCompletedVisits}
                    icon="checkCircle"
                  />
                  <StatCard
                    style={styles.statCell}
                    label="Senior / PWD discounts"
                    value={formatPeso(eodReport.totalDiscountsGiven)}
                    valueColor={theme.colors.warningText}
                    icon="tag"
                  />
                  <StatCard
                    style={styles.statCell}
                    label="PhilHealth covered"
                    value={formatPeso(eodReport.totalPhilHealthCovered)}
                    valueColor={theme.colors.successText}
                    icon="yakap"
                  />
                </View>

                {eodReport.collectionsByMethod && eodReport.collectionsByMethod.length > 0 && (
                  <View style={styles.subSection}>
                    <ThemedText variant="smallBold" color={theme.colors.textSecondary}>
                      Collections by payment method
                    </ThemedText>
                    {eodReport.collectionsByMethod.map((pm, idx) => (
                      <InfoRow
                        key={idx}
                        label={`${pm.method} (${pm.transactionCount} transactions)`}
                        value={formatPeso(pm.totalAmount)}
                      />
                    ))}
                  </View>
                )}
              </>
            ) : (
              <EmptyState
                icon="receipt"
                title="No collections recorded today"
                description="Totals appear here once payments are recorded."
              />
            )}
          </CardContent>
        </Card>

        {/* Clinic profile and letterhead */}
        <Card>
          <CardHeader
            title="Clinic profile and letterhead"
            subtitle="Shown on prescriptions, receipts and printed documents"
          />
          <CardContent>
            {showSkeletons ? (
              <SkeletonList rows={4} />
            ) : settingsLoadError && !settings ? (
              <ErrorState compact title="Could not load clinic settings" message={settingsLoadError} onRetry={retryAll} />
            ) : (
              <>
                <View style={styles.formRow}>
                  <Input
                    containerStyle={styles.flexWide}
                    label="Facility name"
                    value={clinicName}
                    onChangeText={setClinicName}
                    placeholder="Name as registered with the DOH"
                  />
                  <Input
                    containerStyle={styles.flexWide}
                    label="Accreditation number"
                    value={accreditationNumber}
                    onChangeText={setAccreditationNumber}
                    placeholder="DOH or PhilHealth accreditation no."
                  />
                </View>

                <View style={styles.formRow}>
                  <Input
                    containerStyle={styles.flexWide}
                    label="Operating hours"
                    value={operatingHours}
                    onChangeText={setOperatingHours}
                    placeholder="e.g. Mon-Sat 8:00 AM - 5:00 PM"
                  />
                  <Input
                    containerStyle={styles.flexNarrow}
                    label="Appointment slot (min)"
                    value={slotDuration}
                    onChangeText={setSlotDuration}
                    placeholder="e.g. 30"
                    keyboardType="numeric"
                  />
                  <Input
                    containerStyle={styles.flexNarrow}
                    label="Consultation fee (₱)"
                    value={consultationFee}
                    onChangeText={setConsultationFee}
                    placeholder="e.g. 500.00"
                    keyboardType="numeric"
                  />
                </View>

                <Input
                  label="Letterhead title"
                  value={letterheadHeader}
                  onChangeText={setLetterheadHeader}
                  placeholder="Clinic name as it should appear at the top of documents"
                />
                <Input
                  label="Address"
                  value={letterheadAddress}
                  onChangeText={setLetterheadAddress}
                  placeholder="Street, barangay, city, province"
                />
                <Input
                  label="Contact details"
                  value={letterheadContact}
                  onChangeText={setLetterheadContact}
                  placeholder="Phone numbers and email"
                />

                <View style={styles.actionsEnd}>
                  <Button title="Save changes" onPress={handleSavePreferences} loading={savingSettings} />
                </View>
              </>
            )}
          </CardContent>
        </Card>

        {/* Facility license */}
        <Card>
          <CardHeader
            title="Facility license"
            rightAction={
              <Button title="Update license key" icon="key" variant="outline" size="sm" onPress={openActivationModal} />
            }
          />
          <CardContent>
            {license ? (
              <>
                <View style={styles.licenseBadges}>
                  <Badge label={`${license.planTier} plan`} variant="primary" />
                  {licenseStatus ? <Badge label={licenseStatus.label} variant={licenseStatus.variant} /> : null}
                </View>
                <InfoRow label="Licensed facility" value={license.clinicName || clinicName || 'Not set'} />
                <InfoRow
                  label="Staff seats"
                  value={
                    maxStaffSeats != null
                      ? `${activeStaffCount} of ${maxStaffSeats} in use`
                      : `${activeStaffCount} active`
                  }
                  valueColor={theme.colors.primary}
                />
                {license.limits?.maxDailyEncounters != null && (
                  <InfoRow
                    label="Daily encounter limit"
                    value={
                      license.limits.maxDailyEncounters === 2147483647
                        ? 'Unlimited'
                        : `${license.limits.maxDailyEncounters} per day`
                    }
                  />
                )}
                {license.limits?.isOfflineCapable != null && (
                  <InfoRow
                    label="Offline mode"
                    value={license.limits.isOfflineCapable ? 'Available' : 'Not included'}
                    valueColor={license.limits.isOfflineCapable ? theme.colors.successText : undefined}
                  />
                )}
                {license.expiresAtUtc ? (
                  <InfoRow label="Expires" value={new Date(license.expiresAtUtc).toLocaleDateString()} />
                ) : null}
              </>
            ) : (
              <EmptyState
                icon="key"
                title="No license information"
                description="Enter a license key to activate this facility."
                actionTitle="Enter license key"
                onAction={openActivationModal}
              />
            )}
          </CardContent>
        </Card>

        {/* Staff roster */}
        <Card>
          <CardHeader
            title="Staff"
            subtitle={
              maxStaffSeats != null
                ? `${activeStaffCount} of ${maxStaffSeats} seats in use`
                : `${activeStaffCount} active`
            }
            rightAction={
              <Button
                title="Add staff"
                icon="plus"
                size="sm"
                variant={staffQuotaReached ? 'secondary' : 'primary'}
                onPress={handleOpenAddStaff}
              />
            }
          />
          <CardContent>
            {showSkeletons ? (
              <SkeletonList rows={3} />
            ) : staffLoadError ? (
              <ErrorState compact title="Could not load staff" message={staffLoadError} onRetry={retryAll} />
            ) : staff.length === 0 ? (
              <EmptyState
                icon="patients"
                title="No staff added yet"
                description="Add doctors, nurses and front-desk staff so they can sign in and be assigned to patients."
                actionTitle="Add staff"
                onAction={handleOpenAddStaff}
              />
            ) : (
              staff.map((s) => (
                <View key={s.id} style={styles.listItem}>
                  <View style={styles.flex}>
                    <View style={styles.itemTitleRow}>
                      <ThemedText variant="bodyBold">
                        {s.title ? `${s.title} ` : ''}
                        {s.firstName} {s.lastName}
                      </ThemedText>
                      <Badge label={s.role} variant={s.role === 'Doctor' ? 'primary' : 'neutral'} />
                    </View>
                    {s.specialty ? (
                      <ThemedText variant="caption" color={theme.colors.textMuted}>
                        {s.specialty}
                      </ThemedText>
                    ) : null}
                    {s.prcLicenseNumber ? (
                      <ThemedText variant="caption" color={theme.colors.textSecondary}>
                        PRC: {s.prcLicenseNumber}
                        {s.ptrNumber ? ` · PTR: ${s.ptrNumber}` : ''}
                        {s.s2LicenseNumber ? ` · PDEA S2: ${s.s2LicenseNumber}` : ''}
                      </ThemedText>
                    ) : null}
                  </View>
                  <View style={styles.itemTitleRow}>
                    {canManageStaff ? (
                      <Button title="Access" variant="secondary" size="sm" icon="key" onPress={() => setAccessStaff(s)} />
                    ) : null}
                    <Button title="Deactivate" variant="secondary" size="sm" onPress={() => handleDeactivateStaff(s.id)} />
                  </View>
                </View>
              ))
            )}
          </CardContent>
        </Card>

        <SecuritySection />

        {/* Patient custom fields */}
        <Card>
          <CardHeader
            title="Patient intake fields"
            subtitle="Extra details collected at registration for students, employees or other groups"
            rightAction={
              <View style={styles.headerActions}>
                <Button
                  title="Import students"
                  icon="upload"
                  variant="outline"
                  size="sm"
                  onPress={() => setShowBulkImportModal(true)}
                />
                <Button
                  title="Add field"
                  icon="plus"
                  size="sm"
                  onPress={() => {
                    setFieldError(null);
                    setShowAddFieldModal(true);
                  }}
                />
              </View>
            }
          />
          <CardContent>
            <View style={styles.chipRow}>
              {(['All', 'Student', 'Employee', 'General'] as const).map((cat) => (
                <Chip
                  key={cat}
                  label={FIELD_CATEGORY_LABEL[cat]}
                  active={selectedFieldCategory === cat}
                  onPress={() => setSelectedFieldCategory(cat)}
                />
              ))}
            </View>

            {showSkeletons ? (
              <SkeletonList rows={3} />
            ) : fieldsLoadError ? (
              <ErrorState compact title="Could not load custom fields" message={fieldsLoadError} onRetry={retryAll} />
            ) : visibleFields.length === 0 ? (
              <EmptyState
                icon="clipboard"
                title="No custom fields"
                description={
                  selectedFieldCategory === 'All'
                    ? 'Add a field to collect extra details at patient registration.'
                    : 'No fields in this category yet.'
                }
                actionTitle="Add field"
                onAction={() => {
                  setFieldError(null);
                  setShowAddFieldModal(true);
                }}
              />
            ) : (
              visibleFields.map((field) => {
                let options: string[] = [];
                if (field.optionsJson) {
                  try {
                    options = JSON.parse(field.optionsJson || '[]');
                  } catch {
                    options = [];
                  }
                }
                return (
                  <View key={field.id} style={styles.listItem}>
                    <View style={styles.flex}>
                      <View style={styles.itemTitleRow}>
                        <ThemedText variant="bodyBold">{field.label}</ThemedText>
                        <Badge label={field.fieldKey} variant="outline" />
                        <Badge label={field.dataType} variant={FIELD_TYPE_BADGE[field.dataType] ?? 'neutral'} />
                        <ThemedText
                          variant="captionBold"
                          color={field.isRequired ? theme.colors.emergencyText : theme.colors.textMuted}
                        >
                          {field.isRequired ? 'Required' : 'Optional'}
                        </ThemedText>
                      </View>
                      <ThemedText variant="caption" color={theme.colors.textMuted}>
                        Category: {field.category || 'General'}
                        {field.placeholder ? ` · Hint: "${field.placeholder}"` : ''}
                      </ThemedText>
                      {options.length > 0 ? (
                        <ThemedText variant="caption" color={theme.colors.textSecondary}>
                          Options: {options.join(', ')}
                        </ThemedText>
                      ) : null}
                    </View>
                    <Button title="Delete" variant="secondary" size="sm" onPress={() => handleDeleteCustomField(field.id)} />
                  </View>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* Services and formulary catalog */}
        <Card>
          <CardHeader
            title="Services and formulary catalog"
            subtitle="Fees, procedures, diagnostics and medicines, with PhilHealth code mapping"
            rightAction={
              <View style={styles.headerActions}>
                <Button
                  title="Import CSV"
                  icon="upload"
                  variant="outline"
                  size="sm"
                  onPress={() => setShowCsvCatalogImportModal(true)}
                />
                <Button title="Add item" icon="plus" size="sm" onPress={handleOpenAddService} />
              </View>
            }
          />
          <CardContent>
            <View style={styles.chipRow}>
              {(['All', 'Medicine', 'Diagnostic', 'Procedure', 'Consultation', 'NursingService'] as const).map((cat) => {
                const count =
                  cat === 'All'
                    ? services.length
                    : services.filter((s) => s.category.toLowerCase() === cat.toLowerCase()).length;
                return (
                  <Chip
                    key={cat}
                    label={`${SERVICE_CATEGORY_LABEL[cat]} (${count})`}
                    active={selectedServiceCategory === cat}
                    onPress={() => setSelectedServiceCategory(cat)}
                  />
                );
              })}
            </View>

            {showSkeletons ? (
              <SkeletonList rows={4} />
            ) : servicesLoadError ? (
              <ErrorState compact title="Could not load the catalog" message={servicesLoadError} onRetry={retryAll} />
            ) : visibleServices.length === 0 ? (
              <EmptyState
                icon="clipboard"
                title="No catalog items"
                description={
                  selectedServiceCategory === 'All'
                    ? 'Add services and medicines, or import them from a CSV file.'
                    : 'Nothing in this category yet.'
                }
                actionTitle="Add item"
                onAction={handleOpenAddService}
              />
            ) : (
              visibleServices.map((item) => {
                const isClinical = isClinicalCategory(item.category);
                return (
                  <View key={item.id} style={styles.listItem}>
                    <View style={styles.flex}>
                      <View style={styles.itemTitleRow}>
                        <ThemedText variant="bodyBold">{item.name}</ThemedText>
                        <Badge label={item.code} variant="outline" />
                        <Badge label={item.category} variant="neutral" />
                        <ThemedText variant="smallBold" color={theme.colors.successText}>
                          {formatPeso(item.standardPrice)}
                        </ThemedText>
                        {!item.isActive && <Badge label="Inactive" variant="emergency" />}
                      </View>

                      {item.description ? (
                        <ThemedText variant="caption" color={theme.colors.textMuted}>
                          {item.description}
                        </ThemedText>
                      ) : null}

                      {/* PhilHealth mapping status */}
                      <View style={styles.itemTitleRow}>
                        {item.isPhilHealthFormulary && item.philHealthCode ? (
                          <>
                            <Badge label={`PhilHealth: ${item.philHealthCode}`} variant="success" />
                            {item.philHealthDescription ? (
                              <ThemedText variant="caption" color={theme.colors.textMuted} numberOfLines={1}>
                                {item.philHealthDescription}
                              </ThemedText>
                            ) : null}
                          </>
                        ) : isClinical ? (
                          <Badge label="Non-formulary, out of pocket" variant="warning" />
                        ) : (
                          <Badge label="Standard service" variant="neutral" />
                        )}
                      </View>
                    </View>

                    <View style={styles.itemActions}>
                      {isClinical && (
                        <Button
                          title={item.philHealthCode ? 'Edit mapping' : 'Map PhilHealth'}
                          variant="outline"
                          size="sm"
                          onPress={() => setMappingTargetItem(item)}
                        />
                      )}
                      <Button
                        title={item.isActive ? 'Deactivate' : 'Activate'}
                        variant={item.isActive ? 'secondary' : 'success'}
                        size="sm"
                        onPress={() => handleToggleServiceActive(item)}
                      />
                    </View>
                  </View>
                );
              })
            )}
          </CardContent>
        </Card>
      </ScrollView>

      {/* Add staff modal */}
      <Modal
        visible={showAddStaffModal}
        onClose={() => setShowAddStaffModal(false)}
        title="Add staff member"
        subtitle={
          maxStaffSeats != null ? `Seats in use: ${activeStaffCount} of ${maxStaffSeats}` : `Active staff: ${activeStaffCount}`
        }
        maxWidth={520}
        footer={
          <View style={styles.modalFooter}>
            <Button title="Cancel" variant="ghost" onPress={() => setShowAddStaffModal(false)} disabled={addingStaff} />
            <Button title="Add staff" onPress={handleAddStaff} loading={addingStaff} />
          </View>
        }
      >
        {staffError ? <FormError message={staffError} /> : null}

        <View style={styles.formRow}>
          <Input
            containerStyle={styles.flexNarrow}
            label="Title"
            value={newStaffTitle}
            onChangeText={setNewStaffTitle}
            placeholder="Dr. / RN / Ms."
          />
          <FieldGroup label="Role">
            <View style={styles.chipRow}>
              {(['Doctor', 'Nurse', 'Receptionist', 'Cashier'] as const).map((r) => (
                <Chip key={r} label={r} active={newStaffRole === r} onPress={() => setNewStaffRole(r)} />
              ))}
            </View>
          </FieldGroup>
        </View>

        <View style={styles.formRow}>
          <Input
            containerStyle={styles.flexWide}
            label="First name"
            required
            value={newStaffFirstName}
            onChangeText={setNewStaffFirstName}
            placeholder="First name"
          />
          <Input
            containerStyle={styles.flexWide}
            label="Last name"
            required
            value={newStaffLastName}
            onChangeText={setNewStaffLastName}
            placeholder="Last name"
          />
        </View>

        <Input
          label="PRC license number"
          value={newStaffPrc}
          onChangeText={setNewStaffPrc}
          placeholder="PRC license number"
        />
        <Input
          label="Specialty or designation"
          value={newStaffSpecialty}
          onChangeText={setNewStaffSpecialty}
          placeholder="e.g. Pediatrics, Primary care nursing"
        />
      </Modal>

      {/* Add custom field modal */}
      <Modal
        visible={showAddFieldModal}
        onClose={() => setShowAddFieldModal(false)}
        title="Add intake field"
        subtitle="Define a new detail to collect on patient registration forms."
        maxWidth={500}
        maxHeight="90%"
        footer={
          <View style={styles.modalFooter}>
            <Button title="Cancel" variant="ghost" onPress={() => setShowAddFieldModal(false)} disabled={savingField} />
            <Button title="Add field" onPress={handleCreateCustomField} loading={savingField} />
          </View>
        }
      >
        {fieldError ? <FormError message={fieldError} /> : null}

        <Input
          label="Field label"
          required
          value={newFieldLabel}
          onChangeText={(text) => {
            setNewFieldLabel(text);
            if (!newFieldKey) {
              setNewFieldKey(text.toLowerCase().replace(/[^a-z0-9]/g, '_'));
            }
          }}
          placeholder="e.g. Guardian name"
        />

        <Input
          label="System key"
          value={newFieldKey}
          onChangeText={setNewFieldKey}
          placeholder="e.g. guardian_name"
          helperText="Used internally and in imports. Filled in from the label if left alone."
        />

        <FieldGroup label="Applies to">
          <View style={styles.chipRow}>
            {(['Student', 'Employee', 'General'] as const).map((cat) => (
              <Chip key={cat} label={cat} active={newFieldCategory === cat} onPress={() => setNewFieldCategory(cat)} />
            ))}
          </View>
        </FieldGroup>

        <FieldGroup label="Data type">
          <View style={styles.chipRow}>
            {(['Text', 'Number', 'Date', 'Select', 'Boolean'] as const).map((dt) => (
              <Chip key={dt} label={dt} active={newFieldDataType === dt} onPress={() => setNewFieldDataType(dt)} />
            ))}
          </View>
        </FieldGroup>

        {newFieldDataType === 'Select' && (
          <Input
            label="Dropdown options"
            required
            value={newFieldOptions}
            onChangeText={setNewFieldOptions}
            placeholder="Separate options with commas"
          />
        )}

        <Input
          label="Hint text"
          value={newFieldPlaceholder}
          onChangeText={setNewFieldPlaceholder}
          placeholder="Shown inside the empty field"
        />

        <Pressable
          style={styles.checkRow}
          onPress={() => setNewFieldRequired(!newFieldRequired)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: newFieldRequired }}
        >
          <View style={[styles.checkbox, newFieldRequired && styles.checkboxActive]}>
            {newFieldRequired && <Icon name="check" size={theme.sizes.iconSm} color={theme.colors.onPrimary} />}
          </View>
          <ThemedText variant="small" color={theme.colors.textSecondary} style={styles.flex}>
            Required during patient registration
          </ThemedText>
        </Pressable>
      </Modal>

      <BulkStudentImportModal
        visible={showBulkImportModal}
        onClose={() => setShowBulkImportModal(false)}
        onSuccess={() => {
          loadAll();
        }}
      />

      {/* Add service catalog item modal */}
      <Modal
        visible={showAddServiceModal}
        onClose={() => setShowAddServiceModal(false)}
        title="Add service or formulary item"
        subtitle="Add a billable procedure, lab test, consultation or medicine to your fee schedule."
        maxWidth={540}
        maxHeight="90%"
        footer={
          <View style={styles.modalFooter}>
            <Button title="Cancel" variant="ghost" onPress={() => setShowAddServiceModal(false)} disabled={savingService} />
            <Button
              title={
                isClinicalCategory(newServiceCategory) && !newServicePhilHealthCode && !newServiceIsFormulary
                  ? 'Map and save'
                  : 'Save item'
              }
              onPress={handleInitiateSaveService}
              loading={savingService}
            />
          </View>
        }
      >
        {serviceError ? <FormError message={serviceError} /> : null}

        <View style={styles.formRow}>
          <Input
            containerStyle={styles.flexWide}
            label="Item code"
            required
            value={newServiceCode}
            onChangeText={setNewServiceCode}
            placeholder="e.g. MED-AMOX-500"
            autoCapitalize="characters"
          />
          <Input
            containerStyle={styles.flexWide}
            label="Standard price (₱)"
            required
            value={newServicePrice}
            onChangeText={setNewServicePrice}
            placeholder="0.00"
            keyboardType="numeric"
          />
        </View>

        <Input
          label="Item name"
          required
          value={newServiceName}
          onChangeText={setNewServiceName}
          placeholder="e.g. Amoxicillin 500mg capsule"
        />

        <FieldGroup label="Category">
          <View style={styles.chipRow}>
            {(['Medicine', 'Diagnostic', 'Procedure', 'Consultation', 'NursingService'] as const).map((cat) => (
              <Chip
                key={cat}
                label={SERVICE_CATEGORY_LABEL[cat]}
                active={newServiceCategory === cat}
                onPress={() => setNewServiceCategory(cat)}
              />
            ))}
          </View>
        </FieldGroup>

        <Input
          label="Description"
          value={newServiceDesc}
          onChangeText={setNewServiceDesc}
          placeholder="Dosage form, clinical notes or instructions"
          multiline
        />

        {isClinicalCategory(newServiceCategory) && (
          <View style={styles.noticeBox}>
            <ThemedText variant="smallBold" color={theme.colors.infoText}>
              PhilHealth mapping
            </ThemedText>
            <ThemedText variant="caption" color={theme.colors.infoText}>
              Medicines and diagnostics need a PhilHealth code for claims. If this item is not mapped yet, saving opens the
              catalog mapping dialog first.
            </ThemedText>
          </View>
        )}
      </Modal>

      {/* PhilHealth catalog mapping dialog */}
      {(showPhilHealthMappingModal || !!mappingTargetItem) && (
        <PhilHealthCatalogMappingModal
          visible={showPhilHealthMappingModal || !!mappingTargetItem}
          onClose={() => {
            setShowPhilHealthMappingModal(false);
            setMappingTargetItem(null);
          }}
          itemName={mappingTargetItem ? mappingTargetItem.name : newServiceName}
          itemType={
            (mappingTargetItem
              ? mappingTargetItem.category.toLowerCase() === 'medicine'
              : newServiceCategory.toLowerCase() === 'medicine')
              ? 'Medicine'
              : 'Diagnostic'
          }
          initialGenericName={mappingTargetItem ? mappingTargetItem.name : newServiceName}
          onSaveMapping={handlePhilHealthMappingConfirmed}
        />
      )}

      {/* CSV bulk catalog import modal */}
      <CsvCatalogImportModal
        visible={showCsvCatalogImportModal}
        onClose={() => setShowCsvCatalogImportModal(false)}
        onImportSuccess={(_result) => {
          clinicService.getServices().then(([freshServices]) => {
            if (freshServices) setServices(freshServices);
          });
        }}
      />
      <StaffAccessModal staff={accessStaff} onClose={() => setAccessStaff(null)} />
    </ResponsiveLayout>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    padding: theme.spacing.xl,
    gap: theme.spacing.lg,
  },
  flex: {
    flex: 1,
  },
  flexWide: {
    flex: 2,
    minWidth: 200,
  },
  flexNarrow: {
    flex: 1,
    minWidth: 140,
  },
  formRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
  },
  fieldGroup: {
    gap: theme.spacing.xs,
  },
  actionsEnd: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  headerActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    justifyContent: 'flex-end',
  },
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
  },
  statCell: {
    flex: 1,
    minWidth: 200,
  },
  subSection: {
    borderTopWidth: theme.sizes.borderWidth,
    borderTopColor: theme.colors.borderLight,
    paddingTop: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
  },
  licenseBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  chip: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radii.full,
    backgroundColor: theme.colors.surface,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.borderDark,
  },
  chipActive: {
    backgroundColor: theme.colors.primaryLight,
    borderColor: theme.colors.primary,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    flexWrap: 'wrap',
    padding: theme.spacing.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surface,
  },
  itemTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  itemActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  formError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.emergencySubtle,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.emergencyBorder,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  checkbox: {
    width: theme.sizes.iconLg,
    height: theme.sizes.iconLg,
    borderRadius: theme.radii.xs,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.borderDark,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  noticeBox: {
    backgroundColor: theme.colors.infoBg,
    borderColor: theme.colors.infoBorder,
    borderWidth: theme.sizes.borderWidth,
    borderRadius: theme.radii.md,
    padding: theme.spacing.md,
    gap: theme.spacing.xs,
  },
});

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Modal,
} from 'react-native';
import { ThemedText, Badge, Button, Input, Card } from '@ui';
import { ResponsiveLayout } from '@layout';
import { theme } from '@constants/theme';
import { useFacilityLicense } from '../../components/FacilityActivationGate';
import { BulkStudentImportModal } from '../../components/BulkStudentImportModal';
import {
  clinicService,
  DailyEodReport,
  ClinicSettingsRecord,
  StaffMember,
  StaffRole,
  ClinicCustomFieldDefinition,
} from '../../services/clinicService';

const DEFAULT_CUSTOM_FIELDS: ClinicCustomFieldDefinition[] = [
  {
    id: 'cf-student-id',
    tenantId: 'tenant-default',
    clinicId: 'clinic-default',
    entityType: 'ClinicPatient',
    fieldKey: 'student_id',
    label: 'Student ID / LRN',
    category: 'Student',
    dataType: 'Text',
    isRequired: true,
    displayOrder: 1,
    placeholder: 'e.g. 2026-10492',
    isActive: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'cf-college',
    tenantId: 'tenant-default',
    clinicId: 'clinic-default',
    entityType: 'ClinicPatient',
    fieldKey: 'college',
    label: 'College / Faculty',
    category: 'Student',
    dataType: 'Text',
    isRequired: false,
    displayOrder: 2,
    placeholder: 'e.g. College of Computer Studies',
    isActive: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'cf-program',
    tenantId: 'tenant-default',
    clinicId: 'clinic-default',
    entityType: 'ClinicPatient',
    fieldKey: 'program',
    label: 'Degree Program / Course',
    category: 'Student',
    dataType: 'Text',
    isRequired: false,
    displayOrder: 3,
    placeholder: 'e.g. BS Computer Science',
    isActive: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'cf-year-level',
    tenantId: 'tenant-default',
    clinicId: 'clinic-default',
    entityType: 'ClinicPatient',
    fieldKey: 'year_level',
    label: 'Year Level',
    category: 'Student',
    dataType: 'Select',
    optionsJson: JSON.stringify(['1st Year', '2nd Year', '3rd Year', '4th Year', 'Graduate Studies']),
    isRequired: true,
    displayOrder: 4,
    placeholder: 'Select Year Level',
    isActive: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'cf-employee-id',
    tenantId: 'tenant-default',
    clinicId: 'clinic-default',
    entityType: 'ClinicPatient',
    fieldKey: 'employee_id',
    label: 'Employee ID',
    category: 'Employee',
    dataType: 'Text',
    isRequired: true,
    displayOrder: 5,
    placeholder: 'e.g. EMP-2026-042',
    isActive: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'cf-department',
    tenantId: 'tenant-default',
    clinicId: 'clinic-default',
    entityType: 'ClinicPatient',
    fieldKey: 'department',
    label: 'Department / Unit',
    category: 'Employee',
    dataType: 'Text',
    isRequired: false,
    displayOrder: 6,
    placeholder: 'e.g. Registrar / Human Resources',
    isActive: true,
    createdAt: new Date().toISOString(),
  },
];

export default function SettingsScreen() {
  const { license, openActivationModal, refreshLicense } = useFacilityLicense();
  const [eodReport, setEodReport] = useState<DailyEodReport | null>(null);
  const [settings, setSettings] = useState<ClinicSettingsRecord | null>(null);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSavedBanner, setSettingsSavedBanner] = useState(false);

  // Staff creation modal states
  const [showAddStaffModal, setShowAddStaffModal] = useState(false);
  const [newStaffFirstName, setNewStaffFirstName] = useState('');
  const [newStaffLastName, setNewStaffLastName] = useState('');
  const [newStaffTitle, setNewStaffTitle] = useState('Dr.');
  const [newStaffRole, setNewStaffRole] = useState<StaffRole>('Doctor');
  const [newStaffPrc, setNewStaffPrc] = useState('');
  const [newStaffSpecialty, setNewStaffSpecialty] = useState('');
  const [newStaffEmail, setNewStaffEmail] = useState('');
  const [addingStaff, setAddingStaff] = useState(false);
  const [staffError, setStaffError] = useState<string | null>(null);

  // Tenant Custom Field Builder states
  const [customFields, setCustomFields] = useState<ClinicCustomFieldDefinition[]>(DEFAULT_CUSTOM_FIELDS);
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

  // Form states for preferences
  const [clinicName, setClinicName] = useState('St. Jude Family Clinic & Primary Care');
  const [operatingHours, setOperatingHours] = useState('Mon-Sat 8:00 AM - 5:00 PM');
  const [slotDuration, setSlotDuration] = useState('30');
  const [consultationFee, setConsultationFee] = useState('400.00');
  const [letterheadHeader, setLetterheadHeader] = useState('ST. JUDE FAMILY MEDICAL CLINIC');
  const [letterheadAddress, setLetterheadAddress] = useState('124 Rizal Avenue, San Pedro, Laguna');
  const [letterheadContact, setLetterheadContact] = useState('Tel: (02) 8876-5432 • Mobile: +63 917 123 4567');

  const loadAll = useCallback(async () => {
    const [[eodData], [settingsData], [staffData], [customFieldsData]] = await Promise.all([
      clinicService.getDailyEodReport(),
      clinicService.getSettings(),
      clinicService.getStaff(),
      clinicService.getCustomFields('ClinicPatient'),
    ]);

    if (eodData) setEodReport(eodData);
    if (customFieldsData && customFieldsData.length > 0) {
      setCustomFields(customFieldsData);
    } else {
      setCustomFields(DEFAULT_CUSTOM_FIELDS);
    }
    if (settingsData) {
      setSettings(settingsData);
      setClinicName(settingsData.clinicName);
      setOperatingHours(settingsData.operatingHours);
      setSlotDuration(String(settingsData.defaultSlotDurationMinutes));
      setConsultationFee(String(settingsData.defaultConsultationFee));
      if (settingsData.letterheadHeader) setLetterheadHeader(settingsData.letterheadHeader);
      if (settingsData.letterheadAddress) setLetterheadAddress(settingsData.letterheadAddress);
      if (settingsData.letterheadContact) setLetterheadContact(settingsData.letterheadContact);
    }
    if (staffData && staffData.length > 0) {
      setStaff(staffData);
    } else {
      // Sample provider roster
      setStaff([
        {
          id: 'st-1',
          tenantId: 'tenant-default',
          clinicId: 'clinic-default',
          firstName: 'Roberto',
          lastName: 'Cruz',
          title: 'Dr.',
          role: 'Doctor',
          prcLicenseNumber: 'PRC-0149281',
          ptrNumber: 'PTR-8492019',
          s2LicenseNumber: 'S2-9482014',
          specialty: 'Family Medicine / General Practice',
          isActive: true,
          createdAt: new Date().toISOString(),
        },
        {
          id: 'st-2',
          tenantId: 'tenant-default',
          clinicId: 'clinic-default',
          firstName: 'Bea',
          lastName: 'Gomez',
          title: 'Nurse',
          role: 'Nurse',
          prcLicenseNumber: 'PRC-0982312',
          specialty: 'Triage & Primary Care Nursing',
          isActive: true,
          createdAt: new Date().toISOString(),
        },
        {
          id: 'st-3',
          tenantId: 'tenant-default',
          clinicId: 'clinic-default',
          firstName: 'Clara',
          lastName: 'Santos',
          title: 'Ms.',
          role: 'Cashier',
          specialty: 'Billing & PhilHealth Konsulta Claims',
          isActive: true,
          createdAt: new Date().toISOString(),
        },
      ]);
    }
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

  const handleSavePreferences = async () => {
    setSavingSettings(true);
    setSettingsSavedBanner(false);
    await clinicService.updateSettings({
      clinicName: clinicName.trim(),
      operatingHours: operatingHours.trim(),
      defaultSlotDurationMinutes: parseInt(slotDuration) || 30,
      defaultConsultationFee: parseFloat(consultationFee) || 400.0,
      letterheadHeader: letterheadHeader.trim(),
      letterheadAddress: letterheadAddress.trim(),
      letterheadContact: letterheadContact.trim(),
    });
    setSavingSettings(false);
    setSettingsSavedBanner(true);
    setTimeout(() => setSettingsSavedBanner(false), 4000);
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
      setNewStaffPrc('');
      setNewStaffSpecialty('');
      setNewStaffEmail('');
      await refreshLicense();
    }
  };

  const handleDeactivateStaff = async (staffId: string) => {
    const [, err] = await clinicService.deactivateStaff(staffId);
    if (!err) {
      setStaff((prev) => prev.filter((s) => s.id !== staffId));
      await refreshLicense();
    }
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

    if (created) {
      setCustomFields((prev) => [...prev, created]);
    } else {
      // Local fallback for resilience
      const fallback: ClinicCustomFieldDefinition = {
        id: `cf-${Date.now()}`,
        tenantId: 'tenant-default',
        clinicId: 'clinic-default',
        entityType: 'ClinicPatient',
        fieldKey: computedKey,
        label: newFieldLabel.trim(),
        category: newFieldCategory,
        dataType: newFieldDataType,
        isRequired: newFieldRequired,
        displayOrder: customFields.length + 1,
        placeholder: newFieldPlaceholder.trim() || undefined,
        optionsJson: payload.optionsJson,
        isActive: true,
        createdAt: new Date().toISOString(),
      };
      setCustomFields((prev) => [...prev, fallback]);
    }

    setShowAddFieldModal(false);
    setNewFieldLabel('');
    setNewFieldKey('');
    setNewFieldPlaceholder('');
    setNewFieldOptions('');
    setNewFieldRequired(false);
  };

  const handleDeleteCustomField = async (fieldId: string) => {
    await clinicService.deleteCustomField(fieldId);
    setCustomFields((prev) => prev.filter((f) => f.id !== fieldId));
  };

  return (
    <ResponsiveLayout
      headerTitle="Facility Operations & Config"
      headerSubtitle="Preferences, Letterhead, Remittance Audit & Provider Roster"
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.colors.primary]} />}
      >
      <View style={styles.header}>
        <ThemedText style={styles.subtitle}>Clinic Operations & Config</ThemedText>
        <ThemedText style={styles.title}>Facility & Audit</ThemedText>
      </View>

      {/* End-of-Day Census & Cashier Remittance Card */}
      <View style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <ThemedText style={styles.cardTitle}>Daily Operations & Remittance</ThemedText>
          <Pressable onPress={loadAll} style={styles.auditBtn}>
            <ThemedText style={styles.auditBtnText}>↻ Refresh Audit</ThemedText>
          </Pressable>
        </View>

        {loading && !refreshing ? (
          <ActivityIndicator size="small" color="#0284C7" style={{ padding: 16 }} />
        ) : eodReport ? (
          <View style={styles.censusContainer}>
            <View style={styles.remittanceHero}>
              <View style={styles.remittanceBlock}>
                <ThemedText style={styles.remittanceLabel}>Physical Cash in Drawer</ThemedText>
                <ThemedText style={styles.remittanceAmount}>
                  ₱{(eodReport.cashInDrawer ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                </ThemedText>
                <ThemedText style={styles.remittanceSub}>Ready for bank deposit / handover</ThemedText>
              </View>
              <View style={styles.remittanceDivider} />
              <View style={styles.remittanceBlock}>
                <ThemedText style={styles.remittanceLabel}>Total Collections</ThemedText>
                <ThemedText style={[styles.remittanceAmount, { color: '#0369A1' }]}>
                  ₱{(eodReport.totalAmountCollected ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                </ThemedText>
                <ThemedText style={styles.remittanceSub}>Net: ₱{(eodReport.totalNetAmount ?? 0).toFixed(2)}</ThemedText>
              </View>
            </View>

            <View style={styles.statsGrid}>
              <View style={styles.statCell}>
                <ThemedText style={styles.statVal}>{eodReport.totalCheckedIn}</ThemedText>
                <ThemedText style={styles.statDesc}>Total Checked In</ThemedText>
              </View>
              <View style={styles.statCell}>
                <ThemedText style={styles.statVal}>{eodReport.totalCompletedVisits}</ThemedText>
                <ThemedText style={styles.statDesc}>Visits Completed</ThemedText>
              </View>
              <View style={styles.statCell}>
                <ThemedText style={[styles.statVal, { color: '#D97706' }]}>
                  ₱{(eodReport.totalDiscountsGiven ?? 0).toFixed(2)}
                </ThemedText>
                <ThemedText style={styles.statDesc}>Senior/PWD Disc.</ThemedText>
              </View>
              <View style={styles.statCell}>
                <ThemedText style={[styles.statVal, { color: '#059669' }]}>
                  ₱{(eodReport.totalPhilHealthCovered ?? 0).toFixed(2)}
                </ThemedText>
                <ThemedText style={styles.statDesc}>PhilHealth Konsulta</ThemedText>
              </View>
            </View>

            {/* Payment Modes */}
            {eodReport.collectionsByMethod && eodReport.collectionsByMethod.length > 0 && (
              <View style={styles.subSection}>
                <ThemedText style={styles.subSectionTitle}>Collections by Payment Mode</ThemedText>
                {eodReport.collectionsByMethod.map((pm, idx) => (
                  <View key={idx} style={styles.row}>
                    <ThemedText style={styles.label}>{pm.method} ({pm.transactionCount} txn)</ThemedText>
                    <ThemedText style={styles.value}>
                      ₱{pm.totalAmount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                    </ThemedText>
                  </View>
                ))}
              </View>
            )}
          </View>
        ) : (
          <ThemedText style={{ color: '#6B7280', fontSize: 13, padding: 8 }}>
            No financial census recorded for today yet.
          </ThemedText>
        )}
      </View>

      {/* Operational Preferences Card */}
      <View style={styles.card}>
        <ThemedText style={styles.cardTitle}>Operational Preferences & Letterhead</ThemedText>

        {settingsSavedBanner && (
          <View style={styles.savedBanner}>
            <ThemedText style={styles.savedBannerText}>✓ Preferences successfully saved & updated!</ThemedText>
          </View>
        )}

        <View style={{ gap: 10 }}>
          <View>
            <ThemedText style={styles.fieldLabel}>Facility Name</ThemedText>
            <TextInput
              style={styles.fieldInput}
              value={clinicName}
              onChangeText={setClinicName}
            />
          </View>

          <View style={styles.formRow}>
            <View style={{ flex: 2 }}>
              <ThemedText style={styles.fieldLabel}>Operating Schedule</ThemedText>
              <TextInput
                style={styles.fieldInput}
                value={operatingHours}
                onChangeText={setOperatingHours}
              />
            </View>
            <View style={{ flex: 1 }}>
              <ThemedText style={styles.fieldLabel}>Slot (min)</ThemedText>
              <TextInput
                style={styles.fieldInput}
                value={slotDuration}
                onChangeText={setSlotDuration}
                keyboardType="numeric"
              />
            </View>
            <View style={{ flex: 1 }}>
              <ThemedText style={styles.fieldLabel}>Fee (₱)</ThemedText>
              <TextInput
                style={styles.fieldInput}
                value={consultationFee}
                onChangeText={setConsultationFee}
                keyboardType="numeric"
              />
            </View>
          </View>

          <View>
            <ThemedText style={styles.fieldLabel}>Letterhead Title / Header</ThemedText>
            <TextInput
              style={styles.fieldInput}
              value={letterheadHeader}
              onChangeText={setLetterheadHeader}
            />
          </View>

          <View>
            <ThemedText style={styles.fieldLabel}>Facility Address</ThemedText>
            <TextInput
              style={styles.fieldInput}
              value={letterheadAddress}
              onChangeText={setLetterheadAddress}
            />
          </View>

          <View>
            <ThemedText style={styles.fieldLabel}>Contact Information</ThemedText>
            <TextInput
              style={styles.fieldInput}
              value={letterheadContact}
              onChangeText={setLetterheadContact}
            />
          </View>

          <Pressable
            style={[styles.savePrefBtn, savingSettings && { opacity: 0.6 }]}
            onPress={handleSavePreferences}
            disabled={savingSettings}
          >
            {savingSettings ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <ThemedText style={styles.savePrefBtnText}>Save Preferences</ThemedText>
            )}
          </Pressable>
        </View>
      </View>

      {/* Facility License & Signed Limits Card */}
      <View style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <ThemedText style={styles.cardTitle}>Facility Operating License</ThemedText>
          <Pressable style={styles.licenseActionBtn} onPress={openActivationModal}>
            <ThemedText style={styles.licenseActionBtnText}>🔑 Update / Renew Key</ThemedText>
          </Pressable>
        </View>

        <View style={styles.licenseBannerRow}>
          <View style={styles.licenseTierBadge}>
            <ThemedText style={styles.licenseTierText}>{license?.planTier ?? 'Community'} Tier</ThemedText>
          </View>
          <ThemedText style={[styles.licenseStatusText, { color: license?.status === 'Active' ? '#16A34A' : '#DC2626' }]}>
            ● {license?.status === 'Active' ? 'Cryptographically Verified (ECDSA P-256)' : (license?.status ?? 'Unverified')}
          </ThemedText>
        </View>

        <View style={styles.row}>
          <ThemedText style={styles.label}>Licensed Facility</ThemedText>
          <ThemedText style={styles.value}>{license?.clinicName ?? clinicName}</ThemedText>
        </View>
        <View style={styles.row}>
          <ThemedText style={styles.label}>Staff Quota Allocation</ThemedText>
          <ThemedText style={[styles.value, { color: '#0284C7', fontWeight: '700' }]}>
            {staff.filter((s) => s.isActive).length} / {license?.limits?.maxStaff ?? 5} active seats used
          </ThemedText>
        </View>
        <View style={styles.row}>
          <ThemedText style={styles.label}>Encounter Daily Cap</ThemedText>
          <ThemedText style={styles.value}>
            {license?.limits?.maxDailyEncounters === 2147483647 ? 'Unlimited' : `${license?.limits?.maxDailyEncounters ?? 100} / day`}
          </ThemedText>
        </View>
        <View style={styles.row}>
          <ThemedText style={styles.label}>Offline Edge Operation</ThemedText>
          <ThemedText style={[styles.value, { color: '#16A34A' }]}>
            {license?.limits?.isOfflineCapable ? 'Enabled (Full Autonomous)' : 'Standard'}
          </ThemedText>
        </View>
        {license?.expiresAtUtc && (
          <View style={styles.row}>
            <ThemedText style={styles.label}>Expiration Date</ThemedText>
            <ThemedText style={styles.value}>{new Date(license.expiresAtUtc).toLocaleDateString()}</ThemedText>
          </View>
        )}
      </View>

      {/* Staff & Healthcare Providers Roster Card */}
      <View style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <View>
            <ThemedText style={styles.cardTitle}>Autonomous Staff Roster</ThemedText>
            <ThemedText style={{ fontSize: 12, color: '#6B7280' }}>
              Quota: {staff.filter((s) => s.isActive).length} of {license?.limits?.maxStaff ?? 5} seats used
            </ThemedText>
          </View>
          <Pressable
            style={[
              styles.addStaffBtn,
              staff.filter((s) => s.isActive).length >= (license?.limits?.maxStaff ?? 5) && { backgroundColor: '#9CA3AF' },
            ]}
            onPress={() => {
              if (staff.filter((s) => s.isActive).length >= (license?.limits?.maxStaff ?? 5)) {
                alert(`Staff quota limit of ${license?.limits?.maxStaff ?? 5} reached for the ${license?.planTier ?? 'Community'} tier. Please upgrade license key.`);
                return;
              }
              setStaffError(null);
              setShowAddStaffModal(true);
            }}
          >
            <ThemedText style={styles.addStaffBtnText}>+ Add Staff</ThemedText>
          </Pressable>
        </View>

        <View style={{ gap: 10, marginTop: 4 }}>
          {staff.map((s) => (
            <View key={s.id} style={styles.staffItem}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <ThemedText style={styles.staffName}>
                    {s.title ? `${s.title} ` : ''}{s.firstName} {s.lastName}
                  </ThemedText>
                  <View style={[styles.roleBadge, s.role === 'Doctor' && { backgroundColor: '#E0F2FE' }]}>
                    <ThemedText style={[styles.roleBadgeText, s.role === 'Doctor' && { color: '#0369A1' }]}>
                      {s.role}
                    </ThemedText>
                  </View>
                </View>
                <ThemedText style={styles.specialtyText}>{s.specialty ?? 'General Staff'}</ThemedText>
                {s.prcLicenseNumber && (
                  <ThemedText style={styles.licenseText}>
                    PRC: {s.prcLicenseNumber} {s.ptrNumber ? `• PTR: ${s.ptrNumber}` : ''} {s.s2LicenseNumber ? `• PDEA S2: ${s.s2LicenseNumber}` : ''}
                  </ThemedText>
                )}
              </View>
              <Pressable style={styles.deactivateBtn} onPress={() => handleDeactivateStaff(s.id)}>
                <ThemedText style={styles.deactivateBtnText}>Deactivate</ThemedText>
              </Pressable>
            </View>
          ))}
        </View>
      </View>

      {/* Tenant Custom Fields & Dynamic Form Builder Card */}
      <View style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <View style={{ flex: 1 }}>
            <ThemedText style={styles.cardTitle}>Tenant Custom Fields & Dynamic Form Studio</ThemedText>
            <ThemedText style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>
              Build and customize demographic intake fields for Students, Employees, or Campus Programs without modifying code or schema.
            </ThemedText>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable
              style={[styles.addStaffBtn, { backgroundColor: '#059669' }]}
              onPress={() => setShowBulkImportModal(true)}
            >
              <ThemedText style={styles.addStaffBtnText}>📥 Bulk Import Students</ThemedText>
            </Pressable>
            <Pressable
              style={styles.addStaffBtn}
              onPress={() => {
                setFieldError(null);
                setShowAddFieldModal(true);
              }}
            >
              <ThemedText style={styles.addStaffBtnText}>+ Add Custom Field</ThemedText>
            </Pressable>
          </View>
        </View>

        {/* Category Filter Pills */}
        <View style={{ flexDirection: 'row', gap: 6, marginVertical: 6 }}>
          {(['All', 'Student', 'Employee', 'General'] as const).map((cat) => (
            <Pressable
              key={cat}
              style={[
                styles.categoryFilterChip,
                selectedFieldCategory === cat && styles.categoryFilterChipActive,
              ]}
              onPress={() => setSelectedFieldCategory(cat)}
            >
              <ThemedText
                style={[
                  styles.categoryFilterChipText,
                  selectedFieldCategory === cat && styles.categoryFilterChipTextActive,
                ]}
              >
                {cat === 'All' ? '🌐 All Fields' : cat === 'Student' ? '🎓 Students' : cat === 'Employee' ? '💼 Employees' : '👤 General'}
              </ThemedText>
            </Pressable>
          ))}
        </View>

        {/* Custom Fields List */}
        <View style={{ gap: 8, marginTop: 4 }}>
          {customFields
            .filter((f) => selectedFieldCategory === 'All' || f.category === selectedFieldCategory)
            .map((field) => (
              <View key={field.id} style={styles.customFieldItem}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <ThemedText style={styles.customFieldLabel}>{field.label}</ThemedText>
                    <ThemedText style={styles.customFieldKeyBadge}>{field.fieldKey}</ThemedText>
                    <ThemedText
                      style={[
                        styles.customFieldTypeBadge,
                        field.dataType === 'Select' ? { backgroundColor: '#EDE9FE', color: '#6D28D9' } :
                        field.dataType === 'Number' ? { backgroundColor: '#FEF3C7', color: '#B45309' } :
                        field.dataType === 'Date' ? { backgroundColor: '#FEE2E2', color: '#B91C1C' } :
                        { backgroundColor: '#E0F2FE', color: '#0369A1' }
                      ]}
                    >
                      {field.dataType}
                    </ThemedText>
                    {field.isRequired ? (
                      <ThemedText style={{ fontSize: 10, fontWeight: '700', color: '#DC2626' }}>
                        * Required
                      </ThemedText>
                    ) : (
                      <ThemedText style={{ fontSize: 10, color: '#9CA3AF' }}>
                        Optional
                      </ThemedText>
                    )}
                  </View>
                  <ThemedText style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>
                    Category: {field.category || 'General'} {field.placeholder ? `• Hint: "${field.placeholder}"` : ''}
                  </ThemedText>
                  {field.optionsJson ? (
                    <ThemedText style={{ fontSize: 11, color: '#4B5563', fontStyle: 'italic', marginTop: 2 }}>
                      Options: {JSON.parse(field.optionsJson || '[]').join(', ')}
                    </ThemedText>
                  ) : null}
                </View>
                <Pressable
                  style={styles.deactivateBtn}
                  onPress={() => handleDeleteCustomField(field.id)}
                >
                  <ThemedText style={styles.deactivateBtnText}>Delete</ThemedText>
                </Pressable>
              </View>
            ))}
        </View>
      </View>

      {/* Facility Accreditation Details */}
      <View style={styles.card}>
        <ThemedText style={styles.cardTitle}>Facility Details & Sync</ThemedText>
        <View style={styles.row}>
          <ThemedText style={styles.label}>Accreditation ID</ThemedText>
          <ThemedText style={styles.value}>PHIC-KONSULTA-09214</ThemedText>
        </View>
        <View style={styles.row}>
          <ThemedText style={styles.label}>Operating Mode</ThemedText>
          <ThemedText style={styles.value}>Multi-Tenant Cloud + Local Edge</ThemedText>
        </View>
        <View style={styles.row}>
          <ThemedText style={styles.label}>Sync Status</ThemedText>
          <ThemedText style={[styles.value, { color: '#16A34A', fontWeight: '700' }]}>Synced (0 pending)</ThemedText>
        </View>
      </View>
    </ScrollView>

    {/* Add Staff Modal */}
    <Modal
      visible={showAddStaffModal}
      transparent
      animationType="fade"
      onRequestClose={() => setShowAddStaffModal(false)}
    >
      <View style={styles.modalBackdrop}>
        <View style={styles.modalContent}>
          <ThemedText style={styles.modalHeaderTitle}>Add Clinic Staff Member</ThemedText>
          <ThemedText style={styles.modalHeaderSub}>
            Autonomous Edge Roster • Seats: {staff.filter((s) => s.isActive).length}/{license?.limits?.maxStaff ?? 5}
          </ThemedText>

          {staffError && (
            <View style={styles.modalErrorBanner}>
              <ThemedText style={styles.modalErrorBannerText}>{staffError}</ThemedText>
            </View>
          )}

          <View style={{ gap: 8 }}>
            <View style={styles.formRow}>
              <View style={{ flex: 1 }}>
                <ThemedText style={styles.fieldLabel}>Title (Dr., Nurse, etc.)</ThemedText>
                <TextInput
                  style={styles.fieldInput}
                  value={newStaffTitle}
                  onChangeText={setNewStaffTitle}
                  placeholder="Dr. / RN / Ms."
                />
              </View>
              <View style={{ flex: 2 }}>
                <ThemedText style={styles.fieldLabel}>Role</ThemedText>
                <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
                  {(['Doctor', 'Nurse', 'Receptionist', 'Cashier'] as const).map((r) => (
                    <Pressable
                      key={r}
                      style={[
                        styles.roleSelectChip,
                        newStaffRole === r && styles.roleSelectChipActive,
                      ]}
                      onPress={() => setNewStaffRole(r)}
                    >
                      <ThemedText
                        style={[
                          styles.roleSelectChipText,
                          newStaffRole === r && styles.roleSelectChipTextActive,
                        ]}
                      >
                        {r}
                      </ThemedText>
                    </Pressable>
                  ))}
                </View>
              </View>
            </View>

            <View style={styles.formRow}>
              <View style={{ flex: 1 }}>
                <ThemedText style={styles.fieldLabel}>First Name *</ThemedText>
                <TextInput
                  style={styles.fieldInput}
                  value={newStaffFirstName}
                  onChangeText={setNewStaffFirstName}
                  placeholder="Juan"
                />
              </View>
              <View style={{ flex: 1 }}>
                <ThemedText style={styles.fieldLabel}>Last Name *</ThemedText>
                <TextInput
                  style={styles.fieldInput}
                  value={newStaffLastName}
                  onChangeText={setNewStaffLastName}
                  placeholder="Dela Cruz"
                />
              </View>
            </View>

            <View>
              <ThemedText style={styles.fieldLabel}>PRC License Number</ThemedText>
              <TextInput
                style={styles.fieldInput}
                value={newStaffPrc}
                onChangeText={setNewStaffPrc}
                placeholder="PRC-0123456"
              />
            </View>

            <View>
              <ThemedText style={styles.fieldLabel}>Specialty / Designation</ThemedText>
              <TextInput
                style={styles.fieldInput}
                value={newStaffSpecialty}
                onChangeText={setNewStaffSpecialty}
                placeholder="Pediatrics / Primary Care"
              />
            </View>
          </View>

          <View style={styles.modalActionsRow}>
            <Pressable
              style={styles.cancelModalBtn}
              onPress={() => setShowAddStaffModal(false)}
              disabled={addingStaff}
            >
              <ThemedText style={styles.cancelModalBtnText}>Cancel</ThemedText>
            </Pressable>

            <Pressable
              style={[styles.saveStaffBtn, addingStaff && { opacity: 0.6 }]}
              onPress={handleAddStaff}
              disabled={addingStaff}
            >
              {addingStaff ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <ThemedText style={styles.saveStaffBtnText}>Register Staff</ThemedText>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>

    {/* Add Custom Field Modal */}
    <Modal
      visible={showAddFieldModal}
      transparent
      animationType="fade"
      onRequestClose={() => setShowAddFieldModal(false)}
    >
      <View style={styles.modalBackdrop}>
        <View style={[styles.modalContent, { maxWidth: 500 }]}>
          <ThemedText style={styles.modalHeaderTitle}>Add Tenant Custom Field</ThemedText>
          <ThemedText style={styles.modalHeaderSub}>
            Define new institutional demographic or clinical attributes for your facility's intake forms.
          </ThemedText>

          {fieldError && (
            <View style={styles.modalErrorBanner}>
              <ThemedText style={styles.modalErrorBannerText}>{fieldError}</ThemedText>
            </View>
          )}

          <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ gap: 10 }}>
            <View>
              <ThemedText style={styles.fieldLabel}>Field Display Label *</ThemedText>
              <TextInput
                style={styles.fieldInput}
                value={newFieldLabel}
                onChangeText={(text) => {
                  setNewFieldLabel(text);
                  if (!newFieldKey) {
                    setNewFieldKey(text.toLowerCase().replace(/[^a-z0-9]/g, '_'));
                  }
                }}
                placeholder="e.g. Guardian / Parent Name"
              />
            </View>

            <View>
              <ThemedText style={styles.fieldLabel}>System Key / Attribute Name</ThemedText>
              <TextInput
                style={styles.fieldInput}
                value={newFieldKey}
                onChangeText={setNewFieldKey}
                placeholder="e.g. guardian_name"
              />
            </View>

            <View>
              <ThemedText style={styles.fieldLabel}>Target Category</ThemedText>
              <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
                {(['Student', 'Employee', 'General'] as const).map((cat) => (
                  <Pressable
                    key={cat}
                    style={[
                      styles.roleSelectChip,
                      newFieldCategory === cat && styles.roleSelectChipActive,
                    ]}
                    onPress={() => setNewFieldCategory(cat)}
                  >
                    <ThemedText
                      style={[
                        styles.roleSelectChipText,
                        newFieldCategory === cat && styles.roleSelectChipTextActive,
                      ]}
                    >
                      {cat === 'Student' ? '🎓 Student' : cat === 'Employee' ? '💼 Employee' : '👤 General'}
                    </ThemedText>
                  </Pressable>
                ))}
              </View>
            </View>

            <View>
              <ThemedText style={styles.fieldLabel}>Data Type</ThemedText>
              <View style={{ flexDirection: 'row', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                {(['Text', 'Number', 'Date', 'Select', 'Boolean'] as const).map((dt) => (
                  <Pressable
                    key={dt}
                    style={[
                      styles.roleSelectChip,
                      newFieldDataType === dt && styles.roleSelectChipActive,
                    ]}
                    onPress={() => setNewFieldDataType(dt)}
                  >
                    <ThemedText
                      style={[
                        styles.roleSelectChipText,
                        newFieldDataType === dt && styles.roleSelectChipTextActive,
                      ]}
                    >
                      {dt}
                    </ThemedText>
                  </Pressable>
                ))}
              </View>
            </View>

            {newFieldDataType === 'Select' && (
              <View>
                <ThemedText style={styles.fieldLabel}>Dropdown Options (comma separated) *</ThemedText>
                <TextInput
                  style={styles.fieldInput}
                  value={newFieldOptions}
                  onChangeText={setNewFieldOptions}
                  placeholder="e.g. 1st Year, 2nd Year, 3rd Year, 4th Year"
                />
              </View>
            )}

            <View>
              <ThemedText style={styles.fieldLabel}>Placeholder / Helper Text</ThemedText>
              <TextInput
                style={styles.fieldInput}
                value={newFieldPlaceholder}
                onChangeText={setNewFieldPlaceholder}
                placeholder="e.g. Full name of emergency guardian"
              />
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 }}>
              <Pressable
                style={[
                  styles.checkboxBox,
                  newFieldRequired && styles.checkboxBoxActive,
                ]}
                onPress={() => setNewFieldRequired(!newFieldRequired)}
              >
                {newFieldRequired && <ThemedText style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '700' }}>✓</ThemedText>}
              </Pressable>
              <ThemedText style={{ fontSize: 13, color: '#374151' }}>
                Mark field as mandatory / required during patient registration
              </ThemedText>
            </View>
          </ScrollView>

          <View style={styles.modalActionsRow}>
            <Pressable
              style={styles.cancelModalBtn}
              onPress={() => setShowAddFieldModal(false)}
              disabled={savingField}
            >
              <ThemedText style={styles.cancelModalBtnText}>Cancel</ThemedText>
            </Pressable>
            <Pressable
              style={styles.saveStaffBtn}
              onPress={handleCreateCustomField}
              disabled={savingField}
            >
              {savingField ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <ThemedText style={styles.saveStaffBtnText}>Deploy Custom Field</ThemedText>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>

    <BulkStudentImportModal
      visible={showBulkImportModal}
      onClose={() => setShowBulkImportModal(false)}
      onSuccess={() => {
        loadAll();
      }}
    />
  </ResponsiveLayout>
);
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  content: {
    padding: 20,
    gap: 16,
  },
  header: {
    gap: 4,
  },
  subtitle: {
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    color: '#4B5563',
    fontWeight: '600',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 16,
    gap: 12,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    paddingBottom: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  auditBtn: {
    backgroundColor: '#F0F9FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  auditBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0284C7',
  },
  censusContainer: {
    gap: 14,
  },
  remittanceHero: {
    flexDirection: 'row',
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
  },
  remittanceBlock: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  remittanceDivider: {
    width: 1,
    height: '80%',
    backgroundColor: '#86EFAC',
  },
  remittanceLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#166534',
    textTransform: 'uppercase',
  },
  remittanceAmount: {
    fontSize: 20,
    fontWeight: '800',
    color: '#15803D',
  },
  remittanceSub: {
    fontSize: 10,
    color: '#4B5563',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statCell: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 10,
    alignItems: 'center',
    gap: 2,
  },
  statVal: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
  },
  statDesc: {
    fontSize: 11,
    color: '#6B7280',
  },
  subSection: {
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    paddingTop: 8,
    gap: 6,
  },
  subSectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4B5563',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    fontSize: 14,
    color: '#6B7280',
  },
  value: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
  },
  formRow: {
    flexDirection: 'row',
    gap: 8,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4B5563',
    marginBottom: 4,
  },
  fieldInput: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 13,
    color: '#111827',
  },
  savePrefBtn: {
    backgroundColor: '#0284C7',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 6,
  },
  savePrefBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  savedBanner: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#86EFAC',
    borderRadius: 8,
    padding: 10,
  },
  savedBannerText: {
    color: '#166534',
    fontSize: 12,
    fontWeight: '700',
  },
  staffItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 12,
  },
  staffName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  roleBadge: {
    backgroundColor: '#F3F4F6',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  roleBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#4B5563',
  },
  specialtyText: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  licenseText: {
    fontSize: 11,
    color: '#0284C7',
    fontWeight: '600',
    marginTop: 2,
  },
  activeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#16A34A',
  },
  licenseActionBtn: {
    backgroundColor: '#F0F9FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  licenseActionBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0284C7',
  },
  licenseBannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 4,
  },
  licenseTierBadge: {
    backgroundColor: '#0284C7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  licenseTierText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  licenseStatusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  addStaffBtn: {
    backgroundColor: '#0284C7',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  addStaffBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  deactivateBtn: {
    borderWidth: 1,
    borderColor: '#FCA5A5',
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  deactivateBtnText: {
    color: '#DC2626',
    fontSize: 11,
    fontWeight: '700',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 22,
    maxWidth: 500,
    width: '100%',
    gap: 12,
  },
  modalHeaderTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalHeaderSub: {
    fontSize: 12,
    color: '#64748B',
  },
  modalErrorBanner: {
    backgroundColor: '#FEE2E2',
    borderColor: '#F87171',
    borderWidth: 1,
    borderRadius: 8,
    padding: 8,
  },
  modalErrorBannerText: {
    color: '#991B1B',
    fontSize: 12,
    fontWeight: '600',
  },
  roleSelectChip: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#F8FAFC',
  },
  roleSelectChipActive: {
    backgroundColor: '#0284C7',
    borderColor: '#0284C7',
  },
  roleSelectChipText: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '600',
  },
  roleSelectChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  modalActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 8,
  },
  cancelModalBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  cancelModalBtnText: {
    color: '#475569',
    fontSize: 13,
    fontWeight: '600',
  },
  saveStaffBtn: {
    backgroundColor: '#0284C7',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
  },
  saveStaffBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  categoryFilterChip: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  categoryFilterChipActive: {
    backgroundColor: '#0284C7',
    borderColor: '#0284C7',
  },
  categoryFilterChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  categoryFilterChipTextActive: {
    color: '#FFFFFF',
  },
  customFieldItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    padding: 10,
    gap: 8,
  },
  customFieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  customFieldKeyBadge: {
    fontSize: 10,
    fontFamily: 'monospace',
    color: '#64748B',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  customFieldTypeBadge: {
    fontSize: 10,
    fontWeight: '700',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  checkboxBox: {
    width: 20,
    height: 20,
    borderWidth: 1,
    borderColor: '#94A3B8',
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  checkboxBoxActive: {
    backgroundColor: '#0284C7',
    borderColor: '#0284C7',
  },
});

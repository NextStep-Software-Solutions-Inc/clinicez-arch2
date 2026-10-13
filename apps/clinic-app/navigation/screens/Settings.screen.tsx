import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { ThemedText } from '@ui';
import { ResponsiveLayout } from '@layout';
import { theme } from '@constants/theme';
import { Alert, notify } from '@utils/feedback';
import { useFacilityLicense } from '../../components/FacilityActivationGate';
import { useClinic } from '../../context/ClinicContext';
import { useStaff } from '../../context/StaffContext';
import { usePermission, useAuth } from '../../context/AuthContext';
import { PERMISSIONS } from '../../constants/permissions';
import {
  clinicService,
  DailyEodReport,
  ClinicSettingsRecord,
  StaffMember,
  ClinicCustomFieldDefinition,
  ClinicServiceItem,
  ClinicRole,
} from '../../services/clinicService';

import SettingsTabBar from '../../components/settings/SettingsTabBar';
import GeneralSettingsTab from '../../components/settings/GeneralSettingsTab';
import FacilityReadinessTab from '../../components/settings/FacilityReadinessTab';
import StaffManagementTab from '../../components/settings/StaffManagementTab';
import AccessControlTab from '../../components/settings/AccessControlTab';
import ServicesCatalogTab from '../../components/settings/ServicesCatalogTab';
import CustomFieldsTab from '../../components/settings/CustomFieldsTab';
import PhilHealthSettingsTab from '../../components/settings/PhilHealthSettingsTab';
import LicenseSystemTab from '../../components/settings/LicenseSystemTab';
import { SettingsTabItem, SettingsTabKey } from '../../components/settings/types';
import { formatPeso } from '../../components/settings/common';

const sanitizeLegacyDefault = (val?: string | null): string => {
  if (!val) return '';
  const trimmed = val.trim();
  if (trimmed === 'Mon-Sat 8:00 AM - 5:00 PM') return '';
  return trimmed;
};

export default function SettingsScreen() {
  const { license, openActivationModal, refreshLicense } = useFacilityLicense();
  const { refresh: refreshClinic } = useClinic();
  const { reload: reloadStaffContext } = useStaff();
  const { user } = useAuth();
  const canManageSettings = usePermission(PERMISSIONS.settingsManage);
  const canManageStaff = usePermission(PERMISSIONS.staffManage);
  const canManageRoles = usePermission(PERMISSIONS.rolesManage);
  const isAdmin = canManageSettings || canManageStaff || user?.role === 'Admin';

  const [activeTab, setActiveTab] = useState<SettingsTabKey>('general');

  // Core Data States
  const [eodReport, setEodReport] = useState<DailyEodReport | null>(null);
  const [settings, setSettings] = useState<ClinicSettingsRecord | null>(null);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [roles, setRoles] = useState<ClinicRole[]>([]);
  const [customFields, setCustomFields] = useState<ClinicCustomFieldDefinition[]>([]);
  const [services, setServices] = useState<ClinicServiceItem[]>([]);

  // Loading & Error States
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  const [eodLoadError, setEodLoadError] = useState<string | null>(null);
  const [settingsLoadError, setSettingsLoadError] = useState<string | null>(null);
  const [staffLoadError, setStaffLoadError] = useState<string | null>(null);
  const [fieldsLoadError, setFieldsLoadError] = useState<string | null>(null);
  const [servicesLoadError, setServicesLoadError] = useState<string | null>(null);
  const [rolesLoadError, setRolesLoadError] = useState<string | null>(null);

  // Form states for general clinic profile
  const [clinicName, setClinicName] = useState('');
  const [accreditationNumber, setAccreditationNumber] = useState('');
  const [operatingHours, setOperatingHours] = useState('');
  const [slotDuration, setSlotDuration] = useState('');
  const [consultationFee, setConsultationFee] = useState('');
  const [letterheadHeader, setLetterheadHeader] = useState('');
  const [letterheadAddress, setLetterheadAddress] = useState('');
  const [letterheadContact, setLetterheadContact] = useState('');
  const [preferredChartLayout, setPreferredChartLayout] = useState<'modal' | 'split' | 'drawer'>('modal');

  // Modals for sub-components
  const [showAddStaffModal, setShowAddStaffModal] = useState(false);
  const [showAddServiceModal, setShowAddServiceModal] = useState(false);

  const loadAll = useCallback(async () => {
    const [
      [eodData, eodErr],
      [settingsData, settingsErr],
      [staffData, staffErr],
      [customFieldsData, fieldsErr],
      [servicesData, servicesErr],
      [rolesData, rolesErr],
    ] = await Promise.all([
      clinicService.getDailyEodReport(),
      clinicService.getSettings(),
      clinicService.getStaff(),
      clinicService.getCustomFields('ClinicPatient'),
      clinicService.getServices(),
      clinicService.getRoles(),
    ]);

    setEodLoadError(eodErr ? eodErr.message || 'Unable to load today\'s collections.' : null);
    if (!eodErr) setEodReport(eodData ?? null);

    setSettingsLoadError(settingsErr ? settingsErr.message || 'Unable to load clinic settings.' : null);
    if (settingsData) {
      setSettings(settingsData);
      setClinicName(settingsData.clinicName ?? '');
      setAccreditationNumber(settingsData.accreditationNumber ?? '');
      setOperatingHours(sanitizeLegacyDefault(settingsData.operatingHours));
      setSlotDuration(
        settingsData.defaultSlotDurationMinutes != null ? String(settingsData.defaultSlotDurationMinutes) : ''
      );
      setConsultationFee(
        settingsData.defaultConsultationFee != null ? String(settingsData.defaultConsultationFee) : ''
      );
      setLetterheadHeader(settingsData.letterheadHeader ?? '');
      setLetterheadAddress(settingsData.letterheadAddress ?? '');
      setLetterheadContact(settingsData.letterheadContact ?? '');
      if (settingsData.preferredChartLayout) {
        setPreferredChartLayout(settingsData.preferredChartLayout as 'modal' | 'split' | 'drawer');
      }
    }

    setStaffLoadError(staffErr ? staffErr.message || 'Unable to load staff.' : null);
    if (!staffErr) setStaff(staffData ?? []);

    setFieldsLoadError(fieldsErr ? fieldsErr.message || 'Unable to load custom fields.' : null);
    if (!fieldsErr) setCustomFields(customFieldsData ?? []);

    setServicesLoadError(servicesErr ? servicesErr.message || 'Unable to load the service catalog.' : null);
    if (!servicesErr) setServices(servicesData ?? []);

    setRolesLoadError(rolesErr ? rolesErr.message || 'Unable to load roles.' : null);
    if (!rolesErr) setRoles(rolesData ?? []);
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
      taxIdentificationNumber: settings?.taxIdentificationNumber,
      accreditationNumber: accreditationNumber.trim(),
      operatingHours: operatingHours.trim(),
      defaultSlotDurationMinutes: slotMinutes,
      queuePrefix: settings?.queuePrefix || 'Q',
      invoicePrefix: settings?.invoicePrefix || 'INV',
      defaultConsultationFee: fee,
      vatRate: settings?.vatRate ?? 0.12,
      letterheadHeader: letterheadHeader.trim(),
      letterheadAddress: letterheadAddress.trim(),
      letterheadContact: letterheadContact.trim(),
      preferredChartLayout,
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

  const maxStaffSeats = license?.limits?.maxStaff ?? null;
  const activeStaffCount = staff.filter((s) => s.isActive).length;

  // Compute readiness state
  const hasActiveLicense = Boolean(
    license &&
      license.status === 'Active' &&
      !license.isTampered &&
      (!license.expiresAtUtc || new Date(license.expiresAtUtc) > new Date()) &&
      (license.limits?.maxStaff ?? 0) > 0
  );
  const hasProfile = Boolean(clinicName?.trim() && (letterheadAddress?.trim() || letterheadContact?.trim()));
  const hasDoctor = staff.some((s) => s.isActive && s.role === 'Doctor' && Boolean(s.prcLicenseNumber?.trim()));
  const hasFrontDesk = staff.some((s) => s.isActive && (s.role === 'Receptionist' || s.role === 'Cashier' || s.role === 'Admin'));
  const hasServices = services.some((s) => s.isActive);
  const isFacilityReady = hasActiveLicense && hasProfile && hasDoctor && hasFrontDesk && hasServices;

  // Build Tabs based on RBAC authority
  const tabs = useMemo<SettingsTabItem[]>(() => {
    const list: SettingsTabItem[] = [];

    if (isAdmin) {
      list.push({
        key: 'readiness',
        label: 'Facility Readiness',
        icon: isFacilityReady ? 'checkCircle' : 'alertCircle',
        badge: isFacilityReady ? undefined : 'Setup Needed',
        adminOnly: true,
      });
    }

    list.push({
      key: 'general',
      label: 'General & Profile',
      icon: 'settings',
    });

    if (isAdmin || canManageStaff) {
      list.push({
        key: 'staff',
        label: 'Staff Directory & Roster',
        icon: 'staff',
        badge: maxStaffSeats != null ? `${activeStaffCount}/${maxStaffSeats}` : activeStaffCount,
        adminOnly: true,
      });
    }

    if (isAdmin || canManageRoles) {
      list.push({
        key: 'rbac',
        label: 'Access Control (RBAC)',
        icon: 'key',
        adminOnly: true,
      });
    }

    list.push({
      key: 'services',
      label: 'Services & Catalog',
      icon: 'clipboard',
      badge: services.length,
    });

    list.push({
      key: 'fields',
      label: 'Intake Fields',
      icon: 'patients',
    });

    list.push({
      key: 'philhealth',
      label: 'PhilHealth & Yakap',
      icon: 'yakap',
      badge: accreditationNumber?.trim() ? 'Linked' : undefined,
    });

    if (isAdmin) {
      list.push({
        key: 'license',
        label: 'Facility License',
        icon: 'key',
        adminOnly: true,
      });
    }

    return list;
  }, [
    isAdmin,
    canManageStaff,
    canManageRoles,
    isFacilityReady,
    maxStaffSeats,
    activeStaffCount,
    services.length,
    accreditationNumber,
  ]);

  const showSkeletons = loading && !refreshing;

  return (
    <ResponsiveLayout headerTitle="Settings & Configuration">
      <SettingsTabBar tabs={tabs} activeTab={activeTab} onSelectTab={setActiveTab} />

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.colors.primary]} />}
      >
        {activeTab === 'readiness' && (
          <FacilityReadinessTab
            license={license}
            clinicName={clinicName}
            letterheadAddress={letterheadAddress}
            letterheadContact={letterheadContact}
            accreditationNumber={accreditationNumber}
            staff={staff}
            services={services}
            roles={roles}
            onNavigateTab={setActiveTab}
            onOpenAddStaff={() => {
              setActiveTab('staff');
              setShowAddStaffModal(true);
            }}
            onOpenAddService={() => {
              setActiveTab('services');
              setShowAddServiceModal(true);
            }}
            onOpenLicenseModal={openActivationModal}
          />
        )}

        {activeTab === 'general' && (
          <GeneralSettingsTab
            preferredChartLayout={preferredChartLayout}
            setPreferredChartLayout={setPreferredChartLayout}
            clinicName={clinicName}
            setClinicName={setClinicName}
            accreditationNumber={accreditationNumber}
            setAccreditationNumber={setAccreditationNumber}
            operatingHours={operatingHours}
            setOperatingHours={setOperatingHours}
            slotDuration={slotDuration}
            setSlotDuration={setSlotDuration}
            consultationFee={consultationFee}
            setConsultationFee={setConsultationFee}
            letterheadHeader={letterheadHeader}
            setLetterheadHeader={setLetterheadHeader}
            letterheadAddress={letterheadAddress}
            setLetterheadAddress={setLetterheadAddress}
            letterheadContact={letterheadContact}
            setLetterheadContact={setLetterheadContact}
            savingSettings={savingSettings}
            onSavePreferences={handleSavePreferences}
            showSkeletons={showSkeletons}
            settingsLoadError={settingsLoadError}
            settings={settings}
            eodReport={eodReport}
            eodLoadError={eodLoadError}
            onRefreshEod={onRefresh}
            formatPeso={formatPeso}
          />
        )}

        {activeTab === 'staff' && (
          <StaffManagementTab
            staff={staff}
            setStaff={setStaff}
            roles={roles}
            staffLoadError={staffLoadError}
            showSkeletons={showSkeletons}
            activeStaffCount={activeStaffCount}
            maxStaffSeats={maxStaffSeats}
            onRefreshStaff={async () => {
              const [fresh] = await clinicService.getStaff();
              if (fresh) setStaff(fresh);
            }}
            showAddModal={showAddStaffModal}
            setShowAddModal={setShowAddStaffModal}
            onStaffAdded={async () => {
              await refreshLicense();
              await reloadStaffContext();
              const [fresh] = await clinicService.getStaff();
              if (fresh) setStaff(fresh);
            }}
          />
        )}

        {activeTab === 'rbac' && (
          <AccessControlTab
            roles={roles}
            onRefreshRoles={async () => {
              const [fresh] = await clinicService.getRoles();
              if (fresh) setRoles(fresh);
            }}
            loading={showSkeletons}
          />
        )}

        {activeTab === 'services' && (
          <ServicesCatalogTab
            services={services}
            setServices={setServices}
            servicesLoadError={servicesLoadError}
            showSkeletons={showSkeletons}
            onRefreshServices={async () => {
              const [fresh] = await clinicService.getServices();
              if (fresh) setServices(fresh);
            }}
            formatPeso={formatPeso}
            showAddModal={showAddServiceModal}
            setShowAddModal={setShowAddServiceModal}
          />
        )}

        {activeTab === 'fields' && (
          <CustomFieldsTab
            fields={customFields}
            setFields={setCustomFields}
            fieldsLoadError={fieldsLoadError}
            showSkeletons={showSkeletons}
            onRefreshFields={async () => {
              const [fresh] = await clinicService.getCustomFields('ClinicPatient');
              if (fresh) setCustomFields(fresh);
            }}
          />
        )}

        {activeTab === 'philhealth' && (
          <PhilHealthSettingsTab
            accreditationNumber={accreditationNumber}
            clinicName={clinicName}
          />
        )}

        {activeTab === 'license' && (
          <LicenseSystemTab
            license={license}
            clinicName={clinicName}
            activeStaffCount={activeStaffCount}
            maxStaffSeats={maxStaffSeats}
            onOpenActivationModal={openActivationModal}
            onRefreshLicense={refreshLicense}
          />
        )}
      </ScrollView>
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
});

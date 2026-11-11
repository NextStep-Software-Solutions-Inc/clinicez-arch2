import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { useNavigation, type StaticScreenProps } from '@react-navigation/native';
import { ResponsiveLayout } from '@layout';
import { theme } from '@constants/theme';
import { Alert, notify } from '@utils/feedback';
import { getDeviceItem, setDeviceItem } from '../../utils/deviceStorage';
import { usePersistedScrollPosition } from '../../hooks/usePersistedScrollPosition';
import { useFacilityLicense } from '../../components/FacilityActivationGate';
import { useClinic } from '../../context/ClinicContext';
import { useStaff } from '../../context/StaffContext';
import { usePermission, useAuth } from '../../context/AuthContext';
import { PERMISSIONS } from '../../constants/permissions';
import {
  clinicService,
  ClinicSettingsRecord,
  StaffMember,
  ClinicCustomFieldDefinition,
  ClinicServiceItem,
  ClinicRole,
} from '../../services/clinicService';

import SettingsTabBar from '../../components/settings/SettingsTabBar';
import SettingsVerticalRail from '../../components/settings/SettingsVerticalRail';
import GeneralSettingsTab from '../../components/settings/GeneralSettingsTab';
import DocumentTemplatesSettingsTab from '../../components/settings/DocumentTemplatesSettingsTab';
import FacilityReadinessTab from '../../components/settings/FacilityReadinessTab';
import StaffManagementTab from '../../components/settings/StaffManagementTab';
import AccessControlTab from '../../components/settings/AccessControlTab';
import ServicesCatalogTab from '../../components/settings/ServicesCatalogTab';
import CustomFieldsTab from '../../components/settings/CustomFieldsTab';
import PhilHealthSettingsTab from '../../components/settings/PhilHealthSettingsTab';
import LicenseSystemTab from '../../components/settings/LicenseSystemTab';
import SecuritySection from '../../components/settings/SecuritySection';
import AppUpdatesSettingsCard from '../../components/settings/AppUpdatesSettingsCard';
import WorkstationNodeDevSection from '../../components/settings/cards/WorkstationNodeDevSection';
import { Card, CardContent } from '../../components/ui/Card';
import { SkeletonList } from '../../components/ui/Skeleton';
import {
  SETTINGS_SECTION_CATALOG,
  SETTINGS_NAV_MODE_STORAGE_KEY,
  SETTINGS_VERTICAL_RAIL_MIN_WIDTH,
  type SettingsTabItem,
  type SettingsTabKey,
  type SettingsNavMode,
  type SettingsRouteParams,
  buildSyncedSettingsRouteParams,
  filterSettingsTabs,
  isGeneralSettingsSectionKey,
  readInitialSettingsTabFromSearch,
  resolveEffectiveSettingsNavMode,
  resolveSettingsRouteIntent,
} from '../../components/settings/types';
import { formatPeso } from '../../components/settings/common';

export {
  type SettingsRouteParams,
  SETTINGS_NAV_MODE_STORAGE_KEY,
  SETTINGS_VERTICAL_RAIL_MIN_WIDTH,
  buildSyncedSettingsRouteParams,
  resolveEffectiveSettingsNavMode,
  resolveSettingsRouteIntent,
};

export function readInitialSettingsTabFromUrl(search?: string | null): SettingsTabKey | null {
  const rawSearch =
    search !== undefined
      ? search
      : Platform.OS === 'web' && typeof window !== 'undefined'
      ? window.location?.search
      : null;
  return readInitialSettingsTabFromSearch(rawSearch);
}

export type SettingsScreenProps = StaticScreenProps<SettingsRouteParams | undefined>;

const sanitizeLegacyDefault = (val?: string | null): string => {
  if (!val) return '';
  const trimmed = val.trim();
  if (trimmed === 'Mon-Sat 8:00 AM - 5:00 PM') return '';
  return trimmed;
};

export default function SettingsScreen({ route }: Partial<SettingsScreenProps> = {}) {
  const navigation = useNavigation<any>();
  const { width: viewportWidth } = useWindowDimensions();

  const incomingTab = route?.params?.tab;
  const incomingOpenAddStaff = route?.params?.openAddStaff;

  const initialIntent = useMemo(() => {
    const routeIntent = resolveSettingsRouteIntent({
      tab: incomingTab,
      openAddStaff: incomingOpenAddStaff,
    });
    if (routeIntent.targetTab || routeIntent.shouldOpenAddStaff) {
      return routeIntent;
    }
    const urlTab = readInitialSettingsTabFromUrl();
    return {
      targetTab: urlTab,
      shouldOpenAddStaff: false,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { license, openActivationModal, refreshLicense } = useFacilityLicense();
  const { refresh: refreshClinic, updateSettings: updateClinicSettings } = useClinic();
  const { reload: reloadStaffContext } = useStaff();
  const { user } = useAuth();
  const canManageSettings = usePermission(PERMISSIONS.settingsManage);
  const canManageStaff = usePermission(PERMISSIONS.staffManage);
  const canManageRoles = usePermission(PERMISSIONS.rolesManage);
  const isAdmin = canManageSettings || canManageStaff || user?.role === 'Admin';

  const [activeTab, setActiveTab] = useState<SettingsTabKey>(
    () => initialIntent.targetTab ?? 'general'
  );
  const [filterQuery, setFilterQuery] = useState('');
  const [loading, setLoading] = useState(true);

  const activeTabRef = useRef<SettingsTabKey>(activeTab);
  activeTabRef.current = activeTab;

  const {
    scrollViewRef,
    onScroll: handleCanvasScroll,
    onContentSizeChange: handleCanvasContentSizeChange,
    resetScrollPosition,
  } = usePersistedScrollPosition({
    storageKey: `clinicez.scroll.settings.${activeTab}`,
    ready: !loading,
  });

  const lastIncomingTabRef = useRef<string | undefined>(initialIntent.targetTab ?? incomingTab);
  const prevIncomingTabRef = useRef<string | undefined>(incomingTab);
  const pendingSyncedTabsRef = useRef<SettingsTabKey[]>([]);
  const isInitialRouteSyncRef = useRef(true);

  // Persisted Navigation Mode ('vertical' | 'horizontal')
  const [preferredNavMode, setPreferredNavMode] = useState<SettingsNavMode>(() => {
    const stored = getDeviceItem(SETTINGS_NAV_MODE_STORAGE_KEY);
    return stored === 'horizontal' || stored === 'vertical' ? stored : 'vertical';
  });

  const canUseVerticalRail = viewportWidth >= SETTINGS_VERTICAL_RAIL_MIN_WIDTH;
  const effectiveNavMode = resolveEffectiveSettingsNavMode(preferredNavMode, viewportWidth);

  const handleChangeNavMode = useCallback((nextMode: SettingsNavMode) => {
    setPreferredNavMode(nextMode);
    setDeviceItem(SETTINGS_NAV_MODE_STORAGE_KEY, nextMode);
  }, []);

  const syncTabToNavigation = useCallback(
    (nextTab: SettingsTabKey) => {
      navigation?.setParams?.(buildSyncedSettingsRouteParams(nextTab));
      if (
        Platform.OS === 'web' &&
        typeof window !== 'undefined' &&
        window.history &&
        typeof window.history.replaceState === 'function'
      ) {
        try {
          const url = new URL(window.location.href);
          if (url.pathname.toLowerCase().includes('settings')) {
            url.searchParams.set('tab', nextTab);
            url.searchParams.delete('openAddStaff');
            window.history.replaceState(window.history.state, '', url.toString());
          }
        } catch {
          // Ignore malformed environment URLs in non-browser test runners
        }
      }
    },
    [navigation]
  );

  const handleSelectTab = useCallback(
    (nextTab: SettingsTabKey) => {
      lastIncomingTabRef.current = nextTab;
      pendingSyncedTabsRef.current = [...pendingSyncedTabsRef.current.slice(-4), nextTab];
      if (activeTabRef.current !== nextTab) {
        resetScrollPosition(`clinicez.scroll.settings.${nextTab}`);
      }
      setActiveTab(nextTab);
      syncTabToNavigation(nextTab);
    },
    [resetScrollPosition, syncTabToNavigation]
  );

  // Core Data States
  const [settings, setSettings] = useState<ClinicSettingsRecord | null>(null);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [roles, setRoles] = useState<ClinicRole[]>([]);
  const [customFields, setCustomFields] = useState<ClinicCustomFieldDefinition[]>([]);
  const [services, setServices] = useState<ClinicServiceItem[]>([]);

  // Loading & Error States
  const [refreshing, setRefreshing] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  const [settingsLoadError, setSettingsLoadError] = useState<string | null>(null);
  const [staffLoadError, setStaffLoadError] = useState<string | null>(null);
  const [fieldsLoadError, setFieldsLoadError] = useState<string | null>(null);
  const [servicesLoadError, setServicesLoadError] = useState<string | null>(null);

  // Form states for general clinic profile
  const [clinicName, setClinicName] = useState('');
  const [accreditationNumber, setAccreditationNumber] = useState('');
  const [operatingHours, setOperatingHours] = useState('');
  const [slotDuration, setSlotDuration] = useState('');
  const [consultationFee, setConsultationFee] = useState('');
  const [letterheadHeader, setLetterheadHeader] = useState('');
  const [letterheadAddress, setLetterheadAddress] = useState('');
  const [letterheadContact, setLetterheadContact] = useState('');
  const [preferredChartLayout, setPreferredChartLayout] = useState<'modal' | 'split' | 'drawer' | undefined>(undefined);
  const [specialtyMode, setSpecialtyMode] = useState<'Medical' | 'Dental' | 'Multi-Specialty' | undefined>(undefined);
  const [enableDentalModule, setEnableDentalModule] = useState<boolean | undefined>(undefined);
  const [cashierMode, setCashierMode] = useState<'ClinicDesk' | 'CashierCounter' | undefined>(undefined);

  // Modals for sub-components
  const [showAddStaffModal, setShowAddStaffModal] = useState<boolean>(() => initialIntent.shouldOpenAddStaff);
  const [showAddServiceModal, setShowAddServiceModal] = useState(false);

  // Sync incoming route params WITHOUT clearing `tab` (fixes GitHub Issue #163)
  // Guarded via `lastIncomingTabRef` / `prevIncomingTabRef` with `activeTab` omitted from deps
  // so clicking tabs never snaps backward while `route.params.tab` lags behind.
  useEffect(() => {
    const intent = resolveSettingsRouteIntent({
      tab: incomingTab,
      openAddStaff: incomingOpenAddStaff,
    });

    if (isInitialRouteSyncRef.current) {
      isInitialRouteSyncRef.current = false;
      prevIncomingTabRef.current = incomingTab;
      if (intent.shouldOpenAddStaff) {
        const preservedTab = intent.targetTab ?? 'staff';
        lastIncomingTabRef.current = preservedTab;
        setActiveTab(preservedTab);
        setShowAddStaffModal(true);
        syncTabToNavigation(preservedTab);
      } else if (initialIntent.targetTab) {
        lastIncomingTabRef.current = initialIntent.targetTab;
        syncTabToNavigation(initialIntent.targetTab);
      }
      return;
    }

    const didIncomingTabChange = incomingTab !== prevIncomingTabRef.current;
    prevIncomingTabRef.current = incomingTab;

    if (intent.shouldOpenAddStaff) {
      const preservedTab = intent.targetTab ?? 'staff';
      lastIncomingTabRef.current = preservedTab;
      pendingSyncedTabsRef.current = [];
      setActiveTab(preservedTab);
      setShowAddStaffModal(true);
      syncTabToNavigation(preservedTab);
      return;
    }

    if (didIncomingTabChange && intent.targetTab) {
      const pendingIdx = pendingSyncedTabsRef.current.indexOf(intent.targetTab);
      if (pendingIdx !== -1) {
        pendingSyncedTabsRef.current = pendingSyncedTabsRef.current.slice(pendingIdx + 1);
        return;
      }

      if (intent.targetTab !== lastIncomingTabRef.current) {
        pendingSyncedTabsRef.current = [];
        lastIncomingTabRef.current = intent.targetTab;
        setActiveTab(intent.targetTab);
        syncTabToNavigation(intent.targetTab);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomingTab, incomingOpenAddStaff]);

  const loadAll = useCallback(async () => {
    const [
      [settingsData, settingsErr],
      [staffData, staffErr],
      [customFieldsData, fieldsErr],
      [servicesData, servicesErr],
      [rolesData, rolesErr],
    ] = await Promise.all([
      clinicService.getSettings(),
      clinicService.getStaff(),
      clinicService.getCustomFields('ClinicPatient'),
      clinicService.getServices(),
      clinicService.getRoles(),
    ]);

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
      if (settingsData.specialtyMode) {
        const mode = settingsData.specialtyMode === 'MultiSpecialty' ? 'Multi-Specialty' : settingsData.specialtyMode;
        setSpecialtyMode(mode as 'Medical' | 'Dental' | 'Multi-Specialty');
      }
      if (settingsData.enableDentalModule !== undefined) {
        setEnableDentalModule(settingsData.enableDentalModule);
      }
      if (settingsData.cashierMode) {
        setCashierMode(settingsData.cashierMode as 'ClinicDesk' | 'CashierCounter');
      }
    }

    setStaffLoadError(staffErr ? staffErr.message || 'Unable to load staff.' : null);
    if (!staffErr) setStaff(staffData ?? []);

    setFieldsLoadError(fieldsErr ? fieldsErr.message || 'Unable to load custom fields.' : null);
    if (!fieldsErr) setCustomFields(customFieldsData ?? []);

    setServicesLoadError(servicesErr ? servicesErr.message || 'Unable to load the service catalog.' : null);
    if (!servicesErr) setServices(servicesData ?? []);

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

  const handleSettingsUpdated = useCallback(
    (updated: ClinicSettingsRecord) => {
      setSettings(updated);
      updateClinicSettings(updated);
      void refreshClinic();
    },
    [updateClinicSettings, refreshClinic]
  );

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
      queuePrefix: settings?.queuePrefix ?? '',
      invoicePrefix: settings?.invoicePrefix ?? '',
      defaultConsultationFee: fee,
      vatRate: settings?.vatRate,
      letterheadHeader: letterheadHeader.trim(),
      letterheadAddress: letterheadAddress.trim(),
      letterheadContact: letterheadContact.trim(),
      preferredChartLayout: preferredChartLayout ?? settings?.preferredChartLayout,
      specialtyMode: specialtyMode ?? (settings?.specialtyMode as any),
      enableDentalModule:
        specialtyMode === 'Dental'
          ? true
          : enableDentalModule ?? settings?.enableDentalModule,
      cashierMode: cashierMode ?? settings?.cashierMode,
    });
    setSavingSettings(false);

    if (err) {
      notify.error(err.message || 'Could not save settings.');
      return;
    }
    if (saved) {
      setSettings(saved);
      setClinicName(saved.clinicName ?? '');
      setAccreditationNumber(saved.accreditationNumber ?? '');
      setOperatingHours(sanitizeLegacyDefault(saved.operatingHours));
      setSlotDuration(
        saved.defaultSlotDurationMinutes != null ? String(saved.defaultSlotDurationMinutes) : ''
      );
      setConsultationFee(
        saved.defaultConsultationFee != null ? String(saved.defaultConsultationFee) : ''
      );
      setLetterheadHeader(saved.letterheadHeader ?? '');
      setLetterheadAddress(saved.letterheadAddress ?? '');
      setLetterheadContact(saved.letterheadContact ?? '');
      updateClinicSettings(saved);
    }
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
  const hasOperatingHours = Boolean(operatingHours && operatingHours.trim().length > 0);
  const hasDoctor = staff.some((s) => s.isActive && s.role === 'Doctor' && Boolean(s.prcLicenseNumber?.trim()));
  const hasFrontDesk = staff.some((s) => s.isActive && (s.role === 'Receptionist' || s.role === 'Cashier' || s.role === 'Admin'));
  const hasServices = services.some((s) => s.isActive);
  const isFacilityReady = hasActiveLicense && hasProfile && hasOperatingHours && hasDoctor && hasFrontDesk && hasServices;

  const [publishingLoading, setPublishingLoading] = useState(false);
  const [pauseLoading, setPauseLoading] = useState(false);

  const handleTogglePublishDirectory = async (nextValue: boolean) => {
    if (!settings) return;
    const prevPublished = settings.isDirectoryPublished ?? false;
    setSettings((prev) => (prev ? { ...prev, isDirectoryPublished: nextValue } : null));
    setPublishingLoading(true);

    const [result, err] = await clinicService.publishToDirectory(nextValue);
    setPublishingLoading(false);

    if (err || !result?.success) {
      setSettings((prev) => (prev ? { ...prev, isDirectoryPublished: prevPublished } : null));
      notify.error(err?.message || result?.message || 'Failed to update patient directory status.');
      return;
    }

    const updatedPublishedSettings = (result as any).settings ?? (settings ? { ...settings, isDirectoryPublished: result.isPublished } : null);
    if (updatedPublishedSettings) {
      setSettings(updatedPublishedSettings);
      updateClinicSettings(updatedPublishedSettings);
      void refreshClinic();
    } else {
      setSettings((prev) =>
        prev
          ? {
              ...prev,
              isDirectoryPublished: result.isPublished,
            }
          : null
      );
      void refreshClinic();
    }
    notify.success(
      result.isPublished
        ? 'Facility is now published to the Patient App directory.'
        : 'Facility has been unpublished from the Patient App directory.'
    );
  };

  const handleToggleBookingPause = async (nextValue: boolean) => {
    if (!settings) return;
    const prevPaused = settings.isOnlineBookingPaused ?? false;
    setSettings((prev) => (prev ? { ...prev, isOnlineBookingPaused: nextValue } : null));
    setPauseLoading(true);

    const [result, err] = await clinicService.toggleBookingPause(nextValue);
    setPauseLoading(false);

    if (err || !result?.success) {
      setSettings((prev) => (prev ? { ...prev, isOnlineBookingPaused: prevPaused } : null));
      notify.error(err?.message || result?.message || 'Failed to update booking pause status.');
      return;
    }

    const updatedPausedSettings = (result as any).settings ?? (settings ? { ...settings, isOnlineBookingPaused: result.isPaused } : null);
    if (updatedPausedSettings) {
      setSettings(updatedPausedSettings);
      updateClinicSettings(updatedPausedSettings);
      void refreshClinic();
    } else {
      setSettings((prev) =>
        prev
          ? {
              ...prev,
              isOnlineBookingPaused: result.isPaused,
            }
          : null
      );
      void refreshClinic();
    }
    notify.success(
      result.isPaused
        ? 'Online patient bookings are now paused.'
        : 'Online patient bookings are now active.'
    );
  };


  const showSkeletons = loading && !refreshing;

  // Build all 14 categorized sections respecting RBAC authority (omitting 0/fallback badges while loading)
  const tabs = useMemo<SettingsTabItem[]>(() => {
    const isPhilHealthConfigured = Boolean(settings?.isPhilHealthConfigured);
    const hasAccreditation = Boolean(accreditationNumber?.trim());
    const philHealthBadge = !hasAccreditation
      ? undefined
      : isPhilHealthConfigured
      ? 'Linked'
      : 'Pending';

    const list: SettingsTabItem[] = [];

    for (const group of SETTINGS_SECTION_CATALOG) {
      for (const section of group.sections) {
        if (section.key === 'readiness' && !isAdmin) continue;
        if (section.key === 'staff' && !(isAdmin || canManageStaff)) continue;
        if (section.key === 'rbac' && !(isAdmin || canManageRoles)) continue;
        if (section.key === 'license' && !isAdmin) continue;

        let icon = section.icon;
        let badge: string | number | undefined;

        if (!showSkeletons) {
          if (section.key === 'readiness') {
            icon = isFacilityReady ? 'checkCircle' : 'alertCircle';
            badge = isFacilityReady ? undefined : 'Setup Needed';
          } else if (section.key === 'services') {
            badge = services.length;
          } else if (section.key === 'fields') {
            badge = customFields.length > 0 ? customFields.length : undefined;
          } else if (section.key === 'philhealth') {
            badge = philHealthBadge;
          } else if (section.key === 'staff') {
            badge = maxStaffSeats != null ? `${activeStaffCount}/${maxStaffSeats}` : activeStaffCount;
          }
        }

        list.push({
          key: section.key,
          label: section.label,
          icon,
          badge,
          adminOnly: section.adminOnly,
          groupKey: section.groupKey,
          groupLabel: section.groupLabel,
          description: section.description,
          keywords: section.keywords,
        });
      }
    }

    return list;
  }, [
    showSkeletons,
    isAdmin,
    canManageStaff,
    canManageRoles,
    isFacilityReady,
    maxStaffSeats,
    activeStaffCount,
    services.length,
    customFields.length,
    accreditationNumber,
    settings?.isPhilHealthConfigured,
  ]);

  // Guard activeTab against RBAC-hidden tabs
  useEffect(() => {
    if (tabs.length > 0 && !tabs.some((t) => t.key === activeTab)) {
      const fallback = tabs.find((t) => t.key === 'general')?.key ?? tabs[0].key;
      lastIncomingTabRef.current = fallback;
      setActiveTab(fallback);
      syncTabToNavigation(fallback);
    }
  }, [tabs, activeTab, syncTabToNavigation]);

  // Auto-focus first matching section when instant filter narrows out activeTab
  const handleFilterChange = useCallback(
    (nextQuery: string) => {
      setFilterQuery(nextQuery);
      const trimmed = nextQuery.trim();
      if (!trimmed) return;
      const matches = filterSettingsTabs(tabs, trimmed);
      if (matches.length > 0 && !matches.some((m) => m.key === activeTab)) {
        handleSelectTab(matches[0].key);
      }
    },
    [tabs, activeTab, handleSelectTab]
  );

  const renderSectionCanvas = () => {
    if (isGeneralSettingsSectionKey(activeTab)) {
      return (
        <GeneralSettingsTab
          activeSection={activeTab}
          filterQuery={filterQuery}
          onNavigateBilling={() => navigation.navigate('Billing')}
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
          onRefreshEod={onRefresh}
          formatPeso={formatPeso}
          onNavigatePatients={() => navigation.navigate('Patients')}
          specialtyMode={specialtyMode}
          setSpecialtyMode={setSpecialtyMode}
          enableDentalModule={enableDentalModule}
          setEnableDentalModule={setEnableDentalModule}
          cashierMode={cashierMode}
          setCashierMode={setCashierMode}
          onSettingsUpdated={handleSettingsUpdated}
        />
      );
    }

    switch (activeTab) {
      case 'readiness':
        return (
          <FacilityReadinessTab
            license={license}
            clinicName={clinicName}
            letterheadAddress={letterheadAddress}
            letterheadContact={letterheadContact}
            accreditationNumber={accreditationNumber}
            isPhilHealthConfigured={settings?.isPhilHealthConfigured}
            operatingHours={operatingHours}
            staff={staff}
            services={services}
            roles={roles}
            isDirectoryPublished={settings?.isDirectoryPublished ?? false}
            isOnlineBookingPaused={settings?.isOnlineBookingPaused ?? false}
            isWorkspaceEligible={settings?.isWorkspaceEligible ?? false}
            onTogglePublishDirectory={handleTogglePublishDirectory}
            onToggleBookingPause={handleToggleBookingPause}
            isPublishingMutating={publishingLoading}
            isBookingPauseMutating={pauseLoading}
            showSkeletons={showSkeletons}
            onNavigateTab={handleSelectTab}
            onOpenAddStaff={() => {
              handleSelectTab('staff');
              setShowAddStaffModal(true);
            }}
            onOpenAddService={() => {
              handleSelectTab('services');
              setShowAddServiceModal(true);
            }}
            onOpenLicenseModal={openActivationModal}
          />
        );

      case 'documents':
        return (
          <DocumentTemplatesSettingsTab
            settings={settings}
            showSkeletons={showSkeletons}
            settingsLoadError={settingsLoadError}
            onSettingsUpdated={handleSettingsUpdated}
            onRefreshSettings={async () => {
              const [fresh] = await clinicService.getSettings();
              if (fresh) setSettings(fresh);
            }}
          />
        );

      case 'staff':
        return (
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
        );

      case 'rbac':
        return (
          <AccessControlTab
            roles={roles}
            onRefreshRoles={async () => {
              const [fresh] = await clinicService.getRoles();
              if (fresh) setRoles(fresh);
            }}
            loading={showSkeletons}
          />
        );

      case 'services':
        return (
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
        );

      case 'fields':
        return (
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
        );

      case 'philhealth':
        if (showSkeletons) {
          return (
            <Card testID="philhealth-tab-skeleton">
              <CardContent>
                <SkeletonList rows={4} />
              </CardContent>
            </Card>
          );
        }
        return (
          <PhilHealthSettingsTab
            accreditationNumber={accreditationNumber}
            clinicName={clinicName}
            settings={settings}
            onSettingsUpdated={(updated) => {
              handleSettingsUpdated(updated);
              if (updated.accreditationNumber !== undefined) {
                setAccreditationNumber(updated.accreditationNumber || '');
              }
            }}
          />
        );

      case 'license':
        if (showSkeletons) {
          return (
            <Card testID="license-tab-skeleton">
              <CardContent>
                <SkeletonList rows={4} />
              </CardContent>
            </Card>
          );
        }
        return (
          <View style={styles.licenseStack}>
            <LicenseSystemTab
              license={license}
              clinicName={clinicName}
              activeStaffCount={activeStaffCount}
              maxStaffSeats={maxStaffSeats}
              onOpenActivationModal={openActivationModal}
              onRefreshLicense={refreshLicense}
            />
            {isAdmin ? (
              <WorkstationNodeDevSection
                filterQuery={filterQuery}
                onNavigatePatients={() => navigation.navigate('Patients')}
              />
            ) : null}
            {Platform.OS !== 'web' ? (
              <>
                <SecuritySection />
                <AppUpdatesSettingsCard />
              </>
            ) : null}
          </View>
        );

      default:
        return null;
    }
  };

  return (
    <ResponsiveLayout headerTitle="Clinic Settings">
      {effectiveNavMode === 'vertical' ? (
        <View style={styles.verticalBody}>
          <SettingsVerticalRail
            tabs={tabs}
            activeTab={activeTab}
            onSelectTab={handleSelectTab}
            filterQuery={filterQuery}
            onChangeFilterQuery={handleFilterChange}
            navMode={effectiveNavMode}
            onChangeNavMode={handleChangeNavMode}
          />
          <ScrollView
            ref={scrollViewRef}
            style={styles.container}
            contentContainerStyle={styles.content}
            onScroll={handleCanvasScroll}
            onContentSizeChange={handleCanvasContentSizeChange}
            scrollEventThrottle={100}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                colors={[theme.colors.primary]}
              />
            }
          >
            {renderSectionCanvas()}
          </ScrollView>
        </View>
      ) : (
        <View style={styles.horizontalBody}>
          <SettingsTabBar
            tabs={tabs}
            activeTab={activeTab}
            onSelectTab={handleSelectTab}
            filterQuery={filterQuery}
            onChangeFilterQuery={handleFilterChange}
            navMode={effectiveNavMode}
            onChangeNavMode={handleChangeNavMode}
            canSwitchNavMode={canUseVerticalRail}
          />
          <ScrollView
            ref={scrollViewRef}
            style={styles.container}
            contentContainerStyle={styles.content}
            onScroll={handleCanvasScroll}
            onContentSizeChange={handleCanvasContentSizeChange}
            scrollEventThrottle={100}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                colors={[theme.colors.primary]}
              />
            }
          >
            {renderSectionCanvas()}
          </ScrollView>
        </View>
      )}
    </ResponsiveLayout>
  );
}

const styles = StyleSheet.create({
  verticalBody: {
    flex: 1,
    width: '100%',
    minWidth: 0,
    flexDirection: 'row',
    backgroundColor: theme.colors.background,
  },
  horizontalBody: {
    flex: 1,
    width: '100%',
    minWidth: 0,
    flexDirection: 'column',
    backgroundColor: theme.colors.background,
  },
  container: {
    flex: 1,
    minWidth: 0,
    backgroundColor: theme.colors.background,
    ...(Platform.OS === 'web' ? ({ scrollbarGutter: 'stable' } as any) : {}),
  },
  content: {
    width: '100%',
    minWidth: 0,
    alignSelf: 'stretch',
    padding: theme.spacing.xl,
    gap: theme.spacing.lg,
  },
  licenseStack: {
    width: '100%',
    minWidth: 0,
    alignSelf: 'stretch',
    gap: theme.spacing.lg,
  },
});

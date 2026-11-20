import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { Card, CardContent, CardHeader } from '../ui/Card';
import { SkeletonList } from '../ui/Skeleton';
import ThemedText from '../ui/ThemedText';
import Badge from '../ui/Badge';
import Select, { type SelectOption } from '../ui/Select';
import EmptyState from '../ui/EmptyState';
import ErrorState from '../ui/ErrorState';
import Icon from '../ui/Icon';
import { theme } from '../../constants/theme';
import { clinicService, DailyEodReport, ClinicSettingsRecord, ClinicServiceItem, type PlatformVerificationStatus } from '../../services/clinicService';
import { type ChartLayoutMode } from '../chart/types';
import { type GeneralSettingsSectionKey } from './types';
import { notify } from '../../utils/feedback';
import JoinLinkSettingsCard from './JoinLinkSettingsCard';
import PatientSearchConfigSection from './PatientSearchConfigSection';
import EodReconciliationSettingsCard from './EodReconciliationSettingsCard';
import WaitingAreaTvSettingsCard from './WaitingAreaTvSettingsCard';
import NotificationSettingsCard from './NotificationSettingsCard';
import AppointmentReminderSettingsCard from './AppointmentReminderSettingsCard';
import QueueCallingSettingsCard from './QueueCallingSettingsCard';
import { ClinicRoomsSettingsCard } from './ClinicRoomsSettingsCard';
import ColorBrandingSection from './ColorBrandingSection';
import RegionalDateTimeSettingsCard from './RegionalDateTimeSettingsCard';
import CashierStationSettingsCard, { CASHIER_MODE_OPTIONS, type CashierModeOption } from './CashierStationSettingsCard';
import FacilityIdentityCard from './cards/FacilityIdentityCard';
import ScheduleConsultationCard from './cards/ScheduleConsultationCard';
import OfficialLetterheadCard from './cards/OfficialLetterheadCard';
import ClinicLogoSpecimenCard from './cards/ClinicLogoSpecimenCard';
import ClinicalSpecialtyCard, {
  CLINIC_SPECIALTY_OPTIONS,
  normalizeSpecialtyMode,
  resolveSpecialtyDentalState,
  type ClinicSpecialtyMode,
  type SpecialtyOption,
} from './cards/ClinicalSpecialtyCard';
import ChartLayoutDefaultCard, {
  PLAIN_CHART_VIEW_OPTIONS,
  buildChartLayoutSavePayload,
  type PlainChartViewOption,
} from './cards/ChartLayoutDefaultCard';
import BillingLiveShortcutCard, {
  isBillingShortcutEnabled,
  type BillingShortcutEligibilityInput,
} from './cards/BillingLiveShortcutCard';

export {
  CASHIER_MODE_OPTIONS,
  type CashierModeOption,
  CLINIC_SPECIALTY_OPTIONS,
  normalizeSpecialtyMode,
  resolveSpecialtyDentalState,
  type ClinicSpecialtyMode,
  type SpecialtyOption,
  PLAIN_CHART_VIEW_OPTIONS,
  type PlainChartViewOption,
  buildChartLayoutSavePayload,
  isBillingShortcutEnabled,
  type BillingShortcutEligibilityInput,
};

export interface GeneralSettingsTabProps {
  activeSection?: GeneralSettingsSectionKey;
  filterQuery?: string;
  canAccessBilling?: boolean;
  onNavigateBilling?: () => void;
  onSettingsUpdated?: (updated: ClinicSettingsRecord) => void;
  preferredChartLayout?: string;
  setPreferredChartLayout?: (v: ChartLayoutMode) => void;
  clinicName: string;
  setClinicName: (v: string) => void;
  accreditationNumber: string;
  setAccreditationNumber: (v: string) => void;
  operatingHours: string;
  setOperatingHours: (v: string) => void;
  slotDuration: string;
  setSlotDuration: (v: string) => void;
  consultationFee: string;
  setConsultationFee: (v: string) => void;
  letterheadHeader: string;
  setLetterheadHeader: (v: string) => void;
  letterheadAddress: string;
  setLetterheadAddress: (v: string) => void;
  letterheadContact: string;
  setLetterheadContact: (v: string) => void;
  savingSettings: boolean;
  onSavePreferences: () => Promise<void>;
  showSkeletons: boolean;
  settingsLoadError: string | null;
  settings: ClinicSettingsRecord | null;
  eodReport?: DailyEodReport | null;
  eodLoadError?: string | null;
  onRefreshEod?: () => Promise<void>;
  formatPeso?: (v: number | undefined | null) => string;
  onNavigatePatients?: () => void;
  specialtyMode?: ClinicSpecialtyMode;
  setSpecialtyMode?: (v: ClinicSpecialtyMode) => void;
  enableDentalModule?: boolean;
  setEnableDentalModule?: (v: boolean) => void;
  cashierMode?: 'ClinicDesk' | 'CashierCounter';
  setCashierMode?: (v: 'ClinicDesk' | 'CashierCounter') => void;
  platformVerificationStatus?: PlatformVerificationStatus;
  onRefreshVerificationState?: () => Promise<void>;
  services?: ClinicServiceItem[];
  servicesLoadError?: string | null;
  onRefreshServices?: () => Promise<void>;
}

export default function GeneralSettingsTab(props: GeneralSettingsTabProps) {
  const { activeSection, settings, showSkeletons, savingSettings, onSettingsUpdated, onRefreshEod } = props;
  const [internalCashierMode, setInternalCashierMode] = useState<'ClinicDesk' | 'CashierCounter' | undefined>(
    () => props.cashierMode ?? settings?.cashierMode
  );
  const [savingCashierMode, setSavingCashierMode] = useState(false);

  const [fallbackServices, setFallbackServices] = useState<ClinicServiceItem[]>([]);
  const [loadingFallbackServices, setLoadingFallbackServices] = useState(false);
  const [fallbackServicesError, setFallbackServicesError] = useState<string | null>(null);
  const [savingScreeningService, setSavingScreeningService] = useState(false);

  useEffect(() => {
    if (settings?.cashierMode) setInternalCashierMode(settings.cashierMode);
  }, [settings?.cashierMode]);

  const loadFallbackServices = useCallback(async () => {
    setLoadingFallbackServices(true);
    setFallbackServicesError(null);
    try {
      const [data, err] = await clinicService.getServices(undefined, true);
      if (err) {
        setFallbackServicesError(err.message || 'Unable to load clinic services.');
      } else {
        setFallbackServices(data ?? []);
      }
    } catch {
      setFallbackServicesError('Unable to load clinic services.');
    } finally {
      setLoadingFallbackServices(false);
    }
  }, []);

  useEffect(() => {
    if (props.services === undefined && !showSkeletons && (!activeSection || activeSection === 'clinical')) {
      void loadFallbackServices();
    }
  }, [props.services, showSkeletons, activeSection, loadFallbackServices]);

  const resolvedServices = props.services ?? fallbackServices;
  const activeServices = useMemo(
    () => resolvedServices.filter((s) => s.isActive),
    [resolvedServices]
  );
  const effectiveServicesError =
    props.services !== undefined ? (props.servicesLoadError ?? null) : fallbackServicesError;

  const serviceOptions: SelectOption[] = useMemo(
    () =>
      activeServices.map((s) => ({
        label: `${s.name} (${s.code})`,
        value: s.id,
        description: s.description || `${s.category} · ₱${s.standardPrice.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`,
        badge: s.category,
        category: s.category,
      })),
    [activeServices]
  );

  const orphanedServiceItem = useMemo(() => {
    const configuredId = settings?.defaultHealthScreeningServiceItemId;
    if (!configuredId || activeServices.length === 0) return null;
    if (activeServices.some((s) => s.id === configuredId)) return null;
    return resolvedServices.find((s) => s.id === configuredId) ?? { id: configuredId };
  }, [settings?.defaultHealthScreeningServiceItemId, activeServices, resolvedServices]);

  const selectedScreeningItemId = useMemo(() => {
    if (settings?.defaultHealthScreeningServiceItemId) {
      if (activeServices.some((s) => s.id === settings.defaultHealthScreeningServiceItemId)) {
        return settings.defaultHealthScreeningServiceItemId;
      }
      return '';
    }
    const targetCode = (settings?.defaultHealthScreeningServiceCode || 'HEALTH-SCREEN').toUpperCase();
    const match = activeServices.find((s) => s.code.toUpperCase() === targetCode);
    return match?.id ?? '';
  }, [settings?.defaultHealthScreeningServiceItemId, settings?.defaultHealthScreeningServiceCode, activeServices]);

  const resolvedScreeningCode = useMemo(() => {
    const match = activeServices.find((s) => s.id === selectedScreeningItemId);
    return match?.code || settings?.defaultHealthScreeningServiceCode || 'HEALTH-SCREEN';
  }, [activeServices, selectedScreeningItemId, settings?.defaultHealthScreeningServiceCode]);

  const handleSelectHealthScreeningService = useCallback(
    async (serviceItemId: string) => {
      if (savingScreeningService) return;
      const chosen = activeServices.find((s) => s.id === serviceItemId) ?? null;
      const nextCode = chosen?.code ?? 'HEALTH-SCREEN';
      setSavingScreeningService(true);
      try {
        const [updated, err] = await clinicService.updateSettings({
          defaultHealthScreeningServiceItemId: chosen ? chosen.id : null,
          defaultHealthScreeningServiceCode: nextCode,
        });
        if (err || !updated) {
          notify.error(err?.message || 'Failed to update default health screening service item.');
          return;
        }
        notify.success(
          chosen
            ? `Default health screening item set to ${chosen.name} (${chosen.code}).`
            : 'Reset default health screening service code to HEALTH-SCREEN.'
        );
        onSettingsUpdated?.(updated);
      } catch {
        notify.error('Failed to update default health screening service item.');
      } finally {
        setSavingScreeningService(false);
      }
    },
    [activeServices, onSettingsUpdated, savingScreeningService]
  );

  const resolvedCashierMode = props.cashierMode ?? internalCashierMode;
  const stationCashierMode = resolvedCashierMode ?? 'ClinicDesk';

  const handleSaveCashierMode = async () => {
    setSavingCashierMode(true);
    const [updated, err] = await clinicService.updateSettings({ cashierMode: stationCashierMode });
    setSavingCashierMode(false);
    if (err || !updated) {
      notify.error(err?.message || 'Failed to update billing and cashier station settings.');
      return;
    }
    notify.success('Billing & Cashier station preferences saved.');
    onSettingsUpdated?.(updated);
  };

  const show = (key: GeneralSettingsSectionKey) => !activeSection || activeSection === key;
  const profileError = props.settingsLoadError && !settings ? props.settingsLoadError : null;
  const renderSkeletonCard = (testID?: string) => (
    <Card style={styles.fullWidthCard} testID={testID}>
      <CardContent>
        <SkeletonList rows={3} />
      </CardContent>
    </Card>
  );

  return (
    <View style={styles.constrainedContainer} testID="general-settings-constrained-root">
      {show('general') ? (
        <View style={styles.sectionStack} testID="settings-section-general">
          <FacilityIdentityCard {...props} errorMessage={profileError} onRetry={onRefreshEod} />
          {!profileError ? (
            <>
              <ScheduleConsultationCard {...props} />
              <OfficialLetterheadCard {...props} />
            </>
          ) : null}
          <RegionalDateTimeSettingsCard showSkeletons={showSkeletons} onSaved={() => settings && onSettingsUpdated?.(settings)} />
        </View>
      ) : null}

      {show('branding') ? (
        <View style={styles.sectionStack} testID="settings-section-branding">
          <ClinicLogoSpecimenCard clinicName={props.clinicName} showSkeletons={showSkeletons} />
          <Card style={styles.fullWidthCard} testID="clinic-color-branding-card">
            <CardContent>
              {showSkeletons ? <SkeletonList rows={3} /> : <ColorBrandingSection onSaved={() => settings && onSettingsUpdated?.(settings)} />}
            </CardContent>
          </Card>
        </View>
      ) : null}

      {show('clinical') ? (
        <View style={styles.sectionStack} testID="settings-section-clinical">
          <ClinicalSpecialtyCard {...props} />
          <ChartLayoutDefaultCard {...props} preferredChartLayout={props.preferredChartLayout} />
          <Card style={styles.fullWidthCard} testID="health-screening-settings-card">
            <CardHeader
              icon="heartPulse"
              title="Health Screening & Preventive Assessment"
              subtitle="Default clinic service catalog item billed on Cashier SOA for Regular health screenings"
              rightAction={
                <Badge
                  label={resolvedScreeningCode}
                  variant={selectedScreeningItemId ? 'primary' : 'neutral'}
                  size="sm"
                />
              }
            />
            <CardContent>
              {showSkeletons || (props.services === undefined && loadingFallbackServices) ? (
                <SkeletonList rows={2} />
              ) : effectiveServicesError && activeServices.length === 0 ? (
                <ErrorState
                  compact
                  title="Service catalog unavailable"
                  message={effectiveServicesError}
                  onRetry={() => {
                    if (props.onRefreshServices) {
                      void props.onRefreshServices();
                    } else {
                      void loadFallbackServices();
                    }
                  }}
                />
              ) : activeServices.length === 0 ? (
                <EmptyState
                  icon="tag"
                  title="No active service catalog items"
                  description="Add an active Health Screening item (default code: HEALTH-SCREEN) in Services & Prices to auto-attach fees on Cashier SOA."
                />
              ) : (
                <View style={styles.screeningFieldGroup}>
                  {orphanedServiceItem ? (
                    <View style={styles.inactiveNoticeRow} testID="inactive-screening-service-notice">
                      <Icon name="alert" size={theme.sizes.iconSm} color={theme.colors.warningText} />
                      <ThemedText variant="caption" color={theme.colors.warningText} style={styles.flexOne}>
                        {'name' in orphanedServiceItem && orphanedServiceItem.name
                          ? `Configured item "${orphanedServiceItem.name} (${orphanedServiceItem.code})" is inactive. Select an active catalog item below.`
                          : `Previously configured screening catalog item (${settings?.defaultHealthScreeningServiceCode || 'HEALTH-SCREEN'}) is inactive or missing. Select an active catalog item below.`}
                      </ThemedText>
                    </View>
                  ) : null}
                  <Select
                    label="Default Health Screening Service Item"
                    placeholder="Select default screening service item (HEALTH-SCREEN)..."
                    options={serviceOptions}
                    value={selectedScreeningItemId || null}
                    onSelect={handleSelectHealthScreeningService}
                    disabled={savingScreeningService}
                    allowClear
                    allowCustom={false}
                    modalTitle="Default Health Screening Service Item"
                    modalSubtitle="Automatically attached to Regular Health Screenings on Cashier SOA (PhilHealth YAKAP FPE remains ₱0.00 covered)."
                    icon="heartPulse"
                    helperText="Defaults to catalog code HEALTH-SCREEN when unset. PhilHealth YAKAP FPE screenings remain covered at ₱0.00."
                  />
                  <ThemedText variant="caption" color={theme.colors.textMuted}>
                    Active code: {resolvedScreeningCode}
                  </ThemedText>
                </View>
              )}
            </CardContent>
          </Card>
          {showSkeletons ? renderSkeletonCard('patient-search-skeleton') : <PatientSearchConfigSection settings={settings} onSettingsUpdated={onSettingsUpdated} />}
        </View>
      ) : null}

      {show('queue-tv') ? (
        <View style={styles.sectionStack} testID="settings-section-queue-tv">
          {showSkeletons ? renderSkeletonCard('clinic-rooms-skeleton') : <ClinicRoomsSettingsCard />}
          <QueueCallingSettingsCard settings={settings} onSettingsUpdated={onSettingsUpdated} showSkeletons={showSkeletons} />
          <WaitingAreaTvSettingsCard settings={settings} onSettingsUpdated={onSettingsUpdated} showSkeletons={showSkeletons} />
          <JoinLinkSettingsCard settings={settings} showSkeletons={showSkeletons} onSettingsUpdated={onSettingsUpdated} />
        </View>
      ) : null}

      {show('notifications') ? (
        <View style={styles.sectionStack} testID="settings-section-notifications">
          <NotificationSettingsCard settings={settings} onSettingsUpdated={onSettingsUpdated} showSkeletons={showSkeletons} />
          <AppointmentReminderSettingsCard settings={settings} onSettingsUpdated={onSettingsUpdated} showSkeletons={showSkeletons} />
        </View>
      ) : null}

      {show('billing-policy') ? (
        <View style={styles.sectionStack} testID="settings-section-billing-policy">
          <BillingLiveShortcutCard cashierMode={resolvedCashierMode} canAccessBilling={props.canAccessBilling} onNavigateBilling={props.onNavigateBilling} showSkeletons={showSkeletons} />
          <CashierStationSettingsCard
            cashierMode={stationCashierMode}
            savedCashierMode={settings ? (settings.cashierMode ?? 'ClinicDesk') : null}
            onChangeCashierMode={(m) => { setInternalCashierMode(m); props.setCashierMode?.(m); }}
            onSave={handleSaveCashierMode}
            saving={savingCashierMode || savingSettings}
            showSkeletons={showSkeletons}
          />
          <EodReconciliationSettingsCard settings={settings} onSettingsUpdated={onSettingsUpdated} showSkeletons={showSkeletons} onForceEodSuccess={onRefreshEod} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  constrainedContainer: { width: '100%', minWidth: 0, alignSelf: 'stretch', gap: theme.spacing.lg },
  sectionStack: { width: '100%', minWidth: 0, alignSelf: 'stretch', gap: theme.spacing.lg },
  fullWidthCard: { width: '100%', minWidth: 0, alignSelf: 'stretch' },
  screeningFieldGroup: { gap: theme.spacing.xs },
  inactiveNoticeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    padding: theme.spacing.sm,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.warningBorder,
    backgroundColor: theme.colors.warningBg,
  },
  flexOne: { flex: 1 },
});

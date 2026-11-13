import React, { useState, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { Card, CardContent } from '../ui/Card';
import { SkeletonList } from '../ui/Skeleton';
import { theme } from '../../constants/theme';
import { clinicService, DailyEodReport, ClinicSettingsRecord } from '../../services/clinicService';
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
import TeleconsultSettingsCard from './cards/TeleconsultSettingsCard';
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
}

export default function GeneralSettingsTab(props: GeneralSettingsTabProps) {
  const { activeSection, settings, showSkeletons, savingSettings, onSettingsUpdated, onRefreshEod } = props;
  const [internalCashierMode, setInternalCashierMode] = useState<'ClinicDesk' | 'CashierCounter' | undefined>(
    () => props.cashierMode ?? settings?.cashierMode
  );
  const [savingCashierMode, setSavingCashierMode] = useState(false);

  useEffect(() => {
    if (settings?.cashierMode) setInternalCashierMode(settings.cashierMode);
  }, [settings?.cashierMode]);

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
          <TeleconsultSettingsCard {...props} />
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
});

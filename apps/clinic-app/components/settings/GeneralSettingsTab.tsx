import React, { useState } from 'react';
import { View, StyleSheet, Pressable, Image } from 'react-native';
import ThemedText from '../ui/ThemedText';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Badge from '../ui/Badge';
import Icon from '../ui/Icon';
import { Card, CardContent, CardHeader } from '../ui/Card';
import StatCard from '../ui/StatCard';
import EmptyState from '../ui/EmptyState';
import ErrorState from '../ui/ErrorState';
import { SkeletonList } from '../ui/Skeleton';
import SecuritySection from './SecuritySection';
import AppUpdatesSettingsCard from './AppUpdatesSettingsCard';
import EdgeServerSwitcherSection from './EdgeServerSwitcherSection';
import { theme } from '../../constants/theme';
import { DailyEodReport, ClinicSettingsRecord } from '../../services/clinicService';
import { CHART_LAYOUT_OPTIONS, type ChartLayoutMode } from '../chart/types';
import { InfoRow } from './common';
import JoinLinkSettingsCard from './JoinLinkSettingsCard';
import PatientSearchConfigSection from './PatientSearchConfigSection';
import EodReconciliationSettingsCard from './EodReconciliationSettingsCard';
import WaitingAreaTvSettingsCard from './WaitingAreaTvSettingsCard';
import QueuePushNotificationSettingsCard from './QueuePushNotificationSettingsCard';
import QueueCallingSettingsCard from './QueueCallingSettingsCard';
import { ClinicRoomsSettingsCard } from './ClinicRoomsSettingsCard';
import { useClinic } from '../../context/ClinicContext';
import { pickClinicLogo } from '../../utils/logoUploader';
import { Alert, notify } from '../../utils/feedback';
import LogoCropModal from './LogoCropModal';
import ColorBrandingSection from './ColorBrandingSection';
import DevDataSeederCard from './DevDataSeederCard';

interface GeneralSettingsTabProps {
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
  eodReport: DailyEodReport | null;
  eodLoadError: string | null;
  onRefreshEod: () => Promise<void>;
  formatPeso: (v: number | undefined | null) => string;
  onNavigatePatients?: () => void;
}

export default function GeneralSettingsTab({
  onNavigatePatients,
  onSettingsUpdated,
  preferredChartLayout = 'modal',
  setPreferredChartLayout,
  clinicName,
  setClinicName,
  accreditationNumber,
  setAccreditationNumber,
  operatingHours,
  setOperatingHours,
  slotDuration,
  setSlotDuration,
  consultationFee,
  setConsultationFee,
  letterheadHeader,
  setLetterheadHeader,
  letterheadAddress,
  setLetterheadAddress,
  letterheadContact,
  setLetterheadContact,
  savingSettings,
  onSavePreferences,
  showSkeletons,
  settingsLoadError,
  settings,
  eodReport,
  eodLoadError,
  onRefreshEod,
  formatPeso,
}: GeneralSettingsTabProps) {
  const { clinicLogo, setClinicLogo } = useClinic();
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [cropModalVisible, setCropModalVisible] = useState(false);
  const [pendingLogoUri, setPendingLogoUri] = useState<string | null>(null);

  const handlePickLogo = async () => {
    setUploadingLogo(true);
    try {
      const res = await pickClinicLogo();
      if (!res) {
        setUploadingLogo(false);
        return;
      }
      if (res.error) {
        Alert.alert('Logo upload failed', res.error);
        setUploadingLogo(false);
        return;
      }
      if (res.dataUri) {
        setPendingLogoUri(res.dataUri);
        setCropModalVisible(true);
      }
    } catch (err: any) {
      Alert.alert('Upload error', err?.message || 'Failed to select image.');
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleConfirmCroppedLogo = async (croppedUri: string) => {
    setCropModalVisible(false);
    setUploadingLogo(true);
    try {
      const success = await setClinicLogo(croppedUri);
      if (success) {
        notify.success('Clinic logo updated and saved to database.');
      } else {
        Alert.alert('Logo saved locally', 'Logo updated on device, but could not sync to server database.');
      }
    } catch (err: any) {
      Alert.alert('Save error', err?.message || 'Failed to save logo.');
    } finally {
      setUploadingLogo(false);
      setPendingLogoUri(null);
    }
  };

  const handleRemoveLogo = async () => {
    Alert.alert(
      'Remove clinic logo',
      'Are you sure you want to remove the custom clinic logo and revert to the default icon?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setUploadingLogo(true);
            try {
              await setClinicLogo(null);
              notify.success('Clinic logo removed.');
            } finally {
              setUploadingLogo(false);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      {/* Clinic profile and letterhead */}
      <Card>
        <CardHeader
          title="Clinic profile and letterhead"
          subtitle="Shown on prescriptions, receipts and printed official documents"
        />
        <CardContent>
          {showSkeletons ? (
            <SkeletonList rows={4} />
          ) : settingsLoadError && !settings ? (
            <ErrorState compact title="Could not load clinic settings" message={settingsLoadError} onRetry={onRefreshEod} />
          ) : (
            <View style={styles.form}>
              <View style={styles.formRow}>
                <Input
                  containerStyle={styles.flexWide}
                  label="Facility name"
                  value={clinicName}
                  onChangeText={setClinicName}
                  placeholder="Name as registered with DOH"
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
                  placeholder="e.g. Mon-Fri 8:00 AM - 5:00 PM, Sat 8:00 AM - 12:00 PM"
                  helperText={!operatingHours ? 'Not configured yet — please specify clinic schedule' : undefined}
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
                label="Letterhead header"
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
                placeholder="Phone numbers, email, official website"
              />

              <View style={styles.actionsEnd}>
                <Button title="Save changes" onPress={onSavePreferences} loading={savingSettings} />
              </View>
            </View>
          )}
        </CardContent>
      </Card>

      {/* Clinic Branding & Logo */}
      <Card>
        <CardHeader
          title="Clinic Branding & Visual Identity"
          subtitle="Customize your clinic's logo and color palette across navigation, workstation headers, and official documents"
        />
        <CardContent>
          <View style={styles.brandingRow}>
            <View style={styles.logoPreviewContainer}>
              {clinicLogo ? (
                <Image
                  source={{ uri: clinicLogo }}
                  style={styles.logoPreviewImage}
                  resizeMode="contain"
                />
              ) : (
                <View style={styles.logoPlaceholder}>
                  <Icon name="clinic" size={theme.sizes.iconLg} color={theme.colors.primary} />
                </View>
              )}
            </View>
            <View style={styles.brandingInfo}>
              <ThemedText variant="bodyBold" color={theme.colors.text}>
                {clinicName || 'Clinic Logo'}
              </ThemedText>
              <ThemedText variant="caption" color={theme.colors.textMuted}>
                {clinicLogo
                  ? 'Custom logo active and synced to clinic database. Supported formats: PNG, JPEG, SVG, WebP (max 2MB).'
                  : 'No custom logo configured. The default Clinic EZ medical glyph is currently displayed.'}
              </ThemedText>
              <View style={styles.brandingActions}>
                <Button
                  title={clinicLogo ? 'Change logo' : 'Upload logo'}
                  icon="upload"
                  onPress={handlePickLogo}
                  loading={uploadingLogo}
                  size="sm"
                />
                {clinicLogo ? (
                  <Button
                    title="Remove"
                    variant="outline"
                    icon="trash"
                    onPress={handleRemoveLogo}
                    disabled={uploadingLogo}
                    size="sm"
                  />
                ) : null}
              </View>
            </View>
          </View>

          <View style={styles.brandingDivider} />

          {/* Color Branding (Portal Workspace Auto-Inheritance & Clinic Override) */}
          <ColorBrandingSection onSaved={() => onSettingsUpdated?.(settings!)} />
        </CardContent>
      </Card>

      {/* Patient Self-Enlistment Join Link & QR Placard */}
      <JoinLinkSettingsCard
        settings={settings}
        showSkeletons={showSkeletons}
        onSettingsUpdated={onSettingsUpdated}
      />

      {/* Preferred Medical Chart Workstation Layout */}
      <Card>
        <CardHeader
          title="Preferred Medical Chart Layout"
          subtitle="Configure the default workstation layout when opening patient medical charts across your facility"
        />
        <CardContent>
          {showSkeletons ? (
            <SkeletonList rows={3} />
          ) : (
            <View style={styles.layoutSelectorGrid}>
              {CHART_LAYOUT_OPTIONS.map((opt) => {
                const isSelected = preferredChartLayout === opt.id;
                return (
                  <Pressable
                    key={opt.id}
                    onPress={() => setPreferredChartLayout?.(opt.id)}
                    style={({ pressed }) => [
                      styles.layoutCard,
                      isSelected && styles.layoutCardSelected,
                      pressed && styles.layoutCardPressed,
                    ]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: isSelected }}
                    accessibilityLabel={`${opt.label} (${opt.badge})`}
                  >
                    <View style={styles.layoutCardHeader}>
                      <View style={styles.layoutCardIconTitle}>
                        <View style={[styles.layoutIconWrap, isSelected && styles.layoutIconWrapSelected]}>
                          <Icon
                            name={opt.icon}
                            size={theme.sizes.iconLg}
                            color={isSelected ? theme.colors.onPrimary : theme.colors.primaryDark}
                          />
                        </View>
                        <View style={styles.layoutTitleGroup}>
                          <ThemedText
                            variant="bodyBold"
                            color={isSelected ? theme.colors.primaryDark : theme.colors.text}
                          >
                            {opt.label}
                          </ThemedText>
                          <Badge
                            label={opt.badge}
                            variant={isSelected ? 'info' : 'neutral'}
                            size="sm"
                          />
                        </View>
                      </View>

                      <View style={[styles.radioOuter, isSelected && styles.radioOuterSelected]}>
                        {isSelected && <View style={styles.radioInner} />}
                      </View>
                    </View>

                    <ThemedText
                      variant="caption"
                      color={theme.colors.textSecondary}
                      style={styles.layoutDescription}
                    >
                      {opt.description}
                    </ThemedText>
                  </Pressable>
                );
              })}

              <View style={styles.actionsEnd}>
                <Button title="Save layout preference" onPress={onSavePreferences} loading={savingSettings} />
              </View>
            </View>
          )}
        </CardContent>
      </Card>

      {/* Clinic Rooms & Stations */}
      <ClinicRoomsSettingsCard />

      {/* Today's collections & EOD Census */}
      <Card>
        <CardHeader
          title="Today's collections"
          subtitle="End-of-day census and cashier remittance reconciliation"
          rightAction={<Button title="Refresh" icon="refresh" variant="ghost" size="sm" onPress={onRefreshEod} />}
        />
        <CardContent>
          {showSkeletons ? (
            <SkeletonList rows={3} />
          ) : eodLoadError ? (
            <ErrorState compact title="Could not load today's collections" message={eodLoadError} onRetry={onRefreshEod} />
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
                  {eodReport.collectionsByMethod.map((pm: any, idx: number) => (
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
              description="Daily financial and census totals will appear once transactions are settled."
            />
          )}
        </CardContent>
      </Card>

      {/* End-of-Day (EOD) Reconciliation & Day Closure */}
      <EodReconciliationSettingsCard
        settings={settings}
        onSettingsUpdated={onSettingsUpdated}
        showSkeletons={showSkeletons}
        onForceEodSuccess={onRefreshEod}
      />

      {/* Waiting Area Public TV Display Board */}
      <WaitingAreaTvSettingsCard
        settings={settings}
        onSettingsUpdated={onSettingsUpdated}
        showSkeletons={showSkeletons}
      />

      {/* Patient Queue Push Notifications */}
      <QueuePushNotificationSettingsCard
        settings={settings}
        onSettingsUpdated={onSettingsUpdated}
        showSkeletons={showSkeletons}
      />

      {/* Queue Progression & Direct Calling Controls */}
      <QueueCallingSettingsCard
        settings={settings}
        onSettingsUpdated={onSettingsUpdated}
        showSkeletons={showSkeletons}
      />

      {/* Patient Search Results Display Configuration */}
      <PatientSearchConfigSection settings={settings} onSettingsUpdated={onSettingsUpdated} />

      {/* Security PIN for offline devices */}
      <SecuritySection />

      {/* Over-The-Air (OTA) App Updates */}
      <AppUpdatesSettingsCard />

      {/* Edge & Server Connectivity */}
      <EdgeServerSwitcherSection />

      {/* Dev Data Seeder & Scalability Testing (Clinic-Exclusive) */}
      <DevDataSeederCard onNavigatePatients={onNavigatePatients} />

      {/* Clinic Logo Zoom & Crop Modal */}
      <LogoCropModal
        visible={cropModalVisible}
        imageUri={pendingLogoUri}
        onClose={() => {
          setCropModalVisible(false);
          setPendingLogoUri(null);
        }}
        onConfirm={handleConfirmCroppedLogo}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: theme.spacing.lg,
  },
  form: {
    gap: theme.spacing.md,
  },
  formRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
  },
  flexWide: {
    flex: 2,
    minWidth: 220,
  },
  flexNarrow: {
    flex: 1,
    minWidth: 140,
  },
  actionsEnd: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: theme.spacing.sm,
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
    marginTop: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    borderTopWidth: theme.sizes.borderWidth,
    borderTopColor: theme.colors.border,
    gap: theme.spacing.sm,
  },
  layoutSelectorGrid: {
    gap: theme.spacing.md,
  },
  layoutCard: {
    backgroundColor: theme.colors.surfaceHighlight,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  layoutCardSelected: {
    backgroundColor: theme.colors.primaryLight,
    borderColor: theme.colors.primaryBorder,
    shadowColor: theme.colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  layoutCardPressed: {
    opacity: 0.8,
  },
  layoutCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  layoutCardIconTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    flex: 1,
  },
  layoutIconWrap: {
    width: 44,
    height: 44,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  layoutIconWrapSelected: {
    backgroundColor: theme.colors.primaryDark,
    borderColor: theme.colors.primaryDark,
  },
  layoutTitleGroup: {
    flex: 1,
    gap: 2,
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: theme.radii.full,
    borderWidth: 2,
    borderColor: theme.colors.borderDark,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: theme.spacing.sm,
  },
  radioOuterSelected: {
    borderColor: theme.colors.primaryDark,
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: theme.radii.full,
    backgroundColor: theme.colors.primaryDark,
  },
  layoutDescription: {
    lineHeight: 18,
  },
  brandingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xl,
    paddingVertical: theme.spacing.sm,
  },
  logoPreviewContainer: {
    width: theme.sizes.controlLg * 2,
    height: theme.sizes.controlLg * 2,
    borderRadius: theme.radii.lg,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logoPreviewImage: {
    width: '100%',
    height: '100%',
  },
  logoPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.primaryLight,
  },
  brandingInfo: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  brandingActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  brandingDivider: {
    borderTopWidth: theme.sizes.borderWidth,
    borderTopColor: theme.colors.borderLight,
    marginVertical: theme.spacing.lg,
  },
});

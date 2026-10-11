import React from 'react';
import { View, StyleSheet } from 'react-native';
import ThemedText from '../ui/ThemedText';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { Card, CardContent, CardHeader } from '../ui/Card';
import StatCard from '../ui/StatCard';
import EmptyState from '../ui/EmptyState';
import ErrorState from '../ui/ErrorState';
import { SkeletonList } from '../ui/Skeleton';
import SecuritySection from './SecuritySection';
import EdgeServerSwitcherSection from './EdgeServerSwitcherSection';
import { theme } from '../../constants/theme';
import { DailyEodReport, ClinicSettingsRecord } from '../../services/clinicService';
import { InfoRow } from './common';

interface GeneralSettingsTabProps {
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
}

export default function GeneralSettingsTab({
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

      {/* Security PIN for offline devices */}
      <SecuritySection />

      {/* Edge & Server Connectivity */}
      <EdgeServerSwitcherSection />
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
});

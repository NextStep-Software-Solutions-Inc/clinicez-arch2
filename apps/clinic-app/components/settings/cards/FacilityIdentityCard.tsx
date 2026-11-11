import React from 'react';
import { View, StyleSheet } from 'react-native';
import Input from '../../ui/Input';
import Button from '../../ui/Button';
import { theme } from '../../../constants/theme';
import { type ClinicSettingsRecord } from '../../../services/clinicService';
import SettingsSplitCard from './SettingsSplitCard';

export interface FacilityIdentityCardProps {
  clinicName: string;
  setClinicName: (v: string) => void;
  accreditationNumber: string;
  setAccreditationNumber: (v: string) => void;
  settings?: ClinicSettingsRecord | null;
  savingSettings: boolean;
  onSavePreferences: () => Promise<void>;
  showSkeletons: boolean;
  errorMessage?: string | null;
  onRetry?: () => void;
}

export default function FacilityIdentityCard({
  clinicName,
  setClinicName,
  accreditationNumber,
  setAccreditationNumber,
  settings,
  savingSettings,
  onSavePreferences,
  showSkeletons,
  errorMessage = null,
  onRetry,
}: FacilityIdentityCardProps) {
  const isConfigured = Boolean(clinicName.trim());
  const isDirty = settings
    ? (clinicName ?? '') !== (settings.clinicName ?? '') ||
      (accreditationNumber ?? '') !== (settings.accreditationNumber ?? '')
    : !showSkeletons && Boolean(clinicName.trim() || accreditationNumber.trim());

  return (
    <SettingsSplitCard
      testID="facility-identity-card"
      icon="clinic"
      title="Clinic Details"
      subtitle="Registered clinic name and DOH or PhilHealth accreditation number shown on clinic headers and patient records."
      badgeLabel={isConfigured ? 'Configured' : 'Required'}
      badgeVariant={isConfigured ? 'success' : 'warning'}
      showSkeletons={showSkeletons}
      skeletonRows={2}
      errorMessage={errorMessage}
      onRetryError={onRetry}
      footer={
        isDirty || savingSettings ? (
          <Button
            title="Save changes"
            icon="save"
            size="sm"
            onPress={onSavePreferences}
            loading={savingSettings}
          />
        ) : undefined
      }
    >
      <View style={styles.gridRow}>
        <Input
          containerStyle={styles.gridCell}
          label="Clinic name"
          required
          value={clinicName}
          onChangeText={setClinicName}
          placeholder="Enter clinic name"
        />
        <Input
          containerStyle={styles.gridCell}
          label="Accreditation number"
          value={accreditationNumber}
          onChangeText={setAccreditationNumber}
          placeholder="Enter accreditation number"
        />
      </View>
    </SettingsSplitCard>
  );
}

const styles = StyleSheet.create({
  gridRow: {
    width: '100%',
    minWidth: 0,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
  },
  gridCell: {
    flex: 1,
    flexBasis: 220,
    minWidth: 0,
  },
});

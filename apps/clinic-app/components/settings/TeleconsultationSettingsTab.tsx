import React from 'react';
import { View, StyleSheet } from 'react-native';
import { theme } from '../../constants/theme';
import type { ClinicSettingsRecord } from '../../services/clinicService';
import TeleconsultSettingsCard from './cards/TeleconsultSettingsCard';

export interface TeleconsultationSettingsTabProps {
  settings?: ClinicSettingsRecord | null;
  onSettingsUpdated?: (updated: ClinicSettingsRecord) => void;
  showSkeletons?: boolean;
}

export default function TeleconsultationSettingsTab({
  settings,
  onSettingsUpdated,
  showSkeletons = false,
}: TeleconsultationSettingsTabProps) {
  return (
    <View style={styles.container} testID="settings-section-teleconsultation">
      <TeleconsultSettingsCard
        settings={settings}
        onSettingsUpdated={onSettingsUpdated}
        showSkeletons={showSkeletons}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    minWidth: 0,
    alignSelf: 'stretch',
    gap: theme.spacing.lg,
  },
});

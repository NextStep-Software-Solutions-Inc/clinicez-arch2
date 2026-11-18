import React from 'react';
import { View, StyleSheet } from 'react-native';
import Input from '../../ui/Input';
import Button from '../../ui/Button';
import { theme } from '../../../constants/theme';
import { type ClinicSettingsRecord } from '../../../services/clinicService';
import SettingsSplitCard from './SettingsSplitCard';

export interface ScheduleConsultationCardProps {
  operatingHours: string;
  setOperatingHours: (v: string) => void;
  slotDuration: string;
  setSlotDuration: (v: string) => void;
  consultationFee: string;
  setConsultationFee: (v: string) => void;
  settings?: ClinicSettingsRecord | null;
  savingSettings: boolean;
  onSavePreferences: () => Promise<void>;
  showSkeletons: boolean;
}

const normalizeSavedOperatingHours = (val?: string | null): string => {
  if (!val) return '';
  const trimmed = val.trim();
  return trimmed === 'Mon-Sat 8:00 AM - 5:00 PM' ? '' : trimmed;
};

export default function ScheduleConsultationCard({
  operatingHours,
  setOperatingHours,
  slotDuration,
  setSlotDuration,
  consultationFee,
  setConsultationFee,
  settings,
  savingSettings,
  onSavePreferences,
  showSkeletons,
}: ScheduleConsultationCardProps) {
  const hasHours = Boolean(operatingHours.trim());
  const savedHours = normalizeSavedOperatingHours(settings?.operatingHours);
  const savedSlot =
    settings?.defaultSlotDurationMinutes != null
      ? String(settings.defaultSlotDurationMinutes)
      : '';
  const savedFee =
    settings?.defaultConsultationFee != null
      ? String(settings.defaultConsultationFee)
      : '';

  const isDirty = settings
    ? (operatingHours ?? '') !== savedHours ||
      (slotDuration ?? '') !== savedSlot ||
      (consultationFee ?? '') !== savedFee
    : !showSkeletons &&
      Boolean(operatingHours.trim() || slotDuration.trim() || consultationFee.trim());

  return (
    <SettingsSplitCard
      testID="schedule-consultation-card"
      icon="clock"
      title="Hours & Consultation Fee"
      subtitle="Weekly clinic hours, standard appointment length, and default consultation fee."
      badgeLabel={hasHours ? 'Hours Saved' : 'Hours Needed'}
      badgeVariant={hasHours ? 'info' : 'warning'}
      showSkeletons={showSkeletons}
      skeletonRows={2}
      footer={
        isDirty || savingSettings ? (
          <Button
            title="Save hours & fee"
            icon="save"
            size="sm"
            onPress={onSavePreferences}
            loading={savingSettings}
          />
        ) : undefined
      }
    >
      <Input
        label="Operating hours"
        value={operatingHours}
        onChangeText={setOperatingHours}
        placeholder="Enter clinic hours"
        helperText={!operatingHours ? 'Not configured yet — please specify clinic schedule' : undefined}
      />

      <View style={styles.gridRow}>
        <Input
          containerStyle={styles.gridCell}
          label="Appointment slot (min)"
          value={slotDuration}
          onChangeText={setSlotDuration}
          placeholder="Minutes per slot"
          keyboardType="numeric"
        />
        <Input
          containerStyle={styles.gridCell}
          label="Consultation fee (₱)"
          value={consultationFee}
          onChangeText={setConsultationFee}
          placeholder="Consultation fee"
          keyboardType="numeric"
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
    flexBasis: 180,
    minWidth: 0,
  },
});

import React from 'react';
import { View, StyleSheet } from 'react-native';
import Input from '../../ui/Input';
import Button from '../../ui/Button';
import { theme } from '../../../constants/theme';
import { type ClinicSettingsRecord } from '../../../services/clinicService';
import SettingsSplitCard from './SettingsSplitCard';

export interface OfficialLetterheadCardProps {
  letterheadHeader: string;
  setLetterheadHeader: (v: string) => void;
  letterheadAddress: string;
  setLetterheadAddress: (v: string) => void;
  letterheadContact: string;
  setLetterheadContact: (v: string) => void;
  settings?: ClinicSettingsRecord | null;
  savingSettings: boolean;
  onSavePreferences: () => Promise<void>;
  showSkeletons: boolean;
}

export default function OfficialLetterheadCard({
  letterheadHeader,
  setLetterheadHeader,
  letterheadAddress,
  setLetterheadAddress,
  letterheadContact,
  setLetterheadContact,
  settings,
  savingSettings,
  onSavePreferences,
  showSkeletons,
}: OfficialLetterheadCardProps) {
  const hasDetails = Boolean(letterheadAddress.trim() && letterheadContact.trim());
  const isDirty = settings
    ? (letterheadHeader ?? '') !== (settings.letterheadHeader ?? '') ||
      (letterheadAddress ?? '') !== (settings.letterheadAddress ?? '') ||
      (letterheadContact ?? '') !== (settings.letterheadContact ?? '')
    : !showSkeletons &&
      Boolean(letterheadHeader.trim() || letterheadAddress.trim() || letterheadContact.trim());

  return (
    <SettingsSplitCard
      testID="official-letterhead-card"
      icon="file"
      title="Printed Header & Contact Info"
      subtitle="Clinic header, address, and contact details printed on prescriptions, medical certificates, and receipts."
      badgeLabel={hasDetails ? 'Complete' : 'Optional'}
      badgeVariant={hasDetails ? 'success' : 'neutral'}
      showSkeletons={showSkeletons}
      skeletonRows={2}
      footer={
        isDirty || savingSettings ? (
          <Button
            title="Save header & contact info"
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
          label="Printed header"
          value={letterheadHeader}
          onChangeText={setLetterheadHeader}
          placeholder="Printed clinic header"
        />
        <Input
          containerStyle={styles.gridCell}
          label="Contact details"
          value={letterheadContact}
          onChangeText={setLetterheadContact}
          placeholder="Phone number, email, or website"
        />
      </View>

      <Input
        label="Address"
        value={letterheadAddress}
        onChangeText={setLetterheadAddress}
        placeholder="Clinic street address and city"
      />
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

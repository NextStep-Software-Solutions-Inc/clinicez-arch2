import { StyleSheet, View } from 'react-native';
import ThemedText from '@ui/ThemedText';
import Button from '@ui/Button';
import { SectionHeader } from '@ui/Primitives';
import { useAppTheme } from 'contexts/ThemeContext';
import {
  SHARE_REDEMPTION_OPTIONS,
  SHARE_REDEMPTIONS_EXPLANATION,
  redemptionLabel,
  type ShareRedemptions,
} from 'services/sharing/redemptions';

interface RedemptionPickerProps {
  value: ShareRedemptions;
  onChange: (value: ShareRedemptions) => void;
}

/** "How many scans?" selector for the rotating share QR. */
export default function RedemptionPicker({ value, onChange }: RedemptionPickerProps) {
  const { spacing } = useAppTheme();
  return (
    <View>
      <SectionHeader title="How many scans?" />
      <View style={[styles.options, { gap: spacing.sm }]}>
        {SHARE_REDEMPTION_OPTIONS.map((option) => (
          <Button
            key={option}
            label={String(option)}
            accessibilityLabel={redemptionLabel(option)}
            variant={option === value ? 'primary' : 'outline'}
            size="sm"
            onPress={() => onChange(option)}
          />
        ))}
      </View>
      <ThemedText variant="small" color="textMuted" style={{ marginTop: spacing.sm }}>
        {SHARE_REDEMPTIONS_EXPLANATION}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  options: { flexDirection: 'row', flexWrap: 'wrap' },
});

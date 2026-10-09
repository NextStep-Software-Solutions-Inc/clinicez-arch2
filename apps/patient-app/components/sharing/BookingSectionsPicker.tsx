import { StyleSheet, View } from 'react-native';
import ThemedText from '@ui/ThemedText';
import Badge from '@ui/Badge';
import ProfileToggle from 'components/profile/ProfileToggle';
import { useAppTheme } from 'contexts/ThemeContext';
import {
  BOOKING_SECTION_INFO,
  toggleShareSection,
  type BookingShareSection,
} from 'services/sharing/bookingSections';

interface BookingSectionsPickerProps {
  selected: readonly BookingShareSection[];
  /** Sections the clinic hints at; a badge only, never preselected. */
  requested: readonly BookingShareSection[];
  onChange: (next: BookingShareSection[]) => void;
}

/** "Also send my records (optional)": one switch per record section, shown on the review step. */
export default function BookingSectionsPicker({ selected, requested, onChange }: BookingSectionsPickerProps) {
  const { spacing } = useAppTheme();
  return (
    <View style={{ gap: spacing.sm }}>
      <View style={{ gap: spacing.xs }}>
        <ThemedText variant="bodyBold">Also send my records (optional)</ThemedText>
        <ThemedText variant="small" color="textMuted">
          Only the sections you switch on leave your phone with this request. Nothing is sent by default.
        </ThemedText>
      </View>
      {BOOKING_SECTION_INFO.map((info) => (
        <View key={info.key} style={{ gap: spacing.xs }}>
          {requested.includes(info.key) ? (
            <View style={styles.badgeRow}>
              <Badge label="Requested by this clinic" tone="info" size="sm" />
            </View>
          ) : null}
          <ProfileToggle
            label={info.label}
            description={info.description}
            value={selected.includes(info.key)}
            onValueChange={(enabled) => onChange(toggleShareSection(selected, info.key, enabled))}
          />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  badgeRow: { flexDirection: 'row' },
});

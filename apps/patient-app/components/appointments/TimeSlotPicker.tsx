import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import ThemedText from '@ui/ThemedText';
import { AppIcon } from '@ui/Icon';
import type { AvailableSlot } from '../../services/appointments/types';
import { useAppTheme } from '../../contexts/ThemeContext';

interface TimeSlotPickerProps {
  slots: AvailableSlot[];
  selectedSlotId: string | null;
  onSelectSlot: (slotId: string) => void;
  isLoading?: boolean;
}

const PERIOD_LABELS: Record<string, string> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
};

export default function TimeSlotPicker({
  slots,
  selectedSlotId,
  onSelectSlot,
  isLoading,
}: TimeSlotPickerProps) {
  const { colors, radii, sizes, spacing } = useAppTheme();

  if (isLoading) {
    return (
      <View style={[styles.loadingRow, { gap: spacing.sm }]}>
        {Array.from({ length: 4 }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.placeholderChip,
              {
                borderColor: colors.borderLight,
                backgroundColor: colors.skeletonBase,
                borderRadius: radii.full,
              },
            ]}
          />
        ))}
      </View>
    );
  }

  if (slots.length === 0) {
    return (
      <ThemedText variant="small" color="textSecondary" style={styles.emptyText}>
        No available slots for this date.
      </ThemedText>
    );
  }

  // Group by period maintaining order: morning → afternoon → evening
  const groups: Record<string, AvailableSlot[]> = {};
  const order: string[] = [];
  for (const slot of slots) {
    if (!groups[slot.period]) {
      groups[slot.period] = [];
      order.push(slot.period);
    }
    groups[slot.period].push(slot);
  }

  return (
    <View style={[styles.container, { gap: spacing.md }]}>
      {order.map((period) => (
        <View key={period} style={[styles.group, { gap: spacing.sm }]}>
          <View style={styles.periodHeader}>
            <AppIcon name="clock" size={sizes.iconSm} color="textMuted" />
            <ThemedText variant="smallBold" color="textSecondary">
              {PERIOD_LABELS[period] ?? period}
            </ThemedText>
          </View>
          <View style={[styles.chipsRow, { gap: spacing.sm }]}>
            {groups[period].map((slot) => {
              const isSelected = slot.id === selectedSlotId;
              const isUnavailable = !slot.available;

              return (
                <Pressable
                  key={slot.id}
                  onPress={() => slot.available && onSelectSlot(slot.id)}
                  disabled={isUnavailable}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected, disabled: isUnavailable }}
                  accessibilityLabel={`${slot.displayTime}${isUnavailable ? ', unavailable' : ''}`}
                  style={({ pressed, hovered }: any) => [
                    styles.chip,
                    {
                      borderRadius: radii.full,
                      borderColor: isSelected
                        ? colors.primary
                        : isUnavailable
                          ? colors.borderLight
                          : colors.border,
                      backgroundColor: isSelected
                        ? colors.primary
                        : isUnavailable
                          ? colors.surfaceSubtle
                          : colors.surface,
                    },
                    hovered && slot.available && !isSelected && { backgroundColor: colors.surfaceSubtle },
                    pressed && { opacity: 0.8 },
                  ]}
                >
                  <ThemedText
                    variant={isSelected ? 'smallBold' : 'small'}
                    style={{
                      color: isSelected
                        ? colors.onPrimary
                        : isUnavailable
                          ? colors.textMuted
                          : colors.text,
                    }}
                  >
                    {slot.displayTime}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {},
  group: {},
  periodHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 76,
  },
  loadingRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  placeholderChip: {
    width: 80,
    height: 36,
    borderWidth: 1,
  },
  emptyText: {
    textAlign: 'center',
    paddingVertical: 12,
  },
});

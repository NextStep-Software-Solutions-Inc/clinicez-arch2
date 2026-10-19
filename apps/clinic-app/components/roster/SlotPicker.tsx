import React, { useMemo } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { theme } from '../../constants/theme';
import { ThemedText, Icon, Badge } from '@ui';
import { AvailableSlotItem } from '../../services/clinicService';
import { useDoctorAvailability } from './useDoctorAvailability';

export interface SlotPickerProps {
  doctorId?: string;
  date: string; // YYYY-MM-DD
  selectedSlot?: string; // e.g. "09:00" or "09:00:00"
  onSelectSlot: (slot: AvailableSlotItem) => void;
  interval?: number;
  disabled?: boolean;
}

function formatSlotTime(timeStr: string): string {
  if (!timeStr) return '';
  const parts = timeStr.split(':');
  if (parts.length >= 2) {
    const hours = parseInt(parts[0], 10);
    const minutes = parts[1];
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const formattedHours = hours % 12 === 0 ? 12 : hours % 12;
    return `${formattedHours}:${minutes} ${ampm}`;
  }
  return timeStr;
}

export const SlotPicker: React.FC<SlotPickerProps> = ({
  doctorId,
  date,
  selectedSlot,
  onSelectSlot,
  interval = 30,
  disabled = false,
}) => {
  const { slots, isOnDuty, nonAvailabilityReason, loading, error, refresh } =
    useDoctorAvailability({
      doctorId,
      date,
      interval,
      enabled: !!doctorId && !!date,
    });

  const groupedSlots = useMemo(() => {
    const morning: AvailableSlotItem[] = [];
    const afternoon: AvailableSlotItem[] = [];
    const evening: AvailableSlotItem[] = [];

    for (const slot of slots) {
      const parts = slot.startTime.split(':');
      const hour = parseInt(parts[0], 10);
      if (hour < 12) {
        morning.push(slot);
      } else if (hour < 17) {
        afternoon.push(slot);
      } else {
        evening.push(slot);
      }
    }

    return { morning, afternoon, evening };
  }, [slots]);

  if (!doctorId) {
    return (
      <View style={styles.emptyContainer}>
        <Icon name="clock" size={theme.sizes.iconMd} color={theme.colors.textMuted} />
        <ThemedText variant="small" style={styles.emptyText}>
          Please select a doctor to view available time slots.
        </ThemedText>
      </View>
    );
  }

  if (loading && slots.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color={theme.colors.primary} />
        <ThemedText variant="small" style={styles.loadingText}>
          Checking physician schedule and available slots...
        </ThemedText>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Icon name="alertCircle" size={theme.sizes.iconMd} color={theme.colors.emergency} />
        <ThemedText variant="small" style={styles.errorText}>
          {error}
        </ThemedText>
        <Pressable style={styles.retryButton} onPress={refresh}>
          <ThemedText variant="smallBold" style={styles.retryButtonText}>
            Retry
          </ThemedText>
        </Pressable>
      </View>
    );
  }

  if (!isOnDuty) {
    return (
      <View style={styles.offDutyContainer}>
        <Icon name="calendar" size={theme.sizes.iconMd} color={theme.colors.urgent} />
        <ThemedText variant="bodyBold" style={styles.offDutyTitle}>
          Doctor is not on duty
        </ThemedText>
        <ThemedText variant="small" style={styles.offDutyReason}>
          {nonAvailabilityReason || 'No scheduled consultation hours for this date.'}
        </ThemedText>
      </View>
    );
  }

  if (slots.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Icon name="calendar" size={theme.sizes.iconMd} color={theme.colors.textMuted} />
        <ThemedText variant="small" style={styles.emptyText}>
          No slots found for this date.
        </ThemedText>
      </View>
    );
  }

  const renderSlotGroup = (title: string, groupSlots: AvailableSlotItem[]) => {
    if (groupSlots.length === 0) return null;

    return (
      <View key={title} style={styles.groupSection}>
        <ThemedText variant="captionBold" style={styles.groupTitle}>
          {title}
        </ThemedText>
        <View style={styles.slotGrid}>
          {groupSlots.map((slot) => {
            const isSelected =
              selectedSlot === slot.startTime ||
              selectedSlot?.startsWith(slot.startTime) ||
              slot.startTime.startsWith(selectedSlot || 'NONE');

            const isAvailable = slot.isAvailable && !disabled;

            let chipStyle: ViewStyle = styles.slotChipAvailable;
            let textStyle: TextStyle = styles.slotTextAvailable;
            let badgeText: string | null = null;
            let badgeVariant: 'warning' | 'emergency' | 'neutral' = 'neutral';

            if (isSelected) {
              chipStyle = styles.slotChipSelected;
              textStyle = styles.slotTextSelected;
            } else if (slot.status === 'Booked') {
              chipStyle = styles.slotChipBooked;
              textStyle = styles.slotTextBooked;
              badgeText = 'Booked';
              badgeVariant = 'neutral';
            } else if (slot.status === 'Break') {
              chipStyle = styles.slotChipBreak;
              textStyle = styles.slotTextBreak;
              badgeText = 'Break';
              badgeVariant = 'warning';
            } else if (slot.status === 'OnLeave') {
              chipStyle = styles.slotChipLeave;
              textStyle = styles.slotTextLeave;
              badgeText = 'Leave';
              badgeVariant = 'emergency';
            } else if (slot.status === 'Past') {
              chipStyle = styles.slotChipPast;
              textStyle = styles.slotTextPast;
              badgeText = 'Past';
              badgeVariant = 'neutral';
            }

            return (
              <Pressable
                key={slot.startTime}
                disabled={!isAvailable}
                onPress={() => onSelectSlot(slot)}
                style={[
                  styles.slotChipBase,
                  chipStyle,
                  !isAvailable && styles.slotChipDisabled,
                ]}
              >
                <ThemedText variant="smallBold" style={textStyle}>
                  {formatSlotTime(slot.startTime)}
                </ThemedText>
                {badgeText && !isSelected && (
                  <Badge variant={badgeVariant} label={badgeText} size="sm" />
                )}
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <ThemedText variant="smallBold" style={styles.headerLabel}>
          Available Appointment Slots
        </ThemedText>
        <Pressable onPress={refresh} style={styles.refreshIcon}>
          <Icon name="refresh" size={theme.sizes.iconSm} color={theme.colors.primary} />
        </Pressable>
      </View>

      {renderSlotGroup('Morning', groupedSlots.morning)}
      {renderSlotGroup('Afternoon', groupedSlots.afternoon)}
      {renderSlotGroup('Evening', groupedSlots.evening)}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: theme.spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.xs,
  },
  headerLabel: {
    color: theme.colors.textSecondary,
  },
  refreshIcon: {
    padding: theme.spacing.xs,
  },
  groupSection: {
    marginBottom: theme.spacing.sm,
  },
  groupTitle: {
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    marginBottom: theme.spacing.xs,
  },
  slotGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  slotChipBase: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    gap: theme.spacing.xs,
    minWidth: 100,
  },
  slotChipAvailable: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
  },
  slotTextAvailable: {
    color: theme.colors.text,
  },
  slotChipSelected: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primaryDark,
  },
  slotTextSelected: {
    color: theme.colors.onPrimary,
  },
  slotChipBooked: {
    backgroundColor: theme.colors.surfaceSubtle,
    borderColor: theme.colors.borderLight,
  },
  slotTextBooked: {
    color: theme.colors.textMuted,
  },
  slotChipBreak: {
    backgroundColor: theme.colors.warningBg,
    borderColor: theme.colors.warningBorder,
  },
  slotTextBreak: {
    color: theme.colors.warningText,
  },
  slotChipLeave: {
    backgroundColor: theme.colors.emergencyBg,
    borderColor: theme.colors.emergencyBorder,
  },
  slotTextLeave: {
    color: theme.colors.emergencyText,
  },
  slotChipPast: {
    backgroundColor: theme.colors.surfaceMuted,
    borderColor: theme.colors.borderLight,
  },
  slotTextPast: {
    color: theme.colors.textLight,
  },
  slotChipDisabled: {
    opacity: 0.7,
  },
  emptyContainer: {
    padding: theme.spacing.md,
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  emptyText: {
    color: theme.colors.textMuted,
  },
  loadingContainer: {
    padding: theme.spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  loadingText: {
    color: theme.colors.textSecondary,
  },
  errorContainer: {
    padding: theme.spacing.md,
    backgroundColor: theme.colors.emergencyBg,
    borderRadius: theme.radii.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  errorText: {
    color: theme.colors.emergencyText,
    flex: 1,
  },
  retryButton: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.sm,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.emergencyBorder,
  },
  retryButtonText: {
    color: theme.colors.emergencyText,
  },
  offDutyContainer: {
    padding: theme.spacing.md,
    backgroundColor: theme.colors.urgentBg,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.urgentBorder,
    alignItems: 'center',
  },
  offDutyTitle: {
    color: theme.colors.urgentText,
    marginTop: theme.spacing.xs,
  },
  offDutyReason: {
    color: theme.colors.urgentText,
    textAlign: 'center',
    marginTop: theme.spacing.xs,
  },
});

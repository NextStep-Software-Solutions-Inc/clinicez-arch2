import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { theme } from '../../constants/theme';
import ThemedText from '../ui/ThemedText';
import Icon from '../ui/Icon';
import type { CalendarHeaderProps, CalendarViewMode } from './types';
import { formatDateTitle } from './calendarUtils';

const VIEW_MODES: { mode: CalendarViewMode; label: string }[] = [
  { mode: 'month', label: 'Month' },
  { mode: 'week', label: 'Week' },
  { mode: 'day', label: 'Day' },
  { mode: 'agenda', label: 'Agenda' },
];

export function CalendarHeader({
  viewMode,
  currentDate,
  title,
  onViewModeChange,
  onPrev,
  onNext,
  onToday,
  activeDoctorId,
  onDoctorChange,
  doctors,
}: CalendarHeaderProps) {
  const displayTitle = title || formatDateTitle(viewMode, currentDate);

  return (
    <View
      data-testid="calendar-header"
      testID="calendar-header"
      style={styles.container}
    >
      {/* Left: Nav controls (Prev, Today, Next) & Title */}
      <View
        data-testid="calendar-nav-controls"
        testID="calendar-nav-controls"
        style={styles.navControls}
      >
        <View style={styles.buttonGroup}>
          <Pressable
            data-testid="btn-prev"
            testID="btn-prev"
            accessibilityRole="button"
            accessibilityLabel="Previous Period"
            onPress={onPrev}
            style={({ pressed }) => [
              styles.navButton,
              pressed && styles.pressed,
            ]}
          >
            <Icon
              name="chevronLeft"
              size={theme.sizes.iconSm}
              color={theme.colors.text}
            />
            <ThemedText variant="smallBold" style={styles.navButtonText}>
              Previous
            </ThemedText>
          </Pressable>

          <Pressable
            data-testid="btn-today"
            testID="btn-today"
            accessibilityRole="button"
            accessibilityLabel="Today"
            onPress={onToday}
            style={({ pressed }) => [
              styles.navButton,
              pressed && styles.pressed,
            ]}
          >
            <ThemedText variant="smallBold" style={styles.navButtonText}>
              Today
            </ThemedText>
          </Pressable>

          <Pressable
            data-testid="btn-next"
            testID="btn-next"
            accessibilityRole="button"
            accessibilityLabel="Next Period"
            onPress={onNext}
            style={({ pressed }) => [
              styles.navButton,
              pressed && styles.pressed,
            ]}
          >
            <ThemedText variant="smallBold" style={styles.navButtonText}>
              Next
            </ThemedText>
            <Icon
              name="chevronRight"
              size={theme.sizes.iconSm}
              color={theme.colors.text}
            />
          </Pressable>
        </View>

        <ThemedText
          data-testid="calendar-title"
          testID="calendar-title"
          variant="h3"
          style={styles.titleText}
        >
          {displayTitle}
        </ThemedText>
      </View>

      {/* Right: Doctor selector (if any) & View Switcher */}
      <View style={styles.rightSection}>
        {doctors && doctors.length > 0 && onDoctorChange ? (
          <View style={styles.doctorFilter}>
            <Pressable
              onPress={() => onDoctorChange(undefined)}
              style={({ pressed }) => [
                styles.docPill,
                !activeDoctorId && styles.docPillActive,
                pressed && styles.pressed,
              ]}
            >
              <ThemedText
                variant="caption"
                color={
                  !activeDoctorId
                    ? theme.colors.onPrimary
                    : theme.colors.textSecondary
                }
              >
                All Doctors
              </ThemedText>
            </Pressable>
            {doctors.slice(0, 3).map((d) => (
              <Pressable
                key={d.id}
                onPress={() => onDoctorChange(d.id)}
                style={({ pressed }) => [
                  styles.docPill,
                  activeDoctorId === d.id && styles.docPillActive,
                  pressed && styles.pressed,
                ]}
              >
                <ThemedText
                  variant="caption"
                  color={
                    activeDoctorId === d.id
                      ? theme.colors.onPrimary
                      : theme.colors.textSecondary
                  }
                  numberOfLines={1}
                >
                  {d.name}
                </ThemedText>
              </Pressable>
            ))}
          </View>
        ) : null}

        <View
          data-testid="calendar-view-switcher"
          testID="calendar-view-switcher"
          role="radiogroup"
          aria-label="Calendar view mode"
          style={styles.viewSwitcher}
        >
          {VIEW_MODES.map(({ mode, label }) => {
            const isSelected = viewMode === mode;
            return (
              <Pressable
                key={mode}
                data-testid={`btn-view-${mode}`}
                testID={`btn-view-${mode}`}
                role="radio"
                accessibilityRole="radio"
                aria-checked={isSelected}
                accessibilityState={{ selected: isSelected }}
                onPress={() => onViewModeChange(mode)}
                style={({ pressed }) => [
                  styles.modeButton,
                  isSelected && styles.modeButtonActive,
                  pressed && styles.pressed,
                ]}
              >
                <ThemedText
                  variant="smallBold"
                  color={
                    isSelected ? theme.colors.text : theme.colors.textMuted
                  }
                >
                  {label}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: theme.sizes.borderWidth,
    borderBottomColor: theme.colors.border,
  },
  navControls: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
  },
  buttonGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: theme.radii.md,
    padding: 2,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.borderLight,
  },
  navButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radii.sm,
  },
  navButtonText: {
    color: theme.colors.text,
  },
  titleText: {
    color: theme.colors.text,
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  doctorFilter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  docPill: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radii.full,
    backgroundColor: theme.colors.surfaceSubtle,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
  },
  docPillActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  viewSwitcher: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: theme.radii.md,
    padding: 2,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
  },
  modeButton: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radii.sm,
  },
  modeButtonActive: {
    backgroundColor: theme.colors.surface,
    ...theme.shadows.sm,
  },
  pressed: {
    opacity: 0.7,
  },
});

export default CalendarHeader;

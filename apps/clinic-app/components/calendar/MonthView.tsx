import React, { useMemo } from 'react';
import { View, StyleSheet, Pressable, ScrollView } from 'react-native';
import { theme } from '../../constants/theme';
import ThemedText from '../ui/ThemedText';
import ErrorState from '../ui/ErrorState';
import { CalendarSkeleton } from './CalendarSkeleton';
import type { CalendarViewProps, ExtendedAppointmentItem } from './types';
import {
  generateMonthGrid,
  resolveUrgencyTokens,
  getManilaTodayStr,
} from './calendarUtils';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function MonthView({
  currentDate,
  appointments,
  isLoading,
  error,
  onRetry,
  onSelectDate,
  onSelectAppointment,
}: CalendarViewProps) {
  if (isLoading) {
    return <CalendarSkeleton viewMode="month" />;
  }

  if (error) {
    return (
      <View data-testid="calendar-error-state" testID="calendar-error-state">
        <ErrorState
          title="Failed to load clinic calendar"
          message={error.message || 'Please check your connection and try again.'}
          onRetry={onRetry}
        />
      </View>
    );
  }

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1; // 1-12
  const todayStr = getManilaTodayStr();

  const cells = useMemo(
    () => generateMonthGrid(year, month, appointments, todayStr),
    [year, month, appointments, todayStr]
  );

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.scrollContent}
    >
      <View style={styles.gridWrapper}>
        {/* Day-of-week header */}
        <View style={styles.headerRow}>
          {DAY_LABELS.map((day) => (
            <View key={day} style={styles.headerCell}>
              <ThemedText variant="smallBold" color={theme.colors.textSecondary}>
                {day}
              </ThemedText>
            </View>
          ))}
        </View>

        {/* 7-column 42-cell matrix */}
        <View
          data-testid="calendar-month-grid"
          testID="calendar-month-grid"
          style={styles.grid}
        >
          {cells.map((cell) => {
            const isToday = cell.isToday;
            const isCurrentMonth = cell.isCurrentMonth;
            const count = cell.appointments.length;
            const visibleAppts = cell.appointments.slice(0, 3);
            const remaining = count - visibleAppts.length;

            return (
              <Pressable
                key={cell.dateString}
                data-testid={`month-cell-${cell.dateString}`}
                testID={`month-cell-${cell.dateString}`}
                data-is-current-month={String(isCurrentMonth)}
                data-is-today={String(isToday)}
                accessibilityRole="button"
                accessibilityLabel={`${cell.dateString}, ${count} appointments`}
                onPress={() => onSelectDate(cell.date)}
                style={({ pressed }) => [
                  styles.cell,
                  !isCurrentMonth && styles.outsideMonthCell,
                  isToday && styles.todayCell,
                  pressed && styles.pressed,
                ]}
              >
                {/* Cell Header: Day Number and Count Badge */}
                <View style={styles.cellHeader}>
                  <View style={[styles.dayNumberWrapper, isToday && styles.todayNumberWrapper]}>
                    <ThemedText
                      data-testid="cell-day-number"
                      variant="smallBold"
                      color={
                        isToday
                          ? theme.colors.onPrimary
                          : isCurrentMonth
                          ? theme.colors.text
                          : theme.colors.textLight
                      }
                    >
                      {cell.dayNumber}
                    </ThemedText>
                  </View>

                  {count > 0 ? (
                    <View
                      data-testid="cell-count-badge"
                      style={styles.countBadge}
                    >
                      <ThemedText
                        variant="caption"
                        color={theme.colors.primary}
                        style={{ fontWeight: '700' }}
                      >
                        {count}
                      </ThemedText>
                    </View>
                  ) : null}
                </View>

                {/* Appointment Chips */}
                <View style={styles.chipContainer}>
                  {visibleAppts.map((appt) => {
                    const urgency = appt.urgency || 'Routine';
                    const urgencyTokens = resolveUrgencyTokens(urgency);
                    return (
                      <Pressable
                        key={appt.id}
                        data-testid={`cell-chip-${appt.id}`}
                        testID={`cell-chip-${appt.id}`}
                        data-urgency={urgency}
                        accessibilityRole="button"
                        onPress={(e) => {
                          e.stopPropagation();
                          onSelectAppointment(appt);
                        }}
                        style={[
                          styles.chip,
                          {
                            backgroundColor: urgencyTokens.badgeBg,
                            borderColor: urgencyTokens.borderColor,
                          },
                        ]}
                      >
                        <ThemedText
                          variant="caption"
                          style={[
                            styles.chipText,
                            { color: urgencyTokens.badgeText },
                          ]}
                          numberOfLines={1}
                        >
                          {appt.patientName}
                        </ThemedText>
                      </Pressable>
                    );
                  })}

                  {remaining > 0 ? (
                    <ThemedText
                      variant="caption"
                      color={theme.colors.textMuted}
                      style={styles.moreText}
                    >
                      +{remaining} more
                    </ThemedText>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
  },
  gridWrapper: {
    minWidth: 700,
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.lg,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    overflow: 'hidden',
  },
  headerRow: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surfaceSubtle,
    borderBottomWidth: theme.sizes.borderWidth,
    borderBottomColor: theme.colors.border,
  },
  headerCell: {
    flex: 1,
    paddingVertical: theme.spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    width: '14.2857%', // 100% / 7 columns
    minHeight: 90,
    borderRightWidth: theme.sizes.borderWidth,
    borderBottomWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.borderLight,
    padding: theme.spacing.xs,
    backgroundColor: theme.colors.surface,
  },
  outsideMonthCell: {
    backgroundColor: theme.colors.surfaceMuted,
  },
  todayCell: {
    backgroundColor: theme.colors.primarySubtle,
  },
  cellHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.xs,
  },
  dayNumberWrapper: {
    width: theme.sizes.controlSm,
    height: theme.sizes.controlSm,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radii.full,
  },
  todayNumberWrapper: {
    backgroundColor: theme.colors.primary,
  },
  countBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: theme.radii.full,
    backgroundColor: theme.colors.primaryLight,
  },
  chipContainer: {
    gap: 2,
  },
  chip: {
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: 1,
    borderRadius: theme.radii.sm,
    borderWidth: theme.sizes.borderWidth,
  },
  chipText: {
    fontWeight: '600',
  },
  moreText: {
    marginTop: 2,
    fontWeight: '500',
  },
  pressed: {
    opacity: 0.8,
  },
});

export default MonthView;

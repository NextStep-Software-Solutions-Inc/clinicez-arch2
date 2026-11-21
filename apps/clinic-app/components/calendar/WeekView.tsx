import React, { useMemo } from 'react';
import { View, StyleSheet, Pressable, ScrollView } from 'react-native';
import { theme } from '../../constants/theme';
import ThemedText from '../ui/ThemedText';
import ErrorState from '../ui/ErrorState';
import { CalendarSkeleton } from './CalendarSkeleton';
import { AppointmentCard } from './AppointmentCard';
import type { CalendarViewProps, ExtendedAppointmentItem } from './types';
import {
  getWeekDays,
  generateDayTimeSlots,
  getManilaTodayStr,
  formatTime12,
  getAppointmentLocalDateTime,
  isTimeInSlotWindow,
} from './calendarUtils';

export function WeekView({
  currentDate,
  appointments,
  isLoading,
  error,
  onRetry,
  onSelectSlot,
  onSelectAppointment,
}: CalendarViewProps) {
  if (isLoading) {
    return <CalendarSkeleton viewMode="week" />;
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

  const todayStr = getManilaTodayStr();
  const weekDays = useMemo(
    () => getWeekDays(currentDate, appointments, todayStr),
    [currentDate, appointments, todayStr]
  );
  const slots = useMemo(() => generateDayTimeSlots(7, 19, 30), []);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.scrollContent}
    >
      <View
        data-testid="calendar-week-matrix"
        testID="calendar-week-matrix"
        style={styles.matrixContainer}
      >
        {/* Time axis column */}
        <View
          data-testid="week-time-axis"
          testID="week-time-axis"
          style={styles.timeAxis}
        >
          {/* Header spacer */}
          <View style={styles.timeHeaderSpacer}>
            <ThemedText variant="caption" color={theme.colors.textMuted}>
              Time
            </ThemedText>
          </View>
          {slots.map((s) => (
            <View
              key={s.timeStr}
              data-testid={`time-label-${s.timeStr}`}
              testID={`time-label-${s.timeStr}`}
              style={styles.timeSlotLabel}
            >
              <ThemedText variant="caption" color={theme.colors.textSecondary}>
                {s.minute === 0 ? formatTime12(s.timeStr) : s.timeStr}
              </ThemedText>
            </View>
          ))}
        </View>

        {/* 7 Day Columns */}
        {weekDays.map((col) => {
          const isToday = col.isToday;
          return (
            <View
              key={col.dateString}
              data-testid={`week-col-${col.dateString}`}
              testID={`week-col-${col.dateString}`}
              style={[
                styles.dayColumn,
                isToday && styles.todayColumn,
              ]}
            >
              {/* Column Header */}
              <View
                data-testid="col-header"
                testID="col-header"
                style={[
                  styles.colHeader,
                  isToday && styles.todayColHeader,
                ]}
              >
                <ThemedText
                  variant="smallBold"
                  color={isToday ? theme.colors.primary : theme.colors.text}
                >
                  {col.dayName}
                </ThemedText>
                <ThemedText
                  variant="caption"
                  color={isToday ? theme.colors.primary : theme.colors.textMuted}
                >
                  {col.date.getDate()}
                </ThemedText>
              </View>

              {/* Slotted Rows */}
              {slots.map((slot) => {
                const slotAppts = col.appointments.filter((a) =>
                  isTimeInSlotWindow(getAppointmentLocalDateTime(a.scheduledAt).timeStr, slot.timeStr)
                );
                const appt = slotAppts[0];

                return (
                  <Pressable
                    key={slot.timeStr}
                    data-testid={`week-slot-${col.dateString}-${slot.timeStr}`}
                    testID={`week-slot-${col.dateString}-${slot.timeStr}`}
                    accessibilityRole="button"
                    accessibilityLabel={`${col.dayName} ${slot.timeStr}${
                      appt ? `, ${appt.patientName}` : ', available slot'
                    }`}
                    onPress={() => {
                      if (appt) {
                        onSelectAppointment(appt);
                      } else if (onSelectSlot) {
                        onSelectSlot(col.date, slot.timeStr);
                      }
                    }}
                    style={({ pressed }) => [
                      styles.slotCell,
                      pressed && styles.pressed,
                    ]}
                  >
                    {slotAppts.length > 0
                      ? slotAppts.map((slotAppt) => (
                          <AppointmentCard
                            key={slotAppt.id}
                            appointment={slotAppt}
                            variant="timeline"
                            onSelect={onSelectAppointment}
                          />
                        ))
                      : null}
                  </Pressable>
                );
              })}
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
  },
  matrixContainer: {
    flexDirection: 'row',
    minWidth: 850,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.lg,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    overflow: 'hidden',
  },
  timeAxis: {
    width: 72,
    borderRightWidth: theme.sizes.borderWidth,
    borderRightColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceSubtle,
  },
  timeHeaderSpacer: {
    height: 48,
    borderBottomWidth: theme.sizes.borderWidth,
    borderBottomColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeSlotLabel: {
    height: 48,
    borderBottomWidth: theme.sizes.borderWidth,
    borderBottomColor: theme.colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.xs,
  },
  dayColumn: {
    flex: 1,
    borderRightWidth: theme.sizes.borderWidth,
    borderRightColor: theme.colors.borderLight,
  },
  todayColumn: {
    backgroundColor: theme.colors.primarySubtle,
  },
  colHeader: {
    height: 48,
    borderBottomWidth: theme.sizes.borderWidth,
    borderBottomColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceSubtle,
  },
  todayColHeader: {
    backgroundColor: theme.colors.primaryLight,
  },
  slotCell: {
    height: 48,
    borderBottomWidth: theme.sizes.borderWidth,
    borderBottomColor: theme.colors.borderLight,
    padding: 2,
    justifyContent: 'center',
  },
  pressed: {
    backgroundColor: theme.colors.surfaceHighlight,
  },
});

export default WeekView;

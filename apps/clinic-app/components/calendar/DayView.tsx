import React, { useMemo } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { theme } from '../../constants/theme';
import ThemedText from '../ui/ThemedText';
import ErrorState from '../ui/ErrorState';
import { useBreakpoint } from '../../utils/useBreakpoint';
import { CalendarSkeleton } from './CalendarSkeleton';
import { DoctorTimelineColumn } from './DoctorTimelineColumn';
import { DateCarousel } from './DateCarousel';
import { AppointmentCard } from './AppointmentCard';
import type {
  CalendarViewProps,
  DoctorShiftOverlay,
  ExtendedAppointmentItem,
} from './types';
import {
  generateDayTimeSlots,
  toDateString,
  formatTime12,
} from './calendarUtils';

export function DayView({
  currentDate,
  appointments,
  isLoading,
  error,
  onRetry,
  onSelectDate,
  onSelectSlot,
  onSelectAppointment,
  activeDoctorId,
  doctorOverlays,
}: CalendarViewProps) {
  const { isDesktop, isCompact } = useBreakpoint();

  const dateString = toDateString(currentDate);
  const slots = useMemo(() => generateDayTimeSlots(7, 19, 30), []);

  // Derive doctors to display
  const effectiveDoctors: DoctorShiftOverlay[] = useMemo(() => {
    if (doctorOverlays && doctorOverlays.length > 0) {
      if (activeDoctorId) {
        return doctorOverlays.filter((d) => d.doctorId === activeDoctorId);
      }
      return doctorOverlays;
    }

    // Fallback: extract distinct doctors from appointments
    const docMap = new Map<string, string>();
    for (const a of appointments) {
      if (a.doctorId) {
        docMap.set(a.doctorId, a.doctorName || 'Attending Physician');
      }
    }

    if (docMap.size === 0) {
      return [
        {
          doctorId: activeDoctorId || 'doc-primary',
          doctorName: 'Attending Physician',
          isOnDuty: true,
          shiftStart: '08:00',
          shiftEnd: '17:00',
          breaks: [{ start: '12:00', end: '13:00', description: 'Lunch Break' }],
        },
      ];
    }

    const list: DoctorShiftOverlay[] = [];
    docMap.forEach((name, id) => {
      if (!activeDoctorId || activeDoctorId === id) {
        list.push({
          doctorId: id,
          doctorName: name,
          isOnDuty: true,
          shiftStart: '08:00',
          shiftEnd: '17:00',
          breaks: [{ start: '12:00', end: '13:00', description: 'Lunch Break' }],
        });
      }
    });
    return list;
  }, [doctorOverlays, appointments, activeDoctorId]);

  if (isLoading) {
    return <CalendarSkeleton viewMode="day" />;
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

  // Mobile layout (< 768px): Agenda timeline paired with DateCarousel
  if (isCompact && !isDesktop) {
    const dayAppointments = appointments.filter((a) =>
      a.scheduledAt.startsWith(dateString)
    );

    return (
      <View style={styles.mobileContainer}>
        <DateCarousel currentDate={currentDate} onSelectDate={onSelectDate} />

        <ScrollView contentContainerStyle={styles.mobileTimeline}>
          {dayAppointments.length === 0 ? (
            <View style={styles.emptyDayNotice}>
              <ThemedText variant="body" color={theme.colors.textMuted}>
                No appointments scheduled for this date.
              </ThemedText>
            </View>
          ) : (
            dayAppointments.map((appt) => (
              <AppointmentCard
                key={appt.id}
                appointment={appt}
                variant="standard"
                onSelect={onSelectAppointment}
              />
            ))
          )}
        </ScrollView>
      </View>
    );
  }

  // Desktop workstation layout (>= 1024px) or tablet: Multi-provider timeline
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.scrollContent}
    >
      <View
        data-testid="calendar-day-multi-provider"
        testID="calendar-day-multi-provider"
        style={styles.desktopContainer}
      >
        {/* Unified Time Axis */}
        <View
          data-testid="day-time-axis"
          testID="day-time-axis"
          style={styles.timeAxis}
        >
          <View style={styles.timeHeaderSpacer}>
            <ThemedText variant="caption" color={theme.colors.textMuted}>
              Time
            </ThemedText>
          </View>
          {slots.map((s) => (
            <View key={s.timeStr} style={styles.timeLabelCell}>
              <ThemedText variant="caption" color={theme.colors.textSecondary}>
                {s.minute === 0 ? formatTime12(s.timeStr) : s.timeStr}
              </ThemedText>
            </View>
          ))}
        </View>

        {/* Side-by-side Doctor Columns */}
        {effectiveDoctors.map((doc) => (
          <DoctorTimelineColumn
            key={doc.doctorId}
            doctor={doc}
            dateString={dateString}
            cellDate={currentDate}
            slots={slots}
            appointments={appointments}
            onSelectSlot={onSelectSlot}
            onSelectAppointment={onSelectAppointment}
          />
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
  },
  desktopContainer: {
    flexDirection: 'row',
    minWidth: 700,
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
    height: 52,
    borderBottomWidth: theme.sizes.borderWidth,
    borderBottomColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeLabelCell: {
    height: 48,
    borderBottomWidth: theme.sizes.borderWidth,
    borderBottomColor: theme.colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mobileContainer: {
    flex: 1,
  },
  mobileTimeline: {
    padding: theme.spacing.md,
  },
  emptyDayNotice: {
    padding: theme.spacing['2xl'],
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default DayView;

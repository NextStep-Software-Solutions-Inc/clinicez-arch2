import React, { useState, useMemo } from 'react';
import { View, StyleSheet, ScrollView, Pressable } from 'react-native';
import { theme } from '../../constants/theme';
import ThemedText from '../ui/ThemedText';
import EmptyState from '../ui/EmptyState';
import ErrorState from '../ui/ErrorState';
import { CalendarSkeleton } from './CalendarSkeleton';
import { AppointmentCard } from './AppointmentCard';
import type { CalendarViewProps, ExtendedAppointmentItem } from './types';
import type { AppointmentStatus } from '../../services/clinicService';
import { getAppointmentLocalDateTime } from './calendarUtils';

const STATUS_FILTERS: { label: string; value: string }[] = [
  { label: 'All', value: 'ALL' },
  { label: 'Confirmed', value: 'Confirmed' },
  { label: 'Checked In', value: 'CheckedIn' },
  { label: 'Pending', value: 'Pending' },
];

export function AgendaView({
  currentDate,
  appointments,
  isLoading,
  error,
  onRetry,
  onSelectSlot,
  onSelectAppointment,
  onCheckIn,
  onReschedule,
  onCancel,
}: CalendarViewProps) {
  const [selectedFilter, setSelectedFilter] = useState<string>('ALL');

  const filteredAppointments = useMemo(() => {
    if (selectedFilter === 'ALL') return appointments;
    return appointments.filter((a) => a.status === selectedFilter);
  }, [appointments, selectedFilter]);

  // Group chronologically by date
  const grouped = useMemo(() => {
    const map: Record<string, ExtendedAppointmentItem[]> = {};
    const sorted = [...filteredAppointments].sort((a, b) =>
      a.scheduledAt.localeCompare(b.scheduledAt)
    );

    for (const a of sorted) {
      const d = getAppointmentLocalDateTime(a.scheduledAt).dateStr;
      if (!map[d]) map[d] = [];
      map[d].push(a);
    }
    return map;
  }, [filteredAppointments]);

  if (isLoading) {
    return <CalendarSkeleton viewMode="agenda" />;
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

  const groupKeys = Object.keys(grouped);

  return (
    <ScrollView
      data-testid="calendar-agenda-view"
      testID="calendar-agenda-view"
      contentContainerStyle={styles.container}
    >
      {/* Status Filter Bar */}
      <View style={styles.filterBar}>
        {STATUS_FILTERS.map((f) => {
          const active = selectedFilter === f.value;
          return (
            <Pressable
              key={f.value}
              accessibilityRole="button"
              accessibilityLabel={`Filter by ${f.label}`}
              onPress={() => setSelectedFilter(f.value)}
              style={({ pressed }) => [
                styles.filterPill,
                active && styles.filterPillActive,
                pressed && styles.pressed,
              ]}
            >
              <ThemedText
                variant="smallBold"
                color={active ? theme.colors.onPrimary : theme.colors.textSecondary}
              >
                {f.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>

      {/* Empty State */}
      {groupKeys.length === 0 ? (
        <View data-testid="agenda-empty" testID="agenda-empty" style={styles.emptyWrapper}>
          <EmptyState
            icon="calendar"
            title="No appointments scheduled"
            description="There are no scheduled appointments matching your criteria."
            actionTitle="Book appointment"
            onAction={() => {
              if (onSelectSlot) {
                onSelectSlot(currentDate, '09:00');
              }
            }}
          />
        </View>
      ) : (
        /* Grouped list of appointments */
        groupKeys.map((dateStr) => {
          const list = grouped[dateStr];
          return (
            <View
              key={dateStr}
              data-testid={`agenda-group-${dateStr}`}
              testID={`agenda-group-${dateStr}`}
              style={styles.groupSection}
            >
              <View
                data-testid="agenda-group-header"
                testID="agenda-group-header"
                style={styles.groupHeader}
              >
                <ThemedText variant="smallBold" color={theme.colors.primary}>
                  {dateStr}
                </ThemedText>
                <ThemedText variant="caption" color={theme.colors.textMuted}>
                  {list.length} {list.length === 1 ? 'appointment' : 'appointments'}
                </ThemedText>
              </View>

              {list.map((appt) => (
                <AppointmentCard
                  key={appt.id}
                  appointment={appt}
                  variant="standard"
                  onSelect={onSelectAppointment}
                  onCheckIn={onCheckIn}
                  onReschedule={onReschedule}
                  onCancel={onCancel}
                />
              ))}
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: theme.spacing.md,
    backgroundColor: theme.colors.background,
  },
  filterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.md,
    flexWrap: 'wrap',
  },
  filterPill: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radii.full,
    backgroundColor: theme.colors.surface,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
  },
  filterPillActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  emptyWrapper: {
    paddingVertical: theme.spacing['2xl'],
  },
  groupSection: {
    marginBottom: theme.spacing.lg,
  },
  groupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: theme.radii.md,
    marginBottom: theme.spacing.xs,
  },
  pressed: {
    opacity: 0.7,
  },
});

export default AgendaView;

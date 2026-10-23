import { useEffect, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StaticScreenProps } from '@react-navigation/native';
import { format, parseISO } from 'date-fns';
import ThemedText from '../../../components/ui/ThemedText';
import Card from '../../../components/ui/Card';
import Button from '../../../components/ui/Button';
import Screen from '../../../components/layout/Screen';
import { useOfflineAlert } from '../../../contexts/OfflineAlertContext';
import { safeAwait } from '@shared/safe';
import WeeklyDatePicker from '../../../components/appointments/WeeklyDatePicker';
import TimeSlotPicker from '../../../components/appointments/TimeSlotPicker';
import { useAppTheme } from '../../../contexts/ThemeContext';
import { db } from '../../../db/index';
import { useAuth } from '../../../contexts/AuthContext';
import {
  fetchAvailableSlots,
  rescheduleAppointment,
  getAppointmentDetail,
} from '../../../services/appointments/appointmentsService';
import type { AvailableSlot, AppointmentItem } from '../../../services/appointments/types';
import { dialog } from '../../../utils/dialog';

type Props = StaticScreenProps<{
  appointmentId: string;
  clinicId: string;
  currentScheduledAt: string;
}>;

export default function RescheduleScreen({ route }: Props) {
  const { colors, spacing, radii } = useAppTheme();
  const navigation = useNavigation<any>();

  const { appointmentId, clinicId, currentScheduledAt } = route.params;

  // Current appointment info
  const currentDateLabel = (() => {
    try {
      return format(parseISO(currentScheduledAt), 'EEEE, MMMM d, yyyy · h:mm a');
    } catch {
      return '';
    }
  })();

  // New schedule
  const [selectedDate, setSelectedDate] = useState(() => {
    try {
      const d = parseISO(currentScheduledAt);
      d.setDate(d.getDate() + 1);
      return format(d, 'yyyy-MM-dd');
    } catch {
      return format(new Date(), 'yyyy-MM-dd');
    }
  });
  const [slots, setSlots] = useState<AvailableSlot[]>([]);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [reason, setReason] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const { showOfflineAlert } = useOfflineAlert();

  const [appointment, setAppointment] = useState<AppointmentItem | null>(null);
  const { getToken, internalPatientId } = useAuth();

  // Fetch appointment detail
  useEffect(() => {
    let mounted = true;
    getAppointmentDetail(appointmentId, db).then((item) => {
      if (mounted) setAppointment(item);
    });
    return () => {
      mounted = false;
    };
  }, [appointmentId]);

  // Load slots when date changes
  useEffect(() => {
    if (!clinicId || !selectedDate || !appointment) return;
    let mounted = true;
    setIsLoadingSlots(true);
    setSlots([]);
    setSelectedSlotId(null);
    fetchAvailableSlots(clinicId, appointment.provider.id, selectedDate, getToken)
      .then((res) => {
        if (mounted) setSlots(res.slots);
      })
      .catch((err) =>
        dialog.alert('Server Error', `Unable to load available slots. ${err?.message || ''}`)
      )
      .finally(() => {
        if (mounted) setIsLoadingSlots(false);
      });
    return () => {
      mounted = false;
    };
  }, [clinicId, selectedDate, appointment, getToken]);

  const selectedSlot = slots.find((s) => s.id === selectedSlotId);
  const canSubmit = Boolean(selectedSlotId && reason.trim());

  const handleSubmit = async () => {
    if (!selectedSlot || !reason.trim()) return;
    setIsSaving(true);
    const newScheduledAt = new Date(`${selectedDate}T${selectedSlot.time}:00`).toISOString();

    const [updated, error] = await safeAwait(
      rescheduleAppointment(
        appointmentId,
        newScheduledAt,
        reason,
        db,
        getToken,
        internalPatientId ?? undefined,
      )
    );

    if (error) {
      if (error.message === 'OFFLINE_ERROR') {
        showOfflineAlert();
      } else {
        dialog.alert('Error', 'Unable to update the appointment. Please try again.');
      }
      setIsSaving(false);
      return;
    }

    if (!updated) {
      dialog.alert('Error', 'Appointment not found in local cache. Please refresh and try again.');
      setIsSaving(false);
      return;
    }

    setIsSaving(false);
    dialog.alert(
      'Reschedule Requested',
      `Your appointment has been updated to ${selectedSlot.displayTime} on ${format(
        new Date(selectedDate + 'T00:00:00'),
        'EEE, MMM d, yyyy'
      )}. Status reset to Pending - the clinic will re-confirm.`,
      [{ text: 'Done', onPress: () => navigation.goBack() }]
    );
  };

  return (
    <Screen width="form" contentContainerStyle={{ gap: spacing.lg }}>
      <ThemedText variant="small" color="textSecondary">
        Choose a new preferred date and time. The clinic will confirm the change.
      </ThemedText>

      {currentDateLabel ? (
        <Card padding="md" style={{ gap: spacing.xs }}>
          <ThemedText variant="captionBold" color="textMuted">
            CURRENT APPOINTMENT
          </ThemedText>
          <ThemedText variant="bodyBold">{currentDateLabel}</ThemedText>
        </Card>
      ) : null}

      {/* New date */}
      <View style={{ gap: spacing.sm }}>
        <ThemedText variant="captionBold" color="textMuted">
          NEW PREFERRED DATE
        </ThemedText>
        <Card padding="none" style={{ borderRadius: radii.lg, overflow: 'hidden' }}>
          <WeeklyDatePicker selectedDate={selectedDate} onSelectDate={setSelectedDate} />
        </Card>
      </View>

      {/* New time */}
      <View style={{ gap: spacing.sm }}>
        <ThemedText variant="captionBold" color="textMuted">
          NEW PREFERRED TIME
        </ThemedText>
        <TimeSlotPicker
          slots={slots}
          selectedSlotId={selectedSlotId}
          onSelectSlot={setSelectedSlotId}
          isLoading={isLoadingSlots}
        />
      </View>

      {/* Reason */}
      <View style={{ gap: spacing.sm }}>
        <ThemedText variant="captionBold" color="textMuted">
          REASON FOR RESCHEDULE *
        </ThemedText>
        <TextInput
          value={reason}
          onChangeText={setReason}
          placeholder="e.g. Work conflict, feeling unwell, family emergency..."
          placeholderTextColor={colors.textMuted}
          multiline
          numberOfLines={3}
          style={[
            styles.textArea,
            {
              borderColor: reason.trim() ? colors.primary : colors.border,
              color: colors.text,
              backgroundColor: colors.inputBackground,
              borderRadius: radii.md,
              padding: spacing.md,
            },
          ]}
          accessibilityLabel="Reason for reschedule"
        />
      </View>

      {/* Bottom action bar */}
      <View style={[styles.bottomNav, { gap: spacing.md, paddingTop: spacing.md }]}>
        <Button
          label="Cancel"
          variant="outline"
          size="lg"
          style={styles.cancelBtn}
          onPress={() => navigation.goBack()}
        />
        <Button
          label={isSaving ? 'Sending...' : 'Request Reschedule'}
          variant="primary"
          size="lg"
          disabled={!canSubmit || isSaving}
          loading={isSaving}
          style={styles.flex}
          onPress={handleSubmit}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  textArea: {
    borderWidth: 1,
    minHeight: 88,
    textAlignVertical: 'top',
  },
  bottomNav: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cancelBtn: {
    minWidth: 100,
  },
});

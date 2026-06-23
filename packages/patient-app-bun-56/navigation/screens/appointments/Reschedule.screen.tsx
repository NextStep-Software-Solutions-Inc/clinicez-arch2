// ─────────────────────────────────────────────────────────────────────────────
// Reschedule Appointment — formSheet
// Shows current appointment summary, new preferred date/time picker, and
// a reason field. Submits as a booking draft update.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useNavigation, useTheme } from '@react-navigation/native';
import type { StaticScreenProps } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { format, parseISO } from 'date-fns';
import ThemedText from '@ui/ThemedText';
import ThemedView from '@ui/ThemedView';
import { useOfflineAlert } from 'contexts/OfflineAlertContext';
import { safeAwait } from 'utils/safe';
import WeeklyDatePicker from 'components/appointments/WeeklyDatePicker';
import TimeSlotPicker from 'components/appointments/TimeSlotPicker';
import { db } from '@db/index';
import { useAuth } from '../../../contexts/AuthContext';
import { fetchAvailableSlots, rescheduleAppointment, getAppointmentDetail } from '../../../services/appointments/appointmentsService';
import type { AvailableSlot, AppointmentItem } from '../../../services/appointments/types';

type Props = StaticScreenProps<{
    appointmentId: string;
    clinicId: string;
    currentScheduledAt: string;
}>;

export default function RescheduleScreen({ route }: Props) {
    const { colors } = useTheme();
    const navigation = useNavigation();
    const insets = useSafeAreaInsets();

    const { appointmentId, clinicId, currentScheduledAt } = route.params;

    // Current appointment info
    const currentDateLabel = (() => {
        try { return format(parseISO(currentScheduledAt), 'EEEE, MMMM d, yyyy · h:mm a'); } catch { return ''; }
    })();

    // New schedule
    const [selectedDate, setSelectedDate] = useState(() => {
        try {
            // Default to the day after current appointment
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
    const { getToken } = useAuth();

    // Fetch appointment detail
    useEffect(() => {
        let mounted = true;
        getAppointmentDetail(appointmentId, db).then(item => {
            if (mounted) setAppointment(item);
        });
        return () => { mounted = false; };
    }, [appointmentId]);

    // Load slots when date changes
    useEffect(() => {
        if (!clinicId || !selectedDate || !appointment) return;
        let mounted = true;
        setIsLoadingSlots(true);
        setSlots([]);
        setSelectedSlotId(null);
        fetchAvailableSlots(clinicId, appointment.provider.id, selectedDate, getToken)
            .then(res => { if (mounted) setSlots(res.slots); })
            .catch((err) => Alert.alert('Server Error', `Unable to load available slots. ${err?.message || ''}`))
            .finally(() => { if (mounted) setIsLoadingSlots(false); });
        return () => { mounted = false; };
    }, [clinicId, selectedDate, appointment]);

    const selectedSlot = slots.find(s => s.id === selectedSlotId);
    const canSubmit = Boolean(selectedSlotId && reason.trim());

    const handleSubmit = async () => {
        if (!selectedSlot || !reason.trim()) return;
        setIsSaving(true);
        // Build the new ISO-8601 datetime by combining the selected date and slot time
        const newScheduledAt = new Date(`${selectedDate}T${selectedSlot.time}:00`).toISOString();

        // Update the appointment in-place: new date/time, status → pending, reason appended to notes
        const [updated, error] = await safeAwait(rescheduleAppointment(appointmentId, newScheduledAt, reason, db));

        if (error) {
            if (error.message === 'OFFLINE_ERROR') {
                showOfflineAlert();
            } else {
                Alert.alert('Error', 'Unable to update the appointment. Please try again.');
            }
            setIsSaving(false);
            return;
        }

        if (!updated) {
            Alert.alert('Error', 'Appointment not found in local cache. Please refresh and try again.');
            setIsSaving(false);
            return;
        }

        setIsSaving(false);
        Alert.alert(
            'Reschedule Requested',
            `Your appointment has been updated to ${selectedSlot.displayTime} on ${format(new Date(selectedDate + 'T00:00:00'), 'EEE, MMM d, yyyy')}. Status reset to Pending — the clinic will re-confirm.`,
            [{ text: 'Done', onPress: () => navigation.goBack() }],
        );
    };

    return (
        <ThemedView style={styles.screen}>
            <ScrollView
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
            >
                {/* Current appointment summary */}
                <View style={styles.header}>
                    <ThemedText style={styles.screenTitle}>Request Reschedule</ThemedText>
                    <ThemedText style={[styles.screenSubtitle, { color: colors.text }]}>
                        Choose a new preferred date and time. The clinic will confirm the change.
                    </ThemedText>
                </View>

                {currentDateLabel ? (
                    <View style={[styles.currentCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
                        <ThemedText style={[styles.currentLabel, { color: colors.text }]}>Current appointment</ThemedText>
                        <ThemedText style={styles.currentDate}>{currentDateLabel}</ThemedText>
                    </View>
                ) : null}

                {/* New date */}
                <View style={styles.section}>
                    <ThemedText style={styles.sectionTitle}>NEW PREFERRED DATE</ThemedText>
                    <View style={[styles.datePickerCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
                        <WeeklyDatePicker selectedDate={selectedDate} onSelectDate={setSelectedDate} />
                    </View>
                </View>

                {/* New time */}
                <View style={styles.section}>
                    <ThemedText style={styles.sectionTitle}>NEW PREFERRED TIME</ThemedText>
                    <TimeSlotPicker
                        slots={slots}
                        selectedSlotId={selectedSlotId}
                        onSelectSlot={setSelectedSlotId}
                        isLoading={isLoadingSlots}
                    />
                </View>

                {/* Reason */}
                <View style={styles.section}>
                    <ThemedText style={styles.sectionTitle}>REASON FOR RESCHEDULE *</ThemedText>
                    <TextInput
                        value={reason}
                        onChangeText={setReason}
                        placeholder="e.g. Work conflict, feeling unwell, family emergency..."
                        placeholderTextColor="rgba(100,100,100,0.5)"
                        multiline
                        numberOfLines={3}
                        style={[
                            styles.textArea,
                            {
                                borderColor: reason.trim() ? colors.primary : colors.border,
                                color: colors.text,
                                backgroundColor: colors.card,
                            },
                        ]}
                        accessibilityLabel="Reason for reschedule"
                    />
                </View>
            </ScrollView>

            {/* Bottom action bar */}
            <View
                style={[
                    styles.bottomNav,
                    { borderTopColor: colors.border, backgroundColor: colors.card, paddingBottom: insets.bottom + 12 },
                ]}
            >
                <Pressable
                    onPress={() => navigation.goBack()}
                    style={[styles.cancelBtn, { borderColor: colors.border }]}
                    accessibilityRole="button"
                >
                    <ThemedText style={[styles.cancelBtnText, { color: colors.text }]}>Cancel</ThemedText>
                </Pressable>
                <Pressable
                    onPress={handleSubmit}
                    disabled={!canSubmit || isSaving}
                    style={[
                        styles.submitBtn,
                        { backgroundColor: colors.primary, opacity: canSubmit && !isSaving ? 1 : 0.4 },
                    ]}
                    accessibilityRole="button"
                >
                    <ThemedText style={styles.submitBtnText}>
                        {isSaving ? 'Sending...' : 'Request Reschedule'}
                    </ThemedText>
                </Pressable>
            </View>
        </ThemedView>
    );
}

const styles = StyleSheet.create({
    screen: { flex: 1 },
    scrollContent: { gap: 16, paddingBottom: 24 },
    header: { paddingHorizontal: 16, paddingTop: 8, gap: 6 },
    screenTitle: { fontSize: 22, fontWeight: '800' },
    screenSubtitle: { fontSize: 14, lineHeight: 20, opacity: 0.7 },
    currentCard: {
        marginHorizontal: 16,
        borderRadius: 14,
        borderWidth: StyleSheet.hairlineWidth,
        padding: 14,
        gap: 4,
    },
    currentLabel: { fontSize: 11, fontWeight: '600', opacity: 0.55, textTransform: 'uppercase', letterSpacing: 0.5 },
    currentDate: { fontSize: 15, fontWeight: '700' },
    section: { paddingHorizontal: 16, gap: 10 },
    sectionTitle: {
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 0.6,
        opacity: 0.55,
        textTransform: 'uppercase',
    },
    datePickerCard: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
    textArea: {
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: 12,
        minHeight: 80,
        paddingHorizontal: 14,
        paddingVertical: 12,
        fontSize: 14,
        textAlignVertical: 'top',
        lineHeight: 20,
    },
    bottomNav: {
        paddingHorizontal: 16,
        paddingTop: 12,
        borderTopWidth: StyleSheet.hairlineWidth,
        flexDirection: 'row',
        gap: 10,
    },
    cancelBtn: {
        paddingHorizontal: 18,
        paddingVertical: 13,
        borderRadius: 999,
        borderWidth: 1.5,
        alignItems: 'center',
        justifyContent: 'center',
    },
    cancelBtnText: { fontSize: 14, fontWeight: '600' },
    submitBtn: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 999,
        alignItems: 'center',
        justifyContent: 'center',
    },
    submitBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});

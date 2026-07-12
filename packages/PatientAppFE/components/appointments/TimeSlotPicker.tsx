import { Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from '@react-navigation/native';
import ThemedText from '@ui/ThemedText';
import type { AvailableSlot } from '../../services/appointments/types';

interface TimeSlotPickerProps {
    slots: AvailableSlot[];
    selectedSlotId: string | null;
    onSelectSlot: (slotId: string) => void;
    isLoading?: boolean;
}

const PERIOD_LABELS: Record<string, string> = {
    morning: '🌅  Morning',
    afternoon: '☀️  Afternoon',
    evening: '🌙  Evening',
};

export default function TimeSlotPicker({ slots, selectedSlotId, onSelectSlot, isLoading }: TimeSlotPickerProps) {
    const { colors } = useTheme();

    if (isLoading) {
        return (
            <View style={styles.loadingRow}>
                {Array.from({ length: 4 }).map((_, i) => (
                    <View key={i} style={[styles.placeholderChip, { borderColor: colors.border }]} />
                ))}
            </View>
        );
    }

    if (slots.length === 0) {
        return (
            <ThemedText style={[styles.emptyText, { color: colors.text }]}>
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
        <View style={styles.container}>
            {order.map(period => (
                <View key={period} style={styles.group}>
                    <ThemedText style={[styles.periodLabel, { color: colors.text }]}>
                        {PERIOD_LABELS[period] ?? period}
                    </ThemedText>
                    <View style={styles.chipsRow}>
                        {groups[period].map(slot => {
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
                                    style={[
                                        styles.chip,
                                        {
                                            borderColor: isSelected ? colors.primary : colors.border,
                                            backgroundColor: isSelected
                                                ? colors.primary
                                                : isUnavailable
                                                    ? 'rgba(148,163,184,0.08)'
                                                    : colors.card,
                                        },
                                    ]}
                                >
                                    <ThemedText style={[
                                        styles.chipText,
                                        isSelected && styles.chipTextSelected,
                                        isUnavailable && styles.chipTextUnavailable,
                                    ]}>
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
    container: {
        gap: 14,
    },
    group: {
        gap: 8,
    },
    periodLabel: {
        fontSize: 13,
        fontWeight: '600',
        opacity: 0.7,
    },
    chipsRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    chip: {
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 999,
        borderWidth: 1.5,
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 76,
    },
    chipText: {
        fontSize: 13,
        fontWeight: '600',
    },
    chipTextSelected: {
        color: '#fff',
        fontWeight: '700',
    },
    chipTextUnavailable: {
        opacity: 0.35,
    },
    loadingRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    placeholderChip: {
        width: 80,
        height: 36,
        borderRadius: 999,
        borderWidth: 1,
        backgroundColor: 'rgba(148,163,184,0.12)',
    },
    emptyText: {
        fontSize: 13,
        opacity: 0.6,
        textAlign: 'center',
        paddingVertical: 12,
    },
});

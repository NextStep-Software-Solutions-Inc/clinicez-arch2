import { StyleSheet, View } from 'react-native';
import ThemedText from '@ui/ThemedText';
import type { AppointmentStatus } from '../../services/appointments/types';

interface AppointmentStatusBadgeProps {
    status: AppointmentStatus;
    size?: 'sm' | 'md';
}

const STATUS_LABELS: Record<AppointmentStatus, string> = {
    confirmed: 'Confirmed',
    pending: 'Pending',
    canceled: 'Canceled',
    action_required: 'Action Required',
    completed: 'Completed',
    no_show: 'No Show',
};

const STATUS_COLORS: Record<AppointmentStatus, string> = {
    confirmed: '#10B981',
    pending: '#94A3B8',
    canceled: '#EF4444',
    action_required: '#F97316',
    completed: '#6366F1',
    no_show: '#78716C',
};

export default function AppointmentStatusBadge({ status, size = 'md' }: AppointmentStatusBadgeProps) {
    const color = STATUS_COLORS[status];
    const label = STATUS_LABELS[status];
    const isSmall = size === 'sm';

    return (
        <View style={[
            styles.badge,
            { backgroundColor: `${color}22`, borderColor: `${color}55` },
            isSmall && styles.badgeSmall,
        ]}>
            <View style={[styles.dot, { backgroundColor: color }]} />
            <ThemedText style={[styles.label, { color }, isSmall && styles.labelSmall]}>
                {label}
            </ThemedText>
        </View>
    );
}

const styles = StyleSheet.create({
    badge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 999,
        borderWidth: 1,
        alignSelf: 'flex-start',
    },
    badgeSmall: {
        paddingHorizontal: 7,
        paddingVertical: 3,
        gap: 4,
    },
    dot: {
        width: 6,
        height: 6,
        borderRadius: 3,
    },
    label: {
        fontSize: 12,
        fontWeight: '700',
        letterSpacing: 0.2,
    },
    labelSmall: {
        fontSize: 10,
    },
});

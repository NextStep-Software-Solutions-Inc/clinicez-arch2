import { Image, Pressable, StyleSheet } from 'react-native';
import { useTheme } from '@react-navigation/native';
import ThemedText from '@ui/ThemedText';
import ThemedView from '@ui/ThemedView';
import AppointmentStatusBadge from './AppointmentStatusBadge';
import type { AppointmentItem, AppointmentStatus } from '../../services/appointments/types';
import { format, parseISO } from 'date-fns';

const STATUS_BG: Record<AppointmentStatus, string> = {
    confirmed: '#10B98115',
    pending: '#94A3B815',
    canceled: '#EF444415',
    action_required: '#F9731615',
    completed: '#6366F115',
    no_show: '#78716C15',
};

const STATUS_BORDER: Record<AppointmentStatus, string> = {
    confirmed: '#10B98135',
    pending: '#94A3B835',
    canceled: '#EF444435',
    action_required: '#F9731635',
    completed: '#6366F135',
    no_show: '#78716C35',
};

interface AppointmentCardProps {
    item: AppointmentItem;
    onPress: () => void;
    onReschedule?: () => void;
    onCancel?: () => void;
    isToday?: boolean;
}

function ProviderAvatar({ url, name }: { url?: string | null; name: string }) {
    const initials = name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
    if (url) {
        return (
            <Image
                source={{ uri: url }}
                style={styles.providerAvatar}
                accessibilityRole="image"
                accessibilityLabel={name}
            />
        );
    }
    return (
        <ThemedView style={[styles.providerAvatar, styles.avatarFallback]}>
            <ThemedText style={styles.avatarInitials}>{initials}</ThemedText>
        </ThemedView>
    );
}

function ClinicLogo({ url, name }: { url?: string | null; name: string }) {
    const initials = name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
    if (url) {
        return (
            <Image source={{ uri: url }} style={styles.clinicLogo} accessibilityRole="image" accessibilityLabel={name} />
        );
    }
    return (
        <ThemedView style={[styles.clinicLogo, styles.clinicLogoFallback]}>
            <ThemedText style={styles.clinicLogoInitials}>{initials}</ThemedText>
        </ThemedView>
    );
}

export default function AppointmentCard({
    item,
    onPress,
    onReschedule,
    onCancel,
    isToday = false,
}: AppointmentCardProps) {
    const { colors } = useTheme();

    let dateLabel = '';
    let timeLabel = '';
    try {
        const d = parseISO(item.scheduledAt);
        dateLabel = format(d, 'EEE, MMM d');
        timeLabel = format(d, 'h:mm a');
    } catch {
        dateLabel = item.scheduledAt.slice(0, 10);
    }

    const borderColor = isToday
        ? STATUS_BORDER[item.status]
        : colors.border;
    const bgColor = isToday
        ? STATUS_BG[item.status]
        : colors.card;
    const isFinal = item.status === 'canceled' || item.status === 'completed' || item.status === 'no_show';

    return (
        <Pressable
            onPress={onPress}
            accessibilityRole="button"
            style={({ pressed }) => [
                styles.card,
                { borderColor, backgroundColor: bgColor, opacity: pressed ? 0.86 : 1 },
            ]}
        >
            {/* Clinic row */}
            <ThemedView style={styles.clinicRow}>
                <ClinicLogo url={item.clinic.logoUrl} name={item.clinic.name} />
                <ThemedView style={styles.clinicInfo}>
                    <ThemedText style={styles.clinicName} numberOfLines={1}>{item.clinic.name}</ThemedText>
                    <ThemedText style={[styles.serviceType, { color: colors.text }]} numberOfLines={1}>
                        {item.serviceType}
                    </ThemedText>
                </ThemedView>
                <AppointmentStatusBadge status={item.status} size="sm" />
            </ThemedView>

            {/* Date / Time */}
            <ThemedView style={styles.timeRow}>
                <ThemedView style={styles.timeBlock}>
                    <ThemedText style={styles.timeLabel}>{timeLabel}</ThemedText>
                    <ThemedText style={[styles.dateLabel, { color: colors.text }]}>{dateLabel}</ThemedText>
                </ThemedView>
                <ThemedView style={[styles.durationChip, { borderColor: colors.border }]}>
                    <ThemedText style={[styles.durationText, { color: colors.text }]}>
                        {item.durationMinutes} min
                    </ThemedText>
                </ThemedView>
            </ThemedView>

            {/* Provider row */}
            <ThemedView style={[styles.providerRow, { borderTopColor: colors.border }]}>
                <ProviderAvatar url={item.provider.avatarUrl} name={item.provider.name} />
                <ThemedView style={styles.providerInfo}>
                    <ThemedText style={styles.providerName} numberOfLines={1}>{item.provider.name}</ThemedText>
                    <ThemedText style={[styles.providerSpecialty, { color: colors.text }]} numberOfLines={1}>
                        {item.provider.specialty}
                    </ThemedText>
                </ThemedView>
            </ThemedView>

            {/* Quick actions — only for non-terminal statuses */}
            {!isFinal && (onReschedule || onCancel) && (
                <ThemedView style={[styles.actionsRow, { borderTopColor: colors.border }]}>
                    {onReschedule && (
                        <Pressable
                            onPress={(e) => { e.stopPropagation?.(); onReschedule(); }}
                            style={styles.actionBtn}
                            accessibilityRole="button"
                            accessibilityLabel="Reschedule"
                        >
                            <ThemedText style={[styles.actionBtnText, { color: colors.primary }]}>
                                Reschedule
                            </ThemedText>
                        </Pressable>
                    )}
                    {onCancel && (
                        <Pressable
                            onPress={(e) => { e.stopPropagation?.(); onCancel(); }}
                            style={styles.actionBtn}
                            accessibilityRole="button"
                            accessibilityLabel="Cancel"
                        >
                            <ThemedText style={[styles.actionBtnText, { color: '#EF4444' }]}>Cancel</ThemedText>
                        </Pressable>
                    )}
                </ThemedView>
            )}
        </Pressable>
    );
}

const styles = StyleSheet.create({
    card: {
        borderRadius: 18,
        borderWidth: StyleSheet.hairlineWidth,
        overflow: 'hidden',
    },
    clinicRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        padding: 14,
    },
    clinicLogo: {
        width: 40,
        height: 40,
        borderRadius: 10,
    },
    clinicLogoFallback: {
        backgroundColor: '#1D4ED8',
        alignItems: 'center',
        justifyContent: 'center',
    },
    clinicLogoInitials: {
        color: '#fff',
        fontSize: 13,
        fontWeight: '800',
    },
    clinicInfo: {
        flex: 1,
        gap: 1,
    },
    clinicName: {
        fontSize: 15,
        fontWeight: '700',
    },
    serviceType: {
        fontSize: 12,
        opacity: 0.65,
    },
    timeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 14,
        paddingBottom: 12,
        gap: 8,
    },
    timeBlock: {
        gap: 1,
    },
    timeLabel: {
        fontSize: 26,
        fontWeight: '800',
        letterSpacing: -0.5,
    },
    dateLabel: {
        fontSize: 13,
        fontWeight: '500',
        opacity: 0.7,
    },
    durationChip: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 999,
        borderWidth: StyleSheet.hairlineWidth,
    },
    durationText: {
        fontSize: 12,
        fontWeight: '600',
        opacity: 0.7,
    },
    providerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        padding: 12,
        paddingTop: 10,
        borderTopWidth: StyleSheet.hairlineWidth,
    },
    providerAvatar: {
        width: 30,
        height: 30,
        borderRadius: 15,
    },
    avatarFallback: {
        backgroundColor: '#94A3B8',
        alignItems: 'center',
        justifyContent: 'center',
    },
    avatarInitials: {
        color: '#fff',
        fontSize: 11,
        fontWeight: '700',
    },
    providerInfo: {
        flex: 1,
        gap: 1,
    },
    providerName: {
        fontSize: 13,
        fontWeight: '600',
    },
    providerSpecialty: {
        fontSize: 11,
        opacity: 0.65,
    },
    actionsRow: {
        flexDirection: 'row',
        borderTopWidth: StyleSheet.hairlineWidth,
    },
    actionBtn: {
        flex: 1,
        paddingVertical: 11,
        alignItems: 'center',
        justifyContent: 'center',
    },
    actionBtnText: {
        fontSize: 13,
        fontWeight: '700',
    },
});

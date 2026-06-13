import { useEffect, useMemo } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useNavigation, useRoute, useTheme } from '@react-navigation/native';
import { SFSymbol, MaterialSymbol } from '@react-navigation/native';
import { format } from 'date-fns';
import ThemedText from '@ui/ThemedText';
import { markAsRead } from 'services/notifications/notificationService';
import { useNotificationContext } from 'contexts/NotificationContext';
import type { getNotifications } from 'services/notifications/notificationService';
import type { NotificationType } from '@db/schema/notifications';

type NotificationRow = Awaited<ReturnType<typeof getNotifications>>[number];

// ─── Category metadata ────────────────────────────────────────────────────────

const CATEGORY_META: Record<
    string,
    { color: string; iconAndroid: string; iconIos: string; label: string }
> = {
    appointments: { color: '#3B82F6', iconAndroid: 'event', iconIos: 'calendar.circle.fill', label: 'Appointment' },
    reminders: { color: '#F59E0B', iconAndroid: 'alarm', iconIos: 'alarm.fill', label: 'Reminder' },
    clinic: { color: '#10B981', iconAndroid: 'local_hospital', iconIos: 'cross.case.fill', label: 'Clinic' },
    messages: { color: '#8B5CF6', iconAndroid: 'chat', iconIos: 'message.fill', label: 'Message' },
    system: { color: '#6B7280', iconAndroid: 'info', iconIos: 'info.circle.fill', label: 'System' },
};

// ─── Deep-link action config ───────────────────────────────────────────────────

interface DeepLinkAction {
    label: string;
    iconIos: string;
    iconAndroid: string;
    color: string;
    /** Navigate after dismissing the sheet */
    navigate: (nav: ReturnType<typeof useNavigation>) => void;
}

function getDeepLinkAction(
    notification: NotificationRow,
): DeepLinkAction | null {
    const type = notification.type as NotificationType;
    // data is stored as a JSON string; parse it safely
    let extraData: Record<string, unknown> = {};
    try {
        if (notification.data) extraData = JSON.parse(notification.data);
    } catch (_) { }

    const sid = notification.sourceId;

    switch (type) {
        case 'appointment_reminder': {
            const appointmentId = (sid ?? extraData?.appointmentId) as string | undefined;
            return {
                label: 'View Appointment',
                iconIos: 'calendar.circle.fill',
                iconAndroid: 'event',
                color: '#3B82F6',
                navigate: (nav) => {
                    if (appointmentId) {
                        nav.navigate('Main', {
                            screen: 'AppointmentDetailScreen',
                            params: { appointmentId },
                        } as any);
                    } else {
                        // Fall back to the Appointments tab
                        nav.navigate('Main', {
                            screen: 'BottomTabs',
                            params: { screen: 'AppointmentsScreen' },
                        } as any);
                    }
                },
            };
        }

        case 'medication_reminder':
            return {
                label: 'View Prescriptions',
                iconIos: 'pills.fill',
                iconAndroid: 'medication',
                color: '#F59E0B',
                navigate: (nav) => {
                    nav.navigate('Main', { screen: 'PrescriptionsScreen' } as any);
                },
            };

        case 'lab_result':
            return {
                label: 'View Lab Results',
                iconIos: 'cross.vial.fill',
                iconAndroid: 'biotech',
                color: '#10B981',
                navigate: (nav) => {
                    nav.navigate('Main', { screen: 'LabResultsScreen' } as any);
                },
            };

        case 'clinic_announcement': {
            const clinicId = (sid ?? extraData?.clinicId) as string | undefined;
            if (!clinicId) return null;
            return {
                label: 'View Clinic',
                iconIos: 'building.2.fill',
                iconAndroid: 'local_hospital',
                color: '#10B981',
                navigate: (nav) => {
                    nav.navigate('Main', {
                        screen: 'ClinicDetailsScreen',
                        params: { clinicId },
                    } as any);
                },
            };
        }

        case 'new_message':
            // No dedicated messages screen yet; action omitted
            return null;

        case 'system':
        default:
            return null;
    }
}

// ─── Screen ────────────────────────────────────────────────────────────────────

export default function NotificationDetailScreen() {
    const navigation = useNavigation();
    const route = useRoute();
    const { colors } = useTheme();
    const { refreshNotifications } = useNotificationContext();

    const notification = (route.params as { notification: NotificationRow }).notification;
    const meta = CATEGORY_META[notification.category] ?? CATEGORY_META.system;
    const deepLink = useMemo(() => getDeepLinkAction(notification), [notification]);

    const createdAt =
        notification.createdAt instanceof Date
            ? notification.createdAt
            : new Date(notification.createdAt as number);

    // Mark as read on open
    useEffect(() => {
        if (!notification.isRead) {
            markAsRead(notification.id).then(() => refreshNotifications());
        }
    }, [notification.id, notification.isRead, refreshNotifications]);

    // "Done" in header right
    useEffect(() => {
        navigation.setOptions({
            headerRight: () => (
                <ThemedText
                    onPress={() => navigation.goBack()}
                    style={{ color: colors.primary, fontSize: 16, fontWeight: '600' }}
                >
                    Done
                </ThemedText>
            ),
        });
    }, [navigation, colors.primary]);

    const handleDeepLink = () => {
        if (!deepLink) return;
        // Dismiss the sheet first, then navigate after the animation completes
        navigation.goBack();
        setTimeout(() => deepLink.navigate(navigation), 350);
    };

    return (
        <ScrollView
            contentInsetAdjustmentBehavior="automatic"
            contentContainerStyle={styles.container}
        >
            {/* Icon + category pill */}
            <View style={styles.iconRow}>
                <View style={[styles.iconCircle, { backgroundColor: meta.color + '22' }]}>
                    {Platform.select({
                        ios: <SFSymbol name={meta.iconIos as any} size={28} color={meta.color} />,
                        android: <MaterialSymbol name={meta.iconAndroid as any} size={32} color={meta.color} />,
                    })}
                </View>
                <View style={[styles.categoryPill, { backgroundColor: meta.color + '22' }]}>
                    <ThemedText style={[styles.categoryLabel, { color: meta.color }]}>
                        {meta.label}
                    </ThemedText>
                </View>
            </View>

            {/* Title */}
            <ThemedText style={[styles.title, { color: colors.text }]}>
                {notification.title}
            </ThemedText>

            {/* Timestamp */}
            <ThemedText style={[styles.timestamp, { color: colors.text }]}>
                {format(createdAt, "MMMM d, yyyy 'at' h:mm a")}
            </ThemedText>

            {/* Divider */}
            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            {/* Body */}
            <ThemedText style={[styles.body, { color: colors.text }]}>
                {notification.body}
            </ThemedText>

            {/* Deep-link CTA — only shown when a target screen exists */}
            {deepLink && (
                <Pressable
                    onPress={handleDeepLink}
                    style={({ pressed }) => [
                        styles.ctaButton,
                        { backgroundColor: deepLink.color, opacity: pressed ? 0.82 : 1 },
                    ]}
                >
                    <View style={styles.ctaInner}>
                        {Platform.select({
                            ios: <SFSymbol name={deepLink.iconIos as any} size={18} color="#fff" />,
                            android: <MaterialSymbol name={deepLink.iconAndroid as any} size={20} color="#fff" />,
                        })}
                        <ThemedText style={styles.ctaLabel}>{deepLink.label}</ThemedText>
                        {Platform.select({
                            ios: <SFSymbol name="chevron.right" size={14} color="#fff" />,
                            android: <MaterialSymbol name="chevron_right" size={18} color="#fff" />,
                        })}
                    </View>
                </Pressable>
            )}
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        padding: 24,
        gap: 12,
    },
    iconRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 4,
    },
    iconCircle: {
        width: 56,
        height: 56,
        borderRadius: 28,
        alignItems: 'center',
        justifyContent: 'center',
    },
    categoryPill: {
        borderRadius: 20,
        paddingHorizontal: 12,
        paddingVertical: 5,
    },
    categoryLabel: {
        fontSize: 13,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    title: {
        fontSize: 22,
        fontWeight: '700',
        lineHeight: 28,
    },
    timestamp: {
        fontSize: 13,
        opacity: 0.45,
    },
    divider: {
        height: StyleSheet.hairlineWidth,
        marginVertical: 4,
    },
    body: {
        fontSize: 16,
        lineHeight: 24,
        opacity: 0.85,
    },
    ctaButton: {
        borderRadius: 14,
        marginTop: 8,
        overflow: 'hidden',
    },
    ctaInner: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 14,
        paddingHorizontal: 20,
    },
    ctaLabel: {
        flex: 1,
        color: '#fff',
        fontSize: 15,
        fontWeight: '700',
    },
});

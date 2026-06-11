import { useEffect, useRef, useState } from 'react';
import { Alert, Image, Linking, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useNavigation, useTheme } from '@react-navigation/native';
import type { StaticScreenProps } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { differenceInSeconds, format, parseISO } from 'date-fns';
import ThemedText from '@ui/ThemedText';
import ThemedView from '@ui/ThemedView';
import EntityCoverHeader from '@ui/EntityCoverHeader';
import { SkeletonCard } from '@ui/Skeleton';
import AppointmentStatusBadge from 'components/appointments/AppointmentStatusBadge';
import { db } from '@db/index';
import { getAppointmentDetail } from '../../../services/appointments/appointmentsService';
import type { AppointmentItem, AttachedDocument, ProviderSnapshot } from '../../../services/appointments/types';

type Props = StaticScreenProps<{ appointmentId: string }>;

function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

function formatCountdown(seconds: number): string {
    if (seconds <= 0) return 'Overdue';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
}

function PaymentCountdown({ dueAt }: { dueAt: string }) {
    const [secondsLeft, setSecondsLeft] = useState(() => {
        try { return Math.max(0, differenceInSeconds(parseISO(dueAt), new Date())); } catch { return 0; }
    });

    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    useEffect(() => {
        timerRef.current = setInterval(() => {
            setSecondsLeft(() => {
                try { return Math.max(0, differenceInSeconds(parseISO(dueAt), new Date())); } catch { return 0; }
            });
        }, 1000);
        return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }, [dueAt]);

    const isOverdue = secondsLeft <= 0;
    return (
        <ThemedText style={[styles.countdownText, isOverdue && styles.countdownOverdue]}>
            {isOverdue ? '⚠️ Payment overdue — appointment may be canceled' : `⏱ Pay within: ${formatCountdown(secondsLeft)}`}
        </ThemedText>
    );
}

function DocumentRow({ doc }: { doc: AttachedDocument }) {
    const { colors } = useTheme();
    const uploadedLabel = (() => {
        try { return format(parseISO(doc.uploadedAt), 'MMM d, yyyy'); } catch { return ''; }
    })();
    return (
        <View style={[styles.docRow, { borderColor: colors.border }]}>
            <View style={styles.docIconBox}>
                <ThemedText style={[styles.docIcon, { color: colors.primary }]}>📄</ThemedText>
            </View>
            <View style={styles.docInfo}>
                <ThemedText style={styles.docName} numberOfLines={1}>{doc.name}</ThemedText>
                <ThemedText style={[styles.docMeta, { color: colors.text }]}>
                    {uploadedLabel} · {formatFileSize(doc.sizeBytes)}
                </ThemedText>
            </View>
        </View>
    );
}

function ProviderBlock({
    provider,
    onViewProfile,
}: {
    provider: ProviderSnapshot;
    onViewProfile: () => void;
}) {
    const { colors } = useTheme();
    const initials = provider.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
    return (
        <View style={[styles.section, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <ThemedText style={styles.sectionTitle}>Care Provider</ThemedText>
            <View style={styles.providerRow}>
                {provider.avatarUrl ? (
                    <Image
                        source={{ uri: provider.avatarUrl }}
                        style={styles.providerAvatar}
                        accessibilityRole="image"
                        accessibilityLabel={provider.name}
                    />
                ) : (
                    <View style={[styles.providerAvatar, styles.providerAvatarFallback]}>
                        <ThemedText style={styles.providerAvatarInitials}>{initials}</ThemedText>
                    </View>
                )}
                <View style={styles.providerInfo}>
                    <ThemedText style={styles.providerName}>{provider.name}</ThemedText>
                    <ThemedText style={[styles.providerSpecialty, { color: colors.text }]}>
                        {provider.specialty}
                    </ThemedText>
                    {provider.credentials.length > 0 && (
                        <View style={styles.credRow}>
                            {provider.credentials.map(c => (
                                <View
                                    key={c}
                                    style={[styles.credChip, { borderColor: colors.border }]}
                                >
                                    <ThemedText style={[styles.credText, { color: colors.primary }]}>{c}</ThemedText>
                                </View>
                            ))}
                        </View>
                    )}
                </View>
            </View>
            <Pressable
                onPress={onViewProfile}
                style={[styles.viewProfileBtn, { borderColor: colors.primary }]}
                accessibilityRole="button"
            >
                <ThemedText style={[styles.viewProfileText, { color: colors.primary }]}>VIEW PROFILE</ThemedText>
            </Pressable>
        </View>
    );
}

export default function AppointmentDetailScreen({ route }: Props) {
    const { colors } = useTheme();
    const navigation = useNavigation();
    const insets = useSafeAreaInsets();
    const { appointmentId } = route.params;

    const [item, setItem] = useState<AppointmentItem | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isPaidLocally, setIsPaidLocally] = useState(false);

    useEffect(() => {
        let mounted = true;
        getAppointmentDetail(appointmentId, db)
            .then(detail => { if (mounted) setItem(detail); })
            .catch(() =>
                Alert.alert('Error', 'Unable to load appointment details.', [
                    { text: 'OK', onPress: () => navigation.goBack() },
                ])
            )
            .finally(() => { if (mounted) setIsLoading(false); });
        return () => { mounted = false; };
    }, [appointmentId, navigation]);

    const effectivePaid = isPaidLocally || item?.paymentStatus === 'paid';

    const handlePayNow = () => {
        if (!item) return;
        const amount = item.invoiceAmount ?? 0;
        if (amount === 0) {
            // Free — auto-confirm immediately
            setIsPaidLocally(true);
            Alert.alert('Payment Confirmed', 'This appointment is free of charge. You\'re all set!');
        } else {
            // Payment gateway not yet integrated
            Alert.alert(
                'Online Payment Coming Soon',
                `Secure online payment for ${item.currency ?? 'PHP'} ${amount.toFixed(2)} is being set up. Please pay at the clinic on your appointment day.`,
                [{ text: 'OK' }],
            );
        }
    };

    const handleGetDirections = () => {
        if (!item) return;
        const address = encodeURIComponent(item.clinic.address);
        const url = Platform.OS === 'ios' ? `maps:?q=${address}` : `geo:0,0?q=${address}`;
        Linking.openURL(url).catch(() => Linking.openURL(`https://maps.google.com/?q=${address}`));
    };

    const handleViewProfile = () => {
        if (!item) return;
        // Local bookings use a placeholder provider — show an informational modal
        if (item.provider.id === 'local-pending') {
            Alert.alert(
                'Provider Not Yet Assigned',
                `${item.clinic.name} will assign a healthcare provider once your appointment request has been reviewed and confirmed. You will be notified when a provider is assigned.`,
                [{ text: 'OK' }],
            );
            return;
        }
        navigation.navigate('Main', { screen: 'ProviderProfileScreen', params: { providerData: item.provider } });
    };

    const handleReschedule = () => {
        if (!item) return;
        navigation.navigate('Main', {
            screen: 'RescheduleScreen',
            params: { appointmentId: item.id, clinicId: item.clinic.id, currentScheduledAt: item.scheduledAt },
        });
    };

    const handleCancel = () => {
        Alert.alert('Cancel Appointment', 'Are you sure you want to cancel this appointment?', [
            { text: 'Keep', style: 'cancel' },
            {
                text: 'Cancel Appointment', style: 'destructive',
                onPress: () => Alert.alert('Coming soon', 'Cancellation requires the backend API.')
            },
        ]);
    };

    if (isLoading || !item) {
        return (
            <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
                <SkeletonCard /><SkeletonCard /><SkeletonCard />
            </ScrollView>
        );
    }

    let dateLabel = '';
    let timeLabel = '';
    try {
        const d = parseISO(item.scheduledAt);
        dateLabel = format(d, 'EEEE, MMMM d, yyyy');
        timeLabel = format(d, 'h:mm a');
    } catch {
        dateLabel = item.scheduledAt.slice(0, 10);
    }

    const patientDocs = item.attachedDocuments.filter(d => d.uploadedBy === 'patient');
    const clinicDocs = item.attachedDocuments.filter(d => d.uploadedBy === 'clinic');
    const isFinalStatus = item.status === 'canceled' || item.status === 'completed' || item.status === 'no_show';

    return (
        <ThemedView style={styles.screen}>
            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
            >
                {/* Clinic Hero */}
                <View style={styles.heroWrapper}>
                    <EntityCoverHeader
                        name={item.clinic.name}
                        logoUrl={item.clinic.logoUrl}
                        coverImageUrl={item.clinic.coverImageUrl}
                    />
                    <View style={styles.heroInfo}>
                        <ThemedText style={styles.heroClinicName}>{item.clinic.name}</ThemedText>
                        <ThemedText style={[styles.heroAddress, { color: colors.text }]}>{item.clinic.address}</ThemedText>
                        {item.clinic.phoneNumber ? (
                            <ThemedText style={[styles.heroPhone, { color: colors.text }]}>{item.clinic.phoneNumber}</ThemedText>
                        ) : null}
                        <Pressable
                            onPress={handleGetDirections}
                            style={[styles.directionsBtn, { borderColor: colors.border }]}
                            accessibilityRole="button"
                        >
                            <ThemedText style={styles.directionsIcon}>🗺</ThemedText>
                            <ThemedText style={[styles.directionsBtnText, { color: colors.primary }]}>Get Directions</ThemedText>
                        </Pressable>
                    </View>
                </View>

                {/* Date / Time / Status */}
                <View style={[styles.section, { borderColor: colors.border, backgroundColor: colors.card }]}>
                    <ThemedText style={[styles.dateLabel, { color: colors.text }]}>{dateLabel}</ThemedText>
                    <ThemedText style={styles.timeLabel}>{timeLabel}</ThemedText>
                    <ThemedText style={[styles.duration, { color: colors.text }]}>
                        {item.durationMinutes} min · {item.serviceType}
                    </ThemedText>
                    <AppointmentStatusBadge status={item.status} />
                    {item.cachedAt ? (
                        <ThemedText style={[styles.cachedText, { color: colors.text }]}>
                            🕐 Last synced {format(parseISO(item.cachedAt), 'MMM d, h:mm a')}
                        </ThemedText>
                    ) : null}
                </View>

                {/* Provider */}
                <ProviderBlock provider={item.provider} onViewProfile={handleViewProfile} />

                {/* Payment / Invoice */}
                {item.invoiceAmount !== null && item.invoiceAmount !== undefined ? (
                    <View
                        style={[
                            styles.section,
                            {
                                borderColor: effectivePaid
                                    ? 'rgba(16,185,129,0.35)'
                                    : 'rgba(245,158,11,0.35)',
                                backgroundColor: effectivePaid
                                    ? 'rgba(16,185,129,0.06)'
                                    : 'rgba(245,158,11,0.06)',
                            },
                        ]}
                    >
                        <ThemedText style={styles.sectionTitle}>Payment</ThemedText>
                        <View style={styles.invoiceRow}>
                            <ThemedText style={[styles.invoiceServiceLabel, { color: colors.text }]}>
                                {item.serviceType}
                            </ThemedText>
                            <ThemedText style={styles.invoiceAmount}>
                                {item.invoiceAmount === 0
                                    ? 'Free'
                                    : `${item.currency ?? 'PHP'} ${item.invoiceAmount.toFixed(2)}`}
                            </ThemedText>
                        </View>
                        <View style={styles.paymentStatusRow}>
                            <View
                                style={[
                                    styles.paymentBadge,
                                    {
                                        backgroundColor:
                                            effectivePaid ? '#10B981' :
                                                item.paymentStatus === 'waived' ? '#6366F1' : '#F59E0B',
                                    },
                                ]}
                            >
                                <ThemedText style={styles.paymentBadgeText}>
                                    {effectivePaid ? 'Paid' :
                                        item.paymentStatus === 'waived' ? 'Waived' : 'Payment Required'}
                                </ThemedText>
                            </View>
                            {!effectivePaid && item.paymentStatus !== 'waived' && item.paymentDueAt ? (
                                <ThemedText style={[styles.paymentDueLabel, { color: colors.text }]}>
                                    Due: {format(parseISO(item.paymentDueAt), 'MMM d, h:mm a')}
                                </ThemedText>
                            ) : null}
                        </View>
                        {!effectivePaid && item.paymentStatus !== 'waived' && item.paymentDueAt ? (
                            <PaymentCountdown dueAt={item.paymentDueAt} />
                        ) : null}
                        {!effectivePaid && item.paymentStatus !== 'waived' ? (
                            <Pressable
                                style={[styles.payNowBtn, { backgroundColor: '#10B981' }]}
                                onPress={handlePayNow}
                                accessibilityRole="button"
                            >
                                <ThemedText style={styles.payNowBtnText}>
                                    {item.invoiceAmount === 0
                                        ? 'Confirm Free Appointment'
                                        : `Pay ${item.currency ?? 'PHP'} ${item.invoiceAmount.toFixed(2)} Now`}
                                </ThemedText>
                            </Pressable>
                        ) : null}
                    </View>
                ) : null}

                {/* Notes */}
                {item.notes ? (
                    <View style={[styles.section, { borderColor: colors.border, backgroundColor: colors.card }]}>
                        <ThemedText style={styles.sectionTitle}>Visit Notes</ThemedText>
                        <ThemedText style={[styles.notesText, { color: colors.text }]}>{item.notes}</ThemedText>
                    </View>
                ) : null}

                {/* Documents */}
                <View style={[styles.section, { borderColor: colors.border, backgroundColor: colors.card }]}>
                    <ThemedText style={styles.sectionTitle}>Documents & Files</ThemedText>

                    <ThemedText style={[styles.docSubheader, { color: colors.text }]}>Shared by You</ThemedText>
                    {patientDocs.length > 0
                        ? patientDocs.map(d => <DocumentRow key={d.id} doc={d} />)
                        : <ThemedText style={[styles.docEmpty, { color: colors.text }]}>No files attached yet.</ThemedText>}

                    <ThemedText style={[styles.docSubheader, { color: colors.text }]}>From Clinic</ThemedText>
                    {clinicDocs.length > 0
                        ? clinicDocs.map(d => <DocumentRow key={d.id} doc={d} />)
                        : <ThemedText style={[styles.docEmpty, { color: colors.text }]}>The clinic hasn't shared any files.</ThemedText>}

                    <Pressable
                        onPress={() => navigation.navigate('Main', { screen: 'AttachFilesScreen' })}
                        style={[styles.attachBtn, { borderColor: colors.primary }]}
                        accessibilityRole="button"
                    >
                        <ThemedText style={[styles.attachBtnText, { color: colors.primary }]}>+ Attach a File</ThemedText>
                    </Pressable>
                </View>
            </ScrollView>

            {/* Sticky action bar */}
            {!isFinalStatus && (
                <View
                    style={[
                        styles.actionBar,
                        { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: insets.bottom + 12 },
                    ]}
                >
                    <Pressable
                        onPress={handleReschedule}
                        style={[styles.rescheduleBtn, { borderColor: colors.primary }]}
                        accessibilityRole="button"
                    >
                        <ThemedText style={[styles.rescheduleBtnText, { color: colors.primary }]}>Reschedule</ThemedText>
                    </Pressable>
                    <Pressable onPress={handleCancel} style={styles.cancelBtn} accessibilityRole="button">
                        <ThemedText style={styles.cancelBtnText}>Cancel Appointment</ThemedText>
                    </Pressable>
                </View>
            )}
        </ThemedView>
    );
}

const styles = StyleSheet.create({
    screen: { flex: 1 },
    scrollContent: { gap: 12 },
    heroWrapper: {},
    heroInfo: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4, gap: 4 },
    heroClinicName: { fontSize: 20, fontWeight: '800' },
    heroAddress: { fontSize: 14, opacity: 0.7, lineHeight: 20 },
    heroPhone: { fontSize: 13, opacity: 0.6 },
    directionsBtn: {
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 999,
        borderWidth: 1,
        marginTop: 6,
    },
    directionsIcon: { fontSize: 14 },
    directionsBtnText: { fontSize: 13, fontWeight: '700' },
    section: {
        marginHorizontal: 16,
        borderRadius: 18,
        borderWidth: StyleSheet.hairlineWidth,
        padding: 16,
        gap: 8,
    },
    sectionTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6, opacity: 0.55, textTransform: 'uppercase' },
    dateLabel: { fontSize: 14, fontWeight: '500', opacity: 0.75 },
    timeLabel: { fontSize: 32, fontWeight: '800', letterSpacing: -0.5 },
    duration: { fontSize: 13, opacity: 0.7 },
    cachedText: { fontSize: 11, opacity: 0.5 },
    countdownText: { fontSize: 13, fontWeight: '700', color: '#D97706' },
    countdownOverdue: { color: '#EF4444' },
    providerRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
    providerAvatar: { width: 56, height: 56, borderRadius: 28 },
    providerAvatarFallback: { backgroundColor: '#94A3B8', alignItems: 'center', justifyContent: 'center' },
    providerAvatarInitials: { color: '#fff', fontSize: 18, fontWeight: '800' },
    providerInfo: { flex: 1, gap: 2 },
    providerName: { fontSize: 16, fontWeight: '700' },
    providerSpecialty: { fontSize: 13, opacity: 0.7 },
    credRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
    credChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, borderWidth: 1 },
    credText: { fontSize: 11, fontWeight: '700' },
    viewProfileBtn: { alignSelf: 'flex-start', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, borderWidth: 1.5 },
    viewProfileText: { fontSize: 12, fontWeight: '800', letterSpacing: 0.8 },
    notesText: { fontSize: 14, lineHeight: 22, opacity: 0.8 },
    docSubheader: { fontSize: 12, fontWeight: '700', opacity: 0.6, marginTop: 4 },
    docRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        borderBottomWidth: StyleSheet.hairlineWidth,
        paddingVertical: 10,
    },
    docIconBox: { width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(99,102,241,0.12)' },
    docIcon: { fontSize: 18 },
    docInfo: { flex: 1, gap: 2 },
    docName: { fontSize: 13, fontWeight: '600' },
    docMeta: { fontSize: 11, opacity: 0.6 },
    docEmpty: { fontSize: 13, opacity: 0.5, fontStyle: 'italic', paddingVertical: 4 },
    attachBtn: {
        alignSelf: 'flex-start',
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 999,
        borderWidth: 1.5,
        borderStyle: 'dashed',
        marginTop: 4,
    },
    attachBtnText: { fontSize: 13, fontWeight: '600' },
    // Invoice / payment
    invoiceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    invoiceServiceLabel: { fontSize: 14, opacity: 0.8, flex: 1 },
    invoiceAmount: { fontSize: 20, fontWeight: '800' },
    paymentStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
    paymentBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
    paymentBadgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
    paymentDueLabel: { fontSize: 12, opacity: 0.7 },
    payNowBtn: { borderRadius: 999, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
    payNowBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
    // Action bar
    actionBar: {
        paddingHorizontal: 16,
        paddingTop: 12,
        borderTopWidth: StyleSheet.hairlineWidth,
        flexDirection: 'row',
        gap: 10,
    },
    rescheduleBtn: { flex: 1, paddingVertical: 13, borderRadius: 999, borderWidth: 1.5, alignItems: 'center' },
    rescheduleBtnText: { fontSize: 15, fontWeight: '700' },
    cancelBtn: {
        flex: 1,
        paddingVertical: 13,
        borderRadius: 999,
        alignItems: 'center',
        backgroundColor: 'rgba(239,68,68,0.1)',
        borderWidth: 1,
        borderColor: 'rgba(239,68,68,0.35)',
    },
    cancelBtnText: { fontSize: 15, fontWeight: '700', color: '#EF4444' },
});


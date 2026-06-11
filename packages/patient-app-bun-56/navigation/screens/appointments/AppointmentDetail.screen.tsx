import { useEffect, useState } from 'react';
import { Alert, Image, Linking, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useNavigation, useTheme } from '@react-navigation/native';
import type { StaticScreenProps } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { format, parseISO } from 'date-fns';
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

function DocumentRow({ doc }: { doc: AttachedDocument }) {
    const { colors } = useTheme();
    const uploadedLabel = (() => {
        try { return format(parseISO(doc.uploadedAt), 'MMM d, yyyy'); } catch { return ''; }
    })();
    return (
        <View style={[styles.docRow, { borderColor: colors.border }]}>
            <View style={[styles.docIconBox, { backgroundColor: colors.primary + '18' }]}>
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
                                    style={[
                                        styles.credChip,
                                        { borderColor: colors.border, backgroundColor: colors.primary + '12' },
                                    ]}
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

    const handleGetDirections = () => {
        if (!item) return;
        const address = encodeURIComponent(item.clinic.address);
        const url = Platform.OS === 'ios'
            ? `maps:?q=${address}`
            : `geo:0,0?q=${address}`;
        Linking.openURL(url).catch(() =>
            Linking.openURL(`https://maps.google.com/?q=${address}`)
        );
    };

    const handleViewProfile = () => {
        if (!item) return;
        navigation.navigate('Main', {
            screen: 'ProviderProfileScreen',
            params: { providerData: item.provider },
        });
    };

    const handleReschedule = () => {
        if (!item) return;
        navigation.navigate('Main', {
            screen: 'BookingDraftScreen',
            params: { clinicId: item.clinic.id },
        });
    };

    const handleCancel = () => {
        Alert.alert('Cancel Appointment', 'Are you sure you want to cancel this appointment?', [
            { text: 'Keep', style: 'cancel' },
            {
                text: 'Cancel Appointment',
                style: 'destructive',
                onPress: () => Alert.alert('Coming soon', 'Cancellation requires the backend API.'),
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
    const isFinalStatus =
        item.status === 'canceled' || item.status === 'completed' || item.status === 'no_show';

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
                        <ThemedText style={[styles.heroAddress, { color: colors.text }]}>
                            {item.clinic.address}
                        </ThemedText>
                        {item.clinic.phoneNumber ? (
                            <ThemedText style={[styles.heroPhone, { color: colors.text }]}>
                                {item.clinic.phoneNumber}
                            </ThemedText>
                        ) : null}
                        <Pressable
                            onPress={handleGetDirections}
                            style={[
                                styles.directionsBtn,
                                {
                                    backgroundColor: colors.primary + '18',
                                    borderColor: colors.primary + '40',
                                },
                            ]}
                            accessibilityRole="button"
                        >
                            <ThemedText style={styles.directionsBtnIcon}>🗺</ThemedText>
                            <ThemedText style={[styles.directionsBtnText, { color: colors.primary }]}>
                                Get Directions
                            </ThemedText>
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
                        <View style={styles.cachedRow}>
                            <ThemedText style={[styles.cachedText, { color: colors.text }]}>
                                🕐 Last synced {format(parseISO(item.cachedAt), 'MMM d, h:mm a')}
                            </ThemedText>
                        </View>
                    ) : null}
                </View>

                {/* Provider */}
                <ProviderBlock provider={item.provider} onViewProfile={handleViewProfile} />

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
                        onPress={() =>
                            navigation.navigate('Main', {
                                screen: 'BottomTabs',
                                params: { screen: 'FilesScreen' },
                            })
                        }
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
                        {
                            backgroundColor: colors.card,
                            borderTopColor: colors.border,
                            paddingBottom: insets.bottom + 12,
                        },
                    ]}
                >
                    <Pressable
                        onPress={handleReschedule}
                        style={[styles.rescheduleBtn, { borderColor: colors.primary }]}
                        accessibilityRole="button"
                    >
                        <ThemedText style={[styles.rescheduleBtnText, { color: colors.primary }]}>
                            Reschedule
                        </ThemedText>
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
    directionsBtnIcon: { fontSize: 14 },
    directionsBtnText: { fontSize: 13, fontWeight: '700' },
    section: {
        marginHorizontal: 16,
        borderRadius: 18,
        borderWidth: StyleSheet.hairlineWidth,
        padding: 16,
        gap: 8,
    },
    sectionTitle: {
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 0.6,
        opacity: 0.55,
        textTransform: 'uppercase',
    },
    dateLabel: { fontSize: 14, fontWeight: '500', opacity: 0.75 },
    timeLabel: { fontSize: 32, fontWeight: '800', letterSpacing: -0.5 },
    duration: { fontSize: 13, opacity: 0.7 },
    cachedRow: {},
    cachedText: { fontSize: 11, opacity: 0.5 },
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
    viewProfileBtn: {
        alignSelf: 'flex-start',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 999,
        borderWidth: 1.5,
    },
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
    docIconBox: { width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
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
    actionBar: {
        paddingHorizontal: 16,
        paddingTop: 12,
        borderTopWidth: StyleSheet.hairlineWidth,
        flexDirection: 'row',
        gap: 10,
    },
    rescheduleBtn: {
        flex: 1,
        paddingVertical: 13,
        borderRadius: 999,
        borderWidth: 1.5,
        alignItems: 'center',
    },
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

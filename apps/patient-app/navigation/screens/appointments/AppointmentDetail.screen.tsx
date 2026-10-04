import { useEffect, useRef, useState, useCallback } from 'react';
import { Alert, Image, Linking, Platform, Pressable, ScrollView, StyleSheet, View, RefreshControl } from 'react-native';
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
import type { AppointmentItem, AttachedDocument, AffiliatedClinic, ProviderSnapshot } from '../../../services/appointments/types';

type Props = StaticScreenProps<{ appointmentId: string }>;

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
    const { colors } = useTheme();
    if (!value) return null;
    return (
        <View style={infoRowStyles.row}>
            <ThemedText style={[infoRowStyles.label, { color: colors.text }]}>{label}</ThemedText>
            <ThemedText style={infoRowStyles.value}>{value}</ThemedText>
        </View>
    );
}

const infoRowStyles = StyleSheet.create({
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, paddingVertical: 7 },
    label: { fontSize: 13, opacity: 0.55, fontWeight: '500', flex: 0.42 },
    value: { fontSize: 13, fontWeight: '600', flex: 0.58, textAlign: 'right' },
});

// ── Sub-components ────────────────────────────────────────────────────────────

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

function StarRating({ rating }: { rating: number }) {
    const { colors } = useTheme();
    const filled = Math.round(rating);
    return (
        <View style={styles.starRow}>
            {Array.from({ length: 5 }, (_, i) => (
                <ThemedText key={i} style={[styles.star, { color: i < filled ? '#F59E0B' : colors.border }]}>★</ThemedText>
            ))}
            <ThemedText style={[styles.ratingLabel, { color: colors.text }]}>{rating.toFixed(1)}</ThemedText>
        </View>
    );
}

function AffiliatedClinicChip({ clinic }: { clinic: AffiliatedClinic }) {
    const { colors } = useTheme();
    return (
        <View style={[styles.affiliatedChip, { borderColor: colors.border }]}>
            <ThemedText style={[styles.affiliatedChipText, { color: colors.text }]} numberOfLines={1}>{clinic.name}</ThemedText>
        </View>
    );
}

function ProviderSection({
    provider,
    onViewProfile,
}: {
    provider: ProviderSnapshot;
    onViewProfile: () => void;
}) {
    const { colors } = useTheme();
    const isPending = provider.id === 'local-pending';
    const initials = provider.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
    return (
        <View style={[styles.section, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <ThemedText style={styles.sectionTitle}>Healthcare Provider</ThemedText>
            <View style={styles.providerRow}>
                {provider.avatarUrl ? (
                    <Image source={{ uri: provider.avatarUrl }} style={styles.providerAvatar} accessibilityRole="image" accessibilityLabel={provider.name} />
                ) : (
                    <View style={[styles.providerAvatar, styles.providerAvatarFallback]}>
                        <ThemedText style={styles.providerAvatarInitials}>{isPending ? '?' : initials}</ThemedText>
                    </View>
                )}
                <View style={styles.providerInfo}>
                    <ThemedText style={styles.providerName}>{provider.name}</ThemedText>
                    {provider.specialty ? (
                        <ThemedText style={[styles.providerSpecialty, { color: colors.text }]}>{provider.specialty}</ThemedText>
                    ) : null}
                    {!isPending && provider.credentials.length > 0 ? (
                        <View style={styles.credRow}>
                            {provider.credentials.map(c => (
                                <View key={c} style={[styles.credChip, { borderColor: colors.border }]}>
                                    <ThemedText style={[styles.credText, { color: colors.primary }]}>{c}</ThemedText>
                                </View>
                            ))}
                        </View>
                    ) : null}
                </View>
            </View>
            <Pressable onPress={onViewProfile} style={[styles.viewProfileBtn, { borderColor: colors.primary }]} accessibilityRole="button">
                <ThemedText style={[styles.viewProfileText, { color: colors.primary }]}>
                    {isPending ? 'ABOUT ASSIGNMENT' : 'VIEW FULL PROFILE'}
                </ThemedText>
            </Pressable>
        </View>
    );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function AppointmentDetailScreen({ route }: Props) {
    const { colors } = useTheme();
    const navigation = useNavigation();
    const insets = useSafeAreaInsets();
    const { appointmentId } = route.params;

    const [item, setItem] = useState<AppointmentItem | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isPaidLocally, setIsPaidLocally] = useState(false);

    const loadAppointment = useCallback(async () => {
        try {
            const detail = await getAppointmentDetail(appointmentId, db);
            setItem(detail);
        } catch (e) {
            Alert.alert('Error', 'Unable to load appointment details.', [
                { text: 'OK', onPress: () => navigation.goBack() },
            ]);
        }
    }, [appointmentId, navigation]);

    useEffect(() => {
        let mounted = true;
        loadAppointment().finally(() => { if (mounted) setIsLoading(false); });
        return () => { mounted = false; };
    }, [loadAppointment]);

    const onRefresh = useCallback(async () => {
        setIsRefreshing(true);
        await loadAppointment();
        setIsRefreshing(false);
    }, [loadAppointment]);

    const effectivePaid = isPaidLocally || item?.paymentStatus === 'paid';

    const handlePayNow = () => {
        if (!item) return;
        const amount = item.invoiceAmount ?? 0;
        if (amount === 0) {
            setIsPaidLocally(true);
            Alert.alert('Payment Confirmed', 'This appointment is free of charge. You\'re all set!');
        } else {
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
                refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
            >
                {/* ── Clinic Hero ─────────────────────────────────────────── */}
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

                {/* ── Appointment Summary ─────────────────────────────────── */}
                <View style={[styles.section, { borderColor: colors.border, backgroundColor: colors.card }]}>
                    <ThemedText style={styles.sectionTitle}>Appointment</ThemedText>
                    <ThemedText style={[styles.dateLabel, { color: colors.text }]}>{dateLabel}</ThemedText>
                    <ThemedText style={styles.timeLabel}>{timeLabel}</ThemedText>
                    <View style={[styles.divider, { borderBottomColor: colors.border }]} />
                    <InfoRow label="Service" value={item.serviceType} />
                    <InfoRow label="Duration" value={`${item.durationMinutes} minutes`} />
                    <InfoRow label="Appointment ID" value={item.id} />
                    <View style={styles.statusRow}>
                        <ThemedText style={[infoRowStyles.label, { color: colors.text }]}>Status</ThemedText>
                        <AppointmentStatusBadge status={item.status} size="sm" />
                    </View>
                    {item.cachedAt ? (
                        <ThemedText style={[styles.cachedText, { color: colors.text }]}>
                            🕐 Last synced {format(parseISO(item.cachedAt), 'MMM d, yyyy h:mm a')}
                        </ThemedText>
                    ) : null}
                </View>

                {/* ── Visit Details (patient-entered) ─────────────────────── */}
                {(item.subject || item.chiefComplaint || item.notes) ? (
                    <View style={[styles.section, { borderColor: colors.border, backgroundColor: colors.card }]}>
                        <ThemedText style={styles.sectionTitle}>Visit Details</ThemedText>
                        {item.subject ? (
                            <>
                                <ThemedText style={styles.fieldHint}>Subject</ThemedText>
                                <ThemedText style={[styles.detailText, { color: colors.text }]}>{item.subject}</ThemedText>
                            </>
                        ) : null}
                        {item.chiefComplaint ? (
                            <>
                                <ThemedText style={styles.fieldHint}>Chief Complaint</ThemedText>
                                <View style={[styles.complaintBox, { borderColor: colors.border, backgroundColor: 'rgba(148,163,184,0.07)' }]}>
                                    <ThemedText style={[styles.complaintText, { color: colors.text }]}>{item.chiefComplaint}</ThemedText>
                                </View>
                            </>
                        ) : null}
                        {item.notes ? (
                            <>
                                <ThemedText style={styles.fieldHint}>Additional Notes</ThemedText>
                                <ThemedText style={[styles.detailText, { color: colors.text }]}>{item.notes}</ThemedText>
                            </>
                        ) : null}
                    </View>
                ) : null}

                {/* ── Clinical Visit Summary & Care Plan (Sealed by Doctor) ─ */}
                {(item.status === 'completed' || item.clinicalAssessment || item.doctorPlan || item.prescriptionsSummary) ? (
                    <View style={[styles.section, { borderColor: '#10B981', backgroundColor: colors.card }]}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                            <ThemedText style={[styles.sectionTitle, { color: '#059669', opacity: 1 }]}>
                                Clinical Visit Summary
                            </ThemedText>
                            <View style={{ backgroundColor: 'rgba(16, 185, 129, 0.12)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 }}>
                                <ThemedText style={{ fontSize: 10, fontWeight: '700', color: '#059669' }}>
                                    ✓ Sealed Record
                                </ThemedText>
                            </View>
                        </View>

                        {item.clinicalAssessment ? (
                            <>
                                <ThemedText style={styles.fieldHint}>Doctor Assessment & Diagnoses</ThemedText>
                                <View style={[styles.complaintBox, { borderColor: colors.border, backgroundColor: 'rgba(16, 185, 129, 0.05)', marginBottom: 8 }]}>
                                    <ThemedText style={[styles.complaintText, { color: colors.text, fontWeight: '600' }]}>
                                        {item.clinicalAssessment}
                                    </ThemedText>
                                </View>
                            </>
                        ) : null}

                        {item.doctorPlan ? (
                            <>
                                <ThemedText style={styles.fieldHint}>Physician Care Plan & Instructions</ThemedText>
                                <View style={[styles.complaintBox, { borderColor: colors.border, backgroundColor: 'rgba(148, 163, 184, 0.08)', marginBottom: 8 }]}>
                                    <ThemedText style={[styles.complaintText, { color: colors.text }]}>
                                        {item.doctorPlan}
                                    </ThemedText>
                                </View>
                            </>
                        ) : null}

                        {item.prescriptionsSummary ? (
                            <>
                                <ThemedText style={styles.fieldHint}>Prescriptions Issued (Rx)</ThemedText>
                                <View style={[styles.complaintBox, { borderColor: colors.border, backgroundColor: 'rgba(99, 102, 241, 0.06)', marginBottom: 8 }]}>
                                    <ThemedText style={[styles.complaintText, { color: colors.text, fontSize: 13 }]}>
                                        💊 {item.prescriptionsSummary}
                                    </ThemedText>
                                </View>
                            </>
                        ) : null}

                        {item.prescriptionPublicVerificationUrl ? (
                            <Pressable
                                onPress={() => {
                                    if (item.prescriptionPublicVerificationUrl) {
                                        Linking.openURL(item.prescriptionPublicVerificationUrl).catch(() => {});
                                    }
                                }}
                                style={{
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: 6,
                                    paddingVertical: 10,
                                    borderRadius: 12,
                                    backgroundColor: 'rgba(99, 102, 241, 0.1)',
                                    borderWidth: 1,
                                    borderColor: 'rgba(99, 102, 241, 0.3)',
                                    marginTop: 4,
                                }}
                            >
                                <ThemedText style={{ fontSize: 14 }}>🔗</ThemedText>
                                <ThemedText style={{ fontSize: 13, fontWeight: '700', color: colors.primary }}>
                                    Verify Electronic Prescription (Rx)
                                </ThemedText>
                            </Pressable>
                        ) : null}
                    </View>
                ) : null}

                {/* ── Healthcare Provider ─────────────────────────────────── */}
                <ProviderSection provider={item.provider} onViewProfile={handleViewProfile} />

                {/* ── Payment / Invoice ───────────────────────────────────── */}
                {item.invoiceAmount !== null && item.invoiceAmount !== undefined ? (
                    <View
                        style={[
                            styles.section,
                            {
                                borderColor: effectivePaid ? 'rgba(16,185,129,0.35)' : 'rgba(245,158,11,0.35)',
                                backgroundColor: effectivePaid ? 'rgba(16,185,129,0.06)' : 'rgba(245,158,11,0.06)',
                            },
                        ]}
                    >
                        <ThemedText style={styles.sectionTitle}>Payment</ThemedText>
                        <View style={styles.invoiceRow}>
                            <ThemedText style={[styles.invoiceServiceLabel, { color: colors.text }]}>{item.serviceType}</ThemedText>
                            <ThemedText style={styles.invoiceAmount}>
                                {item.invoiceAmount === 0 ? 'Free' : `${item.currency ?? 'PHP'} ${item.invoiceAmount.toFixed(2)}`}
                            </ThemedText>
                        </View>
                        <View style={styles.paymentStatusRow}>
                            <View style={[styles.paymentBadge, { backgroundColor: effectivePaid ? '#10B981' : item.paymentStatus === 'waived' ? '#6366F1' : '#F59E0B' }]}>
                                <ThemedText style={styles.paymentBadgeText}>
                                    {effectivePaid ? 'Paid' : item.paymentStatus === 'waived' ? 'Waived' : 'Payment Required'}
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
                            <Pressable style={[styles.payNowBtn, { backgroundColor: '#10B981' }]} onPress={handlePayNow} accessibilityRole="button">
                                <ThemedText style={styles.payNowBtnText}>
                                    {item.invoiceAmount === 0 ? 'Confirm Free Appointment' : `Pay ${item.currency ?? 'PHP'} ${item.invoiceAmount.toFixed(2)} Now`}
                                </ThemedText>
                            </Pressable>
                        ) : null}
                    </View>
                ) : null}

                {/* ── Documents & Files ───────────────────────────────────── */}
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

            {/* ── Sticky action bar ──────────────────────────────────────── */}
            {!isFinalStatus && (
                <View style={[styles.actionBar, { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: insets.bottom + 12 }]}>
                    <Pressable onPress={handleReschedule} style={[styles.rescheduleBtn, { borderColor: colors.primary }]} accessibilityRole="button">
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
        gap: 6,
    },
    sectionTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6, opacity: 0.55, textTransform: 'uppercase', marginBottom: 4 },
    divider: { borderBottomWidth: StyleSheet.hairlineWidth, marginVertical: 4 },
    dateLabel: { fontSize: 14, fontWeight: '500', opacity: 0.75 },
    timeLabel: { fontSize: 32, fontWeight: '800', letterSpacing: -0.5 },
    statusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
    cachedText: { fontSize: 11, opacity: 0.5, marginTop: 4 },
    countdownText: { fontSize: 13, fontWeight: '700', color: '#D97706' },
    countdownOverdue: { color: '#EF4444' },
    // Visit details
    fieldHint: { fontSize: 11, fontWeight: '700', opacity: 0.5, textTransform: 'uppercase', letterSpacing: 0.4 },
    detailText: { fontSize: 14, lineHeight: 20 },
    complaintBox: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: 12 },
    complaintText: { fontSize: 14, lineHeight: 22 },
    // Provider section
    providerRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
    providerAvatar: { width: 56, height: 56, borderRadius: 28 },
    providerAvatarFallback: { backgroundColor: '#94A3B8', alignItems: 'center', justifyContent: 'center' },
    providerAvatarInitials: { color: '#fff', fontSize: 18, fontWeight: '800' },
    providerInfo: { flex: 1, gap: 3 },
    providerName: { fontSize: 16, fontWeight: '700' },
    providerSpecialty: { fontSize: 13, opacity: 0.7 },
    credRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
    credChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, borderWidth: 1 },
    credText: { fontSize: 11, fontWeight: '700' },
    starRow: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 2 },
    star: { fontSize: 14 },
    ratingLabel: { fontSize: 12, fontWeight: '600', opacity: 0.7, marginLeft: 4 },
    bioBox: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: 12, marginTop: 4 },
    bioText: { fontSize: 13, lineHeight: 20, opacity: 0.8 },
    affiliatedRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 4 },
    affiliatedChip: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
    affiliatedChipText: { fontSize: 11, fontWeight: '600', opacity: 0.75 },
    viewProfileBtn: { alignSelf: 'flex-start', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, borderWidth: 1.5, marginTop: 4 },
    viewProfileText: { fontSize: 12, fontWeight: '800', letterSpacing: 0.8 },
    // Documents
    docSubheader: { fontSize: 12, fontWeight: '700', opacity: 0.6, marginTop: 4 },
    docRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 10 },
    docIconBox: { width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(99,102,241,0.12)' },
    docIcon: { fontSize: 18 },
    docInfo: { flex: 1, gap: 2 },
    docName: { fontSize: 13, fontWeight: '600' },
    docMeta: { fontSize: 11, opacity: 0.6 },
    docEmpty: { fontSize: 13, opacity: 0.5, fontStyle: 'italic', paddingVertical: 4 },
    attachBtn: { alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1.5, borderStyle: 'dashed', marginTop: 4 },
    attachBtnText: { fontSize: 13, fontWeight: '600' },
    // Invoice
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
    actionBar: { paddingHorizontal: 16, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 10 },
    rescheduleBtn: { flex: 1, paddingVertical: 13, borderRadius: 999, borderWidth: 1.5, alignItems: 'center' },
    rescheduleBtnText: { fontSize: 15, fontWeight: '700' },
    cancelBtn: { flex: 1, paddingVertical: 13, borderRadius: 999, alignItems: 'center', backgroundColor: 'rgba(239,68,68,0.1)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.35)' },
    cancelBtnText: { fontSize: 15, fontWeight: '700', color: '#EF4444' },
});

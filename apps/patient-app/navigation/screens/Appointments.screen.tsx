import { useCallback, useRef, useState } from 'react';
import { FlatList, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useFocusEffect, useNavigation, useTheme } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useNetInfo } from '@react-native-community/netinfo';
import { format, isToday, isFuture, isPast, parseISO } from 'date-fns';
import { MaterialSymbol, SFSymbol } from '@react-navigation/native';
import { and, eq, desc } from 'drizzle-orm';
import ThemedText from '@ui/ThemedText';
import ThemedView from '@ui/ThemedView';
import EmptyState from '@ui/EmptyState';
import { SkeletonCard } from '@ui/Skeleton';
import AppointmentCard from 'components/appointments/AppointmentCard';
import SegmentedControl from 'components/appointments/SegmentedControl';
import OfflineBanner from 'components/appointments/OfflineBanner';
import { usePatientId } from 'hooks/usePatientId';
import { db } from '@db/index';
import { bookingDrafts } from '@db/schema/bookingDrafts';
import { clinics as clinicsTable } from '@db/schema/clinics';
import { fetchAppointments, getCachedAppointmentsWithLocalBookings } from '../../services/appointments/appointmentsService';
import type { AppointmentItem } from '../../services/appointments/types';

type Segment = 0 | 1;

interface DraftSummary {
    id: string;
    clinicId: string;
    clinicName: string | null;
    reason: string | null;
    preferredDate: string | null;
    updatedAt: Date;
}

function DraftCard({
    draft,
    onContinue,
    onDiscard,
}: {
    draft: DraftSummary;
    onContinue: () => void;
    onDiscard: () => void;
}) {
    const { colors } = useTheme();
    const dateLabel = (() => {
        try { return format(draft.updatedAt, 'MMM d'); } catch { return ''; }
    })();
    return (
        <Pressable
            onPress={onContinue}
            accessibilityRole="button"
            style={({ pressed }) => [
                styles.draftCard,
                { borderColor: '#F59E0B50', backgroundColor: '#F59E0B08', opacity: pressed ? 0.84 : 1 },
            ]}
        >
            <View style={styles.draftHeader}>
                <ThemedText style={styles.draftClinic} numberOfLines={1}>
                    {draft.clinicName ?? 'Unknown Clinic'}
                </ThemedText>
                <ThemedText style={[styles.draftDate, { color: colors.text }]}>{dateLabel}</ThemedText>
            </View>
            {draft.reason ? (
                <ThemedText style={[styles.draftReason, { color: colors.text }]} numberOfLines={2}>
                    {/* Strip service metadata prefix if present */}
                    {draft.reason.replace(/^\[\[service:[^\]]+\]\]\n?/, '')}
                </ThemedText>
            ) : null}
            <View style={styles.draftActions}>
                <Pressable
                    onPress={onContinue}
                    style={[styles.draftContinueBtn, { backgroundColor: '#F59E0B' }]}
                    accessibilityRole="button"
                >
                    <ThemedText style={styles.draftContinueBtnText}>Continue Booking</ThemedText>
                </Pressable>
                <Pressable
                    onPress={onDiscard}
                    style={styles.draftDiscardBtn}
                    accessibilityRole="button"
                >
                    <ThemedText style={[styles.draftDiscardBtnText, { color: colors.text }]}>Discard</ThemedText>
                </Pressable>
            </View>
        </Pressable>
    );
}

function isUpcoming(item: AppointmentItem): boolean {
    try {
        const d = parseISO(item.scheduledAt);
        const active = item.status !== 'canceled' && item.status !== 'completed' && item.status !== 'no_show';
        return active && (isToday(d) || isFuture(d));
    } catch { return false; }
}

function isActiveTodayItem(item: AppointmentItem): boolean {
    try {
        const d = parseISO(item.scheduledAt);
        return isToday(d) && (item.status === 'confirmed' || item.status === 'action_required');
    } catch { return false; }
}

function isPastItem(item: AppointmentItem): boolean {
    try {
        const d = parseISO(item.scheduledAt);
        const terminal = item.status === 'canceled' || item.status === 'completed' || item.status === 'no_show';
        return terminal || (!isToday(d) && isPast(d));
    } catch { return false; }
}

import { useAuth as useClerkAuth } from '@clerk/expo';
import { dialog } from '@utils/dialog';

export default function AppointmentsScreen() {
    const { colors } = useTheme();
    const navigation = useNavigation();
    const patientId = usePatientId();
    const { getToken } = useClerkAuth();
    const insets = useSafeAreaInsets();
    const tabBarHeight = (useBottomTabBarHeight?.() || 96) + insets.bottom;

    const netInfo = useNetInfo();
    const [appointments, setAppointments] = useState<AppointmentItem[]>([]);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isFromCache, setIsFromCache] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [segment, setSegment] = useState<Segment>(0);
    const [drafts, setDrafts] = useState<DraftSummary[]>([]);
    const dbRef = useRef(db);
    
    // Store getToken in a ref to avoid infinite loops in useFocusEffect
    const getTokenRef = useRef(getToken);
    getTokenRef.current = getToken;

    const loadDrafts = useCallback(async () => {
        try {
            const rows = await dbRef.current
                .select({
                    id: bookingDrafts.id,
                    clinicId: bookingDrafts.clinicId,
                    clinicName: clinicsTable.name,
                    reason: bookingDrafts.reason,
                    preferredDate: bookingDrafts.preferredDate,
                    updatedAt: bookingDrafts.updatedAt,
                })
                .from(bookingDrafts)
                .leftJoin(clinicsTable, eq(bookingDrafts.clinicId, clinicsTable.id))
                .where(and(
                    eq(bookingDrafts.patientId, patientId),
                    eq(bookingDrafts.status, 'draft'),
                ))
                .orderBy(desc(bookingDrafts.updatedAt));
            setDrafts(rows.map(r => {
                const rawReason = r.reason ?? null;
                return {
                    id: r.id,
                    clinicId: r.clinicId,
                    clinicName: r.clinicName ?? null,
                    reason: rawReason,
                    preferredDate: r.preferredDate ?? null,
                    updatedAt: r.updatedAt,
                };
            }));
        } catch (error) {
            console.error('Failed to load drafts:', error);
        }
    }, [patientId]);

    const fetchLiveAppointments = useCallback(async () => {
        if (netInfo.isConnected === false) return; // offline, do not fetch
        
        setIsRefreshing(true);
        try {
            const liveResult = await fetchAppointments(patientId, dbRef.current, getTokenRef.current);
            setAppointments(liveResult.items);
            setIsFromCache(false);
        } catch (error) {
            setIsFromCache(true); // Network failed, so we are definitively using cache
            dialog.alert(
                'Connection Error',
                'Failed to pull the latest appointments from the server. Showing cached data instead.',
                [
                    { text: 'Close', style: 'cancel' },
                    { text: 'Retry', onPress: fetchLiveAppointments }
                ]
            );
        } finally {
            setIsRefreshing(false);
        }
    }, [patientId, netInfo.isConnected]);

    const loadAppointments = useCallback(async () => {
        // 1. Immediately display cached data
        try {
            const cachedResult = await getCachedAppointmentsWithLocalBookings(patientId, dbRef.current);
            setAppointments(cachedResult.items);
            // We intentionally do not set isFromCache to true here yet,
            // to avoid flickering the banner while the background fetch runs.
        } catch { /* ignore cache read error */ }
        finally { setIsLoading(false); } // Cache loaded, hide skeleton

        // 2. Fetch live data in the background
        await fetchLiveAppointments();
    }, [patientId, fetchLiveAppointments]);

    // useFocusEffect will only re-run if loadAppointments or loadDrafts changes references.
    useFocusEffect(useCallback(() => { 
        loadAppointments(); 
        loadDrafts(); 
    }, [loadAppointments, loadDrafts]));

    const upcomingItems = appointments.filter(isUpcoming);
    const pastItems = appointments.filter(isPastItem);
    const activeTodayItem = upcomingItems.find(isActiveTodayItem) ?? null;
    const listItems = segment === 0 ? upcomingItems : pastItems;

    const handleCardPress = (item: AppointmentItem) =>
        navigation.navigate('Main', { screen: 'AppointmentDetailScreen', params: { appointmentId: item.id } });

    const handleReschedule = (item: AppointmentItem) =>
        navigation.navigate('Main', {
            screen: 'RescheduleScreen',
            params: {
                appointmentId: item.id,
                clinicId: item.clinic.id,
                currentScheduledAt: item.scheduledAt,
            },
        });

    const handleCancel = (item: AppointmentItem) =>
        dialog.alert('Cancel Appointment', `Cancel at ${item.clinic.name}?`, [
            { text: 'Keep', style: 'cancel' },
            {
                text: 'Cancel Appointment', style: 'destructive',
                onPress: () => dialog.alert('Coming soon', 'Cancellation requires the backend API.')
            },
        ]);

    const handleBookNew = () =>
        navigation.navigate('Main', { screen: 'BookingDraftScreen' });

    const handleDiscardDraft = (draftId: string) => {
        dialog.alert('Discard Draft', 'Remove this booking draft?', [
            { text: 'Keep', style: 'cancel' },
            {
                text: 'Discard',
                style: 'destructive',
                onPress: async () => {
                    await dbRef.current.delete(bookingDrafts).where(eq(bookingDrafts.id, draftId));
                    loadDrafts();
                },
            },
        ]);
    };

    const renderHeader = () => (
        <View style={styles.listHeader}>
            <OfflineBanner isFromCache={isFromCache} />
            <View style={styles.segmentWrapper}>
                <SegmentedControl options={['Upcoming', 'Past']} selectedIndex={segment} onChange={setSegment} />
            </View>

            {/* Drafts — only in Upcoming tab */}
            {segment === 0 && drafts.length > 0 && (
                <View style={styles.draftSection}>
                    <ThemedText style={[styles.sectionLabel, { color: colors.text }]}>DRAFTS</ThemedText>
                    {drafts.map(draft => (
                        <View key={draft.id} style={styles.cardWrapper}>
                            <DraftCard
                                draft={draft}
                                onContinue={() =>
                                    navigation.navigate('Main', {
                                        screen: 'BookingDraftScreen',
                                        params: { clinicId: draft.clinicId },
                                    })
                                }
                                onDiscard={() => handleDiscardDraft(draft.id)}
                            />
                        </View>
                    ))}
                </View>
            )}
            {segment === 0 && activeTodayItem && (
                <View style={styles.todaySection}>
                    <ThemedText style={[styles.sectionLabel, { color: colors.text }]}>TODAY</ThemedText>
                    <AppointmentCard
                        item={activeTodayItem}
                        onPress={() => handleCardPress(activeTodayItem)}
                        onReschedule={() => handleReschedule(activeTodayItem)}
                        onCancel={() => handleCancel(activeTodayItem)}
                        isToday
                    />
                </View>
            )}
            {listItems.length > 0 && (
                <ThemedText style={[styles.sectionLabel, { color: colors.text }]}>
                    {segment === 0 ? 'UPCOMING' : 'PAST APPOINTMENTS'}
                </ThemedText>
            )}
        </View>
    );

    if (isLoading) {
        return (
            <View style={[styles.screen, { paddingBottom: tabBarHeight }]}>
                <View style={styles.loadingContainer}>
                    <SkeletonCard /><SkeletonCard /><SkeletonCard />
                </View>
            </View>
        );
    }

    return (
        <ThemedView style={styles.screen}>
            <FlatList
                data={listItems}
                keyExtractor={item => item.id}
                contentContainerStyle={[styles.listContent, { paddingBottom: tabBarHeight + 80 }]}
                ListHeaderComponent={renderHeader()}
                showsVerticalScrollIndicator={false}
                onRefresh={loadAppointments}
                refreshing={isRefreshing}
                ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
                ListEmptyComponent={
                    <View style={styles.emptyWrapper}>
                        <EmptyState
                            title={segment === 0 ? 'No upcoming appointments' : 'No past appointments'}
                            message={segment === 0
                                ? "You don't have any scheduled appointments. Book one to get started."
                                : 'Your previous visit history will appear here.'}
                            actionLabel={segment === 0 ? 'Book an Appointment' : undefined}
                            onActionPress={segment === 0 ? handleBookNew : undefined}
                        />
                    </View>
                }
                renderItem={({ item }) => {
                    if (isActiveTodayItem(item)) return null;
                    return (
                        <View style={styles.cardWrapper}>
                            <AppointmentCard
                                item={item}
                                onPress={() => handleCardPress(item)}
                                onReschedule={() => handleReschedule(item)}
                                onCancel={() => handleCancel(item)}
                            />
                        </View>
                    );
                }}
            />

            {/* Floating Action Button */}
            <Pressable
                onPress={handleBookNew}
                style={({ pressed }) => [
                    styles.fab,
                    { backgroundColor: colors.primary, bottom: tabBarHeight + 16, opacity: pressed ? 0.88 : 1 },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Book a new appointment"
            >
                {Platform.select({
                    ios: <SFSymbol name="plus" size={22} color="#fff" />,
                    android: <MaterialSymbol name="add" size={22} color="#fff" />,
                })}
                <ThemedText style={styles.fabLabel}>Book</ThemedText>
            </Pressable>
        </ThemedView>
    );
}

const styles = StyleSheet.create({
    screen: { flex: 1 },
    loadingContainer: { padding: 16, gap: 12 },
    listContent: { paddingBottom: 24 },
    listHeader: { gap: 0 },
    segmentWrapper: { paddingHorizontal: 16, paddingVertical: 12 },
    todaySection: { paddingHorizontal: 16, gap: 8, marginBottom: 16 },
    sectionLabel: {
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 0.8,
        opacity: 0.55,
        paddingHorizontal: 16,
        paddingBottom: 8,
    },
    emptyWrapper: { paddingHorizontal: 16, paddingTop: 8 },
    cardWrapper: { paddingHorizontal: 16 },
    draftSection: { gap: 8, marginBottom: 8 },
    // Draft card
    draftCard: {
        borderRadius: 16,
        borderWidth: 1,
        padding: 14,
        gap: 8,
    },
    draftHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    draftClinic: { fontSize: 14, fontWeight: '700', flex: 1 },
    draftDate: { fontSize: 11, opacity: 0.6, marginLeft: 8 },
    draftReason: { fontSize: 13, lineHeight: 18, opacity: 0.75 },
    draftActions: { flexDirection: 'row', gap: 8, marginTop: 4 },
    draftContinueBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
    draftContinueBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
    draftDiscardBtn: { paddingHorizontal: 14, paddingVertical: 8 },
    draftDiscardBtnText: { fontSize: 13, fontWeight: '600', opacity: 0.6 },
    // FAB
    fab: {
        position: 'absolute',
        right: 20,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 18,
        paddingVertical: 14,
        borderRadius: 999,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 12,
        elevation: 6,
    },
    fabLabel: {
        color: '#fff',
        fontSize: 15,
        fontWeight: '800',
    },
});

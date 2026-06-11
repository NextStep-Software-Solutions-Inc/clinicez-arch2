import { useCallback, useRef, useState } from 'react';
import { Alert, FlatList, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useFocusEffect, useNavigation, useTheme } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { isToday, isFuture, isPast, parseISO } from 'date-fns';
import { MaterialSymbol, SFSymbol } from '@react-navigation/native';
import ThemedText from '@ui/ThemedText';
import ThemedView from '@ui/ThemedView';
import EmptyState from '@ui/EmptyState';
import { SkeletonCard } from '@ui/Skeleton';
import AppointmentCard from 'components/appointments/AppointmentCard';
import SegmentedControl from 'components/appointments/SegmentedControl';
import OfflineBanner from 'components/appointments/OfflineBanner';
import { usePatientId } from 'hooks/usePatientId';
import { db } from '@db/index';
import { fetchAppointments } from '../../services/appointments/appointmentsService';
import type { AppointmentItem } from '../../services/appointments/types';

type Segment = 0 | 1;

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

export default function AppointmentsScreen() {
    const { colors } = useTheme();
    const navigation = useNavigation();
    const patientId = usePatientId();
    const insets = useSafeAreaInsets();
    const tabBarHeight = (useBottomTabBarHeight?.() || 96) + insets.bottom;

    const [appointments, setAppointments] = useState<AppointmentItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isFromCache, setIsFromCache] = useState(false);
    const [segment, setSegment] = useState<Segment>(0);
    const dbRef = useRef(db);

    const loadAppointments = useCallback(async () => {
        setIsLoading(true);
        try {
            const result = await fetchAppointments(patientId, dbRef.current);
            setAppointments(result.items);
            setIsFromCache(result.isFromCache);
        } catch { /* service layer handles fallback */ }
        finally { setIsLoading(false); }
    }, [patientId]);

    useFocusEffect(useCallback(() => { loadAppointments(); }, [loadAppointments]));

    const upcomingItems = appointments.filter(isUpcoming);
    const pastItems = appointments.filter(isPastItem);
    const activeTodayItem = upcomingItems.find(isActiveTodayItem) ?? null;
    const listItems = segment === 0 ? upcomingItems : pastItems;

    const handleCardPress = (item: AppointmentItem) =>
        navigation.navigate('Main', { screen: 'AppointmentDetailScreen', params: { appointmentId: item.id } });

    const handleReschedule = (item: AppointmentItem) =>
        navigation.navigate('Main', { screen: 'BookingDraftScreen', params: { clinicId: item.clinic.id } });

    const handleCancel = (item: AppointmentItem) =>
        Alert.alert('Cancel Appointment', `Cancel at ${item.clinic.name}?`, [
            { text: 'Keep', style: 'cancel' },
            { text: 'Cancel Appointment', style: 'destructive',
              onPress: () => Alert.alert('Coming soon', 'Cancellation requires the backend API.') },
        ]);

    const handleBookNew = () =>
        navigation.navigate('Main', { screen: 'BookingDraftScreen' });

    const renderHeader = () => (
        <View style={styles.listHeader}>
            <OfflineBanner isFromCache={isFromCache} />
            <View style={styles.segmentWrapper}>
                <SegmentedControl options={['Upcoming', 'Past']} selectedIndex={segment} onChange={setSegment} />
            </View>
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
                ListHeaderComponent={renderHeader}
                showsVerticalScrollIndicator={false}
                onRefresh={loadAppointments}
                refreshing={isLoading}
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

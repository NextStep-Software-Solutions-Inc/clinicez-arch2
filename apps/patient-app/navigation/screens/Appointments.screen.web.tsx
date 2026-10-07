import React, { useCallback, useRef, useState, useMemo } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';
import { useFocusEffect, useNavigation, useTheme } from '@react-navigation/native';
import { useAuth as useClerkAuth } from '@clerk/expo';
import { useNetInfo } from '@react-native-community/netinfo';
import { format, isToday, isFuture, isPast, parseISO } from 'date-fns';
import { and, eq, desc } from 'drizzle-orm';
import ThemedText from '@ui/ThemedText';
import EmptyState from '@ui/EmptyState';
import { SkeletonCard } from '@ui/Skeleton';
import AppointmentCard from 'components/appointments/AppointmentCard';
import OfflineBanner from 'components/appointments/OfflineBanner';
import { usePatientId } from 'hooks/usePatientId';
import { db } from '@db/index';
import { bookingDrafts } from '@db/schema/bookingDrafts';
import { clinics as clinicsTable } from '@db/schema/clinics';
import { fetchAppointments, getCachedAppointmentsWithLocalBookings } from '../../services/appointments/appointmentsService';
import type { AppointmentItem } from '../../services/appointments/types';
import { dialog } from '@utils/dialog';

interface DraftSummary {
  id: string;
  clinicId: string;
  clinicName: string | null;
  reason: string | null;
  preferredDate: string | null;
  updatedAt: Date;
}

function isUpcoming(item: AppointmentItem): boolean {
  try {
    const d = parseISO(item.scheduledAt);
    const active = item.status !== 'canceled' && item.status !== 'completed' && item.status !== 'no_show';
    return active && (isToday(d) || isFuture(d));
  } catch {
    return false;
  }
}

function isActiveTodayItem(item: AppointmentItem): boolean {
  try {
    const d = parseISO(item.scheduledAt);
    return isToday(d) && (item.status === 'confirmed' || item.status === 'action_required');
  } catch {
    return false;
  }
}

function isPastItem(item: AppointmentItem): boolean {
  try {
    const d = parseISO(item.scheduledAt);
    const terminal = item.status === 'canceled' || item.status === 'completed' || item.status === 'no_show';
    return terminal || (!isToday(d) && isPast(d));
  } catch {
    return false;
  }
}

export default function AppointmentsScreenWeb() {
  const { colors, dark: isDark } = useTheme();
  const navigation = useNavigation<any>();
  const patientId = usePatientId();
  const { getToken } = useClerkAuth();
  const netInfo = useNetInfo();
  const { width } = useWindowDimensions();

  const isDesktop = width >= 1024;
  const isTablet = width >= 640 && width < 1024;

  const [appointments, setAppointments] = useState<AppointmentItem[]>([]);
  const [drafts, setDrafts] = useState<DraftSummary[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isFromCache, setIsFromCache] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTab, setSelectedTab] = useState<'upcoming' | 'past' | 'drafts'>('upcoming');
  const [searchQuery, setSearchQuery] = useState('');

  const dbRef = useRef(db);
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
        .where(and(eq(bookingDrafts.patientId, patientId), eq(bookingDrafts.status, 'draft')))
        .orderBy(desc(bookingDrafts.updatedAt));

      setDrafts(
        rows.map((r) => ({
          id: r.id,
          clinicId: r.clinicId,
          clinicName: r.clinicName ?? null,
          reason: r.reason ?? null,
          preferredDate: r.preferredDate ?? null,
          updatedAt: r.updatedAt,
        }))
      );
    } catch (error) {
      console.error('Failed to load drafts on web:', error);
    }
  }, [patientId]);

  const fetchLiveAppointments = useCallback(async () => {
    if (netInfo.isConnected === false) return;
    setIsRefreshing(true);
    try {
      const liveResult = await fetchAppointments(patientId, dbRef.current, getTokenRef.current);
      setAppointments(liveResult.items);
      setIsFromCache(false);
    } catch (error) {
      setIsFromCache(true);
      dialog.alert(
        'Connection Error',
        'Failed to pull latest appointments from server. Showing cached data.',
        [
          { text: 'Close', style: 'cancel' },
          { text: 'Retry', onPress: fetchLiveAppointments },
        ]
      );
    } finally {
      setIsRefreshing(false);
    }
  }, [patientId, netInfo.isConnected]);

  const loadAppointments = useCallback(async () => {
    try {
      const cachedResult = await getCachedAppointmentsWithLocalBookings(patientId, dbRef.current);
      setAppointments(cachedResult.items);
    } catch {
      // ignore cached read errors
    } finally {
      setIsLoading(false);
    }
    await fetchLiveAppointments();
  }, [patientId, fetchLiveAppointments]);

  useFocusEffect(
    useCallback(() => {
      loadAppointments();
      loadDrafts();
    }, [loadAppointments, loadDrafts])
  );

  const upcomingItems = useMemo(() => appointments.filter(isUpcoming), [appointments]);
  const pastItems = useMemo(() => appointments.filter(isPastItem), [appointments]);
  const activeTodayItem = useMemo(() => upcomingItems.find(isActiveTodayItem) ?? null, [upcomingItems]);

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
    dialog.alert('Cancel Appointment', `Cancel appointment at ${item.clinic.name}?`, [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Cancel Appointment',
        style: 'destructive',
        onPress: () => dialog.alert('Notice', 'Cancellation requires online doctor confirmation.'),
      },
    ]);

  const handleBookNew = () => navigation.navigate('Main', { screen: 'BookingDraftScreen' });

  const handleDiscardDraft = (draftId: string) => {
    dialog.alert('Discard Draft', 'Remove this appointment draft?', [
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

  // Filter items by search query
  const query = searchQuery.trim().toLowerCase();

  const filteredUpcoming = useMemo(() => {
    return upcomingItems.filter((item) => {
      if (!query) return true;
      return (
        item.clinic.name.toLowerCase().includes(query) ||
        (item.provider?.name?.toLowerCase().includes(query) ?? false) ||
        (item.chiefComplaint?.toLowerCase().includes(query) ?? false) ||
        (item.subject?.toLowerCase().includes(query) ?? false)
      );
    });
  }, [upcomingItems, query]);

  const filteredPast = useMemo(() => {
    return pastItems.filter((item) => {
      if (!query) return true;
      return (
        item.clinic.name.toLowerCase().includes(query) ||
        (item.provider?.name?.toLowerCase().includes(query) ?? false) ||
        (item.chiefComplaint?.toLowerCase().includes(query) ?? false) ||
        (item.subject?.toLowerCase().includes(query) ?? false)
      );
    });
  }, [pastItems, query]);

  const filteredDrafts = useMemo(() => {
    return drafts.filter((draft) => {
      if (!query) return true;
      return (
        (draft.clinicName?.toLowerCase().includes(query) ?? false) ||
        (draft.reason?.toLowerCase().includes(query) ?? false)
      );
    });
  }, [drafts, query]);

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.scrollContent, { paddingBottom: isDesktop ? 32 : 96 }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.container}>
        {/* Offline Banner */}
        <OfflineBanner isFromCache={isFromCache} />

        {/* Page Header */}
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <View style={styles.badgeRow}>
              <View style={styles.pageBadge}>
                <ThemedText style={styles.pageBadgeText}>CARE SCHEDULE</ThemedText>
              </View>
              {activeTodayItem && (
                <View style={styles.todayPill}>
                  <ThemedText style={styles.todayPillText}>● Visit Today</ThemedText>
                </View>
              )}
            </View>
            <ThemedText style={[styles.pageTitle, { color: colors.text }]}>
              Appointments & Visits
            </ThemedText>
            <ThemedText style={[styles.pageSubtitle, { color: isDark ? '#94A3B8' : '#64748B' }]}>
              Track your scheduled consultations, review past care history, and resume booking drafts.
            </ThemedText>
          </View>

          <View style={styles.headerActions}>
            <Pressable
              onPress={loadAppointments}
              disabled={isRefreshing}
              style={({ pressed }) => [
                styles.refreshBtn,
                { borderColor: isDark ? '#334155' : '#CBD5E1' },
                pressed && { opacity: 0.7 },
              ]}
            >
              {isRefreshing ? (
                <ActivityIndicator size="small" color="#3B82F6" />
              ) : (
                <ThemedText style={styles.refreshBtnText}>🔄 Refresh</ThemedText>
              )}
            </Pressable>

            <Pressable
              onPress={handleBookNew}
              style={({ pressed }) => [styles.bookNewBtn, pressed && { opacity: 0.85 }]}
            >
              <ThemedText style={styles.bookNewBtnText}>➕ Book Appointment</ThemedText>
            </Pressable>
          </View>
        </View>

        {/* Active Today Banner */}
        {activeTodayItem && selectedTab === 'upcoming' && (
          <View
            style={[
              styles.todayBanner,
              {
                backgroundColor: isDark ? '#1E293B' : '#EFF6FF',
                borderColor: '#3B82F6',
              },
            ]}
          >
            <View style={styles.todayBannerHeader}>
              <View style={styles.todayBadge}>
                <ThemedText style={styles.todayBadgeText}>TODAY'S APPOINTMENT</ThemedText>
              </View>
              <ThemedText style={[styles.todayTime, { color: '#3B82F6' }]}>
                {format(parseISO(activeTodayItem.scheduledAt), 'h:mm a')}
              </ThemedText>
            </View>
            <ThemedText style={[styles.todayClinic, { color: colors.text }]}>
              {activeTodayItem.clinic.name}
            </ThemedText>
            {activeTodayItem.provider && (
              <ThemedText style={[styles.todayDoctor, { color: isDark ? '#CBD5E1' : '#475569' }]}>
                👨‍⚕️ {activeTodayItem.provider.name}
              </ThemedText>
            )}
            <View style={styles.todayActions}>
              <Pressable
                onPress={() => handleCardPress(activeTodayItem)}
                style={styles.todayPrimaryBtn}
              >
                <ThemedText style={styles.todayPrimaryBtnText}>View Details & QR</ThemedText>
              </Pressable>
              <Pressable
                onPress={() => handleReschedule(activeTodayItem)}
                style={[
                  styles.todaySecondaryBtn,
                  { borderColor: isDark ? '#475569' : '#CBD5E1' },
                ]}
              >
                <ThemedText style={[styles.todaySecondaryBtnText, { color: colors.text }]}>
                  Reschedule
                </ThemedText>
              </Pressable>
            </View>
          </View>
        )}

        {/* Tabs & Search Controls */}
        <View style={styles.controlsRow}>
          <View style={styles.tabsContainer}>
            <Pressable
              onPress={() => setSelectedTab('upcoming')}
              style={({ pressed }) => [
                styles.tabItem,
                selectedTab === 'upcoming' && styles.tabItemActive,
                { borderColor: isDark ? '#334155' : '#E2E8F0' },
                pressed && { opacity: 0.8 },
              ]}
            >
              <ThemedText
                style={[
                  styles.tabText,
                  selectedTab === 'upcoming'
                    ? styles.tabTextActive
                    : { color: isDark ? '#94A3B8' : '#64748B' },
                ]}
              >
                Upcoming ({upcomingItems.length})
              </ThemedText>
            </Pressable>

            <Pressable
              onPress={() => setSelectedTab('past')}
              style={({ pressed }) => [
                styles.tabItem,
                selectedTab === 'past' && styles.tabItemActive,
                { borderColor: isDark ? '#334155' : '#E2E8F0' },
                pressed && { opacity: 0.8 },
              ]}
            >
              <ThemedText
                style={[
                  styles.tabText,
                  selectedTab === 'past'
                    ? styles.tabTextActive
                    : { color: isDark ? '#94A3B8' : '#64748B' },
                ]}
              >
                Past Visits ({pastItems.length})
              </ThemedText>
            </Pressable>

            <Pressable
              onPress={() => setSelectedTab('drafts')}
              style={({ pressed }) => [
                styles.tabItem,
                selectedTab === 'drafts' && styles.tabItemActive,
                { borderColor: isDark ? '#334155' : '#E2E8F0' },
                pressed && { opacity: 0.8 },
              ]}
            >
              <ThemedText
                style={[
                  styles.tabText,
                  selectedTab === 'drafts'
                    ? styles.tabTextActive
                    : { color: isDark ? '#94A3B8' : '#64748B' },
                ]}
              >
                Drafts ({drafts.length})
              </ThemedText>
            </Pressable>
          </View>

          <View style={[styles.searchBox, { borderColor: isDark ? '#334155' : '#CBD5E1' }]}>
            <ThemedText style={{ fontSize: 16 }}>🔍</ThemedText>
            <TextInput
              style={[styles.searchInput, { color: colors.text }]}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search by clinic, doctor, or reason..."
              placeholderTextColor={isDark ? '#64748B' : '#94A3B8'}
            />
            {searchQuery.length > 0 && (
              <Pressable onPress={() => setSearchQuery('')}>
                <ThemedText style={{ color: '#94A3B8', fontWeight: '700' }}>✕</ThemedText>
              </Pressable>
            )}
          </View>
        </View>

        {/* Content Section */}
        {isLoading ? (
          <View style={styles.grid}>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </View>
        ) : selectedTab === 'drafts' ? (
          filteredDrafts.length > 0 ? (
            <View style={[styles.grid, isDesktop ? styles.grid2Col : styles.grid1Col]}>
              {filteredDrafts.map((draft) => (
                <View
                  key={draft.id}
                  style={[
                    styles.draftCardWeb,
                    {
                      backgroundColor: isDark ? '#1E293B' : '#FFFBEB',
                      borderColor: '#F59E0B',
                    },
                  ]}
                >
                  <View style={styles.draftCardHeader}>
                    <ThemedText style={[styles.draftClinicTitle, { color: colors.text }]}>
                      {draft.clinicName ?? 'Unnamed Clinic'}
                    </ThemedText>
                    <View style={styles.draftBadge}>
                      <ThemedText style={styles.draftBadgeText}>DRAFT</ThemedText>
                    </View>
                  </View>
                  {draft.reason && (
                    <ThemedText
                      style={[styles.draftReasonText, { color: isDark ? '#CBD5E1' : '#64748B' }]}
                      numberOfLines={2}
                    >
                      {draft.reason.replace(/^\[\[service:[^\]]+\]\]\n?/, '')}
                    </ThemedText>
                  )}
                  <ThemedText
                    style={[styles.draftMetaDate, { color: isDark ? '#94A3B8' : '#94A3B8' }]}
                  >
                    Last updated {format(draft.updatedAt, 'MMM d, yyyy • h:mm a')}
                  </ThemedText>
                  <View style={styles.draftActionRow}>
                    <Pressable
                      onPress={() =>
                        navigation.navigate('Main', {
                          screen: 'BookingDraftScreen',
                          params: { clinicId: draft.clinicId },
                        })
                      }
                      style={styles.draftContinueButton}
                    >
                      <ThemedText style={styles.draftContinueButtonText}>
                        Continue Booking →
                      </ThemedText>
                    </Pressable>
                    <Pressable
                      onPress={() => handleDiscardDraft(draft.id)}
                      style={[
                        styles.draftDiscardButton,
                        { borderColor: isDark ? '#334155' : '#CBD5E1' },
                      ]}
                    >
                      <ThemedText style={styles.draftDiscardButtonText}>Discard</ThemedText>
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <EmptyState
              title="No booking drafts"
              message="You don't have any pending drafts. Choose a clinic to start booking an appointment."
              actionLabel="Find a Clinic"
              onActionPress={() => navigation.navigate('Main', { screen: 'ExploreClinicsScreen' })}
            />
          )
        ) : selectedTab === 'upcoming' ? (
          filteredUpcoming.length > 0 ? (
            <View style={[styles.grid, isDesktop ? styles.grid2Col : styles.grid1Col]}>
              {filteredUpcoming.map((item) => (
                <View key={item.id} style={styles.cardCol}>
                  <AppointmentCard
                    item={item}
                    onPress={() => handleCardPress(item)}
                    onReschedule={() => handleReschedule(item)}
                    onCancel={() => handleCancel(item)}
                  />
                </View>
              ))}
            </View>
          ) : (
            <EmptyState
              title={query ? 'No matching appointments' : 'No upcoming appointments'}
              message={
                query
                  ? 'No scheduled visits matched your search term.'
                  : "You don't have any upcoming consultations scheduled."
              }
              actionLabel={query ? undefined : 'Book an Appointment'}
              onActionPress={query ? undefined : handleBookNew}
            />
          )
        ) : filteredPast.length > 0 ? (
          <View style={[styles.grid, isDesktop ? styles.grid2Col : styles.grid1Col]}>
            {filteredPast.map((item) => (
              <View key={item.id} style={styles.cardCol}>
                <AppointmentCard
                  item={item}
                  onPress={() => handleCardPress(item)}
                  onReschedule={() => handleReschedule(item)}
                  onCancel={() => handleCancel(item)}
                />
              </View>
            ))}
          </View>
        ) : (
          <EmptyState
            title={query ? 'No matching visits' : 'No past visits'}
            message={
              query
                ? 'No past appointments matched your search query.'
                : 'Your previous clinic visits and consultations will appear here.'
            }
          />
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    width: '100%',
  },
  scrollContent: {
    paddingVertical: 24,
    paddingHorizontal: 20,
  },
  container: {
    maxWidth: 1280,
    width: '100%',
    marginHorizontal: 'auto',
    gap: 24,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: 16,
  },
  headerLeft: {
    gap: 6,
    maxWidth: 680,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pageBadge: {
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  pageBadgeText: {
    color: '#3B82F6',
    fontWeight: '800',
    fontSize: 11,
    letterSpacing: 0.8,
  },
  todayPill: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  todayPillText: {
    color: '#10B981',
    fontWeight: '700',
    fontSize: 11,
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  pageSubtitle: {
    fontSize: 14,
    lineHeight: 20,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  refreshBtn: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  refreshBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#3B82F6',
  },
  bookNewBtn: {
    backgroundColor: '#3B82F6',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  bookNewBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  todayBanner: {
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 20,
    gap: 10,
  },
  todayBannerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  todayBadge: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  todayBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  todayTime: {
    fontSize: 16,
    fontWeight: '800',
  },
  todayClinic: {
    fontSize: 18,
    fontWeight: '700',
  },
  todayDoctor: {
    fontSize: 14,
  },
  todayActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
  todayPrimaryBtn: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  todayPrimaryBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  todaySecondaryBtn: {
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  todaySecondaryBtnText: {
    fontWeight: '600',
    fontSize: 13,
  },
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 14,
  },
  tabsContainer: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  tabItem: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  tabItemActive: {
    backgroundColor: '#3B82F6',
    borderColor: '#3B82F6',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
    minWidth: 280,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  grid2Col: {
    justifyContent: 'space-between',
  },
  grid1Col: {
    flexDirection: 'column',
  },
  cardCol: {
    flexBasis: '48.5%',
    flexGrow: 1,
    minWidth: 320,
  },
  draftCardWeb: {
    flexBasis: '48.5%',
    flexGrow: 1,
    minWidth: 320,
    borderWidth: 1.5,
    borderRadius: 14,
    padding: 18,
    gap: 10,
  },
  draftCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  draftClinicTitle: {
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
  },
  draftBadge: {
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  draftBadgeText: {
    color: '#D97706',
    fontWeight: '800',
    fontSize: 11,
  },
  draftReasonText: {
    fontSize: 13,
    lineHeight: 18,
  },
  draftMetaDate: {
    fontSize: 11,
  },
  draftActionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
  draftContinueButton: {
    backgroundColor: '#F59E0B',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  draftContinueButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
  },
  draftDiscardButton: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  draftDiscardButtonText: {
    color: '#EF4444',
    fontWeight: '600',
    fontSize: 12,
  },
});

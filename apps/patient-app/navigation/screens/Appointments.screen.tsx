import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useNetInfo } from '@react-native-community/netinfo';
import { format, isToday, isFuture, isPast, parseISO } from 'date-fns';
import { and, eq, desc } from 'drizzle-orm';
import { useAuth as useClerkAuth } from '@clerk/expo';
import ThemedText from '../../components/ui/ThemedText';
import ThemedView from '../../components/ui/ThemedView';
import EmptyState from '../../components/ui/EmptyState';
import { SkeletonCard } from '../../components/ui/Skeleton';
import { AppIcon } from '../../components/ui/Icon';
import { ActiveSearchBanner, SearchModal } from '../../components/ui/SearchModal';
import BottomTabsHeaderRight from '../../components/BottomTabsHeaderRight';
import AppointmentCard from '../../components/appointments/AppointmentCard';
import SegmentedControl from '../../components/appointments/SegmentedControl';
import OfflineBanner from '../../components/appointments/OfflineBanner';
import { usePersistedTab } from '../../hooks/usePersistedTab';
import { useAppTheme } from '../../contexts/ThemeContext';
import { useContentInsets } from '../../hooks/useContentInsets';
import { usePatientId } from '../../hooks/usePatientId';
import { db } from '../../db/index';
import { bookingDrafts } from '../../db/schema/bookingDrafts';
import { clinics as clinicsTable } from '../../db/schema/clinics';
import { fetchAppointments, getCachedAppointmentsWithLocalBookings } from '../../services/appointments/appointmentsService';
import type { AppointmentItem } from '../../services/appointments/types';
import { dialog } from '../../utils/dialog';

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
  const { colors, radii, spacing, shadows } = useAppTheme();
  const dateLabel = (() => {
    try {
      return format(draft.updatedAt, 'MMM d');
    } catch {
      return '';
    }
  })();

  return (
    <Pressable
      onPress={onContinue}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.draftCard,
        {
          borderColor: colors.warningBorder,
          backgroundColor: colors.warningBg,
          borderRadius: radii.lg,
          padding: spacing.md,
          gap: spacing.sm,
          opacity: pressed ? 0.84 : 1,
        },
        shadows.sm,
      ]}
    >
      <View style={styles.draftHeader}>
        <ThemedText variant="bodyBold" numberOfLines={1} style={styles.flex}>
          {draft.clinicName ?? 'Unknown Clinic'}
        </ThemedText>
        <ThemedText variant="small" color="textMuted">
          {dateLabel}
        </ThemedText>
      </View>
      {draft.reason ? (
        <ThemedText variant="body" color="textSecondary" numberOfLines={2}>
          {/* Strip service metadata prefix if present */}
          {draft.reason.replace(/^\[\[service:[^\]]+\]\]\n?/, '')}
        </ThemedText>
      ) : null}
      <View style={styles.draftActions}>
        <Pressable
          onPress={onContinue}
          style={[
            styles.draftContinueBtn,
            {
              backgroundColor: colors.warning,
              borderRadius: radii.full,
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.sm,
            },
          ]}
          accessibilityRole="button"
        >
          <ThemedText variant="smallBold" color="textInverted">
            Continue Booking
          </ThemedText>
        </Pressable>
        <Pressable
          onPress={onDiscard}
          style={[styles.draftDiscardBtn, { paddingHorizontal: spacing.md, paddingVertical: spacing.sm }]}
          accessibilityRole="button"
        >
          <ThemedText variant="smallBold" color="textMuted">
            Discard
          </ThemedText>
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

export default function AppointmentsScreen() {
  const { colors, spacing, radii, sizes, shadows } = useAppTheme();
  const navigation = useNavigation<any>();
  const patientId = usePatientId();
  const { getToken } = useClerkAuth();
  const contentInsets = useContentInsets();

  const netInfo = useNetInfo();
  const [appointments, setAppointments] = useState<AppointmentItem[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isFromCache, setIsFromCache] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [segment, setSegment] = usePersistedTab<Segment>({
    key: 'appointments.segment',
    defaultValue: 0,
    queryParam: 'tab',
    serialize: (s) => (s === 1 ? 'past' : 'upcoming'),
    deserialize: (raw) => (raw === 'past' || raw === '1' ? 1 : 0),
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [drafts, setDrafts] = useState<DraftSummary[]>([]);
  const dbRef = useRef(db);

  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  const hasActiveSearch = searchQuery.trim().length > 0;
  const openSearchDialog = useCallback(() => {
    setIsSearchModalOpen(true);
  }, []);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <BottomTabsHeaderRight
          onOpenSearch={openSearchDialog}
          hasActiveSearch={hasActiveSearch}
        />
      ),
    });
  }, [navigation, openSearchDialog, hasActiveSearch]);

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
        rows.map((r) => {
          const rawReason = r.reason ?? null;
          return {
            id: r.id,
            clinicId: r.clinicId,
            clinicName: r.clinicName ?? null,
            reason: rawReason,
            preferredDate: r.preferredDate ?? null,
            updatedAt: r.updatedAt,
          };
        }),
      );
    } catch (error) {
      console.error('Failed to load drafts:', error);
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
        'Failed to pull the latest appointments from the server. Showing cached data instead.',
        [
          { text: 'Close', style: 'cancel' },
          { text: 'Retry', onPress: fetchLiveAppointments },
        ],
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
      /* ignore cache read error */
    } finally {
      setIsLoading(false);
    }

    await fetchLiveAppointments();
  }, [patientId, fetchLiveAppointments]);

  useFocusEffect(
    useCallback(() => {
      loadAppointments();
      loadDrafts();
    }, [loadAppointments, loadDrafts]),
  );

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const matchesSearch = useCallback(
    (item: AppointmentItem) => {
      if (!normalizedQuery) return true;
      return (
        item.clinic.name.toLowerCase().includes(normalizedQuery) ||
        (item.provider?.name?.toLowerCase().includes(normalizedQuery) ?? false) ||
        (item.chiefComplaint?.toLowerCase().includes(normalizedQuery) ?? false) ||
        (item.subject?.toLowerCase().includes(normalizedQuery) ?? false)
      );
    },
    [normalizedQuery],
  );

  const upcomingItems = useMemo(
    () => appointments.filter(isUpcoming).filter(matchesSearch),
    [appointments, matchesSearch],
  );
  const pastItems = useMemo(
    () => appointments.filter(isPastItem).filter(matchesSearch),
    [appointments, matchesSearch],
  );
  const filteredDrafts = useMemo(() => {
    if (!normalizedQuery) return drafts;
    return drafts.filter(
      (d) =>
        (d.clinicName?.toLowerCase().includes(normalizedQuery) ?? false) ||
        (d.reason?.toLowerCase().includes(normalizedQuery) ?? false),
    );
  }, [drafts, normalizedQuery]);

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
        text: 'Cancel Appointment',
        style: 'destructive',
        onPress: () => dialog.alert('Coming soon', 'Cancellation requires the backend API.'),
      },
    ]);

  const handleBookNew = () => navigation.navigate('Main', { screen: 'BookingDraftScreen' });

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
      <View style={[styles.segmentWrapper, { paddingHorizontal: spacing.lg, paddingVertical: spacing.md }]}>
        <SegmentedControl options={['Upcoming', 'Past']} selectedIndex={segment} onChange={setSegment} />
      </View>

      {hasActiveSearch ? (
        <View style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.md }}>
          <ActiveSearchBanner
            query={searchQuery}
            onEdit={openSearchDialog}
            onClear={() => setSearchQuery('')}
          />
        </View>
      ) : null}

      {/* Drafts - only in Upcoming tab */}
      {segment === 0 && filteredDrafts.length > 0 && (
        <View style={[styles.draftSection, { gap: spacing.sm, marginBottom: spacing.sm }]}>
          <ThemedText
            variant="captionBold"
            color="textMuted"
            style={[styles.sectionLabel, { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm }]}
          >
            DRAFTS
          </ThemedText>
          {filteredDrafts.map((draft) => (
            <View key={draft.id} style={[styles.cardWrapper, { paddingHorizontal: spacing.lg }]}>
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
        <View style={[styles.todaySection, { paddingHorizontal: spacing.lg, gap: spacing.sm, marginBottom: spacing.lg }]}>
          <ThemedText
            variant="captionBold"
            color="textMuted"
            style={[styles.sectionLabel, { paddingBottom: spacing.xs }]}
          >
            TODAY
          </ThemedText>
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
        <ThemedText
          variant="captionBold"
          color="textMuted"
          style={[styles.sectionLabel, { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm }]}
        >
          {segment === 0 ? 'UPCOMING' : 'PAST APPOINTMENTS'}
        </ThemedText>
      )}
    </View>
  );

  if (isLoading) {
    return (
      <View style={[styles.screen, { paddingBottom: contentInsets.bottom }]}>
        <View style={[styles.loadingContainer, { padding: spacing.lg, gap: spacing.md }]}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      </View>
    );
  }

  return (
    <ThemedView style={styles.screen}>
      <FlatList
        data={listItems}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: contentInsets.bottom + spacing['3xl'] },
        ]}
        ListHeaderComponent={renderHeader()}
        showsVerticalScrollIndicator={false}
        onRefresh={loadAppointments}
        refreshing={isRefreshing}
        ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        ListEmptyComponent={
          <View style={[styles.emptyWrapper, { paddingHorizontal: spacing.lg, paddingTop: spacing.sm }]}>
            <EmptyState
              title={
                hasActiveSearch
                  ? 'No matching appointments'
                  : segment === 0
                    ? 'No upcoming appointments'
                    : 'No past appointments'
              }
              message={
                hasActiveSearch
                  ? 'No appointments matched your search keyword.'
                  : segment === 0
                    ? "You don't have any scheduled appointments. Book one to get started."
                    : 'Your previous visit history will appear here.'
              }
              actionLabel={
                hasActiveSearch
                  ? 'Clear Search'
                  : undefined
              }
              onActionPress={
                hasActiveSearch
                  ? () => setSearchQuery('')
                  : undefined
              }
            />
          </View>
        }
        renderItem={({ item }) => {
          if (isActiveTodayItem(item)) return null;
          return (
            <View style={[styles.cardWrapper, { paddingHorizontal: spacing.lg }]}>
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
          {
            backgroundColor: colors.primary,
            borderRadius: radii.full,
            bottom: spacing.lg,
            right: spacing.lg,
            paddingHorizontal: spacing.lg,
            paddingVertical: spacing.md,
            opacity: pressed ? 0.88 : 1,
          },
          shadows.md,
        ]}
        accessibilityRole="button"
        accessibilityLabel="Book a new appointment"
      >
        <AppIcon name="plus" size={sizes.iconMd} color="onPrimary" />
        <ThemedText variant="bodyBold" color="onPrimary">
          Book
        </ThemedText>
      </Pressable>

      <SearchModal
        visible={isSearchModalOpen}
        title="Search Appointments"
        placeholder="Search by clinic, doctor, or reason..."
        value={searchQuery}
        onApply={setSearchQuery}
        onClose={() => setIsSearchModalOpen(false)}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  screen: {
    flex: 1,
  },
  loadingContainer: {},
  listContent: {},
  listHeader: {},
  segmentWrapper: {},
  todaySection: {},
  sectionLabel: {
    textTransform: 'uppercase',
  },
  emptyWrapper: {},
  cardWrapper: {},
  draftSection: {},
  draftCard: {
    borderWidth: 1,
  },
  draftHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  draftActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  draftContinueBtn: {},
  draftDiscardBtn: {},
  fab: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    zIndex: 50,
  },
});

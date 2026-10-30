import React, { useCallback, useRef, useState, useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useAuth as useClerkAuth } from '@clerk/expo';
import { useNetInfo } from '@react-native-community/netinfo';
import { format, isToday, isFuture, isPast, parseISO } from 'date-fns';
import { and, eq, desc } from 'drizzle-orm';
import ThemedText from '../../components/ui/ThemedText';
import EmptyState from '../../components/ui/EmptyState';
import { SkeletonCard } from '../../components/ui/Skeleton';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import { AppIcon } from '../../components/ui/Icon';
import { SectionHeader } from '../../components/ui/Primitives';
import { FilterChipBar, type FilterChipItem } from '../../components/ui/FilterChipBar';
import { ActiveSearchBanner, SearchModal } from '../../components/ui/SearchModal';
import OfflineBanner from '../../components/appointments/OfflineBanner';
import { usePersistedTab } from '../../hooks/usePersistedTab';
import { useAppTheme } from '../../contexts/ThemeContext';
import { useRegisterHeaderSearch } from '../../contexts/HeaderSearchContext';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { usePatientId } from '../../hooks/usePatientId';
import { db } from '../../db/index';
import { bookingDrafts } from '../../db/schema/bookingDrafts';
import { clinics as clinicsTable } from '../../db/schema/clinics';
import { fetchAppointments, getCachedAppointmentsWithLocalBookings } from '../../services/appointments/appointmentsService';
import type { AppointmentItem } from '../../services/appointments/types';
import { dialog } from '../../utils/dialog';

interface DraftSummary {
  id: string;
  clinicId: string;
  clinicName: string | null;
  reason: string | null;
  preferredDate: string | null;
  updatedAt: Date;
}

type TabKey = 'upcoming' | 'past' | 'cancelled' | 'drafts';

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
    const terminal = item.status === 'completed' || item.status === 'no_show';
    return terminal || (!isToday(d) && isPast(d) && item.status !== 'canceled');
  } catch {
    return false;
  }
}

function isCancelledItem(item: AppointmentItem): boolean {
  return item.status === 'canceled';
}

export default function AppointmentsScreenWeb() {
  const { colors, spacing, radii, sizes, shadows } = useAppTheme();
  const navigation = useNavigation<any>();
  const patientId = usePatientId();
  const { getToken } = useClerkAuth();
  const netInfo = useNetInfo();
  const { isDesktop, isCompact } = useBreakpoint();

  const [appointments, setAppointments] = useState<AppointmentItem[]>([]);
  const [drafts, setDrafts] = useState<DraftSummary[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isFromCache, setIsFromCache] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTab, setSelectedTab] = usePersistedTab<TabKey>({
    key: 'appointments.tab',
    defaultValue: 'upcoming',
    queryParam: 'tab',
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<string | null>(null);

  const openSearchDialog = useCallback(() => {
    setIsSearchModalOpen(true);
  }, []);

  useRegisterHeaderSearch(
    'AppointmentsScreen',
    openSearchDialog,
    searchQuery.trim().length > 0
  );

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
  const cancelledItems = useMemo(() => appointments.filter(isCancelledItem), [appointments]);
  const activeTodayItem = useMemo(() => upcomingItems.find(isActiveTodayItem) ?? null, [upcomingItems]);

  const handleCardPress = (item: AppointmentItem) => {
    if (isDesktop) {
      setSelectedAppointmentId(item.id);
    } else {
      navigation.navigate('Main', { screen: 'AppointmentDetailScreen', params: { appointmentId: item.id } });
    }
  };

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

  const query = searchQuery.trim().toLowerCase();

  const filterList = (list: AppointmentItem[]) => {
    if (!query) return list;
    return list.filter(
      (item) =>
        item.clinic.name.toLowerCase().includes(query) ||
        (item.provider?.name?.toLowerCase().includes(query) ?? false) ||
        (item.chiefComplaint?.toLowerCase().includes(query) ?? false) ||
        (item.subject?.toLowerCase().includes(query) ?? false)
    );
  };

  const filteredUpcoming = useMemo(() => filterList(upcomingItems), [upcomingItems, query]);
  const filteredPast = useMemo(() => filterList(pastItems), [pastItems, query]);
  const filteredCancelled = useMemo(() => filterList(cancelledItems), [cancelledItems, query]);
  const filteredDrafts = useMemo(() => {
    if (!query) return drafts;
    return drafts.filter(
      (d) =>
        (d.clinicName?.toLowerCase().includes(query) ?? false) ||
        (d.reason?.toLowerCase().includes(query) ?? false)
    );
  }, [drafts, query]);

  const displayedList =
    selectedTab === 'upcoming'
      ? filteredUpcoming
      : selectedTab === 'past'
      ? filteredPast
      : selectedTab === 'cancelled'
      ? filteredCancelled
      : [];

  const selectedAppointment = useMemo(() => {
    if (!selectedAppointmentId) return displayedList[0] ?? null;
    return appointments.find((a) => a.id === selectedAppointmentId) ?? displayedList[0] ?? null;
  }, [selectedAppointmentId, displayedList, appointments]);

  const tabs: ReadonlyArray<FilterChipItem<TabKey>> = useMemo(
    () => [
      { key: 'upcoming', label: 'Upcoming', count: upcomingItems.length },
      { key: 'past', label: 'Past Visits', count: pastItems.length },
      { key: 'cancelled', label: 'Cancelled', count: cancelledItems.length },
      { key: 'drafts', label: 'Drafts', count: drafts.length },
    ],
    [upcomingItems.length, pastItems.length, cancelledItems.length, drafts.length]
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[
          styles.scrollContent,
          {
            padding: isCompact ? spacing.md : spacing['2xl'],
            gap: isCompact ? spacing.md : spacing.lg,
            paddingBottom: spacing['4xl'],
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <OfflineBanner isFromCache={isFromCache} />

        {/* Page Header Row (Desktop / Tablet only; compact uses top WebPageHeader) */}
        {!isCompact && (
          <View style={styles.headerRow}>
            <View style={styles.headerLeft}>
              <View style={styles.badgeRow}>
                <Badge label="CARE SCHEDULE" tone="primary" size="sm" />
                {activeTodayItem && <Badge label="Visit Today" tone="success" size="sm" />}
              </View>
              <ThemedText variant="display">Appointments & Visits</ThemedText>
              <ThemedText variant="bodyLarge" color="textSecondary">
                Track your scheduled consultations, review past care history, and resume booking drafts.
              </ThemedText>
            </View>

            <View style={[styles.headerActions, { gap: spacing.sm }]}>
              <Button
                label="Search"
                variant={query ? 'secondary' : 'outline'}
                size="md"
                icon="search"
                onPress={openSearchDialog}
              />
              <Button
                label="Refresh"
                variant="outline"
                size="md"
                icon="refresh"
                loading={isRefreshing}
                onPress={loadAppointments}
              />
              <Button
                label="Book Appointment"
                variant="primary"
                size="md"
                icon="plus"
                onPress={handleBookNew}
              />
            </View>
          </View>
        )}

        {/* Active Today Banner */}
        {activeTodayItem && selectedTab === 'upcoming' && (
          <Card
            padding="lg"
            style={{
              borderColor: colors.primary,
              borderWidth: 2,
              backgroundColor: colors.primarySubtle,
              gap: spacing.md,
            }}
          >
            <View style={styles.todayBannerHeader}>
              <Badge label="TODAY'S APPOINTMENT" tone="primary" size="sm" />
              <ThemedText variant="h3" color="primary">
                {format(parseISO(activeTodayItem.scheduledAt), 'h:mm a')}
              </ThemedText>
            </View>
            <ThemedText variant="h2">{activeTodayItem.clinic.name}</ThemedText>
            {activeTodayItem.provider && (
              <View style={styles.metaRow}>
                <AppIcon name="user" size={sizes.iconSm} color="textSecondary" />
                <ThemedText variant="body" color="textSecondary">
                  {activeTodayItem.provider.name}
                </ThemedText>
              </View>
            )}
            <View style={[styles.todayActions, { gap: spacing.md }]}>
              <Button
                label="View Details & QR"
                variant="primary"
                size="sm"
                onPress={() => handleCardPress(activeTodayItem)}
              />
              <Button
                label="Reschedule"
                variant="outline"
                size="sm"
                onPress={() => handleReschedule(activeTodayItem)}
              />
            </View>
          </Card>
        )}

        {/* Filter Chips (symmetrical top === bottom spacing) */}
        <FilterChipBar
          items={tabs}
          selectedKey={selectedTab}
          onSelect={setSelectedTab}
          showZeroCount
        />

        {/* Active Search Pill (shown only when a keyword filter is active) */}
        <ActiveSearchBanner
          query={searchQuery}
          onEdit={openSearchDialog}
          onClear={() => setSearchQuery('')}
        />

        {/* Main Content Area */}
        {isLoading ? (
          <View style={[styles.grid, { gap: spacing.lg }]}>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </View>
        ) : selectedTab === 'drafts' ? (
          filteredDrafts.length > 0 ? (
            <View style={[styles.grid, { gap: spacing.lg }]}>
              {filteredDrafts.map((draft) => (
                <Card
                  key={draft.id}
                  padding="lg"
                  style={{
                    width: '100%',
                    borderColor: colors.warningBorder,
                    backgroundColor: colors.warningBg,
                    gap: spacing.md,
                  }}
                >
                  <View style={styles.draftCardHeader}>
                    <ThemedText variant="h3" style={styles.flex}>
                      {draft.clinicName ?? 'Unnamed Clinic'}
                    </ThemedText>
                    <Badge label="DRAFT" tone="warning" size="sm" />
                  </View>
                  {draft.reason && (
                    <ThemedText variant="body" color="textSecondary" numberOfLines={2}>
                      {draft.reason.replace(/^\[\[service:[^\]]+\]\]\n?/, '')}
                    </ThemedText>
                  )}
                  <ThemedText variant="caption" color="textMuted">
                    Last updated {format(draft.updatedAt, 'MMM d, yyyy • h:mm a')}
                  </ThemedText>
                  <View style={[styles.draftActionRow, { gap: spacing.md }]}>
                    <Button
                      label="Continue Booking"
                      variant="primary"
                      size="sm"
                      iconRight="forward"
                      onPress={() =>
                        navigation.navigate('Main', {
                          screen: 'BookingDraftScreen',
                          params: { clinicId: draft.clinicId },
                        })
                      }
                    />
                    <Button
                      label="Discard"
                      variant="outline"
                      size="sm"
                      onPress={() => handleDiscardDraft(draft.id)}
                    />
                  </View>
                </Card>
              ))}
            </View>
          ) : (
            <EmptyState
              icon="calendar"
              title={query ? 'No matching drafts' : 'No booking drafts'}
              message={
                query
                  ? 'No booking drafts matched your search keyword.'
                  : "You don't have any pending drafts. Choose a clinic to start booking an appointment."
              }
              actionLabel={query ? 'Clear Search' : 'Find a Clinic'}
              onActionPress={
                query
                  ? () => setSearchQuery('')
                  : () => navigation.navigate('Main', { screen: 'ExploreClinicsScreen' })
              }
            />
          )
        ) : displayedList.length > 0 ? (
          <View
            style={[
              styles.layoutContainer,
              isDesktop ? styles.layoutDesktop : styles.layoutMobile,
              { gap: spacing['2xl'] },
            ]}
          >
            {/* List Column */}
            <View style={[isDesktop ? styles.listColDesktop : styles.fullCol, { gap: spacing.md }]}>
              {displayedList.map((item) => {
                const isSelected = isDesktop && selectedAppointment?.id === item.id;
                const badgeTone =
                  item.status === 'confirmed'
                    ? 'success'
                    : item.status === 'canceled'
                    ? 'danger'
                    : item.status === 'completed'
                    ? 'neutral'
                    : 'warning';

                return (
                  <Pressable
                    key={item.id}
                    onPress={() => handleCardPress(item)}
                    accessibilityRole="button"
                    accessibilityLabel={`${item.clinic.name}, ${item.status}`}
                    style={(state: any) => [
                      styles.hoverRow,
                      {
                        backgroundColor: isSelected
                          ? colors.primarySubtle
                          : state.hovered
                          ? colors.surfaceSubtle
                          : colors.card,
                        borderColor: isSelected
                          ? colors.primary
                          : state.hovered
                          ? colors.primaryBorder
                          : colors.border,
                        borderRadius: radii.lg,
                        padding: spacing.lg,
                        borderWidth: isSelected ? 2 : 1,
                      },
                      shadows.sm,
                    ]}
                  >
                    <View style={styles.cardHeaderRow}>
                      <ThemedText variant="h3" style={styles.flex}>
                        {item.clinic.name}
                      </ThemedText>
                      <Badge label={item.status.toUpperCase()} tone={badgeTone} size="sm" />
                    </View>
                    <View style={[styles.metaItemsRow, { gap: spacing.lg }]}>
                      <View style={styles.metaRow}>
                        <AppIcon name="calendar" size={sizes.iconSm} color="primary" />
                        <ThemedText variant="bodyBold">
                          {format(parseISO(item.scheduledAt), 'EEE, MMM d, yyyy')}
                        </ThemedText>
                      </View>
                      <View style={styles.metaRow}>
                        <AppIcon name="clock" size={sizes.iconSm} color="textMuted" />
                        <ThemedText variant="body" color="textSecondary">
                          {format(parseISO(item.scheduledAt), 'h:mm a')}
                        </ThemedText>
                      </View>
                    </View>
                    {item.provider && (
                      <View style={styles.metaRow}>
                        <AppIcon name="user" size={sizes.iconSm} color="textMuted" />
                        <ThemedText variant="small" color="textSecondary">
                          {item.provider.name}
                          {item.provider.specialty ? ` • ${item.provider.specialty}` : ''}
                        </ThemedText>
                      </View>
                    )}
                    {item.chiefComplaint && (
                      <ThemedText variant="small" color="textMuted" numberOfLines={1}>
                        {item.chiefComplaint}
                      </ThemedText>
                    )}
                  </Pressable>
                );
              })}
            </View>

            {/* Desktop Side Detail Summary Column */}
            {isDesktop && (
              <View style={styles.sideDetailCol}>
                {selectedAppointment ? (
                  <Card padding="lg" style={styles.stickySideCard}>
                    <SectionHeader title="Appointment Preview" />
                    <ThemedText variant="h2">{selectedAppointment.clinic.name}</ThemedText>
                    <ThemedText variant="body" color="textSecondary">
                      {selectedAppointment.clinic.address}
                    </ThemedText>

                    <View
                      style={[
                        styles.previewMetaBox,
                        {
                          backgroundColor: colors.surfaceSubtle,
                          borderRadius: radii.md,
                          padding: spacing.md,
                          gap: spacing.sm,
                        },
                      ]}
                    >
                      <View style={styles.previewMetaRow}>
                        <ThemedText variant="small" color="textMuted">
                          Date & Time:
                        </ThemedText>
                        <ThemedText variant="smallBold">
                          {format(parseISO(selectedAppointment.scheduledAt), 'MMM d, yyyy • h:mm a')}
                        </ThemedText>
                      </View>
                      <View style={styles.previewMetaRow}>
                        <ThemedText variant="small" color="textMuted">
                          Service:
                        </ThemedText>
                        <ThemedText variant="smallBold">
                          {selectedAppointment.serviceType}
                        </ThemedText>
                      </View>
                      <View style={styles.previewMetaRow}>
                        <ThemedText variant="small" color="textMuted">
                          Status:
                        </ThemedText>
                        <Badge
                          label={selectedAppointment.status.toUpperCase()}
                          tone={selectedAppointment.status === 'confirmed' ? 'success' : 'warning'}
                          size="sm"
                        />
                      </View>
                      {selectedAppointment.provider && (
                        <View style={styles.previewMetaRow}>
                          <ThemedText variant="small" color="textMuted">
                            Provider:
                          </ThemedText>
                          <ThemedText variant="smallBold">
                            {selectedAppointment.provider.name}
                          </ThemedText>
                        </View>
                      )}
                    </View>

                    {selectedAppointment.chiefComplaint && (
                      <View style={{ gap: spacing.xs }}>
                        <ThemedText variant="captionBold" color="textMuted">
                          CHIEF COMPLAINT
                        </ThemedText>
                        <ThemedText variant="body" color="text">
                          {selectedAppointment.chiefComplaint}
                        </ThemedText>
                      </View>
                    )}

                    <View style={[styles.sideDetailActions, { gap: spacing.md, marginTop: spacing.md }]}>
                      <Button
                        label="View Full Details"
                        variant="primary"
                        size="md"
                        fullWidth
                        onPress={() =>
                          navigation.navigate('Main', {
                            screen: 'AppointmentDetailScreen',
                            params: { appointmentId: selectedAppointment.id },
                          })
                        }
                      />
                      {selectedAppointment.status !== 'canceled' &&
                        selectedAppointment.status !== 'completed' && (
                          <View style={[styles.sideDetailBtnRow, { gap: spacing.md }]}>
                            <Button
                              label="Reschedule"
                              variant="outline"
                              size="md"
                              style={styles.flex}
                              onPress={() => handleReschedule(selectedAppointment)}
                            />
                            <Button
                              label="Cancel"
                              variant="danger"
                              size="md"
                              style={styles.flex}
                              onPress={() => handleCancel(selectedAppointment)}
                            />
                          </View>
                        )}
                    </View>
                  </Card>
                ) : (
                  <Card padding="lg" style={styles.stickySideCard}>
                    <ThemedText variant="body" color="textMuted">
                      Select an appointment to preview details.
                    </ThemedText>
                  </Card>
                )}
              </View>
            )}
          </View>
        ) : (
          <EmptyState
            icon="calendar"
            title={query ? 'No matching appointments' : `No ${selectedTab} visits`}
            message={
              query
                ? 'No appointments matched your search keyword.'
                : `You don't have any ${selectedTab} visits recorded.`
            }
            actionLabel={
              query
                ? 'Clear Search'
                : selectedTab === 'upcoming'
                  ? 'Book an Appointment'
                  : undefined
            }
            onActionPress={
              query
                ? () => setSearchQuery('')
                : selectedTab === 'upcoming'
                  ? handleBookNew
                  : undefined
            }
          />
        )}
      </ScrollView>

      <SearchModal
        visible={isSearchModalOpen}
        title="Search Appointments"
        placeholder="Search by clinic, doctor, or reason..."
        value={searchQuery}
        onApply={setSearchQuery}
        onClose={() => setIsSearchModalOpen(false)}
      />

      {/* Compact Floating Action Button (matches native AppointmentsScreen) */}
      {isCompact && (
        <Pressable
          onPress={handleBookNew}
          accessibilityRole="button"
          accessibilityLabel="Book a new appointment"
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
        >
          <AppIcon name="plus" size={sizes.iconMd} color="onPrimary" />
          <ThemedText variant="bodyBold" color="onPrimary">
            Book
          </ThemedText>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  root: {
    flex: 1,
    width: '100%',
  },
  scrollContent: {
    width: '100%',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: 16,
  },
  headerLeft: {
    flex: 1,
    minWidth: 240,
    maxWidth: 680,
    gap: 6,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  todayBannerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  todayActions: {
    flexDirection: 'row',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  draftCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  draftActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  layoutContainer: {
    width: '100%',
  },
  layoutDesktop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  layoutMobile: {
    flexDirection: 'column',
  },
  listColDesktop: {
    flex: 60,
  },
  sideDetailCol: {
    flex: 40,
  },
  stickySideCard: {
    gap: 12,
  },
  fullCol: {
    width: '100%',
  },
  hoverRow: {
    gap: 8,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metaItemsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  previewMetaBox: {
    borderWidth: 1,
    borderColor: 'transparent',
  },
  previewMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sideDetailActions: {},
  sideDetailBtnRow: {
    flexDirection: 'row',
  },
  fab: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    zIndex: 50,
  },
});

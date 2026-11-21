import React, { useCallback, useLayoutEffect, useMemo, useRef, useState, useEffect } from 'react';
import {
  Animated,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useAuth as useClerkAuth, useUser } from '@clerk/expo';
import { isToday, isFuture, isPast, parseISO } from 'date-fns';
import { and, eq, desc } from 'drizzle-orm';
import { SkeletonCard } from '../../components/ui/Skeleton';
import { ActiveSearchBanner, SearchModal } from '../../components/ui/SearchModal';
import { AppIcon } from '../../components/ui/Icon';
import BottomTabsHeaderRight from '../../components/BottomTabsHeaderRight';
import HomeHeader from '../../components/home/HomeHeader';
import HomeOfflinePillBanner from '../../components/home/HomeOfflinePillBanner';
import AppointmentsFilterBar, {
  type AppointmentFilterTab,
} from '../../components/appointments/AppointmentsFilterBar';
import UpcomingAppointmentCard from '../../components/appointments/UpcomingAppointmentCard';
import PastAppointmentCard from '../../components/appointments/PastAppointmentCard';
import EmptyAppointmentsView, {
  type SuggestedCareServiceItem,
} from '../../components/appointments/EmptyAppointmentsView';
import { useNotificationContext } from '../../contexts/NotificationContext';
import { useClinicalEmpathyTheme } from '../../constants/clinicalEmpathy';
import { useContentInsets } from '../../hooks/useContentInsets';
import { useNetworkOnline } from '../../hooks/useNetworkOnline';
import { usePatientId } from '../../hooks/usePatientId';
import { db } from '../../db/index';
import { bookingDrafts } from '../../db/schema/bookingDrafts';
import { clinics as clinicsTable } from '../../db/schema/clinics';
import { patients as patientsTable } from '../../db/schema/patients';
import { notifications as notificationsTable } from '../../db/schema/notifications';
import {
  fetchAppointments,
  getCachedAppointmentsWithLocalBookings,
} from '../../services/appointments/appointmentsService';
import type { AppointmentItem } from '../../services/appointments/types';
import { queryDirectorySearchCatalog } from '../../services/search/directorySearchService';

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
    const active =
      item.status !== 'canceled' &&
      item.status !== 'completed' &&
      item.status !== 'no_show';
    return active && (isToday(d) || isFuture(d));
  } catch {
    return false;
  }
}

function isPastItem(item: AppointmentItem): boolean {
  try {
    const d = parseISO(item.scheduledAt);
    const terminal =
      item.status === 'completed' ||
      item.status === 'no_show' ||
      item.status === 'canceled';
    return terminal || (!isToday(d) && isPast(d));
  } catch {
    return false;
  }
}

export default function AppointmentsScreen() {
  const empathy = useClinicalEmpathyTheme();
  const { spacing, radii } = empathy;
  const navigation = useNavigation<any>();
  const patientId = usePatientId();
  const { getToken } = useClerkAuth();
  const { user } = useUser();
  const { unreadCount } = useNotificationContext();
  const { isOnline } = useNetworkOnline();
  const contentInsets = useContentInsets();

  const scrollY = useRef(new Animated.Value(0)).current;

  const [appointments, setAppointments] = useState<AppointmentItem[]>([]);
  const [drafts, setDrafts] = useState<DraftSummary[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<AppointmentFilterTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [patientProfile, setPatientProfile] = useState<{
    fullName: string;
    avatarUrl?: string | null;
  }>({
    fullName: user?.fullName || 'Patient',
    avatarUrl: user?.imageUrl || null,
  });
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0);
  const [suggestedServices, setSuggestedServices] = useState<SuggestedCareServiceItem[]>([]);

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

  const navigateToMainRoute = useCallback(
    (screenName: string, params?: Record<string, unknown>) => {
      const parent = navigation.getParent?.();
      const grandParent = parent?.getParent?.();
      if (grandParent) {
        grandParent.navigate(screenName, params);
        return;
      }
      if (parent) {
        parent.navigate(screenName, params);
        return;
      }
      navigation.navigate('Main', { screen: screenName, params });
    },
    [navigation],
  );

  const navigateToTab = useCallback(
    (tabName: 'HomeScreen' | 'RecordsScreen' | 'AppointmentsScreen' | 'MessagesScreen') => {
      const parent = navigation.getParent?.();
      if (parent) {
        if (tabName === 'RecordsScreen') {
          parent.navigate('RecordsScreen', { screen: 'FilesBrowserScreen' });
        } else {
          parent.navigate(tabName);
        }
        return;
      }
      navigation.navigate('Main', {
        screen: 'BottomTabs',
        params: { screen: tabName },
      });
    },
    [navigation],
  );

  const dbRef = useRef(db);
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  // Load patient metadata and unread notifications
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (patientId) {
          const pRows = await dbRef.current
            .select()
            .from(patientsTable)
            .where(eq(patientsTable.id, patientId));
          if (mounted && pRows.length > 0) {
            const p = pRows[0];
            const name = [p.firstName, p.lastName].filter(Boolean).join(' ') || 'Patient';
            setPatientProfile({
              fullName: name,
              avatarUrl: user?.imageUrl || null,
            });
          }

          const nRows = await dbRef.current
            .select()
            .from(notificationsTable)
            .where(and(eq(notificationsTable.patientId, patientId), eq(notificationsTable.isRead, false)));
          if (mounted) {
            setUnreadNotificationsCount(nRows.length);
          }
        }
      } catch {
        // Safe fallback
      }
    })();
    return () => {
      mounted = false;
    };
  }, [patientId, user]);

  // Load live suggested services catalog from backend/SQLite
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data } = await queryDirectorySearchCatalog(getTokenRef.current, patientId);
        if (!active) return;

        const items: SuggestedCareServiceItem[] = [];

        if (data.doctors && data.doctors.length > 0) {
          const doc =
            data.doctors.find((d) => d.clinicSupportsAppointments) ?? data.doctors[0];
          const canBookDoc = doc.clinicSupportsAppointments;
          items.push({
            id: `doc-${doc.id}`,
            title: doc.specialty || 'General Consultation',
            subtitle: doc.name,
            detail: canBookDoc
              ? `${doc.clinicName} • Available`
              : `${doc.clinicName} • Booking Paused`,
            badgeType: 'doctor',
            imageUrl: doc.avatarUrl,
            buttonLabel: canBookDoc ? 'Book Slot' : 'View Profile',
            buttonVariant: 'primary',
            onPress: () => {
              if (canBookDoc) {
                navigateToMainRoute('BookingDraftScreen', {
                  clinicId: doc.clinicId,
                  providerId: doc.id,
                  practitionerId: doc.practitionerId ?? undefined,
                  providerName: doc.name,
                });
                return;
              }
              navigateToMainRoute('ProviderProfileScreen', {
                id: doc.practitionerId ?? doc.id,
                directoryDoctor: doc,
              });
            },
          });
        }

        const teleClinic = data.clinics.find((c) => c.supportsAppointments) || data.clinics[0];
        if (teleClinic) {
          items.push({
            id: `tele-${teleClinic.id}`,
            title: 'Telehealth Quick Care',
            subtitle: 'Virtual consultation',
            detail: `${teleClinic.name}`,
            badgeType: 'video',
            buttonLabel: 'Instant Connect',
            buttonVariant: 'mint',
            // Newly introduced button with no dedicated instant teleconsult flow yet: no-op
            onPress: () => {},
          });
        }

        if (data.clinics.length > 1) {
          const wellnessClinic = data.clinics[1];
          items.push({
            id: `well-${wellnessClinic.id}`,
            title: wellnessClinic.name,
            subtitle: wellnessClinic.primarySpecialty || 'Outpatient Care Center',
            detail: wellnessClinic.openStatusLabel || 'Open network clinic',
            badgeType: 'shield',
            buttonLabel: 'Explore Clinic',
            buttonVariant: 'outline',
            onPress: () => {
              navigateToMainRoute('ClinicDetailsScreen', {
                clinicId: wellnessClinic.id,
                id: wellnessClinic.id,
              });
            },
          });
        }

        if (active) {
          setSuggestedServices(items);
        }
      } catch {
        // Keep empty if catalog cannot be read
      }
    })();
    return () => {
      active = false;
    };
  }, [patientId, navigateToMainRoute]);

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
        })),
      );
    } catch {
      // Drafts failure should not crash screen
    }
  }, [patientId]);

  const loadData = useCallback(
    async (isManualRefresh = false) => {
      if (isManualRefresh) setIsRefreshing(true);

      const [cached] = await Promise.all([
        getCachedAppointmentsWithLocalBookings(patientId, dbRef.current),
        loadDrafts(),
      ]);

      if (cached.items.length > 0) {
        setAppointments(cached.items);
        setIsLoading(false);
      }

      try {
        const live = await fetchAppointments(patientId, dbRef.current, getTokenRef.current);
        setAppointments(live.items);
      } catch {
        // Cache is already displayed
      } finally {
        setIsLoading(false);
        if (isManualRefresh) setIsRefreshing(false);
      }
    },
    [patientId, loadDrafts],
  );

  useFocusEffect(
    useCallback(() => {
      void loadData();
    }, [loadData]),
  );

  const filteredAppointments = useMemo(() => {
    let result = appointments;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (a) =>
          a.provider.name.toLowerCase().includes(q) ||
          a.clinic.name.toLowerCase().includes(q) ||
          (a.serviceType && a.serviceType.toLowerCase().includes(q)) ||
          (a.notes && a.notes.toLowerCase().includes(q)),
      );
    }

    if (activeTab === 'upcoming') {
      return result.filter(isUpcoming);
    }
    if (activeTab === 'past') {
      return result.filter(isPastItem);
    }
    if (activeTab === 'waitlist') {
      return [];
    }
    return result;
  }, [appointments, searchQuery, activeTab]);

  const upcomingList = useMemo(
    () => filteredAppointments.filter(isUpcoming),
    [filteredAppointments],
  );

  const pastList = useMemo(
    () => filteredAppointments.filter(isPastItem),
    [filteredAppointments],
  );

  const countUpcoming = useMemo(() => appointments.filter(isUpcoming).length, [appointments]);
  const countPast = useMemo(() => appointments.filter(isPastItem).length, [appointments]);

  const handleCardPress = useCallback(
    (id: string) => {
      navigateToMainRoute('AppointmentDetailScreen', { id, appointmentId: id });
    },
    [navigateToMainRoute],
  );

  const handleGetDirections = useCallback((clinicName: string, clinicAddress?: string) => {
    const query = encodeURIComponent([clinicName, clinicAddress].filter(Boolean).join(', '));
    const url = Platform.select({
      ios: `http://maps.apple.com/?q=${query}`,
      android: `geo:0,0?q=${query}`,
      default: `https://www.google.com/maps/search/?api=1&query=${query}`,
    });
    if (url) {
      Linking.openURL(url).catch(() => {});
    }
  }, []);

  const handleReschedule = useCallback(
    (item: AppointmentItem) => {
      navigateToMainRoute('RescheduleScreen', {
        appointmentId: item.id,
        id: item.id,
        clinicId: item.clinic.id,
        currentScheduledAt: item.scheduledAt,
      });
    },
    [navigateToMainRoute],
  );

  const handleBookAgain = useCallback(
    (appt: AppointmentItem) => {
      navigateToMainRoute('BookingDraftScreen', {
        clinicId: appt.clinic.id,
        providerId: appt.provider.id !== 'local-pending' ? appt.provider.id : undefined,
      });
    },
    [navigateToMainRoute],
  );

  const effectiveUnreadCount = Math.max(unreadCount, unreadNotificationsCount);

  return (
    <SafeAreaView
      edges={['top']}
      style={[styles.root, { backgroundColor: empathy.colors.canvas }]}
    >
      <HomeHeader
        scrollY={scrollY}
        title="Appointments"
        subtitle="Scheduled visits across open network"
        fullName={patientProfile.fullName}
        avatarUrl={patientProfile.avatarUrl}
        unreadCount={effectiveUnreadCount}
        showBrand={true}
        alwaysShowTitle={false}
        onBrandPress={() => navigateToTab('HomeScreen')}
        onNotificationsPress={() => navigateToMainRoute('NotificationScreen')}
        onAvatarPress={() => navigateToMainRoute('ProfileScreen')}
      />

      <Animated.ScrollView
        style={styles.flex}
        showsVerticalScrollIndicator={false}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true },
        )}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => void loadData(true)}
            tintColor={empathy.colors.primary}
          />
        }
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.xs,
            paddingBottom: Math.max(contentInsets.bottom, 24) + (isOnline ? 28 : 76),
          },
        ]}
      >
        {/* Inline Title & Action Row: animates into HomeHeader when scrolled past */}
        <View style={[styles.compactTitleRow, { marginBottom: spacing.base }]}>
          <View style={styles.titleCol}>
            <Text
              numberOfLines={1}
              style={[
                empathy.typography.headlineLg,
                { color: empathy.colors.navyText },
              ]}
            >
              Appointments
            </Text>
            <Text
              numberOfLines={1}
              style={[
                empathy.typography.bodySm,
                { color: empathy.colors.mutedText, marginTop: spacing.xxs },
              ]}
            >
              Scheduled visits across open network
            </Text>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Book New Appointment"
            onPress={() => navigateToMainRoute('BookingDraftScreen')}
            style={({ pressed }) => [
              styles.bookNewBtn,
              {
                backgroundColor: empathy.colors.primary,
                borderRadius: radii.full,
                paddingHorizontal: spacing.base,
                opacity: pressed ? 0.9 : 1,
              },
            ]}
          >
            <AppIcon name="plus" size={16} color={empathy.colors.onPrimary} strokeWidth={2.5} />
            <Text
              style={[
                empathy.typography.labelBold,
                {
                  color: empathy.colors.onPrimary,
                  marginLeft: spacing.xs,
                },
              ]}
            >
              Book New
            </Text>
          </Pressable>
        </View>

        {/* Search Pill + Unified Filter Tabs */}
        <AppointmentsFilterBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          counts={{
            all: appointments.length,
            upcoming: countUpcoming,
            past: countPast,
          }}
        />

        {searchQuery.trim().length > 0 ? (
          <View style={{ marginTop: spacing.sm }}>
            <ActiveSearchBanner
              query={searchQuery}
              onEdit={openSearchDialog}
              onClear={() => setSearchQuery('')}
            />
          </View>
        ) : null}

        {/* Content Body */}
        {isLoading ? (
          <View style={{ marginTop: spacing.lg, gap: spacing.md }}>
            <SkeletonCard />
            <SkeletonCard />
          </View>
        ) : activeTab === 'waitlist' ? (
          /* Waitlist / Draft Bookings Tab */
          <View style={{ marginTop: spacing.xl }}>
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionTitleWithDot}>
                <View
                  style={[
                    styles.sectionDot,
                    {
                      backgroundColor: empathy.colors.amberText,
                      borderRadius: radii.full,
                    },
                  ]}
                />
                <Text
                  style={[
                    empathy.typography.overline,
                    { color: empathy.colors.navyText },
                  ]}
                >
                  BOOKING DRAFTS & WAITLIST
                </Text>
              </View>
              <Text style={[empathy.typography.bodySm, { color: empathy.colors.mutedText }]}>
                {drafts.length} {drafts.length === 1 ? 'Draft' : 'Drafts'}
              </Text>
            </View>

            {drafts.length === 0 ? (
              <View style={{ marginTop: spacing.md }}>
                <EmptyAppointmentsView
                  onFindDoctorPress={() => navigateToMainRoute('BookingDraftScreen')}
                  suggestedServices={suggestedServices}
                />
              </View>
            ) : (
              <View style={{ gap: spacing.md, marginTop: spacing.md }}>
                {drafts.map((d) => (
                  <Pressable
                    key={d.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Continue booking draft for ${d.clinicName || 'Clinic'}`}
                    onPress={() =>
                      navigateToMainRoute('BookingDraftScreen', {
                        draftId: d.id,
                        clinicId: d.clinicId,
                      })
                    }
                    style={({ pressed }) => [
                      styles.draftCard,
                      empathy.elevation.card,
                      {
                        backgroundColor: empathy.colors.surface,
                        borderColor: empathy.colors.borderSubtle,
                        borderRadius: radii.xl,
                        padding: spacing.base,
                        opacity: pressed ? 0.95 : 1,
                      },
                    ]}
                  >
                    <View style={styles.draftHeaderRow}>
                      <Text
                        style={[
                          empathy.typography.cardTitle,
                          { color: empathy.colors.navyText, flex: 1 },
                        ]}
                      >
                        {d.clinicName || 'Clinic'}
                      </Text>
                      <View
                        style={[
                          styles.draftBadge,
                          {
                            backgroundColor: empathy.colors.amberSoftBg,
                            borderRadius: radii.full,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            empathy.typography.labelSm,
                            { color: empathy.colors.amberText },
                          ]}
                        >
                          Draft
                        </Text>
                      </View>
                    </View>
                    <Text
                      style={[
                        empathy.typography.bodySm,
                        { color: empathy.colors.mutedText, marginTop: spacing.xs },
                      ]}
                    >
                      {d.reason || 'General Consultation'}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        ) : filteredAppointments.length === 0 ? (
          /* Empty State */
          <View style={{ marginTop: spacing.xl }}>
            <EmptyAppointmentsView
              onFindDoctorPress={() => navigateToMainRoute('BookingDraftScreen')}
              suggestedServices={suggestedServices}
            />
          </View>
        ) : (
          /* Populated Appointments View */
          <View style={{ marginTop: spacing.xl, gap: spacing.xl }}>
            {upcomingList.length > 0 ? (
              <View>
                <View style={styles.sectionHeaderRow}>
                  <View style={styles.sectionTitleWithDot}>
                    <View
                      style={[
                        styles.sectionDot,
                        {
                          backgroundColor: empathy.colors.primary,
                          borderRadius: radii.full,
                        },
                      ]}
                    />
                    <Text
                      style={[
                        empathy.typography.overline,
                        { color: empathy.colors.navyText },
                      ]}
                    >
                      UPCOMING VISITS
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.countBadge,
                      {
                        backgroundColor: empathy.colors.mintBadgeBg,
                        borderRadius: radii.full,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        empathy.typography.labelSm,
                        { color: empathy.colors.primaryDeep, fontWeight: '700' },
                      ]}
                    >
                      {upcomingList.length} Scheduled
                    </Text>
                  </View>
                </View>

                <View style={{ gap: spacing.md, marginTop: spacing.md }}>
                  {upcomingList.map((item) => (
                    <UpcomingAppointmentCard
                      key={item.id}
                      appointment={item}
                      onPressCard={() => handleCardPress(item.id)}
                      onCheckInPassPress={() => handleCardPress(item.id)}
                      onGetDirectionsPress={() =>
                        handleGetDirections(item.clinic.name, item.clinic.address)
                      }
                      onReschedulePress={() => handleReschedule(item)}
                    />
                  ))}
                </View>
              </View>
            ) : null}

            {pastList.length > 0 ? (
              <View>
                <View style={styles.sectionHeaderRow}>
                  <View style={styles.sectionTitleWithDot}>
                    <View
                      style={[
                        styles.sectionDot,
                        {
                          backgroundColor: empathy.colors.subtleText,
                          borderRadius: radii.full,
                        },
                      ]}
                    />
                    <Text
                      style={[
                        empathy.typography.overline,
                        { color: empathy.colors.mutedText },
                      ]}
                    >
                      PAST CONSULTATIONS
                    </Text>
                  </View>

                  <Text
                    style={[
                      empathy.typography.bodySm,
                      { color: empathy.colors.mutedText },
                    ]}
                  >
                    {pastList.length} {pastList.length === 1 ? 'Record' : 'Records'}
                  </Text>
                </View>

                <View style={{ gap: spacing.md, marginTop: spacing.md }}>
                  {pastList.map((item) => (
                    <PastAppointmentCard
                      key={item.id}
                      appointment={item}
                      onPressCard={() => handleCardPress(item.id)}
                      onViewSummaryPress={() => handleCardPress(item.id)}
                      onBookAgainPress={() => handleBookAgain(item)}
                    />
                  ))}
                </View>
              </View>
            ) : null}
          </View>
        )}
      </Animated.ScrollView>

      <HomeOfflinePillBanner isOnline={isOnline} />

      <SearchModal
        visible={isSearchModalOpen}
        value={searchQuery}
        onClose={() => setIsSearchModalOpen(false)}
        onApply={(keyword) => {
          setSearchQuery(keyword);
          setIsSearchModalOpen(false);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    width: '100%',
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    width: '100%',
  },
  compactTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  titleCol: {
    flex: 1,
    minWidth: 0,
  },
  bookNewBtn: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitleWithDot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionDot: {
    width: 8,
    height: 8,
  },
  countBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  draftCard: {
    borderWidth: 1,
    width: '100%',
  },
  draftHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  draftBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
});

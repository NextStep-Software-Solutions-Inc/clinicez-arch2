import React, { useCallback, useRef, useState, useMemo, useEffect } from 'react';
import {
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useAuth as useClerkAuth, useUser } from '@clerk/expo';
import { useNetInfo } from '@react-native-community/netinfo';
import { isToday, isFuture, isPast, parseISO } from 'date-fns';
import { and, eq, desc } from 'drizzle-orm';
import { SkeletonCard } from '../../components/ui/Skeleton';
import { ActiveSearchBanner, SearchModal } from '../../components/ui/SearchModal';
import { FilterChipBar } from '../../components/ui/FilterChipBar';
import OfflineBanner from '../../components/appointments/OfflineBanner';
import AppointmentsHeader from '../../components/appointments/AppointmentsHeader';
import AppointmentsFilterBar, {
  type AppointmentFilterTab,
} from '../../components/appointments/AppointmentsFilterBar';
import UpcomingAppointmentCard from '../../components/appointments/UpcomingAppointmentCard';
import PastAppointmentCard from '../../components/appointments/PastAppointmentCard';
import EmptyAppointmentsView, {
  type SuggestedCareServiceItem,
} from '../../components/appointments/EmptyAppointmentsView';
import { useAppTheme } from '../../contexts/ThemeContext';
import { useClinicalEmpathyTheme } from '../../constants/clinicalEmpathy';
import { useRegisterHeaderSearch } from '../../contexts/HeaderSearchContext';
import { useBreakpoint } from '../../hooks/useBreakpoint';
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
import { queryPatientSearchCatalog } from '../../services/search/patientSearchService';

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

export default function AppointmentsScreenWeb() {
  const { colors, spacing, radii, shadows } = useAppTheme();
  const empathy = useClinicalEmpathyTheme();
  const navigation = useNavigation<any>();
  const patientId = usePatientId();
  const { getToken } = useClerkAuth();
  const { user } = useUser();
  const netInfo = useNetInfo();
  const { isDesktop, isCompact, width } = useBreakpoint();
  const isWorkstation = isDesktop || width >= 768;

  const [appointments, setAppointments] = useState<AppointmentItem[]>([]);
  const [drafts, setDrafts] = useState<DraftSummary[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isFromCache, setIsFromCache] = useState(false);
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

  // Load live suggested services catalog
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data } = await queryPatientSearchCatalog(getTokenRef.current, patientId);
        if (!active) return;

        const items: SuggestedCareServiceItem[] = [];

        // Add doctors / services from real catalog
        if (data.doctors && data.doctors.length > 0) {
          const doc = data.doctors[0];
          items.push({
            id: `doc-${doc.id}`,
            title: doc.specialty || 'General Consultation',
            subtitle: doc.name,
            detail: `${doc.clinicName} • Available`,
            badgeType: 'doctor',
            imageUrl: doc.avatarUrl,
            buttonLabel: 'Book Slot',
            buttonVariant: 'primary',
            onPress: () => {
              navigation.navigate('Main', {
                screen: 'BookingDraftScreen',
                params: { clinicId: doc.clinicId, providerId: doc.id },
              });
            },
          });
        }

        // Add quick teleconsult option if any clinic supports telehealth
        const teleClinic = data.clinics.find((c) => c.supportsAppointments) || data.clinics[0];
        if (teleClinic) {
          items.push({
            id: `tele-${teleClinic.id}`,
            title: 'Telehealth Quick Care',
            subtitle: 'Available in 15 mins',
            detail: `${teleClinic.name} • On-duty clinician ready`,
            badgeType: 'video',
            buttonLabel: 'Instant Connect',
            buttonVariant: 'mint',
            onPress: () => {
              navigation.navigate('Main', {
                screen: 'ClinicDetailsScreen',
                params: { clinicId: teleClinic.id, id: teleClinic.id },
              });
            },
          });
        }

        // Add wellness / routine checkup
        if (data.clinics.length > 1) {
          const wellnessClinic = data.clinics[1];
          items.push({
            id: `well-${wellnessClinic.id}`,
            title: 'Annual Wellness Checkup',
            subtitle: wellnessClinic.primarySpecialty || 'Preventative Health',
            detail: `Covered at ${wellnessClinic.name}`,
            badgeType: 'shield',
            buttonLabel: 'Explore Clinic',
            buttonVariant: 'outline',
            onPress: () => {
              navigation.navigate('Main', {
                screen: 'ClinicDetailsScreen',
                params: { clinicId: wellnessClinic.id, id: wellnessClinic.id },
              });
            },
          });
        }

        if (active) {
          setSuggestedServices(items);
        }
      } catch {
        // Keep empty if unable to query
      }
    })();
    return () => {
      active = false;
    };
  }, [patientId, navigation]);

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
        setIsFromCache(true);
        setIsLoading(false);
      }

      try {
        const live = await fetchAppointments(patientId, dbRef.current, getTokenRef.current);
        setAppointments(live.items);
        setIsFromCache(live.isFromCache);
      } catch {
        // Cache is already displayed
      } finally {
        setIsLoading(false);
        if (isManualRefresh) setIsRefreshing(false);
      }
    },
    [patientId, loadDrafts]
  );

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  // Filter appointments according to search query and active tab
  const filteredAppointments = useMemo(() => {
    let result = appointments;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (a) =>
          a.provider.name.toLowerCase().includes(q) ||
          a.clinic.name.toLowerCase().includes(q) ||
          (a.serviceType && a.serviceType.toLowerCase().includes(q)) ||
          (a.notes && a.notes.toLowerCase().includes(q))
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
    [filteredAppointments]
  );

  const pastList = useMemo(
    () => filteredAppointments.filter(isPastItem),
    [filteredAppointments]
  );

  const countUpcoming = useMemo(() => appointments.filter(isUpcoming).length, [appointments]);
  const countPast = useMemo(() => appointments.filter(isPastItem).length, [appointments]);

  const handleCardPress = (id: string) => {
    navigation.navigate('Main', {
      screen: 'AppointmentDetailScreen',
      params: { id, appointmentId: id },
    });
  };

  const handleGetDirections = (clinicName: string, clinicAddress?: string) => {
    const query = encodeURIComponent(`${clinicName} ${clinicAddress || ''}`);
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${query}`).catch(() => {});
  };

  const handleReschedule = (id: string) => {
    navigation.navigate('Main', {
      screen: 'RescheduleScreen',
      params: { appointmentId: id, id },
    });
  };

  const handlePrepGuide = (id: string) => {
    navigation.navigate('Main', {
      screen: 'AppointmentDetailScreen',
      params: { id, appointmentId: id },
    });
  };

  const handleBookAgain = (appt: AppointmentItem) => {
    navigation.navigate('Main', {
      screen: 'BookingDraftScreen',
      params: {
        clinicId: appt.clinic.id,
        providerId: appt.provider.id !== 'local-pending' ? appt.provider.id : undefined,
      },
    });
  };

  const isOffline = !netInfo.isConnected;

  return (
    <View style={[styles.root, { backgroundColor: empathy.colors.canvas }]}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          isWorkstation ? styles.workstationContent : styles.mobileContent,
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Top Header: Desktop hero row on workstations, compact header on mobile web */}
        {!isCompact && (
          <View style={styles.webHeroRow}>
            <View>
              <Text style={[empathy.typography.headlineLg, { color: empathy.colors.navyText }]}>
                Appointments & Visits
              </Text>
              <Text style={[empathy.typography.bodyMd, { color: empathy.colors.mutedText, marginTop: 4 }]}>
                Scheduled visits across open network
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Book a new appointment"
              onPress={() => navigation.navigate('Main', { screen: 'BookingDraftScreen' })}
              style={({ pressed }) => [
                styles.bookNewBtn,
                {
                  backgroundColor: empathy.colors.primaryDeep,
                  borderRadius: radii.full,
                  paddingHorizontal: spacing.lg,
                  paddingVertical: spacing.sm + 2,
                  opacity: pressed ? 0.9 : 1,
                },
              ]}
            >
              <Text
                style={[
                  empathy.typography.labelMd,
                  { color: empathy.colors.onPrimary, fontWeight: '700' },
                ]}
              >
                + Book New
              </Text>
            </Pressable>
          </View>
        )}

        {isCompact && (
          <AppointmentsHeader
            fullName={patientProfile.fullName}
            avatarUrl={patientProfile.avatarUrl}
            unreadCount={unreadNotificationsCount}
            showBrand={true}
            onNotificationsPress={() =>
              navigation.navigate('Main', { screen: 'NotificationsScreen' })
            }
            onAvatarPress={() =>
              navigation.navigate('Main', { screen: 'ProfileScreen' })
            }
            onBookNewPress={() =>
              navigation.navigate('Main', { screen: 'BookingDraftScreen' })
            }
            onBrandPress={() =>
              navigation.navigate('Main', { screen: 'HomeScreen' })
            }
          />
        )}

        {/* Search & Filter Bar */}
        <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
          <AppointmentsFilterBar
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onFilterSlidersPress={openSearchDialog}
            hideTabs={true}
          />
          <FilterChipBar
            items={[
              { key: 'all', label: 'All', count: appointments.length },
              { key: 'upcoming', label: 'Upcoming', count: countUpcoming },
              { key: 'past', label: 'Past', count: countPast },
              { key: 'waitlist', label: 'Waitlist', count: drafts.length > 0 ? drafts.length : undefined },
            ]}
            selectedKey={activeTab}
            onSelect={(key) => setActiveTab(key as AppointmentFilterTab)}
            showZeroCount={true}
          />
        </View>

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
          /* Drafts / Waitlist Tab */
          <View style={{ marginTop: spacing.lg }}>
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
                    {
                      color: empathy.colors.mutedText,
                      letterSpacing: 0.8,
                      fontWeight: '700',
                    },
                  ]}
                >
                  Draft Bookings & Waitlist
                </Text>
              </View>
              <Text style={[empathy.typography.bodySm, { color: empathy.colors.mutedText }]}>
                {drafts.length} {drafts.length === 1 ? 'Draft' : 'Drafts'}
              </Text>
            </View>

            {drafts.length === 0 ? (
              <View style={{ marginTop: spacing.md }}>
                <EmptyAppointmentsView
                  onFindDoctorPress={() =>
                    navigation.navigate('Main', { screen: 'BookingDraftScreen' })
                  }
                  onQuickConnectPress={() =>
                    navigation.navigate('Main', { screen: 'BookingDraftScreen' })
                  }
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
                      navigation.navigate('Main', {
                        screen: 'BookingDraftScreen',
                        params: { draftId: d.id, clinicId: d.clinicId },
                      })
                    }
                    style={({ pressed }) => [
                      styles.draftCard,
                      {
                        backgroundColor: empathy.colors.surface,
                        borderColor: empathy.colors.border,
                        borderRadius: radii.xl,
                        padding: spacing.md,
                        opacity: pressed ? 0.95 : 1,
                      },
                      shadows.sm,
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
                        { color: empathy.colors.mutedText, marginTop: 4 },
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
          /* Empty State Screen */
          <View style={{ marginTop: spacing.xl }}>
            <EmptyAppointmentsView
              onFindDoctorPress={() =>
                navigation.navigate('Main', { screen: 'BookingDraftScreen' })
              }
              onQuickConnectPress={() =>
                navigation.navigate('Main', { screen: 'BookingDraftScreen' })
              }
              suggestedServices={suggestedServices}
            />
          </View>
        ) : (
          /* Populated Appointments View */
          <View style={{ marginTop: spacing.lg, gap: spacing.xl }}>
            {/* UPCOMING VISITS SECTION */}
            {upcomingList.length > 0 ? (
              <View>
                <View style={styles.sectionHeaderRow}>
                  <View style={styles.sectionTitleWithDot}>
                    <View
                      style={[
                        styles.sectionDot,
                        {
                          backgroundColor: empathy.colors.primaryDeep,
                          borderRadius: radii.full,
                        },
                      ]}
                    />
                    <Text
                      style={[
                        empathy.typography.overline,
                        {
                          color: empathy.colors.mutedText,
                          letterSpacing: 0.8,
                          fontWeight: '700',
                        },
                      ]}
                    >
                      Upcoming Visits
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.countBadge,
                      {
                        backgroundColor: empathy.colors.mintSoftBg,
                        borderRadius: radii.full,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        empathy.typography.labelSm,
                        {
                          color: empathy.colors.primaryDeep,
                          fontWeight: '700',
                        },
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
                      onPrepGuidePress={() => handlePrepGuide(item.id)}
                      onReschedulePress={() => handleReschedule(item.id)}
                    />
                  ))}
                </View>
              </View>
            ) : null}

            {/* PAST CONSULTATIONS SECTION */}
            {pastList.length > 0 ? (
              <View>
                <View style={styles.sectionHeaderRow}>
                  <View style={styles.sectionTitleWithDot}>
                    <View
                      style={[
                        styles.sectionDot,
                        {
                          backgroundColor: empathy.colors.mutedText,
                          borderRadius: radii.full,
                        },
                      ]}
                    />
                    <Text
                      style={[
                        empathy.typography.overline,
                        {
                          color: empathy.colors.mutedText,
                          letterSpacing: 0.8,
                          fontWeight: '700',
                        },
                      ]}
                    >
                      Past Consultations
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
      </ScrollView>

      {/* Floating Offline Banner */}
      {isOffline ? (
        <View style={styles.offlineBannerWrap}>
          <OfflineBanner />
        </View>
      ) : null}

      {/* Search Modal for compatibility with regression suite */}
      <SearchModal
        visible={isSearchModalOpen}
        value={searchQuery}
        onClose={() => setIsSearchModalOpen(false)}
        onApply={(keyword) => {
          setSearchQuery(keyword);
          setIsSearchModalOpen(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    width: '100%',
  },
  scrollContent: {
    paddingBottom: 48,
  },
  mobileContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  workstationContent: {
    maxWidth: 1120,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 32,
    paddingTop: 24,
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
    width: 7,
    height: 7,
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
  offlineBannerWrap: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
    alignItems: 'center',
  },
  webHeroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  bookNewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

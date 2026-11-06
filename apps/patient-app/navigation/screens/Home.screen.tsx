import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Linking,
  Platform,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useUser } from '@clerk/expo';
import { desc, eq } from 'drizzle-orm';
import { differenceInCalendarDays, parseISO } from 'date-fns';
import { useAuth } from '../../contexts/AuthContext';
import { useNotificationContext } from '../../contexts/NotificationContext';
import { useContentInsets } from '../../hooks/useContentInsets';
import { usePatientId } from '../../hooks/usePatientId';
import { useNetworkOnline } from '../../hooks/useNetworkOnline';
import { SkeletonCard } from '../../components/ui/Skeleton';
import { SectionHeader } from '../../components/ui/Primitives';
import AfterVisitSummaryCard from '../../components/records/AfterVisitSummaryCard';
import HomeHeader from '../../components/home/HomeHeader';
import HomeSearchBar from '../../components/home/HomeSearchBar';
import HealthPassCard from '../../components/home/HealthPassCard';
import WelcomeChecklistBanner from '../../components/home/WelcomeChecklistBanner';
import QuickActionsGrid, { type QuickActionKey } from '../../components/home/QuickActionsGrid';
import AppointmentCarouselSection from '../../components/home/AppointmentCarouselSection';
import RecentVitalsGrid from '../../components/home/RecentVitalsGrid';
import LogVitalsModal from '../../components/home/LogVitalsModal';
import TodayScheduleSection from '../../components/home/TodayScheduleSection';
import DailyMindfulMomentCard from '../../components/home/DailyMindfulMomentCard';
import HomeOfflinePillBanner from '../../components/home/HomeOfflinePillBanner';
import { useClinicalEmpathyTheme } from '../../constants/clinicalEmpathy';
import { db } from '../../db/index';
import { consultations, type Consultation } from '../../db/schema/consultations';
import { vitalSigns, type VitalSign } from '../../db/schema/vitalSigns';
import {
  checkInPatientAppointment,
  fetchAndCacheHomeDashboard,
  loadLocalHomeDashboardSnapshot,
  logMedicationDose,
  logPatientVitals,
  markWelcomeStepVisited,
} from '../../services/home/homeDashboardService';
import type {
  HomeAppointmentCardDto,
  LogPatientVitalsRequestDto,
  PatientHomeDashboardDto,
  TodayMedicationScheduleItemDto,
  WelcomeStepKey,
} from '../../services/api/homeApi';
import type { PatientSearchRouteParams } from './Search.screen';

export default function HomeScreen() {
  const { colors, spacing } = useClinicalEmpathyTheme();
  const navigation = useNavigation<any>();
  const { getToken } = useAuth();
  const { user } = useUser();
  const patientId = usePatientId();
  const { unreadCount } = useNotificationContext();
  const { isOnline } = useNetworkOnline();
  const contentInsets = useContentInsets();

  const scrollY = useRef(new Animated.Value(0)).current;

  const [dashboard, setDashboard] = useState<PatientHomeDashboardDto | null>(null);
  const [recentConsultation, setRecentConsultation] = useState<Consultation | null>(null);
  const [recentVitalsRow, setRecentVitalsRow] = useState<VitalSign | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [vitalsModalVisible, setVitalsModalVisible] = useState<boolean>(false);
  const [isSavingVitals, setIsSavingVitals] = useState<boolean>(false);
  const [checkingInId, setCheckingInId] = useState<string | null>(null);
  const [loggingMedicationId, setLoggingMedicationId] = useState<string | null>(null);

  const fallbackUser = useMemo(
    () => ({
      firstName: user?.firstName,
      lastName: user?.lastName,
      fullName: user?.fullName,
      imageUrl: user?.imageUrl,
    }),
    [user?.firstName, user?.fullName, user?.imageUrl, user?.lastName],
  );

  const loadDashboard = useCallback(
    async (showPullSpinner = false) => {
      if (showPullSpinner) {
        setIsRefreshing(true);
      }

      try {
        const localSnapshot = await loadLocalHomeDashboardSnapshot(patientId, fallbackUser);
        setDashboard((prev) => prev ?? localSnapshot);

        if (patientId) {
          const [cList, vList] = await Promise.all([
            db
              .select()
              .from(consultations)
              .where(eq(consultations.patientId, patientId))
              .orderBy(desc(consultations.visitDate))
              .limit(1),
            db
              .select()
              .from(vitalSigns)
              .where(eq(vitalSigns.patientId, patientId))
              .orderBy(desc(vitalSigns.measuredAt))
              .limit(1),
          ]);

          const latestConsult = cList[0] ?? null;
          if (latestConsult && latestConsult.visitDate) {
            try {
              const diff = differenceInCalendarDays(new Date(), parseISO(latestConsult.visitDate));
              if (diff >= 0 && diff <= 7) {
                setRecentConsultation(latestConsult);
                setRecentVitalsRow(vList[0] ?? null);
              } else {
                setRecentConsultation(null);
              }
            } catch {
              setRecentConsultation(null);
            }
          } else {
            setRecentConsultation(null);
          }

          const { data: liveData } = await fetchAndCacheHomeDashboard(
            getToken,
            patientId,
            fallbackUser,
          );
          setDashboard(liveData);
        }
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [fallbackUser, getToken, patientId],
  );

  useEffect(() => {
    void loadDashboard(false);
    const unsub = navigation.addListener('focus', () => {
      void loadDashboard(false);
    });
    return () => {
      unsub();
    };
  }, [loadDashboard, navigation]);

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

  const openSearchScreen = useCallback(
    (params?: PatientSearchRouteParams) => {
      navigation.navigate('PatientSearch', params ?? {});
    },
    [navigation],
  );

  const handleWelcomeStepPress = useCallback(
    async (stepKey: WelcomeStepKey) => {
      if (patientId) {
        const updatedChecklist = await markWelcomeStepVisited(getToken, patientId, stepKey);
        setDashboard((prev) =>
          prev ? { ...prev, welcomeChecklist: updatedChecklist } : prev,
        );
      }

      if (stepKey === 'health_profile') {
        navigateToMainRoute('PersonalDemographicsScreen');
      } else if (stepKey === 'link_insurance') {
        navigateToMainRoute('GovernmentIdsScreen');
      } else if (stepKey === 'primary_clinic') {
        navigateToMainRoute('ExploreClinicsScreen');
      }
    },
    [getToken, navigateToMainRoute, patientId],
  );

  const handleQuickAction = useCallback(
    (action: QuickActionKey) => {
      switch (action) {
        case 'reach_dr':
          navigateToTab('MessagesScreen');
          break;
        case 'services':
          openSearchScreen({ category: 'services' });
          break;
        case 'records':
          navigateToTab('RecordsScreen');
          break;
        case 'prescriptions':
          navigateToMainRoute('PrescriptionsScreen');
          break;
      }
    },
    [navigateToMainRoute, navigateToTab, openSearchScreen],
  );

  const handleCheckIn = useCallback(
    async (item: HomeAppointmentCardDto) => {
      if (!patientId) return;
      setCheckingInId(item.id);
      try {
        const ack = await checkInPatientAppointment(getToken, patientId, item.id);
        setDashboard((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            appointments: {
              ...prev.appointments,
              upcomingItems: prev.appointments.upcomingItems.map((appt) =>
                appt.id === item.id
                  ? { ...appt, isCheckedIn: true, checkedInAt: ack.checkedInAt }
                  : appt,
              ),
            },
          };
        });
        navigateToMainRoute('AppointmentDetailScreen', {
          appointmentId: item.id,
          id: item.id,
        });
      } finally {
        setCheckingInId(null);
      }
    },
    [getToken, navigateToMainRoute, patientId],
  );

  const handleDirections = useCallback(
    async (item: HomeAppointmentCardDto) => {
      const destination = encodeURIComponent(
        [item.clinicName, item.clinicAddress].filter(Boolean).join(', '),
      );
      const mapUrl = Platform.select({
        ios: `http://maps.apple.com/?q=${destination}`,
        android: `geo:0,0?q=${destination}`,
        default: `https://www.google.com/maps/search/?api=1&query=${destination}`,
      });
      if (mapUrl) {
        const supported = await Linking.canOpenURL(mapUrl).catch(() => false);
        if (supported) {
          await Linking.openURL(mapUrl);
          return;
        }
      }
      navigateToMainRoute('ClinicDetailsScreen', {
        clinicId: item.clinicId,
        id: item.clinicId,
      });
    },
    [navigateToMainRoute],
  );

  const handleSaveVitals = useCallback(
    async (payload: LogPatientVitalsRequestDto) => {
      if (!patientId) return;
      setIsSavingVitals(true);
      try {
        await logPatientVitals(getToken, patientId, payload);
        setVitalsModalVisible(false);
        await loadDashboard(false);
      } finally {
        setIsSavingVitals(false);
      }
    },
    [getToken, loadDashboard, patientId],
  );

  const handleLogMedication = useCallback(
    async (item: TodayMedicationScheduleItemDto) => {
      if (!patientId) return;
      setLoggingMedicationId(item.medicationId);
      try {
        const updatedItem = await logMedicationDose(getToken, patientId, item.medicationId, {
          scheduledTimeLabel: item.scheduledTimeLabel,
        });
        if (updatedItem) {
          setDashboard((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              todaySchedule: {
                ...prev.todaySchedule,
                items: prev.todaySchedule.items.map((m) =>
                  m.medicationId === item.medicationId ? updatedItem : m,
                ),
              },
            };
          });
        } else {
          await loadDashboard(false);
        }
      } finally {
        setLoggingMedicationId(null);
      }
    },
    [getToken, loadDashboard, patientId],
  );

  const headerTitle = useMemo(() => {
    const first = dashboard?.healthPass.firstName ?? user?.firstName ?? 'Patient';
    return `Hi, ${first}`;
  }, [dashboard?.healthPass.firstName, user?.firstName]);

  const headerSubtitle = useMemo(() => {
    if (dashboard?.healthPass.clinicEzId) {
      return `Health Pass • ${dashboard.healthPass.clinicEzId}`;
    }
    return 'Clinic EZ Care Overview';
  }, [dashboard?.healthPass.clinicEzId]);

  const effectiveUnreadCount = Math.max(
    unreadCount,
    dashboard?.healthPass.unreadNotificationsCount ?? 0,
  );

  return (
    <SafeAreaView
      edges={['top']}
      style={[styles.safeRoot, { backgroundColor: colors.canvas }]}
    >
      <HomeHeader
        scrollY={scrollY}
        title={headerTitle}
        subtitle={headerSubtitle}
        fullName={dashboard?.healthPass.fullName ?? user?.fullName ?? 'Patient'}
        avatarUrl={dashboard?.healthPass.avatarUrl ?? user?.imageUrl ?? null}
        unreadCount={effectiveUnreadCount}
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
            onRefresh={() => void loadDashboard(true)}
            tintColor={colors.primary}
          />
        }
        contentContainerStyle={[
          styles.contentContainer,
          {
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.xs,
            paddingBottom: Math.max(contentInsets.bottom, 24) + (isOnline ? 28 : 76),
            gap: spacing.xl,
          },
        ]}
      >
        <HomeSearchBar
          onPressSearch={() => openSearchScreen({ autoFocus: true })}
          onPressVoice={() => openSearchScreen({ autoFocus: true, voicePrompt: true })}
          onPressFilter={() => openSearchScreen({ openFilters: true })}
        />

        {isLoading && !dashboard ? (
          <View style={{ gap: spacing.base }}>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </View>
        ) : dashboard ? (
          <>
            <HealthPassCard
              healthPass={dashboard.healthPass}
              onViewCardPress={() => navigateToMainRoute('ShareRecordsScreen')}
            />

            <WelcomeChecklistBanner
              checklist={dashboard.welcomeChecklist}
              onStepPress={(stepKey) => void handleWelcomeStepPress(stepKey)}
            />

            <QuickActionsGrid
              onSelectAction={handleQuickAction}
              onSelfServicePress={() => openSearchScreen({ category: 'all' })}
            />

            <AppointmentCarouselSection
              section={dashboard.appointments}
              checkingInId={checkingInId}
              onBookAppointmentPress={() => navigateToMainRoute('BookingDraftScreen')}
              onExploreClinicsPress={() => navigateToMainRoute('ExploreClinicsScreen')}
              onViewAllPress={() => navigateToTab('AppointmentsScreen')}
              onViewHistoryPress={() => navigateToTab('AppointmentsScreen')}
              onAppointmentPress={(item) =>
                navigateToMainRoute('AppointmentDetailScreen', {
                  appointmentId: item.id,
                  id: item.id,
                })
              }
              onCheckInPress={(item) => void handleCheckIn(item)}
              onDirectionsPress={(item) => void handleDirections(item)}
            />

            {/* 7-Day Pinned After-Visit Summary (AVS) Card */}
            {recentConsultation ? (
              <View style={{ gap: spacing.md }}>
                <SectionHeader title="Recent Visit Summary" />
                <AfterVisitSummaryCard
                  consultation={recentConsultation}
                  vitals={recentVitalsRow}
                  isPinned={true}
                  onBookFollowUp={() => navigateToMainRoute('BookingDraftScreen')}
                  onMessageClinic={() => navigateToTab('MessagesScreen')}
                />
              </View>
            ) : null}

            <RecentVitalsGrid
              vitals={dashboard.recentVitals}
              onHistoryPress={() => navigateToMainRoute('VitalSignsScreen')}
              onConnectOrLogPress={() => setVitalsModalVisible(true)}
            />

            <TodayScheduleSection
              schedule={dashboard.todaySchedule}
              loggingMedicationId={loggingMedicationId}
              onAddOrManagePress={() => navigateToMainRoute('MedicationsScreen')}
              onLogMedicationPress={(item) => void handleLogMedication(item)}
            />

            <DailyMindfulMomentCard moment={dashboard.mindfulMoment} />
          </>
        ) : null}
      </Animated.ScrollView>

      <LogVitalsModal
        visible={vitalsModalVisible}
        isSubmitting={isSavingVitals}
        onClose={() => setVitalsModalVisible(false)}
        onSubmit={handleSaveVitals}
      />

      <HomeOfflinePillBanner isOnline={isOnline} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeRoot: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  contentContainer: {
    width: '100%',
  },
});

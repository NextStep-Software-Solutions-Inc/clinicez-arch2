import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useUser } from '@clerk/expo';
import ThemedText from '../../components/ui/ThemedText';
import ThemedView from '../../components/ui/ThemedView';
import ClinicEzLogo from '../../components/ui/ClinicEzLogo';
import { AppIcon } from '../../components/ui/Icon';
import { useAppTheme } from '../../contexts/ThemeContext';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { usePatientId } from '../../hooks/usePatientId';
import { useAuth } from '../../contexts/AuthContext';
import { useNotificationContext } from '../../contexts/NotificationContext';
import { desc, eq } from 'drizzle-orm';
import { differenceInCalendarDays, format, parseISO } from 'date-fns';
import { getHomeDashboard, listClinics } from '../../services/discovery/discoveryService';
import type { ClinicDetail, HomeDashboard } from '../../services/discovery/types';
import {
  fetchAppointments,
  type AppointmentItem,
} from '../../services/appointments/appointmentsService';
import {
  getPatientMedications,
  getPatientVitals,
  logPatientMedication,
} from '../../services/api/patientApi';
import { db } from '../../db/index';
import { consultations, type Consultation } from '../../db/schema/consultations';
import { vitalSigns, type VitalSign } from '../../db/schema/vitalSigns';
import AfterVisitSummaryCard from '../../components/records/AfterVisitSummaryCard';
import {
  AppointmentsSection,
  DailyMindfulMoment,
  type DisplayAppointment,
  HeaderScrollTitle,
  HealthPassCard,
  HealthPassQrModal,
  HomeOfflinePill,
  MedicationsSchedule,
  type MedicationScheduleItem,
  QuickActionsGrid,
  type SearchFilterType,
  SearchResultsView,
  VitalsBentoGrid,
  WelcomeOnboardingCard,
} from '../../components/home';

/**
 * Clinic EZ Patient App - Responsive Web Home Screen
 *
 * Implements 1:1 Google Stitch specification:
 * - Desktop View (>= 1024px): Two-column clinical workstation rail
 * - Mobile / Compact View (< 1024px): Single fluid vertical flow matching native
 * - 4 Unified States: First Login, No Appointments, Multiple Appointments, and Search Mode
 */
export default function HomeScreenWeb() {
  const { colors, spacing, radii, shadows, sizes } = useAppTheme();
  const navigation = useNavigation<any>();
  const { user } = useUser();
  const { getToken } = useAuth();
  const patientId = usePatientId();
  const { isDesktop } = useBreakpoint();
  const { unreadCount } = useNotificationContext();

  // Scroll tracking for animated sticky header title & subtitle
  const scrollY = useRef(new Animated.Value(0)).current;
  const [isScrolled, setIsScrolled] = useState(false);

  // Dynamic clinical state from patient-api & SQLite cache
  const [dashboard, setDashboard] = useState<HomeDashboard | null>(null);
  const [liveAppointments, setLiveAppointments] = useState<AppointmentItem[]>([]);
  const [recentConsultation, setRecentConsultation] = useState<Consultation | null>(null);
  const [recentVitals, setRecentVitals] = useState<VitalSign | null>(null);
  const [medications, setMedications] = useState<MedicationScheduleItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [isListeningVoice, setIsListeningVoice] = useState(false);
  const [searchResultsClinics, setSearchResultsClinics] = useState<ClinicDetail[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<SearchFilterType>('all');

  // Modals
  const [showQrModal, setShowQrModal] = useState(false);

  // Load clinical dashboard & telemetry
  const loadData = useCallback(async () => {
    try {
      // 1. Dashboard summary
      const dash = await getHomeDashboard(patientId);
      setDashboard(dash);

      if (patientId) {
        // 2. Telemetry vitals from patient-api with local SQLite fallback
        let currentVitals: VitalSign | null = null;
        try {
          const liveVitals = await getPatientVitals(getToken, patientId, 1);
          if (liveVitals && liveVitals.length > 0) {
            const v = liveVitals[0];
            currentVitals = {
              id: v.id,
              patientId: v.patientId,
              measuredAt: v.recordedAt ?? v.createdAt ?? new Date().toISOString(),
              heartRateBpm: v.heartRateBpm ?? null,
              bpSystolic: v.systolicBp ?? null,
              bpDiastolic: v.diastolicBp ?? null,
              fastingBloodGlucose: v.fastingBloodGlucose ? String(v.fastingBloodGlucose) : null,
              spO2Percent: v.oxygenSaturationPercent ? String(v.oxygenSaturationPercent) : null,
              temperatureCelsius: v.temperatureCelsius ? String(v.temperatureCelsius) : null,
              respiratoryRateBreathsPerMin: v.respiratoryRateBreathsPerMin ?? null,
              weightKg: v.weightKg ? String(v.weightKg) : null,
              heightCm: v.heightCm ? String(v.heightCm) : null,
              bmi: v.bmi ? String(v.bmi) : null,
              syncedAt: new Date().toISOString(),
            } as unknown as VitalSign;
          }
        } catch {
          // Fall through to SQLite cache
        }

        if (!currentVitals) {
          const localVList = await db
            .select()
            .from(vitalSigns)
            .where(eq(vitalSigns.patientId, patientId))
            .orderBy(desc(vitalSigns.measuredAt))
            .limit(1);
          currentVitals = localVList[0] ?? null;
        }
        setRecentVitals(currentVitals);

        // 3. Today's medications from patient-api
        try {
          const liveMeds = await getPatientMedications(getToken, patientId);
          if (liveMeds && liveMeds.length > 0) {
            const mappedMeds: MedicationScheduleItem[] = liveMeds.map((m) => ({
              id: m.id,
              name: m.medicationName,
              dosage: m.dosage ?? '',
              instruction: `${m.frequency ?? 'Daily'}${m.purpose ? ` • ${m.purpose}` : ''}`,
              isTaken: false,
            }));
            setMedications(mappedMeds);
          } else {
            setMedications([]);
          }
        } catch {
          setMedications([]);
        }

        // 4. Appointments via appointmentsService
        try {
          const aptRes = await fetchAppointments(patientId, db, getToken);
          if (aptRes.items) {
            setLiveAppointments(aptRes.items);
          }
        } catch {
          // Non-blocking appointments fallback
        }

        // 5. Recent Consultation within 7 days
        try {
          const cList = await db
            .select()
            .from(consultations)
            .where(eq(consultations.patientId, patientId))
            .orderBy(desc(consultations.visitDate))
            .limit(1);
          const c = cList[0] ?? null;
          if (c && c.visitDate) {
            const diff = differenceInCalendarDays(new Date(), parseISO(c.visitDate));
            if (diff >= 0 && diff <= 7) {
              setRecentConsultation(c);
            } else {
              setRecentConsultation(null);
            }
          } else {
            setRecentConsultation(null);
          }
        } catch {
          setRecentConsultation(null);
        }
      }
    } catch (err) {
      console.warn('Unable to load web home dashboard:', err);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [patientId, getToken]);

  useEffect(() => {
    setIsLoading(true);
    void loadData();
    const unsub = navigation.addListener('focus', () => {
      void loadData();
    });
    return () => unsub();
  }, [loadData, navigation]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void loadData();
  }, [loadData]);

  // Search query execution
  useEffect(() => {
    let active = true;
    const query = searchQuery.trim();
    if (!query) {
      setSearchResultsClinics([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const delayTimer = setTimeout(() => {
      listClinics(patientId, { query }, getToken)
        .then((clinics) => {
          if (active) {
            setSearchResultsClinics(clinics);
            setIsSearching(false);
          }
        })
        .catch(() => {
          if (active) {
            setSearchResultsClinics([]);
            setIsSearching(false);
          }
        });
    }, 250);

    return () => {
      active = false;
      clearTimeout(delayTimer);
    };
  }, [searchQuery, patientId, getToken]);

  // Voice Search interactive simulation
  const handleVoiceSearch = () => {
    setIsListeningVoice(true);
    setTimeout(() => {
      setIsListeningVoice(false);
    }, 3000);
  };

  // Resolved Patient Identity
  const patientFullName = useMemo(() => {
    if (dashboard?.greetingName) return dashboard.greetingName;
    if (user?.firstName) {
      return `${user.firstName} ${user.lastName || ''}`.trim();
    }
    return 'Sarah Jenkins';
  }, [dashboard, user]);

  const patientInitials = useMemo(() => {
    const first = user?.firstName?.[0] ?? '';
    const last = user?.lastName?.[0] ?? '';
    const combined = (first + last).toUpperCase();
    return combined || 'SJ';
  }, [user]);

  const patientIdCode = useMemo(() => {
    if (patientId) {
      const clean = patientId.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
      return clean.length >= 8 ? `PC-${clean.slice(0, 4)}-${clean.slice(4, 8)}` : `PC-${clean}`;
    }
    return 'PC-8942-01';
  }, [patientId]);

  // Map appointments to DisplayAppointment
  const displayAppointments: DisplayAppointment[] = useMemo(() => {
    if (liveAppointments.length > 0) {
      return liveAppointments
        .filter((a) => a.status !== 'canceled')
        .map((item, idx) => {
          const isFirst = idx === 0;
          let timeLabel = 'Scheduled';
          try {
            const d = parseISO(item.scheduledAt);
            timeLabel = format(d, 'EEE, MMM d • h:mm a');
          } catch {
            timeLabel = item.scheduledAt;
          }

          const badgeLabel =
            item.status === 'confirmed'
              ? 'Confirmed'
              : item.status === 'pending'
                ? 'Pending'
                : 'Scheduled';
          const badgeTone =
            item.status === 'confirmed'
              ? 'success'
              : item.status === 'action_required'
                ? 'warning'
                : 'primary';

          return {
            id: item.id,
            clinicId: item.clinic.id,
            clinicName: item.clinic.name,
            doctorName: item.provider.name,
            specialty: item.provider.specialty || item.serviceType || 'General Consultation',
            timeLabel,
            badgeLabel,
            badgeTone,
            isCheckInEligible: isFirst && item.status === 'confirmed',
          };
        });
    }

    const rawItems = dashboard?.nextAppointments ?? [];
    return rawItems.map((item, idx) => ({
      id: item.id,
      clinicId: item.clinicId,
      clinicName: item.subtitle || 'Network Clinic',
      doctorName: item.title || 'Healthcare Provider',
      specialty: 'Consultation',
      timeLabel: `${item.dateLabel} • ${item.timeLabel}`,
      badgeLabel: item.status === 'draft' ? 'Draft' : 'Confirmed',
      badgeTone: item.status === 'draft' ? 'warning' : 'primary',
      isCheckInEligible: idx === 0 && item.status !== 'draft',
    }));
  }, [liveAppointments, dashboard?.nextAppointments]);

  // Determine whether patient is in State 1 (First Login / Zero Data)
  const isFirstLogin = useMemo(() => {
    const noAppointments = displayAppointments.length === 0;
    const noVitals =
      !recentVitals || (recentVitals.heartRateBpm == null && recentVitals.bpSystolic == null);
    const noMeds = medications.length === 0;
    return noAppointments && noVitals && noMeds;
  }, [displayAppointments.length, recentVitals, medications.length]);

  // Medication adherence dose
  const handleToggleMedication = async (medId: string) => {
    setMedications((prev) =>
      prev.map((item) => (item.id === medId ? { ...item, isTaken: true } : item)),
    );
    if (patientId) {
      try {
        await logPatientMedication(getToken, patientId, medId, {
          takenAt: new Date().toISOString(),
        });
      } catch (err) {
        console.warn('Failed to record medication adherence:', err);
      }
    }
  };

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetY = event.nativeEvent.contentOffset.y;
    const nextScrolled = offsetY > 16;
    if (nextScrolled !== isScrolled) {
      setIsScrolled(nextScrolled);
    }
  };

  const isSearchActive = searchQuery.trim().length > 0;

  return (
    <ThemedView style={styles.screenWrapper}>
      {/* Sticky App Header with Animated Title & Subtitle Micro-interaction */}
      <View
        style={[
          styles.appHeader,
          {
            paddingTop: spacing.md,
            paddingHorizontal: isDesktop ? spacing['2xl'] : spacing.lg,
            backgroundColor: isScrolled ? colors.surface : colors.background,
            borderBottomColor: isScrolled ? colors.borderLight : colors.transparent,
          },
          isScrolled ? shadows.sm : shadows.none,
        ]}
      >
        <View style={styles.headerLeft}>
          <ClinicEzLogo size={36} showWordmark={false} />
          <HeaderScrollTitle scrollY={scrollY} />
        </View>

        <View style={styles.headerRight}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Notifications"
            onPress={() => navigation.navigate('Main', { screen: 'NotificationScreen' })}
            style={({ pressed }) => [
              styles.headerIconButton,
              {
                backgroundColor: colors.surfaceSubtle,
                borderRadius: radii.full,
                opacity: pressed ? 0.75 : 1,
              },
            ]}
          >
            <AppIcon name="notifications" size={sizes.iconMd} color="text" />
            {unreadCount > 0 ? (
              <View
                style={[
                  styles.unreadBadge,
                  {
                    backgroundColor: colors.primary,
                    borderRadius: radii.full,
                  },
                ]}
              />
            ) : null}
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Profile settings"
            onPress={() =>
              navigation.navigate('Main', {
                screen: 'BottomTabs',
                params: { screen: 'ProfileScreen' },
              })
            }
            style={({ pressed }) => [
              styles.avatarButton,
              {
                backgroundColor: colors.primaryLight,
                borderColor: colors.primaryBorder,
                borderRadius: radii.full,
                borderWidth: sizes.borderWidth,
                opacity: pressed ? 0.8 : 1,
              },
            ]}
          >
            <ThemedText variant="captionBold" color="primaryText">
              {patientInitials}
            </ThemedText>
          </Pressable>
        </View>
      </View>

      {/* Main Home Scroll View */}
      <ScrollView
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          {
            useNativeDriver: false,
            listener: handleScroll,
          },
        )}
        scrollEventThrottle={16}
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        contentContainerStyle={[
          styles.container,
          {
            paddingHorizontal: isDesktop ? spacing['2xl'] : spacing.md,
            paddingBottom: spacing['3xl'],
          },
        ]}
      >
        {/* Interactive Search Bar (Stitch Specification) */}
        <View style={styles.searchBarWrapper}>
          <View
            style={[
              styles.searchBarContainer,
              {
                backgroundColor: colors.surface,
                borderColor: isSearchActive ? colors.primary : colors.borderLight,
                borderRadius: radii.full,
                borderWidth: sizes.borderWidth,
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.xs,
              },
              shadows.sm,
            ]}
          >
            <AppIcon name="search" size={sizes.iconMd} color="primary" />
            <TextInput
              style={[styles.searchInput, { color: colors.text }]}
              placeholder={
                isListeningVoice
                  ? 'Listening for clinics or doctors...'
                  : 'Search clinics, doctors, or symptoms...'
              }
              placeholderTextColor={colors.textLight}
              value={searchQuery}
              onChangeText={setSearchQuery}
              returnKeyType="search"
            />
            {searchQuery.length > 0 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Clear search"
                onPress={() => setSearchQuery('')}
                style={styles.searchActionBtn}
              >
                <AppIcon name="close" size={sizes.iconSm} color="textMuted" />
              </Pressable>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Voice search"
                onPress={handleVoiceSearch}
                style={styles.searchActionBtn}
              >
                <AppIcon
                  name="mic"
                  size={sizes.iconSm}
                  color={isListeningVoice ? 'primary' : 'textSecondary'}
                />
              </Pressable>
            )}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Filter search"
              onPress={() => navigation.navigate('Main', { screen: 'ExploreClinicsScreen' })}
              style={styles.searchActionBtn}
            >
              <AppIcon name="filter" size={sizes.iconSm} color="textSecondary" />
            </Pressable>
          </View>
        </View>

        {/* State 4: Active Search Results Mode */}
        {isSearchActive ? (
          <SearchResultsView
            query={searchQuery}
            clinics={searchResultsClinics}
            isLoading={isSearching}
            selectedFilter={selectedFilter}
            onSelectFilter={setSelectedFilter}
            onBookDoctor={(_doctorId, clinicId) => {
              if (clinicId) {
                navigation.navigate('Main', {
                  screen: 'ClinicDetailsScreen',
                  params: { clinicId } as any,
                });
              } else {
                navigation.navigate('Main', { screen: 'BookingDraftScreen' });
              }
            }}
            onViewClinic={(clinicId) => {
              navigation.navigate('Main', {
                screen: 'ClinicDetailsScreen',
                params: { clinicId } as any,
              });
            }}
            onSchedulePackage={(_serviceId, clinicId) => {
              if (clinicId) {
                navigation.navigate('Main', {
                  screen: 'ClinicDetailsScreen',
                  params: { clinicId } as any,
                });
              } else {
                navigation.navigate('Main', { screen: 'ExploreClinicsScreen' });
              }
            }}
            onSeeAllClinics={() => navigation.navigate('Main', { screen: 'ExploreClinicsScreen' })}
            onSeeAllDoctors={() => navigation.navigate('Main', { screen: 'ExploreClinicsScreen' })}
            onSeeAllPackages={() => navigation.navigate('Main', { screen: 'ExploreClinicsScreen' })}
          />
        ) : isDesktop ? (
          /* Desktop Two-Column Workstation Layout */
          <View style={[styles.desktopColumns, { gap: spacing['2xl'] }]}>
            {/* Left Column: Health Pass, Onboarding, Quick Actions, Appointments */}
            <View style={[styles.mainColDesktop, { gap: spacing.lg }]}>
              <HealthPassCard
                patientFullName={patientFullName}
                patientIdCode={patientIdCode}
                onOpenQrModal={() => setShowQrModal(true)}
              />

              {isFirstLogin ? (
                <WelcomeOnboardingCard
                  onCompleteProfile={() =>
                    navigation.navigate('Main', {
                      screen: 'BottomTabs',
                      params: { screen: 'ProfileScreen' },
                    })
                  }
                  onLinkInsurance={() =>
                    navigation.navigate('Main', { screen: 'GovernmentIdsScreen' })
                  }
                  onFindClinic={() =>
                    navigation.navigate('Main', { screen: 'ExploreClinicsScreen' })
                  }
                />
              ) : null}

              <QuickActionsGrid
                onReachDoctor={() => navigation.navigate('Main', { screen: 'MessagesInboxScreen' })}
                onServices={() => navigation.navigate('Main', { screen: 'ExploreClinicsScreen' })}
                onRecords={() => navigation.navigate('RecordsScreen')}
                onPrescriptions={() =>
                  navigation.navigate('Main', { screen: 'PrescriptionsScreen' })
                }
              />

              <AppointmentsSection
                appointments={displayAppointments}
                isFirstLogin={isFirstLogin}
                isLoading={isLoading && !dashboard}
                onBookAppointment={() =>
                  navigation.navigate('Main', { screen: 'ExploreClinicsScreen' })
                }
                onExploreClinics={() =>
                  navigation.navigate('Main', { screen: 'ExploreClinicsScreen' })
                }
                onViewAll={() =>
                  navigation.navigate('Main', {
                    screen: 'BottomTabs',
                    params: { screen: 'AppointmentsScreen' },
                  })
                }
                onCheckIn={(item) =>
                  item.clinicId
                    ? navigation.navigate('Main', {
                        screen: 'ClinicDetailsScreen',
                        params: { clinicId: item.clinicId } as any,
                      })
                    : navigation.navigate('Main', {
                        screen: 'BottomTabs',
                        params: { screen: 'AppointmentsScreen' },
                      })
                }
                onManageVisit={(item) =>
                  item.clinicId
                    ? navigation.navigate('Main', {
                        screen: 'ClinicDetailsScreen',
                        params: { clinicId: item.clinicId } as any,
                      })
                    : navigation.navigate('Main', {
                        screen: 'BottomTabs',
                        params: { screen: 'AppointmentsScreen' },
                      })
                }
                onDirections={(item) =>
                  item.clinicId
                    ? navigation.navigate('Main', {
                        screen: 'ClinicDetailsScreen',
                        params: { clinicId: item.clinicId } as any,
                      })
                    : navigation.navigate('Main', { screen: 'ExploreClinicsScreen' })
                }
              />

              {recentConsultation ? (
                <View style={[styles.sectionWrap, { gap: spacing.sm }]}>
                  <ThemedText variant="title">Recent Visit Summary</ThemedText>
                  <AfterVisitSummaryCard
                    consultation={recentConsultation}
                    vitals={recentVitals}
                    isPinned={true}
                    onBookFollowUp={() =>
                      navigation.navigate('Main', { screen: 'BookingDraftScreen' })
                    }
                    onMessageClinic={() =>
                      navigation.navigate('Main', { screen: 'MessagesInboxScreen' })
                    }
                  />
                </View>
              ) : null}
            </View>

            {/* Right Column: Vitals Telemetry, Medication Schedule, Mindful Moment */}
            <View style={[styles.rightColDesktop, { gap: spacing.lg }]}>
              <VitalsBentoGrid
                vitals={recentVitals}
                isZeroData={isFirstLogin || !recentVitals}
                onPressHistory={() => navigation.navigate('Main', { screen: 'VitalSignsScreen' })}
                onPressConnect={() => navigation.navigate('Main', { screen: 'VitalSignsScreen' })}
              />

              <MedicationsSchedule
                medications={medications}
                isZeroData={isFirstLogin || medications.length === 0}
                onToggleMedication={handleToggleMedication}
                onAddMedication={() =>
                  navigation.navigate('Main', { screen: 'PrescriptionsScreen' })
                }
                onManageAll={() => navigation.navigate('Main', { screen: 'PrescriptionsScreen' })}
              />

              <DailyMindfulMoment />
            </View>
          </View>
        ) : (
          /* Mobile / Compact Single Fluid Layout */
          <>
            <HealthPassCard
              patientFullName={patientFullName}
              patientIdCode={patientIdCode}
              onOpenQrModal={() => setShowQrModal(true)}
            />

            {isFirstLogin ? (
              <WelcomeOnboardingCard
                onCompleteProfile={() =>
                  navigation.navigate('Main', {
                    screen: 'BottomTabs',
                    params: { screen: 'ProfileScreen' },
                  })
                }
                onLinkInsurance={() =>
                  navigation.navigate('Main', { screen: 'GovernmentIdsScreen' })
                }
                onFindClinic={() =>
                  navigation.navigate('Main', { screen: 'ExploreClinicsScreen' })
                }
              />
            ) : null}

            <QuickActionsGrid
              onReachDoctor={() => navigation.navigate('Main', { screen: 'MessagesInboxScreen' })}
              onServices={() => navigation.navigate('Main', { screen: 'ExploreClinicsScreen' })}
              onRecords={() => navigation.navigate('RecordsScreen')}
              onPrescriptions={() =>
                navigation.navigate('Main', { screen: 'PrescriptionsScreen' })
              }
            />

            <AppointmentsSection
              appointments={displayAppointments}
              isFirstLogin={isFirstLogin}
              isLoading={isLoading && !dashboard}
              onBookAppointment={() =>
                navigation.navigate('Main', { screen: 'ExploreClinicsScreen' })
              }
              onExploreClinics={() =>
                navigation.navigate('Main', { screen: 'ExploreClinicsScreen' })
              }
              onViewAll={() =>
                navigation.navigate('Main', {
                  screen: 'BottomTabs',
                  params: { screen: 'AppointmentsScreen' },
                })
              }
              onCheckIn={(item) =>
                item.clinicId
                  ? navigation.navigate('Main', {
                      screen: 'ClinicDetailsScreen',
                      params: { clinicId: item.clinicId } as any,
                    })
                  : navigation.navigate('Main', {
                      screen: 'BottomTabs',
                      params: { screen: 'AppointmentsScreen' },
                    })
              }
              onManageVisit={(item) =>
                item.clinicId
                  ? navigation.navigate('Main', {
                      screen: 'ClinicDetailsScreen',
                      params: { clinicId: item.clinicId } as any,
                    })
                  : navigation.navigate('Main', {
                      screen: 'BottomTabs',
                      params: { screen: 'AppointmentsScreen' },
                    })
              }
              onDirections={(item) =>
                item.clinicId
                  ? navigation.navigate('Main', {
                      screen: 'ClinicDetailsScreen',
                      params: { clinicId: item.clinicId } as any,
                    })
                  : navigation.navigate('Main', { screen: 'ExploreClinicsScreen' })
              }
            />

            <VitalsBentoGrid
              vitals={recentVitals}
              isZeroData={isFirstLogin || !recentVitals}
              onPressHistory={() => navigation.navigate('Main', { screen: 'VitalSignsScreen' })}
              onPressConnect={() => navigation.navigate('Main', { screen: 'VitalSignsScreen' })}
            />

            <MedicationsSchedule
              medications={medications}
              isZeroData={isFirstLogin || medications.length === 0}
              onToggleMedication={handleToggleMedication}
              onAddMedication={() =>
                navigation.navigate('Main', { screen: 'PrescriptionsScreen' })
              }
              onManageAll={() => navigation.navigate('Main', { screen: 'PrescriptionsScreen' })}
            />

            {recentConsultation ? (
              <View style={[styles.sectionWrap, { gap: spacing.sm }]}>
                <ThemedText variant="title">Recent Visit Summary</ThemedText>
                <AfterVisitSummaryCard
                  consultation={recentConsultation}
                  vitals={recentVitals}
                  isPinned={true}
                  onBookFollowUp={() =>
                    navigation.navigate('Main', { screen: 'BookingDraftScreen' })
                  }
                  onMessageClinic={() =>
                    navigation.navigate('Main', { screen: 'MessagesInboxScreen' })
                  }
                />
              </View>
            ) : null}

            <DailyMindfulMoment />
          </>
        )}
      </ScrollView>

      {/* Floating Offline Network Pill (Google Stitch Centered Banner) */}
      <HomeOfflinePill bottomOffset={spacing['2xl']} />

      {/* Enlarged Digital Health Pass QR Code Modal */}
      <HealthPassQrModal
        visible={showQrModal}
        patientFullName={patientFullName}
        patientIdCode={patientIdCode}
        isNewlyIssued={isFirstLogin}
        onClose={() => setShowQrModal(false)}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screenWrapper: {
    flex: 1,
  },
  appHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    zIndex: 50,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
    gap: 12,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  headerIconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  unreadBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 8,
    height: 8,
  },
  avatarButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  container: {
    paddingTop: 16,
    gap: 24,
  },
  searchBarWrapper: {
    width: '100%',
  },
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontWeight: '400',
    paddingVertical: 4,
  },
  searchActionBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  desktopColumns: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    width: '100%',
  },
  mainColDesktop: {
    flex: 1.1,
    minWidth: 0,
  },
  rightColDesktop: {
    flex: 0.9,
    minWidth: 0,
  },
  sectionWrap: {
    width: '100%',
  },
});

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useUser } from '@clerk/expo';
import { useAuth } from '../../contexts/AuthContext';
import { useNotificationContext } from '../../contexts/NotificationContext';
import { usePatientId } from '../../hooks/usePatientId';
import { useNetworkOnline } from '../../hooks/useNetworkOnline';
import { useContentInsets } from '../../hooks/useContentInsets';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { AppIcon } from '../../components/ui/Icon';
import { SkeletonCard } from '../../components/ui/Skeleton';
import HomeHeader, { extractInitials } from '../../components/home/HomeHeader';
import HomeOfflinePillBanner from '../../components/home/HomeOfflinePillBanner';
import { useClinicalEmpathyTheme } from '../../constants/clinicalEmpathy';
import {
  formatAvailabilitySummary,
  queryDirectorySearchCatalog,
  resolveDefaultAffiliation,
  resolveDoctorAffiliations,
} from '../../services/search/directorySearchService';
import type {
  DirectoryClinicDto,
  DirectoryDoctorAffiliationDto,
  DirectoryDoctorDto,
  DirectorySearchResponseDto,
  DirectoryServiceDto,
  SearchCategoryFilter,
} from '../../services/api/homeApi';

export interface DirectorySearchRouteParams {
  initialQuery?: string;
  category?: SearchCategoryFilter;
  autoFocus?: boolean;
  openFilters?: boolean;
  voicePrompt?: boolean;
}

const CATEGORY_TABS: readonly { key: SearchCategoryFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'doctors', label: 'Doctors' },
  { key: 'clinics', label: 'Clinics' },
  { key: 'services', label: 'Services' },
];

export default function DirectorySearchScreen() {
  const { colors, typography, radii, spacing, elevation } = useClinicalEmpathyTheme();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const params = (route.params ?? {}) as DirectorySearchRouteParams;

  const { getToken } = useAuth();
  const { user } = useUser();
  const patientId = usePatientId();
  const { unreadCount } = useNotificationContext();
  const { isOnline } = useNetworkOnline();
  const contentInsets = useContentInsets();
  const { isDesktop, isWorkstation } = useBreakpoint();
  const isWebWorkstation = Platform.OS === 'web' && isWorkstation;

  const scrollY = useRef(new Animated.Value(0)).current;
  const inputRef = useRef<TextInput | null>(null);

  const [query, setQuery] = useState<string>(params.initialQuery ?? '');
  const [debouncedQuery, setDebouncedQuery] = useState<string>(params.initialQuery ?? '');
  const [category, setCategory] = useState<SearchCategoryFilter>(params.category ?? 'all');
  const [filtersExpanded, setFiltersExpanded] = useState<boolean>(Boolean(params.openFilters));
  const [openNowOnly, setOpenNowOnly] = useState<boolean>(false);
  const [availableTodayOnly, setAvailableTodayOnly] = useState<boolean>(false);

  const [results, setResults] = useState<DirectorySearchResponseDto | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [selectedClinicByDoctor, setSelectedClinicByDoctor] = useState<Record<string, string>>({});

  useEffect(() => {
    if (params.category) {
      setCategory(params.category);
    }
    if (params.openFilters !== undefined) {
      setFiltersExpanded(Boolean(params.openFilters));
    }
    if (params.initialQuery !== undefined) {
      setQuery(params.initialQuery);
      setDebouncedQuery(params.initialQuery);
    }
  }, [params.category, params.initialQuery, params.openFilters]);

  useEffect(() => {
    if (params.autoFocus) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 120);
      return () => clearTimeout(timer);
    }
  }, [params.autoFocus]);

  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedQuery(query);
    }, 220);
    return () => clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    let active = true;
    setIsLoading(true);

    queryDirectorySearchCatalog(getToken, patientId, {
      q: debouncedQuery,
      category,
      openNowOnly,
      availableTodayOnly,
      take: 25,
    })
      .then(({ data }) => {
        if (active) {
          setResults(data);
        }
      })
      .finally(() => {
        if (active) {
          setIsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [availableTodayOnly, category, debouncedQuery, getToken, openNowOnly, patientId]);

  const fullName = useMemo(() => {
    return (
      user?.fullName ??
      ([user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'Patient')
    );
  }, [user?.firstName, user?.fullName, user?.lastName]);

  const navigateToMainRoute = useCallback(
    (screenName: string, screenParams?: Record<string, unknown>) => {
      const parent = navigation.getParent?.();
      const grandParent = parent?.getParent?.();
      if (grandParent) {
        grandParent.navigate(screenName, screenParams);
        return;
      }
      if (parent) {
        parent.navigate(screenName, screenParams);
        return;
      }
      navigation.navigate('Main', { screen: screenName, params: screenParams });
    },
    [navigation],
  );

  const handleGoBackHome = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    navigation.navigate('Home');
  }, [navigation]);

  const handleBookDoctor = useCallback(
    (doctor: DirectoryDoctorDto, affiliation?: DirectoryDoctorAffiliationDto | null) => {
      const targetClinicId = affiliation?.clinicId ?? doctor.clinicId;
      const targetSupportsAppointments = affiliation
        ? affiliation.supportsAppointments
        : doctor.clinicSupportsAppointments;
      if (!targetSupportsAppointments || !targetClinicId) {
        return;
      }
      navigateToMainRoute('BookingDraftScreen', {
        clinicId: targetClinicId,
        providerId: affiliation?.providerId || doctor.id,
        practitionerId: doctor.practitionerId ?? undefined,
        providerName: doctor.name,
        reason: `Consultation with ${doctor.name}`,
      });
    },
    [navigateToMainRoute],
  );

  const handleOpenDoctorProfile = useCallback(
    (doctor: DirectoryDoctorDto, affiliation?: DirectoryDoctorAffiliationDto | null) => {
      const targetId = doctor.practitionerId ?? doctor.id;
      const affiliations = resolveDoctorAffiliations(doctor);
      navigateToMainRoute('ProviderProfileScreen', {
        id: targetId,
        providerData: {
          id: targetId,
          name: doctor.name,
          specialty: affiliation?.localSpecialty || doctor.specialty,
          avatarUrl: doctor.avatarUrl ?? undefined,
          rating: 5.0,
          bio: doctor.bio ?? '',
          credentials: doctor.professionalLicenseNo ? [doctor.professionalLicenseNo] : [],
          affiliatedClinics: affiliations.map((aff) => ({
            id: aff.clinicId,
            name: aff.clinicName,
            address: aff.clinicAddress ?? '',
          })),
        },
        directoryDoctor: doctor,
      });
    },
    [navigateToMainRoute],
  );

  const handleOpenClinic = useCallback(
    (clinic: DirectoryClinicDto) => {
      navigateToMainRoute('ClinicDetailsScreen', {
        clinicId: clinic.id,
        id: clinic.id,
      });
    },
    [navigateToMainRoute],
  );

  const handleScheduleService = useCallback(
    (service: DirectoryServiceDto, clinicPaused: boolean) => {
      if (clinicPaused) return;
      navigateToMainRoute('BookingDraftScreen', {
        clinicId: service.clinicId,
        serviceId: service.id,
        reason: service.name,
      });
    },
    [navigateToMainRoute],
  );

  const counts = results?.counts ?? { all: 0, doctors: 0, clinics: 0, services: 0 };
  const doctors = results?.doctors ?? [];
  const clinics = results?.clinics ?? [];
  const services = results?.services ?? [];
  const hasAnyResults = doctors.length > 0 || clinics.length > 0 || services.length > 0;

  return (
    <SafeAreaView
      edges={['top']}
      style={[styles.safeRoot, { backgroundColor: colors.canvas }]}
    >
      <HomeHeader
        scrollY={scrollY}
        title="Care Network Search"
        subtitle={debouncedQuery ? `Results for "${debouncedQuery}"` : 'Doctors, clinics & packages'}
        fullName={fullName}
        avatarUrl={user?.imageUrl ?? null}
        unreadCount={unreadCount}
        showBackButton={true}
        showBrand={!isWebWorkstation}
        alwaysShowTitle={isWebWorkstation}
        maxContentWidth={isWebWorkstation ? 1120 : undefined}
        horizontalPadding={isWebWorkstation ? (isDesktop ? spacing.xl : spacing.lg) : undefined}
        onBackPress={handleGoBackHome}
        onBrandPress={handleGoBackHome}
        onNotificationsPress={() => navigateToMainRoute('NotificationScreen')}
        onAvatarPress={() => navigateToMainRoute('ProfileScreen')}
      />

      <Animated.ScrollView
        style={styles.flex}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: Platform.OS !== 'web' },
        )}
        scrollEventThrottle={16}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.xs,
            paddingBottom: Math.max(contentInsets.bottom, 24) + (isOnline ? 28 : 76),
            gap: spacing.lg,
          },
        ]}
      >
        <View style={styles.maxWidthWrap}>
          {/* Active Search Input Pill */}
          <View style={{ gap: spacing.md }}>
            <View
              style={[
                styles.searchInputBar,
                elevation.card,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.mintBadgeBorder,
                  borderRadius: radii.full,
                  paddingLeft: spacing.base,
                  paddingRight: spacing.xs,
                  gap: spacing.sm,
                },
              ]}
            >
              <AppIcon name="search" size={18} color={colors.primary} />
              <TextInput
                ref={inputRef}
                value={query}
                onChangeText={setQuery}
                placeholder={
                  params.voicePrompt
                    ? 'Type symptoms, specialty, or doctor...'
                    : 'Search clinics, doctors, or symptoms...'
                }
                placeholderTextColor={colors.mutedText}
                returnKeyType="search"
                autoCapitalize="none"
                autoCorrect={false}
                style={[typography.labelLg, styles.searchInput, { color: colors.navyText }]}
              />

              {query.length > 0 ? (
                <Pressable
                  onPress={() => setQuery('')}
                  accessibilityRole="button"
                  accessibilityLabel="Clear search query"
                  hitSlop={8}
                  style={styles.clearBtn}
                >
                  <AppIcon name="close" size={18} color={colors.navyText} />
                </Pressable>
              ) : null}

              <Pressable
                onPress={() => setFiltersExpanded((prev) => !prev)}
                accessibilityRole="button"
                accessibilityLabel="Toggle search filters"
                style={({ pressed }) => [
                  styles.filterCircleBtn,
                  {
                    backgroundColor:
                      filtersExpanded || openNowOnly || availableTodayOnly
                        ? colors.mintBadgeBg
                        : colors.mintSoftBg,
                    borderRadius: radii.full,
                    opacity: pressed ? 0.8 : 1,
                  },
                ]}
              >
                <AppIcon name="sliders" size={17} color={colors.primary} />
              </Pressable>
            </View>

            {/* Expandable Quick Filter Toggles */}
            {filtersExpanded ? (
              <View style={[styles.extraFiltersRow, { gap: spacing.sm }]}>
                <Pressable
                  onPress={() => setOpenNowOnly((v) => !v)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: openNowOnly }}
                  style={[
                    styles.toggleChip,
                    {
                      borderRadius: radii.full,
                      backgroundColor: openNowOnly ? colors.mintBadgeBg : colors.surface,
                      borderColor: openNowOnly ? colors.primary : colors.border,
                      paddingHorizontal: spacing.md,
                      paddingVertical: spacing.xs,
                      gap: spacing.xs,
                    },
                  ]}
                >
                  <AppIcon
                    name="clock"
                    size={13}
                    color={openNowOnly ? colors.primary : colors.mutedText}
                  />
                  <Text
                    style={[
                      typography.labelSm,
                      { color: openNowOnly ? colors.primary : colors.bodyText },
                    ]}
                  >
                    Open Now
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => setAvailableTodayOnly((v) => !v)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: availableTodayOnly }}
                  style={[
                    styles.toggleChip,
                    {
                      borderRadius: radii.full,
                      backgroundColor: availableTodayOnly ? colors.mintBadgeBg : colors.surface,
                      borderColor: availableTodayOnly ? colors.primary : colors.border,
                      paddingHorizontal: spacing.md,
                      paddingVertical: spacing.xs,
                      gap: spacing.xs,
                    },
                  ]}
                >
                  <AppIcon
                    name="calendarCheck"
                    size={13}
                    color={availableTodayOnly ? colors.primary : colors.mutedText}
                  />
                  <Text
                    style={[
                      typography.labelSm,
                      { color: availableTodayOnly ? colors.primary : colors.bodyText },
                    ]}
                  >
                    Online Booking Available
                  </Text>
                </Pressable>
              </View>
            ) : null}

            {/* Horizontal Category Count Pills */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={[styles.categoryPillsRow, { gap: spacing.sm }]}
            >
              {CATEGORY_TABS.map((tab) => {
                const isSelected = category === tab.key;
                const countValue = counts[tab.key];

                return (
                  <Pressable
                    key={tab.key}
                    onPress={() => setCategory(tab.key)}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: isSelected }}
                    style={({ pressed }) => [
                      styles.categoryPill,
                      {
                        borderRadius: radii.full,
                        backgroundColor: isSelected ? colors.primary : colors.surface,
                        borderColor: isSelected ? colors.primary : colors.border,
                        paddingHorizontal: spacing.base,
                        paddingVertical: spacing.sm,
                        opacity: pressed ? 0.85 : 1,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        typography.labelMd,
                        { color: isSelected ? colors.onPrimary : colors.navyText },
                      ]}
                    >
                      {tab.label} ({countValue})
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          {isLoading && !results ? (
            <View style={{ gap: spacing.md, marginTop: spacing.lg }}>
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </View>
          ) : !hasAnyResults ? (
            <View
              style={[
                styles.emptyStateCard,
                elevation.card,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.borderSubtle,
                  borderRadius: radii.xl,
                  padding: spacing.xl,
                  marginTop: spacing.lg,
                  gap: spacing.md,
                },
              ]}
            >
              <View
                style={[
                  styles.emptyCircle,
                  {
                    backgroundColor: colors.mintSoftBg,
                    borderRadius: radii.full,
                  },
                ]}
              >
                <AppIcon name="search" size={24} color={colors.primary} />
              </View>
              <Text style={[typography.headlineSm, styles.centerText, { color: colors.navyText }]}>
                No Matching Care Results
              </Text>
              <Text style={[typography.bodySm, styles.centerText, { color: colors.bodyText }]}>
                We couldn&apos;t find doctors, clinics, or care packages matching your current
                search filters.
              </Text>
              {(query.length > 0 || category !== 'all' || openNowOnly || availableTodayOnly) ? (
                <Pressable
                  onPress={() => {
                    setQuery('');
                    setCategory('all');
                    setOpenNowOnly(false);
                    setAvailableTodayOnly(false);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Reset search filters"
                  style={({ pressed }) => [
                    styles.resetBtn,
                    {
                      backgroundColor: colors.primary,
                      borderRadius: radii.full,
                      paddingHorizontal: spacing.lg,
                      paddingVertical: spacing.sm,
                      opacity: pressed ? 0.88 : 1,
                    },
                  ]}
                >
                  <Text style={[typography.labelMd, { color: colors.onPrimary }]}>
                    Reset Filters
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : (
            <View style={{ gap: spacing.xl, marginTop: spacing.lg }}>
              {/* Section 1: DOCTORS & SPECIALISTS */}
              {doctors.length > 0 ? (
                <View style={{ gap: spacing.md }}>
                  <View style={styles.groupHeaderRow}>
                    <View style={[styles.groupLeft, { gap: spacing.sm }]}>
                      <View
                        style={[
                          styles.sectionDot,
                          { borderRadius: radii.full, backgroundColor: colors.primary },
                        ]}
                      />
                      <Text style={[typography.overline, { color: colors.navyText }]}>
                        DOCTORS & SPECIALISTS
                      </Text>
                      <View
                        style={[
                          styles.groupCountPill,
                          {
                            backgroundColor: colors.slatePillBg,
                            borderRadius: radii.full,
                            paddingHorizontal: spacing.sm,
                            paddingVertical: spacing.xxs,
                          },
                        ]}
                      >
                        <Text style={[typography.labelSm, { color: colors.slatePillText }]}>
                          {doctors.length} Found
                        </Text>
                      </View>
                    </View>

                    {category === 'all' ? (
                      <Pressable
                        onPress={() => setCategory('doctors')}
                        accessibilityRole="button"
                        hitSlop={8}
                        style={[styles.seeAllLink, { gap: spacing.xxs }]}
                      >
                        <Text style={[typography.labelMd, { color: colors.primary }]}>
                          See all
                        </Text>
                        <AppIcon name="forward" size={14} color={colors.primary} />
                      </Pressable>
                    ) : null}
                  </View>

                  <View style={{ gap: spacing.md }}>
                    {doctors.map((doctor) => {
                      const initials = extractInitials(doctor.name);
                      const doctorKey = doctor.practitionerId ?? doctor.id;
                      const affiliations = resolveDoctorAffiliations(doctor);
                      const activeAffiliation = resolveDefaultAffiliation(
                        doctor,
                        selectedClinicByDoctor[doctorKey],
                      );
                      const activeClinicName = activeAffiliation?.clinicName ?? doctor.clinicName;
                      const activeClinicAddress =
                        activeAffiliation?.clinicAddress ?? doctor.clinicAddress;
                      const activeSpecialty = activeAffiliation?.localSpecialty || doctor.specialty;
                      const activeSupportsAppointments = activeAffiliation
                        ? activeAffiliation.supportsAppointments
                        : doctor.clinicSupportsAppointments;
                      const activeNextAvailableLabel =
                        activeAffiliation?.nextAvailableLabel || doctor.nextAvailableLabel;
                      const scheduleSummary = formatAvailabilitySummary(
                        activeAffiliation?.availabilities,
                      );
                      const facilitySubtitle = [activeClinicName, activeClinicAddress]
                        .filter(Boolean)
                        .join(' • ');
                      const visibleTags = doctor.tags
                        .filter((t) => t.toLowerCase() !== 'booking paused')
                        .slice(0, 3);

                      return (
                        <Pressable
                          key={doctor.id}
                          onPress={() => handleOpenDoctorProfile(doctor, activeAffiliation)}
                          accessibilityRole={Platform.OS === 'web' ? undefined : 'button'}
                          accessibilityLabel={`${doctor.name}, ${activeSpecialty}`}
                          style={({ pressed }) => [
                            styles.resultCard,
                            elevation.card,
                            {
                              backgroundColor: colors.surface,
                              borderColor: colors.borderSubtle,
                              borderRadius: radii.xl,
                              padding: spacing.base,
                              gap: spacing.md,
                              opacity: pressed ? 0.94 : 1,
                            },
                          ]}
                        >
                          <View style={[styles.cardHeaderRow, { gap: spacing.md }]}>
                            <View style={styles.avatarContainer}>
                              <View
                                style={[
                                  styles.squareAvatar,
                                  {
                                    backgroundColor: colors.mintSoftBg,
                                    borderRadius: radii.lg,
                                  },
                                ]}
                              >
                                {doctor.avatarUrl ? (
                                  <Image
                                    source={{ uri: doctor.avatarUrl }}
                                    style={[styles.squareAvatarImg, { borderRadius: radii.lg }]}
                                  />
                                ) : (
                                  <Text
                                    style={[typography.headlineSm, { color: colors.primary }]}
                                  >
                                    {initials}
                                  </Text>
                                )}
                              </View>
                              {doctor.isVerified ? (
                                <View
                                  style={[
                                    styles.verifiedCornerBadge,
                                    {
                                      backgroundColor: colors.emeraldDot,
                                      borderColor: colors.surface,
                                      borderRadius: radii.full,
                                    },
                                  ]}
                                >
                                  <AppIcon name="check" size={10} color={colors.onPrimary} />
                                </View>
                              ) : null}
                            </View>

                            <View style={styles.cardMainCopy}>
                              <View style={[styles.titleBadgeRow, { gap: spacing.sm }]}>
                                <Text
                                  numberOfLines={1}
                                  style={[
                                    typography.cardTitle,
                                    styles.flexTitle,
                                    { color: colors.navyText },
                                  ]}
                                >
                                  {doctor.name}
                                </Text>

                                {doctor.isVerified ? (
                                  <View
                                    style={[
                                      styles.topRightPill,
                                      {
                                        backgroundColor: colors.mintSoftBg,
                                        borderColor: colors.mintBadgeBorder,
                                        borderRadius: radii.full,
                                        paddingHorizontal: spacing.sm,
                                        paddingVertical: spacing.xxs,
                                        gap: spacing.xxs,
                                      },
                                    ]}
                                  >
                                    <AppIcon
                                      name="badgeCheck"
                                      size={12}
                                      color={colors.emeraldText}
                                    />
                                    <Text
                                      style={[typography.labelSm, { color: colors.emeraldText }]}
                                    >
                                      Verified
                                    </Text>
                                  </View>
                                ) : (
                                  <View
                                    style={[
                                      styles.topRightPill,
                                      {
                                        backgroundColor: colors.slatePillBg,
                                        borderColor: colors.border,
                                        borderRadius: radii.full,
                                        paddingHorizontal: spacing.sm,
                                        paddingVertical: spacing.xxs,
                                      },
                                    ]}
                                  >
                                    <Text
                                      style={[typography.labelSm, { color: colors.slatePillText }]}
                                    >
                                      Saved Contact
                                    </Text>
                                  </View>
                                )}
                              </View>

                              <Text
                                numberOfLines={1}
                                style={[typography.labelMd, { color: colors.primary }]}
                              >
                                {activeSpecialty}
                              </Text>
                              {facilitySubtitle ? (
                                <Text
                                  numberOfLines={1}
                                  style={[typography.bodySm, { color: colors.bodyText }]}
                                >
                                  {facilitySubtitle}
                                </Text>
                              ) : null}
                              {scheduleSummary ? (
                                <Text
                                  numberOfLines={1}
                                  style={[typography.bodySm, { color: colors.mutedText }]}
                                >
                                  Hours: {scheduleSummary}
                                </Text>
                              ) : null}
                            </View>
                          </View>

                          {/* Multi-clinic Affiliation Selector */}
                          {affiliations.length > 1 ? (
                            <View style={{ gap: spacing.xs }}>
                              <Text style={[typography.labelSm, { color: colors.mutedText }]}>
                                Select clinic ({affiliations.length} locations)
                              </Text>
                              <View style={[styles.tagsWrap, { gap: spacing.xs }]}>
                                {affiliations.map((aff) => {
                                  const isClinicSelected =
                                    activeAffiliation?.clinicId === aff.clinicId;
                                  return (
                                    <Pressable
                                      key={`${aff.clinicId}-${aff.providerId ?? 'primary'}`}
                                      onPress={(e) => {
                                        e.stopPropagation?.();
                                        setSelectedClinicByDoctor((prev) => ({
                                          ...prev,
                                          [doctorKey]: aff.clinicId,
                                        }));
                                      }}
                                      accessibilityRole="button"
                                      accessibilityState={{ selected: isClinicSelected }}
                                      style={[
                                        styles.affiliationChip,
                                        {
                                          backgroundColor: isClinicSelected
                                            ? colors.mintBadgeBg
                                            : colors.surfaceLow,
                                          borderColor: isClinicSelected
                                            ? colors.primary
                                            : colors.border,
                                          borderRadius: radii.lg,
                                          paddingHorizontal: spacing.sm,
                                          paddingVertical: spacing.xs,
                                          gap: spacing.xxs,
                                        },
                                      ]}
                                    >
                                      <Text
                                        numberOfLines={1}
                                        style={[
                                          typography.labelSm,
                                          {
                                            color: isClinicSelected
                                              ? colors.primary
                                              : colors.navyText,
                                          },
                                        ]}
                                      >
                                        {aff.clinicName}
                                      </Text>
                                      {!aff.supportsAppointments ? (
                                        <Text
                                          style={[
                                            typography.labelSm,
                                            { color: colors.amberText },
                                          ]}
                                        >
                                          • Booking Paused
                                        </Text>
                                      ) : null}
                                    </Pressable>
                                  );
                                })}
                              </View>
                            </View>
                          ) : null}

                          {(!activeSupportsAppointments || visibleTags.length > 0) ? (
                            <View style={[styles.tagsWrap, { gap: spacing.sm }]}>
                              {!activeSupportsAppointments ? (
                                <View
                                  style={[
                                    styles.tagPill,
                                    {
                                      backgroundColor: colors.amberSoftBg,
                                      borderRadius: radii.full,
                                      paddingHorizontal: spacing.md,
                                      paddingVertical: spacing.xs,
                                      gap: spacing.xs,
                                    },
                                  ]}
                                >
                                  <AppIcon name="alert" size={12} color={colors.amberText} />
                                  <Text
                                    style={[typography.labelSm, { color: colors.amberText }]}
                                  >
                                    Booking Paused
                                  </Text>
                                </View>
                              ) : null}
                              {visibleTags.map((tag) => (
                                <View
                                  key={tag}
                                  style={[
                                    styles.tagPill,
                                    {
                                      backgroundColor: colors.slatePillBg,
                                      borderRadius: radii.full,
                                      paddingHorizontal: spacing.md,
                                      paddingVertical: spacing.xs,
                                    },
                                  ]}
                                >
                                  <Text
                                    style={[typography.labelSm, { color: colors.slatePillText }]}
                                  >
                                    {tag}
                                  </Text>
                                </View>
                              ))}
                            </View>
                          ) : null}

                          <View style={[styles.cardBottomRow, { gap: spacing.sm }]}>
                            <View style={[styles.bottomMetaLeft, { gap: spacing.xs }]}>
                              <AppIcon
                                name={activeSupportsAppointments ? 'calendar' : 'clock'}
                                size={15}
                                color={activeSupportsAppointments ? colors.primary : colors.amberText}
                              />
                              <Text
                                numberOfLines={1}
                                style={[
                                  typography.bodySm,
                                  styles.flexTitle,
                                  { color: colors.bodyText },
                                ]}
                              >
                                {activeSupportsAppointments ? (
                                  <>
                                    Next:{' '}
                                    <Text style={[typography.labelMd, { color: colors.navyText }]}>
                                      {activeNextAvailableLabel}
                                    </Text>
                                  </>
                                ) : (
                                  <Text style={[typography.labelMd, { color: colors.amberText }]}>
                                    Booking Paused
                                  </Text>
                                )}
                              </Text>
                            </View>

                            <Pressable
                              onPress={(e) => {
                                e.stopPropagation?.();
                                handleBookDoctor(doctor, activeAffiliation);
                              }}
                              disabled={!activeSupportsAppointments}
                              accessibilityRole="button"
                              accessibilityState={{ disabled: !activeSupportsAppointments }}
                              accessibilityLabel={
                                activeSupportsAppointments
                                  ? `Book visit with ${doctor.name}`
                                  : `Booking paused for ${doctor.name}`
                              }
                              style={({ pressed }) => [
                                styles.cardCtaBtn,
                                {
                                  backgroundColor: activeSupportsAppointments
                                    ? colors.primary
                                    : colors.slatePillBg,
                                  borderRadius: radii.full,
                                  paddingHorizontal: spacing.lg,
                                  paddingVertical: spacing.sm,
                                  opacity: !activeSupportsAppointments ? 0.7 : pressed ? 0.86 : 1,
                                },
                              ]}
                            >
                              <Text
                                style={[
                                  typography.labelMd,
                                  {
                                    color: activeSupportsAppointments
                                      ? colors.onPrimary
                                      : colors.mutedText,
                                  },
                                ]}
                              >
                                {activeSupportsAppointments ? 'Book Visit' : 'Booking Paused'}
                              </Text>
                            </Pressable>
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ) : null}

              {/* Section 2: CLINICS & CARE CENTERS */}
              {clinics.length > 0 ? (
                <View style={{ gap: spacing.md }}>
                  <View style={styles.groupHeaderRow}>
                    <View style={[styles.groupLeft, { gap: spacing.sm }]}>
                      <View
                        style={[
                          styles.sectionDot,
                          { borderRadius: radii.full, backgroundColor: colors.primary },
                        ]}
                      />
                      <Text style={[typography.overline, { color: colors.navyText }]}>
                        CLINICS & CARE CENTERS
                      </Text>
                      <View
                        style={[
                          styles.groupCountPill,
                          {
                            backgroundColor: colors.slatePillBg,
                            borderRadius: radii.full,
                            paddingHorizontal: spacing.sm,
                            paddingVertical: spacing.xxs,
                          },
                        ]}
                      >
                        <Text style={[typography.labelSm, { color: colors.slatePillText }]}>
                          {clinics.length} {clinics.length === 1 ? 'Facility' : 'Facilities'}
                        </Text>
                      </View>
                    </View>

                    {category === 'all' ? (
                      <Pressable
                        onPress={() => setCategory('clinics')}
                        accessibilityRole="button"
                        hitSlop={8}
                        style={[styles.seeAllLink, { gap: spacing.xxs }]}
                      >
                        <Text style={[typography.labelMd, { color: colors.primary }]}>
                          See all
                        </Text>
                        <AppIcon name="forward" size={14} color={colors.primary} />
                      </Pressable>
                    ) : null}
                  </View>

                  <View style={{ gap: spacing.md }}>
                    {clinics.map((clinic) => {
                      const imageUri = clinic.coverImageUrl ?? clinic.logoUrl;
                      const isClinicPaused = !clinic.supportsAppointments;
                      const visibleClinicTags = clinic.tags
                        .filter((t) => t.toLowerCase() !== 'booking paused')
                        .slice(0, 3);

                      return (
                        <Pressable
                          key={clinic.id}
                          onPress={() => handleOpenClinic(clinic)}
                          accessibilityRole={Platform.OS === 'web' ? undefined : 'button'}
                          accessibilityLabel={`${clinic.name} clinic`}
                          style={({ pressed }) => [
                            styles.resultCard,
                            elevation.card,
                            {
                              backgroundColor: colors.surface,
                              borderColor: colors.borderSubtle,
                              borderRadius: radii.xl,
                              padding: spacing.base,
                              gap: spacing.md,
                              opacity: pressed ? 0.94 : 1,
                            },
                          ]}
                        >
                          <View style={[styles.cardHeaderRow, { gap: spacing.md }]}>
                            <View style={styles.avatarContainer}>
                              <View
                                style={[
                                  styles.squareAvatar,
                                  {
                                    backgroundColor: colors.surfaceLow,
                                    borderRadius: radii.lg,
                                  },
                                ]}
                              >
                                {imageUri ? (
                                  <Image
                                    source={{ uri: imageUri }}
                                    style={[styles.squareAvatarImg, { borderRadius: radii.lg }]}
                                  />
                                ) : (
                                  <AppIcon name="building" size={22} color={colors.mutedText} />
                                )}
                              </View>
                              {clinic.isOpenNow ? (
                                <View
                                  style={[
                                    styles.verifiedCornerBadge,
                                    {
                                      backgroundColor: colors.mintBadgeBg,
                                      borderColor: colors.surface,
                                      borderRadius: radii.full,
                                    },
                                  ]}
                                >
                                  <View
                                    style={[
                                      styles.innerStatusDot,
                                      {
                                        backgroundColor: colors.primary,
                                        borderRadius: radii.full,
                                      },
                                    ]}
                                  />
                                </View>
                              ) : null}
                            </View>

                            <View style={styles.cardMainCopy}>
                              <View style={[styles.titleBadgeRow, { gap: spacing.sm }]}>
                                <Text
                                  numberOfLines={1}
                                  style={[
                                    typography.cardTitle,
                                    styles.flexTitle,
                                    { color: colors.navyText },
                                  ]}
                                >
                                  {clinic.name}
                                </Text>

                                <View
                                  style={[
                                    styles.topRightPill,
                                    {
                                      backgroundColor: isClinicPaused
                                        ? colors.amberSoftBg
                                        : clinic.isOpenNow
                                          ? colors.mintSoftBg
                                          : colors.slatePillBg,
                                      borderColor: isClinicPaused
                                        ? colors.amberText
                                        : clinic.isOpenNow
                                          ? colors.mintBadgeBorder
                                          : colors.border,
                                      borderRadius: radii.full,
                                      paddingHorizontal: spacing.sm,
                                      paddingVertical: spacing.xxs,
                                    },
                                  ]}
                                >
                                  <Text
                                    style={[
                                      typography.labelSm,
                                      {
                                        color: isClinicPaused
                                          ? colors.amberText
                                          : clinic.isOpenNow
                                            ? colors.emeraldText
                                            : colors.slatePillText,
                                      },
                                    ]}
                                  >
                                    {isClinicPaused ? 'Booking Paused' : clinic.openStatusLabel}
                                  </Text>
                                </View>
                              </View>

                              <Text
                                numberOfLines={1}
                                style={[typography.labelMd, { color: colors.primary }]}
                              >
                                {clinic.primarySpecialty ?? 'Outpatient Care Center'}
                              </Text>
                              {clinic.address ? (
                                <Text
                                  numberOfLines={1}
                                  style={[typography.bodySm, { color: colors.bodyText }]}
                                >
                                  {clinic.address}
                                </Text>
                              ) : null}
                              {clinic.operatingHours ? (
                                <Text
                                  numberOfLines={1}
                                  style={[typography.bodySm, { color: colors.mutedText }]}
                                >
                                  Hours: {clinic.operatingHours}
                                </Text>
                              ) : null}
                            </View>
                          </View>

                          {(isClinicPaused || visibleClinicTags.length > 0) ? (
                            <View style={[styles.tagsWrap, { gap: spacing.sm }]}>
                              {isClinicPaused ? (
                                <View
                                  style={[
                                    styles.tagPill,
                                    {
                                      backgroundColor: colors.amberSoftBg,
                                      borderRadius: radii.full,
                                      paddingHorizontal: spacing.md,
                                      paddingVertical: spacing.xs,
                                      gap: spacing.xs,
                                    },
                                  ]}
                                >
                                  <AppIcon name="alert" size={12} color={colors.amberText} />
                                  <Text style={[typography.labelSm, { color: colors.amberText }]}>
                                    Booking Paused
                                  </Text>
                                </View>
                              ) : null}
                              {visibleClinicTags.map((tag) => (
                                <View
                                  key={tag}
                                  style={[
                                    styles.tagPill,
                                    {
                                      backgroundColor: colors.slatePillBg,
                                      borderRadius: radii.full,
                                      paddingHorizontal: spacing.md,
                                      paddingVertical: spacing.xs,
                                    },
                                  ]}
                                >
                                  <Text
                                    style={[typography.labelSm, { color: colors.slatePillText }]}
                                  >
                                    {tag}
                                  </Text>
                                </View>
                              ))}
                            </View>
                          ) : null}

                          <View style={[styles.cardBottomRow, { gap: spacing.sm }]}>
                            <View style={[styles.bottomMetaLeft, { gap: spacing.xs }]}>
                              <AppIcon
                                name={clinic.nextAvailableLabel ? 'clock' : 'badgeCheck'}
                                size={15}
                                color={isClinicPaused ? colors.amberText : colors.primary}
                              />
                              <Text
                                numberOfLines={1}
                                style={[
                                  typography.bodySm,
                                  styles.flexTitle,
                                  { color: colors.bodyText },
                                ]}
                              >
                                {isClinicPaused ? (
                                  <Text style={[typography.labelMd, { color: colors.amberText }]}>
                                    {clinic.operatingHours
                                      ? `${clinic.openStatusLabel} • ${clinic.operatingHours}`
                                      : 'Online booking paused'}
                                  </Text>
                                ) : clinic.nextAvailableLabel ? (
                                  <>
                                    Next:{' '}
                                    <Text style={[typography.labelMd, { color: colors.navyText }]}>
                                      {clinic.nextAvailableLabel}
                                    </Text>
                                  </>
                                ) : clinic.activeMemberCount > 0 ? (
                                  <>
                                    Care Team:{' '}
                                    <Text style={[typography.labelMd, { color: colors.navyText }]}>
                                      {clinic.activeMemberCount} Specialists
                                    </Text>
                                  </>
                                ) : (
                                  <Text style={[typography.labelMd, { color: colors.navyText }]}>
                                    {clinic.operatingHours ?? 'Verified Network Clinic'}
                                  </Text>
                                )}
                              </Text>
                            </View>

                            <Pressable
                              onPress={(e) => {
                                e.stopPropagation?.();
                                handleOpenClinic(clinic);
                              }}
                              accessibilityRole="button"
                              accessibilityLabel={`View ${clinic.name}`}
                              style={({ pressed }) => [
                                styles.cardCtaBtn,
                                {
                                  backgroundColor: colors.primary,
                                  borderRadius: radii.full,
                                  paddingHorizontal: spacing.lg,
                                  paddingVertical: spacing.sm,
                                  opacity: pressed ? 0.86 : 1,
                                },
                              ]}
                            >
                              <Text style={[typography.labelMd, { color: colors.onPrimary }]}>
                                View Clinic
                              </Text>
                            </Pressable>
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ) : null}

              {/* Section 3: SPECIALIZED CARE PACKAGES */}
              {services.length > 0 ? (
                <View style={{ gap: spacing.md }}>
                  <View style={styles.groupHeaderRow}>
                    <View style={[styles.groupLeft, { gap: spacing.sm }]}>
                      <View
                        style={[
                          styles.sectionDot,
                          { borderRadius: radii.full, backgroundColor: colors.lavenderIcon },
                        ]}
                      />
                      <Text style={[typography.overline, { color: colors.navyText }]}>
                        SPECIALIZED CARE PACKAGES
                      </Text>
                      <View
                        style={[
                          styles.groupCountPill,
                          {
                            backgroundColor: colors.slatePillBg,
                            borderRadius: radii.full,
                            paddingHorizontal: spacing.sm,
                            paddingVertical: spacing.xxs,
                          },
                        ]}
                      >
                        <Text style={[typography.labelSm, { color: colors.slatePillText }]}>
                          {services.length} {services.length === 1 ? 'Package' : 'Packages'}
                        </Text>
                      </View>
                    </View>

                    {category === 'all' ? (
                      <Pressable
                        onPress={() => setCategory('services')}
                        accessibilityRole="button"
                        hitSlop={8}
                        style={[styles.seeAllLink, { gap: spacing.xxs }]}
                      >
                        <Text style={[typography.labelMd, { color: colors.primary }]}>
                          See all
                        </Text>
                        <AppIcon name="forward" size={14} color={colors.primary} />
                      </Pressable>
                    ) : null}
                  </View>

                  <View style={{ gap: spacing.md }}>
                    {services.map((service) => {
                      const parentClinic = clinics.find((c) => c.id === service.clinicId);
                      const isServicePaused = Boolean(parentClinic && !parentClinic.supportsAppointments);
                      const metaSummary = [
                        service.durationMinutes ? `${service.durationMinutes} min` : null,
                        service.description ?? service.clinicName,
                      ]
                        .filter(Boolean)
                        .join(' • ');

                      return (
                        <View
                          key={service.id}
                          style={[
                            styles.resultCard,
                            elevation.card,
                            {
                              backgroundColor: colors.surface,
                              borderColor: colors.borderSubtle,
                              borderRadius: radii.xl,
                              padding: spacing.base,
                              gap: spacing.md,
                            },
                          ]}
                        >
                          <View style={[styles.cardHeaderRow, { gap: spacing.md }]}>
                            <View
                              style={[
                                styles.serviceIconSquare,
                                {
                                  backgroundColor: colors.primary,
                                  borderRadius: radii.lg,
                                },
                              ]}
                            >
                              <AppIcon name="heartPulse" size={22} color={colors.onPrimary} />
                            </View>

                            <View style={styles.cardMainCopy}>
                              <View style={[styles.titleBadgeRow, { gap: spacing.sm }]}>
                                <Text
                                  numberOfLines={1}
                                  style={[
                                    typography.cardTitle,
                                    styles.flexTitle,
                                    { color: colors.navyText },
                                  ]}
                                >
                                  {service.name}
                                </Text>

                                <View
                                  style={[
                                    styles.topRightPill,
                                    {
                                      backgroundColor: isServicePaused
                                        ? colors.amberSoftBg
                                        : colors.mintSoftBg,
                                      borderColor: isServicePaused
                                        ? colors.amberText
                                        : colors.mintBadgeBorder,
                                      borderRadius: radii.full,
                                      paddingHorizontal: spacing.sm,
                                      paddingVertical: spacing.xxs,
                                    },
                                  ]}
                                >
                                  <Text
                                    style={[
                                      typography.labelSm,
                                      {
                                        color: isServicePaused
                                          ? colors.amberText
                                          : colors.emeraldText,
                                      },
                                    ]}
                                  >
                                    {isServicePaused ? 'Booking Paused' : service.priceBadgeLabel}
                                  </Text>
                                </View>
                              </View>

                              <Text
                                numberOfLines={1}
                                style={[typography.labelMd, { color: colors.primary }]}
                              >
                                {service.subtitle ?? service.clinicName}
                              </Text>
                              <Text
                                numberOfLines={1}
                                style={[typography.bodySm, { color: colors.bodyText }]}
                              >
                                {metaSummary}
                              </Text>
                            </View>
                          </View>

                          {service.tags.length > 0 ? (
                            <View style={[styles.tagsWrap, { gap: spacing.sm }]}>
                              {service.tags.slice(0, 3).map((tag, idx) => {
                                const highlightMint = idx === 0;
                                return (
                                  <View
                                    key={tag}
                                    style={[
                                      styles.tagPill,
                                      {
                                        backgroundColor: highlightMint
                                          ? colors.mintSoftBg
                                          : colors.slatePillBg,
                                        borderRadius: radii.full,
                                        paddingHorizontal: spacing.md,
                                        paddingVertical: spacing.xs,
                                        gap: spacing.xs,
                                      },
                                    ]}
                                  >
                                    {highlightMint ? (
                                      <AppIcon
                                        name="checkCircle"
                                        size={12}
                                        color={colors.primary}
                                      />
                                    ) : null}
                                    <Text
                                      style={[
                                        typography.labelSm,
                                        {
                                          color: highlightMint
                                            ? colors.primary
                                            : colors.slatePillText,
                                        },
                                      ]}
                                    >
                                      {tag}
                                    </Text>
                                  </View>
                                );
                              })}
                            </View>
                          ) : null}

                          <View style={[styles.cardBottomRow, { gap: spacing.sm }]}>
                            <View style={[styles.bottomMetaLeft, { gap: spacing.xs }]}>
                              <AppIcon name="clock" size={15} color={colors.primary} />
                              <Text style={[typography.bodySm, { color: colors.bodyText }]}>
                                Duration:{' '}
                                <Text style={[typography.labelMd, { color: colors.navyText }]}>
                                  {service.durationMinutes ?? 30} Mins
                                </Text>
                              </Text>
                            </View>

                            <Pressable
                              onPress={() => handleScheduleService(service, isServicePaused)}
                              disabled={isServicePaused}
                              accessibilityRole="button"
                              accessibilityState={{ disabled: isServicePaused }}
                              accessibilityLabel={
                                isServicePaused
                                  ? `Booking paused for ${service.name}`
                                  : `Schedule ${service.name}`
                              }
                              style={({ pressed }) => [
                                styles.cardCtaBtn,
                                {
                                  backgroundColor: isServicePaused
                                    ? colors.slatePillBg
                                    : colors.primary,
                                  borderRadius: radii.full,
                                  paddingHorizontal: spacing.lg,
                                  paddingVertical: spacing.sm,
                                  opacity: isServicePaused ? 0.7 : pressed ? 0.86 : 1,
                                },
                              ]}
                            >
                              <Text
                                style={[
                                  typography.labelMd,
                                  {
                                    color: isServicePaused ? colors.mutedText : colors.onPrimary,
                                  },
                                ]}
                              >
                                {isServicePaused ? 'Booking Paused' : 'Schedule'}
                              </Text>
                            </Pressable>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </View>
              ) : null}
            </View>
          )}
        </View>
      </Animated.ScrollView>

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
  scrollContent: {
    width: '100%',
    alignItems: 'center',
  },
  maxWidthWrap: {
    width: '100%',
    maxWidth: 680,
  },
  searchInputBar: {
    minHeight: 50,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
  },
  searchInput: {
    flex: 1,
    minHeight: 44,
    paddingVertical: 6,
  },
  clearBtn: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterCircleBtn: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  extraFiltersRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  toggleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
  },
  categoryPillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 2,
  },
  categoryPill: {
    borderWidth: 1,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyStateCard: {
    borderWidth: 1,
    alignItems: 'center',
  },
  emptyCircle: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerText: {
    textAlign: 'center',
  },
  resetBtn: {
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  groupLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    flex: 1,
  },
  sectionDot: {
    width: 8,
    height: 8,
  },
  groupCountPill: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  seeAllLink: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  resultCard: {
    borderWidth: 1,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  avatarContainer: {
    position: 'relative',
    width: 56,
    height: 56,
  },
  squareAvatar: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  squareAvatarImg: {
    width: 56,
    height: 56,
  },
  serviceIconSquare: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifiedCornerBadge: {
    position: 'absolute',
    right: -3,
    bottom: -3,
    width: 20,
    height: 20,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  innerStatusDot: {
    width: 8,
    height: 8,
  },
  cardMainCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  titleBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  flexTitle: {
    flex: 1,
  },
  topRightPill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
  },
  tagsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  tagPill: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  affiliationChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
  },
  cardBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bottomMetaLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
  },
  cardCtaBtn: {
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

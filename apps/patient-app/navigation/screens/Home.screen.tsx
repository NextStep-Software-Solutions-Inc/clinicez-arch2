import React, { useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useUser } from '@clerk/expo';
import { LinearGradient } from 'expo-linear-gradient';
import ThemedText from '../../components/ui/ThemedText';
import ThemedView from '../../components/ui/ThemedView';
import EmptyState from '../../components/ui/EmptyState';
import { SkeletonCard } from '../../components/ui/Skeleton';
import Card from '../../components/ui/Card';
import Badge, { type BadgeTone } from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import ClinicEzLogo from '../../components/ui/ClinicEzLogo';
import { AppIcon } from '../../components/ui/Icon';
import { SectionHeader } from '../../components/ui/Primitives';
import { useAppTheme } from '../../contexts/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useContentInsets } from '../../hooks/useContentInsets';
import { usePatientId } from '../../hooks/usePatientId';
import { useNotificationContext } from '../../contexts/NotificationContext';
import { useYakapRegistrationStatus } from '../../hooks/useYakapRegistrationStatus';
import { desc, eq } from 'drizzle-orm';
import { differenceInCalendarDays, parseISO } from 'date-fns';
import { getHomeDashboard } from '../../services/discovery/discoveryService';
import { HomeDashboard, AppointmentLineupItem } from '../../services/discovery/types';
import YakapPromoCard from '../../components/yakap/YakapPromoCard';
import YakapActiveCard from '../../components/yakap/YakapActiveCard';
import { db } from '../../db/index';
import { consultations, type Consultation } from '../../db/schema/consultations';
import { vitalSigns, type VitalSign } from '../../db/schema/vitalSigns';
import AfterVisitSummaryCard from '../../components/records/AfterVisitSummaryCard';

interface DisplayAppointment {
  id: string;
  clinicId?: string;
  clinicName: string;
  doctorName: string;
  specialty: string;
  timeLabel: string;
  badgeLabel: string;
  badgeTone: BadgeTone;
  isCheckInEligible?: boolean;
}

interface MedicationScheduleItem {
  id: string;
  name: string;
  dosage: string;
  instruction: string;
  isTaken: boolean;
}

export default function HomeScreen() {
  const { colors, spacing, radii, shadows, sizes } = useAppTheme();
  const navigation = useNavigation<any>();
  const { user } = useUser();
  const patientId = usePatientId();
  const insets = useSafeAreaInsets();
  const contentInsets = useContentInsets();
  const { unreadCount } = useNotificationContext();
  const yakapStatus = useYakapRegistrationStatus(patientId);

  const [dashboard, setDashboard] = useState<HomeDashboard | null>(null);
  const [recentConsultation, setRecentConsultation] = useState<Consultation | null>(null);
  const [recentVitals, setRecentVitals] = useState<VitalSign | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showQrModal, setShowQrModal] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  // Interactive medication checklist
  const [medications, setMedications] = useState<MedicationScheduleItem[]>([
    {
      id: 'med-1',
      name: 'Lisinopril',
      dosage: '10mg',
      instruction: '1 tablet with breakfast • Taken at 8:15 AM',
      isTaken: true,
    },
    {
      id: 'med-2',
      name: 'Omega-3 DHA',
      dosage: '1000mg',
      instruction: '1 softgel after dinner • 7:00 PM',
      isTaken: false,
    },
  ]);

  useEffect(() => {
    let mounted = true;
    const load = () => {
      setIsLoading(true);
      getHomeDashboard(patientId)
        .then((value) => {
          if (mounted) setDashboard(value);
        })
        .finally(() => {
          if (mounted) setIsLoading(false);
        });

      if (patientId) {
        Promise.all([
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
        ])
          .then(([cList, vList]) => {
            if (!mounted) return;
            const c = cList[0] ?? null;
            if (c && c.visitDate) {
              try {
                const diff = differenceInCalendarDays(new Date(), parseISO(c.visitDate));
                if (diff >= 0 && diff <= 7) {
                  setRecentConsultation(c);
                  setRecentVitals(vList[0] ?? null);
                } else {
                  setRecentConsultation(null);
                }
              } catch {
                setRecentConsultation(null);
              }
            } else {
              setRecentConsultation(null);
            }
          })
          .catch(console.error);
      }

      void yakapStatus.refresh();
    };

    load();
    const unsub = navigation.addListener('focus', load);

    return () => {
      mounted = false;
      unsub();
    };
  }, [navigation, patientId]);

  const greetingName = useMemo(
    () => dashboard?.greetingName ?? user?.firstName ?? 'Sarah',
    [dashboard, user],
  );

  const patientFullName = useMemo(() => {
    if (user?.fullName) return user.fullName;
    if (user?.firstName) return `${user.firstName} ${user.lastName ?? ''}`.trim();
    if (dashboard?.greetingName && dashboard.greetingName !== 'Patient') return dashboard.greetingName;
    return 'Sarah Jenkins';
  }, [user, dashboard]);

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

  // Appointments mapped to display cards
  const displayAppointments: DisplayAppointment[] = useMemo(() => {
    const rawItems = dashboard?.nextAppointments ?? [];
    if (rawItems.length === 0) {
      return [];
    }

    return rawItems.map((item, idx) => {
      const isFirst = idx === 0;
      return {
        id: item.id,
        clinicId: item.clinicId,
        clinicName:
          item.subtitle && !item.subtitle.includes('Clinic draft')
            ? item.subtitle
            : isFirst
              ? 'Metro Cardiology Center • Suite 402'
              : 'Oakwood Primary Care & Wellness',
        doctorName:
          item.title && !item.title.toLowerCase().includes('booking draft')
            ? item.title
            : isFirst
              ? 'Dr. Evelyn Reed, MD'
              : 'Dr. David Chen, MD',
        specialty: isFirst ? 'Cardiology Specialist' : 'Family Medicine & Preventive',
        timeLabel:
          item.dateLabel && item.dateLabel !== 'TBD'
            ? `${item.dateLabel} • ${item.timeLabel}`
            : isFirst
              ? 'Tomorrow, 10:30 AM (Check-in 10:15 AM)'
              : 'Friday, Oct 27 • 2:00 PM',
        badgeLabel: item.status === 'draft' ? 'Draft' : isFirst ? 'Tomorrow' : 'Confirmed',
        badgeTone: item.status === 'draft' ? 'warning' : isFirst ? 'primary' : 'success',
        isCheckInEligible: isFirst && item.status !== 'draft',
      };
    });
  }, [dashboard?.nextAppointments]);

  const handleToggleMedication = (id: string) => {
    setMedications((prev) =>
      prev.map((item) => (item.id === id ? { ...item, isTaken: !item.isTaken } : item)),
    );
  };

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetY = event.nativeEvent.contentOffset.y;
    const nextScrolled = offsetY > 16;
    if (nextScrolled !== isScrolled) {
      setIsScrolled(nextScrolled);
    }
  };

  const handleSearchSubmit = () => {
    navigation.navigate('Main', {
      screen: 'ExploreClinicsScreen',
      params: { query: searchQuery } as any,
    });
  };

  return (
    <ThemedView style={styles.screenWrapper}>
      {/* Top Floating App Bar */}
      <View
        style={[
          styles.appHeader,
          {
            paddingTop: insets.top > 0 ? insets.top : spacing.md,
            paddingHorizontal: spacing.lg,
            backgroundColor: isScrolled ? colors.surface : colors.background,
            borderBottomColor: isScrolled ? colors.borderLight : colors.transparent,
          },
          isScrolled ? shadows.sm : shadows.none,
        ]}
      >
        <View style={styles.headerLeft}>
          <ClinicEzLogo size={32} showWordmark={true} subtitle="Open Health Network" />
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
                    backgroundColor: colors.emergency,
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

      <ScrollView
        onScroll={handleScroll}
        scrollEventThrottle={16}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[
          styles.container,
          { paddingBottom: contentInsets.bottom + spacing['2xl'] },
        ]}
      >
        {/* Interactive Search Bar with Micro-interactions */}
        <View style={styles.searchBarWrapper}>
          <View
            style={[
              styles.searchBarContainer,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
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
              placeholder="Search medical records, doctors, and tests..."
              placeholderTextColor={colors.textLight}
              value={searchQuery}
              onChangeText={setSearchQuery}
              onSubmitEditing={handleSearchSubmit}
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
            ) : null}
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

        {/* PulseCare / ClinicEZ Health Pass Card */}
        <LinearGradient
          colors={[colors.primary, colors.primaryDark]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            styles.healthPassCard,
            {
              borderRadius: radii.xl,
              padding: spacing.lg,
              gap: spacing.sm,
            },
            shadows.md,
          ]}
        >
          {/* Top Bar: Contactless & Verified Shield */}
          <View style={styles.healthPassHeader}>
            <View style={styles.passHeaderBrand}>
              <View
                style={[
                  styles.contactlessIconWrap,
                  {
                    backgroundColor: colors.surfaceSubtle,
                    borderRadius: radii.sm,
                  },
                ]}
              >
                <AppIcon name="activity" size={sizes.iconSm} color="primary" />
              </View>
              <ThemedText variant="captionBold" color="onPrimary" style={styles.trackingWide}>
                CLINIC EZ • HEALTH PASS
              </ThemedText>
            </View>
            <View style={styles.verifiedWrap}>
              <AppIcon name="shield" size={sizes.iconSm} color="onPrimary" />
            </View>
          </View>

          {/* Middle: Patient Name & Verification Badges */}
          <View style={styles.patientInfoBlock}>
            <View style={styles.nameRow}>
              <ThemedText variant="h2" color="onPrimary" numberOfLines={1} style={styles.patientName}>
                {patientFullName}
              </ThemedText>
              <AppIcon name="checkCircle" size={sizes.iconMd} color="onPrimary" />
            </View>

            <View style={styles.badgesRow}>
              <View
                style={[
                  styles.patientIdBadge,
                  {
                    backgroundColor: colors.surface,
                    borderRadius: radii.full,
                    paddingHorizontal: spacing.sm,
                    paddingVertical: spacing.xxs,
                  },
                ]}
              >
                <ThemedText variant="code" color="primaryText">
                  {patientIdCode}
                </ThemedText>
              </View>

              <View
                style={[
                  styles.bloodBadge,
                  {
                    borderColor: colors.primaryLight,
                    borderWidth: sizes.borderWidth,
                    borderRadius: radii.full,
                    paddingHorizontal: spacing.sm,
                    paddingVertical: spacing.xxs,
                  },
                ]}
              >
                <ThemedText variant="captionBold" color="onPrimary">
                  Blood Group: A+
                </ThemedText>
              </View>
            </View>
          </View>

          {/* Bottom Bar: NFC Terminal Prompt & View Card Button */}
          <View style={styles.healthPassFooter}>
            <View style={styles.nfcHintWrap}>
              <AppIcon name="qrCode" size={sizes.iconSm} color="onPrimary" />
              <ThemedText variant="caption" color="onPrimary" numberOfLines={1}>
                Tap terminal or present barcode
              </ThemedText>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="View Health Pass Card"
              onPress={() => setShowQrModal(true)}
              style={({ pressed }) => [
                styles.viewCardButton,
                {
                  backgroundColor: colors.surface,
                  borderRadius: radii.full,
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.xs,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <ThemedText variant="smallBold" color="primaryText">
                View Card
              </ThemedText>
              <AppIcon name="chevronRight" size={sizes.iconSm} color="primary" />
            </Pressable>
          </View>
        </LinearGradient>

        {/* Quick Care Actions (4-Column Bento Tiles) */}
        <View style={styles.sectionWrap}>
          <View style={styles.sectionHeaderRow}>
            <ThemedText variant="title">Quick Actions</ThemedText>
            <ThemedText variant="captionBold" color="primaryText">
              Self-Service
            </ThemedText>
          </View>

          <View style={styles.quickActionsGrid}>
            {/* 1. Reach Dr. */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Reach doctor through direct chat"
              onPress={() => navigation.navigate('Main', { screen: 'MessagesInboxScreen' })}
              style={({ pressed }) => [
                styles.quickActionTile,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  borderWidth: sizes.borderWidth,
                  borderRadius: radii.lg,
                  padding: spacing.sm,
                  opacity: pressed ? 0.85 : 1,
                },
                shadows.sm,
              ]}
            >
              <View
                style={[
                  styles.quickActionIconWrap,
                  {
                    backgroundColor: colors.primarySubtle,
                    borderRadius: radii.full,
                  },
                ]}
              >
                <AppIcon name="stethoscope" size={sizes.iconLg} color="primary" />
              </View>
              <ThemedText variant="smallBold" numberOfLines={1} style={styles.quickActionTitle}>
                Reach Dr.
              </ThemedText>
              <ThemedText variant="caption" color="textMuted" numberOfLines={1}>
                Direct Chat
              </ThemedText>
            </Pressable>

            {/* 2. Services */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Explore clinics and care packages"
              onPress={() => navigation.navigate('Main', { screen: 'ExploreClinicsScreen' })}
              style={({ pressed }) => [
                styles.quickActionTile,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  borderWidth: sizes.borderWidth,
                  borderRadius: radii.lg,
                  padding: spacing.sm,
                  opacity: pressed ? 0.85 : 1,
                },
                shadows.sm,
              ]}
            >
              <View
                style={[
                  styles.quickActionIconWrap,
                  {
                    backgroundColor: colors.successBg,
                    borderRadius: radii.full,
                  },
                ]}
              >
                <AppIcon name="hospital" size={sizes.iconLg} color="success" />
              </View>
              <ThemedText variant="smallBold" numberOfLines={1} style={styles.quickActionTitle}>
                Services
              </ThemedText>
              <ThemedText variant="caption" color="textMuted" numberOfLines={1}>
                Packages
              </ThemedText>
            </Pressable>

            {/* 3. Records */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open medical records and lab results"
              onPress={() => navigation.navigate('RecordsScreen')}
              style={({ pressed }) => [
                styles.quickActionTile,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  borderWidth: sizes.borderWidth,
                  borderRadius: radii.lg,
                  padding: spacing.sm,
                  opacity: pressed ? 0.85 : 1,
                },
                shadows.sm,
              ]}
            >
              <View
                style={[
                  styles.quickActionIconWrap,
                  {
                    backgroundColor: colors.infoBg,
                    borderRadius: radii.full,
                  },
                ]}
              >
                <AppIcon name="folder" size={sizes.iconLg} color="info" />
              </View>
              <ThemedText variant="smallBold" numberOfLines={1} style={styles.quickActionTitle}>
                Records
              </ThemedText>
              <ThemedText variant="caption" color="textMuted" numberOfLines={1}>
                Charts & Labs
              </ThemedText>
            </Pressable>

            {/* 4. Prescriptions */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="View prescriptions and refills"
              onPress={() => navigation.navigate('Main', { screen: 'PrescriptionsScreen' })}
              style={({ pressed }) => [
                styles.quickActionTile,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  borderWidth: sizes.borderWidth,
                  borderRadius: radii.lg,
                  padding: spacing.sm,
                  opacity: pressed ? 0.85 : 1,
                },
                shadows.sm,
              ]}
            >
              <View
                style={[
                  styles.quickActionIconWrap,
                  {
                    backgroundColor: colors.purpleBg,
                    borderRadius: radii.full,
                  },
                ]}
              >
                <AppIcon name="pill" size={sizes.iconLg} color="purple" />
              </View>
              <ThemedText variant="smallBold" numberOfLines={1} style={styles.quickActionTitle}>
                Prescriptions
              </ThemedText>
              <ThemedText variant="caption" color="textMuted" numberOfLines={1}>
                Refills
              </ThemedText>
            </Pressable>
          </View>
        </View>

        {/* Appointments Section with Multi-card Carousel & Empty State Variants */}
        <View style={styles.sectionWrap}>
          <View style={styles.sectionHeaderRow}>
            <View style={styles.appointmentsTitleRow}>
              <View
                style={[
                  styles.pulseDot,
                  {
                    backgroundColor: colors.primary,
                    borderRadius: radii.full,
                  },
                ]}
              />
              <ThemedText variant="title">Appointments</ThemedText>
              <Badge
                label={`${displayAppointments.length} Scheduled`}
                tone={displayAppointments.length > 0 ? 'primary' : 'neutral'}
                size="sm"
              />
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="View all appointments"
              onPress={() =>
                navigation.navigate('Main', {
                  screen: 'BottomTabs',
                  params: { screen: 'AppointmentsScreen' },
                })
              }
              style={styles.viewAllRow}
            >
              <ThemedText variant="smallBold" color="primaryText">
                View All
              </ThemedText>
              <AppIcon name="chevronRight" size={sizes.iconSm} color="primary" />
            </Pressable>
          </View>

          {isLoading && !dashboard ? (
            <SkeletonCard />
          ) : displayAppointments.length > 0 ? (
            <FlatList
              data={displayAppointments}
              keyExtractor={(item) => item.id}
              horizontal
              showsHorizontalScrollIndicator={false}
              ItemSeparatorComponent={() => <View style={{ width: spacing.md }} />}
              renderItem={({ item }) => (
                <View
                  style={[
                    styles.appointmentCarouselCard,
                    {
                      backgroundColor: colors.card,
                      borderColor: colors.border,
                      borderWidth: sizes.borderWidth,
                      borderRadius: radii.xl,
                      padding: spacing.md,
                      gap: spacing.sm,
                    },
                    shadows.sm,
                  ]}
                >
                  {/* Clinic Header */}
                  <View
                    style={[
                      styles.appointmentCardTop,
                      {
                        borderBottomColor: colors.borderLight,
                        borderBottomWidth: sizes.borderWidth,
                        paddingBottom: spacing.xs,
                      },
                    ]}
                  >
                    <View style={styles.clinicMetaRow}>
                      <AppIcon name="hospital" size={sizes.iconSm} color="primary" />
                      <ThemedText
                        variant="caption"
                        color="textSecondary"
                        numberOfLines={1}
                        style={styles.flex}
                      >
                        {item.clinicName}
                      </ThemedText>
                    </View>
                    <Badge label={item.badgeLabel} tone={item.badgeTone} size="sm" />
                  </View>

                  {/* Doctor Info */}
                  <View style={styles.doctorInfoRow}>
                    <View
                      style={[
                        styles.doctorAvatarWrap,
                        {
                          backgroundColor: colors.primarySubtle,
                          borderColor: colors.primaryBorder,
                          borderWidth: sizes.borderWidth,
                          borderRadius: radii.full,
                        },
                      ]}
                    >
                      <AppIcon name="user" size={sizes.iconLg} color="primary" />
                    </View>
                    <View style={styles.doctorDetails}>
                      <ThemedText variant="bodyBold" numberOfLines={1}>
                        {item.doctorName}
                      </ThemedText>
                      <ThemedText variant="caption" color="textSecondary" numberOfLines={1}>
                        {item.specialty}
                      </ThemedText>
                      <View style={styles.appointmentTimeRow}>
                        <AppIcon name="clock" size={14} color="primary" />
                        <ThemedText variant="captionBold" color="primaryText" numberOfLines={1}>
                          {item.timeLabel}
                        </ThemedText>
                      </View>
                    </View>
                  </View>

                  {/* Action Buttons */}
                  <View
                    style={[
                      styles.appointmentActionsRow,
                      {
                        borderTopColor: colors.borderLight,
                        borderTopWidth: sizes.borderWidth,
                        paddingTop: spacing.sm,
                      },
                    ]}
                  >
                    <Button
                      label={item.isCheckInEligible ? 'Check in' : 'Manage Visit'}
                      variant={item.isCheckInEligible ? 'primary' : 'outline'}
                      size="sm"
                      icon={item.isCheckInEligible ? 'checkCircle' : 'calendar'}
                      style={styles.flex}
                      onPress={() =>
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
                    />
                    <Button
                      label="Directions"
                      variant="outline"
                      size="sm"
                      icon="location"
                      style={styles.flex}
                      onPress={() =>
                        item.clinicId
                          ? navigation.navigate('Main', {
                              screen: 'ClinicDetailsScreen',
                              params: { clinicId: item.clinicId } as any,
                            })
                          : navigation.navigate('Main', { screen: 'ExploreClinicsScreen' })
                      }
                    />
                  </View>
                </View>
              )}
            />
          ) : (
            <Card padding="md" style={styles.emptyAppointmentsCard}>
              <View
                style={[
                  styles.emptyCalendarIconWrap,
                  {
                    backgroundColor: colors.primarySubtle,
                    borderRadius: radii.full,
                  },
                ]}
              >
                <AppIcon name="calendar" size={sizes.iconXl} color="primary" />
              </View>
              <ThemedText variant="h3" style={styles.textCenter}>
                No Upcoming Consultations
              </ThemedText>
              <ThemedText variant="small" color="textSecondary" style={styles.textCenter}>
                You don't have any appointments scheduled across network clinics.
              </ThemedText>
              <View style={styles.emptyActionButtonsRow}>
                <Button
                  label="Book an Appointment"
                  variant="primary"
                  size="sm"
                  icon="plus"
                  onPress={() => navigation.navigate('Main', { screen: 'ExploreClinicsScreen' })}
                />
                <Button
                  label="Browse Clinics"
                  variant="outline"
                  size="sm"
                  onPress={() => navigation.navigate('Main', { screen: 'ExploreClinicsScreen' })}
                />
              </View>
            </Card>
          )}
        </View>

        {/* Recent Vitals 2x2 Bento Telemetry Grid */}
        <View style={styles.sectionWrap}>
          <View style={styles.sectionHeaderRow}>
            <View>
              <ThemedText variant="title">Recent Vitals</ThemedText>
              <View style={styles.vitalsSubRow}>
                <AppIcon name="sync" size={12} color="primary" />
                <ThemedText variant="caption" color="textMuted">
                  Apple Health • Updated recently
                </ThemedText>
              </View>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="View vitals history"
              onPress={() => navigation.navigate('Main', { screen: 'VitalSignsScreen' })}
              style={styles.viewAllRow}
            >
              <ThemedText variant="smallBold" color="primaryText">
                History
              </ThemedText>
              <AppIcon name="chevronRight" size={sizes.iconSm} color="primary" />
            </Pressable>
          </View>

          <View style={styles.bentoGrid}>
            {/* Vital 1: Heart Rate */}
            <View
              style={[
                styles.bentoTile,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  borderWidth: sizes.borderWidth,
                  borderRadius: radii.lg,
                  padding: spacing.md,
                },
                shadows.sm,
              ]}
            >
              <View style={styles.bentoTileHeader}>
                <View
                  style={[
                    styles.vitalIconBadge,
                    {
                      backgroundColor: colors.emergencyBg,
                      borderRadius: radii.sm,
                    },
                  ]}
                >
                  <AppIcon name="heartPulse" size={sizes.iconMd} color="emergency" />
                </View>
                <Badge label="Resting" tone="neutral" size="sm" />
              </View>

              <View style={styles.metricValGroup}>
                <ThemedText variant="caption" color="textSecondary">
                  Heart Rate
                </ThemedText>
                <View style={styles.metricRow}>
                  <ThemedText variant="h1">
                    {recentVitals?.heartRateBpm ?? 72}
                  </ThemedText>
                  <ThemedText variant="caption" color="textSecondary" style={styles.metricUnit}>
                    bpm
                  </ThemedText>
                </View>
              </View>

              <View style={styles.trendRow}>
                <AppIcon name="activity" size={14} color="emergency" />
                <ThemedText variant="captionBold" color="emergency">
                  +2 bpm trend
                </ThemedText>
              </View>
            </View>

            {/* Vital 2: Blood Pressure */}
            <View
              style={[
                styles.bentoTile,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  borderWidth: sizes.borderWidth,
                  borderRadius: radii.lg,
                  padding: spacing.md,
                },
                shadows.sm,
              ]}
            >
              <View style={styles.bentoTileHeader}>
                <View
                  style={[
                    styles.vitalIconBadge,
                    {
                      backgroundColor: colors.primarySubtle,
                      borderRadius: radii.sm,
                    },
                  ]}
                >
                  <AppIcon name="activity" size={sizes.iconMd} color="primary" />
                </View>
                <Badge label="Optimal" tone="success" size="sm" />
              </View>

              <View style={styles.metricValGroup}>
                <ThemedText variant="caption" color="textSecondary">
                  Blood Pressure
                </ThemedText>
                <View style={styles.metricRow}>
                  <ThemedText variant="h2">
                    {recentVitals?.bpSystolic && recentVitals?.bpDiastolic
                      ? `${recentVitals.bpSystolic}/${recentVitals.bpDiastolic}`
                      : '118/76'}
                  </ThemedText>
                  <ThemedText variant="caption" color="textSecondary" style={styles.metricUnit}>
                    mmHg
                  </ThemedText>
                </View>
              </View>

              <View style={styles.trendRow}>
                <AppIcon name="checkCircle" size={14} color="success" />
                <ThemedText variant="captionBold" color="success">
                  Stable • Sys/Dia
                </ThemedText>
              </View>
            </View>

            {/* Vital 3: Blood Glucose */}
            <View
              style={[
                styles.bentoTile,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  borderWidth: sizes.borderWidth,
                  borderRadius: radii.lg,
                  padding: spacing.md,
                },
                shadows.sm,
              ]}
            >
              <View style={styles.bentoTileHeader}>
                <View
                  style={[
                    styles.vitalIconBadge,
                    {
                      backgroundColor: colors.infoBg,
                      borderRadius: radii.sm,
                    },
                  ]}
                >
                  <AppIcon name="lab" size={sizes.iconMd} color="info" />
                </View>
                <Badge label="Fasting" tone="neutral" size="sm" />
              </View>

              <View style={styles.metricValGroup}>
                <ThemedText variant="caption" color="textSecondary">
                  Blood Glucose
                </ThemedText>
                <View style={styles.metricRow}>
                  <ThemedText variant="h1">
                    {recentVitals?.fastingBloodGlucose
                      ? Number(recentVitals.fastingBloodGlucose).toFixed(0)
                      : '94'}
                  </ThemedText>
                  <ThemedText variant="caption" color="textSecondary" style={styles.metricUnit}>
                    mg/dL
                  </ThemedText>
                </View>
              </View>

              <View style={styles.trendRow}>
                <ThemedText variant="caption" color="textSecondary">
                  Normal: 70–99
                </ThemedText>
              </View>
            </View>

            {/* Vital 4: Sleep Total / Oxygen */}
            <View
              style={[
                styles.bentoTile,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  borderWidth: sizes.borderWidth,
                  borderRadius: radii.lg,
                  padding: spacing.md,
                },
                shadows.sm,
              ]}
            >
              <View style={styles.bentoTileHeader}>
                <View
                  style={[
                    styles.vitalIconBadge,
                    {
                      backgroundColor: colors.purpleBg,
                      borderRadius: radii.sm,
                    },
                  ]}
                >
                  <AppIcon name="clock" size={sizes.iconMd} color="purple" />
                </View>
                <Badge label="+12%" tone="success" size="sm" />
              </View>

              <View style={styles.metricValGroup}>
                <ThemedText variant="caption" color="textSecondary">
                  Sleep Duration
                </ThemedText>
                <View style={styles.metricRow}>
                  <ThemedText variant="h1">
                    {recentVitals?.spO2Percent ? `${Number(recentVitals.spO2Percent).toFixed(0)}%` : '7h 45m'}
                  </ThemedText>
                </View>
              </View>

              <View style={styles.trendRow}>
                <ThemedText variant="caption" color="textSecondary">
                  {recentVitals?.spO2Percent ? 'Oxygen saturation' : 'Deep: 2h 10m'}
                </ThemedText>
              </View>
            </View>
          </View>
        </View>

        {/* Today's Care & Medication Schedule */}
        <View style={styles.sectionWrap}>
          <View style={styles.sectionHeaderRow}>
            <View style={styles.scheduleTitleRow}>
              <ThemedText variant="title">Today's Schedule</ThemedText>
              <View
                style={[
                  styles.countPill,
                  {
                    backgroundColor: colors.primaryLight,
                    borderRadius: radii.full,
                  },
                ]}
              >
                <ThemedText variant="captionBold" color="primaryText">
                  {medications.length}
                </ThemedText>
              </View>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Manage all prescriptions"
              onPress={() => navigation.navigate('Main', { screen: 'PrescriptionsScreen' })}
            >
              <ThemedText variant="smallBold" color="primaryText">
                Manage All
              </ThemedText>
            </Pressable>
          </View>

          <View style={styles.medicationsList}>
            {medications.map((item) => (
              <View
                key={item.id}
                style={[
                  styles.medicationCard,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    borderWidth: sizes.borderWidth,
                    borderRadius: radii.lg,
                    padding: spacing.md,
                  },
                  shadows.sm,
                ]}
              >
                <View style={styles.medicationLeft}>
                  <View
                    style={[
                      styles.medicationIconWrap,
                      {
                        backgroundColor: item.isTaken ? colors.successBg : colors.primarySubtle,
                        borderRadius: radii.full,
                      },
                    ]}
                  >
                    <AppIcon
                      name={item.isTaken ? 'checkCircle' : 'clock'}
                      size={sizes.iconMd}
                      color={item.isTaken ? 'success' : 'primary'}
                    />
                  </View>

                  <View style={styles.medicationDetails}>
                    <View style={styles.medNameRow}>
                      <ThemedText variant="bodyBold" numberOfLines={1}>
                        {item.name}
                      </ThemedText>
                      <ThemedText variant="caption" color="textSecondary">
                        {item.dosage}
                      </ThemedText>
                    </View>
                    <ThemedText variant="caption" color="textSecondary" numberOfLines={1}>
                      {item.instruction}
                    </ThemedText>
                  </View>
                </View>

                {item.isTaken ? (
                  <Badge label="Taken" tone="success" size="sm" />
                ) : (
                  <Button
                    label="Log Now"
                    variant="primary"
                    size="sm"
                    onPress={() => handleToggleMedication(item.id)}
                  />
                )}
              </View>
            ))}
          </View>
        </View>

        {/* PhilHealth YAKAP Benefit Card */}
        {yakapStatus.isConfirmedRegistered ? (
          <YakapActiveCard
            philhealthPin={yakapStatus.philhealthPin}
            assignedClinicName={yakapStatus.assignedClinicName}
            gamotUsed={yakapStatus.gamotUsed}
            annualAllocation={yakapStatus.annualAllocation}
          />
        ) : (
          <YakapPromoCard />
        )}

        {/* 7-Day Pinned After-Visit Summary (AVS) Card */}
        {recentConsultation ? (
          <View style={styles.sectionWrap}>
            <SectionHeader title="Recent Visit Summary" />
            <AfterVisitSummaryCard
              consultation={recentConsultation}
              vitals={recentVitals}
              isPinned={true}
              onBookFollowUp={() => navigation.navigate('Main', { screen: 'BookingDraftScreen' })}
              onMessageClinic={() =>
                navigation.navigate('Main', { screen: 'MessagesInboxScreen' })
              }
            />
          </View>
        ) : null}

        {/* Warm Human Care Tip / Daily Mindful Moment Banner */}
        <View
          style={[
            styles.mindfulBanner,
            {
              backgroundColor: colors.surfaceSubtle,
              borderColor: colors.borderLight,
              borderWidth: sizes.borderWidth,
              borderRadius: radii.xl,
              padding: spacing.lg,
            },
          ]}
        >
          <View
            style={[
              styles.mindfulIconWrap,
              {
                backgroundColor: colors.primaryLight,
                borderRadius: radii.md,
              },
            ]}
          >
            <AppIcon name="wellness" size={sizes.iconLg} color="primary" />
          </View>
          <View style={styles.mindfulContent}>
            <ThemedText variant="captionBold" color="primaryText" style={styles.trackingWide}>
              DAILY MINDFUL MOMENT
            </ThemedText>
            <ThemedText variant="small" color="text">
              Hydration check: drinking 500ml water after lunch helps stabilize cardiovascular pressure.
            </ThemedText>
          </View>
        </View>
      </ScrollView>

      {/* Enlarged Health Pass QR Code Modal */}
      <Modal
        visible={showQrModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowQrModal(false)}
      >
        <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
          <View
            style={[
              styles.modalCard,
              {
                backgroundColor: colors.card,
                borderRadius: radii.xl,
                padding: spacing.xl,
                borderColor: colors.border,
                borderWidth: sizes.borderWidth,
              },
              shadows.lg,
            ]}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close enlarged QR code"
              onPress={() => setShowQrModal(false)}
              style={({ pressed }) => [
                styles.modalCloseBtn,
                {
                  backgroundColor: colors.surfaceSubtle,
                  borderRadius: radii.full,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <AppIcon name="close" size={sizes.iconMd} color="textSecondary" />
            </Pressable>

            <Badge label="VERIFIED HEALTH PASS" tone="success" size="sm" icon="checkCircle" />

            <View style={styles.modalHeaderInfo}>
              <ThemedText variant="h2" style={styles.textCenter}>
                {patientFullName}
              </ThemedText>
              <ThemedText variant="caption" color="textSecondary" style={styles.textCenter}>
                {patientIdCode} • Blood Group: A+ Pos
              </ThemedText>
            </View>

            {/* QR Code Container */}
            <View
              style={[
                styles.qrBox,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.borderLight,
                  borderWidth: sizes.borderWidth,
                  borderRadius: radii.lg,
                  padding: spacing.xl,
                },
              ]}
            >
              <AppIcon name="qrCode" size={160} color="text" />
              <View
                style={[
                  styles.securityPill,
                  {
                    backgroundColor: colors.surfaceInverse,
                    borderRadius: radii.full,
                    paddingHorizontal: spacing.md,
                    paddingVertical: spacing.xxs,
                  },
                ]}
              >
                <ThemedText variant="captionBold" color="onPrimary">
                  CLINIC-EZ-VERIFIED
                </ThemedText>
              </View>
            </View>

            {/* Brightness note */}
            <View
              style={[
                styles.brightnessNote,
                {
                  backgroundColor: colors.surfaceSubtle,
                  borderRadius: radii.full,
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.xs,
                },
              ]}
            >
              <AppIcon name="info" size={sizes.iconSm} color="primary" />
              <ThemedText variant="caption" color="textSecondary">
                Screen brightness automatically optimized
              </ThemedText>
            </View>

            <Button
              label="Done / Tap to Dismiss"
              variant="primary"
              fullWidth
              onPress={() => setShowQrModal(false)}
            />
          </View>
        </View>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  textCenter: {
    textAlign: 'center',
  },
  trackingWide: {
    letterSpacing: 0.8,
  },
  screenWrapper: {
    flex: 1,
  },
  appHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 10,
    borderBottomWidth: 1,
    zIndex: 10,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerIconButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  unreadBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 8,
    height: 8,
  },
  avatarButton: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  container: {
    padding: 16,
    gap: 16,
  },
  searchBarWrapper: {
    width: '100%',
  },
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
  },
  searchInput: {
    flex: 1,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  searchActionBtn: {
    padding: 6,
  },
  healthPassCard: {
    minHeight: 160,
    justifyContent: 'space-between',
  },
  healthPassHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  passHeaderBrand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  contactlessIconWrap: {
    padding: 4,
  },
  verifiedWrap: {
    padding: 2,
  },
  patientInfoBlock: {
    gap: 6,
    marginVertical: 4,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  patientName: {
    letterSpacing: -0.3,
  },
  badgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  patientIdBadge: {
    alignSelf: 'flex-start',
  },
  bloodBadge: {
    alignSelf: 'flex-start',
  },
  healthPassFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 4,
  },
  nfcHintWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  viewCardButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  sectionWrap: {
    gap: 12,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  viewAllRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  quickActionsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  quickActionTile: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 88,
  },
  quickActionIconWrap: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  quickActionTitle: {
    textAlign: 'center',
  },
  appointmentsTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pulseDot: {
    width: 8,
    height: 8,
  },
  appointmentCarouselCard: {
    width: 290,
  },
  appointmentCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  clinicMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    marginRight: 6,
  },
  doctorInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  doctorAvatarWrap: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doctorDetails: {
    flex: 1,
    gap: 2,
  },
  appointmentTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  appointmentActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  emptyAppointmentsCard: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 24,
  },
  emptyCalendarIconWrap: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyActionButtonsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  vitalsSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  bentoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  bentoTile: {
    width: '48%',
    minHeight: 110,
    justifyContent: 'space-between',
  },
  bentoTileHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  vitalIconBadge: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricValGroup: {
    marginVertical: 4,
  },
  metricRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  metricUnit: {
    marginBottom: 2,
  },
  trendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  scheduleTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  countPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  medicationsList: {
    gap: 8,
  },
  medicationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  medicationLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  medicationIconWrap: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  medicationDetails: {
    flex: 1,
    gap: 2,
  },
  medNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  mindfulBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  mindfulIconWrap: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mindfulContent: {
    flex: 1,
    gap: 4,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
    gap: 16,
    position: 'relative',
  },
  modalCloseBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  modalHeaderInfo: {
    gap: 4,
  },
  qrBox: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    width: '100%',
  },
  securityPill: {
    alignSelf: 'center',
  },
  brightnessNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
});

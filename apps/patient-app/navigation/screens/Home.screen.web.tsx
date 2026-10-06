import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useNavigation, useTheme } from '@react-navigation/native';
import { useUser } from '@clerk/expo';
import { LinearGradient } from 'expo-linear-gradient';
import ThemedText from '@ui/ThemedText';
import ThemedView from '@ui/ThemedView';
import EmptyState from '@ui/EmptyState';
import { SkeletonCard } from '@ui/Skeleton';
import { usePatientId } from 'hooks/usePatientId';
import { getHomeDashboard } from '../../services/discovery/discoveryService';
import { HomeDashboard, HealthMetric, AppointmentLineupItem } from '../../services/discovery/types';
import { db } from '@db/index';
import { prescriptions } from '@db/schema/prescriptions';
import { patientGovernmentIds } from '@db/schema/patientGovernmentIds';
import { patientNcdQuestionnaire } from '@db/schema/patientNcdQuestionnaire';
import { eq } from 'drizzle-orm';
import { useNotificationContext } from 'contexts/NotificationContext';
import { AppIcon } from '../../components/ui/Icon';

function MetricCard({ metric }: { metric: HealthMetric }) {
  const { colors, dark: isDark } = useTheme();

  return (
    <View
      style={[
        styles.metricCard,
        {
          borderColor: isDark ? '#334155' : '#E2E8F0',
          backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
        },
      ]}
    >
      <ThemedText style={[styles.metricLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>
        {metric.label}
      </ThemedText>
      <ThemedText style={[styles.metricValue, { color: colors.text }]}>{metric.value}</ThemedText>
      <ThemedText style={[styles.metricNote, { color: isDark ? '#64748B' : '#94A3B8' }]}>
        {metric.note}
      </ThemedText>
    </View>
  );
}

function AppointmentCardWeb({
  item,
  onPress,
}: {
  item: AppointmentLineupItem;
  onPress: () => void;
}) {
  const { colors, dark: isDark } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.appointmentCard,
        {
          borderColor: isDark ? '#334155' : '#E2E8F0',
          backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <View style={styles.appointmentHeader}>
        <ThemedText style={[styles.appointmentTitle, { color: colors.text }]} numberOfLines={1}>
          {item.title}
        </ThemedText>
        <View
          style={[
            styles.badge,
            {
              backgroundColor:
                item.status === 'draft'
                  ? '#F59E0B'
                  : item.status === 'follow-up'
                    ? '#3B82F6'
                    : '#10B981',
            },
          ]}
        >
          <ThemedText style={styles.badgeText}>
            {item.status === 'draft'
              ? 'Draft'
              : item.status === 'follow-up'
                ? 'Follow-up'
                : 'Scheduled'}
          </ThemedText>
        </View>
      </View>
      <ThemedText style={[styles.appointmentSubtitle, { color: isDark ? '#94A3B8' : '#64748B' }]} numberOfLines={1}>
        {item.subtitle}
      </ThemedText>
      <View style={styles.appointmentFooter}>
        <ThemedText style={[styles.appointmentMeta, { color: colors.text }]}>
          📅 {item.dateLabel}
        </ThemedText>
        <ThemedText style={[styles.appointmentMeta, { color: colors.text }]}>
          ⏰ {item.timeLabel}
        </ThemedText>
      </View>
    </Pressable>
  );
}

export default function HomeScreenWeb() {
  const { colors, dark: isDark } = useTheme();
  const navigation = useNavigation<any>();
  const { user } = useUser();
  const patientId = usePatientId();
  const { width } = useWindowDimensions();
  const { unreadCount } = useNotificationContext();

  const [dashboard, setDashboard] = useState<HomeDashboard | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [gamotUsed, setGamotUsed] = useState(0);
  const [hasNcd, setHasNcd] = useState(false);
  const [philhealthPin, setPhilhealthPin] = useState<string | null>(null);

  const isDesktop = width >= 1024;

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
        db.select()
          .from(prescriptions)
          .where(eq(prescriptions.patientId, patientId))
          .then((rxs) => {
            if (!mounted) return;
            const total = rxs
              .filter((r) => r.isPhilHealthGamot)
              .reduce((sum, r) => sum + (r.gamotCoverageAmount ?? 0), 0);
            setGamotUsed(total);
          })
          .catch(console.error);

        db.select()
          .from(patientNcdQuestionnaire)
          .where(eq(patientNcdQuestionnaire.patientId, patientId))
          .then((rows) => {
            if (!mounted) return;
            setHasNcd(rows.length > 0 && !!rows[0].qid1Yn);
          })
          .catch(console.error);

        db.select()
          .from(patientGovernmentIds)
          .where(eq(patientGovernmentIds.patientId, patientId))
          .then((rows) => {
            if (!mounted) return;
            if (rows.length > 0 && rows[0].philhealthId) {
              setPhilhealthPin(rows[0].philhealthId);
            }
          })
          .catch(console.error);
      }
    };

    load();
    const unsub = navigation.addListener('focus', load);

    return () => {
      mounted = false;
      unsub();
    };
  }, [navigation, patientId]);

  const greetingName = useMemo(
    () => dashboard?.greetingName ?? user?.firstName ?? 'Patient',
    [dashboard, user],
  );

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.scrollContent, { paddingBottom: isDesktop ? 32 : 96 }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.container}>
        {/* Mobile / Tablet Top Bar (Only visible on small-to-medium screens where desktop navbar is hidden) */}
        {!isDesktop && (
          <View style={styles.mobileTopBar}>
            <View style={styles.mobileBrand}>
              <View style={styles.mobileLogoBadge}>
                <ThemedText style={styles.mobileLogoText}>CLINIC EZ</ThemedText>
              </View>
              <ThemedText style={[styles.mobilePortalTag, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                Patient Portal
              </ThemedText>
            </View>

            <View style={styles.mobileHeaderIcons}>
              <Pressable
                onPress={() => navigation.navigate('Main', { screen: 'NotificationScreen' })}
                style={styles.mobileHeaderIconBtn}
                accessibilityRole="button"
                accessibilityLabel="Notifications"
              >
                <AppIcon
                  android="notifications"
                  ios="bell.fill"
                  size={22}
                  color={colors.text}
                />
                {unreadCount > 0 && (
                  <View style={styles.mobileBadge}>
                    <ThemedText style={styles.mobileBadgeText}>
                      {unreadCount > 9 ? '9+' : String(unreadCount)}
                    </ThemedText>
                  </View>
                )}
              </Pressable>

              <Pressable
                onPress={() => navigation.navigate('Main', { screen: 'SettingsScreen' })}
                style={styles.mobileHeaderIconBtn}
                accessibilityRole="button"
                accessibilityLabel="Settings"
              >
                <AppIcon android="settings" ios="gear" size={22} color={colors.text} />
              </Pressable>
            </View>
          </View>
        )}

        {/* Hero Banner */}
        <LinearGradient
          colors={isDark ? ['#1E3A8A', '#1E40AF', '#172554'] : ['#3B82F6', '#2563EB', '#1D4ED8']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroCard}
        >
          <View style={styles.heroContent}>
            <View style={styles.heroBadge}>
              <ThemedText style={styles.heroBadgeText}>PATIENT DASHBOARD</ThemedText>
            </View>
            <ThemedText style={styles.heroTitle}>Welcome back, {greetingName}</ThemedText>
            <ThemedText style={styles.heroSubtitle}>
              Here is your healthcare summary, upcoming appointments, and PhilHealth benefit status.
            </ThemedText>
          </View>
        </LinearGradient>

        {/* 2-Column Responsive Layout */}
        <View style={[styles.mainLayout, isDesktop ? styles.desktopLayout : styles.mobileLayout]}>
          {/* Left Column (Primary Focus: Benefits & Appointments) */}
          <View style={isDesktop ? styles.leftColDesktop : styles.fullCol}>
            {/* PhilHealth YAKAP Benefit Card */}
            <View
              style={[
                styles.card,
                {
                  backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
                  borderColor: isDark ? '#334155' : '#E2E8F0',
                },
              ]}
            >
              <View style={styles.yakapHeader}>
                <View style={styles.yakapHeaderLeft}>
                  <ThemedText style={{ fontSize: 28 }}>🇵🇭</ThemedText>
                  <View>
                    <ThemedText style={[styles.cardHeading, { color: colors.text }]}>
                      PhilHealth YAKAP Benefit
                    </ThemedText>
                    <ThemedText
                      style={[styles.cardSubtext, { color: isDark ? '#94A3B8' : '#64748B' }]}
                    >
                      {philhealthPin
                        ? `PIN: ${philhealthPin} • Mod-11 Verified`
                        : 'Link PhilHealth PIN in Profile to activate benefits'}
                    </ThemedText>
                  </View>
                </View>
                <View style={styles.budgetBadge}>
                  <ThemedText style={styles.budgetBadgeText}>₱20,000 / yr</ThemedText>
                </View>
              </View>

              {/* Progress bar */}
              <View style={styles.progressContainer}>
                <View style={styles.progressLabels}>
                  <ThemedText
                    style={[styles.progressTitle, { color: isDark ? '#CBD5E1' : '#334155' }]}
                  >
                    GAMOT Outpatient Drug Allocation
                  </ThemedText>
                  <ThemedText style={styles.progressPercent}>
                    {Math.min(100, Math.round((gamotUsed / 20000) * 100))}% used
                  </ThemedText>
                </View>
                <View
                  style={[
                    styles.progressBarTrack,
                    { backgroundColor: isDark ? '#334155' : '#E2E8F0' },
                  ]}
                >
                  <View
                    style={[
                      styles.progressBarFill,
                      {
                        width: `${Math.min(100, Math.max(gamotUsed > 0 ? 3 : 0, Math.round((gamotUsed / 20000) * 100)))}%`,
                        backgroundColor: '#10B981',
                      },
                    ]}
                  />
                </View>
                <View style={styles.progressLabels}>
                  <ThemedText
                    style={[styles.balanceSub, { color: isDark ? '#94A3B8' : '#64748B' }]}
                  >
                    Claimed: ₱{gamotUsed.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </ThemedText>
                  <ThemedText style={[styles.balanceSub, { fontWeight: '700', color: '#10B981' }]}>
                    Balance: ₱
                    {Math.max(0, 20000 - gamotUsed).toLocaleString('en-US', {
                      minimumFractionDigits: 2,
                    })}
                  </ThemedText>
                </View>
              </View>

              {/* Actions Row */}
              <View style={styles.yakapActionRow}>
                <Pressable
                  style={[
                    styles.yakapActionButton,
                    {
                      backgroundColor: isDark ? '#0F172A' : '#F8FAFC',
                      borderColor: isDark ? '#334155' : '#CBD5E1',
                    },
                  ]}
                  onPress={() => navigation.navigate('Main', { screen: 'NcdQuestionnaireScreen' })}
                >
                  <ThemedText style={[styles.yakapActionText, { color: colors.text }]}>
                    {hasNcd ? '📋 Review NCD (24 Qs)' : '📋 Fill NCD Assessment'}
                  </ThemedText>
                </Pressable>
                <Pressable
                  style={[
                    styles.yakapActionButton,
                    {
                      backgroundColor: isDark ? '#0F172A' : '#F8FAFC',
                      borderColor: isDark ? '#334155' : '#CBD5E1',
                    },
                  ]}
                  onPress={() => navigation.navigate('Main', { screen: 'PrescriptionsScreen' })}
                >
                  <ThemedText style={[styles.yakapActionText, { color: colors.text }]}>
                    💊 Digital Rx (UPSC QR)
                  </ThemedText>
                </Pressable>
              </View>
            </View>

            {/* Next Appointments Section */}
            <View
              style={[
                styles.card,
                {
                  backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
                  borderColor: isDark ? '#334155' : '#E2E8F0',
                },
              ]}
            >
              <View style={styles.sectionHeader}>
                <ThemedText style={[styles.cardHeading, { color: colors.text }]}>
                  Upcoming Appointments
                </ThemedText>
                <Pressable
                  onPress={() =>
                    navigation.navigate('Main', {
                      screen: 'BottomTabs',
                      params: { screen: 'AppointmentsScreen' },
                    })
                  }
                >
                  <ThemedText style={styles.seeAllText}>VIEW ALL →</ThemedText>
                </Pressable>
              </View>

              {dashboard?.nextAppointments?.length ? (
                <View style={styles.appointmentsGrid}>
                  {dashboard.nextAppointments.map((item) => (
                    <AppointmentCardWeb
                      key={item.id}
                      item={item}
                      onPress={() =>
                        item.status === 'draft' && item.clinicId
                          ? navigation.navigate('Main', {
                              screen: 'BookingDraftScreen',
                              params: { clinicId: item.clinicId } as any,
                            })
                          : item.clinicId
                            ? navigation.navigate('Main', {
                                screen: 'ClinicDetailsScreen',
                                params: { clinicId: item.clinicId } as any,
                              })
                            : undefined
                      }
                    />
                  ))}
                </View>
              ) : (
                <EmptyState
                  title="No upcoming appointments"
                  message="Once you schedule an appointment or save a draft, it will appear here."
                  actionLabel="Browse clinics"
                  onActionPress={() =>
                    navigation.navigate('Main', { screen: 'ExploreClinicsScreen' })
                  }
                />
              )}
            </View>

            {/* Quick Actions Grid */}
            <View
              style={[
                styles.card,
                {
                  backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
                  borderColor: isDark ? '#334155' : '#E2E8F0',
                },
              ]}
            >
              <ThemedText style={[styles.cardHeading, { color: colors.text }]}>
                Quick Actions
              </ThemedText>
              <View style={styles.quickActionsGrid}>
                <Pressable
                  onPress={() => navigation.navigate('Main', { screen: 'ExploreClinicsScreen' })}
                  style={({ pressed }) => [
                    styles.quickActionTile,
                    {
                      backgroundColor: isDark ? '#0F172A' : '#F8FAFC',
                      borderColor: isDark ? '#334155' : '#E2E8F0',
                    },
                    pressed && { opacity: 0.8 },
                  ]}
                >
                  <ThemedText style={{ fontSize: 24 }}>🏥</ThemedText>
                  <ThemedText style={[styles.quickActionTitle, { color: colors.text }]}>
                    Find a Clinic
                  </ThemedText>
                  <ThemedText
                    style={[styles.quickActionDesc, { color: isDark ? '#94A3B8' : '#64748B' }]}
                  >
                    Browse public and partner accredited clinics
                  </ThemedText>
                </Pressable>

                <Pressable
                  onPress={() => navigation.navigate('Main', { screen: 'ExploreOrgsScreen' })}
                  style={({ pressed }) => [
                    styles.quickActionTile,
                    {
                      backgroundColor: isDark ? '#0F172A' : '#F8FAFC',
                      borderColor: isDark ? '#334155' : '#E2E8F0',
                    },
                    pressed && { opacity: 0.8 },
                  ]}
                >
                  <ThemedText style={{ fontSize: 24 }}>🏢</ThemedText>
                  <ThemedText style={[styles.quickActionTitle, { color: colors.text }]}>
                    Organizations
                  </ThemedText>
                  <ThemedText
                    style={[styles.quickActionDesc, { color: isDark ? '#94A3B8' : '#64748B' }]}
                  >
                    View corporate or community health partners
                  </ThemedText>
                </Pressable>

                <Pressable
                  onPress={() => navigation.navigate('Main', { screen: 'BookingDraftScreen' })}
                  style={({ pressed }) => [
                    styles.quickActionTile,
                    {
                      backgroundColor: isDark ? '#0F172A' : '#F8FAFC',
                      borderColor: isDark ? '#334155' : '#E2E8F0',
                    },
                    pressed && { opacity: 0.8 },
                  ]}
                >
                  <ThemedText style={{ fontSize: 24 }}>📅</ThemedText>
                  <ThemedText style={[styles.quickActionTitle, { color: colors.text }]}>
                    Resume Booking
                  </ThemedText>
                  <ThemedText
                    style={[styles.quickActionDesc, { color: isDark ? '#94A3B8' : '#64748B' }]}
                  >
                    Continue your saved appointment draft
                  </ThemedText>
                </Pressable>
              </View>
            </View>
          </View>

          {/* Right Column (Metrics & Health Updates) */}
          <View style={isDesktop ? styles.rightColDesktop : styles.fullCol}>
            {/* Health Metrics */}
            <View
              style={[
                styles.card,
                {
                  backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
                  borderColor: isDark ? '#334155' : '#E2E8F0',
                },
              ]}
            >
              <ThemedText style={[styles.cardHeading, { color: colors.text }]}>
                Health Metrics
              </ThemedText>
              <View style={styles.metricsContainer}>
                {isLoading && !dashboard ? (
                  <>
                    <SkeletonCard />
                    <SkeletonCard />
                  </>
                ) : (
                  dashboard?.healthMetrics.map((metric) => (
                    <MetricCard key={metric.label} metric={metric} />
                  ))
                )}
              </View>
            </View>

            {/* Recent Consultations Summary */}
            <View
              style={[
                styles.card,
                {
                  backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
                  borderColor: isDark ? '#334155' : '#E2E8F0',
                },
              ]}
            >
              <ThemedText style={[styles.cardHeading, { color: colors.text }]}>
                Recent Consultations
              </ThemedText>
              {(dashboard?.recentConsultationSummary ?? []).length ? (
                dashboard?.recentConsultationSummary.map((item) => (
                  <View key={item} style={styles.summaryItem}>
                    <View style={styles.summaryBullet} />
                    <ThemedText
                      style={[styles.summaryItemText, { color: isDark ? '#CBD5E1' : '#334155' }]}
                    >
                      {item}
                    </ThemedText>
                  </View>
                ))
              ) : (
                <ThemedText
                  style={[styles.emptySummaryText, { color: isDark ? '#94A3B8' : '#64748B' }]}
                >
                  No consultations recorded yet. Consultations will appear once verified by your
                  doctor.
                </ThemedText>
              )}
            </View>

            {/* Suggested Actions */}
            <View
              style={[
                styles.card,
                {
                  backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
                  borderColor: isDark ? '#334155' : '#E2E8F0',
                },
              ]}
            >
              <ThemedText style={[styles.cardHeading, { color: colors.text }]}>
                Care Recommendations
              </ThemedText>
              {(dashboard?.summary.suggestedActions ?? ['Loading recommendations...']).map(
                (item) => (
                  <View key={item} style={styles.summaryItem}>
                    <View style={[styles.summaryBullet, { backgroundColor: '#10B981' }]} />
                    <ThemedText
                      style={[styles.summaryItemText, { color: isDark ? '#CBD5E1' : '#334155' }]}
                    >
                      {item}
                    </ThemedText>
                  </View>
                ),
              )}
            </View>
          </View>
        </View>
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
  mobileTopBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
    marginBottom: -8,
  },
  mobileBrand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  mobileLogoBadge: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  mobileLogoText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 1,
  },
  mobilePortalTag: {
    fontSize: 12,
    fontWeight: '600',
  },
  mobileHeaderIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  mobileHeaderIconBtn: {
    position: 'relative',
    padding: 6,
    borderRadius: 8,
  },
  mobileBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  mobileBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
    lineHeight: 12,
  },
  heroCard: {
    borderRadius: 20,
    padding: 28,
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 4,
  },
  heroContent: {
    gap: 10,
    maxWidth: 680,
  },
  heroBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  heroBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  heroTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  heroSubtitle: {
    fontSize: 15,
    color: 'rgba(255, 255, 255, 0.85)',
    lineHeight: 22,
  },
  mainLayout: {
    width: '100%',
    gap: 24,
  },
  desktopLayout: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  mobileLayout: {
    flexDirection: 'column',
  },
  leftColDesktop: {
    flex: 65,
    gap: 24,
  },
  rightColDesktop: {
    flex: 35,
    gap: 24,
  },
  fullCol: {
    width: '100%',
    gap: 24,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 24,
    gap: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeading: {
    fontSize: 18,
    fontWeight: '700',
  },
  cardSubtext: {
    fontSize: 13,
  },
  yakapHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  yakapHeaderLeft: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  budgetBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  budgetBadgeText: {
    color: '#10B981',
    fontWeight: '700',
    fontSize: 12,
  },
  progressContainer: {
    gap: 8,
  },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  progressTitle: {
    fontSize: 13,
    fontWeight: '600',
  },
  progressPercent: {
    fontSize: 13,
    fontWeight: '700',
    color: '#10B981',
  },
  progressBarTrack: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  balanceSub: {
    fontSize: 12,
  },
  yakapActionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  yakapActionButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  yakapActionText: {
    fontSize: 13,
    fontWeight: '600',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  seeAllText: {
    color: '#3B82F6',
    fontWeight: '700',
    fontSize: 12,
    letterSpacing: 0.5,
  },
  appointmentsGrid: {
    gap: 12,
  },
  appointmentCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    gap: 8,
  },
  appointmentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  appointmentTitle: {
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
  },
  appointmentSubtitle: {
    fontSize: 13,
  },
  appointmentFooter: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 4,
  },
  appointmentMeta: {
    fontSize: 12,
    fontWeight: '500',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  quickActionsGrid: {
    flexDirection: 'row',
    gap: 14,
    flexWrap: 'wrap',
  },
  quickActionTile: {
    flex: 1,
    minWidth: 180,
    borderWidth: 1,
    borderRadius: 12,
    padding: 18,
    gap: 6,
  },
  quickActionTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginTop: 4,
  },
  quickActionDesc: {
    fontSize: 12,
    lineHeight: 18,
  },
  metricsContainer: {
    gap: 10,
  },
  metricCard: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    gap: 4,
  },
  metricLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  metricValue: {
    fontSize: 22,
    fontWeight: '800',
  },
  metricNote: {
    fontSize: 12,
  },
  summaryItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 8,
  },
  summaryBullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#3B82F6',
    marginTop: 6,
  },
  summaryItemText: {
    fontSize: 13,
    lineHeight: 20,
    flex: 1,
  },
  emptySummaryText: {
    fontSize: 13,
    lineHeight: 20,
  },
});

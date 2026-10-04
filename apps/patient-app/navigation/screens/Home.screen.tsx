import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useNavigation, useTheme } from '@react-navigation/native';
import { useUser } from '@clerk/expo';
import { LinearGradient } from 'expo-linear-gradient';
import { SettingsRow, SettingsSection } from '@ui/SettingsItem';
import ThemedText from '@ui/ThemedText';
import ThemedView from '@ui/ThemedView';
import EmptyState from '@ui/EmptyState';
import { SkeletonCard } from '@ui/Skeleton';
import { usePatientId } from 'hooks/usePatientId';
import { getHomeDashboard } from '../../services/discovery/discoveryService';
import { HomeDashboard, HealthMetric, AppointmentLineupItem } from '../../services/discovery/types';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { db } from '@db/index';
import { prescriptions } from '@db/schema/prescriptions';
import { patientGovernmentIds } from '@db/schema/patientGovernmentIds';
import { patientNcdQuestionnaire } from '@db/schema/patientNcdQuestionnaire';
import { eq } from 'drizzle-orm';

function MetricCard({ metric }: { metric: HealthMetric }) {
  const { colors } = useTheme();

  return (
    <ThemedView style={[styles.metricCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
      <ThemedText style={styles.metricLabel}>{metric.label}</ThemedText>
      <ThemedText style={styles.metricValue}>{metric.value}</ThemedText>
      <ThemedText style={[styles.metricNote, { color: colors.text }]}>{metric.note}</ThemedText>
    </ThemedView>
  );
}

function AppointmentCard({ item, onPress }: { item: AppointmentLineupItem; onPress: () => void }) {
  const { colors } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.appointmentCard,
        {
          borderColor: colors.border,
          backgroundColor: colors.card,
          opacity: pressed ? 0.84 : 1,
        },
      ]}
    >
      <ThemedView style={styles.appointmentHeader}>
        <ThemedText style={styles.appointmentTitle} numberOfLines={1}>
          {item.title}
        </ThemedText>
        <ThemedView
          style={[
            styles.badge,
            {
              backgroundColor:
                item.status === 'draft' ? '#F59E0B' : item.status === 'follow-up' ? '#3B82F6' : '#10B981',
            },
          ]}
        >
          <ThemedText style={styles.badgeText}>
            {item.status === 'draft' ? 'Draft' : item.status === 'follow-up' ? 'Follow-up' : 'Scheduled'}
          </ThemedText>
        </ThemedView>
      </ThemedView>
      <ThemedText style={[styles.appointmentSubtitle, { color: colors.text }]} numberOfLines={1}>
        {item.subtitle}
      </ThemedText>
      <ThemedView style={styles.appointmentFooter}>
        <ThemedText style={[styles.appointmentMeta, { color: colors.text }]}>{item.dateLabel}</ThemedText>
        <ThemedText style={[styles.appointmentMeta, { color: colors.text }]}>{item.timeLabel}</ThemedText>
      </ThemedView>
    </Pressable>
  );
}

export default function HomeScreen() {
  const { colors, dark: isDark } = useTheme();
  const navigation = useNavigation<any>();
  const { user } = useUser();
  const patientId = usePatientId();
  const [dashboard, setDashboard] = useState<HomeDashboard | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [gamotUsed, setGamotUsed] = useState(0);
  const [hasNcd, setHasNcd] = useState(false);
  const [philhealthPin, setPhilhealthPin] = useState<string | null>(null);
  const inset = useSafeAreaInsets();
  const tabBarHeight = (useBottomTabBarHeight?.() || 96) + inset.bottom;

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

  const greetingName = useMemo(() => dashboard?.greetingName ?? user?.firstName ?? 'Patient', [dashboard, user]);

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={[styles.container, { paddingBottom: tabBarHeight }]}>
      {/* <ProfileCard /> */}

      <LinearGradient
        colors={isDark ? ['#1E40AF', '#1E3A8A', '#1E3A8A'] : ['#3B82F6', '#2563EB', '#1D4ED8']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.heroCard}
      >
        <ThemedText style={styles.heroKicker}>Care at a glance</ThemedText>
        <ThemedText style={styles.heroTitle}>Welcome back, {greetingName}</ThemedText>
        <ThemedText style={styles.heroSubtitle}>A clean overview of your health metrics, upcoming care, and active communities.</ThemedText>
      </LinearGradient>

      <ThemedView style={styles.metricsGrid}>
        {isLoading && !dashboard ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : (
          dashboard?.healthMetrics.map((metric) => <MetricCard key={metric.label} metric={metric} />)
        )}
      </ThemedView>

      {/* PhilHealth YAKAP & GAMOT ₱20,000 Benefit Tracker Card */}
      <ThemedView style={[styles.yakapCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
        <View style={styles.yakapCardTop}>
          <View style={styles.yakapHeaderLeft}>
            <ThemedText style={{ fontSize: 24 }}>🇵🇭</ThemedText>
            <View>
              <ThemedText style={styles.yakapCardTitle}>PhilHealth YAKAP Benefit</ThemedText>
              <ThemedText style={[styles.yakapCardSubtitle, { color: colors.text }]}>
                {philhealthPin ? `PIN: ${philhealthPin} • Mod-11 Verified` : 'Link PhilHealth PIN in Government IDs'}
              </ThemedText>
            </View>
          </View>
          <View style={styles.yakapBudgetBadge}>
            <ThemedText style={styles.yakapBudgetBadgeText}>₱20,000/yr</ThemedText>
          </View>
        </View>

        <View style={styles.yakapProgressSection}>
          <View style={styles.yakapProgressLabels}>
            <ThemedText style={styles.yakapProgressTitle}>GAMOT Outpatient Drug Allocation</ThemedText>
            <ThemedText style={styles.yakapProgressPercent}>
              {Math.min(100, Math.round((gamotUsed / 20000) * 100))}% used
            </ThemedText>
          </View>
          <View style={[styles.progressBarTrack, { backgroundColor: isDark ? '#334155' : '#E2E8F0' }]}>
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
          <View style={styles.yakapProgressLabels}>
            <ThemedText style={styles.yakapBalanceSub}>
              Claimed: ₱{gamotUsed.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </ThemedText>
            <ThemedText style={[styles.yakapBalanceSub, { fontWeight: '700', color: '#10B981' }]}>
              Balance: ₱{Math.max(0, 20000 - gamotUsed).toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </ThemedText>
          </View>
        </View>

        <View style={styles.yakapActionRow}>
          <Pressable
            style={[styles.yakapActionButton, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9', borderColor: colors.border }]}
            onPress={() => navigation.navigate('Main', { screen: 'NcdQuestionnaireScreen' })}
          >
            <ThemedText style={styles.yakapActionText}>
              {hasNcd ? '📋 Review NCD (24 Qs)' : '📋 Fill NCD Assessment'}
            </ThemedText>
          </Pressable>
          <Pressable
            style={[styles.yakapActionButton, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9', borderColor: colors.border }]}
            onPress={() => navigation.navigate('Main', { screen: 'PrescriptionsScreen' })}
          >
            <ThemedText style={styles.yakapActionText}>💊 Digital Rx (UPSC QR)</ThemedText>
          </Pressable>
        </View>
      </ThemedView>

      <SettingsSection title="Quick Actions">
        <SettingsRow
          title="Explore Organizations"
          subtitle="Browse public communities or open private invites"
          icon={{ android: 'groups', ios: 'person.3.fill' }}
          iconColor="#3B82F6"
          right={{ type: 'chevron' }}
          onPress={() => navigation.navigate('Main', { screen: 'ExploreOrgsScreen' })}
        />
        <SettingsRow
          title="Explore Clinics"
          subtitle="View public clinics and partner-only clinics"
          icon={{ android: 'local_hospital', ios: 'cross.case.fill' }}
          iconColor="#10B981"
          right={{ type: 'chevron' }}
          onPress={() => navigation.navigate('Main', { screen: 'ExploreClinicsScreen' })}
        />
        <SettingsRow
          title="Continue Booking Draft"
          subtitle="Open the booking draft form for your next clinic"
          icon={{ android: 'event_note', ios: 'calendar.badge.plus' }}
          iconColor="#F97316"
          right={{ type: 'chevron' }}
          onPress={() => navigation.navigate('Main', { screen: 'BookingDraftScreen' })}
        />
      </SettingsSection>

      <SettingsSection
        title="Next Appointment Line-up"
        titleRightAction={
          <Pressable onPress={() => navigation.navigate('Main', { screen: 'BottomTabs', params: { screen: 'AppointmentsScreen' } })} accessibilityRole="button">
            <ThemedText style={{
              color: colors.primary,
              fontWeight: '600',
              fontSize: 12,
              letterSpacing: 0.5
            }}>SEE ALL</ThemedText>
          </Pressable>
        }
        bodyStyle={{
          backgroundColor: "transparent",
          borderColor: "transparent"
        }}
      >
        {dashboard?.nextAppointments?.length ? (
          <FlatList
            data={dashboard.nextAppointments}
            keyExtractor={(item) => item.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            ItemSeparatorComponent={() => <ThemedView style={styles.horizontalGap} />}
            renderItem={({ item }) => (
              <AppointmentCard
                item={item}
                onPress={() =>
                  item.status === 'draft' && item.clinicId
                    ? navigation.navigate('Main', { screen: 'BookingDraftScreen', params: ({ clinicId: item.clinicId } as any) })
                    : item.clinicId
                      ? navigation.navigate('Main', { screen: 'ClinicDetailsScreen', params: ({ clinicId: item.clinicId } as any) })
                      : undefined
                }
              />
            )}
          />
        ) : (
          <EmptyState
            title="No upcoming line-up yet"
            message="Once you save a booking draft or follow up on a consultation, it will appear here."
            actionLabel="Browse clinics"
            onActionPress={() => navigation.navigate('Main', { screen: 'ExploreClinicsScreen' })}
          />
        )}
      </SettingsSection>

      <SettingsSection title="Recent Consultations">
        {(dashboard?.recentConsultationSummary ?? []).length ? (
          dashboard?.recentConsultationSummary.map((item) => (
            <ThemedView key={item} style={styles.summaryRow}>
              <ThemedView style={[styles.summaryDot, { backgroundColor: colors.primary }]} />
              <ThemedText style={styles.summaryText}>{item}</ThemedText>
            </ThemedView>
          ))
        ) : (
          <EmptyState
            title="No consultations yet"
            message="Your consultation history will show up here once records are synced from a clinic."
          />
        )}
      </SettingsSection>

      <SettingsSection title="Suggested Next Steps">
        {(dashboard?.summary.suggestedActions ?? ['Loading recommendations...']).map((item) => (
          <ThemedView key={item} style={styles.summaryRow}>
            <ThemedView style={[styles.summaryDot, { backgroundColor: colors.primary }]} />
            <ThemedText style={styles.summaryText}>{item}</ThemedText>
          </ThemedView>
        ))}
      </SettingsSection>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    gap: 16,
    paddingBottom: 32,
  },
  heroCard: {
    borderRadius: 24,
    padding: 18,
    gap: 8,
    minHeight: 160,
    justifyContent: 'flex-end',
  },
  heroKicker: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  heroTitle: {
    color: '#fff',
    fontSize: 26,
    fontWeight: '800',
    lineHeight: 32,
  },
  heroSubtitle: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 14,
    lineHeight: 20,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  metricCard: {
    width: '48%',
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    gap: 4,
    minHeight: 100,
    justifyContent: 'center',
  },
  metricLabel: {
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    opacity: 0.78,
  },
  metricValue: {
    fontSize: 24,
    fontWeight: '800',
  },
  metricNote: {
    fontSize: 12,
    opacity: 0.78,
  },
  appointmentCard: {
    width: 240,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    gap: 8,
  },
  appointmentHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  appointmentTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
  },
  appointmentSubtitle: {
    fontSize: 13,
    lineHeight: 18,
    opacity: 0.8,
  },
  appointmentFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  appointmentMeta: {
    fontSize: 12,
    opacity: 0.75,
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
  },
  horizontalGap: {
    width: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
    alignItems: 'flex-start',
  },
  summaryDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    marginTop: 6,
  },
  summaryText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  yakapCard: {
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    gap: 14,
  },
  yakapCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  yakapHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  yakapCardTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  yakapCardSubtitle: {
    fontSize: 12,
    opacity: 0.7,
  },
  yakapBudgetBadge: {
    backgroundColor: '#0284C7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  yakapBudgetBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },
  yakapProgressSection: {
    gap: 6,
  },
  yakapProgressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  yakapProgressTitle: {
    fontSize: 13,
    fontWeight: '600',
    opacity: 0.85,
  },
  yakapProgressPercent: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0284C7',
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
  yakapBalanceSub: {
    fontSize: 12,
    opacity: 0.8,
  },
  yakapActionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 2,
  },
  yakapActionButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  yakapActionText: {
    fontSize: 12,
    fontWeight: '700',
  },
});

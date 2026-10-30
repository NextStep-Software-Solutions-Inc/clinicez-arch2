import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useUser } from '@clerk/expo';
import { LinearGradient } from 'expo-linear-gradient';
import ThemedText from '../../components/ui/ThemedText';
import EmptyState from '../../components/ui/EmptyState';
import { SkeletonCard } from '../../components/ui/Skeleton';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import { AppIcon } from '../../components/ui/Icon';
import { ListRow, SectionHeader, StatTile } from '../../components/ui/Primitives';
import { useAppTheme } from '../../contexts/ThemeContext';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { usePatientId } from '../../hooks/usePatientId';
import { desc, eq } from 'drizzle-orm';
import { differenceInCalendarDays, parseISO } from 'date-fns';
import { getHomeDashboard } from '../../services/discovery/discoveryService';
import { HomeDashboard, AppointmentLineupItem } from '../../services/discovery/types';
import YakapPromoCard from '../../components/yakap/YakapPromoCard';
import YakapActiveCard from '../../components/yakap/YakapActiveCard';
import { useYakapRegistrationStatus } from '../../hooks/useYakapRegistrationStatus';
import { db } from '../../db/index';
import { consultations, type Consultation } from '../../db/schema/consultations';
import { vitalSigns, type VitalSign } from '../../db/schema/vitalSigns';
import AfterVisitSummaryCard from '../../components/records/AfterVisitSummaryCard';

function WebAppointmentCard({
  item,
  onPress,
}: {
  item: AppointmentLineupItem;
  onPress: () => void;
}) {
  const { colors, radii, spacing, shadows } = useAppTheme();

  const badgeTone =
    item.status === 'draft' ? 'warning' : item.status === 'follow-up' ? 'info' : 'success';
  const badgeLabel =
    item.status === 'draft' ? 'Draft' : item.status === 'follow-up' ? 'Follow-up' : 'Scheduled';

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${item.title}, ${badgeLabel}`}
      style={(state: any) => [
        styles.appointmentCard,
        {
          borderColor: state.hovered ? colors.primaryBorder : colors.border,
          backgroundColor: state.hovered ? colors.surfaceSubtle : colors.card,
          borderRadius: radii.lg,
          padding: spacing.lg,
          gap: spacing.sm,
          opacity: state.pressed ? 0.85 : 1,
        },
        shadows.sm,
      ]}
    >
      <View style={styles.appointmentHeader}>
        <ThemedText variant="bodyLarge" numberOfLines={1} style={styles.flex}>
          {item.title}
        </ThemedText>
        <Badge label={badgeLabel} tone={badgeTone} size="sm" />
      </View>
      <ThemedText variant="body" color="textSecondary" numberOfLines={1}>
        {item.subtitle}
      </ThemedText>
      <View style={styles.appointmentFooter}>
        <View style={styles.metaRow}>
          <AppIcon name="calendar" size={16} color="textMuted" />
          <ThemedText variant="small" color="textMuted">
            {item.dateLabel}
          </ThemedText>
        </View>
        <View style={styles.metaRow}>
          <AppIcon name="clock" size={16} color="textMuted" />
          <ThemedText variant="small" color="textMuted">
            {item.timeLabel}
          </ThemedText>
        </View>
      </View>
    </Pressable>
  );
}

export default function HomeScreenWeb() {
  const { colors, spacing, radii } = useAppTheme();
  const navigation = useNavigation<any>();
  const { user } = useUser();
  const patientId = usePatientId();
  const { isDesktop, isCompact } = useBreakpoint();

  const [dashboard, setDashboard] = useState<HomeDashboard | null>(null);
  const [recentConsultation, setRecentConsultation] = useState<Consultation | null>(null);
  const [recentVitals, setRecentVitals] = useState<VitalSign | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const yakapStatus = useYakapRegistrationStatus(patientId);

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
    () => dashboard?.greetingName ?? user?.firstName ?? 'Patient',
    [dashboard, user],
  );

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: colors.background }]}
      contentContainerStyle={[
        styles.scrollContent,
        {
          padding: isCompact ? spacing.md : spacing['2xl'],
          gap: isCompact ? spacing.lg : spacing['2xl'],
          paddingBottom: spacing['4xl'],
        },
      ]}
      showsVerticalScrollIndicator={false}
    >
      {/* Hero greeting banner */}
      <LinearGradient
        colors={[colors.primary, colors.primaryDark]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.heroCard,
          {
            borderRadius: radii.xl,
            padding: isCompact ? spacing.lg : spacing['2xl'],
            gap: spacing.sm,
          },
        ]}
      >
        <Badge label="PATIENT DASHBOARD" tone="primary" size="sm" />
        <ThemedText variant={isCompact ? 'h1' : 'display'} color="onPrimary">
          Welcome back, {greetingName}
        </ThemedText>
        <ThemedText variant={isCompact ? 'body' : 'bodyLarge'} color="onPrimary">
          Here is your healthcare summary, upcoming appointments, and PhilHealth benefit status.
        </ThemedText>
      </LinearGradient>

      {/* Stats row with StatTiles */}
      <View style={[styles.statsRow, { gap: isCompact ? spacing.sm : spacing.md }]}>
        <StatTile
          label="Upcoming Visits"
          value={dashboard?.nextAppointments?.length ?? 0}
          icon="calendar"
          tone="primary"
          onPress={() =>
            navigation.navigate('Main', {
              screen: 'BottomTabs',
              params: { screen: 'AppointmentsScreen' },
            })
          }
        />
        <StatTile
          label="Medicine Allowance Used"
          value={
            yakapStatus.isConfirmedRegistered
              ? `₱${yakapStatus.gamotUsed.toLocaleString()}`
              : 'Not Enlisted'
          }
          icon="shield"
          tone="success"
          onPress={() => navigation.navigate('Main', { screen: 'YakapDetailsScreen' })}
        />
        <StatTile
          label="Recent Records"
          value={dashboard?.recentConsultationSummary?.length ?? 0}
          icon="activity"
          tone="purple"
          onPress={() =>
            navigation.navigate('Main', {
              screen: 'BottomTabs',
              params: { screen: 'FilesScreen', params: { screen: 'FilesBrowserScreen' } },
            })
          }
        />
      </View>

      {/* Responsive two-column dashboard (>=1024) or stacked (<1024) */}
      <View
        style={[
          styles.layoutContainer,
          isDesktop ? styles.layoutDesktop : styles.layoutMobile,
          { gap: spacing['2xl'] },
        ]}
      >
        {/* Main Column */}
        <View style={[isDesktop ? styles.mainColDesktop : styles.fullCol, { gap: spacing['2xl'] }]}>
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
          {recentConsultation && (
            <View style={{ gap: spacing.md }}>
              <SectionHeader title="Recent Visit Summary" />
              <AfterVisitSummaryCard
                consultation={recentConsultation}
                vitals={recentVitals}
                isPinned={true}
                onBookFollowUp={() => navigation.navigate('Main', { screen: 'BookingDraftScreen' })}
                onMessageClinic={() => navigation.navigate('MainBottomTabs', { screen: 'MessagesScreen' })}
              />
            </View>
          )}

          {/* Upcoming Appointments Section */}
          <View style={{ gap: spacing.md }}>
            <SectionHeader
              title="Upcoming Appointments"
              actionLabel="VIEW ALL →"
              onActionPress={() =>
                navigation.navigate('Main', {
                  screen: 'BottomTabs',
                  params: { screen: 'AppointmentsScreen' },
                })
              }
            />
            {dashboard?.nextAppointments?.length ? (
              <View style={[styles.appointmentsList, { gap: spacing.md }]}>
                {dashboard.nextAppointments.map((item) => (
                  <WebAppointmentCard
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
                icon="calendar"
                title="No upcoming appointments"
                message="Once you schedule an appointment or save a draft, it will appear here."
                actionLabel="Browse clinics"
                onActionPress={() =>
                  navigation.navigate('Main', { screen: 'ExploreClinicsScreen' })
                }
              />
            )}
          </View>

          {/* Quick Actions List */}
          <View style={{ gap: spacing.md }}>
            <SectionHeader title="Quick Actions" />
            <Card padding="none">
              <ListRow
                title="Find a Clinic"
                subtitle="Browse public and partner accredited clinics"
                icon="hospital"
                tone="primary"
                onPress={() => navigation.navigate('Main', { screen: 'ExploreClinicsScreen' })}
                divider
              />
              <ListRow
                title="Explore Organizations"
                subtitle="View corporate or community health partners"
                icon="users"
                tone="info"
                onPress={() => navigation.navigate('Main', { screen: 'ExploreOrgsScreen' })}
                divider
              />
              <ListRow
                title="Resume Booking Draft"
                subtitle="Continue your saved appointment draft"
                icon="calendar"
                tone="warning"
                onPress={() => navigation.navigate('Main', { screen: 'BookingDraftScreen' })}
                divider
              />
              <ListRow
                title="Records"
                subtitle="Prescriptions, lab requests, results, and care summaries"
                icon="document"
                tone="info"
                onPress={() => navigation.navigate('FilesScreen')}
                divider
              />
              <ListRow
                title="Share my records"
                subtitle="Show a QR code and manage who can see your data"
                icon="qrCode"
                tone="purple"
                onPress={() => navigation.navigate('Main', { screen: 'ShareRecordsScreen' })}
              />
            </Card>
          </View>
        </View>

        {/* Right Rail Column */}
        <View style={[isDesktop ? styles.rightColDesktop : styles.fullCol, { gap: spacing['2xl'] }]}>
          {/* Health Metrics Card */}
          <Card padding="lg" style={styles.cardGap}>
            <SectionHeader title="Health Metrics" />
            <View style={[styles.metricsContainer, { gap: spacing.md }]}>
              {isLoading && !dashboard ? (
                <>
                  <SkeletonCard />
                  <SkeletonCard />
                </>
              ) : (
                dashboard?.healthMetrics.map((metric) => (
                  <View
                    key={metric.label}
                    style={[
                      styles.metricItem,
                      {
                        backgroundColor: colors.surfaceSubtle,
                        borderColor: colors.border,
                        borderRadius: radii.md,
                        padding: spacing.md,
                      },
                    ]}
                  >
                    <ThemedText variant="captionBold" color="textMuted">
                      {metric.label}
                    </ThemedText>
                    <ThemedText variant="h2">{metric.value}</ThemedText>
                    <ThemedText variant="small" color="textSecondary">
                      {metric.note}
                    </ThemedText>
                  </View>
                ))
              )}
            </View>
          </Card>

          {/* Recent Consultations */}
          <Card padding="lg" style={styles.cardGap}>
            <SectionHeader title="Recent Consultations" />
            {(dashboard?.recentConsultationSummary ?? []).length ? (
              dashboard?.recentConsultationSummary.map((item) => (
                <View key={item} style={styles.summaryItem}>
                  <View
                    style={[
                      styles.summaryDot,
                      { backgroundColor: colors.primary, borderRadius: radii.full },
                    ]}
                  />
                  <ThemedText variant="body" color="text" style={styles.flex}>
                    {item}
                  </ThemedText>
                </View>
              ))
            ) : (
              <ThemedText variant="small" color="textMuted">
                No consultations recorded yet. Consultations will appear once verified by your
                doctor.
              </ThemedText>
            )}
          </Card>

          {/* Suggested Next Steps */}
          <Card padding="lg" style={styles.cardGap}>
            <SectionHeader title="Care Recommendations" />
            {(dashboard?.summary.suggestedActions ?? ['Loading recommendations...']).map(
              (item) => (
                <View key={item} style={styles.summaryItem}>
                  <View
                    style={[
                      styles.summaryDot,
                      { backgroundColor: colors.success, borderRadius: radii.full },
                    ]}
                  />
                  <ThemedText variant="body" color="text" style={styles.flex}>
                    {item}
                  </ThemedText>
                </View>
              ),
            )}
          </Card>
        </View>
      </View>
    </ScrollView>
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
  heroCard: {
    width: '100%',
    minHeight: 150,
    justifyContent: 'flex-end',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    width: '100%',
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
  mainColDesktop: {
    flex: 65,
  },
  rightColDesktop: {
    flex: 35,
  },
  fullCol: {
    width: '100%',
  },
  cardGap: {
    gap: 16,
  },
  appointmentsList: {
    width: '100%',
  },
  appointmentCard: {
    width: '100%',
    borderWidth: 1,
  },
  appointmentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  appointmentFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginTop: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metricsContainer: {
    width: '100%',
  },
  metricItem: {
    borderWidth: 1,
    gap: 4,
  },
  summaryItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 4,
  },
  summaryDot: {
    width: 8,
    height: 8,
    marginTop: 6,
  },
});

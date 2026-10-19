import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useUser } from '@clerk/expo';
import { LinearGradient } from 'expo-linear-gradient';
import ThemedText from '../../components/ui/ThemedText';
import ThemedView from '../../components/ui/ThemedView';
import EmptyState from '../../components/ui/EmptyState';
import { SkeletonCard } from '../../components/ui/Skeleton';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import { AppIcon } from '../../components/ui/Icon';
import { ListRow, SectionHeader, ProgressBar } from '../../components/ui/Primitives';
import { useAppTheme } from '../../contexts/ThemeContext';
import { useContentInsets } from '../../hooks/useContentInsets';
import { usePatientId } from '../../hooks/usePatientId';
import { getHomeDashboard } from '../../services/discovery/discoveryService';
import { HomeDashboard, HealthMetric, AppointmentLineupItem } from '../../services/discovery/types';
import YakapPromoCard from '../../components/yakap/YakapPromoCard';
import YakapActiveCard from '../../components/yakap/YakapActiveCard';
import { useYakapRegistrationStatus } from '../../hooks/useYakapRegistrationStatus';

function MetricCard({ metric }: { metric: HealthMetric }) {
  const { colors, radii, spacing, shadows } = useAppTheme();

  return (
    <View
      style={[
        styles.metricCard,
        {
          borderColor: colors.border,
          backgroundColor: colors.card,
          borderRadius: radii.lg,
          padding: spacing.md,
          gap: spacing.xs,
        },
        shadows.sm,
      ]}
    >
      <ThemedText variant="captionBold" color="textMuted">
        {metric.label}
      </ThemedText>
      <ThemedText variant="h2">
        {metric.value}
      </ThemedText>
      <ThemedText variant="small" color="textSecondary">
        {metric.note}
      </ThemedText>
    </View>
  );
}

function AppointmentCard({ item, onPress }: { item: AppointmentLineupItem; onPress: () => void }) {
  const { colors, radii, spacing, shadows } = useAppTheme();

  const badgeTone =
    item.status === 'draft' ? 'warning' : item.status === 'follow-up' ? 'info' : 'success';
  const badgeLabel =
    item.status === 'draft' ? 'Draft' : item.status === 'follow-up' ? 'Follow-up' : 'Scheduled';

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.appointmentCard,
        {
          borderColor: colors.border,
          backgroundColor: colors.card,
          borderRadius: radii.lg,
          padding: spacing.md,
          gap: spacing.sm,
          opacity: pressed ? 0.84 : 1,
        },
        shadows.sm,
      ]}
    >
      <View style={styles.appointmentHeader}>
        <ThemedText variant="bodyBold" numberOfLines={1} style={styles.flex}>
          {item.title}
        </ThemedText>
        <Badge label={badgeLabel} tone={badgeTone} size="sm" />
      </View>
      <ThemedText variant="small" color="textSecondary" numberOfLines={1}>
        {item.subtitle}
      </ThemedText>
      <View style={styles.appointmentFooter}>
        <View style={styles.metaRow}>
          <AppIcon name="calendar" size={14} color="textMuted" />
          <ThemedText variant="caption" color="textMuted">
            {item.dateLabel}
          </ThemedText>
        </View>
        <View style={styles.metaRow}>
          <AppIcon name="clock" size={14} color="textMuted" />
          <ThemedText variant="caption" color="textMuted">
            {item.timeLabel}
          </ThemedText>
        </View>
      </View>
    </Pressable>
  );
}

export default function HomeScreen() {
  const { colors, spacing, radii, sizes } = useAppTheme();
  const navigation = useNavigation<any>();
  const { user } = useUser();
  const patientId = usePatientId();
  const [dashboard, setDashboard] = useState<HomeDashboard | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const contentInsets = useContentInsets();
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

      void yakapStatus.refresh();
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
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={[styles.container, { paddingBottom: contentInsets.bottom }]}
    >
      <LinearGradient
        colors={[colors.primary, colors.primaryDark]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.heroCard, { borderRadius: radii.xl, padding: spacing.lg, gap: spacing.sm }]}
      >
        <ThemedText variant="captionBold" color="onPrimary">
          CARE AT A GLANCE
        </ThemedText>
        <ThemedText variant="h1" color="onPrimary">
          Welcome back, {greetingName}
        </ThemedText>
        <ThemedText variant="body" color="onPrimary">
          A clean overview of your health metrics, upcoming care, and active communities.
        </ThemedText>
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

      <View style={styles.sectionWrap}>
        <SectionHeader title="Quick Actions" />
        <Card padding="none">
          <ListRow
            title="Explore Organizations"
            subtitle="Browse public communities or open private invites"
            icon="users"
            tone="primary"
            onPress={() => navigation.navigate('Main', { screen: 'ExploreOrgsScreen' })}
            divider
          />
          <ListRow
            title="Explore Clinics"
            subtitle="View public clinics and partner-only clinics"
            icon="hospital"
            tone="success"
            onPress={() => navigation.navigate('Main', { screen: 'ExploreClinicsScreen' })}
            divider
          />
          <ListRow
            title="Continue Booking Draft"
            subtitle="Open the booking draft form for your next clinic"
            icon="calendar"
            tone="warning"
            onPress={() => navigation.navigate('Main', { screen: 'BookingDraftScreen' })}
            divider
          />
          <ListRow
            title="Documents"
            subtitle="Lab requests, prescriptions, results and certificates"
            icon="document"
            tone="info"
            onPress={() => navigation.navigate('Main', { screen: 'DocumentsScreen' })}
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

      <View style={styles.sectionWrap}>
        <SectionHeader
          title="Next Appointment Line-up"
          actionLabel="SEE ALL"
          onActionPress={() =>
            navigation.navigate('Main', {
              screen: 'BottomTabs',
              params: { screen: 'AppointmentsScreen' },
            })
          }
        />
        {dashboard?.nextAppointments?.length ? (
          <FlatList
            data={dashboard.nextAppointments}
            keyExtractor={(item) => item.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            ItemSeparatorComponent={() => <View style={{ width: spacing.md }} />}
            renderItem={({ item }) => (
              <AppointmentCard
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
      </View>

      <View style={styles.sectionWrap}>
        <SectionHeader title="Recent Consultations" />
        <Card padding="md">
          {(dashboard?.recentConsultationSummary ?? []).length ? (
            dashboard?.recentConsultationSummary.map((item) => (
              <View key={item} style={styles.summaryRow}>
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
            <EmptyState
              title="No consultations yet"
              message="Your consultation history will show up here once records are synced from a clinic."
            />
          )}
        </Card>
      </View>

      <View style={styles.sectionWrap}>
        <SectionHeader title="Suggested Next Steps" />
        <Card padding="md">
          {(dashboard?.summary.suggestedActions ?? ['Loading recommendations...']).map((item) => (
            <View key={item} style={styles.summaryRow}>
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
          ))}
        </Card>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  container: {
    padding: 16,
    gap: 16,
  },
  heroCard: {
    minHeight: 150,
    justifyContent: 'flex-end',
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  metricCard: {
    width: '48%',
    borderWidth: 1,
    minHeight: 96,
    justifyContent: 'center',
  },
  appointmentCard: {
    width: 240,
    borderWidth: 1,
  },
  appointmentHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  appointmentFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  sectionWrap: {
    gap: 8,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 8,
    alignItems: 'flex-start',
  },
  summaryDot: {
    width: 8,
    height: 8,
    marginTop: 6,
  },
});

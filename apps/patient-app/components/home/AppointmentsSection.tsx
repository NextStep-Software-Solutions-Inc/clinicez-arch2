import React from 'react';
import { Dimensions, FlatList, Image, Pressable, StyleSheet, View } from 'react-native';
import ThemedText from '../ui/ThemedText';
import Card from '../ui/Card';
import Badge, { type BadgeTone } from '../ui/Badge';
import Button from '../ui/Button';
import { AppIcon } from '../ui/Icon';
import { SkeletonCard } from '../ui/Skeleton';
import { useAppTheme } from '../../contexts/ThemeContext';

export interface DisplayAppointment {
  id: string;
  clinicId?: string;
  clinicName: string;
  clinicSuite?: string;
  doctorName: string;
  doctorAvatarUrl?: string;
  specialty: string;
  timeLabel: string;
  badgeLabel: string;
  badgeTone: BadgeTone;
  isCheckInEligible?: boolean;
}

export interface AppointmentsSectionProps {
  appointments: DisplayAppointment[];
  isFirstLogin?: boolean;
  isLoading?: boolean;
  onBookAppointment: () => void;
  onExploreClinics: () => void;
  onViewAll: () => void;
  onViewHistory?: () => void;
  onCheckIn: (appointment: DisplayAppointment) => void;
  onManageVisit: (appointment: DisplayAppointment) => void;
  onDirections: (appointment: DisplayAppointment) => void;
}

export default function AppointmentsSection({
  appointments,
  isFirstLogin = false,
  isLoading = false,
  onBookAppointment,
  onExploreClinics,
  onViewAll,
  onViewHistory,
  onCheckIn,
  onManageVisit,
  onDirections,
}: AppointmentsSectionProps) {
  const { colors, spacing, radii, shadows, sizes } = useAppTheme();
  const screenWidth = Dimensions.get('window').width;
  const carouselCardWidth = Math.min(340, Math.max(280, Math.round(screenWidth * 0.85)));

  return (
    <View style={[styles.sectionWrap, { gap: spacing.sm }]}>
      {/* Header Row */}
      <View style={styles.headerRow}>
        <View style={styles.titleRow}>
          {appointments.length > 0 ? (
            <View
              style={[
                styles.pulseDot,
                {
                  backgroundColor: colors.primary,
                  borderRadius: radii.full,
                },
              ]}
            />
          ) : (
            <View
              style={[
                styles.pulseDot,
                {
                  backgroundColor: colors.border,
                  borderRadius: radii.full,
                },
              ]}
            />
          )}
          <ThemedText variant="title">Appointments</ThemedText>
          <Badge
            label={`${appointments.length} Scheduled`}
            tone={appointments.length > 0 ? 'primary' : 'neutral'}
            size="sm"
          />
        </View>

        {isFirstLogin ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Explore clinics"
            onPress={onExploreClinics}
            style={styles.viewAllRow}
          >
            <ThemedText variant="smallBold" color="primaryText">
              Explore Clinics
            </ThemedText>
            <AppIcon name="chevronRight" size={sizes.iconSm} color="primary" />
          </Pressable>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="View all appointments"
            onPress={onViewAll}
            style={styles.viewAllRow}
          >
            <ThemedText variant="smallBold" color="primaryText">
              View All
            </ThemedText>
            <AppIcon name="chevronRight" size={sizes.iconSm} color="primary" />
          </Pressable>
        )}
      </View>

      {/* Body States */}
      {isLoading ? (
        <SkeletonCard />
      ) : appointments.length > 0 ? (
        /* State 3: Multiple Appointments Horizontal Carousel */
        <FlatList
          data={appointments}
          keyExtractor={(item) => item.id}
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={carouselCardWidth + spacing.md}
          snapToAlignment="start"
          decelerationRate="fast"
          ItemSeparatorComponent={() => <View style={{ width: spacing.md }} />}
          renderItem={({ item }) => (
            <View
              style={[
                styles.appointmentCarouselCard,
                {
                  width: carouselCardWidth,
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
                  styles.cardTop,
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
                    {item.clinicSuite ? `${item.clinicName} • ${item.clinicSuite}` : item.clinicName}
                  </ThemedText>
                </View>
                <Badge label={item.badgeLabel} tone={item.badgeTone} size="sm" />
              </View>

              {/* Doctor Info */}
              <View style={styles.doctorInfoRow}>
                {item.doctorAvatarUrl ? (
                  <Image
                    source={{ uri: item.doctorAvatarUrl }}
                    style={[
                      styles.doctorAvatarImage,
                      {
                        borderRadius: radii.full,
                        borderColor: colors.borderLight,
                        borderWidth: sizes.borderWidth,
                      },
                    ]}
                    accessibilityLabel={`Portrait of ${item.doctorName}`}
                  />
                ) : (
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
                )}
                <View style={styles.doctorDetails}>
                  <ThemedText variant="bodyBold" numberOfLines={1}>
                    {item.doctorName}
                  </ThemedText>
                  <ThemedText variant="caption" color="textSecondary" numberOfLines={1}>
                    {item.specialty}
                  </ThemedText>
                  <View style={styles.timeRow}>
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
                  styles.actionsRow,
                  {
                    borderTopColor: colors.borderLight,
                    borderTopWidth: sizes.borderWidth,
                    paddingTop: spacing.sm,
                    gap: spacing.sm,
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
                    item.isCheckInEligible ? onCheckIn(item) : onManageVisit(item)
                  }
                />
                <Button
                  label="Directions"
                  variant="outline"
                  size="sm"
                  icon="location"
                  style={styles.flex}
                  onPress={() => onDirections(item)}
                />
              </View>
            </View>
          )}
        />
      ) : isFirstLogin ? (
        /* State 1: First Login Zero-Data Appointments Card */
        <Card
          padding="lg"
          style={[
            styles.emptyCard,
            {
              backgroundColor: colors.surface,
              borderColor: colors.borderLight,
              borderWidth: sizes.borderWidth,
              borderRadius: radii.xl,
              gap: spacing.sm,
            },
            shadows.sm,
          ]}
        >
          <View
            style={[
              styles.emptyIconCircle,
              {
                backgroundColor: colors.primarySubtle,
                borderRadius: radii.full,
                marginBottom: spacing.xs,
              },
            ]}
          >
            <AppIcon name="calendar" size={sizes.iconXl} color="primary" />
          </View>
          <ThemedText variant="h3" style={styles.textCenter}>
            Book Your First Consultation
          </ThemedText>
          <ThemedText variant="small" color="textSecondary" style={styles.textCenter}>
            No appointments yet • Let's get you set up with your first visit at any network clinic or tele-health doctor.
          </ThemedText>
          <View style={[styles.emptyButtonsCol, { gap: spacing.xs, marginTop: spacing.sm }]}>
            <Button
              label="Book First Appointment"
              variant="primary"
              size="md"
              fullWidth
              icon="plus"
              onPress={onBookAppointment}
            />
            <Button
              label="Find Clinics Nearby"
              variant="ghost"
              size="sm"
              icon="location"
              onPress={onExploreClinics}
            />
          </View>
        </Card>
      ) : (
        /* State 2: No Appointments Variant Card */
        <Card
          padding="lg"
          style={[
            styles.emptyCard,
            {
              backgroundColor: colors.surface,
              borderColor: colors.borderLight,
              borderWidth: sizes.borderWidth,
              borderRadius: radii.xl,
              gap: spacing.sm,
            },
            shadows.sm,
          ]}
        >
          <View
            style={[
              styles.emptyIconCircle,
              {
                backgroundColor: colors.primarySubtle,
                borderRadius: radii.full,
                marginBottom: spacing.xs,
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
          <View style={[styles.emptyButtonsRow, { gap: spacing.sm, marginTop: spacing.sm }]}>
            <Button
              label="Book an Appointment"
              variant="primary"
              size="sm"
              icon="plus"
              onPress={onBookAppointment}
            />
            <Button
              label="View Visit History"
              variant="outline"
              size="sm"
              icon="clock"
              onPress={onViewHistory ?? onExploreClinics}
            />
          </View>
        </Card>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  textCenter: {
    textAlign: 'center',
  },
  sectionWrap: {
    width: '100%',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pulseDot: {
    width: 8,
    height: 8,
  },
  viewAllRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  appointmentCarouselCard: {
    width: 290,
  },
  cardTop: {
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
  doctorAvatarImage: {
    width: 48,
    height: 48,
  },
  doctorDetails: {
    flex: 1,
    gap: 2,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  emptyCard: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  emptyIconCircle: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyButtonsCol: {
    width: '100%',
    alignItems: 'center',
  },
  emptyButtonsRow: {
    flexDirection: 'row',
  },
});

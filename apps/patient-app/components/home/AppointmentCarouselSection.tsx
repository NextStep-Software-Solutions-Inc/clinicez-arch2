import React, { memo, useMemo } from 'react';
import {
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { format, isToday, isTomorrow, parseISO } from 'date-fns';
import { AppIcon } from '../ui/Icon';
import { extractInitials } from './HomeHeader';
import { useClinicalEmpathyTheme } from '../../constants/clinicalEmpathy';
import type {
  HomeAppointmentCardDto,
  HomeAppointmentsSectionDto,
} from '../../services/api/homeApi';

export interface AppointmentCarouselSectionProps {
  section: HomeAppointmentsSectionDto;
  checkingInId?: string | null;
  onBookAppointmentPress: () => void;
  onExploreClinicsPress: () => void;
  onViewAllPress: () => void;
  onViewHistoryPress: () => void;
  onAppointmentPress: (item: HomeAppointmentCardDto) => void;
  onCheckInPress: (item: HomeAppointmentCardDto) => void;
  onDirectionsPress: (item: HomeAppointmentCardDto) => void;
}

function formatDayBadge(iso: string): string {
  try {
    const d = parseISO(iso);
    if (isToday(d)) return 'Today';
    if (isTomorrow(d)) return 'Tomorrow';
    return format(d, 'MMM d');
  } catch {
    return 'Scheduled';
  }
}

function formatScheduleWindow(scheduledIso: string, checkInIso: string): string {
  try {
    const d = parseISO(scheduledIso);
    const checkIn = parseISO(checkInIso);
    const dayPrefix = isToday(d) ? 'Today' : isTomorrow(d) ? 'Tomorrow' : format(d, 'EEE, MMM d');
    return `${dayPrefix}, ${format(d, 'h:mm a')} (Check-in ${format(checkIn, 'h:mm a')})`;
  } catch {
    return 'Upcoming consultation';
  }
}

function AppointmentCarouselCard({
  item,
  cardWidth,
  isSingle,
  isCheckingIn,
  onPress,
  onCheckIn,
  onDirections,
}: {
  item: HomeAppointmentCardDto;
  cardWidth: number;
  isSingle: boolean;
  isCheckingIn: boolean;
  onPress: () => void;
  onCheckIn: () => void;
  onDirections: () => void;
}) {
  const { colors, typography, radii, spacing, elevation } = useClinicalEmpathyTheme();
  const dayBadge = useMemo(() => formatDayBadge(item.scheduledAt), [item.scheduledAt]);
  const scheduleLabel = useMemo(
    () => formatScheduleWindow(item.scheduledAt, item.checkInOpensAt),
    [item.scheduledAt, item.checkInOpensAt],
  );
  const providerInitials = useMemo(() => extractInitials(item.providerName), [item.providerName]);
  const clinicMeta = item.clinicAddress
    ? `${item.clinicName} • ${item.clinicAddress}`
    : item.clinicName;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Appointment with ${item.providerName} at ${item.clinicName}`}
      style={({ pressed }) => [
        styles.carouselCard,
        elevation.card,
        {
          width: isSingle ? '100%' : cardWidth,
          backgroundColor: colors.surface,
          borderColor: colors.borderSubtle,
          borderRadius: radii.xl,
          padding: spacing.base,
          gap: spacing.md,
          opacity: pressed ? 0.94 : 1,
        },
      ]}
    >
      <View style={[styles.cardTopRow, { gap: spacing.sm }]}>
        <View style={[styles.facilityRow, { gap: spacing.xs }]}>
          <AppIcon name="building" size={14} color={colors.primary} />
          <Text
            numberOfLines={1}
            style={[typography.bodySmMedium, styles.facilityText, { color: colors.bodyText }]}
          >
            {clinicMeta}
          </Text>
        </View>

        <View
          style={[
            styles.dayPill,
            {
              backgroundColor: colors.mintSoftBg,
              borderRadius: radii.full,
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.xs,
            },
          ]}
        >
          <Text style={[typography.labelSm, { color: colors.primary }]}>{dayBadge}</Text>
        </View>
      </View>

      <View style={[styles.providerRow, { gap: spacing.md }]}>
        <View
          style={[
            styles.providerAvatarWrap,
            {
              borderRadius: radii.full,
              backgroundColor: colors.mintSoftBg,
              borderColor: colors.borderSubtle,
            },
          ]}
        >
          {item.providerAvatarUrl ? (
            <Image
              source={{ uri: item.providerAvatarUrl }}
              style={[styles.providerAvatarImg, { borderRadius: radii.full }]}
            />
          ) : (
            <Text style={[typography.labelLg, { color: colors.primary }]}>
              {providerInitials}
            </Text>
          )}
        </View>

        <View style={[styles.providerInfo, { gap: spacing.xxs }]}>
          <Text numberOfLines={1} style={[typography.cardTitle, { color: colors.navyText }]}>
            {item.providerName}
          </Text>
          <Text numberOfLines={1} style={[typography.bodySm, { color: colors.bodyText }]}>
            {item.providerSpecialty}
          </Text>
          <View style={[styles.timeRow, { gap: spacing.xs, marginTop: spacing.xxs }]}>
            <AppIcon name="clock" size={13} color={colors.primary} />
            <Text
              numberOfLines={1}
              style={[typography.bodySmMedium, styles.facilityText, { color: colors.primary }]}
            >
              {scheduleLabel}
            </Text>
          </View>
        </View>
      </View>

      <View style={[styles.ctaRow, { gap: spacing.sm }]}>
        <Pressable
          onPress={(e) => {
            e.stopPropagation?.();
            onCheckIn();
          }}
          disabled={isCheckingIn}
          accessibilityRole="button"
          accessibilityLabel={item.isCheckedIn ? 'Checked in' : 'Check in for appointment'}
          style={({ pressed }) => [
            styles.primaryActionBtn,
            {
              backgroundColor: item.isCheckedIn ? colors.emeraldText : colors.primary,
              borderRadius: radii.full,
              gap: spacing.xs,
              opacity: isCheckingIn ? 0.65 : pressed ? 0.86 : 1,
            },
          ]}
        >
          <AppIcon
            name={item.isCheckedIn ? 'checkCircle' : 'userCheck'}
            size={16}
            color={colors.onPrimary}
          />
          <Text style={[typography.labelMd, { color: colors.onPrimary }]}>
            {isCheckingIn ? 'Checking In...' : item.isCheckedIn ? 'Checked In' : 'Check In'}
          </Text>
        </Pressable>

        <Pressable
          onPress={(e) => {
            e.stopPropagation?.();
            onDirections();
          }}
          accessibilityRole="button"
          accessibilityLabel={`Get directions to ${item.clinicName}`}
          style={({ pressed }) => [
            styles.secondaryActionBtn,
            {
              backgroundColor: colors.surfaceLow,
              borderRadius: radii.full,
              gap: spacing.xs,
              opacity: pressed ? 0.82 : 1,
            },
          ]}
        >
          <AppIcon name="navigation" size={15} color={colors.primary} />
          <Text style={[typography.labelMd, { color: colors.primary }]}>Directions</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

function AppointmentCarouselSectionComponent({
  section,
  checkingInId,
  onBookAppointmentPress,
  onExploreClinicsPress,
  onViewAllPress,
  onViewHistoryPress,
  onAppointmentPress,
  onCheckInPress,
  onDirectionsPress,
}: AppointmentCarouselSectionProps) {
  const { colors, typography, radii, spacing, elevation } = useClinicalEmpathyTheme();
  const { width: viewportWidth } = useWindowDimensions();

  const hasActive = section.carouselState === 'active' && section.upcomingItems.length > 0;
  const isFirstTime = section.carouselState === 'first_time';

  const peekCardWidth = useMemo(() => {
    const clamped = Math.min(viewportWidth, 720);
    return Math.max(280, clamped - spacing.lg * 2 - 22);
  }, [viewportWidth, spacing.lg]);

  return (
    <View style={{ gap: spacing.md }}>
      <View style={styles.sectionHeader}>
        <View style={[styles.headerLeft, { gap: spacing.sm }]}>
          <View
            style={[
              styles.statusDot,
              {
                borderRadius: radii.full,
                backgroundColor: hasActive ? colors.primary : colors.subtleText,
              },
            ]}
          />
          <Text
            style={[
              typography.overline,
              { color: hasActive ? colors.primary : colors.navyText },
            ]}
          >
            APPOINTMENTS
          </Text>
          <View
            style={[
              styles.countBadge,
              {
                backgroundColor: hasActive ? colors.mintSoftBg : colors.slatePillBg,
                borderRadius: radii.full,
                paddingHorizontal: spacing.sm,
                paddingVertical: spacing.xxs,
              },
            ]}
          >
            <Text
              style={[
                typography.labelSm,
                { color: hasActive ? colors.primary : colors.slatePillText },
              ]}
            >
              {section.scheduledCount} Scheduled
            </Text>
          </View>
        </View>

        <Pressable
          onPress={hasActive ? onViewAllPress : onExploreClinicsPress}
          accessibilityRole="button"
          accessibilityLabel={hasActive ? 'View all appointments' : 'Explore clinics'}
          hitSlop={8}
          style={({ pressed }) => [
            styles.headerLink,
            { gap: spacing.xxs, opacity: pressed ? 0.72 : 1 },
          ]}
        >
          <Text style={[typography.labelMd, { color: colors.primary }]}>
            {hasActive ? 'View All' : 'Explore Clinics'}
          </Text>
          <AppIcon name="forward" size={14} color={colors.primary} />
        </Pressable>
      </View>

      {hasActive ? (
        section.upcomingItems.length === 1 ? (
          <AppointmentCarouselCard
            item={section.upcomingItems[0]}
            cardWidth={peekCardWidth}
            isSingle={true}
            isCheckingIn={checkingInId === section.upcomingItems[0].id}
            onPress={() => onAppointmentPress(section.upcomingItems[0])}
            onCheckIn={() => onCheckInPress(section.upcomingItems[0])}
            onDirections={() => onDirectionsPress(section.upcomingItems[0])}
          />
        ) : (
          <FlatList
            data={section.upcomingItems}
            keyExtractor={(item) => item.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            decelerationRate="fast"
            snapToInterval={peekCardWidth + spacing.md}
            snapToAlignment="start"
            contentContainerStyle={{ gap: spacing.md, paddingRight: spacing.lg }}
            renderItem={({ item }) => (
              <AppointmentCarouselCard
                item={item}
                cardWidth={peekCardWidth}
                isSingle={false}
                isCheckingIn={checkingInId === item.id}
                onPress={() => onAppointmentPress(item)}
                onCheckIn={() => onCheckInPress(item)}
                onDirections={() => onDirectionsPress(item)}
              />
            )}
          />
        )
      ) : (
        <View
          style={[
            styles.emptyCard,
            elevation.card,
            {
              backgroundColor: colors.surface,
              borderColor: colors.borderSubtle,
              borderRadius: radii.xl,
              paddingHorizontal: spacing.xl,
              paddingVertical: spacing.xl,
              gap: spacing.md,
            },
          ]}
        >
          <View
            style={[
              styles.emptyIconCircle,
              {
                backgroundColor: colors.mintSoftBg,
                borderRadius: radii.full,
              },
            ]}
          >
            <AppIcon
              name={isFirstTime ? 'calendarCheck' : 'calendar'}
              size={24}
              color={colors.primary}
            />
          </View>

          <View style={[styles.emptyTextWrap, { gap: spacing.xs }]}>
            <Text
              style={[typography.headlineSm, styles.centerText, { color: colors.navyText }]}
            >
              {isFirstTime ? 'Book Your First Consultation' : 'No Upcoming Consultations'}
            </Text>
            <Text style={[typography.bodySm, styles.centerText, { color: colors.bodyText }]}>
              {isFirstTime
                ? "No appointments yet • Let's get you set up with your first visit at any network clinic or tele-health doctor."
                : "You don't have any appointments scheduled across network clinics."}
            </Text>
          </View>

          <Pressable
            onPress={onBookAppointmentPress}
            accessibilityRole="button"
            accessibilityLabel={
              isFirstTime ? 'Book First Appointment' : 'Book an Appointment'
            }
            style={({ pressed }) => [
              styles.emptyPrimaryBtn,
              {
                backgroundColor: colors.primary,
                borderRadius: radii.full,
                gap: spacing.sm,
                opacity: pressed ? 0.88 : 1,
              },
            ]}
          >
            <AppIcon name="plusCircle" size={18} color={colors.onPrimary} />
            <Text style={[typography.labelLg, { color: colors.onPrimary }]}>
              {isFirstTime ? 'Book First Appointment' : 'Book an Appointment'}
            </Text>
          </Pressable>

          <Pressable
            onPress={isFirstTime ? onExploreClinicsPress : onViewHistoryPress}
            accessibilityRole="button"
            accessibilityLabel={isFirstTime ? 'Find Clinics Nearby' : 'View Visit History'}
            hitSlop={8}
            style={({ pressed }) => [
              styles.emptySecondaryLink,
              { gap: spacing.xs, opacity: pressed ? 0.72 : 1 },
            ]}
          >
            <AppIcon
              name={isFirstTime ? 'navigation' : 'history'}
              size={14}
              color={colors.primary}
            />
            <Text style={[typography.labelMd, { color: colors.primary }]}>
              {isFirstTime ? 'Find Clinics Nearby' : 'View Visit History'}
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  statusDot: {
    width: 8,
    height: 8,
  },
  countBadge: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerLink: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  carouselCard: {
    borderWidth: 1,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  facilityRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
  },
  facilityText: {
    flex: 1,
  },
  dayPill: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  providerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  providerAvatarWrap: {
    width: 54,
    height: 54,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  providerAvatarImg: {
    width: 54,
    height: 54,
  },
  providerInfo: {
    flex: 1,
    minWidth: 0,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ctaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  primaryActionBtn: {
    flex: 1,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryActionBtn: {
    flex: 1,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCard: {
    borderWidth: 1,
    alignItems: 'center',
  },
  emptyIconCircle: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTextWrap: {
    alignItems: 'center',
    maxWidth: 320,
  },
  centerText: {
    textAlign: 'center',
  },
  emptyPrimaryBtn: {
    width: '100%',
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptySecondaryLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
});

export const AppointmentCarouselSection = memo(AppointmentCarouselSectionComponent);
export default AppointmentCarouselSection;

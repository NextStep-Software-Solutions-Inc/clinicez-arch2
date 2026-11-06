import React, { memo } from 'react';
import {
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { AppIcon } from '../ui/Icon';
import { useClinicalEmpathyTheme } from '../../constants/clinicalEmpathy';

export interface SuggestedCareServiceItem {
  id: string;
  title: string;
  subtitle: string;
  detail: string;
  badgeType: 'doctor' | 'video' | 'shield';
  imageUrl?: string | null;
  buttonLabel: string;
  buttonVariant: 'primary' | 'mint' | 'outline';
  onPress: () => void;
}

export interface EmptyAppointmentsViewProps {
  onFindDoctorPress: () => void;
  onQuickConnectPress?: () => void;
  suggestedServices?: SuggestedCareServiceItem[];
}

function EmptyAppointmentsViewComponent({
  onFindDoctorPress,
  onQuickConnectPress,
  suggestedServices = [],
}: EmptyAppointmentsViewProps) {
  const { colors, typography, radii, spacing, elevation } = useClinicalEmpathyTheme();

  return (
    <View style={styles.container}>
      {/* Empty State Main Card */}
      <View
        style={[
          styles.emptyCard,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderRadius: radii.xl,
            padding: spacing.xl,
          },
          elevation.card,
        ]}
      >
        <View
          style={[
            styles.iconBadge,
            {
              backgroundColor: colors.mintSoftBg,
              borderRadius: radii.full,
            },
          ]}
        >
          <AppIcon name="calendarX" size={32} color={colors.primaryDeep} />
        </View>

        <Text
          style={[
            typography.headlineSm,
            {
              color: colors.navyText,
              marginTop: spacing.md,
              fontWeight: '700',
              textAlign: 'center',
            },
          ]}
        >
          No Appointments Scheduled
        </Text>

        <Text
          style={[
            typography.bodyMd,
            {
              color: colors.mutedText,
              marginTop: spacing.xs,
              textAlign: 'center',
              lineHeight: 20,
            },
          ]}
        >
          You don't have any upcoming visits or consultations across your care network.
        </Text>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Find a Doctor and Book"
          onPress={onFindDoctorPress}
          style={({ pressed }) => [
            styles.bookBtn,
            {
              backgroundColor: colors.primaryDeep,
              borderRadius: radii.full,
              paddingHorizontal: spacing.xl,
              paddingVertical: spacing.md - 2,
              marginTop: spacing.lg,
              opacity: pressed ? 0.9 : 1,
            },
          ]}
        >
          <AppIcon name="plus" size={16} color={colors.onPrimary} strokeWidth={2.5} />
          <Text
            style={[
              typography.labelMd,
              {
                color: colors.onPrimary,
                fontWeight: '700',
                marginLeft: 4,
              },
            ]}
          >
            Find a Doctor & Book
          </Text>
        </Pressable>
      </View>

      {/* Suggested Care Services Section */}
      {suggestedServices.length > 0 ? (
        <View style={[styles.suggestedSection, { marginTop: spacing.xl }]}>
          <View style={styles.sectionHeaderRow}>
            <View style={styles.sectionTitleWithDot}>
              <View
                style={[
                  styles.sectionDot,
                  {
                    backgroundColor: colors.primaryDeep,
                    borderRadius: radii.full,
                  },
                ]}
              />
              <Text
                style={[
                  typography.overline,
                  {
                    color: colors.mutedText,
                    letterSpacing: 0.8,
                    fontWeight: '700',
                  },
                ]}
              >
                Suggested Care Services
              </Text>
            </View>

            {onQuickConnectPress ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Quick Connect"
                onPress={onQuickConnectPress}
                hitSlop={8}
              >
                <Text
                  style={[
                    typography.labelSm,
                    {
                      color: colors.primaryDeep,
                      fontWeight: '700',
                    },
                  ]}
                >
                  Quick Connect
                </Text>
              </Pressable>
            ) : null}
          </View>

          {/* Service Cards */}
          <View style={[styles.servicesList, { gap: spacing.md, marginTop: spacing.md }]}>
            {suggestedServices.map((service) => (
              <View
                key={service.id}
                style={[
                  styles.serviceCard,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                    borderRadius: radii.xl,
                    padding: spacing.md,
                  },
                  elevation.card,
                ]}
              >
                {/* Left Badge / Icon */}
                <View style={styles.serviceLeftBlock}>
                  {service.badgeType === 'doctor' && service.imageUrl ? (
                    <View style={styles.serviceAvatarWrap}>
                      <Image
                        source={{ uri: service.imageUrl }}
                        style={[styles.serviceAvatar, { borderRadius: radii.md }]}
                        resizeMode="cover"
                      />
                      <View
                        style={[
                          styles.onlineDot,
                          {
                            backgroundColor: colors.emeraldDot,
                            borderColor: colors.surface,
                            borderRadius: radii.full,
                          },
                        ]}
                      />
                    </View>
                  ) : (
                    <View
                      style={[
                        styles.serviceIconWrap,
                        {
                          backgroundColor: colors.mintSoftBg,
                          borderRadius: radii.lg,
                        },
                      ]}
                    >
                      <AppIcon
                        name={service.badgeType === 'video' ? 'video' : 'shield'}
                        size={22}
                        color={colors.primaryDeep}
                      />
                    </View>
                  )}
                </View>

                {/* Center Content */}
                <View style={styles.serviceContentBlock}>
                  <Text
                    numberOfLines={1}
                    style={[
                      typography.labelLg,
                      {
                        color: colors.navyText,
                        fontWeight: '700',
                      },
                    ]}
                  >
                    {service.title}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={[
                      typography.bodySm,
                      {
                        color: colors.mutedText,
                        marginTop: 2,
                      },
                    ]}
                  >
                    {service.subtitle}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={[
                      typography.bodySmMedium,
                      {
                        color: colors.primaryDeep,
                        marginTop: 2,
                        fontWeight: '500',
                      },
                    ]}
                  >
                    {service.detail}
                  </Text>
                </View>

                {/* Right Action Button */}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={service.buttonLabel}
                  onPress={service.onPress}
                  style={({ pressed }) => [
                    styles.serviceActionBtn,
                    {
                      borderRadius: radii.full,
                      backgroundColor:
                        service.buttonVariant === 'primary'
                          ? colors.primaryDeep
                          : service.buttonVariant === 'mint'
                          ? colors.primaryVibrant
                          : colors.mintSoftBg,
                      borderColor:
                        service.buttonVariant === 'outline' ? colors.border : 'transparent',
                      borderWidth: service.buttonVariant === 'outline' ? 1 : 0,
                      opacity: pressed ? 0.9 : 1,
                    },
                  ]}
                >
                  <Text
                    style={[
                      typography.labelSm,
                      {
                        color:
                          service.buttonVariant === 'primary'
                            ? colors.onPrimary
                            : service.buttonVariant === 'mint'
                            ? colors.primaryDeep
                            : colors.primaryDeep,
                        fontWeight: '700',
                      },
                    ]}
                  >
                    {service.buttonLabel}
                  </Text>
                </Pressable>
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

export const EmptyAppointmentsView = memo(EmptyAppointmentsViewComponent);
export default EmptyAppointmentsView;

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  emptyCard: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  iconBadge: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestedSection: {
    width: '100%',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitleWithDot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionDot: {
    width: 7,
    height: 7,
  },
  servicesList: {
    width: '100%',
  },
  serviceCard: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
  },
  serviceLeftBlock: {
    marginRight: 12,
  },
  serviceAvatarWrap: {
    position: 'relative',
  },
  serviceAvatar: {
    width: 44,
    height: 44,
  },
  onlineDot: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 10,
    height: 10,
    borderWidth: 1.5,
  },
  serviceIconWrap: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  serviceContentBlock: {
    flex: 1,
    paddingRight: 8,
  },
  serviceActionBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

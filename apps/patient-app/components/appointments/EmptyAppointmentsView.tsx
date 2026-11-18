import React, { memo } from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { AppIcon } from '../ui/Icon';
import { useClinicalEmpathyTheme } from '../../constants/clinicalEmpathy';
import { extractInitials } from '../../services/home/homeDashboardService';

export interface SuggestedCareServiceItem {
  id: string;
  title: string;
  subtitle: string;
  detail: string;
  badgeType: 'doctor' | 'video' | 'shield';
  imageUrl?: string | null;
  buttonLabel: string;
  buttonVariant: 'primary' | 'mint' | 'outline';
  onPress?: () => void;
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
            borderColor: colors.borderSubtle,
            borderRadius: radii.xxl,
            paddingVertical: spacing.xxl,
            paddingHorizontal: spacing.xl,
          },
          elevation.card,
        ]}
      >
        <View
          style={[
            styles.iconOuterRing,
            {
              backgroundColor: colors.mintSoftBg,
              borderRadius: radii.full,
            },
          ]}
        >
          <View
            style={[
              styles.iconInnerRing,
              {
                backgroundColor: colors.surfaceLow,
                borderRadius: radii.full,
              },
            ]}
          >
            <AppIcon name="calendarX" size={30} color={colors.primary} />
          </View>
        </View>

        <Text
          style={[
            typography.headlineMd,
            {
              color: colors.navyText,
              marginTop: spacing.lg,
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
              backgroundColor: colors.primary,
              borderRadius: radii.full,
              paddingHorizontal: spacing.xl,
              marginTop: spacing.lg,
              opacity: pressed ? 0.9 : 1,
            },
          ]}
        >
          <AppIcon name="plus" size={16} color={colors.onPrimary} strokeWidth={2.5} />
          <Text
            style={[
              typography.labelBold,
              {
                color: colors.onPrimary,
                marginLeft: spacing.xs + 2,
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
                    backgroundColor: colors.primary,
                    borderRadius: radii.full,
                  },
                ]}
              />
              <Text
                style={[
                  typography.overline,
                  {
                    color: colors.navyText,
                  },
                ]}
              >
                SUGGESTED CARE SERVICES
              </Text>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Quick Connect"
              onPress={onQuickConnectPress ?? (() => {})}
              hitSlop={8}
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            >
              <Text
                style={[
                  typography.labelMd,
                  {
                    color: colors.primary,
                    fontWeight: '700',
                  },
                ]}
              >
                Quick Connect
              </Text>
            </Pressable>
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
                    borderColor: colors.borderSubtle,
                    borderRadius: radii.xl,
                    padding: spacing.base,
                  },
                  elevation.card,
                ]}
              >
                {/* Left Badge / Avatar / Icon */}
                <View style={styles.serviceLeftBlock}>
                  {service.badgeType === 'doctor' ? (
                    <View style={styles.serviceAvatarWrap}>
                      {service.imageUrl ? (
                        <Image
                          source={{ uri: service.imageUrl }}
                          style={[styles.serviceAvatar, { borderRadius: radii.full }]}
                          resizeMode="cover"
                        />
                      ) : (
                        <View
                          style={[
                            styles.serviceAvatarFallback,
                            {
                              backgroundColor: colors.mintSoftBg,
                              borderRadius: radii.full,
                            },
                          ]}
                        >
                          <Text style={[typography.labelMd, { color: colors.primary, fontWeight: '700' }]}>
                            {extractInitials(service.subtitle)}
                          </Text>
                        </View>
                      )}
                      <View
                        style={[
                          styles.onlineRingOuter,
                          {
                            backgroundColor: colors.surface,
                            borderRadius: radii.full,
                          },
                        ]}
                      >
                        <View
                          style={[
                            styles.onlineRingInner,
                            {
                              backgroundColor: colors.surface,
                              borderColor: colors.emeraldDot,
                              borderRadius: radii.full,
                            },
                          ]}
                        />
                      </View>
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
                        name={service.badgeType === 'video' ? 'video' : 'shieldPlus'}
                        size={20}
                        color={colors.primary}
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
                        color: colors.primary,
                        marginTop: 2,
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
                  onPress={service.onPress ?? (() => {})}
                  style={({ pressed }) => [
                    styles.serviceActionBtn,
                    {
                      borderRadius: radii.full,
                      backgroundColor:
                        service.buttonVariant === 'primary'
                          ? colors.primary
                          : service.buttonVariant === 'mint'
                            ? colors.mintAvatarBg
                            : colors.surfaceLow,
                      borderColor:
                        service.buttonVariant === 'outline' ? colors.border : 'transparent',
                      borderWidth: service.buttonVariant === 'outline' ? 1 : 0,
                      opacity: pressed ? 0.9 : 1,
                    },
                  ]}
                >
                  <Text
                    numberOfLines={1}
                    style={[
                      typography.labelMd,
                      {
                        color:
                          service.buttonVariant === 'primary'
                            ? colors.onPrimary
                            : service.buttonVariant === 'mint'
                              ? colors.mintAvatarText
                              : colors.primary,
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
  iconOuterRing: {
    width: 88,
    height: 88,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconInnerRing: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookBtn: {
    minHeight: 46,
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
    width: 8,
    height: 8,
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
    width: 48,
    height: 48,
  },
  serviceAvatarFallback: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  onlineRingOuter: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 14,
    height: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  onlineRingInner: {
    width: 10,
    height: 10,
    borderWidth: 2,
  },
  serviceIconWrap: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  serviceContentBlock: {
    flex: 1,
    minWidth: 0,
    paddingRight: 8,
  },
  serviceActionBtn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
});

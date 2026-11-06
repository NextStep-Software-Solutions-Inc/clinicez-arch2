import React, { memo, useMemo } from 'react';
import { Animated, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import ClinicEzMark from '../ui/ClinicEzMark';
import { AppIcon } from '../ui/Icon';
import { useClinicalEmpathyTheme } from '../../constants/clinicalEmpathy';
import {
  extractInitials,
  HEADER_REVEAL_SCROLL_END,
  HEADER_REVEAL_SCROLL_START,
} from '../../services/home/homeDashboardService';

export { extractInitials, HEADER_REVEAL_SCROLL_END, HEADER_REVEAL_SCROLL_START };

export interface HomeHeaderProps {
  scrollY: Animated.Value;
  title: string;
  subtitle: string;
  fullName: string;
  avatarUrl?: string | null;
  unreadCount?: number;
  showBackButton?: boolean;
  /** Defaults to true (mobile/native). Set false on >= 768px web where WebSidebar shows the logo. */
  showBrand?: boolean;
  /** Defaults to false (animates in on scroll). Set true on >= 768px web workstation. */
  alwaysShowTitle?: boolean;
  /** Optional inline slot (e.g. compact Search bar on >= 768px web) rendered alongside Bell + Avatar. */
  centerSlot?: React.ReactNode;
  /** Optional max width to align inner header edges with workstation content container. */
  maxContentWidth?: number;
  /** Optional horizontal padding override for responsive web viewports. */
  horizontalPadding?: number;
  onBackPress?: () => void;
  onBrandPress?: () => void;
  onNotificationsPress: () => void;
  onAvatarPress: () => void;
}

function HomeHeaderComponent({
  scrollY,
  title,
  subtitle,
  fullName,
  avatarUrl,
  unreadCount = 0,
  showBackButton = false,
  showBrand = true,
  alwaysShowTitle = false,
  centerSlot,
  maxContentWidth,
  horizontalPadding,
  onBackPress,
  onBrandPress,
  onNotificationsPress,
  onAvatarPress,
}: HomeHeaderProps) {
  const { colors, typography, radii, spacing } = useClinicalEmpathyTheme();

  const titleOpacity = useMemo(
    () =>
      scrollY.interpolate({
        inputRange: [HEADER_REVEAL_SCROLL_START, HEADER_REVEAL_SCROLL_END],
        outputRange: [0, 1],
        extrapolate: 'clamp',
      }),
    [scrollY],
  );

  const titleTranslateY = useMemo(
    () =>
      scrollY.interpolate({
        inputRange: [HEADER_REVEAL_SCROLL_START, HEADER_REVEAL_SCROLL_END],
        outputRange: [8, 0],
        extrapolate: 'clamp',
      }),
    [scrollY],
  );

  const borderOpacity = useMemo(
    () =>
      scrollY.interpolate({
        inputRange: [0, HEADER_REVEAL_SCROLL_START],
        outputRange: [0, 1],
        extrapolate: 'clamp',
      }),
    [scrollY],
  );

  const initials = useMemo(() => extractInitials(fullName), [fullName]);
  const hasCenterSlot = Boolean(centerSlot);

  return (
    <View
      style={[
        styles.wrapper,
        {
          backgroundColor: colors.canvas,
          paddingHorizontal: horizontalPadding ?? spacing.lg,
          paddingVertical: alwaysShowTitle ? spacing.md : spacing.sm,
        },
      ]}
    >
      <View
        style={[
          styles.innerContainer,
          maxContentWidth ? { maxWidth: maxContentWidth, alignSelf: 'center' } : null,
        ]}
      >
        <View style={[styles.row, hasCenterSlot ? { gap: spacing.lg } : null]}>
          <View
            style={[
              hasCenterSlot ? styles.leftClusterWithCenter : styles.leftCluster,
              { gap: spacing.sm },
            ]}
          >
            {showBackButton && onBackPress ? (
              <Pressable
                onPress={onBackPress}
                accessibilityRole="button"
                accessibilityLabel="Go back"
                hitSlop={8}
                style={({ pressed }) => [
                  styles.backBtn,
                  {
                    borderRadius: radii.full,
                    backgroundColor: colors.surface,
                    borderColor: colors.borderSubtle,
                    opacity: pressed ? 0.72 : 1,
                  },
                ]}
              >
                <AppIcon name="chevronLeft" size={18} color={colors.navyText} />
              </Pressable>
            ) : null}

            {showBrand ? (
              <Pressable
                onPress={onBrandPress}
                disabled={!onBrandPress}
                accessibilityRole={onBrandPress ? 'button' : 'image'}
                accessibilityLabel="Clinic EZ Home"
                style={({ pressed }) => ({ opacity: onBrandPress && pressed ? 0.8 : 1 })}
              >
                <ClinicEzMark size={36} variant="inverted" />
              </Pressable>
            ) : null}

            <Animated.View
              pointerEvents="none"
              style={[
                styles.animatedTitleWrap,
                alwaysShowTitle
                  ? {
                      opacity: 1,
                      marginLeft: showBrand ? spacing.xs : 0,
                    }
                  : {
                      opacity: titleOpacity,
                      transform: [{ translateY: titleTranslateY }],
                      marginLeft: showBrand ? spacing.xs : 0,
                    },
              ]}
            >
              <Text
                numberOfLines={1}
                style={[
                  alwaysShowTitle ? typography.cardTitle : typography.labelLg,
                  { color: colors.navyText },
                ]}
              >
                {title}
              </Text>
              <Text
                numberOfLines={1}
                style={[typography.bodySm, { color: colors.mutedText }]}
              >
                {subtitle}
              </Text>
            </Animated.View>
          </View>

          <View
            style={[
              hasCenterSlot ? styles.trailingWithSearch : styles.rightCluster,
              { gap: spacing.md },
            ]}
          >
            {centerSlot ? <View style={styles.centerSlotWrap}>{centerSlot}</View> : null}

            <View style={[styles.rightCluster, { gap: spacing.md }]}>
              <Pressable
                onPress={onNotificationsPress}
                accessibilityRole="button"
                accessibilityLabel={
                  unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'
                }
                hitSlop={8}
                style={({ pressed }) => [
                  styles.bellButton,
                  {
                    borderRadius: radii.full,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
              >
                <AppIcon name="notifications" size={22} color={colors.navyText} />
                {unreadCount > 0 ? (
                  <View
                    style={[
                      styles.unreadDot,
                      {
                        backgroundColor: colors.primary,
                        borderColor: colors.canvas,
                        borderRadius: radii.full,
                      },
                    ]}
                  />
                ) : null}
              </Pressable>

              <Pressable
                onPress={onAvatarPress}
                accessibilityRole="button"
                accessibilityLabel="Open profile"
                hitSlop={6}
                style={({ pressed }) => [
                  styles.avatarButton,
                  {
                    borderRadius: radii.full,
                    backgroundColor: colors.mintAvatarBg,
                    borderColor: colors.borderSubtle,
                    opacity: pressed ? 0.8 : 1,
                  },
                ]}
              >
                {avatarUrl ? (
                  <Image
                    source={{ uri: avatarUrl }}
                    style={[styles.avatarImage, { borderRadius: radii.full }]}
                  />
                ) : (
                  <Text style={[typography.labelMd, { color: colors.mintAvatarText }]}>
                    {initials}
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </View>

      <Animated.View
        pointerEvents="none"
        style={[
          styles.bottomHairline,
          {
            backgroundColor: colors.border,
            opacity: alwaysShowTitle ? 1 : borderOpacity,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
    position: 'relative',
    zIndex: 10,
  },
  innerContainer: {
    width: '100%',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
  },
  leftCluster: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
    paddingRight: 12,
  },
  leftClusterWithCenter: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 140,
    maxWidth: 300,
  },
  backBtn: {
    width: 34,
    height: 34,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  animatedTitleWrap: {
    flexShrink: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  trailingWithSearch: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    minWidth: 0,
  },
  centerSlotWrap: {
    flex: 1,
    maxWidth: 440,
    minWidth: 180,
  },
  rightCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
  },
  bellButton: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  unreadDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 9,
    height: 9,
    borderWidth: 1.5,
  },
  avatarButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
  },
  avatarImage: {
    width: 36,
    height: 36,
  },
  bottomHairline: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
  },
});

export const HomeHeader = memo(HomeHeaderComponent);
export default HomeHeader;

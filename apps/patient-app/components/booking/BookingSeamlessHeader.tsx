import React, { memo, useMemo } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { AppIcon } from '../ui/Icon';
import ClinicEzLogo from '../ui/ClinicEzLogo';
import { HEADER_REVEAL_SCROLL_START } from '../home/HomeHeader';
import { useClinicalEmpathyTheme } from '../../constants/clinicalEmpathy';

export interface BookingSeamlessHeaderProps {
  scrollY: Animated.Value;
  isConfirmedStep: boolean;
  showBrandOnConfirmed?: boolean;
  maxContentWidth?: number;
  horizontalPadding?: number;
  onBackPress: () => void;
  onHelpPress?: () => void;
  onDonePress: () => void;
}

const NO_OP = () => {};

/**
 * Sticky seamless top bar for the dedicated Book Appointment flow.
 * Matches `colors.canvas` with a scroll-faded hairline border.
 */
function BookingSeamlessHeaderComponent({
  scrollY,
  isConfirmedStep,
  showBrandOnConfirmed = true,
  maxContentWidth,
  horizontalPadding,
  onBackPress,
  onHelpPress = NO_OP,
  onDonePress,
}: BookingSeamlessHeaderProps) {
  const { colors, typography, radii, spacing } = useClinicalEmpathyTheme();

  const borderOpacity = useMemo(
    () =>
      scrollY.interpolate({
        inputRange: [0, HEADER_REVEAL_SCROLL_START],
        outputRange: [0, 1],
        extrapolate: 'clamp',
      }),
    [scrollY],
  );

  return (
    <View
      style={[
        styles.wrapper,
        {
          backgroundColor: colors.canvas,
          paddingHorizontal: horizontalPadding ?? spacing.base,
          paddingVertical: spacing.sm,
        },
      ]}
    >
      <View
        style={[
          styles.innerContainer,
          maxContentWidth ? { maxWidth: maxContentWidth, alignSelf: 'center' } : null,
        ]}
      >
        {isConfirmedStep ? (
          <View style={styles.row}>
            {showBrandOnConfirmed ? (
              <ClinicEzLogo size={32} variant="inverted" showWordmark />
            ) : (
              <Text style={[typography.headlineSm, { color: colors.navyText }]}>
                Booking Confirmed
              </Text>
            )}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Done"
              onPress={onDonePress}
              style={({ pressed }) => [
                styles.donePill,
                {
                  backgroundColor: colors.surfaceLow,
                  borderRadius: radii.full,
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.sm,
                  opacity: pressed ? 0.8 : 1,
                },
              ]}
            >
              <AppIcon name="check" size={14} color={colors.primary} strokeWidth={2.5} />
              <Text
                style={[
                  typography.labelMd,
                  { color: colors.primary, marginLeft: spacing.xs },
                ]}
              >
                Done
              </Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.row}>
            <View style={[styles.leftCluster, { gap: spacing.md }]}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Go back"
                onPress={onBackPress}
                hitSlop={8}
                style={({ pressed }) => [
                  styles.iconButton,
                  {
                    borderRadius: radii.full,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
              >
                <AppIcon name="back" size={20} color={colors.navyText} />
              </Pressable>

              <Text
                style={[typography.headlineSm, { color: colors.navyText }]}
                numberOfLines={1}
              >
                Book Appointment
              </Text>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Booking help"
              onPress={onHelpPress}
              hitSlop={8}
              style={({ pressed }) => [
                styles.iconButton,
                {
                  borderRadius: radii.full,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <AppIcon name="helpCircle" size={20} color={colors.navyText} />
            </Pressable>
          </View>
        )}
      </View>

      <Animated.View
        pointerEvents="none"
        style={[
          styles.bottomHairline,
          {
            backgroundColor: colors.border,
            opacity: borderOpacity,
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
    minHeight: 40,
  },
  leftCluster: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
    paddingRight: 12,
  },
  iconButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  donePill: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bottomHairline: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
  },
});

export const BookingSeamlessHeader = memo(BookingSeamlessHeaderComponent);
export default BookingSeamlessHeader;

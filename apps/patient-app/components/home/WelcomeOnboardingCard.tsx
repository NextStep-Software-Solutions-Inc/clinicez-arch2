import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import ThemedText from '../ui/ThemedText';
import { AppIcon } from '../ui/Icon';
import { useAppTheme } from '../../contexts/ThemeContext';

export interface WelcomeOnboardingCardProps {
  onCompleteProfile: () => void;
  onLinkInsurance: () => void;
  onFindClinic: () => void;
}

export default function WelcomeOnboardingCard({
  onCompleteProfile,
  onLinkInsurance,
  onFindClinic,
}: WelcomeOnboardingCardProps) {
  const { colors, spacing, radii, shadows, sizes } = useAppTheme();

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.surfaceSubtle,
          borderColor: colors.primaryLight,
          borderWidth: sizes.borderWidth,
          borderRadius: radii.xl,
          padding: spacing.md,
          gap: spacing.sm,
        },
        shadows.sm,
      ]}
    >
      {/* Header Row */}
      <View style={styles.headerRow}>
        <View style={styles.titleWithIcon}>
          <View
            style={[
              styles.iconCircle,
              {
                backgroundColor: colors.primaryLight,
                borderRadius: radii.full,
              },
            ]}
          >
            <AppIcon name="wellness" size={sizes.iconSm} color="primary" />
          </View>
          <ThemedText variant="bodyBold" color="text">
            Welcome to Clinic EZ
          </ThemedText>
        </View>
        <View
          style={[
            styles.stepBadge,
            {
              backgroundColor: colors.primaryLight,
              borderRadius: radii.full,
              paddingHorizontal: spacing.sm,
              paddingVertical: spacing.xxs,
            },
          ]}
        >
          <ThemedText variant="captionBold" color="primaryText">
            Step 1 of 3
          </ThemedText>
        </View>
      </View>

      <ThemedText variant="small" color="textSecondary">
        Your universal patient network is ready. Follow these quick steps to get the most out of your care:
      </ThemedText>

      {/* Steps List */}
      <View style={[styles.stepsList, { gap: spacing.xs }]}>
        {/* Step 1 */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Complete health profile"
          onPress={onCompleteProfile}
          style={({ pressed }) => [
            styles.stepItem,
            {
              backgroundColor: colors.card,
              borderColor: colors.borderLight,
              borderWidth: sizes.borderWidth,
              borderRadius: radii.lg,
              padding: spacing.sm,
              opacity: pressed ? 0.8 : 1,
            },
          ]}
        >
          <View style={styles.stepLeft}>
            <View
              style={[
                styles.stepNumberCircle,
                {
                  borderColor: colors.primary,
                  borderWidth: sizes.borderWidth * 2,
                  borderRadius: radii.full,
                },
              ]}
            >
              <ThemedText variant="captionBold" color="primary">
                1
              </ThemedText>
            </View>
            <View style={styles.stepTexts}>
              <ThemedText variant="smallBold" color="text">
                Complete health profile
              </ThemedText>
              <ThemedText variant="caption" color="textSecondary" numberOfLines={1}>
                Allergies, emergency contact & blood group • ~2 min
              </ThemedText>
            </View>
          </View>
          <AppIcon name="forward" size={sizes.iconSm} color="primary" />
        </Pressable>

        {/* Step 2 */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Link health insurance and benefits"
          onPress={onLinkInsurance}
          style={({ pressed }) => [
            styles.stepItem,
            {
              backgroundColor: colors.card,
              borderColor: colors.borderLight,
              borderWidth: sizes.borderWidth,
              borderRadius: radii.lg,
              padding: spacing.sm,
              opacity: pressed ? 0.8 : 1,
            },
          ]}
        >
          <View style={styles.stepLeft}>
            <View
              style={[
                styles.stepNumberCircle,
                {
                  borderColor: colors.border,
                  borderWidth: sizes.borderWidth * 2,
                  borderRadius: radii.full,
                },
              ]}
            >
              <ThemedText variant="captionBold" color="textSecondary">
                2
              </ThemedText>
            </View>
            <View style={styles.stepTexts}>
              <ThemedText variant="smallBold" color="text">
                Link health insurance & benefits
              </ThemedText>
              <ThemedText variant="caption" color="textSecondary" numberOfLines={1}>
                Instant copay & coverage verification
              </ThemedText>
            </View>
          </View>
          <AppIcon name="plus" size={sizes.iconSm} color="textSecondary" />
        </Pressable>

        {/* Step 3 */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Find and bookmark primary clinic"
          onPress={onFindClinic}
          style={({ pressed }) => [
            styles.stepItem,
            {
              backgroundColor: colors.card,
              borderColor: colors.borderLight,
              borderWidth: sizes.borderWidth,
              borderRadius: radii.lg,
              padding: spacing.sm,
              opacity: pressed ? 0.8 : 1,
            },
          ]}
        >
          <View style={styles.stepLeft}>
            <View
              style={[
                styles.stepNumberCircle,
                {
                  borderColor: colors.border,
                  borderWidth: sizes.borderWidth * 2,
                  borderRadius: radii.full,
                },
              ]}
            >
              <ThemedText variant="captionBold" color="textSecondary">
                3
              </ThemedText>
            </View>
            <View style={styles.stepTexts}>
              <ThemedText variant="smallBold" color="text">
                Find and bookmark primary clinic
              </ThemedText>
              <ThemedText variant="caption" color="textSecondary" numberOfLines={1}>
                Select doctor or center near your home
              </ThemedText>
            </View>
          </View>
          <AppIcon name="location" size={sizes.iconSm} color="textSecondary" />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconCircle: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBadge: {
    alignSelf: 'center',
  },
  stepsList: {
    width: '100%',
    marginTop: 4,
  },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  stepLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  stepNumberCircle: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepTexts: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
});

import React, { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AppIcon } from '../ui/Icon';
import type { IconName } from '../ui/iconNames';
import { useClinicalEmpathyTheme } from '../../constants/clinicalEmpathy';
import type { WelcomeChecklistDto, WelcomeStepKey } from '../../services/api/homeApi';

interface StepDefinition {
  key: WelcomeStepKey;
  stepNumber: number;
  title: string;
  subtitle: string;
  actionIcon: IconName;
}

const STEPS: readonly StepDefinition[] = [
  {
    key: 'health_profile',
    stepNumber: 1,
    title: 'Complete health profile',
    subtitle: 'Allergies, emergency contact & blood group',
    actionIcon: 'arrowRight',
  },
  {
    key: 'link_insurance',
    stepNumber: 2,
    title: 'Link health insurance & benefits',
    subtitle: 'Instant copay & coverage verification',
    actionIcon: 'plusCircle',
  },
  {
    key: 'primary_clinic',
    stepNumber: 3,
    title: 'Find and bookmark primary clinic',
    subtitle: 'Select doctor or center near your home',
    actionIcon: 'navigation',
  },
];

export interface WelcomeChecklistBannerProps {
  checklist: WelcomeChecklistDto;
  onStepPress: (stepKey: WelcomeStepKey) => void;
}

function WelcomeChecklistBannerComponent({
  checklist,
  onStepPress,
}: WelcomeChecklistBannerProps) {
  const { colors, typography, radii, spacing } = useClinicalEmpathyTheme();

  if (checklist.isHidden) {
    return null;
  }

  const visitedSet = new Set(checklist.visitedSteps.map((s) => s.toLowerCase()));
  const firstPendingIndex = STEPS.findIndex((s) => !visitedSet.has(s.key));
  const activeStepNumber =
    firstPendingIndex >= 0 ? STEPS[firstPendingIndex].stepNumber : STEPS.length;

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.welcomeSurface,
          borderColor: colors.welcomeBorder,
          borderRadius: radii.xl,
          padding: spacing.base,
          gap: spacing.md,
        },
      ]}
    >
      <View style={[styles.headerRow, { gap: spacing.sm }]}>
        <View style={[styles.headerLeft, { gap: spacing.sm }]}>
          <View
            style={[
              styles.flagBadge,
              {
                backgroundColor: colors.mintBadgeBg,
                borderRadius: radii.full,
              },
            ]}
          >
            <AppIcon name="flag" size={15} color={colors.primary} />
          </View>
          <Text style={[typography.cardTitle, { color: colors.navyText }]}>
            Welcome to Clinic EZ
          </Text>
        </View>

        <View
          style={[
            styles.stepBadge,
            {
              backgroundColor: colors.mintBadgeBg,
              borderRadius: radii.full,
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.xs,
            },
          ]}
        >
          <Text style={[typography.labelSm, { color: colors.primary }]}>
            Step {activeStepNumber} of {STEPS.length}
          </Text>
        </View>
      </View>

      <Text style={[typography.bodySm, { color: colors.bodyText }]}>
        Your universal patient network is ready. Follow these quick steps to get the most out of
        your care:
      </Text>

      <View style={{ gap: spacing.sm }}>
        {STEPS.map((step) => {
          const isVisited = visitedSet.has(step.key);
          const isCurrent = !isVisited && step.stepNumber === activeStepNumber;

          return (
            <Pressable
              key={step.key}
              onPress={() => onStepPress(step.key)}
              accessibilityRole="button"
              accessibilityLabel={`${step.title}. ${step.subtitle}`}
              style={({ pressed }) => [
                styles.stepCard,
                {
                  backgroundColor: colors.surface,
                  borderColor: isCurrent ? colors.mintBadgeBorder : colors.borderSubtle,
                  borderRadius: radii.lg,
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.md,
                  gap: spacing.md,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <View
                style={[
                  styles.numberCircle,
                  {
                    borderRadius: radii.full,
                    backgroundColor: isVisited ? colors.primary : colors.surface,
                    borderColor: isVisited || isCurrent ? colors.primary : colors.border,
                    borderWidth: isCurrent ? 1.5 : 1,
                  },
                ]}
              >
                {isVisited ? (
                  <AppIcon name="check" size={13} color={colors.onPrimary} />
                ) : (
                  <Text
                    style={[
                      typography.labelSm,
                      { color: isCurrent ? colors.primary : colors.mutedText },
                    ]}
                  >
                    {step.stepNumber}
                  </Text>
                )}
              </View>

              <View style={styles.stepCopy}>
                <Text
                  numberOfLines={1}
                  style={[typography.labelMd, { color: colors.navyText }]}
                >
                  {step.title}
                </Text>
                <Text
                  numberOfLines={1}
                  style={[typography.bodySm, { color: colors.mutedText }]}
                >
                  {step.subtitle}
                </Text>
              </View>

              <AppIcon
                name={isVisited ? 'checkCircle' : step.actionIcon}
                size={18}
                color={isVisited || isCurrent ? colors.primary : colors.mutedText}
              />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    borderWidth: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
  },
  flagBadge: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBadge: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    minHeight: 58,
  },
  numberCircle: {
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepCopy: {
    flex: 1,
    minWidth: 0,
  },
});

export const WelcomeChecklistBanner = memo(WelcomeChecklistBannerComponent);
export default WelcomeChecklistBanner;

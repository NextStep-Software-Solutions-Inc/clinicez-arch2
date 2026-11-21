import React, { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AppIcon } from '../ui/Icon';
import { useClinicalEmpathyTheme } from '../../constants/clinicalEmpathy';

export type BookingStep = 1 | 2 | 3;

export interface BookingStepIndicatorProps {
  currentStep: BookingStep;
  onSelectStep?: (step: BookingStep) => void;
}

const STEPS: Array<{ step: BookingStep; label: string }> = [
  { step: 1, label: 'Doctor' },
  { step: 2, label: 'Slot' },
  { step: 3, label: 'Confirm' },
];

function BookingStepIndicatorComponent({
  currentStep,
  onSelectStep,
}: BookingStepIndicatorProps) {
  const { colors, typography, radii, spacing } = useClinicalEmpathyTheme();

  return (
    <View
      style={[styles.container, { paddingTop: spacing.xs, paddingBottom: spacing.md }]}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 1, max: 3, now: currentStep }}
      accessibilityLabel={`Step ${currentStep} of 3`}
    >
      <View style={styles.stepsRow}>
        {STEPS.map((s, index) => {
          const isDone = s.step < currentStep;
          const isCurrent = s.step === currentStep;
          const isInteractive = Boolean(onSelectStep && isDone);

          const circleContent = (
            <View
              style={[
                styles.stepCircle,
                {
                  borderRadius: radii.full,
                  backgroundColor:
                    isDone || isCurrent ? colors.primary : colors.surfaceLow,
                  borderColor:
                    isDone || isCurrent ? colors.primary : colors.surfaceLow,
                },
              ]}
            >
              {isDone ? (
                <AppIcon
                  name="check"
                  size={14}
                  color={colors.onPrimary}
                  strokeWidth={2.5}
                />
              ) : (
                <Text
                  style={[
                    typography.labelSm,
                    {
                      color: isCurrent ? colors.onPrimary : colors.bodyText,
                    },
                  ]}
                >
                  {s.step}
                </Text>
              )}
            </View>
          );

          return (
            <React.Fragment key={s.step}>
              {index > 0 && (
                <View
                  style={[
                    styles.connectorLine,
                    {
                      backgroundColor:
                        isDone || isCurrent ? colors.primary : colors.border,
                    },
                  ]}
                />
              )}

              <Pressable
                disabled={!isInteractive}
                onPress={() => onSelectStep?.(s.step)}
                accessibilityRole={isInteractive ? 'button' : 'text'}
                accessibilityLabel={`${s.label}, step ${s.step} of 3${isDone ? ', completed' : isCurrent ? ', current step' : ''}`}
                style={({ pressed }) => [
                  styles.stepColumn,
                  { opacity: isInteractive && pressed ? 0.75 : 1 },
                ]}
              >
                {circleContent}

                <Text
                  style={[
                    isCurrent || isDone ? typography.labelSm : typography.bodySm,
                    styles.stepLabel,
                    {
                      color:
                        isCurrent || isDone ? colors.primary : colors.mutedText,
                      marginTop: spacing.xxs + 2,
                    },
                  ]}
                  numberOfLines={1}
                >
                  {s.label}
                </Text>
              </Pressable>
            </React.Fragment>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignItems: 'center',
  },
  stepsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    maxWidth: 320,
    paddingHorizontal: 16,
  },
  stepColumn: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 56,
  },
  stepCircle: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  stepLabel: {
    textAlign: 'center',
  },
  connectorLine: {
    flex: 1,
    height: 2,
    marginHorizontal: 4,
    marginBottom: 18,
  },
});

export const BookingStepIndicator = memo(BookingStepIndicatorComponent);
export default BookingStepIndicator;

import React, { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AppIcon } from '../ui/Icon';
import { useClinicalEmpathyTheme } from '../../constants/clinicalEmpathy';

export type BookingStep = 1 | 2 | 3;

export interface BookingStepIndicatorProps {
  currentStep: BookingStep;
}

const STEPS: Array<{ step: BookingStep; label: string }> = [
  { step: 1, label: 'Doctor' },
  { step: 2, label: 'Slot' },
  { step: 3, label: 'Confirm' },
];

function BookingStepIndicatorComponent({ currentStep }: BookingStepIndicatorProps) {
  const { colors, typography, radii, spacing } = useClinicalEmpathyTheme();

  return (
    <View
      style={styles.container}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 1, max: 3, now: currentStep }}
      accessibilityLabel={`Step ${currentStep} of 3`}
    >
      <View style={styles.stepsRow}>
        {STEPS.map((s, index) => {
          const isDone = s.step < currentStep;
          const isCurrent = s.step === currentStep;

          return (
            <React.Fragment key={s.step}>
              {/* Connector line between steps */}
              {index > 0 && (
                <View
                  style={[
                    styles.connectorLine,
                    {
                      backgroundColor: isDone || isCurrent ? colors.primaryDeep : colors.border,
                    },
                  ]}
                />
              )}

              {/* Step circle + label container */}
              <View style={styles.stepColumn}>
                <View
                  style={[
                    styles.stepCircle,
                    {
                      borderRadius: radii.full,
                      backgroundColor: isDone || isCurrent ? colors.primaryDeep : colors.surface,
                      borderColor: isDone || isCurrent ? colors.primaryDeep : colors.border,
                    },
                  ]}
                >
                  {isDone ? (
                    <AppIcon name="check" size={14} color={colors.onPrimary} strokeWidth={2.5} />
                  ) : (
                    <Text
                      style={[
                        typography.labelSm,
                        {
                          color: isCurrent ? colors.onPrimary : colors.mutedText,
                          fontWeight: '700',
                        },
                      ]}
                    >
                      {s.step}
                    </Text>
                  )}
                </View>

                <Text
                  style={[
                    typography.bodySm,
                    styles.stepLabel,
                    {
                      color: isCurrent ? colors.primaryDeep : colors.mutedText,
                      fontWeight: isCurrent ? '700' : '500',
                      marginTop: spacing.xxs + 2,
                    },
                  ]}
                  numberOfLines={1}
                >
                  {s.label}
                </Text>
              </View>
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
    paddingVertical: 12,
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
    width: 26,
    height: 26,
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
    marginBottom: 16, // Centers the line with the circle relative to the label below
  },
});

export const BookingStepIndicator = memo(BookingStepIndicatorComponent);
export default BookingStepIndicator;

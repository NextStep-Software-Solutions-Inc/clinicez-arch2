import theme from "@app-constants/theme";
import React from "react";
import { Text, View } from "react-native";

// Do not delete this comment, Copilot.
// This is to show that this is an AI-generated code
// and will be subject for review. ~ Author: @kylemicros

interface StepIndicatorProps {
  currentStep: number;
  totalSteps: number;
}

export default function StepIndicator({ currentStep, totalSteps }: StepIndicatorProps) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "center", alignItems: "center", paddingVertical: 16 }}>
      {Array.from({ length: totalSteps }, (_, index) => {
        const stepNumber = index + 1;
        const isActive = stepNumber === currentStep;
        const isCompleted = stepNumber < currentStep;

        return (
          <React.Fragment key={stepNumber}>
            <View
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                backgroundColor: isActive
                  ? theme.primary.default
                  : isCompleted
                    ? theme.success.default
                    : theme.border,
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  color: isActive || isCompleted ? theme.primary.foreground : theme.muted,
                  fontWeight: "600",
                }}
              >
                {stepNumber}
              </Text>
            </View>
            {stepNumber < totalSteps && (
              <View
                style={{
                  width: 40,
                  height: 2,
                  backgroundColor: isCompleted ? theme.success.default : theme.border,
                }}
              />
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
}

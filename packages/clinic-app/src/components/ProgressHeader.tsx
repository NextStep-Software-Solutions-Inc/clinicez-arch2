import React from "react";
import { View, Animated } from "react-native";

import { ThemedText } from "@components/ThemedText";

export interface ProgressStep {
  id: number;
  title: string;
  description: string;
  routeName: string;
}

interface ProgressHeaderProps {
  steps: ProgressStep[];
  currentStep: string;
}

const ProgressHeader: React.FC<ProgressHeaderProps> = ({
  steps,
  currentStep
}) => {
  // Determine current step number based on step name
  const getCurrentStepNumber = (): number => {
    const stepIndex = steps.findIndex(step => step.routeName === currentStep);
    return stepIndex !== -1 ? stepIndex + 1 : 1;
  };

  const currentStepNumber = getCurrentStepNumber();
  const totalSteps = steps.length;
  const progressWidth = (currentStepNumber / totalSteps) * 100;
  const currentStepInfo = steps.find(step => step.routeName === currentStep);

  return (
    <View className="bg-background dark:bg-background-dark px-6 pt-4 pb-6">
      <View className="w-full mb-6">
        <ThemedText className="text-xl font-semibold text-center">
          {currentStepInfo?.title || "Step"}
        </ThemedText>
      </View>

      <View className="w-full">
        <View className="bg-surface dark:bg-surface-dark h-2 rounded-full overflow-hidden">
          <Animated.View
            className="bg-primary dark:bg-primary-dark h-full rounded-full"
            style={{ width: `${progressWidth}%` }}
          />
        </View>
      </View>
    </View>
  );
};

export default ProgressHeader;
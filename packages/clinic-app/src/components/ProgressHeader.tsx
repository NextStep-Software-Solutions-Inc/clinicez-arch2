import React, { useEffect, useRef } from "react";
import { View, Animated, Easing } from "react-native";

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
  // Animation values
  const progressAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const previousStepRef = useRef<number>(0);

  // Determine current step number based on step name
  const getCurrentStepNumber = (): number => {
    const stepIndex = steps.findIndex(step => step.routeName === currentStep);
    return stepIndex !== -1 ? stepIndex + 1 : 1;
  };

  const currentStepNumber = getCurrentStepNumber();
  const totalSteps = steps.length;
  const targetProgress = (currentStepNumber / totalSteps) * 100;
  const currentStepInfo = steps.find(step => step.routeName === currentStep);

  // Animate progress bar when step changes
  useEffect(() => {
    const isForward = currentStepNumber > previousStepRef.current;
    previousStepRef.current = currentStepNumber;

    // Pulse effect on step change
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 1.05,
        duration: 150,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 150,
        easing: Easing.in(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start();

    // Smooth progress bar animation
    Animated.spring(progressAnim, {
      toValue: targetProgress,
      tension: 50,
      friction: 7,
      useNativeDriver: false,
    }).start();
  }, [currentStepNumber, targetProgress]);

  // Initialize progress on mount
  useEffect(() => {
    progressAnim.setValue(targetProgress);
  }, []);

  return (
    <View className="bg-background dark:bg-background-dark px-6 pt-4 pb-6">
      <Animated.View
        className="w-full"
        style={{ transform: [{ scale: scaleAnim }] }}
      >
        <View className="bg-surface dark:bg-surface-dark h-2 rounded-full overflow-hidden">
          <Animated.View
            className="bg-primary dark:bg-primary-dark h-full rounded-full"
            style={{
              width: progressAnim.interpolate({
                inputRange: [0, 100],
                outputRange: ['0%', '100%'],
              })
            }}
          />
        </View>
      </Animated.View>
    </View>
  );
};

export default ProgressHeader;
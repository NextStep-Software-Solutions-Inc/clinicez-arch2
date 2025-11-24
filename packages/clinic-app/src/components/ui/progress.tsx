import theme from "@app-constants/theme";
import React from "react";
import { StyleSheet, Text, View, ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";

interface ProgressProps {
  showProgressText?: boolean;
  step: number;
  steps: number;
  style?: ViewStyle;
}

const Progress = ({
  showProgressText = false,
  step,
  steps,
  style
}: ProgressProps) => {
  const progress = useSharedValue(0);

  React.useEffect(() => {
    const progressValue = Math.min(Math.max(step / steps, 0), 1);
    progress.value = withSpring(progressValue, {
      damping: 15,
      stiffness: 120,
      mass: 0.3,
      overshootClamping: true,
    });
  }, [step, steps, progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`,
  }));

  return (
    <View
      style={[styles.container, style]}
      accessibilityRole="progressbar"
    >
      {showProgressText && (
        <View style={styles.textContainer}>
          <Text
            style={styles.text}
            accessibilityLabel={`Progress: ${step} of ${steps}`}
          >{`${step} / ${steps}`}</Text>
        </View>
      )}
      <View style={styles.background}>
        <Animated.View style={[styles.progressBar, animatedStyle]} />
      </View>
    </View>
  );
};

export default Progress;

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  textContainer: {
    marginBottom: 8,
  },
  text: {
    fontSize: 14,
    fontWeight: '500',
  },
  background: {
    height: 10,
    backgroundColor: theme.progress.background,
    borderRadius: 5,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: theme.progress.foreground,
  },
});
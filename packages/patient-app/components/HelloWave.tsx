import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';

export function HelloWave() {
  const rotationAnimation = useSharedValue(0);

  useEffect(() => {
    // Wave 2 times, then pause
    rotationAnimation.value = withRepeat(
      withSequence(
        // Wave 1
        withTiming(25, { duration: 120 }),
        withTiming(-25, { duration: 120 }),
        withTiming(25, { duration: 120 }),
        withTiming(0, { duration: 120 }),
        // Wave 2
        withTiming(25, { duration: 120 }),
        withTiming(-25, { duration: 120 }),
        withTiming(25, { duration: 120 }),
        withTiming(0, { duration: 120 }),
        // Pause
        withTiming(0, { duration: 1000 })
      ),
      -1 // infinite repeat
    );
  }, [rotationAnimation]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotationAnimation.value}deg` }],
  }));

  return (
    <ThemedView>
      <Animated.View style={animatedStyle}>
        <ThemedText style={styles.text}>👋</ThemedText>
      </Animated.View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  text: {
    fontSize: 28,
    lineHeight: 32,
    marginTop: -6,
  },
});

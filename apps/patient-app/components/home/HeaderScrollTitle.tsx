import React from 'react';
import { Animated, StyleSheet } from 'react-native';
import ThemedText from '../ui/ThemedText';
import { useAppTheme } from '../../contexts/ThemeContext';

export interface HeaderScrollTitleProps {
  scrollY?: Animated.Value;
  title?: string;
  subtitle?: string;
  opacity?: Animated.AnimatedInterpolation<number>;
  translateY?: Animated.AnimatedInterpolation<number>;
}

export default function HeaderScrollTitle({
  scrollY,
  title = 'Clinic EZ',
  subtitle = 'Open Health Network',
  opacity,
  translateY,
}: HeaderScrollTitleProps) {
  const { spacing } = useAppTheme();

  const titleOpacity =
    opacity ??
    (scrollY
      ? scrollY.interpolate({
          inputRange: [0, 48],
          outputRange: [0, 1],
          extrapolate: 'clamp',
        })
      : 1);

  const titleTranslateY =
    translateY ??
    (scrollY
      ? scrollY.interpolate({
          inputRange: [0, 48],
          outputRange: [6, 0],
          extrapolate: 'clamp',
        })
      : 0);

  return (
    <Animated.View
      style={[
        styles.container,
        {
          marginLeft: spacing.sm,
          opacity: titleOpacity,
          transform: [{ translateY: titleTranslateY }],
        },
      ]}
      pointerEvents="none"
    >
      <ThemedText variant="title" color="text" numberOfLines={1} style={styles.title}>
        {title}
      </ThemedText>
      <ThemedText variant="captionBold" color="primary" numberOfLines={1} style={styles.subtitle}>
        {subtitle}
      </ThemedText>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    minWidth: 0,
  },
  title: {
    letterSpacing: -0.5,
    fontWeight: '700',
  },
  subtitle: {
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
});

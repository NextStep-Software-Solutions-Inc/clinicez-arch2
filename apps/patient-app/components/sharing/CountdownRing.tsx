import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import ThemedText from '@ui/ThemedText';
import { useAppTheme } from '../../contexts/ThemeContext';

interface CountdownRingProps {
  /** 0..1 of the validity left. */
  fraction: number;
  secondsLeft: number;
  size?: number;
}

const STROKE_WIDTH = 4;
const LOW_FRACTION = 0.3;

function formatClock(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}:${String(seconds).padStart(2, '0')}` : `${seconds}s`;
}

export default function CountdownRing({ fraction, secondsLeft, size = 48 }: CountdownRingProps) {
  const { colors } = useAppTheme();
  const radius = (size - STROKE_WIDTH) / 2;
  const circumference = 2 * Math.PI * radius;
  const progressColor = fraction <= LOW_FRACTION ? colors.warning : colors.primary;

  return (
    <View
      accessible
      accessibilityRole="timer"
      accessibilityLabel={`Code valid for ${secondsLeft} more seconds`}
      style={{ width: size, height: size }}
    >
      <Svg width={size} height={size} style={styles.ring}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={colors.border}
          strokeWidth={STROKE_WIDTH}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={progressColor}
          strokeWidth={STROKE_WIDTH}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={circumference * (1 - Math.min(1, Math.max(0, fraction)))}
          originX={size / 2}
          originY={size / 2}
          rotation={-90}
        />
      </Svg>
      <View style={styles.label} pointerEvents="none">
        <ThemedText variant="captionBold" color="textSecondary">
          {formatClock(secondsLeft)}
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  ring: { position: 'absolute' },
  label: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
});

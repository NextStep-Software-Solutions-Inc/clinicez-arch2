import React from 'react';
import { View, ColorValue } from 'react-native';
import { useAppTheme } from '../../contexts/ThemeContext';
import ThemedText from './ThemedText';

export function CircularProgress({
  progress = 0,
  size = 40,
  color,
  trackColor,
  textColor,
}: {
  progress?: number;
  size?: number;
  color?: ColorValue;
  trackColor?: ColorValue;
  textColor?: ColorValue;
}) {
  const { colors, radii } = useAppTheme();
  const resolvedColor = color ?? colors.primary;
  const resolvedTrackColor = trackColor ?? colors.primaryLight;
  const resolvedTextColor = textColor ?? colors.primary;

  const percent = Math.max(0, Math.min(100, progress * 100));

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radii.full,
        backgroundColor: resolvedTrackColor,
        overflow: 'hidden',
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <View
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          backgroundColor: resolvedColor,
          opacity: 0.3,
          height: `${percent}%`,
        }}
      />
      <ThemedText
        style={{
          fontSize: size * 0.35,
          fontWeight: '800',
          color: resolvedTextColor,
          opacity: 0.9,
        }}
      >
        {Math.round(percent)}
      </ThemedText>
    </View>
  );
}

export default CircularProgress;

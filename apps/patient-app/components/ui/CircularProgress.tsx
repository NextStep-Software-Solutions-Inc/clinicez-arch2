import React from 'react';
import { View, Text, StyleSheet, ColorValue } from 'react-native';

export function CircularProgress({
  progress = 0,
  size = 40,
  color = '#3B82F6',
  trackColor = '#EFF6FF',
  textColor = '#3B82F6'
}: {
  progress?: number;
  size?: number;
  color?: ColorValue;
  trackColor?: ColorValue;
  textColor?: ColorValue;
}) {
  const radius = size / 2;
  const percent = Math.max(0, Math.min(100, progress * 100));

  return (
    <View style={{ 
      width: size, height: size, borderRadius: radius, 
      backgroundColor: trackColor, overflow: 'hidden',
      justifyContent: 'center', alignItems: 'center',
    }}>
      <View style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        backgroundColor: color, opacity: 0.3,
        height: `${percent}%`,
      }} />
      <Text style={{ fontSize: size * 0.35, fontWeight: '800', color: textColor, opacity: 0.9 }}>
        {Math.round(percent)}
      </Text>
    </View>
  );
}

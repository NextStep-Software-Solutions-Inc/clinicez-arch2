import React from 'react';
import { StyleSheet, View } from 'react-native';
import ThemedText from './ThemedText';
import type { ChipSpec, ChipTone } from '../../utils/prescriptionPresentation';

const TONES: Record<ChipTone, { background: string; color: string }> = {
  neutral: { background: '#F3F4F6', color: '#4B5563' },
  info: { background: '#DBEAFE', color: '#1D4ED8' },
  success: { background: '#D1FAE5', color: '#065F46' },
  warning: { background: '#FEF3C7', color: '#B45309' },
  danger: { background: '#FEE2E2', color: '#991B1B' },
};

export default function StatusChip({ label, tone }: ChipSpec) {
  const palette = TONES[tone];
  return (
    <View style={[styles.chip, { backgroundColor: palette.background }]}>
      <ThemedText style={[styles.label, { color: palette.color }]}>{label}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
  },
});

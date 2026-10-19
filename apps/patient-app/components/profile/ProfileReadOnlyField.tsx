import React from 'react';
import { View, StyleSheet } from 'react-native';
import ThemedText from '@ui/ThemedText';
import { useAppTheme } from '../../contexts/ThemeContext';

interface ProfileReadOnlyFieldProps {
  label: string;
  value?: string | null;
}

export default function ProfileReadOnlyField({ label, value }: ProfileReadOnlyFieldProps) {
  const { colors, spacing } = useAppTheme();

  return (
    <View style={[styles.container, { marginBottom: spacing.md }]}>
      <ThemedText
        variant="captionBold"
        color="textMuted"
        style={styles.label}
      >
        {label}
      </ThemedText>
      <ThemedText variant="body" style={{ color: colors.text }}>
        {value || '—'}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {},
  label: {
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
});

import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import ThemedText from './ThemedText';
import Button from './Button';
import Icon from './Icon';
import { theme } from '../../constants/theme';

export interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
  /** Compact inline variant for use inside cards. */
  compact?: boolean;
  style?: ViewStyle;
}

/** Shown when a request fails. Replaces silently falling back to fake sample data. */
export default function ErrorState({
  title = 'Unable to load data',
  message = 'Check your connection and try again.',
  onRetry,
  retryLabel = 'Retry',
  compact = false,
  style,
}: ErrorStateProps) {
  return (
    <View style={[styles.container, compact && styles.compact, style]} accessibilityRole="alert">
      <View style={styles.iconTile}>
        <Icon name="alertCircle" size={theme.sizes.iconLg} color={theme.colors.emergency} />
      </View>
      <ThemedText variant="h3" style={styles.center}>
        {title}
      </ThemedText>
      <ThemedText variant="body" color={theme.colors.textMuted} style={[styles.center, styles.message]}>
        {message}
      </ThemedText>
      {onRetry ? (
        <Button title={retryLabel} icon="refresh" variant="secondary" size="sm" onPress={onRetry} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.lg,
    padding: theme.spacing['3xl'],
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.emergencyBorder,
    gap: theme.spacing.sm,
  },
  compact: {
    padding: theme.spacing.lg,
  },
  iconTile: {
    width: theme.sizes.controlLg,
    height: theme.sizes.controlLg,
    borderRadius: theme.radii.full,
    backgroundColor: theme.colors.emergencySubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    textAlign: 'center',
  },
  message: {
    maxWidth: 360,
    marginBottom: theme.spacing.xs,
  },
});

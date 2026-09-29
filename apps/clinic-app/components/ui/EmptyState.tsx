import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import ThemedText from './ThemedText';
import Button from './Button';
import { theme } from '../../constants/theme';

export interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
  actionTitle?: string;
  onAction?: () => void;
  style?: ViewStyle;
}

export default function EmptyState({
  icon = '📋',
  title,
  description,
  actionTitle,
  onAction,
  style,
}: EmptyStateProps) {
  return (
    <View style={[styles.container, style]}>
      <ThemedText style={styles.icon}>{icon}</ThemedText>
      <ThemedText variant="h3" style={styles.title}>
        {title}
      </ThemedText>
      {description ? (
        <ThemedText variant="body" color={theme.colors.textMuted} style={styles.description}>
          {description}
        </ThemedText>
      ) : null}
      {actionTitle && onAction ? (
        <Button
          title={actionTitle}
          variant="primary"
          size="sm"
          onPress={onAction}
          style={styles.actionBtn}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.lg,
    padding: theme.spacing['2xl'],
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: theme.spacing.xs,
  },
  icon: {
    fontSize: 36,
    marginBottom: theme.spacing.xs,
  },
  title: {
    textAlign: 'center',
    color: theme.colors.text,
  },
  description: {
    textAlign: 'center',
    maxWidth: 320,
    marginTop: 2,
  },
  actionBtn: {
    marginTop: theme.spacing.md,
  },
});

import React from 'react';
import { StyleSheet } from 'react-native';
import ThemedText from './ThemedText';
import ThemedView from './ThemedView';
import Button from './Button';
import { useAppTheme } from '../../contexts/ThemeContext';

interface EmptyStateProps {
  title: string;
  message: string;
  actionLabel?: string;
  onActionPress?: () => void;
}

export default function EmptyState({ title, message, actionLabel, onActionPress }: EmptyStateProps) {
  const { colors, radii, spacing } = useAppTheme();

  return (
    <ThemedView
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderRadius: radii.lg,
          padding: spacing.lg,
          gap: spacing.xs,
        },
      ]}
    >
      <ThemedText variant="bodyBold">{title}</ThemedText>
      <ThemedText variant="small" color="textSecondary" style={styles.message}>
        {message}
      </ThemedText>
      {actionLabel && onActionPress ? (
        <Button
          label={actionLabel}
          onPress={onActionPress}
          size="sm"
          variant="primary"
          style={styles.actionButton}
        />
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: StyleSheet.hairlineWidth,
  },
  message: {
    lineHeight: 19,
  },
  actionButton: {
    marginTop: 6,
    alignSelf: 'flex-start',
  },
});

import React from 'react';
import { StyleSheet, View } from 'react-native';
import ThemedText from './ThemedText';
import ThemedView from './ThemedView';
import Button from './Button';
import { AppIcon, type IconName } from './Icon';
import { useAppTheme } from '../../contexts/ThemeContext';

interface EmptyStateProps {
  title: string;
  message: string;
  icon?: IconName;
  actionLabel?: string;
  onActionPress?: () => void;
}

export default function EmptyState({ title, message, icon, actionLabel, onActionPress }: EmptyStateProps) {
  const { colors, radii, spacing, sizes } = useAppTheme();

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
      {icon ? (
        <View
          style={[
            styles.iconBox,
            {
              width: sizes.controlMd,
              height: sizes.controlMd,
              borderRadius: radii.md,
              backgroundColor: colors.primaryLight,
              marginBottom: spacing.xs,
            },
          ]}
        >
          <AppIcon name={icon} size={sizes.iconMd} color="primary" />
        </View>
      ) : null}
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
  iconBox: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  message: {
    lineHeight: 19,
  },
  actionButton: {
    marginTop: 6,
    alignSelf: 'flex-start',
  },
});

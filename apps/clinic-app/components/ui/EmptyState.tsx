import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import ThemedText from './ThemedText';
import Button from './Button';
import Icon, { IconName, resolveIconName } from './Icon';
import { theme } from '../../constants/theme';

export interface EmptyStateProps {
  /** IconName (e.g. "clipboard"). Legacy emoji glyphs are still resolved for old call sites. */
  icon?: string;
  title: string;
  description?: string;
  actionTitle?: string;
  onAction?: () => void;
  style?: ViewStyle;
}

export default function EmptyState({
  icon = 'clipboard',
  title,
  description,
  actionTitle,
  onAction,
  style,
}: EmptyStateProps) {
  const iconName: IconName = resolveIconName(icon) ?? 'clipboard';
  return (
    <View style={[styles.container, style]}>
      <View style={styles.iconTile}>
        <Icon name={iconName} size={theme.sizes.iconLg} color={theme.colors.primary} />
      </View>
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
    padding: theme.spacing['3xl'],
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    borderStyle: 'dashed',
    gap: theme.spacing.xs,
  },
  iconTile: {
    width: theme.sizes.controlLg,
    height: theme.sizes.controlLg,
    borderRadius: theme.radii.full,
    backgroundColor: theme.colors.primarySubtle,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.sm,
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

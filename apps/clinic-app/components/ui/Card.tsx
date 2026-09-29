import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import ThemedText from './ThemedText';
import { theme } from '../../constants/theme';

export interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  variant?: 'default' | 'elevated' | 'outlined' | 'subtle';
}

export function Card({ children, style, variant = 'default' }: CardProps) {
  const variantStyles = getCardVariantStyles(variant);
  return <View style={[styles.card, variantStyles, style]}>{children}</View>;
}

export interface CardHeaderProps {
  title: string;
  subtitle?: string;
  rightAction?: React.ReactNode;
  icon?: string;
  style?: ViewStyle;
}

export function CardHeader({ title, subtitle, rightAction, icon, style }: CardHeaderProps) {
  return (
    <View style={[styles.header, style]}>
      <View style={styles.titleRow}>
        {icon ? <ThemedText style={styles.headerIcon}>{icon}</ThemedText> : null}
        <View style={{ flex: 1 }}>
          <ThemedText variant="h3" style={styles.title}>
            {title}
          </ThemedText>
          {subtitle ? (
            <ThemedText variant="caption" color={theme.colors.textMuted} style={styles.subtitle}>
              {subtitle}
            </ThemedText>
          ) : null}
        </View>
      </View>
      {rightAction ? <View style={styles.rightAction}>{rightAction}</View> : null}
    </View>
  );
}

export interface CardContentProps {
  children: React.ReactNode;
  style?: ViewStyle;
}

export function CardContent({ children, style }: CardContentProps) {
  return <View style={[styles.content, style]}>{children}</View>;
}

export interface CardFooterProps {
  children: React.ReactNode;
  style?: ViewStyle;
}

export function CardFooter({ children, style }: CardFooterProps) {
  return <View style={[styles.footer, style]}>{children}</View>;
}

function getCardVariantStyles(variant: 'default' | 'elevated' | 'outlined' | 'subtle') {
  switch (variant) {
    case 'elevated':
      return {
        backgroundColor: theme.colors.surface,
        borderWidth: 1,
        borderColor: theme.colors.border,
        ...theme.shadows.md,
      };
    case 'subtle':
      return {
        backgroundColor: theme.colors.surfaceSubtle,
        borderWidth: 1,
        borderColor: theme.colors.borderLight,
      };
    case 'outlined':
      return {
        backgroundColor: 'transparent',
        borderWidth: 1,
        borderColor: theme.colors.borderDark,
      };
    case 'default':
    default:
      return {
        backgroundColor: theme.colors.surface,
        borderWidth: 1,
        borderColor: theme.colors.border,
        ...theme.shadows.sm,
      };
  }
}

const styles = StyleSheet.create({
  card: {
    borderRadius: theme.radii.lg,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
    paddingBottom: theme.spacing.sm,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: theme.spacing.sm,
  },
  headerIcon: {
    fontSize: 18,
  },
  title: {
    color: theme.colors.text,
  },
  subtitle: {
    marginTop: 2,
  },
  rightAction: {
    marginLeft: theme.spacing.sm,
  },
  content: {
    gap: theme.spacing.md,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderLight,
    paddingTop: theme.spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: theme.spacing.sm,
  },
});

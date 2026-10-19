import React from 'react';
import { View, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import ThemedText from './ThemedText';
import { IconSlot, resolveIconName } from './Icon';
import { theme } from '../../constants/theme';
import { useUiDensity } from '../../context/UiDensityContext';

export interface CardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  variant?: 'default' | 'elevated' | 'outlined' | 'subtle';
}

export function Card({ children, style, variant = 'default' }: CardProps) {
  const { multiplier, cardPadding } = useUiDensity();
  const variantStyles = getCardVariantStyles(variant);
  const densityStyles =
    multiplier !== 1
      ? {
          padding: cardPadding,
          gap: Math.max(6, Math.round(theme.spacing.md * multiplier)),
          borderRadius: Math.max(6, Math.round(theme.radii.lg * multiplier)),
        }
      : null;
  return <View style={[styles.card, variantStyles, densityStyles, style]}>{children}</View>;
}

export interface CardHeaderProps {
  title: string;
  subtitle?: string;
  rightAction?: React.ReactNode;
  /** IconName (e.g. "patients"). Legacy emoji glyphs are still resolved for old call sites. */
  icon?: string;
  style?: ViewStyle;
  truncateTitle?: boolean;
  truncateSubtitle?: boolean;
}

export function CardHeader({
  title,
  subtitle,
  rightAction,
  icon,
  style,
  truncateTitle,
  truncateSubtitle,
}: CardHeaderProps) {
  const { multiplier } = useUiDensity();
  const densityHeaderStyle =
    multiplier !== 1
      ? {
          paddingBottom: Math.max(6, Math.round(theme.spacing.md * multiplier)),
          rowGap: Math.max(4, Math.round(theme.spacing.sm * multiplier)),
        }
      : null;
  const iconTileDim =
    multiplier !== 1
      ? Math.max(26, Math.round((theme.sizes.controlMd - theme.spacing.xs) * multiplier))
      : theme.sizes.controlMd - theme.spacing.xs;
  const iconSize = multiplier < 0.8 ? theme.sizes.iconSm : theme.sizes.iconMd;

  return (
    <View style={[styles.header, densityHeaderStyle, style]}>
      <View style={styles.titleRow}>
        {resolveIconName(icon) ? (
          <View style={[styles.headerIcon, multiplier !== 1 && { width: iconTileDim, height: iconTileDim }]}>
            <IconSlot value={icon} size={iconSize} color={theme.colors.primary} />
          </View>
        ) : null}
        <View style={styles.titleText}>
          <ThemedText
            variant="h3"
            style={styles.title}
            numberOfLines={truncateTitle ? 1 : undefined}
            ellipsizeMode={truncateTitle ? 'tail' : undefined}
          >
            {title}
          </ThemedText>
          {subtitle ? (
            <ThemedText
              variant="caption"
              color={theme.colors.textMuted}
              style={styles.subtitle}
              numberOfLines={truncateSubtitle ? 1 : undefined}
              ellipsizeMode={truncateSubtitle ? 'tail' : undefined}
            >
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
  const { multiplier } = useUiDensity();
  const densityStyle =
    multiplier !== 1
      ? {
          gap: Math.max(6, Math.round(theme.spacing.md * multiplier)),
        }
      : null;
  return <View style={[styles.content, densityStyle, style]}>{children}</View>;
}

export interface CardFooterProps {
  children: React.ReactNode;
  style?: ViewStyle;
}

export function CardFooter({ children, style }: CardFooterProps) {
  const { multiplier } = useUiDensity();
  const densityStyle =
    multiplier !== 1
      ? {
          paddingTop: Math.max(6, Math.round(theme.spacing.md * multiplier)),
          gap: Math.max(4, Math.round(theme.spacing.sm * multiplier)),
        }
      : null;
  return <View style={[styles.footer, densityStyle, style]}>{children}</View>;
}

function getCardVariantStyles(variant: 'default' | 'elevated' | 'outlined' | 'subtle') {
  switch (variant) {
    case 'elevated':
      return {
        backgroundColor: theme.colors.surface,
        borderWidth: theme.sizes.borderWidth,
        borderColor: theme.colors.border,
        ...theme.shadows.md,
      };
    case 'subtle':
      return {
        backgroundColor: theme.colors.surfaceMuted,
        borderWidth: theme.sizes.borderWidth,
        borderColor: theme.colors.borderLight,
      };
    case 'outlined':
      return {
        backgroundColor: theme.colors.transparent,
        borderWidth: theme.sizes.borderWidth,
        borderColor: theme.colors.borderDark,
      };
    case 'default':
    default:
      return {
        backgroundColor: theme.colors.surface,
        borderWidth: theme.sizes.borderWidth,
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
    borderBottomWidth: theme.sizes.borderWidth,
    borderBottomColor: theme.colors.borderLight,
    paddingBottom: theme.spacing.md,
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 200,
    gap: theme.spacing.md,
  },
  headerIcon: {
    width: theme.sizes.controlMd - theme.spacing.xs,
    height: theme.sizes.controlMd - theme.spacing.xs,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.primarySubtle,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  titleText: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: theme.colors.text,
  },
  subtitle: {
    marginTop: 2,
  },
  rightAction: {
    flexShrink: 0,
  },
  content: {
    gap: theme.spacing.md,
  },
  footer: {
    borderTopWidth: theme.sizes.borderWidth,
    borderTopColor: theme.colors.borderLight,
    paddingTop: theme.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: theme.spacing.sm,
  },
});

import React from 'react';
import { View, StyleSheet, ViewStyle, TextStyle } from 'react-native';
import ThemedText from './ThemedText';
import { IconSlot, resolveIconName } from './Icon';
import { theme } from '../../constants/theme';

export type BadgeVariant =
  | 'routine'
  | 'urgent'
  | 'emergency'
  | 'success'
  | 'warning'
  | 'info'
  | 'purple'
  | 'neutral'
  | 'primary'
  | 'outline';

export interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
  size?: 'xs' | 'sm' | 'md';
  style?: ViewStyle;
  textStyle?: TextStyle;
  /** IconName (e.g. "clock"). Legacy emoji glyphs are still resolved for old call sites. */
  icon?: string;
}

export default function Badge({
  label,
  variant = 'neutral',
  size = 'md',
  style,
  textStyle,
  icon,
}: BadgeProps) {
  const variantStyles = getVariantStyles(variant);
  const sizeStyles = getSizeStyles(size);

  return (
    <View style={[styles.badge, variantStyles.container, sizeStyles.container, style]}>
      {resolveIconName(icon) ? (
        <IconSlot value={icon} size={sizeStyles.iconSize} color={variantStyles.text.color} />
      ) : null}
      <ThemedText style={[sizeStyles.text, variantStyles.text, textStyle]}>{label}</ThemedText>
    </View>
  );
}

function getVariantStyles(variant: BadgeVariant) {
  switch (variant) {
    case 'emergency':
      return {
        container: { backgroundColor: theme.colors.emergencyBg, borderColor: theme.colors.emergencyBorder },
        text: { color: theme.colors.emergencyText },
      };
    case 'urgent':
      return {
        container: { backgroundColor: theme.colors.urgentBg, borderColor: theme.colors.urgentBorder },
        text: { color: theme.colors.urgentText },
      };
    case 'routine':
    case 'primary':
      return {
        container: { backgroundColor: theme.colors.primaryLight, borderColor: theme.colors.primaryBorder },
        text: { color: theme.colors.primaryDark },
      };
    case 'success':
      return {
        container: { backgroundColor: theme.colors.successBg, borderColor: theme.colors.successBorder },
        text: { color: theme.colors.successText },
      };
    case 'warning':
      return {
        container: { backgroundColor: theme.colors.warningBg, borderColor: theme.colors.warningBorder },
        text: { color: theme.colors.warningText },
      };
    case 'info':
      return {
        container: { backgroundColor: theme.colors.infoBg, borderColor: theme.colors.infoBorder },
        text: { color: theme.colors.infoText },
      };
    case 'purple':
      return {
        container: { backgroundColor: theme.colors.purpleBg, borderColor: theme.colors.purpleBorder },
        text: { color: theme.colors.purpleText },
      };
    case 'outline':
      return {
        container: { backgroundColor: theme.colors.transparent, borderColor: theme.colors.borderDark },
        text: { color: theme.colors.textSecondary },
      };
    case 'neutral':
    default:
      return {
        container: { backgroundColor: theme.colors.surfaceSubtle, borderColor: theme.colors.border },
        text: { color: theme.colors.textSecondary },
      };
  }
}

function getSizeStyles(size: 'xs' | 'sm' | 'md') {
  if (size === 'xs') {
    return {
      container: {
        paddingVertical: 1,
        paddingHorizontal: theme.spacing.xs,
        borderRadius: theme.radii.xs,
      },
      text: {
        fontSize: theme.fontSizes.xs - 2,
        fontWeight: '700' as const,
        lineHeight: 12,
        letterSpacing: 0.4,
      },
      iconSize: theme.fontSizes.xs - 2,
    };
  }
  if (size === 'sm') {
    return {
      container: {
        paddingVertical: 1,
        paddingHorizontal: theme.spacing.sm - 2,
        borderRadius: theme.radii.xs,
      },
      text: theme.typography.badge,
      iconSize: theme.fontSizes.xs - 2,
    };
  }
  return {
    container: {
      paddingVertical: 2,
      paddingHorizontal: theme.spacing.sm,
      borderRadius: theme.radii.sm,
    },
    text: theme.typography.badge,
    iconSize: theme.fontSizes.xs,
  };
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: theme.spacing.xs,
    borderWidth: theme.sizes.borderWidth,
  },
});

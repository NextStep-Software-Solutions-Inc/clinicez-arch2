import React from 'react';
import { View, StyleSheet, ViewStyle, TextStyle } from 'react-native';
import ThemedText from './ThemedText';
import { theme } from '../../constants/theme';

export type BadgeVariant =
  | 'routine'
  | 'urgent'
  | 'emergency'
  | 'success'
  | 'warning'
  | 'purple'
  | 'neutral'
  | 'primary'
  | 'outline';

export interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
  size?: 'sm' | 'md';
  style?: ViewStyle;
  textStyle?: TextStyle;
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
      {icon ? (
        <ThemedText style={[styles.iconText, sizeStyles.text, variantStyles.text]}>
          {icon}{' '}
        </ThemedText>
      ) : null}
      <ThemedText style={[styles.badgeText, sizeStyles.text, variantStyles.text, textStyle]}>
        {label}
      </ThemedText>
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
        container: { backgroundColor: theme.colors.primaryLight, borderColor: theme.colors.routineBorder },
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
    case 'purple':
      return {
        container: { backgroundColor: theme.colors.purpleBg, borderColor: theme.colors.purpleBorder },
        text: { color: theme.colors.purpleText },
      };
    case 'outline':
      return {
        container: { backgroundColor: 'transparent', borderColor: theme.colors.borderDark },
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

function getSizeStyles(size: 'sm' | 'md') {
  if (size === 'sm') {
    return {
      container: { paddingVertical: 2, paddingHorizontal: 6, borderRadius: theme.radii.xs },
      text: { fontSize: 10, fontWeight: '700' as const },
    };
  }
  return {
    container: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: theme.radii.sm },
    text: { fontSize: 11, fontWeight: '700' as const },
  };
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderWidth: 1,
  },
  iconText: {
    marginRight: 2,
  },
  badgeText: {
    letterSpacing: 0.2,
  },
});

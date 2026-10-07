import React from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type PressableProps,
  type PressableStateCallbackType,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useAppTheme } from '../../contexts/ThemeContext';
import type { AppTheme } from '../../constants/theme';
import ThemedText from './ThemedText';
import { AppIcon, type IconName } from './Icon';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends Omit<PressableProps, 'style' | 'children'> {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: IconName;
  iconRight?: IconName;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
}

type Interaction = PressableStateCallbackType & { hovered?: boolean; focused?: boolean };

function palette(theme: AppTheme, variant: ButtonVariant, hovered: boolean) {
  const c = theme.colors;
  switch (variant) {
    case 'primary':
      return {
        bg: hovered ? c.primaryHover : c.primary,
        fg: c.onPrimary,
        border: c.transparent,
      };
    case 'secondary':
      return { bg: hovered ? c.primaryBorder : c.primaryLight, fg: c.primaryText, border: c.transparent };
    case 'outline':
      return {
        bg: hovered ? c.surfaceSubtle : c.transparent,
        fg: c.text,
        border: c.borderDark,
      };
    case 'danger':
      return { bg: hovered ? c.emergencyText : c.emergency, fg: c.textInverted, border: c.transparent };
    case 'ghost':
    default:
      return { bg: hovered ? c.surfaceSubtle : c.transparent, fg: c.primaryText, border: c.transparent };
  }
}

export default function Button({
  label,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  icon,
  iconRight,
  fullWidth,
  style,
  accessibilityLabel,
  ...rest
}: ButtonProps) {
  const theme = useAppTheme();
  const isDisabled = disabled || loading;
  const height =
    size === 'sm' ? theme.sizes.controlSm : size === 'lg' ? theme.sizes.controlLg : theme.sizes.controlMd;
  const iconSize = size === 'lg' ? theme.sizes.iconLg : theme.sizes.iconMd - 2;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!isDisabled, busy: loading }}
      disabled={isDisabled}
      {...rest}
      style={(state: Interaction) => {
        const p = palette(theme, variant, !!state.hovered && !isDisabled);
        return [
          styles.base,
          {
            minHeight: Platform.OS === 'web' ? height : Math.max(height, theme.sizes.touchTarget),
            paddingHorizontal: size === 'sm' ? theme.spacing.md : theme.spacing.lg,
            borderRadius: theme.radii.md,
            backgroundColor: p.bg,
            borderColor: p.border,
            borderWidth: p.border === theme.colors.transparent ? 0 : theme.sizes.borderWidth,
            opacity: isDisabled ? 0.5 : state.pressed ? 0.85 : 1,
          },
          fullWidth && styles.fullWidth,
          Platform.OS === 'web' && state.focused
            ? ({ outlineColor: theme.colors.focusRing, outlineWidth: 2, outlineOffset: 2, outlineStyle: 'solid' } as ViewStyle)
            : null,
          style,
        ];
      }}
    >
      {({ hovered }: Interaction) => {
        const fg = palette(theme, variant, !!hovered).fg;
        return (
          <View style={styles.content}>
            {loading ? (
              <ActivityIndicator size="small" color={fg} />
            ) : icon ? (
              <AppIcon name={icon} size={iconSize} color={fg} />
            ) : null}
            <ThemedText
              variant={size === 'sm' ? 'smallBold' : 'bodyBold'}
              color={fg}
              numberOfLines={1}
            >
              {label}
            </ThemedText>
            {iconRight && !loading ? <AppIcon name={iconRight} size={iconSize} color={fg} /> : null}
          </View>
        );
      }}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  fullWidth: {
    alignSelf: 'stretch',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
});

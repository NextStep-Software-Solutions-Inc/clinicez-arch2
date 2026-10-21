import React from 'react';
import {
  Pressable,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
  PressableProps,
  PressableStateCallbackType,
} from 'react-native';
import ThemedText from '../ui/ThemedText';
import { IconSlot, resolveIconName } from '../ui/Icon';
import { theme } from '../../constants/theme';
import { useUiDensity } from '../../context/UiDensityContext';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'outline'
  | 'ghost'
  | 'danger'
  | 'success';

export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends Omit<PressableProps, 'style'> {
  title?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** IconName (e.g. "plus"). Legacy emoji glyphs are still resolved for old call sites. */
  icon?: string;
  rightIcon?: string;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  numberOfLines?: number;
  iconOnly?: boolean;
  accessibilityLabel?: string;
}

type InteractionState = PressableStateCallbackType & { hovered?: boolean };

export default function Button({
  title,
  variant = 'primary',
  size = 'md',
  icon,
  rightIcon,
  loading = false,
  disabled = false,
  style,
  textStyle,
  numberOfLines,
  iconOnly = false,
  accessibilityLabel,
  onPress,
  ...rest
}: ButtonProps) {
  const { multiplier } = useUiDensity();
  const variantStyles = getButtonVariantStyles(variant);
  const sizeStyles = getButtonSizeStyles(size, multiplier);
  const showLeftIcon = !loading && !!resolveIconName(icon);
  const showRightIcon = !loading && !!resolveIconName(rightIcon);
  const isPlusIcon = icon === 'plus' || resolveIconName(icon) === 'plus';
  const normalizedTitle =
    title && isPlusIcon
      ? title.replace(/^\s*\+\s*/, '')
      : title;
  const densityBaseStyle =
    multiplier !== 1
      ? {
          gap: Math.max(4, Math.round(theme.spacing.sm * multiplier)),
        }
      : null;

  const iconOnlyStyle: ViewStyle | null = iconOnly
    ? {
        width: sizeStyles.container.minHeight,
        paddingHorizontal: 0,
        alignItems: 'center',
        justifyContent: 'center',
      }
    : null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || normalizedTitle || (isPlusIcon ? 'Add' : undefined)}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      hitSlop={iconOnly || size !== 'lg' ? theme.spacing.xs : undefined}
      style={(state: InteractionState) => [
        styles.buttonBase,
        densityBaseStyle,
        variantStyles.container,
        sizeStyles.container,
        iconOnlyStyle,
        state.hovered && !disabled && variantStyles.hover,
        disabled && styles.disabled,
        state.pressed && !disabled && styles.pressed,
        style,
      ]}
      disabled={disabled || loading}
      onPress={onPress}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator size="small" color={variantStyles.indicatorColor} />
      ) : showLeftIcon ? (
        <IconSlot value={icon} size={sizeStyles.iconSize} color={variantStyles.text.color} />
      ) : null}

      {!iconOnly && normalizedTitle ? (
        <ThemedText
          numberOfLines={numberOfLines}
          style={[styles.textBase, sizeStyles.text, variantStyles.text, textStyle]}
        >
          {normalizedTitle}
        </ThemedText>
      ) : null}

      {!iconOnly && showRightIcon ? (
        <IconSlot value={rightIcon} size={sizeStyles.iconSize} color={variantStyles.text.color} />
      ) : null}
    </Pressable>
  );
}

function getButtonVariantStyles(variant: ButtonVariant) {
  switch (variant) {
    case 'secondary':
      return {
        container: { backgroundColor: theme.colors.surface, borderColor: theme.colors.borderDark },
        hover: { backgroundColor: theme.colors.surfaceSubtle },
        text: { color: theme.colors.text },
        indicatorColor: theme.colors.text,
      };
    case 'outline':
      return {
        container: { backgroundColor: theme.colors.transparent, borderColor: theme.colors.primary },
        hover: { backgroundColor: theme.colors.primarySubtle },
        text: { color: theme.colors.primary },
        indicatorColor: theme.colors.primary,
      };
    case 'ghost':
      return {
        container: { backgroundColor: theme.colors.transparent, borderColor: theme.colors.transparent },
        hover: { backgroundColor: theme.colors.primarySubtle },
        text: { color: theme.colors.primary },
        indicatorColor: theme.colors.primary,
      };
    case 'danger':
      return {
        container: { backgroundColor: theme.colors.emergency, borderColor: theme.colors.emergency },
        hover: { backgroundColor: theme.colors.emergencyText },
        text: { color: theme.colors.onPrimary },
        indicatorColor: theme.colors.onPrimary,
      };
    case 'success':
      return {
        container: { backgroundColor: theme.colors.success, borderColor: theme.colors.success },
        hover: { backgroundColor: theme.colors.successText },
        text: { color: theme.colors.onPrimary },
        indicatorColor: theme.colors.onPrimary,
      };
    case 'primary':
    default:
      return {
        container: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
        hover: { backgroundColor: theme.colors.primaryHover },
        text: { color: theme.colors.onPrimary },
        indicatorColor: theme.colors.onPrimary,
      };
  }
}

function getButtonSizeStyles(size: ButtonSize, multiplier: number = 1) {
  switch (size) {
    case 'sm':
      return {
        container: {
          minHeight: Math.max(24, Math.round(theme.sizes.controlSm * multiplier)),
          paddingHorizontal: Math.max(8, Math.round(theme.spacing.md * multiplier)),
          borderRadius: Math.max(4, Math.round(theme.radii.sm * multiplier)),
        },
        text: theme.typography.captionBold,
        iconSize: multiplier < 0.8 ? 14 : theme.sizes.iconSm,
      };
    case 'lg':
      return {
        container: {
          minHeight: Math.max(34, Math.round(theme.sizes.controlLg * multiplier)),
          paddingHorizontal: Math.max(14, Math.round(theme.spacing['2xl'] * multiplier)),
          borderRadius: Math.max(6, Math.round(theme.radii.md * multiplier)),
        },
        text: theme.typography.h3,
        iconSize: multiplier < 0.8 ? 18 : theme.sizes.iconMd,
      };
    case 'md':
    default:
      return {
        container: {
          minHeight: Math.max(28, Math.round(theme.sizes.controlMd * multiplier)),
          paddingHorizontal: Math.max(10, Math.round(theme.spacing.lg * multiplier)),
          borderRadius: Math.max(6, Math.round(theme.radii.md * multiplier)),
        },
        text: theme.typography.bodyBold,
        iconSize: multiplier < 0.8 ? 14 : theme.sizes.iconSm,
      };
  }
}

const styles = StyleSheet.create({
  buttonBase: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    borderWidth: theme.sizes.borderWidth,
  },
  textBase: {
    textAlign: 'center',
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.85,
  },
});

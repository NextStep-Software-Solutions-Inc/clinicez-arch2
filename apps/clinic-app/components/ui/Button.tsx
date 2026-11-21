import React from 'react';
import {
  Pressable,
  Platform,
  StyleSheet,
  ActivityIndicator,
  StyleProp,
  ViewStyle,
  TextStyle,
  PressableProps,
  PressableStateCallbackType,
} from 'react-native';
import ThemedText from './ThemedText';
import { IconSlot, resolveIconName } from './Icon';
import { theme } from '../../constants/theme';
import { useUiDensity } from '../../context/UiDensityContext';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'outline'
  | 'ghost'
  | 'subtle'
  | 'danger'
  | 'dangerOutline'
  | 'dangerGhost'
  | 'success'
  | 'successOutline';

export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';

export interface ButtonProps extends Omit<PressableProps, 'style'> {
  title?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** IconName (e.g. "plus"). Legacy emoji glyphs are still resolved for old call sites. */
  icon?: string;
  rightIcon?: string;
  loading?: boolean;
  disabled?: boolean;
  spinIcon?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  numberOfLines?: number;
  iconOnly?: boolean;
  tooltip?: string;
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
  spinIcon = false,
  style,
  textStyle,
  numberOfLines,
  iconOnly = false,
  tooltip,
  accessibilityLabel,
  onPress,
  ...rest
}: ButtonProps) {
  const { multiplier } = useUiDensity();
  const variantStyles = getButtonVariantStyles(variant);
  const sizeStyles = getButtonSizeStyles(size, multiplier);
  const isRefreshIcon = resolveIconName(icon) === 'refresh';
  const showLeftIcon = !loading && !!resolveIconName(icon);
  const showRightIcon = !loading && !!resolveIconName(rightIcon);
  const isPlusIcon = icon === 'plus' || resolveIconName(icon) === 'plus';
  const normalizedTitle =
    title && isPlusIcon
      ? title.replace(/^\s*\+\s*/, '')
      : title;
  const resolvedA11yLabel =
    accessibilityLabel || normalizedTitle || tooltip || (isPlusIcon ? 'Add' : undefined);
  const resolvedTooltip =
    tooltip ?? (iconOnly ? (accessibilityLabel || normalizedTitle) : undefined);

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
      accessibilityLabel={resolvedA11yLabel}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      hitSlop={iconOnly || size !== 'lg' ? theme.spacing.xs : undefined}
      {...(Platform.OS === 'web' && resolvedTooltip
        ? ({ title: resolvedTooltip } as Record<string, unknown>)
        : {})}
      style={(state: InteractionState) => [
        styles.buttonBase,
        densityBaseStyle,
        variantStyles.container,
        sizeStyles.container,
        iconOnlyStyle,
        resolveButtonShadow(variant, {
          hovered: state.hovered,
          pressed: state.pressed,
          disabled,
          loading,
        }),
        state.hovered && !disabled && !loading && !state.pressed && variantStyles.hover,
        state.pressed && !disabled && !loading && variantStyles.pressed,
        disabled && styles.disabled,
        state.pressed && !disabled && styles.pressed,
        style,
      ]}
      disabled={disabled || loading}
      onPress={onPress}
      {...rest}
    >
      {loading && isRefreshIcon ? (
        <IconSlot value={icon} size={sizeStyles.iconSize} color={variantStyles.text.color} spin={true} />
      ) : loading ? (
        <ActivityIndicator size="small" color={variantStyles.indicatorColor} />
      ) : showLeftIcon ? (
        <IconSlot value={icon} size={sizeStyles.iconSize} color={variantStyles.text.color} spin={spinIcon} />
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

export function resolveButtonShadow(
  variant: ButtonVariant,
  state: { hovered?: boolean; pressed?: boolean; disabled?: boolean; loading?: boolean }
) {
  if (state.disabled || state.loading || state.pressed) {
    return theme.shadows.none;
  }

  switch (variant) {
    case 'primary':
      return state.hovered ? theme.shadows.brandMd : theme.shadows.brandSm;
    case 'outline':
    case 'secondary':
    case 'subtle':
      return state.hovered ? theme.shadows.brandSm : theme.shadows.brandSubtle;
    case 'ghost':
      return state.hovered ? theme.shadows.brandSubtle : theme.shadows.none;
    case 'danger':
      return state.hovered ? theme.shadows.dangerMd : theme.shadows.dangerSm;
    case 'dangerOutline':
    case 'dangerGhost':
      return state.hovered ? theme.shadows.dangerSm : theme.shadows.none;
    case 'success':
      return state.hovered ? theme.shadows.successMd : theme.shadows.successSm;
    case 'successOutline':
      return state.hovered ? theme.shadows.successSm : theme.shadows.none;
    default:
      return state.hovered ? theme.shadows.brandMd : theme.shadows.brandSm;
  }
}

export function getButtonVariantStyles(variant: ButtonVariant) {
  switch (variant) {
    case 'secondary':
      return {
        container: { backgroundColor: theme.colors.surface, borderColor: theme.colors.borderDark },
        hover: { backgroundColor: theme.colors.primarySubtle, borderColor: theme.colors.primaryBorder },
        pressed: { backgroundColor: theme.colors.primaryLight, borderColor: theme.colors.primaryBorder },
        text: { color: theme.colors.text },
        indicatorColor: theme.colors.text,
      };
    case 'outline':
      return {
        container: { backgroundColor: theme.colors.surface, borderColor: theme.colors.primary },
        hover: { backgroundColor: theme.colors.primarySubtle, borderColor: theme.colors.primaryHover },
        pressed: { backgroundColor: theme.colors.primaryLight, borderColor: theme.colors.primaryDark },
        text: { color: theme.colors.primary },
        indicatorColor: theme.colors.primary,
      };
    case 'subtle':
      return {
        container: { backgroundColor: theme.colors.surfaceSubtle, borderColor: theme.colors.border },
        hover: { backgroundColor: theme.colors.primarySubtle, borderColor: theme.colors.primaryBorder },
        pressed: { backgroundColor: theme.colors.primaryLight, borderColor: theme.colors.primaryBorder },
        text: { color: theme.colors.textSecondary },
        indicatorColor: theme.colors.textSecondary,
      };
    case 'ghost':
      return {
        container: { backgroundColor: theme.colors.transparent, borderColor: theme.colors.transparent },
        hover: { backgroundColor: theme.colors.primarySubtle, borderColor: theme.colors.transparent },
        pressed: { backgroundColor: theme.colors.primaryLight, borderColor: theme.colors.transparent },
        text: { color: theme.colors.primary },
        indicatorColor: theme.colors.primary,
      };
    case 'danger':
      return {
        container: { backgroundColor: theme.colors.emergency, borderColor: theme.colors.emergency },
        hover: { backgroundColor: theme.colors.emergencyText, borderColor: theme.colors.emergencyText },
        pressed: { backgroundColor: theme.colors.emergencyText, borderColor: theme.colors.emergencyText },
        text: { color: theme.colors.onPrimary },
        indicatorColor: theme.colors.onPrimary,
      };
    case 'dangerOutline':
      return {
        container: { backgroundColor: theme.colors.surface, borderColor: theme.colors.emergencyBorder },
        hover: { backgroundColor: theme.colors.emergencySubtle, borderColor: theme.colors.emergency },
        pressed: { backgroundColor: theme.colors.emergencyBg, borderColor: theme.colors.emergency },
        text: { color: theme.colors.emergencyText },
        indicatorColor: theme.colors.emergencyText,
      };
    case 'dangerGhost':
      return {
        container: { backgroundColor: theme.colors.transparent, borderColor: theme.colors.transparent },
        hover: { backgroundColor: theme.colors.emergencySubtle, borderColor: theme.colors.transparent },
        pressed: { backgroundColor: theme.colors.emergencyBg, borderColor: theme.colors.transparent },
        text: { color: theme.colors.emergencyText },
        indicatorColor: theme.colors.emergencyText,
      };
    case 'success':
      return {
        container: { backgroundColor: theme.colors.success, borderColor: theme.colors.success },
        hover: { backgroundColor: theme.colors.successText, borderColor: theme.colors.successText },
        pressed: { backgroundColor: theme.colors.successText, borderColor: theme.colors.successText },
        text: { color: theme.colors.onPrimary },
        indicatorColor: theme.colors.onPrimary,
      };
    case 'successOutline':
      return {
        container: { backgroundColor: theme.colors.surface, borderColor: theme.colors.successBorder },
        hover: { backgroundColor: theme.colors.successBg, borderColor: theme.colors.success },
        pressed: { backgroundColor: theme.colors.successBg, borderColor: theme.colors.successText },
        text: { color: theme.colors.successText },
        indicatorColor: theme.colors.successText,
      };
    case 'primary':
    default:
      return {
        container: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
        hover: { backgroundColor: theme.colors.primaryHover, borderColor: theme.colors.primaryHover },
        pressed: { backgroundColor: theme.colors.primaryDark, borderColor: theme.colors.primaryDark },
        text: { color: theme.colors.onPrimary },
        indicatorColor: theme.colors.onPrimary,
      };
  }
}

export function getButtonSizeStyles(size: ButtonSize, multiplier: number = 1) {
  switch (size) {
    case 'xs':
      return {
        container: {
          minHeight: Math.max(22, Math.round(28 * multiplier)),
          paddingHorizontal: Math.max(6, Math.round(theme.spacing.sm * multiplier)),
          borderRadius: Math.max(4, Math.round(theme.radii.sm * multiplier)),
        },
        text: theme.typography.captionBold,
        iconSize: multiplier < 0.8 ? 12 : 14,
      };
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
    ...(Platform.OS === 'web'
      ? ({
          outlineStyle: 'none',
          transition: 'background-color 140ms ease, border-color 140ms ease, box-shadow 140ms ease, opacity 140ms ease',
        } as any)
      : {}),
  },
  textBase: {
    textAlign: 'center',
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.9,
  },
});

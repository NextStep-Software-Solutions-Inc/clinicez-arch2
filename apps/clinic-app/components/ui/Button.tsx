import React from 'react';
import {
  Pressable,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
  PressableProps,
} from 'react-native';
import ThemedText from './ThemedText';
import { theme } from '../../constants/theme';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'outline'
  | 'ghost'
  | 'danger'
  | 'success';

export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends Omit<PressableProps, 'style'> {
  title: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: string;
  rightIcon?: string;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

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
  onPress,
  ...rest
}: ButtonProps) {
  const variantStyles = getButtonVariantStyles(variant, disabled);
  const sizeStyles = getButtonSizeStyles(size);

  return (
    <Pressable
      style={({ pressed }) => [
        styles.buttonBase,
        variantStyles.container,
        sizeStyles.container,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
        style,
      ]}
      disabled={disabled || loading}
      onPress={onPress}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variantStyles.indicatorColor}
          style={{ marginRight: 6 }}
        />
      ) : icon ? (
        <ThemedText style={[styles.icon, sizeStyles.icon, variantStyles.text]}>
          {icon}{' '}
        </ThemedText>
      ) : null}

      <ThemedText
        style={[
          styles.textBase,
          sizeStyles.text,
          variantStyles.text,
          textStyle,
        ]}
      >
        {title}
      </ThemedText>

      {rightIcon && !loading ? (
        <ThemedText style={[styles.rightIcon, sizeStyles.icon, variantStyles.text]}>
          {' '}{rightIcon}
        </ThemedText>
      ) : null}
    </Pressable>
  );
}

function getButtonVariantStyles(variant: ButtonVariant, disabled: boolean) {
  switch (variant) {
    case 'secondary':
      return {
        container: { backgroundColor: theme.colors.surfaceSubtle, borderWidth: 1, borderColor: theme.colors.border },
        text: { color: theme.colors.text },
        indicatorColor: theme.colors.text,
      };
    case 'outline':
      return {
        container: { backgroundColor: 'transparent', borderWidth: 1, borderColor: theme.colors.primary },
        text: { color: theme.colors.primary },
        indicatorColor: theme.colors.primary,
      };
    case 'ghost':
      return {
        container: { backgroundColor: 'transparent', borderWidth: 0 },
        text: { color: theme.colors.primary },
        indicatorColor: theme.colors.primary,
      };
    case 'danger':
      return {
        container: { backgroundColor: theme.colors.emergency },
        text: { color: '#FFFFFF' },
        indicatorColor: '#FFFFFF',
      };
    case 'success':
      return {
        container: { backgroundColor: theme.colors.success },
        text: { color: '#FFFFFF' },
        indicatorColor: '#FFFFFF',
      };
    case 'primary':
    default:
      return {
        container: { backgroundColor: theme.colors.primary },
        text: { color: '#FFFFFF' },
        indicatorColor: '#FFFFFF',
      };
  }
}

function getButtonSizeStyles(size: ButtonSize) {
  switch (size) {
    case 'sm':
      return {
        container: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: theme.radii.sm },
        text: { fontSize: 12, fontWeight: '700' as const },
        icon: { fontSize: 12 },
      };
    case 'lg':
      return {
        container: { paddingVertical: 14, paddingHorizontal: 20, borderRadius: theme.radii.lg },
        text: { fontSize: 16, fontWeight: '700' as const },
        icon: { fontSize: 16 },
      };
    case 'md':
    default:
      return {
        container: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: theme.radii.md },
        text: { fontSize: 14, fontWeight: '700' as const },
        icon: { fontSize: 14 },
      };
  }
}

const styles = StyleSheet.create({
  buttonBase: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  textBase: {
    textAlign: 'center',
  },
  icon: {
    marginRight: 4,
  },
  rightIcon: {
    marginLeft: 4,
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
});

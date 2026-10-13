import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  TextInputProps,
  ViewStyle,
  TextStyle,
  Pressable,
} from 'react-native';
import ThemedText from './ThemedText';
import { TextInput } from './Text';
import { IconSlot, resolveIconName } from './Icon';
import { theme } from '../../constants/theme';

export interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  helperText?: string;
  disabled?: boolean;
  /** IconName (e.g. "search"). Legacy emoji glyphs are still resolved for old call sites. */
  leftIcon?: string;
  rightIcon?: string;
  onRightIconPress?: () => void;
  containerStyle?: ViewStyle;
  inputStyle?: TextStyle;
  required?: boolean;
  inputRef?: React.Ref<any>;
}

export default function Input({
  label,
  error,
  helperText,
  disabled,
  leftIcon,
  rightIcon,
  onRightIconPress,
  containerStyle,
  inputStyle,
  required,
  inputRef,
  onFocus,
  onBlur,
  editable,
  ...rest
}: InputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const isEditable = disabled !== undefined ? !disabled : (editable ?? true);

  return (
    <View style={[styles.container, containerStyle]}>
      {label ? (
        <ThemedText variant="captionBold" color={theme.colors.textSecondary} style={styles.label}>
          {label}
          {required ? <ThemedText color={theme.colors.emergency}> *</ThemedText> : null}
        </ThemedText>
      ) : null}

      <View
        style={[
          styles.inputWrapper,
          isFocused && styles.inputFocused,
          disabled ? styles.inputDisabled : null,
          error ? styles.inputError : null,
          rest.multiline ? styles.inputMultiline : null,
        ]}
      >
        {resolveIconName(leftIcon) ? (
          <View style={styles.leftIcon}>
            <IconSlot value={leftIcon} size={theme.sizes.iconSm} color={theme.colors.textMuted} />
          </View>
        ) : null}

        <TextInput
          ref={inputRef}
          editable={isEditable}
          style={[styles.input, inputStyle]}
          placeholderTextColor={theme.colors.textLight}
          onFocus={(e) => {
            setIsFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setIsFocused(false);
            onBlur?.(e);
          }}
          {...rest}
        />

        {resolveIconName(rightIcon) ? (
          <Pressable onPress={onRightIconPress} style={styles.rightIconBtn} hitSlop={theme.spacing.sm}>
            <IconSlot value={rightIcon} size={theme.sizes.iconSm} color={theme.colors.textMuted} />
          </Pressable>
        ) : null}
      </View>

      {error ? (
        <View style={styles.feedbackRow}>
          <IconSlot value="alertCircle" size={theme.fontSizes.xs} color={theme.colors.emergency} />
          <ThemedText variant="caption" color={theme.colors.emergency}>
            {error}
          </ThemedText>
        </View>
      ) : helperText ? (
        <ThemedText variant="caption" color={theme.colors.textMuted} style={styles.feedback}>
          {helperText}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: theme.spacing.xs,
  },
  label: {
    marginBottom: 2,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.borderDark,
    borderRadius: theme.radii.md,
    paddingHorizontal: theme.spacing.md,
    minHeight: theme.sizes.controlMd,
  },
  inputMultiline: {
    minHeight: theme.sizes.controlLg + theme.sizes.controlMd,
    alignItems: 'flex-start',
    paddingVertical: theme.spacing.sm,
  },
  inputFocused: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.surface,
  },
  inputDisabled: {
    opacity: 0.6,
    backgroundColor: theme.colors.surfaceSubtle,
  },
  inputError: {
    borderColor: theme.colors.emergency,
    backgroundColor: theme.colors.emergencySubtle,
  },
  leftIcon: {
    marginRight: theme.spacing.sm,
  },
  rightIconBtn: {
    padding: theme.spacing.xs,
    marginLeft: theme.spacing.sm,
  },
  input: {
    flex: 1,
    color: theme.colors.text,
    fontSize: theme.fontSizes.md,
    paddingVertical: theme.spacing.sm,
  },
  feedbackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    marginLeft: 2,
  },
  feedback: {
    marginLeft: 2,
  },
});

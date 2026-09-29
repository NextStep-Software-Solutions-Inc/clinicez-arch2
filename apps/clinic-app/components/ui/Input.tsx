import React, { useState } from 'react';
import {
  View,
  TextInput,
  StyleSheet,
  TextInputProps,
  ViewStyle,
  TextStyle,
  Pressable,
} from 'react-native';
import ThemedText from './ThemedText';
import { theme } from '../../constants/theme';

export interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: string;
  rightIcon?: string;
  onRightIconPress?: () => void;
  containerStyle?: ViewStyle;
  inputStyle?: TextStyle;
  required?: boolean;
}

export default function Input({
  label,
  error,
  helperText,
  leftIcon,
  rightIcon,
  onRightIconPress,
  containerStyle,
  inputStyle,
  required,
  onFocus,
  onBlur,
  ...rest
}: InputProps) {
  const [isFocused, setIsFocused] = useState(false);

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
          error ? styles.inputError : null,
          rest.multiline ? styles.inputMultiline : null,
        ]}
      >
        {leftIcon ? <ThemedText style={styles.leftIcon}>{leftIcon}</ThemedText> : null}

        <TextInput
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

        {rightIcon ? (
          <Pressable onPress={onRightIconPress} style={styles.rightIconBtn}>
            <ThemedText style={styles.rightIcon}>{rightIcon}</ThemedText>
          </Pressable>
        ) : null}
      </View>

      {error ? (
        <ThemedText variant="caption" color={theme.colors.emergency} style={styles.feedback}>
          ⚠️ {error}
        </ThemedText>
      ) : helperText ? (
        <ThemedText variant="caption" color={theme.colors.textLight} style={styles.feedback}>
          {helperText}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 4,
  },
  label: {
    marginBottom: 2,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.md,
    paddingHorizontal: theme.spacing.md,
    minHeight: 42,
  },
  inputMultiline: {
    minHeight: 80,
    alignItems: 'flex-start',
    paddingVertical: theme.spacing.sm,
  },
  inputFocused: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.surface,
  },
  inputError: {
    borderColor: theme.colors.emergency,
    backgroundColor: theme.colors.emergencyBg,
  },
  leftIcon: {
    marginRight: theme.spacing.sm,
    fontSize: 16,
  },
  rightIconBtn: {
    padding: theme.spacing.xs,
    marginLeft: theme.spacing.sm,
  },
  rightIcon: {
    fontSize: 16,
    color: theme.colors.textMuted,
  },
  input: {
    flex: 1,
    color: theme.colors.text,
    fontSize: 14,
    paddingVertical: 8,
  },
  feedback: {
    marginTop: 2,
    marginLeft: 2,
  },
});

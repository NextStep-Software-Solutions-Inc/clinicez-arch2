import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  StyleProp,
  ViewStyle,
} from 'react-native';
import ThemedText from './ThemedText';
import { TextInput } from './Text';
import { IconSlot } from './Icon';
import { theme } from '../../constants/theme';

export const MOD11_WEIGHTS = [6, 5, 4, 3, 2, 7, 6, 5, 4, 3, 2] as const;

export interface Mod11ValidationResult {
  isValid: boolean;
  isComplete: boolean;
  digitsCount: number;
  expectedCheckDigit?: number;
  actualCheckDigit?: number;
  formattedPin: string;
  errorMessage?: string;
}

/**
 * Formats raw input into standard PhilHealth PIN mask XX-XXXXXXXXX-X (RA 11223).
 * Limits to a maximum of 12 numeric digits.
 */
export function formatPhilHealthPin(input: string): string {
  const digits = input.replace(/\D/g, '').slice(0, 12);
  if (digits.length <= 2) {
    return digits;
  }
  if (digits.length <= 11) {
    return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  }
  return `${digits.slice(0, 2)}-${digits.slice(2, 11)}-${digits.slice(11, 12)}`;
}

/**
 * Validates a PhilHealth PIN using Mod-11 check digit verification per RA 11223.
 * Weights: [6, 5, 4, 3, 2, 7, 6, 5, 4, 3, 2] for the first 11 digits.
 * Check digit 10 maps to 0 in PhilHealth specification.
 */
export function validatePhilHealthPinMod11(rawPin: string): Mod11ValidationResult {
  const digits = (rawPin || '').replace(/\D/g, '');
  const formattedPin = formatPhilHealthPin(digits);

  if (digits.length === 0) {
    return {
      isValid: false,
      isComplete: false,
      digitsCount: 0,
      formattedPin: '',
    };
  }

  if (digits.length < 12) {
    return {
      isValid: false,
      isComplete: false,
      digitsCount: digits.length,
      formattedPin,
      errorMessage: `Incomplete PIN (${digits.length}/12 digits)`,
    };
  }

  let sum = 0;
  for (let i = 0; i < 11; i++) {
    sum += parseInt(digits[i], 10) * MOD11_WEIGHTS[i];
  }

  const remainder = sum % 11;
  const expectedCheckDigit = (11 - remainder) % 11;
  const actualCheckDigit = parseInt(digits[11], 10);

  // In PhilHealth Modulus-11, check digit 10 maps to 0
  const isValid =
    (expectedCheckDigit === 10 && actualCheckDigit === 0) ||
    expectedCheckDigit === actualCheckDigit;

  return {
    isValid,
    isComplete: true,
    digitsCount: 12,
    expectedCheckDigit,
    actualCheckDigit,
    formattedPin,
    errorMessage: isValid
      ? undefined
      : `Check digit mismatch: expected ${expectedCheckDigit === 10 ? '0 (or 10)' : expectedCheckDigit}, found ${actualCheckDigit}`,
  };
}

export interface PhilHealthPinInputProps {
  value: string;
  onChangeText: (formatted: string) => void;
  onValidationChange?: (result: Mod11ValidationResult) => void;
  onValidityChange?: (isValid: boolean) => void;
  label?: string;
  placeholder?: string;
  helperText?: string;
  required?: boolean;
  disabled?: boolean;
  editable?: boolean;
  error?: string;
  /** When true, local Mod-11 completion prompts server/PhilHealth verification instead of showing a green verified state prematurely. */
  requireVerification?: boolean;
  /** Remote verification state paired with requireVerification (sequence + PhilHealth DB confirmation). */
  verificationStatus?: 'idle' | 'checking' | 'verified' | 'invalid' | 'server_error';
  /** Custom verified message shown inside the input description once confirmed. */
  verificationMessage?: string;
  /** Optional action button or accessory aligned inline beside the PIN input box. */
  rightAccessory?: React.ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
  testID?: string;
}

export default function PhilHealthPinInput({
  value,
  onChangeText,
  onValidationChange,
  onValidityChange,
  label = 'PhilHealth PIN',
  placeholder = 'XX-XXXXXXXXX-X',
  helperText,
  required = false,
  disabled = false,
  editable = true,
  error: externalError,
  requireVerification = false,
  verificationStatus = 'idle',
  verificationMessage,
  rightAccessory,
  containerStyle,
  testID = 'philhealth-pin-input',
}: PhilHealthPinInputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [touched, setTouched] = useState(false);
  const prevValueRef = useRef(value);

  const isInteractive = !disabled && editable;
  const validation = useMemo(() => validatePhilHealthPinMod11(value), [value]);

  useEffect(() => {
    onValidationChange?.(validation);
    onValidityChange?.(validation.isValid);
  }, [validation, onValidationChange, onValidityChange]);

  const handleChangeText = (rawInput: string) => {
    const prev = prevValueRef.current || '';
    let processed = rawInput;

    // Handle backspace over hyphen: if user deleted trailing hyphen, delete preceding digit too
    if (prev.endsWith('-') && rawInput === prev.slice(0, -1)) {
      const digits = prev.replace(/\D/g, '');
      processed = digits.slice(0, -1);
    }

    const formatted = formatPhilHealthPin(processed);
    prevValueRef.current = formatted;
    onChangeText(formatted);
  };

  const handleBlur = () => {
    setIsFocused(false);
    setTouched(true);
  };

  // Border & background state calculation
  const hasError = !!externalError || (validation.isComplete && !validation.isValid);
  const isServerErrorWarning = !hasError && verificationStatus === 'server_error';
  const isIncompleteOnBlur = touched && validation.digitsCount > 0 && !validation.isComplete;
  const isValidComplete = validation.isComplete && validation.isValid;
  const isVerifiedSuccess = isValidComplete && verificationStatus === 'verified' && !externalError;
  const isSequenceOnlyValid = isValidComplete && !requireVerification && !externalError;

  const wrapperBorderColor = hasError
    ? theme.colors.emergency
    : isIncompleteOnBlur || isServerErrorWarning
    ? theme.colors.warning
    : isVerifiedSuccess || isSequenceOnlyValid
    ? theme.colors.success
    : isFocused
    ? theme.colors.primary
    : theme.colors.borderDark;

  const wrapperBgColor = hasError
    ? theme.colors.emergencySubtle
    : isIncompleteOnBlur || isServerErrorWarning
    ? theme.colors.warningBg
    : theme.colors.surface;

  const pinFieldBox = (
    <View
      style={[
        styles.inputWrapper,
        rightAccessory ? styles.inputWrapperFlex : null,
        { borderColor: wrapperBorderColor, backgroundColor: wrapperBgColor },
        !isInteractive && styles.disabledWrapper,
      ]}
    >
      <View style={styles.leftIcon}>
        <IconSlot
          value="shield"
          size={theme.sizes.iconSm}
          color={
            hasError
              ? theme.colors.emergency
              : isServerErrorWarning
                ? theme.colors.warning
              : isVerifiedSuccess || isSequenceOnlyValid
                ? theme.colors.success
                : theme.colors.textMuted
          }
        />
      </View>

      <TextInput
        style={styles.input}
        value={value}
        onChangeText={handleChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.textLight}
        keyboardType="numeric"
        maxLength={14} // 12 digits + 2 hyphens
        editable={isInteractive}
        onFocus={() => setIsFocused(true)}
        onBlur={handleBlur}
        autoCorrect={false}
        autoCapitalize="none"
      />

      {value.length > 0 && isInteractive ? (
        <Pressable
          onPress={() => handleChangeText('')}
          style={styles.clearBtn}
          hitSlop={theme.spacing.sm}
        >
          <IconSlot value="close" size={theme.sizes.iconSm} color={theme.colors.textMuted} />
        </Pressable>
      ) : null}
    </View>
  );

  return (
    <View style={[styles.container, containerStyle]} testID={testID}>
      {label ? (
        <ThemedText variant="captionBold" color={theme.colors.textSecondary} style={styles.label}>
          {label}
          {required ? <ThemedText variant="captionBold" color={theme.colors.emergency}> *</ThemedText> : null}
        </ThemedText>
      ) : null}

      {rightAccessory ? (
        <View style={styles.inputAccessoryRow}>
          {pinFieldBox}
          {rightAccessory}
        </View>
      ) : (
        pinFieldBox
      )}

      {/* Visual Feedback Row */}
      {hasError ? (
        <View style={styles.feedbackRow}>
          <IconSlot value="alertCircle" size={theme.fontSizes.xs} color={theme.colors.emergency} />
          <ThemedText variant="caption" color={theme.colors.emergency}>
            {externalError || validation.errorMessage}
          </ThemedText>
        </View>
      ) : verificationStatus === 'checking' ? (
        <View style={styles.feedbackRow}>
          <IconSlot value="clock" size={theme.fontSizes.xs} color={theme.colors.info} />
          <ThemedText variant="caption" color={theme.colors.textSecondary}>
            Checking format and PhilHealth records...
          </ThemedText>
        </View>
      ) : isServerErrorWarning ? (
        <View style={styles.feedbackRow}>
          <IconSlot value="alert" size={theme.fontSizes.xs} color={theme.colors.warning} />
          <ThemedText variant="caption" color={theme.colors.warningText}>
            {verificationMessage ||
              'Unable to reach PhilHealth verification server. Retry Verify PIN or defer verification to continue.'}
          </ThemedText>
        </View>
      ) : isIncompleteOnBlur ? (
        <View style={styles.feedbackRow}>
          <IconSlot value="alert" size={theme.fontSizes.xs} color={theme.colors.warning} />
          <ThemedText variant="caption" color={theme.colors.warningText}>
            PhilHealth PIN must be 12 digits ({validation.digitsCount}/12 entered)
          </ThemedText>
        </View>
      ) : isVerifiedSuccess ? (
        <View style={styles.feedbackRow}>
          <IconSlot value="checkCircle" size={theme.fontSizes.xs} color={theme.colors.success} />
          <ThemedText variant="captionBold" color={theme.colors.successText}>
            {verificationMessage || 'Verified with PhilHealth records'}
          </ThemedText>
        </View>
      ) : isValidComplete && requireVerification ? (
        <View style={styles.feedbackRow}>
          <IconSlot value="info" size={theme.fontSizes.xs} color={theme.colors.primary} />
          <ThemedText variant="caption" color={theme.colors.textSecondary}>
            Valid 12-digit format. Click Verify PIN to confirm in PhilHealth records.
          </ThemedText>
        </View>
      ) : isValidComplete ? (
        <View style={styles.feedbackRow}>
          <IconSlot value="checkCircle" size={theme.fontSizes.xs} color={theme.colors.success} />
          <ThemedText variant="captionBold" color={theme.colors.successText}>
            Valid 12-digit PhilHealth PIN format
          </ThemedText>
        </View>
      ) : helperText ? (
        <ThemedText variant="caption" color={theme.colors.textMuted} style={styles.feedback}>
          {helperText}
        </ThemedText>
      ) : (
        <ThemedText variant="caption" color={theme.colors.textMuted} style={styles.feedback}>
          Format: 12 digits (XX-XXXXXXXXX-X)
        </ThemedText>
      )}
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
  inputAccessoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    flexWrap: 'wrap',
  },
  inputWrapperFlex: {
    flex: 1,
    minWidth: 200,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: theme.sizes.borderWidth,
    borderRadius: theme.radii.md,
    paddingHorizontal: theme.spacing.md,
    minHeight: theme.sizes.controlMd,
  },
  disabledWrapper: {
    opacity: 0.6,
    backgroundColor: theme.colors.surfaceMuted,
  },
  leftIcon: {
    marginRight: theme.spacing.sm,
  },
  clearBtn: {
    padding: theme.spacing.xs,
    marginLeft: theme.spacing.xs,
  },
  input: {
    flex: 1,
    color: theme.colors.text,
    fontSize: theme.fontSizes.md,
    letterSpacing: 0.5,
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

import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  StyleProp,
  ViewStyle,
  TextStyle,
} from 'react-native';
import ThemedText from './ThemedText';
import { TextInput } from './Text';
import { IconSlot } from './Icon';
import DatePickerModal from './DatePickerModal';
import { theme } from '../../constants/theme';

/**
 * Strips non-digit characters and masks numeric input into standard YYYY-MM-DD.
 * Automatically rejects all alphabetic and symbol characters (e.g. '2026-10asaasoalkslak').
 */
export function formatDateMask(input: string): string {
  const digits = (input || '').replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

/**
 * Leap year determination per Gregorian calendar rules:
 * Leap if divisible by 4, except century years unless divisible by 400.
 */
export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
}

/**
 * Returns exact days in month taking leap years into account.
 */
export function getDaysInMonth(year: number, month: number): number {
  if (month < 1 || month > 12) return 0;
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  if (month === 4 || month === 6 || month === 9 || month === 11) return 30;
  return 31;
}

export interface DateValidationOptions {
  boundaryMode?: 'pastOrToday' | 'futureOrToday' | 'futureOnly' | 'any';
  minDate?: string; // YYYY-MM-DD
  maxDate?: string; // YYYY-MM-DD
  now?: Date;
}

export interface DateValidationResult {
  isValid: boolean;
  isComplete: boolean;
  rawDigits: string;
  formattedDate: string;
  errorMessage?: string;
  year?: number;
  month?: number;
  day?: number;
}

/**
 * Validates calendar correctness and boundary rules for a raw or formatted date string.
 */
export function validateDateString(
  rawInput: string,
  options: DateValidationOptions = {}
): DateValidationResult {
  const formattedDate = formatDateMask(rawInput);
  const digits = (rawInput || '').replace(/\D/g, '');

  if (digits.length === 0) {
    return {
      isValid: false,
      isComplete: false,
      rawDigits: '',
      formattedDate: '',
    };
  }

  if (digits.length < 8) {
    return {
      isValid: false,
      isComplete: false,
      rawDigits: digits,
      formattedDate,
      errorMessage: `Incomplete date (${digits.length}/8 digits: YYYY-MM-DD)`,
    };
  }

  const year = parseInt(digits.slice(0, 4), 10);
  const month = parseInt(digits.slice(4, 6), 10);
  const day = parseInt(digits.slice(6, 8), 10);

  if (year < 1900 || year > 2100) {
    return {
      isValid: false,
      isComplete: true,
      rawDigits: digits,
      formattedDate,
      errorMessage: 'Year must be between 1900 and 2100',
    };
  }

  if (month < 1 || month > 12) {
    return {
      isValid: false,
      isComplete: true,
      rawDigits: digits,
      formattedDate,
      errorMessage: 'Month must be between 01 and 12',
    };
  }

  const maxDays = getDaysInMonth(year, month);
  if (day < 1 || day > maxDays) {
    const reason =
      month === 2 && !isLeapYear(year) && day === 29
        ? `February ${year} has only 28 days (not a leap year)`
        : `Day must be between 01 and ${maxDays} for month ${String(month).padStart(2, '0')}`;
    return {
      isValid: false,
      isComplete: true,
      rawDigits: digits,
      formattedDate,
      errorMessage: reason,
    };
  }

  const ref = options.now instanceof Date && !isNaN(options.now.getTime()) ? options.now : new Date();
  let todayStr: string;
  try {
    todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(ref);
  } catch {
    todayStr = `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, '0')}-${String(ref.getDate()).padStart(2, '0')}`;
  }
  const { boundaryMode = 'any', minDate, maxDate } = options;

  if (boundaryMode === 'pastOrToday' && formattedDate > todayStr) {
    return {
      isValid: false,
      isComplete: true,
      rawDigits: digits,
      formattedDate,
      errorMessage: `Future date not permitted (today is ${todayStr})`,
    };
  }

  if (boundaryMode === 'futureOrToday' && formattedDate < todayStr) {
    return {
      isValid: false,
      isComplete: true,
      rawDigits: digits,
      formattedDate,
      errorMessage: `Date must be today or in the future (today is ${todayStr})`,
    };
  }

  if (boundaryMode === 'futureOnly' && formattedDate <= todayStr) {
    return {
      isValid: false,
      isComplete: true,
      rawDigits: digits,
      formattedDate,
      errorMessage: 'Date must be strictly in the future',
    };
  }

  if (minDate && formattedDate < minDate) {
    return {
      isValid: false,
      isComplete: true,
      rawDigits: digits,
      formattedDate,
      errorMessage: `Date cannot be earlier than ${minDate}`,
    };
  }

  if (maxDate && formattedDate > maxDate) {
    return {
      isValid: false,
      isComplete: true,
      rawDigits: digits,
      formattedDate,
      errorMessage: `Date cannot be later than ${maxDate}`,
    };
  }

  return {
    isValid: true,
    isComplete: true,
    rawDigits: digits,
    formattedDate,
    year,
    month,
    day,
  };
}

export interface ValidatedDateInputProps {
  value: string;
  onChangeText: (formatted: string) => void;
  onValidationChange?: (result: DateValidationResult) => void;
  onValidityChange?: (isValid: boolean) => void;
  boundaryMode?: 'pastOrToday' | 'futureOrToday' | 'futureOnly' | 'any';
  minDate?: string;
  maxDate?: string;
  now?: Date;
  label?: string;
  placeholder?: string;
  helperText?: string;
  required?: boolean;
  disabled?: boolean;
  editable?: boolean;
  error?: string;
  containerStyle?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
  testID?: string;
  leftIcon?: string;
  rightIcon?: string;
  onRightIconPress?: () => void;
  onCalendarPress?: () => void;
  disableCalendarPicker?: boolean;
  hideValidFeedback?: boolean;
}

export default function ValidatedDateInput({
  value,
  onChangeText,
  onValidationChange,
  onValidityChange,
  boundaryMode = 'any',
  minDate,
  maxDate,
  now,
  label,
  placeholder = 'YYYY-MM-DD',
  helperText,
  required = false,
  disabled = false,
  editable = true,
  error: externalError,
  containerStyle,
  inputStyle,
  testID = 'validated-date-input',
  leftIcon = 'calendar',
  rightIcon,
  onRightIconPress,
  onCalendarPress,
  disableCalendarPicker = false,
  hideValidFeedback = true,
}: ValidatedDateInputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [touched, setTouched] = useState(false);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const prevValueRef = useRef(value);

  const isInteractive = !disabled && editable;
  const validation = useMemo(
    () => validateDateString(value, { boundaryMode, minDate, maxDate, now }),
    [value, boundaryMode, minDate, maxDate, now]
  );

  const isCalendarPressable = Boolean(
    onCalendarPress || (!disableCalendarPicker && isInteractive && leftIcon === 'calendar')
  );

  const handleCalendarPress = () => {
    if (onCalendarPress) {
      onCalendarPress();
    } else if (!disableCalendarPicker && isInteractive) {
      setIsPickerOpen(true);
    }
  };

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

    const formatted = formatDateMask(processed);
    prevValueRef.current = formatted;
    onChangeText(formatted);
  };

  const handleBlur = () => {
    setIsFocused(false);
    setTouched(true);
  };

  const hasExternalError = !!externalError;
  const isInvalidComplete = validation.isComplete && !validation.isValid;
  const isIncompleteOnBlur = touched && validation.rawDigits.length > 0 && !validation.isComplete;
  const isRequiredEmptyOnBlur = touched && required && validation.rawDigits.length === 0;

  const hasError = hasExternalError || isInvalidComplete || isIncompleteOnBlur || isRequiredEmptyOnBlur;
  const errorMessage =
    externalError ||
    (isInvalidComplete
      ? validation.errorMessage
      : isIncompleteOnBlur
      ? validation.errorMessage
      : isRequiredEmptyOnBlur
      ? 'Date is required'
      : undefined);

  const isValidComplete = validation.isComplete && validation.isValid;

  const wrapperBorderColor = hasError
    ? theme.colors.emergencyBorder
    : isValidComplete
    ? theme.colors.successBorder
    : isFocused
    ? theme.colors.primary
    : theme.colors.borderDark;

  const wrapperBgColor = hasError
    ? theme.colors.emergencySubtle
    : !isInteractive
    ? theme.colors.surfaceMuted
    : theme.colors.surface;

  return (
    <View style={[styles.container, containerStyle]} testID={testID}>
      {label ? (
        <ThemedText variant="captionBold" color={theme.colors.textSecondary} style={styles.label}>
          {label}
          {required ? <ThemedText color={theme.colors.emergency}> *</ThemedText> : null}
        </ThemedText>
      ) : null}

      <View
        style={[
          styles.inputWrapper,
          { borderColor: wrapperBorderColor, backgroundColor: wrapperBgColor },
          !isInteractive && styles.disabledWrapper,
        ]}
      >
        {isCalendarPressable ? (
          <Pressable
            onPress={handleCalendarPress}
            style={styles.leftIcon}
            accessibilityRole="button"
            accessibilityLabel="Open calendar picker"
            hitSlop={theme.spacing.xs}
          >
            <IconSlot
              value={leftIcon}
              size={theme.sizes.iconSm}
              color={isValidComplete ? theme.colors.success : theme.colors.textMuted}
            />
          </Pressable>
        ) : (
          <View style={styles.leftIcon}>
            <IconSlot
              value={leftIcon}
              size={theme.sizes.iconSm}
              color={isValidComplete ? theme.colors.success : theme.colors.textMuted}
            />
          </View>
        )}

        <TextInput
          style={[styles.input, inputStyle]}
          value={value}
          onChangeText={handleChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.colors.textLight}
          keyboardType="numeric"
          maxLength={10} // YYYY-MM-DD
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

        {rightIcon ? (
          <Pressable onPress={onRightIconPress} style={styles.rightIconBtn} hitSlop={theme.spacing.sm}>
            <IconSlot value={rightIcon} size={theme.sizes.iconSm} color={theme.colors.textMuted} />
          </Pressable>
        ) : null}
      </View>

      {/* Visual Feedback Row */}
      {hasError && errorMessage ? (
        <View style={styles.feedbackRow}>
          <IconSlot value="alertCircle" size={theme.fontSizes.xs} color={theme.colors.emergency} />
          <ThemedText variant="caption" color={theme.colors.emergencyText}>
            {errorMessage}
          </ThemedText>
        </View>
      ) : hideValidFeedback ? null : isValidComplete ? (
        <View style={styles.feedbackRow}>
          <IconSlot value="checkCircle" size={theme.fontSizes.xs} color={theme.colors.success} />
          <ThemedText variant="captionBold" color={theme.colors.successText}>
            Valid Date
          </ThemedText>
        </View>
      ) : helperText ? (
        <ThemedText variant="caption" color={theme.colors.textMuted} style={styles.feedback}>
          {helperText}
        </ThemedText>
      ) : (
        <ThemedText variant="caption" color={theme.colors.textMuted} style={styles.feedback}>
          Format: YYYY-MM-DD
        </ThemedText>
      )}

      {/* Built-in Single Date Calendar Picker Modal */}
      {!disableCalendarPicker && isInteractive && (
        <DatePickerModal
          visible={isPickerOpen}
          onClose={() => setIsPickerOpen(false)}
          value={validation.isValid ? validation.formattedDate : value}
          onSelect={(selected) => {
            handleChangeText(selected);
          }}
          boundaryMode={boundaryMode}
          minDate={minDate}
          maxDate={maxDate}
          label={label || 'Select Date'}
        />
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
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: theme.sizes.borderWidth,
    borderRadius: theme.radii.md,
    paddingHorizontal: theme.spacing.sm,
    minHeight: theme.sizes.controlMd,
    overflow: 'hidden',
  },
  disabledWrapper: {
    opacity: 0.6,
  },
  leftIcon: {
    marginRight: theme.spacing.xs,
    flexShrink: 0,
  },
  clearBtn: {
    padding: theme.spacing.xs,
    marginLeft: theme.spacing.xs,
    flexShrink: 0,
  },
  rightIconBtn: {
    padding: theme.spacing.xs,
    marginLeft: theme.spacing.xs,
    flexShrink: 0,
  },
  input: {
    flex: 1,
    minWidth: 0,
    flexShrink: 1,
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

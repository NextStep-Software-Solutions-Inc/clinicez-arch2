import React, { forwardRef, useState } from 'react';
import {
  Platform,
  StyleSheet,
  View,
  type NativeSyntheticEvent,
  type StyleProp,
  type TextInput as RNTextInput,
  type TextInputFocusEventData,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { useAppTheme } from '../../contexts/ThemeContext';
import { TextInput } from './Text';
import ThemedText from './ThemedText';
import { AppIcon, type IconName } from './Icon';
import { useInBottomSheet } from './BottomSheetContext';
import { BottomSheetTextInput } from '@gorhom/bottom-sheet';

export interface InputProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  required?: boolean;
  /** Helper text shown under the field. */
  hint?: string;
  /** Error message; also switches the border to the emergency colour. */
  error?: string | null;
  leftIcon?: IconName;
  /** Trailing element (e.g. a show/hide button). */
  right?: React.ReactNode;
  disabled?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
  /** Explicitly opt-in or opt-out of BottomSheetTextInput when in bottom sheet */
  useBottomSheetInput?: boolean;
}

/**
 * Token-driven text field: label above, themed border, visible focus ring (web + native),
 * hint / error text below. Replaces ad-hoc `TextInput` styling across screens.
 */
const Input = forwardRef<RNTextInput, InputProps>(function Input(
  { label, required, hint, error, leftIcon, right, disabled, multiline, containerStyle, onFocus, onBlur, useBottomSheetInput, ...rest },
  ref,
) {
  const { colors, spacing, radii, sizes, typography } = useAppTheme();
  const [focused, setFocused] = useState(false);
  const inBottomSheet = useInBottomSheet();

  const borderColor = error ? colors.emergency : focused ? colors.focusRing : colors.border;
  const shouldUseBottomSheet = (useBottomSheetInput ?? inBottomSheet) && Platform.OS !== 'web';
  const InputComponent: any = shouldUseBottomSheet ? BottomSheetTextInput : TextInput;

  return (
    <View style={[{ marginBottom: spacing.lg }, containerStyle]}>
      {label ? (
        <ThemedText variant="smallBold" color="textSecondary" style={{ marginBottom: spacing.xs }}>
          {label}
          {required ? <ThemedText variant="smallBold" color="emergency"> *</ThemedText> : null}
        </ThemedText>
      ) : null}
      <View
        style={[
          styles.field,
          {
            borderColor,
            borderRadius: radii.md,
            borderWidth: focused || error ? 2 : sizes.borderWidth,
            backgroundColor: disabled ? colors.surfaceSubtle : colors.inputBackground,
            minHeight: multiline ? sizes.controlLg * 2 : sizes.controlLg,
            paddingHorizontal: spacing.md,
          },
        ]}
      >
        {leftIcon ? (
          <View style={{ marginRight: spacing.sm }}>
            <AppIcon name={leftIcon} size={sizes.iconMd} color="textMuted" />
          </View>
        ) : null}
        <InputComponent
          ref={ref}
          editable={!disabled}
          multiline={multiline}
          placeholderTextColor={colors.textLight}
          accessibilityLabel={label}
          accessibilityState={{ disabled: !!disabled }}
          onFocus={(e: NativeSyntheticEvent<TextInputFocusEventData>) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e: NativeSyntheticEvent<TextInputFocusEventData>) => {
            setFocused(false);
            onBlur?.(e);
          }}
          {...rest}
          style={[
            styles.input,
            typography.bodyLarge,
            { color: disabled ? colors.textMuted : colors.text, paddingVertical: spacing.md },
            multiline && styles.multiline,
            // Focus is shown by the border; suppress the browser's default outline on web.
            { outlineStyle: 'none' } as object,
          ]}
        />
        {right}
      </View>
      {error ? (
        <ThemedText variant="small" color="emergencyText" style={{ marginTop: spacing.xs }} accessibilityRole="alert">
          {error}
        </ThemedText>
      ) : hint ? (
        <ThemedText variant="small" color="textMuted" style={{ marginTop: spacing.xs }}>
          {hint}
        </ThemedText>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  field: { flexDirection: 'row', alignItems: 'center' },
  input: { flex: 1, minWidth: 0 },
  multiline: { textAlignVertical: 'top' },
});

export default Input;

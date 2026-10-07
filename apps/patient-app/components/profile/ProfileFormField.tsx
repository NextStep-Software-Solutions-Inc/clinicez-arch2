import React from 'react';
import { View, TextInput, StyleSheet, TextInputProps, Pressable, Platform } from 'react-native';
import { AppIcon } from '@ui/Icon';
import ThemedText from '@ui/ThemedText';
import { BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { useAppTheme } from '../../contexts/ThemeContext';

interface ProfileFormFieldProps extends Omit<TextInputProps, 'value' | 'onChangeText'> {
  label: string;
  value: string | undefined | null;
  onChangeText?: (text: string) => void;
  required?: boolean;
  editable?: boolean;
  /** Marks the field as a tappable picker: disables keyboard but keeps full-opacity styling + chevron */
  picker?: boolean;
  /**
   * Use the BottomSheet-aware input only when this field is rendered inside a BottomSheet.
   * Rendering BottomSheetTextInput outside of a sheet throws runtime context errors.
   */
  useBottomSheetInput?: boolean;
}

export default function ProfileFormField({
  label,
  value,
  onChangeText,
  required = false,
  editable = true,
  picker = false,
  useBottomSheetInput = false,
  multiline = false,
  ...rest
}: ProfileFormFieldProps) {
  const { colors, radii, sizes } = useAppTheme();

  const isDisabled = !editable && !picker;
  const isPickerField = picker || (!editable && !!rest.onPressIn);

  // Web sheets are plain modals (no gorhom context), so BottomSheetTextInput would throw there.
  const InputComponent = useBottomSheetInput && Platform.OS !== 'web' ? BottomSheetTextInput : TextInput;

  const inputEl = (
    <InputComponent
      value={value ?? ''}
      onChangeText={onChangeText}
      editable={isPickerField ? false : editable}
      multiline={multiline}
      style={[
        styles.input,
        {
          borderRadius: radii.md,
          borderColor: colors.border,
          backgroundColor: isDisabled ? colors.background : colors.surface,
          color: colors.text,
        },
        multiline && styles.multiline,
        isDisabled && styles.disabled,
      ]}
      placeholderTextColor={colors.textMuted}
      {...rest}
    />
  );

  return (
    <View style={styles.container}>
      <ThemedText variant="smallBold" style={[styles.label, { color: colors.text }]}>
        {label}
        {required && <ThemedText variant="smallBold" color="emergency"> *</ThemedText>}
      </ThemedText>
      {isPickerField ? (
        <Pressable
          onPress={rest.onPressIn as any}
          style={({ pressed, hovered }: any) => [
            styles.pickerWrapper,
            {
              borderColor: colors.border,
              backgroundColor: colors.surface,
              borderRadius: radii.md,
            },
            hovered && { backgroundColor: colors.surfaceSubtle },
            pressed && { opacity: 0.7 },
          ]}
          accessibilityRole="button"
          accessibilityLabel={label}
        >
          <ThemedText
            variant="body"
            style={{ color: colors.text, opacity: value ? 1 : 0.6, flex: 1 }}
            numberOfLines={1}
          >
            {value || (rest.placeholder ?? '')}
          </ThemedText>
          <AppIcon name="chevronDown" size={sizes.iconSm} color="textMuted" />
        </Pressable>
      ) : (
        inputEl
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 14,
  },
  label: {
    marginBottom: 5,
    opacity: 0.65,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 11,
    minHeight: 44,
  },
  multiline: {
    minHeight: 88,
    paddingTop: 11,
    textAlignVertical: 'top',
  },
  disabled: {
    opacity: 0.45,
  },
  pickerWrapper: {
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 11,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
});

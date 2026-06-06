import { View, TextInput, StyleSheet, TextInputProps, Pressable, Platform } from 'react-native';
import { useTheme, SFSymbol, MaterialSymbol } from '@react-navigation/native';
import ThemedText from '@ui/ThemedText';
import { BottomSheetTextInput } from '@gorhom/bottom-sheet';

interface ProfileFormFieldProps extends Omit<TextInputProps, 'value' | 'onChangeText'> {
  label: string;
  value: string | undefined | null;
  onChangeText?: (text: string) => void;
  required?: boolean;
  editable?: boolean;
  /** Marks the field as a tappable picker: disables keyboard but keeps full-opacity styling + chevron */
  picker?: boolean;
}

export default function ProfileFormField({
  label,
  value,
  onChangeText,
  required = false,
  editable = true,
  picker = false,
  multiline = false,
  ...rest
}: ProfileFormFieldProps) {
  const { colors } = useTheme();

  const isDisabled = !editable && !picker;
  const isPickerField = picker || (!editable && !!rest.onPressIn);

  const inputEl = (
    <BottomSheetTextInput
      value={value ?? ''}
      onChangeText={onChangeText}
      editable={isPickerField ? false : editable}
      multiline={multiline}
      style={[
        styles.input,
        multiline && styles.multiline,
        isDisabled && styles.disabled,
        isPickerField && styles.pickerInput,
        {
          borderColor: colors.border,
          backgroundColor: isDisabled ? colors.background : colors.card,
          color: colors.text,
        },
      ]}
      placeholderTextColor={colors.text}
      {...rest}
    />
  );

  return (
    <View style={styles.container}>
      <ThemedText style={[styles.label, { color: colors.text }]}>
        {label}
        {required && <ThemedText style={styles.required}> *</ThemedText>}
      </ThemedText>
      {isPickerField ? (
        <Pressable
          onPress={rest.onPressIn as any}
          style={[
            styles.pickerWrapper,
            { borderColor: colors.border, backgroundColor: colors.card },
          ]}
        >
          <ThemedText
            style={[styles.pickerText, { color: value ? colors.text : colors.text, opacity: value ? 1 : 0.6 }]}
            numberOfLines={1}
          >
            {value || (rest.placeholder ?? '')}
          </ThemedText>
          {
            Platform.select({
              ios: <SFSymbol name="chevron.up.chevron.down" size={13} color={colors.text} />,
              android: <MaterialSymbol name="unfold_more" size={18} color={colors.text} />,
            })
          }
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
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 5,
    opacity: 0.65,
  },
  required: {
    color: '#EF4444',
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
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
  pickerInput: {
    // kept for fallback only; Pressable wrapper is used instead
  },
  pickerWrapper: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  pickerText: {
    fontSize: 15,
    flex: 1,
  },
});

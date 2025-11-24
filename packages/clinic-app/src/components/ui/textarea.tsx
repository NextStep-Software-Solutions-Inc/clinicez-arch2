
import theme from "@app-constants/theme";
import { StyleSheet, TextInput, TextInputProps, View, ViewStyle } from "react-native";

interface TextareaProps extends Omit<TextInputProps, "style"> {
  disabled?: boolean;
  style?: ViewStyle;
}

const Textarea = ({
  placeholder,
  value,
  onChangeText,
  numberOfLines = 4,
  disabled = false,
  style,
}: TextareaProps) => {
  return (
    <View
      style={[
        styles.container,
        disabled && { opacity: 0.5 },
        style
      ]}
    >
      <TextInput
        placeholder={placeholder}
        value={value}
        onChangeText={onChangeText}
        editable={!disabled}
        multiline
        numberOfLines={numberOfLines}
        placeholderTextColor={theme.muted}
        style={styles.input}
      />
    </View>
  );
};

export default Textarea;

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.background,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  input: {
    minHeight: 100,
    fontSize: 16,
    color: theme.foreground,
    textAlignVertical: "top"
  }
})
import theme from "@app-constants/theme";
import { LucideIcon } from "lucide-react-native";
import { ColorValue, GestureResponderEvent, Pressable, StyleSheet, TextInput, TextInputProps, View, ViewStyle } from "react-native";

interface InputProps extends Omit<TextInputProps, "style" | "editable"> {
  disabled?: boolean;
  style?: ViewStyle;
  Left?: React.ReactNode;
  Right?: React.ReactNode;
  onBlur?: () => void;
}

const Input = ({
  placeholder,
  value,
  Left,
  Right,
  onChangeText,
  onBlur,
  disableKeyboardShortcuts,
  secureTextEntry,
  enterKeyHint,
  autoCapitalize,
  disabled = false,
  style
}: InputProps) => {
  return (
    <View
      style={[
        styles.container,
        disabled && { opacity: 0.5 },
        style
      ]}
    >
      {Left && <View style={styles.icon}>{Left}</View>}
      <TextInput
        placeholder={placeholder}
        value={value}
        onChangeText={onChangeText}
        onBlur={onBlur}
        disableKeyboardShortcuts={disableKeyboardShortcuts}
        secureTextEntry={secureTextEntry}
        enterKeyHint={enterKeyHint}
        autoCapitalize={autoCapitalize}
        editable={!disabled}
        numberOfLines={1}
        placeholderTextColor={theme.muted}
        style={styles.input}
      />
      {Right && <View style={[
        styles.icon,
      ]}>
        {Right}
      </View>}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: theme.background,
    overflow: "hidden"
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: theme.foreground,
    padding: 0,
    margin: 0,
  },
  icon: {
    paddingHorizontal: 8
  }
})


interface InputIconProps {
  onPress?: (event: GestureResponderEvent) => void;
  Icon: LucideIcon;
  color?: ColorValue;
  size?: number;
  disabled?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

const InputIcon = ({
  onPress,
  Icon,
  color,
  size = 20,
  disabled = false,
  accessibilityLabel,
  accessibilityHint,
  ...props
}: InputIconProps) => {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityRole="button"
      {...props}
    >
      <Icon color={color} size={size} />
    </Pressable>
  );
};

export {
  Input,
  InputIcon
};

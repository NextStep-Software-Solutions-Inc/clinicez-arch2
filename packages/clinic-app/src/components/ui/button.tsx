import { FontSize } from "@app-constants/styles";
import theme from "@app-constants/theme";
import { LucideIcon } from "lucide-react-native";
import { ActivityIndicator, ColorValue, GestureResponderEvent, Pressable, StyleSheet, Text, TextStyle, View, ViewStyle } from "react-native";

type ButtonVariant = "primary" | "outline" | "ghost" | "link";
type ButtonSize = "icon" | "sm" | "md" | "lg";

const ButtonVariants: Record<ButtonVariant, { backgroundColor: ColorValue; borderWidth?: number; borderColor?: ColorValue; color: ColorValue }> = {
  primary: {
    backgroundColor: theme.primary.default,
    borderColor: theme.primary.default,
    color: theme.primary.foreground
  },
  outline: {
    backgroundColor: "transparent",
    borderColor: theme.primary.default,
    borderWidth: 1,
    color: theme.primary.default
  },
  ghost: {
    backgroundColor: "transparent",
    color: theme.foreground
  },
  link: {
    backgroundColor: "transparent",
    color: theme.link
  }
};

// Android and iOS compatible button sizes
const ButtonSizes: Record<ButtonSize, { container: ViewStyle; text: TextStyle }> = {
  icon: {
    container: {
      height: 40,
      paddingHorizontal: 8,
      paddingVertical: 8
    },
    text: {
      fontSize: FontSize.lg
    },
  },
  sm: {
    container: {
      height: 40,
      paddingHorizontal: 12,
      paddingVertical: 8
    },
    text: {
      fontSize: FontSize.sm
    },
  },
  md: {
    container: {
      height: 48,
      paddingHorizontal: 16,
      paddingVertical: 12
    },
    text: {
      fontSize: FontSize.md
    },
  },
  lg: {
    container: {
      height: 56,
      paddingHorizontal: 20,
      paddingVertical: 16
    },
    text: {
      fontSize: FontSize.lg
    },
  }
};

interface ButtonProps {
  onPress?: (event: GestureResponderEvent) => void;
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  Left?: LucideIcon;
  Right?: LucideIcon;
  containerStyle?: ViewStyle;
  textStyle?: TextStyle;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

const Button = ({
  onPress,
  label,
  variant = "primary",
  Left,
  Right,
  size = "sm",
  loading = false,
  disabled = false,
  containerStyle,
  textStyle,
  accessibilityHint,
  accessibilityLabel
}: ButtonProps) => {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityState={{
        busy: loading,
        disabled: loading || disabled
      }}
      accessibilityLabel={accessibilityLabel || label}
      accessibilityHint={accessibilityHint}
    >
      {({ pressed }) => (
        <View
          style={[
            styles.container,
            ButtonSizes[size].container,
            pressed && { opacity: 0.75 },
            (disabled || loading) && { opacity: 0.5 },
            { borderWidth: ButtonVariants[variant].borderWidth },
            { borderColor: ButtonVariants[variant].borderColor },
            { backgroundColor: ButtonVariants[variant].backgroundColor },
            containerStyle
          ]}
        >
          {loading ? (
            <ActivityIndicator color={ButtonVariants[variant].color} size={ButtonSizes[size].text.fontSize} />
          ) : (
            <>
              {Left && <Left color={ButtonVariants[variant].color} size={ButtonSizes[size].text.fontSize} />}
              <Text
                style={[
                  styles.text,
                  { color: ButtonVariants[variant].color, fontSize: ButtonSizes[size].text.fontSize },
                  textStyle
                ]}
                numberOfLines={1}
              >
                {label}
              </Text>
              {Right && <Right color={ButtonVariants[variant].color} size={ButtonSizes[size].text.fontSize} />}
            </>
          )}
        </View>
      )}
    </Pressable>
  );
};

export default Button;

const styles = StyleSheet.create({
  container: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8
  },

  text: {
    flexShrink: 1
  }
});

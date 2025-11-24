import theme from "@app-constants/theme";
import { ColorValue, StyleSheet, Text, View, ViewStyle } from "react-native";

type BadgeVariant = "primary" | "outline";

const BadgeVariants: Record<BadgeVariant, {
  backgroundColor: ColorValue;
  color: ColorValue
}> = {
  primary: {
    backgroundColor: theme.primary.default,
    color: theme.primary.foreground
  },
  outline: {
    backgroundColor: "transparent",
    color: theme.primary.default
  }
};

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
  style?: ViewStyle;
}

const Badge = ({
  label,
  variant = "primary",
  style
}: BadgeProps) => {
  return (
    <View
      style={[
        styles.container,
        { backgroundColor: BadgeVariants[variant].backgroundColor },
        style
      ]}
    >
      <Text
        style={[
          styles.label,
          { color: BadgeVariants[variant].color }
        ]}>
        {label}
      </Text>
    </View>
  );
};

export default Badge;

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 50,
    height: 24,
    minWidth: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  label: {
    fontSize: 12,
    fontWeight: "600"
  }
})
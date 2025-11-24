import theme from "@app-constants/theme";
import React from "react";
import { GestureResponderEvent, Pressable, StyleSheet, ViewStyle } from "react-native";
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";

interface SwitchProps {
  onPress?: (event: GestureResponderEvent) => void;
  onValueChange?: (value: boolean) => void;
  value: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

const Switch = ({
  onPress,
  onValueChange,
  value = false,
  disabled = false,
  style,
  accessibilityLabel,
  accessibilityHint
}: SwitchProps) => {

  const animatedValue = useSharedValue(value ? 1 : 0);

  React.useEffect(() => {
    animatedValue.value = withSpring(value ? 1 : 0, {
      damping: 15,
      stiffness: 120,
      mass: 0.3,
    });
  }, [animatedValue, value]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: animatedValue.value * 24
      }
    ]
  }));

  const animatedBgStyle = useAnimatedStyle(() => {
    const backgroundColor = interpolateColor(
      animatedValue.value,
      [0, 1],
      [theme.background, theme.primary.default]
    );
    return {
      backgroundColor
    };
  });

  return (
    <Pressable
      onPress={(e) => {
        if (!disabled) {
          onPress && onPress(e);
          onValueChange && onValueChange(!value);
        }
      }}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      style={style}
    >
      <Animated.View style={[
        styles.container,
        disabled && { opacity: 0.5 },
        animatedBgStyle
      ]}>
        <Animated.View style={[
          !value ? { backgroundColor: theme.primary.default } : { backgroundColor: theme.primary.foreground },
          styles.innerCircle,
          animatedStyle]} />
      </Animated.View>
    </Pressable>
  );
};

export default Switch;

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: theme.primary.default,
    borderRadius: 50,
    padding: 2,
    width: 48,
    height: 24,
    overflow: "hidden"
  },
  innerCircle: {
    width: 16,
    height: 16,
    borderRadius: 8,
  }
})

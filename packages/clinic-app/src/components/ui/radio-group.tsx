import theme from "@app-constants/theme";
import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { GestureResponderEvent, Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";

interface RadioGroupProps {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
  direction?: "horizontal" | "vertical";
  accessibilityLabel?: string;
  accessibilityHint?: string;
  children?: React.ReactNode;
  style?: ViewStyle;
}

type RadioGroupContextValue = {
  value?: string;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
};

const RadioGroupContext = createContext<RadioGroupContextValue | undefined>(undefined);

const useRadioGroup = () => {
  const context = useContext(RadioGroupContext);
  if (!context) throw new Error("RadioGroupItem must be used inside a RadioGroup");
  return context;
};

const RadioGroup = ({
  value,
  defaultValue,
  onValueChange,
  disabled = false,
  direction = "vertical",
  accessibilityLabel,
  accessibilityHint,
  children,
  style,
}: RadioGroupProps) => {
  const [internal, setInternal] = useState<string | undefined>(defaultValue);

  const selectedValue = value ?? internal;

  const handleChange = useCallback((val: string) => {
    if (disabled) return;
    if (onValueChange) onValueChange(val);
    if (value === undefined) setInternal(val);
  }, [disabled, onValueChange, value]);

  const context = useMemo(() => ({ value: selectedValue, onValueChange: handleChange, disabled }), [selectedValue, handleChange, disabled]);

  return (
    <RadioGroupContext.Provider value={context}>
      <View
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        accessibilityRole="radiogroup"
        style={[
          direction === "horizontal" ? { flexDirection: "row", gap: 12 } : { flexDirection: "column" },
          style
        ]}
      >
        {children}
      </View>
    </RadioGroupContext.Provider>
  );
};

interface RadioGroupItemProps {
  value: string;
  label: string;
  onPress?: (event?: GestureResponderEvent) => void; // optional override
  disabled?: boolean;
  style?: ViewStyle;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

const RadioGroupItem = ({
  value,
  onPress,
  label,
  disabled = false,
  style,
  accessibilityLabel,
  accessibilityHint,
}: RadioGroupItemProps) => {
  const { value: selectedValue, onValueChange, disabled: groupDisabled } = useRadioGroup();
  const isDisabled = groupDisabled || disabled;
  const selected = selectedValue === value;

  const handlePress = (e?: GestureResponderEvent) => {
    if (isDisabled) return;
    if (onPress) onPress(e);
    else if (onValueChange) onValueChange(value);
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={isDisabled}
      accessibilityLabel={accessibilityLabel || label}
      accessibilityHint={accessibilityHint}
      accessibilityRole="radio"
      accessibilityState={{ disabled: isDisabled, selected }}
    >
      <View
        style={[
          radioItemStyles.container,
          style,
          disabled && { opacity: 0.5 }
        ]}
      >
        <View style={[radioItemStyles.outerCircle, selected && { borderColor: theme.primary.default }]}>
          {selected && <View style={radioItemStyles.innerCircle} />}
        </View>
        {/* Label implementation goes here */}
        <Text style={radioItemStyles.label}>{label}</Text>
      </View>
    </Pressable>
  );
};

const radioItemStyles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
  },
  outerCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: theme.border,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 8,
  },
  innerCircle: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.primary.default,
  },
  label: {
    fontSize: 16,
    color: theme.foreground,
  }
})

export { RadioGroup, RadioGroupItem };

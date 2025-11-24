import theme from "@app-constants/theme";
import { Check, LucideIcon } from "lucide-react-native";
import { ColorValue, Pressable, StyleSheet, Text, View, ViewStyle } from "react-native";

interface CheckboxProps {
  onValueChange?: (value: boolean) => void;
  value: boolean;
  disabled?: boolean;
  label: string;
  style?: ViewStyle;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

const Checkbox = ({
  onValueChange,
  value = false,
  disabled = false,
  label,
  style,
  accessibilityLabel,
  accessibilityHint
}: CheckboxProps) => {
  const checked = !!value;
  console.log('Checkbox value:', value);
  return (
    <Pressable
      onPress={() => {
        if (!disabled && onValueChange) {
          onValueChange(!value);
        }
      }}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel || label}
      accessibilityHint={accessibilityHint}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: value, disabled }}
    >
      <View
        style={[
          styles.container,
          style,
          disabled && { opacity: 0.5 }
        ]}
      >
        <View
          style={[
            styles.checkbox,
            checked && { backgroundColor: theme.primary.default, borderColor: theme.primary.default }
          ]}
        >
          {checked && <Check size={16} color={theme.background} />}
        </View>
        <Text style={styles.label}>{label}</Text>

      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
  },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 1,
    borderRadius: 4,
    borderColor: theme.border,
    justifyContent: "center",
    alignItems: "center",
  },
  label: {
    marginLeft: 8,

    fontSize: 16,
    color: theme.foreground,
  }
});

interface IconProps {
  onValueChange?: (value: boolean) => void;
  value?: boolean;
  Icon: LucideIcon;
  label?: string;
  size?: number;
  color?: ColorValue;
  fill?: ColorValue;
  disabled?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

const Icon = ({
  onValueChange,
  value,
  Icon,
  size = 24,
  label,
  color = theme.primary.default,
  fill = theme.primary.default,
  disabled = false,
  accessibilityLabel,
  accessibilityHint
}: IconProps) => {
  const checked = !!value;
  return (
    <Pressable
      onPress={() => {
        if (!disabled && onValueChange) {
          onValueChange(!checked);
        }
      }}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ checked, disabled }}
    >
      {({ pressed }) => (
        <Icon
          size={size}
          color={checked ? color : theme.border}
          fill={checked ? fill : "none"}
          style={[
            disabled && { opacity: 0.5 },
            pressed && !disabled && {
              transform: [{ scale: 0.95 }]
            }
          ]}
        />
      )}
    </Pressable>
  );
};
Checkbox.Icon = Icon;

export type CheckboxGroupItem = {
  value: string;
  label: string;
}

interface CheckboxGroupProps {
  items: CheckboxGroupItem[];
  selectedValues: string[];
  onValueChange?: (values: string[]) => void;
  disabled?: boolean;
  style?: ViewStyle;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

const CheckboxGroup = ({
  items,
  selectedValues,
  onValueChange,
  disabled = false,
  style,
  accessibilityLabel,
  accessibilityHint
}: CheckboxGroupProps) => {
  const handleValueChange = (value: string) => {
    let newValues: string[];
    if (selectedValues.includes(value)) {
      newValues = selectedValues.filter(v => v !== value);
    } else {
      newValues = [...selectedValues, value];
    }
    onValueChange && onValueChange(newValues);
  };

  return (
    <View
      style={style}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}>
      <View style={{ flexDirection: "column" }}>
        {items.map(item => (
          <Pressable
            key={item.value}
            onPress={() => {
              if (!disabled) {
                handleValueChange(item.value);
              }
            }}
            disabled={disabled}
            accessibilityLabel={item.label}
            accessibilityHint={accessibilityHint}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: selectedValues.includes(item.value), disabled }}
          >
            {/* Pill-shaped with inner label */}
            <View
              style={[
                styles.container,
                { marginVertical: 4 },
                disabled && { opacity: 0.5 }
              ]}
            >
              <View
                style={[
                  styles.checkbox,
                  selectedValues.includes(item.value) && { backgroundColor: theme.primary.default, borderColor: theme.primary.default }
                ]}
              >
                {selectedValues.includes(item.value) && <Check size={16} color={theme.background} />}
              </View>
              <Text style={styles.label}>{item.label}</Text>
            </View>
          </Pressable>
        ))}
      </View>
    </View>
  );
};
Checkbox.Group = CheckboxGroup;

export default Checkbox;
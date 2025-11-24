import theme from "@app-constants/theme";
import { LucideIcon } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View, ViewStyle } from "react-native";

interface ChipProps {
  Left?: LucideIcon;
  Right?: LucideIcon;
  onValueChange?: (value: boolean) => void;
  value: boolean;
  disabled?: boolean;
  label: string;
  style?: ViewStyle;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

const Chip = ({
  Left,
  Right,
  onValueChange,
  value = false,
  disabled = false,
  label,
  style,
  accessibilityLabel,
  accessibilityHint
}: ChipProps) => {
  const selected = !!value;
  const iconFill = selected ? theme.background : "none";
  const iconBorder = selected ? theme.background : theme.foreground;

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
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      style={[
        styles.chip,
        {
          borderColor: selected ? theme.primary.default : theme.border,
          backgroundColor: selected ? theme.primary.default : "transparent",
          opacity: disabled ? 0.5 : 1,
        },
        style
      ]}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        {Left && <Left size={16} color={iconBorder} fill={iconFill} />}
        <Text style={[styles.label, { color: iconBorder }]}>
          {label}
        </Text>
        {Right && <Right size={16} color={iconBorder} fill={iconFill} />}
      </View>
    </Pressable>
  )
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
  },
  chip: {
    borderRadius: 9999,
    borderWidth: 1,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderColor: theme.border,
    justifyContent: "center",
    alignItems: "center",
  },
  label: {
    fontSize: 16,
    color: theme.foreground,
  },
});

type ChipGroupItem = {
  value: string;
  label: string;
}

interface ChipGroupProps {
  items: ChipGroupItem[];
  selectedValues: string[];
  onValueChange?: (value: string[]) => void;
  disabled?: boolean;
  style?: ViewStyle;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

const ChipGroup = ({
  items,
  selectedValues,
  onValueChange,
  disabled = false,
  style,
  accessibilityLabel,
  accessibilityHint
}: ChipGroupProps) => {
  const handleValueChange = (value: string) => {
    let newValues: string[];
    if (selectedValues.includes(value)) {
      newValues = selectedValues.filter(v => v !== value);
    } else {
      newValues = [...selectedValues, value];
    }
    onValueChange?.(newValues);
  };

  return (
    <View
      style={[{ flexDirection: "row", flexWrap: "wrap", gap: 8 }, style]}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
    >
      {items.map(item => {
        const isSelected = selectedValues?.includes(item.value) || false;
        return (
          <Chip
            key={item.value}
            label={item.label}
            value={isSelected}
            onValueChange={() => !disabled && handleValueChange(item.value)}
            disabled={disabled}
          />
        );
      })}
    </View>
  );
};
Chip.Group = ChipGroup;

export default Chip;

import { View, Switch, Pressable, StyleSheet } from 'react-native';
import { useTheme } from '@react-navigation/native';
import ThemedText from '@ui/ThemedText';

interface ProfileToggleProps {
  label: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  description?: string;
}

export default function ProfileToggle({
  label,
  value,
  onValueChange,
  description,
}: ProfileToggleProps) {
  const { colors } = useTheme();

  return (
    <Pressable
      onPress={() => onValueChange(!value)}
      style={[styles.row, { borderColor: colors.border, backgroundColor: colors.card }]}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
    >
      <View style={styles.labelContainer}>
        <ThemedText style={[styles.label, { color: colors.text }]}>{label}</ThemedText>
        {description && (
          <ThemedText style={[styles.description, { color: colors.text }]}>{description}</ThemedText>
        )}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ true: colors.primary, false: colors.border }}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 14,
    minHeight: 52,
  },
  labelContainer: { flex: 1, marginRight: 12 },
  label: { fontSize: 15 },
  description: { fontSize: 12, marginTop: 2, opacity: 0.55 },
});

import { Pressable, StyleSheet } from 'react-native';
import { useTheme } from '@react-navigation/native';
import ThemedText from '@ui/ThemedText';

interface ProfileAddButtonProps {
  label?: string;
  onPress: () => void;
  disabled?: boolean;
}

export default function ProfileAddButton({
  label = 'Add Entry',
  onPress,
  disabled = false,
}: ProfileAddButtonProps) {
  const { colors } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        { borderColor: colors.primary },
        pressed && { opacity: 0.65 },
        disabled && { opacity: 0.4 },
      ]}
    >
      <ThemedText style={[styles.text, { color: colors.primary }]}>+ {label}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    borderWidth: 1.5,
    borderRadius: 12,
    borderStyle: 'dashed',
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 6,
  },
  text: {
    fontSize: 14,
    fontWeight: '600',
  },
});

import { View, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@react-navigation/native';
import ThemedText from '@ui/ThemedText';

interface ProfileSaveBarProps {
  onSave: () => void;
  saving?: boolean;
  isDirty?: boolean;
  label?: string;
}

export default function ProfileSaveBar({
  onSave,
  saving = false,
  isDirty = true,
  label = 'Save Changes',
}: ProfileSaveBarProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const isDisabled = !isDirty || saving;

  return (
    <View
      style={[
        styles.bar,
        { borderTopColor: colors.border, backgroundColor: colors.card, paddingBottom: insets.bottom || 16 },
      ]}
    >
      <Pressable
        onPress={onSave}
        disabled={isDisabled}
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: colors.primary },
          isDisabled && styles.disabled,
          pressed && !isDisabled && { opacity: 0.8 },
        ]}
      >
        {saving ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <ThemedText style={styles.buttonText}>{label}</ThemedText>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  button: {
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  disabled: { opacity: 0.4 },
});

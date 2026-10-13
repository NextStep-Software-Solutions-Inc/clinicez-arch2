import React from 'react';
import { View, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ThemedText from '@ui/ThemedText';
import { useAppTheme } from '../../contexts/ThemeContext';
import { useKeyboardVisible } from '../../hooks/useKeyboardVisible';

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
  const { colors, radii, spacing } = useAppTheme();
  const isDisabled = !isDirty || saving;
  const isKeyboardVisible = useKeyboardVisible();

  return (
    <View
      style={[
        styles.bar,
        {
          borderTopColor: colors.borderLight,
          backgroundColor: colors.surface,
          paddingBottom: isKeyboardVisible ? spacing.sm : (insets.bottom || spacing.lg),
          paddingHorizontal: spacing.lg,
          paddingTop: spacing.md,
        },
      ]}
    >
      <Pressable
        onPress={onSave}
        disabled={isDisabled}
        style={({ pressed, hovered }: any) => [
          styles.button,
          {
            backgroundColor: hovered ? colors.primaryHover : colors.primary,
            borderRadius: radii.lg,
          },
          isDisabled && styles.disabled,
          pressed && !isDisabled && { opacity: 0.8 },
        ]}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: isDisabled }}
      >
        {saving ? (
          <ActivityIndicator color={colors.onPrimary} size="small" />
        ) : (
          <ThemedText variant="bodyBold" style={{ color: colors.onPrimary }}>
            {label}
          </ThemedText>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  button: {
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  disabled: {
    opacity: 0.4,
  },
});

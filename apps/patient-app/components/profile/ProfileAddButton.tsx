import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import ThemedText from '@ui/ThemedText';
import { AppIcon } from '@ui/Icon';
import { useAppTheme } from '../../contexts/ThemeContext';

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
  const { colors, radii, sizes } = useAppTheme();

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed, hovered }: any) => [
        styles.button,
        {
          borderColor: colors.primary,
          borderRadius: radii.md,
        },
        hovered && { backgroundColor: colors.primarySubtle },
        pressed && { opacity: 0.65 },
        disabled && { opacity: 0.4 },
      ]}
    >
      <AppIcon name="plus" size={sizes.iconSm} color="primary" />
      <ThemedText variant="bodyBold" color="primary">
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    paddingVertical: 13,
    marginTop: 4,
    marginBottom: 6,
  },
});

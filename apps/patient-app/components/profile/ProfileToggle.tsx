import React from 'react';
import { View, Switch, Pressable, StyleSheet } from 'react-native';
import ThemedText from '@ui/ThemedText';
import { useAppTheme } from '../../contexts/ThemeContext';

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
  const { colors, radii } = useAppTheme();

  return (
    <Pressable
      onPress={() => onValueChange(!value)}
      style={({ pressed, hovered }: any) => [
        styles.row,
        {
          borderColor: colors.border,
          backgroundColor: colors.surface,
          borderRadius: radii.md,
        },
        hovered && { backgroundColor: colors.surfaceSubtle },
        pressed && { opacity: 0.8 },
      ]}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
    >
      <View style={styles.labelContainer}>
        <ThemedText variant="body" style={{ color: colors.text }}>
          {label}
        </ThemedText>
        {description && (
          <ThemedText variant="small" color="textSecondary" style={styles.description}>
            {description}
          </ThemedText>
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
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 14,
    minHeight: 52,
  },
  labelContainer: {
    flex: 1,
    marginRight: 12,
  },
  description: {
    marginTop: 2,
    opacity: 0.75,
  },
});

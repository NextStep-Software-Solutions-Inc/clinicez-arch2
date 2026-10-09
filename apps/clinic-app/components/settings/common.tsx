import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import ThemedText from '../ui/ThemedText';
import Icon from '../ui/Icon';
import { theme } from '../../constants/theme';

export const formatPeso = (amount: number | undefined | null) =>
  `₱${(amount ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;

export function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[styles.chip, active && styles.chipActive]}
    >
      <ThemedText
        variant={active ? 'smallBold' : 'small'}
        color={active ? theme.colors.primary : theme.colors.textSecondary}
        numberOfLines={1}
      >
        {label}
      </ThemedText>
    </Pressable>
  );
}

export function InfoRow({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <View style={styles.infoRow}>
      <ThemedText variant="small" color={theme.colors.textSecondary}>
        {label}
      </ThemedText>
      <ThemedText variant="smallBold" color={valueColor}>
        {value}
      </ThemedText>
    </View>
  );
}

export function FormError({ message }: { message: string }) {
  return (
    <View style={styles.formError}>
      <Icon name="alertCircle" size={theme.sizes.iconSm} color={theme.colors.emergencyText} />
      <ThemedText variant="small" color={theme.colors.emergencyText} style={styles.flex}>
        {message}
      </ThemedText>
    </View>
  );
}

export function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.fieldGroup}>
      <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
        {label}
      </ThemedText>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  chip: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radii.full,
    backgroundColor: theme.colors.surface,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.borderDark,
    flexShrink: 0,
  },
  chipActive: {
    backgroundColor: theme.colors.primaryLight,
    borderColor: theme.colors.primary,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
  },
  fieldGroup: {
    gap: theme.spacing.xs,
  },
  formError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.emergencySubtle,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.emergencyBorder,
  },
});

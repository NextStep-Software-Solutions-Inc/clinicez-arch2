import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import ThemedText from '../ui/ThemedText';
import Icon from '../ui/Icon';
import { theme } from '../../constants/theme';
import { PENDING_VERIFICATION_HELPER_NOTE } from '../../utils/directoryVerification';

export const formatPeso = (amount: number | undefined | null) =>
  `₱${(amount ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;

export function Chip({
  label,
  active,
  onPress,
  disabled = false,
  size = 'md',
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  disabled?: boolean;
  size?: 'sm' | 'md';
}) {
  const isSmall = size === 'sm';
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected: active, disabled }}
      style={[
        styles.chip,
        isSmall && styles.chipSm,
        active && styles.chipActive,
        disabled && styles.chipDisabled,
      ]}
    >
      <ThemedText
        variant={
          isSmall
            ? active
              ? 'captionBold'
              : 'caption'
            : active
            ? 'smallBold'
            : 'small'
        }
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

export function PendingVerificationNote({ testID }: { testID?: string }) {
  return (
    <View style={styles.pendingNoteRow} testID={testID}>
      <Icon name="info" size={theme.sizes.iconSm} color={theme.colors.warningText} />
      <ThemedText variant="caption" color={theme.colors.warningText} style={styles.pendingNoteText}>
        {PENDING_VERIFICATION_HELPER_NOTE}
      </ThemedText>
    </View>
  );
}

export function ReverificationNoticeBanner({
  message,
  testID,
}: {
  message: string;
  testID?: string;
}) {
  return (
    <View style={styles.reverificationBanner} testID={testID}>
      <Icon name="info" size={theme.sizes.iconSm} color={theme.colors.warningText} />
      <ThemedText variant="caption" color={theme.colors.warningText} style={styles.flex}>
        {message}
      </ThemedText>
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
  chipSm: {
    paddingHorizontal: theme.spacing.sm + 2,
    paddingVertical: theme.spacing.xs,
  },
  chipActive: {
    backgroundColor: theme.colors.primaryLight,
    borderColor: theme.colors.primary,
  },
  chipDisabled: {
    opacity: 0.5,
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
  pendingNoteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    flexShrink: 1,
  },
  pendingNoteText: {
    flexShrink: 1,
  },
  reverificationBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    padding: theme.spacing.sm,
    backgroundColor: theme.colors.warningBg,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.warningBorder,
    borderRadius: theme.radii.sm,
  },
});

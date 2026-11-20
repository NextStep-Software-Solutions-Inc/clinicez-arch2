import React from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  View,
  type PressableStateCallbackType,
  type ViewStyle,
} from 'react-native';
import { Icon, ThemedText, type IconName } from '@ui';
import { theme } from '@constants/theme';

type HoverState = PressableStateCallbackType & { hovered?: boolean };

export interface FilterChipProps {
  label: string;
  active: boolean;
  onPress: () => void;
  testID?: string;
}

/**
 * Lightweight flat filter chip used across Tools search and category toolbars.
 */
export function FilterChip({ label, active, onPress, testID }: FilterChipProps) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={(state: HoverState) => [
        styles.chip,
        active ? styles.chipActive : styles.chipIdle,
        !active && state.hovered && styles.chipHover,
        state.pressed && styles.chipPressed,
      ]}
    >
      <ThemedText
        variant={active ? 'smallBold' : 'small'}
        color={active ? theme.colors.primaryDark : theme.colors.textSecondary}
      >
        {label}
      </ThemedText>
    </Pressable>
  );
}

export interface LabeledControlProps {
  label: string;
  children: React.ReactNode;
  style?: ViewStyle;
}

/**
 * Pairs a form caption above inline toggle/segmented controls so baselines match Input fields.
 */
export function LabeledControl({ label, children, style }: LabeledControlProps) {
  return (
    <View style={[styles.labeledControl, style]}>
      <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
        {label}
      </ThemedText>
      {children}
    </View>
  );
}

export interface CalculatorWorkbenchProps {
  twoColumn: boolean;
  inputs: React.ReactNode;
  results: React.ReactNode;
}

/**
 * Responsive calculator body placing inputs on the left and live results on the right for wider screens.
 */
export function CalculatorWorkbench({ twoColumn, inputs, results }: CalculatorWorkbenchProps) {
  if (!twoColumn) {
    return (
      <View style={styles.stackCol}>
        <View style={styles.colSection}>{inputs}</View>
        <View style={styles.colSection}>{results}</View>
      </View>
    );
  }

  return (
    <View style={styles.workbenchRow}>
      <View style={styles.workbenchLeft}>{inputs}</View>
      <View style={styles.workbenchRight}>{results}</View>
    </View>
  );
}

export interface PreviewCardProps {
  icon: IconName;
  title: string;
  subtitle: string;
  bullets: readonly string[];
}

/**
 * Compact results placeholder explaining what will be shown as soon as inputs are filled.
 */
export function PreviewCard({ icon, title, subtitle, bullets }: PreviewCardProps) {
  return (
    <View style={styles.previewCard}>
      <View style={styles.previewHeader}>
        <View style={styles.previewIconTile}>
          <Icon name={icon} size={theme.sizes.iconMd} color={theme.colors.primary} />
        </View>
        <View style={styles.previewHeaderText}>
          <ThemedText variant="bodyBold">{title}</ThemedText>
          <ThemedText variant="small" color={theme.colors.textMuted}>
            {subtitle}
          </ThemedText>
        </View>
      </View>

      <View style={styles.previewBullets}>
        {bullets.map((item) => (
          <View key={item} style={styles.previewBulletRow}>
            <Icon name="checkCircle" size={theme.sizes.iconSm} color={theme.colors.primary} />
            <ThemedText variant="small" color={theme.colors.textSecondary} style={styles.flexFill}>
              {item}
            </ThemedText>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flexFill: {
    flex: 1,
  },
  chip: {
    paddingVertical: theme.spacing.xs + 2,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radii.full,
    borderWidth: theme.sizes.borderWidth,
    minHeight: theme.sizes.controlSm,
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      web: {
        cursor: 'pointer',
        transition: 'background-color 140ms ease, border-color 140ms ease',
      } as any,
    }),
  },
  chipIdle: {
    backgroundColor: theme.colors.surfaceSubtle,
    borderColor: theme.colors.border,
  },
  chipActive: {
    backgroundColor: theme.colors.primaryLight,
    borderColor: theme.colors.primary,
  },
  chipHover: {
    backgroundColor: theme.colors.surfaceMuted,
    borderColor: theme.colors.primaryBorder,
  },
  chipPressed: {
    opacity: 0.85,
  },
  labeledControl: {
    gap: theme.spacing.xs,
  },
  stackCol: {
    gap: theme.spacing.lg,
  },
  colSection: {
    gap: theme.spacing.md,
  },
  workbenchRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.xl,
  },
  workbenchLeft: {
    flex: 1.15,
    minWidth: 0,
    gap: theme.spacing.md,
  },
  workbenchRight: {
    flex: 0.9,
    minWidth: 0,
    gap: theme.spacing.md,
  },
  previewCard: {
    padding: theme.spacing.lg,
    borderRadius: theme.radii.lg,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceMuted,
    gap: theme.spacing.md,
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.md,
  },
  previewIconTile: {
    width: theme.sizes.controlMd,
    height: theme.sizes.controlMd,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.primarySubtle,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.primaryBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewHeaderText: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  previewBullets: {
    gap: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
    borderTopWidth: theme.sizes.borderWidth,
    borderTopColor: theme.colors.borderLight,
  },
  previewBulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
  },
});

import React from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useAppTheme } from '../../contexts/ThemeContext';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import type { ColorToken } from '../../constants/theme';
import ThemedText from './ThemedText';
import { AppIcon, type IconName } from './Icon';

/* ------------------------------------------------------------------ Divider */

export function Divider({ inset = 0, style }: { inset?: number; style?: StyleProp<ViewStyle> }) {
  const { colors, sizes } = useAppTheme();
  return (
    <View
      accessibilityRole="none"
      style={[{ height: sizes.borderWidth, backgroundColor: colors.border, marginLeft: inset }, style]}
    />
  );
}

/* ------------------------------------------------------------ SectionHeader */

export interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onActionPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

export function SectionHeader({ title, subtitle, actionLabel, onActionPress, style }: SectionHeaderProps) {
  const { spacing } = useAppTheme();
  return (
    <View style={[styles.sectionRow, { marginBottom: spacing.md }, style]}>
      <View style={styles.flex}>
        <ThemedText variant="h3" accessibilityRole="header">
          {title}
        </ThemedText>
        {subtitle ? (
          <ThemedText variant="small" color="textMuted">
            {subtitle}
          </ThemedText>
        ) : null}
      </View>
      {actionLabel && onActionPress ? (
        <Pressable onPress={onActionPress} accessibilityRole="button" hitSlop={8}>
          <ThemedText variant="bodyBold" color="primary">
            {actionLabel}
          </ThemedText>
        </Pressable>
      ) : null}
    </View>
  );
}

/* ----------------------------------------------------------------- ListRow */

export interface ListRowProps {
  title: string;
  subtitle?: string;
  /** Trailing value text (e.g. a count or a setting value). */
  value?: string;
  icon?: IconName;
  /** Tint for the icon tile. */
  tone?: 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'purple' | 'neutral';
  onPress?: () => void;
  /** Show a trailing chevron (default true when pressable). */
  chevron?: boolean;
  destructive?: boolean;
  right?: React.ReactNode;
  divider?: boolean;
  style?: StyleProp<ViewStyle>;
}

const TONE_COLORS: Record<NonNullable<ListRowProps['tone']>, { bg: ColorToken; fg: ColorToken }> = {
  primary: { bg: 'primaryLight', fg: 'primaryText' },
  success: { bg: 'successBg', fg: 'successText' },
  warning: { bg: 'warningBg', fg: 'warningText' },
  danger: { bg: 'emergencyBg', fg: 'emergencyText' },
  info: { bg: 'infoBg', fg: 'infoText' },
  purple: { bg: 'purpleBg', fg: 'purpleText' },
  neutral: { bg: 'surfaceSubtle', fg: 'textSecondary' },
};

export function ListRow({
  title,
  subtitle,
  value,
  icon,
  tone = 'primary',
  onPress,
  chevron,
  destructive,
  right,
  divider,
  style,
}: ListRowProps) {
  const { colors, spacing, radii, sizes } = useAppTheme();
  const showChevron = chevron ?? !!onPress;
  const t = TONE_COLORS[destructive ? 'danger' : tone];

  const content = (hovered: boolean, pressed: boolean) => (
    <View
      style={[
        styles.row,
        {
          minHeight: sizes.touchTarget + spacing.md,
          paddingVertical: spacing.md,
          paddingHorizontal: spacing.lg,
          backgroundColor: pressed || hovered ? colors.surfaceMuted : colors.transparent,
        },
        style,
      ]}
    >
      {icon ? (
        <View
          style={{
            width: sizes.controlMd,
            height: sizes.controlMd,
            borderRadius: radii.md,
            backgroundColor: colors[t.bg],
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: spacing.md,
          }}
        >
          <AppIcon name={icon} size={sizes.iconMd} color={t.fg} />
        </View>
      ) : null}
      <View style={styles.flex}>
        <ThemedText variant="bodyLarge" color={destructive ? 'emergency' : 'text'} numberOfLines={2}>
          {title}
        </ThemedText>
        {subtitle ? (
          <ThemedText variant="small" color="textMuted" numberOfLines={2}>
            {subtitle}
          </ThemedText>
        ) : null}
      </View>
      {value ? (
        <ThemedText variant="body" color="textMuted" style={{ marginLeft: spacing.md }}>
          {value}
        </ThemedText>
      ) : null}
      {right}
      {showChevron ? (
        <View style={{ marginLeft: spacing.sm }}>
          <AppIcon name="forward" size={sizes.iconMd} color="textLight" />
        </View>
      ) : null}
    </View>
  );

  return (
    <View>
      {onPress ? (
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
        >
          {(s) => content(!!(s as { hovered?: boolean }).hovered, s.pressed)}
        </Pressable>
      ) : (
        content(false, false)
      )}
      {divider ? <Divider inset={icon ? spacing.lg + sizes.controlMd + spacing.md : spacing.lg} /> : null}
    </View>
  );
}

/* ------------------------------------------------------------------ Avatar */

export function Avatar({ name, size = 'md' }: { name?: string | null; size?: 'sm' | 'md' | 'lg' }) {
  const { colors, radii, sizes } = useAppTheme();
  const dimension = size === 'sm' ? sizes.avatarSm : size === 'lg' ? sizes.avatarLg : sizes.avatarMd;
  const initials = (name ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
  return (
    <View
      accessibilityLabel={name ?? 'Avatar'}
      style={{
        width: dimension,
        height: dimension,
        borderRadius: radii.full,
        backgroundColor: colors.primaryLight,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <ThemedText variant={size === 'lg' ? 'h2' : size === 'sm' ? 'captionBold' : 'bodyBold'} color="primaryText">
        {initials || '?'}
      </ThemedText>
    </View>
  );
}

/* ------------------------------------------------------------- ProgressBar */

export function ProgressBar({
  value,
  tone = 'primary',
  label,
}: {
  /** 0..1 */
  value: number;
  tone?: 'primary' | 'success' | 'warning' | 'danger';
  label?: string;
}) {
  const { colors, radii, spacing } = useAppTheme();
  const clamped = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const fill =
    tone === 'success' ? colors.success : tone === 'warning' ? colors.warning : tone === 'danger' ? colors.emergency : colors.primary;
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
      style={{ height: spacing.sm, borderRadius: radii.full, backgroundColor: colors.surfaceSubtle, overflow: 'hidden' }}
    >
      <View style={{ width: `${clamped * 100}%`, height: '100%', backgroundColor: fill, borderRadius: radii.full }} />
    </View>
  );
}

/* ---------------------------------------------------------------- StatTile */

export function StatTile({
  label,
  value,
  icon,
  tone = 'primary',
  onPress,
}: {
  label: string;
  value: string | number;
  icon?: IconName;
  tone?: NonNullable<ListRowProps['tone']>;
  onPress?: () => void;
}) {
  const { colors, spacing, radii, sizes, shadows } = useAppTheme();
  const { isCompact } = useBreakpoint();
  const t = TONE_COLORS[tone];
  const strValue = String(value);
  const isLongText =
    typeof value === 'string' && strValue.length > 5 && !/^[₱$0-9.,\s]+$/.test(strValue);
  const valueVariant = isLongText
    ? isCompact
      ? 'h3'
      : 'h2'
    : isCompact
      ? 'h2'
      : 'h1';

  const body = (
    <View
      style={[
        styles.stat,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          borderRadius: radii.lg,
          padding: isCompact ? spacing.md : spacing.lg,
          gap: spacing.xs,
        },
        shadows.sm,
      ]}
    >
      {icon ? (
        <View
          style={{
            width: sizes.controlMd,
            height: sizes.controlMd,
            borderRadius: radii.md,
            backgroundColor: colors[t.bg],
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: isCompact ? spacing.xs : spacing.sm,
          }}
        >
          <AppIcon name={icon} size={sizes.iconMd} color={t.fg} />
        </View>
      ) : null}
      <View style={{ gap: spacing.xxs }}>
        <ThemedText variant={valueVariant}>{strValue}</ThemedText>
        <ThemedText variant={isCompact ? 'caption' : 'small'} color="textMuted">
          {label}
        </ThemedText>
      </View>
    </View>
  );
  return onPress ? (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label}: ${value}`} style={styles.flex}>
      {body}
    </Pressable>
  ) : (
    <View style={styles.flex}>{body}</View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  sectionRow: { flexDirection: 'row', alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center' },
  stat: { flex: 1, justifyContent: 'space-between', borderWidth: 1 },
});

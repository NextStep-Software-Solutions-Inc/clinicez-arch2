import React from 'react';
import { View, Pressable, StyleSheet, Switch, ActivityIndicator, ColorValue } from 'react-native';
import { AppIcon } from './Icon';
import ThemedText from './ThemedText';
import { useAppTheme } from '../../contexts/ThemeContext';

// ── SettingsRow ───────────────────────────────────────────────────────────────

export type SettingsRowRight =
  | { type: 'chevron' }
  | { type: 'switch'; value: boolean; onValueChange: (v: boolean) => void; disabled?: boolean }
  | {
      type: 'value';
      label: string;
      numberOfLines?: number;
      ellipsizeMode?: 'head' | 'middle' | 'tail' | 'clip';
    }
  | { type: 'loading' }
  | { type: 'none' };

interface SettingsRowProps {
  title: string;
  subtitle?: string;
  icon?: { android: string; ios: string };
  iconColor?: string;
  right?: SettingsRowRight;
  onPress?: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

export function SettingsRow({
  title,
  subtitle,
  icon,
  iconColor,
  right = { type: 'chevron' },
  onPress,
  destructive = false,
  disabled = false,
}: SettingsRowProps) {
  const { colors, radii, sizes } = useAppTheme();
  const titleColor = destructive ? colors.emergency : disabled ? colors.border : colors.text;

  const isInteractive = !!onPress && !disabled;

  const content = (
    <View style={[styles.row, { borderBottomColor: colors.borderLight, opacity: disabled ? 0.5 : 1 }]}>
      {icon && (
        <View
          style={[
            styles.iconContainer,
            {
              backgroundColor: iconColor ?? colors.primary,
              borderRadius: radii.sm,
            },
          ]}
        >
          <AppIcon android={icon.android} ios={icon.ios} size={sizes.iconSm} color="onPrimary" />
        </View>
      )}
      <View style={[styles.labelContainer, !icon && styles.labelNoIcon]}>
        <ThemedText variant="body" style={{ color: titleColor }}>
          {title}
        </ThemedText>
        {subtitle ? (
          <ThemedText variant="small" color="textSecondary" style={styles.subtitle}>
            {subtitle}
          </ThemedText>
        ) : null}
      </View>
      <View
        style={[
          styles.rightSlot,
          right.type === 'value' && styles.rightSlotValue,
        ]}
      >
        {right.type === 'chevron' && (
          <AppIcon name="forward" size={sizes.iconSm} color="textMuted" />
        )}
        {right.type === 'value' && (
          <ThemedText
            variant="body"
            color="textSecondary"
            numberOfLines={right.numberOfLines ?? 1}
            ellipsizeMode={right.ellipsizeMode ?? 'middle'}
            style={styles.valueText}
          >
            {right.label}
          </ThemedText>
        )}
        {right.type === 'switch' && (
          <Switch
            value={right.value}
            onValueChange={right.onValueChange}
            disabled={right.disabled ?? disabled}
            trackColor={{ true: colors.primary, false: colors.border }}
          />
        )}
        {right.type === 'loading' && <ActivityIndicator size="small" color={colors.primary} />}
      </View>
    </View>
  );

  if (isInteractive) {
    return (
      <Pressable
        onPress={onPress}
        disabled={disabled}
        style={({ pressed, hovered }: any) => [
          pressed && styles.pressed,
          hovered && { backgroundColor: colors.surfaceSubtle },
        ]}
        accessibilityRole={right.type === 'switch' ? 'switch' : 'button'}
        accessibilityLabel={title}
        accessibilityState={{ disabled }}
      >
        {content}
      </Pressable>
    );
  }

  return content;
}

// ── SettingsSection ───────────────────────────────────────────────────────────

interface SettingsSectionProps {
  title?: string;
  titleRightAction?: React.ReactNode;
  children: React.ReactNode;
  footer?: string;
  bodyStyle?: {
    backgroundColor?: ColorValue;
    borderColor?: ColorValue;
  };
}

export function SettingsSection({
  title,
  children,
  footer,
  bodyStyle,
  titleRightAction,
}: SettingsSectionProps) {
  const { colors, radii, spacing } = useAppTheme();
  return (
    <View style={[styles.section, { marginBottom: spacing['2xl'] }]}>
      {title ? (
        <ThemedText
          variant="captionBold"
          color="textMuted"
          style={[styles.sectionHeader, { marginLeft: spacing.lg, marginBottom: spacing.xs }]}
        >
          {title.toUpperCase()}
        </ThemedText>
      ) : null}
      {titleRightAction ? <View style={styles.titleRightAction}>{titleRightAction}</View> : null}
      <View
        style={[
          styles.sectionBody,
          {
            backgroundColor: bodyStyle?.backgroundColor ?? colors.surface,
            borderColor: bodyStyle?.borderColor ?? colors.border,
            borderRadius: radii.md,
          },
        ]}
      >
        {children}
      </View>
      {footer ? (
        <ThemedText
          variant="caption"
          color="textSecondary"
          style={[styles.sectionFooter, { marginLeft: spacing.lg, marginTop: spacing.xs }]}
        >
          {footer}
        </ThemedText>
      ) : null}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  section: {},
  sectionHeader: {
    letterSpacing: 0.5,
  },
  sectionBody: {
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  sectionFooter: {
    lineHeight: 18,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
    minHeight: 52,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconContainer: {
    width: 30,
    height: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  labelContainer: {
    flex: 1,
    marginRight: 12,
  },
  labelNoIcon: {},
  subtitle: {
    marginTop: 2,
    lineHeight: 18,
  },
  titleRightAction: {
    position: 'absolute',
    top: 0,
    right: 16,
  },
  rightSlot: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    minWidth: 24,
  },
  rightSlotValue: {
    flexShrink: 1,
    maxWidth: '58%',
  },
  valueText: {
    textAlign: 'right',
  },
  pressed: {
    opacity: 0.7,
  },
});
export default SettingsRow;

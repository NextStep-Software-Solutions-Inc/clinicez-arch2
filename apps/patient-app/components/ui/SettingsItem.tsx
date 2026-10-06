import { View, Pressable, StyleSheet, Switch, ActivityIndicator, Platform, ColorValue } from 'react-native';
import { useTheme } from '@react-navigation/native';
import { AppIcon } from './Icon';
import ThemedText from './ThemedText';

// ── SettingsRow ───────────────────────────────────────────────────────────────

export type SettingsRowRight =
  | { type: 'chevron' }
  | { type: 'switch'; value: boolean; onValueChange: (v: boolean) => void; disabled?: boolean }
  | { type: 'value'; label: string }
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
  const { colors } = useTheme();
  const titleColor = destructive ? '#EF4444' : disabled ? colors.border : colors.text;
  
  const isInteractive = !!onPress && !disabled;

  const content = (
    <View style={[styles.row, { borderBottomColor: colors.border, opacity: disabled ? 0.5 : 1 }]}>
      {icon && (
        <View style={[styles.iconContainer, { backgroundColor: iconColor ?? colors.primary }]}>
          <AppIcon android={icon.android} ios={icon.ios} size={16} color="#fff" />
        </View>
      )}
      <View style={[styles.labelContainer, !icon && styles.labelNoIcon]}>
        <ThemedText style={[styles.title, { color: titleColor }]}>{title}</ThemedText>
        {subtitle ? (
          <ThemedText style={[styles.subtitle, { color: colors.text, opacity: 0.8 }]}>{subtitle}</ThemedText>
        ) : null}
      </View>
      <View style={styles.rightSlot}>
        {right.type === 'chevron' && (
          <ThemedText style={[styles.chevron, { color: colors.text, opacity: 0.6 }]}>›</ThemedText>
        )}
        {right.type === 'value' && (
          <ThemedText style={[styles.valueLabel, { color: colors.text, opacity: 0.6 }]}>{right.label}</ThemedText>
        )}
        {right.type === 'switch' && (
          <Switch
            value={right.value}
            onValueChange={right.onValueChange}
            disabled={right.disabled ?? disabled}
          />
        )}
        {right.type === 'loading' && <ActivityIndicator size="small" />}
      </View>
    </View>
  );

  if (isInteractive) {
    return (
      <Pressable
        onPress={onPress}
        disabled={disabled}
        style={({ pressed }) => [pressed && styles.pressed]}
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

export function SettingsSection({ title, children, footer, bodyStyle, titleRightAction }: SettingsSectionProps) {
  const { colors } = useTheme();
  return (
    <View style={styles.section}>
      {title ? (
        <ThemedText style={[styles.sectionHeader, { color: colors.text, opacity: 0.7 }]}>
          {title.toUpperCase()}
        </ThemedText>
      ) : null}
      {titleRightAction ? (
        <View style={styles.titleRightAction}>
          {titleRightAction}
        </View>
      ) : null}
      <View style={[styles.sectionBody, { backgroundColor: bodyStyle?.backgroundColor ?? colors.card, borderColor: bodyStyle?.borderColor ?? colors.border }]}>
        {children}
      </View>
      {footer ? (
        <ThemedText style={[styles.sectionFooter, { color: colors.text, opacity: 0.6 }]}>{footer}</ThemedText>
      ) : null}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginBottom: 6,
    marginLeft: 16,
  },
  sectionBody: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  sectionFooter: {
    fontSize: 12,
    marginTop: 6,
    marginLeft: 16,
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
    borderRadius: 7,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  labelContainer: {
    flex: 1,
    marginRight: 8,
  },
  labelNoIcon: {
    // no extra margin needed when no icon
  },
  title: {
    fontSize: 16,
  },
  subtitle: {
    fontSize: 13,
    marginTop: 2,
    lineHeight: 18,
  },
  titleRightAction: {
    position: 'absolute',
    top: 0,
    right: 16
  },
  rightSlot: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    minWidth: 24,
  },
  chevron: {
    fontSize: 22,
    lineHeight: 24,
  },
  valueLabel: {
    fontSize: 15,
  },
  pressed: {
    opacity: 0.7,
  },
});

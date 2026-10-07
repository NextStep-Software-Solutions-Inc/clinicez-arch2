import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useAppTheme } from '../../contexts/ThemeContext';
import ThemedText from './ThemedText';
import { AppIcon, type IconName } from './Icon';

export type BadgeTone =
  | 'neutral'
  | 'primary'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'purple'
  | 'urgent';

export interface BadgeProps {
  label: string;
  tone?: BadgeTone;
  icon?: IconName;
  size?: 'sm' | 'md';
  style?: StyleProp<ViewStyle>;
}

export function useBadgeColors(tone: BadgeTone) {
  const { colors } = useAppTheme();
  switch (tone) {
    case 'primary':
      return { bg: colors.primaryLight, fg: colors.primaryText, border: colors.primaryBorder };
    case 'success':
      return { bg: colors.successBg, fg: colors.successText, border: colors.successBorder };
    case 'warning':
      return { bg: colors.warningBg, fg: colors.warningText, border: colors.warningBorder };
    case 'danger':
      return { bg: colors.emergencyBg, fg: colors.emergencyText, border: colors.emergencyBorder };
    case 'info':
      return { bg: colors.infoBg, fg: colors.infoText, border: colors.infoBorder };
    case 'purple':
      return { bg: colors.purpleBg, fg: colors.purpleText, border: colors.purpleBorder };
    case 'urgent':
      return { bg: colors.urgentBg, fg: colors.urgentText, border: colors.urgentBorder };
    case 'neutral':
    default:
      return { bg: colors.surfaceSubtle, fg: colors.textSecondary, border: colors.border };
  }
}

export default function Badge({ label, tone = 'neutral', icon, size = 'md', style }: BadgeProps) {
  const theme = useAppTheme();
  const p = useBadgeColors(tone);
  return (
    <View
      style={[
        styles.base,
        {
          backgroundColor: p.bg,
          borderColor: p.border,
          borderRadius: theme.radii.full,
          paddingHorizontal: size === 'sm' ? theme.spacing.sm : theme.spacing.md - 2,
          paddingVertical: size === 'sm' ? 2 : theme.spacing.xs - 1,
        },
        style,
      ]}
    >
      {icon ? <AppIcon name={icon} size={theme.sizes.iconSm - 2} color={p.fg} /> : null}
      <ThemedText variant="badge" color={p.fg} numberOfLines={1}>
        {label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    borderWidth: 1,
  },
});

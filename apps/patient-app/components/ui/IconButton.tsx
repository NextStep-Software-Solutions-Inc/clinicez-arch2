import React from 'react';
import { Platform, Pressable, StyleSheet, type PressableProps, type ViewStyle } from 'react-native';
import { useAppTheme } from '../../contexts/ThemeContext';
import type { ColorToken } from '../../constants/theme';
import { AppIcon, type IconName } from './Icon';

export interface IconButtonProps extends Omit<PressableProps, 'style' | 'children'> {
  icon: IconName;
  /** Required: icon-only controls must be named for screen readers. */
  accessibilityLabel: string;
  color?: ColorToken;
  size?: number;
  /** Hit area. Defaults to the touch target (44) on native and control size (36) on web. */
  hitSize?: number;
  tone?: 'plain' | 'filled';
  style?: ViewStyle;
}

type Interaction = { pressed: boolean; hovered?: boolean; focused?: boolean };

export default function IconButton({
  icon,
  color = 'text',
  size,
  hitSize,
  tone = 'plain',
  style,
  ...rest
}: IconButtonProps) {
  const theme = useAppTheme();
  const box = hitSize ?? (Platform.OS === 'web' ? 36 : theme.sizes.touchTarget);
  return (
    <Pressable
      accessibilityRole="button"
      hitSlop={Platform.OS === 'web' ? 0 : 6}
      {...rest}
      style={(s: Interaction) => [
        styles.base,
        {
          width: box,
          height: box,
          borderRadius: theme.radii.full,
          backgroundColor:
            s.hovered || s.pressed
              ? theme.colors.surfaceHighlight
              : tone === 'filled'
                ? theme.colors.surfaceSubtle
                : theme.colors.transparent,
        },
        Platform.OS === 'web' && s.focused
          ? ({ outlineColor: theme.colors.focusRing, outlineWidth: 2, outlineStyle: 'solid' } as ViewStyle)
          : null,
        style,
      ]}
    >
      <AppIcon name={icon} color={color} size={size ?? theme.sizes.iconMd} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
});

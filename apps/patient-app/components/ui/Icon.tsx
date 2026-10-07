// token-guard:ignore-file (this file owns the native symbol primitives)
import React from 'react';
import { Platform, ColorValue } from 'react-native';
import { MaterialSymbol, SFSymbol } from '@react-navigation/native';
import { useAppTheme } from '../../contexts/ThemeContext';
import type { ColorToken } from '../../constants/theme';
import type { IconName } from './iconNames';
import { NATIVE_ICONS } from './iconRegistry';

export type { IconName } from './iconNames';

export interface IconProps {
  /** Semantic name (preferred). Mapped per platform: SF Symbols / Material Symbols / Lucide. */
  name?: IconName | (string & {});
  /** Legacy explicit Material Symbol name (kept for existing call sites). */
  android?: string;
  /** Legacy explicit SF Symbol name (kept for existing call sites). */
  ios?: string;
  /** Semantic colour token or an explicit colour. Defaults to the brand primary. */
  color?: ColorToken | ColorValue;
  size?: number;
}

export function AppIcon({ android, ios, name, color, size = 20 }: IconProps) {
  const theme = useAppTheme();
  const tokens = theme.colors as Record<string, string>;
  const resolved: ColorValue =
    typeof color === 'string' && color in tokens ? tokens[color] : (color ?? theme.colors.primary);

  const semantic = name ? NATIVE_ICONS[name as IconName] : undefined;
  const androidName = android || semantic?.android || 'circle';
  const iosName = ios || semantic?.ios || 'circle';

  return (
    Platform.select({
      android: <MaterialSymbol name={androidName as any} size={size} color={resolved} />,
      ios: <SFSymbol name={iosName as any} size={Math.max(12, size - 3)} color={resolved} />,
    }) ?? null
  );
}

export { MaterialSymbol, SFSymbol };
export { AppIcon as Icon };
export default AppIcon;

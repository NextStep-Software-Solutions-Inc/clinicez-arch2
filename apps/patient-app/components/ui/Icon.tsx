import React from 'react';
import { Platform, ColorValue } from 'react-native';
import { MaterialSymbol, SFSymbol } from '@react-navigation/native';

export interface IconProps {
  android?: string;
  ios?: string;
  name?: string;
  color?: ColorValue;
  size?: number;
}

export function AppIcon({ android, ios, name, color = '#3B82F6', size = 20 }: IconProps) {
  const androidName = android || name || 'circle';
  const iosName = ios || name || 'circle';

  return Platform.select({
    android: <MaterialSymbol name={androidName as any} size={size} color={color} />,
    ios: <SFSymbol name={iosName as any} size={Math.max(12, size - 3)} color={color} />,
  }) ?? null;
}

export { MaterialSymbol, SFSymbol };
export default AppIcon;

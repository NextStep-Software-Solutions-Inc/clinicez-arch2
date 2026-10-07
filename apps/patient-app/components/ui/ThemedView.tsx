import React from 'react';
import { View, type ViewProps } from 'react-native';
import { useAppTheme } from '../../contexts/ThemeContext';
import type { ColorToken } from '../../constants/theme';

type Props = ViewProps & {
  /** Background colour token. Omit for a transparent view. */
  background?: ColorToken;
  /** @deprecated use `background` (semantic tokens handle dark mode). */
  lightColor?: string;
  /** @deprecated use `background` (semantic tokens handle dark mode). */
  darkColor?: string;
};

export default function ThemedView({ background, lightColor, darkColor, style, ...rest }: Props) {
  const { dark, colors } = useAppTheme();
  const legacy = dark ? darkColor : lightColor;
  const backgroundColor = background ? colors[background] : legacy;

  return <View {...rest} style={[backgroundColor ? { backgroundColor } : null, style]} />;
}

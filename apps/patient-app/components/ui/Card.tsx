import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';
import { useAppTheme } from '../../contexts/ThemeContext';
import type { ColorToken } from '../../constants/theme';

export interface CardProps extends ViewProps {
  /** Inner padding preset. */
  padding?: 'none' | 'sm' | 'md' | 'lg';
  /** Surface elevation. Cards default to a hairline border + soft shadow. */
  elevation?: 'none' | 'sm' | 'md';
  background?: ColorToken;
  borderColor?: ColorToken;
  style?: StyleProp<ViewStyle>;
}

export default function Card({
  padding = 'lg',
  elevation = 'sm',
  background = 'card',
  borderColor = 'border',
  style,
  ...rest
}: CardProps) {
  const theme = useAppTheme();
  const pad =
    padding === 'none'
      ? 0
      : padding === 'sm'
        ? theme.spacing.md
        : padding === 'md'
          ? theme.spacing.lg
          : theme.spacing['2xl'];

  return (
    <View
      {...rest}
      style={[
        styles.base,
        {
          backgroundColor: theme.colors[background],
          borderColor: theme.colors[borderColor],
          borderRadius: theme.radii.lg,
          borderWidth: theme.sizes.borderWidth,
          padding: pad,
        },
        theme.shadows[elevation],
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  base: { overflow: 'visible' },
});

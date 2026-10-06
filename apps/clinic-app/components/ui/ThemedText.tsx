import React from 'react';
import { TextProps, StyleSheet, TextStyle } from 'react-native';
import { Text } from './Text';
import { theme } from '../../constants/theme';

export type TextVariant = keyof typeof theme.typography;

export interface ThemedTextProps extends TextProps {
  variant?: TextVariant;
  color?: string;
}

export default function ThemedText({
  variant = 'body',
  color,
  style,
  children,
  ...rest
}: ThemedTextProps) {
  const variantStyle = theme.typography[variant] as TextStyle;
  const colorStyle = color ? { color } : {};

  return (
    <Text style={[styles.default, variantStyle, colorStyle, style]} {...rest}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  default: {
    color: theme.colors.text,
  },
});

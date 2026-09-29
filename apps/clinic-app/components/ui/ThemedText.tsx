import React from 'react';
import { Text, TextProps, StyleSheet, TextStyle } from 'react-native';
import { theme } from '../../constants/theme';

export type TextVariant =
  | 'display'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'bodyLarge'
  | 'body'
  | 'bodyBold'
  | 'caption'
  | 'captionBold'
  | 'badge'
  | 'code';

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

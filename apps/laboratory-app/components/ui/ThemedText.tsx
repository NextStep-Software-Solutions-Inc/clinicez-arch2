import React from 'react';
import { Text, TextProps, StyleSheet } from 'react-native';

export default function ThemedText({ style, children, ...rest }: TextProps) {
  return (
    <Text style={[styles.default, style]} {...rest}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  default: {
    color: '#111827',
    fontSize: 15,
  },
});

import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import ThemedText from './ThemedText';

interface ButtonProps {
  title: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
}

export default function Button({ title, onPress, busy = false, disabled = false, variant = 'primary' }: ButtonProps) {
  const inactive = busy || disabled;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy }}
      style={[styles.base, styles[variant], inactive && styles.inactive]}
      onPress={onPress}
      disabled={inactive}
    >
      {busy ? (
        <ActivityIndicator color={variant === 'secondary' ? '#047857' : '#FFFFFF'} />
      ) : (
        <ThemedText style={[styles.text, variant === 'secondary' && styles.secondaryText]}>{title}</ThemedText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: { backgroundColor: '#059669' },
  secondary: { backgroundColor: '#ECFDF5', borderWidth: 1.5, borderColor: '#A7F3D0' },
  danger: { backgroundColor: '#DC2626' },
  inactive: { opacity: 0.55 },
  text: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
  secondaryText: { color: '#047857' },
});

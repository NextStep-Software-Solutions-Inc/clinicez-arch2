import React from 'react';
import { StyleSheet, View } from 'react-native';
import ThemedText from './ThemedText';

interface BannerProps {
  message: string | null;
  tone?: 'error' | 'success';
}

export default function Banner({ message, tone = 'error' }: BannerProps) {
  if (!message) return null;
  return (
    <View style={[styles.box, tone === 'error' ? styles.error : styles.success]} accessibilityRole="alert">
      <ThemedText style={[styles.text, tone === 'error' ? styles.errorText : styles.successText]}>{message}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: 1, borderRadius: 10, padding: 12 },
  error: { backgroundColor: '#FEE2E2', borderColor: '#F87171' },
  success: { backgroundColor: '#D1FAE5', borderColor: '#34D399' },
  text: { fontSize: 13, fontWeight: '600' },
  errorText: { color: '#991B1B' },
  successText: { color: '#065F46' },
});

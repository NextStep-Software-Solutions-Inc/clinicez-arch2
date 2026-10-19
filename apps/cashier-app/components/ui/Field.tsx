import React from 'react';
import { StyleSheet, TextInput, TextInputProps, View } from 'react-native';
import ThemedText from './ThemedText';

interface FieldProps extends Omit<TextInputProps, 'style'> {
  label: string;
  hint?: string;
}

export default function Field({ label, hint, ...inputProps }: FieldProps) {
  return (
    <View style={styles.group}>
      <ThemedText style={styles.label}>{label}</ThemedText>
      <TextInput
        style={styles.input}
        placeholderTextColor="#9CA3AF"
        autoCapitalize="none"
        autoCorrect={false}
        {...inputProps}
      />
      {hint ? <ThemedText style={styles.hint}>{hint}</ThemedText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: 6 },
  label: { fontSize: 13, fontWeight: '700', color: '#1E293B' },
  input: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0F172A',
  },
  hint: { fontSize: 12, color: '#64748B' },
});

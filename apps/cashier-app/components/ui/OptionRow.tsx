import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import ThemedText from './ThemedText';

interface OptionRowProps<T extends string> {
  label: string;
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}

export default function OptionRow<T extends string>({ label, options, value, onChange }: OptionRowProps<T>) {
  return (
    <View style={styles.group}>
      <ThemedText style={styles.label}>{label}</ThemedText>
      <View style={styles.row}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              style={[styles.option, selected && styles.optionSelected]}
              onPress={() => onChange(option.value)}
            >
              <ThemedText style={[styles.optionText, selected && styles.optionTextSelected]}>{option.label}</ThemedText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: 6 },
  label: { fontSize: 13, fontWeight: '700', color: '#1E293B' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
  },
  optionSelected: { borderColor: '#059669', backgroundColor: '#ECFDF5' },
  optionText: { fontSize: 13, fontWeight: '600', color: '#334155' },
  optionTextSelected: { color: '#047857' },
});

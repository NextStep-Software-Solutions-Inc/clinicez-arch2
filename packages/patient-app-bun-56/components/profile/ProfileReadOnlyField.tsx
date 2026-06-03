import { View, StyleSheet } from 'react-native';
import { useTheme } from '@react-navigation/native';
import ThemedText from '@ui/ThemedText';

interface ProfileReadOnlyFieldProps {
  label: string;
  value?: string | null;
}

export default function ProfileReadOnlyField({ label, value }: ProfileReadOnlyFieldProps) {
  const { colors } = useTheme();

  return (
    <View style={styles.container}>
      <ThemedText style={[styles.label, { color: colors.text }]}>{label}</ThemedText>
      <ThemedText style={[styles.value, { color: colors.text }]}>{value || '—'}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 12 },
  label: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    opacity: 0.5,
    marginBottom: 2,
  },
  value: { fontSize: 15 },
});

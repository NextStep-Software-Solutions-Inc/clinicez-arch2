import { View, Text, StyleSheet, ActivityIndicator, useColorScheme } from 'react-native';
import { useDatabaseMigrations } from '@db/migrate';

interface Props {
  children: React.ReactNode;
}

export default function DatabaseProvider({ children }: Props) {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const bg = isDark ? '#000' : '#fff';
  const text = isDark ? '#fff' : '#000';
  const accent = '#007AFF';
  const { success, error } = useDatabaseMigrations();

  if (error) {
    return (
      <View style={[styles.center, { backgroundColor: bg }]}>
        <Text style={styles.errorTitle}>Database Error</Text>
        <Text style={[styles.errorMessage, { color: text }]}>
          {error.message}
        </Text>
      </View>
    );
  }

  if (!success) {
    return (
      <View style={[styles.center, { backgroundColor: bg }]}>
        <ActivityIndicator size="large" color={accent} />
        <Text style={[styles.loadingText, { color: text }]}>
          Preparing database…
        </Text>
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#EF4444',
  },
  errorMessage: {
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 32,
    opacity: 0.7,
  },
  loadingText: {
    fontSize: 14,
    marginTop: 8,
    opacity: 0.6,
  },
});

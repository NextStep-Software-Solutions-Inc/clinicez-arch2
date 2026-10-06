import { View, Text, StyleSheet, ActivityIndicator, useColorScheme } from 'react-native';
import { useDatabaseMigrations } from '@db/migrate';

interface Props {
  children: React.ReactNode;
}

export default function DatabaseProvider({ children }: Props) {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const bg = isDark ? '#0F172A' : '#F8FAFC';
  const text = isDark ? '#F8FAFC' : '#0F172A';
  const accent = '#3B82F6';
  const { success, error } = useDatabaseMigrations();

  if (error) {
    return (
      <View style={[styles.center, { backgroundColor: bg }]}>
        <Text style={styles.errorTitle}>Web Database Initialization Error</Text>
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
          Loading Clinic EZ Patient Web Portal…
        </Text>
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    minHeight: '100vh' as any,
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
    fontSize: 15,
    fontWeight: '500',
    marginTop: 8,
    opacity: 0.8,
  },
});

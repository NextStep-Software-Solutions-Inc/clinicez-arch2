import React from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { useDatabaseMigrations } from '@db/migrate';
import { useAppTheme } from '../contexts/ThemeContext';
import ThemedText from './ui/ThemedText';

interface Props {
  children: React.ReactNode;
}

export default function DatabaseProvider({ children }: Props) {
  const { colors, spacing } = useAppTheme();
  const { success, error } = useDatabaseMigrations();

  if (error) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background, padding: spacing.xl }]}>
        <ThemedText variant="title" color="emergency">
          Database Error
        </ThemedText>
        <ThemedText variant="body" color="textSecondary" style={styles.errorMessage}>
          {error.message}
        </ThemedText>
      </View>
    );
  }

  if (!success) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background, padding: spacing.xl }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <ThemedText variant="body" color="textSecondary" style={styles.loadingText}>
          Preparing database…
        </ThemedText>
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
  errorMessage: {
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  loadingText: {
    marginTop: 8,
  },
});

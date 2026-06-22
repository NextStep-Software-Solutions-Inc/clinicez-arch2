import { View, ActivityIndicator, StyleSheet, Pressable } from 'react-native';
import { useTheme } from '@react-navigation/native';
import { useAuth } from 'contexts/AuthContext';
import ThemedText from '@ui/ThemedText';

export default function LoadingScreen() {
  const { colors } = useTheme();
  const { verificationError, retryVerification, logout } = useAuth();

  if (verificationError) {
    return (
      <View style={[styles.page, { backgroundColor: colors.background, padding: 24 }]}>
        <View style={styles.errorCard}>
          <ThemedText style={styles.errorIcon}>⚠️</ThemedText>
          <ThemedText style={styles.errorTitle}>Connection Failed</ThemedText>
          <ThemedText style={[styles.errorMessage, { color: colors.text }]}>
            We were unable to verify your user profile. Please check your internet connection and try again.
          </ThemedText>
          {verificationError.message ? (
            <ThemedText style={[styles.technicalError, { color: colors.text }]}>
              Detail: {verificationError.message}
            </ThemedText>
          ) : null}

          <Pressable
            onPress={retryVerification}
            style={({ pressed }) => [
              styles.primaryButton,
              { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <ThemedText style={styles.primaryButtonText}>Retry Connection</ThemedText>
          </Pressable>

          <Pressable
            onPress={logout}
            style={({ pressed }) => [
              styles.secondaryButton,
              { borderColor: colors.border, opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <ThemedText style={[styles.secondaryButtonText, { color: colors.text }]}>
              Sign Out
            </ThemedText>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.page, { backgroundColor: colors.background }]}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorCard: {
    width: '100%',
    maxWidth: 320,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  errorTitle: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 12,
    textAlign: 'center',
  },
  errorMessage: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    opacity: 0.8,
    marginBottom: 16,
  },
  technicalError: {
    fontSize: 12,
    textAlign: 'center',
    opacity: 0.5,
    marginBottom: 24,
  },
  primaryButton: {
    width: '100%',
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    width: '100%',
    height: 48,
    borderRadius: 12,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});

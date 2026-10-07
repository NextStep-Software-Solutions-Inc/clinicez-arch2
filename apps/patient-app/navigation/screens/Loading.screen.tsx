import React from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useAppTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import ThemedText from '@ui/ThemedText';
import Button from '@ui/Button';
import { AppIcon } from '@ui/Icon';

export default function LoadingScreen() {
  const { colors, spacing, sizes } = useAppTheme();
  const { verificationError, retryVerification, logout } = useAuth();

  if (verificationError) {
    return (
      <View style={[styles.page, { backgroundColor: colors.background, padding: spacing['2xl'] }]}>
        <View style={[styles.errorCard, { maxWidth: sizes.dialogWidth }]}>
          <AppIcon name="warning" size={sizes.iconXl * 1.5} color="warning" />
          <ThemedText variant="h2" style={{ textAlign: 'center', marginTop: spacing.md, marginBottom: spacing.sm }}>
            Connection Failed
          </ThemedText>
          <ThemedText
            variant="body"
            color="textSecondary"
            style={{ textAlign: 'center', marginBottom: spacing.md }}
          >
            We were unable to verify your user profile. Please check your internet connection and try again.
          </ThemedText>
          {verificationError.message ? (
            <ThemedText
              variant="small"
              color="textMuted"
              style={{ textAlign: 'center', marginBottom: spacing['2xl'] }}
            >
              Detail: {verificationError.message}
            </ThemedText>
          ) : null}

          <Button
            label="Retry Connection"
            variant="primary"
            fullWidth
            onPress={retryVerification}
            style={{ marginBottom: spacing.md }}
          />

          <Button
            label="Sign Out"
            variant="outline"
            fullWidth
            onPress={logout}
          />
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
    alignItems: 'center',
    justifyContent: 'center',
  },
});

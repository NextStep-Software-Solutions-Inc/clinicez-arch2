import React from 'react';
import { StyleSheet, View } from 'react-native';
import ThemedText from './ui/ThemedText';
import Button from './ui/Button';
import { theme } from '../constants/theme';

interface State {
  failed: boolean;
  error?: Error | null;
}

/**
 * Last line of defence: a rendering bug in one screen must not leave a clinician staring at a blank page.
 * Shows a plain recovery screen; nothing the user typed is sent anywhere, and the underlying error stays in the
 * console for support. Anything already queued for sync is on the device and survives a reload.
 */
export default class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { failed: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { failed: true, error };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error('Unhandled UI error', error, info.componentStack);
  }

  private reset = () => this.setState({ failed: false, error: null });

  render() {
    if (!this.state.failed) return this.props.children;

    return (
      <View style={styles.container} accessibilityRole="alert">
        <ThemedText variant="h2">Something went wrong</ThemedText>
        <ThemedText variant="body" color={theme.colors.textMuted} style={styles.message}>
          The screen could not be shown. Your saved work and anything waiting to sync are safe on this device.
        </ThemedText>
        {this.state.error?.message ? (
          <ThemedText variant="caption" color={theme.colors.emergency} style={styles.errorDetails}>
            {this.state.error.message}
          </ThemedText>
        ) : null}
        <Button title="Try again" icon="refresh" onPress={this.reset} />
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.md,
    padding: theme.spacing['2xl'],
    backgroundColor: theme.colors.background,
  },
  message: {
    textAlign: 'center',
    maxWidth: 420,
  },
  errorDetails: {
    textAlign: 'center',
    maxWidth: 480,
    padding: theme.spacing.xs,
    fontFamily: theme.fonts.mono['500'],
  },
});

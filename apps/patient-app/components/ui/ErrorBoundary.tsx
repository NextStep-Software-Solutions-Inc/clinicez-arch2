import React, { ErrorInfo, useState } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import * as Updates from 'expo-updates';
import ThemedText from './ThemedText';
import ThemedView from './ThemedView';
import { AppIcon } from './Icon';
import Button from './Button';
import { useAppTheme } from '../../contexts/ThemeContext';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

function ErrorFallback({ error, onReset }: { error: Error | null; onReset: () => void }) {
  const { spacing, sizes } = useAppTheme();
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<string | null>(null);

  const canCheckUpdates = Platform.OS !== 'web' && Boolean(Updates?.isEnabled);

  const handleCheckUpdate = async () => {
    if (!canCheckUpdates) return;
    try {
      setIsUpdating(true);
      setUpdateStatus('Checking for updates...');
      const check = await Updates.checkForUpdateAsync();
      if (check.isAvailable) {
        setUpdateStatus('Downloading update...');
        await Updates.fetchUpdateAsync();
        setUpdateStatus('Restarting app...');
        await Updates.reloadAsync();
      } else {
        setUpdateStatus('App is up to date.');
      }
    } catch {
      setUpdateStatus('Update check failed. Check your connection.');
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <ThemedView style={[styles.container, { padding: spacing['2xl'] }]}>
      <View style={styles.content}>
        <View style={{ marginBottom: spacing.lg }}>
          <AppIcon name="alert" size={sizes.iconXl} color="warning" />
        </View>
        <ThemedText variant="title" style={[styles.title, { marginBottom: spacing.md }]}>
          Oops! Something went wrong.
        </ThemedText>
        <ThemedText
          variant="body"
          color="textSecondary"
          style={[styles.message, { marginBottom: spacing.lg }]}
        >
          {error?.message || 'An unexpected error occurred.'}
        </ThemedText>
        {updateStatus ? (
          <ThemedText
            variant="caption"
            color="primary"
            style={[styles.statusText, { marginBottom: spacing.md }]}
          >
            {updateStatus}
          </ThemedText>
        ) : null}
        <Button label="Try Again" onPress={onReset} variant="primary" style={styles.button} />
        {canCheckUpdates ? (
          <Button
            label={isUpdating ? (updateStatus ?? 'Updating...') : 'Check for Updates'}
            onPress={handleCheckUpdate}
            variant="secondary"
            disabled={isUpdating}
            style={[styles.button, { marginTop: spacing.md }]}
          />
        ) : null}
      </View>
    </ThemedView>
  );
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return <ErrorFallback error={this.state.error} onReset={this.handleReset} />;
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
    maxWidth: 400,
  },
  title: {
    textAlign: 'center',
  },
  message: {
    textAlign: 'center',
    lineHeight: 22,
  },
  button: {
    alignSelf: 'center',
  },
  statusText: {
    textAlign: 'center',
  },
});

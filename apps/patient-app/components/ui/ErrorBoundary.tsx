import React, { ErrorInfo } from 'react';
import { View, StyleSheet } from 'react-native';
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
          style={[styles.message, { marginBottom: spacing['3xl'] }]}
        >
          {error?.message || 'An unexpected error occurred.'}
        </ThemedText>
        <Button label="Try Again" onPress={onReset} variant="primary" style={styles.button} />
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
});

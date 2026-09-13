import React, { ErrorInfo } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import ThemedText from './ThemedText';
import ThemedView from './ThemedView';

interface ErrorBoundaryProps {
    children: React.ReactNode;
}

interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        // Update state so the next render will show the fallback UI.
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        // You can also log the error to an error reporting service like Sentry or Bugsnag
        console.error("Uncaught error:", error, errorInfo);
    }

    handleReset = () => {
        this.setState({ hasError: false, error: null });
    };

    render() {
        if (this.state.hasError) {
            return (
                <ThemedView style={styles.container}>
                    <View style={styles.content}>
                        <ThemedText style={styles.icon}>⚠️</ThemedText>
                        <ThemedText style={styles.title}>Oops! Something went wrong.</ThemedText>
                        <ThemedText style={styles.message}>
                            {this.state.error?.message || 'An unexpected error occurred.'}
                        </ThemedText>
                        <Pressable style={styles.button} onPress={this.handleReset}>
                            <ThemedText style={styles.buttonText}>Try Again</ThemedText>
                        </Pressable>
                    </View>
                </ThemedView>
            );
        }

        return this.props.children;
    }
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    content: {
        alignItems: 'center',
        maxWidth: 400,
    },
    icon: {
        fontSize: 48,
        marginBottom: 16,
    },
    title: {
        fontSize: 20,
        fontWeight: 'bold',
        marginBottom: 12,
        textAlign: 'center',
    },
    message: {
        fontSize: 16,
        textAlign: 'center',
        opacity: 0.8,
        marginBottom: 32,
        lineHeight: 22,
    },
    button: {
        backgroundColor: '#0EA5E9',
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 8,
    },
    buttonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '600',
    },
});

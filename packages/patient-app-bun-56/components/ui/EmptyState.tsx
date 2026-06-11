import { Pressable, StyleSheet } from 'react-native';
import ThemedText from './ThemedText';
import ThemedView from './ThemedView';
import { Theme, useTheme } from '@react-navigation/native';

interface EmptyStateProps {
  title: string;
  message: string;
  actionLabel?: string;
  onActionPress?: () => void;
}

export default function EmptyState({ title, message, actionLabel, onActionPress }: EmptyStateProps) {

  const theme = useTheme();
  const styles = createStyles(theme);

  return (
    <ThemedView style={styles.card}>
      <ThemedText style={styles.title}>{title}</ThemedText>
      <ThemedText style={styles.message}>{message}</ThemedText>
      {actionLabel && onActionPress ? (
        <Pressable onPress={onActionPress} style={styles.actionButton} accessibilityRole="button">
          <ThemedText style={styles.actionLabel}>{actionLabel}</ThemedText>
        </Pressable>
      ) : null}
    </ThemedView>
  );
}

const createStyles = (theme: Theme) => StyleSheet.create({
  card: {
    padding: 16,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: theme.colors.card,
    gap: 6,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
  },
  message: {
    fontSize: 13,
    lineHeight: 19,
    opacity: 0.8,
  },
  actionButton: {
    marginTop: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#2563EB',
  },
  actionLabel: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
});

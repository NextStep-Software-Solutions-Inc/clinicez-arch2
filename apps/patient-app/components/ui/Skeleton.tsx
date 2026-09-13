import { StyleSheet } from 'react-native';
import ThemedView from './ThemedView';

interface SkeletonProps {
  width?: number | string;
  height?: number;
  radius?: number;
}

export function Skeleton({ width = '100%', height = 16, radius = 12 }: SkeletonProps) {
  return <ThemedView style={[styles.base, { width: width as any, height, borderRadius: radius }]} />;
}

export function SkeletonCard() {
  return (
    <ThemedView style={styles.card}>
      <Skeleton height={18} width="62%" />
      <Skeleton height={12} width="86%" />
      <Skeleton height={12} width="72%" />
      <ThemedView style={styles.row}>
        <Skeleton height={36} width="48%" radius={10} />
        <Skeleton height={36} width="48%" radius={10} />
      </ThemedView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: 'rgba(148, 163, 184, 0.22)',
  },
  card: {
    padding: 16,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
});

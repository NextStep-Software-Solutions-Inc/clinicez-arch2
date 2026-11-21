import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useAppTheme } from '../../contexts/ThemeContext';
import { Skeleton } from '../ui/Skeleton';

export interface RecordSkeletonListProps {
  count?: number;
}

export const RecordSkeletonList: React.FC<RecordSkeletonListProps> = ({ count = 4 }) => {
  const { colors, spacing, radii, sizes } = useAppTheme();

  return (
    <View style={[styles.container, { padding: spacing.lg, gap: spacing.md }]}>
      {Array.from({ length: count }).map((_, idx) => (
        <View
          key={idx}
          style={[
            styles.card,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              borderWidth: sizes.borderWidth,
              borderRadius: radii.lg,
              padding: spacing.md,
              gap: spacing.sm,
            },
          ]}
        >
          <View style={[styles.topRow, { gap: spacing.md }]}>
            <Skeleton width={sizes.controlLg} height={sizes.controlLg} radius={radii.md} />
            <View style={[styles.details, { gap: spacing.xs }]}>
              <View style={[styles.badgeRow, { gap: spacing.xs }]}>
                <Skeleton width="55%" height={16} radius={radii.sm} />
                <Skeleton width={60} height={18} radius={radii.full} />
              </View>
              <Skeleton width="40%" height={12} radius={radii.sm} />
            </View>
          </View>
        </View>
      ))}
    </View>
  );
};

export default RecordSkeletonList;

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  card: {
    width: '100%',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  details: {
    flex: 1,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});

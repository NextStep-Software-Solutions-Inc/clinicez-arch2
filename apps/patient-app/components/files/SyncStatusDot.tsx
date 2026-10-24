import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useAppTheme } from '../../contexts/ThemeContext';
import { getSyncStatusDotMeta, type SyncStatusMeta } from '../../services/files/recordPresentation';

export { getSyncStatusDotMeta, type SyncStatusMeta };

export function SyncStatusDot({ status }: { status: string | null | undefined }) {
  const { colors, radii } = useAppTheme();
  const meta = getSyncStatusDotMeta(status);

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={meta.accessibilityLabel}
      style={[
        styles.halo,
        {
          backgroundColor: colors[meta.haloColor],
          borderRadius: radii.full,
        },
      ]}
    >
      <View
        style={[
          styles.dot,
          {
            backgroundColor: colors[meta.dotColor],
            borderRadius: radii.full,
          },
        ]}
      />
    </View>
  );
}

export default SyncStatusDot;

const styles = StyleSheet.create({
  halo: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  dot: {
    width: 8,
    height: 8,
  },
});

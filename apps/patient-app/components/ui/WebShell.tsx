import React from 'react';
import { View, StyleSheet, useWindowDimensions, Platform } from 'react-native';
import { useTheme } from '@react-navigation/native';

interface WebShellProps {
  children: React.ReactNode;
  maxWidth?: number;
}

/**
 * WebShell provides a responsive container for web viewports.
 * On desktop (> 640px), it centers the interface in a mobile/tablet-proportioned
 * column with subtle card styling. On native and mobile viewports, it passes through 100% full width.
 */
export default function WebShell({ children, maxWidth = 540 }: WebShellProps) {
  const { width } = useWindowDimensions();
  const { colors } = useTheme();

  if (Platform.OS !== 'web' || width <= 640) {
    return <View style={styles.fullWidth}>{children}</View>;
  }

  return (
    <View style={[styles.outerContainer, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.innerContainer,
          {
            maxWidth,
            backgroundColor: colors.background,
            borderColor: colors.border,
          },
        ]}
      >
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fullWidth: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  outerContainer: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  innerContainer: {
    flex: 1,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 4,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
  },
});

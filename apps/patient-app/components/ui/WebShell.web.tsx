import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useTheme } from '@react-navigation/native';

interface WebShellProps {
  children: React.ReactNode;
  maxWidth?: number;
}

/**
 * WebShell.web.tsx provides a flexible, full-width responsive web shell container.
 * Unlike the mobile shell, it does not clamp the application into a narrow 540px mobile box,
 * allowing web screens to utilize desktop and tablet widescreen layouts naturally.
 */
export default function WebShellWeb({ children }: WebShellProps) {
  const { colors } = useTheme();

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    width: '100%',
    height: '100%',
    // In web browsers, ensure root takes full viewport
    minHeight: '100%',
  },
});

import React, { ReactNode } from 'react';
import { View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { useAppTheme } from '../../contexts/ThemeContext';

export interface ProfileFormGridProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * Responsive form layout grid:
 * On desktop (>= 1024), renders child fields in two columns with gap.
 * On compact / tablet (< 1024), stacks children in a single column.
 */
export default function ProfileFormGrid({ children, style }: ProfileFormGridProps) {
  const { isDesktop } = useBreakpoint();
  const { spacing } = useAppTheme();

  return (
    <View
      style={[
        styles.grid,
        isDesktop ? [styles.desktopGrid, { gap: spacing.md }] : styles.mobileGrid,
        style,
      ]}
    >
      {React.Children.map(children, (child) => {
        if (!child) return null;
        return (
          <View style={isDesktop ? styles.desktopCol : styles.mobileCol}>
            {child}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    width: '100%',
  },
  desktopGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
  },
  mobileGrid: {
    flexDirection: 'column',
  },
  desktopCol: {
    flex: 1,
    minWidth: 260,
  },
  mobileCol: {
    width: '100%',
  },
});

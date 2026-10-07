import React from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  type RefreshControlProps,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../../contexts/ThemeContext';
import type { ColorToken } from '../../constants/theme';

export interface ScreenProps extends Omit<ScrollViewProps, 'contentContainerStyle'> {
  /** Render a ScrollView (default) or a plain flex View. */
  scroll?: boolean;
  /** Max content width: `form` (720) for single-column forms, `content` (1200), or `full`. */
  width?: 'form' | 'content' | 'full';
  background?: ColorToken;
  /** Apply the standard page padding (default true). */
  padded?: boolean;
  /** Extra bottom space (e.g. tab bar / save bar height). */
  bottomInset?: number;
  contentContainerStyle?: StyleProp<ViewStyle>;
  onRefresh?: () => void;
  refreshing?: boolean;
  refreshControlProps?: Partial<RefreshControlProps>;
}

/**
 * Standard screen scaffold used by mobile and web pages: themed background, consistent
 * page padding, centered max-width column on large viewports, optional pull-to-refresh.
 */
export default function Screen({
  scroll = true,
  width = 'content',
  background = 'background',
  padded = true,
  bottomInset = 0,
  contentContainerStyle,
  onRefresh,
  refreshing = false,
  refreshControlProps,
  children,
  style,
  ...rest
}: ScreenProps) {
  const { colors, spacing, sizes } = useAppTheme();
  const insets = useSafeAreaInsets();

  const maxWidth =
    width === 'form' ? sizes.formMaxWidth : width === 'content' ? sizes.contentMaxWidth : undefined;
  const pad = padded ? spacing.lg : 0;

  const column: ViewStyle = {
    width: '100%',
    maxWidth,
    alignSelf: 'center',
    padding: pad,
    paddingBottom: pad + bottomInset + (scroll ? insets.bottom : 0),
  };

  if (!scroll) {
    return (
      <View style={[styles.flex, { backgroundColor: colors[background] }, style as StyleProp<ViewStyle>]}>
        <View style={[styles.flex, column, contentContainerStyle]}>{children}</View>
      </View>
    );
  }

  return (
    <ScrollView
      {...rest}
      style={[styles.flex, { backgroundColor: colors[background] }, style]}
      contentContainerStyle={[column, contentContainerStyle]}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
            {...refreshControlProps}
          />
        ) : undefined
      }
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});

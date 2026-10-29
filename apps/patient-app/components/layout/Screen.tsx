import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
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
import { useSafeHeaderHeight } from '../../hooks/useSafeHeaderHeight';

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
  /** Whether to add top safe area inset (useful for screens with no native navigation stack header). */
  safeAreaTop?: boolean;
  contentContainerStyle?: StyleProp<ViewStyle>;
  onRefresh?: () => void;
  refreshing?: boolean;
  refreshControlProps?: Partial<RefreshControlProps>;
  /** Whether to enable keyboard avoidance for input fields. Defaults to true on native platforms. */
  keyboardAvoiding?: boolean;
  /** Custom vertical offset for KeyboardAvoidingView. Defaults to navigation header height on iOS. */
  keyboardOffset?: number;
  /** KeyboardAvoidingView behavior. Defaults to 'padding' on iOS. */
  keyboardBehavior?: 'padding' | 'height' | 'position';
  /** Optional sticky footer (e.g. SaveBar or action button) kept above the keyboard. */
  footer?: React.ReactNode;
}

/**
 * Standard screen scaffold used by mobile and web pages: themed background, consistent
 * page padding, centered max-width column on large viewports, pull-to-refresh, and
 * software keyboard obstruction avoidance for text editing fields.
 */
export default function Screen({
  scroll = true,
  width = 'content',
  background = 'background',
  padded = true,
  bottomInset = 0,
  safeAreaTop = false,
  contentContainerStyle,
  onRefresh,
  refreshing = false,
  refreshControlProps,
  keyboardAvoiding = Platform.OS !== 'web',
  keyboardOffset,
  keyboardBehavior = Platform.OS === 'ios' ? 'padding' : undefined,
  footer,
  children,
  style,
  ...rest
}: ScreenProps) {
  const { colors, spacing, sizes } = useAppTheme();
  const insets = useSafeAreaInsets();
  const headerHeight = useSafeHeaderHeight();

  const maxWidth =
    width === 'form' ? sizes.formMaxWidth : width === 'content' ? sizes.contentMaxWidth : undefined;
  const pad = padded ? spacing.lg : 0;
  const calculatedOffset = keyboardOffset ?? (Platform.OS === 'ios' ? headerHeight : 0);
  const topPad = pad + (safeAreaTop ? insets.top : 0);

  const column: ViewStyle = {
    width: '100%',
    maxWidth,
    alignSelf: 'center',
    padding: pad,
    paddingTop: topPad,
    paddingBottom: pad + bottomInset + (scroll && !footer ? insets.bottom : 0),
  };

  if (footer) {
    const scrollContent = (
      <ScrollView
        {...rest}
        style={[styles.flex, { backgroundColor: colors[background] }, style]}
        contentContainerStyle={[
          column,
          { paddingBottom: pad + bottomInset + spacing.xl },
          contentContainerStyle,
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
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

    if (keyboardAvoiding && Platform.OS !== 'web') {
      return (
        <KeyboardAvoidingView
          style={[styles.flex, { backgroundColor: colors[background] }]}
          behavior={keyboardBehavior}
          keyboardVerticalOffset={calculatedOffset}
        >
          {scrollContent}
          {footer}
        </KeyboardAvoidingView>
      );
    }

    return (
      <View style={[styles.flex, { backgroundColor: colors[background] }]}>
        {scrollContent}
        {footer}
      </View>
    );
  }

  if (!scroll) {
    const viewContent = (
      <View style={[styles.flex, { backgroundColor: colors[background] }, style as StyleProp<ViewStyle>]}>
        <View style={[styles.flex, column, contentContainerStyle]}>{children}</View>
      </View>
    );

    if (keyboardAvoiding && Platform.OS !== 'web') {
      return (
        <KeyboardAvoidingView
          style={[styles.flex, { backgroundColor: colors[background] }]}
          behavior={keyboardBehavior}
          keyboardVerticalOffset={calculatedOffset}
        >
          {viewContent}
        </KeyboardAvoidingView>
      );
    }

    return viewContent;
  }

  return (
    <ScrollView
      {...rest}
      style={[styles.flex, { backgroundColor: colors[background] }, style]}
      contentContainerStyle={[
        column,
        { paddingBottom: pad + bottomInset + insets.bottom + spacing.lg },
        contentContainerStyle,
      ]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
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

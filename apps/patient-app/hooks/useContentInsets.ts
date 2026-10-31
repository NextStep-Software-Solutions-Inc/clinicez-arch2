import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';

/**
 * Bottom content padding for scrollable screens so content is not hidden behind the tab bar.
 * Safe outside a tab navigator (falls back to a sensible default instead of throwing).
 */
export function useContentInsets() {
  const insets = useSafeAreaInsets();
  let tabBarHeight = 0;
  let isInTabNavigator = false;
  try {
    tabBarHeight = useBottomTabBarHeight();
    isInTabNavigator = true;
  } catch {
    tabBarHeight = 0;
    isInTabNavigator = false;
  }
  const defaultTabHeight = Platform.OS === 'android' ? 80 : Platform.OS === 'ios' ? 83 : 0;
  const resolvedTabHeight = isInTabNavigator ? (tabBarHeight || defaultTabHeight) : 0;
  const base = tabBarHeight || 96;
  return {
    tabBarHeight: base,
    /** Padding to add at the bottom of scroll content (tab bar + safe area). */
    bottom: base + insets.bottom,
    /** Offset for floating action buttons so they seat right above the bottom tab bar. */
    fabBottom: resolvedTabHeight,
  };
}

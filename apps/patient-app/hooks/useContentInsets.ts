import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';

/**
 * Bottom content padding for scrollable screens so content is not hidden behind the tab bar.
 * Safe outside a tab navigator (falls back to a sensible default instead of throwing).
 */
export function useContentInsets() {
  const insets = useSafeAreaInsets();
  let tabBarHeight = 0;
  try {
    tabBarHeight = useBottomTabBarHeight();
  } catch {
    tabBarHeight = 0;
  }
  const base = tabBarHeight || 96;
  return {
    tabBarHeight: base,
    /** Padding to add at the bottom of scroll content (tab bar + safe area). */
    bottom: base + insets.bottom,
  };
}

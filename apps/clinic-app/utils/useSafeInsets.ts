import { useSafeAreaInsets, type EdgeInsets } from 'react-native-safe-area-context';

const DEFAULT_INSETS: EdgeInsets = { top: 0, right: 0, bottom: 0, left: 0 };

/**
 * Safe wrapper around `useSafeAreaInsets` that returns zero insets instead of throwing
 * when called outside a `SafeAreaProvider` (e.g. in headless unit tests or SSR).
 */
export function useSafeInsets(): EdgeInsets {
  try {
    const insets = useSafeAreaInsets();
    return insets ?? DEFAULT_INSETS;
  } catch {
    return DEFAULT_INSETS;
  }
}

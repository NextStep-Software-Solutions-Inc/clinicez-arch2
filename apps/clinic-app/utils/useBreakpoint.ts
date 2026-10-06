import { useWindowDimensions } from 'react-native';
import { theme } from '../constants/theme';

/**
 * Reactive viewport breakpoints. Re-renders on window resize (including browser resize on
 * web), unlike `Dimensions.get()` which is only a snapshot.
 */
export function useBreakpoint() {
  const { width, height } = useWindowDimensions();
  return {
    width,
    height,
    /** Phone layout: bottom tab bar, no sidebar. */
    isCompact: width < theme.breakpoints.tablet,
    /** Tablet and up: persistent sidebar workstation layout. */
    isWorkstation: width >= theme.breakpoints.tablet,
    isDesktop: width >= theme.breakpoints.desktop,
    isWide: width >= theme.breakpoints.wide,
  };
}

import { useWindowDimensions } from 'react-native';
import { breakpoints } from '@clinicez/design-tokens';

/**
 * Reactive viewport breakpoints. Re-renders on window resize (including browser
 * resize on web), unlike `Dimensions.get()`.
 */
export function useBreakpoint() {
  const { width, height } = useWindowDimensions();
  return {
    width,
    height,
    /** Phone layout: bottom tab bar, no sidebar. */
    isCompact: width < breakpoints.tablet,
    /** Tablet and up: persistent sidebar workstation layout (web). */
    isWorkstation: width >= breakpoints.tablet,
    /** Large desktop: sidebar is expanded and two-column pages are enabled. */
    isDesktop: width >= breakpoints.desktop,
    isWide: width >= breakpoints.wide,
  };
}

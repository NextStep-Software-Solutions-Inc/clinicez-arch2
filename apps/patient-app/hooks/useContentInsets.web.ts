import { useAppTheme } from '../contexts/ThemeContext';
import { useBreakpoint } from './useBreakpoint';

/**
 * Web variant: the sidebar replaces the tab bar at >= 768px, so only the compact
 * bottom bar (phone widths) needs reserved space.
 */
export function useContentInsets() {
  const { sizes, spacing } = useAppTheme();
  const { isCompact } = useBreakpoint();
  const tabBarHeight = isCompact ? sizes.headerHeight : 0;
  return {
    tabBarHeight,
    bottom: tabBarHeight + spacing['2xl'],
    /** On web, the screen container is flex-bounded above WebNavBar, so the FAB needs 0 tab offset. */
    fabBottom: 0,
  };
}

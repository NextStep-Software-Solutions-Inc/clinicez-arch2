import { useMemo } from 'react';

export interface VirtualWindowOptions {
  totalCount: number;
  itemHeight: number;
  viewportHeight: number;
  scrollY: number;
  listTopOffset?: number;
  itemsPerRow?: number;
  overscan?: number;
}

export interface VirtualWindowResult {
  startIndex: number;
  endIndex: number;
  paddingTop: number;
  paddingBottom: number;
  totalRows: number;
  totalHeight: number;
  visibleCount: number;
  isVirtualizing: boolean;
}

/**
 * Calculates visible window indices and spacer heights for virtualized list rendering.
 * Pure function for deterministic testing and zero side effects.
 */
export function calculateVirtualWindow(options: VirtualWindowOptions): VirtualWindowResult {
  const {
    totalCount,
    itemHeight,
    viewportHeight,
    scrollY,
    listTopOffset = 0,
    itemsPerRow = 1,
    overscan = 4,
  } = options;

  if (totalCount <= 0 || itemHeight <= 0) {
    return {
      startIndex: 0,
      endIndex: 0,
      paddingTop: 0,
      paddingBottom: 0,
      totalRows: 0,
      totalHeight: 0,
      visibleCount: 0,
      isVirtualizing: false,
    };
  }

  const effectivePerRow = Math.max(1, itemsPerRow);
  const totalRows = Math.ceil(totalCount / effectivePerRow);
  const totalHeight = totalRows * itemHeight;

  // Don't virtualize if entire list fits within initial buffer (e.g. <= 12 rows)
  const maxUnvirtualizedRows = Math.ceil((viewportHeight || 800) / itemHeight) + overscan * 2;
  if (totalRows <= maxUnvirtualizedRows) {
    return {
      startIndex: 0,
      endIndex: totalCount,
      paddingTop: 0,
      paddingBottom: 0,
      totalRows,
      totalHeight,
      visibleCount: totalCount,
      isVirtualizing: false,
    };
  }

  const relativeScrollY = Math.max(0, scrollY - listTopOffset);
  const startRow = Math.max(0, Math.floor(relativeScrollY / itemHeight) - overscan);
  const endRow = Math.min(
    totalRows,
    Math.ceil((relativeScrollY + (viewportHeight || 800)) / itemHeight) + overscan
  );

  const startIndex = Math.max(0, startRow * effectivePerRow);
  const endIndex = Math.min(totalCount, endRow * effectivePerRow);

  const paddingTop = startRow * itemHeight;
  const paddingBottom = Math.max(0, (totalRows - endRow) * itemHeight);

  return {
    startIndex,
    endIndex,
    paddingTop,
    paddingBottom,
    totalRows,
    totalHeight,
    visibleCount: endIndex - startIndex,
    isVirtualizing: true,
  };
}

export interface UseVirtualListProps<T> {
  items: T[];
  itemHeight: number;
  viewportHeight: number;
  scrollY: number;
  listTopOffset?: number;
  itemsPerRow?: number;
  overscan?: number;
}

export interface UseVirtualListResult<T> extends VirtualWindowResult {
  visibleItems: T[];
}

/**
 * Hook to virtualize large lists (e.g. 10,000+ items), maintaining a constant
 * DOM node count (~20-30 items) to prevent browser heap memory exhaustion.
 */
export function useVirtualList<T>({
  items,
  itemHeight,
  viewportHeight,
  scrollY,
  listTopOffset = 0,
  itemsPerRow = 1,
  overscan = 4,
}: UseVirtualListProps<T>): UseVirtualListResult<T> {
  return useMemo(() => {
    const window = calculateVirtualWindow({
      totalCount: items.length,
      itemHeight,
      viewportHeight,
      scrollY,
      listTopOffset,
      itemsPerRow,
      overscan,
    });

    const visibleItems = items.slice(window.startIndex, window.endIndex);

    return {
      ...window,
      visibleItems,
    };
  }, [items, itemHeight, viewportHeight, scrollY, listTopOffset, itemsPerRow, overscan]);
}

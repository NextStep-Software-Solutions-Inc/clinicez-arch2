import React, { useRef, useEffect, useState, useMemo } from 'react';
import {
  Modal,
  View,
  StyleSheet,
  TextInput,
  Pressable,
  ScrollView,
  Animated,
} from 'react-native';
import type { SearchItem, CategoryOption } from '@shared/safe';
import ThemedText from '../ui/ThemedText';
import Icon from '../ui/Icon';
import SearchResultItemRow from './SearchResultItemRow';
import SearchCategoryTabs from './SearchCategoryTabs';
import { theme } from '../../constants/theme';

export interface ModalKeyNavigationState {
  activeIndex: number;
  displayedItems: SearchItem[];
  onClose: () => void;
  onSelectItem: (item: SearchItem) => void;
  setActiveIndex: (updater: (prev: number) => number) => void;
}

/**
 * Pure evaluation function for keyboard navigation within the search modal.
 * Handles Escape, ArrowDown, ArrowUp, and Enter with index wrap-around.
 */
export function handleModalKeyDown(
  e: { key: string; preventDefault?: () => void },
  state: ModalKeyNavigationState,
): boolean {
  if (e.key === 'Escape') {
    e.preventDefault?.();
    state.onClose();
    return true;
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault?.();
    state.setActiveIndex((prev) =>
      state.displayedItems.length > 0 ? (prev + 1) % state.displayedItems.length : -1,
    );
    return true;
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault?.();
    state.setActiveIndex((prev) =>
      state.displayedItems.length > 0
        ? (prev - 1 + state.displayedItems.length) % state.displayedItems.length
        : -1,
    );
    return true;
  }
  if (e.key === 'Enter') {
    e.preventDefault?.();
    if (state.activeIndex >= 0 && state.activeIndex < state.displayedItems.length) {
      state.onSelectItem(state.displayedItems[state.activeIndex]);
    }
    return true;
  }
  return false;
}

export const handleModalKeyNavigation = handleModalKeyDown;

export interface GlobalSearchModalProps {
  visible: boolean;
  onClose: () => void;
  query: string;
  onChangeQuery: (query: string) => void;
  activeCategory: string;
  onSelectCategory: (categoryKey: string) => void;
  categories: CategoryOption[];
  results: SearchItem[];
  quickActions: SearchItem[];
  loading: boolean;
  onSelectItem: (item: SearchItem) => void;
  error?: string | null;
}

export default function GlobalSearchModal({
  visible,
  onClose,
  query,
  onChangeQuery,
  activeCategory,
  onSelectCategory,
  categories,
  results,
  quickActions,
  loading,
  onSelectItem,
  error,
}: GlobalSearchModalProps) {
  const inputRef = useRef<TextInput | null>(null);
  const previousActiveElement = useRef<any>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const pulseAnim = useRef(new Animated.Value(0.4)).current;

  // Pulse animation for skeleton rows
  useEffect(() => {
    if (loading) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.9,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 0.4,
            duration: 600,
            useNativeDriver: true,
          }),
        ]),
      );
      loop.start();
      return () => loop.stop();
    }
  }, [loading, pulseAnim]);

  // Focus trap and restoration
  useEffect(() => {
    if (visible) {
      if (typeof document !== 'undefined') {
        previousActiveElement.current = document.activeElement;
      }
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      return () => {
        clearTimeout(timer);
        if (
          previousActiveElement.current &&
          typeof previousActiveElement.current.focus === 'function'
        ) {
          try {
            previousActiveElement.current.focus();
          } catch {
            // safe ignore if detached
          }
          previousActiveElement.current = null;
        }
      };
    } else {
      if (
        previousActiveElement.current &&
        typeof previousActiveElement.current.focus === 'function'
      ) {
        try {
          previousActiveElement.current.focus();
        } catch {
          // safe ignore
        }
        previousActiveElement.current = null;
      }
    }
  }, [visible]);

  // Sanitize query and activeCategory against non-string inputs (e.g. click events or undefined)
  const safeQuery = typeof query === 'string' ? query : '';
  const safeCategory = typeof activeCategory === 'string' ? activeCategory : 'all';
  const hasQuery = safeQuery.trim().length > 0;

  const displayedItems = useMemo(() => {
    if (!hasQuery) {
      return quickActions || [];
    }
    if (safeCategory.toLowerCase() === 'all') {
      return results || [];
    }
    return (results || []).filter(
      (r) => (r.category || '').toLowerCase() === safeCategory.toLowerCase(),
    );
  }, [hasQuery, quickActions, results, safeCategory]);

  // Reset activeIndex when displayed items change
  useEffect(() => {
    setActiveIndex(0);
  }, [displayedItems.length, safeCategory]);

  // Keyboard navigation within modal
  useEffect(() => {
    if (!visible || typeof window === 'undefined') return;

    const onKeyDown = (e: KeyboardEvent) => {
      handleModalKeyDown(e, {
        activeIndex,
        displayedItems,
        onClose,
        onSelectItem,
        setActiveIndex,
      });
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [visible, displayedItems, activeIndex, onClose, onSelectItem]);

  // Scroll active item into view on web during keyboard navigation
  useEffect(() => {
    if (typeof document === 'undefined' || !visible) return;
    if (activeIndex < 0 || activeIndex >= displayedItems.length) return;

    const activeItem = displayedItems[activeIndex];
    if (!activeItem) return;

    const scrollActiveItem = () => {
      const el = document.getElementById(`search-item-${activeItem.id}`);
      if (el && typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ block: 'nearest' });
      }
    };

    const el = document.getElementById(`search-item-${activeItem.id}`);
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest' });
    } else if (typeof requestAnimationFrame !== 'undefined') {
      const rafId = requestAnimationFrame(scrollActiveItem);
      return () => cancelAnimationFrame(rafId);
    }
  }, [activeIndex, displayedItems, visible]);

  // Result counts by category
  const resultCounts = useMemo(() => {
    const list = results || [];
    const counts: Record<string, number> = { all: list.length };
    for (const item of list) {
      const cat = item.category || 'General';
      counts[cat] = (counts[cat] || 0) + 1;
      counts[cat.toLowerCase()] = (counts[cat.toLowerCase()] || 0) + 1;
    }
    return counts;
  }, [results]);

  if (!visible) {
    return null;
  }

  return (
    <Modal
      visible={visible}
      onRequestClose={onClose}
      transparent
      animationType="fade"
      aria-label="Global Search Command Palette"
    >
      <View
        role="dialog"
        aria-modal={true}
        aria-label="Global Search Command Palette"
        style={styles.dialogOverlay}
      >
        <Pressable
          style={styles.backdropPressable}
          onPress={onClose}
          accessibilityLabel="Close search modal backdrop"
        />

        <View style={styles.dialogContainer}>
          {/* 1. Combobox Search Input Bar */}
          <View style={styles.inputHeader}>
            <Icon name="search" size={theme.sizes.iconMd} color={theme.colors.textMuted} />
            <TextInput
              ref={inputRef}
              role="combobox"
              accessibilityRole="combobox"
              aria-expanded={visible && (hasQuery || (quickActions && quickActions.length > 0))}
              aria-controls="search-results-list"
              aria-activedescendant={
                activeIndex >= 0 && displayedItems[activeIndex]
                  ? `search-item-${displayedItems[activeIndex].id}`
                  : undefined
              }
              aria-autocomplete="list"
              accessibilityLabel="Search clinic records, patients, consultations, settings"
              placeholder="Search patients, consultations, appointments, rooms, settings... (Cmd+K)"
              placeholderTextColor={theme.colors.textMuted}
              value={safeQuery}
              onChangeText={onChangeQuery}
              autoFocus={true}
              style={styles.searchInput}
            />

            {safeQuery.length > 0 ? (
              <Pressable
                onPress={() => onChangeQuery('')}
                accessibilityRole="button"
                accessibilityLabel="Clear search query"
                hitSlop={theme.spacing.xs}
                style={styles.clearButton}
              >
                <Icon name="close" size={theme.sizes.iconSm} color={theme.colors.textMuted} />
              </Pressable>
            ) : null}

            <View style={styles.escBadge}>
              <ThemedText variant="code" color={theme.colors.textSecondary}>
                ESC
              </ThemedText>
            </View>
          </View>

          {/* 2. Category Filter Tabs (when query is active) */}
          {hasQuery && categories && categories.length > 0 ? (
            <SearchCategoryTabs
              categories={categories}
              activeCategory={safeCategory}
              onSelectCategory={onSelectCategory}
              resultCounts={resultCounts}
            />
          ) : null}

          {/* 3. Dynamic UX State Renderer */}
          <View style={styles.bodyContainer}>
            {loading ? (
              // UX State 1: Skeleton Loading List
              <View style={styles.skeletonContainer}>
                {[1, 2, 3, 4, 5].map((i) => (
                  <Animated.View
                    key={i}
                    style={[styles.skeletonRow, { opacity: pulseAnim }]}
                  >
                    <View style={styles.skeletonIcon} />
                    <View style={styles.skeletonContent}>
                      <View style={styles.skeletonTitle} />
                      <View style={styles.skeletonSubtitle} />
                    </View>
                    <View style={styles.skeletonBadge} />
                  </Animated.View>
                ))}
              </View>
            ) : !hasQuery ? (
              // UX State 2: Zero-State Quick Actions
              <View style={styles.resultsWrapper}>
                <View style={styles.sectionHeader}>
                  <Icon name="zap" size={theme.sizes.iconSm} color={theme.colors.primary} />
                  <ThemedText variant="smallBold" color={theme.colors.textMuted}>
                    Quick Actions
                  </ThemedText>
                </View>
                <ScrollView
                  id="search-results-list"
                  nativeID="search-results-list"
                  {...({ role: 'listbox' } as any)}
                  aria-label="Quick Actions"
                  style={styles.resultsList}
                  keyboardShouldPersistTaps="handled"
                >
                  {quickActions.map((item, index) => (
                    <SearchResultItemRow
                      key={item.id}
                      item={item}
                      isActive={index === activeIndex}
                      onSelect={() => onSelectItem(item)}
                      onHover={() => setActiveIndex(index)}
                    />
                  ))}
                </ScrollView>
              </View>
            ) : displayedItems.length > 0 ? (
              // UX State 3: Active Results List
              <ScrollView
                id="search-results-list"
                nativeID="search-results-list"
                {...({ role: 'listbox' } as any)}
                aria-label="Search results"
                style={styles.resultsList}
                keyboardShouldPersistTaps="handled"
              >
                {displayedItems.map((item, index) => (
                  <SearchResultItemRow
                    key={item.id}
                    item={item}
                    isActive={index === activeIndex}
                    onSelect={() => onSelectItem(item)}
                    onHover={() => setActiveIndex(index)}
                  />
                ))}
              </ScrollView>
            ) : (
              // UX State 4: Empty Results Card
              <View style={styles.emptyCard}>
                <View style={styles.emptyIconCircle}>
                  <Icon name="search" size={theme.sizes.iconLg} color={theme.colors.textMuted} />
                </View>
                <ThemedText variant="bodyBold" color={theme.colors.text} style={styles.emptyTitle}>
                  {`No results found for "${safeQuery}"`}
                </ThemedText>
                <ThemedText variant="small" color={theme.colors.textMuted} style={styles.emptySubtitle}>
                  Check spelling or try searching across all categories.
                </ThemedText>
                {safeCategory.toLowerCase() !== 'all' ? (
                  <Pressable
                    onPress={() => onSelectCategory('all')}
                    style={({ pressed }) => [
                      styles.resetCategoryButton,
                      pressed && styles.buttonPressed,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Search in All Categories"
                  >
                    <ThemedText variant="smallBold" color={theme.colors.primary}>
                      Search in All Categories
                    </ThemedText>
                  </Pressable>
                ) : null}
              </View>
            )}
          </View>

          {/* 4. Footer keyboard legend and counter */}
          <View style={styles.footer}>
            <View style={styles.keyboardLegend}>
              <View style={styles.legendKey}>
                <ThemedText variant="code" color={theme.colors.textSecondary}>
                  ↑↓
                </ThemedText>
              </View>
              <ThemedText variant="caption" color={theme.colors.textMuted}>
                Navigate
              </ThemedText>
              <View style={styles.legendKey}>
                <ThemedText variant="code" color={theme.colors.textSecondary}>
                  ↵
                </ThemedText>
              </View>
              <ThemedText variant="caption" color={theme.colors.textMuted}>
                Select
              </ThemedText>
              <View style={styles.legendKey}>
                <ThemedText variant="code" color={theme.colors.textSecondary}>
                  ESC
                </ThemedText>
              </View>
              <ThemedText variant="caption" color={theme.colors.textMuted}>
                Close
              </ThemedText>
            </View>

            <ThemedText variant="caption" color={theme.colors.textMuted}>
              {`ClinicEZ Search • ${displayedItems.length} result(s)`}
            </ThemedText>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  dialogOverlay: {
    flex: 1,
    backgroundColor: theme.colors.overlay,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: theme.spacing['3xl'],
    paddingHorizontal: theme.spacing.md,
  },
  backdropPressable: {
    ...StyleSheet.absoluteFill,
  },
  dialogContainer: {
    width: '100%',
    maxWidth: 680,
    maxHeight: '85%',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.xl,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    overflow: 'hidden',
    zIndex: 1,
    ...theme.shadows.lg,
  },
  inputHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: theme.sizes.borderWidth,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  searchInput: {
    flex: 1,
    color: theme.colors.text,
    fontSize: theme.fontSizes.md,
    paddingVertical: 0,
  },
  clearButton: {
    padding: theme.spacing.xs,
  },
  escBadge: {
    paddingHorizontal: theme.spacing.xs + 2,
    paddingVertical: 2,
    borderRadius: theme.radii.xs,
    backgroundColor: theme.colors.surfaceMuted,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
  },
  bodyContainer: {
    maxHeight: 460,
    minHeight: 120,
    flexShrink: 1,
  },
  resultsWrapper: {
    flex: 1,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.xs,
  },
  resultsList: {
    flex: 1,
  },
  skeletonContainer: {
    paddingVertical: theme.spacing.xs,
  },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    borderBottomWidth: theme.sizes.borderWidth,
    borderBottomColor: theme.colors.border,
  },
  skeletonIcon: {
    width: theme.sizes.controlSm,
    height: theme.sizes.controlSm,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surfaceMuted,
  },
  skeletonContent: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  skeletonTitle: {
    width: '55%',
    height: 14,
    borderRadius: theme.radii.xs,
    backgroundColor: theme.colors.surfaceMuted,
  },
  skeletonSubtitle: {
    width: '80%',
    height: 12,
    borderRadius: theme.radii.xs,
    backgroundColor: theme.colors.surfaceSubtle,
  },
  skeletonBadge: {
    width: 50,
    height: 18,
    borderRadius: theme.radii.full,
    backgroundColor: theme.colors.surfaceMuted,
  },
  emptyCard: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing['2xl'],
    paddingHorizontal: theme.spacing.xl,
    gap: theme.spacing.sm,
  },
  emptyIconCircle: {
    width: theme.sizes.controlLg,
    height: theme.sizes.controlLg,
    borderRadius: theme.radii.full,
    backgroundColor: theme.colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.xs,
  },
  emptyTitle: {
    textAlign: 'center',
  },
  emptySubtitle: {
    textAlign: 'center',
  },
  resetCategoryButton: {
    marginTop: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs + 2,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primarySubtle,
  },
  buttonPressed: {
    opacity: 0.8,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    borderTopWidth: theme.sizes.borderWidth,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceSubtle,
  },
  keyboardLegend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs + 2,
  },
  legendKey: {
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: 1,
    borderRadius: theme.radii.xs,
    backgroundColor: theme.colors.surface,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
  },
});

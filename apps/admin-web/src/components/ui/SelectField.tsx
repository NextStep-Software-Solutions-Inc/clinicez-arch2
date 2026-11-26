import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconCheck, IconChevronDown, IconSearch } from '@tabler/icons-react';
import { Chip } from './Chip';
import { Text } from './Text';
import { cn } from './textUtils';

let nextSelectFieldInstanceId = 0;

export interface SelectFieldOption {
  value: string;
  label: string;
  description?: string;
  badge?: string;
  group?: string;
  disabled?: boolean;
}

export type SelectFieldSize = 'sm' | 'default' | 'md';

export interface SelectFieldProps {
  id?: string;
  ariaLabel?: string;
  value: string;
  onValueChange: (value: string) => void;
  options: readonly SelectFieldOption[];
  placeholder?: string;
  disabled?: boolean;
  searchable?: boolean;
  searchPlaceholder?: string;
  emptyMessage?: string;
  size?: SelectFieldSize;
  error?: boolean;
  className?: string;
  menuClassName?: string;
  align?: 'left' | 'right';
}

const TRIGGER_SIZE_CLASSES: Record<SelectFieldSize, string> = {
  sm: 'min-h-8 px-2.5 py-1 text-[11px] rounded-lg',
  default: 'min-h-9 px-3 py-2 text-xs rounded-xl',
  md: 'min-h-10 px-3.5 py-2 text-xs rounded-xl',
};

/**
 * Custom accessible Select component for Clinic EZ Governance Workstation.
 * Replaces native browser select inputs with a consistent, keyboard-navigable,
 * token-compliant combobox supporting rich option descriptions, badges, and search.
 */
export function SelectField({
  id,
  ariaLabel,
  value,
  onValueChange,
  options,
  placeholder = 'Select an option...',
  disabled = false,
  searchable,
  searchPlaceholder = 'Filter options...',
  emptyMessage = 'No matching options found.',
  size = 'default',
  error = false,
  className,
  menuClassName,
  align = 'left',
}: SelectFieldProps) {
  const instanceIdRef = useRef<string | null>(null);
  if (!instanceIdRef.current) {
    instanceIdRef.current = String(++nextSelectFieldInstanceId);
  }
  const triggerId = id ?? `select-trigger-${instanceIdRef.current}`;
  const listboxId = `select-listbox-${instanceIdRef.current}`;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const [portalStyle, setPortalStyle] = useState<{
    menuStyle: React.CSSProperties;
    listMaxHeight: number;
  } | null>(null);

  const dedupedOptions = useMemo(() => {
    const seen = new Set<string>();
    const result: SelectFieldOption[] = [];
    for (const opt of options) {
      if (seen.has(opt.value)) continue;
      seen.add(opt.value);
      result.push(opt);
    }
    return result;
  }, [options]);

  const showSearch = searchable ?? dedupedOptions.length >= 7;

  const filteredOptions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return dedupedOptions;
    return dedupedOptions.filter(
      (opt) =>
        opt.label.toLowerCase().includes(q) ||
        (opt.description && opt.description.toLowerCase().includes(q)) ||
        (opt.badge && opt.badge.toLowerCase().includes(q)) ||
        (opt.group && opt.group.toLowerCase().includes(q))
    );
  }, [dedupedOptions, searchQuery]);

  const selectedOption = useMemo(
    () => dedupedOptions.find((opt) => opt.value === value),
    [dedupedOptions, value]
  );

  const isPlaceholder = !selectedOption;

  const updatePortalPosition = useCallback(() => {
    if (
      typeof window === 'undefined' ||
      typeof document === 'undefined' ||
      !document.body ||
      !triggerRef.current ||
      typeof triggerRef.current.getBoundingClientRect !== 'function'
    ) {
      setPortalStyle(null);
      return;
    }

    const rect = triggerRef.current.getBoundingClientRect();
    const gap = 6;
    const viewportPadding = 12;
    const spaceBelow = Math.max(0, window.innerHeight - rect.bottom - gap - viewportPadding);
    const spaceAbove = Math.max(0, rect.top - gap - viewportPadding);
    const openUpward = spaceBelow < 220 && spaceAbove > spaceBelow;
    const availableVertical = openUpward ? spaceAbove : spaceBelow;
    const searchAllowance = showSearch ? 52 : 10;
    const listMaxHeight = Math.min(256, Math.max(120, availableVertical - searchAllowance));

    const menuStyle: React.CSSProperties = {
      position: 'fixed',
      minWidth: `${Math.round(rect.width)}px`,
      zIndex: 80,
      ...(openUpward
        ? { bottom: `${Math.round(window.innerHeight - rect.top + gap)}px` }
        : { top: `${Math.round(rect.bottom + gap)}px` }),
    };

    if (align === 'right') {
      menuStyle.right = `${Math.max(8, Math.round(window.innerWidth - rect.right))}px`;
      menuStyle.maxWidth = `${Math.max(160, Math.round(Math.min(rect.right - 8, window.innerWidth - 16)))}px`;
    } else {
      const clampedLeft = Math.max(8, Math.min(rect.left, window.innerWidth - rect.width - 8));
      menuStyle.left = `${Math.round(clampedLeft)}px`;
      menuStyle.maxWidth = `${Math.max(160, Math.round(window.innerWidth - clampedLeft - 8))}px`;
    }

    setPortalStyle({ menuStyle, listMaxHeight });
  }, [align, showSearch]);

  const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

  useIsomorphicLayoutEffect(() => {
    if (!open) {
      setPortalStyle(null);
      return;
    }
    updatePortalPosition();
    if (typeof window === 'undefined') return;
    const handleReposition = () => updatePortalPosition();
    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, { capture: true, passive: true });
    return () => {
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, { capture: true });
    };
  }, [open, updatePortalPosition]);

  // Close when clicking outside or pressing Escape globally
  useEffect(() => {
    if (!open || typeof document === 'undefined') return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      const insideTrigger = Boolean(containerRef.current?.contains(target));
      const insideMenu = Boolean(menuRef.current?.contains(target));
      if (!insideTrigger && !insideMenu) {
        setOpen(false);
        setSearchQuery('');
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        setOpen(false);
        setSearchQuery('');
        triggerRef.current?.focus();
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown, { capture: true });
    };
  }, [open]);

  // Reset highlight and optionally focus search input when opened
  useEffect(() => {
    if (!open) return;
    const activeIdx = filteredOptions.findIndex((o) => o.value === value && !o.disabled);
    if (activeIdx >= 0) {
      setHighlightedIndex(activeIdx);
    } else {
      const firstEnabled = filteredOptions.findIndex((o) => !o.disabled);
      setHighlightedIndex(firstEnabled);
    }
    if (showSearch) {
      setTimeout(() => searchInputRef.current?.focus(), 0);
    }
  }, [open, showSearch, filteredOptions, value]);

  // Close automatically if control becomes disabled
  useEffect(() => {
    if (disabled && open) {
      setOpen(false);
      setSearchQuery('');
    }
  }, [disabled, open]);

  const findNextEnabledIndex = (start: number, delta: 1 | -1): number => {
    if (filteredOptions.length === 0) return -1;
    let idx = start;
    for (let step = 0; step < filteredOptions.length; step++) {
      idx = (idx + delta + filteredOptions.length) % filteredOptions.length;
      if (!filteredOptions[idx].disabled) return idx;
    }
    return -1;
  };

  const selectOption = (opt: SelectFieldOption) => {
    if (opt.disabled) return;
    onValueChange(opt.value);
    setOpen(false);
    setSearchQuery('');
    triggerRef.current?.focus();
  };

  const handleTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!open) {
        setOpen(true);
      } else {
        setHighlightedIndex((prev) => findNextEnabledIndex(prev, 1));
      }
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        setOpen(true);
      } else {
        setHighlightedIndex((prev) => findNextEnabledIndex(prev < 0 ? 0 : prev, -1));
      }
    } else if (event.key === 'Home' && open) {
      event.preventDefault();
      const first = filteredOptions.findIndex((o) => !o.disabled);
      setHighlightedIndex(first);
    } else if (event.key === 'End' && open) {
      event.preventDefault();
      for (let i = filteredOptions.length - 1; i >= 0; i--) {
        if (!filteredOptions[i].disabled) {
          setHighlightedIndex(i);
          break;
        }
      }
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (!open) {
        setOpen(true);
      } else if (highlightedIndex >= 0 && filteredOptions[highlightedIndex]) {
        selectOption(filteredOptions[highlightedIndex]);
      }
    } else if (event.key === 'Escape' && open) {
      event.preventDefault();
      setOpen(false);
      setSearchQuery('');
    }
  };

  const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlightedIndex((prev) => findNextEnabledIndex(prev, 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlightedIndex((prev) => findNextEnabledIndex(prev < 0 ? 0 : prev, -1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (highlightedIndex >= 0 && filteredOptions[highlightedIndex]) {
        selectOption(filteredOptions[highlightedIndex]);
      }
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      setSearchQuery('');
      triggerRef.current?.focus();
    }
  };

  // Group options while preserving insertion order
  const groupedEntries = useMemo(() => {
    const sections: Array<{ group: string | null; items: Array<{ option: SelectFieldOption; flatIndex: number }> }> = [];
    const groupMap = new Map<string | null, number>();

    filteredOptions.forEach((option, flatIndex) => {
      const groupKey = option.group ?? null;
      const existingIdx = groupMap.get(groupKey);
      if (existingIdx !== undefined) {
        sections[existingIdx].items.push({ option, flatIndex });
      } else {
        groupMap.set(groupKey, sections.length);
        sections.push({ group: groupKey, items: [{ option, flatIndex }] });
      }
    });

    return sections;
  }, [filteredOptions]);

  return (
    <div ref={containerRef} className="relative w-full" data-slot="select">
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? listboxId : undefined}
        aria-invalid={error || undefined}
        data-slot="select-trigger"
        data-size={size}
        data-placeholder={isPlaceholder ? '' : undefined}
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          setOpen((prev) => {
            if (prev) setSearchQuery('');
            return !prev;
          });
        }}
        onKeyDown={handleTriggerKeyDown}
        className={cn(
          'w-full flex items-center justify-between gap-2 border bg-surface text-left font-medium text-text shadow-xs transition-all outline-none',
          'hover:border-primary/40 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20',
          'disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:border-border',
          open && 'border-primary ring-2 ring-primary/20',
          error ? 'border-red-500 focus-visible:border-red-500 focus-visible:ring-red-500/20' : 'border-border',
          !disabled && 'cursor-pointer',
          TRIGGER_SIZE_CLASSES[size],
          className
        )}
      >
        <span
          data-slot="select-value"
          className={cn(
            'min-w-0 flex-1 truncate flex items-center gap-2',
            isPlaceholder ? 'text-text-muted font-normal' : 'text-text'
          )}
        >
          <Text>{selectedOption ? selectedOption.label : placeholder}</Text>
          {selectedOption?.badge && (
            <Chip
              tone="neutral"
              size="custom"
              className="shrink-0 px-1.5 py-0.5 rounded-md text-[10px]"
            >
              {selectedOption.badge}
            </Chip>
          )}
        </span>
        <IconChevronDown
          className={cn(
            'h-3.5 w-3.5 shrink-0 text-text-muted transition-transform duration-150',
            open && 'rotate-180 text-primary'
          )}
        />
      </button>

      {open &&
        (() => {
          const isPortaled = Boolean(portalStyle && typeof document !== 'undefined' && document.body);
          const menuNode = (
            <div
              ref={menuRef}
              id={listboxId}
              role="listbox"
              aria-label={ariaLabel}
              data-slot="select-content"
              style={isPortaled ? portalStyle!.menuStyle : undefined}
              className={cn(
                isPortaled
                  ? 'overflow-hidden rounded-xl border border-border bg-surface shadow-lg'
                  : cn(
                      'absolute top-full mt-1.5 z-50 min-w-full w-full overflow-hidden rounded-xl border border-border bg-surface shadow-lg',
                      align === 'right' ? 'right-0' : 'left-0'
                    ),
                menuClassName
              )}
            >
              {showSearch && (
                <div className="p-2 border-b border-border bg-surface-muted/40">
                  <div className="relative">
                    <IconSearch className="h-3.5 w-3.5 text-text-muted absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      ref={searchInputRef}
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={handleSearchKeyDown}
                      placeholder={searchPlaceholder}
                      aria-label={searchPlaceholder}
                      className="w-full pl-8 pr-2.5 py-1.5 rounded-lg bg-surface border border-border text-xs text-text placeholder:text-text-muted focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/25"
                    />
                  </div>
                </div>
              )}

              <div
                className="max-h-64 overflow-y-auto p-1"
                style={isPortaled ? { maxHeight: `${portalStyle!.listMaxHeight}px` } : undefined}
              >
                {filteredOptions.length === 0 ? (
                  <div className="px-3 py-4 text-center text-xs text-text-muted">{emptyMessage}</div>
                ) : (
                  groupedEntries.map((section, sectionIdx) => (
                    <div
                      key={section.group ?? `section-${sectionIdx}`}
                      className={sectionIdx > 0 ? 'mt-1 pt-1 border-t border-border' : ''}
                    >
                      {section.group && (
                        <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-text-muted">
                          {section.group}
                        </div>
                      )}
                      {section.items.map(({ option, flatIndex }) => {
                        const isSelected = option.value === value;
                        const isHighlighted = flatIndex === highlightedIndex;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            role="option"
                            aria-selected={isSelected}
                            disabled={option.disabled}
                            onMouseEnter={() => {
                              if (!option.disabled) setHighlightedIndex(flatIndex);
                            }}
                            onClick={() => selectOption(option)}
                            className={cn(
                              'w-full flex items-start justify-between gap-2.5 px-2.5 py-2 rounded-lg text-left transition-colors',
                              option.disabled
                                ? 'opacity-45 cursor-not-allowed'
                                : 'cursor-pointer',
                              isSelected
                                ? 'bg-primary-subtle text-primary'
                                : isHighlighted
                                  ? 'bg-surface-muted text-text'
                                  : 'text-text hover:bg-surface-muted/70'
                            )}
                          >
                            <div className="min-w-0 flex-1 space-y-0.5">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <Text className={cn('text-xs', isSelected ? 'font-semibold' : 'font-medium')}>
                                  {option.label}
                                </Text>
                                {option.badge && (
                                  <Chip
                                    tone={isSelected ? 'primary' : 'neutral'}
                                    size="custom"
                                    className="shrink-0 px-1.5 py-0.5 rounded-md text-[10px]"
                                  >
                                    {option.badge}
                                  </Chip>
                                )}
                              </div>
                              {option.description && (
                                <Text as="div" className="text-[11px] text-text-muted">
                                  {option.description}
                                </Text>
                              )}
                            </div>
                            <span className="shrink-0 mt-0.5 h-4 w-4 flex items-center justify-center">
                              {isSelected && <IconCheck className="h-3.5 w-3.5 text-primary" />}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ))
                )}
              </div>
            </div>
          );
          return isPortaled ? createPortal(menuNode, document.body) : menuNode;
        })()}
    </div>
  );
}

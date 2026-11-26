import React from 'react';
import { cn, renderSingleLineChildren, resolveTooltip } from './textUtils';

export type TabFullWidthMode = 'never' | 'sm' | 'md' | 'lg' | 'xl' | 'always';

export interface TabListProps extends React.HTMLAttributes<HTMLDivElement> {
  ariaLabel?: string;
  fullWidthUntil?: TabFullWidthMode;
  variant?: 'segmented' | 'underline';
}

const LIST_WIDTH_CLASSES: Record<TabFullWidthMode, string> = {
  never: 'inline-flex w-auto max-w-full',
  sm: 'flex w-full sm:inline-flex sm:w-auto max-w-full',
  md: 'flex w-full md:inline-flex md:w-auto max-w-full',
  lg: 'flex w-full lg:inline-flex lg:w-auto max-w-full',
  xl: 'flex w-full xl:inline-flex xl:w-auto xl:shrink-0 max-w-full',
  always: 'flex w-full max-w-full',
};

const BUTTON_WIDTH_CLASSES: Record<TabFullWidthMode, string> = {
  never: 'shrink-0',
  sm: 'flex-1 sm:flex-none shrink-0',
  md: 'flex-1 md:flex-none shrink-0',
  lg: 'flex-1 lg:flex-none shrink-0',
  xl: 'flex-1 xl:flex-none shrink-0',
  always: 'flex-1 shrink-0',
};

export function TabList({
  ariaLabel,
  fullWidthUntil = 'never',
  variant = 'segmented',
  className,
  children,
  'aria-label': ariaLabelAttr,
  ...rest
}: TabListProps) {
  return (
    <div
      role="tablist"
      data-slot="tab-list"
      aria-label={ariaLabel ?? ariaLabelAttr}
      className={cn(
        'flex-nowrap items-center overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        variant === 'segmented'
          ? 'gap-1 p-1 rounded-xl bg-surface-muted border border-border'
          : 'gap-1 border-b border-border',
        LIST_WIDTH_CLASSES[fullWidthUntil],
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export interface TabButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  leadingIcon?: React.ReactNode;
  badge?: React.ReactNode;
  variant?: 'segmented' | 'underline';
  fullWidthUntil?: TabFullWidthMode;
  tooltip?: string | false;
}

export function TabButton({
  active = false,
  leadingIcon,
  badge,
  variant = 'segmented',
  fullWidthUntil = 'never',
  tooltip,
  title,
  className,
  children,
  'aria-label': ariaLabel,
  ...rest
}: TabButtonProps) {
  const resolvedTitle = resolveTooltip(title, tooltip, children, ariaLabel);

  return (
    <button
      type="button"
      role="tab"
      data-slot="tab-button"
      data-ui-tooltip={resolvedTitle}
      data-tooltip-trigger="auto"
      aria-selected={active}
      title={resolvedTitle}
      aria-label={ariaLabel}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 whitespace-nowrap min-w-0 max-w-full overflow-hidden text-xs font-semibold text-center transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed',
        variant === 'segmented'
          ? cn(
              'px-3 py-1.5 rounded-lg',
              active
                ? 'bg-surface text-text shadow-xs'
                : 'text-text-muted hover:text-text'
            )
          : cn(
              'px-3 py-2 border-b-2 -mb-px rounded-t-lg',
              active
                ? 'border-primary text-primary'
                : 'border-transparent text-text-muted hover:text-text'
            ),
        BUTTON_WIDTH_CLASSES[fullWidthUntil],
        className
      )}
      {...rest}
    >
      {leadingIcon && <span className="inline-flex items-center shrink-0">{leadingIcon}</span>}
      {renderSingleLineChildren(children)}
      {badge !== undefined && badge !== null && (
        <span className="inline-flex items-center shrink-0">{badge}</span>
      )}
    </button>
  );
}

export interface TabItem<T extends string = string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  disabled?: boolean;
  tooltip?: string;
}

export interface TabsProps<T extends string = string> {
  items: ReadonlyArray<TabItem<T>>;
  value: T;
  onValueChange: (value: T) => void;
  ariaLabel: string;
  fullWidthUntil?: TabFullWidthMode;
  variant?: 'segmented' | 'underline';
  className?: string;
  tabClassName?: string;
}

/**
 * Standardized Admin Web tab bar component.
 * Renders single-line, non-wrapping tabs with automatic hover tooltips and responsive full-width support.
 */
export function Tabs<T extends string = string>({
  items,
  value,
  onValueChange,
  ariaLabel,
  fullWidthUntil = 'never',
  variant = 'segmented',
  className,
  tabClassName,
}: TabsProps<T>) {
  return (
    <TabList
      ariaLabel={ariaLabel}
      fullWidthUntil={fullWidthUntil}
      variant={variant}
      className={className}
    >
      {items.map((item) => (
        <TabButton
          key={item.value}
          active={value === item.value}
          leadingIcon={item.icon}
          badge={item.badge}
          disabled={item.disabled}
          tooltip={item.tooltip ?? item.label}
          variant={variant}
          fullWidthUntil={fullWidthUntil}
          className={tabClassName}
          onClick={() => onValueChange(item.value)}
        >
          {item.label}
        </TabButton>
      ))}
    </TabList>
  );
}

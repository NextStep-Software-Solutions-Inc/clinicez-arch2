import React from 'react';
import { cn, renderSingleLineChildren, resolveTooltip } from './textUtils';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'outline'
  | 'ghost'
  | 'danger'
  | 'dangerSubtle'
  | 'success'
  | 'subtle'
  | 'unstyled';

export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg' | 'icon' | 'iconSm' | 'custom';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  leadingIcon?: React.ReactNode;
  trailingIcon?: React.ReactNode;
  /** Hover tooltip override; defaults to extracted single-line label text. Pass false to disable. */
  tooltip?: string | false;
  /** Set true strictly for multi-line clickable cards/tiles (KPI filter cards, command palette rows). */
  multiline?: boolean;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-primary text-white hover:bg-primary-hover shadow-xs font-semibold',
  secondary:
    'bg-surface border border-border text-text-secondary hover:bg-surface-muted hover:text-text font-medium',
  outline:
    'bg-transparent border border-border text-text hover:bg-surface-muted font-medium',
  ghost:
    'bg-transparent text-text-secondary hover:bg-surface-muted hover:text-text font-medium',
  danger:
    'bg-red-600 text-white hover:bg-red-700 shadow-xs font-semibold',
  dangerSubtle:
    'bg-red-500/10 text-red-700 dark:text-red-300 border border-red-500/20 hover:bg-red-500/20 font-semibold',
  success:
    'bg-emerald-600 text-white hover:bg-emerald-700 shadow-xs font-semibold',
  subtle:
    'bg-surface-muted text-text hover:bg-border/60 font-medium',
  unstyled: '',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  xs: 'h-7 px-2.5 rounded-lg text-[11px]',
  sm: 'h-8 px-3 rounded-lg text-xs',
  md: 'h-9 px-3.5 rounded-xl text-xs',
  lg: 'h-10 px-4 rounded-xl text-sm',
  icon: 'h-9 w-9 p-0 rounded-xl',
  iconSm: 'h-8 w-8 p-0 rounded-lg',
  custom: '',
};

/**
 * Standardized Admin Web button primitive.
 * Enforces single-line truncation (no text wrapping) and automatic hover tooltips by default.
 */
export function Button({
  variant = 'secondary',
  size = 'md',
  type = 'button',
  leadingIcon,
  trailingIcon,
  tooltip,
  multiline = false,
  title,
  className,
  children,
  'aria-label': ariaLabel,
  ...rest
}: ButtonProps) {
  const resolvedTitle = resolveTooltip(title, tooltip, children, ariaLabel);

  return (
    <button
      type={type}
      data-slot="button"
      data-ui-tooltip={resolvedTitle}
      data-tooltip-trigger={title !== undefined || typeof tooltip === 'string' ? 'always' : 'auto'}
      title={resolvedTitle}
      aria-label={ariaLabel}
      className={cn(
        multiline
          ? 'cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
          : 'inline-flex items-center justify-center gap-1.5 whitespace-nowrap min-w-0 max-w-full overflow-hidden transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className
      )}
      {...rest}
    >
      {leadingIcon && <span className="inline-flex items-center shrink-0">{leadingIcon}</span>}
      {multiline ? children : renderSingleLineChildren(children)}
      {trailingIcon && <span className="inline-flex items-center shrink-0">{trailingIcon}</span>}
    </button>
  );
}

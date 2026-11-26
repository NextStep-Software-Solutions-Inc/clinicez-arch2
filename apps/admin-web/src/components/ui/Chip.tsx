import React from 'react';
import { cn, renderSingleLineChildren, resolveTooltip } from './textUtils';

export type ChipTone =
  | 'neutral'
  | 'primary'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'purple'
  | 'unstyled';

export type ChipSize = 'xs' | 'sm' | 'md' | 'custom';

export interface ChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: ChipTone;
  size?: ChipSize;
  leadingIcon?: React.ReactNode;
  trailingIcon?: React.ReactNode;
  dot?: boolean;
  dotClassName?: string;
  /** Hover tooltip override; defaults to extracted single-line chip text. Pass false to disable. */
  tooltip?: string | false;
}

const TONE_CLASSES: Record<ChipTone, string> = {
  neutral: 'bg-surface-muted text-text-secondary border border-border',
  primary: 'bg-primary-subtle text-primary border border-primary/20',
  success:
    'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20',
  warning:
    'bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20',
  danger:
    'bg-red-500/10 text-red-700 dark:text-red-400 border border-red-500/20',
  info: 'bg-sky-500/10 text-sky-700 dark:text-sky-400 border border-sky-500/20',
  purple:
    'bg-violet-500/10 text-violet-700 dark:text-violet-400 border border-violet-500/20',
  unstyled: '',
};

const DOT_CLASSES: Record<ChipTone, string> = {
  neutral: 'bg-text-muted',
  primary: 'bg-primary',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger: 'bg-red-500',
  info: 'bg-sky-500',
  purple: 'bg-violet-500',
  unstyled: 'bg-current',
};

const SIZE_CLASSES: Record<ChipSize, string> = {
  xs: 'px-2 py-0.5 text-[10px]',
  sm: 'px-2.5 py-0.5 text-[11px]',
  md: 'px-3 py-1 text-xs',
  custom: '',
};

/**
 * Standardized Admin Web chip / badge pill primitive.
 * Always renders on a single truncated line with an automatic hover tooltip.
 */
export function Chip({
  tone = 'neutral',
  size = 'sm',
  leadingIcon,
  trailingIcon,
  dot = false,
  dotClassName,
  tooltip,
  title,
  className,
  children,
  'aria-label': ariaLabel,
  ...rest
}: ChipProps) {
  const resolvedTitle = resolveTooltip(title, tooltip, children, ariaLabel);

  return (
    <span
      data-slot="chip"
      data-ui-tooltip={resolvedTitle}
      data-tooltip-trigger="always"
      title={resolvedTitle}
      aria-label={ariaLabel}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full font-semibold whitespace-nowrap min-w-0 max-w-full overflow-hidden align-middle',
        TONE_CLASSES[tone],
        SIZE_CLASSES[size],
        className
      )}
      {...rest}
    >
      {dot && (
        <span
          aria-hidden="true"
          className={cn('h-1.5 w-1.5 rounded-full shrink-0', DOT_CLASSES[tone], dotClassName)}
        />
      )}
      {leadingIcon && <span className="inline-flex items-center shrink-0">{leadingIcon}</span>}
      {renderSingleLineChildren(children)}
      {trailingIcon && <span className="inline-flex items-center shrink-0">{trailingIcon}</span>}
    </span>
  );
}

export const Badge = Chip;
export type BadgeProps = ChipProps;

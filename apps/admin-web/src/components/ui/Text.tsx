import React from 'react';
import { cn, resolveTooltip } from './textUtils';

export type TextElement = 'span' | 'p' | 'div' | 'label' | 'h1' | 'h2' | 'h3' | 'h4';

export type TextVariant =
  | 'inherit'
  | 'label'
  | 'caption'
  | 'body'
  | 'muted'
  | 'mono'
  | 'heading';

export interface TextProps extends React.HTMLAttributes<HTMLElement> {
  as?: TextElement;
  variant?: TextVariant;
  /** Enforces single-line truncation (no wrap) and automatic hover tooltip. Defaults to true. */
  truncate?: boolean;
  /** Hover tooltip override; defaults to extracted text when truncate=true. Pass false to disable. */
  tooltip?: string | false;
  htmlFor?: string;
}

const VARIANT_CLASSES: Record<TextVariant, string> = {
  inherit: '',
  label: 'text-[11px] font-semibold text-text-secondary',
  caption: 'text-[11px] text-text-muted',
  body: 'text-xs text-text',
  muted: 'text-xs text-text-muted',
  mono: 'font-mono text-xs text-text',
  heading: 'text-sm font-bold text-text',
};

const BLOCK_ELEMENTS: ReadonlySet<TextElement> = new Set([
  'p',
  'div',
  'label',
  'h1',
  'h2',
  'h3',
  'h4',
]);

/**
 * Standardized Admin Web single-line truncated text & label primitive.
 * Automatically surfaces full text in a native hover tooltip whenever `truncate` is enabled.
 */
export function Text({
  as = 'span',
  variant = 'inherit',
  truncate = true,
  tooltip,
  title,
  htmlFor,
  className,
  children,
  'aria-label': ariaLabel,
  ...rest
}: TextProps) {
  const Component = as as React.ElementType;
  const resolvedTitle = truncate
    ? resolveTooltip(title, tooltip, children, ariaLabel)
    : title ?? (typeof tooltip === 'string' ? tooltip : undefined);

  return (
    <Component
      data-slot="text"
      data-ui-tooltip={resolvedTitle}
      data-tooltip-trigger={title !== undefined || typeof tooltip === 'string' ? 'always' : 'auto'}
      htmlFor={as === 'label' ? htmlFor : undefined}
      title={resolvedTitle}
      aria-label={ariaLabel}
      className={cn(
        VARIANT_CLASSES[variant],
        truncate &&
          (BLOCK_ELEMENTS.has(as)
            ? 'block truncate whitespace-nowrap min-w-0 max-w-full'
            : 'truncate whitespace-nowrap min-w-0 max-w-full'),
        className
      )}
      {...rest}
    >
      {children}
    </Component>
  );
}

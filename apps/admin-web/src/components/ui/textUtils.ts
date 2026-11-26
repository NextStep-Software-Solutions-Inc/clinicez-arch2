import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Recursively extracts readable plain text from a ReactNode tree for hover tooltips.
 * Skips SVG icon elements and visually hidden or decorative aria-hidden nodes.
 */
export function extractNodeText(node: React.ReactNode): string {
  const parts: string[] = [];

  const visit = (current: React.ReactNode): void => {
    if (current === null || current === undefined || typeof current === 'boolean') {
      return;
    }
    if (typeof current === 'string' || typeof current === 'number') {
      const text = String(current).trim();
      if (text) parts.push(text);
      return;
    }
    if (Array.isArray(current)) {
      for (const item of current) visit(item);
      return;
    }
    if (React.isValidElement(current)) {
      const props = current.props as Record<string, unknown> | null;
      if (!props) return;
      if (current.type === 'svg' || props['aria-hidden'] === true || props['aria-hidden'] === 'true') {
        return;
      }
      if ('children' in props) {
        visit(props.children as React.ReactNode);
      }
    }
  };

  visit(node);
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * Resolves the native hover tooltip (`title`) for single-line / truncated UI primitives.
 * Priority: explicit `title` > explicit `tooltip` (unless false) > extracted label text > `ariaLabel`.
 */
export function resolveTooltip(
  title: string | undefined,
  tooltip: string | false | undefined,
  children: React.ReactNode,
  ariaLabel?: string
): string | undefined {
  if (title !== undefined) {
    return title;
  }
  if (tooltip === false) {
    return undefined;
  }
  if (typeof tooltip === 'string' && tooltip.trim().length > 0) {
    return tooltip;
  }
  const extracted = extractNodeText(children);
  if (extracted.length > 0) {
    return extracted;
  }
  if (ariaLabel && ariaLabel.trim().length > 0) {
    return ariaLabel.trim();
  }
  return undefined;
}

/**
 * Coalesces contiguous string/number child runs inside single-line flex controls (Button, Chip, TabButton)
 * into a single `<span className="truncate min-w-0">` so labels never wrap and always truncate cleanly
 * while sibling icons stay `shrink-0`.
 */
export function renderSingleLineChildren(children: React.ReactNode): React.ReactNode {
  const items = React.Children.toArray(children);
  if (items.length === 0) return null;

  const output: React.ReactNode[] = [];
  let textRun: Array<string | number> = [];

  const flushRun = (keySeed: number) => {
    if (textRun.length === 0) return;
    const joined = textRun.join('');
    if (joined.trim().length > 0) {
      output.push(
        React.createElement(
          'span',
          { key: `sl-txt-${keySeed}`, className: 'truncate min-w-0' },
          joined
        )
      );
    }
    textRun = [];
  };

  items.forEach((child, idx) => {
    if (typeof child === 'string' || typeof child === 'number') {
      textRun.push(child);
      return;
    }

    flushRun(idx);

    if (React.isValidElement(child) && child.type === 'span') {
      const props = child.props as { className?: string; children?: React.ReactNode };
      const existing = props.className ?? '';
      const isDecorativeDot =
        existing.includes('rounded-full') &&
        !extractNodeText(props.children);
      const isFixedBadge =
        existing.includes('shrink-0') ||
        existing.includes('sr-only') ||
        isDecorativeDot;

      if (!isFixedBadge) {
        output.push(
          React.cloneElement(child as React.ReactElement<{ className?: string }>, {
            className: cn('truncate min-w-0', existing),
          })
        );
        return;
      }
    }

    output.push(child);
  });

  flushRun(items.length);
  return output;
}

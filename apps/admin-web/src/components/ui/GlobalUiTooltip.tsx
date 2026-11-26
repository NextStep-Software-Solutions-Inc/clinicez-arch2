import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface ActiveTooltip {
  text: string;
  x: number;
  y: number;
  placement: 'top' | 'bottom';
}

function isElementTruncated(el: HTMLElement): boolean {
  if (el.scrollWidth > el.clientWidth + 1) {
    return true;
  }
  const truncatedNodes = el.querySelectorAll<HTMLElement>('.truncate');
  for (let i = 0; i < truncatedNodes.length; i += 1) {
    const child = truncatedNodes[i];
    if (child.offsetWidth > 0 && child.scrollWidth > child.clientWidth + 1) {
      return true;
    }
  }
  return false;
}

function shouldDisplayTooltip(el: HTMLElement, tooltipText: string): boolean {
  const mode = el.getAttribute('data-tooltip-trigger');
  if (mode === 'always') {
    return true;
  }
  if (isElementTruncated(el)) {
    return true;
  }
  // Also show for icon-only controls or when tooltip adds context beyond visible text
  const visibleText = (el.innerText || '').replace(/\s+/g, ' ').trim();
  if (!visibleText) {
    return true;
  }
  if (visibleText.toLowerCase() !== tooltipText.trim().toLowerCase()) {
    return true;
  }
  return false;
}

function computeTooltipPosition(target: HTMLElement): Omit<ActiveTooltip, 'text'> {
  const rect = target.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const clampedX = Math.max(16, Math.min(window.innerWidth - 16, centerX));
  const placeBelow = rect.top < 44;
  return {
    x: clampedX,
    y: placeBelow ? rect.bottom + 8 : rect.top - 8,
    placement: placeBelow ? 'bottom' : 'top',
  };
}

/**
 * Single root-mounted portaled hover/focus tooltip overlay for all standardized UI primitives
 * (`Button`, `Chip`, `TabButton`, `Text`). Renders above `overflow-hidden` and scroll containers
 * with zero per-item hook overhead.
 */
export function GlobalUiTooltip() {
  const [active, setActive] = useState<ActiveTooltip | null>(null);
  const currentTargetRef = useRef<HTMLElement | null>(null);
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (typeof document === 'undefined' || typeof window === 'undefined') {
      return;
    }

    const restoreStashedTitle = (el: HTMLElement | null) => {
      if (!el) return;
      const stashed = el.getAttribute('data-stashed-title');
      if (stashed !== null) {
        el.setAttribute('title', stashed);
        el.removeAttribute('data-stashed-title');
      }
    };

    const clearPending = () => {
      if (showTimerRef.current !== null) {
        clearTimeout(showTimerRef.current);
        showTimerRef.current = null;
      }
    };

    const hideTooltip = () => {
      clearPending();
      restoreStashedTitle(currentTargetRef.current);
      currentTargetRef.current = null;
      setActive(null);
    };

    const findTooltipHost = (rawTarget: EventTarget | null): HTMLElement | null => {
      if (!(rawTarget instanceof Element)) return null;
      const explicitHost = rawTarget.closest<HTMLElement>('[data-ui-tooltip]');
      if (explicitHost) {
        const text = explicitHost.getAttribute('data-ui-tooltip')?.trim();
        if (text) return explicitHost;
      }
      // Fallback: guarantee that ANY truncated element anywhere in the DOM gets a hover tooltip
      const truncatedHost = rawTarget.closest<HTMLElement>('.truncate');
      if (truncatedHost && isElementTruncated(truncatedHost)) {
        const fallbackText = (
          truncatedHost.getAttribute('title') ||
          truncatedHost.getAttribute('data-stashed-title') ||
          truncatedHost.innerText ||
          ''
        )
          .replace(/\s+/g, ' ')
          .trim();
        if (fallbackText) return truncatedHost;
      }
      return null;
    };

    const resolveHostTooltipText = (host: HTMLElement): string => {
      const explicit = host.getAttribute('data-ui-tooltip')?.trim();
      if (explicit) return explicit;
      return (
        host.getAttribute('title') ||
        host.getAttribute('data-stashed-title') ||
        host.innerText ||
        ''
      )
        .replace(/\s+/g, ' ')
        .trim();
    };

    const activateFor = (host: HTMLElement, immediate: boolean) => {
      const text = resolveHostTooltipText(host);
      if (!text || !shouldDisplayTooltip(host, text)) {
        if (currentTargetRef.current && currentTargetRef.current !== host) {
          hideTooltip();
        }
        return;
      }

      if (currentTargetRef.current === host) {
        return;
      }

      clearPending();
      restoreStashedTitle(currentTargetRef.current);
      currentTargetRef.current = host;

      // Temporarily stash native `title` while hovered so the OS does not render a duplicate tooltip
      const nativeTitle = host.getAttribute('title');
      if (nativeTitle !== null) {
        host.setAttribute('data-stashed-title', nativeTitle);
        host.removeAttribute('title');
      }

      const show = () => {
        if (currentTargetRef.current !== host || !host.isConnected) return;
        const pos = computeTooltipPosition(host);
        setActive({ text, ...pos });
      };

      if (immediate) {
        show();
      } else {
        showTimerRef.current = setTimeout(show, 120);
      }
    };

    const onPointerOver = (event: PointerEvent) => {
      const host = findTooltipHost(event.target);
      if (!host) {
        if (currentTargetRef.current) hideTooltip();
        return;
      }
      activateFor(host, false);
    };

    const onPointerOut = (event: PointerEvent) => {
      const current = currentTargetRef.current;
      if (!current) return;
      const next = event.relatedTarget instanceof Node ? event.relatedTarget : null;
      if (next && current.contains(next)) return;
      const nextHost = findTooltipHost(event.relatedTarget);
      if (nextHost && nextHost !== current) {
        activateFor(nextHost, true);
        return;
      }
      hideTooltip();
    };

    const onFocusIn = (event: FocusEvent) => {
      const host = findTooltipHost(event.target);
      if (host) activateFor(host, false);
    };

    const onFocusOut = () => {
      hideTooltip();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        hideTooltip();
      }
    };

    document.addEventListener('pointerover', onPointerOver, true);
    document.addEventListener('pointerout', onPointerOut, true);
    document.addEventListener('focusin', onFocusIn, true);
    document.addEventListener('focusout', onFocusOut, true);
    document.addEventListener('pointerdown', hideTooltip, true);
    document.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('scroll', hideTooltip, true);
    window.addEventListener('resize', hideTooltip);

    return () => {
      hideTooltip();
      document.removeEventListener('pointerover', onPointerOver, true);
      document.removeEventListener('pointerout', onPointerOut, true);
      document.removeEventListener('focusin', onFocusIn, true);
      document.removeEventListener('focusout', onFocusOut, true);
      document.removeEventListener('pointerdown', hideTooltip, true);
      document.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('scroll', hideTooltip, true);
      window.removeEventListener('resize', hideTooltip);
    };
  }, []);

  if (!active || typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div
      role="tooltip"
      data-slot="ui-tooltip"
      style={{
        left: `${active.x}px`,
        top: `${active.y}px`,
        transform:
          active.placement === 'top' ? 'translate(-50%, -100%)' : 'translate(-50%, 0)',
      }}
      className="pointer-events-none fixed z-[100] max-w-xs px-2.5 py-1.5 rounded-lg bg-text text-surface text-[11px] font-medium leading-snug shadow-lg break-words"
    >
      {active.text}
    </div>,
    document.body
  );
}

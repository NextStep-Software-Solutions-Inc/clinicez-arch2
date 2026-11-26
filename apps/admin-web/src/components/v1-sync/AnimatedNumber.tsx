import React, { useEffect, useRef, useState } from 'react';

export interface UseAnimatedNumberOptions {
  /** Animation duration in milliseconds. Defaults to 450ms so counts keep pace with live polling. */
  durationMs?: number;
  /** When true, animates from 0 to the initial positive value on first browser mount. */
  animateOnMount?: boolean;
}

export interface AnimatedNumberProps extends UseAnimatedNumberOptions {
  value: number;
  /** Custom formatter for the interpolated numeric value. Defaults to rounded locale integer. */
  format?: (value: number) => string;
  /** Optional prefix rendered immediately before the formatted value (e.g. "+"). */
  prefix?: string;
  /** Optional suffix rendered immediately after the formatted value (e.g. "%"). */
  suffix?: string;
}

function defaultFormat(value: number): string {
  return Math.round(value).toLocaleString();
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function canAnimateInBrowser(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.requestAnimationFrame === 'function' &&
    typeof performance !== 'undefined' &&
    !prefersReducedMotion()
  );
}

/**
 * Smoothly interpolates numeric transitions using requestAnimationFrame with cubic ease-out.
 * Retargets seamlessly from the live displayed number when rapid polling ticks arrive,
 * returns the exact target synchronously during SSR/non-browser tests, and respects reduced motion.
 */
export function useAnimatedNumber(
  value: number,
  options: UseAnimatedNumberOptions = {}
): number {
  const { durationMs = 450, animateOnMount = false } = options;
  const safeTarget = Number.isFinite(value) ? value : 0;
  const initialValue =
    animateOnMount && canAnimateInBrowser() && safeTarget > 0 ? 0 : safeTarget;
  const [displayValue, setDisplayValue] = useState<number>(initialValue);
  const currentRef = useRef<number>(initialValue);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!canAnimateInBrowser() || durationMs <= 0) {
      currentRef.current = safeTarget;
      setDisplayValue(safeTarget);
      return;
    }

    const from = currentRef.current;
    const delta = safeTarget - from;

    if (Math.abs(delta) < 1e-6) {
      currentRef.current = safeTarget;
      setDisplayValue(safeTarget);
      return;
    }

    const startTime = performance.now();

    const step = (now: number) => {
      const elapsed = Math.max(0, now - startTime);
      const progress = Math.min(1, elapsed / durationMs);
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = progress >= 1 ? safeTarget : from + delta * eased;

      currentRef.current = next;
      setDisplayValue(next);

      if (progress < 1) {
        rafRef.current = window.requestAnimationFrame(step);
      } else {
        rafRef.current = null;
      }
    };

    rafRef.current = window.requestAnimationFrame(step);

    return () => {
      if (rafRef.current !== null && typeof window !== 'undefined') {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [safeTarget, durationMs]);

  return displayValue;
}

export function AnimatedNumber({
  value,
  format = defaultFormat,
  durationMs = 450,
  animateOnMount = false,
  prefix = '',
  suffix = '',
}: AnimatedNumberProps) {
  const animatedValue = useAnimatedNumber(value, { durationMs, animateOnMount });
  return (
    <>
      {prefix}
      {format(animatedValue)}
      {suffix}
    </>
  );
}

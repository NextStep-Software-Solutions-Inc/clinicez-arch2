import React, { useEffect, useRef, useState } from 'react';
import { isLiveWebDom } from '@clinicez/design-tokens';
import { resolveWebShadows } from './shadows';

export interface WebOverlayTooltipProps {
  label: string;
  placement?: 'top' | 'bottom';
  className?: string;
  children: React.ReactNode;
}

export const OverlayTooltip: React.FC<WebOverlayTooltipProps> = ({
  label,
  placement = 'top',
  className = '',
  children
}) => {
  const [hovered, setHovered] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [anchorNode, setAnchorNode] = useState<HTMLElement | null>(null);

  const canPortalToBody = Boolean(
    isLiveWebDom &&
      typeof document !== 'undefined' &&
      document.body &&
      anchorNode &&
      typeof anchorNode.getBoundingClientRect === 'function'
  );

  const captureAnchorAndShow = (event?: React.SyntheticEvent<HTMLDivElement>) => {
    const candidate =
      (event?.currentTarget && typeof event.currentTarget.getBoundingClientRect === 'function'
        ? event.currentTarget
        : null) ??
      (wrapperRef.current && typeof wrapperRef.current.getBoundingClientRect === 'function'
        ? wrapperRef.current
        : null);
    if (candidate) {
      setAnchorNode(candidate);
    }
    setHovered(true);
  };

  useEffect(() => {
    if (!hovered || !label || !canPortalToBody || !anchorNode || typeof document === 'undefined') {
      return undefined;
    }

    const tipEl = document.createElement('div');
    tipEl.setAttribute('role', 'tooltip');
    tipEl.setAttribute('data-overlay-tooltip', 'true');
    tipEl.textContent = label;

    Object.assign(tipEl.style, {
      position: 'fixed',
      top: '0px',
      left: '0px',
      zIndex: '2147483647',
      pointerEvents: 'none',
      whiteSpace: 'nowrap',
      visibility: 'hidden',
      backgroundColor: '#0F172A',
      color: '#FFFFFF',
      border: '1px solid #334155',
      borderRadius: '6px',
      padding: '4px 10px',
      fontSize: '11px',
      fontWeight: '600',
      lineHeight: '16px',
      boxShadow: resolveWebShadows().lg,
      maxWidth: 'calc(100vw - 16px)',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    });

    document.body.appendChild(tipEl);

    const updatePosition = () => {
      if (!anchorNode.isConnected) {
        tipEl.style.visibility = 'hidden';
        return;
      }
      const rect = anchorNode.getBoundingClientRect();
      const tipRect = tipEl.getBoundingClientRect();
      const margin = 8;
      const gap = 6;
      const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
      const vh = typeof window !== 'undefined' ? window.innerHeight : 800;

      const rawLeft = rect.left + rect.width / 2 - tipRect.width / 2;
      const left = Math.max(margin, Math.min(rawLeft, vw - tipRect.width - margin));

      let top =
        placement === 'bottom'
          ? rect.bottom + gap
          : rect.top - tipRect.height - gap;

      if (placement === 'bottom' && top + tipRect.height > vh - margin && rect.top - tipRect.height - gap >= margin) {
        top = rect.top - tipRect.height - gap;
      } else if (placement === 'top' && top < margin && rect.bottom + tipRect.height + gap <= vh - margin) {
        top = rect.bottom + gap;
      }
      top = Math.max(margin, Math.min(top, vh - tipRect.height - margin));

      tipEl.style.left = `${Math.round(left)}px`;
      tipEl.style.top = `${Math.round(top)}px`;
      tipEl.style.visibility = 'visible';
    };

    updatePosition();
    if (typeof window !== 'undefined') {
      window.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('scroll', updatePosition, true);
        window.removeEventListener('resize', updatePosition);
      }
      tipEl.remove();
    };
  }, [anchorNode, canPortalToBody, hovered, label, placement]);

  return (
    <div
      ref={wrapperRef}
      className={`relative inline-flex items-center justify-center ${className}`.trim()}
      onMouseEnter={captureAnchorAndShow}
      onMouseLeave={() => setHovered(false)}
      onFocus={captureAnchorAndShow}
      onBlur={() => setHovered(false)}
    >
      {children}
      {hovered && label && !canPortalToBody ? (
        <span
          role="tooltip"
          className={`pointer-events-none absolute left-1/2 -translate-x-1/2 whitespace-nowrap z-[999999] px-2.5 py-1 rounded bg-slate-900 text-white text-[11px] font-semibold shadow-lg border border-slate-700 ${
            placement === 'bottom' ? 'top-full mt-2' : 'bottom-full mb-2'
          }`}
          style={{ boxShadow: resolveWebShadows().lg }}
        >
          {label}
        </span>
      ) : null}
    </div>
  );
};

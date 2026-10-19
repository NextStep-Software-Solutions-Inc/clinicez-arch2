import { useEffect } from 'react';

export interface WorkstationShortcutHandlers {
  onNavigate?: (route: string) => void;
  onPrint?: () => void;
  onToggleSidebar?: () => void;
  onOpenSearch?: () => void;
}

export const ROUTE_MAP: Record<string, string> = {
  '1': 'Dashboard',
  '2': 'Patients',
  '3': 'Consultations',
  '4': 'Appointments',
  '5': 'Billing',
  '6': 'Yakap',
  '7': 'Settings',
};

export const WORKSTATION_ROUTE_MAP = ROUTE_MAP;

/**
 * Pure evaluation function for workstation keyboard shortcuts.
 * Evaluates simulated or native keyboard events against configured handlers.
 * Returns true if a shortcut was intercepted and handled, false otherwise.
 */
export function handleWorkstationKeyDown(
  event: {
    key: string;
    metaKey?: boolean;
    ctrlKey?: boolean;
    altKey?: boolean;
    target?: EventTarget | { tagName?: string; isContentEditable?: boolean } | null;
    preventDefault?: () => void;
  },
  handlers: WorkstationShortcutHandlers,
): boolean {
  // Cmd + K (Mac) or Ctrl + K (Windows/Linux): Global Search Command Palette (active even in inputs)
  if ((event.metaKey || event.ctrlKey) && (event.key === 'k' || event.key === 'K')) {
    if (handlers.onOpenSearch) {
      event.preventDefault?.();
      handlers.onOpenSearch();
      return true;
    }
  }

  // Ignore standard single-key shortcuts if user is currently typing inside an input, textarea, or select
  const target = event.target as HTMLElement | null;
  const isInput = Boolean(
    target &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable),
  );

  // / (forward slash) outside input fields: Quick Search Trigger
  if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey && !isInput) {
    if (handlers.onOpenSearch) {
      event.preventDefault?.();
      handlers.onOpenSearch();
      return true;
    }
  }

  // Ctrl + B or Cmd + B, or Alt + S: Toggle Sidebar Mode
  if (
    ((event.ctrlKey || event.metaKey) && (event.key === 'b' || event.key === 'B')) ||
    (event.altKey && !event.ctrlKey && !event.metaKey && (event.key === 's' || event.key === 'S'))
  ) {
    if (handlers.onToggleSidebar) {
      event.preventDefault?.();
      handlers.onToggleSidebar();
      return true;
    }
  }

  // Alt + Number (1-7): Quick Switch Module
  if (event.altKey && !event.ctrlKey && !event.metaKey && ROUTE_MAP[event.key]) {
    event.preventDefault?.();
    handlers.onNavigate?.(ROUTE_MAP[event.key]);
    return true;
  }

  // Ctrl + P or Cmd + P: Trigger Print Slip / Receipt
  if ((event.ctrlKey || event.metaKey) && (event.key === 'p' || event.key === 'P')) {
    if (handlers.onPrint) {
      event.preventDefault?.();
      handlers.onPrint();
      return true;
    }
  }

  return false;
}

export function useWorkstationShortcuts(handlers: WorkstationShortcutHandlers) {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleKeyDown = (event: KeyboardEvent) => {
      handleWorkstationKeyDown(event, handlers);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handlers.onNavigate, handlers.onPrint, handlers.onToggleSidebar, handlers.onOpenSearch]);
}

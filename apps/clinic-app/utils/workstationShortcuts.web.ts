import { useEffect } from 'react';

export interface WorkstationShortcutHandlers {
  onNavigate?: (route: string) => void;
  onPrint?: () => void;
}

const ROUTE_MAP: Record<string, string> = {
  '1': 'Dashboard',
  '2': 'Patients',
  '3': 'Consultations',
  '4': 'Appointments',
  '5': 'Billing',
  '6': 'Yakap',
  '7': 'Settings',
};

export function useWorkstationShortcuts(handlers: WorkstationShortcutHandlers) {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleKeyDown = (event: KeyboardEvent) => {
      // Ignore shortcut if user is currently typing inside an input or textarea
      const target = event.target as HTMLElement | null;
      const isInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);

      // Alt + Number (1-7): Quick Switch Module
      if (event.altKey && !event.ctrlKey && !event.metaKey && ROUTE_MAP[event.key]) {
        event.preventDefault();
        handlers.onNavigate?.(ROUTE_MAP[event.key]);
        return;
      }

      // Ctrl + P or Cmd + P: Trigger Print Slip / Receipt
      if ((event.ctrlKey || event.metaKey) && (event.key === 'p' || event.key === 'P')) {
        if (handlers.onPrint) {
          event.preventDefault();
          handlers.onPrint();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handlers.onNavigate, handlers.onPrint]);
}

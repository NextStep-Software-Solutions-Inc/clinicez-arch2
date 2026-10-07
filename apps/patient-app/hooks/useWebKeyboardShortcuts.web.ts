import { useEffect, useRef } from 'react';
import { WEB_PRIMARY_NAV, WEB_SECONDARY_NAV, navigateToSection } from '../navigation/webSections';

/**
 * Desktop keyboard navigation for the web shell: press `g` then a letter to jump
 * (g h = Home, g a = Appointments, g f = Files, g p = Profile, g n = Notifications, g s = Settings).
 * Ignored while typing in inputs and when modifier keys are held.
 */
export function useWebKeyboardShortcuts(navigation: { navigate: (...args: any[]) => void }) {
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const armed = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const items = [...WEB_PRIMARY_NAV, ...WEB_SECONDARY_NAV];

    const disarm = () => {
      armed.current = false;
      if (pending.current) clearTimeout(pending.current);
      pending.current = null;
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) return;

      const key = event.key.toLowerCase();
      if (!armed.current) {
        if (key === 'g') {
          armed.current = true;
          pending.current = setTimeout(disarm, 1200);
        }
        return;
      }
      const match = items.find((item) => item.shortcut?.toLowerCase() === key);
      disarm();
      if (match) {
        event.preventDefault();
        navigateToSection(navigation, match.key);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      disarm();
    };
  }, [navigation]);
}

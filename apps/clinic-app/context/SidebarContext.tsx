import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useWindowDimensions } from 'react-native';
import { theme } from '../constants/theme';
import { getDeviceItem, setDeviceItem } from '../utils/deviceStorage';

export type SidebarMode = 'open' | 'icon' | 'close';

export const SIDEBAR_MODE_STORAGE_KEY = 'clinicez_workstation_sidebar_mode';

export interface SidebarContextValue {
  mode: SidebarMode;
  isOpen: boolean;
  isIcon: boolean;
  isClosed: boolean;
  setMode: (mode: SidebarMode) => void;
  toggleMode: () => void;
  cycleMode: () => void;
  openSidebar: () => void;
  collapseToIcon: () => void;
  closeSidebar: () => void;
}

const DEFAULT_SIDEBAR_CONTEXT: SidebarContextValue = {
  mode: 'open',
  isOpen: true,
  isIcon: false,
  isClosed: false,
  setMode: () => {},
  toggleMode: () => {},
  cycleMode: () => {},
  openSidebar: () => {},
  collapseToIcon: () => {},
  closeSidebar: () => {},
};

const SidebarContext = createContext<SidebarContextValue>(DEFAULT_SIDEBAR_CONTEXT);

export const useSidebar = () => useContext(SidebarContext);

function isValidMode(val: any): val is SidebarMode {
  return val === 'open' || val === 'icon' || val === 'close';
}

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const { width } = useWindowDimensions();

  const [mode, setModeState] = useState<SidebarMode>(() => {
    const saved = getDeviceItem(SIDEBAR_MODE_STORAGE_KEY);
    if (isValidMode(saved)) {
      return saved;
    }
    // Default: tablet (<1024px) starts with compact icon rail, desktop (>=1024px) starts open
    return width < theme.breakpoints.desktop ? 'icon' : 'open';
  });

  const setMode = useCallback((newMode: SidebarMode) => {
    setModeState(newMode);
    setDeviceItem(SIDEBAR_MODE_STORAGE_KEY, newMode);
  }, []);

  const cycleMode = useCallback(() => {
    let next: SidebarMode;
    if (mode === 'open') next = 'icon';
    else if (mode === 'icon') next = 'close';
    else next = 'open';
    setMode(next);
  }, [mode, setMode]);

  const toggleMode = cycleMode;

  const openSidebar = useCallback(() => setMode('open'), [setMode]);
  const collapseToIcon = useCallback(() => setMode('icon'), [setMode]);
  const closeSidebar = useCallback(() => setMode('close'), [setMode]);

  const value = useMemo<SidebarContextValue>(
    () => ({
      mode,
      isOpen: mode === 'open',
      isIcon: mode === 'icon',
      isClosed: mode === 'close',
      setMode,
      toggleMode,
      cycleMode,
      openSidebar,
      collapseToIcon,
      closeSidebar,
    }),
    [mode, setMode, toggleMode, cycleMode, openSidebar, collapseToIcon, closeSidebar],
  );

  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>;
}

export default SidebarContext;

import React, { createContext, useContext, useState, useMemo, ReactNode } from 'react';
import { getDeviceItem, setDeviceItem } from '../utils/deviceStorage';

export type UiDensity = 'ultraCompact' | 'compact' | 'standard';

export interface UiDensityOption {
  density: UiDensity;
  multiplier: number;
  label: string;
  description: string;
  sidebarWidth: number;
  headerHeight: number;
  cardPadding: number;
}

export const UI_DENSITY_OPTIONS: UiDensityOption[] = [
  {
    density: 'ultraCompact',
    multiplier: 0.7,
    label: 'Ultra Compact (High Density)',
    description: 'Minimal whitespace and compact controls. Ideal for smaller tablets to fit multiple patients on screen.',
    sidebarWidth: 190,
    headerHeight: 46,
    cardPadding: 10,
  },
  {
    density: 'compact',
    multiplier: 0.85,
    label: 'Compact (Tablet Workstation)',
    description: 'Balanced reduction in padding, card sizes, and controls tailored for 10" tablets.',
    sidebarWidth: 220,
    headerHeight: 52,
    cardPadding: 12,
  },
  {
    density: 'standard',
    multiplier: 1.0,
    label: 'Standard (Desktop)',
    description: 'Default spacious layout designed for large desktop monitors (1080p+).',
    sidebarWidth: 260,
    headerHeight: 64,
    cardPadding: 16,
  },
];

const STORAGE_KEY = 'clinicez.uiDensity';

export interface UiDensityContextValue {
  density: UiDensity;
  multiplier: number;
  sidebarWidth: number;
  headerHeight: number;
  cardPadding: number;
  setDensity: (density: UiDensity) => void;
}

const DEFAULT_VALUE: UiDensityContextValue = {
  density: 'standard',
  multiplier: 1.0,
  sidebarWidth: 260,
  headerHeight: 64,
  cardPadding: 16,
  setDensity: () => {},
};

const UiDensityContext = createContext<UiDensityContextValue>(DEFAULT_VALUE);

export function UiDensityProvider({ children }: { children: ReactNode }) {
  const [density, setDensityState] = useState<UiDensity>(() => {
    try {
      const stored = getDeviceItem(STORAGE_KEY);
      if (stored === 'ultraCompact' || stored === 'compact' || stored === 'standard') {
        return stored;
      }
    } catch {
      // fallback
    }
    return 'standard';
  });

  const setDensity = (next: UiDensity) => {
    setDensityState(next);
    try {
      setDeviceItem(STORAGE_KEY, next);
    } catch {
      // ignore
    }
  };

  const option = UI_DENSITY_OPTIONS.find((o) => o.density === density) ?? UI_DENSITY_OPTIONS[2];

  const value = useMemo(
    () => ({
      density,
      multiplier: option.multiplier,
      sidebarWidth: option.sidebarWidth,
      headerHeight: option.headerHeight,
      cardPadding: option.cardPadding,
      setDensity,
    }),
    [density, option]
  );

  return <UiDensityContext.Provider value={value}>{children}</UiDensityContext.Provider>;
}

export function useUiDensity(): UiDensityContextValue {
  return useContext(UiDensityContext);
}

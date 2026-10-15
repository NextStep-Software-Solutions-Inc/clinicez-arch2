import React, { createContext, useContext, useState, useEffect, useMemo, ReactNode } from 'react';
import { getDeviceItem, setDeviceItem } from '../utils/deviceStorage';

export type TextScalePreset = 'compact' | 'standard' | 'large' | 'xlarge';

export interface TextScaleOption {
  preset: TextScalePreset;
  scale: number;
  label: string;
  description: string;
}

export const TEXT_SCALE_OPTIONS: TextScaleOption[] = [
  {
    preset: 'compact',
    scale: 0.85,
    label: 'Compact (85%)',
    description: 'Best for tablets with large default system text',
  },
  {
    preset: 'standard',
    scale: 1.0,
    label: 'Standard (100%)',
    description: 'Default clinical workstation typography',
  },
  {
    preset: 'large',
    scale: 1.15,
    label: 'Large (115%)',
    description: 'Enhanced readability for comfortable viewing',
  },
  {
    preset: 'xlarge',
    scale: 1.3,
    label: 'Extra Large (130%)',
    description: 'Maximum magnification for high accessibility',
  },
];

const STORAGE_KEY = 'clinicez.textScalePreset';

interface TextScaleContextValue {
  preset: TextScalePreset;
  scale: number;
  setPreset: (preset: TextScalePreset) => void;
  setScale: (scale: number) => void;
}

const DEFAULT_VALUE: TextScaleContextValue = {
  preset: 'standard',
  scale: 1.0,
  setPreset: () => {},
  setScale: () => {},
};

const TextScaleContext = createContext<TextScaleContextValue>(DEFAULT_VALUE);

export function TextScaleProvider({ children }: { children: ReactNode }) {
  const [preset, setPresetState] = useState<TextScalePreset>(() => {
    try {
      const stored = getDeviceItem(STORAGE_KEY);
      if (stored && (stored === 'compact' || stored === 'standard' || stored === 'large' || stored === 'xlarge')) {
        return stored as TextScalePreset;
      }
    } catch {
      // fallback
    }
    return 'standard';
  });

  const [customScale, setCustomScale] = useState<number | null>(null);

  const activeScale = useMemo(() => {
    if (customScale !== null) return customScale;
    const found = TEXT_SCALE_OPTIONS.find((o) => o.preset === preset);
    return found ? found.scale : 1.0;
  }, [preset, customScale]);

  const setPreset = (next: TextScalePreset) => {
    setPresetState(next);
    setCustomScale(null);
    try {
      setDeviceItem(STORAGE_KEY, next);
    } catch {
      // ignore
    }
  };

  const setScale = (scale: number) => {
    setCustomScale(scale);
  };

  const value = useMemo(
    () => ({
      preset,
      scale: activeScale,
      setPreset,
      setScale,
    }),
    [preset, activeScale]
  );

  return <TextScaleContext.Provider value={value}>{children}</TextScaleContext.Provider>;
}

export function useTextScale(): TextScaleContextValue {
  return useContext(TextScaleContext);
}

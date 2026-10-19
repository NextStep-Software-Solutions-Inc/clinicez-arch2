import React, { createContext, useContext, useState, useMemo, ReactNode } from 'react';
import { getDeviceItem, setDeviceItem } from '../utils/deviceStorage';

export type TextScalePreset = 'micro' | 'tiny' | 'compact' | 'standard' | 'large' | 'xlarge' | 'custom';

export interface TextScaleOption {
  preset: TextScalePreset;
  scale: number;
  label: string;
  description: string;
}

export const TEXT_SCALE_OPTIONS: TextScaleOption[] = [
  {
    preset: 'micro',
    scale: 0.6,
    label: 'Ultra Compact (60%)',
    description: 'Minimum text size for high-density tablet workstation layouts',
  },
  {
    preset: 'tiny',
    scale: 0.7,
    label: 'Extra Compact (70%)',
    description: 'Significantly smaller text to maximize visible data and charts',
  },
  {
    preset: 'compact',
    scale: 0.85,
    label: 'Compact (85%)',
    description: 'Moderate reduction, balanced for tablets and compact screens',
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

export const MIN_TEXT_SCALE = 0.6;
export const MAX_TEXT_SCALE = 1.3;

const PRESET_STORAGE_KEY = 'clinicez.textScalePreset';
const VALUE_STORAGE_KEY = 'clinicez.textScaleValue';

interface TextScaleContextValue {
  preset: TextScalePreset;
  scale: number;
  setPreset: (preset: TextScalePreset) => void;
  setScale: (scale: number) => void;
  stepDown: () => void;
  stepUp: () => void;
}

const DEFAULT_VALUE: TextScaleContextValue = {
  preset: 'standard',
  scale: 1.0,
  setPreset: () => {},
  setScale: () => {},
  stepDown: () => {},
  stepUp: () => {},
};

const TextScaleContext = createContext<TextScaleContextValue>(DEFAULT_VALUE);

export function TextScaleProvider({ children }: { children: ReactNode }) {
  const [scale, setScaleState] = useState<number>(() => {
    try {
      const storedVal = getDeviceItem(VALUE_STORAGE_KEY);
      if (storedVal) {
        const parsed = parseFloat(storedVal);
        if (!isNaN(parsed) && parsed >= MIN_TEXT_SCALE && parsed <= MAX_TEXT_SCALE) {
          return parsed;
        }
      }
      const storedPreset = getDeviceItem(PRESET_STORAGE_KEY);
      if (storedPreset) {
        const match = TEXT_SCALE_OPTIONS.find((o) => o.preset === storedPreset);
        if (match) return match.scale;
      }
    } catch {
      // fallback
    }
    return 1.0;
  });

  const [preset, setPresetState] = useState<TextScalePreset>(() => {
    try {
      const storedPreset = getDeviceItem(PRESET_STORAGE_KEY);
      if (storedPreset && TEXT_SCALE_OPTIONS.some((o) => o.preset === storedPreset)) {
        return storedPreset as TextScalePreset;
      }
    } catch {
      // fallback
    }
    return 'standard';
  });

  const setPreset = (next: TextScalePreset) => {
    const match = TEXT_SCALE_OPTIONS.find((o) => o.preset === next);
    const newScale = match ? match.scale : 1.0;
    setPresetState(next);
    setScaleState(newScale);
    try {
      setDeviceItem(PRESET_STORAGE_KEY, next);
      setDeviceItem(VALUE_STORAGE_KEY, String(newScale));
    } catch {
      // ignore
    }
  };

  const setScale = (newScale: number) => {
    const clamped = Math.max(MIN_TEXT_SCALE, Math.min(MAX_TEXT_SCALE, Math.round(newScale * 100) / 100));
    setScaleState(clamped);
    const match = TEXT_SCALE_OPTIONS.find((o) => Math.abs(o.scale - clamped) < 0.01);
    const nextPreset = match ? match.preset : 'custom';
    setPresetState(nextPreset);
    try {
      setDeviceItem(PRESET_STORAGE_KEY, nextPreset);
      setDeviceItem(VALUE_STORAGE_KEY, String(clamped));
    } catch {
      // ignore
    }
  };

  const stepDown = () => {
    setScale(scale - 0.05);
  };

  const stepUp = () => {
    setScale(scale + 0.05);
  };

  const value = useMemo(
    () => ({
      preset,
      scale,
      setPreset,
      setScale,
      stepDown,
      stepUp,
    }),
    [preset, scale]
  );

  return <TextScaleContext.Provider value={value}>{children}</TextScaleContext.Provider>;
}

export function useTextScale(): TextScaleContextValue {
  return useContext(TextScaleContext);
}

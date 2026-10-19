import { describe, expect, test } from 'bun:test';
import { darkColors, lightColors, colorSchemes } from './semantic';
import { typography } from './typography';
import { fontSizeScale } from './scales';

function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

describe('design tokens', () => {
  test('light and dark define the same keys', () => {
    expect(Object.keys(darkColors).sort()).toEqual(Object.keys(lightColors).sort());
  });

  test('every colour is a hex, rgba() or transparent', () => {
    for (const scheme of Object.values(colorSchemes)) {
      for (const value of Object.values(scheme)) {
        expect(value).toMatch(/^(#[0-9A-Fa-f]{6}|rgba\(.+\)|transparent)$/);
      }
    }
  });

  const pairs: [string, string, number][] = [
    ['text', 'background', 4.5],
    ['text', 'surface', 4.5],
    ['textSecondary', 'surface', 4.5],
    ['textMuted', 'surface', 4.5],
    ['onPrimary', 'primary', 4.5],
    ['primaryText', 'primaryLight', 4.5],
    ['emergencyText', 'emergencyBg', 4.5],
    ['urgentText', 'urgentBg', 4.5],
    ['successText', 'successBg', 4.5],
    ['warningText', 'warningBg', 4.5],
    ['infoText', 'infoBg', 4.5],
    ['purpleText', 'purpleBg', 4.5],
  ];

  for (const scheme of ['light', 'dark'] as const) {
    for (const [fg, bg, min] of pairs) {
      test(`${scheme}: ${fg} on ${bg} >= ${min}:1`, () => {
        const c = colorSchemes[scheme] as Record<string, string>;
        expect(contrast(c[fg], c[bg])).toBeGreaterThanOrEqual(min);
      });
    }
  }

  test('typography never goes below 12px', () => {
    for (const style of Object.values(typography)) {
      expect(style.fontSize).toBeGreaterThanOrEqual(fontSizeScale.xs);
    }
  });
});

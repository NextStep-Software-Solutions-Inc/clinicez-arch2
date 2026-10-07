import { fontSizeScale } from './scales';
import { fontFamilies } from './scales';

export type TypographyStyle = {
  fontSize: number;
  fontWeight: '400' | '500' | '600' | '700';
  lineHeight: number;
  letterSpacing?: number;
  fontFamily?: string;
};

export const typography = {
  display: { fontSize: fontSizeScale['4xl'], fontWeight: '700', lineHeight: 44, letterSpacing: -0.6 },
  h1: { fontSize: fontSizeScale['3xl'], fontWeight: '700', lineHeight: 36, letterSpacing: -0.4 },
  h2: { fontSize: fontSizeScale['2xl'], fontWeight: '600', lineHeight: 30, letterSpacing: -0.2 },
  title: { fontSize: fontSizeScale.xl, fontWeight: '600', lineHeight: 26 },
  h3: { fontSize: fontSizeScale.lg, fontWeight: '600', lineHeight: 24 },
  bodyLarge: { fontSize: fontSizeScale.lg, fontWeight: '400', lineHeight: 24 },
  body: { fontSize: fontSizeScale.md, fontWeight: '400', lineHeight: 20 },
  bodyBold: { fontSize: fontSizeScale.md, fontWeight: '600', lineHeight: 20 },
  small: { fontSize: fontSizeScale.sm, fontWeight: '400', lineHeight: 18 },
  smallBold: { fontSize: fontSizeScale.sm, fontWeight: '600', lineHeight: 18 },
  caption: { fontSize: fontSizeScale.xs, fontWeight: '400', lineHeight: 16 },
  captionBold: { fontSize: fontSizeScale.xs, fontWeight: '600', lineHeight: 16 },
  badge: { fontSize: fontSizeScale.xs, fontWeight: '600', lineHeight: 16, letterSpacing: 0.2 },
  code: {
    fontSize: fontSizeScale.xs,
    fontWeight: '500',
    lineHeight: 16,
    fontFamily: fontFamilies.mono['500'],
  },
} as const satisfies Record<string, TypographyStyle>;

export type TypographyVariant = keyof typeof typography;

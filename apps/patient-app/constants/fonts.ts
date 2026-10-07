import { Platform, StyleSheet, type StyleProp, type TextStyle } from 'react-native';
import { Geist_400Regular } from '@expo-google-fonts/geist/400Regular';
import { Geist_500Medium } from '@expo-google-fonts/geist/500Medium';
import { Geist_600SemiBold } from '@expo-google-fonts/geist/600SemiBold';
import { Geist_700Bold } from '@expo-google-fonts/geist/700Bold';
import { GeistMono_400Regular } from '@expo-google-fonts/geist-mono/400Regular';
import { GeistMono_500Medium } from '@expo-google-fonts/geist-mono/500Medium';
import { GeistMono_600SemiBold } from '@expo-google-fonts/geist-mono/600SemiBold';
import { GeistMono_700Bold } from '@expo-google-fonts/geist-mono/700Bold';
import { fontFamilies } from '@clinicez/design-tokens';

/** Font files handed to `useFonts` at app start. Keys must match `fontFamilies`. */
export const fontAssets = {
  Geist_400Regular,
  Geist_500Medium,
  Geist_600SemiBold,
  Geist_700Bold,
  GeistMono_400Regular,
  GeistMono_500Medium,
  GeistMono_600SemiBold,
  GeistMono_700Bold,
};

type Weight = '400' | '500' | '600' | '700';

/**
 * When the font files fail to load we must NOT point text at the missing families
 * (web would fall back to a serif font). The app flips this off on load error.
 */
let customFontsAvailable = true;
export function setCustomFontsAvailable(available: boolean) {
  customFontsAvailable = available;
}

const WEB_FALLBACK =
  "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
const WEB_MONO_FALLBACK = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

export function normalizeWeight(weight: TextStyle['fontWeight']): Weight {
  if (weight === undefined || weight === 'normal') return '400';
  if (weight === 'bold') return '700';
  const n = typeof weight === 'number' ? weight : parseInt(String(weight), 10);
  if (Number.isNaN(n) || n < 450) return '400';
  if (n < 550) return '500';
  if (n < 650) return '600';
  return '700';
}

const monoFamilies = new Set<string>(Object.values(fontFamilies.mono));

/**
 * Returns `style` with `fontFamily` set to the Geist face matching its `fontWeight`
 * (and `fontWeight` reset so Android/web don't synthesize a second bold).
 */
export function applyFontFamily(style: StyleProp<TextStyle>): TextStyle {
  const flat = (StyleSheet.flatten(style) || {}) as TextStyle;
  if (!customFontsAvailable) return flat;

  const requested = flat.fontFamily;
  const isMono =
    requested === 'monospace' || (requested !== undefined && monoFamilies.has(requested));
  // An explicit non-mono, non-default family is respected as-is.
  if (requested && !isMono) return flat;

  const weight = normalizeWeight(flat.fontWeight);
  const family = (isMono ? fontFamilies.mono : fontFamilies.sans)[weight];
  const resolved =
    Platform.OS === 'web' ? `${family}, ${isMono ? WEB_MONO_FALLBACK : WEB_FALLBACK}` : family;
  return { ...flat, fontFamily: resolved, fontWeight: 'normal' };
}

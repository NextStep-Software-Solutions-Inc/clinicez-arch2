import { describe, expect, mock, test } from 'bun:test';

// fonts.ts depends on react-native + font asset modules; stub them for a pure unit test.
mock.module('react-native', () => ({
  Platform: { OS: 'ios' },
  StyleSheet: { flatten: (style: unknown) => (Array.isArray(style) ? Object.assign({}, ...style.flat(Infinity).filter(Boolean)) : (style ?? {})) },
}));
for (const path of [
  '@expo-google-fonts/geist/400Regular',
  '@expo-google-fonts/geist/500Medium',
  '@expo-google-fonts/geist/600SemiBold',
  '@expo-google-fonts/geist/700Bold',
  '@expo-google-fonts/geist-mono/400Regular',
  '@expo-google-fonts/geist-mono/500Medium',
  '@expo-google-fonts/geist-mono/600SemiBold',
  '@expo-google-fonts/geist-mono/700Bold',
]) {
  const name = path.split('/').pop()!;
  mock.module(path, () => ({
    [`${path.includes('mono') ? 'GeistMono' : 'Geist'}_${name}`]: 1,
  }));
}

const { applyFontFamily, normalizeWeight, setCustomFontsAvailable } = await import('../constants/fonts');

describe('normalizeWeight', () => {
  test('maps css weights onto the four shipped Geist faces', () => {
    expect(normalizeWeight(undefined)).toBe('400');
    expect(normalizeWeight('normal')).toBe('400');
    expect(normalizeWeight('500')).toBe('500');
    expect(normalizeWeight('600')).toBe('600');
    expect(normalizeWeight('bold')).toBe('700');
    expect(normalizeWeight('800')).toBe('700');
    expect(normalizeWeight(300 as never)).toBe('400');
  });
});

describe('applyFontFamily', () => {
  test('selects the family by weight and resets fontWeight', () => {
    setCustomFontsAvailable(true);
    expect(applyFontFamily({ fontSize: 14, fontWeight: '600' })).toMatchObject({
      fontFamily: 'Geist_600SemiBold',
      fontWeight: 'normal',
      fontSize: 14,
    });
  });

  test('keeps mono family at the requested weight and respects explicit families', () => {
    setCustomFontsAvailable(true);
    expect(applyFontFamily({ fontFamily: 'GeistMono_500Medium', fontWeight: '700' }).fontFamily).toBe('GeistMono_700Bold');
    expect(applyFontFamily({ fontFamily: 'Courier' }).fontFamily).toBe('Courier');
  });

  test('falls back to the system font when custom fonts failed to load', () => {
    setCustomFontsAvailable(false);
    const result = applyFontFamily({ fontWeight: '700' });
    expect(result.fontFamily).toBeUndefined();
    expect(result.fontWeight).toBe('700');
    setCustomFontsAvailable(true);
  });
});

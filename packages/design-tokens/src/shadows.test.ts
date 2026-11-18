import { describe, expect, test } from 'bun:test';
import { createShadows, darkColors, lightColors, shadows } from './index';

describe('design-tokens shadows', () => {
  test('default shadows expose brand-reactive and semantic shadow tokens without opaque black hex', () => {
    expect(shadows.sm.shadowColor).toBe(lightColors.shadowSmColor);
    expect(shadows.md.shadowColor).toBe(lightColors.shadowMdColor);
    expect(shadows.lg.shadowColor).toBe(lightColors.shadowLgColor);
    expect(shadows.brandSubtle.shadowColor).toBe('rgba(13, 105, 99, 0.22)');
    expect(shadows.brandSm.shadowColor).toBe('rgba(13, 105, 99, 0.34)');
    expect(shadows.brandMd.shadowColor).toBe('rgba(13, 105, 99, 0.46)');
    expect(shadows.dangerSm.shadowColor).toBe(lightColors.dangerShadowSm);
    expect(shadows.successSm.shadowColor).toBe(lightColors.successShadowSm);
    expect(shadows.none.shadowOpacity).toBe(0);
  });

  test('createShadows derives brand-reactive shadows from custom primary hex or explicit shadow tokens', () => {
    const roseFromHex = createShadows({ primary: '#E11D48' }, false);
    expect(roseFromHex.brandSubtle.shadowColor).toBe('rgba(225, 29, 72, 0.22)');
    expect(roseFromHex.brandSm.shadowColor).toBe('rgba(225, 29, 72, 0.34)');
    expect(roseFromHex.brandMd.shadowColor).toBe('rgba(225, 29, 72, 0.46)');

    const webRose = createShadows({ primary: '#E11D48' }, true) as unknown as Record<string, Record<string, unknown>>;
    expect(webRose.none.boxShadow).toBe('none');
    expect(webRose.brandSubtle.boxShadow).toBe(
      '0 2px 6px 0 rgba(225, 29, 72, 0.22), 0 6px 14px -1px rgba(225, 29, 72, 0.22)'
    );
    expect(webRose.brandSm.boxShadow).toBe(
      '0 4px 10px 0 rgba(225, 29, 72, 0.34), 0 8px 20px -2px rgba(225, 29, 72, 0.22)'
    );
    expect(webRose.brandMd.boxShadow).toBe(
      '0 6px 16px 0 rgba(225, 29, 72, 0.46), 0 12px 28px -3px rgba(225, 29, 72, 0.34)'
    );
    expect('elevation' in webRose.brandSm).toBe(false);
    expect('shadowColor' in webRose.brandSm).toBe(false);

    const darkScale = createShadows(darkColors, false);
    expect(darkScale.brandSm.shadowColor).toBe(darkColors.primaryShadowSm);
    expect(darkScale.sm.shadowColor).toBe(darkColors.shadowSmColor);
  });
});

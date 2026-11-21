import { describe, expect, it } from 'bun:test';
import { publicRoutes } from './publicRoutes';

describe('PublicRoutes - Adversarial & Stress Testing (Cross-Language Parity)', () => {
  describe('Long String & Boundary Hardening', () => {
    it('handles 10,000 char code without crashing', () => {
      const longCode = 'A'.repeat(10000);
      const url = publicRoutes.join({ baseUrl: 'https://portal.clinicez.ph', code: longCode });
      expect(url.startsWith('https://portal.clinicez.ph/join?code=')).toBe(true);
      expect(url.length).toBe('https://portal.clinicez.ph/join?code='.length + 10000);

      const deepLink = publicRoutes.mobileJoinDeepLink(longCode);
      expect(deepLink.startsWith('clinicez://join?code=')).toBe(true);
      expect(deepLink.length).toBe('clinicez://join?code='.length + 10000);
    });

    it('evaluates 100,000 char code in sub-millisecond time', () => {
      const massiveCode = 'A'.repeat(100000);
      const start = performance.now();
      const isValid = publicRoutes.isValidJoinCode(massiveCode);
      const elapsed = performance.now() - start;

      expect(isValid).toBe(false);
      expect(elapsed).toBeLessThan(50);
    });

    it('validates unprefixed exact boundary lengths', () => {
      expect(publicRoutes.isValidJoinCode('XX')).toBe(false);
      expect(publicRoutes.isValidJoinCode('XXX')).toBe(true);
      expect(publicRoutes.isValidJoinCode('X'.repeat(50))).toBe(true);
      expect(publicRoutes.isValidJoinCode('X'.repeat(51))).toBe(false);
    });

    it('validates prefixed exact boundary lengths', () => {
      expect(publicRoutes.isValidJoinCode('B4C7-X')).toBe(true); // total 6
      expect(publicRoutes.isValidJoinCode('B4C7-' + 'X'.repeat(45))).toBe(true); // total 50
      expect(publicRoutes.isValidJoinCode('B4C7-' + 'X'.repeat(46))).toBe(false); // total 51
    });

    it('rejects malformed prefixed structures', () => {
      expect(publicRoutes.isValidJoinCode('ABC-JOIN')).toBe(false);
      expect(publicRoutes.isValidJoinCode('ABCDE-JOIN')).toBe(false);
      expect(publicRoutes.isValidJoinCode('-JOIN')).toBe(false);
      expect(publicRoutes.isValidJoinCode('B4C7-')).toBe(false);
      expect(publicRoutes.isValidJoinCode('B4C7--JOIN')).toBe(false);
      expect(publicRoutes.isValidJoinCode('B4C7-A-B')).toBe(false);
    });
  });

  describe('Malformed Escape Sequences & Hostile Inputs', () => {
    it('escapes path traversal in slugs', () => {
      const hostileSlug = '../../../etc/passwd';
      const result = publicRoutes.facilityJoin(hostileSlug, 'facility', {
        baseUrl: 'https://portal.clinicez.ph',
      });
      expect(result).toBe('https://portal.clinicez.ph/join/..%2F..%2F..%2Fetc%2Fpasswd/facility');
      expect(result.includes('../')).toBe(false);
    });

    it('escapes query and fragment injection in parameters', () => {
      const hostileCode = 'APEX2026&role=admin#section';
      const result = publicRoutes.join({
        baseUrl: 'https://portal.clinicez.ph',
        code: hostileCode,
      });
      expect(result).toBe('https://portal.clinicez.ph/join?code=APEX2026%26role%3Dadmin%23section');
      expect(result.includes('&role=admin')).toBe(false);
      expect(result.includes('#section')).toBe(false);
    });

    it('escapes control characters', () => {
      const controlCode = 'CODE\r\n\t\0VALUE';
      const result = publicRoutes.join({
        baseUrl: 'https://portal.clinicez.ph',
        code: controlCode,
      });
      expect(result).toBe('https://portal.clinicez.ph/join?code=CODE%0D%0A%09%00VALUE');
    });

    it('encodes unicode and emojis', () => {
      const unicodeToken = 'Dr-José-Rizal-🩺';
      const result = publicRoutes.verifyKind('referral', unicodeToken, {
        baseUrl: 'https://portal.clinicez.ph',
      });
      expect(result).toBe('https://portal.clinicez.ph/verify/referral/Dr-Jos%C3%A9-Rizal-%F0%9F%A9%BA');
    });
  });

  describe('Signature Trimming & Prefix Extraction', () => {
    const sigCases: Array<[string, string, string]> = [
      ['SEC-SHA256-4FA8B19C30E2', '4FA8B19C30E2', 'Exact 12-char with uppercase prefix'],
      ['sec-sha256-4fa8b19c30e2', '4fa8b19c30e2', 'Exact 12-char with lowercase prefix'],
      ['SeC-sHa256-4Fa8B19c30E2', '4Fa8B19c30E2', 'Exact 12-char with mixed-case prefix'],
      ['SEC-SHA256-4FA8B19C30E29999', '4FA8B19C30E2', 'Longer digest (16 chars) trims to 12'],
      ['SEC-SHA256-4FA8', '4FA8', 'Short digest (4 chars) kept intact'],
      ['SEC-SHA256-A', 'A', 'Single char digest kept intact'],
      ['4FA8B19C30E29999', '4FA8B19C30E29999', 'Digest without prefix preserves full content'],
      ['SEC-SHA512-4FA8B19C30E2', 'SEC-SHA512-4FA8B19C30E2', 'Non-SHA256 prefix preserved'],
    ];

    for (const [rawSig, expectedSig, desc] of sigCases) {
      it(`normalizes signature: ${desc}`, () => {
        const result = publicRoutes.verifyKind('med-cert', 'MC-01', { sig: rawSig });
        expect(result).toBe(`/verify/med-cert/MC-01?sig=${expectedSig}`);
      });
    }

    it('omits sig query parameter when sig is empty or bare prefix', () => {
      expect(publicRoutes.verifyKind('med-cert', 'MC-01', { sig: null })).toBe('/verify/med-cert/MC-01');
      expect(publicRoutes.verifyKind('med-cert', 'MC-01', { sig: '' })).toBe('/verify/med-cert/MC-01');
      expect(publicRoutes.verifyKind('med-cert', 'MC-01', { sig: '   ' })).toBe('/verify/med-cert/MC-01');
      expect(publicRoutes.verifyKind('med-cert', 'MC-01', { sig: 'SEC-SHA256-' })).toBe('/verify/med-cert/MC-01');
      expect(publicRoutes.verifyKind('med-cert', 'MC-01', { sig: 'sec-sha256-   ' })).toBe('/verify/med-cert/MC-01');
    });

    it('normalizes sig in verifyLookup identically', () => {
      expect(
        publicRoutes.verifyLookup({ ref: 'MC-01', sig: 'SEC-SHA256-4FA8B19C30E29999' })
      ).toBe('/verify?ref=MC-01&sig=4FA8B19C30E2');

      expect(publicRoutes.verifyLookup({ ref: 'MC-01', sig: 'sec-sha256-' })).toBe('/verify?ref=MC-01');
      expect(publicRoutes.verifyLookup({ sig: 'SEC-SHA256-4FA8B19C30E2' })).toBe('/verify?sig=4FA8B19C30E2');
    });
  });

  describe('BaseUrl Edge Cases', () => {
    const cases: Array<[string | null | undefined, string]> = [
      [null, '/join'],
      [undefined, '/join'],
      ['', '/join'],
      ['   ', '/join'],
      ['https://portal.clinicez.ph', 'https://portal.clinicez.ph/join'],
      ['https://portal.clinicez.ph/', 'https://portal.clinicez.ph/join'],
      ['https://portal.clinicez.ph///', 'https://portal.clinicez.ph/join'],
      ['https://portal.clinicez.ph/portal', 'https://portal.clinicez.ph/portal/join'],
      ['https://portal.clinicez.ph/portal/', 'https://portal.clinicez.ph/portal/join'],
      ['  https://portal.clinicez.ph/  ', 'https://portal.clinicez.ph/join'],
    ];

    for (const [baseUrl, expected] of cases) {
      it(`normalizes baseUrl "${baseUrl}" -> "${expected}"`, () => {
        expect(publicRoutes.join({ baseUrl })).toBe(expected);
      });
    }
  });
});

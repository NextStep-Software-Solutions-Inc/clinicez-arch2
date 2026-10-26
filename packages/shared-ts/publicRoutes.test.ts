import { describe, expect, it } from 'bun:test';
import { publicRoutes } from './publicRoutes';

describe('PublicRoutes - Canonical 27-Row Matrix Parity', () => {
  // Join Routes (TC-01 - TC-05)
  it('TC-01: builds bare /join route', () => {
    expect(publicRoutes.join()).toBe('/join');
    expect(publicRoutes.join({})).toBe('/join');
  });

  it('TC-02: builds /join route with baseUrl', () => {
    expect(publicRoutes.join({ baseUrl: 'https://portal.clinicez.ph' })).toBe(
      'https://portal.clinicez.ph/join'
    );
  });

  it('TC-03: builds /join with code parameter', () => {
    expect(publicRoutes.join({ code: 'APEX2026' })).toBe('/join?code=APEX2026');
  });

  it('TC-04: builds /join with baseUrl and hyphenated code', () => {
    expect(
      publicRoutes.join({ baseUrl: 'https://portal.clinicez.ph/', code: 'B4C7-JOINNOW' })
    ).toBe('https://portal.clinicez.ph/join?code=B4C7-JOINNOW');
  });

  it('TC-05: builds /join with encoded space in code', () => {
    expect(
      publicRoutes.join({ baseUrl: 'http://localhost:3000', code: 'JOIN ME' })
    ).toBe('http://localhost:3000/join?code=JOIN%20ME');
  });

  // Facility Join Routes (TC-06 - TC-08)
  it('TC-06: builds bare facility join route', () => {
    expect(publicRoutes.facilityJoin('ustp', 'cdo-campus')).toBe(
      '/join/ustp/cdo-campus'
    );
  });

  it('TC-07: builds facility join route with baseUrl and code', () => {
    expect(
      publicRoutes.facilityJoin('ustp', 'cdo-campus', {
        baseUrl: 'https://portal.clinicez.ph',
        code: 'USTP2026',
      })
    ).toBe('https://portal.clinicez.ph/join/ustp/cdo-campus?code=USTP2026');
  });

  it('TC-08: trims multiple trailing slashes from baseUrl', () => {
    expect(
      publicRoutes.facilityJoin('st-jude', 'main', {
        baseUrl: 'https://portal.clinicez.ph///',
        code: 'B4C7-JOINNOW',
      })
    ).toBe('https://portal.clinicez.ph/join/st-jude/main?code=B4C7-JOINNOW');
  });

  // Claim Routes (TC-09 - TC-11)
  it('TC-09: builds bare claim route with token', () => {
    expect(publicRoutes.claim('token-12345')).toBe('/claim?token=token-12345');
  });

  it('TC-10: builds claim route with baseUrl and JWT token', () => {
    expect(
      publicRoutes.claim('eyJhbGciOiJIUzI1NiJ9.test', {
        baseUrl: 'https://portal.clinicez.ph',
      })
    ).toBe('https://portal.clinicez.ph/claim?token=eyJhbGciOiJIUzI1NiJ9.test');
  });

  it('TC-11: encodes special characters in claim token', () => {
    expect(publicRoutes.claim('TOKEN+SPECIAL/KEY=')).toBe(
      '/claim?token=TOKEN%2BSPECIAL%2FKEY%3D'
    );
  });

  // Verify Lookup Routes (TC-12 - TC-15)
  it('TC-12: builds bare /verify route', () => {
    expect(publicRoutes.verifyLookup()).toBe('/verify');
    expect(publicRoutes.verifyLookup({})).toBe('/verify');
  });

  it('TC-13: builds /verify with ref query parameter', () => {
    expect(publicRoutes.verifyLookup({ ref: 'MC-2026-0001' })).toBe(
      '/verify?ref=MC-2026-0001'
    );
  });

  it('TC-14: builds /verify with baseUrl, ref, and 12-char sig', () => {
    expect(
      publicRoutes.verifyLookup({
        baseUrl: 'https://portal.clinicez.ph',
        ref: 'MC-2026-0001',
        sig: '4FA8B19C30E2',
      })
    ).toBe('https://portal.clinicez.ph/verify?ref=MC-2026-0001&sig=4FA8B19C30E2');
  });

  it('TC-15: does NOT strip SEC-SHA256- prefix from ref query parameter', () => {
    expect(
      publicRoutes.verifyLookup({ ref: 'SEC-SHA256-4FA8B19C30E2' })
    ).toBe('/verify?ref=SEC-SHA256-4FA8B19C30E2');
  });

  // Dynamic Verify Kind Routes (TC-16 - TC-21)
  it('TC-16: builds bare /verify/{kind}/{token}', () => {
    expect(publicRoutes.verifyKind('med-cert', 'MC-2026-0001')).toBe(
      '/verify/med-cert/MC-2026-0001'
    );
  });

  it('TC-17: builds /verify/{kind}/{token} with baseUrl and sig', () => {
    expect(
      publicRoutes.verifyKind('med-cert', 'MC-2026-0001', {
        baseUrl: 'https://portal.clinicez.ph',
        sig: '4FA8B19C30E2',
      })
    ).toBe(
      'https://portal.clinicez.ph/verify/med-cert/MC-2026-0001?sig=4FA8B19C30E2'
    );
  });

  it('TC-18: strips SEC-SHA256- prefix from sig parameter in verifyKind', () => {
    expect(
      publicRoutes.verifyKind('referral', 'REF-001', {
        baseUrl: 'https://portal.clinicez.ph',
        sig: 'SEC-SHA256-4FA8B19C30E2',
      })
    ).toBe(
      'https://portal.clinicez.ph/verify/referral/REF-001?sig=4FA8B19C30E2'
    );
  });

  it('TC-19: builds verifyKind with kind=rx', () => {
    expect(
      publicRoutes.verifyKind('rx', 'RX-20261025-0001', {
        baseUrl: 'https://portal.clinicez.ph',
      })
    ).toBe('https://portal.clinicez.ph/verify/rx/RX-20261025-0001');
  });

  it('TC-20: encodes spaces in token segment', () => {
    expect(
      publicRoutes.verifyKind('med-cert', 'token with spaces', {
        baseUrl: 'https://portal.clinicez.ph',
      })
    ).toBe('https://portal.clinicez.ph/verify/med-cert/token%20with%20spaces');
  });

  it('TC-21: encodes slashes in token segment', () => {
    expect(
      publicRoutes.verifyKind('lab', 'ORD/2026/01', {
        baseUrl: 'https://portal.clinicez.ph',
      })
    ).toBe('https://portal.clinicez.ph/verify/lab/ORD%2F2026%2F01');
  });

  // VerifyRx Convenience Route (TC-22 - TC-24)
  it('TC-22: builds bare /verify/rx/{token}', () => {
    expect(publicRoutes.verifyRx('test-rx-token')).toBe(
      '/verify/rx/test-rx-token'
    );
  });

  it('TC-23: builds /verify/rx/{token} with baseUrl', () => {
    expect(
      publicRoutes.verifyRx('RX-SECRET-99', {
        baseUrl: 'https://portal.clinicez.ph',
      })
    ).toBe('https://portal.clinicez.ph/verify/rx/RX-SECRET-99');
  });

  it('TC-24: encodes special characters in verifyRx token', () => {
    expect(publicRoutes.verifyRx('rx token/123')).toBe(
      '/verify/rx/rx%20token%2F123'
    );
  });

  // Mobile Join Deep Link (TC-25 - TC-27)
  it('TC-25: builds mobile join deep link with alphanumeric code', () => {
    expect(publicRoutes.mobileJoinDeepLink('APEX2026')).toBe(
      'clinicez://join?code=APEX2026'
    );
  });

  it('TC-26: builds mobile join deep link with hyphenated code', () => {
    expect(publicRoutes.mobileJoinDeepLink('B4C7-JOINNOW')).toBe(
      'clinicez://join?code=B4C7-JOINNOW'
    );
  });

  it('TC-27: encodes spaces in mobile join deep link code', () => {
    expect(publicRoutes.mobileJoinDeepLink('JOIN ME')).toBe(
      'clinicez://join?code=JOIN%20ME'
    );
  });

  it('builds bare mobile join deep link when code is omitted', () => {
    expect(publicRoutes.mobileJoinDeepLink()).toBe('clinicez://join');
    expect(publicRoutes.mobileJoinDeepLink('')).toBe('clinicez://join');
    expect(publicRoutes.mobileJoinDeepLink(null)).toBe('clinicez://join');
  });
});

describe('PublicRoutes - Join Code Format Validation (20-Row Matrix)', () => {
  const testMatrix: Array<[string, boolean, string, string]> = [
    ['APEX2026', true, 'APEX2026', 'Standard 8-char uppercase alphanumeric'],
    ['E2FW28KT', true, 'E2FW28KT', 'Standard 8-char alphanumeric'],
    ['VIP888', true, 'VIP888', '6-char alphanumeric'],
    ['CDO202', true, 'CDO202', '6-char alphanumeric'],
    ['STJUDE2026', true, 'STJUDE2026', '10-char alphanumeric'],
    ['B4C7-JOINNOW', true, 'B4C7-JOINNOW', '4-char clinic prefix + hyphen + code'],
    ['A1B2-C3D4E5F6', true, 'A1B2-C3D4E5F6', 'Prefixed code'],
    ['b4c7-joinnow', true, 'B4C7-JOINNOW', 'Case insensitivity normalization'],
    ['apex2026', true, 'APEX2026', 'Case insensitivity normalization'],
    ['', false, '', 'Empty string'],
    ['   ', false, '', 'Whitespace only'],
    ['AB', false, 'AB', 'Too short (< 3 characters)'],
    ['A-B', false, 'A-B', 'Prefix is not 4 characters'],
    ['ABCDE-JOIN', false, 'ABCDE-JOIN', 'Prefix is 5 characters (not 4)'],
    ['AB-JOIN', false, 'AB-JOIN', 'Prefix is 2 characters (not 4)'],
    ['B4C7--JOIN', false, 'B4C7--JOIN', 'Consecutive hyphens'],
    ['-JOIN', false, '-JOIN', 'Leading hyphen'],
    ['JOIN-', false, 'JOIN-', 'Trailing hyphen'],
    ['A'.repeat(51), false, 'A'.repeat(51), 'Exceeds max length 50'],
    ['B4C7-' + 'A'.repeat(47), false, 'B4C7-' + 'A'.repeat(47), 'Total length 52 (> 50)'],
  ];

  for (const [input, expectedValid, expectedNormalized, desc] of testMatrix) {
    it(`validates "${input}" -> ${expectedValid} (${desc})`, () => {
      expect(publicRoutes.isValidJoinCode(input)).toBe(expectedValid);
      expect(publicRoutes.normalizeJoinCode(input)).toBe(expectedNormalized);
    });
  }

  it('rejects forbidden punctuation characters', () => {
    expect(publicRoutes.isValidJoinCode('CODE!@#')).toBe(false);
    expect(publicRoutes.isValidJoinCode('JOIN.NOW')).toBe(false);
    expect(publicRoutes.isValidJoinCode('JOIN_NOW')).toBe(false);
  });

  it('handles null and undefined gracefully', () => {
    expect(publicRoutes.isValidJoinCode(null)).toBe(false);
    expect(publicRoutes.isValidJoinCode(undefined)).toBe(false);
    expect(publicRoutes.normalizeJoinCode(null)).toBe('');
    expect(publicRoutes.normalizeJoinCode(undefined)).toBe('');
  });
});

describe('PublicRoutes - Error Handling & Defensive Guards', () => {
  it('throws when facilityJoin is called with empty slugs', () => {
    expect(() => publicRoutes.facilityJoin('', 'main')).toThrow();
    expect(() => publicRoutes.facilityJoin('ustp', '')).toThrow();
    expect(() => publicRoutes.facilityJoin('   ', 'main')).toThrow();
  });

  it('throws when claim is called with empty token', () => {
    expect(() => publicRoutes.claim('')).toThrow();
    expect(() => publicRoutes.claim('   ')).toThrow();
  });

  it('throws when verifyKind is called with empty kind or token', () => {
    expect(() => publicRoutes.verifyKind('', 'MC-01')).toThrow();
    expect(() => publicRoutes.verifyKind('med-cert', '')).toThrow();
    expect(() => publicRoutes.verifyKind('   ', 'MC-01')).toThrow();
  });

  it('throws when verifyRx is called with empty token', () => {
    expect(() => publicRoutes.verifyRx('')).toThrow();
    expect(() => publicRoutes.verifyRx('   ')).toThrow();
  });
});

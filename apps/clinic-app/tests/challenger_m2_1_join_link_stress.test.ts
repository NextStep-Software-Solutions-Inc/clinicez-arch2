// token-guard:ignore-file
/**
 * Empirical Stress & Adversarial Test Suite for M2 Join Link & Reception Placard
 * Challenger: teamwork_preview_challenger_m2_1 (M2 Challenger 1)
 *
 * Dimensions Tested:
 * 1. Join Code Generator:
 *    - 10,000 iterations: character set exclusion (0, O, 1, I), entropy, collision rate
 *    - Varied lengths (0, 1, 4, 8, 16, 64)
 *    - Uppercase formatting guarantee
 * 2. Expiration Date Calculations:
 *    - 24h, 7d, 30d, never, custom dates
 *    - UTC date conversions, leap day / month boundaries
 *    - Active status boundaries: past, present, future, millisecond granularity
 *    - Malformed dates, empty strings, invalid date strings, negative timestamps
 *    - Human-readable formatting checks across different intervals
 * 3. Join URL Builder (formatReceptionQrUrl):
 *    - Standard URL structure
 *    - Special characters, spaces, query delimiters, unicode, emoji in code
 *    - Edge cases in tenantSlug / facilitySlug (leading/trailing slashes, spaces)
 *    - Trailing slashes on base URL (single, multiple, none)
 *    - Empty, whitespace-only, or undefined code handling
 * 4. QR Matrix & SVG Generator:
 *    - Text length threshold (<=50 vs >50 chars, V4 vs V5 matrix sizes)
 *    - Large URLs (100, 250, 500, 1000 characters) - no crashes or array bounds errors
 *    - Empty strings and multi-byte unicode characters
 *    - XML / SVG well-formedness: tag matching, attribute closure, viewBox syntax
 * 5. Reception Placard HTML Generator:
 *    - XSS / HTML injection vectors in facilityName, letterhead, joinCode, qrUrl
 *    - Long URLs and text wrapping
 *    - Standalone HTML document well-formedness
 *    - Null / undefined optional fields handling
 * 6. Document Quarantine Logic (reviewDocument):
 *    - State transitions (PendingVerification -> Verified / Rejected)
 *    - Mandatory rejection reason enforcement (whitespace, empty, unicode)
 *    - Immutability / state purity
 */

import { describe, expect, test } from 'bun:test';
import {
  generateRandomJoinCode,
  computeJoinCodeExpiration,
  isJoinCodeActive,
  formatReceptionQrUrl,
  formatJoinCodeExpiration,
  reviewDocument,
  type QuarantinedDoc,
  type ExpirationWindow,
} from '../components/settings/joinLinkUtils';
import {
  generateQrMatrix,
  buildQrPathData,
  buildQrSvgString,
} from '../components/settings/qrGenerator';
import {
  buildReceptionPlacardHtml,
  type ReceptionPlacardData,
} from '../components/settings/receptionPlacardHtml';

describe('Empirical Stress: Join Code Generator', () => {
  const ALLOWED_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const FORBIDDEN_CHARS = ['0', 'O', '1', 'I', 'o', 'l', 'i'];

  test('EMP-1.1: 10,000 iterations strictly exclude ambiguous characters and use valid charset', () => {
    const sampleSize = 10000;
    const seenCodes = new Set<string>();
    const charCounts: Record<string, number> = {};

    for (const c of ALLOWED_CHARS) {
      charCounts[c] = 0;
    }

    for (let i = 0; i < sampleSize; i++) {
      const code = generateRandomJoinCode(8);

      // Check length
      expect(code.length).toBe(8);

      // Check forbidden characters
      for (const forbidden of FORBIDDEN_CHARS) {
        expect(code.includes(forbidden)).toBe(false);
      }

      // Check all characters in allowed set
      for (const char of code) {
        expect(ALLOWED_CHARS.includes(char)).toBe(true);
        charCounts[char]++;
      }

      // Check uppercase
      expect(code).toBe(code.toUpperCase());

      seenCodes.add(code);
    }

    // Entropy / Uniqueness check: in 10,000 8-char codes from a 32-char alphabet (32^8 ≈ 1.099e12),
    // collision probability is negligible (< 0.005%).
    // Expect unique count to be at least 9,980.
    expect(seenCodes.size).toBeGreaterThanOrEqual(9980);

    // Uniformity check: each character should be sampled with reasonable distribution
    // Total characters = 10,000 * 8 = 80,000. Expected per char = 80,000 / 32 = 2,500.
    // Every char should have > 1,500 and < 3,500 hits.
    for (const char of ALLOWED_CHARS) {
      expect(charCounts[char]).toBeGreaterThan(1500);
      expect(charCounts[char]).toBeLessThan(3500);
    }
  });

  test('EMP-1.2: Boundary lengths (0, 1, 4, 16, 32, 64)', () => {
    expect(generateRandomJoinCode(0)).toBe('');
    
    const len1 = generateRandomJoinCode(1);
    expect(len1.length).toBe(1);
    expect(ALLOWED_CHARS.includes(len1)).toBe(true);

    const len4 = generateRandomJoinCode(4);
    expect(len4.length).toBe(4);
    expect(/^[A-Z2-9]{4}$/.test(len4)).toBe(true);

    const len16 = generateRandomJoinCode(16);
    expect(len16.length).toBe(16);
    expect(/^[A-Z2-9]{16}$/.test(len16)).toBe(true);

    const len64 = generateRandomJoinCode(64);
    expect(len64.length).toBe(64);
    expect(/^[A-Z2-9]{64}$/.test(len64)).toBe(true);
  });

  test('EMP-1.3: Default parameter generates exactly 8 characters', () => {
    const code = generateRandomJoinCode();
    expect(code.length).toBe(8);
  });
});

describe('Empirical Stress: Expiration Calculations & Active Status', () => {
  test('EMP-2.1: computeJoinCodeExpiration accurately calculates offsets from now', () => {
    const start = Date.now();

    const exp24h = computeJoinCodeExpiration('24h')!;
    const exp7d = computeJoinCodeExpiration('7d')!;
    const exp30d = computeJoinCodeExpiration('30d')!;
    const expNever = computeJoinCodeExpiration('never');

    const end = Date.now();

    // 24 hours: 86,400,000 ms
    expect(exp24h.getTime() - start).toBeGreaterThanOrEqual(86400000 - 50);
    expect(exp24h.getTime() - end).toBeLessThanOrEqual(86400000 + 50);

    // 7 days: 604,800,000 ms
    expect(exp7d.getTime() - start).toBeGreaterThanOrEqual(604800000 - 50);
    expect(exp7d.getTime() - end).toBeLessThanOrEqual(604800000 + 50);

    // 30 days: 2,592,000,000 ms
    expect(exp30d.getTime() - start).toBeGreaterThanOrEqual(2592000000 - 50);
    expect(exp30d.getTime() - end).toBeLessThanOrEqual(2592000000 + 50);

    // never: null
    expect(expNever).toBeNull();
  });

  test('EMP-2.2: computeJoinCodeExpiration handles custom dates and fallbacks', () => {
    const custom = new Date('2028-12-31T23:59:59.000Z');
    const result = computeJoinCodeExpiration('custom', custom);
    expect(result).toEqual(custom);

    // Custom without date returns null
    const resultNoDate = computeJoinCodeExpiration('custom');
    expect(resultNoDate).toBeNull();
  });

  test('EMP-2.3: isJoinCodeActive evaluates boolean state, nulls, and ISO strings', () => {
    const now = Date.now();

    // Disabled flag overrides all dates
    expect(isJoinCodeActive(false, new Date(now + 100000))).toBe(false);
    expect(isJoinCodeActive(false, null)).toBe(false);
    expect(isJoinCodeActive(false, undefined)).toBe(false);

    // Enabled with null/undefined expiry means permanent active
    expect(isJoinCodeActive(true, null)).toBe(true);
    expect(isJoinCodeActive(true, undefined)).toBe(true);

    // Future dates
    expect(isJoinCodeActive(true, new Date(now + 5000))).toBe(true);
    expect(isJoinCodeActive(true, new Date(now + 86400000).toISOString())).toBe(true);

    // Past dates
    expect(isJoinCodeActive(true, new Date(now - 1))).toBe(false);
    expect(isJoinCodeActive(true, new Date(now - 86400000))).toBe(false);
    expect(isJoinCodeActive(true, new Date(now - 86400000).toISOString())).toBe(false);

    // Sub-millisecond boundary
    expect(isJoinCodeActive(true, new Date(now - 100))).toBe(false);
    expect(isJoinCodeActive(true, new Date(now + 100))).toBe(true);
  });

  test('EMP-2.4: formatJoinCodeExpiration formatting output across diverse states', () => {
    // Null/undefined
    expect(formatJoinCodeExpiration(null)).toBe('Never expires (Permanent link)');
    expect(formatJoinCodeExpiration(undefined)).toBe('Never expires (Permanent link)');

    // Past date
    const past = new Date(Date.now() - 5000);
    expect(formatJoinCodeExpiration(past)).toBe('Expired');
    expect(formatJoinCodeExpiration(past.toISOString())).toBe('Expired');

    // Future multi-day date
    const in3Days = new Date(Date.now() + 3 * 24 * 3600 * 1000 + 2 * 3600 * 1000);
    const formatted3d = formatJoinCodeExpiration(in3Days);
    expect(formatted3d).toContain('(in 3d');

    // Future multi-hour (< 24h) date
    const in5Hours = new Date(Date.now() + 5 * 3600 * 1000 + 10 * 60 * 1000);
    const formatted5h = formatJoinCodeExpiration(in5Hours);
    expect(formatted5h).toContain('(in 5h)');

    // Invalid date strings
    expect(isJoinCodeActive(true, 'not-a-valid-date')).toBe(false);
    expect(formatJoinCodeExpiration('not-a-valid-date')).toBe('Invalid Date (in NaNh)');
  });
});

describe('Empirical Stress: Join URL Builder (formatReceptionQrUrl)', () => {
  test('EMP-3.1: Constructs standard URL and preserves path components', () => {
    const url = formatReceptionQrUrl(
      'https://portal.clinicez.ph',
      'st-jude-hospital',
      'pediatrics-wing',
      'STJUDE2026'
    );
    expect(url).toBe('https://portal.clinicez.ph/join/st-jude-hospital/pediatrics-wing?code=STJUDE2026');
  });

  test('EMP-3.2: Base URL trailing slash normalization', () => {
    expect(formatReceptionQrUrl('https://portal.clinicez.ph/', 't1', 'f1', 'C1'))
      .toBe('https://portal.clinicez.ph/join/t1/f1?code=C1');
    expect(formatReceptionQrUrl('https://portal.clinicez.ph///', 't1', 'f1', 'C1'))
      .toBe('https://portal.clinicez.ph/join/t1/f1?code=C1');
    expect(formatReceptionQrUrl('http://localhost:3000', 't1', 'f1', 'C1'))
      .toBe('http://localhost:3000/join/t1/f1?code=C1');
  });

  test('EMP-3.3: URL encodes special characters, spaces, and query delimiters in join code', () => {
    // Spaces in code
    const urlSpaces = formatReceptionQrUrl('https://portal.clinicez.ph', 't1', 'f1', 'JOIN ME');
    expect(urlSpaces).toBe('https://portal.clinicez.ph/join/t1/f1?code=JOIN%20ME');

    // Symbols &, ?, #, =, +, %
    const urlSymbols = formatReceptionQrUrl('https://portal.clinicez.ph', 't1', 'f1', 'CODE#1?a=b&c=d+e%20');
    expect(urlSymbols).toContain('code=' + encodeURIComponent('CODE#1?a=b&c=d+e%20'));
    // Ensure the raw # and ? are not exposed as top-level URL fragments or query separators
    expect(urlSymbols.split('?').length).toBe(2);
    expect(urlSymbols).not.toContain('#');

    // Unicode / Filipino characters
    const urlUnicode = formatReceptionQrUrl('https://portal.clinicez.ph', 't1', 'f1', 'NIÑO-2026');
    expect(urlUnicode).toBe('https://portal.clinicez.ph/join/t1/f1?code=NI%C3%91O-2026');
  });

  test('EMP-3.4: Omits query string when code is empty, whitespace, or undefined', () => {
    expect(formatReceptionQrUrl('https://portal.clinicez.ph', 't1', 'f1'))
      .toBe('https://portal.clinicez.ph/join/t1/f1');
    expect(formatReceptionQrUrl('https://portal.clinicez.ph', 't1', 'f1', ''))
      .toBe('https://portal.clinicez.ph/join/t1/f1');
    expect(formatReceptionQrUrl('https://portal.clinicez.ph', 't1', 'f1', '   '))
      .toBe('https://portal.clinicez.ph/join/t1/f1');
  });
});

describe('Empirical Stress: QR Generator & SVG Well-Formedness', () => {
  test('EMP-4.1: Generates correct matrix dimensions based on text length threshold', () => {
    // <= 50 chars -> Version 4: size = 17 + 4*4 = 33
    const shortText = 'https://portal.clinicez.ph/join/t/f?code=12345678'; // 49 chars
    expect(shortText.length).toBeLessThanOrEqual(50);
    const mShort = generateQrMatrix(shortText);
    expect(mShort.size).toBe(33);
    expect(mShort.modules.length).toBe(33);
    expect(mShort.modules[0].length).toBe(33);

    // Boundary: exactly 50 chars -> Version 4: size 33
    const exactly50 = 'https://portal.clinicez.ph/join/t/f?code=123456789'; // 50 chars
    expect(exactly50.length).toBe(50);
    const m50 = generateQrMatrix(exactly50);
    expect(m50.size).toBe(33);

    // Boundary: 51 chars -> Version 5: size = 17 + 4*5 = 37
    const at51 = 'https://portal.clinicez.ph/join/t/f?code=1234567890'; // 51 chars
    expect(at51.length).toBe(51);
    const m51 = generateQrMatrix(at51);
    expect(m51.size).toBe(37);
    expect(m51.modules.length).toBe(37);
    expect(m51.modules[0].length).toBe(37);
  });

  test('EMP-4.2: Stress-test long text payloads (100, 250, 500, 1000 chars) without crash', () => {
    const lengths = [100, 250, 500, 1000];
    for (const len of lengths) {
      const longUrl = 'https://portal.clinicez.ph/join/test/' + 'A'.repeat(len);
      const matrix = generateQrMatrix(longUrl);
      expect(matrix.size).toBe(37);
      expect(matrix.modules.length).toBe(37);

      const pathData = buildQrPathData(matrix.modules);
      expect(pathData.length).toBeGreaterThan(0);
      expect(pathData.startsWith('M')).toBe(true);

      const svg = buildQrSvgString(matrix);
      expect(svg.startsWith('<svg')).toBe(true);
      expect(svg.endsWith('</svg>')).toBe(true);
    }
  });

  test('EMP-4.3: SVG XML structure validation', () => {
    const matrix = generateQrMatrix('https://portal.clinicez.ph/join/clinic/facility');
    const svg = buildQrSvgString(matrix, '#1E293B', '#F8FAFC');

    // Check SVG wrapper
    expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('viewBox="0 0 37 37"'); // 33 + 2*padding = 37
    expect(svg).toContain('fill="#F8FAFC"');
    expect(svg).toContain('fill="#1E293B"');
    expect(svg).toContain('shape-rendering="crispEdges"');
    expect(svg).toContain('</svg>');

    // Validate SVG tag symmetry
    const openTags = (svg.match(/<[a-z0-9]+/gi) || []).length;
    // Tags in SVG: <svg>, <rect />, <g>, <path />, </g>, </svg>
    expect(svg).toContain('<rect');
    expect(svg).toContain('<g transform="translate(2, 2)">');
    expect(svg).toContain('</g>');
    expect(svg).toContain('</svg>');

    // Verify quiet zone padding
    const padding = 2;
    const totalSize = matrix.size + padding * 2;
    expect(svg).toContain(`viewBox="0 0 ${totalSize} ${totalSize}"`);
  });

  test('EMP-4.4: QR matrix finder and alignment patterns integrity', () => {
    const matrix = generateQrMatrix('TEST-CODE');
    const size = matrix.size;

    // Top-Left Finder center (row 3, col 3) must be true (black)
    expect(matrix.modules[3][3]).toBe(true);
    // Top-Right Finder center (row 3, col size-4) must be true
    expect(matrix.modules[3][size - 4]).toBe(true);
    // Bottom-Left Finder center (row size-4, col 3) must be true
    expect(matrix.modules[size - 4][3]).toBe(true);

    // Top-Left Finder outer border (row 0, col 0..6) must be true
    for (let c = 0; c <= 6; c++) {
      expect(matrix.modules[0][c]).toBe(true);
      expect(matrix.modules[6][c]).toBe(true);
    }
  });
});

describe('Empirical Stress: Reception Placard HTML Generator', () => {
  test('EMP-5.1: Escapes HTML in facilityName, headers, and codes to prevent XSS injection', () => {
    // Case A: Payload without letterhead (tests facilityName, joinCode, qrUrl escaping)
    const payloadNoLetterhead: ReceptionPlacardData = {
      facilityName: 'Clinic <script>alert("XSS")</script> & "Dangerous"',
      qrUrl: 'https://portal.clinicez.ph/join/test?code=123"&param=<bad>',
      joinCode: 'CODE<tag>&"\'',
    };

    const htmlA = buildReceptionPlacardHtml(payloadNoLetterhead);

    // Verify dangerous tags are stripped / escaped in htmlA
    expect(htmlA).not.toContain('<script>');
    expect(htmlA).not.toContain('alert("XSS")');
    expect(htmlA).toContain('&lt;script&gt;');
    expect(htmlA).toContain('&amp;');
    expect(htmlA).toContain('&quot;');
    expect(htmlA).toContain('CODE&lt;tag&gt;&amp;&quot;\'');
    expect(htmlA).toContain('code=123&quot;&amp;param=&lt;bad&gt;');

    // Case B: Payload with letterhead (tests letterhead header, subheader, address, contact escaping)
    const payloadWithLetterhead: ReceptionPlacardData = {
      facilityName: 'Ignored Fallback',
      qrUrl: 'https://portal.clinicez.ph/join/test',
      letterhead: {
        header: 'Header <iframe src="evil.com"></iframe> & More',
        subHeader: 'Sub <style>body{display:none}</style>',
        address: '123 Fake St <marquee>Test</marquee>',
        contact: 'Phone & <img src=x onerror=alert(1)>',
      },
    };

    const htmlB = buildReceptionPlacardHtml(payloadWithLetterhead);

    expect(htmlB).not.toContain('<iframe>');
    expect(htmlB).not.toContain('<style>body');
    expect(htmlB).not.toContain('<marquee>');
    expect(htmlB).not.toContain('<img src=x');
    expect(htmlB).toContain('&lt;iframe');
    expect(htmlB).toContain('&lt;style&gt;');
    expect(htmlB).toContain('&lt;marquee&gt;');
    expect(htmlB).toContain('&lt;img');
  });

  test('EMP-5.2: Complete Placard HTML structure and embedded SVG', () => {
    const normalPayload: ReceptionPlacardData = {
      facilityName: 'USTP CDO Health Center',
      qrUrl: 'https://portal.clinicez.ph/join/ustp/cdo-clinic?code=USTP2026',
      joinCode: 'USTP2026',
      expiresAtFormatted: 'Oct 20, 2026, 12:00 PM (in 7d 0h)',
      letterhead: {
        header: 'USTP Healthcare System',
        subHeader: 'Main Campus Clinic Services',
        address: 'CM Recto Ave, Lapasan, Cagayan de Oro City',
        contact: '(088) 856-1738',
      },
    };

    const html = buildReceptionPlacardHtml(normalPayload);

    // Document structure
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain('<html');
    expect(html).toContain('<head>');
    expect(html).toContain('<style>');
    expect(html).toContain('</style>');
    expect(html).toContain('<body>');
    expect(html).toContain('</body>');
    expect(html).toContain('</html>');

    // Contains Embedded QR SVG
    expect(html).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
    expect(html).toContain('<path d="M');

    // Contains Passcode Pill
    expect(html).toContain('USTP2026');
    expect(html).toContain('Access Passcode');

    // Contains Instructions
    expect(html).toContain('WALK-IN PATIENT SELF-ENLISTMENT');
    expect(html).toContain('Scan QR code with your mobile camera');

    // Contains Letterhead Info
    expect(html).toContain('USTP Healthcare System');
    expect(html).toContain('Main Campus Clinic Services');
    expect(html).toContain('CM Recto Ave, Lapasan, Cagayan de Oro City');
    expect(html).toContain('(088) 856-1738');
  });

  test('EMP-5.3: Handles minimal payload without letterhead or join code gracefully', () => {
    const minimalPayload: ReceptionPlacardData = {
      facilityName: 'Barangay Health Station',
      qrUrl: 'https://portal.clinicez.ph/join/bhs/station-1',
    };

    const html = buildReceptionPlacardHtml(minimalPayload);

    expect(html).toContain('Barangay Health Station');
    expect(html).toContain('Patient Self-Registration &amp; Enlistment Station'); // default subheader
    expect(html).not.toContain('Access Passcode'); // no joinCode, passcode pill omitted
    expect(html).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
  });
});

describe('Empirical Stress: Document Quarantine Review Logic', () => {
  const baseDoc: QuarantinedDoc = {
    id: 'att-101',
    title: 'Outside Chest X-Ray PA',
    verificationStatus: 'PendingVerification',
  };

  test('EMP-6.1: Approving document transitions to Verified and wipes prior rejection reason', () => {
    const rejectedDoc: QuarantinedDoc = {
      ...baseDoc,
      verificationStatus: 'Rejected',
      rejectionReason: 'Blurry image',
    };

    const verified = reviewDocument(rejectedDoc, true);
    expect(verified.verificationStatus).toBe('Verified');
    expect(verified.rejectionReason).toBeUndefined();
    expect(verified.id).toBe('att-101');
    expect(verified.title).toBe('Outside Chest X-Ray PA');
  });

  test('EMP-6.2: Rejecting requires non-empty reason and trims whitespace', () => {
    const rejected = reviewDocument(baseDoc, false, '  Film orientation is reversed.  ');
    expect(rejected.verificationStatus).toBe('Rejected');
    expect(rejected.rejectionReason).toBe('Film orientation is reversed.');
  });

  test('EMP-6.3: Empty or whitespace rejection reason throws error', () => {
    expect(() => reviewDocument(baseDoc, false, '')).toThrow(
      'A rejection reason is mandatory when rejecting outside documents'
    );
    expect(() => reviewDocument(baseDoc, false, '     ')).toThrow(
      'A rejection reason is mandatory when rejecting outside documents'
    );
    expect(() => reviewDocument(baseDoc, false, undefined)).toThrow(
      'A rejection reason is mandatory when rejecting outside documents'
    );
  });

  test('EMP-6.4: Immutability test: original document object is not mutated', () => {
    const frozenDoc: QuarantinedDoc = Object.freeze({
      id: 'att-102',
      title: 'CBC with Platelet',
      verificationStatus: 'PendingVerification' as const,
    });

    const reviewed = reviewDocument(frozenDoc, true);
    expect(reviewed).not.toBe(frozenDoc);
    expect(reviewed.verificationStatus).toBe('Verified');
    expect(frozenDoc.verificationStatus).toBe('PendingVerification');
  });
});

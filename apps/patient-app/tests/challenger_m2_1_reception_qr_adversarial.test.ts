import { describe, expect, test } from 'bun:test';
import { parseReceptionQrPayload, parseReceptionQr } from '../utils/receptionQrParser';

describe('Challenger M2-1 — Empirical Adversarial Stress Testing of receptionQrParser', () => {
  // ── Dimension 1: Null, Undefined, Types & Empty Inputs ──────────────────
  describe('Dimension 1: Null, Undefined, Types & Empty Inputs', () => {
    test('handles null, undefined, and non-string inputs safely without throwing', () => {
      expect(parseReceptionQrPayload(null as any)).toBeNull();
      expect(parseReceptionQrPayload(undefined as any)).toBeNull();
      expect(parseReceptionQrPayload(12345 as any)).toBeNull();
      expect(parseReceptionQrPayload({} as any)).toBeNull();
      expect(parseReceptionQrPayload([] as any)).toBeNull();
      expect(parseReceptionQrPayload(true as any)).toBeNull();

      expect(parseReceptionQr(null as any)).toBeNull();
      expect(parseReceptionQr(undefined as any)).toBeNull();
      expect(parseReceptionQr(12345 as any)).toBeNull();
    });

    test('handles empty and whitespace-only strings safely', () => {
      expect(parseReceptionQrPayload('')).toBeNull();
      expect(parseReceptionQrPayload('   ')).toBeNull();
      expect(parseReceptionQrPayload('\t\n\r')).toBeNull();
      expect(parseReceptionQr('')).toBeNull();
      expect(parseReceptionQr('   ')).toBeNull();
    });

    test('rejects truncated strings and codes shorter than 3 characters', () => {
      expect(parseReceptionQrPayload('A')).toBeNull();
      expect(parseReceptionQrPayload('AB')).toBeNull();
      expect(parseReceptionQrPayload(' 12 ')).toBeNull();
      expect(parseReceptionQr('A')).toBeNull();
      expect(parseReceptionQr('AB')).toBeNull();
    });
  });

  // ── Dimension 2: Boundary Lengths & Prefixed Formats (Oracles) ─────────
  describe('Dimension 2: Boundary Lengths and Prefixed Formats', () => {
    test('accepts valid unprefixed alphanumeric codes between 3 and 50 characters', () => {
      // 3 characters (minimum)
      expect(parseReceptionQr('ABC')).toBe('ABC');
      expect(parseReceptionQr('123')).toBe('123');

      // 4 to 8 characters
      expect(parseReceptionQr('APEX')).toBe('APEX');
      expect(parseReceptionQr('VIP888')).toBe('VIP888');
      expect(parseReceptionQr('STJUDE2026')).toBe('STJUDE2026');

      // 49 and 50 characters (boundary)
      const code49 = 'A'.repeat(49);
      const code50 = 'B'.repeat(50);
      expect(parseReceptionQr(code49)).toBe(code49);
      expect(parseReceptionQr(code50)).toBe(code50);
    });

    test('rejects unprefixed codes exceeding 50 characters', () => {
      const code51 = 'A'.repeat(51);
      const code100 = 'B'.repeat(100);
      expect(parseReceptionQr(code51)).toBeNull();
      expect(parseReceptionQr(code100)).toBeNull();
      expect(parseReceptionQrPayload(code51)).toBeNull();
    });

    test('accepts valid 4-character clinic-prefixed codes up to 50 characters', () => {
      // 4-char prefix + hyphen + 1 char = 6 chars total
      expect(parseReceptionQr('B4C7-1')).toBe('B4C7-1');
      expect(parseReceptionQr('ABCD-X')).toBe('ABCD-X');

      // Standard prefixed codes
      expect(parseReceptionQr('B4C7-JOINNOW')).toBe('B4C7-JOINNOW');
      expect(parseReceptionQr('1234-APEX2026')).toBe('1234-APEX2026');

      // Maximum valid prefixed: 4 chars + 1 hyphen + 45 chars = 50 chars total
      const maxPrefixed = 'B4C7-' + 'Z'.repeat(45);
      expect(maxPrefixed.length).toBe(50);
      expect(parseReceptionQr(maxPrefixed)).toBe(maxPrefixed);
    });

    test('rejects invalid prefix lengths and malformed hyphenated structures', () => {
      // 3-char prefix (< 4 chars)
      expect(parseReceptionQr('B4C-JOINNOW')).toBeNull();
      // 5-char prefix (> 4 chars)
      expect(parseReceptionQr('B4C78-JOINNOW')).toBeNull();
      // Missing code after hyphen
      expect(parseReceptionQr('B4C7-')).toBeNull();
      // Leading hyphen
      expect(parseReceptionQr('-JOINNOW')).toBeNull();
      // Multiple hyphens
      expect(parseReceptionQr('B4C7-JOIN-NOW')).toBeNull();
      // Total length > 50 chars: 4 chars + 1 hyphen + 46 chars = 51 chars
      const overPrefixed = 'B4C7-' + 'Z'.repeat(46);
      expect(overPrefixed.length).toBe(51);
      expect(parseReceptionQr(overPrefixed)).toBeNull();
    });
  });

  // ── Dimension 3: Case Normalization & Whitespace Trimming ───────────────
  describe('Dimension 3: Case Normalization & Whitespace Trimming', () => {
    test('normalizes raw lowercase and mixed-case codes to uppercase', () => {
      expect(parseReceptionQr('apex2026')).toBe('APEX2026');
      expect(parseReceptionQr('b4c7-joinnow')).toBe('B4C7-JOINNOW');
      expect(parseReceptionQr('StJude2026')).toBe('STJUDE2026');
    });

    test('trims surrounding whitespace from raw join codes', () => {
      expect(parseReceptionQr('  APEX2026  ')).toBe('APEX2026');
      expect(parseReceptionQr('\t\nb4c7-joinnow\r\n')).toBe('B4C7-JOINNOW');
    });

    test('normalizes lowercase query params in URLs and deep links', () => {
      expect(parseReceptionQr('https://portal.clinicez.ph/join?code=apex2026')).toBe('APEX2026');
      expect(parseReceptionQr('clinicez://join?code=b4c7-joinnow')).toBe('B4C7-JOINNOW');
      expect(parseReceptionQr('https://portal.clinicez.ph/join?joinCode=stjude2026')).toBe('STJUDE2026');
    });
  });

  // ── Dimension 4: Custom App Schemes & Deep Links ────────────────────────
  describe('Dimension 4: Custom App Schemes & Deep Links', () => {
    test('parses standard clinicez://join?code= deep links', () => {
      const parsed = parseReceptionQrPayload('clinicez://join?code=VIP888');
      expect(parsed).not.toBeNull();
      expect(parsed?.joinCode).toBe('VIP888');
      expect(parsed?.clinicId).toBeUndefined();
    });

    test('parses clinicez://clinics/{id}/unlock?code= deep links and extracts clinicId', () => {
      const parsed = parseReceptionQrPayload('clinicez://clinics/clinic-ustp-cdo/unlock?code=VIP888');
      expect(parsed).not.toBeNull();
      expect(parsed?.joinCode).toBe('VIP888');
      expect(parsed?.clinicId).toBe('clinic-ustp-cdo');
    });

    test('parses clinicez:// deep links with joinCode parameter', () => {
      const parsed = parseReceptionQrPayload('clinicez://clinics/cdo-main/unlock?joinCode=B4C7-JOIN');
      expect(parsed).not.toBeNull();
      expect(parsed?.joinCode).toBe('B4C7-JOIN');
      expect(parsed?.clinicId).toBe('cdo-main');
    });

    test('supports explicit clinicId query parameter', () => {
      const parsed = parseReceptionQrPayload('clinicez://join?code=VIP888&clinicId=manual-clinic-99');
      expect(parsed).not.toBeNull();
      expect(parsed?.joinCode).toBe('VIP888');
      expect(parsed?.clinicId).toBe('manual-clinic-99');
    });

    test('handles reordered query parameters in deep links', () => {
      const parsed = parseReceptionQrPayload('clinicez://clinics/branch-01/unlock?utm_source=qr&code=VIP888&debug=false');
      expect(parsed).not.toBeNull();
      expect(parsed?.joinCode).toBe('VIP888');
      expect(parsed?.clinicId).toBe('branch-01');
    });

    test('rejects non-clinicez custom schemes and dangerous protocols', () => {
      expect(parseReceptionQrPayload('otherapp://join?code=VIP888')).toBeNull();
      expect(parseReceptionQrPayload('clinicez-evil://join?code=VIP888')).toBeNull();
      expect(parseReceptionQrPayload('javascript:alert(1)?code=VIP888')).toBeNull();
      expect(parseReceptionQrPayload('data:text/html,<script>alert(1)</script>?code=VIP888')).toBeNull();
      expect(parseReceptionQrPayload('file:///etc/passwd?code=VIP888')).toBeNull();
      expect(parseReceptionQrPayload('ftp://example.com/join?code=VIP888')).toBeNull();
    });
  });

  // ── Dimension 5: Web URLs (HTTP/HTTPS) & Canonical Dynamic Routes ───────
  describe('Dimension 5: Web URLs (HTTP/HTTPS) & Canonical Dynamic Routes', () => {
    test('parses canonical /join?code= web URLs', () => {
      const parsed = parseReceptionQrPayload('https://portal.clinicez.ph/join?code=APEX2026');
      expect(parsed).not.toBeNull();
      expect(parsed?.joinCode).toBe('APEX2026');
      expect(parsed?.tenantSlug).toBeUndefined();
      expect(parsed?.facilitySlug).toBeUndefined();
    });

    test('parses canonical /join/{tenantSlug}/{facilitySlug}?code= web URLs', () => {
      const parsed = parseReceptionQrPayload('https://portal.clinicez.ph/join/ustp-tenant/cdo-facility?code=APEX2026');
      expect(parsed).not.toBeNull();
      expect(parsed?.joinCode).toBe('APEX2026');
      expect(parsed?.tenantSlug).toBe('ustp-tenant');
      expect(parsed?.facilitySlug).toBe('cdo-facility');
    });

    test('supports http protocol and non-standard ports for local development', () => {
      const parsedHttp = parseReceptionQrPayload('http://localhost:3000/join?code=LOCALDEV');
      expect(parsedHttp).not.toBeNull();
      expect(parsedHttp?.joinCode).toBe('LOCALDEV');

      const parsedPort = parseReceptionQrPayload('https://192.168.1.100:8443/join/t/f?code=LANCODE');
      expect(parsedPort).not.toBeNull();
      expect(parsedPort?.joinCode).toBe('LANCODE');
      expect(parsedPort?.tenantSlug).toBe('t');
      expect(parsedPort?.facilitySlug).toBe('f');
    });

    test('confirms retired path-segment routes return null (dropped legacy scanning)', () => {
      // Legacy routes without ?code= must not extract the path as join code
      expect(parseReceptionQrPayload('https://portal.clinicez.ph/join/APEX2026')).toBeNull();
      expect(parseReceptionQrPayload('https://portal.clinicez.ph/join/tenant-1/VIP888')).toBeNull();
      expect(parseReceptionQrPayload('clinicez://join/VIP888')).toBeNull();
      expect(parseReceptionQrPayload('https://portal.clinicez.ph/rx-verify/RX-SECRET')).toBeNull();
      expect(parseReceptionQrPayload('https://portal.clinicez.ph/verify/med-cert/MC-01')).toBeNull();
    });
  });

  // ── Dimension 6: Path Traversal & Injection Payloads ───────────────────
  describe('Dimension 6: Path Traversal & Injection Payloads', () => {
    test('does not traverse or execute file path strings', () => {
      expect(parseReceptionQrPayload('../../etc/passwd')).toBeNull();
      expect(parseReceptionQrPayload('../join?code=VIP888')).toBeNull();
      expect(parseReceptionQrPayload('/etc/shadow')).toBeNull();
      expect(parseReceptionQrPayload('C:\\Windows\\System32\\cmd.exe')).toBeNull();
    });

    test('rejects path traversal inside code parameter', () => {
      expect(parseReceptionQrPayload('https://portal.clinicez.ph/join?code=../../etc/passwd')).toBeNull();
      expect(parseReceptionQrPayload('https://portal.clinicez.ph/join?code=..%2F..%2Fetc%2Fpasswd')).toBeNull();
      expect(parseReceptionQrPayload('clinicez://join?code=../../join')).toBeNull();
    });

    test('safe handling of path traversal in URL path with valid code', () => {
      // In a standard URL, /join/../../etc/passwd resolves path safely
      const parsed = parseReceptionQrPayload('https://evil.com/join/../../etc/passwd?code=VIP888');
      expect(parsed).not.toBeNull();
      expect(parsed?.joinCode).toBe('VIP888');
      // Must NOT extract etc/passwd as tenant/facility slugs
      expect(parsed?.tenantSlug).toBeUndefined();
      expect(parsed?.facilitySlug).toBeUndefined();
    });

    test('rejects SQL injection payloads in join codes and URL params', () => {
      const sqliPayloads = [
        "VIP888'; DROP TABLE clinics;--",
        "VIP888' OR '1'='1",
        "' UNION SELECT * FROM users--",
        "admin'--",
        "1; WAITFOR DELAY '0:0:5'--",
      ];
      for (const payload of sqliPayloads) {
        expect(parseReceptionQrPayload(payload)).toBeNull();
        expect(parseReceptionQrPayload(`https://portal.clinicez.ph/join?code=${encodeURIComponent(payload)}`)).toBeNull();
        expect(parseReceptionQrPayload(`clinicez://join?code=${encodeURIComponent(payload)}`)).toBeNull();
      }
    });

    test('rejects XSS and HTML tags in join codes', () => {
      const xssPayloads = [
        '<script>alert(1)</script>',
        '<img src=x onerror=alert(1)>',
        '"><script>alert(String.fromCharCode(88,83,83))</script>',
        'javascript:alert(1)',
      ];
      for (const payload of xssPayloads) {
        expect(parseReceptionQrPayload(payload)).toBeNull();
        expect(parseReceptionQrPayload(`https://portal.clinicez.ph/join?code=${encodeURIComponent(payload)}`)).toBeNull();
      }
    });

    test('rejects inner control characters, newlines, and null bytes while trimming trailing newlines', () => {
      // Inner control characters / null bytes must be rejected
      expect(parseReceptionQrPayload('VIP888\x00')).toBeNull();
      expect(parseReceptionQrPayload('VIP\r\n888')).toBeNull();
      expect(parseReceptionQrPayload('VIP\t888')).toBeNull();
      expect(parseReceptionQrPayload('\x1b[31mVIP888')).toBeNull();
      expect(parseReceptionQrPayload('https://portal.clinicez.ph/join?code=VIP\x00888')).toBeNull();

      // Trailing newlines on raw codes are trimmed by rawPayload.trim()
      expect(parseReceptionQrPayload('VIP888\r\n')).toEqual({ joinCode: 'VIP888' });
    });

    test('rejects unicode homoglyphs, emojis, and non-ASCII characters', () => {
      expect(parseReceptionQrPayload('VIP８８８')).toBeNull(); // Full-width digits
      expect(parseReceptionQrPayload('VİP888')).toBeNull(); // Turkish dotted I
      expect(parseReceptionQrPayload('VIP888🚀')).toBeNull();
      expect(parseReceptionQrPayload('https://portal.clinicez.ph/join?code=VIP888🚀')).toBeNull();
    });

    test('rejects special symbols and invalid punctuation', () => {
      const invalidSymbols = ['!@#$', 'VIP_888', 'VIP.888', 'VIP,888', 'VIP:888', 'VIP;888', 'VIP/888'];
      for (const sym of invalidSymbols) {
        expect(parseReceptionQrPayload(sym)).toBeNull();
      }
    });
  });

  // ── Dimension 7: Malformed URLs (Crash Resilience) ─────────────────────
  describe('Dimension 7: Malformed URLs (Crash Resilience)', () => {
    test('never crashes on invalid IPv6 hostnames or unparseable URLs', () => {
      expect(parseReceptionQrPayload('http://[invalid-ipv6/join?code=VIP888')).toBeNull();
      expect(parseReceptionQrPayload('http://:80/join?code=VIP888')).toBeNull();
      expect(parseReceptionQrPayload('https://')).toBeNull();
      expect(parseReceptionQrPayload('http:///')).toBeNull();
      expect(parseReceptionQrPayload('?code=VIP888')).toBeNull();
      expect(parseReceptionQrPayload('://join?code=VIP888')).toBeNull();
    });

    test('survives broken percent-encoding in query parameters', () => {
      expect(parseReceptionQrPayload('https://portal.clinicez.ph/join?code=%E0%A4%A')).toBeNull();
      expect(parseReceptionQrPayload('clinicez://join?code=%ZZ')).toBeNull();
      expect(parseReceptionQrPayload('clinicez://join?code=%')).toBeNull();
    });

    test('handles queries embedded in URL fragment/hash', () => {
      // In URL spec, #?code= is part of hash, not searchParams
      const fragmentUrl = 'https://portal.clinicez.ph/join#?code=VIP888';
      expect(parseReceptionQrPayload(fragmentUrl)).toBeNull();
    });
  });

  // ── Dimension 8: Convenience Wrapper parseReceptionQr ───────────────────
  describe('Dimension 8: Convenience Wrapper parseReceptionQr', () => {
    test('returns normalized string for valid inputs and null for invalid inputs', () => {
      expect(parseReceptionQr('clinicez://clinics/cdo/unlock?code=b4c7-join')).toBe('B4C7-JOIN');
      expect(parseReceptionQr('https://portal.clinicez.ph/join/t/f?code=apex2026')).toBe('APEX2026');
      expect(parseReceptionQr('stjude2026')).toBe('STJUDE2026');

      expect(parseReceptionQr('invalid_code')).toBeNull();
      expect(parseReceptionQr('')).toBeNull();
      expect(parseReceptionQr('https://portal.clinicez.ph/join/NOQUERY')).toBeNull();
    });
  });
});

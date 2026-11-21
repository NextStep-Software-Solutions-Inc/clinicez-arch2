import { describe, expect, it } from 'bun:test';
import { isVercelTelemetryAllowed, sanitizeAnalyticsUrl } from './analytics';

describe('isVercelTelemetryAllowed', () => {
  it('returns true for vercel.app preview and production subdomains', () => {
    expect(isVercelTelemetryAllowed('my-branch-preview.vercel.app')).toBe(true);
    expect(isVercelTelemetryAllowed('clinicez-portal.vercel.app')).toBe(true);
    expect(isVercelTelemetryAllowed('clinic-web.vercel.app')).toBe(true);
  });

  it('returns false for local and loopback addresses', () => {
    expect(isVercelTelemetryAllowed('localhost')).toBe(false);
    expect(isVercelTelemetryAllowed('127.0.0.1')).toBe(false);
    expect(isVercelTelemetryAllowed('::1')).toBe(false);
    expect(isVercelTelemetryAllowed('sub.localhost')).toBe(false);
    expect(isVercelTelemetryAllowed('app.lvh.me')).toBe(false);
  });

  it('returns false for private on-premise LAN IP addresses', () => {
    expect(isVercelTelemetryAllowed('192.168.1.100')).toBe(false);
    expect(isVercelTelemetryAllowed('10.0.0.50')).toBe(false);
    expect(isVercelTelemetryAllowed('172.16.0.2')).toBe(false);
    expect(isVercelTelemetryAllowed('172.31.255.255')).toBe(false);
  });

  it('returns false for internal and local network top-level domains', () => {
    expect(isVercelTelemetryAllowed('clinic.local')).toBe(false);
    expect(isVercelTelemetryAllowed('edge.internal')).toBe(false);
    expect(isVercelTelemetryAllowed('cashier.lan')).toBe(false);
  });

  it('respects explicit envOverride', () => {
    expect(isVercelTelemetryAllowed('192.168.1.1', 'true')).toBe(true);
    expect(isVercelTelemetryAllowed('my-branch.vercel.app', 'false')).toBe(false);
  });

  it('handles null, undefined, or empty hostname', () => {
    expect(isVercelTelemetryAllowed(null)).toBe(false);
    expect(isVercelTelemetryAllowed(undefined)).toBe(false);
    expect(isVercelTelemetryAllowed('')).toBe(false);
  });
});

describe('sanitizeAnalyticsUrl', () => {
  it('redacts sensitive query parameters', () => {
    const raw = 'https://portal.clinicez.com/join?code=XYZ789&source=qr&token=secret-token-123';
    const sanitized = sanitizeAnalyticsUrl(raw);
    expect(sanitized).toContain('code=%5BREDACTED%5D');
    expect(sanitized).toContain('token=%5BREDACTED%5D');
    expect(sanitized).toContain('source=qr');
    expect(sanitized).not.toContain('XYZ789');
    expect(sanitized).not.toContain('secret-token-123');
  });

  it('redacts sensitive path segments for tokens', () => {
    const rxVerify = 'https://portal.clinicez.com/verify/rx/abc-secret-uuid-12345';
    expect(sanitizeAnalyticsUrl(rxVerify)).toBe(
      'https://portal.clinicez.com/verify/rx/[REDACTED]'
    );

    const invite = '/invitations/inv-token-9999?source=email';
    expect(sanitizeAnalyticsUrl(invite)).toBe(
      '/invitations/[REDACTED]?source=email'
    );

    const labUpload = '/upload/lab/token-session-456?patient=1';
    expect(sanitizeAnalyticsUrl(labUpload)).toBe(
      '/upload/lab/[REDACTED]?patient=1'
    );
  });

  it('leaves clean routes untouched', () => {
    const cleanUrl = 'https://portal.clinicez.com/clinics/dashboard?tab=overview';
    expect(sanitizeAnalyticsUrl(cleanUrl)).toBe(cleanUrl);

    const relativeUrl = '/dashboard/billing?view=summary';
    expect(sanitizeAnalyticsUrl(relativeUrl)).toBe(relativeUrl);
  });
});

describe('sanitizeAnalyticsUrl - Healthcare Privacy & Redaction Parity', () => {
  it('redacts ref and sig query parameters', () => {
    const raw = 'https://portal.clinicez.ph/verify?ref=MC-2026-0001&sig=4FA8B19C30E2&channel=web';
    const sanitized = sanitizeAnalyticsUrl(raw);

    // Redacted sensitive parameters
    expect(sanitized).not.toContain('MC-2026-0001');
    expect(sanitized).not.toContain('4FA8B19C30E2');
    expect(decodeURI(sanitized)).toContain('ref=[REDACTED]');
    expect(decodeURI(sanitized)).toContain('sig=[REDACTED]');

    // Preserved non-sensitive parameters
    expect(sanitized).toContain('channel=web');
  });

  it('redacts sensitive document token in /verify/{kind}/{token} while preserving kind', () => {
    const raw = '/verify/med-cert/MC-01?sig=ABC&ref=XYZ';
    const sanitized = sanitizeAnalyticsUrl(raw);

    // Verifies acceptance criteria: /verify/med-cert/[REDACTED]?sig=[REDACTED]&ref=[REDACTED]
    expect(decodeURI(sanitized)).toBe('/verify/med-cert/[REDACTED]?sig=[REDACTED]&ref=[REDACTED]');
    expect(sanitized).not.toContain('MC-01');
    expect(sanitized).not.toContain('ABC');
    expect(sanitized).not.toContain('XYZ');
    expect(sanitized).toContain('/verify/med-cert/');
  });

  it('redacts prescription token in /verify/rx/{token} while preserving rx kind', () => {
    const raw = '/verify/rx/RX-SECRET-99';
    const sanitized = sanitizeAnalyticsUrl(raw);

    // Verifies acceptance criteria: /verify/rx/[REDACTED]
    expect(sanitized).toBe('/verify/rx/[REDACTED]');
    expect(sanitized).not.toContain('RX-SECRET-99');
    expect(sanitized).toContain('/verify/rx/');
  });

  it('handles absolute verify URLs with kind and token redaction', () => {
    const raw = 'https://portal.clinicez.ph/verify/referral/REF-TOP-SECRET?sig=4FA8B19C30E2';
    const sanitized = sanitizeAnalyticsUrl(raw);

    expect(sanitized).not.toContain('REF-TOP-SECRET');
    expect(sanitized).not.toContain('4FA8B19C30E2');
    expect(decodeURI(sanitized)).toBe(
      'https://portal.clinicez.ph/verify/referral/[REDACTED]?sig=[REDACTED]'
    );
  });

  it('leaves clean paths and non-sensitive routes untouched', () => {
    const cleanUrl = 'https://portal.clinicez.ph/join';
    expect(sanitizeAnalyticsUrl(cleanUrl)).toBe(cleanUrl);

    const facilityUrl = 'https://portal.clinicez.ph/join/ustp/cdo-campus';
    expect(sanitizeAnalyticsUrl(facilityUrl)).toBe(facilityUrl);

    const relativeUrl = '/dashboard/consultations?status=active';
    expect(sanitizeAnalyticsUrl(relativeUrl)).toBe(relativeUrl);
  });
});

describe('sanitizeAnalyticsUrl - Adversarial Casing & Parameter Redaction', () => {
  describe('Case-insensitive query parameter redaction for all 12 sensitive params', () => {
    it('redacts all sensitive parameters in UPPERCASE', () => {
      const raw =
        '/api/test?TOKEN=tok123&CODE=cod456&SECRET=sec789&INVITE=inv012&SESSION=ses345&SIGNATURE=sig678&SIG=s901&REF=r234&KEY=k567&AUTH=a890&PASSWORD=p123&PIN=4567';
      const sanitized = sanitizeAnalyticsUrl(raw);
      const decoded = decodeURI(sanitized);

      // Verify zero leakage of secrets
      expect(sanitized).not.toContain('tok123');
      expect(sanitized).not.toContain('cod456');
      expect(sanitized).not.toContain('sec789');
      expect(sanitized).not.toContain('inv012');
      expect(sanitized).not.toContain('ses345');
      expect(sanitized).not.toContain('sig678');
      expect(sanitized).not.toContain('s901');
      expect(sanitized).not.toContain('r234');
      expect(sanitized).not.toContain('k567');
      expect(sanitized).not.toContain('a890');
      expect(sanitized).not.toContain('p123');
      expect(sanitized).not.toContain('4567');

      // Verify all keys are redacted
      expect(decoded).toContain('TOKEN=[REDACTED]');
      expect(decoded).toContain('CODE=[REDACTED]');
      expect(decoded).toContain('SECRET=[REDACTED]');
      expect(decoded).toContain('INVITE=[REDACTED]');
      expect(decoded).toContain('SESSION=[REDACTED]');
      expect(decoded).toContain('SIGNATURE=[REDACTED]');
      expect(decoded).toContain('SIG=[REDACTED]');
      expect(decoded).toContain('REF=[REDACTED]');
      expect(decoded).toContain('KEY=[REDACTED]');
      expect(decoded).toContain('AUTH=[REDACTED]');
      expect(decoded).toContain('PASSWORD=[REDACTED]');
      expect(decoded).toContain('PIN=[REDACTED]');
    });

    it('redacts sensitive parameters in TitleCase / Capitalized casing', () => {
      const raw =
        '/verify?Ref=MC-999&Sig=SIG-888&Token=TOK-777&Code=COD-666&Secret=SEC-555&Invite=INV-444&Session=SES-333';
      const sanitized = sanitizeAnalyticsUrl(raw);
      const decoded = decodeURI(sanitized);

      expect(sanitized).not.toContain('MC-999');
      expect(sanitized).not.toContain('SIG-888');
      expect(sanitized).not.toContain('TOK-777');
      expect(sanitized).not.toContain('COD-666');
      expect(sanitized).not.toContain('SEC-555');
      expect(sanitized).not.toContain('INV-444');
      expect(sanitized).not.toContain('SES-333');

      expect(decoded).toContain('Ref=[REDACTED]');
      expect(decoded).toContain('Sig=[REDACTED]');
      expect(decoded).toContain('Token=[REDACTED]');
      expect(decoded).toContain('Code=[REDACTED]');
      expect(decoded).toContain('Secret=[REDACTED]');
      expect(decoded).toContain('Invite=[REDACTED]');
      expect(decoded).toContain('Session=[REDACTED]');
    });

    it('redacts sensitive parameters in mixed/unusual casing', () => {
      const raw = '/verify?rEf=VAL1&sIg=VAL2&tOkEn=VAL3&cOdE=VAL4&pIn=VAL5';
      const sanitized = sanitizeAnalyticsUrl(raw);
      const decoded = decodeURI(sanitized);

      expect(sanitized).not.toContain('VAL1');
      expect(sanitized).not.toContain('VAL2');
      expect(sanitized).not.toContain('VAL3');
      expect(sanitized).not.toContain('VAL4');
      expect(sanitized).not.toContain('VAL5');

      expect(decoded).toContain('rEf=[REDACTED]');
      expect(decoded).toContain('sIg=[REDACTED]');
      expect(decoded).toContain('tOkEn=[REDACTED]');
      expect(decoded).toContain('cOdE=[REDACTED]');
      expect(decoded).toContain('pIn=[REDACTED]');
    });
  });

  describe('Uppercase and mixed-case path prefix redaction', () => {
    it('redacts /VERIFY/{kind}/{token} with uppercase and mixed-case prefixes', () => {
      const cases = [
        ['/VERIFY/rx/RX-001', '/VERIFY/rx/[REDACTED]', 'RX-001'],
        ['/Verify/Rx/RX-002', '/Verify/Rx/[REDACTED]', 'RX-002'],
        ['/verify/RX/RX-003', '/verify/RX/[REDACTED]', 'RX-003'],
        ['/VERIFY/med-cert/MC-01', '/VERIFY/med-cert/[REDACTED]', 'MC-01'],
        ['/Verify/Med-Cert/MC-02', '/Verify/Med-Cert/[REDACTED]', 'MC-02'],
        ['/VERIFY/lab-report/LR-999', '/VERIFY/lab-report/[REDACTED]', 'LR-999'],
        ['/Verify/Referral/REF-888', '/Verify/Referral/[REDACTED]', 'REF-888'],
      ];

      for (const [input, expected, secret] of cases) {
        const sanitized = sanitizeAnalyticsUrl(input);
        expect(sanitized).toBe(expected);
        expect(sanitized).not.toContain(secret);
      }
    });

    it('redacts /RESET-PASSWORD/{token} with uppercase and mixed-case prefixes', () => {
      expect(sanitizeAnalyticsUrl('/RESET-PASSWORD/PW-SECRET-01')).toBe(
        '/RESET-PASSWORD/[REDACTED]'
      );
      expect(sanitizeAnalyticsUrl('/Reset-Password/PW-SECRET-02')).toBe(
        '/Reset-Password/[REDACTED]'
      );
      expect(sanitizeAnalyticsUrl('/reset-password/PW-SECRET-03')).toBe(
        '/reset-password/[REDACTED]'
      );
    });

    it('redacts /UPLOAD/{kind}/{token} with uppercase and mixed-case prefixes', () => {
      expect(sanitizeAnalyticsUrl('/UPLOAD/rx/UP-RX-001')).toBe(
        '/UPLOAD/rx/[REDACTED]'
      );
      expect(sanitizeAnalyticsUrl('/Upload/Rx/UP-RX-002')).toBe(
        '/Upload/Rx/[REDACTED]'
      );
      expect(sanitizeAnalyticsUrl('/upload/RX/UP-RX-003')).toBe(
        '/upload/RX/[REDACTED]'
      );
      expect(sanitizeAnalyticsUrl('/UPLOAD/lab/UP-LAB-001')).toBe(
        '/UPLOAD/lab/[REDACTED]'
      );
      expect(sanitizeAnalyticsUrl('/Upload/Lab/UP-LAB-002')).toBe(
        '/Upload/Lab/[REDACTED]'
      );
      expect(sanitizeAnalyticsUrl('/upload/LAB/UP-LAB-003')).toBe(
        '/upload/LAB/[REDACTED]'
      );
    });

    it('redacts /INVITATIONS/{token} with uppercase and mixed-case prefixes', () => {
      expect(sanitizeAnalyticsUrl('/INVITATIONS/INV-SECRET-01')).toBe(
        '/INVITATIONS/[REDACTED]'
      );
      expect(sanitizeAnalyticsUrl('/Invitations/INV-SECRET-02')).toBe(
        '/Invitations/[REDACTED]'
      );
      expect(sanitizeAnalyticsUrl('/invitations/INV-SECRET-03')).toBe(
        '/invitations/[REDACTED]'
      );
    });
  });

  describe('Preservation of non-sensitive query parameters and path semantics', () => {
    it('preserves non-sensitive query parameters alongside uppercase sensitive parameters', () => {
      const raw =
        'https://portal.clinicez.ph/verify?page=2&REF=MC-2026-0001&limit=25&SIG=4FA8B19C30E2&source=mobile&status=valid';
      const sanitized = sanitizeAnalyticsUrl(raw);
      const decoded = decodeURI(sanitized);

      // Sensitive parameters are redacted
      expect(sanitized).not.toContain('MC-2026-0001');
      expect(sanitized).not.toContain('4FA8B19C30E2');
      expect(decoded).toContain('REF=[REDACTED]');
      expect(decoded).toContain('SIG=[REDACTED]');

      // Non-sensitive parameters are preserved exactly
      expect(sanitized).toContain('page=2');
      expect(sanitized).toContain('limit=25');
      expect(sanitized).toContain('source=mobile');
      expect(sanitized).toContain('status=valid');
    });

    it('preserves near-miss parameter names that are not in sensitive list', () => {
      const raw =
        '/api/lookup?referral_type=internal&reference_id=REF-123&codec=h264&keyboard=qwerty&author=dr-santos&session_type=teleconsult';
      const sanitized = sanitizeAnalyticsUrl(raw);

      expect(sanitized).toBe(raw);
    });

    it('preserves clean public routes without path tokens', () => {
      expect(sanitizeAnalyticsUrl('/JOIN')).toBe('/JOIN');
      expect(sanitizeAnalyticsUrl('/CLAIM')).toBe('/CLAIM');
      expect(sanitizeAnalyticsUrl('/VERIFY')).toBe('/VERIFY');
      expect(
        sanitizeAnalyticsUrl('https://portal.clinicez.ph/JOIN/tenant-1/facility-1')
      ).toBe('https://portal.clinicez.ph/JOIN/tenant-1/facility-1');
    });
  });

  describe('Repeated, duplicate, and edge case query parameters', () => {
    it('redacts duplicate sensitive parameters with same casing without error', () => {
      const raw = '/verify?REF=FIRST_REF&REF=SECOND_REF';
      const sanitized = sanitizeAnalyticsUrl(raw);
      const decoded = decodeURI(sanitized);

      expect(sanitized).not.toContain('FIRST_REF');
      expect(sanitized).not.toContain('SECOND_REF');
      expect(decoded).toBe('/verify?REF=[REDACTED]');
    });

    it('redacts duplicate sensitive parameters with mixed casings', () => {
      const raw = '/claim?token=LOWER&TOKEN=UPPER&Token=TITLE';
      const sanitized = sanitizeAnalyticsUrl(raw);
      const decoded = decodeURI(sanitized);

      expect(sanitized).not.toContain('LOWER');
      expect(sanitized).not.toContain('UPPER');
      expect(sanitized).not.toContain('TITLE');
      expect(decoded).toContain('token=[REDACTED]');
      expect(decoded).toContain('TOKEN=[REDACTED]');
      expect(decoded).toContain('Token=[REDACTED]');
    });

    it('preserves duplicate non-sensitive parameters', () => {
      const raw = '/search?tag=pediatric&tag=urgent&filter=all';
      const sanitized = sanitizeAnalyticsUrl(raw);

      expect(sanitized).toBe(raw);
    });

    it('handles empty sensitive parameter values safely', () => {
      const raw = '/verify?REF=&SIG=&TOKEN=&CODE=';
      const sanitized = sanitizeAnalyticsUrl(raw);
      const decoded = decodeURI(sanitized);

      expect(decoded).toBe(
        '/verify?REF=[REDACTED]&SIG=[REDACTED]&TOKEN=[REDACTED]&CODE=[REDACTED]'
      );
    });

    it('handles combined uppercase path and uppercase query parameters on absolute URLs', () => {
      const raw =
        'https://portal.clinicez.ph:8443/VERIFY/rx/RX-SECRET-999?REF=MC-SECRET-888&SIG=SIG-SECRET-777&client=web';
      const sanitized = sanitizeAnalyticsUrl(raw);
      const decoded = decodeURI(sanitized);

      expect(sanitized).not.toContain('RX-SECRET-999');
      expect(sanitized).not.toContain('MC-SECRET-888');
      expect(sanitized).not.toContain('SIG-SECRET-777');

      expect(decoded).toBe(
        'https://portal.clinicez.ph:8443/VERIFY/rx/[REDACTED]?REF=[REDACTED]&SIG=[REDACTED]&client=web'
      );
    });
  });
});


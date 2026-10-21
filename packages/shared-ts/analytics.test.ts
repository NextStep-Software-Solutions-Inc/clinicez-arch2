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
    const rxVerify = 'https://portal.clinicez.com/rx-verify/abc-secret-uuid-12345';
    expect(sanitizeAnalyticsUrl(rxVerify)).toBe(
      'https://portal.clinicez.com/rx-verify/[REDACTED]'
    );

    const invite = '/invitations/inv-token-9999?ref=email';
    expect(sanitizeAnalyticsUrl(invite)).toBe(
      '/invitations/[REDACTED]?ref=email'
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

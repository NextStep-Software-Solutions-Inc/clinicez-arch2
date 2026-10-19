import { describe, expect, it } from 'bun:test';
import { DEFAULT_API_URL_TEMPLATE, resolveServiceApiUrl, ensureApiPrefix, stripApiPrefix, joinApiUrl } from './apiUrl';

describe('resolveServiceApiUrl', () => {
  it('uses the explicit dev port on localhost, virtual hosts and direct IPs', () => {
    expect(resolveServiceApiUrl({ hostname: 'localhost', protocol: 'http:' })).toBe('http://localhost:5245');
    expect(resolveServiceApiUrl({ hostname: 'acme.clinic.localhost', protocol: 'http:', fallbackPort: 5001 })).toBe(
      'http://acme.clinic.localhost:5001',
    );
    expect(resolveServiceApiUrl({ hostname: '192.168.1.20', protocol: 'http:' })).toBe('http://192.168.1.20:5245');
  });

  it('falls back to localhost when there is no browser hostname', () => {
    expect(resolveServiceApiUrl({})).toBe('http://localhost:5245');
  });

  it('infers the base domain from <facility>.<service>.<baseDomain> without knowing the domain', () => {
    expect(resolveServiceApiUrl({ hostname: 'north.clinic.acmehealth.com', protocol: 'https:' })).toBe(
      'https://clinic-api.acmehealth.com',
    );
    expect(resolveServiceApiUrl({ hostname: 'clinic.dev.example.org', protocol: 'https:' })).toBe(
      'https://clinic-api.dev.example.org',
    );
  });

  it('honours a custom service subdomain', () => {
    expect(
      resolveServiceApiUrl({ hostname: 'north.medical.acmehealth.com', protocol: 'https:', serviceSubdomain: 'medical' }),
    ).toBe('https://medical-api.acmehealth.com');
  });

  it('prefers an explicit base domain (e.g. Vercel preview hosts)', () => {
    expect(
      resolveServiceApiUrl({ hostname: 'my-branch-abc123.vercel.app', protocol: 'https:', baseDomain: 'acmehealth.com' }),
    ).toBe('https://clinic-api.acmehealth.com');
  });

  it('supports a URL template with {service}, {baseDomain} and {facility}', () => {
    expect(
      resolveServiceApiUrl({
        hostname: 'north.clinic.acmehealth.com',
        protocol: 'https:',
        template: 'https://{service}.api.{baseDomain}',
      }),
    ).toBe('https://clinic.api.acmehealth.com');
    expect(
      resolveServiceApiUrl({
        hostname: 'north.clinic.acmehealth.com',
        protocol: 'https:',
        template: 'https://{facility}-gw.{baseDomain}/',
      }),
    ).toBe('https://north-gw.acmehealth.com');
    expect(DEFAULT_API_URL_TEMPLATE).toContain('{baseDomain}');
  });

  it('defaults to same-origin when the base domain cannot be determined', () => {
    expect(resolveServiceApiUrl({ hostname: 'app.acmehealth.com', protocol: 'https:' })).toBe('https://app.acmehealth.com');
  });
});

describe('ensureApiPrefix', () => {
  it('appends /api/v1 when missing', () => {
    expect(ensureApiPrefix('https://clinic-api.example.com')).toBe('https://clinic-api.example.com/api/v1');
    expect(ensureApiPrefix('https://clinic-api.example.com/')).toBe('https://clinic-api.example.com/api/v1');
    expect(ensureApiPrefix('http://localhost:5245')).toBe('http://localhost:5245/api/v1');
  });

  it('keeps /api/v1 without duplicating when already present', () => {
    expect(ensureApiPrefix('https://clinic-api.example.com/api/v1')).toBe('https://clinic-api.example.com/api/v1');
    expect(ensureApiPrefix('https://clinic-api.example.com/api/v1/')).toBe('https://clinic-api.example.com/api/v1');
    expect(ensureApiPrefix('https://clinic-api.example.com/api/v1/api/v1')).toBe('https://clinic-api.example.com/api/v1');
  });

  it('returns empty string for null/empty', () => {
    expect(ensureApiPrefix('')).toBe('');
    expect(ensureApiPrefix(null)).toBe('');
    expect(ensureApiPrefix('   ')).toBe('');
  });
});

describe('stripApiPrefix', () => {
  it('strips /api/v1 and trailing slashes', () => {
    expect(stripApiPrefix('https://clinic-api.example.com/api/v1')).toBe('https://clinic-api.example.com');
    expect(stripApiPrefix('https://clinic-api.example.com/api/v1/')).toBe('https://clinic-api.example.com');
    expect(stripApiPrefix('https://clinic-api.example.com/')).toBe('https://clinic-api.example.com');
    expect(stripApiPrefix('https://clinic-api.example.com')).toBe('https://clinic-api.example.com');
  });

  it('returns empty string for null/empty', () => {
    expect(stripApiPrefix('')).toBe('');
    expect(stripApiPrefix(null)).toBe('');
  });
});

describe('joinApiUrl', () => {
  it('never double-appends /api/v1 whether base or path already includes it', () => {
    expect(joinApiUrl('https://clinic-api.example.com/api/v1', '/api/v1/public/rx-verify/123')).toBe(
      'https://clinic-api.example.com/api/v1/public/rx-verify/123',
    );
    expect(joinApiUrl('https://clinic-api.example.com', '/api/v1/public/rx-verify/123')).toBe(
      'https://clinic-api.example.com/api/v1/public/rx-verify/123',
    );
    expect(joinApiUrl('https://clinic-api.example.com/api/v1', '/public/rx-verify/123')).toBe(
      'https://clinic-api.example.com/api/v1/public/rx-verify/123',
    );
    expect(joinApiUrl('https://clinic-api.example.com', '/public/rx-verify/123')).toBe(
      'https://clinic-api.example.com/api/v1/public/rx-verify/123',
    );
    expect(joinApiUrl('http://localhost:5245/', 'prescriptions/1/slip-pdf')).toBe(
      'http://localhost:5245/api/v1/prescriptions/1/slip-pdf',
    );
    expect(joinApiUrl('http://localhost:5245/api/v1/', '/prescriptions/1/slip-pdf')).toBe(
      'http://localhost:5245/api/v1/prescriptions/1/slip-pdf',
    );
  });
});


import { describe, expect, it } from 'bun:test';
import {
  buildServiceHostRegex,
  extractTenantFromHostname,
  getServiceSubdomains,
  isRootHostname,
  isValidTenantSlug,
  parseServiceSubdomains,
  RESERVED_SUBDOMAINS,
  ROOT_HOSTNAMES,
} from './tenant';

describe('isRootHostname', () => {
  it('correctly recognizes root domains', () => {
    expect(isRootHostname('clinic.dev.example.com')).toBe(true);
    expect(isRootHostname('clinic.example.com')).toBe(true);
    expect(isRootHostname('lab.dev.example.com')).toBe(true);
    expect(isRootHostname('lab.example.com')).toBe(true);
    expect(isRootHostname('pharmacy.dev.example.com')).toBe(true);
    expect(isRootHostname('pharmacy.example.com')).toBe(true);
    expect(isRootHostname('dev.example.com')).toBe(true);
    expect(isRootHostname('example.com')).toBe(true);
    expect(isRootHostname('www.example.com')).toBe(true);
    expect(isRootHostname('localhost:8081')).toBe(true);
    expect(isRootHostname('clinic.localhost')).toBe(true);
    expect(isRootHostname('192.168.1.100')).toBe(true);
    expect(isRootHostname('127.0.0.1')).toBe(true);
  });

  it('correctly rejects tenant subdomains as non-root', () => {
    expect(isRootHostname('tenant1.clinic.dev.example.com')).toBe(false);
    expect(isRootHostname('tenant1.clinic.example.com')).toBe(false);
    expect(isRootHostname('metro-health.dev.example.com')).toBe(false);
    expect(isRootHostname('st-jude.example.com')).toBe(false);
    expect(isRootHostname('tenant1.clinic.localhost')).toBe(false);
  });
});

describe('isValidTenantSlug', () => {
  it('validates well-formed slugs', () => {
    expect(isValidTenantSlug('tenant1')).toBe(true);
    expect(isValidTenantSlug('metro-health')).toBe(true);
    expect(isValidTenantSlug('st-jude-clinic')).toBe(true);
  });

  it('rejects invalid or reserved slugs', () => {
    expect(isValidTenantSlug('clinic.dev')).toBe(false);
    expect(isValidTenantSlug('clinic')).toBe(false);
    expect(isValidTenantSlug('dev')).toBe(false);
    expect(isValidTenantSlug('admin')).toBe(false);
    expect(isValidTenantSlug('a')).toBe(false);
    expect(isValidTenantSlug('')).toBe(false);
    expect(isValidTenantSlug(null)).toBe(false);
    expect(isValidTenantSlug('-tenant')).toBe(false);
  });
});

describe('extractTenantFromHostname', () => {
  it('extracts tenant from nested service subdomain (*.clinic.dev.example.com)', () => {
    expect(extractTenantFromHostname('tenant1.clinic.dev.example.com')).toBe('tenant1');
    expect(extractTenantFromHostname('metro-health.clinic.dev.example.com:8081')).toBe('metro-health');
  });

  it('extracts tenant from production nested subdomain (*.clinic.example.com)', () => {
    expect(extractTenantFromHostname('tenant1.clinic.example.com')).toBe('tenant1');
    expect(extractTenantFromHostname('metro-health.lab.example.com')).toBe('metro-health');
    expect(extractTenantFromHostname('st-jude.pharmacy.example.com')).toBe('st-jude');
  });

  it('extracts tenant/facility slug from arbitrary custom or staging base domains', () => {
    expect(extractTenantFromHostname('facility1.clinic.staging.example.com')).toBe('facility1');
    expect(extractTenantFromHostname('st-luke.clinic.hospital.ph')).toBe('st-luke');
    expect(extractTenantFromHostname('acme-lab.lab.myenterprise.com')).toBe('acme-lab');
    expect(extractTenantFromHostname('central-rx.pharmacy.healthnetwork.org')).toBe('central-rx');
    expect(extractTenantFromHostname('headquarters.org.healthnetwork.org')).toBe('headquarters');
    expect(extractTenantFromHostname('clinic-branch-a.clinic.custom-domain.io:8081')).toBe('clinic-branch-a');
  });

  it('extracts tenant from portal dev wildcard (*.dev.example.com)', () => {
    expect(extractTenantFromHostname('tenant1.dev.example.com')).toBe('tenant1');
    expect(extractTenantFromHostname('notfound.dev.example.com')).toBe('notfound');
  });

  it('extracts tenant from portal production wildcard (*.example.com)', () => {
    expect(extractTenantFromHostname('tenant1.example.com')).toBe('tenant1');
    expect(extractTenantFromHostname('metro-health.example.com')).toBe('metro-health');
  });

  it('extracts tenant from local development virtual hosts (*.localhost, *.lvh.me)', () => {
    expect(extractTenantFromHostname('tenant1.clinic.localhost:8081')).toBe('tenant1');
    expect(extractTenantFromHostname('tenant1.localhost:3000')).toBe('tenant1');
    expect(extractTenantFromHostname('metro.lvh.me:8081')).toBe('metro');
  });

  it('returns null for all root domains (no tenant assigned)', () => {
    expect(extractTenantFromHostname('clinic.dev.example.com')).toBe(null);
    expect(extractTenantFromHostname('clinic.example.com')).toBe(null);
    expect(extractTenantFromHostname('lab.dev.example.com')).toBe(null);
    expect(extractTenantFromHostname('lab.example.com')).toBe(null);
    expect(extractTenantFromHostname('pharmacy.dev.example.com')).toBe(null);
    expect(extractTenantFromHostname('pharmacy.example.com')).toBe(null);
    expect(extractTenantFromHostname('dev.example.com')).toBe(null);
    expect(extractTenantFromHostname('example.com')).toBe(null);
    expect(extractTenantFromHostname('www.example.com')).toBe(null);
    expect(extractTenantFromHostname('api.example.com')).toBe(null);
    expect(extractTenantFromHostname('api.dev.example.com')).toBe(null);
    expect(extractTenantFromHostname('localhost:8081')).toBe(null);
    expect(extractTenantFromHostname('clinic.localhost')).toBe(null);
    expect(extractTenantFromHostname('192.168.1.100')).toBe(null);
  });
});

describe('configurable service subdomains', () => {
  const withServiceSubdomains = <T>(value: string | undefined, run: () => T): T => {
    const previous = process.env.EXPO_PUBLIC_SERVICE_SUBDOMAINS;
    if (value === undefined) {
      delete process.env.EXPO_PUBLIC_SERVICE_SUBDOMAINS;
    } else {
      process.env.EXPO_PUBLIC_SERVICE_SUBDOMAINS = value;
    }
    try {
      return run();
    } finally {
      if (previous === undefined) {
        delete process.env.EXPO_PUBLIC_SERVICE_SUBDOMAINS;
      } else {
        process.env.EXPO_PUBLIC_SERVICE_SUBDOMAINS = previous;
      }
    }
  };

  it('defaults to clinic, lab, pharmacy, org when nothing is configured', () => {
    withServiceSubdomains(undefined, () => {
      expect(getServiceSubdomains()).toEqual(['clinic', 'lab', 'pharmacy', 'org']);
    });
  });

  it('parses comma separated overrides and ignores invalid labels', () => {
    expect(parseServiceSubdomains('Medical, imaging ,,bad_label,medical')).toEqual(['medical', 'imaging']);
    expect(parseServiceSubdomains('')).toEqual(['clinic', 'lab', 'pharmacy', 'org']);
    expect(parseServiceSubdomains('!!!')).toEqual(['clinic', 'lab', 'pharmacy', 'org']);
  });

  it('recognises custom service subdomains for tenant extraction and root detection', () => {
    withServiceSubdomains('medical,imaging', () => {
      expect(extractTenantFromHostname('facility1.medical.acmehealth.com')).toBe('facility1');
      expect(extractTenantFromHostname('scan-hub.imaging.acmehealth.com')).toBe('scan-hub');
      expect(isRootHostname('medical.acmehealth.com')).toBe(true);
      expect(isValidTenantSlug('medical')).toBe(false);
    });
  });

  it('builds a service host regex with captured slug, service and base domain', () => {
    const match = 'facility1.medical.acmehealth.com'.match(buildServiceHostRegex(['medical']));
    expect(match?.[1]).toBe('facility1');
    expect(match?.[2]).toBe('medical');
    expect(match?.[3]).toBe('acmehealth.com');
  });
});
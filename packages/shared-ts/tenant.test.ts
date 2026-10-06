import { describe, expect, it } from 'bun:test';
import {
  extractTenantFromHostname,
  isRootHostname,
  isValidTenantSlug,
  RESERVED_SUBDOMAINS,
  ROOT_HOSTNAMES,
} from './tenant';

describe('isRootHostname', () => {
  it('correctly recognizes root domains', () => {
    expect(isRootHostname('clinic.dev.clinicez.net')).toBe(true);
    expect(isRootHostname('clinic.clinicez.net')).toBe(true);
    expect(isRootHostname('lab.dev.clinicez.net')).toBe(true);
    expect(isRootHostname('lab.clinicez.net')).toBe(true);
    expect(isRootHostname('pharmacy.dev.clinicez.net')).toBe(true);
    expect(isRootHostname('pharmacy.clinicez.net')).toBe(true);
    expect(isRootHostname('dev.clinicez.net')).toBe(true);
    expect(isRootHostname('clinicez.net')).toBe(true);
    expect(isRootHostname('www.clinicez.net')).toBe(true);
    expect(isRootHostname('localhost:8081')).toBe(true);
    expect(isRootHostname('clinic.localhost')).toBe(true);
    expect(isRootHostname('192.168.1.100')).toBe(true);
    expect(isRootHostname('127.0.0.1')).toBe(true);
  });

  it('correctly rejects tenant subdomains as non-root', () => {
    expect(isRootHostname('tenant1.clinic.dev.clinicez.net')).toBe(false);
    expect(isRootHostname('tenant1.clinic.clinicez.net')).toBe(false);
    expect(isRootHostname('metro-health.dev.clinicez.net')).toBe(false);
    expect(isRootHostname('st-jude.clinicez.net')).toBe(false);
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
  it('extracts tenant from nested service subdomain (*.clinic.dev.clinicez.net)', () => {
    expect(extractTenantFromHostname('tenant1.clinic.dev.clinicez.net')).toBe('tenant1');
    expect(extractTenantFromHostname('metro-health.clinic.dev.clinicez.net:8081')).toBe('metro-health');
  });

  it('extracts tenant from production nested subdomain (*.clinic.clinicez.net)', () => {
    expect(extractTenantFromHostname('tenant1.clinic.clinicez.net')).toBe('tenant1');
    expect(extractTenantFromHostname('metro-health.lab.clinicez.net')).toBe('metro-health');
    expect(extractTenantFromHostname('st-jude.pharmacy.clinicez.net')).toBe('st-jude');
  });

  it('extracts tenant from portal dev wildcard (*.dev.clinicez.net)', () => {
    expect(extractTenantFromHostname('tenant1.dev.clinicez.net')).toBe('tenant1');
    expect(extractTenantFromHostname('notfound.dev.clinicez.net')).toBe('notfound');
  });

  it('extracts tenant from portal production wildcard (*.clinicez.net)', () => {
    expect(extractTenantFromHostname('tenant1.clinicez.net')).toBe('tenant1');
    expect(extractTenantFromHostname('metro-health.clinicez.net')).toBe('metro-health');
  });

  it('extracts tenant from local development virtual hosts (*.localhost, *.lvh.me)', () => {
    expect(extractTenantFromHostname('tenant1.clinic.localhost:8081')).toBe('tenant1');
    expect(extractTenantFromHostname('tenant1.localhost:3000')).toBe('tenant1');
    expect(extractTenantFromHostname('metro.lvh.me:8081')).toBe('metro');
  });

  it('returns null for all root domains (no tenant assigned)', () => {
    expect(extractTenantFromHostname('clinic.dev.clinicez.net')).toBe(null);
    expect(extractTenantFromHostname('clinic.clinicez.net')).toBe(null);
    expect(extractTenantFromHostname('lab.dev.clinicez.net')).toBe(null);
    expect(extractTenantFromHostname('lab.clinicez.net')).toBe(null);
    expect(extractTenantFromHostname('pharmacy.dev.clinicez.net')).toBe(null);
    expect(extractTenantFromHostname('pharmacy.clinicez.net')).toBe(null);
    expect(extractTenantFromHostname('dev.clinicez.net')).toBe(null);
    expect(extractTenantFromHostname('clinicez.net')).toBe(null);
    expect(extractTenantFromHostname('www.clinicez.net')).toBe(null);
    expect(extractTenantFromHostname('api.clinicez.net')).toBe(null);
    expect(extractTenantFromHostname('api.dev.clinicez.net')).toBe(null);
    expect(extractTenantFromHostname('localhost:8081')).toBe(null);
    expect(extractTenantFromHostname('clinic.localhost')).toBe(null);
    expect(extractTenantFromHostname('192.168.1.100')).toBe(null);
  });
});

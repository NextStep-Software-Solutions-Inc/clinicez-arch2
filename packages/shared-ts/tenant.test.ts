import { describe, expect, it } from 'bun:test';
import { extractTenantFromHostname } from './tenant';

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

  it('returns null for reserved subdomains', () => {
    expect(extractTenantFromHostname('dev.clinicez.net')).toBe(null);
    expect(extractTenantFromHostname('www.clinicez.net')).toBe(null);
    expect(extractTenantFromHostname('api.clinicez.net')).toBe(null);
    expect(extractTenantFromHostname('clinic.clinicez.net')).toBe(null);
    expect(extractTenantFromHostname('localhost:8081')).toBe(null);
  });
});

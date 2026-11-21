import { describe, it, expect } from 'bun:test';
import { getEnvironmentBadge } from '../src/lib/envBadge';

describe('Header Environment Badge Resolution (LOCAL / DEV / PROD)', () => {
  it('identifies loopback, lvh.me, .local, IPv6, and Vite dev LAN IPs as LOCAL', () => {
    expect(getEnvironmentBadge('localhost')).toBe('LOCAL');
    expect(getEnvironmentBadge('admin.localhost')).toBe('LOCAL');
    expect(getEnvironmentBadge('127.0.0.1')).toBe('LOCAL');
    expect(getEnvironmentBadge('[::1]')).toBe('LOCAL');
    expect(getEnvironmentBadge('admin.lvh.me')).toBe('LOCAL');
    expect(getEnvironmentBadge('workstation.local')).toBe('LOCAL');
    expect(getEnvironmentBadge('192.168.1.45', { isDevBuild: true })).toBe('LOCAL');
    expect(getEnvironmentBadge('10.0.0.12', { isDevBuild: true })).toBe('LOCAL');
  });

  it('identifies Vercel preview/dev deployments and hyphenated/subdomain dev hosts as DEV (never PROD)', () => {
    expect(getEnvironmentBadge('clinicez-admin-web.vercel.app')).toBe('DEV');
    expect(getEnvironmentBadge('admin-web-git-migrate-nextstep.vercel.app')).toBe('DEV');
    expect(getEnvironmentBadge('admin.dev.clinicez.net')).toBe('DEV');
    expect(getEnvironmentBadge('admin-dev.clinicez.net')).toBe('DEV');
    expect(getEnvironmentBadge('dev-admin.clinicez.net')).toBe('DEV');
    expect(getEnvironmentBadge('staging.clinicez.com')).toBe('DEV');
    expect(getEnvironmentBadge('admin.clinicez.dev')).toBe('DEV');
  });

  it('identifies development environments via Vite mode, upstream dev API/domain URLs, or Clerk pk_test_ key even on generic hostnames', () => {
    // Vite dev server
    expect(getEnvironmentBadge('custom.domain.net', { isDevBuild: true })).toBe('DEV');
    expect(getEnvironmentBadge('custom.domain.net', { mode: 'development' })).toBe('DEV');

    // Vercel preview env signal
    expect(getEnvironmentBadge('custom.domain.net', { vercelEnv: 'preview' })).toBe('DEV');

    // Upstream VITE_PORTAL_API_URL or VITE_BASE_DOMAIN targeting dev infrastructure
    expect(
      getEnvironmentBadge('admin.clinicez.net', {
        portalApiUrl: 'https://clinicez-portal.api.dev.nextstep-software.com/api/v1',
      })
    ).toBe('DEV');
    expect(
      getEnvironmentBadge('admin.clinicez.net', {
        baseDomain: 'dev.clinicez.net',
      })
    ).toBe('DEV');

    // Clerk development publishable key (pk_test_...)
    expect(
      getEnvironmentBadge('admin.clinicez.net', {
        clerkPublishableKey: 'pk_test_YW1hemluZy1tb3NxdWl0by03NS5jbGVyay5hY2NvdW50cy5kZXYk',
      })
    ).toBe('DEV');
  });

  it('honors explicit VITE_APP_ENV override when set', () => {
    expect(getEnvironmentBadge('admin.clinicez.com', { appEnv: 'dev' })).toBe('DEV');
    expect(getEnvironmentBadge('admin.clinicez.com', { appEnv: 'local' })).toBe('LOCAL');
    expect(
      getEnvironmentBadge('clinicez-admin-web.vercel.app', {
        appEnv: 'prod',
        clerkPublishableKey: 'pk_test_override',
      })
    ).toBe('PROD');
  });

  it('identifies true production deployments with live domain, live API, and pk_live_ Clerk key as PROD', () => {
    expect(
      getEnvironmentBadge('admin.clinicez.com', {
        mode: 'production',
        isDevBuild: false,
        baseDomain: 'clinicez.com',
        portalApiUrl: 'https://portal-api.clinicez.com/api/v1',
        clerkPublishableKey: 'pk_live_Y2xpbmljZXpfcHJvZF9rZXk=',
      })
    ).toBe('PROD');

    // Substring "dev" inside a word like "aidevops.com" does not false-trigger DEV
    expect(getEnvironmentBadge('admin.aidevops.com')).toBe('PROD');
  });
});

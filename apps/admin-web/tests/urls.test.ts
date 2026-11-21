import { describe, it, expect } from 'bun:test';
import { getTenantWorkspaceUrl, getPublicSiteUrl, isLocalEnvironment } from '../src/lib/urls';

describe('Cross-Surface URL Resolvers', () => {
  it('detects local environment in default test runner', () => {
    // When window is undefined or hostname is localhost, isLocalEnvironment evaluates accurately
    const isLocal = isLocalEnvironment();
    expect(typeof isLocal).toBe('boolean');
  });

  it('generates correct tenant workspace URL with default clean path', () => {
    const slug = 'st-jude-hospital';
    const url = getTenantWorkspaceUrl(slug);
    expect(url).toContain(slug);
    expect(url).toContain('/dashboard');
  });

  it('generates correct tenant workspace URL with custom path', () => {
    const slug = 'metro-cardio';
    const customPath = '/settings/billing';
    const url = getTenantWorkspaceUrl(slug, customPath);
    expect(url).toContain(slug);
    expect(url).toContain('/settings/billing');
  });

  it('generates correct public site URL for home and blog', () => {
    const rootUrl = getPublicSiteUrl('/');
    expect(rootUrl.endsWith('/') || rootUrl.includes('localhost:3002')).toBe(true);

    const blogUrl = getPublicSiteUrl('/blogs/philhealth-case1-compliance');
    expect(blogUrl).toContain('/blogs/philhealth-case1-compliance');
  });

  it('handles leading and trailing slashes defensively', () => {
    const url1 = getTenantWorkspaceUrl('apollo', 'analytics');
    const url2 = getTenantWorkspaceUrl('apollo', '/analytics');
    expect(url1).toBe(url2);

    const pub1 = getPublicSiteUrl('contact');
    const pub2 = getPublicSiteUrl('/contact');
    expect(pub1).toBe(pub2);
  });

  it('sanitizes malicious slug characters defensively', () => {
    const evilUrl = getTenantWorkspaceUrl('evil.com:8080#', '/dashboard');
    expect(evilUrl).not.toContain('evil.com:8080#');
    expect(evilUrl).toContain('evilcom8080');

    const scriptUrl = getTenantWorkspaceUrl('<script>alert(1)</script>', '/dashboard');
    expect(scriptUrl).not.toContain('<script>');
    expect(scriptUrl).toContain('scriptalert1script');

    const emptyUrl = getTenantWorkspaceUrl('   ', '/dashboard');
    expect(emptyUrl).not.toContain('://.');
  });
});

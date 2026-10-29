import { describe, it, expect } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';

describe('Edge Security Headers & Robots Specification', () => {
  const adminWebRoot = path.resolve(__dirname, '..');
  const vercelJsonPath = path.join(adminWebRoot, 'vercel.json');
  const robotsTxtPath = path.join(adminWebRoot, 'public', 'robots.txt');

  it('vercel.json exists and contains strict security headers for /(.*)', () => {
    expect(fs.existsSync(vercelJsonPath)).toBe(true);
    const vercelConfig = JSON.parse(fs.readFileSync(vercelJsonPath, 'utf8'));

    expect(vercelConfig.headers).toBeDefined();
    expect(Array.isArray(vercelConfig.headers)).toBe(true);

    const rootHeaderConfig = vercelConfig.headers.find((h: any) => h.source === '/(.*)');
    expect(rootHeaderConfig).toBeDefined();

    const headersMap = new Map<string, string>();
    for (const h of rootHeaderConfig.headers) {
      headersMap.set(h.key.toLowerCase(), h.value);
    }

    // 1. Content-Security-Policy with frame-ancestors 'none'
    const csp = headersMap.get('content-security-policy');
    expect(csp).toBeDefined();
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain('https://*.clerk.accounts.dev');
    expect(csp).toContain('https://*.clerk.com');
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");

    // 2. X-Frame-Options: DENY
    expect(headersMap.get('x-frame-options')).toBe('DENY');

    // 3. X-Content-Type-Options: nosniff
    expect(headersMap.get('x-content-type-options')).toBe('nosniff');

    // 4. Referrer-Policy: no-referrer
    expect(headersMap.get('referrer-policy')).toBe('no-referrer');

    // 5. Permissions-Policy
    const permissions = headersMap.get('permissions-policy');
    expect(permissions).toBeDefined();
    expect(permissions).toContain('camera=()');
    expect(permissions).toContain('microphone=()');
    expect(permissions).toContain('geolocation=()');
    expect(permissions).toContain('payment=()');
    expect(permissions).toContain('usb=()');

    // 6. X-Robots-Tag: noindex, nofollow, noarchive, nosnippet
    const robotsTag = headersMap.get('x-robots-tag');
    expect(robotsTag).toBeDefined();
    expect(robotsTag).toContain('noindex');
    expect(robotsTag).toContain('nofollow');
    expect(robotsTag).toContain('noarchive');
    expect(robotsTag).toContain('nosnippet');
  });

  it('public/robots.txt disallows all robots from crawling the governance workstation', () => {
    expect(fs.existsSync(robotsTxtPath)).toBe(true);
    const content = fs.readFileSync(robotsTxtPath, 'utf8');

    expect(content).toContain('User-agent: *');
    expect(content).toContain('Disallow: /');
  });
});

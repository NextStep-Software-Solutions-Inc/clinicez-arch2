import { describe, it, expect } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';

function parseCspDirectives(cspHeader: string): Map<string, string[]> {
  const directives = new Map<string, string[]>();
  for (const part of cspHeader.split(';')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const [name, ...values] = trimmed.split(/\s+/);
    directives.set(name.toLowerCase(), values);
  }
  return directives;
}

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

    // 1. Content-Security-Policy with frame-ancestors 'none' and frame-src 'self' blob:
    const csp = headersMap.get('content-security-policy');
    expect(csp).toBeDefined();
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("frame-src 'self' blob:");
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain('https://*.clerk.accounts.dev');
    expect(csp).toContain('https://*.clerk.com');
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");

    const directives = parseCspDirectives(csp!);

    const scriptSrc = directives.get('script-src');
    expect(scriptSrc).toBeDefined();
    expect(scriptSrc).toContain("'self'");
    expect(scriptSrc).toContain("'unsafe-inline'");
    expect(scriptSrc).toContain('https://*.clerk.accounts.dev');
    expect(scriptSrc).toContain('https://*.clerk.com');
    expect(scriptSrc).toContain('https://clerk.clinicez.net');
    expect(scriptSrc).not.toContain("'unsafe-eval'");
    expect(scriptSrc).not.toContain('blob:');
    expect(scriptSrc).not.toContain('https://*.clinicez.net');

    const workerSrc = directives.get('worker-src');
    expect(workerSrc).toBeDefined();
    expect(workerSrc).toContain("'self'");
    expect(workerSrc).toContain('blob:');

    const frameSrc = directives.get('frame-src');
    expect(frameSrc).toBeDefined();
    expect(frameSrc).toContain("'self'");
    expect(frameSrc).toContain('blob:');
    expect(frameSrc).toContain('https://*.clerk.accounts.dev');
    expect(frameSrc).toContain('https://*.clerk.com');
    expect(frameSrc).toContain('https://clerk.clinicez.net');

    const connectSrc = directives.get('connect-src');
    expect(connectSrc).toBeDefined();
    expect(connectSrc).toContain("'self'");
    expect(connectSrc).toContain('https://*');
    expect(connectSrc).toContain('https://*.protect.clerk.com:*');

    expect(directives.get('frame-ancestors')).toEqual(["'none'"]);
    expect(directives.get('base-uri')).toEqual(["'self'"]);
    expect(directives.get('form-action')).toEqual(["'self'"]);

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

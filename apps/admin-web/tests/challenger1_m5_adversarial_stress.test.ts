import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { createRouter, createMemoryHistory } from '@tanstack/react-router';

import { routeTree, router } from '../src/router';
import { getTenantWorkspaceUrl, getPublicSiteUrl, isLocalEnvironment } from '../src/lib/urls';
import {
  getIdleTimeoutMinutes,
  getLastActiveTimestamp,
  setLastActiveTimestamp,
  ADMIN_LAST_ACTIVE_KEY,
  DEFAULT_IDLE_TIMEOUT_MINUTES,
  WARNING_COUNTDOWN_SECONDS,
} from '../src/lib/idleGuard';
import { isAdminMfaRequired, hasVerifiedMfa } from '../src/lib/mfaGuard';
import { ClerkConfigDiagnosticScreen } from '../src/components/ClerkConfigDiagnosticScreen';

describe('Adversarial Challenge 1: Route Hijacking & Legacy Shims', () => {
  const portalRoot = path.resolve(__dirname, '..', '..', 'portal-web');

  test('C1.1: apps/portal-web contains exactly 0 files or directories under src/app/admin', () => {
    const portalAdminDir = path.join(portalRoot, 'src', 'app', 'admin');
    expect(fs.existsSync(portalAdminDir)).toBe(false);
  });

  test('C1.2: apps/portal-web contains exactly 0 files or directories under src/components/admin', () => {
    const portalAdminComponents = path.join(portalRoot, 'src', 'components', 'admin');
    expect(fs.existsSync(portalAdminComponents)).toBe(false);
  });

  test('C1.3: apps/portal-web next.config.ts has zero /admin redirect shims (zero 301/302 shims)', () => {
    const nextConfigFile = path.join(portalRoot, 'next.config.ts');
    expect(fs.existsSync(nextConfigFile)).toBe(true);
    const content = fs.readFileSync(nextConfigFile, 'utf-8');
    expect(content).not.toContain('/admin');
  });

  test('C1.4: apps/portal-web proxy.ts strictly retains "admin" in RESERVED_SUBDOMAINS and has no /admin rewrites', () => {
    const proxyFile = path.join(portalRoot, 'src', 'proxy.ts');
    expect(fs.existsSync(proxyFile)).toBe(true);
    const content = fs.readFileSync(proxyFile, 'utf-8');
    expect(content).toContain("'admin'");
    expect(content).toMatch(/RESERVED_SUBDOMAINS\s*=\s*new\s+Set\(\[\s*[^\]]*'admin'[^\]]*\]\)/);
    expect(content).not.toMatch(/['"]\/admin(\/|\b|\()/);
  });

  test('C1.5: apps/admin-web TanStack router rejects any /admin/* prefixed path (matches only __root__)', async () => {
    const testPaths = [
      '/admin',
      '/admin/',
      '/admin/users',
      '/admin/tenants',
      '/admin/plans',
      '/admin/settings',
      '/admin/leads',
      '/admin/subscribers',
      '/admin/roles',
      '/admin/blog',
    ];

    for (const testPath of testPaths) {
      const matches = router.matchRoutes(testPath);
      // Only root route should match, no auth or workstation route
      const nonRootMatches = matches.filter((m) => m.routeId !== '__root__');
      expect(nonRootMatches.length).toBe(0);

      const memHistory = createMemoryHistory({ initialEntries: [testPath] });
      const testRouter = createRouter({ routeTree, history: memHistory });
      await testRouter.load();
      const loadedNonRoot = testRouter.state.matches.filter((m) => m.routeId !== '__root__');
      expect(loadedNonRoot.length).toBe(0);
    }
  });
});

describe('Adversarial Challenge 2: Cross-Surface URL Resolvers under Malicious Slugs', () => {
  const originalWindow = (globalThis as any).window;

  afterEach(() => {
    (globalThis as any).window = originalWindow;
  });

  test('C2.1: getTenantWorkspaceUrl strictly sanitizes <script> tag in slug (prod and local)', () => {
    // Production environment (no window or admin.clinicez.com)
    (globalThis as any).window = { location: { hostname: 'admin.clinicez.com' } };
    const prodUrl = getTenantWorkspaceUrl('<script>alert(1)</script>');
    expect(prodUrl).toBe('https://scriptalert1script.clinicez.com/dashboard');
    // In production, sanitized URL parses cleanly without throwing
    expect(() => new URL(prodUrl)).not.toThrow();
    const parsed = new URL(prodUrl);
    expect(parsed.hostname).toBe('scriptalert1script.clinicez.com');

    // Local dev environment
    (globalThis as any).window = { location: { hostname: 'localhost' } };
    const localUrl = getTenantWorkspaceUrl('<script>alert(1)</script>');
    expect(localUrl).toBe('http://localhost:3000/scriptalert1script/dashboard');
  });

  test('C2.2: getTenantWorkspaceUrl eliminates path traversal ../admin in local dev', () => {
    (globalThis as any).window = { location: { hostname: 'localhost' } };
    const url = getTenantWorkspaceUrl('../admin');
    expect(url).toBe('http://localhost:3000/admin/dashboard');
    expect(url).not.toContain('/../');
  });

  test('C2.3: getTenantWorkspaceUrl safely falls back to clean domain on whitespace slug', () => {
    (globalThis as any).window = { location: { hostname: 'admin.clinicez.com' } };
    const url = getTenantWorkspaceUrl('   ');
    expect(url).toBe('https://clinicez.com/dashboard');
    expect(url).not.toContain('..');
    expect(url).not.toContain('://.');
  });

  test('C2.4: getTenantWorkspaceUrl prevents port/hash authority escaping (evil.com:8080#)', () => {
    (globalThis as any).window = { location: { hostname: 'admin.clinicez.com' } };
    const url = getTenantWorkspaceUrl('evil.com:8080#');
    // Sanitized slug cannot escape authority component to evil.com:8080
    const parsed = new URL(url);
    expect(parsed.host).toBe('evilcom8080.clinicez.com');
    expect(parsed.hostname).toBe('evilcom8080.clinicez.com');
    expect(parsed.port).toBe('');
    expect(url).not.toContain('#');
    expect(url).not.toContain(':8080');
  });

  test('C2.5: getTenantWorkspaceUrl prevents path slash authority escaping (evil.com/fake)', () => {
    (globalThis as any).window = { location: { hostname: 'admin.clinicez.com' } };
    const url = getTenantWorkspaceUrl('evil.com/fake');
    const parsed = new URL(url);
    expect(parsed.host).toBe('evilcomfake.clinicez.com');
    expect(parsed.hostname).toBe('evilcomfake.clinicez.com');
    expect(parsed.pathname).toBe('/dashboard');
  });

  test('C2.6: getPublicSiteUrl handles leading slash normalization across environments', () => {
    (globalThis as any).window = { location: { hostname: 'admin.clinicez.com' } };
    expect(getPublicSiteUrl('/blog/post-1')).toBe('https://clinicez.com/blog/post-1');
    expect(getPublicSiteUrl('blog/post-1')).toBe('https://clinicez.com/blog/post-1');

    (globalThis as any).window = { location: { hostname: 'localhost' } };
    expect(getPublicSiteUrl('/blog/post-1')).toBe('http://localhost:3002/blog/post-1');
    expect(getPublicSiteUrl('blog/post-1')).toBe('http://localhost:3002/blog/post-1');
  });
});

describe('Adversarial Challenge 3: Security Gates (Idle Guard & MFA)', () => {
  const originalWindow = (globalThis as any).window;
  const originalLocalStorage = (globalThis as any).localStorage;

  afterEach(() => {
    (globalThis as any).window = originalWindow;
    (globalThis as any).localStorage = originalLocalStorage;
  });

  test('C3.1: getIdleTimeoutMinutes defaults to 15 when env unset or invalid', () => {
    expect(getIdleTimeoutMinutes()).toBe(DEFAULT_IDLE_TIMEOUT_MINUTES);
    expect(DEFAULT_IDLE_TIMEOUT_MINUTES).toBe(15);
    expect(WARNING_COUNTDOWN_SECONDS).toBe(60);
  });

  test('C3.2: getLastActiveTimestamp recovers gracefully from corrupted non-numeric data', () => {
    const mockStorage = new Map<string, string>();
    (globalThis as any).window = {
      location: { hostname: 'localhost' },
    };
    (globalThis as any).localStorage = {
      getItem: (k: string) => mockStorage.get(k) || null,
      setItem: (k: string, v: string) => mockStorage.set(k, v),
    };

    mockStorage.set(ADMIN_LAST_ACTIVE_KEY, 'invalid-non-numeric-string');
    const nowBefore = Date.now();
    const result = getLastActiveTimestamp();
    expect(result).toBeGreaterThanOrEqual(nowBefore);
    expect(mockStorage.get(ADMIN_LAST_ACTIVE_KEY)).toBe(String(result));
  });

  test('C3.3: getLastActiveTimestamp recovers from zero or negative timestamps', () => {
    const mockStorage = new Map<string, string>();
    (globalThis as any).window = {
      location: { hostname: 'localhost' },
    };
    (globalThis as any).localStorage = {
      getItem: (k: string) => mockStorage.get(k) || null,
      setItem: (k: string, v: string) => mockStorage.set(k, v),
    };

    mockStorage.set(ADMIN_LAST_ACTIVE_KEY, '0');
    const resZero = getLastActiveTimestamp();
    expect(resZero).toBeGreaterThan(0);

    mockStorage.set(ADMIN_LAST_ACTIVE_KEY, '-50000');
    const resNeg = getLastActiveTimestamp();
    expect(resNeg).toBeGreaterThan(0);
  });

  test('C3.4: Clock manipulation defense: future timestamp in localStorage is clamped/rejected', () => {
    const mockStorage = new Map<string, string>();
    (globalThis as any).window = {
      location: { hostname: 'localhost' },
    };
    (globalThis as any).localStorage = {
      getItem: (k: string) => mockStorage.get(k) || null,
      setItem: (k: string, v: string) => mockStorage.set(k, v),
    };

    const futureTimestamp = Date.now() + 1000 * 60 * 60 * 24 * 365; // +1 year
    mockStorage.set(ADMIN_LAST_ACTIVE_KEY, String(futureTimestamp));

    const nowBefore = Date.now();
    const result = getLastActiveTimestamp();
    // Future timestamp is clamped/rejected to now
    expect(result).toBeLessThanOrEqual(Date.now() + 1000);
    expect(result).toBeGreaterThanOrEqual(nowBefore - 50);

    // Elapsed seconds can never be negative, preventing auto-logout freeze
    const elapsedSeconds = Math.floor((Date.now() - result) / 1000);
    expect(elapsedSeconds).toBeGreaterThanOrEqual(0);
  });

  test('C3.5: hasVerifiedMfa enforces blocking when user has 0 factors', () => {
    expect(hasVerifiedMfa(null)).toBe(false);
    expect(hasVerifiedMfa(undefined)).toBe(false);
    expect(hasVerifiedMfa({})).toBe(false);
    expect(hasVerifiedMfa({ twoFactorEnabled: false, totpEnabled: false, twoFactorFactors: [] })).toBe(false);
  });

  test('C3.6: hasVerifiedMfa allows access when verified TOTP or 2FA is present', () => {
    expect(hasVerifiedMfa({ twoFactorEnabled: true })).toBe(true);
    expect(hasVerifiedMfa({ totpEnabled: true })).toBe(true);
    expect(hasVerifiedMfa({ backupCodeEnabled: true })).toBe(true);
  });

  test('C3.7: MFA enforcement: unverified factor array does NOT pass hasVerifiedMfa', () => {
    // An unverified factor (user started enrollment but never verified code)
    const unverifiedUser = {
      twoFactorEnabled: false,
      twoFactorFactors: [{ strategy: 'totp', status: 'unverified' }],
    };
    // Unverified factor is rejected
    const bypassResult = hasVerifiedMfa(unverifiedUser);
    expect(bypassResult).toBe(false);

    // Verified factor is accepted
    const verifiedUser = {
      twoFactorEnabled: false,
      twoFactorFactors: [{ strategy: 'totp', status: 'verified' }],
    };
    expect(hasVerifiedMfa(verifiedUser)).toBe(true);
  });

  test('C3.8: Verification of dynamic command bar MFA badge in _auth.tsx', () => {
    const authTsx = fs.readFileSync(path.resolve(__dirname, '../src/routes/_auth.tsx'), 'utf-8');
    // Verify that MFA badge is dynamic based on hasVerifiedMfa
    expect(authTsx).toContain('hasVerifiedMfa');
    expect(authTsx).toContain('MFA Active');
    expect(authTsx).toContain('MFA Inactive');
  });
});

describe('Adversarial Challenge 4: Headless Boot Resilience', () => {
  test('C4.1: ClerkConfigDiagnosticScreen mounts cleanly without throwing', () => {
    let html = '';
    expect(() => {
      html = renderToString(React.createElement(ClerkConfigDiagnosticScreen));
    }).not.toThrow();

    expect(html).toContain('Missing Clerk Authentication Publishable Key');
    expect(html).toContain('VITE_CLERK_PUBLISHABLE_KEY');
    expect(html).toContain('Admin Web Configuration Required');
  });

  test('C4.2: main.tsx avoids ClerkProvider instantiation when clerkPubKey is unset', () => {
    const mainContent = fs.readFileSync(path.resolve(__dirname, '../src/main.tsx'), 'utf-8');
    expect(mainContent).toContain('if (!clerkPubKey)');
    expect(mainContent).toContain('<ClerkConfigDiagnosticScreen />');
  });
});

describe('Adversarial Challenge 5: AST / Regex Token Scan for Hardcoded Hex Colors', () => {
  test('C5.1: 0 hardcoded #hex color literals in all TSX components under apps/admin-web/src/', () => {
    const srcDir = path.resolve(__dirname, '../src');
    const files: string[] = [];

    function walk(dir: string) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (/\.(tsx|jsx)$/.test(entry.name)) {
          files.push(full);
        }
      }
    }
    walk(srcDir);

    expect(files.length).toBeGreaterThan(15);

    const HEX_COLOR_REGEX = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/;
    const violations: Array<{ file: string; match: string; line: number }> = [];

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');
      const sf = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);

      function visit(node: ts.Node) {
        if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
          const text = node.text;
          const match = text.match(HEX_COLOR_REGEX);
          if (match) {
            // Exclude purely hash anchors like #download or #root
            const isFragment = text.startsWith('#') && !text.match(/^#[0-9a-fA-F]{3,8}$/);
            if (!isFragment) {
              const { line } = sf.getLineAndCharacterOfPosition(node.getStart());
              violations.push({
                file: path.relative(srcDir, file),
                match: match[0],
                line: line + 1,
              });
            }
          }
        }
        ts.forEachChild(node, visit);
      }

      visit(sf);
    }

    expect(violations).toEqual([]);
  });

  test('C5.2: Exactly 0 direct imports of palette.ts in TSX/TS files', () => {
    const srcDir = path.resolve(__dirname, '../src');
    const files: string[] = [];

    function walk(dir: string) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (/\.(tsx|jsx|ts)$/.test(entry.name)) {
          files.push(full);
        }
      }
    }
    walk(srcDir);

    const PALETTE_REGEX = /from\s+['"][^'"]*palette(\.ts)?['"]/;
    const violations: string[] = [];

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');
      if (PALETTE_REGEX.test(content)) {
        violations.push(path.relative(srcDir, file));
      }
    }

    expect(violations).toEqual([]);
  });
});

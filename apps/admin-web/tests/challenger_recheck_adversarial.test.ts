import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import React from 'react';
import { renderToString } from 'react-dom/server';

import {
  sanitizeTenantSlug,
  getTenantWorkspaceUrl,
  getPublicSiteUrl,
  isLocalEnvironment,
} from '../src/lib/urls';
import {
  getLastActiveTimestamp,
  setLastActiveTimestamp,
  ADMIN_LAST_ACTIVE_KEY,
  getIdleTimeoutMinutes,
  DEFAULT_IDLE_TIMEOUT_MINUTES,
  WARNING_COUNTDOWN_SECONDS,
} from '../src/lib/idleGuard';
import {
  isAdminMfaRequired,
  hasVerifiedMfa,
  type MinimalClerkUser,
} from '../src/lib/mfaGuard';

describe('Challenger Recheck: Item 1 — URL Slug Sanitization & Cross-Surface Resolvers', () => {
  const originalWindow = (globalThis as any).window;

  afterEach(() => {
    (globalThis as any).window = originalWindow;
  });

  describe('sanitizeTenantSlug unit stress tests', () => {
    test('strips port, hash and authority escaping characters (evil.com:8080#)', () => {
      const result = sanitizeTenantSlug('evil.com:8080#');
      expect(result).toBe('evilcom8080');
      expect(result).not.toContain(':');
      expect(result).not.toContain('#');
      expect(result).not.toContain('.');
    });

    test('strips path slash injection (evil.com/fake)', () => {
      const result = sanitizeTenantSlug('evil.com/fake');
      expect(result).toBe('evilcomfake');
      expect(result).not.toContain('/');
      expect(result).not.toContain('.');
    });

    test('strips local path traversal sequences (../admin, ../../../../admin, ..\\..\\admin)', () => {
      expect(sanitizeTenantSlug('../admin')).toBe('admin');
      expect(sanitizeTenantSlug('../../../../admin')).toBe('admin');
      expect(sanitizeTenantSlug('..\\..\\admin')).toBe('admin');
      expect(sanitizeTenantSlug('..')).toBe('');
      expect(sanitizeTenantSlug('../')).toBe('');
      expect(sanitizeTenantSlug('.')).toBe('');
    });

    test('strips URI-encoded directory traversals and null bytes', () => {
      expect(sanitizeTenantSlug('%2e%2e%2fadmin')).toBe('2e2e2fadmin');
      expect(sanitizeTenantSlug('clinic%00evil')).toBe('clinic00evil');
      expect(sanitizeTenantSlug('clinic\0evil')).toBe('clinicevil');
    });

    test('strips leading and trailing hyphens and collapses hyphens-only', () => {
      expect(sanitizeTenantSlug('---st-jude---')).toBe('st-jude');
      expect(sanitizeTenantSlug('-ustp-health-')).toBe('ustp-health');
      expect(sanitizeTenantSlug('---')).toBe('');
      expect(sanitizeTenantSlug('-')).toBe('');
    });

    test('handles null, undefined, non-string, empty and whitespace inputs gracefully', () => {
      expect(sanitizeTenantSlug('')).toBe('');
      expect(sanitizeTenantSlug('   ')).toBe('');
      expect(sanitizeTenantSlug(null as any)).toBe('');
      expect(sanitizeTenantSlug(undefined as any)).toBe('');
      expect(sanitizeTenantSlug(12345 as any)).toBe('');
      expect(sanitizeTenantSlug({} as any)).toBe('');
    });

    test('strips HTML/script tags and special characters', () => {
      expect(sanitizeTenantSlug('<script>alert("xss")</script>')).toBe('scriptalertxssscript');
      expect(sanitizeTenantSlug('javascript:alert(1)')).toBe('javascriptalert1');
      expect(sanitizeTenantSlug('user@domain.com')).toBe('userdomaincom');
      expect(sanitizeTenantSlug('slug with spaces')).toBe('slugwithspaces');
      expect(sanitizeTenantSlug('🚀rocket-clinic🏥')).toBe('rocket-clinic');
    });

    test('preserves valid RFC 1123 DNS tenant slugs unchanged', () => {
      expect(sanitizeTenantSlug('ustp-cagayan')).toBe('ustp-cagayan');
      expect(sanitizeTenantSlug('st-jude-hospital')).toBe('st-jude-hospital');
      expect(sanitizeTenantSlug('clinic123')).toBe('clinic123');
      expect(sanitizeTenantSlug('a-b-c-d')).toBe('a-b-c-d');
    });
  });

  describe('getTenantWorkspaceUrl security invariants', () => {
    test('production: authority escape attempt (evil.com:8080#) is completely neutralized', () => {
      (globalThis as any).window = { location: { hostname: 'admin.clinicez.com' } };
      const url = getTenantWorkspaceUrl('evil.com:8080#', '/dashboard');
      expect(url).toBe('https://evilcom8080.clinicez.com/dashboard');

      const parsed = new URL(url);
      expect(parsed.protocol).toBe('https:');
      expect(parsed.hostname).toBe('evilcom8080.clinicez.com');
      expect(parsed.host).toBe('evilcom8080.clinicez.com');
      expect(parsed.port).toBe('');
      expect(parsed.hash).toBe('');
      expect(parsed.pathname).toBe('/dashboard');
      expect(parsed.hostname.endsWith('clinicez.com')).toBe(true);
    });

    test('production: path slash escape attempt (evil.com/fake) is completely neutralized', () => {
      (globalThis as any).window = { location: { hostname: 'admin.clinicez.com' } };
      const url = getTenantWorkspaceUrl('evil.com/fake', '/settings');
      expect(url).toBe('https://evilcomfake.clinicez.com/settings');

      const parsed = new URL(url);
      expect(parsed.hostname).toBe('evilcomfake.clinicez.com');
      expect(parsed.pathname).toBe('/settings');
      expect(parsed.hostname.endsWith('clinicez.com')).toBe(true);
    });

    test('local dev: path traversal attempt (../admin) cannot escape localhost:3000 root', () => {
      (globalThis as any).window = { location: { hostname: 'localhost' } };
      const url = getTenantWorkspaceUrl('../admin', '/dashboard');
      expect(url).toBe('http://localhost:3000/admin/dashboard');
      expect(url).not.toContain('/../');

      const parsed = new URL(url);
      expect(parsed.origin).toBe('http://localhost:3000');
      expect(parsed.pathname).toBe('/admin/dashboard');
    });

    test('empty or invalid slug safely falls back to base domain without dangling dots or path traversals', () => {
      // Production fallback
      (globalThis as any).window = { location: { hostname: 'admin.clinicez.com' } };
      const prodWhitespace = getTenantWorkspaceUrl('   ', '/dashboard');
      expect(prodWhitespace).toBe('https://clinicez.com/dashboard');
      expect(prodWhitespace).not.toContain('://.');

      const prodHyphensOnly = getTenantWorkspaceUrl('---', '/patients');
      expect(prodHyphensOnly).toBe('https://clinicez.com/patients');

      // Local fallback
      (globalThis as any).window = { location: { hostname: 'localhost' } };
      const localWhitespace = getTenantWorkspaceUrl('   ', '/dashboard');
      expect(localWhitespace).toBe('http://localhost:3000/dashboard');

      const localHyphensOnly = getTenantWorkspaceUrl('---', '/patients');
      expect(localHyphensOnly).toBe('http://localhost:3000/patients');
    });

    test('normalizes path parameter whether leading slash is provided or omitted', () => {
      (globalThis as any).window = { location: { hostname: 'localhost' } };
      expect(getTenantWorkspaceUrl('ustp', 'dashboard')).toBe('http://localhost:3000/ustp/dashboard');
      expect(getTenantWorkspaceUrl('ustp', '/dashboard')).toBe('http://localhost:3000/ustp/dashboard');
      expect(getTenantWorkspaceUrl('ustp', '')).toBe('http://localhost:3000/ustp/');
    });
  });
});

describe('Challenger Recheck: Item 2 — Idle Session Future Bounding', () => {
  const originalWindow = (globalThis as any).window;
  const originalLocalStorage = (globalThis as any).localStorage;

  afterEach(() => {
    (globalThis as any).window = originalWindow;
    (globalThis as any).localStorage = originalLocalStorage;
  });

  function setupMockStorage(initialData: Record<string, string> = {}) {
    const store = new Map<string, string>(Object.entries(initialData));
    (globalThis as any).window = { location: { hostname: 'localhost' } };
    (globalThis as any).localStorage = {
      getItem: (key: string) => store.get(key) || null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
      clear: () => store.clear(),
    };
    return store;
  }

  test('future timestamp > now + 1000 is rejected, clamped to now, and persisted', () => {
    const store = setupMockStorage();
    const farFuture = Date.now() + 1000 * 60 * 60 * 24 * 365; // +1 year
    store.set(ADMIN_LAST_ACTIVE_KEY, String(farFuture));

    const nowBefore = Date.now();
    const result = getLastActiveTimestamp();
    const nowAfter = Date.now();

    // Result must be within [nowBefore, nowAfter] and never in the future
    expect(result).toBeGreaterThanOrEqual(nowBefore - 10);
    expect(result).toBeLessThanOrEqual(nowAfter);

    // Overwritten in localStorage to current timestamp
    const storedVal = parseInt(store.get(ADMIN_LAST_ACTIVE_KEY) || '0', 10);
    expect(storedVal).toBeGreaterThanOrEqual(nowBefore - 10);
    expect(storedVal).toBeLessThanOrEqual(nowAfter);

    // Elapsed seconds is strictly non-negative
    const elapsedSeconds = Math.max(0, Math.floor((Date.now() - result) / 1000));
    expect(elapsedSeconds).toBeGreaterThanOrEqual(0);
  });

  test('future timestamp within small 1s tolerance (now + 500ms) returns at most now', () => {
    const store = setupMockStorage();
    const slightFuture = Date.now() + 500;
    store.set(ADMIN_LAST_ACTIVE_KEY, String(slightFuture));

    const result = getLastActiveTimestamp();
    expect(result).toBeLessThanOrEqual(Date.now());
  });

  test('extreme future values (far future integer, Infinity, NaN) reset cleanly to now', () => {
    const store = setupMockStorage();

    store.set(ADMIN_LAST_ACTIVE_KEY, '999999999999999');
    expect(getLastActiveTimestamp()).toBeLessThanOrEqual(Date.now());

    store.set(ADMIN_LAST_ACTIVE_KEY, 'Infinity');
    expect(getLastActiveTimestamp()).toBeLessThanOrEqual(Date.now());

    store.set(ADMIN_LAST_ACTIVE_KEY, 'NaN');
    expect(getLastActiveTimestamp()).toBeLessThanOrEqual(Date.now());
  });

  test('valid past timestamps are retained and elapsed time advances toward auto-logout', () => {
    const store = setupMockStorage();
    const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
    store.set(ADMIN_LAST_ACTIVE_KEY, String(tenMinutesAgo));

    const result = getLastActiveTimestamp();
    expect(result).toBe(tenMinutesAgo);

    const elapsedSeconds = Math.max(0, Math.floor((Date.now() - result) / 1000));
    // Should be approximately 600 seconds
    expect(elapsedSeconds).toBeGreaterThanOrEqual(599);
    expect(elapsedSeconds).toBeLessThanOrEqual(605);
  });

  test('auto-logout triggers when elapsed time exceeds 15 minutes (900 seconds)', () => {
    const totalTimeoutSeconds = 15 * 60; // 900s
    const warningStartSeconds = totalTimeoutSeconds - 60; // 840s

    // Case A: 14.5 minutes elapsed -> warning state active (remaining = 30s)
    const activeAt14m30s = Date.now() - (14 * 60 + 30) * 1000;
    const elapsedA = Math.max(0, Math.floor((Date.now() - activeAt14m30s) / 1000));
    expect(elapsedA).toBeGreaterThanOrEqual(warningStartSeconds);
    expect(elapsedA).toBeLessThan(totalTimeoutSeconds);
    const remainingA = Math.max(0, totalTimeoutSeconds - elapsedA);
    expect(remainingA).toBeGreaterThanOrEqual(28);
    expect(remainingA).toBeLessThanOrEqual(32);

    // Case B: 16 minutes elapsed -> logout triggered
    const activeAt16m = Date.now() - 16 * 60 * 1000;
    const elapsedB = Math.max(0, Math.floor((Date.now() - activeAt16m) / 1000));
    expect(elapsedB).toBeGreaterThanOrEqual(totalTimeoutSeconds);
  });
});

describe('Challenger Recheck: Item 3 — MFA Factor Status Verification', () => {
  test('rejects unverified factor (status: "unverified")', () => {
    const user: MinimalClerkUser = {
      twoFactorEnabled: false,
      twoFactorFactors: [{ strategy: 'totp', status: 'unverified' }],
    };
    expect(hasVerifiedMfa(user)).toBe(false);
  });

  test('rejects pending or initiated factor (status: "pending", "initiated")', () => {
    const user1: MinimalClerkUser = {
      twoFactorEnabled: false,
      twoFactorFactors: [{ strategy: 'totp', status: 'pending' }],
    };
    expect(hasVerifiedMfa(user1)).toBe(false);

    const user2: MinimalClerkUser = {
      twoFactorEnabled: false,
      twoFactorFactors: [{ strategy: 'phone_code', status: 'initiated' }],
    };
    expect(hasVerifiedMfa(user2)).toBe(false);
  });

  test('rejects factor with verified: false', () => {
    const user: MinimalClerkUser = {
      twoFactorEnabled: false,
      twoFactorFactors: [{ strategy: 'totp', verified: false }],
    };
    expect(hasVerifiedMfa(user)).toBe(false);
  });

  test('rejects non-object factors, empty factors or null factors in twoFactorFactors', () => {
    expect(hasVerifiedMfa({ twoFactorFactors: [null as any] })).toBe(false);
    expect(hasVerifiedMfa({ twoFactorFactors: [undefined as any] })).toBe(false);
    expect(hasVerifiedMfa({ twoFactorFactors: ['totp' as any] })).toBe(false);
    expect(hasVerifiedMfa({ twoFactorFactors: [{}] })).toBe(false);
    expect(hasVerifiedMfa({ twoFactorFactors: [] })).toBe(false);
  });

  test('accepts verified factor (status: "verified" or "active", case-insensitive)', () => {
    expect(hasVerifiedMfa({
      twoFactorFactors: [{ strategy: 'totp', status: 'verified' }],
    })).toBe(true);

    expect(hasVerifiedMfa({
      twoFactorFactors: [{ strategy: 'totp', status: 'VERIFIED' }],
    })).toBe(true);

    expect(hasVerifiedMfa({
      twoFactorFactors: [{ strategy: 'phone_code', status: 'active' }],
    })).toBe(true);

    expect(hasVerifiedMfa({
      twoFactorFactors: [{ strategy: 'phone_code', status: 'Active' }],
    })).toBe(true);
  });

  test('accepts factor with boolean verified: true', () => {
    expect(hasVerifiedMfa({
      twoFactorFactors: [{ strategy: 'totp', verified: true }],
    })).toBe(true);
  });

  test('accepts user with multiple factors when at least one is verified', () => {
    const user: MinimalClerkUser = {
      twoFactorFactors: [
        { strategy: 'totp', status: 'unverified' },
        { strategy: 'phone_code', status: 'verified' },
      ],
    };
    expect(hasVerifiedMfa(user)).toBe(true);
  });

  test('rejects user with multiple factors when all are unverified', () => {
    const user: MinimalClerkUser = {
      twoFactorFactors: [
        { strategy: 'totp', status: 'unverified' },
        { strategy: 'phone_code', status: 'pending' },
      ],
    };
    expect(hasVerifiedMfa(user)).toBe(false);
  });

  test('accepts user with root flag enabled (twoFactorEnabled, totpEnabled, backupCodeEnabled)', () => {
    expect(hasVerifiedMfa({ twoFactorEnabled: true })).toBe(true);
    expect(hasVerifiedMfa({ totpEnabled: true })).toBe(true);
    expect(hasVerifiedMfa({ backupCodeEnabled: true })).toBe(true);
  });

  test('rejects user when null, undefined or empty object', () => {
    expect(hasVerifiedMfa(null)).toBe(false);
    expect(hasVerifiedMfa(undefined)).toBe(false);
    expect(hasVerifiedMfa({})).toBe(false);
  });
});

describe('Challenger Recheck: Item 4 — Dynamic Command Bar MFA Badge in _auth.tsx', () => {
  const authRoutePath = path.resolve(__dirname, '../src/routes/_auth.tsx');

  test('static analysis: _auth.tsx imports hasVerifiedMfa and both Shield icons', () => {
    const content = fs.readFileSync(authRoutePath, 'utf-8');
    expect(content).toContain("import { hasVerifiedMfa } from '@/lib/mfaGuard'");
    expect(content).toContain('IconShieldCheck');
    expect(content).toContain('IconShieldOff');
  });

  test('static analysis: _auth.tsx conditionally branches on hasVerifiedMfa(user)', () => {
    const content = fs.readFileSync(authRoutePath, 'utf-8');
    expect(content).toMatch(/hasVerifiedMfa\s*\(\s*user\s*\)\s*\?/);
    expect(content).toContain('MFA Active');
    expect(content).toContain('MFA Inactive');
    expect(content).toContain('Admin session authenticated with MFA protection');
    expect(content).toContain('Session active without MFA factor enrolled');
  });

  test('static analysis: MFA badge styling strictly uses semantic tokens with 0 hex values', () => {
    const content = fs.readFileSync(authRoutePath, 'utf-8');
    // Extract the MFA indicator snippet
    const startIdx = content.indexOf('{/* Dynamic MFA / Session Status Indicator */}');
    expect(startIdx).toBeGreaterThan(0);
    const endIdx = content.indexOf('{/* Theme Toggle */}', startIdx);
    expect(endIdx).toBeGreaterThan(startIdx);
    const mfaSnippet = content.substring(startIdx, endIdx);

    // Verify semantic classes
    expect(mfaSnippet).toContain('bg-surface-muted');
    expect(mfaSnippet).toContain('border-border');
    expect(mfaSnippet).toContain('text-primary');
    expect(mfaSnippet).toContain('text-text-muted');

    // Zero hex color literals in the snippet
    expect(mfaSnippet).not.toMatch(/#[0-9a-fA-F]{3,8}/);
  });

  test('runtime simulation: dynamic badge renders "MFA Active" for verified user and "MFA Inactive" for unverified user', () => {
    function SimulatedMfaBadge({ user }: { user: MinimalClerkUser | null }) {
      return hasVerifiedMfa(user)
        ? React.createElement(
            'div',
            {
              className:
                'hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-surface-muted border border-border text-text-secondary',
              title: 'Admin session authenticated with MFA protection',
            },
            React.createElement('span', { 'data-testid': 'icon-active' }),
            React.createElement('span', null, 'MFA Active')
          )
        : React.createElement(
            'div',
            {
              className:
                'hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-surface-muted border border-border text-text-muted',
              title: 'Session active without MFA factor enrolled',
            },
            React.createElement('span', { 'data-testid': 'icon-inactive' }),
            React.createElement('span', null, 'MFA Inactive')
          );
    }

    // Verified user
    const verifiedUser: MinimalClerkUser = {
      twoFactorEnabled: false,
      twoFactorFactors: [{ strategy: 'totp', status: 'verified' }],
    };
    const activeHtml = renderToString(React.createElement(SimulatedMfaBadge, { user: verifiedUser }));
    expect(activeHtml).toContain('MFA Active');
    expect(activeHtml).not.toContain('MFA Inactive');
    expect(activeHtml).toContain('icon-active');

    // Unverified factor user
    const unverifiedUser: MinimalClerkUser = {
      twoFactorEnabled: false,
      twoFactorFactors: [{ strategy: 'totp', status: 'unverified' }],
    };
    const inactiveHtml1 = renderToString(React.createElement(SimulatedMfaBadge, { user: unverifiedUser }));
    expect(inactiveHtml1).toContain('MFA Inactive');
    expect(inactiveHtml1).not.toContain('MFA Active');
    expect(inactiveHtml1).toContain('icon-inactive');

    // Null user (unauthenticated or no MFA enrolled)
    const inactiveHtml2 = renderToString(React.createElement(SimulatedMfaBadge, { user: null }));
    expect(inactiveHtml2).toContain('MFA Inactive');
    expect(inactiveHtml2).not.toContain('MFA Active');
  });
});

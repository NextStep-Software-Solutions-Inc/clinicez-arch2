import { describe, it, expect } from 'bun:test';
import { createMemoryHistory, createRouter } from '@tanstack/react-router';
import { routeTree, router } from '../src/router';
import fs from 'node:fs';
import path from 'node:path';

describe('Clean Root TanStack Router Tree (ZERO /admin/* prefix)', () => {
  const routesDir = path.resolve(__dirname, '..', 'src', 'routes');

  it('router tree instance is successfully created', () => {
    expect(router).toBeDefined();
    expect(typeof router.buildLocation).toBe('function');
  });

  it('scaffolds all 19 expected clean root route files', () => {
    const expectedFiles = [
      '__root.tsx',
      '_auth.tsx',
      'index.tsx',
      'tenants/index.tsx',
      'tenants/$slug.tsx',
      'plans.tsx',
      'leads.tsx',
      'verifications.tsx',
      'verifications/$requestId.tsx',
      'blog.tsx',
      'subscribers.tsx',
      'roles.tsx',
      'users.tsx',
      'settings.tsx',
      'invitations/$token.tsx',
      'reset-password/$token.tsx',
      'sign-in.tsx',
      'sign-up.tsx',
      'sync-auth.tsx',
    ];

    for (const file of expectedFiles) {
      const fullPath = path.join(routesDir, file);
      expect(fs.existsSync(fullPath)).toBe(true);
    }
  });

  it('contains ZERO routes with /admin/ prefix in route tree', () => {
    function checkRoutes(routes: any[]) {
      for (const r of routes) {
        if (r.path) {
          expect(r.path.startsWith('/admin')).toBe(false);
          expect(r.path.includes('/admin/')).toBe(false);
        }
        if (r.children && Array.isArray(r.children)) {
          checkRoutes(r.children);
        }
      }
    }

    if (router.routesById) {
      for (const routeId of Object.keys(router.routesById)) {
        expect(routeId.startsWith('/admin/')).toBe(false);
      }
    }
  });

  it('matches Clerk auth root and catch-all sub-routes without Not Found', async () => {
    const authPaths = [
      { path: '/sign-in', parentRouteId: '/sign-in' },
      { path: '/sign-in?reason=session_expired', parentRouteId: '/sign-in' },
      { path: '/sign-in/factor-one', parentRouteId: '/sign-in' },
      { path: '/sign-in/factor-two', parentRouteId: '/sign-in' },
      { path: '/sign-in/sso-callback', parentRouteId: '/sign-in' },
      { path: '/sign-in/reset-password', parentRouteId: '/sign-in' },
      { path: '/sign-up', parentRouteId: '/sign-up' },
      { path: '/sign-up/verify-email-address', parentRouteId: '/sign-up' },
      { path: '/sign-up/continue', parentRouteId: '/sign-up' },
      { path: '/sign-up/sso-callback', parentRouteId: '/sign-up' },
    ];

    for (const { path: targetPath, parentRouteId } of authPaths) {
      const history = createMemoryHistory({ initialEntries: [targetPath] });
      const testRouter = createRouter({ routeTree, history });
      await testRouter.load();

      const nonRootMatches = testRouter.state.matches.filter(
        (m) => m.routeId !== '__root__'
      );
      expect(nonRootMatches.length).toBeGreaterThan(0);
      expect(nonRootMatches.some((m) => m.routeId === parentRouteId)).toBe(true);
      expect(
        testRouter.state.matches.some((m: any) => Boolean(m.globalNotFound))
      ).toBe(false);
    }
  });

  it('rejects /admin/* auth prefixes and non-auth prefixes while providing defaultNotFoundComponent', async () => {
    expect(router.options.defaultNotFoundComponent).toBeDefined();

    for (const badPath of [
      '/admin/sign-in',
      '/admin/sign-in/factor-one',
      '/admin/sign-up/verify-email-address',
      '/sign-in-evil',
    ]) {
      const history = createMemoryHistory({ initialEntries: [badPath] });
      const testRouter = createRouter({ routeTree, history });
      await testRouter.load();

      const nonRootMatches = testRouter.state.matches.filter(
        (m) => m.routeId !== '__root__'
      );
      expect(nonRootMatches.length).toBe(0);
    }
  });
});

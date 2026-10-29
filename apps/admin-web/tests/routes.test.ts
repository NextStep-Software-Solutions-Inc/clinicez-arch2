import { describe, it, expect } from 'bun:test';
import { router } from '../src/router';
import fs from 'node:fs';
import path from 'node:path';

describe('Clean Root TanStack Router Tree (ZERO /admin/* prefix)', () => {
  const routesDir = path.resolve(__dirname, '..', 'src', 'routes');

  it('router tree instance is successfully created', () => {
    expect(router).toBeDefined();
    expect(typeof router.buildLocation).toBe('function');
  });

  it('scaffolds all 17 expected clean root route files', () => {
    const expectedFiles = [
      '__root.tsx',
      '_auth.tsx',
      'index.tsx',
      'tenants/index.tsx',
      'tenants/$slug.tsx',
      'plans.tsx',
      'leads.tsx',
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
});

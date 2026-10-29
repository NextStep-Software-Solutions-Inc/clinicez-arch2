import { describe, it, expect } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { apiClient, setupAxiosInterceptors, ensureApiPrefix } from '../src/lib/api';

describe('Admin Web Clerk Bearer Token Interceptor & API Prefix Normalization', () => {
  const adminRoot = path.resolve(__dirname, '..');

  it('normalizes VITE_PORTAL_API_URL with /api/v1 via ensureApiPrefix', () => {
    expect(ensureApiPrefix('http://localhost:5000')).toBe('http://localhost:5000/api/v1');
    expect(ensureApiPrefix('http://localhost:5000/')).toBe('http://localhost:5000/api/v1');
    expect(ensureApiPrefix('http://localhost:5000/api/v1')).toBe('http://localhost:5000/api/v1');
    expect(ensureApiPrefix('http://localhost:5000/api/v1/')).toBe('http://localhost:5000/api/v1');
    expect(ensureApiPrefix('https://api.clinicez.com/api/v1/api/v1')).toBe(
      'https://api.clinicez.com/api/v1'
    );
  });

  it('attaches Authorization: Bearer <token> header and updates live getToken across Clerk hydration renders', async () => {
    // Simulate Render 1 before Clerk finishes hydrating (getToken returns null)
    setupAxiosInterceptors(async () => null);

    let capturedAuthHeader: string | undefined;
    await apiClient.get('/admin/analytics', {
      adapter: async (config) => {
        capturedAuthHeader =
          typeof (config.headers as { get?: (k: string) => string }).get === 'function'
            ? (config.headers as { get: (k: string) => string }).get('Authorization')
            : (config.headers as Record<string, string>)?.Authorization;
        return {
          data: { ok: true },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        };
      },
    });
    expect(capturedAuthHeader).toBeUndefined();

    // Simulate Render 2 once Clerk hydrates session (getToken returns live JWT)
    setupAxiosInterceptors(async () => 'clerk-live-jwt-eyJ123');

    await apiClient.get('/admin/analytics', {
      adapter: async (config) => {
        capturedAuthHeader =
          typeof (config.headers as { get?: (k: string) => string }).get === 'function'
            ? (config.headers as { get: (k: string) => string }).get('Authorization')
            : (config.headers as Record<string, string>)?.Authorization;
        return {
          data: { ok: true },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        };
      },
    });
    expect(capturedAuthHeader).toBe('Bearer clerk-live-jwt-eyJ123');
  });

  it('falls back to window.Clerk.session.getToken() when primary getter yields null', async () => {
    setupAxiosInterceptors(async () => null);
    const prevWindow = (globalThis as Record<string, unknown>).window;
    (globalThis as Record<string, unknown>).window = {
      Clerk: {
        session: {
          getToken: async () => 'fallback-window-clerk-jwt',
        },
      },
    };

    try {
      let capturedAuthHeader: string | undefined;
      await apiClient.get('/admin/tenants', {
        adapter: async (config) => {
          capturedAuthHeader =
            typeof (config.headers as { get?: (k: string) => string }).get === 'function'
              ? (config.headers as { get: (k: string) => string }).get('Authorization')
              : (config.headers as Record<string, string>)?.Authorization;
          return {
            data: [],
            status: 200,
            statusText: 'OK',
            headers: {},
            config,
          };
        },
      });
      expect(capturedAuthHeader).toBe('Bearer fallback-window-clerk-jwt');
    } finally {
      if (prevWindow === undefined) {
        delete (globalThis as Record<string, unknown>).window;
      } else {
        (globalThis as Record<string, unknown>).window = prevWindow;
      }
    }
  });

  it('mounts ApiProvider inside ClerkProvider at root in src/main.tsx so all routes attach Bearer tokens on initial load', () => {
    const mainSrc = fs.readFileSync(path.join(adminRoot, 'src', 'main.tsx'), 'utf8');
    expect(mainSrc).toContain('<ClerkProvider');
    expect(mainSrc).toContain('<ApiProvider>');
    expect(mainSrc).toContain('<RouterProvider router={router} />');
  });
});

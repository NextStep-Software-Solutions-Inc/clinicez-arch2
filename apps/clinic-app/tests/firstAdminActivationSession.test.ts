// token-guard:ignore-file
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import React from 'react';
import { createRoot } from 'react-dom/client';

(globalThis as any).__DEV__ = true;
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const mockPlatform = { OS: 'web' as 'web' | 'ios' };
const secureStoreMap = new Map<string, string>();
const sessionStoreMap = new Map<string, string>();

interface RecordedAxiosCall {
  kind: 'direct' | 'client';
  method: string;
  url: string;
  body?: any;
  config: any;
}

const axiosCalls: RecordedAxiosCall[] = [];
let nextDirectHandler: ((method: string, url: string, bodyOrConfig: any, maybeConfig?: any) => Promise<any>) | null =
  null;
let nextClientHandler: ((method: string, url: string, data: any, config: any) => Promise<any>) | null = null;

function createMockAxiosInstance(defaults: any = {}) {
  const reqInterceptors: Array<(cfg: any) => Promise<any> | any> = [];
  const resErrorInterceptors: Array<(err: any) => Promise<any> | any> = [];

  async function dispatch(rawConfig: any): Promise<any> {
    let config: any = {
      ...defaults,
      ...rawConfig,
      headers: {
        ...(defaults.headers || {}),
        ...(rawConfig?.headers || {}),
      },
    };
    for (const fn of reqInterceptors) {
      config = await fn(config);
    }

    const method = String(config.method || 'GET').toUpperCase();
    const url = String(config.url || '');
    axiosCalls.push({ kind: 'client', method, url, body: config.data, config });

    try {
      if (nextClientHandler) {
        return await nextClientHandler(method, url, config.data, config);
      }
      return { data: { data: null } };
    } catch (error) {
      let currentErr: any = error;
      if (currentErr && typeof currentErr === 'object' && !currentErr.config) {
        currentErr.config = config;
      }
      for (const errFn of resErrorInterceptors) {
        try {
          return await errFn(currentErr);
        } catch (nextErr) {
          currentErr = nextErr;
          if (currentErr && typeof currentErr === 'object' && !currentErr.config) {
            currentErr.config = config;
          }
        }
      }
      throw currentErr;
    }
  }

  return {
    interceptors: {
      request: {
        use: (fn: (cfg: any) => Promise<any> | any) => {
          reqInterceptors.push(fn);
          return reqInterceptors.length - 1;
        },
      },
      response: {
        use: (_ok: any, errFn?: (err: any) => Promise<any> | any) => {
          if (errFn) resErrorInterceptors.push(errFn);
          return resErrorInterceptors.length - 1;
        },
      },
    },
    get: (url: string, config?: any) => dispatch({ ...config, method: 'GET', url }),
    post: (url: string, data?: any, config?: any) => dispatch({ ...config, method: 'POST', url, data }),
    put: (url: string, data?: any, config?: any) => dispatch({ ...config, method: 'PUT', url, data }),
    patch: (url: string, data?: any, config?: any) => dispatch({ ...config, method: 'PATCH', url, data }),
    delete: (url: string, config?: any) => dispatch({ ...config, method: 'DELETE', url }),
    request: (config: any) => dispatch(config),
  };
}

mock.module('react-native', () => ({
  Platform: mockPlatform,
  AppState: { currentState: 'active', addEventListener: () => ({ remove: () => {} }) },
  StyleSheet: { create: (s: any) => s, flatten: (s: any) => s },
}));

mock.module('../services/runtimeConfig', () => ({
  getApiBaseUrl: () => 'https://clinic.local',
  getOfflineGraceHours: () => 24,
  getWebIdleTimeoutMinutes: () => 30,
  getSetting: () => undefined,
  getPortalBaseUrl: () => 'https://portal.local',
}));

mock.module('../services/secureStorage', () => ({
  getSecureItem: async (key: string) => secureStoreMap.get(key) ?? null,
  setSecureItem: async (key: string, value: string) => {
    secureStoreMap.set(key, value);
  },
  deleteSecureItem: async (key: string) => {
    secureStoreMap.delete(key);
  },
}));

mock.module('../services/offlineUnlock', () => ({
  isUnlockConfigured: async () => false,
}));

mock.module('axios', () => ({
  default: {
    create: (defaults?: any) => createMockAxiosInstance(defaults),
    isAxiosError: (err: any) => Boolean(err?.isAxiosError || err?.response),
    get: async (url: string, config?: any) => {
      axiosCalls.push({ kind: 'direct', method: 'GET', url, config });
      if (nextDirectHandler) {
        return nextDirectHandler('GET', url, config);
      }
      return { data: { data: null } };
    },
    post: async (url: string, body?: any, config?: any) => {
      axiosCalls.push({ kind: 'direct', method: 'POST', url, body, config });
      if (nextDirectHandler) {
        return nextDirectHandler('POST', url, body, config);
      }
      return { data: { data: null } };
    },
    delete: async (url: string, config?: any) => {
      axiosCalls.push({ kind: 'direct', method: 'DELETE', url, config });
      if (nextDirectHandler) {
        return nextDirectHandler('DELETE', url, config);
      }
      return { data: { data: null } };
    },
  },
}));

const authSession = await import('../services/authSession');
const { clinicApiClient } = await import('../services/apiClient');
const { clinicService } = await import('../services/clinicService');
const { AuthProvider, hadActiveOrLockedSession, useAuth } = await import('../context/AuthContext');

function makeNode(tag: string, nodeType = 1): any {
  const children: any[] = [];
  const node: any = {
    nodeType,
    tagName: tag.toUpperCase(),
    nodeName: tag.toUpperCase(),
    style: {},
    dataset: {},
    childNodes: children,
    children,
    parentNode: null,
    ownerDocument: null as any,
    textContent: '',
    nodeValue: '',
    appendChild(child: any) {
      child.parentNode = node;
      children.push(child);
      return child;
    },
    insertBefore(child: any, ref: any) {
      child.parentNode = node;
      const idx = children.indexOf(ref);
      if (idx === -1) children.push(child);
      else children.splice(idx, 0, child);
      return child;
    },
    removeChild(child: any) {
      const idx = children.indexOf(child);
      if (idx !== -1) children.splice(idx, 1);
      child.parentNode = null;
      return child;
    },
    setAttribute() {},
    getAttribute() {
      return null;
    },
    removeAttribute() {},
    addEventListener() {},
    removeEventListener() {},
  };
  return node;
}

function makeFakeDocument() {
  const doc: any = makeNode('#document', 9);
  doc.documentElement = makeNode('html');
  doc.body = makeNode('body');
  doc.head = makeNode('head');
  doc.createElement = (tag: string) => {
    const el = makeNode(tag, 1);
    el.ownerDocument = doc;
    return el;
  };
  doc.createElementNS = (_ns: string, tag: string) => {
    const el = makeNode(tag, 1);
    el.ownerDocument = doc;
    return el;
  };
  doc.createTextNode = (text: string) => {
    const textNode = makeNode('#text', 3);
    textNode.nodeValue = String(text ?? '');
    textNode.textContent = String(text ?? '');
    textNode.ownerDocument = doc;
    return textNode;
  };
  doc.createComment = (text: string) => {
    const c = makeNode('#comment', 8);
    c.nodeValue = String(text ?? '');
    c.ownerDocument = doc;
    return c;
  };
  doc.documentElement.ownerDocument = doc;
  doc.body.ownerDocument = doc;
  doc.head.ownerDocument = doc;
  return doc;
}

async function flushMicrotasks(ticks = 6) {
  for (let i = 0; i < ticks; i++) {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  }
}

function makeHttpError(status: number, message: string, errorCode?: string) {
  const err: any = new Error(message);
  err.isAxiosError = true;
  err.response = {
    status,
    data: {
      succeeded: false,
      message,
      ...(errorCode ? { errorCode } : {}),
    },
  };
  return err;
}

function makeTokens(accessToken: string, expiresInMs = 10 * 60_000) {
  return {
    accessToken,
    refreshToken: null,
    accessTokenExpiresAtUtc: new Date(Date.now() + expiresInMs).toISOString(),
    refreshTokenExpiresAtUtc: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    user: {
      id: 'staff-1',
      name: 'Dr. Admin',
      email: 'admin@clinic.test',
      role: 'Admin',
      clinicId: 'clinic-1',
      tenantId: 'tenant-1',
      clinicName: 'University Health Clinic - USTP CDO',
      permissions: ['*'],
      mustChangePassword: false,
    },
  };
}

class MockBroadcastChannel {
  static instances: MockBroadcastChannel[] = [];
  onmessage: ((event: { data: any }) => void) | null = null;
  constructor(public readonly name: string) {
    MockBroadcastChannel.instances.push(this);
  }
  postMessage(data: any) {
    for (const peer of MockBroadcastChannel.instances) {
      if (peer !== this && peer.name === this.name && peer.onmessage) {
        peer.onmessage({ data });
      }
    }
  }
  close() {
    MockBroadcastChannel.instances = MockBroadcastChannel.instances.filter((i) => i !== this);
  }
}

describe('First-admin activation & pre-auth session safety', () => {
  const origWindow = (globalThis as any).window;
  const origDocument = (globalThis as any).document;
  const origBroadcastChannel = (globalThis as any).BroadcastChannel;

  beforeEach(async () => {
    mockPlatform.OS = 'web';
    secureStoreMap.clear();
    sessionStoreMap.clear();
    axiosCalls.length = 0;
    nextDirectHandler = null;
    nextClientHandler = null;
    MockBroadcastChannel.instances = [];
    (globalThis as any).BroadcastChannel = MockBroadcastChannel;
    const fakeDoc = makeFakeDocument();
    fakeDoc.activeElement = fakeDoc.body;
    const winObj: any = {
      document: fakeDoc,
      HTMLIFrameElement: function HTMLIFrameElement() {},
      location: {
        hostname: 'ustp-cdo.clinic.clinicez.net',
        pathname: '/',
        search: '',
        hash: '',
        href: 'https://ustp-cdo.clinic.clinicez.net/',
      },
      history: {
        replaceState: () => {},
        pushState: () => {},
      },
      sessionStorage: {
        getItem: (k: string) => sessionStoreMap.get(k) ?? null,
        setItem: (k: string, v: string) => {
          sessionStoreMap.set(k, v);
        },
        removeItem: (k: string) => {
          sessionStoreMap.delete(k);
        },
      },
      addEventListener: () => {},
      removeEventListener: () => {},
    };
    fakeDoc.defaultView = winObj;
    (globalThis as any).document = fakeDoc;
    (globalThis as any).window = winObj;
    authSession.__resetAuthChannelForTests();
    await authSession.logout();
    axiosCalls.length = 0;
  });

  afterEach(() => {
    authSession.onSessionExpired(null);
    authSession.onSessionIdleExpired(null);
    authSession.onSessionLocked(null);
    authSession.onSessionUnlocked(null);
    authSession.__resetAuthChannelForTests();
    (globalThis as any).BroadcastChannel = origBroadcastChannel;
    (globalThis as any).document = origDocument;
    (globalThis as any).window = origWindow;
  });

  test('ClinicApiClient with { skipAuth: true } skips ensureFreshToken/refresh on request and 401 response', async () => {
    // Sign in with an expired access token so an authenticated request WOULD trigger /auth/refresh.
    let refreshSeq = 0;
    nextDirectHandler = async (_method, url) => {
      if (url.includes('/auth/login')) {
        return { data: { data: makeTokens('expired-access', -60_000) } };
      }
      if (url.includes('/auth/refresh')) {
        refreshSeq += 1;
        return {
          data: {
            data:
              refreshSeq === 1
                ? makeTokens('refreshed-access', 5_000)
                : makeTokens('refreshed-access-2', 10 * 60_000),
          },
        };
      }
      return { data: { data: null } };
    };
    await authSession.login('admin@clinic.test', 'StrongPass123!');
    axiosCalls.length = 0;

    // 1. skipAuth request must NOT refresh the expired token or attach Authorization, and must NOT refresh on 401.
    let skipAuthAttempted = 0;
    nextClientHandler = async (_method, url, _data, config) => {
      skipAuthAttempted += 1;
      expect(config.skipAuth).toBe(true);
      expect(config.headers.Authorization).toBeUndefined();
      if (url === '/clinic/license/apply') {
        throw makeHttpError(401, 'Unauthorized');
      }
      return { data: { data: { ok: true } } };
    };

    const [, skipErr] = await clinicApiClient.post('/clinic/license/apply', { licenseToken: 'tok' }, { skipAuth: true });
    expect(skipErr?.status).toBe(401);
    expect(skipAuthAttempted).toBe(1);
    expect(axiosCalls.some((c) => c.url.includes('/auth/refresh'))).toBe(false);

    // 2. Normal authenticated request WITHOUT skipAuth DOES refresh the expired token and retries 401 once.
    axiosCalls.length = 0;
    let authCalls = 0;
    nextClientHandler = async (_method, _url, _data, config) => {
      authCalls += 1;
      if (authCalls === 1) {
        expect(config.headers.Authorization).toBe('Bearer refreshed-access');
        throw makeHttpError(401, 'Token expired');
      }
      expect(config.headers.Authorization).toBe('Bearer refreshed-access-2');
      return { data: { data: { items: [] } } };
    };

    const [okRes, okErr] = await clinicApiClient.get('/patients');
    expect(okErr).toBeNull();
    expect(okRes).toEqual({ items: [] });
    expect(authCalls).toBe(2);
    expect(axiosCalls.filter((c) => c.url.includes('/auth/refresh')).length).toBe(2);
  });

  test('clinicService anonymous license/workspace/public-queue endpoints pass skipAuth: true and never call /auth/refresh', async () => {
    let expiredFired = false;
    authSession.onSessionExpired(() => {
      expiredFired = true;
    });

    const licenseDto = {
      status: 'Active',
      clinicId: 'clinic-1',
      clinicName: 'University Health Clinic - USTP CDO',
      facilitySlug: 'ustp-cdo',
      tenantSlug: 'ustp-cdo',
      planTier: 'Pro',
      limits: { maxStaff: 25 },
      activeStaffCount: 0,
      enabledFeatures: [],
      expiresAtUtc: null,
      isTampered: false,
      errorMessage: null,
    };

    nextClientHandler = async (_method, url, _data, config) => {
      expect(config.skipAuth).toBe(true);
      expect(config.headers.Authorization).toBeUndefined();
      if (url.startsWith('/public/queue/display')) {
        return { data: { data: { clinicName: 'USTP CDO', nowServing: [], upNext: [] } } };
      }
      return { data: { data: licenseDto } };
    };

    const [statusRes, statusErr] = await clinicService.getLicenseStatus();
    expect(statusErr).toBeNull();
    expect(statusRes?.clinicName).toBe('University Health Clinic - USTP CDO');

    const [wsRes, wsErr] = await clinicService.resolveWorkspace('ustp-cdo');
    expect(wsErr).toBeNull();
    expect(wsRes?.facilitySlug).toBe('ustp-cdo');

    const [applyRes, applyErr] = await clinicService.applyLicense('signed-key');
    expect(applyErr).toBeNull();
    expect(applyRes?.status).toBe('Active');

    const [queueRes, queueErr] = await clinicService.getPublicQueueDisplay('clinic-1', 'ustp-cdo', 'ustp-cdo');
    expect(queueErr).toBeNull();
    expect(queueRes?.clinicName).toBe('USTP CDO');

    expect(axiosCalls.some((c) => c.url.includes('/auth/refresh'))).toBe(false);
    expect(expiredFired).toBe(false);
  });

  test('hadActiveOrLockedSession permits session expiry only from authenticated or locked states', () => {
    expect(hadActiveOrLockedSession('booting')).toBe(false);
    expect(hadActiveOrLockedSession('unreachable')).toBe(false);
    expect(hadActiveOrLockedSession('signedOut')).toBe(false);
    expect(hadActiveOrLockedSession('needsBootstrap')).toBe(false);

    expect(hadActiveOrLockedSession('signedIn')).toBe(true);
    expect(hadActiveOrLockedSession('mustChangePassword')).toBe(true);
    expect(hadActiveOrLockedSession('locked')).toBe(true);
    expect(hadActiveOrLockedSession('workstationLocked')).toBe(true);
  });

  test('AuthProvider keeps needsBootstrap state during license verification and ignores pre-auth session expiry', async () => {
    nextDirectHandler = async (method, url) => {
      if (method === 'POST' && url.includes('/auth/refresh')) {
        throw makeHttpError(401, 'No session cookie');
      }
      if (method === 'GET' && url.includes('/auth/status')) {
        return {
          data: {
            data: {
              workspaceFound: true,
              licenseStatus: 'Active',
              requiresBootstrap: true,
              clinicName: 'University Health Clinic - USTP CDO',
            },
          },
        };
      }
      if (method === 'POST' && url.includes('/auth/login')) {
        return { data: { data: makeTokens('admin-access-1', -60_000) } };
      }
      if (method === 'POST' && url.includes('/auth/lock')) {
        return {
          data: {
            data: {
              staffId: 'staff-1',
              name: 'Dr. Admin',
              email: 'admin@clinic.test',
              role: 'Admin',
              roleName: 'Admin',
              clinicName: 'University Health Clinic - USTP CDO',
              hasQuickUnlockPin: true,
              allowStaffPinUnlock: true,
              lockedAtUtc: new Date().toISOString(),
              lockExpiresAtUtc: new Date(Date.now() + 8 * 3_600_000).toISOString(),
            },
          },
        };
      }
      if (method === 'POST' && url.includes('/auth/unlock-pin')) {
        throw makeHttpError(401, 'Too many incorrect PIN attempts.', 'INVALIDTOKEN');
      }
      return { data: { data: null } };
    };

    nextClientHandler = async (_method, url) => {
      if (url === '/clinic/license/apply') {
        return {
          data: {
            data: {
              status: 'Active',
              clinicId: 'clinic-1',
              clinicName: 'University Health Clinic - USTP CDO',
              facilitySlug: 'ustp-cdo',
              tenantSlug: 'ustp-cdo',
              planTier: 'Pro',
              limits: { maxStaff: 25 },
              activeStaffCount: 0,
              enabledFeatures: [],
              expiresAtUtc: null,
              isTampered: false,
              errorMessage: null,
            },
          },
        };
      }
      return { data: { data: null } };
    };

    let latestAuth: ReturnType<typeof useAuth> | null = null;
    function Probe() {
      latestAuth = useAuth();
      return null;
    }

    const container = (globalThis as any).document.createElement('div');
    (globalThis as any).document.body.appendChild(container);
    const root = createRoot(container);

    try {
      await React.act(async () => {
        root.render(React.createElement(AuthProvider, null, React.createElement(Probe)));
        await flushMicrotasks();
      });

      // Booted cleanly into needsBootstrap with zero session-ended notice despite initial 401 on /auth/refresh
      expect(latestAuth?.state).toBe('needsBootstrap');
      expect(latestAuth?.notice).toBeNull();

      // Step 1 of FirstAdminSetupScreen: applyLicense must keep user in needsBootstrap with no /auth/refresh
      axiosCalls.length = 0;
      await React.act(async () => {
        const [res, err] = await clinicService.applyLicense('valid-license-key');
        expect(err).toBeNull();
        expect(res?.status).toBe('Active');
        await flushMicrotasks();
      });
      expect(axiosCalls.some((c) => c.url.includes('/auth/refresh'))).toBe(false);
      expect(latestAuth?.state).toBe('needsBootstrap');
      expect(latestAuth?.notice).toBeNull();

      // Even if a stray session-expiry or idle-expiry event occurs before sign-in, needsBootstrap is preserved
      await React.act(async () => {
        const peer = new MockBroadcastChannel('clinicez-auth');
        peer.postMessage({ type: 'session-cleared', reason: 'expired' });
        await flushMicrotasks(2);
      });
      expect(latestAuth?.state).toBe('needsBootstrap');
      expect(latestAuth?.notice).toBeNull();

      // Positive control 1: once signedIn, an expired refresh 401 transitions to signedOut with session-ended notice
      await React.act(async () => {
        const errMsg = await latestAuth!.login('admin@clinic.test', 'StrongPass123!');
        expect(errMsg).toBeNull();
        await flushMicrotasks();
      });
      expect(latestAuth?.state).toBe('signedIn');

      nextDirectHandler = async (method, url) => {
        if (method === 'POST' && url.includes('/auth/refresh')) {
          throw makeHttpError(401, 'Invalid refresh token');
        }
        return { data: { data: null } };
      };
      await React.act(async () => {
        await authSession.refreshSession();
        await flushMicrotasks();
      });
      expect(latestAuth?.state).toBe('signedOut');
      expect(latestAuth?.notice).toBe('Your session has ended. Please sign in again.');

      // Positive control 2: from workstationLocked, INVALIDTOKEN 401 transitions to signedOut with session-ended notice
      nextDirectHandler = async (method, url) => {
        if (method === 'POST' && url.includes('/auth/login')) {
          return { data: { data: makeTokens('admin-access-2') } };
        }
        if (method === 'POST' && url.includes('/auth/lock')) {
          return {
            data: {
              data: {
                staffId: 'staff-1',
                name: 'Dr. Admin',
                email: 'admin@clinic.test',
                role: 'Admin',
                roleName: 'Admin',
                clinicName: 'University Health Clinic - USTP CDO',
                hasQuickUnlockPin: true,
                allowStaffPinUnlock: true,
                lockedAtUtc: new Date().toISOString(),
                lockExpiresAtUtc: new Date(Date.now() + 8 * 3_600_000).toISOString(),
              },
            },
          };
        }
        if (method === 'POST' && url.includes('/auth/unlock-pin')) {
          throw makeHttpError(401, 'Too many incorrect PIN attempts.', 'INVALIDTOKEN');
        }
        return { data: { data: null } };
      };

      await React.act(async () => {
        await latestAuth!.login('admin@clinic.test', 'StrongPass123!');
        await flushMicrotasks();
      });
      await React.act(async () => {
        await latestAuth!.lockWorkstation();
        await flushMicrotasks();
      });
      expect(latestAuth?.state).toBe('workstationLocked');

      await React.act(async () => {
        const unlockErr = await latestAuth!.unlockWithPin('000000');
        expect(unlockErr).toContain('Too many incorrect PIN attempts');
        await flushMicrotasks();
      });
      expect(latestAuth?.state).toBe('signedOut');
      expect(latestAuth?.notice).toBe('Your session has ended. Please sign in again.');
    } finally {
      await React.act(async () => {
        root.unmount();
        await flushMicrotasks(2);
      });
      container.parentNode?.removeChild(container);
    }
  });
});

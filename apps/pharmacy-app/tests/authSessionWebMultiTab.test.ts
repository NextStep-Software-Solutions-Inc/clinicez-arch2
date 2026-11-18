import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test';

const mockPlatform = { OS: 'web' as 'web' | 'ios' };
const secureStoreMap = new Map<string, string>();
const postCalls: Array<{ url: string; body: any; config: any }> = [];
let nextPostResponse: ((url: string, body: any, config: any) => Promise<any>) | null = null;

mock.module('react-native', () => ({
  Platform: mockPlatform,
}));

mock.module('../services/runtimeConfig', () => ({
  getPharmacyApiBaseUrl: () => 'https://pharmacy.local/api/v1',
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

mock.module('axios', () => ({
  default: {
    post: async (url: string, body: any, config: any) => {
      postCalls.push({ url, body, config });
      if (nextPostResponse) {
        return nextPostResponse(url, body, config);
      }
      return { data: { data: null } };
    },
  },
}));

const {
  __resetAuthChannelForTests,
  broadcastActivity,
  getAccessToken,
  getSessionUser,
  idleLogout,
  login,
  logout,
  onSessionNotice,
  refreshSession,
  restoreSession,
  subscribeRemoteActivity,
  subscribeSession,
} = await import('../services/authSession');

const sampleUser = {
  id: 'pharm-1',
  name: 'RPh Cruz',
  role: 'Pharmacist',
  pharmacyId: 'pharmacy-1',
  tenantId: 'tenant-1',
  pharmacyName: 'Metro Pharmacy',
  permissions: ['inventory:read'],
  mustChangePassword: false,
};

function makeTokens(accessToken: string, refreshToken: string | null = null, expiresInMs: number = 10 * 60_000) {
  return {
    accessToken,
    refreshToken,
    accessTokenExpiresAtUtc: new Date(Date.now() + expiresInMs).toISOString(),
    refreshTokenExpiresAtUtc: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    user: sampleUser,
  };
}

class MockBroadcastChannel {
  static instances: MockBroadcastChannel[] = [];
  onmessage: ((event: { data: any }) => void) | null = null;
  posted: any[] = [];

  constructor(public readonly name: string) {
    MockBroadcastChannel.instances.push(this);
  }

  postMessage(data: any) {
    this.posted.push(data);
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

describe('pharmacy authSession web multi-tab & native dual-mode', () => {
  const origBroadcastChannel = (globalThis as any).BroadcastChannel;
  const origNavigator = (globalThis as any).navigator;

  beforeEach(async () => {
    mockPlatform.OS = 'web';
    secureStoreMap.clear();
    postCalls.length = 0;
    nextPostResponse = null;
    MockBroadcastChannel.instances = [];
    (globalThis as any).BroadcastChannel = MockBroadcastChannel;
    __resetAuthChannelForTests();
    onSessionNotice(null);
    await logout();
    postCalls.length = 0;
    MockBroadcastChannel.instances.forEach((c) => (c.posted = []));
  });

  afterEach(() => {
    onSessionNotice(null);
    __resetAuthChannelForTests();
    (globalThis as any).BroadcastChannel = origBroadcastChannel;
    (globalThis as any).navigator = origNavigator;
  });

  test('web login sends X-Client-Platform: web, withCredentials: true, and skips secureStorage', async () => {
    nextPostResponse = async () => ({
      data: { data: makeTokens('rx-web-access-1', null) },
    });

    const [user, err] = await login('cruz@pharmacy.test', 'StrongPass123!');
    expect(err).toBeNull();
    expect(user?.id).toBe('pharm-1');
    expect(getAccessToken()).toBe('rx-web-access-1');
    expect(postCalls[0].config.withCredentials).toBe(true);
    expect(postCalls[0].config.headers['X-Client-Platform']).toBe('web');
    expect(secureStoreMap.has('clinicez.pharmacy.auth.refresh')).toBe(false);
  });

  test('web restoreSession in a fresh tab calls /auth/refresh with empty body and withCredentials', async () => {
    nextPostResponse = async () => ({
      data: { data: makeTokens('rx-tab2-access', null) },
    });

    const restored = await restoreSession();
    expect(restored?.id).toBe('pharm-1');
    expect(getAccessToken()).toBe('rx-tab2-access');
    expect(postCalls[0].url).toContain('/auth/refresh');
    expect(postCalls[0].body).toEqual({});
    expect(postCalls[0].config.withCredentials).toBe(true);
  });

  test('web refreshSession serializes via navigator.locks and skips HTTP if peer broadcasted fresh token', async () => {
    const peerChannel = new MockBroadcastChannel('clinicez-pharmacy-auth');
    let lockName: string | null = null;
    (globalThis as any).navigator = {
      locks: {
        request: async (name: string, cb: () => Promise<boolean>) => {
          lockName = name;
          peerChannel.postMessage({
            type: 'session-refreshed',
            accessToken: 'rx-broadcast-access',
            accessTokenExpiresAtUtc: new Date(Date.now() + 10 * 60_000).toISOString(),
            user: sampleUser,
          });
          return cb();
        },
      },
    };

    const unsub = subscribeSession(() => {});
    const ok = await refreshSession();
    unsub();

    expect(lockName).toBe('clinicez.pharmacy.auth.refresh');
    expect(ok).toBe(true);
    expect(getAccessToken()).toBe('rx-broadcast-access');
    expect(postCalls.length).toBe(0);
  });

  test('web idleLogout triggers notice, calls /auth/logout, and broadcasts idle reason', async () => {
    const peerChannel = new MockBroadcastChannel('clinicez-pharmacy-auth');
    const received: any[] = [];
    peerChannel.onmessage = (e) => received.push(e.data);

    let lastNotice: string | null = null;
    onSessionNotice((msg) => {
      lastNotice = msg;
    });

    nextPostResponse = async () => ({ data: { data: makeTokens('rx-active', null) } });
    await login('cruz@pharmacy.test', 'StrongPass123!');
    postCalls.length = 0;

    await idleLogout();

    expect(postCalls.length).toBe(1);
    expect(postCalls[0].url).toContain('/auth/logout');
    expect(postCalls[0].config.withCredentials).toBe(true);
    expect(getSessionUser()).toBeNull();
    expect(lastNotice).toBe('Signed out due to inactivity. Please sign in again.');
    expect(received.some((m) => m?.type === 'session-cleared' && m?.reason === 'idle')).toBe(true);
  });

  test('broadcastActivity forwards timestamps to remote subscribers', () => {
    const seen: number[] = [];
    const unsub = subscribeRemoteActivity((ts) => seen.push(ts));
    const peerChannel = new MockBroadcastChannel('clinicez-pharmacy-auth');
    peerChannel.postMessage({ type: 'activity', timestamp: 424242 });
    unsub();

    expect(seen).toEqual([424242]);

    const sent: any[] = [];
    peerChannel.onmessage = (e) => sent.push(e.data);
    broadcastActivity(777777);
    expect(sent.some((m) => m?.type === 'activity' && m?.timestamp === 777777)).toBe(true);
  });

  test('native (ios) regression: persists refresh token in secureStorage and uses JSON body', async () => {
    mockPlatform.OS = 'ios';
    nextPostResponse = async () => ({
      data: { data: makeTokens('rx-ios-access-1', 'rx-ios-refresh-1') },
    });

    const [user, err] = await login('cruz@pharmacy.test', 'StrongPass123!');
    expect(err).toBeNull();
    expect(user?.id).toBe('pharm-1');
    expect(secureStoreMap.get('clinicez.pharmacy.auth.refresh')).toBe('rx-ios-refresh-1');
    expect(postCalls[0].config.withCredentials).toBe(false);
    expect(postCalls[0].config.headers['X-Client-Platform']).toBe('ios');

    postCalls.length = 0;
    nextPostResponse = async () => ({
      data: { data: makeTokens('rx-ios-access-2', 'rx-ios-refresh-2') },
    });

    const restored = await restoreSession();
    expect(restored?.id).toBe('pharm-1');
    expect(postCalls[0].body).toEqual({ refreshToken: 'rx-ios-refresh-1' });
    expect(secureStoreMap.get('clinicez.pharmacy.auth.refresh')).toBe('rx-ios-refresh-2');
  });
});

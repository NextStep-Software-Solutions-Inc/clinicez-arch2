import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test';

const mockPlatform = { OS: 'web' as 'web' | 'ios' };
const postCalls: Array<{ url: string; body: any; config: any }> = [];
let nextPostResponse: ((url: string, body: any, config: any) => Promise<any>) | null = null;

mock.module('react-native', () => ({
  Platform: mockPlatform,
}));

mock.module('../services/runtimeConfig', () => ({
  getBillingApiBaseUrl: () => 'https://billing.local/api/v1',
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
  ensureFreshAccessToken,
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
  id: 'cashier-1',
  fullName: 'Cashier Ana',
  email: 'ana@clinic.test',
  role: 'Cashier' as const,
  tenantId: 'tenant-1',
  facilityId: 'clinic-1',
  permissions: ['payments:collect'],
};

function makeToken(accessToken: string, expiresInMs: number = 15 * 60_000) {
  return {
    accessToken,
    expiresAtUtc: new Date(Date.now() + expiresInMs).toISOString(),
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

describe('cashier authSession web multi-tab & native dual-mode', () => {
  const origBroadcastChannel = (globalThis as any).BroadcastChannel;
  const origNavigator = (globalThis as any).navigator;

  beforeEach(async () => {
    mockPlatform.OS = 'web';
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

  test('web login sends X-Client-Platform: web and withCredentials: true', async () => {
    nextPostResponse = async () => ({
      data: { data: makeToken('cash-web-access-1') },
    });

    const [user, err] = await login({
      tenantId: 'tenant-1',
      facilityId: 'clinic-1',
      email: 'ana@clinic.test',
      password: 'StrongPass123!',
    });

    expect(err).toBeNull();
    expect(user?.id).toBe('cashier-1');
    expect(getAccessToken()).toBe('cash-web-access-1');
    expect(postCalls[0].config.withCredentials).toBe(true);
    expect(postCalls[0].config.headers['X-Client-Platform']).toBe('web');
  });

  test('web restoreSession in a fresh tab calls /auth/refresh with withCredentials: true', async () => {
    nextPostResponse = async () => ({
      data: { data: makeToken('cash-tab2-access') },
    });

    const restored = await restoreSession();
    expect(restored?.id).toBe('cashier-1');
    expect(getAccessToken()).toBe('cash-tab2-access');
    expect(postCalls[0].url).toContain('/auth/refresh');
    expect(postCalls[0].body).toEqual({});
    expect(postCalls[0].config.withCredentials).toBe(true);
  });

  test('web refreshSession uses navigator.locks and skips redundant /auth/refresh when peer broadcasts fresh token', async () => {
    const peerChannel = new MockBroadcastChannel('clinicez-cashier-auth');
    let lockName: string | null = null;

    (globalThis as any).navigator = {
      locks: {
        request: async (name: string, cb: () => Promise<boolean>) => {
          lockName = name;
          peerChannel.postMessage({
            type: 'session-refreshed',
            accessToken: 'cash-broadcast-access',
            expiresAtUtc: new Date(Date.now() + 15 * 60_000).toISOString(),
            user: sampleUser,
          });
          return cb();
        },
      },
    };

    const unsub = subscribeSession(() => {});
    const ok = await refreshSession();
    unsub();

    expect(lockName).toBe('clinicez.cashier.auth.refresh');
    expect(ok).toBe(true);
    expect(getAccessToken()).toBe('cash-broadcast-access');
    expect(postCalls.length).toBe(0);
  });

  test('web idleLogout triggers inactivity notice, calls /auth/logout, and broadcasts idle reason', async () => {
    const peerChannel = new MockBroadcastChannel('clinicez-cashier-auth');
    const received: any[] = [];
    peerChannel.onmessage = (e) => received.push(e.data);

    let lastNotice: string | null = null;
    onSessionNotice((msg) => {
      lastNotice = msg;
    });

    nextPostResponse = async () => ({ data: { data: makeToken('cash-active') } });
    await login({
      tenantId: 'tenant-1',
      facilityId: 'clinic-1',
      email: 'ana@clinic.test',
      password: 'StrongPass123!',
    });
    postCalls.length = 0;

    await idleLogout();

    expect(postCalls.length).toBe(1);
    expect(postCalls[0].url).toContain('/auth/logout');
    expect(postCalls[0].config.withCredentials).toBe(true);
    expect(getSessionUser()).toBeNull();
    expect(lastNotice).toBe('Signed out due to inactivity. Please sign in again.');
    expect(received.some((m) => m?.type === 'session-cleared' && m?.reason === 'idle')).toBe(true);
  });

  test('broadcastActivity delivers timestamps to subscribeRemoteActivity listeners', () => {
    const seen: number[] = [];
    const unsub = subscribeRemoteActivity((ts) => seen.push(ts));
    const peerChannel = new MockBroadcastChannel('clinicez-cashier-auth');
    peerChannel.postMessage({ type: 'activity', timestamp: 111222 });
    unsub();

    expect(seen).toEqual([111222]);

    const sent: any[] = [];
    peerChannel.onmessage = (e) => sent.push(e.data);
    broadcastActivity(333444);
    expect(sent.some((m) => m?.type === 'activity' && m?.timestamp === 333444)).toBe(true);
  });

  test('native (ios) regression: keeps shift-long token in memory without calling /auth/refresh or withCredentials', async () => {
    mockPlatform.OS = 'ios';
    nextPostResponse = async () => ({
      data: { data: makeToken('cash-ios-shift-token', 10 * 60 * 60_000) },
    });

    const [user, err] = await login({
      tenantId: 'tenant-1',
      facilityId: 'clinic-1',
      email: 'ana@clinic.test',
      password: 'StrongPass123!',
    });

    expect(err).toBeNull();
    expect(user?.id).toBe('cashier-1');
    expect(postCalls[0].config.withCredentials).toBe(false);
    expect(postCalls[0].config.headers['X-Client-Platform']).toBe('ios');

    postCalls.length = 0;
    const token = await ensureFreshAccessToken();
    expect(token).toBe('cash-ios-shift-token');
    expect(await refreshSession()).toBe(false);
    expect(postCalls.length).toBe(0);
  });

  test('web ensureFreshAccessToken when signed out returns null without calling /auth/refresh or triggering onSessionNotice', async () => {
    let notice: string | null = null;
    onSessionNotice((msg) => {
      notice = msg;
    });

    const token = await ensureFreshAccessToken();
    expect(token).toBeNull();
    expect(postCalls.length).toBe(0);
    expect(notice).toBeNull();
  });

  test('web restoreSession receiving 401 with no prior session does not trigger onSessionNotice or broadcast session-cleared', async () => {
    const peerChannel = new MockBroadcastChannel('clinicez-cashier-auth');
    const received: any[] = [];
    peerChannel.onmessage = (e) => received.push(e.data);

    let notice: string | null = null;
    onSessionNotice((msg) => {
      notice = msg;
    });

    nextPostResponse = async () => {
      const error: any = new Error('Unauthorized');
      error.response = { status: 401, data: { message: 'Invalid refresh token' } };
      throw error;
    };

    const restored = await restoreSession();
    expect(restored).toBeNull();
    expect(postCalls.length).toBe(1);
    expect(postCalls[0].url).toContain('/auth/refresh');
    expect(notice).toBeNull();
    expect(received.some((m) => m?.type === 'session-cleared')).toBe(false);
  });
});

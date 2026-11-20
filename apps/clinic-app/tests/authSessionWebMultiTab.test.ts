import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test';

const mockPlatform = { OS: 'web' as 'web' | 'ios' };
const secureStoreMap = new Map<string, string>();
const postCalls: Array<{ url: string; body: any; config: any }> = [];
let nextPostResponse: ((url: string, body: any, config: any) => Promise<any>) | null = null;

mock.module('react-native', () => ({
  Platform: mockPlatform,
}));

mock.module('../services/runtimeConfig', () => ({
  getApiBaseUrl: () => 'https://clinic.local',
  getOfflineGraceHours: () => 24,
  getWebIdleTimeoutMinutes: () => 30,
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

const deleteCalls: Array<{ url: string; config: any }> = [];
let nextDeleteResponse: ((url: string, config: any) => Promise<any>) | null = null;

mock.module('axios', () => ({
  default: {
    post: async (url: string, body: any, config: any) => {
      postCalls.push({ url, body, config });
      if (nextPostResponse) {
        return nextPostResponse(url, body, config);
      }
      return { data: { data: null } };
    },
    delete: async (url: string, config: any) => {
      deleteCalls.push({ url, config });
      if (nextDeleteResponse) {
        return nextDeleteResponse(url, config);
      }
      return { data: { data: null } };
    },
    get: async () => ({ data: { data: null } }),
  },
}));

const {
  registerActiveSessionBusyCheck,
  registerBeforeLockHook,
  isActiveSessionBusy,
} = await import('../services/sessionHooks');

const {
  __resetAuthChannelForTests,
  broadcastActivity,
  changePassword,
  getAccessToken,
  getLockedSession,
  getSessionSnapshot,
  idleLogout,
  lockSession,
  login,
  logout,
  onSessionExpired,
  onSessionIdleExpired,
  onSessionLocked,
  onSessionUnlocked,
  refreshSession,
  removeQuickUnlockPin,
  restoreSession,
  setQuickUnlockPin,
  subscribeRemoteActivity,
  subscribeSession,
  unlockWithPassword,
  unlockWithPin,
} = await import('../services/authSession');

const sampleUser = {
  id: 'staff-1',
  name: 'Dr. Reyes',
  email: 'reyes@clinic.test',
  role: 'Doctor',
  clinicId: 'clinic-1',
  tenantId: 'tenant-1',
  clinicName: 'Metro Clinic',
  permissions: ['patients:read'],
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

describe('authSession web multi-tab & native dual-mode', () => {
  const origBroadcastChannel = (globalThis as any).BroadcastChannel;
  const origNavigator = (globalThis as any).navigator;
  const origWindow = (globalThis as any).window;
  const sessionStoreMap = new Map<string, string>();

  beforeEach(async () => {
    mockPlatform.OS = 'web';
    secureStoreMap.clear();
    sessionStoreMap.clear();
    postCalls.length = 0;
    deleteCalls.length = 0;
    nextPostResponse = null;
    nextDeleteResponse = null;
    MockBroadcastChannel.instances = [];
    (globalThis as any).BroadcastChannel = MockBroadcastChannel;
    (globalThis as any).window = {
      ...(origWindow ?? {}),
      sessionStorage: {
        getItem: (k: string) => sessionStoreMap.get(k) ?? null,
        setItem: (k: string, v: string) => { sessionStoreMap.set(k, v); },
        removeItem: (k: string) => { sessionStoreMap.delete(k); },
      },
    };
    __resetAuthChannelForTests();
    await logout();
    postCalls.length = 0;
    deleteCalls.length = 0;
    MockBroadcastChannel.instances.forEach((c) => (c.posted = []));
  });

  afterEach(() => {
    __resetAuthChannelForTests();
    (globalThis as any).BroadcastChannel = origBroadcastChannel;
    (globalThis as any).navigator = origNavigator;
    (globalThis as any).window = origWindow;
  });

  test('web login sends X-Client-Platform: web, withCredentials: true, and does not persist refresh token in secureStorage', async () => {
    nextPostResponse = async () => ({
      data: { data: makeTokens('web-access-1', null) },
    });

    const [user, err] = await login('reyes@clinic.test', 'StrongPass123!');
    expect(err).toBeNull();
    expect(user?.id).toBe('staff-1');
    expect(getAccessToken()).toBe('web-access-1');

    expect(postCalls.length).toBe(1);
    expect(postCalls[0].url).toContain('/auth/login');
    expect(postCalls[0].config.withCredentials).toBe(true);
    expect(postCalls[0].config.headers['X-Client-Platform']).toBe('web');
    expect(secureStoreMap.has('clinicez.auth.refresh')).toBe(false);
  });

  test('web restoreSession in a fresh tab calls /auth/refresh with empty body even when sessionStorage is empty', async () => {
    expect(secureStoreMap.size).toBe(0);
    nextPostResponse = async () => ({
      data: { data: makeTokens('web-access-tab2', null) },
    });

    const outcome = await restoreSession();
    expect(outcome.state).toBe('signedIn');
    if (outcome.state === 'signedIn') {
      expect(outcome.user.id).toBe('staff-1');
    }
    expect(getAccessToken()).toBe('web-access-tab2');
    expect(postCalls.length).toBe(1);
    expect(postCalls[0].url).toContain('/auth/refresh');
    expect(postCalls[0].body).toEqual({});
    expect(postCalls[0].config.withCredentials).toBe(true);
  });

  test('web refreshSession uses navigator.locks and skips redundant /auth/refresh when another tab broadcasts fresh token', async () => {
    const peerChannel = new MockBroadcastChannel('clinicez-auth');
    let lockNameSeen: string | null = null;

    (globalThis as any).navigator = {
      locks: {
        request: async (name: string, cb: () => Promise<boolean>) => {
          lockNameSeen = name;
          // Simulate another tab finishing its refresh while we waited for the lock
          peerChannel.postMessage({
            type: 'session-refreshed',
            accessToken: 'broadcasted-fresh-access',
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

    expect(lockNameSeen).toBe('clinicez.auth.refresh');
    expect(ok).toBe(true);
    expect(getAccessToken()).toBe('broadcasted-fresh-access');
    expect(postCalls.length).toBe(0);
  });

  test('web logout calls /auth/logout with withCredentials and broadcasts session-cleared to other tabs', async () => {
    const peerChannel = new MockBroadcastChannel('clinicez-auth');
    const received: any[] = [];
    peerChannel.onmessage = (e) => received.push(e.data);

    nextPostResponse = async () => ({
      data: { data: makeTokens('web-access-1', null) },
    });
    await login('reyes@clinic.test', 'StrongPass123!');
    postCalls.length = 0;

    await logout();

    expect(postCalls.length).toBe(1);
    expect(postCalls[0].url).toContain('/auth/logout');
    expect(postCalls[0].body).toEqual({});
    expect(postCalls[0].config.withCredentials).toBe(true);
    expect(getAccessToken()).toBeNull();
    expect(received.some((m) => m?.type === 'session-cleared')).toBe(true);
  });

  test('receiving session-cleared from another tab clears in-memory session', async () => {
    nextPostResponse = async () => ({
      data: { data: makeTokens('web-access-1', null) },
    });
    await login('reyes@clinic.test', 'StrongPass123!');

    const peerChannel = new MockBroadcastChannel('clinicez-auth');
    peerChannel.postMessage({ type: 'session-cleared' });

    expect(getAccessToken()).toBeNull();
    expect(getSessionSnapshot().user).toBeNull();
  });

  test('native (ios) regression: persists refresh token in secureStorage and sends refreshToken in body', async () => {
    mockPlatform.OS = 'ios';
    nextPostResponse = async () => ({
      data: { data: makeTokens('ios-access-1', 'ios-refresh-1') },
    });

    const [user, err] = await login('reyes@clinic.test', 'StrongPass123!');
    expect(err).toBeNull();
    expect(user?.id).toBe('staff-1');
    expect(secureStoreMap.get('clinicez.auth.refresh')).toBe('ios-refresh-1');
    expect(postCalls[0].config.withCredentials).toBe(false);
    expect(postCalls[0].config.headers['X-Client-Platform']).toBe('ios');

    postCalls.length = 0;
    nextPostResponse = async () => ({
      data: { data: makeTokens('ios-access-2', 'ios-refresh-2') },
    });

    const outcome = await restoreSession();
    expect(outcome.state).toBe('signedIn');
    expect(postCalls[0].body).toEqual({ refreshToken: 'ios-refresh-1' });
    expect(secureStoreMap.get('clinicez.auth.refresh')).toBe('ios-refresh-2');
  });

  test('intra-tab concurrency: multiple simultaneous refreshSession calls coalesce into exactly one HTTP request', async () => {
    nextPostResponse = async () => ({
      data: { data: makeTokens('coalesced-access', null) },
    });

    const [res1, res2, res3] = await Promise.all([
      refreshSession(),
      refreshSession(),
      refreshSession(),
    ]);

    expect(res1).toBe(true);
    expect(res2).toBe(true);
    expect(res3).toBe(true);
    expect(postCalls.length).toBe(1);
    expect(getAccessToken()).toBe('coalesced-access');
  });

  test('web refreshSession falls back cleanly when navigator.locks is undefined', async () => {
    (globalThis as any).navigator = {}; // No locks API
    nextPostResponse = async () => ({
      data: { data: makeTokens('fallback-access', null) },
    });

    const ok = await refreshSession();
    expect(ok).toBe(true);
    expect(getAccessToken()).toBe('fallback-access');
    expect(postCalls.length).toBe(1);
  });

  test('web refreshSession on 401 clears in-memory credentials, triggers onSessionExpired, and broadcasts session-cleared', async () => {
    const peerChannel = new MockBroadcastChannel('clinicez-auth');
    const received: any[] = [];
    peerChannel.onmessage = (e) => received.push(e.data);

    let expiredNotified = false;
    onSessionExpired(() => {
      expiredNotified = true;
    });

    // Sign in first with token that requires refresh (expired)
    nextPostResponse = async () => ({ data: { data: makeTokens('active-access', null, -60_000) } });
    await login('reyes@clinic.test', 'Pass123!');
    expect(getAccessToken()).toBe('active-access');

    // Refresh fails with 401
    nextPostResponse = async () => {
      const error: any = new Error('Unauthorized');
      error.response = { status: 401, data: { message: 'Invalid refresh token' } };
      throw error;
    };

    const ok = await refreshSession();
    expect(ok).toBe(false);
    expect(getAccessToken()).toBeNull();
    expect(getSessionSnapshot().user).toBeNull();
    expect(expiredNotified).toBe(true);
    expect(received.some((m) => m?.type === 'session-cleared')).toBe(true);

    onSessionExpired(null);
  });

  test('web refreshSession on network error (status 0) retains session in memory and sets backoff', async () => {
    nextPostResponse = async () => ({ data: { data: makeTokens('active-access', null, -60_000) } });
    await login('reyes@clinic.test', 'Pass123!');

    nextPostResponse = async () => {
      const error: any = new Error('Network error');
      error.request = {}; // status 0 (no response)
      throw error;
    };

    const ok = await refreshSession();
    expect(ok).toBe(false);
    // User and access token remain in memory (not logged out by network glitch)
    expect(getSessionSnapshot().user?.id).toBe('staff-1');
    expect(getAccessToken()).toBe('active-access');
  });

  test('web refreshSession on server error (500) retains session in memory', async () => {
    nextPostResponse = async () => ({ data: { data: makeTokens('active-access', null, -60_000) } });
    await login('reyes@clinic.test', 'Pass123!');

    nextPostResponse = async () => {
      const error: any = new Error('Internal Server Error');
      error.response = { status: 500, data: { message: 'DB connection error' } };
      throw error;
    };

    const ok = await refreshSession();
    expect(ok).toBe(false);
    expect(getSessionSnapshot().user?.id).toBe('staff-1');
    expect(getAccessToken()).toBe('active-access');
  });

  test('receiving session-refreshed from another tab updates access token and user snapshot', async () => {
    const peerChannel = new MockBroadcastChannel('clinicez-auth');
    let notifiedUser: string | null = null;
    const unsub = subscribeSession((snap) => {
      notifiedUser = snap.user?.name ?? null;
    });

    peerChannel.postMessage({
      type: 'session-refreshed',
      accessToken: 'synced-access-token',
      accessTokenExpiresAtUtc: new Date(Date.now() + 10 * 60_000).toISOString(),
      user: sampleUser,
    });

    unsub();
    expect(getAccessToken()).toBe('synced-access-token');
    expect(getSessionSnapshot().user?.id).toBe('staff-1');
    expect(notifiedUser).toBe('Dr. Reyes');
  });

  test('web changePassword sets withCredentials and broadcasts session-refreshed to peer tabs', async () => {
    const peerChannel = new MockBroadcastChannel('clinicez-auth');
    const received: any[] = [];
    peerChannel.onmessage = (e) => received.push(e.data);

    // Initial sign in
    nextPostResponse = async () => ({ data: { data: makeTokens('initial-access', null) } });
    await login('reyes@clinic.test', 'OldPass123!');
    postCalls.length = 0;

    // Change password response
    nextPostResponse = async () => ({
      data: { data: makeTokens('new-password-access', null) },
    });

    const [user, err] = await changePassword('OldPass123!', 'NewPass456!');
    expect(err).toBeNull();
    expect(user?.id).toBe('staff-1');
    expect(getAccessToken()).toBe('new-password-access');

    expect(postCalls.length).toBe(1);
    expect(postCalls[0].url).toContain('/auth/change-password');
    expect(postCalls[0].config.withCredentials).toBe(true);
    expect(postCalls[0].config.headers['X-Client-Platform']).toBe('web');
    expect(received.some((m) => m?.type === 'session-refreshed' && m?.accessToken === 'new-password-access')).toBe(true);
  });

  test('web idleLogout calls /auth/logout, triggers onSessionIdleExpired, and broadcasts idle reason', async () => {
    const peerChannel = new MockBroadcastChannel('clinicez-auth');
    const received: any[] = [];
    peerChannel.onmessage = (e) => received.push(e.data);

    let idleFired = false;
    onSessionIdleExpired(() => {
      idleFired = true;
    });

    nextPostResponse = async () => ({ data: { data: makeTokens('active-access', null) } });
    await login('reyes@clinic.test', 'Pass123!');
    postCalls.length = 0;

    await idleLogout();

    expect(postCalls.length).toBe(1);
    expect(postCalls[0].url).toContain('/auth/logout');
    expect(postCalls[0].config.withCredentials).toBe(true);
    expect(getAccessToken()).toBeNull();
    expect(idleFired).toBe(true);
    expect(received.some((m) => m?.type === 'session-cleared' && m?.reason === 'idle')).toBe(true);

    onSessionIdleExpired(null);
  });

  test('receiving remote idle session-cleared triggers onSessionIdleExpired when tab had active session', async () => {
    nextPostResponse = async () => ({ data: { data: makeTokens('active-access', null) } });
    await login('reyes@clinic.test', 'Pass123!');

    let idleFired = false;
    onSessionIdleExpired(() => {
      idleFired = true;
    });

    const peerChannel = new MockBroadcastChannel('clinicez-auth');
    peerChannel.postMessage({ type: 'session-cleared', reason: 'idle' });

    expect(getAccessToken()).toBeNull();
    expect(getSessionSnapshot().user).toBeNull();
    expect(idleFired).toBe(true);

    onSessionIdleExpired(null);
  });

  test('broadcastActivity forwards peer timestamps to subscribeRemoteActivity listeners', () => {
    const seen: number[] = [];
    const unsub = subscribeRemoteActivity((ts) => seen.push(ts));
    const peerChannel = new MockBroadcastChannel('clinicez-auth');

    peerChannel.postMessage({ type: 'activity', timestamp: 123456789 });
    unsub();

    expect(seen).toEqual([123456789]);

    const sent: any[] = [];
    peerChannel.onmessage = (e) => sent.push(e.data);
    broadcastActivity(987654321);
    expect(sent.some((m) => m?.type === 'activity' && m?.timestamp === 987654321)).toBe(true);
  });

  test('receiving session-refreshed for a different user updates snapshot with the new user identity', async () => {
    nextPostResponse = async () => ({ data: { data: makeTokens('staff1-access', null) } });
    await login('reyes@clinic.test', 'Pass123!');

    const seenIds: string[] = [];
    const unsub = subscribeSession((snap) => {
      if (snap.user) seenIds.push(snap.user.id);
    });

    const peerChannel = new MockBroadcastChannel('clinicez-auth');
    peerChannel.postMessage({
      type: 'session-refreshed',
      accessToken: 'staff2-access',
      accessTokenExpiresAtUtc: new Date(Date.now() + 10 * 60_000).toISOString(),
      user: { ...sampleUser, id: 'staff-2', name: 'Nurse Santos', email: 'santos@clinic.test' },
    });

    unsub();
    expect(getSessionSnapshot().user?.id).toBe('staff-2');
    expect(seenIds).toEqual(['staff-2']);
  });

  test('lockSession flushes beforeLock hooks before clearing accessToken, marks sessionStorage, calls /auth/lock, and broadcasts session-locked', async () => {
    const peerChannel = new MockBroadcastChannel('clinicez-auth');
    const received: any[] = [];
    peerChannel.onmessage = (e) => received.push(e.data);

    let lockedInfoSeen: any = null;
    onSessionLocked((info) => {
      lockedInfoSeen = info;
    });

    nextPostResponse = async () => ({ data: { data: makeTokens('lock-access-1', null) } });
    await login('reyes@clinic.test', 'Pass123!');
    postCalls.length = 0;

    let tokenDuringHook: string | null = null;
    const unreg = registerBeforeLockHook(() => {
      tokenDuringHook = getAccessToken();
    });

    const serverLockedPayload = {
      staffId: 'staff-1',
      name: 'Dr. Reyes',
      email: 'reyes@clinic.test',
      role: 'Doctor',
      roleName: null,
      clinicName: 'Metro Clinic',
      hasQuickUnlockPin: true,
      allowStaffPinUnlock: true,
      lockedAtUtc: new Date().toISOString(),
      lockExpiresAtUtc: new Date(Date.now() + 8 * 3_600_000).toISOString(),
    };

    nextPostResponse = async () => ({ data: { data: serverLockedPayload } });
    const result = await lockSession();
    unreg();
    onSessionLocked(null);

    expect(tokenDuringHook).toBe('lock-access-1');
    expect(getAccessToken()).toBeNull();
    expect(result?.staffId).toBe('staff-1');
    expect(lockedInfoSeen?.staffId).toBe('staff-1');
    expect(sessionStoreMap.get('clinicez.auth.workstationLocked')).toBe('1');
    expect(postCalls.some((c) => c.url.includes('/auth/lock'))).toBe(true);
    expect(received.some((m) => m?.type === 'session-locked' && m?.lockedSession?.staffId === 'staff-1')).toBe(true);
  });

  test('restoreSession returns workstationLocked on HTTP 423 SESSION_LOCKED without issuing accessToken (prevents F5 bypass)', async () => {
    const lockedPayload = {
      staffId: 'staff-1',
      name: 'Dr. Reyes',
      email: 'reyes@clinic.test',
      role: 'Doctor',
      roleName: null,
      clinicName: 'Metro Clinic',
      hasQuickUnlockPin: true,
      allowStaffPinUnlock: true,
      lockedAtUtc: new Date().toISOString(),
      lockExpiresAtUtc: new Date(Date.now() + 8 * 3_600_000).toISOString(),
    };

    nextPostResponse = async () => {
      throw {
        isAxiosError: true,
        response: {
          status: 423,
          data: {
            succeeded: false,
            errorCode: 'SESSION_LOCKED',
            message: 'Workstation is locked.',
            data: lockedPayload,
          },
        },
      };
    };

    const outcome = await restoreSession();
    expect(outcome.state).toBe('workstationLocked');
    if (outcome.state === 'workstationLocked') {
      expect(outcome.lockedSession.email).toBe('reyes@clinic.test');
    }
    expect(getAccessToken()).toBeNull();
    expect(getLockedSession()?.staffId).toBe('staff-1');
  });

  test('unlockWithPin restores accessToken, clears lock flag, and broadcasts session-unlocked; 5-strike lockout clears session', async () => {
    const peerChannel = new MockBroadcastChannel('clinicez-auth');
    const received: any[] = [];
    peerChannel.onmessage = (e) => received.push(e.data);

    let unlockedUser: any = null;
    onSessionUnlocked((u) => {
      unlockedUser = u;
    });

    sessionStoreMap.set('clinicez.auth.workstationLocked', '1');
    nextPostResponse = async () => ({ data: { data: makeTokens('unlocked-access-1', null) } });

    const [user, err] = await unlockWithPin('246810');
    expect(err).toBeNull();
    expect(user?.id).toBe('staff-1');
    expect(getAccessToken()).toBe('unlocked-access-1');
    expect(getLockedSession()).toBeNull();
    expect(sessionStoreMap.has('clinicez.auth.workstationLocked')).toBe(false);
    expect(unlockedUser?.id).toBe('staff-1');
    expect(received.some((m) => m?.type === 'session-unlocked' && m?.accessToken === 'unlocked-access-1')).toBe(true);

    // 5-strike PIN lockout returns 401 INVALIDTOKEN and triggers onSessionExpired
    let expiredFired = false;
    onSessionExpired(() => {
      expiredFired = true;
    });
    nextPostResponse = async () => {
      throw {
        isAxiosError: true,
        response: {
          status: 401,
          data: {
            succeeded: false,
            errorCode: 'INVALIDTOKEN',
            message: 'Too many incorrect PIN attempts. Sign in with your password.',
          },
        },
      };
    };
    const [failUser, failErr] = await unlockWithPin('111222');
    onSessionExpired(null);
    onSessionUnlocked(null);

    expect(failUser).toBeNull();
    expect(failErr?.status).toBe(401);
    expect(expiredFired).toBe(true);
    expect(getAccessToken()).toBeNull();
  });

  test('unlockWithPassword restores session and clears lock marker', async () => {
    sessionStoreMap.set('clinicez.auth.workstationLocked', '1');
    nextPostResponse = async () => ({ data: { data: makeTokens('pw-unlock-access', null) } });

    const [user, err] = await unlockWithPassword('StrongPass123!');
    expect(err).toBeNull();
    expect(user?.id).toBe('staff-1');
    expect(getAccessToken()).toBe('pw-unlock-access');
    expect(sessionStoreMap.has('clinicez.auth.workstationLocked')).toBe(false);
  });

  test('setQuickUnlockPin and removeQuickUnlockPin update user hasQuickUnlockPin snapshot', async () => {
    nextPostResponse = async () => ({ data: { data: makeTokens('pin-mgmt-access', null) } });
    await login('reyes@clinic.test', 'StrongPass123!');
    postCalls.length = 0;

    nextPostResponse = async () => ({ data: { data: { ...sampleUser, hasQuickUnlockPin: true } } });
    const [setUser, setErr] = await setQuickUnlockPin('StrongPass123!', '246810');
    expect(setErr).toBeNull();
    expect(setUser?.hasQuickUnlockPin).toBe(true);
    expect(getSessionSnapshot().user?.hasQuickUnlockPin).toBe(true);

    nextDeleteResponse = async () => ({ data: { data: { ...sampleUser, hasQuickUnlockPin: false } } });
    const [remUser, remErr] = await removeQuickUnlockPin('StrongPass123!');
    expect(remErr).toBeNull();
    expect(remUser?.hasQuickUnlockPin).toBe(false);
    expect(getSessionSnapshot().user?.hasQuickUnlockPin).toBe(false);
    expect(deleteCalls.some((c) => c.url.includes('/auth/pin'))).toBe(true);
  });

  test('idleLogout broadcasts idle reason BEFORE calling /auth/logout to prevent cross-tab 401 notice race', async () => {
    const events: string[] = [];
    const peerChannel = new MockBroadcastChannel('clinicez-auth');
    peerChannel.onmessage = (e) => {
      if (e.data?.type === 'session-cleared') {
        events.push(`broadcast:${e.data.reason}`);
      }
    };

    nextPostResponse = async () => ({ data: { data: makeTokens('race-access', null) } });
    await login('reyes@clinic.test', 'Pass123!');
    postCalls.length = 0;

    nextPostResponse = async (url: string) => {
      events.push(`http:${url}`);
      return { data: { data: null } };
    };

    await idleLogout();
    expect(events[0]).toBe('broadcast:idle');
    expect(events[1]).toContain('http:');
    expect(events[1]).toContain('/auth/logout');
  });

  test('registerActiveSessionBusyCheck reports active clinical work cleanly', () => {
    let busy = true;
    const unreg = registerActiveSessionBusyCheck(() => busy);
    expect(isActiveSessionBusy()).toBe(true);
    busy = false;
    expect(isActiveSessionBusy()).toBe(false);
    unreg();
    expect(isActiveSessionBusy()).toBe(false);
  });
});

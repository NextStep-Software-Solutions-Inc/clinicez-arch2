import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { eq } from 'drizzle-orm';
import * as path from 'node:path';
import React, { act } from 'react';
import * as ReactJsxRuntime from 'react/jsx-runtime';
import * as ReactJsxDevRuntime from 'react/jsx-dev-runtime';
import { notifications } from '../db/schema/notifications';

// ── Unify React instance across patient-app and workspace root ────────────────
for (const reactPkg of [
  '../../../node_modules/react',
  '../../../packages/comms-sdk/node_modules/react',
]) {
  try {
    mock.module(require.resolve(reactPkg), () => ({ ...React, default: React }));
  } catch {
    /* not present */
  }
  try {
    mock.module(require.resolve(`${reactPkg}/jsx-runtime`), () => ReactJsxRuntime);
  } catch {
    /* not present */
  }
  try {
    mock.module(require.resolve(`${reactPkg}/jsx-dev-runtime`), () => ReactJsxDevRuntime);
  } catch {
    /* not present */
  }
}
mock.module('react', () => ({ ...React, default: React }));
mock.module('react/jsx-runtime', () => ReactJsxRuntime);
mock.module('react/jsx-dev-runtime', () => ReactJsxDevRuntime);

const { createRoot } = await import('react-dom/client');
type Root = ReturnType<typeof createRoot>;

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const APP_ROOT = path.resolve(import.meta.dir, '..');

function mockAliasAndPath(specifiers: string[], factory: () => Record<string, unknown>) {
  for (const spec of specifiers) {
    mock.module(spec, factory);
  }
}

// ── In-memory SQLite DB for real notificationService + SQLite queries ─────────
function createTestDb() {
  const sqlite = new Database(':memory:');
  sqlite.run(`
    CREATE TABLE notifications (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      type TEXT NOT NULL,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      data TEXT,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      read_at INTEGER,
      expires_at INTEGER,
      source_id TEXT,
      deleted_at INTEGER
    );
  `);
  return { sqlite, db: drizzle(sqlite) };
}

let activeSqlite: InstanceType<typeof Database> | null = null;
let activeDb = createTestDb().db;

// ── Shared EventEmitter mock ──────────────────────────────────────────────────
const emitterListeners = new Map<string, Set<() => void>>();
const mockDeviceEventEmitter = {
  emit: (event: string) => {
    emitterListeners.get(event)?.forEach((fn) => fn());
  },
  addListener: (event: string, fn: () => void) => {
    let set = emitterListeners.get(event);
    if (!set) {
      set = new Set();
      emitterListeners.set(event, set);
    }
    set.add(fn);
    return {
      remove: () => {
        set?.delete(fn);
      },
    };
  },
};

mock.module('react-native', () => ({
  Platform: {
    OS: 'web',
    select: (obj: Record<string, unknown>) => obj?.web ?? obj?.default,
  },
  DeviceEventEmitter: mockDeviceEventEmitter,
}));

mock.module('expo-notifications', () => ({
  PermissionStatus: {
    UNDETERMINED: 'undetermined',
    GRANTED: 'granted',
    DENIED: 'denied',
  },
  AndroidImportance: { MAX: 5, HIGH: 4 },
  getPermissionsAsync: async () => ({ status: 'undetermined' }),
  requestPermissionsAsync: async () => ({ status: 'undetermined' }),
  getExpoPushTokenAsync: async () => ({ data: 'mock-token' }),
  setNotificationChannelAsync: async () => {},
  addNotificationReceivedListener: () => ({ remove: () => {} }),
  addNotificationResponseReceivedListener: () => ({ remove: () => {} }),
  scheduleNotificationAsync: async () => 'mock-id',
}));

mockAliasAndPath(
  ['@db/index', '../db/index', path.resolve(APP_ROOT, 'db/index.ts')],
  () => ({
    db: new Proxy(
      {},
      {
        get(_target, prop) {
          const value = (activeDb as any)[prop];
          return typeof value === 'function' ? value.bind(activeDb) : value;
        },
      },
    ),
  }),
);

// ── Mock AuthContext state (mutated between renders to simulate lifecycle) ────
interface MockAuthState {
  internalPatientId: string | null;
  clerkSessionId: string | null;
  isClerkLoaded: boolean;
  isClerkSignedIn: boolean;
  getToken: () => Promise<string | null>;
}

let mockAuthState: MockAuthState = {
  internalPatientId: null,
  clerkSessionId: null,
  isClerkLoaded: false,
  isClerkSignedIn: false,
  getToken: async () => null,
};

mockAliasAndPath(
  ['contexts/AuthContext', '../contexts/AuthContext', path.resolve(APP_ROOT, 'contexts/AuthContext.tsx')],
  () => ({
    useAuth: () => mockAuthState,
  }),
);

// ── Mock backend APIs (recording tokens and payloads) ─────────────────────────
interface ApiCallRecord {
  op: 'fetch' | 'markRead' | 'markAllRead' | 'registerSession';
  patientId: string;
  token: string | null;
  id?: string;
}

const apiCalls: ApiCallRecord[] = [];

type FetchResult = {
  items: Array<{
    id: string;
    type: 'AppointmentReminder';
    category: 'Appointments';
    title: string;
    body: string;
    isRead: boolean;
    readAt?: string | null;
    createdAt: string;
  }>;
  unreadCount: number;
  totalCount: number;
};

let fetchImpl: (
  getToken: () => Promise<string | null>,
  patientId: string,
  opts?: { unreadOnly?: boolean; skip?: number; take?: number },
) => Promise<FetchResult> = async () => ({ items: [], unreadCount: 0, totalCount: 0 });

mockAliasAndPath(
  [
    '../services/api/notificationsApi',
    'services/api/notificationsApi',
    path.resolve(APP_ROOT, 'services/api/notificationsApi.ts'),
  ],
  () => ({
    fetchNotificationsFromBackend: async (
      getToken: () => Promise<string | null>,
      patientId: string,
      opts?: { unreadOnly?: boolean; skip?: number; take?: number },
    ) => {
      const token = await getToken();
      apiCalls.push({ op: 'fetch', patientId, token });
      return fetchImpl(getToken, patientId, opts);
    },
    markNotificationReadOnBackend: async (
      getToken: () => Promise<string | null>,
      patientId: string,
      notificationId: string,
    ) => {
      const token = await getToken();
      apiCalls.push({ op: 'markRead', patientId, token, id: notificationId });
    },
    markAllNotificationsReadOnBackend: async (
      getToken: () => Promise<string | null>,
      patientId: string,
    ) => {
      const token = await getToken();
      apiCalls.push({ op: 'markAllRead', patientId, token });
    },
  }),
);

mockAliasAndPath(
  [
    'services/api/sessionsApi',
    '../services/api/sessionsApi',
    path.resolve(APP_ROOT, 'services/api/sessionsApi.ts'),
  ],
  () => ({
    registerDeviceSessionOnBackend: async (
      getToken: () => Promise<string | null>,
      patientId: string,
    ) => {
      const token = await getToken();
      apiCalls.push({ op: 'registerSession', patientId, token });
      return {
        sessionId: 'sess-resp-1',
        deviceId: 'dev-1',
        deviceLabel: 'Chrome Web',
        issuedAt: '2026-11-27T00:00:00.000Z',
      };
    },
  }),
);

mockAliasAndPath(
  [
    'services/devices/deviceIdentity',
    '../services/devices/deviceIdentity',
    path.resolve(APP_ROOT, 'services/devices/deviceIdentity.ts'),
  ],
  () => ({
    getOrCreateDeviceId: async () => 'dev-web-294',
    getDeviceLabel: () => 'Chrome Web',
  }),
);

mockAliasAndPath(
  [
    'services/sync/documentsSyncService',
    '../services/sync/documentsSyncService',
    path.resolve(APP_ROOT, 'services/sync/documentsSyncService.ts'),
  ],
  () => ({
    DOCUMENTS_SYNCED_EVENT: 'documents-synced',
  }),
);

// Import subjects under test AFTER mocks are registered
const { NotificationProvider, useNotificationContext } = await import(
  '../contexts/NotificationContext.web'
);
const {
  NOTIFICATIONS_CHANGED_EVENT,
  clearAllNotificationsWithSync,
  deleteNotificationWithSync,
  getUnreadCount,
  markAllAsReadWithSync,
  markAsReadWithSync,
  syncNotificationsFromBackend,
} = await import('../services/notifications/notificationService');

// ── Minimal DOM & Browser Environment Harness for React 19 createRoot ─────────
class FakeHTMLIFrameElement {}
class FakeHTMLElement {}

interface FakeBrowserEnv {
  document: any;
  window: any;
  focusListeners: Set<() => void>;
  setVisibility: (state: 'visible' | 'hidden') => void;
  dispatchFocus: () => void;
}

function createFakeBrowserEnv(): FakeBrowserEnv {
  const focusListeners = new Set<() => void>();
  let visibilityState: 'visible' | 'hidden' = 'visible';

  const createNode = (tagName: string) => {
    const node: any = {
      nodeType: 1,
      nodeName: tagName.toUpperCase(),
      tagName: tagName.toUpperCase(),
      namespaceURI: 'http://www.w3.org/1999/xhtml',
      childNodes: [] as any[],
      style: {},
      ownerDocument: null as any,
      parentNode: null as any,
      appendChild(child: any) {
        child.parentNode = node;
        node.childNodes.push(child);
        return child;
      },
      removeChild(child: any) {
        const idx = node.childNodes.indexOf(child);
        if (idx >= 0) node.childNodes.splice(idx, 1);
        child.parentNode = null;
        return child;
      },
      insertBefore(child: any, ref: any) {
        child.parentNode = node;
        const idx = ref ? node.childNodes.indexOf(ref) : -1;
        if (idx >= 0) node.childNodes.splice(idx, 0, child);
        else node.childNodes.push(child);
        return child;
      },
      addEventListener() {},
      removeEventListener() {},
      setAttribute() {},
      removeAttribute() {},
    };
    return node;
  };

  const doc: any = {
    nodeType: 9,
    nodeName: '#document',
    defaultView: null as any,
    activeElement: null,
    documentElement: null as any,
    body: null as any,
    get visibilityState() {
      return visibilityState;
    },
    createElement(tag: string) {
      const el = createNode(tag);
      el.ownerDocument = doc;
      return el;
    },
    createTextNode(text: string) {
      return {
        nodeType: 3,
        nodeName: '#text',
        nodeValue: text,
        ownerDocument: doc,
        parentNode: null,
      };
    },
    addEventListener() {},
    removeEventListener() {},
  };

  const win: any = {
    document: doc,
    HTMLIFrameElement: FakeHTMLIFrameElement,
    HTMLElement: FakeHTMLElement,
    addEventListener(event: string, fn: () => void) {
      if (event === 'focus') focusListeners.add(fn);
    },
    removeEventListener(event: string, fn: () => void) {
      if (event === 'focus') focusListeners.delete(fn);
    },
  };

  doc.documentElement = doc.createElement('html');
  doc.body = doc.createElement('body');
  doc.defaultView = win;

  return {
    document: doc,
    window: win,
    focusListeners,
    setVisibility: (state) => {
      visibilityState = state;
    },
    dispatchFocus: () => {
      for (const fn of [...focusListeners]) {
        fn();
      }
    },
  };
}

async function flushMicrotasks(rounds = 8) {
  for (let i = 0; i < rounds; i++) {
    await Promise.resolve();
  }
}

const PATIENT_ID = 'patient-294';
const BEARER_TOKEN = 'clerk-jwt-294';

async function seedLocalNotification(id: string, isRead = false, patientId = PATIENT_ID) {
  await activeDb.insert(notifications).values({
    id,
    patientId,
    type: 'appointment_reminder',
    category: 'appointments',
    title: 'Cached Notification',
    body: 'Stored in IndexedDB SQLite.',
    data: null,
    isRead,
    createdAt: new Date('2026-11-27T01:00:00.000Z'),
    readAt: isRead ? new Date('2026-11-27T01:30:00.000Z') : null,
    expiresAt: null,
    sourceId: 'appt-294',
    deletedAt: null,
  });
}

describe('Issue #294: Web NotificationProvider Clerk session & Bearer token guards', () => {
  const origWindow = (globalThis as any).window;
  const origDocument = (globalThis as any).document;
  const origSetInterval = globalThis.setInterval;
  const origClearInterval = globalThis.clearInterval;

  let browserEnv: FakeBrowserEnv;
  let nextIntervalId = 1;
  let activeIntervals: Map<number, { fn: () => void; ms: number }>;
  let clearedIntervalIds: number[];

  beforeEach(() => {
    const created = createTestDb();
    activeSqlite = created.sqlite;
    activeDb = created.db;
    apiCalls.length = 0;
    emitterListeners.clear();
    fetchImpl = async () => ({ items: [], unreadCount: 0, totalCount: 0 });
    mockAuthState = {
      internalPatientId: null,
      clerkSessionId: null,
      isClerkLoaded: false,
      isClerkSignedIn: false,
      getToken: async () => null,
    };

    browserEnv = createFakeBrowserEnv();
    (globalThis as any).window = browserEnv.window;
    (globalThis as any).document = browserEnv.document;

    nextIntervalId = 1;
    activeIntervals = new Map();
    clearedIntervalIds = [];

    (globalThis as any).setInterval = (fn: () => void, ms?: number) => {
      const id = nextIntervalId++;
      activeIntervals.set(id, { fn, ms: ms ?? 0 });
      return id as unknown as ReturnType<typeof setInterval>;
    };
    (globalThis as any).clearInterval = (id: any) => {
      const numId = Number(id);
      if (activeIntervals.delete(numId)) {
        clearedIntervalIds.push(numId);
      }
    };
  });

  afterEach(() => {
    (globalThis as any).window = origWindow;
    (globalThis as any).document = origDocument;
    globalThis.setInterval = origSetInterval;
    globalThis.clearInterval = origClearInterval;
    activeSqlite?.close();
    activeSqlite = null;
  });

  function mountProvider() {
    let latestCtx: ReturnType<typeof useNotificationContext> | null = null;

    function Consumer() {
      latestCtx = useNotificationContext();
      return null;
    }

    function Harness() {
      return React.createElement(
        NotificationProvider,
        null,
        React.createElement(Consumer),
      );
    }

    const container = browserEnv.document.createElement('div');
    const root: Root = createRoot(container);

    const render = async () => {
      await act(async () => {
        root.render(React.createElement(Harness));
        await flushMicrotasks();
      });
    };

    const unmount = async () => {
      await act(async () => {
        root.unmount();
        await flushMicrotasks();
      });
    };

    return {
      render,
      unmount,
      getCtx: () => latestCtx!,
    };
  }

  test('does not fetch notifications, register device session, or start polling when patientId is cached before Clerk loads or while signed out', async () => {
    await seedLocalNotification('local-1', false);
    await seedLocalNotification('local-2', false);

    // Phase 1: Cached patientId hydrated from IndexedDB while Clerk is still loading
    mockAuthState = {
      internalPatientId: PATIENT_ID,
      clerkSessionId: null,
      isClerkLoaded: false,
      isClerkSignedIn: false,
      getToken: async () => null,
    };

    const mounted = mountProvider();
    try {
      await mounted.render();

      expect(apiCalls).toEqual([]);
      expect(activeIntervals.size).toBe(0);
      expect(browserEnv.focusListeners.size).toBe(0);
      expect(mounted.getCtx().unreadCount).toBe(2);

      // Phase 2: Clerk finishes loading, user is signed out (local PIN vault remains)
      mockAuthState = {
        internalPatientId: PATIENT_ID,
        clerkSessionId: null,
        isClerkLoaded: true,
        isClerkSignedIn: false,
        getToken: async () => null,
      };
      await mounted.render();

      expect(apiCalls).toEqual([]);
      expect(activeIntervals.size).toBe(0);
      expect(browserEnv.focusListeners.size).toBe(0);

      // Manual refreshNotifications() updates local count without hitting the backend
      await seedLocalNotification('local-3', false);
      await act(async () => {
        mounted.getCtx().refreshNotifications();
        await flushMicrotasks();
      });

      expect(apiCalls).toEqual([]);
      expect(mounted.getCtx().unreadCount).toBe(3);

      // Defensive edge: even if a stale clerkSessionId existed while isClerkLoaded is false, no request fires
      mockAuthState = {
        internalPatientId: PATIENT_ID,
        clerkSessionId: 'stale-sess',
        isClerkLoaded: false,
        isClerkSignedIn: false,
        getToken: async () => null,
      };
      await mounted.render();

      expect(apiCalls).toEqual([]);
      expect(activeIntervals.size).toBe(0);
      expect(browserEnv.focusListeners.size).toBe(0);
    } finally {
      await mounted.unmount();
    }
  });

  test('once signed in, runs initial sync, 60s visible polling, and focus refresh with Bearer token, then clears timers and stops requests on sign-out', async () => {
    let remoteCallNumber = 0;
    fetchImpl = async () => {
      remoteCallNumber += 1;
      return {
        items: [
          {
            id: `remote-${remoteCallNumber}`,
            type: 'AppointmentReminder',
            category: 'Appointments',
            title: `Appointment Update #${remoteCallNumber}`,
            body: 'Confirmed by clinic.',
            isRead: false,
            readAt: null,
            createdAt: '2026-11-27T02:00:00.000Z',
          },
        ],
        unreadCount: remoteCallNumber,
        totalCount: remoteCallNumber,
      };
    };

    // Start before sign-in with cached patientId
    mockAuthState = {
      internalPatientId: PATIENT_ID,
      clerkSessionId: null,
      isClerkLoaded: true,
      isClerkSignedIn: false,
      getToken: async () => null,
    };

    const mounted = mountProvider();
    try {
      await mounted.render();
      expect(apiCalls).toEqual([]);
      expect(activeIntervals.size).toBe(0);

      // Sign in with active Clerk session
      mockAuthState = {
        internalPatientId: PATIENT_ID,
        clerkSessionId: 'sess_active_294',
        isClerkLoaded: true,
        isClerkSignedIn: true,
        getToken: async () => BEARER_TOKEN,
      };
      await mounted.render();

      const fetchCallsAfterSignIn = apiCalls.filter((c) => c.op === 'fetch');
      expect(fetchCallsAfterSignIn).toHaveLength(1);
      expect(fetchCallsAfterSignIn[0]).toEqual({
        op: 'fetch',
        patientId: PATIENT_ID,
        token: BEARER_TOKEN,
      });
      expect(apiCalls.filter((c) => c.op === 'registerSession')).toHaveLength(1);
      expect(mounted.getCtx().unreadCount).toBe(1);
      expect(activeIntervals.size).toBe(1);
      expect(browserEnv.focusListeners.size).toBe(1);

      const [[intervalId, intervalEntry]] = [...activeIntervals.entries()];
      expect(intervalEntry.ms).toBe(60_000);

      // 60s poll while tab is hidden should NOT fetch
      browserEnv.setVisibility('hidden');
      await act(async () => {
        intervalEntry.fn();
        await flushMicrotasks();
      });
      expect(apiCalls.filter((c) => c.op === 'fetch')).toHaveLength(1);

      // 60s poll while tab is visible fetches with Bearer token and updates unreadCount
      browserEnv.setVisibility('visible');
      await act(async () => {
        intervalEntry.fn();
        await flushMicrotasks();
      });
      expect(apiCalls.filter((c) => c.op === 'fetch')).toHaveLength(2);
      expect(apiCalls.filter((c) => c.op === 'fetch')[1].token).toBe(BEARER_TOKEN);
      expect(mounted.getCtx().unreadCount).toBe(2);

      // Window focus triggers refresh with Bearer token and updates unreadCount
      await act(async () => {
        browserEnv.dispatchFocus();
        await flushMicrotasks();
      });
      expect(apiCalls.filter((c) => c.op === 'fetch')).toHaveLength(3);
      expect(apiCalls.filter((c) => c.op === 'fetch')[2].token).toBe(BEARER_TOKEN);
      expect(mounted.getCtx().unreadCount).toBe(3);

      // Sign out: immediately clears interval, removes focus listener, resets unreadCount
      mockAuthState = {
        internalPatientId: null,
        clerkSessionId: null,
        isClerkLoaded: true,
        isClerkSignedIn: false,
        getToken: async () => null,
      };
      await mounted.render();

      expect(activeIntervals.size).toBe(0);
      expect(clearedIntervalIds).toContain(intervalId);
      expect(browserEnv.focusListeners.size).toBe(0);
      expect(mounted.getCtx().unreadCount).toBe(0);

      // Subsequent focus events produce zero backend requests
      await act(async () => {
        browserEnv.dispatchFocus();
        await flushMicrotasks();
      });
      expect(apiCalls.filter((c) => c.op === 'fetch')).toHaveLength(3);
    } finally {
      await mounted.unmount();
    }
  });

  test('session expiry with cached patientId immediately stops polling and prevents stale in-flight count updates on logout', async () => {
    let releaseFetch!: () => void;
    const fetchGate = new Promise<void>((resolve) => {
      releaseFetch = resolve;
    });

    fetchImpl = async () => {
      await fetchGate;
      return {
        items: [
          {
            id: 'inflight-1',
            type: 'AppointmentReminder',
            category: 'Appointments',
            title: 'In-flight Notification',
            body: 'Arrived after logout.',
            isRead: false,
            readAt: null,
            createdAt: '2026-11-27T02:00:00.000Z',
          },
        ],
        unreadCount: 1,
        totalCount: 1,
      };
    };

    mockAuthState = {
      internalPatientId: PATIENT_ID,
      clerkSessionId: 'sess_expiring',
      isClerkLoaded: true,
      isClerkSignedIn: true,
      getToken: async () => BEARER_TOKEN,
    };

    const mounted = mountProvider();
    try {
      await mounted.render();
      expect(apiCalls.filter((c) => c.op === 'fetch')).toHaveLength(1);
      expect(activeIntervals.size).toBe(1);

      // User logs out while the initial fetch is still in-flight
      mockAuthState = {
        internalPatientId: null,
        clerkSessionId: null,
        isClerkLoaded: true,
        isClerkSignedIn: false,
        getToken: async () => null,
      };
      await mounted.render();

      expect(activeIntervals.size).toBe(0);
      expect(browserEnv.focusListeners.size).toBe(0);
      expect(mounted.getCtx().unreadCount).toBe(0);

      // In-flight fetch resolves after logout; unreadCount MUST stay 0
      await act(async () => {
        releaseFetch();
        await flushMicrotasks();
      });
      expect(mounted.getCtx().unreadCount).toBe(0);
    } finally {
      await mounted.unmount();
    }
  });

  test('defense-in-depth: notificationService sync helpers never call backend API when getToken returns null or whitespace', async () => {
    await seedLocalNotification('n-1', false);
    await seedLocalNotification('n-2', false);

    const nullToken = async () => null;
    const blankToken = async () => '   ';

    await syncNotificationsFromBackend(nullToken, PATIENT_ID);
    await syncNotificationsFromBackend(blankToken, PATIENT_ID);
    expect(apiCalls).toEqual([]);

    // Local writes still succeed while backend PATCH/POST calls are skipped without a token
    await markAsReadWithSync(nullToken, PATIENT_ID, 'n-1');
    expect(await getUnreadCount(PATIENT_ID)).toBe(1);
    expect(apiCalls).toEqual([]);

    await deleteNotificationWithSync(blankToken, PATIENT_ID, 'n-2');
    expect(await getUnreadCount(PATIENT_ID)).toBe(0);
    expect(apiCalls).toEqual([]);

    await seedLocalNotification('n-3', false);
    await markAllAsReadWithSync(nullToken, PATIENT_ID);
    expect(await getUnreadCount(PATIENT_ID)).toBe(0);
    expect(apiCalls).toEqual([]);

    await seedLocalNotification('n-4', false);
    await clearAllNotificationsWithSync(blankToken, PATIENT_ID);
    expect(await getUnreadCount(PATIENT_ID)).toBe(0);
    expect(apiCalls).toEqual([]);

    // Verify row state persisted locally
    const [row1] = await activeDb
      .select()
      .from(notifications)
      .where(eq(notifications.id, 'n-1'));
    expect(row1.isRead).toBe(true);

    // When a valid token is returned, backend calls execute with that exact token
    let tokenCalls = 0;
    const validToken = async () => {
      tokenCalls += 1;
      return BEARER_TOKEN;
    };
    await syncNotificationsFromBackend(validToken, PATIENT_ID);
    expect(tokenCalls).toBe(1);
    expect(apiCalls).toEqual([{ op: 'fetch', patientId: PATIENT_ID, token: BEARER_TOKEN }]);
  });
});

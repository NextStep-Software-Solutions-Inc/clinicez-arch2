import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, it, expect, mock, beforeEach, afterEach } from 'bun:test';
import { ADMIN_LAST_ACTIVE_KEY } from '../src/lib/idleGuard';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const authState = {
  isSignedIn: true,
  signOutCalls: 0,
  signOutImpl: async () => {},
};

mock.module('@clerk/clerk-react', () => ({
  useAuth: () => ({ isSignedIn: authState.isSignedIn }),
  useClerk: () => ({
    signOut: async () => {
      authState.signOutCalls += 1;
      await authState.signOutImpl();
    },
  }),
}));

const { IdleSessionGuard } = await import('../src/components/IdleSessionGuard');

// Minimal virtual DOM harness for React 19 createRoot + useEffect testing without happy-dom
class MiniNode {
  nodeType: number;
  tagName: string;
  nodeName: string;
  parentNode: MiniNode | null = null;
  childNodes: MiniNode[] = [];
  attrs: Record<string, string> = {};
  style: Record<string, string> = {};
  listeners: Record<string, Set<Function>> = {};
  nodeValue = '';
  ownerDocument: any = null;
  namespaceURI = 'http://www.w3.org/1999/xhtml';

  constructor(nodeType: number, tagName: string, text = '', ownerDocument: any = null) {
    this.nodeType = nodeType;
    this.tagName = tagName.toUpperCase();
    this.nodeName = nodeType === 3 ? '#text' : nodeType === 8 ? '#comment' : this.tagName;
    this.nodeValue = text;
    this.ownerDocument = ownerDocument;
  }

  get firstChild(): MiniNode | null {
    return this.childNodes[0] ?? null;
  }

  get nextSibling(): MiniNode | null {
    if (!this.parentNode) return null;
    const idx = this.parentNode.childNodes.indexOf(this);
    return idx >= 0 ? (this.parentNode.childNodes[idx + 1] ?? null) : null;
  }

  get textContent(): string {
    if (this.nodeType === 3) return this.nodeValue;
    if (this.nodeType === 8) return '';
    return this.childNodes.map((c) => c.textContent).join('');
  }

  set textContent(val: string) {
    this.childNodes = [];
    if (val) {
      this.appendChild(new MiniNode(3, '', String(val), this.ownerDocument));
    }
  }

  appendChild(child: MiniNode): MiniNode {
    if (child.parentNode) child.parentNode.removeChild(child);
    child.parentNode = this;
    child.ownerDocument = this.ownerDocument;
    this.childNodes.push(child);
    return child;
  }

  insertBefore(newNode: MiniNode, refNode: MiniNode | null): MiniNode {
    if (!refNode) return this.appendChild(newNode);
    if (newNode.parentNode) newNode.parentNode.removeChild(newNode);
    const idx = this.childNodes.indexOf(refNode);
    newNode.parentNode = this;
    newNode.ownerDocument = this.ownerDocument;
    if (idx === -1) this.childNodes.push(newNode);
    else this.childNodes.splice(idx, 0, newNode);
    return newNode;
  }

  removeChild(child: MiniNode): MiniNode {
    const idx = this.childNodes.indexOf(child);
    if (idx !== -1) {
      this.childNodes.splice(idx, 1);
      child.parentNode = null;
    }
    return child;
  }

  setAttribute(name: string, val: unknown) {
    this.attrs[name] = String(val);
  }

  setAttributeNS(_ns: string | null, name: string, val: unknown) {
    this.attrs[name] = String(val);
  }

  removeAttribute(name: string) {
    delete this.attrs[name];
  }

  removeAttributeNS(_ns: string | null, name: string) {
    delete this.attrs[name];
  }

  getAttribute(name: string): string | null {
    return this.attrs[name] ?? null;
  }

  addEventListener(type: string, fn: Function) {
    if (!this.listeners[type]) this.listeners[type] = new Set();
    this.listeners[type].add(fn);
  }

  removeEventListener(type: string, fn: Function) {
    this.listeners[type]?.delete(fn);
  }

  dispatchEvent(evt: any): boolean {
    const eventObj = {
      ...evt,
      target: evt.target ?? this,
      currentTarget: this,
      stopPropagation: () => {},
      preventDefault: () => {},
    };
    const set = this.listeners[evt.type];
    if (set) {
      for (const fn of Array.from(set)) {
        fn(eventObj);
      }
    }
    if (evt.bubbles !== false && this.parentNode) {
      this.parentNode.dispatchEvent({ ...eventObj, currentTarget: this.parentNode });
    } else if (evt.bubbles !== false && this.ownerDocument && this.parentNode === null) {
      this.ownerDocument.dispatchEvent(eventObj);
    }
    return true;
  }

  querySelectorAll(selector: string): MiniNode[] {
    const out: MiniNode[] = [];
    const visit = (node: MiniNode) => {
      for (const child of node.childNodes) {
        if (child.nodeType === 1) {
          if (child.tagName.toLowerCase() === selector.toLowerCase()) {
            out.push(child);
          }
          visit(child);
        }
      }
    };
    visit(this);
    return out;
  }
}

function createTestEnvironment() {
  const teardownOrder: string[] = [];
  const docListeners: Record<string, Set<Function>> = {};
  const winListeners: Record<string, Set<Function>> = {};
  const intervals = new Map<number, () => void>();
  let nextIntervalId = 1;
  let nowMs = 1_800_000_000_000;
  const storage = new Map<string, string>();
  const channels: StrictTestBroadcastChannel[] = [];

  class StrictTestBroadcastChannel {
    readonly name: string;
    closed = false;
    closeCalls = 0;
    posted: any[] = [];
    onmessage: ((event: MessageEvent) => void) | null = null;

    constructor(name: string) {
      this.name = name;
      channels.push(this);
    }

    postMessage(data: any) {
      if (this.closed) {
        throw new DOMException(
          "Failed to execute 'postMessage' on 'BroadcastChannel': Channel is closed",
          'InvalidStateError'
        );
      }
      this.posted.push(data);
    }

    close() {
      teardownOrder.push('channel.close');
      this.closed = true;
      this.closeCalls += 1;
    }
  }

  const doc: any = {
    nodeType: 9,
    nodeName: '#document',
    visibilityState: 'visible' as DocumentVisibilityState,
    activeElement: null,
    body: null as any,
    documentElement: null as any,
    defaultView: null as any,
    addEventListener(type: string, fn: Function) {
      if (!docListeners[type]) docListeners[type] = new Set();
      docListeners[type].add(fn);
    },
    removeEventListener(type: string, fn: Function) {
      teardownOrder.push(`doc.remove:${type}`);
      docListeners[type]?.delete(fn);
    },
    dispatchEvent(evt: any) {
      const set = docListeners[evt.type];
      if (set) {
        for (const fn of Array.from(set)) fn(evt);
      }
      return true;
    },
    createElement(tag: string) {
      return new MiniNode(1, tag, '', doc);
    },
    createElementNS(ns: string, tag: string) {
      const node = new MiniNode(1, tag, '', doc);
      node.namespaceURI = ns;
      return node;
    },
    createTextNode(text: string) {
      return new MiniNode(3, '', text, doc);
    },
    createComment(text: string) {
      return new MiniNode(8, '', text, doc);
    },
  };
  doc.documentElement = new MiniNode(1, 'html', '', doc);
  doc.body = new MiniNode(1, 'body', '', doc);
  doc.documentElement.appendChild(doc.body);

  const mockLocalStorage = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, String(value)),
    removeItem: (key: string) => storage.delete(key),
    clear: () => storage.clear(),
  };

  const win: any = {
    document: doc,
    HTMLIFrameElement: class HTMLIFrameElement {},
    HTMLElement: MiniNode,
    location: { hostname: 'admin.dev.clinicez.net', href: 'https://admin.dev.clinicez.net/verifications' },
    localStorage: mockLocalStorage,
    BroadcastChannel: StrictTestBroadcastChannel,
    addEventListener(type: string, fn: Function) {
      if (!winListeners[type]) winListeners[type] = new Set();
      winListeners[type].add(fn);
    },
    removeEventListener(type: string, fn: Function) {
      teardownOrder.push(`win.remove:${type}`);
      winListeners[type]?.delete(fn);
    },
    dispatchEvent(evt: any) {
      const set = winListeners[evt.type];
      if (set) {
        for (const fn of Array.from(set)) fn(evt);
      }
      return true;
    },
    setInterval(fn: () => void) {
      const id = nextIntervalId++;
      intervals.set(id, fn);
      return id;
    },
    clearInterval(id: number) {
      teardownOrder.push('clearInterval');
      intervals.delete(id);
    },
  };
  doc.defaultView = win;

  return {
    win,
    doc,
    storage,
    mockLocalStorage,
    channels,
    intervals,
    winListeners,
    docListeners,
    teardownOrder,
    StrictTestBroadcastChannel,
    getNow: () => nowMs,
    advanceSeconds: (sec: number) => {
      nowMs += sec * 1000;
    },
    tickIntervals: () => {
      for (const fn of Array.from(intervals.values())) {
        fn();
      }
    },
  };
}

class TestErrorBoundary extends React.Component<
  { children: React.ReactNode; onError: (error: Error) => void },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode; onError: (error: Error) => void }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    this.props.onError(error);
  }

  render() {
    if (this.state.hasError) {
      return <div>Something went wrong!</div>;
    }
    return this.props.children;
  }
}

describe('IdleSessionGuard React lifecycle & BroadcastChannel regression (#245)', () => {
  const origWindow = (globalThis as any).window;
  const origDocument = (globalThis as any).document;
  const origLocalStorage = (globalThis as any).localStorage;
  const origBroadcastChannel = (globalThis as any).BroadcastChannel;
  const origDateNow = Date.now;

  let env: ReturnType<typeof createTestEnvironment>;
  let container: MiniNode;
  let root: Root | null = null;

  beforeEach(() => {
    authState.isSignedIn = true;
    authState.signOutCalls = 0;
    authState.signOutImpl = async () => {};

    env = createTestEnvironment();
    (globalThis as any).window = env.win;
    (globalThis as any).document = env.doc;
    (globalThis as any).localStorage = env.mockLocalStorage;
    (globalThis as any).BroadcastChannel = env.StrictTestBroadcastChannel;
    Date.now = () => env.getNow();

    container = env.doc.createElement('div');
    env.doc.body.appendChild(container);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root!.unmount();
      });
      root = null;
    }
    (globalThis as any).window = origWindow;
    (globalThis as any).document = origDocument;
    (globalThis as any).localStorage = origLocalStorage;
    (globalThis as any).BroadcastChannel = origBroadcastChannel;
    Date.now = origDateNow;
  });

  it('survives React.StrictMode double-effect lifecycle without throwing Channel is closed', async () => {
    const caughtErrors: Error[] = [];
    root = createRoot(container as unknown as Element);

    await act(async () => {
      root!.render(
        <React.StrictMode>
          <TestErrorBoundary onError={(e) => caughtErrors.push(e)}>
            <IdleSessionGuard>
              <div>Verifications Queue</div>
            </IdleSessionGuard>
          </TestErrorBoundary>
        </React.StrictMode>
      );
    });

    expect(caughtErrors).toHaveLength(0);
    expect(container.textContent).toContain('Verifications Queue');
    expect(env.channels.length).toBe(2);
    expect(env.channels[0].closed).toBe(true);
    expect(env.channels[1].closed).toBe(false);
    expect(env.channels[1].posted.at(-1)).toEqual({
      type: 'ACTIVITY',
      timestamp: env.getNow(),
    });
  });

  it('opens 14-min warning modal without closing BroadcastChannel or crashing ErrorBoundary, and Stay Signed In resumes cleanly', async () => {
    const caughtErrors: Error[] = [];
    root = createRoot(container as unknown as Element);

    await act(async () => {
      root!.render(
        <TestErrorBoundary onError={(e) => caughtErrors.push(e)}>
          <IdleSessionGuard>
            <div>Verifications Queue</div>
          </IdleSessionGuard>
        </TestErrorBoundary>
      );
    });

    expect(env.channels).toHaveLength(1);
    const activeChannel = env.channels[0];

    // Advance 14 minutes (840s) -> enters warning window (previously triggered isWarningOpen effect teardown + closed-channel postMessage crash)
    env.advanceSeconds(14 * 60);
    await act(async () => {
      env.tickIntervals();
    });

    expect(caughtErrors).toHaveLength(0);
    expect(container.textContent).toContain('Session Inactivity Warning');
    expect(container.textContent).toContain('60s');
    // BroadcastChannel must NOT have been closed/recreated on warning state change
    expect(env.channels).toHaveLength(1);
    expect(activeChannel.closed).toBe(false);

    // Passive mousemove while warning is open must NOT dismiss warning
    env.advanceSeconds(5);
    await act(async () => {
      env.win.dispatchEvent({ type: 'mousemove' });
    });
    expect(container.textContent).toContain('Session Inactivity Warning');

    // Clicking "Stay Signed In" dismisses warning and broadcasts ACTIVITY on the open channel
    const stayBtn = container
      .querySelectorAll('button')
      .find((b) => b.textContent.includes('Stay Signed In'));
    expect(stayBtn).toBeDefined();

    await act(async () => {
      stayBtn!.dispatchEvent({ type: 'click', bubbles: true });
    });

    expect(caughtErrors).toHaveLength(0);
    expect(container.textContent).not.toContain('Session Inactivity Warning');
    expect(activeChannel.posted.at(-1)).toEqual({
      type: 'ACTIVITY',
      timestamp: env.getNow(),
    });
  });

  it('cleanly signs out and redirects to /sign-in?reason=session_expired when returning to an idle tab after 15+ minutes', async () => {
    const caughtErrors: Error[] = [];
    root = createRoot(container as unknown as Element);

    await act(async () => {
      root!.render(
        <TestErrorBoundary onError={(e) => caughtErrors.push(e)}>
          <IdleSessionGuard>
            <div>Verification Detail</div>
          </IdleSessionGuard>
        </TestErrorBoundary>
      );
    });

    const activeChannel = env.channels[0];

    // Simulate tab going hidden for 16 minutes with browser freezing/closing the channel externally
    env.doc.visibilityState = 'hidden';
    env.advanceSeconds(16 * 60);
    activeChannel.closed = true;

    // Return to tab (visibilitychange -> visible) and move mouse immediately
    env.doc.visibilityState = 'visible';
    await act(async () => {
      env.doc.dispatchEvent({ type: 'visibilitychange' });
      env.win.dispatchEvent({ type: 'mousemove' });
    });

    expect(caughtErrors).toHaveLength(0);
    expect(authState.signOutCalls).toBe(1);
    expect(env.win.location.href).toBe('/sign-in?reason=session_expired');
    expect(env.storage.has(ADMIN_LAST_ACTIVE_KEY)).toBe(false);
  });

  it('enforces sign-out if mousemove fires after 15+ minutes before setInterval or visibilitychange ticks', async () => {
    const caughtErrors: Error[] = [];
    root = createRoot(container as unknown as Element);

    await act(async () => {
      root!.render(
        <TestErrorBoundary onError={(e) => caughtErrors.push(e)}>
          <IdleSessionGuard>
            <div>Verification Detail</div>
          </IdleSessionGuard>
        </TestErrorBoundary>
      );
    });

    const activeChannel = env.channels[0];
    env.advanceSeconds(15 * 60 + 5);

    await act(async () => {
      env.win.dispatchEvent({ type: 'mousemove' });
    });

    expect(caughtErrors).toHaveLength(0);
    expect(activeChannel.posted.at(-1)).toEqual({ type: 'LOGOUT' });
    expect(authState.signOutCalls).toBe(1);
    expect(env.win.location.href).toBe('/sign-in?reason=session_expired');
  });

  it('clears all timers and event listeners strictly BEFORE closing BroadcastChannel on sign-out / unmount', async () => {
    const caughtErrors: Error[] = [];
    root = createRoot(container as unknown as Element);

    await act(async () => {
      root!.render(
        <TestErrorBoundary onError={(e) => caughtErrors.push(e)}>
          <IdleSessionGuard>
            <div>Governance Home</div>
          </IdleSessionGuard>
        </TestErrorBoundary>
      );
    });

    const activeChannel = env.channels[0];
    env.teardownOrder.length = 0;

    // Flip isSignedIn -> false (simulating Clerk session expiry while tab is idle)
    authState.isSignedIn = false;
    await act(async () => {
      root!.render(
        <TestErrorBoundary onError={(e) => caughtErrors.push(e)}>
          <IdleSessionGuard>
            <div>Governance Home</div>
          </IdleSessionGuard>
        </TestErrorBoundary>
      );
    });

    expect(caughtErrors).toHaveLength(0);
    expect(activeChannel.closed).toBe(true);
    expect(activeChannel.onmessage).toBeNull();
    expect(env.intervals.size).toBe(0);

    const closeIdx = env.teardownOrder.indexOf('channel.close');
    expect(closeIdx).toBeGreaterThan(0);
    expect(env.teardownOrder.indexOf('clearInterval')).toBeLessThan(closeIdx);
    expect(env.teardownOrder.indexOf('win.remove:storage')).toBeLessThan(closeIdx);
    expect(env.teardownOrder.indexOf('doc.remove:visibilitychange')).toBeLessThan(closeIdx);
    expect(env.teardownOrder.indexOf('win.remove:focus')).toBeLessThan(closeIdx);
    expect(env.teardownOrder.indexOf('win.remove:mousemove')).toBeLessThan(closeIdx);

    // Late window/document events after channel close must not throw
    env.advanceSeconds(5);
    expect(() => {
      env.win.dispatchEvent({ type: 'mousemove' });
      env.win.dispatchEvent({ type: 'focus' });
      env.doc.dispatchEvent({ type: 'visibilitychange' });
    }).not.toThrow();
  });

  it('handles incoming peer LOGOUT message without re-broadcasting LOGOUT', async () => {
    const caughtErrors: Error[] = [];
    root = createRoot(container as unknown as Element);

    await act(async () => {
      root!.render(
        <TestErrorBoundary onError={(e) => caughtErrors.push(e)}>
          <IdleSessionGuard>
            <div>Governance Home</div>
          </IdleSessionGuard>
        </TestErrorBoundary>
      );
    });

    const activeChannel = env.channels[0];
    const postedBefore = activeChannel.posted.length;

    await act(async () => {
      activeChannel.onmessage?.({ data: { type: 'LOGOUT' } } as MessageEvent);
    });

    expect(caughtErrors).toHaveLength(0);
    expect(authState.signOutCalls).toBe(1);
    expect(activeChannel.posted.length).toBe(postedBefore);
    expect(env.win.location.href).toBe('/sign-in?reason=session_expired');
  });
});

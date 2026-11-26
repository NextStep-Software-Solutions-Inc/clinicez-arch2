import React, { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import {
  createClerkRouterNavigation,
  resolveSameOriginRelativeHref,
} from '../src/lib/clerkNavigation';
import { SignInView } from '../src/routes/sign-in';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

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
    return true;
  }
}

function createDomStub() {
  const doc: any = {
    nodeType: 9,
    nodeName: '#document',
    visibilityState: 'visible',
    activeElement: null,
    body: null as any,
    documentElement: null as any,
    defaultView: null as any,
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {
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

  const win: any = {
    document: doc,
    HTMLIFrameElement: class HTMLIFrameElement {},
    HTMLElement: MiniNode,
    location: {
      origin: 'https://admin.dev.clinicez.net',
      href: 'https://admin.dev.clinicez.net/sign-in?reason=session_expired',
      search: '?reason=session_expired',
      assignCalls: [] as string[],
      replaceCalls: [] as string[],
      assign(url: string) {
        this.assignCalls.push(url);
      },
      replace(url: string) {
        this.replaceCalls.push(url);
      },
    },
    addEventListener() {},
    removeEventListener() {},
    scrollTo() {},
  };
  doc.defaultView = win;

  return { win, doc };
}

describe('Clerk ↔ TanStack Router Navigation & Sign-In Stability (#275)', () => {
  const origWindow = (globalThis as any).window;
  const origDocument = (globalThis as any).document;
  const origScrollTo = (globalThis as any).scrollTo;
  let dom: ReturnType<typeof createDomStub>;
  let root: Root | null = null;

  beforeEach(() => {
    dom = createDomStub();
    (globalThis as any).window = dom.win;
    (globalThis as any).document = dom.doc;
    (globalThis as any).scrollTo = () => {};
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
    (globalThis as any).scrollTo = origScrollTo;
  });

  it('wires routerPush and routerReplace onto ClerkProvider in src/main.tsx', () => {
    const mainSrc = fs.readFileSync(
      path.resolve(__dirname, '../src/main.tsx'),
      'utf8'
    );
    expect(mainSrc).toContain('createClerkRouterNavigation(router)');
    expect(mainSrc).toContain('routerPush={routerPush}');
    expect(mainSrc).toContain('routerReplace={routerReplace}');
  });

  it('routes same-origin Clerk paths, queries, and hashes via router.navigate({ href }) without full-page reload', async () => {
    const navigateCalls: Array<{ href: string; replace?: boolean }> = [];
    const windowNavCalls: Array<URL | string> = [];

    const { routerPush, routerReplace } = createClerkRouterNavigation({
      navigate: async (opts) => {
        navigateCalls.push(opts);
      },
    });

    await routerPush('/sign-in/factor-one', {
      windowNavigate: (to) => windowNavCalls.push(to),
    });
    await routerReplace('/sign-in/factor-two?redirect_url=%2Fsync-auth#otp', {
      windowNavigate: (to) => windowNavCalls.push(to),
    });
    await routerPush('https://admin.dev.clinicez.net/sign-in/factor-one?step=1', {
      windowNavigate: (to) => windowNavCalls.push(to),
    });

    expect(navigateCalls).toEqual([
      { href: '/sign-in/factor-one' },
      { href: '/sign-in/factor-two?redirect_url=%2Fsync-auth#otp', replace: true },
      { href: '/sign-in/factor-one?step=1' },
    ]);
    expect(windowNavCalls).toHaveLength(0);
    expect(dom.win.location.assignCalls).toHaveLength(0);
    expect(dom.win.location.replaceCalls).toHaveLength(0);
  });

  it('delegates cross-origin and non-HTTP URLs to windowNavigate instead of router.navigate', async () => {
    const navigateCalls: Array<{ href: string; replace?: boolean }> = [];
    const windowNavCalls: Array<URL | string> = [];

    const { routerPush, routerReplace } = createClerkRouterNavigation({
      navigate: async (opts) => {
        navigateCalls.push(opts);
      },
    });

    await routerPush('https://accounts.google.com/o/oauth2/auth', {
      windowNavigate: (to) => windowNavCalls.push(to),
    });
    await routerReplace('mailto:support@clinicez.net', {
      windowNavigate: (to) => windowNavCalls.push(to),
    });

    expect(navigateCalls).toHaveLength(0);
    expect(windowNavCalls).toEqual([
      'https://accounts.google.com/o/oauth2/auth',
      'mailto:support@clinicez.net',
    ]);
  });

  it('resolves relative hrefs safely across browser and non-browser contexts', () => {
    expect(resolveSameOriginRelativeHref('/sign-in/factor-one')).toBe('/sign-in/factor-one');
    expect(resolveSameOriginRelativeHref('')).toBe('/');
    expect(
      resolveSameOriginRelativeHref('https://admin.dev.clinicez.net/sync-auth?ok=1#done')
    ).toBe('/sync-auth?ok=1#done');
    expect(resolveSameOriginRelativeHref('https://evil.example/steal')).toBeNull();
    expect(resolveSameOriginRelativeHref('//evil.example/steal')).toBeNull();
  });

  it('keeps SignIn mounted once without unmount/remount across /sign-in?reason=session_expired -> /sign-in/factor-one -> /sign-in/factor-two', async () => {
    let mountCount = 0;
    let unmountCount = 0;
    let capturedProps: Record<string, unknown> | null = null;

    function SpySignIn(props: Record<string, unknown>) {
      capturedProps = props;
      useEffect(() => {
        mountCount += 1;
        return () => {
          unmountCount += 1;
        };
      }, []);
      return <div data-testid="spy-clerk-signin">Clerk SignIn Mounted</div>;
    }

    const testRootRoute = createRootRoute({
      component: () => <Outlet />,
    });
    const testSignInBase = createRoute({
      getParentRoute: () => testRootRoute,
      path: 'sign-in',
      component: () => <SignInView SignInComponent={SpySignIn as any} />,
    });
    const testSignInIndex = createRoute({
      getParentRoute: () => testSignInBase,
      path: '/',
    });
    const testSignInSplat = createRoute({
      getParentRoute: () => testSignInBase,
      path: '$',
    });

    const testTree = testRootRoute.addChildren([
      testSignInBase.addChildren([testSignInIndex, testSignInSplat]),
    ]);

    const history = createMemoryHistory({
      initialEntries: ['/sign-in?reason=session_expired'],
    });
    const testRouter = createRouter({
      routeTree: testTree,
      history,
    });

    const { routerPush, routerReplace } = createClerkRouterNavigation(testRouter as any);

    const container = dom.doc.createElement('div');
    dom.doc.body.appendChild(container);
    root = createRoot(container as unknown as Element);

    await act(async () => {
      await testRouter.load();
      root!.render(<RouterProvider router={testRouter as any} />);
    });

    expect(mountCount).toBe(1);
    expect(unmountCount).toBe(0);
    expect(container.textContent).toContain('Clerk SignIn Mounted');
    expect(container.textContent).toContain('inactivity');
    expect(capturedProps).toMatchObject({
      path: '/sign-in',
      routing: 'path',
      signUpUrl: '/sign-up',
      forceRedirectUrl: '/sync-auth',
    });

    await act(async () => {
      await routerPush('/sign-in/factor-one');
    });

    expect(testRouter.state.location.pathname).toBe('/sign-in/factor-one');
    expect(mountCount).toBe(1);
    expect(unmountCount).toBe(0);
    expect(container.textContent).not.toContain('inactivity');
    expect(container.textContent).toContain('Clerk SignIn Mounted');

    await act(async () => {
      await routerReplace('/sign-in/factor-two');
    });

    expect(testRouter.state.location.pathname).toBe('/sign-in/factor-two');
    expect(mountCount).toBe(1);
    expect(unmountCount).toBe(0);
    expect(dom.win.location.assignCalls).toHaveLength(0);
    expect(dom.win.location.replaceCalls).toHaveLength(0);
  });
});

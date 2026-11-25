import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, it, expect } from 'bun:test';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import fs from 'node:fs';
import path from 'node:path';
import { routeTree } from '../src/router';
import { SignInView } from '../src/routes/sign-in';
import { SignUpView } from '../src/routes/sign-up';
import {
  buildAuthHrefWithRedirect,
  buildInvitationPath,
  clearAllPendingAdminAuthState,
  PENDING_AUTH_REDIRECT_KEY,
  PENDING_INVITATION_TOKEN_KEY,
  readPendingAuthRedirect,
  readPendingInvitationToken,
  sanitizeAdminRedirectPath,
  savePendingAuthRedirect,
  savePendingInvitationToken,
} from '../src/lib/authRedirect';
import {
  isForbiddenError,
  isUnauthorizedError,
  performCleanAdminSignOut,
  resolvePendingAdminInvitationPath,
} from '../src/lib/adminAuthRecovery';
import { ADMIN_LAST_ACTIVE_KEY } from '../src/lib/idleGuard';

function createStorageMock() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };
}

describe('Admin Invitation & Google OAuth Redirect Flow (#279)', () => {
  describe('sanitizeAdminRedirectPath & buildAuthHrefWithRedirect', () => {
    it('preserves safe relative invitation paths with query and hash', () => {
      expect(sanitizeAdminRedirectPath('/invitations/abc123')).toBe('/invitations/abc123');
      expect(sanitizeAdminRedirectPath('  /invitations/tok_99?src=email#accept  ')).toBe(
        '/invitations/tok_99?src=email#accept'
      );
      expect(buildInvitationPath('tok_123/abc')).toBe('/invitations/tok_123%2Fabc');
      expect(buildAuthHrefWithRedirect('/sign-in', '/invitations/tok_1')).toBe(
        '/sign-in?redirect_url=%2Finvitations%2Ftok_1'
      );
      expect(buildAuthHrefWithRedirect('/sign-up', '/invitations/tok_1')).toBe(
        '/sign-up?redirect_url=%2Finvitations%2Ftok_1'
      );
    });

    it('rejects external URLs, protocol-relative, backslash escapes, and auth-loop paths', () => {
      const rejected = [
        null,
        undefined,
        '',
        '   ',
        'https://evil.example/invitations/tok',
        'http://evil.example/invitations/tok',
        '//evil.example/invitations/tok',
        '/\\evil.example',
        '/invitations\\evil',
        '/invitations/tok\nSet-Cookie: a=b',
        'javascript:alert(1)',
        '/sign-in',
        '/sign-in/sso-callback',
        '/sign-up',
        '/sign-up/sso-callback',
        '/sync-auth',
      ];

      for (const candidate of rejected) {
        expect(sanitizeAdminRedirectPath(candidate)).toBeNull();
      }

      expect(buildAuthHrefWithRedirect('/sign-in', 'https://evil.example')).toBe('/sign-in');
      expect(buildAuthHrefWithRedirect('/sign-up', '/sync-auth')).toBe('/sign-up');
    });

    it('persists and clears pending redirect and invitation token in sessionStorage', () => {
      const prevWindow = (globalThis as Record<string, unknown>).window;
      const sessionStorage = createStorageMock();
      const localStorage = createStorageMock();
      (globalThis as Record<string, unknown>).window = {
        sessionStorage,
        localStorage,
        location: { href: 'https://admin.local/' },
      };

      try {
        savePendingAuthRedirect('/invitations/tok_abc');
        savePendingInvitationToken('tok_abc');
        expect(sessionStorage.getItem(PENDING_AUTH_REDIRECT_KEY)).toBe('/invitations/tok_abc');
        expect(sessionStorage.getItem(PENDING_INVITATION_TOKEN_KEY)).toBe('tok_abc');
        expect(readPendingAuthRedirect()).toBe('/invitations/tok_abc');
        expect(readPendingInvitationToken()).toBe('tok_abc');

        // Rejects unsafe values from storage
        sessionStorage.setItem(PENDING_AUTH_REDIRECT_KEY, 'https://evil.example');
        expect(readPendingAuthRedirect()).toBeNull();

        clearAllPendingAdminAuthState();
        expect(readPendingAuthRedirect()).toBeNull();
        expect(readPendingInvitationToken()).toBeNull();
      } finally {
        if (prevWindow === undefined) {
          delete (globalThis as Record<string, unknown>).window;
        } else {
          (globalThis as Record<string, unknown>).window = prevWindow;
        }
      }
    });
  });

  describe('adminAuthRecovery helpers', () => {
    it('classifies HTTP 401 and 403 errors cleanly', () => {
      expect(isForbiddenError({ response: { status: 403 } })).toBe(true);
      expect(isForbiddenError({ response: { status: 500 } })).toBe(false);
      expect(isUnauthorizedError({ response: { status: 401 } })).toBe(true);
      expect(isUnauthorizedError({ response: { status: 403 } })).toBe(false);
    });

    it('recovers pending admin invitation path from sessionStorage first, then backend lookup', async () => {
      const prevWindow = (globalThis as Record<string, unknown>).window;
      const sessionStorage = createStorageMock();
      (globalThis as Record<string, unknown>).window = { sessionStorage };

      try {
        savePendingInvitationToken('stored_tok_123');
        let backendCalled = false;
        const fromStorage = await resolvePendingAdminInvitationPath(async () => {
          backendCalled = true;
          return null;
        });
        expect(fromStorage).toBe('/invitations/stored_tok_123');
        expect(backendCalled).toBe(false);

        clearAllPendingAdminAuthState();

        const fromBackendAdmin = await resolvePendingAdminInvitationPath(async () => ({
          invitationType: 'Admin',
          token: 'backend_tok_456',
          role: 'Super Admin',
          email: 'admin@example.com',
          redirectUrl: '/invitations/backend_tok_456',
        }));
        expect(fromBackendAdmin).toBe('/invitations/backend_tok_456');

        // Ignores workspace invitations in admin-web
        const fromBackendWorkspace = await resolvePendingAdminInvitationPath(async () => ({
          invitationType: 'Workspace',
          token: 'ws_tok_789',
          tenantSlug: 'clinic-a',
          workspaceName: 'Clinic A',
          role: 'Admin',
          email: 'doc@example.com',
          redirectUrl: '/invitations/ws_tok_789',
        }));
        expect(fromBackendWorkspace).toBeNull();
      } finally {
        if (prevWindow === undefined) {
          delete (globalThis as Record<string, unknown>).window;
        } else {
          (globalThis as Record<string, unknown>).window = prevWindow;
        }
      }
    });

    it('performCleanAdminSignOut awaits signOut, clears pending & idle state, and redirects to /sign-in', async () => {
      const prevWindow = (globalThis as Record<string, unknown>).window;
      const prevLocalStorage = (globalThis as Record<string, unknown>).localStorage;
      const sessionStorage = createStorageMock();
      const localStorage = createStorageMock();
      const fakeWindow = {
        sessionStorage,
        localStorage,
        location: { href: 'https://admin.local/sync-auth' },
      };
      (globalThis as Record<string, unknown>).window = fakeWindow;
      (globalThis as Record<string, unknown>).localStorage = localStorage;

      try {
        savePendingAuthRedirect('/invitations/tok_1');
        savePendingInvitationToken('tok_1');
        localStorage.setItem(ADMIN_LAST_ACTIVE_KEY, String(Date.now()));

        let signOutCalls = 0;
        await performCleanAdminSignOut(async () => {
          signOutCalls += 1;
        });

        expect(signOutCalls).toBe(1);
        expect(readPendingAuthRedirect()).toBeNull();
        expect(readPendingInvitationToken()).toBeNull();
        expect(localStorage.getItem(ADMIN_LAST_ACTIVE_KEY)).toBeNull();
        expect(fakeWindow.location.href).toBe('/sign-in');

        // Still clears and redirects even if signOut rejects
        fakeWindow.location.href = 'https://admin.local/sync-auth';
        await performCleanAdminSignOut(async () => {
          throw new Error('Clerk teardown error');
        });
        expect(fakeWindow.location.href).toBe('/sign-in');
      } finally {
        if (prevWindow === undefined) {
          delete (globalThis as Record<string, unknown>).window;
        } else {
          (globalThis as Record<string, unknown>).window = prevWindow;
        }
        if (prevLocalStorage === undefined) {
          delete (globalThis as Record<string, unknown>).localStorage;
        } else {
          (globalThis as Record<string, unknown>).localStorage = prevLocalStorage;
        }
      }
    });
  });

  describe('TanStack Router search matching & route component contracts', () => {
    it('matches /sign-in and /sign-up with ?redirect_url=/invitations/:token', async () => {
      for (const entry of [
        '/sign-in?redirect_url=%2Finvitations%2Ftok123',
        '/sign-up?redirect_url=%2Finvitations%2Ftok123',
      ]) {
        const history = createMemoryHistory({ initialEntries: [entry] });
        const testRouter = createRouter({ routeTree, history });
        await testRouter.load();
        expect(
          testRouter.state.matches.some((m: { globalNotFound?: boolean }) => Boolean(m.globalNotFound))
        ).toBe(false);
        expect(testRouter.state.matches.length).toBeGreaterThan(1);
      }
    });

    it('wires redirect_url, OAuth transfer redirect props, clean sign-out, and _auth admin guard', () => {
      const srcDir = path.resolve(__dirname, '..', 'src');
      const inviteSrc = fs.readFileSync(path.join(srcDir, 'routes/invitations/$token.tsx'), 'utf8');
      const signInSrc = fs.readFileSync(path.join(srcDir, 'routes/sign-in.tsx'), 'utf8');
      const signUpSrc = fs.readFileSync(path.join(srcDir, 'routes/sign-up.tsx'), 'utf8');
      const mainSrc = fs.readFileSync(path.join(srcDir, 'main.tsx'), 'utf8');
      const syncAuthSrc = fs.readFileSync(path.join(srcDir, 'routes/sync-auth.tsx'), 'utf8');
      const authLayoutSrc = fs.readFileSync(path.join(srcDir, 'routes/_auth.tsx'), 'utf8');

      expect(inviteSrc).toContain('redirect_url: inviteReturnPath');
      expect(inviteSrc).toContain('persistPendingInviteContext');
      expect(inviteSrc).toContain('isAlreadyAccepted');

      expect(signInSrc).toContain('signUpForceRedirectUrl={effectiveRedirect}');
      expect(signInSrc).toContain('signUpFallbackRedirectUrl={effectiveRedirect}');
      expect(signInSrc).toContain('readPendingAuthRedirect');

      expect(signUpSrc).toContain('signInForceRedirectUrl={effectiveRedirect}');
      expect(signUpSrc).toContain('signInFallbackRedirectUrl={effectiveRedirect}');
      expect(signUpSrc).toContain('readPendingAuthRedirect');

      expect(mainSrc).toContain('signInFallbackRedirectUrl="/sync-auth"');
      expect(mainSrc).toContain('signUpFallbackRedirectUrl="/sync-auth"');

      expect(syncAuthSrc).toContain('performCleanAdminSignOut');
      expect(syncAuthSrc).toContain('resolvePendingAdminInvitationPath');
      expect(syncAuthSrc).not.toContain('to="/sign-in"');

      expect(authLayoutSrc).toContain('adminService.getMe()');
      expect(authLayoutSrc).toContain('resolvePendingAdminInvitationPath');
      expect(authLayoutSrc).toContain('AdminAccessStateCard');
    });

    it('preserves /invitations/:token across SignInView and SignUpView OAuth /sso-callback transitions', async () => {
      const prevWindow = (globalThis as Record<string, unknown>).window;
      const prevDoc = (globalThis as Record<string, unknown>).document;
      const prevScrollTo = (globalThis as Record<string, unknown>).scrollTo;
      const sessionStorage = createStorageMock();

      class MiniDomNode {
        tagName: string;
        children: MiniDomNode[] = [];
        parentNode: MiniDomNode | null = null;
        attrs: Record<string, string> = {};
        style: Record<string, string> = {};
        nodeValue = '';
        ownerDocument: any;
        constructor(public nodeType: number, tag = '', text = '', ownerDocument: any = null) {
          this.tagName = tag.toUpperCase();
          this.nodeValue = text;
          this.ownerDocument = ownerDocument;
        }
        get firstChild() { return this.children[0] ?? null; }
        get nextSibling() {
          if (!this.parentNode) return null;
          const idx = this.parentNode.children.indexOf(this);
          return idx >= 0 ? (this.parentNode.children[idx + 1] ?? null) : null;
        }
        appendChild(c: MiniDomNode) { c.parentNode = this; c.ownerDocument = this.ownerDocument; this.children.push(c); return c; }
        insertBefore(n: MiniDomNode, r: MiniDomNode | null) {
          if (!r) return this.appendChild(n);
          const idx = this.children.indexOf(r);
          n.parentNode = this;
          n.ownerDocument = this.ownerDocument;
          if (idx === -1) this.children.push(n);
          else this.children.splice(idx, 0, n);
          return n;
        }
        removeChild(c: MiniDomNode) {
          const idx = this.children.indexOf(c);
          if (idx !== -1) { this.children.splice(idx, 1); c.parentNode = null; }
          return c;
        }
        setAttribute(k: string, v: unknown) { this.attrs[k] = String(v); }
        setAttributeNS(_ns: string | null, k: string, v: unknown) { this.attrs[k] = String(v); }
        removeAttribute(k: string) { delete this.attrs[k]; }
        removeAttributeNS(_ns: string | null, k: string) { delete this.attrs[k]; }
        addEventListener() {}
        removeEventListener() {}
      }

      const doc: any = {
        nodeType: 9,
        body: null as any,
        documentElement: null as any,
        createElement: (tag: string) => new MiniDomNode(1, tag, '', doc),
        createElementNS: (_ns: string, tag: string) => new MiniDomNode(1, tag, '', doc),
        createTextNode: (t: string) => new MiniDomNode(3, '', t, doc),
        createComment: (t: string) => new MiniDomNode(8, '', t, doc),
        addEventListener() {},
        removeEventListener() {},
      };
      doc.documentElement = new MiniDomNode(1, 'html', '', doc);
      doc.body = new MiniDomNode(1, 'body', '', doc);
      doc.documentElement.appendChild(doc.body);
      (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
      (globalThis as any).document = doc;
      (globalThis as any).scrollTo = () => {};
      (globalThis as any).window = {
        document: doc,
        sessionStorage,
        HTMLElement: MiniDomNode,
        HTMLIFrameElement: class {},
        location: { origin: 'https://admin.local', href: 'https://admin.local/', search: '' },
        addEventListener() {},
        removeEventListener() {},
        scrollTo() {},
      };

      let root: Root | null = null;
      try {
        let signInProps: Record<string, unknown> | null = null;
        let signUpProps: Record<string, unknown> | null = null;
        const SpySignIn = (props: Record<string, unknown>) => { signInProps = props; return <div />; };
        const SpySignUp = (props: Record<string, unknown>) => { signUpProps = props; return <div />; };

        const testRoot = createRootRoute({ component: () => <Outlet /> });
        const siBase = createRoute({
          getParentRoute: () => testRoot,
          path: 'sign-in',
          component: () => <SignInView SignInComponent={SpySignIn as any} />,
        });
        const siIdx = createRoute({ getParentRoute: () => siBase, path: '/' });
        const siSplat = createRoute({ getParentRoute: () => siBase, path: '$' });
        const suBase = createRoute({
          getParentRoute: () => testRoot,
          path: 'sign-up',
          component: () => <SignUpView SignUpComponent={SpySignUp as any} />,
        });
        const suIdx = createRoute({ getParentRoute: () => suBase, path: '/' });
        const suSplat = createRoute({ getParentRoute: () => suBase, path: '$' });
        const tree = testRoot.addChildren([
          siBase.addChildren([siIdx, siSplat]),
          suBase.addChildren([suIdx, suSplat]),
        ]);

        const history = createMemoryHistory({
          initialEntries: ['/sign-in?redirect_url=%2Finvitations%2Ftok_oauth_1'],
        });
        const testRouter = createRouter({ routeTree: tree, history });
        const container = doc.createElement('div');
        doc.body.appendChild(container);
        root = createRoot(container as unknown as Element);

        await act(async () => {
          await testRouter.load();
          root!.render(<RouterProvider router={testRouter as any} />);
        });

        expect(signInProps).toMatchObject({
          forceRedirectUrl: '/invitations/tok_oauth_1',
          signUpForceRedirectUrl: '/invitations/tok_oauth_1',
          signUpUrl: '/sign-up?redirect_url=%2Finvitations%2Ftok_oauth_1',
        });

        // Simulate Clerk returning to /sign-in/sso-callback without redirect_url query param
        await act(async () => {
          await testRouter.navigate({ href: '/sign-in/sso-callback' });
        });
        expect(signInProps).toMatchObject({
          forceRedirectUrl: '/invitations/tok_oauth_1',
          signUpForceRedirectUrl: '/invitations/tok_oauth_1',
        });

        // Verify SignUpView with redirect_url and /sign-up/sso-callback
        await act(async () => {
          await testRouter.navigate({ href: '/sign-up?redirect_url=%2Finvitations%2Ftok_oauth_2' });
        });
        expect(signUpProps).toMatchObject({
          forceRedirectUrl: '/invitations/tok_oauth_2',
          signInForceRedirectUrl: '/invitations/tok_oauth_2',
          signInUrl: '/sign-in?redirect_url=%2Finvitations%2Ftok_oauth_2',
        });

        await act(async () => {
          await testRouter.navigate({ href: '/sign-up/sso-callback' });
        });
        expect(signUpProps).toMatchObject({
          forceRedirectUrl: '/invitations/tok_oauth_2',
          signInForceRedirectUrl: '/invitations/tok_oauth_2',
        });
      } finally {
        if (root) {
          await act(async () => {
            root!.unmount();
          });
        }
        (globalThis as Record<string, unknown>).window = prevWindow;
        (globalThis as Record<string, unknown>).document = prevDoc;
        (globalThis as Record<string, unknown>).scrollTo = prevScrollTo;
      }
    });
  });
});

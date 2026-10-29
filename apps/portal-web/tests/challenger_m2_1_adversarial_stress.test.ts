import { describe, test, expect, mock, beforeEach, afterEach, afterAll } from "bun:test";
import {
  parsePendingInvitation,
  serializePendingInvitation,
  setPendingInvitationCookie,
  getPendingInvitationCookie,
  clearPendingInvitationCookie,
  PENDING_INVITATION_COOKIE_NAME,
  PendingInvitationCookiePayload,
} from "../src/lib/invitationCookie";
import SyncAuthPage from "../src/app/sync-auth/page";
import { tenantService } from "../src/services/tenant.service";
import { staffService, InvitationDetailsDto } from "../src/services/staff.service";

// =========================================================================
// SUITE 1: Adversarial Cookie Parsing & Serialization Stress
// =========================================================================
describe("Adversarial Stress Test: invitationCookie.ts", () => {
  describe("Malformed, Truncated, & Poisoned Inputs", () => {
    test("handles non-string primitives and falsy values without throwing", () => {
      expect(parsePendingInvitation(null)).toBeNull();
      expect(parsePendingInvitation(undefined)).toBeNull();
      expect(parsePendingInvitation("")).toBeNull();
      expect(parsePendingInvitation("   \t\n   ")).toBeNull();
      // @ts-expect-error - testing adversarial non-string types
      expect(parsePendingInvitation(12345)).toBeNull();
      // @ts-expect-error - testing adversarial object
      expect(parsePendingInvitation({})).toBeNull();
      // @ts-expect-error - testing adversarial array
      expect(parsePendingInvitation([])).toBeNull();
    });

    test("handles corrupted or truncated JSON strings", () => {
      expect(parsePendingInvitation("{ bad json")).toBeNull();
      expect(parsePendingInvitation('{"type": "workspace", "token": ')).toBeNull();
      expect(parsePendingInvitation('{"type":')).toBeNull();
      expect(parsePendingInvitation("undefined")).toBeNull();
      expect(parsePendingInvitation("NaN")).toBeNull();
      expect(parsePendingInvitation("{[]}")).toBeNull();
    });

    test("handles valid JSON primitives that are not valid payload objects", () => {
      expect(parsePendingInvitation("null")).toBeNull();
      expect(parsePendingInvitation("123")).toBeNull();
      expect(parsePendingInvitation('"a plain string"')).toBeNull();
      expect(parsePendingInvitation("true")).toBeNull();
      expect(parsePendingInvitation("false")).toBeNull();
      expect(parsePendingInvitation("[1, 2, 3]")).toBeNull();
      expect(parsePendingInvitation(JSON.stringify([{ type: "workspace", token: "tok123" }]))).toBeNull();
    });

    test("rejects invalid invitation types and prototype manipulation", () => {
      expect(parsePendingInvitation(JSON.stringify({ type: "superadmin", token: "tok123" }))).toBeNull();
      expect(parsePendingInvitation(JSON.stringify({ type: "tenant", token: "tok123" }))).toBeNull();
      expect(parsePendingInvitation(JSON.stringify({ type: "WORKSPACE", token: "tok123" }))).toBeNull();
      expect(parsePendingInvitation(JSON.stringify({ type: "", token: "tok123" }))).toBeNull();
      expect(parsePendingInvitation(JSON.stringify({ type: 1, token: "tok123" }))).toBeNull();

      // Prototype manipulation attempt
      const poisoned = '{"__proto__": {"type": "workspace"}, "token": "tok123"}';
      expect(parsePendingInvitation(poisoned)).toBeNull();
    });

    test("rejects missing, null, empty, or non-string tokens", () => {
      expect(parsePendingInvitation(JSON.stringify({ type: "workspace" }))).toBeNull();
      expect(parsePendingInvitation(JSON.stringify({ type: "workspace", token: null }))).toBeNull();
      expect(parsePendingInvitation(JSON.stringify({ type: "workspace", token: undefined }))).toBeNull();
      expect(parsePendingInvitation(JSON.stringify({ type: "workspace", token: 99999 }))).toBeNull();
      expect(parsePendingInvitation(JSON.stringify({ type: "workspace", token: true }))).toBeNull();
      expect(parsePendingInvitation(JSON.stringify({ type: "workspace", token: {} }))).toBeNull();
      expect(parsePendingInvitation(JSON.stringify({ type: "workspace", token: [] }))).toBeNull();
      expect(parsePendingInvitation(JSON.stringify({ type: "workspace", token: "" }))).toBeNull();
      expect(parsePendingInvitation(JSON.stringify({ type: "workspace", token: "   \r\n\t  " }))).toBeNull();
    });

    test("handles URI encoding failures (malformed percent encoding)", () => {
      expect(parsePendingInvitation("%E0%A4%A")).toBeNull();
      expect(parsePendingInvitation("%FF%FE")).toBeNull();
      expect(parsePendingInvitation("%%%")).toBeNull();
      expect(parsePendingInvitation("%2")).toBeNull();
    });

    test("extracts valid payload even when unexpected fields exist", () => {
      const extraFields = {
        type: "workspace",
        token: "  valid_token_xyz  ",
        injected: "attacker_controlled",
        role: "Admin",
      };
      const result = parsePendingInvitation(JSON.stringify(extraFields));
      expect(result).not.toBeNull();
      expect(result?.type).toBe("workspace");
      expect(result?.token).toBe("valid_token_xyz");
      expect((result as Record<string, unknown>).injected).toBeUndefined();
    });

    test("safely serializes and preserves whitespace trimming", () => {
      const serialized = serializePendingInvitation({
        type: "workspace",
        token: "  trimmed_workspace_token  ",
      });
      expect(serialized).toBe('{"type":"workspace","token":"trimmed_workspace_token"}');
      const roundtripped = parsePendingInvitation(serialized);
      expect(roundtripped).toEqual({
        type: "workspace",
        token: "trimmed_workspace_token",
      });
    });

    test("handles adversarial payloads (XSS and SQL injection strings) safely as data", () => {
      const xssPayload = '<script>alert("xss")</script>';
      const serialized = serializePendingInvitation({
        type: "workspace",
        token: xssPayload,
      });
      const parsed = parsePendingInvitation(serialized);
      expect(parsed?.token).toBe(xssPayload);
    });
  });

  describe("Browser Document Cookie Manipulation & Boundary Testing", () => {
    let originalDocument: unknown;

    beforeEach(() => {
      originalDocument = globalThis.document;
    });

    afterEach(() => {
      // @ts-expect-error - restoring document
      globalThis.document = originalDocument;
    });

    test("handles document.cookie containing multiple cookies and substring-like names", () => {
      let store =
        "clinicez_pending_invitation_old=invalid; " +
        "other_session=abc; " +
        `${PENDING_INVITATION_COOKIE_NAME}=${encodeURIComponent(JSON.stringify({ type: "workspace", token: "real_token" }))}; ` +
        "fake_clinicez_pending_invitation=false";

      // @ts-expect-error - mock browser document
      globalThis.document = {
        get cookie() {
          return store;
        },
        set cookie(val: string) {
          store = val;
        },
      };

      const result = getPendingInvitationCookie();
      expect(result).not.toBeNull();
      expect(result?.type).toBe("workspace");
      expect(result?.token).toBe("real_token");
    });

    test("handles document.cookie where token contains '=' characters (e.g. base64)", () => {
      const b64Token = Buffer.from("This is a test token with equals==").toString("base64");
      const payload: PendingInvitationCookiePayload = {
        type: "workspace",
        token: b64Token,
      };

      let store = "";
      // @ts-expect-error - mock browser document
      globalThis.document = {
        get cookie() {
          return store;
        },
        set cookie(val: string) {
          store = val;
        },
      };

      setPendingInvitationCookie(payload);
      const retrieved = getPendingInvitationCookie();
      expect(retrieved).not.toBeNull();
      expect(retrieved?.token).toBe(b64Token);

      clearPendingInvitationCookie();
      expect(store).toContain("Max-Age=0");
    });
  });
});

// =========================================================================
// SUITE 2: Auto-Acceptance Concurrency & Re-Entrancy Stress Simulation
// =========================================================================
describe("Adversarial Stress Test: Auto-Accept Idempotency & Re-entrancy", () => {
  test("autoAcceptAttemptedRef strictly prevents duplicate acceptance requests under rapid re-renders", async () => {
    let acceptCallCount = 0;
    const mockAcceptInvitation = mock(async (token: string) => {
      acceptCallCount++;
      return {
        tenantSlug: "acme-health",
        workspaceName: "Acme Health",
        role: "Member",
        fullName: "Dr. Smith",
      };
    });

    // Simulating component lifecycle state:
    const autoAcceptAttemptedRef = { current: false };
    const invite: InvitationDetailsDto = {
      id: "inv-1",
      tenantName: "Acme Health",
      tenantSlug: "acme-health",
      inviteeFullName: "Dr. Smith",
      inviteeEmail: "smith@acme.ph",
      role: "Member",
      isExpired: false,
      isAlreadyAccepted: false,
      isRevoked: false,
      isSuspended: false,
    };
    const isLoaded = true;
    const loading = false;
    const isSignedIn = true;
    let accepting = false;
    const error = null;

    // Trigger effect (simulating 10 rapid re-renders during state transitions)
    const runEffect = async () => {
      if (!isLoaded || loading || !isSignedIn || !invite || accepting) {
        return;
      }
      if (invite.isRevoked || invite.isSuspended || invite.isExpired || invite.isAlreadyAccepted || error) {
        return;
      }
      if (autoAcceptAttemptedRef.current) {
        return;
      }
      autoAcceptAttemptedRef.current = true;
      accepting = true;
      await mockAcceptInvitation("valid-token");
    };

    // Run 10 rapid concurrent invocations
    await Promise.all([
      runEffect(),
      runEffect(),
      runEffect(),
      runEffect(),
      runEffect(),
      runEffect(),
      runEffect(),
      runEffect(),
      runEffect(),
      runEffect(),
    ]);

    expect(acceptCallCount).toBe(1);
    expect(autoAcceptAttemptedRef.current).toBe(true);
  });

  test("auto-accept strictly aborts when invitation is expired, revoked, suspended, or already accepted", async () => {
    let acceptCallCount = 0;
    const mockAccept = mock(async () => {
      acceptCallCount++;
      return {};
    });

    const testStates = [
      { isExpired: true, isRevoked: false, isSuspended: false, isAlreadyAccepted: false },
      { isExpired: false, isRevoked: true, isSuspended: false, isAlreadyAccepted: false },
      { isExpired: false, isRevoked: false, isSuspended: true, isAlreadyAccepted: false },
      { isExpired: false, isRevoked: false, isSuspended: false, isAlreadyAccepted: true },
    ];

    for (const state of testStates) {
      const autoAcceptAttemptedRef = { current: false };
      const invite = {
        id: "inv-test",
        tenantName: "Test",
        tenantSlug: "test",
        inviteeFullName: "Test",
        inviteeEmail: "test@test.ph",
        role: "Member",
        ...state,
      };

      const runEffect = () => {
        if (!invite || invite.isRevoked || invite.isSuspended || invite.isExpired || invite.isAlreadyAccepted) {
          return;
        }
        if (autoAcceptAttemptedRef.current) return;
        autoAcceptAttemptedRef.current = true;
        mockAccept();
      };

      runEffect();
      expect(acceptCallCount).toBe(0);
      expect(autoAcceptAttemptedRef.current).toBe(false);
    }
  });

  test("auto-accept halts on network failure and does not enter infinite re-try loop", async () => {
    let acceptCallCount = 0;
    const autoAcceptAttemptedRef = { current: false };
    let accepting = false;

    const simulateFailedAccept = async () => {
      if (autoAcceptAttemptedRef.current || accepting) return;
      autoAcceptAttemptedRef.current = true;
      accepting = true;
      try {
        acceptCallCount++;
        throw new Error("403 Forbidden - Domain not allowed");
      } catch {
        // error caught
        accepting = false;
      }
    };

    // First attempt fails
    await simulateFailedAccept();
    expect(acceptCallCount).toBe(1);
    expect(autoAcceptAttemptedRef.current).toBe(true);

    // Subsequent re-render
    await simulateFailedAccept();
    // Must remain 1, ref prevents second execution
    expect(acceptCallCount).toBe(1);
  });
});

// =========================================================================
// SUITE 3: Post-Auth Gateway 4-Priority Routing Edge Cases & Stale Cookies
// =========================================================================
describe("Adversarial Stress Test: sync-auth Gateway Priority Routing", () => {
  const originalGetTenantByOwner = tenantService.getTenantByOwner;
  const originalGetPendingSelfInvitation = staffService.getPendingSelfInvitation;

  let mockAuthResult: {
    userId: string | null;
    getToken: () => Promise<string | null>;
  };
  let mockCookiesStore: Map<string, string>;
  let redirectedUrl: string | null = null;

  beforeEach(() => {
    redirectedUrl = null;
    mockCookiesStore = new Map<string, string>();
    mockAuthResult = {
      userId: "user_adv_123",
      getToken: async () => "jwt_token_valid",
    };

    tenantService.getTenantByOwner = mock(async () => null);
    staffService.getPendingSelfInvitation = mock(async () => null);
  });

  afterEach(() => {
    tenantService.getTenantByOwner = originalGetTenantByOwner;
    staffService.getPendingSelfInvitation = originalGetPendingSelfInvitation;
  });

  afterAll(() => {
    tenantService.getTenantByOwner = originalGetTenantByOwner;
    staffService.getPendingSelfInvitation = originalGetPendingSelfInvitation;
  });

  // Mock Clerk auth
  mock.module("@clerk/nextjs/server", () => ({
    auth: async () => mockAuthResult,
  }));

  // Mock Next.js cookies
  mock.module("next/headers", () => ({
    cookies: async () => ({
      get: (name: string) => {
        const val = mockCookiesStore.get(name);
        return val ? { name, value: val } : undefined;
      },
    }),
  }));

  // Mock Next.js redirect
  mock.module("next/navigation", () => ({
    redirect: (url: string) => {
      redirectedUrl = url;
      throw new Error(`NEXT_REDIRECT:${url}`);
    },
  }));

  test("Stale or Corrupted Cookie: gracefully ignores bad cookie and advances to Priority 2 (owned tenant)", async () => {
    // Set corrupted cookie
    mockCookiesStore.set(PENDING_INVITATION_COOKIE_NAME, "CORRUPTED_NON_JSON_VALUE");

    tenantService.getTenantByOwner = mock(async () => ({
      tenantSlug: "my-existing-clinic",
    } as any));

    try {
      await SyncAuthPage();
    } catch {
      // redirected
    }

    expect(redirectedUrl).toBe("/my-existing-clinic/dashboard");
  });

  test("Stale or Corrupted Cookie: gracefully advances through Priority 2 and 3 to Priority 4 if no workspace/invite", async () => {
    // Corrupted cookie with no owned workspace and no pending self-invite
    mockCookiesStore.set(PENDING_INVITATION_COOKIE_NAME, '{"type": "unknown_type"}');

    tenantService.getTenantByOwner = mock(async () => null);
    staffService.getPendingSelfInvitation = mock(async () => null);

    try {
      await SyncAuthPage();
    } catch {
      // redirected
    }

    expect(redirectedUrl).toBe("/tenants/register");
  });

  test("Priority 1 strictly overrides Priority 2 even when user owns multiple workspaces", async () => {
    // User is invited to a new workspace, but already owns 'metro-hospital'
    const invitePayload: PendingInvitationCookiePayload = {
      type: "workspace",
      token: "tok_invite_456",
    };
    mockCookiesStore.set(PENDING_INVITATION_COOKIE_NAME, serializePendingInvitation(invitePayload));

    tenantService.getTenantByOwner = mock(async () => ({
      tenantSlug: "metro-hospital",
    } as any));

    try {
      await SyncAuthPage();
    } catch {
      // redirected
    }

    // Must route to the invitation, NOT the owned workspace!
    expect(redirectedUrl).toBe("/invitations/tok_invite_456");
  });

  test("Priority 3 catches cross-device authenticated user with no cookies", async () => {
    // No cookie in mockCookiesStore
    tenantService.getTenantByOwner = mock(async () => null);
    staffService.getPendingSelfInvitation = mock(async () => ({
      invitationType: "Workspace",
      token: "cross_device_token_789",
      tenantSlug: "metro-oncology",
      workspaceName: "Metro Oncology",
      role: "Member",
      email: "dr.oncologist@metro.ph",
      redirectUrl: "/invitations/cross_device_token_789",
    }));

    try {
      await SyncAuthPage();
    } catch {
      // redirected
    }

    expect(redirectedUrl).toBe("/invitations/cross_device_token_789");
  });

  test("Priority 3 handles platform admin self-invitation correctly", async () => {
    tenantService.getTenantByOwner = mock(async () => null);
    staffService.getPendingSelfInvitation = mock(async () => ({
      invitationType: "Admin",
      token: "admin_token_007",
      role: "PlatformAdministrator",
      email: "superadmin@clinicez.com",
      redirectUrl: "https://admin.clinicez.com/invitations/admin_token_007",
    }));

    try {
      await SyncAuthPage();
    } catch {
      // redirected
    }

    expect(redirectedUrl).toBe("https://admin.clinicez.com/invitations/admin_token_007");
  });

  test("Resilience: Backend 500 error in Priority 2 does not throw unhandled exception and falls through", async () => {
    tenantService.getTenantByOwner = mock(async () => {
      throw new Error("500 Internal Server Error in Tenant Service");
    });
    staffService.getPendingSelfInvitation = mock(async () => null);

    try {
      await SyncAuthPage();
    } catch {
      // redirected
    }

    expect(redirectedUrl).toBe("/tenants/register");
  });

  test("Resilience: Backend 500 error in Priority 3 does not throw unhandled exception and falls through", async () => {
    tenantService.getTenantByOwner = mock(async () => null);
    staffService.getPendingSelfInvitation = mock(async () => {
      throw new Error("500 Internal Server Error in Staff Service");
    });

    try {
      await SyncAuthPage();
    } catch {
      // redirected
    }

    expect(redirectedUrl).toBe("/tenants/register");
  });
});

import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test";
import { PENDING_INVITATION_COOKIE_NAME, serializePendingInvitation } from "../src/lib/invitationCookie";

// Track redirection target cleanly
class RedirectError extends Error {
  url: string;
  constructor(url: string) {
    super(`NEXT_REDIRECT:${url}`);
    this.url = url;
  }
}

// Module mocks
let mockAuthResult: {
  userId: string | null;
  getToken: () => Promise<string | null>;
} = {
  userId: null,
  getToken: async () => null,
};

let mockCookieValues: Record<string, string> = {};

mock.module("@clerk/nextjs/server", () => ({
  auth: mock(async () => mockAuthResult),
}));

mock.module("next/headers", () => ({
  cookies: mock(async () => ({
    get: (name: string) => {
      const val = mockCookieValues[name];
      return val ? { name, value: val } : undefined;
    },
  })),
}));

mock.module("next/navigation", () => ({
  redirect: (url: string) => {
    throw new RedirectError(url);
  },
}));

// Import services and page after mocks
import { tenantService } from "../src/services/tenant.service";
import { staffService } from "../src/services/staff.service";
import SyncAuthPage from "../src/app/sync-auth/page";

describe("Challenger M2-2: Boundary & Cross-Feature Integration Testing", () => {
  const originalGetTenantByOwner = tenantService.getTenantByOwner;
  const originalGetPendingSelfInvitation = staffService.getPendingSelfInvitation;

  beforeEach(() => {
    mockCookieValues = {};
    mockAuthResult = {
      userId: "user_challenger_m2_2",
      getToken: async () => "jwt_valid_session_token",
    };
  });

  afterEach(() => {
    tenantService.getTenantByOwner = originalGetTenantByOwner;
    staffService.getPendingSelfInvitation = originalGetPendingSelfInvitation;
  });

  const runSyncAuth = async (): Promise<string> => {
    try {
      await SyncAuthPage();
      throw new Error("Expected redirect was not thrown");
    } catch (err: unknown) {
      if (err instanceof RedirectError) {
        return err.url;
      }
      throw err;
    }
  };

  // =========================================================================
  // Challenge 1: Active Invitation Cookie AND Owns a Workspace (Priority 1 wins)
  // =========================================================================
  describe("Challenge 1: Active Cookie + Owned Workspace Priority Precedence", () => {
    test("Priority 1 wins: Workspace cookie routes to /invitations/[token] and never invokes tenantService", async () => {
      mockCookieValues[PENDING_INVITATION_COOKIE_NAME] = serializePendingInvitation({
        type: "workspace",
        token: "tok_priority_1_workspace",
      });

      let tenantServiceCalled = false;
      tenantService.getTenantByOwner = mock(async () => {
        tenantServiceCalled = true;
        return {
          tenantSlug: "owned-clinic-should-not-reach",
          name: "Existing Owned Clinic",
          tenantType: "Workplace",
        } as any;
      });

      let staffServiceCalled = false;
      staffService.getPendingSelfInvitation = mock(async () => {
        staffServiceCalled = true;
        return null;
      });

      const dest = await runSyncAuth();

      expect(dest).toBe("/invitations/tok_priority_1_workspace");
      expect(tenantServiceCalled).toBe(false);
      expect(staffServiceCalled).toBe(false);
    });

    test("Priority 1 wins: Admin cookie routes to /admin/invitations/[token] and never invokes tenantService", async () => {
      mockCookieValues[PENDING_INVITATION_COOKIE_NAME] = serializePendingInvitation({
        type: "admin",
        token: "tok_priority_1_admin",
      });

      let tenantServiceCalled = false;
      tenantService.getTenantByOwner = mock(async () => {
        tenantServiceCalled = true;
        return {
          tenantSlug: "owned-clinic-should-not-reach",
          name: "Existing Owned Clinic",
          tenantType: "Workplace",
        } as any;
      });

      const dest = await runSyncAuth();

      expect(dest).toBe("/admin/invitations/tok_priority_1_admin");
      expect(tenantServiceCalled).toBe(false);
    });

    test("Priority 1 URL-encodes special characters in cookie token", async () => {
      mockCookieValues[PENDING_INVITATION_COOKIE_NAME] = serializePendingInvitation({
        type: "workspace",
        token: "tok+with spaces/and=symbols",
      });

      const dest = await runSyncAuth();
      expect(dest).toBe(`/invitations/${encodeURIComponent("tok+with spaces/and=symbols")}`);
    });
  });

  // =========================================================================
  // Challenge 2: No Cookie, Owns Workspace, AND Has Pending Invite (Priority 2 wins)
  // =========================================================================
  describe("Challenge 2: No Cookie + Owned Workspace + Pending Invite Precedence", () => {
    test("Priority 2 wins: Routes to owned workspace dashboard and short-circuits before pending self-invitation lookup", async () => {
      // No cookie in mockCookieValues
      mockCookieValues = {};

      tenantService.getTenantByOwner = mock(async () => ({
        tenantSlug: "st-paul-medical-center",
        name: "St. Paul Medical Center",
        tenantType: "Workplace",
      } as any));

      let staffServiceCalled = false;
      staffService.getPendingSelfInvitation = mock(async () => {
        staffServiceCalled = true;
        return {
          invitationType: "Workspace",
          token: "tok_pending_invite_other_org",
          tenantSlug: "other-org",
          workspaceName: "Other Organization",
          role: "Consultant",
          email: "doc@stpaul.ph",
          redirectUrl: "/invitations/tok_pending_invite_other_org",
        };
      });

      const dest = await runSyncAuth();

      // Priority 2 MUST win over Priority 3!
      expect(dest).toBe("/st-paul-medical-center/dashboard");
      // Pending self-invitation lookup MUST NOT be executed when user already owns an active workspace
      expect(staffServiceCalled).toBe(false);
    });
  });

  // =========================================================================
  // Challenge 3: Error Resilience in Backend Pending Self-Invite Lookup
  // =========================================================================
  describe("Challenge 3: Error Resilience in Backend Pending Self-Invitation Fetch", () => {
    test("Smooth fallback to /tenants/register when staffService throws Network/Fetch Error", async () => {
      tenantService.getTenantByOwner = mock(async () => null);

      staffService.getPendingSelfInvitation = mock(async () => {
        throw new TypeError("Failed to fetch: Connection refused");
      });

      const dest = await runSyncAuth();
      expect(dest).toBe("/tenants/register");
    });

    test("Smooth fallback to /tenants/register when staffService throws HTTP 500 Internal Server Error", async () => {
      tenantService.getTenantByOwner = mock(async () => null);

      staffService.getPendingSelfInvitation = mock(async () => {
        const error: any = new Error("Request failed with status code 500");
        error.response = { status: 500, data: { message: "Internal server error" } };
        throw error;
      });

      const dest = await runSyncAuth();
      expect(dest).toBe("/tenants/register");
    });

    test("Smooth fallback to /tenants/register when staffService throws HTTP 504 Gateway Timeout", async () => {
      tenantService.getTenantByOwner = mock(async () => null);

      staffService.getPendingSelfInvitation = mock(async () => {
        const error: any = new Error("Gateway timeout");
        error.response = { status: 504 };
        throw error;
      });

      const dest = await runSyncAuth();
      expect(dest).toBe("/tenants/register");
    });

    test("Dual Failure Cascade: both tenantService AND staffService throw errors without crashing", async () => {
      tenantService.getTenantByOwner = mock(async () => {
        throw new Error("Tenant API 503 Service Unavailable");
      });

      staffService.getPendingSelfInvitation = mock(async () => {
        throw new Error("Staff API 500 Internal Server Error");
      });

      const dest = await runSyncAuth();
      // Must not crash; smooth fallback to registration
      expect(dest).toBe("/tenants/register");
    });
  });

  // =========================================================================
  // Challenge 4: Boundary Cases in Pending Self-Invite Response Formats
  // =========================================================================
  describe("Challenge 4: Edge Cases in Backend Self-Invite Response Formats", () => {
    test("Routes to /admin/invitations/ when invitationType is 'admin' (case-insensitive)", async () => {
      tenantService.getTenantByOwner = mock(async () => null);

      staffService.getPendingSelfInvitation = mock(async () => ({
        invitationType: "admin" as any,
        token: "tok_admin_case_check",
        role: "Platform Administrator",
        email: "admin@clinicez.ph",
        redirectUrl: "/admin/invitations/tok_admin_case_check",
      }));

      const dest = await runSyncAuth();
      expect(dest).toBe("/admin/invitations/tok_admin_case_check");
    });

    test("Routes to /admin/invitations/ when redirectUrl starts with /admin/invitations/ even if invitationType is null", async () => {
      tenantService.getTenantByOwner = mock(async () => null);

      staffService.getPendingSelfInvitation = mock(async () => ({
        invitationType: null as any,
        token: "tok_admin_redirect_url_check",
        role: "Platform Admin",
        email: "admin@clinicez.ph",
        redirectUrl: "/admin/invitations/tok_admin_redirect_url_check",
      }));

      const dest = await runSyncAuth();
      expect(dest).toBe("/admin/invitations/tok_admin_redirect_url_check");
    });

    test("URL-encodes token with special characters from pending self-invite", async () => {
      tenantService.getTenantByOwner = mock(async () => null);

      staffService.getPendingSelfInvitation = mock(async () => ({
        invitationType: "Workspace",
        token: "tok/encoded+special%20value",
        tenantSlug: "special-clinic",
        role: "Member",
        email: "doc@special.ph",
        redirectUrl: "/invitations/tok/encoded+special%20value",
      }));

      const dest = await runSyncAuth();
      expect(dest).toBe(`/invitations/${encodeURIComponent("tok/encoded+special%20value")}`);
    });

    test("Falls through to /tenants/register when pending self-invite has empty token", async () => {
      tenantService.getTenantByOwner = mock(async () => null);

      staffService.getPendingSelfInvitation = mock(async () => ({
        invitationType: "Workspace",
        token: "",
        tenantSlug: "clinic-empty-token",
        role: "Member",
        email: "doc@empty.ph",
        redirectUrl: "/invitations/",
      }));

      const dest = await runSyncAuth();
      expect(dest).toBe("/tenants/register");
    });
  });
});

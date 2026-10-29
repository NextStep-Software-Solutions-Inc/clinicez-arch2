import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test";
import { PENDING_INVITATION_COOKIE_NAME } from "../src/lib/invitationCookie";

// Track redirection target
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

// Import services and page after mocks are established
import { tenantService } from "../src/services/tenant.service";
import { staffService } from "../src/services/staff.service";
import SyncAuthPage from "../src/app/sync-auth/page";

describe("SyncAuthPage 4-Priority Post-Authentication Gateway Routing", () => {
  const originalGetTenantByOwner = tenantService.getTenantByOwner;
  const originalGetPendingSelfInvitation = staffService.getPendingSelfInvitation;

  beforeEach(() => {
    mockCookieValues = {};
    mockAuthResult = {
      userId: "user_test_123",
      getToken: async () => "jwt_valid_token",
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
    } catch (err: any) {
      if (err instanceof RedirectError) {
        return err.url;
      }
      throw err;
    }
  };

  test("Gate 0: Unauthenticated user (userId is null) redirects to /sign-in", async () => {
    mockAuthResult.userId = null;
    const dest = await runSyncAuth();
    expect(dest).toBe("/sign-in");
  });

  test("Gate 0.1: Failure to retrieve auth token redirects to /sign-in", async () => {
    mockAuthResult.userId = "user_test_123";
    mockAuthResult.getToken = async () => {
      throw new Error("Clerk token refresh failure");
    };
    const dest = await runSyncAuth();
    expect(dest).toBe("/sign-in");
  });

  describe("Priority 1: Active Invitation Session Cookie", () => {
    test("P1.1: Routes to /invitations/[token] when workspace invitation cookie is present", async () => {
      mockCookieValues[PENDING_INVITATION_COOKIE_NAME] = encodeURIComponent(
        JSON.stringify({ type: "workspace", token: "tok_workspace_alpha" })
      );

      const dest = await runSyncAuth();
      expect(dest).toBe("/invitations/tok_workspace_alpha");
    });

    test("P1.2: Ignores legacy admin invitation cookie and falls through", async () => {
      mockCookieValues[PENDING_INVITATION_COOKIE_NAME] = encodeURIComponent(
        JSON.stringify({ type: "admin", token: "tok_admin_beta" })
      );

      tenantService.getTenantByOwner = mock(async () => null) as any;
      staffService.getPendingSelfInvitation = mock(async () => null) as any;

      const dest = await runSyncAuth();
      expect(dest).toBe("/tenants/register");
    });

    test("P1.3: Active invitation cookie strictly overrides existing owned workspace (R2.1)", async () => {
      // Cookie is present for joining a new workspace
      mockCookieValues[PENDING_INVITATION_COOKIE_NAME] = encodeURIComponent(
        JSON.stringify({ type: "workspace", token: "tok_new_workspace" })
      );

      // Even if user owns an existing tenant, Priority 1 must win
      tenantService.getTenantByOwner = mock(async () => ({
        tenantSlug: "existing-owned-clinic",
        name: "Existing Clinic",
        tenantType: "Workplace",
      })) as any;

      const dest = await runSyncAuth();
      expect(dest).toBe("/invitations/tok_new_workspace");
    });
  });

  describe("Priority 2: Owned Workspace or Active Membership", () => {
    test("P2.1: Routes to /{tenantSlug}/dashboard when user has owned workspace and no cookie", async () => {
      tenantService.getTenantByOwner = mock(async () => ({
        tenantSlug: "st-jude-hospital",
        name: "St. Jude Hospital",
        tenantType: "Workplace",
      })) as any;

      const dest = await runSyncAuth();
      expect(dest).toBe("/st-jude-hospital/dashboard");
    });
  });

  describe("Priority 3: Authoritative Pending Self-Invitation Lookup", () => {
    test("P3.1: Routes to workspace invitation when user has pending workspace invite and no owned tenant", async () => {
      // User owns no tenant
      tenantService.getTenantByOwner = mock(async () => null) as any;

      // Authoritative backend lookup finds pending workspace invitation
      staffService.getPendingSelfInvitation = mock(async () => ({
        invitationType: "Workspace",
        token: "csprng_verified_ws_token",
        tenantSlug: "metro-doc",
        workspaceName: "Metro Doctors Clinic",
        role: "Member",
        email: "doctor.lee@metro.ph",
        redirectUrl: "/invitations/csprng_verified_ws_token",
      })) as any;

      const dest = await runSyncAuth();
      expect(dest).toBe("/invitations/csprng_verified_ws_token");
    });

    test("P3.2: Routes to external admin invitation URL when user has pending platform admin invite", async () => {
      tenantService.getTenantByOwner = mock(async () => null) as any;

      staffService.getPendingSelfInvitation = mock(async () => ({
        invitationType: "Admin",
        token: "csprng_admin_token_999",
        tenantSlug: null,
        workspaceName: "Platform Administration",
        role: "Platform Admin",
        email: "admin.super@clinicez.ph",
        redirectUrl: "https://admin.clinicez.com/invitations/csprng_admin_token_999",
      })) as any;

      const dest = await runSyncAuth();
      expect(dest).toBe("https://admin.clinicez.com/invitations/csprng_admin_token_999");
    });

    test("P3.3: Recovers cleanly and evaluates pending self-invite if tenant lookup throws error", async () => {
      // Tenant lookup encounters an error (e.g. transient 500)
      tenantService.getTenantByOwner = mock(async () => {
        throw new Error("Internal Service Error");
      }) as any;

      // Pending self-invitation lookup succeeds
      staffService.getPendingSelfInvitation = mock(async () => ({
        invitationType: "Workspace",
        token: "resilient_invite_token",
        tenantSlug: "resilient-clinic",
        workspaceName: "Resilient Health",
        role: "Nurse",
        email: "nurse@resilient.ph",
        redirectUrl: "/invitations/resilient_invite_token",
      })) as any;

      const dest = await runSyncAuth();
      expect(dest).toBe("/invitations/resilient_invite_token");
    });
  });

  describe("Priority 4: Default Registration Fallback", () => {
    test("P4.1: Routes to /tenants/register only when Priority 1, 2, and 3 are all absent", async () => {
      // No cookie present
      mockCookieValues = {};

      // No owned or member workspace
      tenantService.getTenantByOwner = mock(async () => null) as any;

      // No pending self-invitation
      staffService.getPendingSelfInvitation = mock(async () => null) as any;

      const dest = await runSyncAuth();
      expect(dest).toBe("/tenants/register");
    });
  });
});

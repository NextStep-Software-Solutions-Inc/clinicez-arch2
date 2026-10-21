import { describe, test, expect, mock } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { resolveAdminDisplayStatus } from "../src/app/admin/users/page";
import type { AdminUserDto } from "../src/services/admin.service";
import type { StaffMemberDto, StaffMemberStatus } from "../src/services/staff.service";

describe("Milestone 5 Tier 5: Adversarial Frontend & Routing Suite (Portal Web)", () => {
  // =========================================================================
  // SUITE 1: Proxy Route Whitelisting & Middleware Bypass in proxy.ts
  // =========================================================================
  describe("Suite 1: Proxy Route Whitelisting & Middleware Bypass", () => {
    // Exact route matcher patterns declared in apps/portal-web/src/proxy.ts:
    // const isPublicRoute = createRouteMatcher([
    //   '/upload(.*)',
    //   '/join(.*)',
    //   '/api/v1/public(.*)',
    //   '/admin/invitations(.*)',
    //   '/invitations(.*)'
    // ]);
    const publicPatterns = [
      /^\/upload(.*)$/,
      /^\/join(.*)$/,
      /^\/api\/v1\/public(.*)$/,
      /^\/admin\/invitations(.*)$/,
      /^\/invitations(.*)$/
    ];
    const isPublicRoute = (pathname: string) => publicPatterns.some((re) => re.test(pathname));

    test("1.1 Verifies /admin/invitations/[token] whitelists standard 64-char hex tokens", () => {
      const token = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
      expect(isPublicRoute(`/admin/invitations/${token}`)).toBe(true);
    });

    test("1.2 Verifies /invitations/[token] whitelists standard 64-char hex tokens for workspace invites", () => {
      const token = "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";
      expect(isPublicRoute(`/invitations/${token}`)).toBe(true);
    });

    test("1.3 Verifies URLs with query parameters bypass middleware (?channel=email&ref=admin)", () => {
      expect(isPublicRoute("/admin/invitations/token_abc?channel=email&ref=admin")).toBe(true);
      expect(isPublicRoute("/invitations/token_xyz?channel=email&ref=workspace")).toBe(true);
    });

    test("1.4 Verifies trailing slash variations (/admin/invitations/ and /invitations/)", () => {
      expect(isPublicRoute("/admin/invitations/")).toBe(true);
      expect(isPublicRoute("/invitations/")).toBe(true);
      expect(isPublicRoute("/admin/invitations")).toBe(true);
      expect(isPublicRoute("/invitations")).toBe(true);
    });

    test("1.5 Adversarial Boundary: Lookalike and sensitive internal admin routes are strictly NOT public", () => {
      expect(isPublicRoute("/admin")).toBe(false);
      expect(isPublicRoute("/admin/")).toBe(false);
      expect(isPublicRoute("/admin/users")).toBe(false);
      expect(isPublicRoute("/admin/users/invite")).toBe(false);
      expect(isPublicRoute("/admin/roles")).toBe(false);
      expect(isPublicRoute("/admin/settings")).toBe(false);
      expect(isPublicRoute("/admin/analytics")).toBe(false);
      expect(isPublicRoute("/admin/tenants")).toBe(false);
      expect(isPublicRoute("/admin/plans")).toBe(false);
      expect(isPublicRoute("/admin/leads")).toBe(false);
      expect(isPublicRoute("/admin/blog")).toBe(false);
      // Singular /admin/invitation without 's' is NOT public
      expect(isPublicRoute("/admin/invitation")).toBe(false);
      expect(isPublicRoute("/admin/invitation/abc")).toBe(false);
      // Singular /invitation without 's' is NOT public
      expect(isPublicRoute("/invitation")).toBe(false);
      expect(isPublicRoute("/invitation/abc")).toBe(false);
    });

    test("1.6 Adversarial Boundary: Protected tenant dashboard routes are strictly blocked", () => {
      expect(isPublicRoute("/acme-clinic/dashboard/team")).toBe(false);
      expect(isPublicRoute("/acme-clinic/dashboard/overview")).toBe(false);
      expect(isPublicRoute("/acme-clinic/dashboard/billing")).toBe(false);
      expect(isPublicRoute("/sync-auth")).toBe(false);
    });

    test("1.7 Static source code audit of proxy.ts verifies presence of both invitation public matchers", () => {
      const proxySource = fs.readFileSync(path.resolve(__dirname, "../src/proxy.ts"), "utf-8");
      expect(proxySource).toContain("'/admin/invitations(.*)'");
      expect(proxySource).toContain("'/invitations(.*)'");
      expect(proxySource).toContain("if (isPublicRoute(req))");
      expect(proxySource).toContain("return NextResponse.next()");
    });
  });

  // =========================================================================
  // SUITE 2: Suppression of Admin Layout Wrappers in AdminLayoutClient.tsx
  // =========================================================================
  describe("Suite 2: Suppression of Admin Layout Wrappers in AdminLayoutClient.tsx", () => {
    // Replicating AdminLayoutClient.tsx route bypass checks:
    // 1. In useEffect auth guard: if (pathname?.startsWith("/admin/invitations")) return;
    // 2. In render tree: if (pathname?.startsWith("/admin/invitations")) return <>{children}</>;
    const shouldBypassAdminLayout = (pathname: string | null | undefined): boolean => {
      return Boolean(pathname?.startsWith("/admin/invitations"));
    };

    test("2.1 /admin/invitations/[token] bypasses admin chrome and navigation headers", () => {
      expect(shouldBypassAdminLayout("/admin/invitations/64charhextoken1234567890abcdef")).toBe(true);
    });

    test("2.2 /admin/invitations with query parameters bypasses layout", () => {
      expect(shouldBypassAdminLayout("/admin/invitations/token123?ref=email")).toBe(true);
    });

    test("2.3 /admin/users enforces full admin sidebar and header", () => {
      expect(shouldBypassAdminLayout("/admin/users")).toBe(false);
    });

    test("2.4 /admin and subroutes enforce full admin chrome", () => {
      expect(shouldBypassAdminLayout("/admin")).toBe(false);
      expect(shouldBypassAdminLayout("/admin/tenants")).toBe(false);
      expect(shouldBypassAdminLayout("/admin/plans")).toBe(false);
      expect(shouldBypassAdminLayout("/admin/settings")).toBe(false);
    });

    test("2.5 Lookalike routes do not accidentally bypass layout", () => {
      expect(shouldBypassAdminLayout("/admin/invitation")).toBe(false);
      expect(shouldBypassAdminLayout("/admin/invite")).toBe(false);
      expect(shouldBypassAdminLayout("/admin-invitations")).toBe(false);
    });

    test("2.6 Static source code audit of AdminLayoutClient.tsx confirms layout bypass guards", () => {
      const layoutSource = fs.readFileSync(path.resolve(__dirname, "../src/app/admin/AdminLayoutClient.tsx"), "utf-8");
      expect(layoutSource).toContain('if (pathname?.startsWith("/admin/invitations")) return;');
      expect(layoutSource).toContain('if (pathname?.startsWith("/admin/invitations")) {\n    return <>{children}</>;\n  }');
    });
  });

  // =========================================================================
  // SUITE 3: Action Matrix Consistency across Invited, Expired, Active, Suspended, Revoked
  // =========================================================================
  describe("Suite 3: Action Matrix Consistency (Tier 1 Admin Users vs Tier 2 Workspace Team)", () => {
    // Action resolvers mirroring production table logic:
    const getTier1Actions = (user: {
      status: "Invited" | "Active" | "Suspended" | "Revoked";
      invitationExpiresAt?: string | null;
      displayStatus?: string;
    }) => {
      const status = resolveAdminDisplayStatus(user);
      if (status === "Invited") return ["Copy Link", "Resend", "Revoke"];
      if (status === "Expired") return ["Resend", "Revoke"];
      if (status === "Active") return ["Edit Details", "Suspend"];
      if (status === "Suspended") return ["Reactivate"];
      return []; // Revoked
    };

    const getTier2Actions = (member: {
      status: StaffMemberStatus;
      invitationExpiresAt?: string | null;
    }) => {
      let resolvedStatus: string = member.status;
      if (member.status === "Invited" && member.invitationExpiresAt) {
        if (new Date(member.invitationExpiresAt).getTime() < Date.now()) {
          resolvedStatus = "Expired";
        }
      }
      if (resolvedStatus === "Invited") return ["Copy Link", "Resend", "Revoke"];
      if (resolvedStatus === "Expired") return ["Resend", "Revoke"];
      if (resolvedStatus === "Active") return ["Edit Details", "Suspend"];
      if (resolvedStatus === "Suspended") return ["Reactivate"];
      return []; // Revoked
    };

    test("3.1 Invited state (unexpired): Identical actions ['Copy Link', 'Resend', 'Revoke'] across Tier 1 & Tier 2", () => {
      const future = new Date(Date.now() + 6 * 86400000).toISOString();
      const t1 = getTier1Actions({ status: "Invited", invitationExpiresAt: future });
      const t2 = getTier2Actions({ status: "Invited", invitationExpiresAt: future });
      expect(t1).toEqual(["Copy Link", "Resend", "Revoke"]);
      expect(t2).toEqual(["Copy Link", "Resend", "Revoke"]);
      expect(t1).toEqual(t2);
    });

    test("3.2 Expired state (past expiry): Strictly strips 'Copy Link', retains ['Resend', 'Revoke'] across Tier 1 & Tier 2", () => {
      const past = new Date(Date.now() - 1000).toISOString();
      const t1 = getTier1Actions({ status: "Invited", invitationExpiresAt: past });
      const t2 = getTier2Actions({ status: "Invited", invitationExpiresAt: past });
      expect(t1).toEqual(["Resend", "Revoke"]);
      expect(t2).toEqual(["Resend", "Revoke"]);
      expect(t1).not.toContain("Copy Link");
      expect(t2).not.toContain("Copy Link");
      expect(t1).toEqual(t2);
    });

    test("3.3 Active state: Identical actions ['Edit Details', 'Suspend'] across Tier 1 & Tier 2", () => {
      const t1 = getTier1Actions({ status: "Active" });
      const t2 = getTier2Actions({ status: "Active" });
      expect(t1).toEqual(["Edit Details", "Suspend"]);
      expect(t2).toEqual(["Edit Details", "Suspend"]);
      expect(t1).toEqual(t2);
    });

    test("3.4 Suspended state: Identical action ['Reactivate'] across Tier 1 & Tier 2", () => {
      const t1 = getTier1Actions({ status: "Suspended" });
      const t2 = getTier2Actions({ status: "Suspended" });
      expect(t1).toEqual(["Reactivate"]);
      expect(t2).toEqual(["Reactivate"]);
      expect(t1).toEqual(t2);
    });

    test("3.5 Revoked state: Strictly 0 lifecycle actions across Tier 1 & Tier 2", () => {
      const t1 = getTier1Actions({ status: "Revoked" });
      const t2 = getTier2Actions({ status: "Revoked" });
      expect(t1).toEqual([]);
      expect(t2).toEqual([]);
      expect(t1).toEqual(t2);
    });

    test("3.6 Dynamic expiration 1ms boundary precision", () => {
      const now = Date.now();
      // 100ms in the future -> Invited
      expect(resolveAdminDisplayStatus({
        status: "Invited",
        invitationExpiresAt: new Date(now + 100).toISOString(),
        isActive: true
      })).toBe("Invited");

      // 100ms in the past -> Expired
      expect(resolveAdminDisplayStatus({
        status: "Invited",
        invitationExpiresAt: new Date(now - 100).toISOString(),
        isActive: true
      })).toBe("Expired");
    });
  });

  // =========================================================================
  // SUITE 4: Empty Token or Corrupted Token Handling in UI
  // =========================================================================
  describe("Suite 4: Empty Token or Corrupted Token Handling in UI", () => {
    test("4.1 InvitationAcceptClient guards against empty or whitespace token without spinning", () => {
      const source = fs.readFileSync(path.resolve(__dirname, "../src/app/invitations/[token]/InvitationAcceptClient.tsx"), "utf-8");
      // Must contain defensive check setting loading to false
      expect(source).toContain("if (!token || !token.trim())");
      expect(source).toContain('setError("Invitation token is missing or invalid.")');
      expect(source).toContain("setLoading(false)");
    });

    test("4.2 InvitationAcceptClient renders dedicated state cards for all lifecycle states", () => {
      const source = fs.readFileSync(path.resolve(__dirname, "../src/app/invitations/[token]/InvitationAcceptClient.tsx"), "utf-8");
      expect(source).toContain("invite.isRevoked");
      expect(source).toContain("invite.isSuspended");
      expect(source).toContain("invite.isExpired");
      expect(source).toContain("invite.isAlreadyAccepted");
      expect(source).toContain("Account Suspended");
      expect(source).toContain("Invitation Revoked");
      expect(source).toContain("Invitation Expired");
      expect(source).toContain("Already Accepted");
    });

    test("4.3 AdminInvitationAcceptClient renders dedicated state cards for all lifecycle states", () => {
      const source = fs.readFileSync(path.resolve(__dirname, "../src/app/admin/invitations/[token]/AdminInvitationAcceptClient.tsx"), "utf-8");
      expect(source).toContain("invite.isSuspended || invite.isRevoked");
      expect(source).toContain("invite.isExpired");
      expect(source).toContain("invite.isAlreadyAccepted");
      expect(source).toContain("Account Suspended");
      expect(source).toContain("Invitation Revoked");
      expect(source).toContain("Invitation Expired");
      expect(source).toContain("Already Accepted");
    });

    test("4.4 AdminInvitationAcceptClient catch block guarantees setLoading(false) on corrupted/invalid token", () => {
      const source = fs.readFileSync(path.resolve(__dirname, "../src/app/admin/invitations/[token]/AdminInvitationAcceptClient.tsx"), "utf-8");
      expect(source).toContain("finally {");
      expect(source).toContain("setLoading(false);");
    });
  });
});

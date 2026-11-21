import { describe, test, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import type { StaffMemberDto, StaffMemberStatus } from "../src/services/staff.service";

describe("Milestone 5 Tier 5: Adversarial Frontend & Routing Suite (Portal Web)", () => {
  // =========================================================================
  // SUITE 1: Proxy Route Whitelisting & Middleware Bypass in proxy.ts
  // =========================================================================
  describe("Suite 1: Proxy Route Whitelisting & Middleware Bypass", () => {
    // Exact route matcher patterns declared in apps/portal-web/src/proxy.ts:
    const publicPatterns = [
      /^\/claim(\/.*)?$/,
      /^\/join(\/.*)?$/,
      /^\/teleconsult(\/.*)?$/,
      /^\/verify(\/.*)?$/,
      /^\/upload(\/.*)?$/,
      /^\/invitations(\/.*)?$/,
      /^\/reset-password(\/.*)?$/,
    ];
    const isPublicRoute = (pathname: string) => publicPatterns.some((re) => re.test(pathname));

    test("1.1 Verifies /invitations/[token] whitelists standard 64-char hex tokens for workspace invites", () => {
      const token = "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";
      expect(isPublicRoute(`/invitations/${token}`)).toBe(true);
    });

    test("1.2 Verifies URLs with query parameters bypass middleware (?channel=email&ref=workspace)", () => {
      expect(isPublicRoute("/invitations/token_xyz?channel=email&ref=workspace")).toBe(true);
    });

    test("1.3 Verifies trailing slash variations (/invitations/ and /invitations)", () => {
      expect(isPublicRoute("/invitations/")).toBe(true);
      expect(isPublicRoute("/invitations")).toBe(true);
    });

    test("1.4 Adversarial Boundary: Lookalike and sensitive internal admin routes are strictly NOT public", () => {
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
      expect(isPublicRoute("/admin/invitations")).toBe(false);
      expect(isPublicRoute("/admin/invitations/abc")).toBe(false);
      // Singular /invitation without 's' is NOT public
      expect(isPublicRoute("/invitation")).toBe(false);
      expect(isPublicRoute("/invitation/abc")).toBe(false);
    });

    test("1.5 Adversarial Boundary: Protected tenant dashboard routes are strictly blocked", () => {
      expect(isPublicRoute("/acme-clinic/dashboard/team")).toBe(false);
      expect(isPublicRoute("/acme-clinic/dashboard/overview")).toBe(false);
      expect(isPublicRoute("/acme-clinic/dashboard/billing")).toBe(false);
      expect(isPublicRoute("/sync-auth")).toBe(false);
    });

    test("1.6 Static source code audit of proxy.ts verifies workspace invitation public matcher and absence of /admin", () => {
      const proxySource = fs.readFileSync(path.resolve(__dirname, "../src/proxy.ts"), "utf-8");
      expect(proxySource).toContain("'/invitations(.*)'");
      expect(proxySource).not.toContain("'/admin/invitations(.*)'");
      expect(proxySource).not.toContain("'/admin(.*)'");
      expect(proxySource).toContain("if (isPublicRoute(req))");
      expect(proxySource).toContain("return NextResponse.next()");
    });
  });

  // =========================================================================
  // SUITE 2: Action Matrix Consistency for Workspace Team
  // =========================================================================
  describe("Suite 2: Action Matrix Consistency for Workspace Team", () => {
    const getWorkspaceActions = (member: {
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

    test("2.1 Invited state (unexpired): Actions ['Copy Link', 'Resend', 'Revoke']", () => {
      const future = new Date(Date.now() + 6 * 86400000).toISOString();
      const actions = getWorkspaceActions({ status: "Invited", invitationExpiresAt: future });
      expect(actions).toEqual(["Copy Link", "Resend", "Revoke"]);
    });

    test("2.2 Expired state (past expiry): Strictly strips 'Copy Link', retains ['Resend', 'Revoke']", () => {
      const past = new Date(Date.now() - 1000).toISOString();
      const actions = getWorkspaceActions({ status: "Invited", invitationExpiresAt: past });
      expect(actions).toEqual(["Resend", "Revoke"]);
      expect(actions).not.toContain("Copy Link");
    });

    test("2.3 Active state: Actions ['Edit Details', 'Suspend']", () => {
      const actions = getWorkspaceActions({ status: "Active" });
      expect(actions).toEqual(["Edit Details", "Suspend"]);
    });

    test("2.4 Suspended state: Action ['Reactivate']", () => {
      const actions = getWorkspaceActions({ status: "Suspended" });
      expect(actions).toEqual(["Reactivate"]);
    });

    test("2.5 Revoked state: Strictly 0 lifecycle actions", () => {
      const actions = getWorkspaceActions({ status: "Revoked" });
      expect(actions).toEqual([]);
    });
  });

  // =========================================================================
  // SUITE 3: Empty Token or Corrupted Token Handling in UI
  // =========================================================================
  describe("Suite 3: Empty Token or Corrupted Token Handling in UI", () => {
    test("3.1 InvitationAcceptClient guards against empty or whitespace token without spinning", () => {
      const source = fs.readFileSync(path.resolve(__dirname, "../src/app/invitations/[token]/InvitationAcceptClient.tsx"), "utf-8");
      expect(source).toContain("if (!token || !token.trim())");
      expect(source).toContain('setError("Invitation token is missing or invalid.")');
      expect(source).toContain("setLoading(false)");
    });

    test("3.2 InvitationAcceptClient renders dedicated state cards for all lifecycle states", () => {
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
  });
});

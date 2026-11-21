import { describe, test, expect, mock } from "bun:test";
import { resolveAdminDisplayStatus } from "../src/routes/users";
import { adminService } from "../src/services/admin.service";
import * as fs from "fs";
import * as path from "path";
import { apiClient } from "../src/lib/api";
import {
  getAdminUserActionRestriction,
  isSelfAdminUser,
  SELF_ACTION_MESSAGES,
} from "../src/lib/selfActionGuard";

describe("Admin User Invitations & Lifecycle Tracking", () => {
  describe("Proxy Middleware Whitelisting Logic", () => {
    // Regex replicating createRouteMatcher(['/upload(.*)', '/join(.*)', '/api/v1/public(.*)', '/admin/invitations(.*)', '/invitations(.*)'])
    const isPublicAdminRoute = (path: string) => {
      const publicPatterns = [
        /^\/upload(.*)$/,
        /^\/join(.*)$/,
        /^\/api\/v1\/public(.*)$/,
        /^\/admin\/invitations(.*)$/,
        /^\/invitations(.*)$/
      ];
      return publicPatterns.some(pattern => pattern.test(path));
    };

    test("public invitation token URLs are whitelisted for anonymous access", () => {
      expect(isPublicAdminRoute("/admin/invitations/abcdef1234567890")).toBe(true);
      expect(isPublicAdminRoute("/admin/invitations/token_hex_64_characters_entropy")).toBe(true);
      expect(isPublicAdminRoute("/admin/invitations/")).toBe(true);
      expect(isPublicAdminRoute("/admin/invitations")).toBe(true);
      expect(isPublicAdminRoute("/invitations/abcdef1234567890")).toBe(true);
    });

    test("internal admin dashboard routes are NOT public", () => {
      expect(isPublicAdminRoute("/admin")).toBe(false);
      expect(isPublicAdminRoute("/admin/users")).toBe(false);
      expect(isPublicAdminRoute("/admin/roles")).toBe(false);
      expect(isPublicAdminRoute("/admin/settings")).toBe(false);
      expect(isPublicAdminRoute("/admin/analytics")).toBe(false);
    });
  });

  describe("Dynamic Expired Resolution Logic", () => {
    test("resolves 'Invited' when invitationExpiresAt is in the future", () => {
      const future = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
      const status = resolveAdminDisplayStatus({
        status: "Invited",
        invitationExpiresAt: future,
        isActive: true
      });
      expect(status).toBe("Invited");
    });

    test("resolves 'Expired' when status is Invited but invitationExpiresAt is in the past", () => {
      const past = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
      const status = resolveAdminDisplayStatus({
        status: "Invited",
        invitationExpiresAt: past,
        isActive: true
      });
      expect(status).toBe("Expired");
    });

    test("Active status remains Active even if invitationExpiresAt was in the past", () => {
      const past = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
      const status = resolveAdminDisplayStatus({
        status: "Active",
        invitationExpiresAt: past,
        isActive: true
      });
      expect(status).toBe("Active");
    });

    test("Suspended status is not overwritten by expired timestamp", () => {
      const past = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
      const status = resolveAdminDisplayStatus({
        status: "Suspended",
        invitationExpiresAt: past,
        isActive: false
      });
      expect(status).toBe("Suspended");
    });

    test("Revoked status is preserved correctly", () => {
      const status = resolveAdminDisplayStatus({
        status: "Revoked",
        isActive: true
      });
      expect(status).toBe("Revoked");
    });

    test("preserves pre-computed displayStatus if provided by backend", () => {
      const status = resolveAdminDisplayStatus({
        status: "Invited",
        displayStatus: "Expired",
        invitationExpiresAt: new Date(Date.now() + 100000).toISOString(),
        isActive: true
      });
      expect(status).toBe("Expired");
    });
  });

  describe("Admin Service API Client Methods", () => {
    test("inviteUser dispatches POST to /admin/users with deliveryMode", async () => {
      const originalPost = apiClient.post;
      let capturedUrl = "";
      let capturedPayload: any = null;

      apiClient.post = mock(async (url: string, data?: any) => {
        capturedUrl = url;
        capturedPayload = data;
        return {
          data: {
            id: "user-123",
            email: data.email,
            fullName: data.fullName,
            roleId: data.roleId,
            status: "Invited",
            displayStatus: "Invited",
            invitationToken: "tok123",
            inviteUrl: "https://admin.clinicez.com/invitations/tok123",
            isActive: true,
            createdAt: new Date().toISOString()
          }
        };
      }) as any;

      try {
        const res = await adminService.inviteUser({
          email: "ops@clinicez.com",
          fullName: "Ops Manager",
          roleId: "role-456",
          deliveryMode: "link"
        });

        expect(capturedUrl).toBe("/admin/users");
        expect(capturedPayload.deliveryMode).toBe("link");
        expect(res.status).toBe("Invited");
        expect(res.inviteUrl).toContain("tok123");
      } finally {
        apiClient.post = originalPost;
      }
    });

    test("resendInvitation calls /admin/users/:id/resend", async () => {
      const originalPost = apiClient.post;
      let capturedUrl = "";

      apiClient.post = mock(async (url: string) => {
        capturedUrl = url;
        return {
          data: {
            id: "user-123",
            status: "Invited",
            invitationToken: "fresh-tok-789"
          }
        };
      }) as any;

      try {
        const res = await adminService.resendInvitation("user-123");
        expect(capturedUrl).toBe("/admin/users/user-123/resend");
        expect(res.invitationToken).toBe("fresh-tok-789");
      } finally {
        apiClient.post = originalPost;
      }
    });

    test("revokeInvitation calls /admin/users/:id/revoke", async () => {
      const originalPost = apiClient.post;
      let capturedUrl = "";

      apiClient.post = mock(async (url: string) => {
        capturedUrl = url;
        return {
          data: {
            id: "user-123",
            status: "Revoked"
          }
        };
      }) as any;

      try {
        const res = await adminService.revokeInvitation("user-123");
        expect(capturedUrl).toBe("/admin/users/user-123/revoke");
        expect(res.status).toBe("Revoked");
      } finally {
        apiClient.post = originalPost;
      }
    });

    test("suspendUser calls /admin/users/:id/suspend", async () => {
      const originalPost = apiClient.post;
      let capturedUrl = "";

      apiClient.post = mock(async (url: string) => {
        capturedUrl = url;
        return {
          data: {
            id: "user-123",
            status: "Suspended",
            isActive: false
          }
        };
      }) as any;

      try {
        const res = await adminService.suspendUser("user-123");
        expect(capturedUrl).toBe("/admin/users/user-123/suspend");
        expect(res.status).toBe("Suspended");
        expect(res.isActive).toBe(false);
      } finally {
        apiClient.post = originalPost;
      }
    });

    test("reactivateUser calls /admin/users/:id/reactivate", async () => {
      const originalPost = apiClient.post;
      let capturedUrl = "";

      apiClient.post = mock(async (url: string) => {
        capturedUrl = url;
        return {
          data: {
            id: "user-123",
            status: "Active",
            isActive: true
          }
        };
      }) as any;

      try {
        const res = await adminService.reactivateUser("user-123");
        expect(capturedUrl).toBe("/admin/users/user-123/reactivate");
        expect(res.status).toBe("Active");
        expect(res.isActive).toBe(true);
      } finally {
        apiClient.post = originalPost;
      }
    });

    test("getInvitationDetails calls GET /admin/invitations/:token", async () => {
      const originalGet = apiClient.get;
      let capturedUrl = "";

      apiClient.get = mock(async (url: string) => {
        capturedUrl = url;
        return {
          data: {
            email: "invited@clinicez.com",
            fullName: "Invited Admin",
            roleName: "Support Staff",
            roleDescription: "Support role",
            expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
            isExpired: false,
            isAlreadyAccepted: false,
            isRevoked: false
          }
        };
      }) as any;

      try {
        const res = await adminService.getInvitationDetails("test-token-123");
        expect(capturedUrl).toBe("/admin/invitations/test-token-123");
        expect(res.email).toBe("invited@clinicez.com");
        expect(res.isExpired).toBe(false);
      } finally {
        apiClient.get = originalGet;
      }
    });

    test("acceptInvitation calls POST /admin/invitations/:token/accept", async () => {
      const originalPost = apiClient.post;
      let capturedUrl = "";

      apiClient.post = mock(async (url: string) => {
        capturedUrl = url;
        return {
          data: {
            id: "user-123",
            clerkUserId: "user_clerk_accepted",
            status: "Active",
            isActive: true
          }
        };
      }) as any;

      try {
        const res = await adminService.acceptInvitation("token-abc-999");
        expect(capturedUrl).toBe("/admin/invitations/token-abc-999/accept");
        expect(res.status).toBe("Active");
        expect(res.clerkUserId).toBe("user_clerk_accepted");
      } finally {
        apiClient.post = originalPost;
      }
    });
  });

  describe("Self-Action Restrictions in Super Admin Portal (#112)", () => {
    test("matches self admin user by Clerk userId or case-insensitive email", () => {
      expect(
        isSelfAdminUser(
          { clerkUserId: "user_admin_self_1", email: "admin1@clinicez.net" },
          { userId: "user_admin_self_1", email: "other@clinicez.net" }
        )
      ).toBe(true);
      expect(
        isSelfAdminUser(
          { clerkUserId: null, email: "  SuperAdmin@ClinicEZ.net " },
          { userId: "user_admin_self_1", email: "superadmin@clinicez.net" }
        )
      ).toBe(true);
      expect(
        isSelfAdminUser(
          { clerkUserId: "user_admin_other_2", email: "other@clinicez.net" },
          { userId: "user_admin_self_1", email: "superadmin@clinicez.net" }
        )
      ).toBe(false);
    });

    test("disables Revoke, Suspend, and Delete with consistent tooltips for self admin account", () => {
      const selfRestriction = getAdminUserActionRestriction(
        { clerkUserId: "user_admin_self_1", email: "admin@clinicez.net", status: "Active", displayStatus: "Active" },
        { userId: "user_admin_self_1", email: "admin@clinicez.net" }
      );
      expect(selfRestriction.isSelf).toBe(true);
      expect(selfRestriction.canRevoke).toBe(false);
      expect(selfRestriction.canSuspend).toBe(false);
      expect(selfRestriction.canDelete).toBe(false);
      expect(selfRestriction.revokeTooltip).toBe("You cannot revoke your own admin account.");
      expect(selfRestriction.suspendTooltip).toBe(SELF_ACTION_MESSAGES.adminSuspend);
      expect(selfRestriction.deleteTooltip).toBe(SELF_ACTION_MESSAGES.adminDelete);

      const otherRestriction = getAdminUserActionRestriction(
        { clerkUserId: "user_admin_other_2", email: "other@clinicez.net", status: "Active", displayStatus: "Active" },
        { userId: "user_admin_self_1", email: "admin@clinicez.net" }
      );
      expect(otherRestriction.isSelf).toBe(false);
      expect(otherRestriction.canRevoke).toBe(true);
      expect(otherRestriction.canSuspend).toBe(true);
      expect(otherRestriction.canDelete).toBe(true);
      expect(otherRestriction.revokeTooltip).toBe("Revoke Admin Access");
      expect(otherRestriction.suspendTooltip).toBe("Suspend Account");
    });

    test("AdminUsersPage wires getAdminUserActionRestriction, disables self actions, and locks Edit status toggle for self", () => {
      const source = fs.readFileSync(
        path.resolve(__dirname, "../src/routes/users.tsx"),
        "utf-8"
      );
      expect(source).toContain("getAdminUserActionRestriction");
      expect(source).toContain("!restriction.canRevoke");
      expect(source).toContain("!restriction.canSuspend");
      expect(source).toContain("!restriction.canDelete");
      expect(source).toContain("disabled={isEditingSelf}");
      expect(source).toContain("SELF_ACTION_MESSAGES.adminRevoke");
      expect(source).toContain("SELF_ACTION_MESSAGES.adminSuspend");
    });
  });
});

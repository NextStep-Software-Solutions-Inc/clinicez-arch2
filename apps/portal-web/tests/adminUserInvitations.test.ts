import { describe, test, expect, mock } from "bun:test";
import { resolveAdminDisplayStatus } from "../src/app/admin/users/page";
import { adminService } from "../src/services/admin.service";
import { apiClient } from "../src/transport/apiClient";

describe("Admin User Invitations & Lifecycle Tracking", () => {
  describe("Proxy Middleware Whitelisting Logic", () => {
    // Regex replicating createRouteMatcher(['/upload(.*)', '/join(.*)', '/api/v1/public(.*)', '/admin/invitations(.*)'])
    const isPublicAdminRoute = (path: string) => {
      const publicPatterns = [
        /^\/upload(.*)$/,
        /^\/join(.*)$/,
        /^\/api\/v1\/public(.*)$/,
        /^\/admin\/invitations(.*)$/
      ];
      return publicPatterns.some(pattern => pattern.test(path));
    };

    test("public invitation token URLs are whitelisted for anonymous access", () => {
      expect(isPublicAdminRoute("/admin/invitations/abcdef1234567890")).toBe(true);
      expect(isPublicAdminRoute("/admin/invitations/token_hex_64_characters_entropy")).toBe(true);
      expect(isPublicAdminRoute("/admin/invitations/")).toBe(true);
      expect(isPublicAdminRoute("/admin/invitations")).toBe(true);
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

    test("resolves 'Active' for accepted active users", () => {
      const status = resolveAdminDisplayStatus({
        status: "Active",
        isActive: true
      });
      expect(status).toBe("Active");
    });

    test("resolves 'Suspended' for suspended accounts", () => {
      const status = resolveAdminDisplayStatus({
        status: "Suspended",
        isActive: false
      });
      expect(status).toBe("Suspended");
    });

    test("resolves 'Revoked' for revoked invitations", () => {
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
            inviteUrl: "https://portal.clinicez.com/admin/invitations/tok123",
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
});

import { describe, test, expect, mock } from "bun:test";
import { staffService, StaffMemberStatus, StaffMemberDto } from "../src/services/staff.service";
import * as fs from "fs";
import * as path from "path";
import { apiClient } from "../src/transport/apiClient";
import {
  getWorkspaceMemberActionRestriction,
  isSelfWorkspaceMember,
  SELF_ACTION_MESSAGES,
} from "../src/lib/selfActionGuard";

describe("Tenant Workspace Team Invitations & Member Lifecycle (Milestone 2)", () => {
  describe("Proxy Middleware Whitelisting Logic", () => {
    // Regex matching createRouteMatcher pattern for public routes including '/invitations(.*)'
    const isPublicWorkspaceRoute = (path: string) => {
      const publicPatterns = [
        /^\/upload(.*)$/,
        /^\/join(.*)$/,
        /^\/api\/v1\/public(.*)$/,
        /^\/admin\/invitations(.*)$/,
        /^\/invitations(.*)$/
      ];
      return publicPatterns.some(pattern => pattern.test(path));
    };

    test("public invitation token URLs are whitelisted for anonymous accept flow", () => {
      expect(isPublicWorkspaceRoute("/invitations/abcdef1234567890")).toBe(true);
      expect(isPublicWorkspaceRoute("/invitations/token_hex_64_characters_entropy")).toBe(true);
      expect(isPublicWorkspaceRoute("/invitations/")).toBe(true);
      expect(isPublicWorkspaceRoute("/invitations")).toBe(true);
    });

    test("tenant dashboard routes remain strictly protected", () => {
      expect(isPublicWorkspaceRoute("/my-clinic/dashboard/team")).toBe(false);
      expect(isPublicWorkspaceRoute("/my-clinic/dashboard/overview")).toBe(false);
      expect(isPublicWorkspaceRoute("/my-clinic/dashboard/billing")).toBe(false);
      expect(isPublicWorkspaceRoute("/sync-auth")).toBe(false);
    });
  });

  describe("Staff Member Status & Expiration Semantics", () => {
    const resolveDisplayStatus = (member: {
      status: StaffMemberStatus;
      invitationExpiresAt?: string | null;
    }): StaffMemberStatus => {
      if (member.status === "Invited" && member.invitationExpiresAt) {
        if (new Date(member.invitationExpiresAt) < new Date()) {
          return "Expired";
        }
      }
      return member.status;
    };

    test("resolves 'Invited' when invitationExpiresAt is in the future", () => {
      const future = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
      const status = resolveDisplayStatus({
        status: "Invited",
        invitationExpiresAt: future
      });
      expect(status).toBe("Invited");
    });

    test("resolves 'Expired' when status is Invited but expiresAt is in the past", () => {
      const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const status = resolveDisplayStatus({
        status: "Invited",
        invitationExpiresAt: past
      });
      expect(status).toBe("Expired");
    });

    test("resolves 'Active' for accepted workspace members", () => {
      const status = resolveDisplayStatus({ status: "Active" });
      expect(status).toBe("Active");
    });

    test("resolves 'Suspended' for suspended accounts", () => {
      const status = resolveDisplayStatus({ status: "Suspended" });
      expect(status).toBe("Suspended");
    });

    test("resolves 'Revoked' for soft-revoked invitations", () => {
      const status = resolveDisplayStatus({ status: "Revoked" });
      expect(status).toBe("Revoked");
    });
  });

  describe("Staff Service API Client Methods", () => {
    test("inviteStaffMember dispatches POST to /staff/invite with delivery mode (sendEmail=true)", async () => {
      const originalPost = apiClient.post;
      let capturedUrl = "";
      let capturedPayload: any = null;

      apiClient.post = mock(async (url: string, data?: any) => {
        capturedUrl = url;
        capturedPayload = data;
        return {
          data: {
            id: "member-1",
            email: data.email,
            fullName: data.fullName,
            role: data.role,
            status: "Invited",
            invitationToken: "tok_secure_64_hex",
            invitationExpiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
            createdAt: new Date().toISOString()
          }
        };
      }) as any;

      try {
        const res = await staffService.inviteStaffMember({
          tenantSlug: "acme-health",
          fullName: "Dr. Evelyn Reed",
          email: "evelyn@acme.org",
          role: "Attending Physician",
          sendEmail: true
        });

        expect(capturedUrl).toBe("/staff/invite");
        expect(capturedPayload.tenantSlug).toBe("acme-health");
        expect(capturedPayload.sendEmail).toBe(true);
        expect(res.status).toBe("Invited");
        expect(res.invitationToken).toBe("tok_secure_64_hex");
      } finally {
        apiClient.post = originalPost;
      }
    });

    test("inviteStaffMember dispatches POST to /staff/invite with copy link only (sendEmail=false)", async () => {
      const originalPost = apiClient.post;
      let capturedUrl = "";
      let capturedPayload: any = null;

      apiClient.post = mock(async (url: string, data?: any) => {
        capturedUrl = url;
        capturedPayload = data;
        return {
          data: {
            id: "member-2",
            email: data.email,
            fullName: data.fullName,
            role: data.role,
            status: "Invited",
            invitationToken: "tok_secure_manual_link",
            invitationExpiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
            createdAt: new Date().toISOString()
          }
        };
      }) as any;

      try {
        const res = await staffService.inviteStaffMember({
          tenantSlug: "acme-health",
          fullName: "Nurse Alex",
          email: "alex@acme.org",
          role: "Biller",
          sendEmail: false
        });

        expect(capturedUrl).toBe("/staff/invite");
        expect(capturedPayload.sendEmail).toBe(false);
        expect(res.invitationToken).toBe("tok_secure_manual_link");
      } finally {
        apiClient.post = originalPost;
      }
    });

    test("resendInvitation calls /staff/invitations/:id/resend?tenantSlug=:slug", async () => {
      const originalPost = apiClient.post;
      let capturedUrl = "";

      apiClient.post = mock(async (url: string) => {
        capturedUrl = url;
        return {
          data: {
            id: "member-1",
            status: "Invited",
            invitationToken: "refreshed_tok_64_hex"
          }
        };
      }) as any;

      try {
        const res = await staffService.resendInvitation("member-1", "acme-health");
        expect(capturedUrl).toBe("/staff/invitations/member-1/resend?tenantSlug=acme-health");
        expect(res.invitationToken).toBe("refreshed_tok_64_hex");
      } finally {
        apiClient.post = originalPost;
      }
    });

    test("revokeStaffMember calls DELETE /staff/:id?tenantSlug=:slug", async () => {
      const originalDelete = apiClient.delete;
      let capturedUrl = "";

      apiClient.delete = mock(async (url: string) => {
        capturedUrl = url;
        return {
          data: {
            success: true,
            message: "Staff member revoked successfully."
          }
        };
      }) as any;

      try {
        const res = await staffService.revokeStaffMember("member-1", "acme-health");
        expect(capturedUrl).toBe("/staff/member-1?tenantSlug=acme-health");
        expect(res.success).toBe(true);
      } finally {
        apiClient.delete = originalDelete;
      }
    });

    test("deleteStaffMemberPermanently calls DELETE /staff/:id/permanent?tenantSlug=:slug", async () => {
      const originalDelete = apiClient.delete;
      let capturedUrl = "";

      apiClient.delete = mock(async (url: string) => {
        capturedUrl = url;
        return {
          data: {
            success: true,
            message: "Staff member permanently removed from workspace."
          }
        };
      }) as any;

      try {
        const res = await staffService.deleteStaffMemberPermanently("member-revoked-1", "acme-health");
        expect(capturedUrl).toBe("/staff/member-revoked-1/permanent?tenantSlug=acme-health");
        expect(res.success).toBe(true);
      } finally {
        apiClient.delete = originalDelete;
      }
    });

    test("suspendStaffMember calls POST /staff/:id/suspend?tenantSlug=:slug", async () => {
      const originalPost = apiClient.post;
      let capturedUrl = "";

      apiClient.post = mock(async (url: string) => {
        capturedUrl = url;
        return {
          data: {
            id: "member-1",
            status: "Suspended"
          }
        };
      }) as any;

      try {
        const res = await staffService.suspendStaffMember("member-1", "acme-health");
        expect(capturedUrl).toBe("/staff/member-1/suspend?tenantSlug=acme-health");
        expect(res.status).toBe("Suspended");
      } finally {
        apiClient.post = originalPost;
      }
    });

    test("reactivateStaffMember calls POST /staff/:id/reactivate?tenantSlug=:slug", async () => {
      const originalPost = apiClient.post;
      let capturedUrl = "";

      apiClient.post = mock(async (url: string) => {
        capturedUrl = url;
        return {
          data: {
            id: "member-1",
            status: "Active"
          }
        };
      }) as any;

      try {
        const res = await staffService.reactivateStaffMember("member-1", "acme-health");
        expect(capturedUrl).toBe("/staff/member-1/reactivate?tenantSlug=acme-health");
        expect(res.status).toBe("Active");
      } finally {
        apiClient.post = originalPost;
      }
    });

    test("updateStaffMember calls PUT /staff/:id?tenantSlug=:slug with payload", async () => {
      const originalPut = apiClient.put;
      let capturedUrl = "";
      let capturedPayload: any = null;

      apiClient.put = mock(async (url: string, data?: any) => {
        capturedUrl = url;
        capturedPayload = data;
        return {
          data: {
            id: "member-1",
            fullName: data.fullName,
            role: data.role,
            facilityId: data.facilityId,
            status: "Active"
          }
        };
      }) as any;

      try {
        const res = await staffService.updateStaffMember("member-1", "acme-health", {
          fullName: "Dr. Evelyn Reed MD",
          role: "Attending Physician",
          facilityId: "fac-123"
        });

        expect(capturedUrl).toBe("/staff/member-1?tenantSlug=acme-health");
        expect(capturedPayload.fullName).toBe("Dr. Evelyn Reed MD");
        expect(capturedPayload.role).toBe("Attending Physician");
        expect(capturedPayload.facilityId).toBe("fac-123");
        expect(res.fullName).toBe("Dr. Evelyn Reed MD");
      } finally {
        apiClient.put = originalPut;
      }
    });

    test("getInvitationDetails calls GET /staff/invitations/:token with revoked/suspended metadata", async () => {
      const originalGet = apiClient.get;
      let capturedUrl = "";

      apiClient.get = mock(async (url: string) => {
        capturedUrl = url;
        return {
          data: {
            id: "inv-1",
            tenantName: "Acme Health",
            tenantSlug: "acme-health",
            inviteeFullName: "Dr. Evelyn Reed",
            inviteeEmail: "evelyn@acme.org",
            role: "Attending Physician",
            isExpired: false,
            isAlreadyAccepted: false,
            isRevoked: true,
            isSuspended: false
          }
        };
      }) as any;

      try {
        const res = await staffService.getInvitationDetails("token-revoked-xyz");
        expect(capturedUrl).toBe("/staff/invitations/token-revoked-xyz");
        expect(res.isRevoked).toBe(true);
        expect(res.isSuspended).toBe(false);
      } finally {
        apiClient.get = originalGet;
      }
    });

    test("acceptInvitation calls POST /staff/invitations/:token/accept", async () => {
      const originalPost = apiClient.post;
      let capturedUrl = "";

      apiClient.post = mock(async (url: string) => {
        capturedUrl = url;
        return {
          data: {
            tenantSlug: "acme-health",
            workspaceName: "Acme Health",
            role: "Attending Physician",
            fullName: "Dr. Evelyn Reed"
          }
        };
      }) as any;

      try {
        const res = await staffService.acceptInvitation("token-valid-abc");
        expect(capturedUrl).toBe("/staff/invitations/token-valid-abc/accept");
        expect(res.tenantSlug).toBe("acme-health");
        expect(res.role).toBe("Attending Physician");
      } finally {
        apiClient.post = originalPost;
      }
    });

    test("getPendingSelfInvitation calls GET /staff/invitations/pending-self with Authorization header", async () => {
      const originalGet = apiClient.get;
      let capturedUrl = "";
      let capturedHeaders: any = null;

      apiClient.get = mock(async (url: string, config?: any) => {
        capturedUrl = url;
        capturedHeaders = config?.headers;
        return {
          data: {
            invitationType: "Workspace",
            token: "tok_pending_abc",
            tenantSlug: "acme-clinic",
            workspaceName: "Acme Clinic",
            role: "Nurse",
            email: "nurse@acme.ph",
            expiresAt: "2026-10-30T12:00:00Z",
            redirectUrl: "/invitations/tok_pending_abc",
          },
        };
      }) as any;

      try {
        const res = await staffService.getPendingSelfInvitation("jwt_bearer_token");
        expect(capturedUrl).toBe("/staff/invitations/pending-self");
        expect(capturedHeaders?.Authorization).toBe("Bearer jwt_bearer_token");
        expect(res?.invitationType).toBe("Workspace");
        expect(res?.token).toBe("tok_pending_abc");
      } finally {
        apiClient.get = originalGet;
      }
    });

    test("getPendingSelfInvitation returns null when API responds with HTTP 404", async () => {
      const originalGet = apiClient.get;

      apiClient.get = mock(async () => {
        const err: any = new Error("Not Found");
        err.response = { status: 404 };
        throw err;
      }) as any;

      try {
        const res = await staffService.getPendingSelfInvitation("jwt_bearer_token");
        expect(res).toBeNull();
      } finally {
        apiClient.get = originalGet;
      }
    });
  });

  describe("Self-Action Restrictions in Workspace Team (#112)", () => {
    test("matches self workspace member by exact Clerk userId", () => {
      expect(
        isSelfWorkspaceMember(
          { userId: "user_clerk_abc123", email: "member@clinic.ph" },
          { userId: "user_clerk_abc123", email: "different@clinic.ph" }
        )
      ).toBe(true);
    });

    test("matches self workspace member case-insensitively by primary or secondary email with whitespace", () => {
      expect(
        isSelfWorkspaceMember(
          { userId: null, email: "  Justine.Mae@ClinicEZ.net " },
          { userId: "user_clerk_xyz", email: "primary@clinicez.net", emails: ["justine.mae@clinicez.net"] }
        )
      ).toBe(true);
    });

    test("returns false for distinct workspace members or missing identity", () => {
      expect(
        isSelfWorkspaceMember(
          { userId: "user_other_999", email: "colleague@clinicez.net" },
          { userId: "user_self_111", email: "me@clinicez.net", emails: ["me@clinicez.net"] }
        )
      ).toBe(false);
      expect(isSelfWorkspaceMember(null, { userId: "user_self_111" })).toBe(false);
      expect(isSelfWorkspaceMember({ userId: "user_self_111" }, null)).toBe(false);
    });

    test("disables Revoke, Suspend, and Delete with explicit tooltips for self row while keeping other rows enabled", () => {
      const selfRestriction = getWorkspaceMemberActionRestriction(
        { userId: "user_self_111", email: "me@clinicez.net", status: "Active" },
        { userId: "user_self_111", email: "me@clinicez.net" }
      );
      expect(selfRestriction.isSelf).toBe(true);
      expect(selfRestriction.canRevoke).toBe(false);
      expect(selfRestriction.canSuspend).toBe(false);
      expect(selfRestriction.canDelete).toBe(false);
      expect(selfRestriction.revokeTooltip).toBe(SELF_ACTION_MESSAGES.workspaceRevoke);
      expect(selfRestriction.suspendTooltip).toBe(SELF_ACTION_MESSAGES.workspaceSuspend);
      expect(selfRestriction.deleteTooltip).toBe(SELF_ACTION_MESSAGES.workspaceDelete);

      const otherRestriction = getWorkspaceMemberActionRestriction(
        { userId: "user_other_222", email: "other@clinicez.net", status: "Active" },
        { userId: "user_self_111", email: "me@clinicez.net" }
      );
      expect(otherRestriction.isSelf).toBe(false);
      expect(otherRestriction.canRevoke).toBe(true);
      expect(otherRestriction.canSuspend).toBe(true);
      expect(otherRestriction.canDelete).toBe(true);
      expect(otherRestriction.revokeTooltip).toBe("Revoke Workspace Access");
      expect(otherRestriction.suspendTooltip).toBe("Suspend Account");
    });

    test("TeamManagementClient wires getWorkspaceMemberActionRestriction and disables self actions", () => {
      const source = fs.readFileSync(
        path.resolve(__dirname, "../src/app/[tenant]/dashboard/team/TeamManagementClient.tsx"),
        "utf-8"
      );
      expect(source).toContain("getWorkspaceMemberActionRestriction");
      expect(source).toContain("!restriction.canRevoke");
      expect(source).toContain("!restriction.canSuspend");
      expect(source).toContain("!restriction.canDelete");
      expect(source).toContain("SELF_ACTION_MESSAGES.workspaceRevoke");
      expect(source).toContain("SELF_ACTION_MESSAGES.workspaceSuspend");
    });
  });
});


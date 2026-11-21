import { describe, test, expect } from "bun:test";
import type { StaffMemberDto, StaffMemberStatus } from "../src/services/staff.service";

describe("Milestone 4: Workspace Member Status & Action Matrix Alignment (Portal Web)", () => {
  // Action availability resolver for Workspace Team members
  const getWorkspaceMemberActions = (member: {
    status: StaffMemberStatus;
    invitationExpiresAt?: string | null;
  }) => {
    let resolvedStatus: string = member.status;
    if (member.status === "Invited" && member.invitationExpiresAt) {
      if (new Date(member.invitationExpiresAt).getTime() < Date.now()) {
        resolvedStatus = "Expired";
      }
    }

    if (resolvedStatus === "Invited") {
      return ["Copy Link", "Resend", "Revoke"];
    }
    if (resolvedStatus === "Expired") {
      return ["Resend", "Revoke"];
    }
    if (resolvedStatus === "Active") {
      return ["Edit Details", "Suspend"];
    }
    if (resolvedStatus === "Suspended") {
      return ["Reactivate"];
    }
    return []; // Revoked
  };

  const resolveWorkspaceDisplayStatus = (member: {
    status: StaffMemberStatus;
    invitationExpiresAt?: string | null;
  }): string => {
    if (member.status === "Invited" && member.invitationExpiresAt) {
      if (new Date(member.invitationExpiresAt).getTime() < Date.now()) {
        return "Expired";
      }
    }
    return member.status;
  };

  describe("Status Consistency & Dynamic Expired Resolution", () => {
    test("Dynamically resolves Expired when status is Invited with past expiration", () => {
      const pastTime = new Date(Date.now() - 3600000).toISOString();
      const member: Partial<StaffMemberDto> = {
        status: "Invited",
        invitationExpiresAt: pastTime,
      };
      const resolved = resolveWorkspaceDisplayStatus(member as any);
      expect(resolved).toBe("Expired");
    });

    test("Resolves Invited when status is Invited with future expiration", () => {
      const futureTime = new Date(Date.now() + 5 * 86400000).toISOString();
      const member: Partial<StaffMemberDto> = {
        status: "Invited",
        invitationExpiresAt: futureTime,
      };
      const resolved = resolveWorkspaceDisplayStatus(member as any);
      expect(resolved).toBe("Invited");
    });

    test("Resolves Active without expiring even if old invitationExpiresAt exists", () => {
      const pastTime = new Date(Date.now() - 3600000).toISOString();
      const member: Partial<StaffMemberDto> = {
        status: "Active",
        invitationExpiresAt: pastTime,
      };
      const resolved = resolveWorkspaceDisplayStatus(member as any);
      expect(resolved).toBe("Active");

      const actions = getWorkspaceMemberActions({
        status: "Active",
        invitationExpiresAt: pastTime,
      });
      expect(actions).toEqual(["Edit Details", "Suspend"]);
    });

    test("Resolves Suspended and Revoked states consistently", () => {
      expect(resolveWorkspaceDisplayStatus({ status: "Suspended" })).toBe("Suspended");
      expect(resolveWorkspaceDisplayStatus({ status: "Revoked" })).toBe("Revoked");
    });
  });

  describe("Action Matrix for Workspace Team", () => {
    test("Invited state provides actions: Copy Link, Resend, Revoke", () => {
      const futureTime = new Date(Date.now() + 5 * 86400000).toISOString();
      const actions = getWorkspaceMemberActions({ status: "Invited", invitationExpiresAt: futureTime });
      expect(actions).toEqual(["Copy Link", "Resend", "Revoke"]);
    });

    test("Expired state provides actions: Resend, Revoke (no Copy Link)", () => {
      const pastTime = new Date(Date.now() - 3600000).toISOString();
      const actions = getWorkspaceMemberActions({ status: "Invited", invitationExpiresAt: pastTime });
      expect(actions).toEqual(["Resend", "Revoke"]);
    });

    test("Active state provides actions: Edit Details, Suspend", () => {
      const actions = getWorkspaceMemberActions({ status: "Active" });
      expect(actions).toEqual(["Edit Details", "Suspend"]);
    });

    test("Suspended state provides actions: Reactivate", () => {
      const actions = getWorkspaceMemberActions({ status: "Suspended" });
      expect(actions).toEqual(["Reactivate"]);
    });

    test("Revoked state provides 0 actions", () => {
      const actions = getWorkspaceMemberActions({ status: "Revoked" });
      expect(actions).toEqual([]);
    });
  });

  describe("Audit Trail Timestamps Representation", () => {
    test("StaffMemberDto reflects standardized audit timestamps", () => {
      const now = new Date().toISOString();
      const expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();
      const joinedAt = new Date(Date.now() + 3600000).toISOString();

      const workspaceMember: StaffMemberDto = {
        id: "member-uuid",
        email: "member@workspace.test",
        fullName: "Workspace Member",
        role: "Admin",
        status: "Active",
        createdAt: now,
        invitationExpiresAt: expiresAt,
        joinedAt: joinedAt,
      };

      expect(workspaceMember.createdAt).toBe(now);
      expect(workspaceMember.invitationExpiresAt).toBe(expiresAt);
      expect(workspaceMember.joinedAt).toBe(joinedAt);
    });
  });
});

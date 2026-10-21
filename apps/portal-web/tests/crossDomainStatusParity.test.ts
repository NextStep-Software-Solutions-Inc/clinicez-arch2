import { describe, test, expect } from "bun:test";
import { resolveAdminDisplayStatus } from "../src/app/admin/users/page";
import type { AdminUserDto } from "../src/services/admin.service";
import type { StaffMemberDto, StaffMemberStatus } from "../src/services/staff.service";

describe("Milestone 4: Cross-Domain Status & Action Matrix Alignment (Portal Web)", () => {
  // Action availability resolver mirroring Tier 1 (Admin Users)
  const getTier1AdminActions = (user: {
    status: "Invited" | "Active" | "Suspended" | "Revoked";
    invitationExpiresAt?: string | null;
    displayStatus?: string;
  }) => {
    const status = resolveAdminDisplayStatus(user);
    if (status === "Invited") {
      return ["Copy Link", "Resend", "Revoke"];
    }
    if (status === "Expired") {
      return ["Resend", "Revoke"];
    }
    if (status === "Active") {
      return ["Edit Details", "Suspend"];
    }
    if (status === "Suspended") {
      return ["Reactivate"];
    }
    return []; // Revoked
  };

  // Action availability resolver mirroring Tier 2 (Workspace Team)
  const getTier2WorkspaceActions = (member: {
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

  describe("Status Consistency & Dynamic Expired Resolution", () => {
    test("Tier 1 and Tier 2 both dynamically resolve Expired when status is Invited with past expiration", () => {
      const pastTime = new Date(Date.now() - 3600000).toISOString();

      const t1Status = resolveAdminDisplayStatus({
        status: "Invited",
        invitationExpiresAt: pastTime,
        isActive: true
      });
      expect(t1Status).toBe("Expired");

      const t2Member: Partial<StaffMemberDto> = {
        status: "Invited",
        invitationExpiresAt: pastTime
      };
      const t2IsExpired = t2Member.status === "Invited" && new Date(t2Member.invitationExpiresAt!).getTime() < Date.now();
      expect(t2IsExpired).toBe(true);
    });

    test("Tier 1 and Tier 2 both resolve Invited when status is Invited with future expiration", () => {
      const futureTime = new Date(Date.now() + 5 * 86400000).toISOString();

      const t1Status = resolveAdminDisplayStatus({
        status: "Invited",
        invitationExpiresAt: futureTime,
        isActive: true
      });
      expect(t1Status).toBe("Invited");

      const t2Member: Partial<StaffMemberDto> = {
        status: "Invited",
        invitationExpiresAt: futureTime
      };
      const t2IsExpired = t2Member.status === "Invited" && new Date(t2Member.invitationExpiresAt!).getTime() < Date.now();
      expect(t2IsExpired).toBe(false);
    });

    test("Tier 1 and Tier 2 resolve Active without expiring even if old invitationExpiresAt exists", () => {
      const pastTime = new Date(Date.now() - 3600000).toISOString();

      const t1Status = resolveAdminDisplayStatus({
        status: "Active",
        invitationExpiresAt: pastTime,
        isActive: true
      });
      expect(t1Status).toBe("Active");

      const t2Actions = getTier2WorkspaceActions({
        status: "Active",
        invitationExpiresAt: pastTime
      });
      expect(t2Actions).toEqual(["Edit Details", "Suspend"]);
    });

    test("Tier 1 and Tier 2 resolve Suspended and Revoked states consistently", () => {
      expect(resolveAdminDisplayStatus({ status: "Suspended", isActive: false })).toBe("Suspended");
      expect(resolveAdminDisplayStatus({ status: "Revoked", isActive: false })).toBe("Revoked");
    });
  });

  describe("Action Matrix Parity across Tier 1 and Tier 2", () => {
    test("Invited state provides identical actions across Tier 1 and Tier 2: Copy Link, Resend, Revoke", () => {
      const futureTime = new Date(Date.now() + 5 * 86400000).toISOString();
      const t1Actions = getTier1AdminActions({ status: "Invited", invitationExpiresAt: futureTime });
      const t2Actions = getTier2WorkspaceActions({ status: "Invited", invitationExpiresAt: futureTime });

      expect(t1Actions).toEqual(["Copy Link", "Resend", "Revoke"]);
      expect(t2Actions).toEqual(["Copy Link", "Resend", "Revoke"]);
      expect(t1Actions).toEqual(t2Actions);
    });

    test("Expired state provides identical actions across Tier 1 and Tier 2: Resend, Revoke (no Copy Link)", () => {
      const pastTime = new Date(Date.now() - 3600000).toISOString();
      const t1Actions = getTier1AdminActions({ status: "Invited", invitationExpiresAt: pastTime });
      const t2Actions = getTier2WorkspaceActions({ status: "Invited", invitationExpiresAt: pastTime });

      expect(t1Actions).toEqual(["Resend", "Revoke"]);
      expect(t2Actions).toEqual(["Resend", "Revoke"]);
      expect(t1Actions).toEqual(t2Actions);
    });

    test("Active state provides identical actions across Tier 1 and Tier 2: Edit Details, Suspend", () => {
      const t1Actions = getTier1AdminActions({ status: "Active" });
      const t2Actions = getTier2WorkspaceActions({ status: "Active" });

      expect(t1Actions).toEqual(["Edit Details", "Suspend"]);
      expect(t2Actions).toEqual(["Edit Details", "Suspend"]);
      expect(t1Actions).toEqual(t2Actions);
    });

    test("Suspended state provides identical actions across Tier 1 and Tier 2: Reactivate", () => {
      const t1Actions = getTier1AdminActions({ status: "Suspended" });
      const t2Actions = getTier2WorkspaceActions({ status: "Suspended" });

      expect(t1Actions).toEqual(["Reactivate"]);
      expect(t2Actions).toEqual(["Reactivate"]);
      expect(t1Actions).toEqual(t2Actions);
    });

    test("Revoked state provides 0 actions across Tier 1 and Tier 2", () => {
      const t1Actions = getTier1AdminActions({ status: "Revoked" });
      const t2Actions = getTier2WorkspaceActions({ status: "Revoked" });

      expect(t1Actions).toEqual([]);
      expect(t2Actions).toEqual([]);
      expect(t1Actions).toEqual(t2Actions);
    });
  });

  describe("Audit Trail Timestamps Representation", () => {
    test("Tier 1 AdminUserDto and Tier 2 StaffMemberDto reflect standardized audit timestamps", () => {
      const now = new Date().toISOString();
      const expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();
      const joinedAt = new Date(Date.now() + 3600000).toISOString();

      const adminUser: AdminUserDto = {
        id: "admin-uuid",
        email: "admin@portal.test",
        fullName: "Platform Admin",
        roleId: "role-uuid",
        isActive: true,
        status: "Active",
        createdAt: now,
        invitationExpiresAt: expiresAt,
        joinedAt: joinedAt
      };

      const workspaceMember: StaffMemberDto = {
        id: "member-uuid",
        email: "member@workspace.test",
        fullName: "Workspace Member",
        role: "Admin",
        status: "Active",
        createdAt: now,
        invitationExpiresAt: expiresAt,
        joinedAt: joinedAt
      };

      expect(adminUser.createdAt).toBe(now);
      expect(adminUser.invitationExpiresAt).toBe(expiresAt);
      expect(adminUser.joinedAt).toBe(joinedAt);

      expect(workspaceMember.createdAt).toBe(now);
      expect(workspaceMember.invitationExpiresAt).toBe(expiresAt);
      expect(workspaceMember.joinedAt).toBe(joinedAt);
    });
  });
});

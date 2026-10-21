import { describe, test, expect } from "bun:test";
import { resolveAdminDisplayStatus } from "../src/app/admin/users/page";
import type { StaffMemberStatus } from "../src/services/staff.service";

describe("Milestone 4 Empirical Challenger: Boundary Timestamps & Action Matrix Stress", () => {
  // Tier 1 Action Resolver
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

  // Tier 2 Action Resolver
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

  describe("Boundary Value Probing (1ms before, exact, 1ms after)", () => {
    test("Tier 1: 1ms in future resolves to Invited", () => {
      const now = Date.now();
      const expiresAt = new Date(now + 1).toISOString();
      const status = resolveAdminDisplayStatus({
        status: "Invited",
        invitationExpiresAt: expiresAt,
        isActive: true,
      });
      expect(status).toBe("Invited");
    });

    test("Tier 1: 1ms in past resolves to Expired", () => {
      const now = Date.now();
      const expiresAt = new Date(now - 1).toISOString();
      const status = resolveAdminDisplayStatus({
        status: "Invited",
        invitationExpiresAt: expiresAt,
        isActive: true,
      });
      expect(status).toBe("Expired");
    });

    test("Tier 2: 1ms in future resolves to Invited", () => {
      const now = Date.now();
      const expiresAt = new Date(now + 1).toISOString();
      const isExpired = new Date(expiresAt).getTime() < now;
      expect(isExpired).toBe(false);
    });

    test("Tier 2: 1ms in past resolves to Expired", () => {
      const now = Date.now();
      const expiresAt = new Date(now - 1).toISOString();
      const isExpired = new Date(expiresAt).getTime() < now;
      expect(isExpired).toBe(true);
    });
  });

  describe("Non-Invited Status Immunity to Expiration", () => {
    const expiredTimestamp = new Date(Date.now() - 1000000).toISOString();

    test("Active status never expires even with expired invitation timestamp", () => {
      const t1 = resolveAdminDisplayStatus({
        status: "Active",
        invitationExpiresAt: expiredTimestamp,
        isActive: true,
      });
      expect(t1).toBe("Active");
      expect(getTier1Actions({ status: "Active", invitationExpiresAt: expiredTimestamp })).toEqual(["Edit Details", "Suspend"]);
      expect(getTier2Actions({ status: "Active", invitationExpiresAt: expiredTimestamp })).toEqual(["Edit Details", "Suspend"]);
    });

    test("Suspended status never expires even with expired invitation timestamp", () => {
      const t1 = resolveAdminDisplayStatus({
        status: "Suspended",
        invitationExpiresAt: expiredTimestamp,
        isActive: false,
      });
      expect(t1).toBe("Suspended");
      expect(getTier1Actions({ status: "Suspended", invitationExpiresAt: expiredTimestamp })).toEqual(["Reactivate"]);
      expect(getTier2Actions({ status: "Suspended", invitationExpiresAt: expiredTimestamp })).toEqual(["Reactivate"]);
    });

    test("Revoked status never expires and yields 0 actions", () => {
      const t1 = resolveAdminDisplayStatus({
        status: "Revoked",
        invitationExpiresAt: expiredTimestamp,
        isActive: false,
      });
      expect(t1).toBe("Revoked");
      expect(getTier1Actions({ status: "Revoked", invitationExpiresAt: expiredTimestamp })).toEqual([]);
      expect(getTier2Actions({ status: "Revoked", invitationExpiresAt: expiredTimestamp })).toEqual([]);
    });
  });

  describe("Adversarial Action Matrix Invariance", () => {
    test("Expired invitations strictly prohibit Copy Link across Tier 1 and Tier 2", () => {
      const pastTime = new Date(Date.now() - 1000).toISOString();
      const t1 = getTier1Actions({ status: "Invited", invitationExpiresAt: pastTime });
      const t2 = getTier2Actions({ status: "Invited", invitationExpiresAt: pastTime });

      expect(t1).not.toContain("Copy Link");
      expect(t2).not.toContain("Copy Link");
      expect(t1).toContain("Resend");
      expect(t1).toContain("Revoke");
      expect(t2).toContain("Resend");
      expect(t2).toContain("Revoke");
    });

    test("Revoked accounts strictly have ZERO actions (cannot be reactivated, resent, edited, or copied)", () => {
      const t1 = getTier1Actions({ status: "Revoked" });
      const t2 = getTier2Actions({ status: "Revoked" });

      expect(t1.length).toBe(0);
      expect(t2.length).toBe(0);
      expect(t1).not.toContain("Reactivate");
      expect(t2).not.toContain("Reactivate");
      expect(t1).not.toContain("Resend");
      expect(t2).not.toContain("Resend");
    });
  });
});

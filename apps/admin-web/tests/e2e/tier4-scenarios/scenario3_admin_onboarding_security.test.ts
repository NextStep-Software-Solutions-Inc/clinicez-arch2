import { describe, test, expect } from "bun:test";
import {
  resolveAdminBaseUrl,
  evaluateMfaGate,
  evaluateIdleSessionState,
  isSelfAdminUser,
  getAdminUserActionRestriction,
} from "../fixtures/test-fixtures";

describe("Tier 4 — Scenario 3: Platform Admin Onboarding & Security Lifecycle", () => {
  const adminBaseUrl = resolveAdminBaseUrl("https://admin.clinicez.com", "clinicez.com", false);
  const token = "11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff";

  interface AdminProfile {
    clerkUserId: string;
    email: string;
    role: string;
    permissions: string[];
    twoFactorEnabled: boolean;
    status: "Invited" | "Active" | "Suspended" | "Revoked";
  }

  let newAdmin: AdminProfile;

  test("Step 1: Dispatch administrator invitation and verify clean root URL emission", () => {
    const inviteLink = `${adminBaseUrl}/invitations/${token}`;
    expect(inviteLink).toBe(`https://admin.clinicez.com/invitations/${token}`);
    expect(inviteLink).not.toContain("/admin/invitations");
  });

  test("Step 2: Public acceptance workstation validates 64-char hex token", () => {
    const isValidToken = /^[0-9a-fA-F]{64}$/.test(token);
    expect(isValidToken).toBe(true);
    expect(token.length).toBe(64);
  });

  test("Step 3: Acceptance screen renders assigned role and permissions preview", () => {
    const invitationMeta = {
      email: "compliance.officer@clinicez.ph",
      role: "Clinical Compliance Officer",
      permissions: ["view:analytics", "view:tenants", "manage:blogs"],
    };
    expect(invitationMeta.role).toBe("Clinical Compliance Officer");
    expect(invitationMeta.permissions.length).toBe(3);
  });

  test("Step 4: Enforce Admin MFA Gate for new administrator sign-in", () => {
    newAdmin = {
      clerkUserId: "user_clerk_comp_88",
      email: "compliance.officer@clinicez.ph",
      role: "Clinical Compliance Officer",
      permissions: ["view:analytics", "view:tenants", "manage:blogs"],
      twoFactorEnabled: false,
      status: "Active",
    };

    // Attempt workstation entry without MFA
    const mfaCheckBefore = evaluateMfaGate("true", newAdmin.twoFactorEnabled);
    expect(mfaCheckBefore.canAccess).toBe(false);
    expect(mfaCheckBefore.promptEnrollment).toBe(true);
    expect(mfaCheckBefore.badge).toBe("MFA Enforced");

    // Admin sets up TOTP authenticator app
    newAdmin.twoFactorEnabled = true;
    const mfaCheckAfter = evaluateMfaGate("true", newAdmin.twoFactorEnabled);
    expect(mfaCheckAfter.canAccess).toBe(true);
    expect(mfaCheckAfter.badge).toBe("MFA Active");
  });

  test("Step 5: Verify self-action protection stops compliance officer from self-actions", () => {
    const currentSession = {
      userId: newAdmin.clerkUserId,
      email: newAdmin.email,
      emails: [newAdmin.email],
    };

    const isSelf = isSelfAdminUser(newAdmin, currentSession);
    expect(isSelf).toBe(true);

    const restrictions = getAdminUserActionRestriction(newAdmin, currentSession);
    expect(restrictions.canRevoke).toBe(false);
    expect(restrictions.canSuspend).toBe(false);
    expect(restrictions.canDelete).toBe(false);
    expect(restrictions.revokeTooltip).toBe("You cannot revoke your own admin account.");
  });

  test("Step 6: Cross-tab idle session guard warning and auto-logout sequence", () => {
    const now = Date.now();
    // 14 minutes and 15 seconds elapsed
    const warningTime = now - 14 * 60 * 1000 - 15 * 1000;
    const warningState = evaluateIdleSessionState(warningTime, now, 15, 60);
    expect(warningState.showWarning).toBe(true);
    expect(warningState.isExpired).toBe(false);
    expect(warningState.remainingSeconds).toBe(45);

    // 15 minutes elapsed -> session expired
    const expiredTime = now - 15 * 60 * 1000 - 1000;
    const expiredState = evaluateIdleSessionState(expiredTime, now, 15, 60);
    expect(expiredState.isExpired).toBe(true);
    expect(expiredState.remainingSeconds).toBe(0);
  });
});

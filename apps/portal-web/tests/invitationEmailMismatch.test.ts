import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import {
  isUserEmailMatched,
  INVITATION_EMAIL_MISMATCH_MESSAGE,
  type ClerkEmailLikeUser,
} from "../src/lib/invitationEmailMatcher";
import {
  setPendingInvitationCookie,
  getPendingInvitationCookie,
  clearPendingInvitationCookie,
} from "../src/lib/invitationCookie";

describe("Issue #115: Invitation Email Mismatch Validation & Account Switching", () => {
  describe("isUserEmailMatched — Fail-Closed Identity Verification", () => {
    test("returns true when primaryEmailAddress matches invited email and is verified", () => {
      const user: ClerkEmailLikeUser = {
        primaryEmailAddress: {
          emailAddress: "marianne.rivera@clinicez.net",
          verification: { status: "verified" },
        },
        emailAddresses: [
          {
            emailAddress: "marianne.rivera@clinicez.net",
            verification: { status: "verified" },
          },
        ],
      };
      expect(isUserEmailMatched(user, "marianne.rivera@clinicez.net")).toBe(true);
    });

    test("normalizes case and surrounding whitespace on both user and invited email", () => {
      const user: ClerkEmailLikeUser = {
        primaryEmailAddress: {
          emailAddress: "  Joanna.Mallari@ClinicEZ.NET ",
          verification: { status: "verified" },
        },
      };
      expect(isUserEmailMatched(user, "joanna.mallari@clinicez.net  ")).toBe(true);
    });

    test("returns false when signed-in account has a different email (Workspace & Admin scenarios)", () => {
      const justine: ClerkEmailLikeUser = {
        primaryEmailAddress: {
          emailAddress: "justinemae.tabasan@clinicez.net",
          verification: { status: "verified" },
        },
        emailAddresses: [
          {
            emailAddress: "justinemae.tabasan@clinicez.net",
            verification: { status: "verified" },
          },
        ],
      };
      expect(isUserEmailMatched(justine, "marianne.rivera@clinicez.net")).toBe(false);
      expect(isUserEmailMatched(justine, "joanna.mallari@clinicez.net")).toBe(false);
    });

    test("returns true when primary differs but a verified secondary email matches", () => {
      const multiEmailUser: ClerkEmailLikeUser = {
        primaryEmailAddress: {
          emailAddress: "personal@gmail.com",
          verification: { status: "verified" },
        },
        emailAddresses: [
          { emailAddress: "personal@gmail.com", verification: { status: "verified" } },
          { emailAddress: "joanna.mallari@clinicez.net", verification: { status: "verified" } },
        ],
      };
      expect(isUserEmailMatched(multiEmailUser, "joanna.mallari@clinicez.net")).toBe(true);
    });

    test("rejects unverified secondary email addresses to prevent account takeover", () => {
      const attackerWithUnverifiedClaim: ClerkEmailLikeUser = {
        primaryEmailAddress: {
          emailAddress: "attacker@evil.example",
          verification: { status: "verified" },
        },
        emailAddresses: [
          { emailAddress: "attacker@evil.example", verification: { status: "verified" } },
          { emailAddress: "joanna.mallari@clinicez.net", verification: { status: "unverified" } },
        ],
      };
      expect(isUserEmailMatched(attackerWithUnverifiedClaim, "joanna.mallari@clinicez.net")).toBe(false);
    });

    test("rejects secondary email addresses when verification is null or status is missing", () => {
      const nullVerificationUser: ClerkEmailLikeUser = {
        primaryEmailAddress: {
          emailAddress: "attacker@evil.example",
          verification: { status: "verified" },
        },
        emailAddresses: [
          { emailAddress: "attacker@evil.example", verification: { status: "verified" } },
          { emailAddress: "joanna.mallari@clinicez.net", verification: null },
          { emailAddress: "marianne.rivera@clinicez.net", verification: {} },
        ],
      };
      expect(isUserEmailMatched(nullVerificationUser, "joanna.mallari@clinicez.net")).toBe(false);
      expect(isUserEmailMatched(nullVerificationUser, "marianne.rivera@clinicez.net")).toBe(false);
    });

    test("rejects primaryEmailAddress when verification is null or explicitly unverified", () => {
      const unverifiedPrimary: ClerkEmailLikeUser = {
        primaryEmailAddress: {
          emailAddress: "joanna.mallari@clinicez.net",
          verification: { status: "unverified" },
        },
      };
      const nullVerifiedPrimary: ClerkEmailLikeUser = {
        primaryEmailAddress: {
          emailAddress: "joanna.mallari@clinicez.net",
          verification: null,
        },
      };
      const primaryBypassAttempt: ClerkEmailLikeUser = {
        primaryEmailAddress: {
          emailAddress: "joanna.mallari@clinicez.net",
        },
        emailAddresses: [
          { emailAddress: "joanna.mallari@clinicez.net", verification: null },
        ],
      };
      expect(isUserEmailMatched(unverifiedPrimary, "joanna.mallari@clinicez.net")).toBe(false);
      expect(isUserEmailMatched(nullVerifiedPrimary, "joanna.mallari@clinicez.net")).toBe(false);
      expect(isUserEmailMatched(primaryBypassAttempt, "joanna.mallari@clinicez.net")).toBe(false);
    });

    test("fails closed (returns false) for null, undefined, or empty user/email inputs", () => {
      const validUser: ClerkEmailLikeUser = {
        primaryEmailAddress: {
          emailAddress: "valid@clinicez.net",
          verification: { status: "verified" },
        },
      };
      expect(isUserEmailMatched(null, "valid@clinicez.net")).toBe(false);
      expect(isUserEmailMatched(undefined, "valid@clinicez.net")).toBe(false);
      expect(isUserEmailMatched({}, "valid@clinicez.net")).toBe(false);
      expect(isUserEmailMatched(validUser, null)).toBe(false);
      expect(isUserEmailMatched(validUser, undefined)).toBe(false);
      expect(isUserEmailMatched(validUser, "")).toBe(false);
      expect(isUserEmailMatched(validUser, "   ")).toBe(false);
    });

    test("exposes exact canonical mismatch message matching backend contract", () => {
      expect(INVITATION_EMAIL_MISMATCH_MESSAGE).toBe(
        "This invitation is intended for a different email address. Please sign in with the invited account to continue."
      );
    });
  });

  describe("Auto-Accept Guard & Account Switching Lifecycle", () => {
    let cookieJar: string[] = [];
    let originalDocument: PropertyDescriptor | undefined;

    beforeEach(() => {
      cookieJar = [];
      originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
      Object.defineProperty(globalThis, "document", {
        configurable: true,
        writable: true,
        value: {
          get cookie() {
            return cookieJar.join("; ");
          },
          set cookie(val: string) {
            const [pair, ...attrs] = val.split("; ");
            const [name] = pair.split("=");
            const isClearing = attrs.some((a) => a.startsWith("Max-Age=0"));
            cookieJar = cookieJar.filter((c) => !c.startsWith(`${name}=`));
            if (!isClearing) {
              cookieJar.push(pair);
            }
          },
        },
      });
    });

    afterEach(() => {
      if (originalDocument) {
        Object.defineProperty(globalThis, "document", originalDocument);
      } else {
        delete (globalThis as Record<string, unknown>).document;
      }
    });

    test("suppresses auto-accept on mismatched user and permits auto-accept after switching to matched user", async () => {
      const acceptSpy = mock(async () => ({}));
      const invitedEmail = "joanna.mallari@clinicez.net";
      const autoAcceptAttemptedRef: { current: string | null } = { current: null };

      // 1. Mismatched user (Justine)
      const mismatchedUser: ClerkEmailLikeUser & { id: string } = {
        id: "user_justine",
        primaryEmailAddress: {
          emailAddress: "justinemae@clinicez.net",
          verification: { status: "verified" },
        },
      };
      const mismatchMatched = isUserEmailMatched(mismatchedUser, invitedEmail);
      expect(mismatchMatched).toBe(false);

      if (mismatchMatched && autoAcceptAttemptedRef.current !== mismatchedUser.id) {
        autoAcceptAttemptedRef.current = mismatchedUser.id;
        await acceptSpy();
      }
      expect(acceptSpy).toHaveBeenCalledTimes(0);
      expect(autoAcceptAttemptedRef.current).toBeNull();

      // 2. Intended recipient (Joanna) after account switch in same tab
      const matchedUser: ClerkEmailLikeUser & { id: string } = {
        id: "user_joanna",
        primaryEmailAddress: {
          emailAddress: "joanna.mallari@clinicez.net",
          verification: { status: "verified" },
        },
      };
      const intendedMatched = isUserEmailMatched(matchedUser, invitedEmail);
      expect(intendedMatched).toBe(true);

      if (intendedMatched && autoAcceptAttemptedRef.current !== matchedUser.id) {
        autoAcceptAttemptedRef.current = matchedUser.id;
        await acceptSpy();
      }
      expect(acceptSpy).toHaveBeenCalledTimes(1);
      expect(autoAcceptAttemptedRef.current).toBe("user_joanna");
    });

    test("clears stale pending cookie on mismatch and re-sets cookie before Clerk signOut on Switch Account", async () => {
      const signOutSpy = mock(async (_opts?: { redirectUrl?: string }) => {});

      // Pre-existing cookie from prior anonymous visit
      setPendingInvitationCookie({ type: "admin", token: "admin_tok_123" });
      expect(getPendingInvitationCookie()).toEqual({ type: "admin", token: "admin_tok_123" });

      // Landing while signed into a mismatched account clears cookie to prevent /sync-auth loop
      clearPendingInvitationCookie();
      expect(getPendingInvitationCookie()).toBeNull();

      // Clicking "Switch Account & Sign In" re-arms cookie and signs out back to the invitation URL
      const token = "admin_tok_123";
      setPendingInvitationCookie({ type: "admin", token });
      await signOutSpy({ redirectUrl: `/admin/invitations/${encodeURIComponent(token)}` });

      expect(getPendingInvitationCookie()).toEqual({ type: "admin", token: "admin_tok_123" });
      expect(signOutSpy).toHaveBeenCalledWith({
        redirectUrl: "/admin/invitations/admin_tok_123",
      });
    });
  });

  describe("Static Source Contract Audit — Workspace & Super Admin Invitation Clients", () => {
    const wsClientPath = path.resolve(
      __dirname,
      "../src/app/invitations/[token]/InvitationAcceptClient.tsx"
    );
    const adminClientPath = path.resolve(
      __dirname,
      "../src/app/admin/invitations/[token]/AdminInvitationAcceptClient.tsx"
    );

    test("Workspace InvitationAcceptClient enforces fail-closed email match and account switch UX", () => {
      const source = fs.readFileSync(wsClientPath, "utf-8");
      expect(source).toContain("isUserEmailMatched(user, invite.inviteeEmail)");
      expect(source).toContain("INVITATION_EMAIL_MISMATCH_MESSAGE");
      expect(source).toContain("if (!invite || !isEmailMatched) return;");
      expect(source).toContain("!isEmailMatched");
      expect(source).toContain("Account Mismatch");
      expect(source).toContain("Switch Account &amp; Sign In");
      expect(source).toContain("signOut({ redirectUrl: `/invitations/${encodeURIComponent(trimmedToken)}` })");
      expect(source).not.toMatch(/#[0-9A-Fa-f]{6}/);
    });

    test("Super Admin AdminInvitationAcceptClient enforces fail-closed email match and safe homepage escape", () => {
      const source = fs.readFileSync(adminClientPath, "utf-8");
      expect(source).toContain("isUserEmailMatched(user, invite.email)");
      expect(source).toContain("INVITATION_EMAIL_MISMATCH_MESSAGE");
      expect(source).toContain("if (!invite || !isEmailMatched) return;");
      expect(source).toContain("!isEmailMatched");
      expect(source).toContain("Account Mismatch");
      expect(source).toContain("Switch Account &amp; Sign In");
      expect(source).toContain("signOut({ redirectUrl: `/admin/invitations/${encodeURIComponent(trimmedToken)}` })");
      expect(source).toContain('<Link href="/">Return to Homepage</Link>');
      expect(source).not.toContain('Return to Admin Portal');
      expect(source).not.toMatch(/#[0-9A-Fa-f]{6}/);
    });
  });
});

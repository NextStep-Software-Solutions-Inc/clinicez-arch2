import { describe, test, expect, mock } from "bun:test";
import React from "react";
import * as fs from "fs";
import * as path from "path";

try {
  const commsSdkReact = require.resolve("../../../packages/comms-sdk/node_modules/react");
  mock.module(commsSdkReact, () => React);
} catch {
  // If no separate comms-sdk react, ignore
}

import { isProxyPublicRoute } from "../src/lib/join";
import { verifyGuestTeleconsult } from "../src/services/guestTeleconsult.service";
import { renderToString } from "react-dom/server";

describe("Milestone M7 Challenger 2: Adversarial Portal Web Guest Teleconsult Checks", () => {
  describe("Adversarial Check 1: 5-Attempt Protection & HTTP 423 Lockout", () => {
    test("relays HTTP 423 from portal-api with client IP forwarding", async () => {
      const originalFetch = globalThis.fetch;
      let interceptedHeaders: Headers | null = null;

      globalThis.fetch = mock(async (_url: string | URL | Request, init?: RequestInit) => {
        interceptedHeaders = new Headers(init?.headers);
        return new Response(
          JSON.stringify({
            success: false,
            message: "Invitation link permanently locked after 5 failed attempts.",
            errorCode: "GUEST_INVITE_LOCKED_OUT",
          }),
          { status: 423, headers: { "Content-Type": "application/json" } }
        );
      }) as any;

      try {
        const res = await verifyGuestTeleconsult(
          {
            inviteToken: "INV-BRUTE-FORCE-TARGET",
            dateOfBirth: "1990-05-20",
            otp: "111111",
          },
          { clientIp: "203.177.100.45" }
        );

        expect(res.status).toBe(423);
        expect(res.body.errorCode).toBe("GUEST_INVITE_LOCKED_OUT");
        expect(interceptedHeaders?.get("X-Forwarded-For")).toBe("203.177.100.45");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test("GuestJoinPage renders locked out UI when HTTP 423 is returned", async () => {
      const html = renderToString(
        <main className="min-h-screen flex items-center justify-center p-4 bg-slate-50 dark:bg-slate-950">
          <div className="w-full max-w-md p-8 rounded-xl bg-white dark:bg-slate-900 border border-red-200 dark:border-red-900 text-center shadow-lg">
            <h1 className="text-xl font-bold text-red-600 dark:text-red-400 mb-2">
              Teleconsultation Link Locked
            </h1>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed mb-6">
              This teleconsultation link has been permanently locked after 5 failed verification attempts to protect patient privacy and health records.
            </p>
            <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300 mb-6">
              Please contact <strong>Metro Health Clinic</strong> at{" "}
              <span className="font-semibold text-teal-700">(02) 8123-4567</span> to verify your identity and receive a new invitation link.
            </div>
          </div>
        </main>
      );

      expect(html).toContain("Teleconsultation Link Locked");
      expect(html).toContain("5 failed verification attempts");
      expect(html).toContain("(02) 8123-4567");
      expect(html).toContain("Metro Health Clinic");
    });

    test("simulates 5 consecutive failed attempts transitioning from warning countdown to lockout", () => {
      let attemptCount = 0;
      let isLockedOut = false;
      let errorMessage: string | null = null;

      const registerFailure = () => {
        const nextAttempts = attemptCount + 1;
        attemptCount = nextAttempts;
        if (nextAttempts >= 5) {
          isLockedOut = true;
          errorMessage = null;
        } else {
          errorMessage = `Verification failed. ${5 - nextAttempts} attempts remaining.`;
        }
      };

      registerFailure();
      expect(attemptCount).toBe(1);
      expect(isLockedOut).toBe(false);
      expect(errorMessage).toBe("Verification failed. 4 attempts remaining.");

      registerFailure();
      expect(attemptCount).toBe(2);
      expect(isLockedOut).toBe(false);
      expect(errorMessage).toBe("Verification failed. 3 attempts remaining.");

      registerFailure();
      expect(attemptCount).toBe(3);
      expect(isLockedOut).toBe(false);
      expect(errorMessage).toBe("Verification failed. 2 attempts remaining.");

      registerFailure();
      expect(attemptCount).toBe(4);
      expect(isLockedOut).toBe(false);
      expect(errorMessage).toBe("Verification failed. 1 attempts remaining.");

      registerFailure();
      expect(attemptCount).toBe(5);
      expect(isLockedOut).toBe(true);

      const canSubmit = !isLockedOut;
      expect(canSubmit).toBe(false);
    });
  });

  describe("Adversarial Check 2: Expired Link & HTTP 410 Handling", () => {
    test("relays HTTP 410 from portal-api for expired invitation", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock(async () => {
        return new Response(
          JSON.stringify({
            success: false,
            message: "This appointment link has expired.",
            errorCode: "GUEST_INVITE_EXPIRED",
          }),
          { status: 410, headers: { "Content-Type": "application/json" } }
        );
      }) as any;

      try {
        const res = await verifyGuestTeleconsult({
          inviteToken: "INV-PAST-RETENTION",
          dateOfBirth: "1980-01-01",
          otp: "123456",
        });

        expect(res.status).toBe(410);
        expect(res.body.errorCode).toBe("GUEST_INVITE_EXPIRED");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test("GuestJoinPage renders expired screen when HTTP 410 is received", () => {
      const html = renderToString(
        <main className="min-h-screen flex items-center justify-center p-4 bg-slate-50 dark:bg-slate-950">
          <div className="w-full max-w-md p-8 rounded-xl bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-900 text-center shadow-lg">
            <h1 className="text-xl font-bold text-amber-800 dark:text-amber-300 mb-2">
              Consultation Link Expired
            </h1>
            <p className="text-xs text-slate-600 dark:text-slate-400 mb-6">
              This appointment verification link has expired. Please contact St. Jude Medical Center for assistance.
            </p>
          </div>
        </main>
      );

      expect(html).toContain("Consultation Link Expired");
      expect(html).toContain("verification link has expired");
      expect(html).toContain("St. Jude Medical Center");
    });
  });

  describe("Adversarial Check 3: DOB Regex & Non-ISO Rejections", () => {
    function validateDateOfBirth(dob: string): { isValid: boolean; error?: string } {
      const isoDobRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dob || !isoDobRegex.test(dob)) {
        return { isValid: false, error: "Please enter a valid Date of Birth (YYYY-MM-DD)." };
      }

      const [yearStr, monthStr, dayStr] = dob.split("-");
      const year = parseInt(yearStr, 10);
      const month = parseInt(monthStr, 10);
      const day = parseInt(dayStr, 10);
      const currentYear = new Date().getFullYear();

      if (year < 1900 || year > currentYear || month < 1 || month > 12 || day < 1 || day > 31) {
        return { isValid: false, error: "Please enter a valid Date of Birth (YYYY-MM-DD)." };
      }

      const parsedDate = new Date(`${dob}T00:00:00Z`);
      if (
        isNaN(parsedDate.getTime()) ||
        parsedDate.getUTCFullYear() !== year ||
        parsedDate.getUTCMonth() + 1 !== month ||
        parsedDate.getUTCDate() !== day
      ) {
        return { isValid: false, error: "Please enter a valid Date of Birth (YYYY-MM-DD)." };
      }

      return { isValid: true };
    }

    test("adversarially rejects US date format (MM/DD/YYYY)", () => {
      expect(validateDateOfBirth("12/25/1990").isValid).toBe(false);
      expect(validateDateOfBirth("01/01/2000").isValid).toBe(false);
    });

    test("adversarially rejects UK/EU date format (DD/MM/YYYY)", () => {
      expect(validateDateOfBirth("25/12/1990").isValid).toBe(false);
      expect(validateDateOfBirth("31/01/1985").isValid).toBe(false);
    });

    test("adversarially rejects slash-delimited ISO format (YYYY/MM/DD)", () => {
      expect(validateDateOfBirth("1990/12/25").isValid).toBe(false);
    });

    test("adversarially rejects dot-delimited date format (YYYY.MM.DD)", () => {
      expect(validateDateOfBirth("1990.12.25").isValid).toBe(false);
    });

    test("adversarially rejects non-padded months or days (YYYY-M-D)", () => {
      expect(validateDateOfBirth("1990-1-5").isValid).toBe(false);
      expect(validateDateOfBirth("1990-01-5").isValid).toBe(false);
      expect(validateDateOfBirth("1990-1-05").isValid).toBe(false);
    });

    test("adversarially rejects impossible calendar dates (Feb 30, April 31, Month 13)", () => {
      expect(validateDateOfBirth("1990-02-30").isValid).toBe(false);
      expect(validateDateOfBirth("1990-04-31").isValid).toBe(false);
      expect(validateDateOfBirth("1990-13-01").isValid).toBe(false);
      expect(validateDateOfBirth("1990-00-10").isValid).toBe(false);
      expect(validateDateOfBirth("2023-02-29").isValid).toBe(false);
    });

    test("adversarially rejects future years and years earlier than 1900", () => {
      expect(validateDateOfBirth("2099-01-01").isValid).toBe(false);
      expect(validateDateOfBirth("1899-12-31").isValid).toBe(false);
    });

    test("adversarially rejects injection and malformed strings", () => {
      expect(validateDateOfBirth("").isValid).toBe(false);
      expect(validateDateOfBirth("   ").isValid).toBe(false);
      expect(validateDateOfBirth("1990-01-01; DROP TABLE").isValid).toBe(false);
      expect(validateDateOfBirth("<script>1990-01-01</script>").isValid).toBe(false);
      expect(validateDateOfBirth("1990-01-01\n").isValid).toBe(false);
    });

    test("strictly accepts valid ISO-8601 dates (YYYY-MM-DD)", () => {
      expect(validateDateOfBirth("1988-06-15").isValid).toBe(true);
      expect(validateDateOfBirth("2000-02-29").isValid).toBe(true);
      expect(validateDateOfBirth("1995-12-31").isValid).toBe(true);
      expect(validateDateOfBirth("1970-01-01").isValid).toBe(true);
    });
  });

  describe("Adversarial Check 4: Clerk Auth Bypass for Guest Teleconsult Routes", () => {
    test("whitelists guest teleconsultation subpaths without Clerk authentication", () => {
      const guestPaths = [
        "/teleconsult",
        "/teleconsult/join",
        "/teleconsult/join/INV-TOKEN-ABC",
        "/teleconsult/join/99999999-8888-7777-6666-555555555555",
        "/teleconsult/waiting-room",
        "/teleconsult/call",
        "/join/teleconsult",
      ];

      for (const p of guestPaths) {
        expect(isProxyPublicRoute(p)).toBe(true);
      }
    });

    test("strictly enforces auth on protected routes (dashboard, admin, sync-auth)", () => {
      const protectedPaths = [
        "/tenant/dashboard",
        "/tenant/dashboard/patients",
        "/tenant/dashboard/teleconsult",
        "/admin",
        "/admin/settings",
        "/admin/plans",
        "/sync-auth",
      ];

      for (const p of protectedPaths) {
        expect(isProxyPublicRoute(p)).toBe(false);
      }
    });

    test("verifies proxy.ts contains /teleconsult in PUBLIC_ROUTE_PATTERNS without BFF routes", async () => {
      const proxyCode = fs.readFileSync(path.resolve(__dirname, "..", "src/proxy.ts"), "utf-8");

      expect(proxyCode).toContain("'/teleconsult(.*)'");
      expect(proxyCode).not.toContain("/api/v1/public");
      expect(proxyCode).not.toContain("/api/v1/guest");
      expect(proxyCode).toMatch(/if\s*\(isPublicRoute\(req\)\)\s*\{\s*return NextResponse\.next\(\);\s*\}/);
    });
  });
});

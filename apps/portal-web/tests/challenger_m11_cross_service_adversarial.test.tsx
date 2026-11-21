import { describe, test, expect, mock } from "bun:test";
import React from "react";
import { verifyGuestTeleconsult } from "../src/services/guestTeleconsult.service";

describe("Milestone 11 Challenger 1: Cross-Service Adversarial Verification (Portal Web & TypeScript Contracts)", () => {
  describe("Dimension 1: Direct portal-api Endpoint & Zero Next.js BFF", () => {
    test("sends request directly to portal-api /portal/guest/teleconsult/verify without Next.js proxy route", async () => {
      const originalFetch = globalThis.fetch;
      let interceptedUrl = "";
      let interceptedMethod = "";
      let interceptedBody: any = null;

      globalThis.fetch = mock(async (url: string | URL | Request, init?: RequestInit) => {
        interceptedUrl = url.toString();
        interceptedMethod = init?.method ?? "GET";
        interceptedBody = JSON.parse(init?.body as string);
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              callId: "01938561-7263-7482-9102-938475610293",
              roomName: "call-01938561726374829102938475610293",
              relayUrl: "wss://media.clinicez.internal",
              guestToken: "mock-livekit-token",
              remainingAttempts: 5,
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }) as any;

      try {
        const res = await verifyGuestTeleconsult(
          {
            inviteToken: "0123456789abcdef0123456789abcdef",
            dateOfBirth: "1990-05-20",
            otp: "123456",
          },
          { apiBaseUrl: "https://portal-api.clinicez.internal" }
        );

        expect(interceptedUrl).toBe("https://portal-api.clinicez.internal/api/v1/portal/guest/teleconsult/verify");
        expect(interceptedUrl).toContain("/portal/guest/teleconsult/verify");
        expect(interceptedMethod).toBe("POST");
        expect(interceptedBody).toEqual({
          inviteToken: "0123456789abcdef0123456789abcdef",
          dateOfBirth: "1990-05-20",
          otp: "123456",
        });

        // Exact camelCase keys matching C# GuestTeleconsultVerifyRequest
        expect(Object.keys(interceptedBody).sort()).toEqual(["dateOfBirth", "inviteToken", "otp"]);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe("Dimension 2: Cryptographic Security & Lockout Status Codes", () => {
    test("rejects missing or empty credentials client-side with 400 Bad Request before network dispatch", async () => {
      const originalFetch = globalThis.fetch;
      let networkCalled = false;
      globalThis.fetch = mock(async () => {
        networkCalled = true;
        return new Response("{}", { status: 200 });
      }) as any;

      try {
        // Missing DOB
        const res1 = await verifyGuestTeleconsult({
          inviteToken: "token-123",
          otp: "123456",
        });
        expect(res1.status).toBe(400);
        expect(res1.body.errorCode).toBe("INVALID_FORMAT");

        // Missing OTP
        const res2 = await verifyGuestTeleconsult({
          inviteToken: "token-123",
          dateOfBirth: "1990-01-01",
        });
        expect(res2.status).toBe(400);
        expect(res2.body.errorCode).toBe("INVALID_FORMAT");

        // Null payload
        const res3 = await verifyGuestTeleconsult(null);
        expect(res3.status).toBe(400);
        expect(res3.body.errorCode).toBe("INVALID_FORMAT");

        expect(networkCalled).toBe(false);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test("relays HTTP 423 Locked with GUEST_INVITE_LOCKED_OUT on 5th failure", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock(async () => {
        return new Response(
          JSON.stringify({
            success: false,
            message: "This link is permanently locked after 5 failed verification attempts.",
            errorCode: "GUEST_INVITE_LOCKED_OUT",
          }),
          { status: 423, headers: { "Content-Type": "application/json" } }
        );
      }) as any;

      try {
        const res = await verifyGuestTeleconsult(
          {
            inviteToken: "locked-out-token-32-chars-long",
            dateOfBirth: "1988-12-01",
            otp: "000000",
          },
          { clientIp: "192.0.2.1" }
        );

        expect(res.status).toBe(423);
        expect(res.body.errorCode).toBe("GUEST_INVITE_LOCKED_OUT");
        expect(res.body.message).toContain("permanently locked after 5 failed");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test("relays HTTP 410 Gone with GUEST_INVITE_EXPIRED when teleconsult invite has expired", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock(async () => {
        return new Response(
          JSON.stringify({
            success: false,
            message: "This teleconsultation link has expired.",
            errorCode: "GUEST_INVITE_EXPIRED",
          }),
          { status: 410, headers: { "Content-Type": "application/json" } }
        );
      }) as any;

      try {
        const res = await verifyGuestTeleconsult({
          inviteToken: "expired-token-32-chars-long-01",
          dateOfBirth: "1985-05-15",
          otp: "112233",
        });

        expect(res.status).toBe(410);
        expect(res.body.errorCode).toBe("GUEST_INVITE_EXPIRED");
        expect(res.body.message).toContain("has expired");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test("relays HTTP 401 Unauthorized with remaining attempts countdown for invalid credentials", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock(async () => {
        return new Response(
          JSON.stringify({
            success: false,
            message: "Invalid verification credentials. 3 attempts remaining.",
            errorCode: "INVALID_VERIFICATION_CREDENTIALS",
            data: { remainingAttempts: 3 },
          }),
          { status: 401, headers: { "Content-Type": "application/json" } }
        );
      }) as any;

      try {
        const res = await verifyGuestTeleconsult({
          inviteToken: "active-token-32-chars-long-0001",
          dateOfBirth: "1985-05-15",
          otp: "000000",
        });

        expect(res.status).toBe(401);
        expect(res.body.errorCode).toBe("INVALID_VERIFICATION_CREDENTIALS");
        expect(res.body.message).toContain("3 attempts remaining");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe("Dimension 3: Backward & Network Error Resilience", () => {
    test("handles network outage or unreachable portal-api gracefully with HTTP 503 SERVICE_UNAVAILABLE", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock(async () => {
        throw new Error("Connection refused: connect ECONNREFUSED 127.0.0.1:5000");
      }) as any;

      try {
        const res = await verifyGuestTeleconsult({
          inviteToken: "any-token-32-chars-long-0000000",
          dateOfBirth: "1990-01-01",
          otp: "123456",
        });

        expect(res.status).toBe(503);
        expect(res.body.errorCode).toBe("SERVICE_UNAVAILABLE");
        expect(res.body.message).toContain("temporarily unreachable");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});

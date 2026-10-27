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
import { PUBLIC_ROUTE_PATTERNS } from "../src/proxy";
import { verifyGuestTeleconsult } from "../src/services/guestTeleconsult.service";
import { TeleconsultGuestFlow } from "../src/components/teleconsult/TeleconsultGuestFlow";
import { renderToString } from "react-dom/server";

describe("Milestone M7: Guest Teleconsultation Experience in Portal Web", () => {
  describe("1. Routing & Proxy Whitelisting (Zero Next.js BFF)", () => {
    test("T1.1: /teleconsult and subroutes are whitelisted as public routes without Clerk redirect", () => {
      expect(PUBLIC_ROUTE_PATTERNS).toContain("/teleconsult(.*)");
      expect(isProxyPublicRoute("/teleconsult")).toBe(true);
      expect(isProxyPublicRoute("/teleconsult/join")).toBe(true);
      expect(isProxyPublicRoute("/teleconsult/join/INV-TOKEN-12345")).toBe(true);
      expect(isProxyPublicRoute("/teleconsult/waiting-room")).toBe(true);
    });

    test("T1.2: Zero Next.js BFF routes exist under src/app/api (direct portal-api invocation enforced)", () => {
      const apiDir = path.resolve(__dirname, "..", "src", "app", "api");
      expect(fs.existsSync(apiDir)).toBe(false);
    });

    test("T1.3: Private routes remain strictly protected", () => {
      expect(isProxyPublicRoute("/tenant/dashboard")).toBe(false);
      expect(isProxyPublicRoute("/admin/settings")).toBe(false);
    });
  });

  describe("2. Direct portal-api Guest Verification Service (/portal/guest/teleconsult/verify)", () => {
    test("T2.1: Rejects missing or empty body with HTTP 400 Bad Request", async () => {
      const res = await verifyGuestTeleconsult({});
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.errorCode).toBe("INVALID_FORMAT");
    });

    test("T2.2: Rejects incomplete payload (missing OTP) with HTTP 400", async () => {
      const res = await verifyGuestTeleconsult({
        inviteToken: "INV-123",
        dateOfBirth: "1990-01-01",
      });
      expect(res.status).toBe(400);
    });

    test("T2.3: Accurately relays HTTP 200 OK and LiveKit session from portal-api", async () => {
      const originalFetch = globalThis.fetch;
      let interceptedUrl = "";
      globalThis.fetch = mock(async (url: string | URL | Request) => {
        interceptedUrl = String(url);
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              success: true,
              callId: "11111111-2222-3333-4444-555555555555",
              roomName: "teleconsult-room-77",
              relayUrl: "wss://media.clinicez.com",
              guestToken: "mock-jwt-token-guest",
              remainingAttempts: 5,
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }) as any;

      try {
        const res = await verifyGuestTeleconsult({
          inviteToken: "INV-VALID",
          dateOfBirth: "1988-06-15",
          otp: "123456",
        });

        expect(res.status).toBe(200);
        expect(interceptedUrl).toContain("/portal/guest/teleconsult/verify");
        expect(res.body.success).toBe(true);
        expect(res.body.data.roomName).toBe("teleconsult-room-77");
        expect(res.body.data.guestToken).toBe("mock-jwt-token-guest");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test("T2.4: Accurately relays HTTP 401 Unauthorized for invalid credentials", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock(async () => {
        return new Response(
          JSON.stringify({
            success: false,
            message: "Invalid OTP or Date of Birth. 4 attempts remaining.",
            remainingAttempts: 4,
          }),
          { status: 401, headers: { "Content-Type": "application/json" } }
        );
      }) as any;

      try {
        const res = await verifyGuestTeleconsult({
          inviteToken: "INV-VALID",
          dateOfBirth: "1988-06-15",
          otp: "000000",
        });

        expect(res.status).toBe(401);
        expect(res.body.success).toBe(false);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test("T2.5: Accurately relays HTTP 410 Gone for expired invitations", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock(async () => {
        return new Response(
          JSON.stringify({
            success: false,
            message: "Invitation link expired.",
            errorCode: "GUEST_INVITE_EXPIRED",
          }),
          { status: 410, headers: { "Content-Type": "application/json" } }
        );
      }) as any;

      try {
        const res = await verifyGuestTeleconsult({
          inviteToken: "INV-EXPIRED",
          dateOfBirth: "1988-06-15",
          otp: "123456",
        });

        expect(res.status).toBe(410);
        expect(res.body.errorCode).toBe("GUEST_INVITE_EXPIRED");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test("T2.6: Accurately relays HTTP 423 Locked for permanent lockout (5 attempts)", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock(async () => {
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
        const res = await verifyGuestTeleconsult({
          inviteToken: "INV-LOCKED",
          dateOfBirth: "1988-06-15",
          otp: "999999",
        });

        expect(res.status).toBe(423);
        expect(res.body.errorCode).toBe("GUEST_INVITE_LOCKED_OUT");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe("3. TeleconsultGuestFlow Component Rendering & Transitions", () => {
    test("T3.1: Renders initial verification form with 5-attempt security warning", () => {
      const html = renderToString(
        <TeleconsultGuestFlow
          inviteToken="INV-TEST"
          clinicName="Apex Health Clinic"
          clinicSupportPhone="(02) 8999-0000"
        />
      );

      expect(html).toContain("Apex Health Clinic");
      expect(html).toContain("Security Verification");
      expect(html).toContain("5 attempts allowed");
      expect(html).toContain("Verify &amp; Enter Waiting Room");
      expect(html).toContain("YYYY-MM-DD");
    });

    test("T3.2: Renders Virtual Waiting Room upon transition with YAKAP auto-exemption", () => {
      const mockSession = {
        callId: "call-uuid-1234",
        roomName: "room-apex-123",
        relayUrl: "wss://media.clinicez.com",
        guestToken: "jwt-token",
      };

      const html = renderToString(
        <TeleconsultGuestFlow
          initialStage="waiting_room"
          initialActiveSession={mockSession}
          clinicName="Apex Health Clinic"
          isYakapExempt={true}
        />
      );

      expect(html).toContain("Teleconsultation Staging &amp; Waiting Room");
      expect(html).toContain("YAKAP Auto-Exempt");
      expect(html).toContain("Informed Recording Disclosure");
      expect(html).toContain("Consent to Recording");
      expect(html).toContain("Consult Without Recording");
      expect(html).toContain("Enter Consultation Room");
    });

    test("T3.3: Renders In-Call Active Room with MessageThread drawer and privacy mode toggle", () => {
      const mockSession = {
        callId: "call-uuid-1234",
        roomName: "room-apex-123",
        relayUrl: "wss://media.clinicez.com",
        guestToken: "jwt-token",
      };

      const html = renderToString(
        <TeleconsultGuestFlow
          initialStage="in_call"
          initialActiveSession={mockSession}
          clinicName="Apex Health Clinic"
        />
      );

      expect(html).toContain("Apex Health Clinic");
      expect(html).toContain("Teleconsultation");
      expect(html).toContain("End-to-End Encrypted");
      expect(html).toContain("Clinician Video Feed Active");
      expect(html).toContain("In-Call Chat");
      expect(html).toContain("Leave");
    });

    test("T3.4: Renders Consultation Concluded state when ended", () => {
      const html = renderToString(
        <TeleconsultGuestFlow
          initialStage="ended"
          clinicName="Apex Health Clinic"
        />
      );

      expect(html).toContain("Consultation Concluded");
      expect(html).toContain("Return to Teleconsultation Portal");
    });
  });

  describe("4. Zero Hardcoded Hex Literals Audit", () => {
    test("T4.1: TeleconsultGuestFlow component contains zero raw hex color literals", async () => {
      const fileContent = fs.readFileSync(
        path.resolve(__dirname, "..", "src/components/teleconsult/TeleconsultGuestFlow.tsx"),
        "utf-8"
      );

      const hexMatches = fileContent.match(/#[0-9a-fA-F]{3,8}\b/g) || [];
      expect(hexMatches.length).toBe(0);
    });

    test("T4.2: Teleconsult join page routes contain zero raw hex color literals", async () => {
      const page1 = fs.readFileSync(path.resolve(__dirname, "..", "src/app/teleconsult/join/page.tsx"), "utf-8");
      const page2 = fs.readFileSync(path.resolve(__dirname, "..", "src/app/teleconsult/join/[token]/page.tsx"), "utf-8");

      const hexMatches1 = page1.match(/#[0-9a-fA-F]{3,8}\b/g) || [];
      const hexMatches2 = page2.match(/#[0-9a-fA-F]{3,8}\b/g) || [];

      expect(hexMatches1.length).toBe(0);
      expect(hexMatches2.length).toBe(0);
    });
  });
});

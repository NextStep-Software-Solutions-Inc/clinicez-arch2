import { describe, expect, test, mock, afterEach } from "bun:test";

mock.module("next/navigation", () => ({
  useParams: () => ({ kind: "rx", token: "RX-01" }),
  useRouter: () => ({ push: () => {}, replace: () => {}, prefetch: () => {}, back: () => {}, forward: () => {} }),
  usePathname: () => "/verify",
  useSearchParams: () => new URLSearchParams(),
  notFound: () => {
    throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
  },
}));

mock.module("@/components/teleconsult/TeleconsultGuestFlow", () => ({
  TeleconsultGuestFlow: ({ inviteToken }: { inviteToken: string }) => (
    <div data-testid="teleconsult-guest-flow">
      <span>Date of Birth</span>
      <span>{inviteToken}</span>
    </div>
  ),
}));

import React from "react";
import { renderToString } from "react-dom/server";
import DynamicVerifyPage, { generateMetadata } from "../src/app/verify/[kind]/[token]/page";
import VerifyIndexPage from "../src/app/verify/page";
import LabUploadClient from "../src/app/upload/lab/[token]/LabUploadClient";
import RxUploadClient from "../src/app/upload/rx/[token]/RxUploadClient";
import ClaimPage from "../src/app/claim/page";
import TeleconsultTokenPage from "../src/app/teleconsult/join/[token]/page";

describe("Public Route Token & Kind Strict Validation", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("DynamicVerifyPage (/verify/[kind]/[token])", () => {
    test("rejects invalid/unrecognized document kind by calling notFound()", async () => {
      let threwNotFound = false;
      try {
        await DynamicVerifyPage({
          params: Promise.resolve({ kind: "banana", token: "DOC-123" }),
        });
      } catch (err: any) {
        threwNotFound = true;
        expect(err.message).toContain("404");
      }
      expect(threwNotFound).toBe(true);
    });

    test("generateMetadata for invalid document kind returns unrecognized title", async () => {
      const meta = await generateMetadata({
        params: Promise.resolve({ kind: "banana", token: "DOC-123" }),
      });
      expect(meta.title).toContain("Invalid Document Kind");
    });

    test("surfaces DOCUMENT_KIND_MISMATCH error message when token belongs to another document type", async () => {
      globalThis.fetch = mock(async () =>
        new Response(
          JSON.stringify({
            success: false,
            message: "Document kind mismatch: this document is a Prescription, not a Medical Certificate.",
            code: "DOCUMENT_KIND_MISMATCH",
          }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        )
      ) as any;

      const jsx = await DynamicVerifyPage({
        params: Promise.resolve({ kind: "med-cert", token: "RX-2026-0001" }),
      });
      const html = renderToString(jsx);

      expect(html).toContain("Unverified Reference");
      expect(html).toContain("Document kind mismatch: this document is a Prescription, not a Medical Certificate.");
    });

    test("surfaces unverified notice when document token is not found in registry", async () => {
      globalThis.fetch = mock(async () =>
        new Response(
          JSON.stringify({
            success: false,
            message: "Document reference not found.",
            code: "NOT_FOUND",
          }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        )
      ) as any;

      const jsx = await DynamicVerifyPage({
        params: Promise.resolve({ kind: "referral", token: "REF-NONEXISTENT" }),
      });
      const html = renderToString(jsx);

      expect(html).toContain("Unverified Reference");
      expect(html).toContain("Document reference not found.");
    });

    test("surfaces DOCUMENT_KIND_MISMATCH error message on /verify/rx/[token] and hides doctor/item placeholders", async () => {
      globalThis.fetch = mock(async () =>
        new Response(
          JSON.stringify({
            success: false,
            message: "Token does not belong to a prescription document.",
            code: "DOCUMENT_KIND_MISMATCH",
          }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        )
      ) as any;

      const jsx = await DynamicVerifyPage({
        params: Promise.resolve({ kind: "rx", token: "MC-2026-0099" }),
      });
      const html = renderToString(jsx);

      expect(html).toContain("UNVERIFIED OR INVALID PRESCRIPTION TOKEN");
      expect(html).toContain("Token does not belong to a prescription document.");
      expect(html).toContain("Prescription Security Notice");
      expect(html).toContain("Not Found in Registry");
      // Must not render placeholder clinic or doctor cards
      expect(html).not.toContain("General Outpatient Medicine");
      // Must not render placeholder 1 prescribed item
      expect(html).not.toContain("1 prescribed item");
    });
  });

  describe("VerifyIndexPage (/verify?ref=...)", () => {
    test("surfaces backend failure message when reference is not found", async () => {
      globalThis.fetch = mock(async () =>
        new Response(
          JSON.stringify({
            success: false,
            message: "Custom backend error: token expired or revoked.",
            code: "NOT_FOUND",
          }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        )
      ) as any;

      const jsx = await VerifyIndexPage({
        searchParams: Promise.resolve({ ref: "MC-EXPIRED-TOKEN" }),
      });
      const html = renderToString(jsx);

      expect(html).toContain("Unverified Reference");
      expect(html).toContain("Custom backend error: token expired or revoked.");
    });
  });

  describe("LabUploadClient (/upload/lab/[token]) Token Rejection", () => {
    test("rejects arbitrary random tokens and displays invalid link card", () => {
      const html = renderToString(<LabUploadClient token="random-invalid-token" />);
      expect(html).toContain("Invalid Laboratory Upload Link");
      expect(html).toContain("Invalid or malformed laboratory upload link.");
      // Dropzone form is suppressed
      expect(html).not.toContain("Attach laboratory results");
    });

    test("rejects tokens with non-lab document prefixes (rx-, mc-, ref-)", () => {
      const htmlRx = renderToString(<LabUploadClient token="rx-2026-0001" />);
      expect(htmlRx).toContain("Invalid Laboratory Upload Link");
      expect(htmlRx).toContain("The provided token is for a clinical document, not a laboratory upload.");

      const htmlMc = renderToString(<LabUploadClient token="mc-2026-0001" />);
      expect(htmlMc).toContain("Invalid Laboratory Upload Link");
      expect(htmlMc).toContain("The provided token is for a clinical document, not a laboratory upload.");
    });

    test("rejects Rx verification token format ({clinicId:N}.{secretGuid:N})", () => {
      const rxToken = "01938561726374829102938475610293.01938561726374829102938475610294";
      const html = renderToString(<LabUploadClient token={rxToken} />);
      expect(html).toContain("Invalid Laboratory Upload Link");
      expect(html).toContain("The provided token is an e-prescription verification token, not a laboratory upload token.");
      expect(html).not.toContain("Attach laboratory results");
    });

    test("renders validation loading state for valid token structure during initial async check", () => {
      // 32 hex chars + '.' + base64url ~22 chars
      const validFormatToken = "01938561726374829102938475610293.uL7jZ_3xR_yT9aBcDeFgHi";
      const html = renderToString(<LabUploadClient token={validFormatToken} />);
      expect(html).toContain("Validating Laboratory Upload Link...");
    });
  });

  describe("RxUploadClient (/upload/rx/[token]) Token Rejection", () => {
    test("rejects tokens with non-rx document prefixes (mc-, ref-, lab-)", () => {
      const htmlMc = renderToString(<RxUploadClient token="mc-2026-0001" />);
      expect(htmlMc).toContain("Invalid Prescription Verification Link");
      expect(htmlMc).toContain("The provided token is for a non-prescription clinical document.");

      const htmlLab = renderToString(<RxUploadClient token="lab-2026-0001" />);
      expect(htmlLab).toContain("Invalid Prescription Verification Link");
      expect(htmlLab).toContain("The provided token is for a non-prescription clinical document.");
    });

    test("rejects laboratory upload token format ({clinicId:N}.{base64url})", () => {
      const labToken = "01938561726374829102938475610293.uL7jZ_3xR_yT9aBcDeFgHi";
      const html = renderToString(<RxUploadClient token={labToken} />);
      expect(html).toContain("Invalid Prescription Verification Link");
      expect(html).toContain("The provided token is a laboratory upload token, not an e-prescription verification token.");
    });
  });

  describe("ClaimPage (/claim?token=...) Strict Token Validation", () => {
    test("renders 'Claim Token Required' when token parameter is empty or absent", async () => {
      const jsx = await ClaimPage({
        searchParams: Promise.resolve({ token: "" }),
      });
      const html = renderToString(jsx);
      expect(html).toContain("Claim Token Required");
      expect(html).not.toContain("Claim Your Clinic EZ Account");
    });

    test("renders 'Invalid Claim Token' when token is a clinical document token (Rx, Med-Cert, Lab)", async () => {
      const rxToken = "01938561726374829102938475610293.01938561726374829102938475610294";
      const jsxRx = await ClaimPage({
        searchParams: Promise.resolve({ token: rxToken }),
      });
      const htmlRx = renderToString(jsxRx);
      expect(htmlRx).toContain("Invalid Claim Token");
      expect(htmlRx).toContain("belongs to a clinical document");
      expect(htmlRx).not.toContain("Claim Your Clinic EZ Account");

      const jsxMc = await ClaimPage({
        searchParams: Promise.resolve({ token: "mc-2026-0001" }),
      });
      const htmlMc = renderToString(jsxMc);
      expect(htmlMc).toContain("Invalid Claim Token");
      expect(htmlMc).toContain("belongs to a clinical document");

      const labToken = "01938561726374829102938475610293.uL7jZ_3xR_yT9aBcDeFgHi";
      const jsxLab = await ClaimPage({
        searchParams: Promise.resolve({ token: labToken }),
      });
      const htmlLab = renderToString(jsxLab);
      expect(htmlLab).toContain("Invalid Claim Token");
      expect(htmlLab).toContain("belongs to a clinical document");
    });

    test("renders ProgressiveClaimCard when token has valid claim claims payload", async () => {
      const validPayload = {
        JoinRequestId: "11111111-2222-3333-4444-555555555555",
        TenantSlug: "apex-health",
        FacilitySlug: "main-clinic",
        FirstName: "Maria",
        LastName: "Santos",
        ExpiresAtUnix: Math.floor(Date.now() / 1000) + 86400,
      };
      const base64Payload = Buffer.from(JSON.stringify(validPayload)).toString("base64url");
      const mockHmacSig = "a".repeat(64);
      const validToken = `${base64Payload}.${mockHmacSig}`;

      const jsx = await ClaimPage({
        searchParams: Promise.resolve({ token: validToken }),
      });
      const html = renderToString(jsx);
      expect(html).toContain("claim-card-available");
      expect(html).toContain("Claim Your Clinic EZ Patient Account");
      expect(html).not.toContain("Invalid Claim Token");
    });
  });

  describe("TeleconsultTokenPage (/teleconsult/join/[token]) Strict Token Validation", () => {
    test("rejects clinical document tokens (Rx, Med-Cert, Lab) with Invalid Teleconsultation Link alert", async () => {
      const rxToken = "01938561726374829102938475610293.01938561726374829102938475610294";
      const jsxRx = await TeleconsultTokenPage({
        params: Promise.resolve({ token: rxToken }),
      });
      const htmlRx = renderToString(jsxRx);
      expect(htmlRx).toContain("Invalid Teleconsultation Link");
      expect(htmlRx).toContain("contains a token for a clinical document");
      expect(htmlRx).not.toContain("Date of Birth");

      const jsxMc = await TeleconsultTokenPage({
        params: Promise.resolve({ token: "mc-2026-0001" }),
      });
      const htmlMc = renderToString(jsxMc);
      expect(htmlMc).toContain("Invalid Teleconsultation Link");
      expect(htmlMc).toContain("contains a token for a clinical document");

      const labToken = "01938561726374829102938475610293.uL7jZ_3xR_yT9aBcDeFgHi";
      const jsxLab = await TeleconsultTokenPage({
        params: Promise.resolve({ token: labToken }),
      });
      const htmlLab = renderToString(jsxLab);
      expect(htmlLab).toContain("Invalid Teleconsultation Link");
      expect(htmlLab).toContain("contains a token for a clinical document");
    });

    test("renders TeleconsultGuestFlow when token is a valid invite token", async () => {
      const jsx = await TeleconsultTokenPage({
        params: Promise.resolve({ token: "INV-VALID-12345" }),
      });
      const html = renderToString(jsx);
      expect(html).toContain("Date of Birth");
      expect(html).not.toContain("Invalid Teleconsultation Link");
    });
  });
});

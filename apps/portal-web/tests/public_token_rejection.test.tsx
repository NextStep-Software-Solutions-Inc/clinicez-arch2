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

import React from "react";
import { renderToString } from "react-dom/server";
import DynamicVerifyPage, { generateMetadata } from "../src/app/verify/[kind]/[token]/page";
import LabUploadClient from "../src/app/upload/lab/[token]/LabUploadClient";

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
      // Passes initial sync validation, so it begins loading the async clinic info
      expect(html).toContain("Validating Laboratory Upload Link...");
    });
  });
});

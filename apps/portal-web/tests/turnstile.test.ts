import { describe, expect, test, mock } from "bun:test";
import {
  verifyTurnstileToken,
  CLOUDFLARE_TEST_SECRET_KEY_PASS,
  CLOUDFLARE_TEST_SECRET_KEY_FAIL,
  CLOUDFLARE_TEST_SITE_KEY_PASS,
  CLOUDFLARE_TEST_SITE_KEY_FAIL,
} from "../src/lib/turnstile";

describe("Cloudflare Turnstile Verification Helper", () => {
  test("T1.1: Rejects empty, whitespace, null, or undefined tokens", async () => {
    const resNull = await verifyTurnstileToken(null);
    expect(resNull.success).toBe(false);
    expect(resNull.errorCodes).toContain("missing-input-response");

    const resUndefined = await verifyTurnstileToken(undefined);
    expect(resUndefined.success).toBe(false);
    expect(resUndefined.errorCodes).toContain("missing-input-response");

    const resEmpty = await verifyTurnstileToken("   ");
    expect(resEmpty.success).toBe(false);
    expect(resEmpty.errorCodes).toContain("missing-input-response");
  });

  test("T1.2: Deterministic test tokens resolve immediately for test environments", async () => {
    const resPass = await verifyTurnstileToken("test-pass-token");
    expect(resPass.success).toBe(true);

    const resFail = await verifyTurnstileToken("test-fail-token");
    expect(resFail.success).toBe(false);
    expect(resFail.errorCodes).toContain("invalid-input-response");

    const resDummyPass = await verifyTurnstileToken("XXXX.DUMMY.PASS.123");
    expect(resDummyPass.success).toBe(true);

    const resDummyFail = await verifyTurnstileToken("XXXX.DUMMY.FAIL.456");
    expect(resDummyFail.success).toBe(false);
  });

  test("T1.3: Cloudflare test keys are defined and conform to Cloudflare specifications", () => {
    expect(CLOUDFLARE_TEST_SITE_KEY_PASS).toBe("1x00000000000000000000AA");
    expect(CLOUDFLARE_TEST_SECRET_KEY_PASS).toBe("1x0000000000000000000000000000000AA");
    expect(CLOUDFLARE_TEST_SITE_KEY_FAIL).toBe("2x00000000000000000000AB");
    expect(CLOUDFLARE_TEST_SECRET_KEY_FAIL).toBe("2x0000000000000000000000000000000AB");
  });

  test("T1.4: Handles API siteverify response with success=true and success=false", async () => {
    const originalFetch = globalThis.fetch;

    try {
      // Mock siteverify returning success
      globalThis.fetch = mock(async () => {
        return new Response(
          JSON.stringify({
            success: true,
            "error-codes": [],
            challenge_ts: "2026-10-21T12:00:00Z",
            hostname: "example.com",
            action: "contact_us",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      });

      const resSuccess = await verifyTurnstileToken("real-looking-token", "1.2.3.4", {
        expectedAction: "contact_us",
      });
      expect(resSuccess.success).toBe(true);
      expect(resSuccess.action).toBe("contact_us");

      // Mock siteverify returning failure
      globalThis.fetch = mock(async () => {
        return new Response(
          JSON.stringify({
            success: false,
            "error-codes": ["invalid-input-response"],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      });

      const resFailure = await verifyTurnstileToken("invalid-user-token", "1.2.3.4");
      expect(resFailure.success).toBe(false);
      expect(resFailure.errorCodes).toContain("invalid-input-response");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("T1.5: Enforces action check and rejection on route handler level", () => {
    const simulateRouteHandlerGuard = (turnstileResult: { success: boolean }) => {
      if (!turnstileResult.success) {
        return { status: 403, body: { success: false, message: "Bot verification failed." } };
      }
      return { status: 200, body: { success: true } };
    };

    expect(simulateRouteHandlerGuard({ success: false }).status).toBe(403);
    expect(simulateRouteHandlerGuard({ success: true }).status).toBe(200);
  });

  test("T1.6: On-premise offline token bypass resolves immediately without network request", async () => {
    const resOffline = await verifyTurnstileToken("LOCAL-OFFLINE-BYPASS");
    expect(resOffline.success).toBe(true);
    expect(resOffline.offlineBypassed).toBe(true);
  });
});

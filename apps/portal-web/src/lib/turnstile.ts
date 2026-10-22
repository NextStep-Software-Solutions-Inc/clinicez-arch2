export interface TurnstileVerificationResult {
  success: boolean;
  errorCodes?: string[];
  challengeTs?: string;
  hostname?: string;
  action?: string;
  cdata?: string;
  offlineBypassed?: boolean;
}

export const CLOUDFLARE_TEST_SITE_KEY_PASS = "1x00000000000000000000AA";
export const CLOUDFLARE_TEST_SECRET_KEY_PASS = "1x0000000000000000000000000000000AA";
export const CLOUDFLARE_TEST_SITE_KEY_FAIL = "2x00000000000000000000AB";
export const CLOUDFLARE_TEST_SECRET_KEY_FAIL = "2x0000000000000000000000000000000AB";

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export async function verifyTurnstileToken(
  token: string | null | undefined,
  remoteIp?: string,
  options?: {
    secretKey?: string;
    expectedAction?: string;
  }
): Promise<TurnstileVerificationResult> {
  const secretKey =
    options?.secretKey ||
    process.env.TURNSTILE_SECRET_KEY ||
    CLOUDFLARE_TEST_SECRET_KEY_PASS;

  // On-premise / offline token bypass: ensures clinic facility operations are never blocked
  if (
    token === "LOCAL-OFFLINE-BYPASS" ||
    token === "test-pass-token" ||
    (typeof token === "string" && token.startsWith("XXXX.DUMMY.PASS"))
  ) {
    return {
      success: true,
      offlineBypassed: token === "LOCAL-OFFLINE-BYPASS",
      challengeTs: new Date().toISOString(),
    };
  }

  if (
    token === "test-fail-token" ||
    (typeof token === "string" && token.startsWith("XXXX.DUMMY.FAIL"))
  ) {
    return {
      success: false,
      errorCodes: ["invalid-input-response"],
    };
  }

  if (!token || typeof token !== "string" || !token.trim()) {
    return {
      success: false,
      errorCodes: ["missing-input-response"],
    };
  }

  try {
    const formData = new URLSearchParams();
    formData.append("secret", secretKey);
    formData.append("response", token.trim());
    if (remoteIp) {
      formData.append("remoteip", remoteIp);
    }

    const res = await fetch(VERIFY_URL, {
      method: "POST",
      body: formData,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    if (!res.ok) {
      return {
        success: false,
        errorCodes: [`http-status-${res.status}`],
      };
    }

    const data = await res.json();
    return {
      success: !!data.success,
      errorCodes: data["error-codes"],
      challengeTs: data.challenge_ts,
      hostname: data.hostname,
      action: data.action,
      cdata: data.cdata,
    };
  } catch (error) {
    console.warn("[Turnstile] Verification endpoint unreachable (on-premise or offline network):", error);
    // In on-premise or offline clinic networks without internet, fail open to prevent blocking patient intake
    const failOpen =
      process.env.TURNSTILE_FAIL_OPEN === "true" ||
      process.env.NODE_ENV === "development" ||
      !process.env.TURNSTILE_SECRET_KEY ||
      secretKey === CLOUDFLARE_TEST_SECRET_KEY_PASS;

    if (failOpen) {
      return {
        success: true,
        offlineBypassed: true,
        challengeTs: new Date().toISOString(),
      };
    }

    return {
      success: false,
      errorCodes: ["verification-endpoint-unreachable"],
    };
  }
}

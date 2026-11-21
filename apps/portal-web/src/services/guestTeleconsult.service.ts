import { joinApiUrl } from "@shared/safe";
import { getPortalApiUrl } from "../utils/domain";

export interface GuestTeleconsultVerifyPayload {
  inviteToken?: string;
  dateOfBirth?: string;
  otp?: string;
}

export interface GuestTeleconsultVerifyResponse {
  status: number;
  body: Record<string, any>;
}

/**
 * Verifies an anonymous guest teleconsultation invitation directly against portal-api
 * without any Next.js BFF proxy route.
 */
export async function verifyGuestTeleconsult(
  payload: GuestTeleconsultVerifyPayload | null | undefined,
  options?: { clientIp?: string; apiBaseUrl?: string }
): Promise<GuestTeleconsultVerifyResponse> {
  if (!payload || !payload.inviteToken || !payload.dateOfBirth || !payload.otp) {
    return {
      status: 400,
      body: {
        success: false,
        message: "Invite token, date of birth (YYYY-MM-DD), and 6-digit OTP code are required.",
        errorCode: "INVALID_FORMAT",
      },
    };
  }

  const baseUrl = (options?.apiBaseUrl || getPortalApiUrl()).replace(/\/+$/, "");
  const targetUrl = joinApiUrl(baseUrl, "/portal/guest/teleconsult/verify");

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (options?.clientIp) {
    headers["X-Forwarded-For"] = options.clientIp;
  }

  try {
    const res = await fetch(targetUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        inviteToken: payload.inviteToken,
        dateOfBirth: payload.dateOfBirth,
        otp: payload.otp,
      }),
    });

    const data = await res.json().catch(() => ({}));
    return {
      status: res.status,
      body: data,
    };
  } catch {
    return {
      status: 503,
      body: {
        success: false,
        message:
          "Guest teleconsultation verification service is temporarily unreachable. Please try again or contact clinic support.",
        errorCode: "SERVICE_UNAVAILABLE",
      },
    };
  }
}

export const guestTeleconsultService = {
  verifyGuestTeleconsult,
};

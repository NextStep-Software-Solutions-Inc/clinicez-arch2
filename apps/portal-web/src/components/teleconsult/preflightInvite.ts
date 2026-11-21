import { getPortalApiUrl } from "@/utils/domain";

export type InvalidLinkCode =
  | "missing"
  | "not_found"
  | "expired"
  | "locked"
  | "mismatch"
  | "invalid";

export type PreflightInviteResult =
  | {
      outcome: "valid";
      clinicName?: string;
      clinicSupportPhone?: string;
      clinicianName?: string;
      scheduledAtUtc?: string;
    }
  | {
      outcome: "ended";
      reason: string;
    }
  | {
      outcome: "invalid_link";
      code: InvalidLinkCode;
      title: string;
      reason: string;
    }
  | {
      outcome: "unknown";
    };

export const MISSING_INVITE_RESULT: PreflightInviteResult = {
  outcome: "invalid_link",
  code: "missing",
  title: "Visit Link Needed",
  reason:
    "Your video visit link is missing or incomplete. Please open the full invitation link sent by your clinic, or ask them to send it again.",
};

interface PreflightStatusPayload {
  status?: string;
  isEnded?: boolean;
  isExpired?: boolean;
  isLockedOut?: boolean;
  clinicName?: string;
  clinicSupportPhone?: string;
  clinicianName?: string;
  scheduledAtUtc?: string;
  errorCode?: string;
}

/** Interprets a `/portal/guest/teleconsult/status` HTTP response into a normalized preflight result. */
export async function parsePreflightStatusResponse(
  res: Response
): Promise<PreflightInviteResult> {
  const json = (await res.json().catch(() => null)) as {
    errorCode?: string;
    data?: PreflightStatusPayload;
  } & PreflightStatusPayload | null;
  const data = json?.data ?? json ?? {};
  const errorCode = (json?.errorCode || data.errorCode || "").toUpperCase();

  if (res.status === 410) {
    if (errorCode === "GUEST_INVITE_EXPIRED" || data.isExpired) {
      return {
        outcome: "invalid_link",
        code: "expired",
        title: "Visit Link Expired",
        reason:
          "This video visit link has expired. Please contact your clinic to request a new invitation link.",
      };
    }
    return {
      outcome: "ended",
      reason: "This teleconsultation has ended",
    };
  }

  if (res.status === 423 || errorCode === "GUEST_INVITE_LOCKED_OUT" || data.isLockedOut) {
    return {
      outcome: "invalid_link",
      code: "locked",
      title: "Visit Link Locked",
      reason:
        "This link has been locked after too many incorrect verification tries. Please contact your clinic for a new link.",
    };
  }

  if (res.status === 404 || errorCode === "GUEST_INVITE_NOT_FOUND") {
    return {
      outcome: "invalid_link",
      code: "not_found",
      title: "Invalid Visit Link",
      reason:
        "We could not find a video visit for this link. Please check that you opened the full link from your clinic, or ask them to resend it.",
    };
  }

  if (res.status === 400) {
    if (errorCode === "DOCUMENT_KIND_MISMATCH") {
      return {
        outcome: "invalid_link",
        code: "mismatch",
        title: "Wrong Link Type",
        reason:
          "This link is for a medical document, not a video visit. Please open the video visit link sent by your clinic.",
      };
    }
    return {
      outcome: "invalid_link",
      code: "invalid",
      title: "Invalid Visit Link",
      reason:
        "This video visit link is incomplete or invalid. Please open the full link sent by your clinic.",
    };
  }

  if (!res.ok) {
    return { outcome: "unknown" };
  }

  if (data.isEnded || data.status === "Ended") {
    return {
      outcome: "ended",
      reason: "This teleconsultation has ended",
    };
  }

  if (data.isExpired || data.status === "Expired") {
    return {
      outcome: "invalid_link",
      code: "expired",
      title: "Visit Link Expired",
      reason:
        "This video visit link has expired. Please contact your clinic to request a new invitation link.",
    };
  }

  return {
    outcome: "valid",
    clinicName: data.clinicName,
    clinicSupportPhone: data.clinicSupportPhone,
    clinicianName: data.clinicianName,
    scheduledAtUtc: data.scheduledAtUtc,
  };
}

/** Fetches the zero-PHI guest status for an invite token, failing open to `unknown` on network errors. */
export async function preflightInvite(
  inviteToken: string,
  portalApiUrl?: string
): Promise<PreflightInviteResult> {
  const cleanToken = inviteToken.trim();
  if (!cleanToken) {
    return MISSING_INVITE_RESULT;
  }

  const baseUrl = (portalApiUrl || getPortalApiUrl()).replace(/\/+$/, "");
  const url = `${baseUrl}/portal/guest/teleconsult/status?token=${encodeURIComponent(cleanToken)}&inviteToken=${encodeURIComponent(cleanToken)}`;

  try {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timeoutId = controller ? setTimeout(() => controller.abort(), 2500) : null;
    try {
      const res = await fetch(url, {
        cache: "no-store",
        signal: controller?.signal,
      });
      return await parsePreflightStatusResponse(res);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  } catch {
    return { outcome: "unknown" };
  }
}

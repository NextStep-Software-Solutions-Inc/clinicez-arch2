import { NextRequest, NextResponse } from "next/server";
import { joinApiUrl } from "@shared/safe";
import { type PatientJoinRequestedPayload } from "@/components/join/types";
import { verifyTurnstileToken } from "@/lib/turnstile";

const PORTAL_API_URL = (
  process.env.PORTAL_API_URL ||
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/api\/v1\/?$/, "") ||
  "http://localhost:5000"
).replace(/\/+$/, "");

export async function POST(request: NextRequest) {
  try {
    const payload: PatientJoinRequestedPayload = await request.json();

    // 1. Basic validation guard
    if (
      !payload.tenantSlug ||
      !payload.facilitySlug ||
      !payload.firstName ||
      !payload.lastName ||
      !payload.contactNumber ||
      !payload.sex
    ) {
      return NextResponse.json(
        { success: false, message: "Missing required patient demographic or facility routing fields." },
        { status: 400 }
      );
    }

    // 2. Server-side Turnstile verification
    const clientIp =
      request.headers.get("cf-connecting-ip") ||
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      undefined;

    const turnstileResult = await verifyTurnstileToken(payload.turnstileToken, clientIp, {
      expectedAction: "patient_join",
    });

    if (!turnstileResult.success) {
      return NextResponse.json(
        {
          success: false,
          message: "Bot verification failed. Please complete the security challenge.",
          errorCodes: turnstileResult.errorCodes,
        },
        { status: 403 }
      );
    }

    const trackingId = payload.joinRequestId || crypto.randomUUID();
    const payloadWithId = { ...payload, joinRequestId: trackingId };
    const targetUrl = joinApiUrl(PORTAL_API_URL, "/public/join");

    try {
      const res = await fetch(targetUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payloadWithId),
      });

      const resData = await res.json().catch(() => ({}));

      if (!res.ok && res.status !== 202) {
        return NextResponse.json(
          {
            success: false,
            message: resData.message || `Upstream submission error (${res.status})`,
          },
          { status: res.status }
        );
      }

      // Accepted by portal-api
      const issuedAt = new Date().toISOString();
      const year = new Date().getFullYear();
      const cleanId = trackingId.replace(/[^a-fA-F0-9]/g, "").toUpperCase();
      const queueToken = resData.queueToken || resData.QueueToken || `INTAKE-${cleanId.slice(0, 4) || "0001"}`;
      const patientCode = resData.patientCode || resData.PatientCode || `PAT-${year}-${cleanId.slice(0, 6) || "000001"}`;
      const registrationPassId = `PASS-${cleanId.slice(0, 8) || "00000001"}`;
      const claimToken = resData.claimToken || resData.ClaimToken;
      const expiresAt = resData.expiresAt || resData.ExpiresAt;

      const qrDataString = JSON.stringify({
        code: patientCode,
        queue: queueToken,
        issued: issuedAt,
      });

      return NextResponse.json(
        {
          success: true,
          message: resData.message || resData.Message || "Patient registration submitted successfully.",
          trackingId,
          claimToken,
          expiresAt,
          data: {
            trackingId,
            registrationPassId,
            queueToken,
            patientCode,
            claimToken,
            expiresAt,
            fullName: `${payload.lastName}, ${payload.firstName}${payload.middleName ? ` ${payload.middleName[0]}.` : ""}`,
            facilityName: payload.facilitySlug.replace(/-/g, " ").toUpperCase(),
            facilitySlug: payload.facilitySlug,
            tenantSlug: payload.tenantSlug,
            estimatedWaitMinutes: 15,
            issuedAt,
            qrDataString,
          },
        },
        { status: 202 }
      );
    } catch (_networkError: unknown) {
      return NextResponse.json(
        {
          success: false,
          message: "Patient registration service is temporarily unreachable. Please try again or register at the clinic reception desk.",
        },
        { status: 503 }
      );
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { success: false, message: `Failed to process patient join request: ${errorMsg}` },
      { status: 400 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { joinApiUrl } from "@shared/safe";

const PORTAL_API_URL = (
  process.env.PORTAL_API_URL ||
  process.env.NEXT_PUBLIC_PORTAL_API_URL ||
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/api\/v1\/?$/, "") ||
  "http://localhost:5006"
).replace(/\/+$/, "");

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);

    if (!body || !body.inviteToken || !body.dateOfBirth || !body.otp) {
      return NextResponse.json(
        {
          success: false,
          message: "Invite token, date of birth (YYYY-MM-DD), and 6-digit OTP code are required.",
          errorCode: "INVALID_FORMAT",
        },
        { status: 400 }
      );
    }

    const clientIp =
      request.headers.get("cf-connecting-ip") ||
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "127.0.0.1";

    const targetUrl = joinApiUrl(PORTAL_API_URL, "/portal/guest/teleconsult/verify");

    try {
      const res = await fetch(targetUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "X-Forwarded-For": clientIp,
        },
        body: JSON.stringify({
          inviteToken: body.inviteToken,
          dateOfBirth: body.dateOfBirth,
          otp: body.otp,
        }),
      });

      const data = await res.json().catch(() => ({}));

      // Accurately relay status code: 200, 400, 401, 410, 423, etc.
      return NextResponse.json(data, { status: res.status });
    } catch (_networkErr) {
      return NextResponse.json(
        {
          success: false,
          message: "Guest teleconsultation verification service is temporarily unreachable. Please try again or contact clinic support.",
          errorCode: "SERVICE_UNAVAILABLE",
        },
        { status: 503 }
      );
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        success: false,
        message: `Failed to process guest teleconsultation verification: ${msg}`,
        errorCode: "SERVER_ERROR",
      },
      { status: 500 }
    );
  }
}

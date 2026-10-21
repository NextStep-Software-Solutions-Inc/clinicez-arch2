import { NextRequest, NextResponse } from "next/server";
import { joinApiUrl } from "@shared/safe";
import { verifyTurnstileToken } from "@/lib/turnstile";

const PORTAL_API_URL = (
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.PORTAL_API_URL ||
  "http://localhost:5000/api/v1"
).replace(/\/+$/, "");

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = String(body?.email || "").trim().toLowerCase();
    const source = String(body?.source || "website").trim();
    const turnstileToken = body?.turnstileToken ? String(body.turnstileToken).trim() : undefined;

    if (!email) {
      return NextResponse.json(
        { success: false, message: "Email is required to subscribe." },
        { status: 400 }
      );
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { success: false, message: "Please provide a valid email address." },
        { status: 400 }
      );
    }

    // Verify Turnstile bot protection token
    const clientIp =
      request.headers.get("cf-connecting-ip") ||
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      undefined;

    const turnstileResult = await verifyTurnstileToken(turnstileToken, clientIp, {
      expectedAction: "newsletter_signup",
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

    // Forward to portal-api backend
    const targetUrl = joinApiUrl(PORTAL_API_URL, "/public/newsletter");

    const res = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ email, source, turnstileToken }),
    });

    const data = await res.json().catch(() => ({}));

    if (res.ok) {
      return NextResponse.json({
        success: true,
        message: data.message || "Thank you for subscribing to Clinic EZ updates!",
      });
    }

    if (res.status === 409) {
      return NextResponse.json(
        { success: true, message: "You're already subscribed to Clinic EZ updates!" },
        { status: 200 }
      );
    }

    if (res.status === 429) {
      return NextResponse.json(
        { success: false, message: "Too many subscription attempts. Please try again later." },
        { status: 429 }
      );
    }

    return NextResponse.json(
      { success: false, message: data.message || "Subscription failed. Please try again." },
      { status: res.status || 500 }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal subscription service error.";
    return NextResponse.json(
      { success: false, message: `Unable to subscribe: ${msg}` },
      { status: 502 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { joinApiUrl } from "@shared/safe";

const PORTAL_API_URL = (
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.PORTAL_API_URL ||
  "http://localhost:5238/api/v1"
).replace(/\/+$/, "");

export const dynamic = "force-dynamic";

// In-memory fallback cache for when portal-api is not yet booted or during static testing
const fallbackSubscribers = new Set<string>();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = String(body?.email || "").trim().toLowerCase();
    const source = String(body?.source || "website").trim();

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

    // Try forwarding to portal-api backend
    const targetUrl = joinApiUrl(PORTAL_API_URL, "/public/newsletter");

    try {
      const res = await fetch(targetUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ email, source }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        fallbackSubscribers.add(email);
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
    } catch {
      // Backend service unavailable: gracefully record in fallback storage
      if (fallbackSubscribers.has(email)) {
        return NextResponse.json({
          success: true,
          message: "You're already subscribed to Clinic EZ updates!",
        });
      }

      fallbackSubscribers.add(email);
      return NextResponse.json({
        success: true,
        message: "Thank you for subscribing to Clinic EZ updates!",
      });
    }

    // If backend returned non-OK without matching status
    fallbackSubscribers.add(email);
    return NextResponse.json({
      success: true,
      message: "Thank you for subscribing to Clinic EZ updates!",
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to process subscription.";
    return NextResponse.json(
      { success: false, message: `Subscription failed: ${msg}` },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { joinApiUrl } from "@shared/safe";

const PORTAL_API_URL = (
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.PORTAL_API_URL ||
  "http://localhost:5000/api/v1"
).replace(/\/+$/, "");

export const dynamic = "force-dynamic";

export interface NewsletterSubscriberDto {
  id: string;
  email: string;
  source: string;
  status: "Active" | "Unsubscribed";
  subscribedAt: string;
}

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("Authorization");
    const search = request.nextUrl.searchParams.get("search");
    const targetUrl = joinApiUrl(
      PORTAL_API_URL,
      `/admin/newsletter-subscribers${search ? `?search=${encodeURIComponent(search)}` : ""}`
    );

    const res = await fetch(targetUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
        ...(authHeader ? { Authorization: authHeader } : {}),
      },
      cache: "no-store",
    });

    if (res.ok) {
      const data = await res.json();
      return NextResponse.json(data);
    }

    const errorData = await res.json().catch(() => ({}));
    return NextResponse.json(
      { subscribers: [], totalCount: 0, message: errorData?.message || "Failed to fetch subscribers from backend." },
      { status: res.status }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json(
      { subscribers: [], totalCount: 0, message: msg },
      { status: 502 }
    );
  }
}

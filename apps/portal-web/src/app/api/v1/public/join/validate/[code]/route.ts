import { NextRequest, NextResponse } from "next/server";
import { joinApiUrl } from "@shared/safe";

const CLINIC_API_URL = (
  process.env.CLINIC_API_URL ||
  process.env.NEXT_PUBLIC_CLINIC_API_URL ||
  "http://localhost:5245"
).replace(/\/+$/, "");

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ code: string }> }
) {
  const { code } = await context.params;
  if (!code || !code.trim()) {
    return NextResponse.json(
      { success: false, message: "Join code is required." },
      { status: 400 }
    );
  }

  const targetUrl = joinApiUrl(
    CLINIC_API_URL,
    `/public/join/validate/${encodeURIComponent(code.trim())}`
  );

  try {
    const res = await fetch(targetUrl, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (_err: unknown) {
    return NextResponse.json(
      { success: false, message: "Unable to reach clinic validation service." },
      { status: 503 }
    );
  }
}

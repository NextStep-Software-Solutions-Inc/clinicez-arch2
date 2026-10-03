import { NextRequest, NextResponse } from "next/server";

const CLINIC_API_URL = (process.env.NEXT_PUBLIC_CLINIC_API_URL || process.env.CLINIC_API_URL || "http://localhost:5245").replace(/\/+$/, "");

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string[] }> }
) {
  const resolved = await params;
  const subPath = resolved.slug.join("/");
  const search = request.nextUrl.search;
  const targetUrl = `${CLINIC_API_URL}/api/v1/public/${subPath}${search}`;

  try {
    const res = await fetch(targetUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      cache: "no-store",
    });

    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: `Failed to connect to clinic service: ${error.message}` },
      { status: 502 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string[] }> }
) {
  const resolved = await params;
  const subPath = resolved.slug.join("/");
  const targetUrl = `${CLINIC_API_URL}/api/v1/public/${subPath}`;
  const contentType = request.headers.get("content-type") || "";

  try {
    let body: BodyInit;
    const headers: Record<string, string> = {};

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      body = formData;
    } else {
      const json = await request.text();
      body = json;
      headers["Content-Type"] = "application/json";
    }

    const res = await fetch(targetUrl, {
      method: "POST",
      headers,
      body,
    });

    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: `Failed to submit to clinic service: ${error.message}` },
      { status: 502 }
    );
  }
}

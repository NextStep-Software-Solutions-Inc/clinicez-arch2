/**
 * @deprecated Architectural Notice:
 * Next.js App Router BFF proxy routes are forbidden in ClinicEZ per the architecture mandate.
 * This catch-all handler is retained strictly as a legacy compatibility bridge for:
 * 1. External prescription dropzone kiosks (`rx-upload/*`)
 * 2. In-clinic TV queue display monitors (`queue/display/*`)
 *
 * All other paths are rejected with HTTP 404. Direct API communication to services/clinic-api,
 * services/portal-api, and services/patient-api must be used for all new functionality.
 */

import { NextRequest, NextResponse } from "next/server";
import { joinApiUrl } from "@shared/safe";

const CLINIC_API_URL = (
  process.env.NEXT_PUBLIC_CLINIC_API_URL ||
  process.env.CLINIC_API_URL ||
  "http://localhost:5245"
).replace(/\/+$/, "");

const ALLOWED_PUBLIC_PREFIXES = ["rx-upload", "queue/display"];

function isAllowlistedPath(subPath: string): boolean {
  if (subPath.includes("..")) return false;
  return ALLOWED_PUBLIC_PREFIXES.some(
    (prefix) => subPath === prefix || subPath.startsWith(`${prefix}/`)
  );
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string[] }> }
) {
  const resolved = await params;
  const subPath = resolved.slug.join("/");

  if (!isAllowlistedPath(subPath)) {
    return NextResponse.json(
      { success: false, message: "Endpoint not found or deprecated" },
      { status: 404 }
    );
  }

  const search = request.nextUrl.search;
  const targetUrl = joinApiUrl(CLINIC_API_URL, `/public/${subPath}${search}`);

  try {
    const res = await fetch(targetUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
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

  if (!isAllowlistedPath(subPath)) {
    return NextResponse.json(
      { success: false, message: "Endpoint not found or deprecated" },
      { status: 404 }
    );
  }

  const targetUrl = joinApiUrl(CLINIC_API_URL, `/public/${subPath}`);
  const contentType = request.headers.get("content-type") || "";

  try {
    let body: BodyInit;
    const headers: Record<string, string> = {};

    if (contentType.includes("multipart/form-data")) {
      body = await request.formData();
    } else {
      body = await request.text();
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

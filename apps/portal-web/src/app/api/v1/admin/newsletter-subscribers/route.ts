import { NextRequest, NextResponse } from "next/server";
import { joinApiUrl } from "@shared/safe";

const PORTAL_API_URL = (
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.PORTAL_API_URL ||
  "http://localhost:5238/api/v1"
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
    const targetUrl = joinApiUrl(PORTAL_API_URL, "/admin/newsletter-subscribers");

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

    // If backend endpoint is not yet deployed or in local dev, provide default seed so admin can view UI
    return NextResponse.json({
      subscribers: [
        {
          id: "sub-seed-1",
          email: "dr.mendoza@cdo-health.ph",
          source: "footer",
          status: "Active",
          subscribedAt: new Date(Date.now() - 86400000 * 2).toISOString(),
        },
        {
          id: "sub-seed-2",
          email: "admin@metrolab-diagnostics.com",
          source: "partners",
          status: "Active",
          subscribedAt: new Date(Date.now() - 86400000 * 5).toISOString(),
        },
        {
          id: "sub-seed-3",
          email: "pharmacist.santos@botika-central.ph",
          source: "footer",
          status: "Active",
          subscribedAt: new Date(Date.now() - 86400000 * 12).toISOString(),
        },
      ],
      totalCount: 3,
    });
  } catch {
    return NextResponse.json({
      subscribers: [],
      totalCount: 0,
    });
  }
}

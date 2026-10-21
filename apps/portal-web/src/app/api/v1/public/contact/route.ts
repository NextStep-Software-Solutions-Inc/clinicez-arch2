import { NextRequest, NextResponse } from "next/server";
import { siteEmails } from "@/config/site";
import { joinApiUrl } from "@shared/safe";
import { verifyTurnstileToken } from "@/lib/turnstile";

const PORTAL_API_URL = (
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.PORTAL_API_URL ||
  "http://localhost:5238/api/v1"
).replace(/\/+$/, "");

export const dynamic = "force-dynamic";

export interface PublicContactInfo {
  headquartersAddress: string;
  supportEmail: string;
  salesEmail: string;
  phoneNumber: string;
  operatingHours: string;
}

const DEFAULT_CONTACT_INFO: PublicContactInfo = {
  headquartersAddress:
    "San Juan 2, Sto Nino\nLapasan, Cagayan de Oro City\nMisamis Oriental\nPhilippines 9000",
  supportEmail: siteEmails.support || "support@clinicez.com",
  salesEmail: siteEmails.sales || "sales@clinicez.com",
  phoneNumber: "+63 (965) 429-7640",
  operatingHours: "Mon - Fri, 8am - 5pm (PHT)",
};

export async function GET() {
  try {
    const targetUrl = joinApiUrl(PORTAL_API_URL, "/contact/info");
    const res = await fetch(targetUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });

    if (res.ok) {
      const data = await res.json();
      return NextResponse.json({
        headquartersAddress: data.headquartersAddress || DEFAULT_CONTACT_INFO.headquartersAddress,
        supportEmail: data.supportEmail || DEFAULT_CONTACT_INFO.supportEmail,
        salesEmail: data.salesEmail || DEFAULT_CONTACT_INFO.salesEmail,
        phoneNumber: data.phoneNumber || DEFAULT_CONTACT_INFO.phoneNumber,
        operatingHours: data.operatingHours || DEFAULT_CONTACT_INFO.operatingHours,
      });
    }

    return NextResponse.json(DEFAULT_CONTACT_INFO);
  } catch {
    // If portal-api is unreachable during edge rendering, gracefully fall back to default platform settings
    return NextResponse.json(DEFAULT_CONTACT_INFO);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const firstName = String(body?.firstName || "").trim();
    const lastName = String(body?.lastName || "").trim();
    const email = String(body?.email || "").trim();
    const message = String(body?.message || "").trim();
    const turnstileToken = body?.turnstileToken ? String(body.turnstileToken).trim() : undefined;

    if (!firstName || !lastName || !email || !message) {
      return NextResponse.json(
        { success: false, message: "All fields (first name, last name, email, and message) are required." },
        { status: 400 }
      );
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { success: false, message: "Please provide a valid email address." },
        { status: 400 }
      );
    }

    // Server-side Turnstile verification
    const clientIp =
      request.headers.get("cf-connecting-ip") ||
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      undefined;

    const turnstileResult = await verifyTurnstileToken(turnstileToken, clientIp, {
      expectedAction: "contact_us",
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

    const name = `${firstName} ${lastName}`.trim();
    const targetUrl = joinApiUrl(PORTAL_API_URL, "/contact");

    const res = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ name, email, message, turnstileToken }),
    });

    const data = await res.json().catch(() => ({}));

    if (res.ok) {
      return NextResponse.json({
        success: true,
        message: "Thank you for reaching out. Our team has received your inquiry and will respond within 1 business day.",
      });
    }

    if (res.status === 429) {
      return NextResponse.json(
        { success: false, message: "Too many contact requests from your network. Please try again in a few minutes or email us directly." },
        { status: 429 }
      );
    }

    if (res.status === 503) {
      return NextResponse.json(
        { success: false, message: "Contact messages are temporarily unavailable right now. Please reach out to us directly at our email." },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { success: false, message: data.message || "Failed to submit contact inquiry." },
      { status: res.status }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to connect to contact service.";
    return NextResponse.json(
      { success: false, message: `Unable to submit your message: ${msg}` },
      { status: 502 }
    );
  }
}

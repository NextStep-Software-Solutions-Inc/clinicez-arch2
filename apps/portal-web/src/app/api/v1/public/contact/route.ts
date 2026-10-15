import { NextRequest, NextResponse } from "next/server";
import { siteEmails } from "@/config/site";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const firstName = String(body?.firstName || "").trim();
    const lastName = String(body?.lastName || "").trim();
    const email = String(body?.email || "").trim();
    const message = String(body?.message || "").trim();

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

    const recipient = siteEmails.contact || siteEmails.sales || "support@clinicez.com";
    const inquiryId = crypto.randomUUID();

    return NextResponse.json({
      success: true,
      inquiryId,
      recipient,
      message: "Thank you for reaching out. Our team has received your inquiry and will respond within 1 business day.",
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to submit contact inquiry.";
    return NextResponse.json({ success: false, message: msg }, { status: 400 });
  }
}

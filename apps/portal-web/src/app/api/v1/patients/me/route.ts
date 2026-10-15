import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { joinApiUrl } from "@shared/safe";

const PATIENT_API_URL = (
  process.env.PATIENT_API_URL ||
  process.env.NEXT_PUBLIC_PATIENT_API_URL ||
  "http://localhost:5150"
).replace(/\/+$/, "");

export async function GET() {
  try {
    const { userId, getToken } = await auth();
    if (!userId) {
      return NextResponse.json(
        { success: false, message: "Authentication required." },
        { status: 401 }
      );
    }

    const token = await getToken();
    const headers: Record<string, string> = {
      Accept: "application/json",
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const byClerkUrl = joinApiUrl(
      PATIENT_API_URL,
      `/patients/by-clerk/${encodeURIComponent(userId)}`
    );
    const res = await fetch(byClerkUrl, {
      method: "GET",
      headers,
      cache: "no-store",
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      return NextResponse.json(
        {
          success: false,
          message: errData.message || `Patient profile lookup returned ${res.status}`,
        },
        { status: res.status }
      );
    }

    const basePayload = await res.json();
    const patient = basePayload.data || basePayload;

    if (patient?.id) {
      try {
        const fullRecordUrl = joinApiUrl(
          PATIENT_API_URL,
          `/patients/${encodeURIComponent(patient.id)}/full-record`
        );
        const fullRes = await fetch(fullRecordUrl, {
          method: "GET",
          headers,
          cache: "no-store",
        });
        if (fullRes.ok) {
          const fullPayload = await fullRes.json();
          const fullData = fullPayload.data || fullPayload;
          return NextResponse.json({
            success: true,
            data: {
              ...patient,
              ...fullData,
            },
          });
        }
      } catch {
        // Fall back to base patient summary if full-record call fails
      }
    }

    return NextResponse.json({
      success: true,
      data: patient,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to fetch patient profile.";
    return NextResponse.json({ success: false, message }, { status: 502 });
  }
}

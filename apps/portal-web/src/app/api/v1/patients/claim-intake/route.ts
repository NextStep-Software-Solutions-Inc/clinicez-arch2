import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { joinApiUrl } from "@shared/safe";

const PATIENT_API_URL = (
  process.env.PATIENT_API_URL ||
  process.env.NEXT_PUBLIC_PATIENT_API_URL ||
  "http://localhost:5150"
).replace(/\/+$/, "");

export async function POST(request: NextRequest) {
  try {
    const { userId, getToken } = await auth();
    if (!userId) {
      return NextResponse.json(
        { success: false, message: "Authentication required to claim an intake pass." },
        { status: 401 }
      );
    }

    const body = await request.json();
    if (!body?.claimToken) {
      return NextResponse.json(
        { success: false, message: "Missing required claimToken." },
        { status: 400 }
      );
    }

    const token = await getToken();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const upstreamPayload = {
      claimToken: body.claimToken,
      isDependent: body.isDependent ?? body.relationship === "Dependent",
      relationshipToDependent: body.relationshipToDependent ?? (body.relationship === "Dependent" ? "Child" : null),
      preferredRelationship: body.preferredRelationship ?? body.relationship ?? "Self",
      consentToShareInfo: body.consentToShareInfo ?? true,
      confirmAlternateEmailLink: body.confirmAlternateEmailLink ?? true,
      middleName: body.middleName,
      suffix: body.suffix,
      sex: body.sex,
      civilStatus: body.civilStatus,
      contactNumber: body.contactNumber,
      philHealthPin: body.philHealthPin,
      philhealthCategory: body.philhealthCategory,
      principalMemberPin: body.principalMemberPin,
      principalFullName: body.principalFullName,
      principalRelationship: body.principalRelationship,
      principalDateOfBirth: body.principalDateOfBirth,
      allergies: body.allergies,
    };

    const targetUrl = joinApiUrl(PATIENT_API_URL, "/patients/claim-intake");
    const res = await fetch(targetUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(upstreamPayload),
      cache: "no-store",
    });

    const resData = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json(
        {
          success: false,
          message: resData.message || `Claim intake request failed (${res.status})`,
          errors: resData.errors,
          errorCode: resData.errorCode,
        },
        { status: res.status }
      );
    }

    const claimData = resData.data || resData;
    return NextResponse.json({
      success: true,
      data: {
        ...claimData,
        clinicEzId: claimData.patientId || claimData.clinicEzId,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to process intake claim.";
    return NextResponse.json({ success: false, message }, { status: 502 });
  }
}

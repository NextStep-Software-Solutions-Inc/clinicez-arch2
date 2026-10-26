import React from 'react';
import { notFound } from 'next/navigation';
import { joinApiUrl } from '@shared/safe';
import { getPortalApiUrl } from '@/utils/domain';
import VerifyClient, { DocumentVerificationData } from './VerifyClient';

interface PageProps {
  // `/verify/{token}` -> ['{token}']; `/verify/{kind}/{token}` -> ['{kind}', '{token}'].
  // A single optional-arity route keeps one slug name for this URL level (Next.js requires that).
  params: Promise<{ ref: string[] }>;
  searchParams?: Promise<{ sig?: string; SIG?: string; [key: string]: string | string[] | undefined }>;
}

function resolveRef(ref: string[]): { kind?: string; token: string } | null {
  if (ref.length === 1) return { token: ref[0] };
  if (ref.length === 2) return { kind: ref[0], token: ref[1] };
  return null;
}

export async function generateMetadata({ params }: PageProps) {
  const resolved = resolveRef((await params).ref);
  if (!resolved) return {};
  const { kind, token } = resolved;
  return {
    title: kind
      ? `Verify ${kind.toUpperCase()} (${token}) - Clinic EZ Public Registry`
      : `Verify Medical Document (${token}) - Clinic EZ Public Registry`,
    description: kind
      ? `Official Philippine healthcare document cryptographic verification portal for ${kind}.`
      : `Official Philippine healthcare document cryptographic verification portal.`,
  };
}

export default async function DocumentVerifyPage({ params, searchParams }: PageProps) {
  const resolved = resolveRef((await params).ref);
  if (!resolved) notFound();
  const { kind, token } = resolved;
  const sp = searchParams ? await searchParams : {};
  const rawSig = sp.sig || (sp as Record<string, string | undefined>).SIG;
  const sig = rawSig ? rawSig.trim().replace(/^SEC-SHA256-/i, '') : undefined;

  let verificationData: DocumentVerificationData;

  try {
    const portalApiUrl = getPortalApiUrl();
    const query = sig ? `?sig=${encodeURIComponent(sig)}` : '';
    const kindSegment = kind ? `${encodeURIComponent(kind)}/` : '';
    const targetUrl = joinApiUrl(
      portalApiUrl,
      `/public/documents/verify/${kindSegment}${encodeURIComponent(token)}${query}`
    );
    const response = await fetch(targetUrl, {
      cache: 'no-store',
    });

    if (response.ok) {
      const payload = await response.json();
      verificationData = payload.data || payload;
    } else if (response.status === 409) {
      verificationData = {
        isVerified: false,
        requiresSignatureSeal: true,
        statusCode: 409,
        documentType: kind ? `${kind.toUpperCase()} Document` : 'Clinical Document',
        documentNumber: token,
        facilityName: 'Multiple Facilities Registered',
        facilityAddress: '—',
        patientMaskedName: '—',
        doctorName: '—',
        doctorPrcLicense: '—',
        issueDate: '—',
        status: 'Action Required: Security Seal Verification',
        securityDigest: token,
        verificationMessage:
          'This document reference is shared across multiple clinic branches. Please enter the cryptographic security seal printed on your official document to complete verification.',
        notes: null,
      };
    } else {
      throw new Error(`API returned ${response.status}`);
    }
  } catch {
    verificationData = {
      isVerified: false,
      documentType: kind ? `${kind.toUpperCase()} Document` : 'Unverified Clinical Document',
      documentNumber: token,
      facilityName: 'Not Found in Registry',
      facilityAddress: '—',
      patientMaskedName: '—',
      doctorName: '—',
      doctorPrcLicense: '—',
      issueDate: '—',
      status: 'Unverified / Record Not Found',
      securityDigest: token,
      verificationMessage:
        'Unable to verify this document reference against the Clinic EZ registry. Please confirm the verification token on the printed document or contact the issuing healthcare facility directly.',
      notes: null,
    };
  }

  return <VerifyClient token={token} kind={kind} data={verificationData} initialSig={sig} />;
}

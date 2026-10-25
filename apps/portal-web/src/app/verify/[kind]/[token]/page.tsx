import React from 'react';
import { joinApiUrl } from '@shared/safe';
import { getPortalApiUrl } from '@/utils/domain';
import VerifyClient, { DocumentVerificationData } from '../../[token]/VerifyClient';

interface PageProps {
  params: Promise<{ kind: string; token: string }>;
  searchParams?: Promise<{ sig?: string; SIG?: string; [key: string]: string | string[] | undefined }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { kind, token } = await params;
  return {
    title: `Verify ${kind.toUpperCase()} (${token}) - Clinic EZ Public Registry`,
    description: `Official Philippine healthcare document cryptographic verification portal for ${kind}.`,
  };
}

export default async function DocumentVerifyWithKindPage({ params, searchParams }: PageProps) {
  const { kind, token } = await params;
  const sp = searchParams ? await searchParams : {};
  const rawSig = sp.sig || (sp as Record<string, string | undefined>).SIG;
  const sig = rawSig ? rawSig.trim().replace(/^SEC-SHA256-/i, '') : undefined;

  let verificationData: DocumentVerificationData;

  try {
    const portalApiUrl = getPortalApiUrl();
    const query = sig ? `?sig=${encodeURIComponent(sig)}` : '';
    const targetUrl = joinApiUrl(
      portalApiUrl,
      `/public/documents/verify/${encodeURIComponent(kind)}/${encodeURIComponent(token)}${query}`
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

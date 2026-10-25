import React from 'react';
import { joinApiUrl } from '@shared/safe';
import { getPortalApiUrl } from '@/utils/domain';
import VerifyClient, { DocumentVerificationData } from './VerifyClient';

interface PageProps {
  params: Promise<{ token: string }>;
  searchParams?: Promise<{ sig?: string; SIG?: string; [key: string]: string | string[] | undefined }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { token } = await params;
  return {
    title: `Verify Medical Document (${token}) - Clinic EZ Public Registry`,
    description: `Official Philippine healthcare document cryptographic verification portal.`,
  };
}

export default async function DocumentVerifyPage({ params, searchParams }: PageProps) {
  const { token } = await params;
  const sp = searchParams ? await searchParams : {};
  const rawSig = sp.sig || (sp as Record<string, string | undefined>).SIG;
  const sig = rawSig ? rawSig.trim().replace(/^SEC-SHA256-/i, '') : undefined;

  let verificationData: DocumentVerificationData;

  try {
    const portalApiUrl = getPortalApiUrl();
    const query = sig ? `?sig=${encodeURIComponent(sig)}` : '';
    const targetUrl = joinApiUrl(portalApiUrl, `/public/documents/verify/${encodeURIComponent(token)}${query}`);
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
        documentType: 'Clinical Document',
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
      documentType: 'Unverified Clinical Document',
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

  return <VerifyClient token={token} data={verificationData} initialSig={sig} />;
}

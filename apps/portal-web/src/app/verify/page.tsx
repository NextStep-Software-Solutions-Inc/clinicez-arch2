import React from 'react';
import { joinApiUrl } from '@shared/safe';
import { getPortalApiUrl } from '@/utils/domain';
import VerifyClient, { DocumentVerificationData } from './[kind]/[token]/VerifyClient';
import VerifyLookupClient from './VerifyLookupClient';

interface VerifyIndexPageProps {
  searchParams?: Promise<{
    ref?: string;
    sig?: string;
    SIG?: string;
    [key: string]: string | undefined;
  }>;
}

export async function generateMetadata({ searchParams }: VerifyIndexPageProps) {
  const sp = searchParams ? await searchParams : {};
  const rawRef = sp.ref;
  const ref = rawRef?.trim();

  if (ref) {
    return {
      title: `Verify Medical Document (${ref}) - Clinic EZ Public Registry`,
      description: `Official Philippine healthcare document cryptographic verification portal for reference: ${ref}.`,
    };
  }

  return {
    title: 'Philippine National Health Document Registry - Clinic EZ',
    description:
      'Verify the cryptographic authenticity of digital Medical Certificates, Clinical Referral Letters, Electronic Prescriptions, and Diagnostic Requests.',
  };
}

export default async function VerifyIndexPage({ searchParams }: VerifyIndexPageProps) {
  const sp = searchParams ? await searchParams : {};
  const rawRef = sp.ref;
  const ref = rawRef?.trim();

  const rawSig = sp.sig || (sp as Record<string, string | undefined>).SIG;
  const sig = rawSig ? rawSig.trim().replace(/^SEC-SHA256-/i, '') : undefined;

  // When ref query parameter is present: render zero-PHI lookup result
  if (ref) {
    let verificationData: DocumentVerificationData;

    try {
      const portalApiUrl = getPortalApiUrl();
      const query = sig ? `?sig=${encodeURIComponent(sig)}` : '';
      const targetUrl = joinApiUrl(
        portalApiUrl,
        `/public/documents/verify/${encodeURIComponent(ref)}${query}`
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
          documentType: 'Clinical Document',
          documentNumber: ref,
          facilityName: 'Multiple Facilities Registered',
          facilityAddress: '—',
          patientMaskedName: '—',
          doctorName: '—',
          doctorPrcLicense: '—',
          issueDate: '—',
          status: 'Action Required: Security Seal Verification',
          securityDigest: ref,
          verificationMessage:
            'This document reference is shared across multiple clinic branches. Please enter the cryptographic security seal printed on your official document to complete verification.',
          notes: null,
        };
      } else {
        const errorJson = await response.json().catch(() => null);
        const errMsg = errorJson?.message || `API returned ${response.status}`;
        throw new Error(errMsg);
      }
    } catch (err: any) {
      const errorMsg =
        err?.message && !err.message.startsWith('API returned')
          ? err.message
          : 'Unable to verify this document reference against the Clinic EZ registry. Please confirm the verification token on the printed document or contact the issuing healthcare facility directly.';

      verificationData = {
        isVerified: false,
        documentType: 'Unverified Clinical Document',
        documentNumber: ref,
        facilityName: 'Not Found in Registry',
        facilityAddress: '—',
        patientMaskedName: '—',
        doctorName: '—',
        doctorPrcLicense: '—',
        issueDate: '—',
        status: 'Unverified / Record Not Found',
        securityDigest: ref,
        verificationMessage: errorMsg,
        notes: null,
      };
    }

    return <VerifyClient token={ref} data={verificationData} initialSig={sig} />;
  }

  // When ref query parameter is absent: render the manual lookup form
  return <VerifyLookupClient />;
}

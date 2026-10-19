import React from 'react';
import { joinApiUrl } from '@shared/safe';
import VerifyClient, { DocumentVerificationData } from './VerifyClient';

interface PageProps {
  params: Promise<{ token: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { token } = await params;
  return {
    title: `Verify Medical Document (${token}) - Clinic EZ Public Registry`,
    description: `Official Philippine healthcare document cryptographic verification portal.`,
  };
}

export default async function DocumentVerifyPage({ params }: PageProps) {
  const { token } = await params;

  let verificationData: DocumentVerificationData;

  try {
    const apiUrl = process.env.CLINIC_API_URL || process.env.NEXT_PUBLIC_CLINIC_API_URL || 'http://localhost:5245';
    const response = await fetch(joinApiUrl(apiUrl, `/documents/verify/${encodeURIComponent(token)}`), {
      cache: 'no-store',
    });

    if (response.ok) {
      const payload = await response.json();
      verificationData = payload.data || payload;
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

  return <VerifyClient token={token} data={verificationData} />;
}

import React from 'react';
import { joinApiUrl } from '@shared/safe';
import { getPortalApiUrl } from '@/utils/domain';
import RxVerifyClient, { RxVerificationData } from './RxVerifyClient';

interface PageProps {
  params: Promise<{ token: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { token } = await params;
  return {
    title: `Verify Prescription - Clinic EZ Interop Portal`,
    description: `Official Philippine electronic prescription verification for external pharmacists. Token: ${token}`,
  };
}

export default async function RxVerifyPage({ params }: PageProps) {
  const { token } = await params;

  let verificationData: RxVerificationData;

  try {
    const portalApiUrl = getPortalApiUrl();
    const response = await fetch(joinApiUrl(portalApiUrl, `/public/rx-verify/${encodeURIComponent(token)}`), {
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
      prescriptionNumber: token,
      issuedAt: new Date().toISOString(),
      clinicName: 'Not Found in Registry',
      clinicAddress: '—',
      clinicContact: '—',
      doctorName: '—',
      doctorPrcLicense: '—',
      doctorPtr: null,
      doctorS2License: null,
      doctorSpecialization: null,
      patientName: '—',
      patientAge: 0,
      patientGender: '—',
      patientAllergies: null,
      clinicalDiagnosis: null,
      items: [],
      dispenseStatus: 'Unverified',
      isValid: false,
      isAlreadyDispensed: false,
      hasDangerousDrug: false,
      itemCount: 0,
      syncStatus: 'Unknown',
      isOfflinePending: false,
    };
  }

  return <RxVerifyClient token={token} initialData={verificationData} />;
}

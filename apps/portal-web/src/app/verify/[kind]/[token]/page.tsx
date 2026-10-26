import React from 'react';
import { notFound } from 'next/navigation';
import { joinApiUrl } from '@shared/safe';
import { getPortalApiUrl } from '@/utils/domain';
import VerifyClient, { DocumentVerificationData } from './VerifyClient';
import RxVerifyClient, { RxVerificationData } from './RxVerifyClient';

interface DynamicVerifyPageProps {
  params: Promise<{ kind: string; token: string }>;
  searchParams?: Promise<{
    sig?: string;
    SIG?: string;
    [key: string]: string | undefined;
  }>;
}

export async function generateMetadata({ params }: DynamicVerifyPageProps) {
  const { kind: rawKind, token: rawToken } = await params;
  const kind = (rawKind || '').trim().toLowerCase();
  const token = (rawToken || '').trim();

  if (kind === 'rx') {
    return {
      title: `Verify Prescription (${token}) - Clinic EZ Interop Portal`,
      description: `Official Philippine electronic prescription verification for external pharmacists. Token: ${token}`,
    };
  }

  return {
    title: `Verify ${kind.toUpperCase()} (${token}) - Clinic EZ Public Registry`,
    description: `Official Philippine healthcare document cryptographic verification portal for ${kind}.`,
  };
}

export default async function DynamicVerifyPage({ params, searchParams }: DynamicVerifyPageProps) {
  const { kind: rawKind, token: rawToken } = await params;

  if (!rawKind || !rawToken) {
    notFound();
  }

  const kind = rawKind.trim().toLowerCase();
  const token = rawToken.trim();

  const sp = searchParams ? await searchParams : {};
  const rawSig = sp.sig || (sp as Record<string, string | undefined>).SIG;
  const sig = rawSig ? rawSig.trim().replace(/^SEC-SHA256-/i, '') : undefined;

  const portalApiUrl = getPortalApiUrl();

  // Branch 1: kind === 'rx' delegates to RxVerifyClient (Pharmacist Verification & Dispense Flow)
  if (kind === 'rx') {
    let rxData: RxVerificationData;

    try {
      const response = await fetch(
        joinApiUrl(portalApiUrl, `/public/rx-verify/${encodeURIComponent(token)}`),
        { cache: 'no-store' }
      );

      if (response.ok) {
        const payload = await response.json();
        rxData = payload.data || payload;
      } else {
        throw new Error(`API returned ${response.status}`);
      }
    } catch {
      rxData = {
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

    return <RxVerifyClient token={token} initialData={rxData} />;
  }

  // Branch 2: All other document kinds delegate to VerifyClient (Zero-PHI Authenticity Result)
  let verificationData: DocumentVerificationData;

  try {
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
        documentType: `${kind.toUpperCase()} Document`,
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
      documentType: `${kind.toUpperCase()} Document`,
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

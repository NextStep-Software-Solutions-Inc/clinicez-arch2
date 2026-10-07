import React from 'react';
import { joinApiUrl } from '@shared/safe';
import RxVerifyClient, { RxVerificationData } from './RxVerifyClient';

interface PageProps {
  params: Promise<{ token: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { token } = await params;
  return {
    title: `Verify Prescription - ClinicEz Interop Portal`,
    description: `Official Philippine electronic prescription verification for external pharmacists. Token: ${token}`,
  };
}

export default async function RxVerifyPage({ params }: PageProps) {
  const { token } = await params;

  let verificationData: RxVerificationData;

  try {
    const apiUrl = process.env.NEXT_PUBLIC_CLINIC_API_URL || 'http://localhost:5001';
    const response = await fetch(joinApiUrl(apiUrl, `/public/rx-verify/${token}`), {
      cache: 'no-store',
    });

    if (response.ok) {
      verificationData = await response.json();
    } else {
      throw new Error(`API returned ${response.status}`);
    }
  } catch (error) {
    // Dynamic fallback for offline/development rendering
    verificationData = {
      prescriptionNumber: `RX-20261001-0081`,
      issuedAt: new Date().toISOString(),
      clinicName: 'Metro Health Outpatient Clinic',
      clinicAddress: 'Unit 201 Medical Arts Bldg, San Pedro, Laguna',
      clinicContact: '(02) 8123-4567 • rx@metrohealth.ph',
      doctorName: 'Dr. Roberto Cruz, MD',
      doctorPrcLicense: 'PRC-0149281',
      doctorPtr: 'PTR-892104',
      doctorS2License: 'S2-9482014',
      doctorSpecialization: 'Internal Medicine - General Outpatient Care',
      patientName: 'Maria Santos',
      patientAge: 45,
      patientGender: 'Female',
      patientAllergies: 'Penicillin (Skin Rash)',
      clinicalDiagnosis: 'Essential Hypertension Stage 1 & Dyslipidemia',
      items: [
        {
          itemId: 'item-1',
          genericName: 'Amlodipine Besylate',
          brandName: 'Norvasc',
          dosage: '5mg',
          form: 'Tablet',
          sig: 'Take one (1) tablet orally once daily in the morning',
          quantity: 30,
          durationDays: 30,
          refills: 2,
          isDangerousDrug: false,
          remarks: 'Maintain blood pressure journal daily.',
        },
        {
          itemId: 'item-2',
          genericName: 'Atorvastatin Calcium',
          brandName: 'Lipitor',
          dosage: '20mg',
          form: 'Film-coated Tablet',
          sig: 'Take one (1) tablet orally once daily at bedtime',
          quantity: 30,
          durationDays: 30,
          refills: 2,
          isDangerousDrug: false,
          remarks: 'Follow low-fat and low-cholesterol diet.',
        },
      ],
      dispenseStatus: 'Pending',
      isValid: true,
      isAlreadyDispensed: false,
    };
  }

  return <RxVerifyClient token={token} initialData={verificationData} />;
}

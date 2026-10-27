'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { joinApiUrl } from '@shared/safe';
import { getPortalApiUrl } from '@/utils/domain';
import {
  CheckCircle,
  AlertTriangle,
  Clock,
  ShieldCheck,
  Building2,
  User,
  Pill,
  FileText,
  BadgeAlert,
  Printer,
  UploadCloud,
  FileCheck,
  Lock,
} from 'lucide-react';

export interface PrescriptionItem {
  itemId: string;
  genericName: string;
  brandName?: string | null;
  dosage: string;
  form: string;
  sig: string;
  quantity: number;
  durationDays?: number | null;
  refills: number;
  isDangerousDrug: boolean;
  remarks?: string | null;
}

export interface RxVerificationData {
  prescriptionNumber: string;
  issuedAt: string;
  clinicName: string;
  clinicAddress?: string | null;
  clinicContact?: string | null;
  doctorName?: string | null;
  doctorPrcLicense?: string | null;
  doctorPtr?: string | null;
  doctorS2License?: string | null;
  doctorSpecialization?: string | null;
  patientName?: string | null;
  patientInitials?: string | null;
  patientAge?: number | null;
  patientGender?: string | null;
  patientAllergies?: string | null;
  clinicalDiagnosis?: string | null;
  items?: PrescriptionItem[];
  dispenseStatus: string;
  isValid: boolean;
  isAlreadyDispensed: boolean;
  dispensedPharmacyName?: string | null;
  dispensedReceiptNumber?: string | null;
  dispensedAt?: string | null;
  dispenseNotes?: string | null;
  expiresAt?: string | null;
  isExpired?: boolean;
  hasDangerousDrug?: boolean;
  itemCount?: number;
  syncStatus?: string;
  isOfflinePending?: boolean;
  status?: string | null;
  errorMessage?: string | null;
}

interface RxVerifyClientProps {
  token: string;
  initialData: RxVerificationData;
}

const COMMON_DRUGSTORES = [
  'Mercury Drug',
  'Watsons',
  'Rose Pharmacy',
  'Southstar Drug',
  'The Generics Pharmacy (TGP)',
  'Generika Drugstore',
  'Other Drugstore',
];

const MAX_RECEIPT_SIZE_BYTES = 5 * 1024 * 1024; // 5 MiB ceiling

async function compressReceiptImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file;
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;
        const maxDim = 2048;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(file);
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (blob && blob.size < file.size) {
              resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }));
            } else {
              resolve(file);
            }
          },
          'image/jpeg',
          0.8
        );
      };
      img.onerror = () => resolve(file);
      img.src = e.target?.result as string;
    };
    reader.onerror = () => resolve(file);
    reader.readAsDataURL(file);
  });
}

export default function RxVerifyClient({ token, initialData }: RxVerifyClientProps) {
  const [data, setData] = useState<RxVerificationData>(initialData);
  const [pharmacyName, setPharmacyName] = useState('Mercury Drug');
  const [customPharmacy, setCustomPharmacy] = useState('');
  const [branchLocation, setBranchLocation] = useState('');
  const [officialReceiptNumber, setOfficialReceiptNumber] = useState('');
  const [pharmacistName, setPharmacistName] = useState('');
  const [pharmacistPrcLicense, setPharmacistPrcLicense] = useState('');
  const [notes, setNotes] = useState('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [compressing, setCompressing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const isDispensed =
    data.isAlreadyDispensed ||
    data.dispenseStatus === 'Dispensed' ||
    data.dispenseStatus === 'DispensedExternally' ||
    data.status === 'DISPENSED';
  const isExpired = Boolean(
    data.isExpired ||
    (data.expiresAt && new Date(data.expiresAt).getTime() < Date.now()) ||
    data.status === 'EXPIRED'
  );
  const isRevoked = data.status === 'REVOKED';
  const isNotFound =
    data.clinicName === 'Not Found in Registry' ||
    data.dispenseStatus === 'Unverified';
  const isUnverified = (!data.isValid && !isDispensed && !isExpired) || isNotFound || isRevoked;
  const hasDangerousDrugs = Boolean(
    data.hasDangerousDrug || (data.items && data.items.some((item) => item.isDangerousDrug))
  );
  const isOfflinePending =
    data.syncStatus === 'PendingClinicSync' || Boolean(data.isOfflinePending);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      setReceiptFile(null);
      return;
    }

    if (file.size > MAX_RECEIPT_SIZE_BYTES && !file.type.startsWith('image/')) {
      setSubmitError('PDF receipt document must not exceed 5 MiB.');
      setReceiptFile(null);
      return;
    }

    try {
      setCompressing(true);
      const processed = await compressReceiptImage(file);
      if (processed.size > MAX_RECEIPT_SIZE_BYTES) {
        setSubmitError('Receipt image must not exceed 5 MiB even after compression.');
        setReceiptFile(null);
      } else {
        setReceiptFile(processed);
        setSubmitError(null);
      }
    } finally {
      setCompressing(false);
    }
  };

  const handleDispenseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    const finalPharmacy = pharmacyName === 'Other Drugstore' ? customPharmacy.trim() : pharmacyName;

    if (!finalPharmacy) {
      setSubmitError('Please specify the pharmacy or drugstore name.');
      return;
    }
    if (!officialReceiptNumber.trim()) {
      setSubmitError('Official Receipt (OR) Number is required to record dispensing.');
      return;
    }
    if (!pharmacistName.trim() || !pharmacistPrcLicense.trim()) {
      setSubmitError('Dispensing Pharmacist Name and PRC License Number are required.');
      return;
    }

    setSubmitting(true);

    try {
      const portalApiUrl = getPortalApiUrl();

      if (receiptFile) {
        const formData = new FormData();
        formData.append('externalPharmacyName', finalPharmacy);
        if (branchLocation.trim()) formData.append('externalBranchLocation', branchLocation.trim());
        formData.append('officialReceiptNumber', officialReceiptNumber.trim());
        formData.append('pharmacistName', pharmacistName.trim());
        formData.append('pharmacistPrcLicense', pharmacistPrcLicense.trim());
        if (notes.trim()) formData.append('notes', notes.trim());
        formData.append('file', receiptFile);

        const targetUrl = joinApiUrl(
          portalApiUrl,
          `/public/rx-upload/${encodeURIComponent(token)}/multipart`
        );

        const response = await fetch(targetUrl, {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const errPayload = await response.json().catch(() => ({}));
          throw new Error(errPayload.message || `Dispense recording failed with status ${response.status}`);
        }
      } else {
        const targetUrl = joinApiUrl(
          portalApiUrl,
          `/public/rx-verify/${encodeURIComponent(token)}/dispense`
        );

        const response = await fetch(targetUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            externalPharmacyName: finalPharmacy,
            externalBranchLocation: branchLocation.trim() || undefined,
            officialReceiptNumber: officialReceiptNumber.trim(),
            pharmacistName: pharmacistName.trim(),
            pharmacistPrcLicense: pharmacistPrcLicense.trim(),
            notes: notes.trim() || undefined,
          }),
        });

        if (!response.ok) {
          const errPayload = await response.json().catch(() => ({}));
          throw new Error(errPayload.message || `Dispense recording failed with status ${response.status}`);
        }
      }

      setData((prev) => ({
        ...prev,
        isAlreadyDispensed: true,
        dispenseStatus: 'DispensedExternally',
        dispensedPharmacyName: finalPharmacy,
        dispensedReceiptNumber: officialReceiptNumber.trim(),
        dispensedAt: new Date().toISOString(),
        dispenseNotes: notes.trim(),
      }));

      setSubmitSuccess(true);
    } catch (err: any) {
      setSubmitError(
        err?.message || 'Unable to record prescription fulfillment. Please check network connectivity and try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Top Header */}
        <header className="bg-card rounded-xl shadow-sm border border-border p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center text-primary-foreground font-black text-2xl shadow-sm">
              ℞
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-foreground tracking-tight">
                Prescription Verification
              </h1>
              <p className="text-xs text-muted-foreground font-medium">
                Official electronic prescription verification • ClinicEZ
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-foreground bg-muted hover:bg-muted/80 rounded-lg transition-colors cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              Print
            </button>
            {isRevoked ? (
              <span className="inline-flex items-center gap-1 px-3 py-1 text-xs font-bold rounded-full bg-destructive/10 text-destructive border border-destructive/20">
                <BadgeAlert className="w-3.5 h-3.5" />
                Prescription Cancelled
              </span>
            ) : isNotFound || (!data.isValid && !isDispensed && !isExpired) ? (
              <span className="inline-flex items-center gap-1 px-3 py-1 text-xs font-bold rounded-full bg-destructive/10 text-destructive border border-destructive/20">
                <BadgeAlert className="w-3.5 h-3.5" />
                Unverified Reference
              </span>
            ) : isDispensed ? (
              <span className="inline-flex items-center gap-1 px-3 py-1 text-xs font-bold rounded-full bg-warning/15 text-warning border border-warning/30">
                <ShieldCheck className="w-3.5 h-3.5" />
                Verified • Dispensed
              </span>
            ) : isExpired ? (
              <span className="inline-flex items-center gap-1 px-3 py-1 text-xs font-bold rounded-full bg-warning/15 text-warning border border-warning/30">
                <Clock className="w-3.5 h-3.5" />
                Verified • Expired
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-3 py-1 text-xs font-bold rounded-full bg-success/10 text-success border border-success/20">
                <ShieldCheck className="w-3.5 h-3.5" />
                Valid Prescription
              </span>
            )}
          </div>
        </header>

        {/* Offline Issued Banner */}
        {isOfflinePending && (
          <div className="bg-warning/10 border border-warning/30 rounded-xl p-4 shadow-sm text-foreground flex items-start gap-3">
            <Clock className="w-5 h-5 text-warning shrink-0 mt-0.5" />
            <div className="space-y-0.5 text-xs">
              <p className="font-bold uppercase tracking-wider text-warning">
                Valid Offline Prescription
              </p>
              <p className="text-muted-foreground">
                This prescription was issued while the clinic was offline. It is valid for dispensing, and the record will sync automatically once the clinic reconnects.
              </p>
            </div>
          </div>
        )}

        {/* Verification Status Banner */}
        {isRevoked ? (
          <div className="bg-destructive/10 border-2 border-destructive/30 rounded-xl p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <BadgeAlert className="w-6 h-6 text-destructive shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h2 className="text-base font-bold text-destructive">
                  PRESCRIPTION CANCELLED
                </h2>
                <p className="text-sm text-destructive/90">
                  This prescription was cancelled by the prescribing doctor and cannot be dispensed.
                </p>
              </div>
            </div>
          </div>
        ) : isDispensed ? (
          <div className="bg-warning/10 border-2 border-warning/30 rounded-xl p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <BadgeAlert className="w-6 h-6 text-warning shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h2 className="text-base font-bold text-foreground">
                  PRESCRIPTION ALREADY DISPENSED
                </h2>
                <p className="text-sm text-muted-foreground">
                  This prescription has already been fulfilled and cannot be dispensed again.
                </p>
                <div className="mt-2 text-xs font-medium text-foreground bg-warning/15 p-3 rounded-lg border border-warning/25 flex flex-wrap gap-x-6 gap-y-1">
                  <span>
                    <strong>Dispensed At:</strong> {data.dispensedPharmacyName || 'Accredited Drugstore'}
                  </span>
                  {data.dispensedReceiptNumber && (
                    <span>
                      <strong>OR #:</strong> {data.dispensedReceiptNumber}
                    </span>
                  )}
                  {data.dispensedAt && (
                    <span>
                      <strong>Date:</strong> {new Date(data.dispensedAt).toLocaleString('en-PH')}
                    </span>
                  )}
                  {data.dispenseNotes && (
                    <span className="w-full mt-1 italic">
                      <strong>Notes:</strong> {data.dispenseNotes}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : isExpired ? (
          <div className="bg-warning/10 border-2 border-warning/30 rounded-xl p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <Clock className="w-6 h-6 text-warning shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h2 className="text-base font-bold text-foreground">
                  PRESCRIPTION EXPIRED
                </h2>
                <p className="text-sm text-muted-foreground">
                  This prescription expired{data.expiresAt ? ` on ${new Date(data.expiresAt).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}` : ''}. It can no longer be dispensed. Please consult the prescribing doctor for a new prescription.
                </p>
              </div>
            </div>
          </div>
        ) : isNotFound || !data.isValid ? (
          <div className="bg-destructive/10 border-2 border-destructive/30 rounded-xl p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <BadgeAlert className="w-6 h-6 text-destructive shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h2 className="text-base font-bold text-destructive">
                  UNVERIFIED OR INVALID PRESCRIPTION TOKEN
                </h2>
                <p className="text-sm text-destructive/90">
                  {data.errorMessage ? (
                    <>
                      {data.errorMessage}{' '}
                      <span className="font-normal opacity-90">
                        (Reference: <span className="font-mono font-bold">{token}</span>)
                      </span>
                    </>
                  ) : (
                    <>
                      Unable to verify prescription reference <span className="font-mono font-bold">{token}</span> against the registry. Please check the code or contact the issuing clinic.
                    </>
                  )}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-success/10 border-2 border-success/30 rounded-xl p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <CheckCircle className="w-6 h-6 text-success shrink-0 mt-0.5" />
              <div>
                <h2 className="text-base font-bold text-foreground">
                  VALID PRESCRIPTION
                </h2>
                <p className="text-sm text-muted-foreground">
                  This prescription is authentic and ready to be dispensed by a licensed pharmacist.
                </p>
              </div>
            </div>
          </div>
        )}

        {isNotFound ? (
          <div className="bg-card rounded-xl shadow-sm border border-border p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Building2 className="w-4 h-4 text-primary" />
                Registry Status
              </span>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold text-muted-foreground bg-muted px-2.5 py-0.5 rounded border border-border">
                  Token: {token}
                </span>
                <span className="text-xs font-bold text-destructive bg-destructive/10 px-2.5 py-0.5 rounded border border-destructive/20">
                  Not Found in Registry
                </span>
              </div>
            </div>
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Lock className="w-4 h-4 text-muted-foreground" />
              Prescription Security Notice
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              This electronic prescription token could not be verified against the national registry. If you were provided a printed prescription, please ensure you scanned the exact QR code or entered the complete verification token. Tokens belonging to other document types or unrecognized facilities cannot be processed here.
            </p>
            <div className="pt-2">
              <Link
                href="/verify"
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity cursor-pointer"
              >
                Return to Document Verification
              </Link>
            </div>
          </div>
        ) : (
          <>
            {/* Clinic & Doctor Details */}
            <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
              <div className="bg-muted border-b border-border px-6 py-3 flex items-center justify-between">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Building2 className="w-4 h-4 text-primary" />
                  Clinic & Prescribing Doctor
                </span>
                <span className="text-xs font-mono font-bold text-primary bg-primary/10 px-2.5 py-0.5 rounded border border-primary/20">
                  Rx No: {data.prescriptionNumber}
                </span>
              </div>

              <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground font-semibold uppercase">Clinic</p>
                  <h3 className="text-base font-bold text-foreground">{data.clinicName}</h3>
                  {data.clinicAddress && <p className="text-xs text-muted-foreground">{data.clinicAddress}</p>}
                  {data.clinicContact && <p className="text-xs text-muted-foreground">{data.clinicContact}</p>}
                </div>

                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground font-semibold uppercase">Prescribing Doctor</p>
                  <h3 className="text-base font-bold text-foreground">{data.doctorName || 'Prescribing Doctor'}</h3>
                  <p className="text-xs text-muted-foreground">{data.doctorSpecialization || 'General Outpatient Medicine'}</p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {data.doctorPrcLicense && (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                        PRC No: {data.doctorPrcLicense}
                      </span>
                    )}
                    {data.doctorPtr && (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded bg-muted text-muted-foreground border border-border">
                        PTR: {data.doctorPtr}
                      </span>
                    )}
                    {data.doctorS2License && (
                      <span className="text-xs font-bold px-2 py-0.5 rounded bg-destructive/10 text-destructive border border-destructive/20 flex items-center gap-1">
                        <ShieldCheck className="w-3 h-3" />
                        PDEA S2: {data.doctorS2License}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Patient Demographics & Safety Alert */}
            {(data.patientName || data.patientInitials || data.patientAge) && (
              <div className="bg-card rounded-xl shadow-sm border border-border p-6 space-y-4">
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <User className="w-4 h-4 text-primary" />
                    Patient Information
                  </span>
                  <span className="text-xs text-muted-foreground font-medium">
                    Issued: {new Date(data.issuedAt).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground font-medium">Patient</p>
                    <p className="text-sm font-bold text-foreground">
                      {data.patientName || data.patientInitials || 'Confidential Patient'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground font-medium">Age / Gender</p>
                    <p className="text-sm font-semibold text-foreground">
                      {data.patientAge ? `${data.patientAge} years old` : '—'} • {data.patientGender || '—'}
                    </p>
                  </div>
                  <div className="sm:col-span-2">
                    <p className="text-xs text-muted-foreground font-medium">Diagnosis</p>
                    <p className="text-sm font-semibold text-foreground">{data.clinicalDiagnosis || 'Outpatient Consultation'}</p>
                  </div>
                </div>

                {data.patientAllergies && (
                  <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 flex items-center gap-2.5">
                    <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
                    <p className="text-xs font-bold text-destructive">
                      Patient Allergies: <span className="underline">{data.patientAllergies}</span>
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Prescribed Medications */}
            <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
                <div className="bg-muted border-b border-border px-6 py-3 flex items-center justify-between">
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <Pill className="w-4 h-4 text-primary" />
                    Prescribed Medications
                  </span>
                </div>

                {data.items && data.items.length > 0 ? (
                  <div className="divide-y divide-border">
                    {data.items.map((item, index) => (
                      <div key={item.itemId || index} className="p-6 space-y-3">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div>
                            <h4 className="text-base font-black text-foreground">
                              {item.genericName}
                            </h4>
                            {item.brandName && (
                              <p className="text-xs font-semibold text-muted-foreground italic">
                                Brand name: {item.brandName}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold px-3 py-1 bg-muted text-foreground rounded-full border border-border">
                              Qty: {item.quantity} {item.form}(s)
                            </span>
                            {item.isDangerousDrug && (
                              <span className="text-xs font-black px-2.5 py-1 bg-destructive/10 text-destructive rounded-full border border-destructive/20 flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" />
                                PDEA Dangerous Drug
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="bg-muted border-l-4 border-primary p-3 rounded-r-lg">
                          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                            Directions for Use
                          </p>
                          <p className="text-sm font-semibold text-foreground mt-0.5">
                            {item.sig}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground font-medium">
                          <span><strong>Dosage & Form:</strong> {item.dosage} • {item.form}</span>
                          <span><strong>Refills Allowed:</strong> {item.refills}</span>
                          {item.durationDays && <span><strong>Duration:</strong> {item.durationDays} days</span>}
                          {item.remarks && <span className="italic">Note: {item.remarks}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-6 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-base font-black text-foreground">
                          Prescription Summary
                        </h4>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {data.itemCount ? `${data.itemCount} prescribed item${data.itemCount > 1 ? 's' : ''}` : '1 prescribed item'}
                        </p>
                      </div>
                      {hasDangerousDrugs && (
                        <span className="text-xs font-black px-2.5 py-1 bg-destructive/10 text-destructive rounded-full border border-destructive/20 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          PDEA Dangerous Drug
                        </span>
                      )}
                    </div>
                    <div className="bg-muted/60 p-4 rounded-xl border border-border text-xs text-muted-foreground space-y-1">
                      <p className="font-semibold text-foreground">
                        Medication Details Protected for Privacy
                      </p>
                      <p>
                        To protect patient privacy, medication details are listed only on the printed prescription presented by the patient. Pharmacists can confirm and record dispensing using the form below.
                      </p>
                    </div>
                  </div>
                )}
              </div>

            {/* Pharmacist Dispensing Section */}
            {data.isValid && !isDispensed && !isExpired && !isRevoked && !isNotFound ? (
              <div className="bg-card rounded-xl shadow-sm border border-border p-6 space-y-5">
                <div className="border-b border-border pb-3">
                  <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                    <FileText className="w-5 h-5 text-primary" />
                    Pharmacist Dispense Confirmation
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    Fulfilling this prescription at a pharmacy? Enter the Official Receipt (OR) and pharmacist details below to record dispensing and notify the clinic.
                  </p>
                </div>

                {submitError && (
                  <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 text-xs font-semibold text-destructive">
                    {submitError}
                  </div>
                )}

                <form onSubmit={handleDispenseSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-foreground">
                        Drugstore Chain *
                      </label>
                      <select
                        value={pharmacyName}
                        onChange={(e) => setPharmacyName(e.target.value)}
                        className="w-full text-sm border border-input rounded-lg p-2.5 bg-background text-foreground focus:ring-2 focus:ring-primary focus:border-primary"
                      >
                        {COMMON_DRUGSTORES.map((d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))}
                      </select>
                    </div>

                    {pharmacyName === 'Other Drugstore' ? (
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-foreground">
                          Specify Drugstore Name *
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. Local Community Pharmacy"
                          value={customPharmacy}
                          onChange={(e) => setCustomPharmacy(e.target.value)}
                          className="w-full text-sm border border-input rounded-lg p-2.5 bg-background text-foreground focus:ring-2 focus:ring-primary focus:border-primary"
                        />
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-foreground">
                          Branch Location
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. Ayala Center Cebu, Makati Ave Branch"
                          value={branchLocation}
                          onChange={(e) => setBranchLocation(e.target.value)}
                          className="w-full text-sm border border-input rounded-lg p-2.5 bg-background text-foreground focus:ring-2 focus:ring-primary focus:border-primary"
                        />
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-foreground">
                        Official Receipt (OR) Number *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. OR-2026-081923"
                        value={officialReceiptNumber}
                        onChange={(e) => setOfficialReceiptNumber(e.target.value)}
                        className="w-full text-sm border border-input rounded-lg p-2.5 bg-background text-foreground focus:ring-2 focus:ring-primary focus:border-primary font-mono"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-foreground">
                        Dispensing Pharmacist Name *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Maria Clara Santos, RPh"
                        value={pharmacistName}
                        onChange={(e) => setPharmacistName(e.target.value)}
                        className="w-full text-sm border border-input rounded-lg p-2.5 bg-background text-foreground focus:ring-2 focus:ring-primary focus:border-primary"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-foreground">
                        Pharmacist PRC License No. *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. PRC-0089123"
                        value={pharmacistPrcLicense}
                        onChange={(e) => setPharmacistPrcLicense(e.target.value)}
                        className="w-full text-sm border border-input rounded-lg p-2.5 bg-background text-foreground focus:ring-2 focus:ring-primary focus:border-primary"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-foreground">
                      Dispensing Notes / Counseling (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Advised patient on taking with meals; generic substitution explained."
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="w-full text-sm border border-input rounded-lg p-2.5 bg-background text-foreground focus:ring-2 focus:ring-primary focus:border-primary"
                    />
                  </div>

                  {/* Receipt Attachment (<= 5 MiB with client compression) */}
                  <div className="space-y-1.5 pt-1">
                    <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                      <UploadCloud className="w-4 h-4 text-primary" />
                      Attach Official Receipt Image or PDF (Optional, max 5 MiB)
                    </label>
                    <div className="flex items-center gap-3">
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,application/pdf"
                        onChange={handleFileChange}
                        className="text-xs text-muted-foreground file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-primary file:text-primary-foreground hover:file:opacity-90 cursor-pointer"
                      />
                      {compressing && (
                        <span className="text-xs text-muted-foreground animate-pulse">
                          Optimizing receipt image...
                        </span>
                      )}
                      {receiptFile && !compressing && (
                        <span className="text-xs text-success font-semibold flex items-center gap-1">
                          <FileCheck className="w-3.5 h-3.5" />
                          Ready ({Math.round(receiptFile.size / 1024)} KB)
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={submitting || compressing}
                      className="w-full sm:w-auto px-6 py-3 bg-primary text-primary-foreground font-bold rounded-lg shadow-sm hover:opacity-95 transition-all text-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      {submitting ? (
                        <>
                          <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                          Submitting Dispense Record...
                        </>
                      ) : (
                        <>
                          <CheckCircle className="w-4 h-4" />
                          Confirm Dispense & Lock Prescription
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            ) : isDispensed ? (
              <div className="bg-card rounded-xl shadow-sm border border-warning/30 p-6 space-y-3">
                <div className="flex items-start gap-3">
                  <Lock className="w-5 h-5 text-warning shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-sm font-bold text-foreground">
                      Dispensing Form Locked
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      This prescription was previously fulfilled at <strong>{data.dispensedPharmacyName || 'an accredited pharmacy'}</strong>
                      {data.dispensedReceiptNumber ? ` under Official Receipt #${data.dispensedReceiptNumber}` : ''}
                      {data.dispensedAt ? ` on ${new Date(data.dispensedAt).toLocaleString('en-PH')}` : ''}.
                      Prescriptions can only be dispensed once to prevent reuse.
                    </p>
                  </div>
                </div>
              </div>
            ) : isExpired ? (
              <div className="bg-card rounded-xl shadow-sm border border-warning/30 p-6 space-y-3">
                <div className="flex items-start gap-3">
                  <Clock className="w-5 h-5 text-warning shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-sm font-bold text-foreground">
                      Dispensing Locked (Expired)
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      This prescription has expired and cannot be fulfilled. The patient must request a new prescription from their doctor.
                    </p>
                  </div>
                </div>
              </div>
            ) : submitSuccess ? (
              <div className="bg-success/10 border border-success/20 rounded-xl p-5 text-center space-y-2">
                <CheckCircle className="w-8 h-8 text-success mx-auto" />
                <h3 className="text-base font-bold text-foreground">
                  Dispensing Confirmed
                </h3>
                <p className="text-xs text-muted-foreground max-w-md mx-auto">
                  The prescription has been recorded as dispensed and the clinic has been notified.
                </p>
              </div>
            ) : null}
          </>
        )}

        {/* Footer */}
        <footer className="text-center text-xs text-muted-foreground py-4 border-t border-border">
          Official prescription verification powered by ClinicEZ. Compliant with Department of Health (DOH) and FDA guidelines.
        </footer>
      </div>
    </div>
  );
}

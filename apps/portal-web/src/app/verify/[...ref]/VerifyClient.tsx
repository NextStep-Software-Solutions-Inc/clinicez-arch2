'use client';

import React, { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import {
  ShieldCheck,
  Building2,
  UserCheck,
  Calendar,
  FileText,
  Lock,
  Printer,
  Search,
  CheckCircle2,
  Copy,
  KeyRound,
  ArrowRight,
  HelpCircle,
} from 'lucide-react';
import Link from 'next/link';

export interface DocumentVerificationData {
  isVerified: boolean;
  documentType: string;
  documentNumber: string;
  facilityName: string;
  facilityAddress: string;
  patientMaskedName: string;
  doctorName: string;
  doctorPrcLicense: string;
  issueDate: string;
  status: string;
  securityDigest: string;
  verificationMessage: string;
  notes?: string | null;
  requiresSignatureSeal?: boolean;
  statusCode?: number;
}

interface VerifyClientProps {
  token: string;
  kind?: string;
  data: DocumentVerificationData;
  initialSig?: string;
}

export default function VerifyClient({ token, kind, data, initialSig = '' }: VerifyClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [copied, setCopied] = useState(false);
  const [sealInput, setSealInput] = useState(initialSig);
  const [isSubmittingSeal, setIsSubmittingSeal] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(data.securityDigest || token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePrint = () => {
    window.print();
  };

  const handleSealSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanSig = sealInput.trim().replace(/^SEC-SHA256-/i, '');
    if (!cleanSig) return;

    setIsSubmittingSeal(true);
    const targetPath = pathname || (kind ? `/verify/${kind}/${token}` : `/verify/${token}`);
    router.push(`${targetPath}?sig=${encodeURIComponent(cleanSig)}`);
  };

  return (
    <div className="min-h-screen bg-background text-foreground py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-border pb-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center text-primary-foreground font-black text-xl shadow-md">
              Ez
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">Clinic EZ Document Registry</h1>
              <p className="text-xs text-muted-foreground">Official Philippine Healthcare Document Verification</p>
            </div>
          </div>
          <Link
            href="/verify"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary bg-primary/10 hover:bg-primary/20 px-3 py-1.5 rounded-lg border border-primary/20 transition-colors"
          >
            <Search className="h-3.5 w-3.5" />
            Verify Another Document
          </Link>
        </div>

        {/* Ambiguous Document Number / Seal Disambiguation Box (HTTP 409) */}
        {data.requiresSignatureSeal && (
          <div className="bg-warning/10 border-2 border-warning/30 rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex items-start gap-3">
              <HelpCircle className="w-6 h-6 text-warning shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h2 className="text-base font-bold text-foreground">
                  SECURITY SEAL CONFIRMATION REQUIRED
                </h2>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Document number <span className="font-mono font-bold">{data.documentNumber}</span> matches records in multiple health facilities. To disambiguate and view the authentic certified record, please enter the printed Security Seal or Signature printed on the physical document.
                </p>
              </div>
            </div>

            <form onSubmit={handleSealSubmit} className="flex flex-col sm:flex-row items-center gap-2 pt-2">
              <div className="relative flex-1 w-full">
                <KeyRound className="w-4 h-4 text-muted-foreground absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={sealInput}
                  onChange={(e) => setSealInput(e.target.value)}
                  placeholder="Enter Seal (e.g. A1B2C3D4 or full hash)"
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-input text-xs font-mono bg-card text-foreground uppercase tracking-wider focus:ring-2 focus:ring-primary focus:outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={!sealInput.trim() || isSubmittingSeal}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-xs shadow-sm hover:opacity-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <span>Verify Seal</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </form>
          </div>
        )}

        {/* Verification Status Banner */}
        {data.isVerified ? (
          <div className="bg-success/10 border border-success/20 rounded-2xl p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="h-14 w-14 rounded-2xl bg-success flex items-center justify-center text-primary-foreground shrink-0 shadow-lg shadow-success/20">
                <ShieldCheck className="h-8 w-8" />
              </div>
              <div className="flex-1">
                <div className="inline-flex items-center gap-1.5 bg-success/20 text-success text-[11px] font-bold px-2.5 py-0.5 rounded-full mb-1.5 uppercase tracking-wide">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Officially Verified & Authentic
                </div>
                <h2 className="text-lg font-extrabold text-foreground">
                  {data.documentType}: {data.documentNumber}
                </h2>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  {data.verificationMessage}
                </p>
              </div>
            </div>
          </div>
        ) : !data.requiresSignatureSeal ? (
          <div className="bg-destructive/10 border border-destructive/20 rounded-2xl p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="h-14 w-14 rounded-2xl bg-destructive flex items-center justify-center text-primary-foreground shrink-0 shadow-lg shadow-destructive/20">
                <Lock className="h-8 w-8" />
              </div>
              <div className="flex-1">
                <div className="inline-flex items-center gap-1.5 bg-destructive/20 text-destructive text-[11px] font-bold px-2.5 py-0.5 rounded-full mb-1.5 uppercase tracking-wide">
                  Unverified Reference
                </div>
                <h2 className="text-lg font-extrabold text-foreground">
                  {data.documentType}: {data.documentNumber}
                </h2>
                <p className="text-xs text-destructive mt-1 leading-relaxed">
                  {data.verificationMessage}
                </p>
              </div>
            </div>
          </div>
        ) : null}

        {/* Cryptographic Security Digest Box */}
        <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <div>
              <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">
                Cryptographic HMAC-SHA256 Verification Seal
              </span>
              <span className="font-mono text-xs sm:text-sm font-semibold text-foreground break-all">
                {data.securityDigest || token}
              </span>
            </div>
            <button
              onClick={handleCopy}
              className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground bg-muted hover:bg-muted/80 px-2.5 py-1.5 rounded-md transition-colors shrink-0 cursor-pointer"
            >
              <Copy className="h-3.5 w-3.5" />
              {copied ? 'Copied!' : 'Copy Seal'}
            </button>
          </div>
        </div>

        {/* Verified Metadata Card */}
        {data.isVerified && (
          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-6">
            <h3 className="text-sm font-bold text-foreground uppercase tracking-wider flex items-center gap-2 border-b border-border pb-3">
              <FileText className="h-4 w-4 text-primary" />
              Official Certified Details
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Facility Details */}
              <div className="space-y-1.5">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                  Issuing Healthcare Facility
                </span>
                <p className="text-sm font-bold text-foreground">{data.facilityName}</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{data.facilityAddress}</p>
              </div>

              {/* Attending Physician */}
              <div className="space-y-1.5">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <UserCheck className="h-3.5 w-3.5 text-muted-foreground" />
                  Attending / Prescribing Physician
                </span>
                <p className="text-sm font-bold text-foreground">{data.doctorName || 'Attending Physician'}</p>
                <p className="text-xs text-muted-foreground">PRC License: {data.doctorPrcLicense || '—'}</p>
              </div>

              {/* Patient Name (Masked) */}
              <div className="space-y-1.5">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                  Patient Identity (Protected)
                </span>
                <p className="text-sm font-bold text-foreground tracking-wide font-mono">{data.patientMaskedName || 'Prescription Bearer'}</p>
                <p className="text-[11px] text-muted-foreground">
                  Name is masked in compliance with RA 10173 (Philippine Data Privacy Act).
                </p>
              </div>

              {/* Date & Document Status */}
              <div className="space-y-1.5">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                  Date Issued & Validity
                </span>
                <p className="text-sm font-bold text-foreground">{data.issueDate}</p>
                <span className="inline-flex items-center text-xs font-semibold text-success bg-success/10 px-2 py-0.5 rounded border border-success/20">
                  Status: {data.status}
                </span>
              </div>
            </div>

            {/* Remarks / Clinical Findings Note */}
            {data.notes && (
              <div className="bg-muted/50 border border-border rounded-xl p-4 text-xs text-foreground leading-relaxed">
                <span className="font-bold text-foreground block mb-1">Clinical Remarks / Order Summary:</span>
                {data.notes}
              </div>
            )}
          </div>
        )}

        {/* Legal & Regulatory Guarantee */}
        <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 text-xs text-foreground leading-relaxed flex items-start gap-3">
          <ShieldCheck className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div>
            <span className="font-bold block text-foreground">Republic of the Philippines Legal Compliance</span>
            This electronic verification confirms the legal validity of this medical certificate, clinical transfer, or prescription under Republic Act No. 8792 (Electronic Commerce Act of 2000), Republic Act No. 6675 (Generics Act of 1988), and Department of Health / FDA standards.
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 print:hidden">
          <button
            onClick={handlePrint}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-primary hover:opacity-95 text-primary-foreground font-bold text-xs px-5 py-2.5 rounded-xl transition-colors shadow-sm cursor-pointer"
          >
            <Printer className="h-4 w-4" />
            Print Verification Record
          </button>

          <Link
            href="/verify"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 text-muted-foreground hover:text-foreground font-medium text-xs px-4 py-2.5 rounded-xl border border-border hover:bg-muted transition-colors"
          >
            Check Another Reference
          </Link>
        </div>
      </div>
    </div>
  );
}

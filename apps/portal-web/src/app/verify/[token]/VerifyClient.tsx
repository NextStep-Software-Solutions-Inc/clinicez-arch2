'use client';

import React, { useState } from 'react';
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
  ExternalLink,
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
}

interface VerifyClientProps {
  token: string;
  data: DocumentVerificationData;
}

export default function VerifyClient({ token, data }: VerifyClientProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(data.securityDigest || token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-slate-200 pb-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-sky-600 flex items-center justify-center text-white font-black text-xl shadow-md">
              Ez
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">ClinicEz Document Registry</h1>
              <p className="text-xs text-slate-500">Official Philippine Healthcare Document Verification</p>
            </div>
          </div>
          <Link
            href="/verify"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-700 bg-sky-50 hover:bg-sky-100 px-3 py-1.5 rounded-lg border border-sky-200 transition-colors"
          >
            <Search className="h-3.5 w-3.5" />
            Verify Another Document
          </Link>
        </div>

        {/* Verification Status Banner */}
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 shadow-sm">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="h-14 w-14 rounded-2xl bg-emerald-600 flex items-center justify-center text-white shrink-0 shadow-lg shadow-emerald-600/20">
              <ShieldCheck className="h-8 w-8" />
            </div>
            <div className="flex-1">
              <div className="inline-flex items-center gap-1.5 bg-emerald-100 text-emerald-800 text-[11px] font-bold px-2.5 py-0.5 rounded-full mb-1.5 uppercase tracking-wide">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Officially Verified & Authentic
              </div>
              <h2 className="text-lg font-extrabold text-emerald-950">
                {data.documentType}: {data.documentNumber}
              </h2>
              <p className="text-xs text-emerald-700 mt-1 leading-relaxed">
                {data.verificationMessage}
              </p>
            </div>
          </div>
        </div>

        {/* Cryptographic Security Digest Box */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <div>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                Cryptographic HMAC-SHA256 Verification Seal
              </span>
              <span className="font-mono text-xs sm:text-sm font-semibold text-slate-800 break-all">
                {data.securityDigest || token}
              </span>
            </div>
            <button
              onClick={handleCopy}
              className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-2.5 py-1.5 rounded-md transition-colors shrink-0"
            >
              <Copy className="h-3.5 w-3.5" />
              {copied ? 'Copied!' : 'Copy Seal'}
            </button>
          </div>
        </div>

        {/* Verified Metadata Card */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2 border-b border-slate-100 pb-3">
            <FileText className="h-4 w-4 text-sky-600" />
            Official Certified Details
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Facility Details */}
            <div className="space-y-1.5">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5 text-slate-400" />
                Issuing Healthcare Facility
              </span>
              <p className="text-sm font-bold text-slate-900">{data.facilityName}</p>
              <p className="text-xs text-slate-500 leading-relaxed">{data.facilityAddress}</p>
            </div>

            {/* Attending Physician */}
            <div className="space-y-1.5">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <UserCheck className="h-3.5 w-3.5 text-slate-400" />
                Attending / Prescribing Physician
              </span>
              <p className="text-sm font-bold text-slate-900">{data.doctorName}</p>
              <p className="text-xs text-slate-500">PRC License: {data.doctorPrcLicense}</p>
            </div>

            {/* Patient Name (Masked) */}
            <div className="space-y-1.5">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Lock className="h-3.5 w-3.5 text-slate-400" />
                Patient Identity (Protected)
              </span>
              <p className="text-sm font-bold text-slate-900 tracking-wide font-mono">{data.patientMaskedName}</p>
              <p className="text-[11px] text-slate-400">
                Name is masked in compliance with RA 10173 (Philippine Data Privacy Act).
              </p>
            </div>

            {/* Date & Document Status */}
            <div className="space-y-1.5">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-slate-400" />
                Date Issued & Validity
              </span>
              <p className="text-sm font-bold text-slate-900">{data.issueDate}</p>
              <span className="inline-flex items-center text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                Status: {data.status}
              </span>
            </div>
          </div>

          {/* Remarks / Clinical Findings Note */}
          {data.notes && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-700 leading-relaxed">
              <span className="font-bold text-slate-900 block mb-1">Clinical Remarks / Order Summary:</span>
              {data.notes}
            </div>
          )}
        </div>

        {/* Legal & Regulatory Guarantee */}
        <div className="bg-sky-50 border border-sky-200 rounded-xl p-4 text-xs text-sky-800 leading-relaxed flex items-start gap-3">
          <ShieldCheck className="h-5 w-5 text-sky-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold block">Republic of the Philippines Legal Compliance</span>
            This electronic verification confirms the legal validity of this medical certificate, clinical transfer, or prescription under Republic Act No. 8792 (Electronic Commerce Act of 2000), Republic Act No. 6675 (Generics Act of 1988), and Department of Health / FDA standards.
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 print:hidden">
          <button
            onClick={handlePrint}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs px-5 py-2.5 rounded-xl transition-colors shadow-sm"
          >
            <Printer className="h-4 w-4" />
            Print Verification Record
          </button>

          <Link
            href="/verify"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 text-slate-600 hover:text-slate-900 font-medium text-xs px-4 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-100 transition-colors"
          >
            Check Another Reference
          </Link>
        </div>
      </div>
    </div>
  );
}

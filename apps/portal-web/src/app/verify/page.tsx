'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck, Search, FileText, ArrowRight, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';

export default function VerifyIndexPage() {
  const [query, setQuery] = useState('');
  const router = useRouter();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    router.push(`/verify/${encodeURIComponent(trimmed)}`);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 py-16 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto space-y-8">
        {/* Brand Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex h-14 w-14 rounded-2xl bg-sky-600 items-center justify-center text-white font-black text-2xl shadow-lg shadow-sky-600/20 mb-2">
            Ez
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
            Philippine National Health Document Registry
          </h1>
          <p className="text-sm text-slate-600 max-w-lg mx-auto leading-relaxed">
            Verify the cryptographic authenticity of digital Medical Certificates, Clinical Referral Letters, Electronic Prescriptions, and Diagnostic Requests.
          </p>
        </div>

        {/* Verification Search Form */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
          <form onSubmit={handleSearch} className="space-y-4">
            <label htmlFor="search-input" className="block text-xs font-bold uppercase tracking-wider text-slate-500">
              Enter Document Reference Number or Security Seal
            </label>
            <div className="relative">
              <input
                id="search-input"
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="e.g. MC-20261004-0001, REF-20261004-0001, or SEC-SHA256-..."
                className="w-full pl-11 pr-28 py-3.5 bg-slate-50 border border-slate-300 rounded-2xl text-sm font-mono text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:bg-white transition-all shadow-inner"
              />
              <Search className="h-5 w-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <button
                type="submit"
                className="absolute right-2 top-1/2 -translate-y-1/2 bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs px-4 py-2 rounded-xl transition-colors shadow-sm inline-flex items-center gap-1.5"
              >
                Verify
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
            <p className="text-[11px] text-slate-400">
              You can also point your mobile smartphone camera directly at the QR code printed on the physical document.
            </p>
          </form>

          {/* Supported Document Types Grid */}
          <div className="border-t border-slate-100 pt-5 space-y-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block">
              Supported Verifiable Document Formats
            </span>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-xs">
                <span className="font-bold text-slate-800 block">Medical Certificates</span>
                <span className="text-slate-500 text-[11px]">Format: MC-YYYYMMDD-XXXX</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-xs">
                <span className="font-bold text-slate-800 block">Clinical Referrals</span>
                <span className="text-slate-500 text-[11px]">Format: REF-YYYYMMDD-XXXX</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-xs">
                <span className="font-bold text-slate-800 block">e-Prescriptions (RA 6675)</span>
                <span className="text-slate-500 text-[11px]">Format: RX-YYYYMMDD-XXXX</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-xs">
                <span className="font-bold text-slate-800 block">Diagnostic Slips</span>
                <span className="text-slate-500 text-[11px]">Format: ORD-YYYYMMDD-XXXX</span>
              </div>
            </div>
          </div>
        </div>

        {/* Security & Privacy Badges */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <span>Anti-Fraud HMAC-SHA256 Cryptographic Seals</span>
          </div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-sky-600" />
            <span>RA 10173 (Data Privacy Act) Compliant Masking</span>
          </div>
        </div>
      </div>
    </div>
  );
}

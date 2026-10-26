'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck, Search, ArrowRight, CheckCircle2, FileText, Pill, FileSpreadsheet, Send } from 'lucide-react';

type DocumentKindChoice = 'auto' | 'rx' | 'med-cert' | 'referral' | 'lab-report';

export default function VerifyLookupClient() {
  const [query, setQuery] = useState('');
  const [docType, setDocType] = useState<DocumentKindChoice>('auto');
  const [seal, setSeal] = useState('');
  const router = useRouter();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedRef = query.trim();
    if (!trimmedRef) return;

    const cleanSig = seal.trim().replace(/^SEC-SHA256-/i, '');
    const sigParam = cleanSig ? `&sig=${encodeURIComponent(cleanSig)}` : '';
    const sigOnlyParam = cleanSig ? `?sig=${encodeURIComponent(cleanSig)}` : '';

    if (docType === 'auto') {
      router.push(`/verify?ref=${encodeURIComponent(trimmedRef)}${sigParam}`);
    } else if (docType === 'rx') {
      router.push(`/verify/rx/${encodeURIComponent(trimmedRef)}`);
    } else {
      router.push(`/verify/${encodeURIComponent(docType)}/${encodeURIComponent(trimmedRef)}${sigOnlyParam}`);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground py-16 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto space-y-8">
        {/* Brand Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex h-14 w-14 rounded-2xl bg-primary items-center justify-center text-primary-foreground font-black text-2xl shadow-lg mb-2">
            Ez
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
            Philippine National Health Document Registry
          </h1>
          <p className="text-sm text-muted-foreground max-w-lg mx-auto leading-relaxed">
            Verify the cryptographic authenticity of digital Medical Certificates, Clinical Referral Letters, Electronic Prescriptions, and Diagnostic Requests.
          </p>
        </div>

        {/* Verification Search Form */}
        <div className="bg-card border border-border rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
          <form onSubmit={handleSearch} className="space-y-5">
            {/* Document Type Selector */}
            <div className="space-y-1.5">
              <label htmlFor="doc-type-select" className="block text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Document Category
              </label>
              <select
                id="doc-type-select"
                value={docType}
                onChange={(e) => setDocType(e.target.value as DocumentKindChoice)}
                className="w-full py-2.5 px-3 bg-muted border border-input rounded-xl text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:bg-background transition-all"
              >
                <option value="auto">Auto-detect (Universal Registry)</option>
                <option value="rx">Electronic Prescription (RA 6675)</option>
                <option value="med-cert">Medical Certificate</option>
                <option value="referral">Clinical Referral Letter</option>
                <option value="lab-report">Diagnostic Laboratory Report</option>
              </select>
            </div>

            {/* Document Reference Input */}
            <div className="space-y-1.5">
              <label htmlFor="search-input" className="block text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Reference Number or Security Digest
              </label>
              <div className="relative">
                <input
                  id="search-input"
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="e.g. MC-20261004-0001, RX-20261004-0001, or SEC-SHA256-..."
                  className="w-full pl-11 pr-28 py-3.5 bg-muted border border-input rounded-2xl text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:bg-background transition-all"
                />
                <Search className="h-5 w-5 text-muted-foreground absolute left-3.5 top-1/2 -translate-y-1/2" />
                <button
                  type="submit"
                  disabled={!query.trim()}
                  className="absolute right-2 top-1/2 -translate-y-1/2 bg-primary hover:opacity-95 text-primary-foreground font-bold text-xs px-4 py-2 rounded-xl transition-all shadow-sm inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  Verify
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Optional Signature Seal */}
            {docType !== 'rx' && (
              <div className="space-y-1.5">
                <label htmlFor="seal-input" className="block text-[11px] font-semibold text-muted-foreground">
                  Security Seal Signature (Optional, for disambiguating multi-branch documents)
                </label>
                <input
                  id="seal-input"
                  type="text"
                  value={seal}
                  onChange={(e) => setSeal(e.target.value)}
                  placeholder="e.g. 4FA8B19C30E2"
                  className="w-full py-2 px-3 bg-muted border border-input rounded-xl text-xs font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:bg-background transition-all"
                />
              </div>
            )}

            <p className="text-[11px] text-muted-foreground">
              You can also point your smartphone camera directly at the QR code printed on the official physical document.
            </p>
          </form>

          {/* Supported Document Types Grid */}
          <div className="border-t border-border pt-5 space-y-3">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground block">
              Supported Verifiable Document Formats
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setDocType('med-cert')}
                className={`p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                  docType === 'med-cert' ? 'bg-primary/10 border-primary/30' : 'bg-muted border-border hover:bg-muted/80'
                }`}
              >
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  <span className="font-bold text-foreground text-xs block">Medical Certificates</span>
                </div>
                <span className="text-muted-foreground text-[11px] mt-1 block">Format: MC-YYYYMMDD-XXXX</span>
              </button>

              <button
                type="button"
                onClick={() => setDocType('referral')}
                className={`p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                  docType === 'referral' ? 'bg-primary/10 border-primary/30' : 'bg-muted border-border hover:bg-muted/80'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Send className="h-4 w-4 text-primary" />
                  <span className="font-bold text-foreground text-xs block">Clinical Referrals</span>
                </div>
                <span className="text-muted-foreground text-[11px] mt-1 block">Format: REF-YYYYMMDD-XXXX</span>
              </button>

              <button
                type="button"
                onClick={() => setDocType('rx')}
                className={`p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                  docType === 'rx' ? 'bg-primary/10 border-primary/30' : 'bg-muted border-border hover:bg-muted/80'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Pill className="h-4 w-4 text-primary" />
                  <span className="font-bold text-foreground text-xs block">e-Prescriptions (RA 6675)</span>
                </div>
                <span className="text-muted-foreground text-[11px] mt-1 block">Format: RX-YYYYMMDD-XXXX</span>
              </button>

              <button
                type="button"
                onClick={() => setDocType('lab-report')}
                className={`p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                  docType === 'lab-report' ? 'bg-primary/10 border-primary/30' : 'bg-muted border-border hover:bg-muted/80'
                }`}
              >
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4 text-primary" />
                  <span className="font-bold text-foreground text-xs block">Diagnostic Reports</span>
                </div>
                <span className="text-muted-foreground text-[11px] mt-1 block">Format: ORD-YYYYMMDD-XXXX</span>
              </button>
            </div>
          </div>
        </div>

        {/* Security & Privacy Badges */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-success" />
            <span>Anti-Fraud HMAC-SHA256 Cryptographic Seals</span>
          </div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <span>RA 10173 (Data Privacy Act) Compliant Masking</span>
          </div>
        </div>
      </div>
    </div>
  );
}

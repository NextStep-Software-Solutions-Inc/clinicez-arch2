"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert, KeyRound, ArrowRight, RefreshCw, Building2 } from "lucide-react";

interface JoinCodeErrorCardProps {
  initialCode: string;
  errorMessage: string;
}

export function JoinCodeErrorCard({ initialCode, errorMessage }: JoinCodeErrorCardProps) {
  const router = useRouter();
  const [retryCode, setRetryCode] = useState("");
  const [isNavigating, setIsNavigating] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = retryCode.trim().toUpperCase();
    if (!clean) return;
    setIsNavigating(true);
    router.push(`/join/${encodeURIComponent(clean)}`);
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col justify-center items-center p-4 sm:p-6 lg:p-8">
      <div className="max-w-md w-full bg-card border border-border rounded-3xl p-6 sm:p-8 shadow-sm space-y-6 text-center">
        {/* Error Icon Badge */}
        <div className="w-16 h-16 rounded-2xl bg-destructive/10 text-destructive flex items-center justify-center mx-auto border border-destructive/20">
          <ShieldAlert className="w-8 h-8" />
        </div>

        {/* Heading & Reason */}
        <div className="space-y-2">
          <h1 className="text-xl font-black tracking-tight text-foreground">
            Invalid or Expired Join Code
          </h1>
          <p className="text-xs text-muted-foreground leading-relaxed">
            The code <span className="font-mono font-bold text-foreground bg-muted px-1.5 py-0.5 rounded">{initialCode}</span> could not be verified.
          </p>
          <div className="p-3 bg-destructive/5 border border-destructive/20 rounded-xl text-destructive text-xs font-medium">
            {errorMessage}
          </div>
        </div>

        {/* Guidance */}
        <p className="text-xs text-muted-foreground">
          Clinic intake links are protected by time-limited passcodes configured by clinic administration. If your code has expired, please request an updated code or QR slip from clinic reception.
        </p>

        {/* Re-enter Form */}
        <form onSubmit={handleSubmit} className="space-y-3 pt-2">
          <div className="space-y-1 text-left">
            <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
              Enter New Join Code
            </label>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-muted-foreground absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={retryCode}
                onChange={(e) => setRetryCode(e.target.value.toUpperCase())}
                placeholder="e.g. APEX2026"
                maxLength={20}
                className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-input text-sm font-mono tracking-wider bg-background text-foreground uppercase placeholder:normal-case placeholder:font-sans focus:ring-2 focus:ring-primary focus:outline-none"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={!retryCode.trim() || isNavigating}
            className="w-full py-3 px-4 rounded-xl bg-primary text-primary-foreground font-bold text-sm shadow-sm hover:opacity-95 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isNavigating ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Verifying...</span>
              </>
            ) : (
              <>
                <span>Access Registration</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <div className="pt-2 border-t border-border">
          <button
            type="button"
            onClick={() => router.push("/join")}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1.5"
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>Return to Join Portal</span>
          </button>
        </div>
      </div>
    </div>
  );
}
export default JoinCodeErrorCard;

"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, ArrowRight, Sparkles, Building2, ShieldCheck } from "lucide-react";

export default function JoinLandingPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = code.trim().toUpperCase();
    if (!clean) return;
    setIsSubmitting(true);
    router.push(`/join/${encodeURIComponent(clean)}`);
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col justify-between p-4 sm:p-6 lg:p-8">
      <div className="max-w-md w-full mx-auto my-auto space-y-6 pt-6 sm:pt-10 text-center">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-primary/10 text-primary rounded-full text-xs font-semibold">
          <Sparkles className="w-3.5 h-3.5" />
          Patient Self-Registration Portal
        </div>

        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-foreground">
            Clinic EZ Join
          </h1>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            Please enter your clinic&apos;s secured Join Passcode to begin patient intake and pre-registration.
          </p>
        </div>

        {/* Card */}
        <div className="bg-card border border-border rounded-3xl p-6 sm:p-8 shadow-sm space-y-5 text-left">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="joinCode" className="block text-xs font-bold text-foreground">
                Clinic Join Code
              </label>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-muted-foreground absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="joinCode"
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="e.g. APEX2026"
                  maxLength={20}
                  autoFocus
                  className="w-full pl-10 pr-3.5 py-3 rounded-xl border border-input text-base font-mono font-bold tracking-wider bg-background text-foreground uppercase placeholder:normal-case placeholder:font-sans placeholder:font-normal focus:ring-2 focus:ring-primary focus:outline-none"
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                Enter the alphanumeric code shown on the clinic reception placard or printed ticket.
              </p>
            </div>

            <button
              type="submit"
              disabled={!code.trim() || isSubmitting}
              className="w-full py-3.5 px-4 rounded-xl bg-primary text-primary-foreground font-bold text-sm shadow-sm hover:opacity-95 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span>Continue to Intake</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          <div className="pt-4 border-t border-border flex items-center gap-3 text-xs text-muted-foreground">
            <ShieldCheck className="w-4 h-4 text-primary shrink-0" />
            <span>Time-limited, cryptographically verified clinic access.</span>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="text-center py-4 text-xs text-muted-foreground">
        <p>© {new Date().getFullYear()} ClinicEZ Healthcare Technologies. Secured by Interop Hub.</p>
      </footer>
    </div>
  );
}

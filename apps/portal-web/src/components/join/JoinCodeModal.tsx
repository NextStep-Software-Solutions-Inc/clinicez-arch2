"use client";

import React, { useState } from "react";
import { Lock, ArrowRight, AlertCircle, ShieldAlert } from "lucide-react";
import { lightColors } from "@clinicez/design-tokens";

interface JoinCodeModalProps {
  isOpen: boolean;
  onUnlock: (code: string) => void;
  facilityName: string;
  isJoinEnabled?: boolean;
  expiresAt?: string | null;
}

export function JoinCodeModal({
  isOpen,
  onUnlock,
  facilityName,
  isJoinEnabled = true,
  expiresAt,
}: JoinCodeModalProps) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const isExpired = expiresAt ? new Date(expiresAt) < new Date() : false;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!isJoinEnabled) {
      setError("Public registration is currently disabled for this facility. Please contact clinic reception.");
      return;
    }

    if (isExpired) {
      setError("This join code has expired. Please contact clinic reception for an updated code.");
      return;
    }

    const cleanCode = code.trim().toUpperCase();
    if (!cleanCode) {
      setError("Please enter the facility Join Code.");
      return;
    }

    if (!/^[A-Z0-9]{4,12}$/.test(cleanCode)) {
      setError("Join code must contain only letters and numbers (6-8 characters).");
      return;
    }

    onUnlock(cleanCode);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-md rounded-2xl bg-card shadow-2xl border border-border overflow-hidden">
        {/* Header Banner */}
        <div className="bg-primary px-6 py-5 text-white flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
            <Lock className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="font-bold text-lg leading-tight text-white">Secured Clinic Intake</h3>
            <p className="text-xs text-white/80">{facilityName}</p>
          </div>
        </div>

        {/* Content Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <p className="text-sm text-muted-foreground">
            Please enter the Join Code displayed at the clinic reception or provided by staff to unlock your self-registration workstation.
          </p>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-foreground mb-1.5">
              Facility Join Code *
            </label>
            <input
              type="text"
              value={code}
              onChange={(e) => {
                setCode(e.target.value.toUpperCase());
                setError(null);
              }}
              placeholder="e.g. CLINIC2026"
              maxLength={12}
              className="w-full px-4 py-3 rounded-xl border border-input text-lg font-mono font-bold tracking-widest text-foreground bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary uppercase transition-all"
              autoFocus
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="pt-2">
            <button
              type="submit"
              className="w-full py-3 px-4 rounded-xl bg-primary hover:bg-primary/90 text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
            >
              <span>Unlock Intake Form</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

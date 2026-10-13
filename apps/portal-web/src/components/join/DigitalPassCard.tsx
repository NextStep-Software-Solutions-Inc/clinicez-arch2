"use client";

import React, { useMemo } from "react";
import { CheckCircle2, Printer, RotateCcw, Clock, Building2, User, Ticket } from "lucide-react";
import { type DigitalRegistrationPass } from "./types";
import { generateQrMatrix, buildQrPathData } from "./qrGenerator";

interface DigitalPassCardProps {
  pass: DigitalRegistrationPass;
  onReset: () => void;
}

export function DigitalPassCard({ pass, onReset }: DigitalPassCardProps) {
  const qrMatrix = useMemo(() => generateQrMatrix(pass.qrDataString), [pass.qrDataString]);
  const qrPath = useMemo(() => buildQrPathData(qrMatrix.modules), [qrMatrix]);
  const qrSize = qrMatrix.size + 4; // Including quiet zone

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Confirmation Banner */}
      <div className="text-center space-y-2">
        <div className="w-16 h-16 bg-primary/10 text-primary rounded-full flex items-center justify-center mx-auto shadow-inner">
          <CheckCircle2 className="w-10 h-10" />
        </div>
        <h2 className="text-2xl font-black text-foreground">
          Clinic Registration Confirmed!
        </h2>
        <p className="text-muted-foreground text-sm max-w-md mx-auto">
          Your pre-registration has been relayed to the clinic reception. Present this digital pass upon arrival.
        </p>
      </div>

      {/* Printable Digital Pass Ticket Card */}
      <div className="relative bg-card border-2 border-primary/30 rounded-3xl p-6 sm:p-8 max-w-lg mx-auto shadow-xl overflow-hidden print:shadow-none print:border-slate-800">
        {/* Ticket punch hole cutouts */}
        <div className="absolute -left-4 top-1/2 w-8 h-8 rounded-full bg-background border-2 border-primary/30 -translate-y-1/2 print:hidden" />
        <div className="absolute -right-4 top-1/2 w-8 h-8 rounded-full bg-background border-2 border-primary/30 -translate-y-1/2 print:hidden" />

        {/* Card Header */}
        <div className="flex items-center justify-between border-b border-border pb-4 mb-4">
          <div className="flex items-center gap-2">
            <span className="p-2 bg-primary/10 text-primary rounded-xl">
              <Ticket className="w-5 h-5" />
            </span>
            <div>
              <span className="text-[10px] font-bold tracking-wider uppercase text-primary">
                Digital Fast-Track Pass
              </span>
              <h3 className="text-base font-bold text-foreground">{pass.facilityName}</h3>
            </div>
          </div>
          <div className="text-right">
            <span className="text-[10px] text-muted-foreground block">Pass Ref</span>
            <span className="text-xs font-mono font-bold text-foreground">{pass.registrationPassId}</span>
          </div>
        </div>

        {/* Hero Queue Token Display */}
        <div className="text-center py-5 bg-primary/5 rounded-2xl border border-primary/15 my-4">
          <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest block">
            Queue Token
          </span>
          <span className="text-5xl sm:text-6xl font-black text-primary tracking-tight block my-1">
            {pass.queueToken}
          </span>
          <span className="inline-flex items-center gap-1.5 bg-primary/15 text-primary text-xs font-semibold px-3 py-1 rounded-full">
            <Clock className="w-3.5 h-3.5" />
            Est. Wait: ~{pass.estimatedWaitMinutes} mins
          </span>
        </div>

        {/* Scannable SVG QR Code */}
        <div className="flex flex-col items-center justify-center my-6">
          <div className="p-4 bg-white rounded-2xl border border-border shadow-sm">
            <svg
              viewBox={`0 0 ${qrSize} ${qrSize}`}
              className="w-40 h-40 text-slate-900"
              shapeRendering="crispEdges"
            >
              <g transform="translate(2, 2)">
                <path d={qrPath} fill="currentColor" />
              </g>
            </svg>
          </div>
          <span className="text-xs font-mono font-bold text-foreground mt-2">
            {pass.patientCode}
          </span>
        </div>

        {/* Patient & Clinic Details */}
        <div className="text-xs space-y-2.5 border-t border-dashed border-border pt-4 text-foreground">
          <div className="flex justify-between">
            <span className="text-muted-foreground flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-muted-foreground" />
              Patient Name:
            </span>
            <span className="font-bold">{pass.fullName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
              Facility:
            </span>
            <span className="font-medium">{pass.facilitySlug}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-muted-foreground" />
              Issued At:
            </span>
            <span className="font-mono text-muted-foreground">
              {new Date(pass.issuedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
        </div>

        {/* Reception Instructions Notice */}
        <div className="mt-5 p-3 bg-muted/50 rounded-xl text-center text-xs text-muted-foreground">
          Please present this digital pass or state token <strong className="text-foreground">{pass.queueToken}</strong> at the clinic reception desk when called.
        </div>
      </div>

      {/* Action Buttons Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2 max-w-md mx-auto print:hidden">
        <button
          type="button"
          onClick={handlePrint}
          className="inline-flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-white font-semibold py-3 px-6 rounded-xl shadow-lg shadow-primary/20 transition-all text-sm cursor-pointer"
        >
          <Printer className="w-4 h-4" />
          Download / Print Pass (PDF)
        </button>
        <button
          type="button"
          onClick={onReset}
          className="inline-flex items-center justify-center gap-2 border border-border bg-card hover:bg-muted text-foreground font-medium py-3 px-6 rounded-xl transition-all text-sm cursor-pointer"
        >
          <RotateCcw className="w-4 h-4" />
          Register Another Patient
        </button>
      </div>
    </div>
  );
}

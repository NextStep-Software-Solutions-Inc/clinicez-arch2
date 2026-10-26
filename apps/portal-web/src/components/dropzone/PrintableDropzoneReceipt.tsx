"use client";

import React from "react";
import { 
  IconCheck, 
  IconPrinter, 
  IconShieldCheck, 
  IconBuildingHospital, 
  IconFileText, 
  IconUserCheck,
  IconArrowLeft
} from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export interface ReceiptData {
  type: "lab" | "rx";
  referenceNumber: string;
  orderNumber: string;
  facilityName: string;
  doctorName: string;
  doctorPrc?: string;
  patientInitials: string;
  patientAge: number;
  patientGender: string;
  externalFacilityName: string;
  externalContact?: string;
  professionalName?: string;
  professionalPrc?: string;
  notes?: string;
  documentType: string;
  fileName?: string;
  items: string[];
  submittedAt: string;
}

export default function PrintableDropzoneReceipt({
  data,
  onReset,
}: {
  data: ReceiptData;
  onReset?: () => void;
}) {
  const handlePrint = () => {
    window.print();
  };

  const formattedDatePst = new Date(data.submittedAt).toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    dateStyle: "full",
    timeStyle: "medium",
  });

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6">
      {/* Top Banner Actions (Hidden on Print) */}
      <div className="flex items-center justify-between gap-3 print:hidden">
        {onReset && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onReset}
            className="rounded-xl text-xs font-semibold gap-1.5"
          >
            <IconArrowLeft className="h-4 w-4" />
            <span>Upload Another Document</span>
          </Button>
        )}
        <div className="flex items-center gap-2 ml-auto">
          <Button
            onClick={handlePrint}
            className="rounded-xl text-xs font-bold gap-2 bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
          >
            <IconPrinter className="h-4 w-4" />
            <span>Print Official Receipt</span>
          </Button>
        </div>
      </div>

      {/* Printable Receipt Paper */}
      <div className="bg-card border border-border/80 rounded-3xl p-6 sm:p-10 shadow-xl print:shadow-none print:border-none print:p-0 relative overflow-hidden bg-white dark:bg-slate-950 text-foreground">
        {/* Subtle Watermark Stamp */}
        <div className="absolute right-6 top-8 opacity-[0.06] dark:opacity-[0.08] pointer-events-none select-none">
          <div className="size-48 rounded-full border-8 border-dashed border-primary flex items-center justify-center rotate-12">
            <span className="text-xl font-black uppercase tracking-widest text-center">
              CLINIC EZ<br />VERIFIED
            </span>
          </div>
        </div>

        {/* Header */}
        <div className="border-b border-border/80 pb-6 text-center space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-success/10 text-success text-xs font-bold border border-success/20">
            <IconCheck className="h-3.5 w-3.5 stroke-[3]" />
            <span>Transmission Verified & Recorded</span>
          </div>

          <h2 className="text-2xl font-black tracking-tight mt-1">
            {data.type === "lab" ? "Diagnostic Result Ingestion Receipt" : "e-Prescription Dispense Confirmation"}
          </h2>
          <p className="text-xs text-muted-foreground font-medium">
            Philippine Interoperability Dropzone &bull; Clinic EZ Health Network
          </p>
          <div className="font-mono text-xs font-bold text-primary pt-1">
            Tracking ID: {data.referenceNumber}
          </div>
        </div>

        {/* Verification Metadata Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-6 text-xs border-b border-border/60">
          <div className="space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Verification Timestamp (Philippine Standard Time)
            </span>
            <div className="font-semibold text-foreground">{formattedDatePst}</div>
          </div>
          <div className="space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Requisition / Rx Number
            </span>
            <div className="font-mono font-bold text-foreground">{data.orderNumber}</div>
          </div>
          <div className="space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Ordering Clinic / Institution
            </span>
            <div className="font-semibold flex items-center gap-1.5 text-foreground">
              <IconBuildingHospital className="h-3.5 w-3.5 text-primary shrink-0" />
              <span>{data.facilityName}</span>
            </div>
          </div>
          <div className="space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Physician of Record
            </span>
            <div className="font-semibold text-foreground">
              {data.doctorName}
              {data.doctorPrc && <span className="text-muted-foreground font-normal ml-1">({data.doctorPrc})</span>}
            </div>
          </div>
        </div>

        {/* Patient Section (DPA Masked) */}
        <div className="py-4 border-b border-border/60 bg-muted/20 px-4 rounded-2xl my-4 text-xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Patient Identification (DPA Masked)
            </span>
            <Badge variant="outline" className="text-[10px] font-bold px-2 py-0 border-primary/20 text-primary">
              RA 10173 Protected
            </Badge>
          </div>
          <div className="flex items-center gap-4 text-xs font-semibold text-foreground pt-1">
            <span className="font-bold text-sm text-foreground">{data.patientInitials}</span>
            <span>&bull;</span>
            <span>{data.patientAge} Years Old</span>
            <span>&bull;</span>
            <span>Gender: {data.patientGender}</span>
          </div>
        </div>

        {/* External Facility Submitter Details */}
        <div className="py-4 border-b border-border/60 text-xs space-y-3">
          <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <IconUserCheck className="h-3.5 w-3.5 text-primary" />
            <span>Fulfilling Diagnostic Laboratory / Dispensing Pharmacy</span>
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <span className="text-muted-foreground text-[11px]">External Entity:</span>
              <div className="font-bold text-foreground">{data.externalFacilityName}</div>
              {data.externalContact && (
                <div className="text-[11px] text-muted-foreground">Contact: {data.externalContact}</div>
              )}
            </div>
            <div>
              <span className="text-muted-foreground text-[11px]">Attending Professional:</span>
              <div className="font-bold text-foreground">
                {data.professionalName || "Authorized Clinical Staff"}
              </div>
              {data.professionalPrc && (
                <div className="text-[11px] text-muted-foreground font-mono">
                  PRC Lic. #{data.professionalPrc}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Items / Tests / Medications */}
        <div className="py-4 border-b border-border/60 text-xs space-y-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            {data.type === "lab" ? "Fulfilled Diagnostic Panels / Tests" : "Dispensed Medication Items"}
          </span>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {data.items.map((item, idx) => (
              <span
                key={idx}
                className="px-2.5 py-1 rounded-lg bg-muted text-[11px] font-medium text-foreground border border-border"
              >
                {item}
              </span>
            ))}
          </div>
        </div>

        {/* Attached Document Summary */}
        <div className="py-4 text-xs space-y-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Transmitted Diagnostic Artifact
          </span>
          <div className="flex items-center gap-2.5 p-3 rounded-xl bg-muted/30 border border-border/70">
            <IconFileText className="h-5 w-5 text-primary shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-foreground truncate">
                {data.fileName || `${data.orderNumber}-Official-Report.${data.documentType.toLowerCase()}`}
              </div>
              <div className="text-[10px] text-muted-foreground">
                Format: {data.documentType.toUpperCase()} &bull; Cryptographically sealed &bull; Uploaded to Ordering EMR
              </div>
            </div>
          </div>
        </div>

        {/* Notes if present */}
        {data.notes && (
          <div className="p-3 rounded-xl bg-muted/40 text-xs text-muted-foreground border border-border/60">
            <span className="font-bold text-foreground">Submitter Notes: </span>
            {data.notes}
          </div>
        )}

        {/* Footer */}
        <div className="pt-6 mt-4 border-t border-dashed border-border/80 flex flex-col sm:flex-row items-center justify-between text-[11px] text-muted-foreground gap-2">
          <div className="flex items-center gap-1.5">
            <IconShieldCheck className="h-4 w-4 text-primary" />
            <span>Clinic EZ Monorepo Gateway &bull; DPA RA 10173 &amp; DOH Compliant</span>
          </div>
          <div>Digital Receipt Generated: {new Date().toLocaleDateString()}</div>
        </div>
      </div>
    </div>
  );
}

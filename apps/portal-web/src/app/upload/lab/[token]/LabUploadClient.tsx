"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { 
  IconUpload, 
  IconFileText, 
  IconCheck, 
  IconAlertCircle, 
  IconClock, 
  IconBuildingHospital, 
  IconUser, 
  IconShieldCheck, 
  IconLoader, 
  IconX,
  IconArrowLeft,
  IconFileTypePdf,
  IconPhoto
} from "@tabler/icons-react";
import { Stethoscope, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { dropzoneService, PublicLabUploadInfo } from "@/services/dropzone.service";
import PrintableDropzoneReceipt, { ReceiptData } from "@/components/dropzone/PrintableDropzoneReceipt";

const MAX_FILE_SIZE_MB = 15;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const ALLOWED_MIME_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/jpg"];

export default function LabUploadClient({ token }: { token: string }) {
  const [loading, setLoading] = useState(true);
  const [orderInfo, setOrderInfo] = useState<PublicLabUploadInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Form Fields
  const [externalLabName, setExternalLabName] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [pathologistName, setPathologistName] = useState("");
  const [pathologistPrcLicense, setPathologistPrcLicense] = useState("");
  const [notes, setNotes] = useState("");

  // File Dropzone
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Upload Progress & Receipt
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);

  // Expiration countdown
  const [timeLeft, setTimeLeft] = useState<{ days: number; hours: number; minutes: number; seconds: number } | null>(null);

  useEffect(() => {
    const fetchInfo = async () => {
      try {
        setLoading(true);
        const data = await dropzoneService.getLabUploadInfo(token);
        setOrderInfo(data);
      } catch (err: any) {
        setError(err.response?.data?.message || err.message || "Invalid or expired laboratory requisition link.");
      } finally {
        setLoading(false);
      }
    };

    if (token) {
      fetchInfo();
    }
  }, [token]);

  // Live countdown timer calculation
  useEffect(() => {
    if (!orderInfo?.expiresAt) return;

    const target = new Date(orderInfo.expiresAt).getTime();

    const updateTimer = () => {
      const now = Date.now();
      const diff = target - now;

      if (diff <= 0) {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 });
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setTimeLeft({ days, hours, minutes, seconds });
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [orderInfo?.expiresAt]);

  const validateAndSetFile = (selectedFile: File) => {
    setFileError(null);

    if (!ALLOWED_MIME_TYPES.includes(selectedFile.type)) {
      setFileError("Invalid format. Only PDF, JPEG, and PNG documents are permitted.");
      return;
    }

    if (selectedFile.size > MAX_FILE_SIZE_BYTES) {
      setFileError(`File size exceeds ${MAX_FILE_SIZE_MB}MB limit (${(selectedFile.size / 1024 / 1024).toFixed(1)}MB).`);
      return;
    }

    setFile(selectedFile);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!file) {
      setFileError("Please attach the official laboratory result document.");
      return;
    }

    if (!externalLabName.trim()) {
      toast.error("Please specify your diagnostic laboratory name.");
      return;
    }

    setIsSubmitting(true);
    setUploadProgress(10);

    try {
      const isPdf = file.type === "application/pdf";
      await dropzoneService.submitLabUpload(
        token,
        {
          externalLabName: externalLabName.trim(),
          contactNumber: contactNumber.trim() || undefined,
          pathologistName: pathologistName.trim() || undefined,
          pathologistPrcLicense: pathologistPrcLicense.trim() || undefined,
          documentType: isPdf ? "PDF" : "Photo",
          notes: notes.trim() || undefined,
          file,
        },
        (progress) => setUploadProgress(progress)
      );

      toast.success("Diagnostic results securely transmitted to attending clinic!");

      const receipt: ReceiptData = {
        type: "lab",
        referenceNumber: `REF-LAB-${Date.now().toString().slice(-6)}`,
        orderNumber: orderInfo?.orderNumber || "ORD-000",
        facilityName: orderInfo?.orderingFacilityName || "Ordering Clinic",
        doctorName: orderInfo?.orderingDoctorName || "Attending Physician",
        doctorPrc: orderInfo?.doctorPrcLicense,
        patientInitials: orderInfo?.patientInitials || "P***",
        patientAge: orderInfo?.patientAge || 0,
        patientGender: orderInfo?.patientGender || "Unknown",
        externalFacilityName: externalLabName.trim(),
        externalContact: contactNumber.trim() || undefined,
        professionalName: pathologistName.trim() || undefined,
        professionalPrc: pathologistPrcLicense.trim() || undefined,
        notes: notes.trim() || undefined,
        documentType: isPdf ? "PDF" : "Image",
        fileName: file.name,
        items: orderInfo?.requestedTests || [],
        submittedAt: new Date().toISOString(),
      };

      setReceiptData(receipt);
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || "Failed to submit diagnostic result.";
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderShell = (content: React.ReactNode) => (
    <div className="min-h-screen flex flex-col bg-background relative overflow-hidden">
      {/* Ambient background glows */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-primary/10 blur-[130px] pointer-events-none -z-10" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-accent/30 blur-[130px] pointer-events-none -z-10" />

      {/* Header */}
      <header className="w-full max-w-5xl mx-auto px-4 sm:px-6 py-5 flex items-center justify-between z-10 print:hidden">
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary transition-all group-hover:bg-primary group-hover:text-primary-foreground shadow-sm">
            <Stethoscope className="h-5 w-5" />
          </div>
          <span className="text-xl font-bold tracking-tight text-foreground">Clinic EZ</span>
        </Link>
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold">
          <Sparkles className="h-3.5 w-3.5" />
          <span>Diagnostic Dropzone Portal</span>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex w-full max-w-5xl mx-auto items-center justify-center px-4 py-8 z-10">
        {content}
      </main>
    </div>
  );

  if (loading) {
    return renderShell(
      <Card className="w-full max-w-md p-8 text-center rounded-3xl border border-border bg-card/90 shadow-sm backdrop-blur-md">
        <IconLoader className="h-8 w-8 animate-spin text-primary mx-auto mb-3" />
        <h2 className="text-base font-bold text-foreground">Verifying Requisition Token...</h2>
        <p className="text-xs text-muted-foreground mt-1">Establishing secure connection to ordering clinic EMR.</p>
      </Card>
    );
  }

  if (error || !orderInfo) {
    return renderShell(
      <Card className="w-full max-w-md p-8 text-center rounded-3xl border-rose-200 dark:border-rose-900 bg-rose-50/30 dark:bg-rose-950/20 shadow-sm">
        <div className="size-12 rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto mb-3">
          <IconAlertCircle className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-bold text-foreground">Invalid Diagnostic Upload Link</h2>
        <p className="text-xs text-muted-foreground mt-1 mb-6 leading-relaxed">
          {error || "The requisition upload token is invalid, expired, or has already been fulfilled."}
        </p>
        <Link href="/">
          <Button variant="outline" className="rounded-xl text-xs font-semibold">
            Return to Homepage
          </Button>
        </Link>
      </Card>
    );
  }

  if (orderInfo.isExpired) {
    return renderShell(
      <Card className="w-full max-w-md p-8 text-center rounded-3xl border-amber-200 dark:border-amber-900 bg-amber-50/30 dark:bg-amber-950/20 shadow-sm">
        <div className="size-12 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto mb-3">
          <IconClock className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-bold text-foreground">Requisition Expired</h2>
        <p className="text-xs text-muted-foreground mt-2 mb-6 leading-relaxed">
          This laboratory order slip expired after 30 days. Please request an updated laboratory order slip from the attending physician.
        </p>
        <Link href="/">
          <Button variant="outline" className="rounded-xl text-xs font-semibold">
            Return to Homepage
          </Button>
        </Link>
      </Card>
    );
  }

  if (receiptData) {
    return renderShell(
      <PrintableDropzoneReceipt
        data={receiptData}
        onReset={() => {
          setReceiptData(null);
          setFile(null);
        }}
      />
    );
  }

  return renderShell(
    <div className="w-full max-w-3xl space-y-6">
      {/* Card Header & Requisition Info */}
      <Card className="rounded-3xl border border-border shadow-xl bg-card/95 backdrop-blur-xl overflow-hidden">
        <div className="p-6 sm:p-8 border-b border-border/70 bg-gradient-to-b from-primary/5 via-primary/[0.02] to-transparent space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-primary/10 text-[11px] font-bold text-primary mb-1">
                Diagnostic Requisition Order #{orderInfo.orderNumber}
              </div>
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-foreground">
                External Diagnostic Report Ingestion
              </h1>
            </div>

            {/* Countdown Badge */}
            {timeLeft && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 text-xs font-bold shrink-0">
                <IconClock className="h-3.5 w-3.5 shrink-0" />
                <span>Valid for: {timeLeft.days}d {timeLeft.hours}h {timeLeft.minutes}m {timeLeft.seconds}s</span>
              </div>
            )}
          </div>

          {/* DPA-Compliant Requisition Preview */}
          <div className="p-4 rounded-2xl bg-muted/40 border border-border/80 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5 text-xs">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Patient (DPA Masked)
              </span>
              <div className="font-bold text-foreground text-sm flex items-center gap-1.5 mt-0.5">
                <IconUser className="h-4 w-4 text-primary shrink-0" />
                <span>{orderInfo.patientInitials}</span>
                <span className="text-[11px] text-muted-foreground font-normal">
                  ({orderInfo.patientAge}y, {orderInfo.patientGender})
                </span>
              </div>
            </div>

            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Requesting Clinic
              </span>
              <div className="font-bold text-foreground flex items-center gap-1.5 mt-0.5">
                <IconBuildingHospital className="h-4 w-4 text-primary shrink-0" />
                <span className="truncate">{orderInfo.orderingFacilityName}</span>
              </div>
            </div>

            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Ordering Physician
              </span>
              <div className="font-bold text-foreground mt-0.5">
                {orderInfo.orderingDoctorName}
                {orderInfo.doctorPrcLicense && (
                  <div className="text-[11px] font-normal text-muted-foreground">
                    PRC #{orderInfo.doctorPrcLicense}
                  </div>
                )}
              </div>
            </div>

            <div className="sm:col-span-2 md:col-span-3 pt-2 border-t border-border/60">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Requested Diagnostic Panels
              </span>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {orderInfo.requestedTests.map((test, i) => (
                  <Badge key={i} variant="outline" className="text-xs font-semibold px-2.5 py-0.5 bg-primary/5 text-primary border-primary/20">
                    {test}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Upload Form */}
        <CardContent className="p-6 sm:p-8 space-y-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* 1. External Facility Metadata */}
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                <IconBuildingHospital className="h-4 w-4 text-primary" />
                <span>Fulfilling Diagnostic Facility Details</span>
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="labName" className="text-xs font-bold text-foreground">
                    External Lab / Center Name <span className="text-rose-500">*</span>
                  </Label>
                  <Input
                    id="labName"
                    required
                    placeholder="e.g. Hi-Precision Diagnostics - Main Branch"
                    value={externalLabName}
                    onChange={(e) => setExternalLabName(e.target.value)}
                    className="rounded-xl text-xs h-9"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="contactNumber" className="text-xs font-bold text-foreground">
                    Official Telephone / Hotline
                  </Label>
                  <Input
                    id="contactNumber"
                    placeholder="e.g. +63 (2) 8741-7777"
                    value={contactNumber}
                    onChange={(e) => setContactNumber(e.target.value)}
                    className="rounded-xl text-xs h-9"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="pathologist" className="text-xs font-bold text-foreground">
                    Attending Pathologist / MedTech Name
                  </Label>
                  <Input
                    id="pathologist"
                    placeholder="e.g. Dr. Roberto Mendoza, MD, FPSP"
                    value={pathologistName}
                    onChange={(e) => setPathologistName(e.target.value)}
                    className="rounded-xl text-xs h-9"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="prcLicense" className="text-xs font-bold text-foreground">
                    PRC License Number
                  </Label>
                  <Input
                    id="prcLicense"
                    placeholder="e.g. PRC # 0081294"
                    value={pathologistPrcLicense}
                    onChange={(e) => setPathologistPrcLicense(e.target.value)}
                    className="rounded-xl text-xs h-9"
                  />
                </div>
              </div>
            </div>

            {/* 2. File Dropzone */}
            <div className="space-y-3">
              <Label className="text-xs font-bold text-foreground flex items-center justify-between">
                <span>Certified Diagnostic Report Document <span className="text-rose-500">*</span></span>
                <span className="text-[11px] text-muted-foreground font-normal">PDF, JPEG, PNG (Max 15MB)</span>
              </Label>

              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-3xl p-6 sm:p-8 text-center cursor-pointer transition-all ${
                  isDragOver
                    ? "border-primary bg-primary/10 scale-[1.01]"
                    : file
                    ? "border-emerald-300 dark:border-emerald-800 bg-emerald-50/20 dark:bg-emerald-950/20"
                    : "border-border hover:border-primary/50 bg-muted/20 hover:bg-muted/40"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg"
                  className="hidden"
                  onChange={handleFileChange}
                />

                {file ? (
                  <div className="flex flex-col items-center justify-center space-y-2">
                    <div className="size-12 rounded-2xl bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                      {file.type === "application/pdf" ? (
                        <IconFileTypePdf className="h-6 w-6" />
                      ) : (
                        <IconPhoto className="h-6 w-6" />
                      )}
                    </div>
                    <div className="font-bold text-xs text-foreground max-w-xs truncate">{file.name}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {(file.size / 1024 / 1024).toFixed(2)} MB &bull; Ready to transmit
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setFile(null);
                      }}
                      className="rounded-xl text-[11px] text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 h-7 px-2.5"
                    >
                      <IconX className="h-3.5 w-3.5 mr-1" />
                      Remove File
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center space-y-2 py-4">
                    <div className="size-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-1">
                      <IconUpload className="h-6 w-6" />
                    </div>
                    <div className="text-xs font-bold text-foreground">
                      Drag &amp; drop official lab report here, or <span className="text-primary underline">browse file</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      Supports certified laboratory PDF slips, digital analyzer charts, and specimen result scans
                    </div>
                  </div>
                )}
              </div>

              {fileError && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 text-xs flex items-center gap-2 border border-rose-200 dark:border-rose-900">
                  <IconAlertCircle className="h-4 w-4 shrink-0" />
                  <span>{fileError}</span>
                </div>
              )}
            </div>

            {/* 3. Clinical Remarks */}
            <div className="space-y-1.5">
              <Label htmlFor="notes" className="text-xs font-bold text-foreground">
                Pathologist Remarks / Specimen Notes (Optional)
              </Label>
              <Input
                id="notes"
                placeholder="e.g. Specimen fasting requirements met. Elevated fasting blood sugar observed."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="rounded-xl text-xs h-9"
              />
            </div>

            {/* Progress Bar during submit */}
            {isSubmitting && (
              <div className="space-y-1.5 pt-2">
                <div className="flex justify-between text-xs font-semibold text-muted-foreground">
                  <span>Uploading and transmitting to ordering EMR...</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Submit Action */}
            <div className="pt-4 border-t border-border/70 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <IconShieldCheck className="h-4 w-4 text-primary shrink-0" />
                <span>Protected by ClinicEZ Philippine Interoperability Protocol</span>
              </div>

              <Button
                type="submit"
                disabled={isSubmitting || !file}
                className="w-full sm:w-auto rounded-xl text-xs font-bold px-6 h-10 bg-primary hover:bg-primary/90 text-primary-foreground gap-2 shadow-md"
              >
                {isSubmitting ? (
                  <>
                    <IconLoader className="h-4 w-4 animate-spin" />
                    <span>Transmitting Document...</span>
                  </>
                ) : (
                  <>
                    <IconCheck className="h-4 w-4" />
                    <span>Submit &amp; Transmit to Ordering Clinic</span>
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { 
  IconUpload, 
  IconCheck, 
  IconAlertCircle, 
  IconClock, 
  IconBuildingHospital, 
  IconUser, 
  IconShieldCheck, 
  IconLoader, 
  IconX,
  IconFileTypePdf,
  IconPhoto,
  IconPill,
  IconAlertTriangle
} from "@tabler/icons-react";
import { Stethoscope, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { dropzoneService, PublicRxUploadInfo } from "@/services/dropzone.service";
import PrintableDropzoneReceipt, { ReceiptData } from "@/components/dropzone/PrintableDropzoneReceipt";

const MAX_FILE_SIZE_MB = 5;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const ALLOWED_MIME_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/jpg", "image/webp"];

async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let { width, height } = img;
        const maxDim = 2048;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(file);
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (blob && blob.size < file.size) {
              resolve(new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" }));
            } else {
              resolve(file);
            }
          },
          "image/jpeg",
          0.8
        );
      };
      img.onerror = () => resolve(file);
      img.src = e.target?.result as string;
    };
    reader.onerror = () => resolve(file);
    reader.readAsDataURL(file);
  });
}

function getInitialRxTokenError(token: string): string | null {
  const clean = (token || "").trim();
  if (!clean) return "e-Prescription verification token is missing.";

  const lower = clean.toLowerCase();
  if (lower.startsWith("mc-") || lower.startsWith("ref-") || lower.startsWith("lab-")) {
    return "The provided token is for a non-prescription clinical document.";
  }

  // Lab upload token format: {clinicId:N}.{base64url} (dot at index 32, secret is base64url ~22 chars, not a 32-hex GUID)
  if (
    clean.indexOf(".") === 32 &&
    clean.length >= 50 &&
    clean.length <= 60 &&
    !/^[0-9a-fA-F]{32}$/.test(clean.slice(33)) &&
    /^[A-Za-z0-9_-]{20,28}$/.test(clean.slice(33))
  ) {
    return "The provided token is a laboratory upload token, not an e-prescription verification token.";
  }

  return null;
}

export default function RxUploadClient({ token }: { token: string }) {
  const initialError = getInitialRxTokenError(token);
  const [loading, setLoading] = useState(!initialError);
  const [rxInfo, setRxInfo] = useState<PublicRxUploadInfo | null>(null);
  const [error, setError] = useState<string | null>(initialError);

  // Form Fields
  const [pharmacyName, setPharmacyName] = useState("");
  const [branchLocation, setBranchLocation] = useState("");
  const [pharmacistName, setPharmacistName] = useState("");
  const [pharmacistPrc, setPharmacistPrc] = useState("");
  const [receiptNumber, setReceiptNumber] = useState("");
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

  // Countdown timer
  const [timeLeft, setTimeLeft] = useState<{ days: number; hours: number; minutes: number; seconds: number } | null>(null);

  useEffect(() => {
    const fetchInfo = async () => {
      const clean = (token || "").trim();
      const err = getInitialRxTokenError(clean);
      if (err) {
        setError(err);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const data = await dropzoneService.getRxUploadInfo(clean);
        setRxInfo(data);
      } catch (err: any) {
        setError(err.response?.data?.message || err.message || "Invalid or expired e-prescription verification link.");
      } finally {
        setLoading(false);
      }
    };

    if (token) {
      fetchInfo();
    }
  }, [token]);

  useEffect(() => {
    if (!rxInfo?.expiresAt) return;

    const target = new Date(rxInfo.expiresAt).getTime();

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
  }, [rxInfo?.expiresAt]);

  const validateAndSetFile = async (selectedFile: File) => {
    setFileError(null);

    if (!ALLOWED_MIME_TYPES.includes(selectedFile.type)) {
      setFileError("Invalid format. Only PDF, JPEG, PNG, and WebP files are permitted.");
      return;
    }

    const processed = await compressImage(selectedFile);
    if (processed.size > MAX_FILE_SIZE_BYTES) {
      setFileError(`File size exceeds ${MAX_FILE_SIZE_MB}MB limit (${(processed.size / 1024 / 1024).toFixed(1)}MB).`);
      return;
    }

    setFile(processed);
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
      void validateAndSetFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      void validateAndSetFile(e.target.files[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!pharmacyName.trim()) {
      toast.error("Please enter the dispensing pharmacy name.");
      return;
    }

    setIsSubmitting(true);
    setUploadProgress(10);

    try {
      const isPdf = file ? file.type === "application/pdf" : true;
      await dropzoneService.submitRxDispense(
        token,
        {
          externalPharmacyName: pharmacyName.trim(),
          externalBranchLocation: branchLocation.trim() || undefined,
          pharmacistName: pharmacistName.trim() || undefined,
          pharmacistPrcLicense: pharmacistPrc.trim() || undefined,
          officialReceiptNumber: receiptNumber.trim() || undefined,
          notes: notes.trim() || undefined,
          file: file || undefined,
        },
        (progress) => setUploadProgress(progress)
      );

      toast.success("e-Prescription dispense confirmation recorded!");

      const receipt: ReceiptData = {
        type: "rx",
        referenceNumber: `REF-RX-${Date.now().toString().slice(-6)}`,
        orderNumber: rxInfo?.prescriptionNumber || "RX-000",
        facilityName: rxInfo?.clinicName || "Prescribing Clinic",
        doctorName: rxInfo?.doctorName || "Prescribing Physician",
        doctorPrc: rxInfo?.doctorPrcLicense || undefined,
        patientInitials: rxInfo?.patientInitials || "P***",
        patientAge: rxInfo?.patientAge || 0,
        patientGender: rxInfo?.patientGender || "Unknown",
        externalFacilityName: pharmacyName.trim(),
        externalContact: branchLocation.trim() || undefined,
        professionalName: pharmacistName.trim() || undefined,
        professionalPrc: pharmacistPrc.trim() || undefined,
        notes: notes.trim() || undefined,
        documentType: isPdf ? "PDF" : "Image",
        fileName: file?.name || "Official-Dispense-Receipt.pdf",
        items: (rxInfo?.items || []).map((i) => `${i.genericName} ${i.dosage} (Qty: ${i.quantity})`),
        submittedAt: new Date().toISOString(),
      };

      setReceiptData(receipt);
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || "Failed to record e-prescription dispense.";
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderShell = (content: React.ReactNode) => (
    <div className="min-h-screen flex flex-col bg-background relative overflow-hidden">
      {/* Ambient background glows */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-primary/10 blur-[130px] pointer-events-none -z-10" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-primary/15 blur-[130px] pointer-events-none -z-10" />

      {/* Header */}
      <header className="w-full max-w-5xl mx-auto px-4 sm:px-6 py-5 flex items-center justify-between z-10 print:hidden">
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary transition-all group-hover:bg-primary group-hover:text-primary-foreground shadow-sm">
            <Stethoscope className="h-5 w-5" />
          </div>
          <span className="text-xl font-bold tracking-tight text-foreground">Clinic EZ</span>
        </Link>
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary border border-primary/20 text-xs font-semibold">
          <Sparkles className="h-3.5 w-3.5" />
          <span>e-Prescription Verification &amp; Dispense Portal</span>
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
        <h2 className="text-base font-bold text-foreground">Verifying e-Prescription Token...</h2>
        <p className="text-xs text-muted-foreground mt-1">Validating cryptographic credentials against prescribing clinic EMR.</p>
      </Card>
    );
  }

  if (error || !rxInfo) {
    return renderShell(
      <Card className="w-full max-w-md p-8 text-center rounded-3xl border-rose-200 dark:border-rose-900 bg-rose-50/30 dark:bg-rose-950/20 shadow-sm">
        <div className="size-12 rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto mb-3">
          <IconAlertCircle className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-bold text-foreground">Invalid Prescription Verification Link</h2>
        <p className="text-xs text-muted-foreground mt-1 mb-6 leading-relaxed">
          {error || "The e-prescription verification token is invalid or has expired."}
        </p>
        <Link href="/">
          <Button variant="outline" className="rounded-xl text-xs font-semibold">
            Return to Homepage
          </Button>
        </Link>
      </Card>
    );
  }

  if (rxInfo.isExpired) {
    return renderShell(
      <Card className="w-full max-w-md p-8 text-center rounded-3xl border-warning/30 bg-warning/5 shadow-sm">
        <div className="size-12 rounded-full bg-warning/15 text-warning flex items-center justify-center mx-auto mb-3">
          <IconClock className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-bold text-foreground">e-Prescription Expired</h2>
        <p className="text-xs text-muted-foreground mt-2 mb-6 leading-relaxed">
          This digital prescription was valid for 30 days and has expired. Under Philippine pharmacy regulations, a fresh prescription must be requested from the attending physician.
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

  const hasDangerousDrugs = Boolean(
    rxInfo.hasDangerousDrug || (rxInfo.items && rxInfo.items.some((i) => i.isDangerousDrug))
  );

  return renderShell(
    <div className="w-full max-w-3xl space-y-6">
      <Card className="rounded-3xl border border-border shadow-xl bg-card/95 backdrop-blur-xl overflow-hidden">
        {/* Prescription Header */}
        <div className="p-6 sm:p-8 border-b border-border/70 bg-gradient-to-b from-primary/5 via-primary/[0.02] to-transparent space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-primary/10 text-[11px] font-bold text-primary border border-primary/20 mb-1">
                e-Prescription #{rxInfo.prescriptionNumber}
              </div>
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-foreground">
                Official Digital Prescription Verification
              </h1>
            </div>

            {timeLeft && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-warning/10 text-warning border border-warning/20 text-xs font-bold shrink-0">
                <IconClock className="h-3.5 w-3.5 shrink-0" />
                <span>Valid for: {timeLeft.days}d {timeLeft.hours}h {timeLeft.minutes}m {timeLeft.seconds}s</span>
              </div>
            )}
          </div>

          {/* DPA-Compliant Prescription Preview */}
          <div className="p-4 rounded-2xl bg-muted/40 border border-border/80 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5 text-xs">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Patient (DPA Masked)
              </span>
              <div className="font-bold text-foreground text-sm flex items-center gap-1.5 mt-0.5">
                <IconUser className="h-4 w-4 text-primary shrink-0" />
                <span>{rxInfo.patientInitials || rxInfo.patientName || "Confidential Patient"}</span>
                {(rxInfo.patientAge || rxInfo.patientGender) && (
                  <span className="text-[11px] text-muted-foreground font-normal">
                    ({[rxInfo.patientAge ? `${rxInfo.patientAge}y` : null, rxInfo.patientGender].filter(Boolean).join(", ")})
                  </span>
                )}
              </div>
            </div>

            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Prescribing Clinic
              </span>
              <div className="font-bold text-foreground flex items-center gap-1.5 mt-0.5">
                <IconBuildingHospital className="h-4 w-4 text-primary shrink-0" />
                <span className="truncate">{rxInfo.clinicName}</span>
              </div>
            </div>

            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Prescribing Physician
              </span>
              <div className="font-bold text-foreground mt-0.5">
                {rxInfo.doctorName || "Attending Physician"}
                <div className="text-[11px] font-normal text-muted-foreground">
                  {rxInfo.doctorPrcLicense && <span>PRC #{rxInfo.doctorPrcLicense}</span>}
                  {rxInfo.doctorS2License && <span> &bull; S2 #{rxInfo.doctorS2License}</span>}
                </div>
              </div>
            </div>

            {hasDangerousDrugs && (
              <div className="sm:col-span-2 md:col-span-3 p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-400 text-xs flex items-center gap-2">
                <IconAlertTriangle className="h-4 w-4 shrink-0" />
                <span className="font-semibold">
                  Contains regulated Yellow Prescription (S2) Dangerous Drug item(s). Dispensing requires valid S2 authorization and recording in the Dangerous Drug Registry.
                </span>
              </div>
            )}
          </div>

          {/* Medication Items List or Zero-PHI Summary */}
          <div className="space-y-2 pt-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Prescribed Medications &amp; Dosage Instructions
            </span>
            {rxInfo.items && rxInfo.items.length > 0 ? (
              <div className="divide-y divide-border/60 rounded-2xl border border-border/80 bg-background/60 overflow-hidden">
                {rxInfo.items.map((item, idx) => (
                  <div key={idx} className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-muted/30 transition-colors">
                    <div className="flex items-start gap-2.5">
                      <div className="size-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5">
                        <IconPill className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="font-bold text-xs text-foreground flex items-center gap-2">
                          <span>{item.genericName}</span>
                          {item.brandName && (
                            <span className="text-[11px] text-muted-foreground font-normal">({item.brandName})</span>
                          )}
                          {item.isDangerousDrug && (
                            <Badge variant="destructive" className="text-[9px] px-1.5 py-0">
                              S2 Drug
                            </Badge>
                          )}
                        </div>
                        <div className="text-[11px] text-primary font-medium mt-0.5">
                          Sig: {item.sig}
                        </div>
                        {item.remarks && (
                          <div className="text-[10px] text-muted-foreground mt-0.5">
                            Note: {item.remarks}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="text-right sm:shrink-0 text-xs font-semibold text-foreground">
                      <span className="text-muted-foreground text-[10px] block">Quantity:</span>
                      <span>{item.quantity} {item.form}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 rounded-2xl border border-border/80 bg-background/60 text-xs text-muted-foreground space-y-1">
                <p className="font-bold text-foreground">
                  Authorized e-Prescription ({rxInfo.itemCount || 1} line item(s))
                </p>
                <p>
                  To protect patient privacy, medication details are listed only on the printed prescription provided to the patient.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Pharmacy Dispense Submission Form */}
        <CardContent className="p-6 sm:p-8 space-y-6">
          {rxInfo.isAlreadyDispensed ? (
            <div className="p-6 rounded-2xl bg-warning/10 border border-warning/20 text-center space-y-2">
              <div className="size-10 rounded-full bg-warning/15 text-warning flex items-center justify-center mx-auto">
                <IconCheck className="h-5 w-5" />
              </div>
              <h3 className="font-bold text-sm text-foreground">Already Dispensed</h3>
              <p className="text-xs text-muted-foreground max-w-md mx-auto">
                This prescription was previously filled and dispensed by <strong>{rxInfo.dispensedPharmacyName || "External Pharmacy"}</strong>.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <IconBuildingHospital className="h-4 w-4 text-primary" />
                  <span>Dispensing Pharmacy &amp; Pharmacist Credentials</span>
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="pharmacyName" className="text-xs font-bold text-foreground">
                      Pharmacy Brand / Name <span className="text-rose-500">*</span>
                    </Label>
                    <Input
                      id="pharmacyName"
                      required
                      placeholder="e.g. Mercury Drug - BGC 32nd St."
                      value={pharmacyName}
                      onChange={(e) => setPharmacyName(e.target.value)}
                      className="rounded-xl text-xs h-9"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="branchLocation" className="text-xs font-bold text-foreground">
                      Branch Address / Location
                    </Label>
                    <Input
                      id="branchLocation"
                      placeholder="e.g. Bonifacio High Street, Taguig City"
                      value={branchLocation}
                      onChange={(e) => setBranchLocation(e.target.value)}
                      className="rounded-xl text-xs h-9"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="pharmacist" className="text-xs font-bold text-foreground">
                      Dispensing Pharmacist Name
                    </Label>
                    <Input
                      id="pharmacist"
                      placeholder="e.g. Maria Clara Santos, RPh"
                      value={pharmacistName}
                      onChange={(e) => setPharmacistName(e.target.value)}
                      className="rounded-xl text-xs h-9"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="pharmacistPrc" className="text-xs font-bold text-foreground">
                      Pharmacist PRC License Number
                    </Label>
                    <Input
                      id="pharmacistPrc"
                      placeholder="e.g. PRC RPh-0062491"
                      value={pharmacistPrc}
                      onChange={(e) => setPharmacistPrc(e.target.value)}
                      className="rounded-xl text-xs h-9"
                    />
                  </div>

                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="receiptNumber" className="text-xs font-bold text-foreground">
                      Official Dispense / Cashier Receipt Number
                    </Label>
                    <Input
                      id="receiptNumber"
                      placeholder="e.g. OR # MD-2026-99214"
                      value={receiptNumber}
                      onChange={(e) => setReceiptNumber(e.target.value)}
                      className="rounded-xl text-xs h-9"
                    />
                  </div>
                </div>
              </div>

              {/* Signed Slip / Receipt Attachment */}
              <div className="space-y-3">
                <Label className="text-xs font-bold text-foreground flex items-center justify-between">
                  <span>Dispensing Proof / Signed Rx Copy (Optional)</span>
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
                      ? "border-primary/40 bg-primary/5"
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
                      <div className="size-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                        {file.type === "application/pdf" ? (
                          <IconFileTypePdf className="h-6 w-6" />
                        ) : (
                          <IconPhoto className="h-6 w-6" />
                        )}
                      </div>
                      <div className="font-bold text-xs text-foreground max-w-xs truncate">{file.name}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {(file.size / 1024 / 1024).toFixed(2)} MB &bull; Attached
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
                        Drag &amp; drop signed prescription slip or official dispense receipt, or <span className="text-primary underline">browse file</span>
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        Optional digital proof transmitted to ordering clinic EMR
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

              {/* Progress Bar */}
              {isSubmitting && (
                <div className="space-y-1.5 pt-2">
                  <div className="flex justify-between text-xs font-semibold text-muted-foreground">
                    <span>Transmitting dispense record to clinic EMR...</span>
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
                  <span>FDA Philippines &amp; DOH e-Prescription Compliance</span>
                </div>

                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full sm:w-auto rounded-xl text-xs font-bold px-6 h-10 bg-primary hover:bg-primary/90 text-primary-foreground gap-2 shadow-md"
                >
                  {isSubmitting ? (
                    <>
                      <IconLoader className="h-4 w-4 animate-spin" />
                      <span>Recording Dispense...</span>
                    </>
                  ) : (
                    <>
                      <IconCheck className="h-4 w-4" />
                      <span>Confirm &amp; Record Pharmacy Dispense</span>
                    </>
                  )}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
